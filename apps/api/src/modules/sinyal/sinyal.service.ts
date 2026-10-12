import { utmEtiketiAcik } from '../reklam/utm-etiketi';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ANOMALI,
  SAGLIK,
  SAGLIK_DISARIDA,
  SAGLIK_KOSULLU_DISARIDA,
  type SaglikDisaridaKodu,
  SINYAL_DURUMLARI,
  SINYAL_KAPALI_DURUMLARI,
  SINYAL_SAYFA_BOYUTU,
  sinyalGecisi,
  type HesapSinyalDurumu,
  type HesapSinyalOzeti,
  type Platform,
  type Sinyal,
  type SinyalBosNedeni,
  type SinyalDurumu,
  type SinyalListeSorgusu,
  type SinyalListesi,
  type SinyalUygulamaSonucu,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignActionsService } from '../campaign-actions/campaign-actions.service';
import { ON_KOSUL_NOTU, gunEkle } from './sinyal-hesap';
import { satirdanSinyal, type SinyalSatiri } from './sinyal-metni';

/**
 * ═══ SİNYALLER — OKUMA VE KULLANICI GEÇİŞLERİ (MIMARI § 3-4) ═══
 *
 * Bütün okumalar `withTenant` (RLS) altında, kapsam `client_id = ANY(...)`
 * dizisiyle (CLAUDE.md: alt sorgu değil dizi, ölçülerek). PLATFORM ÇAĞRISI
 * YALNIZ Uygula'da ve transaction DIŞINDA (`CampaignActionsService.uygula`
 * kendi kısa transaction'larını açıyor).
 *
 * KAYNAK DÜŞERSE LİSTE BOŞ DEĞİL `hatalar` DOLU: sinyal listesi ile hesap
 * durumları ayrı soruluyor; biri düşerse diğeri yine dönüyor.
 */

/** Sinyal satırının seçimi — liste, tek sinyal ve geçiş sonrası okuma AYNI. */
const SINYAL_SECIMI = Prisma.sql`
  SELECT s.id::text AS id, s.anahtar, s.tur, s.kod, s.yon, s.platform::text AS platform,
         s.client_id::text AS client_id, cl.name AS client_adi,
         s.ad_account_id::text AS ad_account_id, a.name AS hesap_adi,
         s.seviye::text AS seviye, s.varlik_id::text AS varlik_id, s.varlik_adi, s.ust_adi,
         s.gun::text AS gun, s.gozlenen::float8 AS gozlenen, s.beklenen_alt::float8 AS beklenen_alt,
         s.beklenen_orta::float8 AS beklenen_orta, s.beklenen_ust::float8 AS beklenen_ust,
         s.nokta::int AS nokta, s.onem, s.para_birimi, s.kanit, s.durum,
         s.ilk_gorulme, s.son_gorulme, s.son_acilma, s.acilma_sayisi,
         s.kapatma_nedeni, u.full_name AS kapatan_adi, s.kapatma_zamani, s.kapatma_notu,
         CASE s.seviye::text
           WHEN 'campaign' THEN (SELECT k.objective FROM campaigns k WHERE k.id = s.varlik_id)
           WHEN 'ad_group' THEN (SELECT k.objective FROM ad_groups g JOIN campaigns k ON k.id = g.campaign_id
                                  WHERE g.id = s.varlik_id)
           WHEN 'ad' THEN (SELECT k.objective FROM ads x JOIN ad_groups g ON g.id = x.ad_group_id
                             JOIN campaigns k ON k.id = g.campaign_id WHERE x.id = s.varlik_id)
           ELSE NULL END AS kampanya_kanali
    FROM sinyaller s
    LEFT JOIN clients cl ON cl.id = s.client_id
    LEFT JOIN ad_accounts a ON a.id = s.ad_account_id
    LEFT JOIN users u ON u.id = s.kapatan_user_id`;

export interface HesapDurumSatiri {
  id: string;
  name: string;
  platform: Platform;
  last_insights_sync_at: Date | string | null;
  son_durum: string | null;
  son_not: string | null;
  son_hata: string | null;
  son_hesaplama: Date | string | null;
  ilk_veri: string | null;
}

