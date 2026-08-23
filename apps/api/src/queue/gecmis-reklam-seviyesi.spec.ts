import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { istekPencereleri } from './insights-sync.service';

/**
 * ═══ 90 GÜNLÜK İLK ÇEKİM REKLAM SEVİYESİNİ DE ALIYOR ═══
 *
 * Uzun süre `initial_backfill` yalnızca `campaign` çekiyordu ve gerekçesi
 * kotaydı. Bedeli üretimde görüldü: temmuz raporunun "Öne Çıkan Reklamlar"
 * sayfasında dört Google arama reklamı vardı, tek Meta reklamı yoktu —
 * çünkü reklam kırılımı YALNIZCA gecelik iş (dün) ve 7 günlük geri
 * düzeltmeden geliyordu. O dönemde gecelik senkronize etmeyen bir hesabın
 * reklam verisi hiçbir zaman oluşmuyor ve kendiliğinden de oluşmuyordu.
 *
 * Kota maliyeti bilinerek kabul edildi. Riski taşınabilir kılan şey derin
 * seviyelerde tarih penceresinin parçalanması; bu dosya iki kararı da
 * kilitliyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'insights-sync.service.ts'), 'utf8');

/** `LEVELS_FOR_JOB` defterindeki bir iş türünün seviye listesi. */
function seviyeler(jobType: string): string[] {
  const i = KAYNAK.indexOf('const LEVELS_FOR_JOB');
  expect(i, 'seviye defteri bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  const defter = KAYNAK.slice(i, KAYNAK.indexOf('\n};', i));
  const j = defter.indexOf(`${jobType}: [`);
  expect(j, `${jobType} defterde yok`).toBeGreaterThan(-1);
  return defter
    .slice(j + jobType.length + 3, defter.indexOf(']', j))
    .split(',')
    .map((x) => x.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

describe('geçmiş çekiminde reklam seviyesi', () => {
  it('KRİTİK: `initial_backfill` REKLAM seviyesini çekiyor', () => {
    /*
     * Bu satır olmadan geçmiş bir ayın reklam kırılımı HİÇ oluşmuyor ve
     * "Öne Çıkan Reklamlar" o dönem için kalıcı olarak tek platformlu
     * kalıyor.
     */
    expect(seviyeler('initial_backfill')).toContain('ad');
  });

  it('kampanya ve grup seviyeleri de duruyor', () => {
    // Reklam seviyesi tek başına yetmiyor: metrikler kampanya ve grup
    // satırlarına bağlanıyor ve rapor tabloları o seviyeleri okuyor.
    const s = seviyeler('initial_backfill');
    expect(s).toContain('campaign');
    expect(s).toContain('ad_group');
  });

  it('gün içi iş (`insights_realtime`) reklam seviyesine İNMİYOR', () => {
    /*
     * Gün içinde ad bazlı karar vermek istatistiksel olarak anlamsız —
     * örneklem çok küçük — ve kota tüketimini 20-50× artırıyor. Bu karar
     * mimari dokümandaki L2 tanımı ve değişmedi.
     */
    expect(seviyeler('insights_realtime')).not.toContain('ad');
  });

  it('KRİTİK: DERİN seviyeler tarih penceresini PARÇALIYOR', () => {
    /*
     * Meta insights `time_increment=1` ile gidiyor, yani yanıt GÜN × VARLIK
     * satırı taşıyor. 90 gün × reklam seviyesi tek istekte büyük bir hesapta
     * "Please reduce the amount of data you're asking for" ile düşüyor;
     * sayfa boyutunu yarılayan uyarlama o hatayı karşılıyor ama istek
     * gövdesi zaten çok büyükse yarılamak da yetmiyor.
     */
    expect(KAYNAK).toContain('const DERIN_SEVIYE_PENCERESI');
    const i = KAYNAK.indexOf('const DERIN_SEVIYELER');
    expect(i, 'derin seviye kümesi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const satir = KAYNAK.slice(i, KAYNAK.indexOf('\n', i));
    expect(satir).toContain('ad_group');
    expect(satir).toContain('ad');
  });

  it('KRİTİK: SIĞ seviyeler parçalanmıyor — gereksiz çağrı yok', () => {
    // Kampanya seviyesi bugün 90 günü tek istekte sorunsuz çekiyor; bölmek
    // çağrı sayısını ve dolayısıyla kota tüketimini katlıyor.
    expect(istekPencereleri('campaign', '2026-05-25', '2026-08-22')).toEqual([
      { from: '2026-05-25', to: '2026-08-22' },
    ]);
    expect(istekPencereleri('account', '2026-05-25', '2026-08-22')).toHaveLength(1);
  });

  it('KRİTİK: 90 gün REKLAM seviyesinde altı parçaya bölünüyor', () => {
    const p = istekPencereleri('ad', '2026-05-25', '2026-08-22');
    expect(p).toHaveLength(6);
    // İlk parça tam 15 gün, son parça aralığın SONUNDA bitiyor.
    expect(p[0]).toEqual({ from: '2026-05-25', to: '2026-06-08' });
    expect(p.at(-1)!.to).toBe('2026-08-22');
  });

  it('KRİTİK: parçalar arasında BOŞLUK ve ÖRTÜŞME yok', () => {
    /*
     * Bu testin var oluş sebebi: bir günlük boşluk sessizce eksik veri,
     * bir günlük örtüşme ise iki kez okunan ama upsert sayesinde fark
     * edilmeyen boşa çağrı demek. İkisi de kaynak taramasıyla görünmez.
     */
    const p = istekPencereleri('ad', '2026-05-25', '2026-08-22');
    for (let i = 1; i < p.length; i++) {
      const oncekiSon = new Date(`${p[i - 1]!.to}T00:00:00Z`);
      const buBas = new Date(`${p[i]!.from}T00:00:00Z`);
      const farkGun = (buBas.getTime() - oncekiSon.getTime()) / 86_400_000;
      expect(farkGun, `${i}. parça bitişik değil`).toBe(1);
    }
  });

  it('tek günlük aralık tek parça — bölme kenar durumu', () => {
    expect(istekPencereleri('ad', '2026-08-22', '2026-08-22')).toEqual([
      { from: '2026-08-22', to: '2026-08-22' },
    ]);
  });

  it('KRİTİK: her parça HEMEN yazılıyor — sonda toplu değil', () => {
    /*
     * İş ortasında düşerse (kota, ağ) o ana kadarki günler veritabanında
     * kalmalı; tekrar denemede upsert onları aynen üzerine yazıyor. Sonda
     * yazmak, doksan günlük bir çekimin son adımdaki bir hatayla tamamen
     * boşa gitmesi demekti.
     */
    const i = KAYNAK.indexOf('for (const pencere of istekPencereleri(');
    expect(i, 'pencere döngüsü bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n    }', i));
    expect(govde).toContain('await this.writeRows(account, level, result)');
  });
});
