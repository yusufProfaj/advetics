import { ikiDil } from '@advetics/shared';

/**
 * ADVCAMPAIGN 5. ADIM: Bütçe (`components/rehber/adim-butce.tsx`). Tutar
 * ayrıştırma hataları (`tutarOku`) shared'dan, D4'te.
 */
export const reklamButceSozlugu = ikiDil(
  {
    gunluk: ' / gün',
    toplam: ' toplam',
    soru: 'Ne kadar harcayalım, ne zamana kadar?',
    ikisi: 'Toplam tutarı yaz; iki platform arasında nasıl bölüneceğini öneriyoruz.',
    tek: 'Tutarı ve süreyi seç.',
    turu: 'Bütçe türü',
    turGunluk: 'Günlük',
    turToplam: 'Toplam',
    gunlukTutar: 'Günlük tutar',
    toplamTutar: (gun: number | null) => (gun ? `Toplam tutar (${gun} gün)` : 'Toplam tutar'),
    baslangic: 'Başlangıç',
    bitis: 'Bitiş',
    bitisYok: 'Bitiş yok',
    gunSecenegi: (n: number) => `${n} gün`,
    gunlukIpucu: (google: boolean) =>
      `${google ? "Google bazı günler günlük tutarın iki katına kadar harcayabilir; ay toplamı yine de günlük × 30,4'ü geçmez. " : ''}Bütçe türü kampanya başladıktan sonra değiştirilemiyor.`,
    toplamIpucu: 'Toplam tutar seçtiğin süreye yayılır. Bütçe türü kampanya başladıktan sonra değiştirilemiyor.',
    paylasim: 'İki platforma paylaşım',
    onerilen: 'Önerilen',
    metaPayi: 'Meta payı',
    payAyarladin: 'Payı sen ayarladın. Sonuçlar gelince İyileştir, parayı daha ucuza sonuç veren tarafa kaydırmayı önerir.',
    payEsit: 'İlk iki hafta eşit başlıyoruz. Sonuçlar gelince İyileştir, parayı daha ucuza sonuç veren tarafa kaydırmayı önerir.',
  },
  {
    gunluk: ' / day',
    toplam: ' total',
    soru: 'How much should we spend, and until when?',
    ikisi: 'Enter the total amount; we suggest how to split it between the two platforms.',
    tek: 'Choose the amount and the duration.',
    turu: 'Budget type',
    turGunluk: 'Daily',
    turToplam: 'Total',
    gunlukTutar: 'Daily amount',
    toplamTutar: (gun: number | null) => (gun ? `Total amount (${gun} ${gun === 1 ? 'day' : 'days'})` : 'Total amount'),
    baslangic: 'Start',
    bitis: 'End',
    bitisYok: 'No end date',
    gunSecenegi: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
    gunlukIpucu: (google: boolean) =>
      `${google ? 'Google may spend up to twice the daily amount on some days; the monthly total still does not exceed daily × 30.4. ' : ''}The budget type cannot be changed after the campaign starts.`,
    toplamIpucu: 'The total amount is spread over the duration you choose. The budget type cannot be changed after the campaign starts.',
    paylasim: 'Split between the two platforms',
    onerilen: 'Recommended',
    metaPayi: 'Meta share',
    payAyarladin: 'You adjusted the split. Once results come in, Optimize suggests shifting money to the side that delivers results more cheaply.',
    payEsit: 'We start with an even split for the first two weeks. Once results come in, Optimize suggests shifting money to the side that delivers results more cheaply.',
  },
);
