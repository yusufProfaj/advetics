import {
  AMAC_GRUBU_ADI,
  BRIEF_EN_FAZLA_BULGU,
  ETIKET_ALAN_ADLARI,
  ETIKET_ETIKETLERI,
  ETIKETLENEMEZ_CUMLESI,
  HARCAMA_ESIGI_TRY,
  KOVA_ADI,
  METRIK_GOSTERIMI,
  PLATFORM_KISA_ADLARI,
  briefIstemi,
  formatMoney,
  kovaCumlesi,
  type AmacGrubu,
  type BekciRetNedeni,
  type BriefBosNedeni,
  type EtiketFarkSatiri,
  type EtiketlemeOzeti,
  type GeciciNeden,
  type KreatifBosNedeni,
  type KreatifBrief,
  type KreatifEtiketleri,
  type KreatifMetrigi,
  type KreatifSatiri,
  type KreatifZekaYaniti,
  type Kova,
  type PuanSonucu,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ İYİLEŞTİR › KREATİFLER: SAF KARARLAR (Paket D, taslak `docs/kreatif-zeka/taslak.html`) ═══
 *
 * Ekranın her kararı burada ve ÇALIŞTIRILARAK sınanıyor
 * (`kreatif-zeka.spec.ts`): panelde bileşen render eden test altyapısı
 * yok ve effect içindeki bir karar yalnız kaynak taramasıyla sınanabilirdi
 * (CLAUDE.md).
 *
 * SAYI TAŞIYAN CÜMLELER SUNUCUDAN ya da shared şablondan (`farkCumlesi`,
 * `kovaCumlesi`): panelde ikinci bir cümle üreticisi doğduğu anda
 * sunucununkinden ayrışırdı.
 */

export type KreatifGorunumu = 'yeni' | 'tumu';

export interface KreatifSorgusu {
  clientId: string;
  kume: string | null;
  gorunum: KreatifGorunumu;
  kova: Kova | null;
  sayfa: number;
}

/** Liste ucunun adresi; elle birleştirme yok (CLAUDE.md "bağlantıyı elle birleştirme"). */
export function kreatifZekaYolu(q: KreatifSorgusu): string {
  return baglanti('/kreatif-zeka', {
    clientId: q.clientId,
    kume: q.kume ?? undefined,
    gorunum: q.gorunum,
    kova: q.kova ?? undefined,
    sayfa: q.sayfa > 1 ? String(q.sayfa) : undefined,
  });
}

/** Görsel KULLANIM ANINDA tazeleniyor; liste yanıtında adres yok. */
export function gorselYolu(creativeId: string): string {
  return `/kreatif-zeka/kreatifler/${encodeURIComponent(creativeId)}/gorsel`;
}

/** İyileştir'in Kreatifler sekmesi (bekleyen işler ve bağlantılar). */
export function kreatiflerAdresi(clientId: string): string {
  return baglanti('/iyilestir', { musteri: clientId, sekme: 'kreatifler' });
}

/** Kova cümlesi yorgunluk önerisine bağlanıyorsa gideceği yer: AYNI ekranın Öneriler sekmesi. */
export function onerilerAdresi(clientId: string): string {
  return baglanti('/iyilestir', { musteri: clientId, sekme: 'oneriler' });
}

/** Brief ile açılan AdvCampaign oturumu (AdvStrategy aktarımıyla aynı adres biçimi). */
export function advcampaignAdresi(clientId: string, oturumId: string): string {
  return baglanti('/reklam', { musteri: clientId, oturum: oturumId });
}

/**
 * Çağrı düşerse BOŞ LİSTE DEĞİL, sebebiyle bir hata: boş liste "kreatif
 * yok" demek ve düşen bir çağrıyı "incelenecek görsel yok"a çevirirdi.
 */
export type KreatifSonucu = { durum: 'tamam'; yanit: KreatifZekaYaniti } | { durum: 'hata'; mesaj: string };

/** DÖRT HÂL AYRI: yükleniyor, hata (sunucunun cümlesi), boş (nedeniyle), dolu. */
export type KreatifKutuHali = 'yukleniyor' | 'hata' | 'bos' | 'dolu';

export function kreatifKutuHali(sonuc: KreatifSonucu | null): KreatifKutuHali {
  if (sonuc === null) return 'yukleniyor';
  if (sonuc.durum === 'hata') return 'hata';
  return sonuc.yanit.satirlar.length === 0 ? 'bos' : 'dolu';
}

/** Sekme rozeti: yeni kreatiflerden "Dikkat" kovasındakiler. Çağrı düştüyse rozet YOK ("0" yalanı yok). */
export function rozetSayisi(sonuc: KreatifSonucu): number | null {
  return sonuc.durum === 'tamam' ? sonuc.yanit.kovaSayilari.dikkat : null;
}

/** Boş listenin cümlesi NEDENİYLE; nedeni bilinmiyorsa (null) bunu da söylüyor. */
export function bosMetni(neden: KreatifBosNedeni | null): { baslik: string; metin: string; baglanti: 'baglantilar' | null; suzgec: boolean } {
  switch (neden) {
    case 'hesap_yok':
      return { baslik: 'Bu workspace’e reklam hesabı atanmamış', metin: 'Hesap atandığında kreatifler kendiliğinden incelenir.', baglanti: 'baglantilar', suzgec: false };
    case 'kreatif_yok':
      return { baslik: 'Son 90 günde harcaması olan kreatif yok', metin: 'Görsel ya da video reklam yayınlandığında burada görünür.', baglanti: null, suzgec: false };
    case 'yalniz_metin':
      return {
        baslik: 'Bu workspace’te incelenecek görsel yok',
        metin: 'Son 90 günde harcaması olan reklamların hepsi metin reklamı (Google Arama). Görsel ya da video reklam yayınlandığında burada görünür.',
        baglanti: null,
        suzgec: false,
      };
    case 'etiket_bekliyor':
      return { baslik: 'Kreatifler inceleniyor', metin: 'İnceleme her gün sınır kadar ilerliyor; en çok harcayanlar önce.', baglanti: null, suzgec: false };
    case 'suzgec_bos':
      return { baslik: 'Bu süzgeçte kreatif yok', metin: 'Başka bir kova ya da "Tümü" görünümüne bak.', baglanti: null, suzgec: true };
    case null:
      return { baslik: 'Liste boş', metin: 'Sunucu boş listenin nedenini söylemedi.', baglanti: null, suzgec: false };
  }
}

// ─── Etiketleme durumu şeridi ────────────────────────────────────────────────

const GECICI_CUMLESI: Record<GeciciNeden, string> = {
  gemini_kota: 'yapay zekâ kotası dolu',
  gemini_ulasilamadi: 'yapay zekâya ulaşılamadı',
  adres_alinamadi: 'platform görsel adresini vermedi',
  indirme_dustu: 'görsel indirilemedi',
  platform_kotasi: 'platform kotası dolu',
};

const BEKCI_CUMLESI: Record<BekciRetNedeni, string> = {
  workspace_gunluk: 'bugünkü sınır doldu, yarın devam',
  workspace_aylik: 'bu ayın sınırı doldu, gelecek ay devam',
  kuresel_gunluk: 'günlük toplam sınır doldu, yarın devam',
};

/**
 * "288 / 312 kreatif incelendi · 14 sırada (bugünkü sınır doldu) · 10
 * incelenemiyor" ve açılır döküm. SESSİZ KESME YOK: bekleyen ve
 * incelenemeyen ayrı sayılıyor, nedenleriyle.
 */
export function etiketlemeSeridi(o: EtiketlemeOzeti): {
  incelendi: string;
  sirada: string | null;
  incelenemiyor: string | null;
  dokum: Array<{ sayi: number; cumle: string }>;
  sonIs: string | null;
} {
  const bekleyen = o.sayilar.bekliyor;
  const neden =
    o.bekci !== null
      ? `${BEKCI_CUMLESI[o.bekci]} (${o.bugunKullanilan} / ${o.gunlukSinir})`
      : Object.entries(o.bekleyenNedenleri)
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([k, n]) => `${n} tanesinde ${GECICI_CUMLESI[k as GeciciNeden]}`)
          .join(', ') || 'sırada';
  const dokum = Object.entries(o.etiketlenemez)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => ({ sayi: n!, cumle: ETIKETLENEMEZ_CUMLESI[k as keyof typeof ETIKETLENEMEZ_CUMLESI] }))
    .sort((a, b) => b.sayi - a.sayi);
  return {
    incelendi: `${o.sayilar.etiketlendi} / ${o.toplam} kreatif incelendi`,
    sirada: bekleyen > 0 ? `${bekleyen} sırada · ${neden}` : null,
    incelenemiyor: o.sayilar.etiketlenemez > 0 ? `${o.sayilar.etiketlenemez} incelenemiyor` : null,
    dokum,
    sonIs: o.sonIs ? `Son inceleme: ${o.sonIs.not ?? o.sonIs.durum}` : null,
  };
}

