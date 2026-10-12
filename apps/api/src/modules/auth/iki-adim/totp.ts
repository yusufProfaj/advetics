import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  IKI_ADIM_ADIM_SN,
  IKI_ADIM_AZAMI_DENEME,
  IKI_ADIM_HANE,
  IKI_ADIM_KILIT_DK,
  IKI_ADIM_KURTARMA_ALFABESI,
  IKI_ADIM_KURTARMA_SAYISI,
  IKI_ADIM_KURTARMA_UZUNLUK,
  IKI_ADIM_PENCERE,
  kurtarmaKoduNormallestir,
} from '@advetics/shared';

/**
 * ═══ TOTP (RFC 6238) VE HOTP (RFC 4226) — BAĞIMLILIKSIZ ═══
 *
 * Paket eklenmedi: algoritma bir HMAC ve dört satır bit işlemi, `node:crypto`
 * zaten var. Bir paketin bu kadar küçük bir işi için bağımlılık ağacı ve
 * tedarik zinciri riski taşımaya değmez. Doğruluk RFC'nin KENDİ test
 * vektörleriyle sınanıyor (`iki-adim.spec.ts`) — elle seçilmiş örneklerle
 * değil: RFC 4226 Ek D (HOTP, 10 sayaç) ve RFC 6238 Ek B (TOTP, 6 an).
 *
 * Bu dosya SAF: saat parametre olarak geliyor. `Date.now()` içeride
 * okunsaydı zaman kayması ve adım sınırı testleri yazılamazdı.
 */

// ---------------------------------------------------------------------------
// Base32 (RFC 4648) — doğrulayıcı uygulamaların anahtar biçimi
// ---------------------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Dolgusuz base32. `otpauth://` adresinde dolgu (`=`) kullanılmıyor. */
export function base32Kodla(veri: Buffer): string {
  let bitler = 0;
  let deger = 0;
  let cikti = '';
  for (const bayt of veri) {
    // Yalnızca alt 16 bit tutuluyor: bekleyen en çok 12 bit var ve maske
    // olmadan değer 32 biti aşıp işaret bitine taşardı.
    deger = ((deger << 8) | bayt) & 0xffff;
    bitler += 8;
    while (bitler >= 5) {
      cikti += BASE32[(deger >>> (bitler - 5)) & 31];
      bitler -= 5;
    }
  }
  if (bitler > 0) cikti += BASE32[(deger << (5 - bitler)) & 31];
  return cikti;
}

/** Base32 çözer; boşluk, tire, dolgu ve küçük harf kabul. Geçersiz karakterde FIRLATIR. */
export function base32Coz(metin: string): Buffer {
  const temiz = metin.toUpperCase().replace(/[\s=-]/g, '');
  let bitler = 0;
  let deger = 0;
  const cikti: number[] = [];
  for (const ch of temiz) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error(`Geçersiz base32 karakteri: ${ch}`);
    deger = ((deger << 5) | i) & 0xffff;
    bitler += 5;
    if (bitler >= 8) {
      cikti.push((deger >>> (bitler - 8)) & 0xff);
      bitler -= 8;
    }
  }
  return Buffer.from(cikti);
}

// ---------------------------------------------------------------------------
// HOTP / TOTP
// ---------------------------------------------------------------------------

/** RFC 4226 §5.3: HMAC-SHA1(K, C) → dinamik kesme → `hane` basamak. */
export function hotp(anahtar: Buffer, sayac: bigint, hane: number = IKI_ADIM_HANE): string {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(sayac);
  const h = createHmac('sha1', anahtar).update(c).digest();
  // Son baytın alt dört biti kaydırma; RFC'nin "dynamic truncation"ı.
  const k = (h[h.length - 1] as number) & 0x0f;
  const ikili =
    (((h[k] as number) & 0x7f) << 24) |
    (((h[k + 1] as number) & 0xff) << 16) |
    (((h[k + 2] as number) & 0xff) << 8) |
    ((h[k + 3] as number) & 0xff);
  return String(ikili % 10 ** hane).padStart(hane, '0');
}

/** Bir ana ait TOTP adımı: `floor(unixSaniye / 30)`. */
export function totpAdimi(zamanMs: number, adimSn: number = IKI_ADIM_ADIM_SN): bigint {
  return BigInt(Math.floor(zamanMs / 1000 / adimSn));
}

export function totpKodu(
  anahtar: Buffer,
  zamanMs: number,
  hane: number = IKI_ADIM_HANE,
  adimSn: number = IKI_ADIM_ADIM_SN,
): string {
  return hotp(anahtar, totpAdimi(zamanMs, adimSn), hane);
}

/**
 * Kodu doğrular ve EŞLEŞEN ADIMI döndürür (eşleşme yoksa `null`).
 *
 * ADIM DÖNÜYOR, `true` DEĞİL: tekrar kullanım engeli "bu adımdan büyük mü"
 * sorusunu soruyor ve hangi adımın tuttuğunu bilmeden o soru sorulamaz.
 * ±1 pencerede yalnızca `true` dönseydi, bir önceki adımın kodu şimdiki
 * adım sayılıp aynı kod iki kez geçebilirdi.
 *
 * Pencerenin TAMAMI geziliyor ve karşılaştırma sabit süreli: ilk eşleşmede
 * çıkmak, cevap süresinden hangi adımın tuttuğunu sızdırırdı.
 */
