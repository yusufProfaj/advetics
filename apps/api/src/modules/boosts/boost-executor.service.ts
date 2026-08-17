import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PlatformApiError,
  type BoostBudget,
  type BoostSource,
} from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import type { TxLike } from '../rules/rules.service';
import { INSTAGRAM_PARENT_PAGE_MISSING, isInstagramProfile } from './instagram-boost-guard';

/**
 * DB işini KISA transaction'larda koşturan çalıştırıcı.
 *
 * NEDEN VAR — CANLIDA ÖĞRENİLDİ. Bu servis eskiden çağırandan hazır bir `tx`
 * alıyordu ve o `tx`, RLS bağlamı için açılmış ETKİLEŞİMLİ bir Prisma
 * transaction'ıydı (`withTenant`, `set_config(..., is_local => true)` yüzünden
 * transaction zorunlu). Prisma'nın varsayılan sınırı 5 saniye; boost ise
 * Meta'ya ÜÇ ilâ DÖRT HTTP çağrısı yapıyor ve üretimde 7–12,5 saniye sürdü.
 *
 * Sonuç yalnızca "yavaş" değildi, ÇİFT SESSİZ HATAYDI:
 *
 *   1. Transaction ölüyor, ardından `fail()` bile yazamıyor — hata
 *      `boosts.error` kolonuna DÜŞEMİYOR ve kullanıcı 500 görüyor.
 *   2. Kayıt `approved`'da kalıyor. Ama Meta çağrısı BAŞARILI OLMUŞ olabilir:
 *      o zaman platformda para harcayan bir kampanya var ve bizde hiçbir izi
 *      yok. Boost'un bütün geri alma mantığı da bu yüzden çalışmıyor.
 *
 * Çözüm platform çağrısını transaction'ın DIŞINA çıkarmak. Çağıran artık
 * "şu işi kısa bir transaction'da koştur" diyen bir fonksiyon veriyor:
 *
 *   · kiracı yolu  → `(fn) => prisma.withTenant(ctx, fn)`
 *   · worker yolu  → `(fn) => fn(adminClient)`  (BYPASSRLS, transaction yok)
 *
 * Uzun transaction'ın bedeli yalnızca zaman aşımı da değil: bağlantı havuzunda
 * bir bağlantıyı HTTP süresince kilitliyor.
 */
export type TxRunner = <T>(fn: (tx: TxLike) => Promise<T>) => Promise<T>;

/**
 * BOOST PLATFORMDA OLUŞTU AMA KAYDEDİLEMEDİ.
 *
 * Ayrı bir sınıf, çünkü bu hâl "başarısız" DEĞİL ve öyle işaretlenmemeli:
 * kampanya Meta'da duruyor ve para harcıyor. `failed` yazmak iki yanlış
 * üretiyor — kullanıcı olmadığını sanıyor, ve satır yeniden denenebilir hâle
 * geldiği için İKİNCİ bir kampanya açılabiliyor.
 *
 * Kayıt `creating` kalıyor: bu durum baştan beri "süreç ortasında kaldı, elle
 * incelenmeli" anlamına geliyor ve `pending()` yalnızca `approved` satırları
 * aldığı için tekrar denenmiyor.
 */
