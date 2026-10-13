import { Prisma } from '@prisma/client';
import {
  ANOMALI,
  ANOMALI_DEGIL_NEDENLERI,
  ANOMALI_METRIKLERI,
  ANOMALI_METRIK_TANIMI,
  KENDILIGINDEN_KAPANMA_GUN,
  SAGLIK,
  anomaliDegerlendir,
  bildirilirMi,
  kotulestiMi,
  sinyalGecisi,
  type AdReviewIssue,
  type AnomaliDegilNedeni,
  type AnomaliMetrigi,
  type AnomaliYonu,
  type Platform,
  type SinyalDurumu,
  type SinyalKodu,
  type SinyalOlayi,
  type SinyalSerisi,
  type SinyalSeviyesi,
  type SinyalTuru,
} from '@advetics/shared';
import { hasReviewIssue, parseReviewIssues } from '../ads/review-issues';

/**
 * ═══ SİNYAL HESABI — SAF PARÇALAR (docs/sinyal/MIMARI.md § 5-6) ═══
 *
 * Veritabanına dokunmayan her karar burada ve ÇALIŞTIRILARAK sınanıyor:
 * metrik değeri, eksik günün sıfır mı "bilinmiyor" mu sayılacağı, üç
 * sağlık kontrolü ve durum geçişi. Servis (`sinyal-hesap.service.ts`) yalnız
 * okuyor, bunları çağırıyor ve yazıyor. Effect'e ya da sorguya gömülen bir
 * karar yalnız kaynak taramasıyla sınanabiliyordu ve tarama yanlış şeyi
 * kilitleyebiliyor (CLAUDE.md "React effect'inin içindeki karar").
 */

export type TxLike = {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
};

/** `YYYY-MM-DD` üzerinde gün kaydırma, Date'e çevirmeden (saat dilimi kayması). */
export function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Bir günün çıplak sayıları. Para HESAP PARA BİRİMİNDE (micros değil). */
export interface GunSayilari {
  gosterim: number;
  tiklama: number;
  harcama: number;
  donusum: number;
}

const SIFIR: GunSayilari = { gosterim: 0, tiklama: 0, harcama: 0, donusum: 0 };

export interface VarlikSerisi {
  seviye: 'account' | 'campaign';
  varlikId: string;
  varlikAdi: string;
  ustAdi: string | null;
  /** gün → sayılar. Satır YOKSA anahtar da yok. */
  gunler: Map<string, GunSayilari>;
  /**
   * Değerlendirilsin mi: kampanya platformda etkin ya da gözlem gününde
   * satırı var. Kullanıcının kendi durdurduğu kampanyada "gösterim sıfıra
   * düştü" bir haber değil, kendi kararı; her sabah söylemek kanalı susturur.
   */
  degerlendir: boolean;
  /**
   * Dönüşüm için kurulmamış kampanya (arama, video, erişim; ya da böyle bir kampanyası olan hesap): dönüşüm
   * metrikleri DEĞERLENDİRİLMİYOR, sebep `donusum_sayilmiyor` sayılıyor.
   */
  donusumSayilmiyor?: boolean;
}

/**
 * Eksik gün SIFIR MI, BİLİNMİYOR MU?
 *
 * Meta sıfır teslimli günde SATIR DÖNDÜRMÜYOR (saglik.ts). Eksik günü her
 * zaman "bilinmiyor" saymak, en önemli olayı (yayın tamamen durdu) HİÇ
 * görmemek demek: gözlenen gün `null` olur ve `anomaliDegerlendir`
 * `deger_yok` der. Her zaman sıfır saymak ise yeni açılmış bir kampanyanın
 * açılıştan önceki haftalarını "0" diye geçmişe yazar ve ilk haftasını
 * sıçrama sanır. Ayıran şey varlığın İLK görüldüğü gün: ondan önceki günler
 * bilinmiyor, sonrakiler sıfır.
 */
export function gunDegeri(v: VarlikSerisi, gun: string): GunSayilari | null {
  const s = v.gunler.get(gun);
  if (s) return s;
  const ilk = [...v.gunler.keys()].sort()[0];
  if (ilk !== undefined && gun >= ilk) return SIFIR;
  return null;
}

