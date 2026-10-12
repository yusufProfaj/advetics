import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OZET,
  OZET_PENCERE_ANAHTARI,
  bugunUtc,
  nihaiAlicilar,
  ozetHaftasi,
  ozetPanelAdresi,
  raporPenceresi,
  siradakiCalisma,
  type PlanSikligi,
  type PlanSonucu,
  type RaporPlaniInput,
  type RaporPlaniOzeti,
  type HaftalikOzetPlani,
  type HaftalikOzetPlaniGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OzetService } from '../haftalik-ozet/ozet.service';
import { ozetEpostasi } from '../haftalik-ozet/ozet-mail';
import { RaporGonderService } from './rapor-gonder.service';

/**
 * ═══ ZAMANLANMIŞ RAPOR — KURULUM VE ÇALIŞTIRMA ═══
 *
 * İki ayrı dünya tek serviste:
 *
 *   · CRUD, kullanıcının oturumuyla (`PrismaService.withTenant`, RLS açık)
 *   · Çalıştırma, worker'da (`PrismaAdminService`, BYPASSRLS) — oturum yok
 *
 * Ayrı servislere bölmek, planın nasıl kurulduğu ile nasıl koştuğu
 * arasındaki bağı görünmez yapardı; en kritik alan (`next_run_at`) ikisinde
 * de yazılıyor ve aynı fonksiyondan (`siradakiCalisma`) geliyor.
 */
