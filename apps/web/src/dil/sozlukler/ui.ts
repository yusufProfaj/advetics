import { ikiDil } from '@advetics/shared';

/** Ortak bileşenlerin (`components/ui`) kendi metinleri. */
export const uiSozlugu = ikiDil(
  {
    yukleniyor: 'Yükleniyor',
    tekrarDene: 'Tekrar dene',
    oncekiSayfa: 'Önceki sayfa',
    sonrakiSayfa: 'Sonraki sayfa',
    suzgeciKaldir: 'Süzgeci kaldır',
    suzgecEkle: '+ Süzgeç',
    adimlar: 'Adımlar',
    kapat: 'Kapat',
    eksikVar: 'Eksik var',
    aramaYerTutucu: 'Ad, hesap ya da kimlikle ara',
    sonucSayisi: (n: number, toplam: number) => `${n} / ${toplam} sonuç`,
    secenekSayisi: (n: number) => `${n} seçenek`,
    secenekYok: (q: string) => `“${q}” geçen bir seçenek yok.`,
  },
  {
    yukleniyor: 'Loading',
    tekrarDene: 'Try again',
    oncekiSayfa: 'Previous page',
    sonrakiSayfa: 'Next page',
    suzgeciKaldir: 'Remove filter',
    suzgecEkle: '+ Filter',
    adimlar: 'Steps',
    kapat: 'Close',
    eksikVar: 'Something is missing',
    aramaYerTutucu: 'Search by name, account or ID',
    sonucSayisi: (n, toplam) => `${n} / ${toplam} results`,
    secenekSayisi: (n) => `${n} ${n === 1 ? 'option' : 'options'}`,
    secenekYok: (q) => `No option contains “${q}”.`,
  },
);
