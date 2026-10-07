/**
 * Taslak sözlükleri (TASARIM.md § 02.3, 02.5, 16.2.1).
 *
 * Veritabanındaki CHECK kısıtları BU listelerden yazılıyor ve
 * `reklam-taslak-tablolari.spec.ts` ikisinin ayrışmadığını kilitliyor:
 * kodda yeni bir durum eklenip CHECK unutulursa INSERT üretimde patlar.
 *
 * Taslak durumu kullanıcının işini anlatır; Meta'daki kurulumun ayrıntısı
 * yayın durumunda (`YayinDurumu`). İkisi tek kolonda birleşmez: yayının
 * yirmiden fazla durumu taslak tablosuna taşınırdı.
 */
export const TASLAK_DURUMLARI = ['taslak', 'hazir', 'onayda', 'yayinda', 'arsivlendi'] as const;
export type TaslakDurumu = (typeof TASLAK_DURUMLARI)[number];

export const ONAY_TURLERI = ['ajans', 'musteri', 'ajans_ikinci_goz'] as const;
export type OnayTuru = (typeof ONAY_TURLERI)[number];

export const OLUSTURAN_YUZLER = ['acemi', 'gelismis', 'ai', 'recete', 'kopya', 'toplu'] as const;
export type OlusturanYuz = (typeof OLUSTURAN_YUZLER)[number];

/**
 * Bir alanın değerini KİM yazdı. Gözden geçir'in üç sütunu buradan
 * TÜRETİLİYOR, elle eşlenmiyor. `ai_onerisi` kaynaklı yapısal alan
 * derlenemez: modelin önerisi kullanıcı kabul edene kadar bir karar değil.
 */
export const ALAN_KAYNAKLARI = [
  'kullanici',
  'marka_merkezi',
  'workspace_profili',
  'recete',
  'derleyici',
  'ai_onerisi',
  'meta_okumasi',
] as const;
export type AlanKaynagi = (typeof ALAN_KAYNAKLARI)[number];

/** Yalnız ajans yöneticisi seçer; NULL = seçilmedi = yayın yok (OK-16). */
export const ATIF_STANDARTLARI = ['tik7_gor1', 'tik7'] as const;

export interface AlanDegeri<T = unknown> {
  deger: T;
  kaynak: AlanKaynagi;
  /** Kullanıcı kimliği; sistem yazdıysa null. */
  kim: string | null;
  /** ISO zaman — SUNUCUNUN saati (istemcinin saati sürüme yazılmaz). */
  zaman: string;
}

export const BUTCE_SEVIYELERI = ['kampanya', 'ad_set'] as const;
