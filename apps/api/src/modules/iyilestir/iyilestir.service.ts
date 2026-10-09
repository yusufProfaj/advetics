import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ClientPacing,
  Oneri,
  OneriListesi,
  Platform,
  TenantContext,
  UygulamaSonucu,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { CampaignActionsService, type UygulamaEylemi } from '../campaign-actions/campaign-actions.service';
import {
  adimSinirIcinde,
  butceOnerisi,
  gunEkle,
  isoHafta,
  pencereler,
  yorgunlukOnerisi,
  type AylikButceKapisi,
  type ButceGirdisi,
  type YorgunlukGirdisi,
} from './oneri-hesap';

/**
 * ═══ İYİLEŞTİR — ÖNERİ SERVİSİ (MIMARI § 2-3) ═══
 *
 * Öneriler İSTEK ANINDA hesaplanıyor; yalnız KARAR saklanıyor. Okuma
 * sorguları ayrı, kısa `withTenant` transaction'larında; platform çağrısı
 * hiçbirinin İÇİNDE değil (uygulama `CampaignActionsService.uygula`da).
 *
 * KAYNAK DÜŞERSE LİSTE BOŞ DEĞİL, `hatalar` DOLU. Üç kaynağın (yorgunluk,
 * bütçe, aylık bütçe) her biri ayrı yakalanıyor: biri düştüğünde diğer
 * ikisinin önerileri gelmeye devam ediyor ve ekran "öneri yok" yerine
 * neyin okunamadığını söylüyor (`.catch(() => [])` bu projede yasak).
 */

/** Hesap başına en çok bu kadar AÇIK öneri; kalanı `toplam`da sayılıyor. */
export const HESAP_BASINA_ONERI = 10;

/**
 * Bu kadar günden eski veri taşıyan hesapta öneri hesaplanmıyor. Kural
 * motoru da bayat veriyle aksiyon almayı reddediyor; senkronu duran bir
 * hesapta "bütçe boşta" önerisi, aslında gelmeyen verinin yorumu olurdu.
 */
export const BAYAT_VERI_GUN = 2;

const ANAHTAR_DESENI = /^(kreatif_yorgunlugu|butce_artir|butce_azalt):(campaign|ad_group|ad):[0-9a-f-]{36}:\d{4}-W\d{2}$/;

interface HesaplananOneri {
  oneri: Oneri;
  adAccountId: string;
}

interface HesapSatiri {
  id: string;
  name: string;
  currency: string;
  platform: Platform;
}

interface KararSatiri {
  anahtar: string;
  durum: 'uygulandi' | 'yoksayildi';
  eylem: Oneri;
  sonuc: UygulamaSonucu | null;
}

export type UygulaSonucu = Oneri | { prova: true; platformDegeri: string };

