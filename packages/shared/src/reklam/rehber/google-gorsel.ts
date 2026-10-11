/**
 * ═══ GOOGLE GÖRSEL KURALLARI (Dalga 3: Talep Yaratma görsel, Maks. Performans) ═══
 *
 * TEK KAYNAK: eksik listesi (giriş anında), türetme ve API derleyicisi bu
 * dosyayı okuyor. Kural iki yerde yazılırsa ekran "uygun" derken prova
 * reddeder ya da tersi (CLAUDE.md "aynı şeyi üreten ikinci fonksiyon").
 *
 * KAYNAK v25 referansı (2026-10-11 okundu, CANLIDA ÖLÇÜLMEDİ):
 * - `DemandGenMultiAssetAdInfo`: yatay 1.91:1 en az 600×314, kare 1:1 en az
 *   300×300, dikey 4:5 en az 480×600, uzun dikey 9:16 en az 600×1067; oran
 *   payı ±%1; yatay ya da kareden biri ZORUNLU; dördü birlikte en çok 20.
 * - Performance Max "asset requirements": MARKETING_IMAGE (1.91:1) ve
 *   SQUARE_MARKETING_IMAGE (1:1) İKİSİ DE en az 1; PORTRAIT (4:5) isteğe
 *   bağlı; 9:16 GÖRSEL ALANI YOK. Dosya en çok 5120 KB.
 *
 * ORAN PAYI META'NINKİNDEN DAR. `oranBul` (banner-seti) %3 pay veriyor:
 * 1200×640 (1,875) orada "yatay" sayılıyor ama Google ±%1 istiyor ve onu
 * bağlarken `ASPECT_RATIO_NOT_ALLOWED` ile reddediyor ("doğrulama yüklemede
 * değil bağlamada", Google'ın kendi notu). Yani set ayrımı `oranBul`dan,
 * Google'a gidip gidemeyeceği BURADAN.
 *
 * 9:16 GOOGLE'A GİTMİYOR — Talep Yaratma'da alan VAR (`tall_portrait_
 * marketing_images`) ama ölçülmedi; Maks. Performans'ta hiç yok. Engel
 * DEĞİL uyarı: aynı medya Meta Hikâye/Reels için 9:16 taşıyor ve engel,
 * kullanıcıyı Meta'nın en iyi yerleşimini kapatmaya zorlardı. Görselin
 * Google'a gitmediği ekranda yazıyor (sessiz atma yok).
 */
import type { GorselOrani } from '../banner-seti';
import type { GoogleKurgu } from './amaclar';
import { karakterSayisi } from './metin';

export type GoogleGorselOrani = 'yatay' | 'kare' | 'dik45';

export const GOOGLE_GORSEL_KURALI: Record<GoogleGorselOrani, { oran: number; enAzGenislik: number; enAzYukseklik: number; etiket: string }> = {
  yatay: { oran: 1.91, enAzGenislik: 600, enAzYukseklik: 314, etiket: '1.91:1' },
  kare: { oran: 1, enAzGenislik: 300, enAzYukseklik: 300, etiket: '1:1' },
  dik45: { oran: 0.8, enAzGenislik: 480, enAzYukseklik: 600, etiket: '4:5' },
};

/** Google'ın oran payı (±%1). */
export const GOOGLE_ORAN_PAYI = 0.01;
/**
 * 5120 KB. Google'ın kendi örnek sorgusu `file_size <= 5120000` yazıyor;
 * 5120 × 1024 değil 5.120.000 (DAR olanı) seçildi: arada kalan dosya bir
 * tanımda geçip öbüründe düşerdi.
 */
export const GOOGLE_GORSEL_EN_COK_BAYT = 5_120_000;
/** Bir reklamda / varlık grubunda bütün pazarlama görselleri birlikte. */
export const GOOGLE_GORSEL_EN_COK = 20;
/** İşletme adı: iki kurguda da en çok 25 karakter. */
export const GOOGLE_ISLETME_ADI_EN_COK = 25;
/** Maks. Performans: en az bir açıklama 60 karakteri geçmemeli (`SHORT_DESCRIPTION_REQUIRED`). */
export const GOOGLE_KISA_ACIKLAMA = 60;
/** Maks. Performans uzun başlığı (LONG_HEADLINE) en çok 90 karakter. */
export const GOOGLE_UZUN_BASLIK = 90;

export interface GorselOlcusu {
  genislik: number;
  yukseklik: number;
  bayt: number;
}

