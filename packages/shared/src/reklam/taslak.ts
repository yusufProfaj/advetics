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

/**
 * API'nin taslak cevabı. Panel ve API aynı tipi okuyor; ayrı yazılsaydı
 * bir alan eklenip öbür tarafta unutulduğunda TypeScript susardı.
 */
export interface ReklamTaslakKaydi {
  id: string;
  clientId: string;
  durum: TaslakDurumu;
  niyetKodu: string | null;
  adAccountId: string | null;
  aktifSurumNo: number;
  olusturanYuz: OlusturanYuz;
  updatedAt: string;
  alanlar: import('./taslak-alanlari').TaslakAlanlari;
  eksikler: import('./taslak-alanlari').TaslakEksigi[];
  icerikOzeti: string | null;
}

export interface AtifDurumu {
  standart: (typeof ATIF_STANDARTLARI)[number] | null;
  secimAt: string | null;
  /** Ekranda seçim düğmesi mi, "kim çözer: ajans yöneticisi" mi. */
  secebilir: boolean;
}

/** Seçim ekranındaki metinler (TASARIM § 7.7.2); hiçbiri seçili gelmez. */
export const ATIF_SECENEKLERI: ReadonlyArray<{ kod: (typeof ATIF_STANDARTLARI)[number]; baslik: string; aciklama: string }> = [
  {
    kod: 'tik7_gor1',
    baslik: 'Tıklayıp 7 gün içinde ya da görüp 1 gün içinde dönüşenler',
    aciklama: "Önerilen. Ads Manager'ın varsayılanına en yakın; raporlar Meta'da görünen rakamlarla tutar.",
  },
  {
    kod: 'tik7',
    baslik: 'Yalnız tıklayıp 7 gün içinde dönüşenler',
    aciklama: "En temkinli. Görüntüleme sayılmaz, Meta'nın öğrenmesi yavaşlayabilir.",
  },
];