class BoostCreatedButUnrecorded extends Error {
  constructor(
    readonly boostId: string,
    readonly result: { externalCampaignId: string; externalAdSetId: string; externalAdId: string },
    cause: unknown,
  ) {
    super(
      `Boost Meta'da OLUŞTU ama kaydedilemedi. Kampanya ${result.externalCampaignId} ` +
        `platformda duruyor ve para harcıyor — Ads Manager'dan elle durdurulmalı. ` +
        `Sebep: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'BoostCreatedButUnrecorded';
  }
}

/**
 * Onaylanmış boost'ları platformda oluşturur.
 *
 * ADAY ÜRETİMİNDEN AYRI BİR ADIM ve bu ayrım bu modülün en önemli tasarım
 * kararı: aday üretmek bedava, boost oluşturmak PARA TAAHHÜT EDİYOR. İkisi
 * aynı işlemde olsaydı, "kural çalıştı" ile "para harcandı" arasında hiçbir
 * karar noktası kalmazdı.
 *
 * Yalnızca `approved` durumundaki kayıtları alıyor. Onay ya bir insan
 * tarafından (`boost.approve`) ya da kuralın `autoApprove` ayarıyla verilmiş
 * oluyor; ikisi de `boosts` tablosunda görünür.
 */

interface PendingRow {
  id: string;
  org_id: string;
  client_id: string;
  ad_account_id: string;
  organic_post_id: string;
  social_profile_id: string;
  boost_rule_id: string | null;
  draft_campaign_id: string | null;
  /**
   * BIGINT KOLONLARI SÜRÜCÜYE GÖRE FARKLI TİPTE GELİYOR.
   *
   * Prisma+Postgres `bigint` veriyor, PGlite `number`/`string`. Burada
   * yalnızca `bigint` yazmak derleyiciyi susturuyordu ama tip GERÇEĞE
   * UYMUYORDU: değer bir BigInt işlemine girdiği anda "Cannot mix BigInt and
   * other types" ile patlıyor ve bu yalnızca gerçek bir sorgu koştuğunda
   * görülüyor. `BoostsService.RuleRow` aynı tuzağı zaten belgeliyordu.
   */
  daily_budget_micros: string | number | bigint | null;
  /** `daily` | `lifetime` — hangi bütçe kolonunun dolu olduğunu bu belirliyor. */
  budget_mode: string;
  total_budget_micros: string | number | bigint | null;
  duration_days: number;
  objective: string;
  /** Meta hedefleme nesnesi. NULL = sağlayıcının varsayılanı (ülke geneli). */
  targeting: unknown;
  /** Kayıtlı kitle. Doluysa `targeting` NULL — kısıt veritabanında. */
  saved_audience_id: string | null;
  post_external_id: string;
  profile_external_id: string;
  /**
   * `facebook_page` | `instagram_business`.
   *
   * `profile_external_id`'nin NE OLDUĞUNU bu alan belirliyor: Facebook'ta
   * sayfa kimliği, Instagram'da IG kullanıcı kimliği. İkisi aynı yere
   * gönderilemez.
   */
  profile_type: string;
  /** Instagram satırlarında ana Facebook sayfası; NULL ise boost denenmiyor. */
  parent_page_external_id: string | null;
  media_type: string;
  rule_name: string | null;
  account_external_id: string;
  connection_id: string;
  currency: string;
  special_ad_categories: string[];
  granted_scopes: string[];
  connection_status: string;
}

@Injectable()
export class BoostExecutorService {
  private readonly logger = new Logger(BoostExecutorService.name);

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Onaylanmış boost'ları oluşturur.
   *
   * `limit` var çünkü bu döngü platforma ÜÇ çağrı/boost yapıyor. Sınırsız
   * bırakmak, biriken 50 onaylı boost'un tek turda kotayı yakması demek
   * olurdu; kalanlar bir sonraki turda alınıyor.
   */
  async createApproved(
    run: TxRunner,
    clientId: string,
    limit = 10,
  ): Promise<{ created: number; failed: number }> {
    const pending = await run((tx) =>
      this.pending(
        tx,
      // Durum süzgeci `pending()` içinde — iki çağıranın da onaylı olmayan
      // bir satırı yayınlaması imkânsız olsun diye orada.
        Prisma.sql`b.client_id = ${clientId}::uuid`,
        limit,
      ),
    );

    let created = 0;
    let failed = 0;

    for (const row of pending) {
      const ok = await this.createOne(run, row);
      if (ok) created++;
      else failed++;
    }
    return { created, failed };
  }

  /**
   * TEK bir onaylı boost'u oluşturur — elle boost bu yoldan geçiyor.
   *
   * NEDEN AYRI BİR METOT VE NEDEN AYRI BİR YAYIN YOLU DEĞİL: elle boost da
   * `boosts` satırı yazıp aynı `createOne`'dan geçiyor. Kota bekçisi, yazma
   * izni kontrolü, geri alma, ağaç kaydı ve `boosted_at` işareti orada ve
   * ikinci bir kopyası olmamalı — bu belgenin bütün teşhisi (§2) üç ayrı
   * yazma yolu olmasıydı.
   *
   * HATA METNİ GERİ DÖNÜYOR, yalnızca kolona yazılmıyor. Kural yolunda hata
   * `boosts.error`'a düşüyor ve kullanıcı onu listede sonra görüyor; elle
   * boost'ta kullanıcı düğmeye BASMIŞ ve ekranda bekliyor. "Bir şey oldu"
   * demek, bu projede tekrar tekrar çıkan sessiz hatanın arayüz karşılığı.
   */
  async createOneApproved(
    run: TxRunner,
    boostId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const [row] = await run((tx) =>
      this.pending(tx, Prisma.sql`b.id = ${boostId}::uuid`, 1),
    );
    if (!row) return { ok: false, error: 'Boost kaydı bulunamadı ya da onaylı değil.' };

    const ok = await this.createOne(run, row);
    if (ok) return { ok: true };

    // `createOne` sebebi `boosts.error`'a yazdı; buradan okuyup çağırana
    // veriyoruz. İkinci kez üretmek, iki farklı metin üretme riski demek.
    const [after] = await run((tx) =>
      tx.$queryRaw<Array<{ error: string | null }>>(Prisma.sql`
        SELECT error FROM boosts WHERE id = ${boostId}::uuid
      `),
    );
    return { ok: false, error: after?.error ?? 'Boost oluşturulamadı.' };
  }

  /** Yayına hazır satırlar — iki çağıran da aynı sorguyu kullanıyor. */
  private async pending(tx: TxLike, where: Prisma.Sql, limit: number): Promise<PendingRow[]> {
    return tx.$queryRaw<PendingRow[]>(Prisma.sql`
      SELECT b.id, b.org_id::text AS org_id, b.client_id,
             b.ad_account_id::text AS ad_account_id,
             b.organic_post_id::text AS organic_post_id,
             b.boost_rule_id::text AS boost_rule_id,
             b.draft_campaign_id::text AS draft_campaign_id,
             p.social_profile_id::text AS social_profile_id,
             b.budget_mode, b.daily_budget_micros, b.total_budget_micros,
             b.duration_days, b.objective, b.targeting, b.saved_audience_id,
             p.external_id AS post_external_id, p.media_type,
             sp.external_id AS profile_external_id,
             sp.profile_type::text AS profile_type,
             -- ANA FACEBOOK SAYFASI: Instagram satırında external_id IG
             -- kullanıcı kimliği; reklam ise bir sayfaya bağlanmak zorunda.
             sp.parent_page_external_id,
             r.name AS rule_name,
             a.external_id AS account_external_id,
             a.connection_id::text AS connection_id,
             a.currency,
             -- ÖZEL REKLAM KATEGORİLERİ MÜŞTERİDEN. Beyan edilmeden
             -- yayınlanan konut/istihdam/kredi reklamı politika ihlali ve
             -- cezası HESAP seviyesinde.
             cl.special_ad_categories,
             c.granted_scopes, c.status::text AS connection_status
      FROM boosts b
      JOIN organic_posts p ON p.id = b.organic_post_id
      JOIN social_profiles sp ON sp.id = p.social_profile_id
      JOIN ad_accounts a ON a.id = b.ad_account_id
      JOIN platform_connections c ON c.id = a.connection_id
      JOIN clients cl ON cl.id = b.client_id
      LEFT JOIN boost_rules r ON r.id = b.boost_rule_id
      WHERE ${where} AND b.status = 'approved'
      ORDER BY b.approved_at
      LIMIT ${limit}
    `);
  }

  private async createOne(run: TxRunner, row: PendingRow): Promise<boolean> {
    const provider = this.providers.get('meta');

    /**
     * KAYNAK EN BAŞTA KURULUYOR — kota alınmadan, durum `creating` olmadan.
     *
     * Instagram'da ANA SAYFA ŞART: `parent_page_external_id` NULL olan bir
     * satır için boost denenmiyor. Sayfa kimliği olmadan kurulacak kreatif ya
     * reddedilir ya da yanlış bir kimlikle oluşur — ikincisi sessiz. Kolon bu
     * satırlar keşfedildikten SONRA eklendi, yani üretimdeki eski satırlarda
     * boş ve çözüm kodda değil: bir kez "Hesapları yenile".
     *
     * NEDEN EN BAŞTA: hiçbir zaman yapılamayacak bir iş için kota yakmak, aynı
     * turdaki gerçek boost'ları sıraya atmak demek. Aynı gerekçe eski Instagram
     * engelinde de yazılıydı ve dal yazılırken kaybolmuştu.
     */
    let kaynak: BoostSource;
    if (isInstagramProfile(row.profile_type)) {
      if (!row.parent_page_external_id) {
        await run((tx) => this.fail(tx, row.id, INSTAGRAM_PARENT_PAGE_MISSING));
        return false;
      }
      kaynak = {
        surface: 'instagram',
        pageExternalId: row.parent_page_external_id,
        instagramUserId: row.profile_external_id,
        mediaExternalId: row.post_external_id,
        mediaType: row.media_type,
      };
    } else {
      kaynak = {
        surface: 'facebook_page',
        pageExternalId: row.profile_external_id,
        postExternalId: row.post_external_id,
      };
    }

    if (row.connection_status !== 'active') {
      await run((tx) =>
        this.fail(tx, row.id, `Platform bağlantısı etkin değil (${row.connection_status}).`),
      );
      return false;
    }

    const can = provider.canWrite(row.granted_scopes ?? []);
    if (!can.ok) {
      // App Review onayı gelene kadar en sık karşılaşılacak durum. Boost
      // `failed` düşüyor ama `approved` durumuna geri alınabilir — onay
      // kararı hâlâ geçerli, eksik olan platform izni.
      await run((tx) =>
        this.fail(
          tx,
          row.id,
          `Yazma izni yok: ${can.missing.join(', ')}. Platform onayı geldikten sonra yeniden denenebilir.`,
        ),
      );
      return false;
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      adAccountId: row.ad_account_id,
      layer: 'rule_action',
    });
    if (!gate.allowed) {
      await run((tx) =>
        this.fail(tx, row.id, `Kota engeli: ${gate.reason}. Sonraki turda denenecek.`),
      );
      return false;
    }

    // OLUŞTURMA BAŞLIYOR — durum önce `creating`.
    //
    // Süreç ortasında worker düşerse kayıt `creating` kalıyor ve bu bilgi
    // değerli: `approved` bırakmak, bir sonraki turun aynı boost'u ikinci kez
    // oluşturmasına yol açardı. `creating` kayıtlar elle incelenmeli.
    await run((tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE boosts SET status = 'creating', updated_at = now() WHERE id = ${row.id}::uuid
      `),
    );

