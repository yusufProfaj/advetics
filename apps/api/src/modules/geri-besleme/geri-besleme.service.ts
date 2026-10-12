import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GERI_BESLEME_AYAR_DURUM_ADI,
  GERI_BESLEME_OLAY_DURUMLARI,
  GERI_BESLEME_ULASAN_DURUMLAR,
  geriBeslemeAyarDurumu,
  geriBeslemeGecisi,
  metaPenceredeMi,
  metaUygunlukEksikleri,
  type GeriBeslemeAsamasi,
  type GeriBeslemeAyarGirdisi,
  type GeriBeslemeAyari,
  type GeriBeslemeBosNedeni,
  type GeriBeslemeDatasetSecenegi,
  type GeriBeslemeOlayDurumu,
  type GeriBeslemeOlayListeSorgusu,
  type GeriBeslemeOlaylariYaniti,
  type GeriBeslemeYenidenDeneGirdisi,
  type GeriBeslemeYenidenDeneSonucu,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { AuditService } from '../audit/audit.service';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { actPath, type MetaPikselSatiri } from '../connections/providers/meta.provider';
import { TokenVaultService } from '../connections/token-vault.service';
import { acilisGeriDoldurma, GB_PLATFORM, kapanisIptal } from './lead-asama';
import { MetaCrmIstemcisi } from './meta-crm-istemcisi';

/**
 * ═══ GERİ BESLEME — AYAR VE GÖNDERİM GEÇMİŞİ (MIMARI § 3) ═══
 *
 * Uçlar `shared/geri-besleme/uclar.ts` ile BİREBİR. PLATFORM ÇAĞRISI üç
 * yerde ve üçü de TRANSACTION DIŞINDA: piksel listesi (seçenekler, kaydetmede
 * veri kümesi doğrulaması) ve veri kümesi kontrolü. Gönderimin kendisi
 * worker'da (`geri-besleme-gonderim.service.ts`).
 *
 * KAPSAM: worker değil kullanıcı yolu, yani her şey `withTenant` (RLS)
 * altında ve `clientId` ayrıca bağlamla karşılaştırılıyor; RLS boş sonuç
 * döndürür, 403 döndürmez ve "ayar kapalı" ile "erişimin yok" aynı ekran
 * olurdu.
 */

/** PUT cevabı: ayarın son hâli + açılış/kapanışın sayıları (MIMARI § 3). */
export interface GeriBeslemeAyarYaniti extends GeriBeslemeAyari {
  /**
   * Bu kayıtla ne oldu. `null` = açık/kapalı değişmedi. Sayılar sessiz
   * değil: "412 eski kayıt gönderilemez" ekranda yazıyor (Ç-13).
   */
  degisim: {
    kuyruga: number;
    eskiOlduguIcinAtlanan: number;
    iptalEdilen: number;
  } | null;
}

interface AyarSatiri {
  org_id: string;
  etkin: boolean;
  dataset_id: string | null;
  dataset_adi: string | null;
  baglanti_id: string | null;
  baglanti_durumu: string | null;
  dataset_crm: boolean | null;
  aydinlatma_zamani: Date | null;
  etkinlestiren_adi: string | null;
  etkinlestirme_zamani: Date | null;
  son_ayar_hatasi: string | null;
  son_basarili_gonderim: Date | null;
}

const AYAR_SECIMI = (clientId: string) => Prisma.sql`
  SELECT a.org_id::text AS org_id, a.etkin, a.dataset_id, a.dataset_adi,
         a.baglanti_id::text AS baglanti_id, pc.status::text AS baglanti_durumu,
         a.dataset_crm, a.aydinlatma_zamani, u.full_name AS etkinlestiren_adi,
         a.etkinlestirme_zamani, a.son_ayar_hatasi, a.son_basarili_gonderim
    FROM geri_besleme_ayarlari a
    -- LEFT JOIN: bağlantı ya da kullanıcı RLS altında görünmese bile ayar
    -- satırı SÜZÜLMEMELİ (CLAUDE.md "RLS'li tabloya INNER JOIN").
    LEFT JOIN platform_connections pc ON pc.id = a.baglanti_id
    LEFT JOIN users u ON u.id = a.etkinlestiren
   WHERE a.client_id = ${clientId}::uuid AND a.platform = ${GB_PLATFORM}
`;

