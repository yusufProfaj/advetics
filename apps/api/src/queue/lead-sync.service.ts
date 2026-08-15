import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAssigned } from '../common/utils/ad-account-assignment';
import type { DiscoveredLead } from '../modules/connections/provider.types';
import { PlatformApiError } from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * Potansiyel müşteri çekme ve mutabakat.
 *
 * İKİ GİRİŞ, TEK YAZMA YOLU:
 *
 *   · `fetchOne` — webhook'un bildirdiği tek kayıt. Anlık.
 *   · `reconcile` — bir formun kaçmış kayıtları. Periyodik.
 *
 * İkisi de `persist` üzerinden yazıyor ve `ON CONFLICT DO NOTHING` ile
 * mükerrer kayıt zararsız hâle geliyor. Örtüşmeyi ENGELLEMİYORUZ: iki yolun
 * çakışması, birinin sessizce ölmesine karşı tek korumamız.
 *
 * MUTABAKAT NEDEN ZORUNLU: Meta webhook teslimini garanti etmiyor. Sunucumuz
 * bir dakika yanıt vermezse o bildirim kayboluyor ve bir daha gelmiyor.
 * Kaybolan bildirim = kaybolan müşteri, ve hiçbir yerde hata yok.
 */

/**
 * İlk taramanın geriye dönük penceresi.
 *
 * Yeni bir form bağlandığında tüm geçmişi çekmek cazip ama iki sorun var:
 * kota ve alaka. 30 günden eski bir kayıt zaten aranmış ya da soğumuş
 * olacak; onu bugün "yeni potansiyel müşteri" diye göstermek ajansı yanlış
 * yönlendirir.
 */
const FIRST_SCAN_DAYS = 30;

/**
 * Taramanın imleci geriye çekme payı.
 *
 * İmleci son okunan kaydın tam zamanına koymak, aynı saniyede oluşan bir
 * kaydı atlamak demek. Beş dakikalık örtüşme mükerrer kayıt üretiyor ama
 * mükerrer zaten engelleniyor — atlanan kaydın telafisi yok.
 */
const OVERLAP_MS = 5 * 60 * 1000;

@Injectable()
export class LeadSyncService {
  private readonly logger = new Logger(LeadSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly quota: QuotaGuardService,
  ) {}

  // ---------------------------------------------------------------------------
  // Webhook yolu
  // ---------------------------------------------------------------------------

