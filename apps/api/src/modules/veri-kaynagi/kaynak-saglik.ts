import { Prisma } from '@prisma/client';
import { SAGLIK, TAKIP_ACIGI, trafikKaynagi, type Platform, type SinyalKodu } from '@advetics/shared';
import { gunEkle, type Bulgu, type TxLike } from '../sinyal/sinyal-hesap';
import { YAPI_TAZELIK_SAAT } from './veri-kaynagi-is';
import { utmEtiketiAcik } from '../reklam/utm-etiketi';
import { etkinGa4Kaynagi, platformKampanyalari, siteSatirlari, takipHesapla } from './takip-hesap';

/**
 * ═══ PAKET F1 SAĞLIK KONTROLLERİ — SİNYAL İŞİNE BAĞ (sinyal/saglik.ts) ═══
 *
 * `signals_evaluate` hesap başına, gün başına koşuyor; bu fonksiyon o işin
 * İÇİNDE dört kontrolü hesaplıyor. PLATFORM ÇAĞRISI YOK (Paket A ilkesi):
 * girdi veri_kaynaklari, ga4_* ve insights_daily.
 *
 * "KOŞTU" KÜMESİ DÜRÜST: kontrol yalnız verisi TAZEYSE koşmuş sayılıyor;
 * koşmamış kontrolün açık sinyali kendiliğinden kapanmıyor (bilinmeyen = yok
 * değil). İSTİSNA: workspace'te GA4 kaynağı HİÇ yoksa (ya da kaldırıldıysa)
 * dört kontrol de koşmuş sayılır ve bulgu üretmez: kaynağı kaldırılan
 * workspace'in eski "Analytics veri almıyor" sinyali sonsuza kadar açık
 * kalmasın.
 */

interface KaynakDurumu {
  id: string;
  durum: string;
  yapi: Record<string, unknown> | null;
  yapi_zamani: Date | string | null;
  son_basarili_cekim: Date | string | null;
  saat_dilimi: string | null;
}

export interface KaynakSaglikGirdisi {
  clientId: string;
  adAccountId: string;
  platform: Platform;
  hesapAdi: string;
  /** Sinyal işinin günü (hesabın dünü). */
  gun: string;
  simdi: Date;
}

export const KAYNAK_SINYAL_KODLARI = ['ga4_anahtar_etkinlik_yok', 'ga4_veri_gelmiyor', 'takip_acigi', 'utm_eksik'] as const satisfies readonly SinyalKodu[];

const taze = (z: Date | string | null, simdi: Date) => z !== null && simdi.getTime() - new Date(z).getTime() <= YAPI_TAZELIK_SAAT * 3_600_000;

function bulgu(p: Pick<Bulgu, 'kod' | 'seviye' | 'varlikId' | 'varlikAdi' | 'ustAdi' | 'gun' | 'kanit'> & { gozlenen?: number | null }): Bulgu {
  return {
    tur: 'saglik',
    yon: null,
    alt: null,
    orta: null,
    ust: null,
    nokta: null,
    z: null,
    onem: 'orta',
    gozlenen: p.gozlenen ?? null,
    ...p,
  } as Bulgu;
}

/**
 * WORKSPACE DÜZEYİ KONTROLLERİN SAHİBİ (Ajan 4, Ö-3). `ga4_anahtar_etkinlik_yok`,
 * `ga4_veri_gelmiyor` ve `utm_eksik` bir MÜLK/SİTE gerçeği; sinyal işi ise
 * hesap başına koşuyor. Her hesap aynı bulguyu kendi adına bassaydı iki
 * hesaplı workspace'te aynı uyarı iki kez görünür, biri kapatılınca öbürü
 * açık kalırdı ("kapattım, hâlâ duruyor"). Workspace başına TEK sinyal:
 * sahip = penceredeki tıklaması en çok olan ATANMIŞ hesap, eşitlikte kimliğe
 * göre SABİT sıralama (her gün aynı hesap seçilsin, sinyal hesaplar arasında
 * gidip gelmesin). Sahip olmayan hesap kontrolü KOŞMUŞ sayar ama bulgu
 * basmaz: sahip değişirse eski hesaptaki açık sinyal `sureDolduMu` ile
 * `kendiliginden_kapandi` olur, yenisi sahibinde açılır.
 */
