import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * SAVEPOINT KARARINI ÇAĞIRAN VERİYOR (Ajan 4, N1).
 *
 * Worker autocommit'te koşuyor; ona SAVEPOINT göndermek her kural turunda
 * reddedilen bir komut demek. API'nin `withTenant` yolu ise transaction
 * içinde ve SAVEPOINT olmadan düşen bildirim yazımı tur kaydını da
 * götürüyor. İkisi de derlemede sessiz: parametre varsayılanlı.
 */
const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('kural bildirimi SAVEPOINT işareti', () => {
  it('worker kuralı transaction DIŞINDA diye çağırıyor', () => {
    const kaynak = yorumsuz('../../queue/sync-processor.service.ts');
    const satir = kaynak.split('\n').find((l) => l.includes('this.executor.execute('));
    if (!satir) throw new Error('worker çağrısı bulunamadı — tarama boşa düşer');
    expect(satir).toMatch(/,\s*false\s*\)/);
  });

  it('API yolu varsayılanı kullanıyor (korumalı)', () => {
    const kaynak = yorumsuz('../rules/rules.controller.ts');
    const satir = kaynak.split('\n').find((l) => l.includes('this.executor.execute('));
    if (!satir) throw new Error('API çağrısı bulunamadı — tarama boşa düşer');
    expect(satir).not.toMatch(/false/);
  });

  it('yürütücü işareti bildirime iletiyor ve varsayılanı true', () => {
    const kaynak = yorumsuz('../rules/rule-executor.service.ts');
    expect(kaynak).toMatch(/transactionIcinde\s*=\s*true/);
    expect(kaynak).toContain('kuralBildirimiGuvenli(tx, rule, run.id, transactionIcinde)');
  });
});