export function googleGorselOraniMi(o: GorselOrani | null | undefined): o is GoogleGorselOrani {
  return o === 'yatay' || o === 'kare' || o === 'dik45';
}

/** Görsel bu Google alanına gider mi; gitmezse kullanıcının cümlesiyle SEBEBİ. */
export function googleGorselSorunu(oran: GoogleGorselOrani, o: GorselOlcusu): string | null {
  const k = GOOGLE_GORSEL_KURALI[oran];
  if (o.genislik <= 0 || o.yukseklik <= 0) return 'Görselin boyutu okunamadı';
  const sapma = Math.abs(o.genislik / o.yukseklik - k.oran) / k.oran;
  if (sapma > GOOGLE_ORAN_PAYI) return `${o.genislik}×${o.yukseklik} görsel Google için tam ${k.etiket} değil; kırpıp yeniden yükle`;
  if (o.genislik < k.enAzGenislik || o.yukseklik < k.enAzYukseklik) {
    return `${o.genislik}×${o.yukseklik} görsel Google için küçük; ${k.etiket} en az ${k.enAzGenislik}×${k.enAzYukseklik} olmalı`;
  }
  if (o.bayt > GOOGLE_GORSEL_EN_COK_BAYT) return 'Görsel Google için büyük; en çok 5 MB olmalı';
  return null;
}

/** Bu kurgu görselle mi kuruluyor (Arama ve video kurgusu görsel taşımıyor). */
export function googleGorselKurgusuMu(k: GoogleKurgu | null | undefined): k is 'TALEP_YARATMA_GORSEL' | 'MAKS_PERFORMANS' {
  return k === 'TALEP_YARATMA_GORSEL' || k === 'MAKS_PERFORMANS';
}

export interface GoogleGorselBulgusu {
  kod: string;
  seviye: 'engel' | 'uyari';
  metin: string;
}

/**
 * Görsel kurgularının medya kontrolü. `olculer` verilmezse (eski çağıran,
 * ölçü okunamadı) ölçü kontrolü KOŞMAZ — derleyici aynı fonksiyonla yeniden
 * bakıyor, yani bilinmeyen ölçü provaya kadar gider ve orada durur.
 */
export function googleGorselBulgulari(
  kurgu: 'TALEP_YARATMA_GORSEL' | 'MAKS_PERFORMANS',
  medya: ReadonlyArray<{ varlikId: string; kapakVarlikId?: string }>,
  oranlar: ReadonlyMap<string, GorselOrani | null>,
  olculer: ReadonlyMap<string, GorselOlcusu | null> | null | undefined,
): GoogleGorselBulgusu[] {
  const b: GoogleGorselBulgusu[] = [];
  const videolar = medya.filter((x) => x.kapakVarlikId);
  const gorseller = medya.filter((x) => !x.kapakVarlikId);
  if (videolar.length) {
    b.push({ kod: 'G-VIDEO-GITMEZ', seviye: 'uyari', metin: `${videolar.length} video Google'a gitmiyor: Google videoyu YouTube'dan istiyor` });
  }
  const say = { yatay: 0, kare: 0, dik45: 0, dikey: 0, bilinmeyen: 0 };
  for (const g of gorseller) {
    const o = oranlar.get(g.varlikId) ?? null;
    if (o === null) {
      say.bilinmeyen++;
      continue;
    }
    say[o]++;
    if (googleGorselOraniMi(o)) {
      const olcu = olculer?.get(g.varlikId);
      const sorun = olcu ? googleGorselSorunu(o, olcu) : null;
      if (sorun) b.push({ kod: 'G-GORSEL-OLCU', seviye: 'engel', metin: sorun });
    }
  }
  if (say.bilinmeyen) b.push({ kod: 'G-GORSEL-ORAN', seviye: 'engel', metin: `${say.bilinmeyen} görselin boyutu Google'da kullanılamıyor; 1.91:1, 1:1 ya da 4:5 olmalı` });
  if (say.dikey) {
    b.push({
      kod: 'G-GORSEL-DIKEY',
      seviye: 'uyari',
      metin: `${say.dikey} dikey (9:16) görsel Google'a gönderilmiyor${kurgu === 'MAKS_PERFORMANS' ? "; Maks. Performans'ta 9:16 görsel yok" : '; henüz ölçülmedi'}`,
    });
  }
  if (kurgu === 'TALEP_YARATMA_GORSEL') {
    if (say.yatay + say.kare === 0) b.push({ kod: 'G-GORSEL-YOK', seviye: 'engel', metin: 'Google görsel reklamı için en az bir yatay (1.91:1) ya da kare (1:1) görsel ekle' });
  } else {
    if (say.yatay === 0) b.push({ kod: 'G-GORSEL-YATAY', seviye: 'engel', metin: "Maks. Performans için en az bir yatay (1.91:1) görsel ekle" });
    if (say.kare === 0) b.push({ kod: 'G-GORSEL-KARE', seviye: 'engel', metin: 'Maks. Performans için en az bir kare (1:1) görsel ekle' });
  }
  if (say.yatay + say.kare + say.dik45 > GOOGLE_GORSEL_EN_COK) {
    b.push({ kod: 'G-GORSEL-SAYI', seviye: 'engel', metin: `Google'da en çok ${GOOGLE_GORSEL_EN_COK} görsel olur` });
  }
  return b;
}

