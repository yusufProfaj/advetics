import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ WORKER'IN `failed` DİNLEYİCİSİ ═══
 *
 * Bu kod yalnızca süreç ayağa kalkınca koşuyor: birim testi yok, kaynak
 * taraması var. Taranan kural tek cümle — BullMQ bir işten vazgeçtiğinde
 * `sync_jobs` satırı AÇIK KALMAMALI.
 *
 * Kararın kendisi (`nihaiBasarisizlik`) ayrı bir dosyada ve ÇALIŞTIRILARAK
 * sınanıyor; tarama yalnızca çağrıldığını ve satırın kapatıldığını
 * kilitliyor.
 */
const KAYNAK = readFileSync(join(__dirname, '..', 'worker.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const dinleyici = ((): string => {
  const i = KAYNAK.indexOf("worker.on('failed'");
  if (i === -1) throw new Error('`failed` dinleyicisi bulunamadı — tarama boşa düştü');
  const j = KAYNAK.indexOf("worker.on('error'", i);
  if (j === -1) throw new Error('dinleyicinin sonu bulunamadı — tarama boşa düştü');
  return KAYNAK.slice(i, j);
})();

describe('tarama boşa düşmüyor', () => {
  it('dinleyici gövdesi yakalandı', () => {
    expect(dinleyici).toContain('logger.error');
    expect(dinleyici.length).toBeGreaterThan(300);
  });
});

describe('kuyruk vazgeçtiğinde satır kapanıyor', () => {
  it('KRİTİK: tabloya YAZIYOR, yalnızca log yazmıyor', () => {
    /*
     * Dinleyici uzun süre yalnızca log yazıyordu. `stalled` yolunda işleyici
     * hiç koşmuyor, yani satırı kapatacak başka kimse yok: kayıt sonsuza
     * kadar `running` kalıyor ve toplu tazeleme çubuğu bitmiyor.
     */
    expect(dinleyici).toContain('syncJob.updateMany');
    expect(dinleyici).toContain("status: 'failed'");
    expect(dinleyici).toContain('kuyruk_vazgecti');
  });

  it('KRİTİK: YALNIZCA açık satıra dokunuyor', () => {
    // İşleyici satırı zaten `succeeded` yazmışsa üstüne yazmak, başarılı bir
    // işi başarısız göstermek olurdu. Süzgeç `updateMany`nin `where`inde.
    expect(dinleyici).toContain("status: { in: ['queued', 'running', 'throttled'] }");
  });

  it('KRİTİK: tekrar denenecek iş KAPATILMIYOR', () => {
    // Her düşüşte satırı kapatmak, beş denemesi olan bir işi ilk düşüşte
    // panelde başarısız gösterirdi.
    expect(dinleyici).toContain('nihaiBasarisizlik');
    expect(dinleyici).toContain('if (!nihai) return;');
  });
});
