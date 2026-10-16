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
  type Dil,
  sec,
} from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { kreatifSozlugu } from '@/dil/sozlukler/iyilestir-kreatif';

const yerel = (dil: Dil) => (dil === 'en' ? 'en-US' : 'tr-TR');

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
export function bosMetni(
  neden: KreatifBosNedeni | null,
  dil: Dil = 'tr',
): { baslik: string; metin: string; baglanti: 'baglantilar' | null; suzgec: boolean } {
  const d = sec(kreatifSozlugu, dil).bos;
  switch (neden) {
    case 'hesap_yok':
      return { baslik: d.hesapYokBaslik, metin: d.hesapYok, baglanti: 'baglantilar', suzgec: false };
    case 'kreatif_yok':
      return { baslik: d.kreatifYokBaslik, metin: d.kreatifYok, baglanti: null, suzgec: false };
    case 'yalniz_metin':
      return { baslik: d.yalnizMetinBaslik, metin: d.yalnizMetin, baglanti: null, suzgec: false };
    case 'etiket_bekliyor':
      return { baslik: d.etiketBekliyorBaslik, metin: d.etiketBekliyor, baglanti: null, suzgec: false };
    case 'suzgec_bos':
      return { baslik: d.suzgecBosBaslik, metin: d.suzgecBos, baglanti: null, suzgec: true };
    case null:
      return { baslik: d.bilinmeyenBaslik, metin: d.bilinmeyen, baglanti: null, suzgec: false };
  }
}

// ─── Etiketleme durumu şeridi ────────────────────────────────────────────────

/**
 * HESAP BAŞINA son inceleme işi (Ajan 4 N): tek "son iş" bir hesabın
 * arızasını ötekinin başarısının arkasına gizlerdi. Hiç koşmamış hesap da
 * yazılıyor ("hiç incelenmedi" bir cevap). Sorunlu = başarısız ya da beklemede.
 */
export function hesapSatirlari(o: EtiketlemeOzeti, dil: Dil = 'tr'): Array<{ ad: string; cumle: string; sorunlu: boolean }> {
  const d = sec(kreatifSozlugu, dil).serit;
  return o.hesapIsleri.map((h) => {
    if (h.durum === null) return { ad: h.hesapAdi, cumle: d.hicIncelenmedi, sorunlu: true };
    const sorunlu = h.durum === 'failed' || h.durum === 'throttled';
    const etiket = h.durum === 'succeeded' ? d.tamam : h.durum === 'failed' ? d.basarisiz : h.durum === 'throttled' ? d.beklemede : d.suruyor;
    return { ad: h.hesapAdi, cumle: `${etiket}${h.not ? `: ${h.not}` : ''}`, sorunlu };
  });
}

/**
 * Sınırın KENDİ sayısı (Ajan 4, Ö-3): aylık sınır doluyken "40 / 40" yazmak
 * yanlış sınırı gösterirdi. Ürün geneli sınırın workspace'e ait sayısı yok.
 */
function bekciSayisi(o: EtiketlemeOzeti, n: BekciRetNedeni): string {
  if (n === 'workspace_gunluk') return ` (${o.bugunKullanilan} / ${o.gunlukSinir})`;
  if (n === 'workspace_aylik') return ` (${o.buAyKullanilan} / ${o.aylikSinir})`;
  return '';
}

/**
 * "288 / 312 kreatif incelendi · 14 sırada (bugünkü sınır doldu) · 10
 * incelenemiyor" ve açılır döküm. SESSİZ KESME YOK: bekleyen ve
 * incelenemeyen ayrı sayılıyor, nedenleriyle.
 */
export function etiketlemeSeridi(
  o: EtiketlemeOzeti,
  dil: Dil = 'tr',
): {
  incelendi: string;
  sirada: string | null;
  incelenemiyor: string | null;
  dokum: Array<{ sayi: number; cumle: string }>;
  sonIs: string | null;
  hesaplar: Array<{ ad: string; cumle: string; sorunlu: boolean }>;
} {
  const k = sec(kreatifSozlugu, dil);
  const d = k.serit;
  const bekleyen = o.sayilar.bekliyor;
  const neden =
    o.bekci !== null
      ? `${k.bekci[o.bekci]}${bekciSayisi(o, o.bekci)}`
      : Object.entries(o.bekleyenNedenleri)
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([kod, n]) => d.nedenSayisi(n!, k.gecici[kod as GeciciNeden]))
          .join(', ') || d.sirada;
  const dokum = Object.entries(o.etiketlenemez)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([kod, n]) => ({ sayi: n!, cumle: ETIKETLENEMEZ_CUMLESI[kod as keyof typeof ETIKETLENEMEZ_CUMLESI] }))
    .sort((a, b) => b.sayi - a.sayi);
  return {
    incelendi: d.incelendi(o.sayilar.etiketlendi, o.toplam),
    sirada: bekleyen > 0 ? d.siradaSayi(bekleyen, neden) : null,
    incelenemiyor: o.sayilar.etiketlenemez > 0 ? d.incelenemiyor(o.sayilar.etiketlenemez) : null,
    dokum,
    sonIs: o.sonIs ? d.sonIs(o.sonIs.not ?? o.sonIs.durum) : null,
    hesaplar: hesapSatirlari(o, dil),
  };
}

// ─── Kart ────────────────────────────────────────────────────────────────────