// ─── Kart ────────────────────────────────────────────────────────────────────

/** Eşik metni: TL'de "1.000 ₺"; başka para biriminde TL KARŞILIĞI (eşik TL'den çevriliyor, Ç-8). */
export function esikMetni(paraBirimi: string): string {
  const tl = formatMoney(String(HARCAMA_ESIGI_TRY * 1_000_000), 'TRY', { decimals: 0 });
  return paraBirimi === 'TRY' ? tl : `${tl} karşılığı`;
}

/**
 * Kovanın tek satırı. Cümle shared şablonundan (`kovaCumlesi`); yorgunluk
 * önerisi varsa cümle Öneriler'e bağlanıyor ve aynı olay iki ekranda iki
 * dille anlatılmıyor (MIMARI Ç-10).
 */
export function kovaMetni(s: KreatifSatiri): { kova: Kova; ad: string; cumle: string; oneriye: boolean } | null {
  if (!s.kova) return null;
  return {
    kova: s.kova.kova,
    ad: KOVA_ADI[s.kova.kova],
    cumle: kovaCumlesi(s.kova, s.puan, formatMoney(s.harcamaMicros, s.paraBirimi, { decimals: 0 }), esikMetni(s.paraBirimi)),
    oneriye: s.kova.yorgunlukOnerisi,
  };
}

