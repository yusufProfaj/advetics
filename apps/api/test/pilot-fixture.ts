import type { PlanUretGirdisi, UyumProfili } from '@advetics/shared';

/**
 * Pilot testlerinin ortak girdisi: sözleşme testindeki örnek workspace'in
 * aynısı (iki platform, üç katman, beş varlık, iki kelime grubu). Ayrı
 * dosyada çünkü birden çok spec aynı planı üretiyor ve kopyalanan bir
 * fixture ilk değişiklikte ayrışır.
 */
export const T = '2026-10-07T06:00:00.000Z';
export const M = 1_000_000n;
export const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function planGirdisi(over: Partial<PlanUretGirdisi> = {}): PlanUretGirdisi {
  return {
    clientId: U(1),
    donem: '2026-11',
    bugun: '2026-10-07',
    simdi: T,
    aylikButce: { id: U(2), micros: 120_000n * M, paraBirimi: 'TRY', guncellendi: T },
    ayHarcanan: { deger: 0n, kaynak: { tur: 'sabit_kural', kimlik: 'GELECEK_AY', zaman: T } },
    hesaplar: [
      { id: U(3), platform: 'meta', paraBirimi: 'TRY' },
      { id: U(4), platform: 'google', paraBirimi: 'TRY' },
    ],
    gecmis: {
      pencere: { from: '2026-07-09', to: '2026-10-06' },
      okundu: T,
      platformlar: [
        { platform: 'meta', harcamaMicros: 50_000n * M, sonuc: 620 },
        { platform: 'google', harcamaMicros: 38_000n * M, sonuc: 380 },
      ],
    },
    marka: { profilId: U(5), guncellendi: T, anaAmac: 'website' },
    kitleler: [
      { id: U(10), ad: 'Varsayılan', katman: 'soguk', varsayilan: true, guncellendi: T },
      { id: U(11), ad: 'Etkileşim 180 gün', katman: 'sicak', varsayilan: false, guncellendi: T },
      { id: U(12), ad: 'Site ziyaretçisi', katman: 'yeniden_pazarlama', varsayilan: false, guncellendi: T },
    ],
    varliklar: [
      { id: U(21), ad: 'ucuz', tur: 'gorsel', yuklendi: '2026-08-01T00:00:00Z', performans: { harcamaMicros: 3_000n * M, sonuc: 60, pencere: { from: '2026-07-09', to: '2026-10-06' }, okundu: T } },
      { id: U(23), ad: 'yeni', tur: 'gorsel', yuklendi: '2026-10-01T00:00:00Z', performans: null },
    ],
    kelimeler: [
      { id: U(30), kelime: 'kahve makinesi', grup: 'Kahve makinesi', aylikArama: 90_500, cekim: T },
      { id: U(32), kelime: 'kahve çekirdeği', grup: 'Kahve çekirdeği', aylikArama: 49_500, cekim: T },
    ],
    ...over,
  };
}

/** Uyumu GEÇEN profil: sektör beyanlı (B2B), özel kategori "hiçbiri", çerez beyanı var. */
export function temizProfil(over: Partial<UyumProfili> = {}): UyumProfili {
  return {
    sektorler: ['B2B_URETICI'],
    sektorMetni: 'Kahve makinesi üretimi',
    ozelKategoriler: [],
    yasalUyari: null,
    kvkkAydinlatmaAdresi: null,
    konutSatisYapan: null,
    cerezRizasiBeyani: null,
    ...over,
  };
}
