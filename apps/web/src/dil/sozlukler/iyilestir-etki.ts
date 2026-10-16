import { ikiDil } from '@advetics/shared';

/**
 * İYİLEŞTİR › ETKİSİ (`lib/etki.ts`, `components/iyilestir/etki-sekmesi.tsx`)
 * ve Öneriler kartının altındaki etki satırı. Sunucunun tek cümlesi
 * (`etki.cumle`), ölçülmeyen değişiklik açıklamaları ve shared'daki durum /
 * yol adları (`ETKI_DURUM_ADI`, `DEGISIKLIK_YOLU_ADI`) çevrilmez (D4).
 */
export const etkiSozlugu = ikiDil(
  {
    /** Ay adları: İngilizcede kısa ("Sep 29"), Türkçede tam ("29 Eylül"). */
    aylar: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    gorunum: { hepsi: 'Hepsi', acik: 'Ölçülüyor', kapali: 'Sonuçlanan' },
    bos: {
      kesifKosmadiBaslik: 'Değişiklikler henüz taranmadı',
      kesifKosmadi: 'Değişiklik kayıtları her sabah taranıyor. İlk tarama bittiğinde son 60 günün değişiklikleri burada görünür.',
      degisiklikYokBaslik: 'Henüz ölçülecek değişiklik yok',
      degisiklikYok: (gun: number) =>
        `Son ${gun} günde Advetics’ten bu workspace’te durdurma ya da bütçe değişikliği yapılmadı. İyileştir önerisi ya da kural uygulandığında etkisi burada görünür.`,
      suzgecBosBaslik: 'Bu süzgeçte değişiklik yok',
      suzgecBos: 'Başka bir süzgeç seç ya da hepsine bak.',
      bilinmeyenBaslik: 'Liste boş, nedeni okunamadı',
      bilinmeyen: 'Bazı kaynaklar okunamadı; yukarıdaki uyarıya bak.',
    },
    yol: {
      kural: (kim: string) => `Kural: ${kim}`,
      olculen: (ad: string, seviye: string) => `ölçülen: ${ad} (${seviye})`,
      birlikte: (n: number) => `${n} değişiklik birlikte ölçüldü`,
    },
    ek: {
      gozlem: (once: string, sonra: string) => `Durmadan önce günde ${once}, sonra ${sonra}.`,
      tiklamaBitti: 'Dönüşüm az olduğu için tıklama maliyetine bakıldı.',
      tiklamaSuruyor: 'Dönüşüm az olduğu için tıklama maliyetine bakılıyor.',
    },
    kanit: {
      once: (aralik: string) => `Önce (${aralik})`,
      sonra: (aralik: string) => `Sonra (${aralik})`,
      olculemedi: 'ölçülemedi',
      alt: (tik: string, donusum: string) => `${tik} tık · ${donusum} dönüşüm`,
      ayniDonem: 'aynı dönemde değişim',
    },
    dipnot: {
      metrikTiklama: 'tıklama başı maliyet',
      metrikDonusum: 'dönüşüm başı maliyet',
      pencere: (n: number) => `${n} günlük pencere, `,
      cumle: (metrik: string, pencere: string, bekleme: number) =>
        `Ölçülen: ${metrik} · ${pencere}dönüşümler ${bekleme} gün beklendi. Meta ya da Google arayüzünden aynı dönemde değişiklik yaptıysanız sonuç onu da içerir.`,
    },
    kart: {
      yukleniyor: 'Etki bilgisi yükleniyor.',
      alinamadi: (mesaj: string) => `Etki bilgisi alınamadı: ${mesaj}`,
      henuz: 'Etkisi, değişiklik sabah taranınca ölçüme alınacak.',
    },
    sekme: {
      kaynakHatasi: 'Bazı kaynaklar okunamadı; liste eksik olabilir.',
      sonHesaplama: (zaman: string, toplam: number, gosterilen: number) =>
        `Son hesaplama ${zaman} · ${toplam} değişiklikten ${gosterilen} tanesi gösteriliyor`,
      suzgec: 'Süzgeç',
      yukleniyor: 'Etkiler yükleniyor',
      okunamadi: 'Etkiler okunamadı.',
      sunucuCevabi: 'Sunucunun cevabı:',
      sunucuyaUlasilamadi: 'Sunucuya ulaşılamadı.',
      tabloEtiketi: 'Değişikliklerin etkisi',
      sutunDegisiklik: 'Değişiklik',
      sutunSonuc: 'Sonuç',
      sutunAyrinti: 'Ayrıntı',
      kapat: 'Kapat',
      olculmeyenler: 'Ölçülmeyen değişiklikler',
      hepsineBak: 'Hepsine bak',
      grafikYukleniyor: 'Grafik yükleniyor.',
      grafikAlinamadi: 'Grafik alınamadı:',
      grafikYok: 'Bu ölçümün günlük grafiği yok (günlük metrik hesaplanamadı).',
      grafikEtiketi: (metrik: string, ad: string) => `Günlük ${metrik}: ${ad} ve değişmeyenler`,
      degisiklik: 'değişiklik',
      ozet: {
        sonuclanan: 'Sonuçlanan',
        olculemedi: (n: number) => `${n} tanesi ölçülemedi`,
        son60: 'son 60 gün',
        iyilesen: 'İyileşen',
        listeEksik: 'listenin tamamı görünmüyor',
        degismeyenlereGore: 'değişmeyenlere göre',
        kotulesen: 'Kötüleşen',
        hepsiGosteriliyor: 'hepsi gösteriliyor',
        olculuyor: 'Ölçülüyor',
        siradaki: (gun: string) => `sıradaki ${gun}`,
        bekleyenYok: 'bekleyen ölçüm yok',
      },
    },
  },
  {
    aylar: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    gorunum: { hepsi: 'All', acik: 'Measuring', kapali: 'Concluded' },
    bos: {
      kesifKosmadiBaslik: 'Changes have not been scanned yet',
      kesifKosmadi: 'Change records are scanned every morning. Once the first scan finishes, the changes of the last 60 days appear here.',
      degisiklikYokBaslik: 'No changes to measure yet',
      degisiklikYok: (gun: number) =>
        `No pauses or budget changes were made from Advetics in this workspace in the last ${gun} days. Their impact appears here once an Optimize recommendation or a rule is applied.`,
      suzgecBosBaslik: 'No changes in this filter',
      suzgecBos: 'Pick another filter or look at all of them.',
      bilinmeyenBaslik: 'The list is empty and the reason could not be read',
      bilinmeyen: 'Some sources could not be read; see the warning above.',
    },
    yol: {
      kural: (kim: string) => `Rule: ${kim}`,
      olculen: (ad: string, seviye: string) => `measured: ${ad} (${seviye})`,
      birlikte: (n: number) => `${n} changes measured together`,
    },
    ek: {
      gozlem: (once: string, sonra: string) => `Per day before the pause ${once}, after it ${sonra}.`,
      tiklamaBitti: 'Cost per click was used because there were few conversions.',
      tiklamaSuruyor: 'Cost per click is being used because there are few conversions.',
    },
    kanit: {
      once: (aralik: string) => `Before (${aralik})`,
      sonra: (aralik: string) => `After (${aralik})`,
      olculemedi: 'not measured',
      alt: (tik: string, donusum: string) => `${tik} clicks · ${donusum} conversions`,
      ayniDonem: 'change over the same period',
    },
    dipnot: {
      metrikTiklama: 'cost per click',
      metrikDonusum: 'cost per conversion',
      pencere: (n: number) => `${n}-day window, `,
      cumle: (metrik: string, pencere: string, bekleme: number) =>
        `Measured: ${metrik} · ${pencere}conversions were awaited for ${bekleme} days. If you made changes in the Meta or Google interface over the same period, the result includes them too.`,
    },
    kart: {
      yukleniyor: 'Loading impact information.',
      alinamadi: (mesaj: string) => `Impact information could not be loaded: ${mesaj}`,
      henuz: 'Its impact will be measured once the change is scanned in the morning.',
    },
    sekme: {
      kaynakHatasi: 'Some sources could not be read; the list may be incomplete.',
      sonHesaplama: (zaman: string, toplam: number, gosterilen: number) =>
        `Last calculated ${zaman} · showing ${gosterilen} of ${toplam} changes`,
      suzgec: 'Filter',
      yukleniyor: 'Loading impact',
      okunamadi: 'Impact could not be read.',
      sunucuCevabi: 'Server response:',
      sunucuyaUlasilamadi: 'Could not reach the server.',
      tabloEtiketi: 'Impact of changes',
      sutunDegisiklik: 'Change',
      sutunSonuc: 'Result',
      sutunAyrinti: 'Details',
      kapat: 'Close',
      olculmeyenler: 'Changes not measured',
      hepsineBak: 'See all',
      grafikYukleniyor: 'Loading chart.',
      grafikAlinamadi: 'Chart could not be loaded:',
      grafikYok: 'There is no daily chart for this measurement (the daily metric could not be calculated).',
      grafikEtiketi: (metrik: string, ad: string) => `Daily ${metrik}: ${ad} and unchanged`,
      degisiklik: 'change',
      ozet: {
        sonuclanan: 'Concluded',
        olculemedi: (n: number) => `${n} could not be measured`,
        son60: 'last 60 days',
        iyilesen: 'Improved',
        listeEksik: 'the full list is not visible',
        degismeyenlereGore: 'compared with unchanged',
        kotulesen: 'Worsened',
        hepsiGosteriliyor: 'all shown',
        olculuyor: 'Measuring',
        siradaki: (gun: string) => `next ${gun}`,
        bekleyenYok: 'no measurements pending',
      },
    },
  },
);