/**
 * Metriğin günlük değeri. ORAN GÜN TOPLAMLARINDAN (SUM/SUM); paydası sıfır
 * olan oran `null`, sıfır DEĞİL: "tıklama yok" günü TBM'yi sıfır göstermek
 * uydurma bir iyileşme olurdu.
 */
export function metrikDegeri(m: AnomaliMetrigi, s: GunSayilari | null): number | null {
  if (!s) return null;
  switch (m) {
    case 'harcama':
      return s.harcama;
    case 'gosterim':
      return s.gosterim;
    case 'donusum':
      return s.donusum;
    case 'tiklama_orani':
      return s.gosterim > 0 ? s.tiklama / s.gosterim : null;
    case 'tiklama_basi_maliyet':
      return s.tiklama > 0 ? s.harcama / s.tiklama : null;
    case 'donusum_basi_maliyet':
      return s.donusum > 0 ? s.harcama / s.donusum : null;
    default: {
      const yok: never = m;
      throw new Error(`Bilinmeyen metrik: ${String(yok)}`);
    }
  }
}

function hacimDegeri(m: AnomaliMetrigi, s: GunSayilari): number {
  const h = ANOMALI_METRIK_TANIMI[m].hacim;
  return h === 'gosterim' ? s.gosterim : h === 'tiklama' ? s.tiklama : s.donusum;
}

/** Bir metriğin gözlem günü: dönüşüm metrikleri gecikme kadar geride (Ç-10). */
export function gozlemGunu(m: AnomaliMetrigi, gun: string): string {
  return ANOMALI_METRIK_TANIMI[m].gecikmeli ? gunEkle(gun, -ANOMALI.donusumGecikmesiGun) : gun;
}

/** Haftanın aynı günü, son `gecmisHafta` hafta (eskiden yeniye). */
export function gecmisGunler(gozlem: string): string[] {
  const out: string[] = [];
  for (let k = ANOMALI.gecmisHafta; k >= 1; k--) out.push(gunEkle(gozlem, -7 * k));
  return out;
}

/** Hesaplama işinin okuması gereken bütün günler (iki gözlem günü × geçmişleri). */
export function okunacakGunler(gun: string): string[] {
  const set = new Set<string>();
  for (const m of ANOMALI_METRIKLERI) {
    const g = gozlemGunu(m, gun);
    set.add(g);
    for (const x of gecmisGunler(g)) set.add(x);
  }
  return [...set].sort();
}

/** Hesaplama işinin bulgusu — anomali de sağlık da aynı biçimde yazılıyor. */
export interface Bulgu {
  tur: SinyalTuru;
  kod: SinyalKodu;
  yon: AnomaliYonu | null;
  seviye: SinyalSeviyesi;
  varlikId: string;
  varlikAdi: string;
  ustAdi: string | null;
  gun: string;
  gozlenen: number | null;
  alt: number | null;
  orta: number | null;
  ust: number | null;
  nokta: number | null;
  z: number | null;
  onem: 'yuksek' | 'orta';
  kanit: Record<string, unknown>;
}

export type NedenSayaci = Record<AnomaliDegilNedeni, number>;

export function bosNedenSayaci(): NedenSayaci {
  return Object.fromEntries(ANOMALI_DEGIL_NEDENLERI.map((n) => [n, 0])) as NedenSayaci;
}

/**
 * Bir varlığın altı metriği. Atılan her değerlendirmenin NEDENİ sayılıyor:
 * "sinyal yok" ile "hepsi düşük hacim yüzünden elendi" aynı boş liste ve
 * iş notuna yazılmazsa eşik ayarı (Ajan 5 ölçümü) körlemesine yapılır.
 */
/** Dönüşüm sayısına dayanan anomali metrikleri (dönüşüm için kurulmamış kampanyada atlanır). */
export const DONUSUM_ANOMALI_METRIKLERI: ReadonlySet<string> = new Set(['donusum', 'donusum_basi_maliyet']);