@Injectable()
export class RaporPlaniService {
  private readonly logger = new Logger(RaporPlaniService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly gonderici: RaporGonderService,
    /*
     * HAFTALIK ÖZET (Paket B) aynı tabloda, aynı süpürmede: ikinci bir
     * zamanlayıcı yazmak, "rapor gitti ama özet gitmedi" hâlini iki ayrı
     * claim mantığına bölmek olurdu (MIMARI Ç-B4).
     */
    private readonly ozet: OzetService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // Kurulum (oturumlu)
  // ---------------------------------------------------------------------------

  /**
   * ═══ SÜSLEME İÇİN YAPILAN JOIN, ANA SATIRI SÜZMEMELİ ═══
   *
   * Bu liste kullanıcının bildirdiği hâlde HEP BOŞ dönüyordu: planlama
   * kuruluyor, ekran "Bu workspace için kurulu planlama yok" yazmaya devam
   * ediyordu. Satır yazılmıştı; onu SELECT görmüyordu.
   *
   * Sebep `JOIN users` idi. `users` politikası kasıtlı olarak dar:
   * `org_kapsaminda(org_id) AND (is_org_admin() OR id = current_user_id())`.
   * Ajans yöneticisi KARDEŞ bir şirkete geçtiğinde `ctx.orgId` o şirket
   * oluyor ama `users.org_id` EV şirketi olarak kalıyor
   * (`tenant-context.service.ts` bunu bilerek ayırıyor) — kullanıcı KENDİ
   * satırını bile okuyamıyor ve INNER JOIN plan satırlarının tamamını
   * eliyor. Hata yok, log yok, yalnızca boş bir liste.
   *
   * KURAL: bir satırın görünürlüğüne YALNIZCA kendi politikası karar verir.
   * Planı kuranın adı gibi süsleme alanları LEFT JOIN ile alınır; görünmezse
   * o alan boş kalır, satır kaybolmaz. `rapor-listeleri-rls.spec.ts` ölçüyor.
   */
  async listele(ctx: TenantContext, clientId: string): Promise<RaporPlaniOzeti[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT s.id::text, s.client_id::text AS client_id, c.name AS client_name,
               s.frequency::text, s.day_of_week, s.day_of_month, s.hour,
               s.range_key, s.template_id::text AS template_id,
               s.to_emails, c.contact_emails, s.attach_pdf, s.enabled,
               s.next_run_at, s.last_run_at, s.last_status, s.last_error, s.last_sent_to,
               u.full_name AS created_by_name, u.email AS created_by_email,
               -- GÖNDERENİN KİMLİĞİ HAZIR MI: kayıtlı VE doğrulanmış.
               -- Plan kurulurken kontrol ediliyor ama sonradan bozulabiliyor;
               -- panel bunu göstermezse plan "açık" görünüp hiç göndermez.
               --
               -- BAŞKASININ PLANINDA CEVAP "BİLİNMİYOR" — false DEĞİL.
               -- E-posta kimliği tablosunun politikası satırı YALNIZCA
               -- sahibine gösteriyor (satır şifreli uygulama parolası
               -- taşıyor). Yani meslektaşın planında ea her zaman NULL
               -- geliyor ve eski ifade bunu "kimlik doğrulanmamış" diye
               -- okuyup panelde ÇALIŞAN bir planı "çalışmayacak" diye
               -- işaretliyordu. Yanlış alarm, hiç alarm olmamasından kötü:
               -- kullanıcıyı sağlam bir kurulumu bozmaya gönderiyor.
               -- (Bu yorumda ters tırnak YOK: Prisma.sql şablonunu ortadan
               --  kapatıyor ve hata sebebi hiç belli olmuyor.)
               CASE WHEN s.created_by_user_id = app.current_user_id()
                    THEN (ea.id IS NOT NULL AND ea.verified_at IS NOT NULL)
                    ELSE NULL
               END AS sender_ready
          FROM report_schedules s
          LEFT JOIN clients c ON c.id = s.client_id
          LEFT JOIN users u ON u.id = s.created_by_user_id
          LEFT JOIN user_email_accounts ea ON ea.user_id = s.created_by_user_id
         WHERE s.client_id = ${clientId}::uuid
           -- YALNIZ RAPOR PLANLARI. Haftalık özet planı aynı tabloda ama
           -- kendi kartında; burada görünseydi "haftalık rapor" sanılıp
           -- düzenlenir ve range_key'i bir rapor penceresine çevrilirdi.
           AND s.tur = 'rapor'
         ORDER BY s.created_at DESC
      `),
    );

    return rows.map((r) => ({
      id: r.id as string,
      tur: 'rapor' as const,
      clientId: r.client_id as string,
      clientName: (r.client_name as string) ?? null,
      frequency: r.frequency as PlanSikligi,
      dayOfWeek: (r.day_of_week as number) ?? null,
      dayOfMonth: (r.day_of_month as number) ?? null,
      hour: r.hour as number,
      rangeKey: r.range_key as string,
      templateId: (r.template_id as string) ?? null,
      toEmails: (r.to_emails as string[]) ?? [],
      // Alıcı boşsa müşterinin kayıtlı adresi gösteriliyor: kullanıcı mailin
      // NEREYE gideceğini planı açmadan görmeli.
      // ÇÖZÜM TEK YERDEN. Bu satır "planda varsa o, yoksa müşterininki"
      // kuralını ELLE tekrarlıyordu ve gönderim yolundaki kuralla ayrışabilirdi:
      // panelde bir adres yazıp başka bir adrese göndermek sessiz bir hatadır.
      cozulenAliciListesi: nihaiAlicilar({
        secilen: (r.to_emails as string[]) ?? [],
        musteriAdresleri: (r.contact_emails as string[]) ?? [],
      }),
      attachPdf: r.attach_pdf as boolean,
      enabled: r.enabled as boolean,
      nextRunAt: r.next_run_at ? (r.next_run_at as Date).toISOString() : null,
      lastRunAt: r.last_run_at ? (r.last_run_at as Date).toISOString() : null,
      lastStatus: (r.last_status as PlanSonucu) ?? null,
      lastError: (r.last_error as string) ?? null,
      lastSentTo: (r.last_sent_to as string) ?? null,
      createdByName: (r.created_by_name as string) ?? null,
      createdByEmail: (r.created_by_email as string) ?? null,
      // ÜÇ HÂL: hazır, hazır değil ve BİLİNMİYOR. Üçüncüsü başkasının
      // planında çıkıyor ve `false`a yuvarlamak yanlış alarm üretiyordu.
      senderReady: r.sender_ready === null || r.sender_ready === undefined
        ? null
        : r.sender_ready === true,
    }));
  }

  async olustur(ctx: TenantContext, input: RaporPlaniInput): Promise<{ id: string }> {
    await this.onKosullar(ctx, input.clientId);

    const next = siradakiCalisma(
      {
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        hour: input.hour,
      },
      new Date(),
    );

    const scoped = { ...ctx, activeClientId: input.clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO report_schedules (
          id, org_id, client_id, created_by_user_id, template_id,
          frequency, day_of_week, day_of_month, hour, range_key,
          to_emails, attach_pdf, enabled, next_run_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${ctx.userId}::uuid, ${input.templateId ?? null}::uuid,
          ${input.frequency}::"ReportScheduleFrequency",
          ${input.frequency === 'weekly' ? (input.dayOfWeek ?? null) : null},
          ${input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null},
          ${input.hour}, ${input.rangeKey},
          ${input.toEmails}, ${input.attachPdf}, ${input.enabled},
          ${next}, now()
        )
        RETURNING id::text
      `),
    );
    return { id: rows[0]!.id };
  }

  async guncelle(
    ctx: TenantContext,
    id: string,
    input: RaporPlaniInput,
  ): Promise<{ id: string }> {
    await this.onKosullar(ctx, input.clientId);

    const next = siradakiCalisma(
      {
        frequency: input.frequency,
        dayOfWeek: input.dayOfWeek ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        hour: input.hour,
      },
      new Date(),
    );

    const scoped = { ...ctx, activeClientId: input.clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE report_schedules SET
          template_id  = ${input.templateId ?? null}::uuid,
          frequency    = ${input.frequency}::"ReportScheduleFrequency",
          day_of_week  = ${input.frequency === 'weekly' ? (input.dayOfWeek ?? null) : null},
          day_of_month = ${input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null},
          hour         = ${input.hour},
          range_key    = ${input.rangeKey},
          to_emails    = ${input.toEmails},
          attach_pdf   = ${input.attachPdf},
          enabled      = ${input.enabled},
          -- ZAMANLAMA DEGISTIYSE SIRADAKI CALISMA YENIDEN HESAPLANIYOR.
          -- Eski next_run_at degerini birakmak, "Sali'ya aldim ama Pazartesi
          -- gitti" demek olurdu. (Backtick YOK: sablonu ortasindan kapatiyor.)
          next_run_at  = ${next},
          updated_at   = now()
        WHERE id = ${id}::uuid AND tur = 'rapor'
        RETURNING id::text
      `),
    );
    // SIFIR SATIR = RLS reddetti ya da satır yok. Sessizce "başarılı"
    // dönmek, kullanıcının kaydettiğini sanması demek olurdu.
    if (rows.length === 0) throw new NotFoundException('Planlama bulunamadı.');
    return { id: rows[0]!.id };
  }

  async sil(ctx: TenantContext, id: string, clientId: string): Promise<{ silindi: true }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        DELETE FROM report_schedules WHERE id = ${id}::uuid AND tur = 'rapor' RETURNING id::text
      `),
    );
    if (rows.length === 0) throw new NotFoundException('Planlama bulunamadı.');
    return { silindi: true };
  }

  /**
   * KURULUM ANINDA DOĞRULAMA — kullanım anında değil.
   *
   * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında. Kullanıcı
   * yüklediği görselin kullanılamayacağını tıkladığında değil bıraktığında
   * öğrenmeli." Buradaki karşılığı: e-posta kimliği doğrulanmamışsa plan
   * KURULMUYOR. Aksi hâlde plan sessizce kurulur, ilk gönderim gecenin
   * bir yarısı düşer ve kullanıcı haftalar sonra fark eder.
   */
  private async onKosullar(ctx: TenantContext, clientId: string): Promise<void> {
    const [gonderen] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ verified_at: Date | null }>>(Prisma.sql`
        SELECT verified_at FROM user_email_accounts WHERE user_id = ${ctx.userId}::uuid
      `),
    );
    if (!gonderen) {
      throw new BadRequestException(
        'Önce kendi e-posta ayarlarını kaydet (Ayarlar → E-posta Ayarları). ' +
          'Planlanan rapor senin adresinden gidiyor.',
      );
    }
    if (gonderen.verified_at === null) {
      throw new BadRequestException(
        'E-posta ayarların doğrulanmadı. Ayarlar ekranından kendine test maili gönder — ' +
          'doğrulanmamış bir hesapla kurulan plan gecenin bir yarısı sessizce düşerdi.',
      );
    }

    const [musteri] = await this.prisma.withTenant({ ...ctx, activeClientId: clientId }, (tx) =>
      tx.$queryRaw<Array<{ contact_emails: string[] | null }>>(Prisma.sql`
        SELECT contact_emails FROM clients WHERE id = ${clientId}::uuid
      `),
    );
    if (!musteri) throw new NotFoundException('Workspace bulunamadı.');
  }

  // ---------------------------------------------------------------------------
  // Çalıştırma (worker, oturumsuz)
  // ---------------------------------------------------------------------------

  /**
   * Zamanı gelmiş planlamaları çalıştırır. Süpürme bunu çağırıyor.
   *
   * ═══ MÜKERRER GÖNDERİM BU METODUN ASIL DERDİ ═══
   *
   * Worker `concurrency: 4` ile koşuyor ve pm2 sık yeniden başlatıyor
   * (üretimde restart sayacı 160'ın üstünde). İki koruma birlikte çalışıyor:
   *
   * 1. KOŞULLU UPDATE (karşılaştır-ve-yaz). `next_run_at`i ileri atan
   *    UPDATE, `next_run_at <= now()` koşulunu da taşıyor. İki worker aynı
   *    satırı görürse ikincisinin UPDATE'i SIFIR satır etkiliyor ve o tur
   *    atlanıyor. `SELECT ... FOR UPDATE` da olurdu ama uzun süren mail
   *    gönderimi boyunca satırı kilitli tutardı.
   *
   * 2. ÖNCE İLERİ AT, SONRA GÖNDER. Sıra tersine olsaydı, gönderimle
   *    güncelleme arasında ölen bir worker'dan sonraki tur AYNI raporu
   *    tekrar gönderirdi. Bu sırayla ise en kötü ihtimalle bir dönem
   *    ATLANIYOR — ve atlanan rapor kurtarılabilir (kullanıcı elle
   *    gönderir, `last_status` ekranda görünür), mükerrer olan
   *    kurtarılamaz.
   *
   * OTOMATİK TEKRAR DENEME YOK. Aynı gerekçe: başarısız bir gönderimi beş
   * kez denemek, SMTP yanıtı geciken bir turda müşteriye beş mail gitmesi
   * riski demek.
   */
  async calistir(): Promise<{ rows: number; note: string }> {
    const zamaniGelenler = await this.admin.$queryRaw<
      Array<{
        id: string;
        org_id: string;
        client_id: string;
        created_by_user_id: string;
        template_id: string | null;
        frequency: PlanSikligi;
        day_of_week: number | null;
        day_of_month: number | null;
        hour: number;
        range_key: string;
        to_emails: string[];
        attach_pdf: boolean;
        client_name: string;
        tur: string;
        next_run_at: Date;
      }>
    >(Prisma.sql`
      SELECT s.id::text, s.org_id::text, s.client_id::text,
             s.created_by_user_id::text, s.template_id::text,
             s.frequency::text AS frequency, s.day_of_week, s.day_of_month,
             s.hour, s.range_key, s.to_emails, s.attach_pdf, c.name AS client_name,
             s.tur, s.next_run_at
        FROM report_schedules s
        JOIN clients c ON c.id = s.client_id
       WHERE s.enabled = true
         AND s.next_run_at <= now()
         -- Arşivlenmiş müşteriye rapor gitmiyor.
         AND c.status = 'active'
       ORDER BY s.next_run_at
       LIMIT 100
    `);

    if (zamaniGelenler.length === 0) {
      return { rows: 0, note: 'zamanı gelen planlama yok' };
    }

    let gonderilen = 0;
    let atlanan = 0;
    let dusen = 0;
    const notlar: string[] = [];

    for (const plan of zamaniGelenler) {
      const next = siradakiCalisma(
        {
          frequency: plan.frequency,
          dayOfWeek: plan.day_of_week,
          dayOfMonth: plan.day_of_month,
          hour: plan.hour,
        },
        new Date(),
      );

      // ① KOŞULLU CLAIM — gönderimden ÖNCE.
      const claim = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE report_schedules
           SET next_run_at = ${next}, last_run_at = now()
         WHERE id = ${plan.id}::uuid
           AND enabled = true
           AND next_run_at <= now()
        RETURNING id::text
      `);
      if (claim.length === 0) {
        // Başka bir worker aldı. Hata değil; sayılıyor ki "neden bir tur
        // eksik göründü" sorusu cevapsız kalmasın.
        continue;
      }

      // ② GÖNDER
      try {
        if (plan.tur === 'haftalik_ozet') {
          const r = await this.ozetCalistir(plan);
          if (r.durum === 'sent') gonderilen++;
          else atlanan++;
          notlar.push(r.not);
          continue;
        }
        const pencere = raporPenceresi(plan.range_key, bugunUtc());
        if (pencere === null) {
          await this.sonucYaz(plan.id, 'skipped', 'Dönem henüz başlamadı (pencere boş).', null);
          atlanan++;
          continue;
        }

        /*
         * SENTETİK KİRACI BAĞLAMI — PLANI KURAN KULLANICI ADINA.
         *
         * `permissions` DOLU. CLAUDE.md'de kayıtlı bir hata: "share.service.ts
         * bağlamı `permissions` taşımıyordu — her paylaşılan rapor bağlantısı
         * çalışma anında düşecekti; `as TenantContext` cast'i denetimsiz."
         * Burada aynı tuzak var ve rapor kurma yolu yetki okuyor.
         */
        const ctx = {
          userId: plan.created_by_user_id,
          orgId: plan.org_id,
          clientIds: [plan.client_id],
          activeClientId: plan.client_id,
          role: 'admin',
          isOrgAdmin: true,
          permissions: ['report.read', 'report.share'],
        } as unknown as TenantContext;

        const sonuc = await this.gonderici.zamanlanmisGonder(ctx, {
          clientId: plan.client_id,
          from: pencere.from,
          to: pencere.to,
          templateId: plan.template_id,
          toEmails: plan.to_emails,
          attachPdf: plan.attach_pdf,
        });

        if (sonuc.bosDonem) {
          await this.sonucYaz(
            plan.id,
            'skipped',
            `${pencere.from} – ${pencere.to} döneminde harcama kaydı yok; boş rapor gönderilmedi.`,
            null,
          );
          atlanan++;
          notlar.push(`${plan.client_name}: veri yok`);
        } else {
          /*
           * FATURASIZ DÖNEM SESSİZ KALMIYOR. Rapor gitti ama o ayın platform
           * faturası yüklenmemişse kullanıcı bunu bilmeli — "müşteri her şeyi
           * tek pakette görsün" vaadi tam da orada yarım kalıyor. Gönderimi
           * DURDURMUYORUZ (kullanıcının kararı): geciken rapor, eksik
           * rapordan kötü.
           */
          const eksik = sonuc.faturasizDonemler;
          await this.sonucYaz(
            plan.id,
            'sent',
            eksik.length > 0 ? `Fatura yüklenmemiş dönem: ${eksik.join(', ')}` : null,
            sonuc.to.join(', '),
          );
          gonderilen++;
          /*
           * KISMİ RET NOTA GİRİYOR. nodemailer alıcılardan bazıları
           * reddedilse bile fırlatmıyor; planlı yolda ekranda bekleyen kimse
           * olmadığı için tek iz bu not oluyor.
           */
          const red = sonuc.reddedilen;
          notlar.push(
            `${plan.client_name} → ${sonuc.to.join(', ')}` +
              (eksik.length > 0 ? ` (faturasız: ${eksik.join(', ')})` : '') +
              (red.length > 0 ? ` · REDDEDİLEN: ${red.map((x) => x.adres).join(', ')}` : ''),
          );
        }
      } catch (err) {
        const mesaj = err instanceof Error ? err.message : String(err);
        /*
         * HATA YUTULMUYOR AMA DÖNGÜ DE KESİLMİYOR. Bir müşterinin SMTP'si
         * bozuksa diğer sekiz planlamanın da durması, tek bir arızayı
         * hepsine yaymak olurdu.
         */
        this.logger.error(`Planlı rapor gönderilemedi (${plan.client_name}): ${mesaj}`);
        await this.sonucYaz(plan.id, 'failed', mesaj, null);
        dusen++;
        notlar.push(`${plan.client_name}: HATA — ${mesaj.slice(0, 80)}`);
      }
    }

    const ozet =
      `${gonderilen} gönderildi · ${atlanan} atlandı · ${dusen} başarısız` +
      (notlar.length > 0 ? ` · ${notlar.join('; ')}` : '');
    this.logger.log(`Planlı rapor turu: ${ozet}`);
    // `rows` GÖNDERİLEN sayısı: "succeeded + rows = 0" teşhis ekranında
    // "hiçbir rapor gitmedi" diye okunabilmeli.
    return { rows: gonderilen, note: ozet.slice(0, 500) };
  }

  /**
   * ═══ HAFTALIK ÖZET DALI (Paket B, MIMARI § 5) ═══
   *
   * Claim ve "tekrar deneme yok" kuralı yukarıda, rapor dalıyla ORTAK.
   * Hafta SÜPÜRMENİN koştuğu andan değil planın `next_run_at`inden:
   * worker deploy'da geç kalıp Salı koşarsa yine aynı haftayı gönderir.
   *
   * Hata FIRLATIYOR (çağıranın catch'i `failed` yazıyor); boş hafta ve
   * kısmi ret burada yazılıyor. Müşteri görünümü `ozetEpostasi`nin İÇİNDE
   * süzülüyor (`ozetKitleyeGore`): sinyal ve bekleyen iş bu maile giremez.
   */
  private async ozetCalistir(plan: {
    id: string;
    org_id: string;
    client_id: string;
    created_by_user_id: string;
    to_emails: string[];
    client_name: string;
    next_run_at: Date;
  }): Promise<{ durum: 'sent' | 'skipped'; not: string }> {
    const hafta = ozetHaftasi(new Date(plan.next_run_at));
    const { ozet } = await this.ozet.getir(plan.client_id, hafta);
    if (ozet.hacim === 'bos') {
      await this.sonucYaz(plan.id, 'skipped', `${hafta}: bu hafta ve önceki hafta harcama yok; boş özet gönderilmedi.`, null);
      return { durum: 'skipped', not: `${plan.client_name}: özet boş (${hafta})` };
    }
    const e = ozetEpostasi(ozet, 'musteri', ozetPanelAdresi(this.config.mail.appUrl, plan.client_id, hafta));
    const ctx = {
      userId: plan.created_by_user_id,
      orgId: plan.org_id,
      clientIds: [plan.client_id],
      activeClientId: plan.client_id,
      role: 'admin',
      isOrgAdmin: true,
      permissions: ['report.read', 'report.share'],
    } as unknown as TenantContext;
    const sonuc = await this.gonderici.ozetGonder(ctx, {
      clientId: plan.client_id,
      toEmails: plan.to_emails,
      konu: e.konu,
      html: e.html,
      yalnizKendine: false,
    });
    /*
     * KISMİ RET `last_error`a: durum `sent` (en az bir alıcı kabul etti) ama
     * reddedilen adres panelde plan kartında görünmeli; ekranda bekleyen
     * kimse yok ve tek iz bu satır.
     */
    const red = sonuc.reddedilen;
    await this.sonucYaz(
      plan.id,
      'sent',
      red.length > 0 ? `Reddedilen: ${red.map((x) => `${x.adres} (${x.sebep})`).join(', ')}` : null,
      sonuc.to.join(', '),
    );
    return {
      durum: 'sent',
      not:
        `${plan.client_name} özet ${hafta} → ${sonuc.to.join(', ')}` +
        (red.length > 0 ? ` · REDDEDİLEN: ${red.map((x) => x.adres).join(', ')}` : ''),
    };
  }

  // ---------------------------------------------------------------------------
  // Haftalık özet planı (oturumlu) — aynı tablo, `tur = 'haftalik_ozet'`
  // ---------------------------------------------------------------------------

  async ozetPlani(ctx: TenantContext, clientId: string): Promise<HaftalikOzetPlani> {
    const scoped = { ...ctx, activeClientId: clientId };
    const { plan, musteri, benim } = await this.prisma.withTenant(scoped, async (tx) => {
      const [plan] = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT s.enabled, s.hour, s.to_emails, s.next_run_at, s.last_run_at, s.last_status,
               s.last_error, s.last_sent_to, u.full_name AS ad, u.email AS eposta,
               -- Başkasının planında cevap BİLİNMİYOR (NULL): kimlik tablosu
               -- satırı yalnız sahibine gösteriyor (rapor listesindeki kural).
               CASE WHEN s.created_by_user_id = app.current_user_id()
                    THEN (ea.id IS NOT NULL AND ea.verified_at IS NOT NULL)
                    ELSE NULL END AS sender_ready
          FROM report_schedules s
          LEFT JOIN users u ON u.id = s.created_by_user_id
          LEFT JOIN user_email_accounts ea ON ea.user_id = s.created_by_user_id
         WHERE s.client_id = ${clientId}::uuid AND s.tur = 'haftalik_ozet'`);
      const [musteri] = await tx.$queryRaw<Array<{ contact_emails: string[] | null }>>(Prisma.sql`
        SELECT contact_emails FROM clients WHERE id = ${clientId}::uuid`);
      const [benim] = await tx.$queryRaw<Array<{ hazir: boolean }>>(Prisma.sql`
        SELECT (verified_at IS NOT NULL) AS hazir FROM user_email_accounts WHERE user_id = ${ctx.userId}::uuid`);
      return { plan, musteri, benim };
    });
    if (!musteri) throw new NotFoundException('Workspace bulunamadı.');
    const toEmails = (plan?.to_emails as string[] | undefined) ?? [];
    const cozulen = nihaiAlicilar({ secilen: toEmails, musteriAdresleri: musteri.contact_emails ?? [] });
    if (!plan) {
      return {
        clientId,
        kurulu: false,
        etkin: false,
        saat: OZET.varsayilanSaat,
        toEmails: [],
        cozulenAliciListesi: cozulen,
        siradaki: null,
        son: null,
        // Kurulu değilken açan kişi gönderen olacak: SENİN kimliğin.
        gonderen: null,
        senderReady: benim ? benim.hazir === true : false,
      };
    }
    const tarih = (x: unknown) => (x ? new Date(x as Date).toISOString() : null);
    return {
      clientId,
      kurulu: true,
      etkin: plan.enabled === true,
      saat: Number(plan.hour),
      toEmails,
      cozulenAliciListesi: cozulen,
      siradaki: plan.enabled === true ? tarih(plan.next_run_at) : null,
      son: plan.last_run_at && plan.last_status
        ? {
            zaman: tarih(plan.last_run_at)!,
            durum: plan.last_status as PlanSonucu,
            hata: (plan.last_error as string) ?? null,
            alici: (plan.last_sent_to as string) ?? null,
          }
        : null,
      gonderen: { ad: (plan.ad as string) ?? null, eposta: (plan.eposta as string) ?? null },
      senderReady: plan.sender_ready === null || plan.sender_ready === undefined ? null : plan.sender_ready === true,
    };
  }

  /**
   * Aç/kapat, saat, alıcılar. AÇARKEN kurulum anında doğrulama
   * (`onKosullar`, rapor planıyla AYNI): SMTP kimliği doğrulanmamışsa plan
   * açılmıyor. Açan kişi GÖNDEREN oluyor: doğrulanan kimlik onunki ve
   * başkasının kimliğiyle gönderen bir plan, doğrulanmamış bir yoldan
   * müşteriye mail atmak olurdu. Kapatmak ön koşulsuz.
   *
   * `org_id` HEDEF MÜŞTERİDEN (CLAUDE.md "tüm şirketler" dersi).
   * Workspace başına tek satır: kısmi tekil indeks + ON CONFLICT.
   */
  async ozetPlaniKaydet(ctx: TenantContext, input: HaftalikOzetPlaniGirdisi): Promise<HaftalikOzetPlani> {
    if (input.etkin) await this.onKosullar(ctx, input.clientId);
    const next = siradakiCalisma({ frequency: 'weekly', dayOfWeek: OZET.gun, dayOfMonth: null, hour: input.saat }, new Date());
    const scoped = { ...ctx, activeClientId: input.clientId };
    await this.prisma.withTenant(scoped, async (tx) => {
      const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        SELECT org_id::text AS org_id FROM clients WHERE id = ${input.clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı.');
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO report_schedules (
          id, org_id, client_id, created_by_user_id, template_id, tur,
          frequency, day_of_week, day_of_month, hour, range_key,
          to_emails, attach_pdf, enabled, next_run_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${c.org_id}::uuid, ${input.clientId}::uuid, ${ctx.userId}::uuid, NULL, 'haftalik_ozet',
          'weekly'::"ReportScheduleFrequency", ${OZET.gun}::int, NULL, ${input.saat}::int, ${OZET_PENCERE_ANAHTARI},
          ${input.toEmails}, false, ${input.etkin}, ${next}, now()
        )
        ON CONFLICT (client_id) WHERE tur = 'haftalik_ozet' DO UPDATE SET
          hour        = EXCLUDED.hour,
          to_emails   = EXCLUDED.to_emails,
          enabled     = EXCLUDED.enabled,
          next_run_at = EXCLUDED.next_run_at,
          created_by_user_id = CASE WHEN EXCLUDED.enabled THEN EXCLUDED.created_by_user_id
                                    ELSE report_schedules.created_by_user_id END,
          updated_at  = now()
        RETURNING id::text`);
      // SIFIR SATIR = RLS reddetti. "Kaydedildi" deyip kapatılmamış bir
      // planı açık bırakmak müşteriye istenmeyen mail demek.
      if (rows.length === 0) throw new NotFoundException('Haftalık özet planı kaydedilemedi.');
    });
    return this.ozetPlani(ctx, input.clientId);
  }

  private async sonucYaz(
    id: string,
    durum: PlanSonucu,
    hata: string | null,
    alici: string | null,
  ): Promise<void> {
    await this.admin.$executeRaw(Prisma.sql`
      UPDATE report_schedules
         SET last_status = ${durum},
             last_error = ${hata ? hata.slice(0, 500) : null},
             -- BAŞARILI TURDA ALICI YAZILIYOR, BAŞARISIZDA ESKİSİ SİLİNİYOR:
             -- "en son 3 Eylül'de x@y.com adresine gitti" bilgisi ancak
             -- gerçekten gittiyse doğru.
             last_sent_to = ${alici},
             updated_at = now()
       WHERE id = ${id}::uuid
    `);
  }
}
