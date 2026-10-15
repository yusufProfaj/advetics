import { ikiDil } from '@advetics/shared';

/**
 * Yasal sayfaların KABUĞU (`components/landing/yasal-duzen.tsx`) ve veri
 * silme talep durumu kutusu. Belgelerin kendi metni burada DEĞİL: uzun
 * hukuki düzyazı anahtara bölünemiyor, o yüzden `components/yasal/<ad>.tr.tsx`
 * ve `<ad>.en.tsx` çifti olarak duruyor.
 */
export const yasalSozlugu = ikiDil(
  {
    buSayfada: 'Bu sayfada',
    yasalBelgeler: 'Yasal belgeler',
    ustBaslik: 'Yasal',
    sonGuncelleme: 'Son güncelleme',
    kisaca: 'Kısaca:',
    /** Karşı dildeki aynı belgeye giden bağlantının metni. */
    digerDil: 'English',
    /*
     * Ç13 (docs/i18n/MIMARI.md): İngilizce metin Claude'un çevirisi ve
     * bağlayıcı değil. Not yalnız İngilizce sayfada çiziliyor; Türkçe
     * değer tip eşliği için var ve ekrana çıkmıyor.
     */
    ceviriNotu:
      'Bu metin kolaylık için hazırlanmış bir çeviridir. Bağlayıcı olan Türkçe sürümdür.',
    ceviriNotuBaglanti: 'Türkçe sürümü okuyun',
    talep: {
      baslik: 'Silme talebi durumu',
      onayKodu: 'Onay kodu:',
      durum: 'Durum:',
      tamamlandi: 'Tamamlandı',
      basarisiz: 'Başarısız — lütfen bizimle iletişime geçin',
      isleniyor: 'Alındı, işleniyor',
      silinenler: (n: number) =>
        `${n} platform bağlantısı ve bunlara bağlı tüm reklam hesabı kayıtları silindi.`,
      talepTarihi: 'Talep tarihi:',
      tamamlanma: 'Tamamlanma:',
      bulunamadi:
        'Bu koda ait bir talep bulunamadı. Kodu doğru kopyaladığından emin ol veya',
      adreseYaz: 'adresine yaz.',
      /** Tarih biçimi: talep zamanı okuyanın dilinde. */
      yerel: 'tr-TR',
    },
  },
  {
    buSayfada: 'On this page',
    yasalBelgeler: 'Legal documents',
    ustBaslik: 'Legal',
    sonGuncelleme: 'Last updated',
    kisaca: 'In short:',
    digerDil: 'Türkçe',
    ceviriNotu:
      'This is an English translation for convenience. The Turkish version is the binding text.',
    ceviriNotuBaglanti: 'Read the Turkish version',
    talep: {
      baslik: 'Deletion request status',
      onayKodu: 'Confirmation code:',
      durum: 'Status:',
      tamamlandi: 'Completed',
      basarisiz: 'Failed, please contact us',
      isleniyor: 'Received, in progress',
      silinenler: (n) =>
        `${n} platform connection(s) and all ad account records linked to them were deleted.`,
      talepTarihi: 'Requested on:',
      tamamlanma: 'Completed on:',
      bulunamadi:
        'No request was found for this code. Make sure you copied the code correctly, or write to',
      adreseYaz: 'for help.',
      yerel: 'en-GB',
    },
  },
);