@Injectable()
export class SinyalService {
  private readonly logger = new Logger(SinyalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actions: CampaignActionsService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async liste(ctx: TenantContext, sorgu: SinyalListeSorgusu, simdi = new Date()): Promise<SinyalListesi> {
    if (sorgu.clientId && !ctx.clientIds.includes(sorgu.clientId)) {
      throw new ForbiddenException('Bu workspace’e erişimin yok');
    }
    const kapsam = sorgu.clientId ? [sorgu.clientId] : [...ctx.clientIds];
    // Seçili workspace görüş alanını daraltıyor; "tüm workspace'ler" istenince
    // bağlamdaki eski seçim yanıtı tek workspace'e indirmesin.
    const scoped: TenantContext = { ...ctx, activeClientId: sorgu.clientId ?? null };
    const sessizKosum = this.config.sinyal.sessizKosum;
    const sayilar = Object.fromEntries(SINYAL_DURUMLARI.map((d) => [d, 0])) as Record<SinyalDurumu, number>;
    const hatalar: SinyalListesi['hatalar'] = [];
    // Ö-2: Meta etiketi kapalıyken `utm_eksik` Meta'da koşmuyor; SÖYLENİR.
    const kontrolEdilmeyen: SaglikDisaridaKodu[] = [
      ...SAGLIK_DISARIDA.map((d) => d.kod),
      ...(utmEtiketiAcik() ? [] : SAGLIK_KOSULLU_DISARIDA.map((d) => d.kod)),
    ];
    const uretildi = simdi.toISOString();

    let hesaplar: HesapSinyalOzeti[] = [];
    try {
      hesaplar = kapsam.length > 0 ? await this.hesapDurumlari(scoped, kapsam, simdi) : [];
    } catch (e) {
      this.logger.error(`sinyaller: hesap durumları okunamadı: ${mesaj(e)}`);
      hatalar.push({ kaynak: 'hesap_durumlari', mesaj: 'Hesapların hesaplama durumu okunamadı.' });
    }

    /*
     * SESSİZ KOŞUM: sinyaller yalnız org yöneticisine. Diğer kullanıcıya
     * boş liste + bayrak; `emptyReason` BİLEREK null: "sinyal yok" demek
     * yalan olurdu, panel önce `sessizKosum`a bakıyor (sözleşme notu).
     */
    if (sessizKosum && !ctx.isOrgAdmin) {
      return { sinyaller: [], toplam: 0, sayilar, emptyReason: null, hesaplar, kontrolEdilmeyen, hatalar, sessizKosum, uretildi };
    }

    let sinyaller: Sinyal[] = [];
    let toplam = 0;
    let suzgecsizAcik = 0;
    if (kapsam.length > 0) {
      try {
        const sonuc = await this.prisma.withTenant(scoped, async (tx) => {
          const durumKosulu =
            sorgu.durum === 'acik'
              ? Prisma.sql`s.durum = 'acik'`
              : Prisma.sql`s.durum = ANY(${[...SINYAL_KAPALI_DURUMLARI]}::text[])`;
          const kosul = Prisma.sql`s.client_id = ANY(${kapsam}::uuid[]) AND ${durumKosulu}
            ${sorgu.tur ? Prisma.sql`AND s.tur = ${sorgu.tur}` : Prisma.empty}
            ${sorgu.platform ? Prisma.sql`AND s.platform = ${sorgu.platform}::"Platform"` : Prisma.empty}`;
          const [t] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
            SELECT count(*)::int AS n FROM sinyaller s WHERE ${kosul}`);
          const satirlar = await tx.$queryRaw<SinyalSatiri[]>(Prisma.sql`
            ${SINYAL_SECIMI}
            WHERE ${kosul}
            ORDER BY (s.onem = 'yuksek') DESC, s.son_acilma DESC, s.id
            LIMIT ${SINYAL_SAYFA_BOYUTU}::int OFFSET ${(sorgu.sayfa - 1) * SINYAL_SAYFA_BOYUTU}::int`);
          const durumlar = await tx.$queryRaw<Array<{ durum: SinyalDurumu; n: number }>>(Prisma.sql`
            SELECT durum, count(*)::int AS n FROM sinyaller
             WHERE client_id = ANY(${kapsam}::uuid[]) GROUP BY durum`);
          return { toplam: t?.n ?? 0, satirlar, durumlar };
        });
        toplam = sonuc.toplam;
        sinyaller = sonuc.satirlar.map(satirdanSinyal);
        for (const d of sonuc.durumlar) if (d.durum in sayilar) sayilar[d.durum] = Number(d.n);
        suzgecsizAcik = sayilar.acik;
      } catch (e) {
        this.logger.error(`sinyaller: liste okunamadı: ${mesaj(e)}`);
        hatalar.push({ kaynak: 'sinyaller', mesaj: 'Sinyaller okunamadı.' });
        return { sinyaller: [], toplam: 0, sayilar, emptyReason: null, hesaplar, kontrolEdilmeyen, hatalar, sessizKosum, uretildi };
      }
    }

    const suzgecli = sorgu.durum !== 'acik' || sorgu.tur !== undefined || sorgu.platform !== undefined;
    return {
      sinyaller,
      toplam,
      sayilar,
      emptyReason:
        sinyaller.length > 0 ? null : bosNeden({ hesaplar, suzgecli, suzgecsizAcik, hesapOkunamadi: hatalar.length > 0 }),
      hesaplar,
      kontrolEdilmeyen,
      hatalar,
      sessizKosum,
      uretildi,
    };
  }

  async tek(ctx: TenantContext, id: string): Promise<Sinyal> {
    return satirdanSinyal(await this.satir(ctx, id));
  }

  private async satir(ctx: TenantContext, id: string): Promise<SinyalSatiri> {
    const [r] = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) =>
      tx.$queryRaw<SinyalSatiri[]>(Prisma.sql`${SINYAL_SECIMI} WHERE s.id = ${id}::uuid`),
    );
    if (!r || !ctx.clientIds.includes(r.client_id)) throw new NotFoundException('Sinyal bulunamadı');
    if (this.config.sinyal.sessizKosum && !ctx.isOrgAdmin) throw new NotFoundException('Sinyal bulunamadı');
    return r;
  }

  /**
   * Kullanıcı kapatır. GEÇİŞ TABLODAN (`sinyalGecisi`) ve UPDATE okunan
   * duruma KOŞULLU: arada iş sinyali kendiliğinden kapattıysa ya da başka
   * biri kapattıysa sıfır satır etkilenir ve 409 döner (sessiz başarı yok).
   */
  async kapat(ctx: TenantContext, id: string, not: string | undefined): Promise<Sinyal> {
    const r = await this.satir(ctx, id);
    if (sinyalGecisi(r.durum, 'kullanici_kapatti') === null) throw new ConflictException('Sinyal zaten kapalı; listeyi yenile.');
    const scoped: TenantContext = { ...ctx, activeClientId: r.client_id };
    const n = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE sinyaller SET durum = 'kapatildi', kapatma_nedeni = 'kullanici', kapatma_z = z,
               kapatan_user_id = ${ctx.userId}::uuid, kapatma_zamani = now(),
               kapatma_notu = ${not ?? null}, updated_at = now()
         WHERE id = ${id}::uuid AND durum = ${r.durum}`),
    );
    if (n === 0) throw new ConflictException('Sinyal değişti; listeyi yenile.');
    return this.tek(ctx, id);
  }

  /**
   * Kapatılanı geri açar. `son_acilma` DEĞİŞMİYOR: kullanıcının kendi
   * geri aldığı sinyal ertesi sabahın özetine "yeni" diye düşmesin.
   * Kendiliğinden kapanmış sinyal geri açılamaz (tablo `null`): olay bitmiş,
   * yeniden görülürse iş zaten açacak.
   */
  async geriAc(ctx: TenantContext, id: string): Promise<Sinyal> {
    const r = await this.satir(ctx, id);
    if (sinyalGecisi(r.durum, 'kullanici_geri_acti') === null) {
      throw new ConflictException(
        r.durum === 'acik' ? 'Sinyal zaten açık.' : 'Kendiliğinden kapanan sinyal geri açılamaz; koşul yeniden görülürse kendisi açılır.',
      );
    }
    const scoped: TenantContext = { ...ctx, activeClientId: r.client_id };
    const n = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE sinyaller SET durum = 'acik', kapatma_nedeni = NULL, kapatma_z = NULL, kapatan_user_id = NULL,
               kapatma_zamani = NULL, kapatma_notu = NULL, updated_at = now()
         WHERE id = ${id}::uuid AND durum = ${r.durum}`),
    );
    if (n === 0) throw new ConflictException('Sinyal değişti; listeyi yenile.');
    return this.tek(ctx, id);
  }

  /**
   * UYGULA: varlığı durdurur (Reklam Yöneticisi satır içi durdurunun AYNI
   * yolu, geri okumalı), doğrulanırsa sinyali `uygulandi` ile kapatır.
   *
   * 1. Satır yeniden okunur; açık değilse ya da ÖZET uymuyorsa 409, platforma
   *    gidilmeden. Ekran açıkken kapanmış bir sinyalin kampanyasını durdurmak
   *    istenmeyen bir eylem.
   * 2. Eylem yalnız `durdur` (bütçe yolu İyileştir'de, korumalarıyla).
   * 3. Geri okuma UYUŞMAZSA sinyal AÇIK kalır ve sonuç `uygulama`ya yazılır:
   *    "durdurdum" demek doğrulanmamış bir iddia olurdu.
   */
  async uygula(ctx: TenantContext, kullaniciAdi: string, id: string, ozet: string): Promise<SinyalUygulamaSonucu> {
    const s = await this.tek(ctx, id);
    if (s.durum !== 'acik') throw new ConflictException('Sinyal artık açık değil; listeyi yenile.');
    // ÖZET KAPISI platform çağrısından ÖNCE (kaynak taramasıyla kilitli).
    if (s.ozet !== ozet) throw new ConflictException('Sinyal değişti; listeyi yenile.');
    if (!s.eylem || s.eylem.tur !== 'durdur') {
      throw new BadRequestException(s.kisit ?? 'Bu sinyalin uygulanacak bir eylemi yok.');
    }
    const scoped: TenantContext = { ...ctx, activeClientId: s.clientId };
    // İZ (Paket C): etki ekranı bu durdurmayı "Sinyal" diye yazıyor.
    const r = await this.actions.uygula(scoped, { seviye: s.eylem.seviye, id: s.eylem.varlikId }, { type: 'pause' }, {
      iz: { yol: 'sinyal', ref: id },
    });
    const dogrulama = r.dogrulama ?? 'uyusmadi';
    const uygulama = { dogrulama, platformDegeri: r.platformDegeri, uygulayan: kullaniciAdi, zaman: new Date().toISOString() };

    await this.prisma.withTenant(scoped, async (tx) => {
      if (dogrulama === 'dogrulandi') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE sinyaller SET durum = 'kapatildi', kapatma_nedeni = 'uygulandi', kapatma_z = z,
                 kapatan_user_id = ${ctx.userId}::uuid, kapatma_zamani = now(),
                 uygulama = ${JSON.stringify(uygulama)}::jsonb, updated_at = now()
           WHERE id = ${id}::uuid AND durum = 'acik'`);
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE sinyaller SET uygulama = ${JSON.stringify(uygulama)}::jsonb, updated_at = now()
           WHERE id = ${id}::uuid`);
      }
      await this.audit.record(tx as never, scoped, {
        action: 'sinyal.uygula',
        targetType: 'sinyal',
        targetId: id,
        clientId: s.clientId,
        after: uygulama,
      });
    });
    return { dogrulama, platformDegeri: r.platformDegeri, sinyal: await this.tek(ctx, id) };
  }

  /** Hesap başına hesaplama durumu (boş listenin NEDENİ buradan). */
  private async hesapDurumlari(ctx: TenantContext, kapsam: string[], simdi: Date): Promise<HesapSinyalOzeti[]> {
    const altSinir = gunEkle(simdi.toISOString().slice(0, 10), -60);
    const satirlar = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<HesapDurumSatiri[]>(Prisma.sql`
        SELECT a.id::text AS id, a.name, a.platform::text AS platform, a.last_insights_sync_at,
               j.status::text AS son_durum, j.note AS son_not, j.error_message AS son_hata,
               (SELECT max(x.finished_at) FROM sync_jobs x
                 WHERE x.ad_account_id = a.id AND x.job_type = 'signals_evaluate'::"SyncJobType"
                   AND x.status = 'succeeded'::"SyncJobStatus"
                   AND (x.note IS NULL OR x.note NOT LIKE ${`${ON_KOSUL_NOTU}%`})) AS son_hesaplama,
               (SELECT min(i.date)::text FROM insights_daily i
                 WHERE i.client_id = a.client_id AND i.ad_account_id = a.id AND i.breakdown_key = ''
                   AND i.entity_level = 'campaign'::"EntityLevel" AND i.date >= ${altSinir}::date) AS ilk_veri
          FROM ad_accounts a
          LEFT JOIN LATERAL (
            SELECT y.status, y.note, y.error_message FROM sync_jobs y
             WHERE y.ad_account_id = a.id AND y.job_type = 'signals_evaluate'::"SyncJobType"
             ORDER BY y.created_at DESC LIMIT 1
          ) j ON true
         WHERE a.client_id = ANY(${kapsam}::uuid[]) AND a.sync_enabled = true
         ORDER BY a.name`),
    );
    return satirlar.map((r) => hesapOzeti(r, simdi));
  }
}

/** Satır → hesap özeti. Sıra: bayat veri, hiç koşmadı, düştü, geçmiş yetersiz, hesaplandı. */
export function hesapOzeti(r: HesapDurumSatiri, simdi: Date): HesapSinyalOzeti {
  const bugun = simdi.toISOString().slice(0, 10);
  const gecmisHafta = r.ilk_veri
    ? Math.min(ANOMALI.gecmisHafta, Math.floor((Date.parse(`${bugun}T00:00:00Z`) - Date.parse(`${r.ilk_veri}T00:00:00Z`)) / (7 * 86_400_000)))
    : 0;
  const sonCekim = r.last_insights_sync_at ? new Date(r.last_insights_sync_at).getTime() : null;
  let durum: HesapSinyalDurumu;
  if (sonCekim === null || simdi.getTime() - sonCekim > SAGLIK.veriTazelikSaat * 3_600_000) durum = 'veri_bayat';
  else if (r.son_durum === 'failed') durum = 'hesaplama_dustu';
  else if (r.son_hesaplama === null) durum = 'hic_hesaplanmadi';
  else if (gecmisHafta < ANOMALI.enAzGecmisNokta) durum = 'gecmis_yetersiz';
  else durum = 'hesaplandi';
  return {
    adAccountId: r.id,
    adAccountAdi: r.name,
    platform: r.platform,
    durum,
    sonHesaplama: r.son_hesaplama ? new Date(r.son_hesaplama).toISOString() : null,
    gecmisHafta,
    not: r.son_hata ?? r.son_not ?? null,
  };
}

/** Boş liste NEDENİ (`emptyReason` deseni). */
export function bosNeden(p: {
  hesaplar: HesapSinyalOzeti[];
  suzgecli: boolean;
  suzgecsizAcik: number;
  hesapOkunamadi: boolean;
}): SinyalBosNedeni | null {
  if (p.suzgecli && p.suzgecsizAcik > 0) return 'suzgec_bos';
  if (p.hesapOkunamadi) return null;
  if (p.hesaplar.length === 0) return 'hesap_yok';
  const hesaplanan = p.hesaplar.filter((h) => h.sonHesaplama !== null);
  if (hesaplanan.length === 0) return 'hesaplanmadi';
  if (hesaplanan.every((h) => h.durum === 'gecmis_yetersiz')) return 'gecmis_yetersiz';
  return p.suzgecli ? 'suzgec_bos' : 'sinyal_yok';
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