@Injectable()
export class IyilestirService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly actions: CampaignActionsService,
  ) {}

  /** Bugün (UTC) — testte sabitlenebilsin diye ayrı. */
  protected bugun(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Liste ───────────────────────────────────────────────────────────────

  async liste(ctx: TenantContext, clientId: string): Promise<OneriListesi> {
    erisim(ctx, clientId);
    const bugun = this.bugun();
    const { oneriler, hatalar } = await this.hesapla(ctx, clientId, bugun);
    const kararlar = await this.kararlar(ctx, clientId, isoHafta(bugun));

    const kararHaritasi = new Map(kararlar.map((k) => [k.anahtar, k]));
    const acik: HesaplananOneri[] = [];
    const karara: Oneri[] = [];
    for (const h of oneriler) {
      // Karar verilmiş önerinin KENDİ kopyası aşağıda ekleniyor.
      if (!kararHaritasi.has(h.oneri.anahtar)) acik.push(h);
    }
    // Karar verilmiş öneri artık üretilmeyebilir (durdurulan reklam yayında
    // değil); "Uygulandı" kartı kararın sakladığı kopyadan kuruluyor.
    for (const k of kararlar) karara.push(kararliOneri(k));

    // HESAP BAŞINA KESME — sessiz değil: `toplam` kesmeden ÖNCEKİ sayı.
    acik.sort((a, b) => Number(BigInt(b.oneri.harcamaMikros) - BigInt(a.oneri.harcamaMikros)));
    const sayac = new Map<string, number>();
    const gosterilen: Oneri[] = [];
    for (const h of acik) {
      const n = sayac.get(h.adAccountId) ?? 0;
      if (n >= HESAP_BASINA_ONERI) continue;
      sayac.set(h.adAccountId, n + 1);
      gosterilen.push(h.oneri);
    }

    const buAyUygulanan = await this.prisma.withTenant(ctx, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM iyilestir_oneri_karar
         WHERE client_id = ${clientId}::uuid AND durum = 'uygulandi'
           AND created_at >= date_trunc('month', now())`);
      return r?.n ?? 0;
    });

    return {
      oneriler: [...gosterilen, ...karara],
      toplam: acik.length + karara.length,
      hatalar,
      buAyUygulanan,
    };
  }

  /**
   * Bütün öneriler, kesmesiz. Uygula ve asistan da BUNU çağırıyor: ekranda
   * görülen öneri ile uygulanan öneri aynı üreticiden geçmeli.
   */
  async hesapla(
    ctx: TenantContext,
    clientId: string,
    bugun: string,
  ): Promise<{ oneriler: HesaplananOneri[]; hatalar: string[] }> {
    erisim(ctx, clientId);
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };
    const hatalar: string[] = [];

    const temel = await this.prisma.withTenant(scoped, async (tx) => {
      const [c] = await tx.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT name FROM clients WHERE id = ${clientId}::uuid`);
      // HAVUZ SATIRLARI DIŞARIDA (client_id eşitliği) ve izlemesi kapalı
      // hesap öneriye girmiyor: panel onların verisini göstermiyor.
      const hesaplar = await tx.$queryRaw<HesapSatiri[]>(Prisma.sql`
        SELECT id::text AS id, name, currency, platform::text AS platform
          FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND sync_enabled = true`);
      const sonGunler = await tx.$queryRaw<Array<{ ad_account_id: string; son: string }>>(Prisma.sql`
        SELECT ad_account_id::text AS ad_account_id, max(date)::text AS son
          FROM insights_daily
         WHERE client_id = ${clientId}::uuid
           AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
           AND ad_account_id = ANY(${hesaplar.map((h) => h.id)}::uuid[])
           AND date >= ${gunEkle(bugun, -30)}::date
         GROUP BY ad_account_id`);
      return { clientAdi: c?.name ?? '', hesaplar, sonGunler };
    });

    // Bayat hesaplar ayıklanıyor ve SÖYLENİYOR.
    const esik = gunEkle(bugun, -1 - BAYAT_VERI_GUN);
    const bayat = new Set<string>();
    for (const s of temel.sonGunler) {
      if (s.son < esik) {
        bayat.add(s.ad_account_id);
        const ad = temel.hesaplar.find((h) => h.id === s.ad_account_id)?.name ?? s.ad_account_id;
        hatalar.push(`"${ad}" hesabının verisi ${s.son} tarihinden beri güncellenmedi; bu hesap için öneri hesaplanmadı.`);
      }
    }
    const hesaplar = temel.hesaplar.filter((h) => !bayat.has(h.id));
    const paraBirimi = new Map(hesaplar.map((h) => [h.id, h.currency]));
    const hesapIdleri = hesaplar.map((h) => h.id);
    const sonuc: HesaplananOneri[] = [];

    // ── Kreatif yorgunluğu ──
    try {
      for (const g of await this.yorgunlukGirdileri(scoped, clientId, temel.clientAdi, hesapIdleri, paraBirimi, bugun)) {
        const o = yorgunlukOnerisi(g.girdi, bugun);
        if (o) sonuc.push({ oneri: o, adAccountId: g.adAccountId });
      }
    } catch (e) {
      hatalar.push(`Kreatif yorgunluğu hesaplanamadı: ${mesaj(e)}`);
    }

    // ── Bütçe ──
    let pacing: ClientPacing | null = null;
    try {
      pacing = await this.budgets.pacing(scoped, { clientId });
    } catch (e) {
      // Aylık bütçe okunamadıysa ARTIRMA önerisi üretilmiyor (sığıp
      // sığmadığı bilinmiyor); azaltma etkilenmiyor.
      hatalar.push(`Aylık bütçe okunamadı, bütçe artırma önerisi üretilmedi: ${mesaj(e)}`);
    }
    try {
      const { girdiler, ortalamaCpa } = await this.butceGirdileri(scoped, clientId, temel.clientAdi, hesapIdleri, paraBirimi, bugun);
      for (const g of girdiler) {
        const o = butceOnerisi(g, { bugun, ortalamaCpa, kapilar: pacing ? kapilar(pacing, g) : undefined });
        if (o) sonuc.push({ oneri: o, adAccountId: g.adAccountId });
      }
    } catch (e) {
      hatalar.push(`Bütçe önerileri hesaplanamadı: ${mesaj(e)}`);
    }

    return { oneriler: sonuc, hatalar };
  }

  // ── Uygula / yoksay ─────────────────────────────────────────────────────

  /**
   * Tek uygulama yolu (panel kartı da asistanın kartı da buraya gelir).
   *
   * 1. Öneri YENİDEN hesaplanır; yoksa 409. Özet farklıysa 409: ekran
   *    açıkken bütçeyi başkası değiştirdiyse eski değerle uygulanmaz.
   * 2. `CampaignActionsService.uygula`: yazar ve GERİ OKUR.
   * 3. Karar satırı (`sonuc` = platformdan okunan değer) + denetim kaydı.
   *
   * `prova`: Google'da `validateOnly`; hiçbir şey değişmez, karar YAZILMAZ.
   */
  async uygula(
    ctx: TenantContext,
    kullaniciAdi: string,
    clientId: string,
    anahtar: string,
    ozet: string,
    secenek: { prova?: boolean } = {},
  ): Promise<UygulaSonucu> {
    const h = await this.oneriBul(ctx, clientId, anahtar);
    const o = h.oneri;
    if (!o.eylem) throw new BadRequestException(o.kisit ?? 'Bu öneri yalnız bilgi; uygulanamaz.');
    // ÖZET KAPISI. Bu satır silinirse bayat kart eski bütçeyle uygulanır
    // (iyilestir.service.spec.ts mutasyonla kilitliyor).
    if (o.ozet !== ozet) throw new ConflictException('Öneri değişti; listeyi yenileyip yeniden bak.');

    let eylem: UygulamaEylemi;
    if (o.eylem.tur === 'durdur') {
      eylem = { type: 'pause' };
    } else {
      const onceki = BigInt(o.eylem.oncekiMikros);
      const yeni = BigInt(o.eylem.yeniMikros);
      // İKİNCİ KAPI: üretici %20'yi aşmıyor ama yazma yolu üreticiye
      // güvenmiyor. Bir gün eşik değişip üretici yanlış hesaplarsa para
      // harcayan değişiklik burada duruyor.
      if (!adimSinirIcinde(onceki, yeni)) {
        throw new BadRequestException('Bütçe değişikliği tek seferde izin verilen adımı aşıyor.');
      }
      eylem = { type: 'set_budget', amountMicros: yeni, budgetMode: o.eylem.butceTipi };
    }

    const r = await this.actions.uygula(ctx, { seviye: hedefSeviyesi(o), id: o.varlik.id }, eylem, {
      validateOnly: secenek.prova === true,
    });
    if (r.prova) return { prova: true, platformDegeri: r.platformDegeri };

    const uygulama: UygulamaSonucu = {
      durum: r.dogrulama ?? 'uyusmadi',
      platformDegeri: r.platformDegeri,
      uygulayan: kullaniciAdi,
      zaman: new Date().toISOString(),
    };
    const kayit = await this.kararYaz(ctx, clientId, o, 'uygulandi', uygulama);
    return kararliOneri(kayit);
  }

  async yoksay(ctx: TenantContext, clientId: string, anahtar: string): Promise<Oneri> {
    const h = await this.oneriBul(ctx, clientId, anahtar);
    return kararliOneri(await this.kararYaz(ctx, clientId, h.oneri, 'yoksayildi', null));
  }

  private async oneriBul(ctx: TenantContext, clientId: string, anahtar: string): Promise<HesaplananOneri> {
    erisim(ctx, clientId);
    if (!ANAHTAR_DESENI.test(anahtar)) throw new BadRequestException('Geçersiz öneri anahtarı');
    const bugun = this.bugun();
    const mevcut = await this.kararlar(ctx, clientId, isoHafta(bugun), anahtar);
    if (mevcut.length > 0) throw new ConflictException('Bu öneri için karar zaten verildi.');
    const { oneriler } = await this.hesapla(ctx, clientId, bugun);
    const h = oneriler.find((x) => x.oneri.anahtar === anahtar);
    if (!h) throw new ConflictException('Öneri artık geçerli değil; listeyi yenile.');
    return h;
  }

  /**
   * Karar satırı. `org_id` MÜŞTERİDEN okunuyor, `ctx.orgId`den değil:
   * "tüm şirketler" modunda `ctx.orgId` ev şirketi kalıyor ve kompozit
   * yabancı anahtar (client_id, org_id) patlıyordu (CLAUDE.md).
   *
   * ÇAKIŞMA: aynı anda iki "Uygula" geldiyse ikisi de platforma yazmış
   * olabilir (durdurma ve aynı bütçeyi yazma tekrarlansa da zararsız);
   * ikinci kayıt açılmıyor, var olan döndürülüyor.
   */
  private async kararYaz(
    ctx: TenantContext,
    clientId: string,
    o: Oneri,
    durum: 'uygulandi' | 'yoksayildi',
    sonuc: UygulamaSonucu | null,
  ): Promise<KararSatiri> {
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };
    return this.prisma.withTenant(scoped, async (tx) => {
      const kopya: Oneri = { ...o, durum: 'acik', uygulama: null };
      const yazilan = await tx.$queryRaw<KararSatiri[]>(Prisma.sql`
        INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, sonuc, user_id)
        SELECT c.org_id, c.id, ${o.anahtar}, ${o.tur}, ${o.platform}::"Platform", ${durum},
               ${JSON.stringify(kopya)}::jsonb, ${sonuc ? JSON.stringify(sonuc) : null}::jsonb, ${ctx.userId}::uuid
          FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (client_id, anahtar) DO NOTHING
        RETURNING anahtar, durum, eylem, sonuc`);
      if (yazilan[0]) return yazilan[0];
      const [var_] = await tx.$queryRaw<KararSatiri[]>(Prisma.sql`
        SELECT anahtar, durum, eylem, sonuc FROM iyilestir_oneri_karar
         WHERE client_id = ${clientId}::uuid AND anahtar = ${o.anahtar}`);
      if (!var_) throw new ConflictException('Karar kaydedilemedi.');
      return var_;
    });
  }

  private async kararlar(ctx: TenantContext, clientId: string, hafta: string, anahtar?: string): Promise<KararSatiri[]> {
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };
    return this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<KararSatiri[]>(Prisma.sql`
        SELECT anahtar, durum, eylem, sonuc FROM iyilestir_oneri_karar
         WHERE client_id = ${clientId}::uuid
           AND anahtar LIKE ${`%:${hafta}`}
           ${anahtar ? Prisma.sql`AND anahtar = ${anahtar}` : Prisma.empty}
         ORDER BY created_at DESC`),
    );
  }

  // ── Kaynak sorguları ────────────────────────────────────────────────────

  private async yorgunlukGirdileri(
    ctx: TenantContext,
    clientId: string,
    clientAdi: string,
    hesapIdleri: string[],
    paraBirimi: Map<string, string>,
    bugun: string,
  ): Promise<Array<{ girdi: YorgunlukGirdisi; adAccountId: string }>> {
    const p = pencereler(bugun);
    const satirlar = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          ad_account_id: string;
          set_adi: string | null;
          setteki: number;
          gunler: Array<{ d: string; i: number; c: number; r: number; s: string }>;
        }>
      >(Prisma.sql`
        SELECT ad.id::text AS id, ad.name, ad.ad_account_id::text AS ad_account_id,
               ag.name AS set_adi,
               (SELECT count(*)::int FROM ads x
                 WHERE x.ad_group_id = ad.ad_group_id AND x.status = 'active'::"EntityStatus"
                   AND x.deleted_at IS NULL) AS setteki,
               json_agg(json_build_object('d', i.date::text, 'i', i.impressions, 'c', i.clicks,
                                          'r', i.reach, 's', i.spend_micros::text) ORDER BY i.date) AS gunler
          FROM ads ad
          JOIN insights_daily i
            ON i.entity_id = ad.id AND i.entity_level = 'ad'::"EntityLevel" AND i.breakdown_key = ''
           AND i.client_id = ${clientId}::uuid
           AND i.date BETWEEN ${p.gecenBas}::date AND ${p.buSon}::date
          LEFT JOIN ad_groups ag ON ag.id = ad.ad_group_id
         WHERE ad.client_id = ${clientId}::uuid AND ad.platform = 'meta'::"Platform"
           AND ad.status = 'active'::"EntityStatus" AND ad.deleted_at IS NULL
           AND ad.ad_account_id = ANY(${hesapIdleri}::uuid[])
         GROUP BY ad.id, ad.name, ad.ad_account_id, ad.ad_group_id, ag.name
        HAVING sum(i.impressions) >= ${YORGUNLUK_ON_SUZGEC}::int`),
    );
    return satirlar.map((r) => ({
      adAccountId: r.ad_account_id,
      girdi: {
        clientId,
        clientAdi,
        adId: r.id,
        adAdi: r.name,
        setAdi: r.set_adi,
        platform: 'meta' as const,
        paraBirimi: paraBirimi.get(r.ad_account_id) ?? '',
        setteYayindaki: r.setteki,
        gunler: r.gunler.map((g) => ({ gun: g.d, gosterim: g.i, tiklama: g.c, erisim: g.r, harcamaMikros: BigInt(g.s) })),
      },
    }));
  }

  /**
   * Bütçenin GERÇEKTEN durduğu seviye: kampanyanın günlük bütçesi varsa
   * kampanya (Meta CBO, Google), yoksa reklam seti (Meta ABO). İkisi de
   * yoksa (toplam bütçe ya da bilinmiyor) varlık bu sorguya HİÇ girmiyor:
   * tahmin etmektense kısıtla.
   */
  private async butceGirdileri(
    ctx: TenantContext,
    clientId: string,
    clientAdi: string,
    hesapIdleri: string[],
    paraBirimi: Map<string, string>,
    bugun: string,
  ): Promise<{ girdiler: ButceGirdisi[]; ortalamaCpa: Map<string, bigint> }> {
    const p = pencereler(bugun);
    const otuz = gunEkle(bugun, -30);
    return this.prisma.withTenant(ctx, async (tx) => {
      const satirlar = await tx.$queryRaw<
        Array<{
          seviye: 'campaign' | 'ad_group';
          id: string;
          name: string;
          ust_ad: string | null;
          platform: Platform;
          ad_account_id: string;
          butce: string;
          butce_kaynagi: string | null;
          ilk: string | null;
          gunler: Array<{ d: string; s: string; v: number }> | null;
        }>
      >(Prisma.sql`
        WITH varliklar AS (
          SELECT 'campaign'::text AS seviye, c.id, c.name, NULL::text AS ust_ad, c.platform,
                 c.ad_account_id, c.budget_amount_micros, c.raw -> 'campaignBudget' ->> 'resourceName' AS butce_kaynagi
            FROM campaigns c
           WHERE c.client_id = ${clientId}::uuid AND c.deleted_at IS NULL
             AND c.status = 'active'::"EntityStatus"
             AND c.platform IN ('meta'::"Platform", 'google'::"Platform")
             AND c.budget_mode = 'daily'::"BudgetMode" AND c.budget_amount_micros > 0
             AND c.ad_account_id = ANY(${hesapIdleri}::uuid[])
          UNION ALL
          SELECT 'ad_group'::text, g.id, g.name, c.name, g.platform,
                 g.ad_account_id, g.budget_amount_micros, NULL::text
            FROM ad_groups g
            JOIN campaigns c ON c.id = g.campaign_id
           WHERE g.client_id = ${clientId}::uuid AND g.deleted_at IS NULL
             AND g.status = 'active'::"EntityStatus" AND c.status = 'active'::"EntityStatus"
             AND g.platform = 'meta'::"Platform"
             AND c.budget_mode = 'none'::"BudgetMode"
             AND g.budget_mode = 'daily'::"BudgetMode" AND g.budget_amount_micros > 0
             AND g.ad_account_id = ANY(${hesapIdleri}::uuid[])
        )
        SELECT v.seviye, v.id::text AS id, v.name, v.ust_ad, v.platform::text AS platform,
               v.ad_account_id::text AS ad_account_id, v.budget_amount_micros::text AS butce,
               v.butce_kaynagi,
               (SELECT min(i.date)::text FROM insights_daily i
                 WHERE i.client_id = ${clientId}::uuid AND i.entity_id = v.id AND i.breakdown_key = ''
                   AND i.entity_level = v.seviye::"EntityLevel" AND i.date >= ${otuz}::date) AS ilk,
               (SELECT json_agg(json_build_object('d', i.date::text, 's', i.spend_micros::text,
                                                  'v', i.conversions::float8) ORDER BY i.date)
                  FROM insights_daily i
                 WHERE i.client_id = ${clientId}::uuid AND i.entity_id = v.id AND i.breakdown_key = ''
                   AND i.entity_level = v.seviye::"EntityLevel"
                   AND i.date BETWEEN ${p.buBas}::date AND ${p.buSon}::date) AS gunler
          FROM varliklar v`);

      /*
       * PAYLAŞIMLI GOOGLE BÜTÇESİ: yapı taraması kaynak adını `raw` içinde
       * saklıyor; aynı kaynağa bağlı birden çok kampanya = paylaşımlı.
       * Duraklatılmış kampanyalar da sayılıyor: onlar da aynı bütçeye bağlı.
       * Kaynak adı yoksa bilinmiyor; o hâlde yazma yolu (`google.provider`)
       * yazmadan önce bayrağı platformdan okuyup reddediyor.
       */
      const paylasimli = await tx.$queryRaw<Array<{ k: string }>>(Prisma.sql`
        SELECT raw -> 'campaignBudget' ->> 'resourceName' AS k
          FROM campaigns
         WHERE client_id = ${clientId}::uuid AND platform = 'google'::"Platform" AND deleted_at IS NULL
           AND raw -> 'campaignBudget' ->> 'resourceName' IS NOT NULL
         GROUP BY 1 HAVING count(*) > 1`);
      const paylasimliKaynaklar = new Set(paylasimli.map((r) => r.k));

      /*
       * WORKSPACE ORTALAMASI PARA BİRİMİ BAŞINA: farklı para birimlerini
       * toplamak anlamsız bir sayı üretir. Kampanya seviyesi, kırılımsız.
       */
      const ort = await tx.$queryRaw<Array<{ currency: string; harcama: string; donusum: number }>>(Prisma.sql`
        SELECT currency, sum(spend_micros)::text AS harcama, sum(conversions)::float8 AS donusum
          FROM insights_daily
         WHERE client_id = ${clientId}::uuid AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
           AND ad_account_id = ANY(${hesapIdleri}::uuid[])
           AND date BETWEEN ${p.buBas}::date AND ${p.buSon}::date
         GROUP BY currency`);
      const ortalamaCpa = new Map<string, bigint>();
      for (const r of ort) {
        if (r.donusum > 0) ortalamaCpa.set(r.currency.trim(), (BigInt(r.harcama) * 10_000n) / BigInt(Math.round(r.donusum * 10_000)));
      }

      const girdiler: ButceGirdisi[] = satirlar.map((r) => ({
        clientId,
        clientAdi,
        seviye: r.seviye,
        id: r.id,
        ad: r.name,
        ustAd: r.ust_ad,
        platform: r.platform,
        adAccountId: r.ad_account_id,
        paraBirimi: paraBirimi.get(r.ad_account_id) ?? '',
        gunlukButceMikros: BigInt(r.butce),
        gunler: (r.gunler ?? []).map((g) => ({ gun: g.d, harcamaMikros: BigInt(g.s), donusum: g.v })),
        ilkVeriGunu: r.ilk,
        paylasimliButce: r.butce_kaynagi !== null && paylasimliKaynaklar.has(r.butce_kaynagi),
      }));
      return { girdiler, ortalamaCpa };
    });
  }
}

