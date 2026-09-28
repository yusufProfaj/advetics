/**
 * ═══ METRİK SÖZLÜĞÜ ═══
 *
 * Hedef kullanıcı reklamcılık bilmiyor (CLAUDE.md §5) ama Genel Bakış'ın
 * dört ana kartından üçü kısaltmaydı: CPA, ROAS ve alt şeritte CTR, CPC.
 * Açıklama hiçbir yerde yoktu. Başka ekranlarda yalnızca `title`
 * içindeydi, yani dokunmatik ekranda ve ekran okuyucuda hiç görünmüyordu.
 *
 * AD ÖNCE, KISALTMA SONRA. Kısaltma silinmiyor: ajansın uzmanı ve
 * platformların kendi ekranları onu kullanıyor, ve iki adın arasındaki
 * bağı kurmak yeni kullanıcının platformda kendini bulmasını sağlıyor.
 *
 * `iyiYon` AÇIKLAMANIN PARÇASI: "düşük olması iyi" cümlesi olmadan bir
 * maliyet metriğinin kırmızı oku (artış) kullanıcıya bir şey anlatmıyor.
 * Değişim rozetinin rengine karar veren `inverse` bayrağı AYRI kalıyor
 * (`delta-rozeti.tsx`); buradaki alan yalnızca okunacak cümle.
 */
export type TerimAnahtari =
  | 'harcama'
  | 'donusum'
  | 'cpa'
  | 'roas'
  | 'erisim'
  | 'gosterim'
  | 'tik'
  | 'ctr'
  | 'cpc';

export interface Terim {
  /** Ekranda görünen ad — iş dilinde. */
  ad: string;
  /** Platformların kullandığı kısaltma; yoksa `null`. */
  kisaltma: string | null;
  /** Bir iki cümle: ne ölçüyor. */
  aciklama: string;
  /** Hangi yönün iyi olduğu; yön anlamsızsa `null`. */
  iyiYon: 'yuksek' | 'dusuk' | null;
}

export const TERIMLER: Record<TerimAnahtari, Terim> = {
  harcama: {
    ad: 'Harcama',
    kisaltma: null,
    aciklama: 'Seçili dönemde reklamlara ödenen toplam tutar.',
    iyiYon: null,
  },
  donusum: {
    ad: 'Sonuç',
    kisaltma: 'Dönüşüm',
    aciklama:
      'Reklamdan gelen ve senin için değerli olan işlemler: satış, form, arama ya da mesaj. Neyin sayıldığı platform kurulumuna bağlı.',
    iyiYon: 'yuksek',
  },
  cpa: {
    ad: 'Sonuç başı maliyet',
    kisaltma: 'CPA',
    aciklama: 'Bir sonuç için ortalama ne ödediğin. Harcamanın sonuç sayısına bölümü.',
    iyiYon: 'dusuk',
  },
  roas: {
    ad: 'Reklam getirisi',
    kisaltma: 'ROAS',
    aciklama:
      'Reklama harcanan her 1 liranın kaç liralık satış getirdiği. 3,0 = 1 lira harcadın, 3 liralık satış geldi.',
    iyiYon: 'yuksek',
  },
  erisim: {
    ad: 'Erişim',
    kisaltma: null,
    aciklama: 'Reklamı en az bir kez gören farklı kişi sayısı.',
    iyiYon: 'yuksek',
  },
  gosterim: {
    ad: 'Gösterim',
    kisaltma: null,
    aciklama: 'Reklamın ekranda kaç kez gösterildiği. Aynı kişi birden çok kez sayılabilir.',
    iyiYon: 'yuksek',
  },
  tik: {
    ad: 'Tıklama',
    kisaltma: null,
    aciklama: 'Reklama kaç kez tıklandığı.',
    iyiYon: 'yuksek',
  },
  ctr: {
    ad: 'Tıklama oranı',
    kisaltma: 'CTR',
    aciklama: 'Reklamı görenlerin yüzde kaçının tıkladığı. Reklamın ilgi çekip çekmediğini gösterir.',
    iyiYon: 'yuksek',
  },
  cpc: {
    ad: 'Tıklama başı maliyet',
    kisaltma: 'CPC',
    aciklama: 'Bir tıklama için ortalama ne ödediğin.',
    iyiYon: 'dusuk',
  },
};

/** Açıklamanın sonuna eklenen yön cümlesi — tek yerde kurulur. */
export function yonCumlesi(t: Terim): string | null {
  if (t.iyiYon === 'dusuk') return 'Düşük olması iyi.';
  if (t.iyiYon === 'yuksek') return 'Yüksek olması iyi.';
  return null;
}