export function anomaliBul(v: VarlikSerisi, gun: string, nedenler: NedenSayaci): Bulgu[] {
  if (!v.degerlendir) return [];
  const out: Bulgu[] = [];
  for (const m of ANOMALI_METRIKLERI) {
    if (v.donusumSayilmiyor && DONUSUM_ANOMALI_METRIKLERI.has(m)) {
      nedenler.donusum_sayilmiyor++;
      continue;
    }
    const g = gozlemGunu(m, gun);
    const gecmis = gecmisGunler(g);
    const gozlenen = metrikDegeri(m, gunDegeri(v, g));
    const gecmisDeger = gecmis.map((x) => metrikDegeri(m, gunDegeri(v, x)));
    const gecmisHacim = gecmis
      .map((x) => gunDegeri(v, x))
      .filter((s): s is GunSayilari => s !== null)
      .map((s) => hacimDegeri(m, s));
    const r = anomaliDegerlendir({ metrik: m, gozlenen, gecmis: gecmisDeger, gecmisHacim });
    if (!r.anomali) {
      nedenler[r.neden]++;
      continue;
    }
    const seri: SinyalSerisi = {
      gunler: [...gecmis, g],
      degerler: [...gecmisDeger, gozlenen],
      bant: { alt: r.aralik.alt, ust: r.aralik.ust },
    };
    out.push({
      tur: 'anomali',
      kod: m,
      yon: r.yon,
      seviye: v.seviye,
      varlikId: v.varlikId,
      varlikAdi: v.varlikAdi,
      ustAdi: v.ustAdi,
      gun: g,
      gozlenen,
      alt: r.aralik.alt,
      orta: r.aralik.orta,
      ust: r.aralik.ust,
      nokta: r.aralik.nokta,
      z: r.z,
      onem: r.onem,
      kanit: { seri, goreliSapma: r.goreliSapma },
    });
  }
  return out;
}

/**
 * HESAP SEVİYESİ SATIRI YOKSA KAMPANYA TOPLAMINDAN.
 *
 * LinkedIn'de hesap seviyesi metrik yok (platform-isleri.ts) ve Google'da
 * hesap satırının dolu geldiği ölçülmedi (MIMARI § 12). Hesap seviyesini
 * hiç değerlendirmemek "bütün hesapta harcama sıfırlandı" olayını kampanya
 * kampanya dağınık sinyallere bölerdi. Toplam oran değil SAYI üzerinden.
 */
export function kampanyaToplami(kampanyalar: VarlikSerisi[]): Map<string, GunSayilari> {
  const out = new Map<string, GunSayilari>();
  for (const k of kampanyalar) {
    for (const [gun, s] of k.gunler) {
      const t = out.get(gun) ?? { ...SIFIR };
      t.gosterim += s.gosterim;
      t.tiklama += s.tiklama;
      t.harcama += s.harcama;
      t.donusum += s.donusum;
      out.set(gun, t);
    }
  }
  return out;
}

// ─── Sağlık kontrolleri (saglik.ts#SAGLIK_KONTROL_TANIMI) ──────────────────

export interface SifirGosterimGirdisi {
  id: string;
  ad: string;
  ustAd: string | null;
  etkin: boolean;
  /** Reklam setlerinden en az biri etkin mi; hiç seti yoksa `null` (bilinmiyor, engel sayılmaz). */
  etkinSetVar: boolean | null;
  /** Bizde ilk kaydedildiği gün (`campaigns.created_at`). */
  kayitGunu: string;
  /** Son `sifirGosterimGun` tam günde toplam gösterim (satır yoksa 0). */
  gosterim: number;
  sonGosterimGunu: string | null;
}

/**
 * Etkin ama `sifirGosterimGun` gündür gösterim almayan kampanya.
 *
 * VERİ TAZE DEĞİLSE SUSAR: Meta sıfır teslimli günde satır döndürmüyor ve
 * "satır yok" ile "0" aynı sayılıyor; çekim duruyorsa her kampanya "7 gündür
 * gösterim yok" görünür. Bayat hesap ekranda "veri bayat" der (Ç-3).
 */
