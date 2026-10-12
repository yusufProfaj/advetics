/**
 * ANLIK FORM ÖNİZLEMESİ — iki kaynağın ORTAK biçimi.
 *
 * Önizleme iki yerden besleniyor: Meta'da duran bir form (rehberin form
 * seçicisi, `GET /reklam/rehber/form-ayrintisi`) ve Advetics'te yazılan form
 * (Marka Merkezi › Formlar oluşturucusu, taslak). İki ayrı önizleme bileşeni
 * yazılsaydı ilk değişiklikte ayrışırdı ve biri kullanıcıya formun
 * göstermediği bir şeyi gösterirdi (CLAUDE.md "AYNI ŞEYİ ÜRETEN İKİNCİ
 * FONKSİYON"). Bu yüzden tek biçim, tek bileşen; kaynağa göre yalnız çevirici
 * farklı.
 *
 * UYDURMA YOK: verisi olmayan alan `null`. "Formda bu ekran yok" ile "Meta'dan
 * okunamadı" AYRI: ikincisi `okunamayanlar` listesine yazılır ve ekranda
 * öyle söylenir. Boş bir teşekkür ekranı çizmek, formda olmayan bir ekranı
 * varmış gibi gösterirdi.
 */
export interface FormOnizlemesi {
  kaynak: 'meta' | 'advetics';
  ad: string;
  /** Meta: `ACTIVE`/`DRAFT`/...; Advetics: `draft`/`published`/... Bilinmiyorsa `null`. */
  durum: string | null;
  /** Giriş ekranı (Meta `context_card`). `null` = formda giriş ekranı yok. */
  giris: { baslik: string | null; maddeler: string[]; dugme: string | null } | null;
  /** Soru ekranının kendi başlığı (Meta `question_page_custom_headline`). */
  soruBasligi: string | null;
  sorular: FormOnizlemeSorusu[];
  /** Gizlilik politikası bağlantısı; `null` = yok ya da okunamadı (`okunamayanlar` ayırır). */
  gizlilik: { adres: string; metin: string | null } | null;
  /**
   * Ek onay kutuları. `null` = OKUNMADI (Meta'nın `legal_content` alt
   * alanları doğrulanmadığı için istenmiyor); `[]` = formda onay kutusu yok.
   */
  onaylar: Array<{ metin: string; zorunlu: boolean }> | null;
  /** Teşekkür ekranı; `null` = yok ya da okunamadı. */
  tesekkur: { baslik: string | null; metin: string | null; dugme: string | null; adres: string | null } | null;
  /**
   * Meta'nın yanıtında BEKLENİP gelmeyen bölümler (Türkçe adlarıyla). Boş
   * değilse önizleme o bölümü "Meta'dan okunamadı" diye yazar.
   */
  okunamayanlar: FormOnizlemeBolumu[];
}

export type FormOnizlemeBolumu = 'sorular' | 'gizlilik' | 'tesekkur';

export interface FormOnizlemeSorusu {
  /** Meta soru türü (`FULL_NAME`, `EMAIL`, `CUSTOM`...). */
  tur: string;
  etiket: string;
  /** Facebook profilinden otomatik dolan standart soru mu (kişi yazmıyor, onaylıyor). */
  otomatikDolu: boolean;
  /** Çoktan seçmeli sorunun seçenekleri; yoksa boş. */
  secenekler: string[];
}

/**
 * Meta'nın standart (profilden dolan) soru türlerinin Türkçe adı. Listede
 * olmayan tür için Meta'nın kendi etiketi gösterilir; o da yoksa türün kendisi:
 * bir ad uydurmak, formda olmayan bir soruyu anlatmak olurdu.
 */
export const META_SORU_ETIKETLERI: Readonly<Record<string, string>> = {
  FULL_NAME: 'Ad soyad',
  FIRST_NAME: 'Ad',
  LAST_NAME: 'Soyad',
  EMAIL: 'E-posta',
  PHONE: 'Telefon',
  CITY: 'Şehir',
  STATE: 'İl',
  PROVINCE: 'İl',
  COUNTRY: 'Ülke',
  ZIP: 'Posta kodu',
  POST_CODE: 'Posta kodu',
  STREET_ADDRESS: 'Adres',
  COMPANY_NAME: 'Firma adı',
  JOB_TITLE: 'Unvan',
  WORK_EMAIL: 'İş e-postası',
  WORK_PHONE_NUMBER: 'İş telefonu',
  DOB: 'Doğum tarihi',
  GENDER: 'Cinsiyet',
  MARITIAL_STATUS: 'Medeni durum',
  MILITARY_STATUS: 'Askerlik durumu',
};
