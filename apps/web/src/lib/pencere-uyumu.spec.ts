import { describe, expect, it } from 'vitest';
import { raporPenceresi, gunEkle, pencerelerIcin } from '@advetics/shared';
import { RANGE_PRESETS } from './date-range';

/**
 * ═══ AYRIŞMA BEKÇİSİ: PANEL ile ZAMANLANMIŞ RAPOR AYNI PENCEREYİ ÜRETMELİ ═══
 *
 * Panelde kullanıcı "Son 7 gün" seçip raporu görüyor; zamanlanmış gönderim
 * aynı anahtarla WORKER'da koşuyor. İkisi farklı bir dönem üretirse müşteriye
 * giden belge, ajansın ekranda gördüğünden başka bir şey olur — ve fark
 * hiçbir yerde görünmez.
 *
 * Pencere hesabı `@advetics/shared` içinde TEK YERDE ve `date-range.ts` onu
 * kullanıyor; bu test o bağın kopmadığını kilitliyor. Biri bir gün panelde
 * yerel bir hesap yazarsa burada düşer.
 *
 * KIRPMA DA DAHİL. Panel `raporlar/page.tsx` içinde bitişi DÜNE kırpıyor
 * (`rapor-araligi.spec.ts` bunu ayrıca kilitliyor); `raporPenceresi` aynı
 * kırpmayı kendi içinde yapıyor. Bu test ikisinin sonucunu karşılaştırıyor.
 */

/** Panelin yaptığı kırpmanın aynısı — `raporlar/page.tsx`teki iki satır. */
function panelPenceresi(key: string, bugun: string): { from: string; to: string } | null {
  const on = RANGE_PRESETS.find((x) => x.key === key);
  if (!on) return null;
  const ham = on.pencere(bugun, null);
  const dun = gunEkle(bugun, -1);
  const to = ham.to > dun ? dun : ham.to;
  if (ham.from > to) return null;
  return { from: ham.from, to };
}

/** Planlanabilir bütün pencereler — matristen türetiliyor, elle yazılmıyor. */
const PLANLANABILIR = [
  ...new Set([...pencerelerIcin('weekly'), ...pencerelerIcin('monthly')].map((p) => p.key)),
];

describe('paylaşılan pencere hesabı panelle aynı', () => {
  it('planlanabilir pencere listesi BOŞ DEĞİL — tarama boşa düşmesin', () => {
    /*
     * Bu iddia olmadan aşağıdaki döngü sıfır kez koşabilir ve test her zaman
     * geçerdi. CLAUDE.md: "Tarama BOŞA DÜŞEBİLİR ... dilim bulunamazsa HATA
     * FIRLAT."
     */
    expect(PLANLANABILIR.length).toBeGreaterThanOrEqual(4);
  });

  // Ay başı, ay ortası, ay sonu ve artık yıl Şubatı: kırpmanın ve ay
  // sınırlarının hepsini kapsıyor.
  const GUNLER = ['2026-09-01', '2026-09-02', '2026-09-15', '2026-09-30', '2028-02-29'];

  for (const key of PLANLANABILIR) {
    for (const bugun of GUNLER) {
      it(`KRİTİK: "${key}" penceresi ${bugun} tarihinde panelle AYNI`, () => {
        expect(raporPenceresi(key, bugun)).toEqual(panelPenceresi(key, bugun));
      });
    }
  }

  it('panelin ön ayar listesi paylaşılan üreticileri kullanıyor — yerel hesap yok', () => {
    /*
     * Yukarıdaki karşılaştırma, iki taraf da AYNI YANLIŞI yaparsa geçerdi.
     * Bu iddia bağın kendisini kontrol ediyor: panelin "Son 7 gün"ü gerçekten
     * dünde bitiyor mu.
     */
    const on = RANGE_PRESETS.find((x) => x.key === '7g');
    expect(on).toBeDefined();
    expect(on!.pencere('2026-09-02', null)).toEqual({ from: '2026-08-26', to: '2026-09-01' });
  });
});