export async function workspaceSahibi(db: TxLike, clientId: string, gun: string, platform?: Platform): Promise<string | null> {
  const platformSuzgeci = platform ? Prisma.sql`AND a.platform = ${platform}::"Platform"` : Prisma.empty;
  const [s] = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT a.id::text AS id
      FROM ad_accounts a
      LEFT JOIN insights_daily d
        ON d.ad_account_id = a.id AND d.client_id = a.client_id
       AND d.entity_level = 'campaign'::"EntityLevel" AND d.breakdown_key = ''
       AND d.date BETWEEN ${gunEkle(gun, -6)}::date AND ${gun}::date
     WHERE a.client_id = ${clientId}::uuid ${platformSuzgeci}
     GROUP BY a.id
     ORDER BY coalesce(sum(d.clicks), 0) DESC, a.id
     LIMIT 1`);
  return s?.id ?? null;
}

export async function kaynakSaglikBulgulari(
  db: TxLike,
  g: KaynakSaglikGirdisi & { metaUtmAcik?: boolean },
): Promise<{ bulgular: Bulgu[]; kosan: Set<SinyalKodu>; not: string | null }> {
  const kosan = new Set<SinyalKodu>();
  const bulgular: Bulgu[] = [];
  // TEK SÜZGEÇ (Ö-1): trafik ucu, takip açığı ve rapor aynı fonksiyonla buluyor.
  const k = await etkinGa4Kaynagi<KaynakDurumu>(
    db,
    g.clientId,
    Prisma.sql`id::text AS id, durum, yapi, yapi_zamani, son_basarili_cekim, saat_dilimi`,
  );
  if (!k) {
    for (const kod of KAYNAK_SINYAL_KODLARI) kosan.add(kod);
    return { bulgular, kosan, not: null };
  }
  if (k.durum === 'duraklatildi') return { bulgular, kosan, not: 'GA4 kaynağı duraklatıldı: kaynak kontrolleri atlandı' };

  const sahip = (await workspaceSahibi(db, g.clientId, g.gun)) === g.adAccountId;
  const metaUtmAcik = g.metaUtmAcik ?? utmEtiketiAcik();

  // Pencereler sinyal gününden: son N tam gün, Analytics işlenme gecikmesi kadar geriden.
  // Tıklama WORKSPACE geneli: kontrol bir site gerçeği, tek hesabın değil.
  const son = gunEkle(g.gun, -TAKIP_ACIGI.isleniyorGun);
  const [tik] = await db.$queryRaw<Array<{ t7: number; t3: number }>>(Prisma.sql`
    SELECT coalesce(sum(clicks) FILTER (WHERE date BETWEEN ${gunEkle(g.gun, -6)}::date AND ${g.gun}::date), 0)::float8 AS t7,
           coalesce(sum(clicks) FILTER (WHERE date BETWEEN ${gunEkle(son, -(SAGLIK.ga4SessizGun - 1))}::date AND ${son}::date), 0)::float8 AS t3
      FROM insights_daily
     WHERE client_id = ${g.clientId}::uuid
       AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
       AND date BETWEEN ${gunEkle(g.gun, -13)}::date AND ${g.gun}::date`);
  const tiklama7 = Number(tik?.t7 ?? 0);
  const tiklama3 = Number(tik?.t3 ?? 0);

  // ── ga4_anahtar_etkinlik_yok: yapı taze ve liste BOŞ ──
  if (taze(k.yapi_zamani, g.simdi) && Array.isArray(k.yapi?.anahtarEtkinlikler)) {
    kosan.add('ga4_anahtar_etkinlik_yok');
    if (sahip && (k.yapi!.anahtarEtkinlikler as unknown[]).length === 0 && tiklama7 > 0) {
      bulgular.push(
        bulgu({ kod: 'ga4_anahtar_etkinlik_yok', seviye: 'account', varlikId: g.adAccountId, varlikAdi: g.hesapAdi, ustAdi: null, gun: g.gun, gozlenen: 0, kanit: { kaynakId: k.id } }),
      );
    }
  }

  if (!taze(k.son_basarili_cekim, g.simdi)) {
    return { bulgular, kosan, not: 'GA4 günlük çekimi son 36 saatte başarılı değil: veri, takip açığı ve etiket kontrolleri atlandı' };
  }

  // ── ga4_veri_gelmiyor: workspace tıklama alıyor, oturum 0 ──
  kosan.add('ga4_veri_gelmiyor');
  if (sahip && tiklama3 >= TAKIP_ACIGI.enAzTiklama) {
    const [o] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT coalesce(sum(oturum), 0)::float8 AS n FROM ga4_gunluk
       WHERE client_id = ${g.clientId}::uuid AND veri_kaynagi_id = ${k.id}::uuid
         AND gun BETWEEN ${gunEkle(son, -(SAGLIK.ga4SessizGun - 1))}::date AND ${son}::date`);
    if (Number(o?.n ?? 0) === 0) {
      bulgular.push(
        bulgu({
          kod: 'ga4_veri_gelmiyor',
          seviye: 'account',
          varlikId: g.adAccountId,
          varlikAdi: g.hesapAdi,
          ustAdi: null,
          gun: g.gun,
          gozlenen: 0,
          kanit: { tiklama: tiklama3, pencere: { bas: gunEkle(son, -(SAGLIK.ga4SessizGun - 1)), son } },
        }),
      );
    }
  }

  // ── takip_acigi: kampanya başına (kampanya zaten tek hesaba ait), son 14 gün ──
  const bas = gunEkle(son, -(SAGLIK.kaynakPencereGun - 1));
  const site = await siteSatirlari(db, g.clientId, k.id, bas, son);
  // Eşleme adayları WORKSPACE'in bütün kampanyaları (aynı adlı kampanya başka
  // hesapta olabilir; yalnız bu hesaba bakmak "ad belirsiz"i kaçırırdı),
  // bulgu yalnız BU hesabın kampanyalarına yazılır.
  const kampanyalar = await platformKampanyalari(db, g.clientId, bas, son);
  const hesabin = new Set(kampanyalar.filter((c) => c.adAccountId === g.adAccountId).map((c) => c.id));
  kosan.add('takip_acigi');
  for (const s of takipHesapla(kampanyalar, site).satirlar) {
    if (!hesabin.has(s.kampanyaId)) continue;
    if (s.etiket === 'uyumlu' || s.etiket === 'veri_yetersiz') continue;
    bulgular.push(
      bulgu({
        kod: 'takip_acigi',
        seviye: 'campaign',
        varlikId: s.kampanyaId,
        varlikAdi: s.kampanyaAdi,
        ustAdi: g.hesapAdi,
        gun: g.gun,
        gozlenen: s.oran,
        kanit: { etiket: s.etiket, platformDonusum: s.platformDonusum, siteDonusum: s.siteDonusum, tiklama: s.platformTiklama, pencere: { bas, son } },
      }),
    );
  }

  /*
   * ── utm_eksik (Ö-2): YALNIZ ETİKETLEMENİN BİZİM KONTROLÜMÜZDE OLDUĞU YERDE ──
   * Google: otomatik etiket (gclid) her zaman; koşmuş sayılır, kampanya
   * kimlikle eşlendiği için bulgu üretmez. Meta: yalnız `META_UTM_ETIKETI=1`
   * iken; kapalıyken etiketsiz Meta tıklaması GA4'te "facebook / referral"
   * görünür, ücretli sayılmaz ve kontrol hiçbir şey görmeden "temiz" derdi.
   * O yüzden kapalıyken `kosan`a GİRMEZ (açık sinyali "düzeldi" diye
   * kapatmaz) ve sinyal ekranı "kontrol edilmeyenler"de söyler
   * (`SAGLIK_KOSULLU_DISARIDA`). LinkedIn etiketini biz yazmıyoruz: koşmaz.
   */
  if (g.platform === 'google') {
    kosan.add('utm_eksik');
  } else if (g.platform === 'meta' && metaUtmAcik) {
    kosan.add('utm_eksik');
    // Sahip META hesapları arasından: bulgu Meta trafiği hakkında.
    const utmSahibi = (await workspaceSahibi(db, g.clientId, g.gun, 'meta')) === g.adAccountId;
    let toplam = 0;
    let etiketsiz = 0;
    for (const s of site) {
      if (trafikKaynagi(s.kaynakOrtam) !== 'meta_ucretli') continue;
      toplam += s.oturum;
      const ad = s.kampanyaAdi?.trim() ?? '';
      if (ad === '' || ad === '(not set)') etiketsiz += s.oturum;
    }
    const pay = toplam > 0 ? etiketsiz / toplam : 0;
    if (utmSahibi && toplam >= SAGLIK.utmEksikEnAzOturum && pay > SAGLIK.utmEksikPay) {
      bulgular.push(
        bulgu({
          kod: 'utm_eksik',
          seviye: 'account',
          varlikId: g.adAccountId,
          varlikAdi: g.hesapAdi,
          ustAdi: null,
          gun: g.gun,
          gozlenen: pay,
          kanit: { pay, etiketsizOturum: etiketsiz, ucretliOturum: toplam, pencere: { bas, son } },
        }),
      );
    }
  }
  return { bulgular, kosan, not: null };
}
