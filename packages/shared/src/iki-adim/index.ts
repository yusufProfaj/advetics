import { z } from 'zod';
import type { SessionResponse } from '../types/context';

/**
 * ═══ İKİ ADIMLI DOĞRULAMA (2FA) — SÖZLEŞME ═══
 *
 * Kararlar ve gerekçeleri: `docs/guvenlik/2FA.md` (çelişki tablosu dahil).
 *
 * Yöntem DOĞRULAYICI UYGULAMA (TOTP, RFC 6238): 30 saniyelik adım, 6 hane,
 * HMAC-SHA1. SHA1 bir zayıflık değil, UYUMLULUK kararı: Google
 * Authenticator ve Microsoft Authenticator `algorithm=SHA256` parametresini
 * yok sayıp SHA1 ile kod üretiyor. SHA256 seçmek, kullanıcının telefonunda
 * KABUL EDİLMEYEN kodlar üreten bir kurulum demekti ve sebebi hiçbir ekranda
 * yazmazdı. HMAC içinde SHA1'in çakışma zayıflığı anlamsız.
 *
 * E-POSTA İLE KOD GÖNDERİLMİYOR: SMTP her kurulumda yok (şifre sıfırlama
 * ekranı bunun için ayrı bir hata dalı taşıyor) ve kodu parolayla AYNI
 * kanala göndermek, posta kutusu ele geçmiş birine iki adımı birden verir.
 */

/** Kodun hane sayısı. Uygulamalar 6 haneyi varsayıyor; 8 hane uyumsuzluk riski. */
export const IKI_ADIM_HANE = 6;

/** TOTP adımı (saniye). RFC 6238 varsayılanı; uygulamaların tamamı bunu kullanıyor. */
export const IKI_ADIM_ADIM_SN = 30;

/**
 * Zaman kayması toleransı (adım). ±1 = önceki, şimdiki ve sonraki kod kabul.
 * Telefon saati birkaç saniye kaymış kullanıcı yoksa "kod hatalı" görür ve
 * sebebini bulamaz; ±2'den fazlası ise tahmin penceresini boşuna büyütür.
 */
export const IKI_ADIM_PENCERE = 1;

/** Kurulumda ve yenilemede üretilen kurtarma kodu sayısı. */
export const IKI_ADIM_KURTARMA_SAYISI = 10;

/**
 * Kurtarma kodu uzunluğu (karakter, tiresiz). 12 × 5 bit = 60 bit.
 * Panelde `xxxx-xxxx-xxxx` biçiminde gösteriliyor.
 */
export const IKI_ADIM_KURTARMA_UZUNLUK = 12;

/**
 * Kurtarma kodu alfabesi: Crockford base32 (küçük harf). `i l o u` YOK:
 * kâğıda yazılan kodda `l` ile `1`, `o` ile `0` karışıyor. Kullanıcının
 * yazdığı `i/l` → `1`, `o` → `0` olarak okunuyor (`kurtarmaKoduNormallestir`).
 */
export const IKI_ADIM_KURTARMA_ALFABESI = '0123456789abcdefghjkmnpqrstvwxyz';

/** Art arda bu kadar hatalı denemede hesap kısa süre kilitlenir. */
export const IKI_ADIM_AZAMI_DENEME = 5;

/** İlk kilidin süresi (dakika). Her yeni kilitte ikiye katlanır, en çok 24 saat. */
export const IKI_ADIM_KILIT_DK = 15;

/** Parola doğru, kod bekleniyor: bu ara adımın ömrü (dakika). */
export const IKI_ADIM_BEKLEME_DK = 5;

/**
 * Kullanıcının yazdığı bir kurtarma kodunu karşılaştırılabilir hâle getirir.
 *
 * Boşluk ve tire atılıyor, küçük harfe çevriliyor, karışan harfler
 * düzeltiliyor. PANEL VE API AYNI FONKSİYONU KULLANIYOR: ikisi ayrışırsa
 * panel "biçim doğru" deyip gönderir, API başka bir hash hesaplar ve kod
 * sessizce "hatalı" olur — kullanıcı elindeki tek kurtarma yolunu kaybetti
 * sanır.
 */
export function kurtarmaKoduNormallestir(girdi: string): string {
  return girdi
    .toLowerCase()
    .replace(/[\s-]+/g, '')
    .replace(/[il]/g, '1')
    .replace(/o/g, '0');
}

/** Kurtarma kodunu gösterim biçimine çevirir: `abcd-efgh-jkmn`. */
export function kurtarmaKoduBicimle(kod: string): string {
  return (kod.match(/.{1,4}/g) ?? [kod]).join('-');
}

/**
 * Girilen değer hangi tür kod: 6 haneli doğrulayıcı kodu mu, kurtarma kodu mu.
 *
 * `null` = ikisinin de biçimine uymuyor. Ayrım GİRİŞ ANINDA yapılıyor:
 * biçimi bozuk bir değer deneme hakkı yemeden reddediliyor, yoksa yazım
 * hatası yapan kullanıcı kendini kilitlerdi.
 */
export function ikiAdimKodTuru(girdi: string): 'totp' | 'kurtarma' | null {
  const rakam = girdi.replace(/\s+/g, '');
  if (new RegExp(`^\\d{${IKI_ADIM_HANE}}$`).test(rakam)) return 'totp';
  const k = kurtarmaKoduNormallestir(girdi);
  if (k.length !== IKI_ADIM_KURTARMA_UZUNLUK) return null;
  for (const ch of k) if (!IKI_ADIM_KURTARMA_ALFABESI.includes(ch)) return null;
  return 'kurtarma';
}