    try {
      const accessToken = await this.vault.getAccessToken(row.connection_id, provider);
      const fetchCtx = {
        accessToken,
        accountExternalId: row.account_external_id,
      };

      /**
       * KAYITLI KİTLE YAYIN ANINDA ÇÖZÜLÜYOR.
       *
       * Kitlenin kimliğini bir ad set'e doğrudan yazmanın yolu yok; uygulanan
       * şey kitlenin taşıdığı hedefleme tanımı. Tanımı seçim anında çekip
       * saklamak yerine burada okumak, kullanıcının Ads Manager'da bu arada
       * değiştirdiği bir kitlenin ESKİ hâlini göndermeyi engelliyor.
       *
       * BULUNAMAZSA YAYIN DURUYOR. Geniş hedeflemeye düşmek, seçtiği kitleye
       * reklam verdiğini sanan kullanıcının parasını başka yere harcamak olur
       * — ve hiçbir yerde görünmez.
       */
      let targeting = (row.targeting as Record<string, unknown> | null) ?? undefined;
      if (row.saved_audience_id) {
        const kitle = await provider.getSavedAudienceTargeting(
          fetchCtx,
          row.saved_audience_id,
        );
        if (!kitle) {
          await run((tx) =>
            this.fail(
              tx,
              row.id,
            'Seçilen kayıtlı kitle Meta’da bulunamadı ya da hedefleme tanımı boş. ' +
              'Kitle silinmiş olabilir; Ads Manager’dan kontrol et.',
            ),
          );
          return false;
        }
        targeting = kitle;
      }

      const result = await provider.createBoost(
        {
          ...fetchCtx,
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: 'meta',
              adAccountId: row.ad_account_id,
              clientId: row.client_id,
              endpoint: 'boost:create',
              snapshot,
            }),
        },
        {
          adAccountExternalId: row.account_external_id,
          source: kaynak,
          /**
           * BÜTÇE KİPİ SATIRDAN OKUNUYOR, VARSAYILMIYOR.
           *
           * Kural yolu GÜNLÜK yazıyor ve öyle kalıyor: kural süresiz çalışıyor
           * ve aylık tavanı günlük bütçe × süre üzerinden hesaplanıyor
           * (`boost_rules.monthly_cap_micros`). Elle boost TOPLAM yazıyor
           * (K18). Kipi burada varsaymak, elle boost'un 300 TL'sini günlük
           * 300 TL olarak beş gün harcamak demek olurdu.
           */
          budget: budgetOf(row),
          durationDays: row.duration_days,
          /**
           * HEDEFLEME SATIRDAN. Kural satırlarında NULL ve o zaman sağlayıcı
           * kendi varsayılanını (ülke geneli) uyguluyor — kural ekranında
           * hedefleme sorulmuyor ve sorulmadığı sürece burada bir değer
           * üretmek, kullanıcının vermediği bir kararı onun adına vermek olur.
           */
          targeting,
          objective: row.objective,
          currency: row.currency,
          name: `Boost — ${row.rule_name ?? 'elle'} — ${row.post_external_id.slice(-8)}`,
          specialAdCategories: row.special_ad_categories ?? [],
        },
      );

      /**
       * PLATFORM ÇAĞRISI BİTTİ — kayıt İŞİ TEK KISA TRANSACTION'DA.
       *
       * Üçü birlikte yazılıyor (boost satırı, ağaç, gönderi işareti) çünkü
       * ikisi yazılıp üçüncüsü yazılmayan bir hâl, panelde açıklanamaz bir
       * kayıt bırakır. Ama bu transaction artık yalnızca DB işi içeriyor:
       * saniyeler süren HTTP çağrısı dışında kaldı.
       */
      try {
        await run(async (tx) => {
          await tx.$executeRaw(Prisma.sql`
            UPDATE boosts SET
              status = 'active',
              external_campaign_id = ${result.externalCampaignId},
              external_ad_set_id = ${result.externalAdSetId},
              external_ad_id = ${result.externalAdId},
              created_on_platform_at = now(),
              error = NULL,
              updated_at = now()
            WHERE id = ${row.id}::uuid
          `);

          await this.writeTree(tx, row, result);

          // GÖNDERİ İŞARETLENİYOR — aynı gönderi ikinci kez aday olmasın.
          //
          // Kısmi tekil indeks zaten canlı bir boost varken ikinciyi
          // engelliyor, ama boost sonradan iptal edilirse indeks serbest
          // kalıyor. `boosted_at` kalıcı: bir kez boost edilmiş gönderi, boost
          // bittikten sonra da yeniden aday olmamalı.
          await tx.$executeRaw(Prisma.sql`
            UPDATE organic_posts SET boosted_at = now(), updated_at = now()
            WHERE id = ${row.organic_post_id}::uuid
          `);
        });
      } catch (err) {
        /**
         * BOOST PLATFORMDA VAR AMA KAYDEDİLEMEDİ — EN PAHALI HÂL.
         *
         * Kampanya oluştu ve para harcamaya başladı; bizde izi yok. Bu yüzden
         * hata YUTULMUYOR ve dış kimlikler log'a TAM olarak yazılıyor: Ads
         * Manager'da bulunup elle durdurulabilsin. Üretimde tam olarak bu
         * yaşandı — transaction zaman aşımına düştü ve kampanya kayıtsız kaldı.
         *
         * Fırlatmak yerine `false` dönmek, çağırana "olmadı" demek olurdu ve
         * ikinci deneme İKİNCİ bir kampanya açardı.
         */
        this.logger.error(
          `BOOST PLATFORMDA OLUŞTU AMA KAYDEDİLEMEDİ — elle müdahale gerekiyor. ` +
            `boost=${row.id} kampanya=${result.externalCampaignId} ` +
            `adset=${result.externalAdSetId} reklam=${result.externalAdId} · ` +
            `sebep: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new BoostCreatedButUnrecorded(row.id, result, err);
      }

      this.logger.log(`Boost oluşturuldu: ${result.externalAdId}`);
      return true;
    } catch (err) {
      /**
       * KAMPANYA OLUŞTUYSA `failed` YAZILMIYOR — yukarı veriliyor.
       *
       * Kayıt `creating` kalıyor ve o durum "elle incelenmeli" demek.
       * `failed` yazmak iki yanlış üretirdi: kullanıcı boost'un olmadığını
       * sanardı ve satır yeniden denenebilir hâle geldiği için İKİNCİ bir
       * kampanya açılabilirdi. Para harcayan bir mükerrerlik, kayıt eksikliğinden
       * daha pahalı.
       */
      if (err instanceof BoostCreatedButUnrecorded) throw err;

      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      /**
       * HATA YAZIMI DA KISA TRANSACTION'DA ve KENDİ hatasını yutuyor.
       *
       * Üretimde şu yaşandı: dış transaction zaman aşımına düşmüş, ardından
       * `fail()` de yazamamış ve ASIL hata (Meta'nın mesajı) kaybolmuştu —
       * kullanıcı yalnızca "beklenmeyen bir hata" gördü. Sebebi kaydedememek,
       * sebebi bilmemekten farksız.
       */
      try {
        await run((tx) => this.fail(tx, row.id, message));
      } catch (yazmaHatasi) {
        this.logger.error(
          `Boost hatası KAYDEDİLEMEDİ (${row.id}). Asıl sebep: ${message} · ` +
            `yazma hatası: ${
              yazmaHatasi instanceof Error ? yazmaHatasi.message : String(yazmaHatasi)
            }`,
        );
      }
      return false;
    }
  }

  /**
   * Boost'u KAMPANYA AĞACINA yazar.
   *
   * NEDEN BURADA VE NEDEN AYNI TRANSACTION'DA: bu servis zaten `tx` üzerinden
   * kiracı tablolarına yazıyor (`boosts`, `organic_posts`). Ağaç satırlarını
   * aynı transaction'dan yazmak YENİ BİR GÜVENLİK KARARI DEĞİL — mevcut
   * kararın ta kendisi. Ayrı bir yola çıkarmak, boost oluşup ağaç satırının
   * yazılamadığı bir aralık bırakırdı ve o boost panelde hiç görünmezdi.
   *
   * NE KAZANDIRIYOR: kuraldan doğan bir boost artık elle kurulan
   * kampanyalarla AYNI listede, aynı durum modeliyle ve "nereden geldi"
   * bilgisiyle duruyor. Beklenmedik bir harcamanın kaynağını bulmanın tek
   * yolu bu bağ — `boost_rule_id` hangi kuralın açtığını söylüyor.
   *
   * `boosts` TABLOSU KALIYOR ve işi değişmiyor: onay kuyruğu ve aylık tavan
   * muhasebesi. Ağaç "hangi kampanyalar var" sorusunun, `boosts` "hangi
   * boost'lar onaylandı ve ne kadar taahhüt edildi" sorusunun cevabı.
   *
   * SESSİZ KALMIYOR: ağaç yazılamazsa boost YİNE oluşmuş durumda ve
   * platformda para harcıyor. Hata fırlatmak, oluşan boost'u "başarısız"
   * göstermek olurdu; log'a yazıp devam ediyoruz.
   */
  private async writeTree(
    tx: TxLike,
    row: PendingRow,
    result: { externalCampaignId: string; externalAdSetId: string; externalAdId: string },
  ): Promise<void> {
    try {
      /**
       * TASLAK ZATEN VARSA GÜNCELLENİYOR, YENİSİ AÇILMIYOR.
       *
       * Aday üretilirken bir kampanya taslağı da yazıldı (`BoostsService`).
       * Burada ikinci bir kampanya oluşturmak, kullanıcının listede aynı
       * boost'u iki kez görmesi ve hangisinin gerçek olduğunu bilememesi
       * demek olurdu.
       *
       * Eski adaylarda (bu bağ eklenmeden önce oluşmuş) `draft_campaign_id`
       * boş; onlar için aşağıdaki yol yeni bir ağaç kuruyor. Geriye dönük
       * tarama gerekmiyor — eski adaylar zaten tükenecek.
       */
      if (row.draft_campaign_id) {
        await this.markTreePublished(tx, row, result);
        return;
      }

      /**
       * KAYNAK KURALA BAĞLI. `draft_campaigns_boost_rule_chk` kuraldan doğan
       * bir kampanyanın kuralını taşımasını zorunlu kılıyor; elle onaylanan
       * bir boost'ta kural yok ve o satır 'manual' oluyor.
       */
      const source = row.boost_rule_id ? 'boost_rule' : 'manual';
      const name = `Boost — ${row.rule_name ?? 'elle'} — ${row.post_external_id.slice(-8)}`;
      const endAt = new Date(Date.now() + row.duration_days * 86_400_000);

      const [campaign] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_campaigns (
          id, org_id, client_id, platform, ad_account_id, name, surface, goal,
          settings, budget_mode, budget_amount_micros, end_at, status,
          external_campaign_id, published_at, source, boost_rule_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${row.client_id}::uuid, 'meta',
          ${row.ad_account_id}::uuid, ${name}, 'simple', NULL,
          ${JSON.stringify({ objective: row.objective })}::jsonb,
          'daily', ${row.daily_budget_micros}::bigint, ${endAt}::timestamptz,
          'published', ${result.externalCampaignId}, now(),
          ${source}, ${row.boost_rule_id}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!campaign) throw new Error('Kampanya satırı yazılamadı');

      const [group] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_ad_groups (
          id, org_id, campaign_id, name, position, social_profile_id,
          external_ad_set_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${campaign.id}::uuid, ${name}, 0,
          ${row.social_profile_id}::uuid, ${result.externalAdSetId}, now()
        )
        RETURNING id::text AS id
      `);
      if (!group) throw new Error('Reklam grubu satırı yazılamadı');

      // KREATİF YOK, GÖNDERİ VAR. `draft_ads_source_chk` ikisinden tam
      // birinin dolu olmasını zorunlu kılıyor.
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO draft_ads (
          id, org_id, ad_group_id, creative_id, organic_post_id, name, position,
          external_ad_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${row.org_id}::uuid, ${group.id}::uuid, NULL,
          ${row.organic_post_id}::uuid, ${name}, 0, ${result.externalAdId}, now()
        )
      `);
    } catch (err) {
      this.logger.error(
        `Boost ağaca yazılamadı (${row.id}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          'Boost platformda OLUŞTU ve harcıyor; panelde kampanya listesinde görünmeyecek.',
      );
    }
  }

  /**
   * Adayla birlikte doğmuş taslağı YAYINLANMIŞ yapar.
   *
   * Dış kimlikler ağacın kendi seviyelerine yazılıyor: kampanya, reklam grubu
   * ve reklam ayrı ayrı. Hepsini kampanyaya yığmak, "bu reklam grubu
   * platformda hangisi" sorusunun cevabını yok ederdi.
   */
  private async markTreePublished(
    tx: TxLike,
    row: PendingRow,
    result: { externalCampaignId: string; externalAdSetId: string; externalAdId: string },
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_campaigns SET
        status = 'published',
        external_campaign_id = ${result.externalCampaignId},
        published_at = now(),
        error = NULL,
        updated_at = now()
      WHERE id = ${row.draft_campaign_id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_ad_groups SET
        external_ad_set_id = ${result.externalAdSetId}, updated_at = now()
      WHERE campaign_id = ${row.draft_campaign_id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE draft_ads SET external_ad_id = ${result.externalAdId}, updated_at = now()
      WHERE ad_group_id IN (
        SELECT id FROM draft_ad_groups WHERE campaign_id = ${row.draft_campaign_id}::uuid
      )
    `);
  }

  private async fail(tx: TxLike, boostId: string, error: string): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE boosts SET status = 'failed', error = ${error.slice(0, 1000)}, updated_at = now()
      WHERE id = ${boostId}::uuid
    `);
  }
}

