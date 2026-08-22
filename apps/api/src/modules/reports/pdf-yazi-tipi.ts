import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PDF YAZI TİPİ — GÖMÜLÜ, VE GÖMÜLMEK ZORUNDA.
 *
 * PDF'in standart yazı tipleri (Helvetica vb.) WinAnsi kodlaması kullanıyor.
 * O kodlamada `ğ`, `ş`, `ı` YOK; `₺` (U+20BA) hiç yok. Gömmeden üretilen bir
 * belgede "Gösterim" ve "₺34.026,44" bozuk çıkar — ve bu SESSİZ bir hata:
 * kütüphane hata vermez, karakteri düşürür ya da kutu basar. Müşteriye giden
 * belgede.
 *
 * DOSYA DEPODA, PAKET DEĞİL. `dejavu-fonts-ttf` paketi 22 TTF taşıyor ve
 * üretim sunucusu paylaşımlı — yanında 11 canlı site var. İki dosya ~1,4 MB
 * ve `git pull` ile geliyor; kurulum maliyeti sıfır.
 */

/**
 * `apps/api` kökünden çözülüyor.
 *
 * Hem geliştirmede (`src/modules/reports`) hem derlenmiş hâlde
 * (`dist/modules/reports`) üç seviye yukarısı `apps/api`. Tek bir yol ikisini
 * de karşılıyor; `process.cwd()` kullanmak worker'ın nereden başlatıldığına
 * bağlı olurdu.
 */
const FONT_DIZINI = resolve(__dirname, '../../../assets/fonts');

export const FONT_DOSYALARI = {
  normal: 'DejaVuSans.ttf',
  bold: 'DejaVuSans-Bold.ttf',
} as const;

/** Süreç ömrü boyunca bir kez okunuyor — dosya başına ~700 KB. */
const onbellek = new Map<string, Buffer>();

/**
 * Yazı tipini okur. YOKSA AÇIKÇA PATLAR.
 *
 * `dizin` parametresi YALNIZCA TEST İÇİN var ve varlığı bir seçim: eksik
 * dosya yolunu sınamanın başka yolu, gerçek dosyayı geçici olarak taşımaktı.
 * İlk yazımda bunun yerine geçersiz bir ANAHTAR gönderen bir test vardı ve
 * o test yanlış sebeple geçiyordu (TypeError alıyordu, benim hatamı değil) —
 * mutasyon denemesinde ortaya çıktı: eksik dosyada sessizce boş tampon
 * döndürmek testi düşürmüyordu.
 *
 * Sessizce standart yazı tipine düşmek en kötü davranış olurdu: PDF üretilir,
 * hata çıkmaz, Türkçe karakterler bozuk gider ve bunu ilk gören müşteri olur.
 */
export function yaziTipiOku(kip: keyof typeof FONT_DOSYALARI, dizin = FONT_DIZINI): Buffer {
  const ad = FONT_DOSYALARI[kip];
  const yol = resolve(dizin, ad);
  const mevcut = onbellek.get(yol);
  if (mevcut) return mevcut;

  let veri: Buffer;
  try {
    veri = readFileSync(yol);
  } catch {
    throw new Error(
      `PDF yazı tipi bulunamadı: ${yol}. Gömülü yazı tipi olmadan rapor PDF'i ` +
        'Türkçe karakterleri ve ₺ işaretini basamaz. Dosya depoda ' +
        '(apps/api/assets/fonts) — deploy sırasında düşmüş olabilir.',
    );
  }
  onbellek.set(yol, veri);
  return veri;
}

/**
 * Yazı tipinin bir karakteri GERÇEKTEN taşıyıp taşımadığı.
 *
 * Bir yazı tipini değiştirmek kolay ve sonucu görünmez: yeni tipte `₺` yoksa
 * belge yine üretilir, yalnızca o işaret kaybolur. Kapsam bu yüzden testte
 * taranıyor — dosyanın adı değil, cmap tablosu okunuyor.
 */
export function glifVarMi(veri: Buffer, kod: number): boolean {
  const tabloSayisi = veri.readUInt16BE(4);
  let cmapOfs: number | null = null;
  for (let i = 0; i < tabloSayisi; i++) {
    const p = 12 + i * 16;
    if (veri.toString('ascii', p, p + 4) === 'cmap') cmapOfs = veri.readUInt32BE(p + 8);
  }
  if (cmapOfs === null) return false;

  const altSayisi = veri.readUInt16BE(cmapOfs + 2);
  let alt: number | null = null;
  for (let i = 0; i < altSayisi; i++) {
    const p = cmapOfs + 4 + i * 8;
    const platform = veri.readUInt16BE(p);
    const enc = veri.readUInt16BE(p + 2);
    // Unicode BMP: (3,1) ya da platform 0.
    if ((platform === 3 && enc === 1) || platform === 0) alt = cmapOfs + veri.readUInt32BE(p + 4);
  }
  if (alt === null || veri.readUInt16BE(alt) !== 4) return false;

  const segX2 = veri.readUInt16BE(alt + 6);
  const seg = segX2 / 2;
  const endO = alt + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;

  for (let i = 0; i < seg; i++) {
    const end = veri.readUInt16BE(endO + i * 2);
    if (kod > end) continue;
    const start = veri.readUInt16BE(startO + i * 2);
    if (kod < start) return false;
    const delta = veri.readInt16BE(deltaO + i * 2);
    const ro = veri.readUInt16BE(rangeO + i * 2);
    if (ro === 0) return ((kod + delta) & 0xffff) !== 0;
    const g = veri.readUInt16BE(rangeO + i * 2 + ro + (kod - start) * 2);
    return g !== 0;
  }
  return false;
}