const kodAlani = z
  .string()
  .trim()
  .min(1, 'Kodu yaz')
  .max(40)
  .refine((v) => ikiAdimKodTuru(v) !== null, {
    message: `${IKI_ADIM_HANE} haneli kodu ya da bir kurtarma kodunu yaz`,
  });

/** Girişte ikinci adım ve 2FA'yı kapatma: doğrulayıcı kodu YA DA kurtarma kodu. */
export const ikiAdimKodSchema = z.object({ kod: kodAlani });
export type IkiAdimKodGirdisi = z.infer<typeof ikiAdimKodSchema>;

/**
 * Kurulum onayı ve kurtarma kodu yenileme: YALNIZCA doğrulayıcı kodu.
 *
 * Kurulumda kurtarma kodu henüz yok; yenilemede kurtarma kodu kabul etmek,
 * telefonu kaybetmiş birinin elindeki son kâğıtla bütün yeni kodları
 * üretebilmesi demek — o kişi 2FA'yı kapatıp yeniden kurmalı.
 */
export const ikiAdimUygulamaKoduSchema = z.object({
  kod: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ''))
    .refine((v) => new RegExp(`^\\d{${IKI_ADIM_HANE}}$`).test(v), {
      message: `Uygulamadaki ${IKI_ADIM_HANE} haneli kodu yaz`,
    }),
});
export type IkiAdimUygulamaKoduGirdisi = z.infer<typeof ikiAdimUygulamaKoduSchema>;

/**
 * Oturum açıkken kurulum onayı: uygulama kodu + PAROLA.
 *
 * Parola neden yeniden soruluyor: çalınmış bir oturum çerezi, saldırganın
 * kendi telefonuyla 2FA kurmasına yetseydi asıl sahibi bir sonraki girişte
 * kodu bilmediği için hesabından kalıcı olarak dışarıda kalırdı. Girişteki
 * zorunlu kurulumda (ara token) sorulmuyor: o token parolayla az önce üretildi.
 */
export const ikiAdimKurulumOnaySchema = ikiAdimUygulamaKoduSchema.extend({
  parola: z.string().min(1, 'Şifreni yaz').max(128),
});
export type IkiAdimKurulumOnayGirdisi = z.infer<typeof ikiAdimKurulumOnaySchema>;

/** Şirket genelinde zorunluluk (org yöneticisi). */
export const ikiAdimSirketSchema = z.object({ zorunlu: z.boolean() });
export type IkiAdimSirketGirdisi = z.infer<typeof ikiAdimSirketSchema>;

/** Kullanıcının kendi 2FA durumu (Hesabım ekranı). */
export interface IkiAdimDurumu {
  acik: boolean;
  /** Kurulum başlatılmış ama kodla onaylanmamış. */
  kurulumBekliyor: boolean;
  /** Açıldığı an (ISO). */
  acilis: string | null;
  /** Kullanılmamış kurtarma kodu sayısı. */
  kalanKurtarmaKodu: number;
  /** Kullanıcının EV şirketi 2FA'yı zorunlu tutuyor mu (kapatma düğmesi buna bakar). */
  sirketteZorunlu: boolean;
  /**
   * PANELDE SEÇİLİ şirketin ayarı (Ekip & Yetkiler ekranı). Ev şirketinden
   * AYRI alan: ajans yöneticisi bir müşteri şirketine geçtiğinde ayar o
   * şirketin kullanıcılarını etkiliyor, kendi hesabını değil. Tek alanda
   * birleştirmek, yöneticiye "senin şirketin" deyip başka bir şirketin
   * ayarını değiştirtmek olurdu. "Tüm şirketler" görünümünde `null`.
   */
  secilenSirket: { ad: string; zorunlu: boolean; degistirebilir: boolean } | null;
}

/** Kurulum başlangıcı: QR ve elle girilecek anahtar. */
export interface IkiAdimKurulumBilgisi {
  /** Base32 anahtar, dörtlü gruplar hâlinde (elle yazmak için). */
  anahtar: string;
  /** `otpauth://totp/...` adresi. */
  otpauthAdresi: string;
  /** QR kodu: `data:image/svg+xml;base64,...` — `<img>` ile gösterilir. */
  qrAdresi: string;
}

/** Kurulum onayı ve kurtarma kodu yenileme yanıtı. Kodlar YALNIZCA bu yanıtta görünür. */
export interface IkiAdimKurtarmaKodlari {
  kurtarmaKodlari: string[];
}

/**
 * Giriş yanıtı.
 *
 * Parola doğru ama ikinci adım gerekiyorsa OTURUM DEĞİL bu döner ve
 * tarayıcıya yalnızca kısa ömürlü ara çerez yazılır. Ara çerez hiçbir
 * korumalı uca erişim vermiyor (`typ: 'mfa'`, bekçi yalnız `access` kabul
 * ediyor).
 *   · `dogrula` — 2FA açık, kod sor.
 *   · `kurulum` — şirket 2FA'yı zorunlu tutuyor ve kullanıcı henüz
 *     kurmamış; giriş kurulumla birlikte tamamlanır.
 */
export type GirisYaniti = SessionResponse | { ikiAdim: 'dogrula' | 'kurulum' };

export function ikiAdimBekleniyor(y: GirisYaniti): y is { ikiAdim: 'dogrula' | 'kurulum' } {
  return typeof (y as { ikiAdim?: unknown }).ikiAdim === 'string';
}

/** İkinci adım tamamlandı. Kurtarma koduyla girildiyse panel Hesabım'a yönlendirir. */
export interface IkiAdimGirisSonucu {
  kurtarmaKoduKullanildi: boolean;
  kalanKurtarmaKodu: number;
}
