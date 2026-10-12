import { Prisma } from '@prisma/client';
import { SAGLIK, TAKIP_ACIGI, trafikKaynagi, type Platform, type SinyalKodu } from '@advetics/shared';
import { gunEkle, type Bulgu, type TxLike } from '../sinyal/sinyal-hesap';
import { YAPI_TAZELIK_SAAT } from './veri-kaynagi-is';
import { platformKampanyalari, siteSatirlari, takipHesapla } from './takip-hesap';

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

export async function kaynakSaglikBulgulari(db: TxLike, g: KaynakSaglikGirdisi): Promise<{ bulgular: Bulgu[]; kosan: Set<SinyalKodu>; not: string | null }> {
  const kosan = new Set<SinyalKodu>();
  const bulgular: Bulgu[] = [];
  const [k] = await db.$queryRaw<KaynakDurumu[]>(Prisma.sql`
    SELECT id::text AS id, durum, yapi, yapi_zamani, son_basarili_cekim, saat_dilimi
      FROM veri_kaynaklari
     WHERE client_id = ${g.clientId}::uuid AND tur = 'ga4' AND durum <> 'kaldirildi'
     ORDER BY created_at LIMIT 1`);
  if (!k) {
    for (const kod of KAYNAK_SINYAL_KODLARI) kosan.add(kod);
    return { bulgular, kosan, not: null };
  }
  if (k.durum === 'duraklatildi') return { bulgular, kosan, not: 'GA4 kaynağı duraklatıldı: kaynak kontrolleri atlandı' };

  // Pencereler sinyal gününden: son N tam gün, Analytics işlenme gecikmesi kadar geriden.
  const son = gunEkle(g.gun, -TAKIP_ACIGI.isleniyorGun);
  const [tik] = await db.$queryRaw<Array<{ t7: number; t3: number }>>(Prisma.sql`
    SELECT coalesce(sum(clicks) FILTER (WHERE date BETWEEN ${gunEkle(g.gun, -6)}::date AND ${g.gun}::date), 0)::float8 AS t7,
           coalesce(sum(clicks) FILTER (WHERE date BETWEEN ${gunEkle(son, -(SAGLIK.ga4SessizGun - 1))}::date AND ${son}::date), 0)::float8 AS t3
      FROM insights_daily
     WHERE client_id = ${g.clientId}::uuid AND ad_account_id = ${g.adAccountId}::uuid
       AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
       AND date BETWEEN ${gunEkle(g.gun, -13)}::date AND ${g.gun}::date`);
  const tiklama7 = Number(tik?.t7 ?? 0);
  const tiklama3 = Number(tik?.t3 ?? 0);

  // ── ga4_anahtar_etkinlik_yok: yapı taze ve liste BOŞ ──
  if (taze(k.yapi_zamani, g.simdi) && Array.isArray(k.yapi?.anahtarEtkinlikler)) {
    kosan.add('ga4_anahtar_etkinlik_yok');
    if ((k.yapi!.anahtarEtkinlikler as unknown[]).length === 0 && tiklama7 > 0) {
      bulgular.push(
        bulgu({ kod: 'ga4_anahtar_etkinlik_yok', seviye: 'account', varlikId: g.adAccountId, varlikAdi: g.hesapAdi, ustAdi: null, gun: g.gun, gozlenen: 0, kanit: { kaynakId: k.id } }),
      );
    }
  }

  if (!taze(k.son_basarili_cekim, g.simdi)) {
    return { bulgular, kosan, not: 'GA4 günlük çekimi son 36 saatte başarılı değil: veri, takip açığı ve etiket kontrolleri atlandı' };
  }

  // ── ga4_veri_gelmiyor: tıklama var, oturum 0 ──
  kosan.add('ga4_veri_gelmiyor');
  if (tiklama3 >= TAKIP_ACIGI.enAzTiklama) {
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

  // ── takip_acigi: kampanya başına, son 14 gün ──
  const bas = gunEkle(son, -(SAGLIK.kaynakPencereGun - 1));
  const site = await siteSatirlari(db, g.clientId, bas, son);
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

  // ── utm_eksik: yalnız Meta/LinkedIn (Google otomatik etiketle eşleniyor) ──
  // Google hesabında kontrol KOŞMUŞ sayılır ve bulgu üretmez: "koşmayan
  // kontrol" notu her Google hesabında gürültü olurdu.
  kosan.add('utm_eksik');
  if (g.platform !== 'google') {
    const hedef = g.platform === 'meta' ? 'meta_ucretli' : 'linkedin_ucretli';
    let toplam = 0;
    let etiketsiz = 0;
    for (const s of site) {
      if (trafikKaynagi(s.kaynakOrtam) !== hedef) continue;
      toplam += s.oturum;
      const ad = s.kampanyaAdi?.trim() ?? '';
      if (ad === '' || ad === '(not set)') etiketsiz += s.oturum;
    }
    const pay = toplam > 0 ? etiketsiz / toplam : 0;
    if (toplam >= SAGLIK.utmEksikEnAzOturum && pay > SAGLIK.utmEksikPay) {
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