/**
 * BIGINT kolonunu güvenle `bigint`e çevirir — sürücü ne dönerse dönsün.
 *
 * `BoostsService` içindeki eşinin aynısı. Ortak bir yardımcıya çıkarmak
 * cazip ama iki modül arasında bu tek satır için bağımlılık kurmak, ikisini
 * de kendi başına okunur olmaktan çıkarır.
 */
/**
 * Satırdan bütçe kipini kurar.
 *
 * TANINMAYAN KİP HATA VERİYOR, günlüğe düşmüyor. Sessizce günlük saymak,
 * toplam bütçeli bir boost'un beş katını harcaması demek olurdu — ve kip
 * kolonundaki bir yazım hatası tam olarak böyle görünmez kalırdı. Veritabanı
 * kısıtı (`boosts_budget_chk`) bunu zaten engelliyor; burası ikinci kilit.
 */
function budgetOf(row: PendingRow): BoostBudget {
  if (row.budget_mode === 'lifetime') {
    if (row.total_budget_micros === null) {
      throw new Error('Toplam bütçeli boost kaydında tutar yok.');
    }
    return { mode: 'lifetime', totalMicros: toBigInt(row.total_budget_micros) };
  }
  if (row.budget_mode === 'daily') {
    if (row.daily_budget_micros === null) {
      throw new Error('Günlük bütçeli boost kaydında tutar yok.');
    }
    return { mode: 'daily', dailyMicros: toBigInt(row.daily_budget_micros) };
  }
  throw new Error(`Tanınmayan bütçe kipi: ${row.budget_mode}`);
}

function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  return BigInt(String(value).split('.')[0] || '0');
}