  async fetchOne(params: {
    socialProfileId: string;
    externalLeadId: string;
  }): Promise<{ rows: number; note: string }> {
    const profile = await this.loadProfile(params.socialProfileId);
    const provider = this.providers.get('meta');

    await this.acquire(params.socialProfileId);

    const lead = await provider.fetchLead({
      pageAccessToken: profile.pageToken,
      externalLeadId: params.externalLeadId,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: params.socialProfileId,
          endpoint: 'leads:fetch',
          snapshot,
        }),
    });

    const written = await this.persist(profile, [lead], 'webhook');
    return {
      rows: written,
      // "0 satır" BAŞARISIZLIK DEĞİL: kayıt zaten mutabakat taramasıyla
      // gelmiş olabilir. Notun bunu söylemesi, iş listesinde sıfırı görenin
      // arıza aramasını engelliyor.
      note: written === 0 ? 'kayıt zaten vardı' : '1 kayıt eklendi',
    };
  }

  // ---------------------------------------------------------------------------
  // Mutabakat yolu
  // ---------------------------------------------------------------------------

  /**
   * Bir müşterinin tüm yayınlanmış formlarını tarar.
   *
   * FORM BAŞINA AYRI HATA YÖNETİMİ. Bir formun token'ı bozuksa diğerleri
   * taranmaya devam ediyor; tek try/catch olsaydı ilk hata bütün müşteriyi
   * karanlıkta bırakırdı.
   */
  async reconcile(clientId: string): Promise<{ rows: number; note: string }> {
    const forms = await this.db.$queryRaw<
      Array<{ external_form_id: string; social_profile_id: string; name: string }>
    >(Prisma.sql`
      SELECT DISTINCT ON (f.external_form_id)
             f.external_form_id, f.social_profile_id::text AS social_profile_id, f.name
      FROM lead_forms f
      WHERE f.client_id = ${clientId}::uuid
        AND f.external_form_id IS NOT NULL
      ORDER BY f.external_form_id, f.created_at DESC
    `);

    if (forms.length === 0) {
      return { rows: 0, note: 'yayınlanmış form yok' };
    }

    let total = 0;
    let failed = 0;

    for (const form of forms) {
      try {
        total += await this.reconcileForm(clientId, form.social_profile_id, form.external_form_id);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Form ${form.name} taranamadı: ${message}`);
        await this.db.$executeRaw(Prisma.sql`
          UPDATE lead_sync_cursors
          SET last_error = ${message.slice(0, 1000)}, last_run_at = now(), updated_at = now()
          WHERE external_form_id = ${form.external_form_id}
        `);
      }
    }

    /**
     * TÜMÜ BAŞARISIZSA İŞ BAŞARISIZ.
     *
     * Kısmi başarıyı başarı saymak doğru (bir form bozuk, diğerleri çalışıyor)
     * ama hepsinin patladığı bir turu "tamamlandı" diye kaydetmek, iş
     * listesinde yeşil görünen tamamen ölü bir mutabakat demek olurdu.
     */
    if (failed === forms.length) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        `${failed} formun hiçbiri taranamadı`,
      );
    }

    return {
      rows: total,
      note:
        failed > 0
          ? `${forms.length - failed}/${forms.length} form tarandı, ${total} yeni kayıt`
          : `${forms.length} form tarandı, ${total} yeni kayıt`,
    };
  }

  private async reconcileForm(
    clientId: string,
    socialProfileId: string,
    externalFormId: string,
  ): Promise<number> {
    const profile = await this.loadProfile(socialProfileId);
    const provider = this.providers.get('meta');

    const [cursor] = await this.db.$queryRaw<Array<{ synced_through: Date | null }>>(Prisma.sql`
      SELECT synced_through FROM lead_sync_cursors WHERE external_form_id = ${externalFormId}
    `);

    const since = cursor?.synced_through
      ? new Date(cursor.synced_through.getTime() - OVERLAP_MS)
      : new Date(Date.now() - FIRST_SCAN_DAYS * 86_400_000);

    await this.acquire(socialProfileId);

    const leads = await provider.fetchFormLeads({
      pageAccessToken: profile.pageToken,
      externalFormId,
      since,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: socialProfileId,
          endpoint: 'leads:reconcile',
          snapshot,
        }),
    });

    const written = await this.persist(profile, leads, 'reconcile');

    /**
     * İMLEÇ EN YENİ KAYDA GÖRE, "şimdi"ye göre DEĞİL.
     *
     * "Şimdi" yazmak, sayfa sınırına takılıp yarım okuduğumuz bir turda
     * okunmamış kayıtların üzerinden atlamak demek — kalıcı kayıp. En yeni
     * okunan kayıt, gerçekten nereye kadar geldiğimizi söylüyor.
     */
    const newest = leads.reduce<Date | null>(
      (acc, l) => (!acc || l.submittedAt > acc ? l.submittedAt : acc),
      null,
    );

    await this.db.$executeRaw(Prisma.sql`
      INSERT INTO lead_sync_cursors (
        id, org_id, client_id, social_profile_id, external_form_id,
        synced_through, last_run_at, last_new_count, last_error, updated_at
      ) VALUES (
        gen_random_uuid(), ${profile.orgId}::uuid, ${clientId}::uuid,
        ${socialProfileId}::uuid, ${externalFormId},
        ${newest}, now(), ${written}, NULL, now()
      )
      ON CONFLICT (external_form_id) DO UPDATE SET
        -- İMLEÇ GERİ GİTMİYOR. Boş bir tur mevcut imleci silseydi, sonraki
        -- tarama 30 gün geriden başlar ve her turda aynı kayıtları yeniden
        -- okurdu.
        synced_through = GREATEST(
          lead_sync_cursors.synced_through,
          COALESCE(${newest}, lead_sync_cursors.synced_through)
        ),
        last_run_at = now(),
        last_new_count = ${written},
        last_error = NULL,
        updated_at = now()
    `);

    if (written > 0) {
      /**
       * MUTABAKAT KAYIT BULDUYSA WEBHOOK ÇALIŞMIYOR DEMEKTİR.
       *
       * Tarama bir yedek yol; her şey düzgünse hiçbir şey bulmaması gerekir.
       * Bulduğu her kayıt, webhook'un o sayfa için sessizce öldüğünün
       * kanıtı ve bu, kendiliğinden hiçbir yerde görünmeyecek bir arıza.
       */
      this.logger.warn(
        `Mutabakat ${written} kayıt buldu (form ${externalFormId}) — ` +
          'webhook bu sayfa için çalışmıyor olabilir',
      );
    }
    return written;
  }

  // ---------------------------------------------------------------------------
  // Yazma
  // ---------------------------------------------------------------------------

  private async persist(
    profile: ProfileRow,
    leads: DiscoveredLead[],
    source: 'webhook' | 'reconcile',
  ): Promise<number> {
    let written = 0;

    for (const lead of leads) {
      if (!lead.externalLeadId) continue;

      const contact = extractContact(lead.fields);
      /**
       * İLETİŞİM BİLGİSİ OLMAYAN KAYIT YAZILMIYOR.
       *
       * Üçü de boşsa elimizde ulaşılamayan bir kayıt var demektir ve bu,
       * çekme çağrısının boş döndüğü ama hatanın yutulduğu durumun imzası.
       * Veritabanı kısıtı da aynı şeyi söylüyor; burada durdurup loglamak,
       * kısıt ihlalini iş hatasına çevirmekten anlaşılır.
       */
      if (!contact.fullName && !contact.email && !contact.phone) {
        this.logger.warn(
          `Kayıt ${lead.externalLeadId} iletişim bilgisi içermiyor — atlandı`,
        );
        continue;
      }

      // Reklam ve form adı KOPYALANIYOR, join'le çözülmüyor: ikisi de
      // sonradan silinebiliyor ve atıf o zaman kaybolurdu.
      const campaignName = lead.externalAdId
        ? await this.campaignNameFor(lead.externalAdId)
        : null;
      const formName = lead.externalFormId
        ? await this.formNameFor(lead.externalFormId)
        : null;

      const n = await this.db.$executeRaw(Prisma.sql`
        INSERT INTO leads (
          id, org_id, client_id, external_lead_id, lead_form_id, social_profile_id,
          external_ad_id, campaign_name, lead_form_name,
          full_name, email, phone, fields, source, submitted_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${profile.orgId}::uuid, ${profile.clientId}::uuid,
          ${lead.externalLeadId},
          ${formName?.id ?? null}::uuid, ${profile.id}::uuid,
          ${lead.externalAdId}, ${campaignName}, ${formName?.name ?? null},
          ${contact.fullName}, ${contact.email}, ${contact.phone},
          ${JSON.stringify(lead.fields)}::jsonb, ${source}, ${lead.submittedAt}, now()
        )
        -- MÜKERRER SESSİZCE DÜŞÜYOR ve bu TASARIM.
        --
        -- Webhook ile tarama aynı kaydı görüyor. Çakışmayı hata saymak, her
        -- mutabakat turunu kırmızı yapardı; güncelleme yapmak ise ajansın
        -- girdiği durumu ve notu ezerdi.
        ON CONFLICT (external_lead_id) DO NOTHING
      `);
      written += n;
    }

    return written;
  }

  private async campaignNameFor(externalAdId: string): Promise<string | null> {
    const [row] = await this.db.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT c.name FROM ads a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.platform = 'meta' AND a.external_id = ${externalAdId}
      LIMIT 1
    `);
    return row?.name ?? null;
  }

  private async formNameFor(
    externalFormId: string,
  ): Promise<{ id: string; name: string } | null> {
    const [row] = await this.db.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      SELECT id::text AS id, name FROM lead_forms
      WHERE external_form_id = ${externalFormId}
      LIMIT 1
    `);
    return row ?? null;
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private async loadProfile(socialProfileId: string): Promise<ProfileRow> {
    const found = await this.db.socialProfile.findUniqueOrThrow({
      where: { id: socialProfileId },
    });

    // ATANMAMIŞ SAYFA BURADA DURUR. `leads.client_id` NOT NULL ve atanmamış
    // bir sayfadan gelen kaydın hangi müşteriye ait olduğu BİLİNMİYOR — tahmin
    // etmek, kişisel veriyi yanlış markanın CRM'ine yazmak olurdu.
    const profile = assertAssigned(found);

    if (!profile.pageAccessTokenEnc) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        `${profile.name}: sayfa token'ı yok. Bağlantıyı leads_retrieval iznyle yeniden kur.`,
      );
    }

    return {
      id: profile.id,
      clientId: profile.clientId,
      orgId: profile.orgId,
      pageToken: this.crypto.decrypt(Buffer.from(profile.pageAccessTokenEnc)),
    };
  }

  private async acquire(socialProfileId: string): Promise<void> {
    const gate = await this.quota.acquire({
      platform: 'meta',
      // Kota anahtarı SOSYAL PROFİL: çağrılar sayfa token'ıyla gidiyor ve
      // reklam hesabının kotasından düşmüyor.
      adAccountId: socialProfileId,
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new PlatformApiError('meta', 'rate_limited', `Kota engeli: ${gate.reason}`);
    }
  }
}