/**
 * SQL ön süzgeci: iki haftanın toplamı en az iki eşik. Asıl kural (iki
 * haftanın HER BİRİ eşiğin üstünde) saf fonksiyonda; burası yalnız satır
 * sayısını küçültüyor ve kuraldan GEVŞEK olmak zorunda.
 */
const YORGUNLUK_ON_SUZGEC = 2000;

/**
 * Bir varlığın aylık bütçe kapıları. Bütçe tanımlı ama PARA BİRİMİ farklıysa
 * sığıp sığmadığı hesaplanamıyor → `undefined` (artırma önerisi yok).
 */
export function kapilar(pacing: ClientPacing, g: ButceGirdisi): AylikButceKapisi[] | undefined {
  const out: AylikButceKapisi[] = [];
  const hesap = pacing.accounts.find((a) => a.adAccountId === g.adAccountId);
  if (hesap?.budget) {
    if (hesap.budget.currency !== g.paraBirimi) return undefined;
    out.push({
      etiket: 'Hesabın ay sonu tahmini',
      projeksiyonMikros: BigInt(hesap.projectedMicros ?? hesap.spentMicros),
      butceMikros: BigInt(hesap.budget.amountMicros),
      kalanGun: hesap.daysRemaining,
    });
  }
  const genel = pacing.overall;
  if (genel.budget) {
    if (genel.budget.currency !== g.paraBirimi) return undefined;
    out.push({
      etiket: 'Workspace ay sonu tahmini',
      projeksiyonMikros: BigInt(genel.projectedMicros ?? genel.spentMicros),
      butceMikros: BigInt(genel.budget.amountMicros),
      kalanGun: genel.daysRemaining,
    });
  }
  return out;
}

function kararliOneri(k: KararSatiri): Oneri {
  return { ...k.eylem, durum: k.durum, uygulama: k.sonuc };
}

/** Bütçe önerisi bütçenin durduğu seviyeyi hedefliyor; durdurma reklamı. */
function hedefSeviyesi(o: Oneri): 'campaign' | 'ad_group' | 'ad' {
  if (o.eylem?.tur === 'butce') return o.eylem.butceSeviyesi;
  return o.varlik.seviye;
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
