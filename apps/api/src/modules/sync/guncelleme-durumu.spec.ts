import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guncellemeDurumu } from './guncelleme-durumu';

const s = (id: string, status: string, error_message: string | null = null) => ({ id, status, error_message });

describe('"Şimdi güncelle" ilerleme sayımı', () => {
  it('KRİTİK: her durum bir kovaya düşüyor — throttled bekleyen, cancelled düşen', () => {
    const r = guncellemeDurumu(
      ['1', '2', '3', '4', '5', '6'],
      [s('1', 'queued'), s('2', 'running'), s('3', 'throttled'), s('4', 'succeeded'), s('5', 'cancelled'), s('6', 'failed', 'kota doldu')],
    );
    expect(r).toEqual({ toplam: 6, bekleyen: 3, biten: 1, dusen: 2, bulunamayan: 0, sonHata: 'kota doldu' });
  });

  it('KRİTİK: tanınmayan yeni durum BEKLEYEN sayılıyor (erken "bitti" demesin)', () => {
    expect(guncellemeDurumu(['1'], [s('1', 'yeni_durum')]).bekleyen).toBe(1);
  });

  it('görünmeyen kimlik ayrı sayılıyor, tekrar eden kimlik bir kez', () => {
    expect(guncellemeDurumu(['1', '1', '2'], [s('1', 'succeeded')])).toMatchObject({ toplam: 2, bulunamayan: 1 });
  });
});

describe('uç ve kuyruk kaynağı', () => {
  const C = readFileSync(join(__dirname, 'sync.controller.ts'), 'utf8');
  const bas = C.indexOf("@Get('refresh/durum')");
  if (bas === -1) throw new Error('refresh/durum ucu bulunamadı — tarama boşa düştü');
  const govde = C.slice(bas, C.indexOf('return guncellemeDurumu(idler, satirlar);', bas));

  it('KRİTİK: sorgu RLS altında (withTenant) ve yetkili', () => {
    // Kimlikler istemciden geliyor; RLS'siz sorgu başka workspace'in işini sızdırırdı.
    expect(govde).toContain('this.prisma.withTenant(ctx');
    expect(govde).toContain("@RequirePermissions('sync.trigger')");
    expect(govde).toMatch(/\\d\{1,19\}/);
  });

  it('refresh izlenen kimlikleri döndürüyor', () => {
    expect(C).toContain('isler: izlenenIsler');
    expect(C.match(/if \(res\.syncJobId\) izlenenIsler\.push\(res\.syncJobId\);/g)).toHaveLength(2);
  });

  it('KRİTİK: kuyrukta zaten olan iş de kimliğini döndürüyor', () => {
    const Q = readFileSync(join(__dirname, '../../queue/sync-queue.service.ts'), 'utf8');
    const i = Q.indexOf("reason: `zaten kuyrukta");
    expect(i).toBeGreaterThan(-1);
    expect(Q.slice(i - 500, i)).toContain('syncJobId: (existing.data');
  });
});
