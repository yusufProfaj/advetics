import { z } from 'zod';

/**
 * ═══ İKİ DİLLİ ARAYÜZ: ÇEKİRDEK (docs/i18n/MIMARI.md) ═══
 *
 * Panel, API ve tanıtım sitesi dili BURADAN okur. Dil kodu kısa (`tr`,
 * `en`) çünkü `users.locale` kolonu 2026-08'den beri `'tr'` taşıyor; biçim
 * kodu (`tr-TR`) ayrı türetiliyor, ikisini karıştırmak `Intl`e geçersiz
 * dil vermek demek.
 */
export const DILLER = ['tr', 'en'] as const;
export type Dil = (typeof DILLER)[number];
export const VARSAYILAN_DIL: Dil = 'tr';

/**
 * Girişsiz ziyaretçinin seçimi. Birinci taraf, zorunlu kategori (seçimi
 * hatırlamaktan başka işi yok); çerez politikası listesinde (`cerez.ts`).
 */
export const DIL_CEREZI = 'adv_dil';
/** Bir yıl. Seçim bir kez sorulur (kullanıcı kararı Ç1). */
export const DIL_CEREZI_SURESI_SN = 365 * 24 * 60 * 60;
/** Paylaşılabilir bağlantı: `?dil=en` seçimi atlayıp İngilizce açar. */
export const DIL_SORGU_ANAHTARI = 'dil';

export function dilMi(x: unknown): x is Dil {
  return typeof x === 'string' && (DILLER as readonly string[]).includes(x);
}

/** `Intl` biçim kodu. Para birimi dile göre DEĞİŞMEZ (hesabın birimi kalır, Ç12). */
export function bicimKodu(dil: Dil): 'tr-TR' | 'en-US' {
  return dil === 'en' ? 'en-US' : 'tr-TR';
}

/**
 * DİL KİMİN? Sıra MIMARI §2'de ve bu fonksiyonda tek yerde: yol öneki >
 * sorgu > profil > çerez. Hiçbiri yoksa `null` = SOR (ilk ziyaret ekranı).
 * `null`ı burada `tr`ye çevirmek, seçim ekranının hiç çıkmaması demek:
 * İngilizce konuşan ziyaretçi Türkçe siteyi görür ve kimse bunu bilmez.
 * Bozuk değer (eski ya da elle yazılmış çerez) YOK sayılır, hata vermez.
 */
export function dilBelirle(g: {
  onek?: string | null;
  sorgu?: string | null;
  profil?: string | null;
  cerez?: string | null;
}): Dil | null {
  for (const aday of [g.onek, g.sorgu, g.profil, g.cerez]) {
    if (dilMi(aday)) return aday;
  }
  return null;
}

/**
 * Tarayıcının diline göre ÖN SEÇİM (yalnız seçim ekranında işaretli gelen
 * seçenek; kararı kişi verir). `Accept-Language: en-GB,en;q=0.9,tr;q=0.8`
 * gibi başlıkta ilk TANINAN dil kazanır; hiçbiri tanınmazsa Türkçe.
 */
export function tarayiciDili(basl: string | null | undefined): Dil {
  for (const parca of (basl ?? '').split(',')) {
    const kod = parca.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (dilMi(kod)) return kod;
  }
  return VARSAYILAN_DIL;
}

/**
 * SÖZLÜK TİPİ. `tr` sözlüğü kaynak; `en: Sozluk<typeof tr>` aynı anahtar
 * kümesini ve aynı fonksiyon imzalarını ŞART koşar, yani eksik ya da fazla
 * anahtar DERLEMEDE kırılır ve ekrana hiçbir zaman anahtar adı ya da boş
 * alan düşmez. Fonksiyon değer interpolasyon ve çoğul içindir; ICU dizgesi
 * yok (çalışma anında çözümleyici = sessiz hata yüzeyi).
 */
export type Sozluk<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => string
    ? (...a: A) => string
    : T[K] extends string
      ? string
      : Sozluk<T[K]>;
};

/** Bir ad alanının iki dili. Panel ve API sözlük dosyaları bunu dışa verir. */
export type IkiDil<T> = { tr: T; en: Sozluk<T> };

export function ikiDil<T>(tr: T, en: Sozluk<T>): IkiDil<T> {
  return { tr, en };
}

/** `en` tipi `Sozluk<T>`; değerler aynı biçimde olduğu için `T` olarak okunabilir. */
export function sec<T>(s: IkiDil<T>, dil: Dil): T {
  return (dil === 'en' ? s.en : s.tr) as T;
}

export const dilGuncelleSchema = z.object({ locale: z.enum(DILLER) });
export type DilGuncelleInput = z.infer<typeof dilGuncelleSchema>;