export function totpDogrula(
  anahtar: Buffer,
  kod: string,
  zamanMs: number,
  pencere: number = IKI_ADIM_PENCERE,
): bigint | null {
  const girilen = Buffer.from(kod.replace(/\s+/g, ''));
  const simdi = totpAdimi(zamanMs);
  let bulunan: bigint | null = null;
  for (let d = -pencere; d <= pencere; d++) {
    const adim = simdi + BigInt(d);
    if (adim < 0n) continue;
    const beklenen = Buffer.from(hotp(anahtar, adim));
    if (beklenen.length === girilen.length && timingSafeEqual(beklenen, girilen)) {
      // En YENİ eşleşen adım tutuluyor: aynı kod iki komşu adımda çıkarsa
      // (10⁻⁶ ihtimal) eskisini kaydetmek, yenisinin bir kez daha geçmesine
      // izin verirdi.
      bulunan = adim;
    }
  }
  return bulunan;
}

// ---------------------------------------------------------------------------
// Anahtar, adres, kurtarma kodları
// ---------------------------------------------------------------------------

/** 160 bit rastgele anahtar — RFC 4226 §4'ün önerdiği uzunluk (HMAC-SHA1 blok çıktısı). */
export function yeniTotpAnahtari(): Buffer {
  return randomBytes(20);
}

/**
 * `otpauth://totp/<yayıncı>:<hesap>?secret=...` adresi (Google Authenticator
 * Key Uri Format). Parametreler AÇIKÇA yazılıyor; varsayılan aynı olsa da
 * bir uygulamanın varsayılanına güvenmek, CLAUDE.md'deki "platformun
 * varsayılanına güvenme" kuralının telefondaki karşılığı.
 */
export function otpauthAdresi(anahtar: Buffer, hesap: string, yayinci = 'Advetics'): string {
  const etiket = `${encodeURIComponent(yayinci)}:${encodeURIComponent(hesap)}`;
  const p = new URLSearchParams({
    secret: base32Kodla(anahtar),
    issuer: yayinci,
    algorithm: 'SHA1',
    digits: String(IKI_ADIM_HANE),
    period: String(IKI_ADIM_ADIM_SN),
  });
  return `otpauth://totp/${etiket}?${p.toString()}`;
}

/** Elle yazılacak anahtar: dörtlü gruplar (`ABCD EFGH ...`). Uygulamalar boşluğu yok sayıyor. */
export function anahtarGosterimi(anahtar: Buffer): string {
  return (base32Kodla(anahtar).match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * Kurtarma kodları: `IKI_ADIM_KURTARMA_SAYISI` adet, `IKI_ADIM_KURTARMA_UZUNLUK`
 * karakter. Alfabe 32 karakter, yani `bayt & 31` EŞİT dağılımlı (256, 32'ye
 * tam bölünüyor) — modulo sapması yok.
 */
export function yeniKurtarmaKodlari(): string[] {
  const kodlar = new Set<string>();
  while (kodlar.size < IKI_ADIM_KURTARMA_SAYISI) {
    const b = randomBytes(IKI_ADIM_KURTARMA_UZUNLUK);
    let kod = '';
    for (const x of b) kod += IKI_ADIM_KURTARMA_ALFABESI[x & 31];
    kodlar.add(kod);
  }
  return [...kodlar];
}

/**
 * Kurtarma kodunun saklanan özeti. SHA-256, tuzsuz: kod 60 bit RASTGELE
 * (parola değil, sözlükle tahmin edilemez) ve kullanmak için parola da
 * gerekiyor. Argon2 her girişte on kodu tek tek doğrulamak demekti (~0,5 sn
 * işlemci) ve bu, kimliği doğrulanmamış bir uçta kolay bir yük saldırısı.
 */
export function kurtarmaKoduOzeti(girdi: string): string {
  return createHash('sha256').update(kurtarmaKoduNormallestir(girdi)).digest('hex');
}

// ---------------------------------------------------------------------------
// Kaba kuvvet
// ---------------------------------------------------------------------------

/**
 * `basarisiz` hatalı denemeden sonra uygulanacak kilit süresi (ms); 0 = kilit yok.
 *
 * Her `IKI_ADIM_AZAMI_DENEME` hatada bir kilit ve süre her seferinde İKİYE
 * KATLANIYOR (15 dk, 30 dk, 1 sa, … en çok 24 sa). Hesap (2FA.md K-8):
 * ±1 pencereyle bir tahmin ~3/10⁶. Sabit 15 dakika günde 480, yılda
 * ~175.000 tahmin ve ~%41 başarı demekti. Katlanınca ilk ~32 saatte 40
 * tahmin, sonra günde 5: yılda ~1.860 tahmin, ~%0,6. Bu hesap YALNIZCA
 * hak ayırma tek deyimde olduğu için geçerli (`iki-adim-deposu.ts#hakAyir`);
 * kilit okuması ve sayaç ayrı deyimlerken paralel istekler sınırı tamamen
 * aşıyordu (B-1). Formül SQL'de de yazılı ve test ikisini karşılaştırıyor.
 * Meşru kullanıcı yalnızca ilk kilidi görür: beş kez art arda
 * yanlış kod yazan birinin sorunu saat ayarı ya da yanlış hesaptır ve ekran
 * bunu söylüyor.
 */
export function kilitSuresiMs(basarisiz: number): number {
  if (basarisiz <= 0 || basarisiz % IKI_ADIM_AZAMI_DENEME !== 0) return 0;
  const kat = basarisiz / IKI_ADIM_AZAMI_DENEME - 1;
  const dk = Math.min(IKI_ADIM_KILIT_DK * 2 ** kat, 24 * 60);
  return dk * 60_000;
}