const ISTANBUL = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

@Injectable()
export class GeriBeslemeService {
  private readonly logger = new Logger(GeriBeslemeService.name);
  /** Testte sahte cevap için değiştirilebiliyor. */
  istemci = new MetaCrmIstemcisi();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly kuyruk: SyncQueueService,
  ) {}

  private erisim(ctx: TenantContext, clientId: string): void {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET /geri-besleme/ayar
  // ───────────────────────────────────────────────────────────────────────

  /**
   * `secenekler: false` (varsayılan) Meta'ya GİTMİYOR: Potansiyel Müşteriler
   * her yüklendiğinde şerit için ayarı okuyor ve her sayfa yüklemesinde
   * piksel listesi çekmek kota harcardı. Seçenekleri yalnız ayar penceresi
   * istiyor; istenmediğinde `secenekNotu` bunu AÇIKÇA söylüyor (boş liste
   * "piksel yok" sanılmasın).
   */
  async ayar(ctx: TenantContext, clientId: string, secenekler = false, simdi = new Date()): Promise<GeriBeslemeAyari> {
    this.erisim(ctx, clientId);
    const okunan = secenekler ? await this.pikselSecenekleri(ctx, clientId) : null;
    return this.prisma.withTenant(ctx, async (tx) => {
      const [a] = await tx.$queryRaw<AyarSatiri[]>(AYAR_SECIMI(clientId));
      const sayilar = await this.sayilar(tx, clientId);
      const uygunluk = await this.uygunluk(tx, clientId, a ?? null, simdi);
      const [hazirlik] = await tx.$queryRaw<Array<{ piksel_id: string | null }>>(Prisma.sql`
        SELECT piksel_id FROM workspace_hazirlama WHERE client_id = ${clientId}::uuid
      `);

      let liste: GeriBeslemeDatasetSecenegi[] = [];
      let secenekNotu: string | null = 'Seçenekler bu istekte okunmadı.';
      if (okunan) {
        liste = okunan.satirlar.map((p) => ({ id: p.id, ad: p.ad, varsayilan: false, crm: null }));
        secenekNotu = okunan.not;
        /*
         * HAZIRLIĞIN PİKSELİ ve KAYITLI VERİ KÜMESİ listede yoksa da gösteriliyor:
         * liste okunamadıysa seçici boş kalıp kayıtlı seçimi "yok" gibi
         * göstermesin. Adı bilinmiyorsa kimliğiyle; tahmin yok.
         */
        for (const ek of [hazirlik?.piksel_id ?? null, a?.dataset_id ?? null]) {
          if (ek && !liste.some((p) => p.id === ek)) {
            liste.push({ id: ek, ad: ek === a?.dataset_id && a?.dataset_adi ? a.dataset_adi : `Piksel ${ek}`, varsayilan: false, crm: null });
          }
        }
        for (const p of liste) {
          p.varsayilan = p.id === hazirlik?.piksel_id;
          if (p.id === a?.dataset_id) p.crm = a?.dataset_crm ?? null;
        }
      }
      return this.ayarYanitiKur(clientId, a ?? null, sayilar, uygunluk, liste, secenekNotu);
    });
  }

  private ayarYanitiKur(
    clientId: string,
    a: AyarSatiri | null,
    sayilar: Record<GeriBeslemeOlayDurumu, number>,
    uygunlukEksikleri: GeriBeslemeAyari['uygunlukEksikleri'],
    secenekler: GeriBeslemeDatasetSecenegi[],
    secenekNotu: string | null,
  ): GeriBeslemeAyari {
    const baglantiGecerli = a?.baglanti_durumu === 'active';
    const durum = geriBeslemeAyarDurumu({
      etkin: a?.etkin === true,
      datasetId: a?.dataset_id ?? null,
      baglantiGecerli,
      sonAyarHatasi: a?.son_ayar_hatasi ?? null,
      sonBasariliGonderim: a?.son_basarili_gonderim ? new Date(a.son_basarili_gonderim).toISOString() : null,
    });
    return {
      clientId,
      platform: 'meta',
      etkin: a?.etkin === true,
      datasetId: a?.dataset_id ?? null,
      datasetAdi: a?.dataset_adi ?? null,
      durum,
      neden: ayarNedeni(durum, a, baglantiGecerli),
      etkinlestiren: a?.etkinlestiren_adi ?? null,
      etkinlestirmeZamani: a?.etkinlestirme_zamani ? new Date(a.etkinlestirme_zamani).toISOString() : null,
      uygunlukEksikleri,
      sayilar,
      secenekler,
      secenekNotu,
    };
  }

  private async sayilar(tx: TxLike, clientId: string): Promise<Record<GeriBeslemeOlayDurumu, number>> {
    const satirlar = await tx.$queryRaw<Array<{ durum: GeriBeslemeOlayDurumu; n: number }>>(Prisma.sql`
      SELECT durum, count(*)::int AS n FROM geri_besleme_olaylari
       WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
       GROUP BY durum
    `);
    // HER DURUM SIFIRLA BAŞLIYOR: eksik anahtar ekranda `undefined` olurdu.
    const s = Object.fromEntries(GERI_BESLEME_OLAY_DURUMLARI.map((d) => [d, 0])) as Record<GeriBeslemeOlayDurumu, number>;
    for (const r of satirlar) s[r.durum] = Number(r.n);
    return s;
  }

  /**
   * Meta Conversion Leads ön koşulları (Ç-12). Gönderimi ENGELLEMEZ; ekran
   * eksikleri adıyla söyler. Kapsama: son 30 günün lead'lerinden en az bir
   * İLERİ aşaması platforma ULAŞANLARIN oranı.
   */
  private async uygunluk(tx: TxLike, clientId: string, a: AyarSatiri | null, simdi: Date): Promise<GeriBeslemeAyari['uygunlukEksikleri']> {
    const esik = new Date(simdi.getTime() - 30 * 86_400_000);
    const ulasan = [...GERI_BESLEME_ULASAN_DURUMLAR];
    const [r] = await tx.$queryRaw<Array<{ lead: number; kapsanan: number; ileri: number }>>(Prisma.sql`
      SELECT
        (SELECT count(*)::int FROM leads WHERE client_id = ${clientId}::uuid AND submitted_at >= ${esik}::timestamptz) AS lead,
        (SELECT count(DISTINCT o.lead_id)::int FROM geri_besleme_olaylari o JOIN leads l ON l.id = o.lead_id
          WHERE o.client_id = ${clientId}::uuid AND l.submitted_at >= ${esik}::timestamptz
            AND o.asama <> 'ham_lead' AND o.durum = ANY(${ulasan}::text[])) AS kapsanan,
        (SELECT count(*)::int FROM geri_besleme_olaylari o
          WHERE o.client_id = ${clientId}::uuid AND o.asama <> 'ham_lead' AND o.durum = ANY(${ulasan}::text[])) AS ileri
    `);
    const lead = Number(r?.lead ?? 0);
    const acikGun =
      a?.etkin && a.etkinlestirme_zamani ? Math.floor((simdi.getTime() - new Date(a.etkinlestirme_zamani).getTime()) / 86_400_000) : 0;
    return metaUygunlukEksikleri({
      son30GunLead: lead,
      kapsama: lead === 0 ? 0 : Number(r?.kapsanan ?? 0) / lead,
      acikGun,
      ileriAsamaSayisi: Number(r?.ileri ?? 0),
    });
  }

  /**
   * Workspace'in Meta hesaplarının pikselleri; hesap başına bağlantısıyla.
   * Bir hesap okunamazsa diğerleri yine geliyor ve not Meta'nın cümlesini
   * taşıyor: "piksel yok" ile "okuyamadık" farklı işler.
   */
  private async pikselSecenekleri(
    ctx: TenantContext,
    clientId: string,
  ): Promise<{ satirlar: Array<MetaPikselSatiri & { baglantiId: string }>; not: string | null; okunanHesap: number }> {
    const hesaplar = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ external_id: string; connection_id: string; ad: string }>>(Prisma.sql`
        SELECT external_id, connection_id::text AS connection_id, name AS ad FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform = 'meta'
         ORDER BY created_at
      `),
    );
    if (hesaplar.length === 0) {
      return {
        satirlar: [],
        not: 'Bu workspace’e Meta reklam hesabı atanmamış. Önce Marka Merkezi › Bağlantılar’dan hesap ata.',
        okunanHesap: 0,
      };
    }
    const satirlar: Array<MetaPikselSatiri & { baglantiId: string }> = [];
    const hatalar: string[] = [];
    let okunanHesap = 0;
    for (const h of hesaplar) {
      try {
        const token = await this.kasa.getAccessToken(h.connection_id, this.saglayicilar.get('meta'));
        const r = await (this.saglayicilar.get('meta') as unknown as {
          fetchAdPixels(p: { adAccountPath: string; accessToken: string; satinAlmaSor?: boolean }): Promise<{ satirlar: MetaPikselSatiri[]; kesildi: boolean }>;
        }).fetchAdPixels({ adAccountPath: actPath(h.external_id), accessToken: token, satinAlmaSor: false });
        okunanHesap++;
        for (const p of r.satirlar) {
          if (!satirlar.some((x) => x.id === p.id)) satirlar.push({ ...p, baglantiId: h.connection_id });
        }
        if (r.kesildi) hatalar.push(`${h.ad}: piksel listesi uzun, ilk sayfalar gösteriliyor`);
      } catch (err) {
        hatalar.push(`${h.ad}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    let not: string | null = hatalar.length > 0 ? `Pikseller tam okunamadı. ${hatalar.join(' · ')}` : null;
    if (!not && satirlar.length === 0) not = 'Bu workspace’in Meta hesaplarında piksel yok. Önce Marka Merkezi › Kurulum’da piksel kur.';
    return { satirlar, not, okunanHesap };
  }

  // ───────────────────────────────────────────────────────────────────────
  // PUT /geri-besleme/ayar
  // ───────────────────────────────────────────────────────────────────────

  async ayarYaz(ctx: TenantContext, g: GeriBeslemeAyarGirdisi, simdi = new Date()): Promise<GeriBeslemeAyarYaniti> {
    this.erisim(ctx, g.clientId);

    /*
     * VERİ KÜMESİ DOĞRULANIYOR, TAHMİN EDİLMİYOR (Ç-7): yanlış datasete giden
     * CRM olayları başka bir projenin modelini eğitir ve geri alınamaz.
     * Kimlik workspace'in Meta hesaplarının piksel listesinde olmalı; hangi
     * hesabın listesinde bulunduysa o bağlantının token'ı gönderimde
     * kullanılıyor. Listeler HİÇ okunamadıysa kayıt yapılmıyor: doğrulanamayan
     * bir kimlikle açmak tam olarak tahmin.
     */
    let baglantiId: string | null = null;
    let datasetAdi: string | null = null;
    if (g.etkin && g.datasetId) {
      const p = await this.pikselSecenekleri(ctx, g.clientId);
      const bulunan = p.satirlar.find((x) => x.id === g.datasetId);
      if (!bulunan) {
        if (p.okunanHesap === 0) throw new BadRequestException(p.not ?? 'Meta pikselleri okunamadı.');
        throw new BadRequestException(
          'Bu veri kümesi workspace’in Meta reklam hesaplarında görünmüyor. Listeden seç ya da pikseli hesaba paylaştır.',
        );
      }
      baglantiId = bulunan.baglantiId;
      datasetAdi = bulunan.ad;
    }

    const sonuc = await this.prisma.withTenant(ctx, async (tx) => {
      // `org_id` HEDEF MÜŞTERİDEN, ctx'ten değil ("tüm şirketler" modunda ctx.orgId ev şirketi).
      const [musteri] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        SELECT org_id::text AS org_id FROM clients WHERE id = ${g.clientId}::uuid
      `);
      if (!musteri) throw new ForbiddenException('Workspace bulunamadı');
      const [once] = await tx.$queryRaw<Array<{ etkin: boolean; dataset_id: string | null; aydinlatma_zamani: Date | null }>>(Prisma.sql`
        SELECT etkin, dataset_id, aydinlatma_zamani FROM geri_besleme_ayarlari
         WHERE client_id = ${g.clientId}::uuid AND platform = ${GB_PLATFORM}
         FOR UPDATE
      `);
      const acildi = g.etkin && once?.etkin !== true;
      const kapandi = !g.etkin && once?.etkin === true;
      const datasetDegisti = g.etkin && once?.dataset_id != null && once.dataset_id !== g.datasetId;

      if (g.etkin) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO geri_besleme_ayarlari
            (client_id, platform, org_id, etkin, dataset_id, dataset_adi, baglanti_id,
             aydinlatma_onaylayan, aydinlatma_zamani, etkinlestiren, etkinlestirme_zamani, updated_at)
          VALUES (${g.clientId}::uuid, ${GB_PLATFORM}, ${musteri.org_id}::uuid, true, ${g.datasetId}, ${datasetAdi},
                  ${baglantiId}::uuid, ${ctx.userId}::uuid, ${simdi}::timestamptz, ${ctx.userId}::uuid, ${simdi}::timestamptz, now())
          ON CONFLICT (client_id, platform) DO UPDATE SET
            etkin = true,
            dataset_id = EXCLUDED.dataset_id,
            dataset_adi = EXCLUDED.dataset_adi,
            baglanti_id = EXCLUDED.baglanti_id,
            -- ONAY HER AÇILIŞTA YENİLENİR; açıkken yapılan kayıtta ilk onay korunur.
            aydinlatma_onaylayan = CASE WHEN geri_besleme_ayarlari.etkin THEN geri_besleme_ayarlari.aydinlatma_onaylayan ELSE EXCLUDED.aydinlatma_onaylayan END,
            aydinlatma_zamani = CASE WHEN geri_besleme_ayarlari.etkin THEN geri_besleme_ayarlari.aydinlatma_zamani ELSE EXCLUDED.aydinlatma_zamani END,
            etkinlestiren = CASE WHEN geri_besleme_ayarlari.etkin THEN geri_besleme_ayarlari.etkinlestiren ELSE EXCLUDED.etkinlestiren END,
            etkinlestirme_zamani = CASE WHEN geri_besleme_ayarlari.etkin THEN geri_besleme_ayarlari.etkinlestirme_zamani ELSE EXCLUDED.etkinlestirme_zamani END,
            -- VERİ KÜMESİ DEĞİŞTİYSE eskisinin CRM bilgisi, hatası ve başarı
            -- zamanı yeni kümeye ait değil: "çalışıyor" yeni kümede ilk
            -- başarılı gönderimle yeniden kazanılır.
            dataset_crm = CASE WHEN geri_besleme_ayarlari.dataset_id IS DISTINCT FROM EXCLUDED.dataset_id THEN NULL ELSE geri_besleme_ayarlari.dataset_crm END,
            son_ayar_hatasi = CASE WHEN geri_besleme_ayarlari.dataset_id IS DISTINCT FROM EXCLUDED.dataset_id THEN NULL ELSE geri_besleme_ayarlari.son_ayar_hatasi END,
            son_basarili_gonderim = CASE WHEN geri_besleme_ayarlari.dataset_id IS DISTINCT FROM EXCLUDED.dataset_id THEN NULL ELSE geri_besleme_ayarlari.son_basarili_gonderim END,
            updated_at = now()
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO geri_besleme_ayarlari (client_id, platform, org_id, etkin, updated_at)
          VALUES (${g.clientId}::uuid, ${GB_PLATFORM}, ${musteri.org_id}::uuid, false, now())
          ON CONFLICT (client_id, platform) DO UPDATE SET etkin = false, updated_at = now()
        `);
      }

      let degisim: GeriBeslemeAyarYaniti['degisim'] = null;
      if (acildi) {
        const d = await acilisGeriDoldurma(tx, { clientId: g.clientId, orgId: musteri.org_id, simdi });
        degisim = { ...d, iptalEdilen: 0 };
      } else if (kapandi) {
        degisim = { kuyruga: 0, eskiOlduguIcinAtlanan: 0, iptalEdilen: await kapanisIptal(tx, g.clientId) };
      }

      /*
       * DENETİM KAYDI: veri aktarımını açan aydınlatma onayı, kapatma ve
       * veri kümesi değişikliği. Üçü de "kim, ne zaman, hangi kümeye" sorusunun
       * cevabı; KVKK incelemesinde tek dayanak bu (Ç-8).
       */
      if (acildi || kapandi || datasetDegisti) {
        await this.audit.record(tx, ctx, {
          action: acildi ? 'geri_besleme.acildi' : kapandi ? 'geri_besleme.kapatildi' : 'geri_besleme.veri_kumesi_degisti',
          targetType: 'client',
          targetId: g.clientId,
          clientId: g.clientId,
          before: { etkin: once?.etkin ?? false, datasetId: once?.dataset_id ?? null },
          after: {
            etkin: g.etkin,
            datasetId: g.etkin ? g.datasetId : (once?.dataset_id ?? null),
            aydinlatmaOnayi: acildi ? true : null,
            ...(degisim ?? {}),
          },
        });
      }
      return degisim;
    });

    const ayar = await this.ayar(ctx, g.clientId, false, simdi);
    if (sonuc && sonuc.kuyruga > 0) await this.hemenGonder(g.clientId);
    return { ...ayar, degisim: sonuc };
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST /geri-besleme/ayar/kontrol
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Veri kümesine erişim ve `is_crm`. TRANSACTION DIŞINDA çağrı, sonuç kısa
   * bir yazmayla. Meta erişim hatası verirse ve ayar açıksa bu bir AYAR
   * hatası: aynı token gönderimde de aynı hatayı verecek, ekran şimdiden
   * söylesin.
   */
  async kontrol(ctx: TenantContext, clientId: string): Promise<GeriBeslemeAyari> {
    this.erisim(ctx, clientId);
    const [a] = await this.prisma.withTenant(ctx, (tx) => tx.$queryRaw<AyarSatiri[]>(AYAR_SECIMI(clientId)));
    if (!a?.dataset_id) throw new BadRequestException('Önce bir veri kümesi (piksel) seç.');
    if (!a.baglanti_id) throw new BadRequestException('Bu ayarın Meta bağlantısı yok; ayarı yeniden kaydet.');

    let sonuc: { ad: string | null; crm: boolean | null; kullanilamaz: boolean };
    try {
      const token = await this.kasa.getAccessToken(a.baglanti_id, this.saglayicilar.get('meta'));
      sonuc = await this.istemci.veriKumesiOku(a.dataset_id, token);
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : String(err);
      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE geri_besleme_ayarlari
             SET dataset_crm = NULL, son_kontrol = now(),
                 son_ayar_hatasi = CASE WHEN etkin THEN ${mesaj.slice(0, 2000)} ELSE son_ayar_hatasi END,
                 son_ayar_hatasi_zamani = CASE WHEN etkin THEN now() ELSE son_ayar_hatasi_zamani END,
                 updated_at = now()
           WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
        `),
      );
      // Meta'nın cümlesi ekrana: PlatformApiError'ın kendi süzgeç dalı var.
      if (err instanceof PlatformApiError) throw err;
      throw new BadRequestException(mesaj);
    }

    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE geri_besleme_ayarlari
           SET dataset_crm = ${sonuc.crm}, son_kontrol = now(),
               dataset_adi = COALESCE(${sonuc.ad}, dataset_adi),
               son_ayar_hatasi = CASE WHEN ${sonuc.kullanilamaz} AND etkin
                                      THEN 'Meta bu veri kümesini kullanılamaz olarak işaretlemiş (is_unavailable).'
                                      ELSE son_ayar_hatasi END,
               son_ayar_hatasi_zamani = CASE WHEN ${sonuc.kullanilamaz} AND etkin THEN now() ELSE son_ayar_hatasi_zamani END,
               updated_at = now()
         WHERE client_id = ${clientId}::uuid AND platform = ${GB_PLATFORM}
      `),
    );
    // Seçeneklerle: `is_crm` cevabı yalnız seçenek satırında taşınıyor
    // (`GeriBeslemeDatasetSecenegi.crm`) ve ekran onu pencerede gösteriyor.
    return this.ayar(ctx, clientId, true);
  }

  // ───────────────────────────────────────────────────────────────────────
  // GET /geri-besleme/olaylar
  // ───────────────────────────────────────────────────────────────────────

  async olaylar(ctx: TenantContext, s: GeriBeslemeOlayListeSorgusu): Promise<GeriBeslemeOlaylariYaniti> {
    this.erisim(ctx, s.clientId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const kosul = Prisma.join(
        [
          Prisma.sql`o.client_id = ${s.clientId}::uuid`,
          Prisma.sql`o.platform = ${GB_PLATFORM}`,
          ...(s.durum ? [Prisma.sql`o.durum = ${s.durum}`] : []),
          ...(s.leadId ? [Prisma.sql`o.lead_id = ${s.leadId}::uuid`] : []),
        ],
        ' AND ',
      );
      const satirlar = await tx.$queryRaw<
        Array<{
          id: string;
          lead_id: string;
          lead_adi: string | null;
          asama: GeriBeslemeAsamasi;
          durum: GeriBeslemeOlayDurumu;
          deneme: number;
          olay_zamani: Date;
          sonraki_deneme: Date | null;
          gonderildi: Date | null;
          hata: string | null;
          hata_kodu: string | null;
        }>
      >(Prisma.sql`
        SELECT o.id::text AS id, o.lead_id::text AS lead_id, l.full_name AS lead_adi, o.asama, o.durum,
               o.deneme::int AS deneme, o.olay_zamani, o.sonraki_deneme, o.gonderildi, o.hata, o.hata_kodu
          FROM geri_besleme_olaylari o
          LEFT JOIN leads l ON l.id = o.lead_id
         WHERE ${kosul}
         ORDER BY o.updated_at DESC, o.id
         LIMIT ${s.limit}::int OFFSET ${s.offset}::int
      `);
      // SESSİZ KESME YOK: toplam süzgeçli, sayılar süzgeçten bağımsız.
      const [t] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM geri_besleme_olaylari o WHERE ${kosul}
      `);
      const toplam = Number(t?.n ?? 0);
      const sayilar = await this.sayilar(tx, s.clientId);

      let emptyReason: GeriBeslemeBosNedeni | null = null;
      if (toplam === 0) {
        const tumu = Object.values(sayilar).reduce((x, y) => x + y, 0);
        const [d] = await tx.$queryRaw<Array<{ etkin: boolean | null; lead: number }>>(Prisma.sql`
          SELECT (SELECT etkin FROM geri_besleme_ayarlari WHERE client_id = ${s.clientId}::uuid AND platform = ${GB_PLATFORM}) AS etkin,
                 (SELECT count(*)::int FROM leads WHERE client_id = ${s.clientId}::uuid) AS lead
        `);
        if (tumu > 0) emptyReason = 'suzgecte_yok';
        else if (d?.etkin !== true) emptyReason = 'ayar_kapali';
        else if (Number(d?.lead ?? 0) === 0) emptyReason = 'lead_yok';
        else emptyReason = 'gonderim_yok';
      }

      return {
        satirlar: satirlar.map((r) => ({
          id: r.id,
          leadId: r.lead_id,
          leadAdi: r.lead_adi,
          platform: 'meta' as const,
          asama: r.asama,
          durum: r.durum,
          deneme: Number(r.deneme),
          olayZamani: new Date(r.olay_zamani).toISOString(),
          sonrakiDeneme: r.sonraki_deneme ? new Date(r.sonraki_deneme).toISOString() : null,
          gonderildi: r.gonderildi ? new Date(r.gonderildi).toISOString() : null,
          hata: r.hata,
          hataKodu: r.hata_kodu,
        })),
        toplam,
        sayilar,
        emptyReason,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // POST /geri-besleme/olaylar/yeniden-dene
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Gönderilemeyenleri (`vazgecildi`, `reddedildi`) yeniden sıraya koyar.
   * Platforma ULAŞMIŞ satırlar ASLA (aynı aşama Meta'da iki kez sayılırdı,
   * M-6); 7 günü geçenler AYRI sayılır, sessizce atlanmaz.
   */
  async yenidenDene(ctx: TenantContext, g: GeriBeslemeYenidenDeneGirdisi, simdi = new Date()): Promise<GeriBeslemeYenidenDeneSonucu> {
    this.erisim(ctx, g.clientId);
    const sonuc = await this.prisma.withTenant(ctx, async (tx) => {
      const secim = g.olayIdleri
        ? Prisma.sql`AND id = ANY(${g.olayIdleri}::uuid[])`
        : Prisma.sql`AND durum IN ('vazgecildi', 'reddedildi')`;
      const satirlar = await tx.$queryRaw<Array<{ id: string; durum: GeriBeslemeOlayDurumu; olay_zamani: Date }>>(Prisma.sql`
        SELECT id::text AS id, durum, olay_zamani FROM geri_besleme_olaylari
         WHERE client_id = ${g.clientId}::uuid AND platform = ${GB_PLATFORM} ${secim}
         FOR UPDATE
      `);
      const s: GeriBeslemeYenidenDeneSonucu = { kuyruga: 0, suresiGecen: 0, zatenUlasan: 0 };
      for (const r of satirlar) {
        if (r.durum === 'iletildi' || r.durum === 'eslesmedi') {
          s.zatenUlasan++;
          continue;
        }
        if (r.durum !== 'vazgecildi' && r.durum !== 'reddedildi') continue;
        if (!metaPenceredeMi(Math.floor(new Date(r.olay_zamani).getTime() / 1000), simdi.getTime())) {
          s.suresiGecen++;
          continue;
        }
        const yeni = geriBeslemeGecisi(r.durum, 'yeniden_istendi');
        if (yeni === null) continue;
        s.kuyruga += await tx.$executeRaw(Prisma.sql`
          UPDATE geri_besleme_olaylari
             SET durum = ${yeni}, deneme = 0, sonraki_deneme = ${simdi}::timestamptz, updated_at = now()
           WHERE id = ${r.id}::uuid AND durum = ${r.durum}
        `);
      }
      return s;
    });
    if (sonuc.kuyruga > 0) await this.hemenGonder(g.clientId);
    return sonuc;
  }

  /**
   * Kullanıcı "tekrar dene" ya da "aç" dediğinde 5 dakikalık süpürmeyi
   * beklemesin. KUYRUK YOKSA ya da ekleme düşerse satırlar zaten `bekliyor`
   * ve süpürme alacak; hata log'da, istek başarısız sayılmıyor (satırlar
   * yazıldı, yalnız hızlandırma kaçtı).
   */
  private async hemenGonder(clientId: string): Promise<void> {
    if (!this.kuyruk.isEnabled) return;
    try {
      await this.kuyruk.enqueue({ clientId, platform: 'meta', jobType: 'lead_feedback_send', interactive: true });
    } catch (err) {
      this.logger.error(`Geri besleme işi hemen kuyruğa alınamadı (${clientId}), süpürme alacak: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

type TxLike = { $queryRaw: <T>(q: Prisma.Sql) => Promise<T> };

/** Ayar durumunun nedeni: her hâlde dolu, hata hâlinde platformun cümlesi AYNEN. */
function ayarNedeni(durum: GeriBeslemeAyari['durum'], a: AyarSatiri | null, baglantiGecerli: boolean): string {
  switch (durum) {
    case 'kapali':
      return 'Kapalı. Açınca işaretlediğin sonuçlar Meta’ya gider.';
    case 'kurulum_eksik':
      if (!a?.dataset_id) return 'Veri kümesi (piksel) seçilmemiş.';
      if (!a.baglanti_id) return 'Meta bağlantısı bulunamadı; ayarı yeniden kaydet.';
      return baglantiGecerli ? GERI_BESLEME_AYAR_DURUM_ADI[durum] : 'Meta bağlantısı yeniden yetki istiyor. Bağlantıyı Platform Bağlantıları ekranında yeniden yetkilendir; bekleyen sonuçlar kendiliğinden gönderilir.';
    case 'hata':
      return a?.son_ayar_hatasi ?? GERI_BESLEME_AYAR_DURUM_ADI[durum];
    case 'bekliyor':
      return 'Açık. Henüz gönderim yapılmadı.';
    case 'calisiyor':
      return a?.son_basarili_gonderim
        ? `Son başarılı gönderim: ${ISTANBUL.format(new Date(a.son_basarili_gonderim))}`
        : GERI_BESLEME_AYAR_DURUM_ADI[durum];
  }
}