interface ProfileRow {
  id: string;
  clientId: string;
  orgId: string;
  pageToken: string;
}

/**
 * Alanlardan ad/e-posta/telefonu çıkarır.
 *
 * Meta'nın standart alan adları sabit (`full_name`, `email`, `phone_number`)
 * ama tek parça ad soyad kullanan formlarda `first_name` + `last_name` ayrı
 * geliyor. İkisini de karşılamak gerekiyor, yoksa o formlarda ad alanı boş
 * kalır ve kayıt "iletişim bilgisi yok" diye atlanabilir.
 */
export function extractContact(fields: Array<{ name: string; value: string }>): {
  fullName: string | null;
  email: string | null;
  phone: string | null;
} {
  const get = (name: string): string | null => {
    const f = fields.find((x) => x.name.toLowerCase() === name);
    const v = f?.value?.trim();
    return v ? v : null;
  };

  const full = get('full_name');
  const first = get('first_name');
  const last = get('last_name');
  // Parçalı ad boşsa `null` — boş dize yazmak, kaydı "iletişim bilgisi var"
  // saydırıp kısıtı da geçerdi.
  const joined = [first, last].filter(Boolean).join(' ').trim();

  return {
    fullName: full ?? (joined.length > 0 ? joined : null),
    email: get('email'),
    // `phone` de deneniyor: özel sorularla kurulan formlarda alan adı
    // standart olmayabiliyor.
    phone: get('phone_number') ?? get('phone'),
  };
}
