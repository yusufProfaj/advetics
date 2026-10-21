import { ikiDil } from '@advetics/shared';

/**
 * Tarih aralığı: ön ayar adları, karşılaştırma seçenekleri, aralık hataları
 * (`lib/date-range.ts`) ve seçici (`components/tarih-secici.tsx`).
 *
 * ÖN AYAR ADLARI ANAHTARLA EŞLİ: `RANGE_PRESETS`in `key` tipi bu nesnenin
 * anahtarlarından türüyor, yani sözlüğe girmemiş bir ön ayar DERLENMEZ
 * (İngilizce menüde Türkçe ya da boş satır kalamaz). Ay ve gün adları
 * sözlükte YOK: `Intl` dile göre üretiyor (`bicimKodu`).
 */
export const tarihSozlugu = ikiDil(
  {
    onAyarlar: {
      bugun: 'Bugün',
      dun: 'Dün',
      bu_hafta: 'Bu hafta (Pzt–Bugün)',
      '7g': 'Son 7 gün',
      gecen_hafta: 'Geçen hafta (Pzt–Paz)',
      '14g': 'Son 14 gün',
      bu_ay: 'Bu ay',
      '30g': 'Son 30 gün',
      gecen_ay: 'Geçen ay',
      '90g': 'Son 90 gün',
      tum_zamanlar: 'Tüm zamanlar',
    },
    ozel: 'Özel',
    /** Rapor linkinde ajansın paylaştığı dönem (`/r/[token]`). */
    paylasilan: 'Paylaşılan aralık',
    karsilastirma: {
      onceki_donem: 'Önceki dönem',
      onceki_yil: 'Önceki yıl',
    },
    hata: {
      gecersiz: 'Özel aralıktaki tarih geçersiz — son 30 güne dönüldü.',
      ters: 'Başlangıç bitişten sonra — tarihler yer değiştirdi.',
    },
    secici: {
      karsilastirmali: '· karşılaştırmalı',
      pencere: 'Tarih aralığı',
      baslangic: 'Başlangıç',
      bitis: 'Bitiş',
      enEskiAraniyor: 'En eski veri günü aranıyor…',
      enEskiAlinamadi: 'En eski veri günü alınamadı.',
      tumZamanlarYedek: (ad: string) => ` “${ad}” şimdilik son 90 günü gösteriyor.`,
      asimOnce: (gun: number, enCok: number) =>
        `Seçilen aralık ${gun} gün. Sunucu en fazla ${enCok} gün tarıyor — uygulandığında `,
      asimSonra: ' tarihinden başlatılacak.',
      karsilastir: 'Karşılaştır',
      karsilastirilacak: (a: string, b: string) => `${a} – ${b} ile karşılaştırılacak.`,
      iptal: 'İptal',
      uygula: 'Uygula',
      oncekiAy: 'Önceki ay',
      sonrakiAy: 'Sonraki ay',
    },
  },
  {
    onAyarlar: {
      bugun: 'Today',
      dun: 'Yesterday',
      bu_hafta: 'This week (Mon–Today)',
      '7g': 'Last 7 days',
      gecen_hafta: 'Last week (Mon–Sun)',
      '14g': 'Last 14 days',
      bu_ay: 'This month',
      '30g': 'Last 30 days',
      gecen_ay: 'Last month',
      '90g': 'Last 90 days',
      tum_zamanlar: 'All time',
    },
    ozel: 'Custom',
    paylasilan: 'Shared period',
    karsilastirma: {
      onceki_donem: 'Previous period',
      onceki_yil: 'Previous year',
    },
    hata: {
      gecersiz: 'The custom range has an invalid date. Showing the last 30 days.',
      ters: 'The start date was after the end date, so the dates were swapped.',
    },
    secici: {
      karsilastirmali: '· compared',
      pencere: 'Date range',
      baslangic: 'Start date',
      bitis: 'End date',
      enEskiAraniyor: 'Looking up the earliest data date…',
      enEskiAlinamadi: 'Could not get the earliest data date.',
      tumZamanlarYedek: (ad) => ` “${ad}” shows the last 90 days for now.`,
      asimOnce: (gun, enCok) =>
        `The selected range is ${gun} days. The server scans at most ${enCok} days; when applied, it will start on `,
      asimSonra: '.',
      karsilastir: 'Compare',
      karsilastirilacak: (a, b) => `Will be compared with ${a} – ${b}.`,
      iptal: 'Cancel',
      uygula: 'Apply',
      oncekiAy: 'Previous month',
      sonrakiAy: 'Next month',
    },
  },
);