export function sifirGosterimBulgulari(
  kampanyalar: SifirGosterimGirdisi[],
  gun: string,
  veriTaze: boolean,
): Bulgu[] {
  if (!veriTaze) return [];
  const sinir = gunEkle(gun, -(SAGLIK.sifirGosterimGun - 1));
  return kampanyalar
    .filter((k) => k.etkin && k.etkinSetVar !== false && k.kayitGunu <= gunEkle(sinir, -1) && k.gosterim === 0)
    .map((k) => ({
      tur: 'saglik',
      kod: 'sifir_gosterim',
      yon: null,
      seviye: 'campaign',
      varlikId: k.id,
      varlikAdi: k.ad,
      ustAdi: k.ustAd,
      gun,
      gozlenen: 0,
      alt: null,
      orta: null,
      ust: null,
      nokta: null,
      z: null,
      onem: 'orta',
      kanit: { pencere: { bas: sinir, son: gun }, sonGosterimGunu: k.sonGosterimGunu },
    }));
}

export interface ReklamGirdisi {
  id: string;
  ad: string;
  ustAd: string | null;
  platform: Platform;
  reviewStatus: string | null;
  disapprovalReasons: unknown;
}

/**
 * Reddedilmiş ya da kısıtlı reklam. "Sorunlu" tanımı Reklam Yöneticisi ile
 * AYNI fonksiyondan (`hasReviewIssue`): iki ekran farklı sayı gösterirse
 * ikisine de güven kalmaz.
 */
export function reklamOnaysizBulgulari(reklamlar: ReklamGirdisi[], gun: string): Bulgu[] {
  const out: Bulgu[] = [];
  for (const r of reklamlar) {
    const sorunlar: AdReviewIssue[] = parseReviewIssues(r.platform, r.disapprovalReasons);
    if (!hasReviewIssue(r.reviewStatus, sorunlar)) continue;
    const reddedildi = (r.reviewStatus ?? '').toUpperCase().includes('DISAPPROVED');
    out.push({
      tur: 'saglik',
      kod: 'reklam_onaysiz',
      yon: null,
      seviye: 'ad',
      varlikId: r.id,
      varlikAdi: r.ad,
      ustAdi: r.ustAd,
      gun,
      gozlenen: null,
      alt: null,
      orta: null,
      ust: null,
      nokta: null,
      z: null,
      onem: reddedildi ? 'yuksek' : 'orta',
      kanit: { reviewStatus: r.reviewStatus, sorunlar },
    });
  }
  return out;
}

export interface DonusumKesildiGirdisi {
  hesapId: string;
  hesapAdi: string;
  pencere: { bas: string; son: string; gosterim: number; donusum: number };
  onceki: { bas: string; son: string; donusum: number };
}

/** Dönüşüm penceresi: gecikme kadar geride biten `donusumPencereGun` gün ve öncesindeki `donusumOncekiGun` gün. */
export function donusumPencereleri(gun: string): { pencere: { bas: string; son: string }; onceki: { bas: string; son: string } } {
  const son = gunEkle(gun, -ANOMALI.donusumGecikmesiGun);
  const bas = gunEkle(son, -(SAGLIK.donusumPencereGun - 1));
  const oncekiSon = gunEkle(bas, -1);
  return { pencere: { bas, son }, onceki: { bas: gunEkle(oncekiSon, -(SAGLIK.donusumOncekiGun - 1)), son: oncekiSon } };
}

/**
 * "Vardı, KESİLDİ" — "hiç yok" değil. Farkındalık kampanyası hiç dönüşüm
 * saymıyor; onu uyarmak her sabah aynı yanlış alarm olurdu.
 */
export function donusumKesildiBulgusu(g: DonusumKesildiGirdisi, gun: string, veriTaze: boolean): Bulgu | null {
  if (!veriTaze) return null;
  if (g.pencere.gosterim < SAGLIK.donusumPencereEnAzGosterim) return null;
  if (g.pencere.donusum > 0) return null;
  if (g.onceki.donusum < SAGLIK.donusumOncekiEnAz) return null;
  return {
    tur: 'saglik',
    kod: 'donusum_kesildi',
    yon: null,
    seviye: 'account',
    varlikId: g.hesapId,
    varlikAdi: g.hesapAdi,
    ustAdi: null,
    gun,
    gozlenen: 0,
    alt: null,
    orta: null,
    ust: null,
    nokta: null,
    z: null,
    onem: 'yuksek',
    kanit: { pencere: g.pencere, onceki: g.onceki },
  };
}

