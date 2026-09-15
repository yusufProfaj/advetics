import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ DURAN ÇUBUK EKRANDA AÇIKLANIYOR ═══
 *
 * Canlıda bildirilen hâl: "1259 / 1266 iş · tahmini bir dakikadan az",
 * saatlerce değişmedi ve ekran "İşleniyor" yazmaya devam etti. Kullanıcının
 * elinde ne bilgi ne de yapabileceği bir şey vardı; kapatma düğmesi bile
 * yalnızca iş BİTTİĞİNDE çıkıyordu.
 *
 * Panelde bileşen render eden bir test altyapısı yok (vitest.config.ts bunu
 * bilerek reddediyor), bu yüzden kaynak taraması.
 */
const KAYNAK = readFileSync(join(__dirname, 'toplu-tazeleme.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu', () => {
    expect(KAYNAK).toContain('export function TopluTazeleme');
    expect(KAYNAK.length).toBeGreaterThan(3000);
  });
});

describe('takılma görünüyor', () => {
  it('KRİTİK: kayıp iş sayısı EKRANDA', () => {
    /*
     * "İşleniyor" yazan bir ekranda hiçbir işin işlenmediğini kullanıcı
     * ancak saatler sonra anlıyordu.
     *
     * İDDİA ÇİZİM KOŞULUNA ÇAPALI. İlk hâli yalnızca `tani.kayip` dizesini
     * arıyordu ve bloğun TAMAMINI kapatan bir mutasyonda bile geçti: dize
     * bloğun içinde duruyor, çizilip çizilmediğini söylemiyor.
     */
    expect(KAYNAK).toContain('{ilerleme.tani && (');
    expect(KAYNAK).toContain('{ilerleme.tani.kayip} iş kuyrukta yok');
  });

  it('KRİTİK: kuyrukta bekleyen iş ile KAYIP iş ayrı cümle', () => {
    /*
     * İkisi tamamen farklı: bekleyen iş kota penceresi açılınca kendiliğinden
     * koşacak, kayıp işi ise kimse almıyor. Tek cümlede toplamak kullanıcıyı
     * ya boşuna beklemeye ya boşuna müdahaleye gönderir.
     */
    const i = KAYNAK.indexOf('ilerleme.tani.kayip > 0 ?');
    expect(i, 'kayıp/bekleyen dallanması yok').toBeGreaterThan(-1);
    expect(KAYNAK).toContain('kendiliğinden sürecek');
  });

  it('KRİTİK: takılan işler için DÜĞME var', () => {
    expect(KAYNAK).toContain('/kurtar');
    expect(KAYNAK).toContain('Takılan işleri yeniden başlat');
  });

  it('KRİTİK: kurtarma sonucu tek tek yazılıyor', () => {
    // "3 iş yeniden başlatıldı" ile "3 iş kapatıldı" aynı şey değil:
    // ikincisinde o dönemin verisi hiç gelmeyecek.
    for (const alan of ['yenidenKuyruklanan', 'vazgecilen', 'r.kalan']) {
      expect(KAYNAK, `kurtarma sonucunda eksik: ${alan}`).toContain(alan);
    }
  });
});

describe('kutu kapatılabiliyor', () => {
  it('KRİTİK: kapatma düğmesi `bitti` koşuluna BAĞLI DEĞİL', () => {
    /*
     * Eskiden düğme yalnızca `ilerleme.bitti` dalında vardı: bitmeyen bir
     * parti kutuyu kalıcı olarak ekranda bırakıyordu.
     */
    const i = KAYNAK.indexOf('onClick={takibiBirak}');
    expect(i, 'kapatma düğmesi bulunamadı').toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(Math.max(0, i - 400), i);
    expect(dilim).not.toContain('ilerleme.bitti ? (');
  });

  it('takip bırakılınca İŞLER DURMUYOR', () => {
    // Düğme yalnızca yerel kaydı siliyor; sunucuya iptal isteği gitmiyor.
    const i = KAYNAK.indexOf('function takibiBirak');
    const dilim = KAYNAK.slice(i, KAYNAK.indexOf('}', KAYNAK.indexOf('{', i) + 1));
    expect(dilim).toContain('removeItem');
    expect(dilim).not.toContain('apiFetch');
  });
});

describe('hata görünürlüğü', () => {
  it('KRİTİK: kurtarma hatası yutulmuyor', () => {
    const i = KAYNAK.indexOf('async function kurtar');
    expect(i).toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(i, i + 1400);
    expect(dilim).toContain('setHata');
    expect(dilim).not.toContain('catch {}');
  });
});
