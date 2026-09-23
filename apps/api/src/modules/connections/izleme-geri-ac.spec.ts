import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TOPLU İZLEME AÇMA NEYE DOKUNUYOR — kaynak taraması.
 *
 * Bu metodun iki sınırı var ve ikisini de birim testiyle görmek zor, çünkü
 * ikisi de YANLIŞ GİTTİĞİNDE SESSİZ:
 *
 *   1. HAVUZA DOKUNMAMALI. `client_id` NULL satırlar ajansın havuzu ve keşif
 *      onları bilerek `syncEnabled: false` yazıyor. Süzgeç düşerse 481 hesap
 *      birden izlemeye girer, kota patlar ve kimse bir hata görmez — yalnızca
 *      her hesabın kota yüzdesi tavana vurur ve yapı taramaları reddedilmeye
 *      başlar.
 *   2. GEÇMİŞİ YENİDEN ÇEKMEMELİ. Kaldırma metrik satırlarını silmiyor;
 *      `initial_backfill` kuyruğa atmak doksan günü boşuna tekrar çeker ve
 *      Meta'da 37 aylık sınıra, Google'da kotaya yaslanır.
 */

const SRC = readFileSync(join(__dirname, 'connections.service.ts'), 'utf8');

/** `resumeSync` gövdesi — sınır, bir SONRAKİ metodun başlangıcı. */
function govde(): string {
  const kaynak = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const start = kaynak.indexOf('async resumeSync(');
  expect(start, 'resumeSync bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  const sonraki = kaynak.indexOf('\n  async ', start + 10);
  const g = kaynak.slice(start, sonraki > -1 ? sonraki : kaynak.length);
  expect(g.length, 'gövde boş çıktı — tarama boşa düştü').toBeGreaterThan(200);
  return g;
}

describe('izlemeyi toplu geri açma', () => {
  it('KRİTİK: yalnızca ATANMIŞ satırlara dokunuyor — havuz dışarıda', () => {
    const g = govde();
    // İki `updateMany` var (reklam hesabı + sosyal profil) ve İKİSİ de
    // süzgeci taşımak zorunda; birini atlamak o tabloyu havuza açardı.
    const guncellemeler = g.match(/updateMany\(\{[\s\S]*?\}\)/g) ?? [];
    expect(guncellemeler.length, 'updateMany bulunamadı — tarama boşa düştü').toBe(2);
    for (const u of guncellemeler) {
      expect(u).toContain('clientId: { not: null }');
    }
  });

  it('KRİTİK: geçmiş yeniden çekilmiyor', () => {
    // Satırlar silinmedi, veri yerinde. `initial_backfill` boşa kota harcar.
    expect(govde()).not.toContain('initial_backfill');
  });

  it('yapı taraması kuyruğa giriyor — izleme kapalıyken açılan kampanyalar için', () => {
    expect(govde()).toContain("jobType: 'structure'");
  });

  it('kuyruğa alma transaction DIŞINDA', () => {
    /*
      `withTenant` etkileşimli bir transaction ve Prisma'nın sınırı 5 saniye.
      Yüz hesaplık bir `enqueue` döngüsü içeride koşarsa transaction ölür ve
      AÇILAN İZLEME DE GERİ ALINIR — düzeltme, düzeltmeye çalıştığı arızayı
      geri getirir.
    */
    const g = govde();
    const sonTransaction = g.lastIndexOf('withTenant');
    const ilkEnqueue = g.indexOf('this.queue.enqueue');
    expect(ilkEnqueue, 'enqueue bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(ilkEnqueue).toBeGreaterThan(sonTransaction);
  });

  it('uç nokta kayıtlı', () => {
    const ctrl = readFileSync(join(__dirname, 'connections.controller.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(ctrl).toContain("@Post(':id/resume-sync')");
    expect(ctrl).toContain('this.connections.resumeSync(');
  });
});