/** Puan yoksa NEDENİ (halka "yok" yazıyor, başlıkta bu cümle). */
export function puanYokCumlesi(p: PuanSonucu, paraBirimi: string): string | null {
  if (p.puan !== null) return null;
  switch (p.neden) {
    case 'harcama_az':
      return `Puan için en az ${esikMetni(paraBirimi)} harcama gerekiyor`;
    case 'benzer_az':
      return `Karşılaştırılacak ${p.benzer} benzer var, en az 5 gerekiyor`;
    case 'metrik_yok':
      return 'Bu amaçta ölçülecek sonuç henüz yok';
  }
}

/** Puan halkasının çizgi uzunluğu (r=19). */
export function halkaCizgisi(puan: number | null): { dolu: number; cevre: number } {
  const cevre = 2 * Math.PI * 19;
  return { dolu: puan === null ? 0 : (cevre * Math.max(0, Math.min(100, puan))) / 100, cevre };
}

/**
 * Ana metriğin ekrandaki değeri. VERİM ÖLÇEĞİ TERSİNE ÇEVRİLİYOR: sunucu
 * "dönüşüm / ₺" taşıyor (yüksek iyi), ekran "dönüşüm başı maliyet" yazıyor.
 */
export function metrikMetni(metrik: KreatifMetrigi | null, deger: number | null, paraBirimi: string): string {
  if (metrik === null || deger === null || !(deger > 0)) return '-';
  const g = METRIK_GOSTERIMI[metrik];
  if (g.gosterim === 'yuzde') return `%${(deger * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
  // tl_ters: 1 / verim = birim başı TL.
  return formatMoney(String(Math.round((1 / deger) * 1_000_000)), paraBirimi, { decimals: 0 });
}

export function metrikAdi(metrik: KreatifMetrigi | null): string {
  return metrik ? METRIK_GOSTERIMI[metrik].ad : 'Metrik';
}

/**
 * Kartta gösterilen etiket çipleri. İKİ DEĞERLİ ALANDA "YOK" GÖSTERİLMİYOR:
 * "İnsan yok, Logo yok, Fiyat yok..." kartı yokluk listesine çevirirdi;
 * görselde NE OLDUĞU okunmalı. Üç değerliler ve kesin alanlar her zaman.
 */
export function etiketCipleri(e: KreatifEtiketleri | null): string[] {
  if (!e) return [];
  const cikti: string[] = [];
  for (const alan of ETIKET_ALAN_ADLARI) {
    const deger = e[alan] as string | undefined;
    if (!deger) continue;
    if (deger === 'yok' && Object.keys(ETIKET_ETIKETLERI[alan].degerler).length === 2) continue;
    cikti.push(ETIKET_ETIKETLERI[alan].degerler[deger] ?? deger);
  }
  return cikti;
}

export function kismiNotu(k: KreatifSatiri['kismiEtiket']): string | null {
  return k === 'video_kapagi' ? 'Yalnız video kapağı' : k === 'ilk_kart' ? 'Yalnız ilk kart' : null;
}

/** Etiketsiz kartın durumu (ekranda "neden etiket yok" boş kalmasın). */
export function etiketDurumMetni(s: KreatifSatiri): string | null {
  if (s.etiketDurumu === 'etiketlendi') return s.etiketler ? null : 'İncelendi, özellikler bu ekranda gösterilemiyor';
  if (s.etiketDurumu === 'etiketlenemez') {
    const n = s.etiketNedeni;
    return n && n in ETIKETLENEMEZ_CUMLESI ? ETIKETLENEMEZ_CUMLESI[n as keyof typeof ETIKETLENEMEZ_CUMLESI] : 'İncelenemiyor';
  }
  return s.etiketNedeni ? `İnceleme bekliyor: ${GECICI_CUMLESI[s.etiketNedeni as GeciciNeden] ?? s.etiketNedeni}` : 'İnceleme bekliyor';
}

export function platformAdi(s: KreatifSatiri): string {
  return PLATFORM_KISA_ADLARI[s.platform];
}

// ─── Görsel ──────────────────────────────────────────────────────────────────

/**
 * Kart görselinin hâli. HATA SUNUCUNUN CÜMLESİYLE: uç 502 + neden dönüyor
 * ("Görsel alınamadı: sunucu 403"); bunu kırık bir resim ikonuna çevirmek,
 * görselin neden yok olduğunu gizlerdi.
 */
export type GorselHali = { durum: 'yukleniyor' } | { durum: 'tamam'; adres: string } | { durum: 'hata'; mesaj: string };

// ─── "Ne işe yarıyor" ────────────────────────────────────────────────────────

/** Ekranın gösterdiği anlamlı fark üst sınırı (MIMARI § 6): fazlası katlanmış listede, sayısıyla. */
export const GORUNEN_ANLAMLI = BRIEF_EN_FAZLA_BULGU;

export function farkGruplari(farklar: readonly EtiketFarkSatiri[]): { anlamli: EtiketFarkSatiri[]; diger: EtiketFarkSatiri[] } {
  const anlamli = farklar.filter((f) => f.fark.karar === 'anlamli');
  return {
    anlamli: anlamli.slice(0, GORUNEN_ANLAMLI),
    diger: [...anlamli.slice(GORUNEN_ANLAMLI), ...farklar.filter((f) => f.fark.karar !== 'anlamli')],
  };
}

/** "23 ve 41 kreatif (etkin 15 ve 22)". Örneklem ve aralık HER ZAMAN birlikte. */
export function orneklemMetni(f: EtiketFarkSatiri): string {
  const a = f.fark.a;
  const b = f.fark.b;
  if (!a || !b) return '';
  return `${a.kreatif} ve ${b.kreatif} kreatif (etkin ${Math.round(a.etkinOrneklem)} ve ${Math.round(b.etkinOrneklem)})`;
}

/**
 * Aralık çubuğu: bütün anlamlı farklar AYNI eksende (yan yana kıyaslanabilsin).
 * Eksen VERİM yönünde: sağ = daha iyi; maliyet metriğinde cümle bunu
 * "daha düşük maliyet" diye söylüyor. Yüzdeler 0-100.
 */
export function aralikEkseni(farklar: readonly EtiketFarkSatiri[]): (f: EtiketFarkSatiri) => { sifir: number; sol: number; genislik: number; orta: number } | null {
  const uclar = farklar.flatMap((f) => (f.fark.aralik ? [f.fark.aralik[0], f.fark.aralik[1]] : []));
  if (uclar.length === 0) return () => null;
  const min = Math.min(0, ...uclar);
  const max = Math.max(0, ...uclar);
  const genis = max - min || 1;
  const yuzde = (x: number) => Math.round(((x - min) / genis) * 1000) / 10;
  return (f) => {
    if (!f.fark.aralik || f.fark.goreliFark === null) return null;
    const sol = yuzde(f.fark.aralik[0]);
    return { sifir: yuzde(0), sol, genislik: Math.max(1, yuzde(f.fark.aralik[1]) - sol), orta: yuzde(f.fark.goreliFark) };
  };
}

// ─── Brief ───────────────────────────────────────────────────────────────────

export function briefBosMetni(neden: BriefBosNedeni): { baslik: string; metin: string } {
  switch (neden) {
    case 'etiket_yok':
      return { baslik: 'Kreatifler henüz incelenmedi', metin: 'Brief için önce bu kümedeki görsellerin incelenmesi gerekiyor.' };
    case 'kume_kucuk':
      return { baslik: 'Karşılaştırma için kreatif az', metin: 'Brief için en az 10 incelenmiş ve yeterli harcamalı kreatif gerekiyor.' };
    case 'anlamli_fark_yok':
      return { baslik: 'Henüz belirgin bir fark yok', metin: 'Bu kümede hiçbir özellik ötekinden belirgin biçimde iyi değil. Brief için en az bir belirgin fark gerekiyor.' };
    case 'gunluk_sinir':
      return { baslik: 'Bugünkü brief sınırı doldu', metin: 'Yarın yeniden hazırlanabilir. Aynı bulgularla hazırlanan brief zaten kayıtlı.' };
  }
}

export function kumeAdi(anahtar: string): string {
  const [platform, amac] = anahtar.split(':') as [string, AmacGrubu];
  return `${platform === 'meta' ? 'Meta' : 'Google'} · ${AMAC_GRUBU_ADI[amac] ?? amac}`;
}

/** "Kopyala" metni: AdvCampaign'e giden metinle AYNI (shared `briefIstemi`). */
export function briefKopyaMetni(b: KreatifBrief): string {
  return briefIstemi(b, kumeAdi(b.kumeAnahtari));
}

/** `POST /kreatif-zeka/etiketle` yanıtı (sunucudaki `EtiketleYaniti` ile aynı alanlar). */
export interface EtiketleYaniti {
  kuyruga: number;
  zatenKuyrukta: number;
  izlenmeyen: number;
  bekci: BekciRetNedeni | null;
  mesaj: string;
}
