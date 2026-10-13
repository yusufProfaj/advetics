import { describe, expect, it } from 'vitest';
import { kapakSec, sureGoster, videoBilgisiKapaktan, youtubeSecimi } from './rehber-mantik';

/*
 * VIDEO DENETİMİ — panelin kararları (B10 kapak, B15 YouTube seçimi).
 * Bileşen render edilmiyor; ekranın yazdığı değeri seçen saf fonksiyonlar.
 */
describe('kapak seçimi (B10)', () => {
  const medya = [
    { varlikId: 'v1', kapakVarlikId: 'k1', kapakAdaylari: ['k1', 'k2', 'k3'] },
    { varlikId: 'v2', kapakVarlikId: 'x1', kapakAdaylari: ['x1', 'x2'] },
  ];
  it('KRİTİK: adaylardan biri kapak olur, öbür video değişmez', () => {
    const r = kapakSec(medya, 'v1', 'k3');
    expect(r[0]!.kapakVarlikId).toBe('k3');
    expect(r[1]).toBe(medya[1]);
  });
  it('KRİTİK: başka videonun adayı ya da listede olmayan kimlik YOK SAYILIR (yanlış kapakla reklam açılmaz)', () => {
    expect(kapakSec(medya, 'v1', 'x2')).toBe(medya);
    expect(kapakSec(medya, 'v1', 'uydurma')).toBe(medya);
    expect(kapakSec(medya, 'yok', 'k2')).toBe(medya);
  });
  it('seçilen aday kapak olunca video adı yine videonunki', () => {
    const bilgi = new Map([['k2', { ad: 'tanitim.mp4-kapak-2.jpg', onizleme: 'o', en: 1080, boy: 1920 }]]);
    expect(videoBilgisiKapaktan(bilgi, [{ varlikId: 'v', kapakVarlikId: 'k2' }]).get('v')?.ad).toBe('tanitim.mp4');
  });
});

describe('YouTube seçimi (B15)', () => {
  const temel = { videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım', kucukResim: 'https://i.ytimg.com/x.jpg', sureSn: 42, gizlilik: 'public', gomulebilir: true, engel: null };
  it('KRİTİK: gizli video YAZILMAZ, sebep döner (sunucu engeli boş gelse bile panel aynı kuralla bakar)', () => {
    const r = youtubeSecimi({ ...temel, gizlilik: 'private' });
    expect(r.deger).toBeNull();
    expect(r.engel).toMatch(/gizli/);
  });
  it('yerleştirilemeyen video yazılmaz', () => {
    expect(youtubeSecimi({ ...temel, gomulebilir: false }).deger).toBeNull();
  });
  it('temiz video başlık, küçük resim ve süreyle yazılır', () => {
    expect(youtubeSecimi(temel).deger).toEqual({ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım', kucukResim: 'https://i.ytimg.com/x.jpg', sureSn: 42, gizlilik: 'public', gomulebilir: true });
  });
});

describe('süre gösterimi', () => {
  it('saniye ve dakika; bilinmeyen null', () => {
    expect(sureGoster(12.4)).toBe('12 sn');
    expect(sureGoster(65)).toBe('1 dk 05 sn');
    expect(sureGoster(null)).toBeNull();
    expect(sureGoster(0)).toBeNull();
  });
});