/** Eşik metni: TL'de "1.000 ₺"; başka para biriminde TL KARŞILIĞI (eşik TL'den çevriliyor, Ç-8). */
export function esikMetni(paraBirimi: string, dil: Dil = 'tr'): string {
  const tl = formatMoney(String(HARCAMA_ESIGI_TRY * 1_000_000), 'TRY', { decimals: 0, dil });
  return paraBirimi === 'TRY' ? tl : sec(kreatifSozlugu, dil).esik.karsiligi(tl);
}

/**
 * Kovanın tek satırı. Cümle shared şablonundan (`kovaCumlesi`); yorgunluk
 * önerisi varsa cümle Öneriler'e bağlanıyor ve aynı olay iki ekranda iki
 * dille anlatılmıyor (MIMARI Ç-10).
 */
export function kovaMetni(s: KreatifSatiri, dil: Dil = 'tr'): { kova: Kova; ad: string; cumle: string; oneriye: boolean } | null {
  if (!s.kova) return null;
  return {
    kova: s.kova.kova,
    ad: KOVA_ADI[s.kova.kova],
    cumle: kovaCumlesi(s.kova, s.puan, formatMoney(s.harcamaMicros, s.paraBirimi, { decimals: 0, dil }), esikMetni(s.paraBirimi, dil)),
    oneriye: s.kova.yorgunlukOnerisi,
  };
}

/** Puan yoksa NEDENİ (halka "yok" yazıyor, başlıkta bu cümle). */
export function puanYokCumlesi(p: PuanSonucu, paraBirimi: string, dil: Dil = 'tr'): string | null {
  if (p.puan !== null) return null;
  const d = sec(kreatifSozlugu, dil).puanYok;
  switch (p.neden) {
    case 'harcama_az':
      return d.harcamaAz(esikMetni(paraBirimi, dil));
    case 'benzer_az':
      return d.benzerAz(p.benzer);
    case 'metrik_yok':
      return d.metrikYok;
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
export function metrikMetni(metrik: KreatifMetrigi | null, deger: number | null, paraBirimi: string, dil: Dil = 'tr'): string {
  if (metrik === null || deger === null || !(deger > 0)) return '-';
  const g = METRIK_GOSTERIMI[metrik];
  if (g.gosterim === 'yuzde') return `%${(deger * 100).toLocaleString(yerel(dil), { maximumFractionDigits: 2 })}`;
  // tl_ters: 1 / verim = birim başı TL.
  return formatMoney(String(Math.round((1 / deger) * 1_000_000)), paraBirimi, { decimals: 0, dil });
}

export function metrikAdi(metrik: KreatifMetrigi | null, dil: Dil = 'tr'): string {
  return metrik ? METRIK_GOSTERIMI[metrik].ad : sec(kreatifSozlugu, dil).metrik;
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

export function kismiNotu(k: KreatifSatiri['kismiEtiket'], dil: Dil = 'tr'): string | null {
  const d = sec(kreatifSozlugu, dil).kismi;
  return k === 'video_kapagi' ? d.video_kapagi : k === 'ilk_kart' ? d.ilk_kart : null;
}

/** Etiketsiz kartın durumu (ekranda "neden etiket yok" boş kalmasın). */
export function etiketDurumMetni(s: KreatifSatiri, dil: Dil = 'tr'): string | null {
  const d = sec(kreatifSozlugu, dil);
  if (s.etiketDurumu === 'etiketlendi') return s.etiketler ? null : d.etiketDurum.gosterilemiyor;
  if (s.etiketDurumu === 'etiketlenemez') {
    const n = s.etiketNedeni;
    return n && n in ETIKETLENEMEZ_CUMLESI ? ETIKETLENEMEZ_CUMLESI[n as keyof typeof ETIKETLENEMEZ_CUMLESI] : d.etiketDurum.incelenemiyor;
  }
  return s.etiketNedeni
    ? d.etiketDurum.bekliyorNeden(d.gecici[s.etiketNedeni as GeciciNeden] ?? s.etiketNedeni)
    : d.etiketDurum.bekliyor;
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
/**
 * Küçük kutu (tablo) için kısa neden: "Görsel alınamadı: sunucu 403" →
 * "sunucu 403". Tamamı başlıkta (title) kalıyor; boş kutu hiçbir şey söylemezdi.
 */
export function kisaNeden(mesaj: string, dil: Dil = 'tr'): string {
  const kisa = mesaj.replace(/^Görsel alınamadı:?\s*/i, '').trim() || sec(kreatifSozlugu, dil).kisaNedenYok;
  return kisa.length > 18 ? `${kisa.slice(0, 17)}…` : kisa;
}

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
export function orneklemMetni(f: EtiketFarkSatiri, dil: Dil = 'tr'): string {
  const a = f.fark.a;
  const b = f.fark.b;
  if (!a || !b) return '';
  return sec(kreatifSozlugu, dil).orneklem(a.kreatif, b.kreatif, Math.round(a.etkinOrneklem), Math.round(b.etkinOrneklem));
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

export function briefBosMetni(neden: BriefBosNedeni, dil: Dil = 'tr'): { baslik: string; metin: string } {
  const d = sec(kreatifSozlugu, dil).brief;
  switch (neden) {
    case 'etiket_yok':
      return { baslik: d.etiketYokBaslik, metin: d.etiketYok };
    case 'kume_kucuk':
      return { baslik: d.kumeKucukBaslik, metin: d.kumeKucuk };
    case 'anlamli_fark_yok':
      return { baslik: d.farkYokBaslik, metin: d.farkYok };
    case 'gunluk_sinir':
      return { baslik: d.gunlukSinirBaslik, metin: d.gunlukSinir };
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
  desteklenmeyen: number;
  bekci: BekciRetNedeni | null;
  mesaj: string;
}