// ─── Durum geçişi ───────────────────────────────────────────────────────────

export interface GozlemKarari {
  olay: SinyalOlayi;
  sonraki: SinyalDurumu;
  /** Kapalıdan (ya da hiç yokken) açığa geçti: özete girer, sayaç artar. */
  acildi: boolean;
}

/**
 * Koşul bu değerlendirmede GÖRÜLDÜ. Geçiş tablosu shared'da
 * (`SINYAL_GECISLERI`); burada yalnız hangi OLAYIN yaşandığına karar
 * veriliyor: kapatılmış sinyalde sapma kapatma anındakinin
 * `kotulesmeKatsayisi` katını geçtiyse `kotulesti`, yoksa `gozlendi`.
 */
export function gozlemKarari(mevcut: { durum: SinyalDurumu; kapatmaZ: number | null } | null, yeniZ: number | null): GozlemKarari {
  if (!mevcut) return { olay: 'gozlendi', sonraki: 'acik', acildi: bildirilirMi(null, 'acik') };
  const olay: SinyalOlayi =
    mevcut.durum !== 'acik' && yeniZ !== null && kotulestiMi(mevcut.kapatmaZ, yeniZ) ? 'kotulesti' : 'gozlendi';
  const sonraki = sinyalGecisi(mevcut.durum, olay) ?? mevcut.durum;
  return { olay, sonraki, acildi: mevcut.durum !== sonraki && bildirilirMi(mevcut.durum, sonraki) };
}

/**
 * Koşul bu değerlendirmede GÖRÜLMEDİ: süre doldu mu?
 *
 * - Anomali tek günlük bir olay: `KENDILIGINDEN_KAPANMA_GUN.anomali` gün
 *   görülmezse kapanır.
 * - Sağlık bir HÂL: kontrol KOŞTUYSA ve koşul yoksa düzelmiştir, hemen
 *   kapanır. Kontrol koşmadıysa (veri bayat) hiçbir şey bilinmiyor; kapatmak
 *   düzelmemiş bir sorunu "düzeldi" diye gizlerdi.
 */
export function sureDolduMu(
  s: { tur: SinyalTuru; kod: SinyalKodu; sonGorulme: Date },
  simdi: Date,
  kosanKontroller: ReadonlySet<SinyalKodu>,
): boolean {
  if (s.tur === 'saglik') return kosanKontroller.has(s.kod);
  return simdi.getTime() - s.sonGorulme.getTime() >= KENDILIGINDEN_KAPANMA_GUN.anomali * 86_400_000;
}

/** İş notu. `sync_jobs.note` 500 karakter; sığmayan kısım kesilir ama sayılar başta. */
export function isNotu(p: {
  bulgu: number;
  yeni: number;
  yenidenAcilan: number;
  kapanan: number;
  nedenler: NedenSayaci;
  ekler: string[];
}): string {
  const atilan = Object.entries(p.nedenler)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  const parcalar = [
    `${p.bulgu} bulgu (yeni ${p.yeni}, yeniden açılan ${p.yenidenAcilan}, kapanan ${p.kapanan})`,
    atilan ? `atılan: ${atilan}` : 'atılan: yok',
    ...p.ekler,
  ];
  return parcalar.join(' · ').slice(0, 500);
}

/**
 * ÖN KOŞUL NOTU — hesap değerlendirilmeden biten işin işareti.
 *
 * `succeeded + rows = 0` bu projede bir hata türü (CLAUDE.md): not ZORUNLU ve
 * liste ekranı bu önekle "hiç hesaplanmadı"yı "hesaplandı, sinyal yok"tan
 * ayırıyor. İki yerde ayrı yazılırsa ayrışır; tek sabit.
 */
export const ON_KOSUL_NOTU = 'hesaplanmadı:';
