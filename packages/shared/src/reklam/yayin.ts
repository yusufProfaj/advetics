/**
 * Yayın durum makinesi (TASARIM.md § 11.3-11.5).
 *
 * Motorun tek görevi: onaylanan şey ile Meta'da açılan şey AYNI olmadıkça
 * para harcayan hiçbir nesne açılmaz; aynı olup olmadığı bilinmiyorsa da
 * açılmaz. Her ara hâl adı, sahibi ve çıkış yolu olan bir durum.
 *
 * DURUM SINIFI `satisfies Record<YayinDurumu, …>`: yeni bir durum eklenip
 * sınıfı yazılmazsa DERLEME kırılır. Elle yazılmış bir dizi bunu yapmaz —
 * üçüncü platformun PDF'ten sessizce kaybolması tam böyle olmuştu.
 */
export const YAYIN_DURUMLARI = [
  'on_kontrol',
  'medya',
  'kuruluyor',
  'uzlastirma',
  'sonuc_belirsiz',
  'kayit_belirsiz',
  'kurulamadi',
  'geri_okuma',
  'fark_var',
  'dogrulanamadi',
  'tekillik_kapisi',
  'aciliyor',
  'kismen_acik',
  'iletildi',
  'incelemede',
  'ogreniyor',
  'yayinda',
  'sorunlu',
  'bekletildi',
  'durduruldu',
  'arsivlendi',
  'kapali_kuruldu',
] as const;
export type YayinDurumu = (typeof YAYIN_DURUMLARI)[number];

export interface DurumSinifi {
  /** Motor kendiliğinden bir sonraki adıma geçer mi. */
  motor: boolean;
  /** Taslak başına tek aktif yayın kuralına girer mi. */
  aktif: boolean;
  /** İlerlemek için birinin düğmeye basması gerekiyor mu. */
  insanBekliyor: boolean;
}

export const YAYIN_DURUM_SINIFI = {
  on_kontrol: { motor: true, aktif: true, insanBekliyor: false },
  medya: { motor: true, aktif: true, insanBekliyor: false },
  kuruluyor: { motor: true, aktif: true, insanBekliyor: false },
  uzlastirma: { motor: true, aktif: true, insanBekliyor: false },
  sonuc_belirsiz: { motor: false, aktif: true, insanBekliyor: true },
  kayit_belirsiz: { motor: false, aktif: true, insanBekliyor: true },
  kurulamadi: { motor: false, aktif: true, insanBekliyor: true },
  geri_okuma: { motor: true, aktif: true, insanBekliyor: false },
  fark_var: { motor: false, aktif: true, insanBekliyor: true },
  dogrulanamadi: { motor: false, aktif: true, insanBekliyor: true },
  tekillik_kapisi: { motor: true, aktif: true, insanBekliyor: false },
  aciliyor: { motor: true, aktif: true, insanBekliyor: false },
  kismen_acik: { motor: false, aktif: true, insanBekliyor: true },
  // İletildi ve sonrası inceleme izlemenin (bölüm 13); motor burada durur.
  iletildi: { motor: false, aktif: true, insanBekliyor: false },
  incelemede: { motor: false, aktif: true, insanBekliyor: false },
  ogreniyor: { motor: false, aktif: true, insanBekliyor: false },
  yayinda: { motor: false, aktif: true, insanBekliyor: false },
  sorunlu: { motor: false, aktif: true, insanBekliyor: true },
  bekletildi: { motor: false, aktif: true, insanBekliyor: false },
  // Durdurulan reklam Meta'da hâlâ bu taslağın ağacı: aynı taslaktan ikinci
  // yayın açılırsa iki kampanya aynı kitleye çıkar. O yüzden AKTİF.
  durduruldu: { motor: false, aktif: true, insanBekliyor: true },
  arsivlendi: { motor: false, aktif: false, insanBekliyor: false },
  kapali_kuruldu: { motor: false, aktif: false, insanBekliyor: false },
} as const satisfies Record<YayinDurumu, DurumSinifi>;

/**
 * İzinli geçişler. Motor bir geçişi yazmadan önce buraya sorar; listede
 * olmayan geçiş bir programlama hatasıdır ve FIRLATIR — "kurulamadi"dan
 * doğrudan "aciliyor"a atlayan bir yol, geri okunmamış bir ağacı açardı.
 */
export const YAYIN_GECISLERI: Readonly<Record<YayinDurumu, readonly YayinDurumu[]>> = {
  on_kontrol: ['medya', 'arsivlendi'],
  medya: ['kuruluyor', 'kurulamadi', 'bekletildi'],
  kuruluyor: ['geri_okuma', 'uzlastirma', 'kurulamadi', 'kayit_belirsiz', 'fark_var', 'dogrulanamadi', 'bekletildi'],
  uzlastirma: ['kuruluyor', 'sonuc_belirsiz', 'kayit_belirsiz'],
  sonuc_belirsiz: ['uzlastirma', 'arsivlendi'],
  kayit_belirsiz: ['kuruluyor', 'arsivlendi'],
  kurulamadi: ['kuruluyor', 'arsivlendi'],
  geri_okuma: ['tekillik_kapisi', 'fark_var', 'dogrulanamadi'],
  fark_var: ['arsivlendi'],
  dogrulanamadi: ['geri_okuma', 'arsivlendi'],
  tekillik_kapisi: ['aciliyor', 'fark_var', 'dogrulanamadi', 'arsivlendi'],
  aciliyor: ['iletildi', 'kismen_acik', 'bekletildi'],
  kismen_acik: ['aciliyor', 'arsivlendi'],
  iletildi: ['incelemede', 'ogreniyor', 'yayinda', 'sorunlu', 'durduruldu', 'arsivlendi'],
  incelemede: ['ogreniyor', 'yayinda', 'sorunlu', 'durduruldu', 'arsivlendi'],
  ogreniyor: ['yayinda', 'sorunlu', 'durduruldu', 'arsivlendi'],
  yayinda: ['ogreniyor', 'sorunlu', 'durduruldu', 'arsivlendi'],
  sorunlu: ['yayinda', 'durduruldu', 'arsivlendi'],
  bekletildi: ['medya', 'kuruluyor', 'aciliyor'],
  durduruldu: ['yayinda', 'arsivlendi'],
  arsivlendi: [],
  kapali_kuruldu: [],
};

export function gecisIzinliMi(nereden: YayinDurumu, nereye: YayinDurumu): boolean {
  return YAYIN_GECISLERI[nereden].includes(nereye);
}

/** `yayin_nesnesi.durum` (§ 11.5 a). */
export const NESNE_DURUMLARI = [
  'bekliyor',
  'gonderiliyor',
  'kuruldu',
  'reddedildi',
  'belirsiz',
  'acildi',
  'arsivlendi',
] as const;
export type NesneDurumu = (typeof NESNE_DURUMLARI)[number];

export const YAYIN_KAYNAKLARI = ['panel', 'ai_kart', 'kopya', 'toplu'] as const;