/**
 * Maks. Performans UZUN BAŞLIĞI — rehberde ayrı bir alan YOK.
 *
 * KARAR (Dalga 3): ana metin 90 karakteri geçmiyorsa uzun başlık ODUR; o
 * cümle kullanıcının reklamın ana mesajı olarak yazdığı metin, yani başka
 * bir metin uydurulmuyor. Geçiyorsa ve 3+ açıklama varsa SONUNCUSU uzun
 * başlık olur, kalanlar açıklama. İkisi de yoksa `null` ve eksik listesi
 * cümleyle söyler.
 *
 * NEDEN AÇIKLAMANIN KENDİSİ DEĞİL (video yolu öyle yapıyor): video
 * reklamında metin satır içi (`AdTextAsset`); Maks. Performans'ta her metin
 * ayrı bir Asset ve aynı metni hem açıklama hem uzun başlık olarak aynı
 * varlık grubuna bağlamak ÖLÇÜLMEDİ. Kırpmak da yok: yarım cümle reklamı
 * göstermez, gizler.
 */
export function pmaxUzunBaslik(anaMetin: string, aciklamalar: readonly string[]): { uzunBasliklar: string[]; aciklamalar: string[] } | null {
  const ana = anaMetin.trim();
  const temiz = aciklamalar.map((s) => s.trim()).filter(Boolean);
  if (ana && karakterSayisi(ana) <= GOOGLE_UZUN_BASLIK && !temiz.includes(ana)) return { uzunBasliklar: [ana], aciklamalar: temiz };
  if (temiz.length >= 3) return { uzunBasliklar: [temiz[temiz.length - 1]!], aciklamalar: temiz.slice(0, -1) };
  return null;
}

/** Görsel kurgularının metin kontrolü (Arama'nınki `eksikler.ts`te). */
export function googleMetinBulgulari(
  kurgu: 'TALEP_YARATMA_GORSEL' | 'MAKS_PERFORMANS',
  m: { anaMetin: string; basliklar: readonly string[]; aciklamalar: readonly string[] },
): GoogleGorselBulgusu[] {
  const b: GoogleGorselBulgusu[] = [];
  const basliklar = m.basliklar.map((s) => s.trim()).filter(Boolean);
  const aciklamalar = m.aciklamalar.map((s) => s.trim()).filter(Boolean);
  if (kurgu === 'TALEP_YARATMA_GORSEL') {
    if (aciklamalar.length === 0) b.push({ kod: 'G-ACIKLAMA-SAYI', seviye: 'engel', metin: 'Google görsel reklamı için en az 1 açıklama gerekiyor' });
    return b;
  }
  if (basliklar.length < 3) b.push({ kod: 'G-BASLIK-SAYI', seviye: 'engel', metin: 'Maks. Performans için en az 3 başlık gerekiyor' });
  const p = pmaxUzunBaslik(m.anaMetin, m.aciklamalar);
  if (!p) {
    b.push({ kod: 'G-UZUN-BASLIK', seviye: 'engel', metin: 'Maks. Performans uzun başlık istiyor: ana metni 90 karaktere indir ya da üçüncü bir açıklama ekle' });
    return b;
  }
  if (p.aciklamalar.length < 2) b.push({ kod: 'G-ACIKLAMA-SAYI', seviye: 'engel', metin: 'Maks. Performans için en az 2 açıklama gerekiyor' });
  if (!p.aciklamalar.some((s) => karakterSayisi(s) <= GOOGLE_KISA_ACIKLAMA)) {
    b.push({ kod: 'G-KISA-ACIKLAMA', seviye: 'engel', metin: `Maks. Performans için en az bir açıklama ${GOOGLE_KISA_ACIKLAMA} karakteri geçmemeli` });
  }
  return b;
}
