import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlatformApiError } from '../modules/connections/provider.types';
import { SyncProcessorService } from './sync-processor.service';

/**
 * ═══ GOOGLE'IN ORTAK KOVASI DOLUNCA BÜTÜN GOOGLE İŞLERİ BEKLER ═══
 *
 * Üretimde (2026-09-29) kota her gece 01:00-04:00 arası doluyor, 10:00'daki
 * sıfırlamaya kadar 54 hesap 15 dakikada bir yeniden çarpıyordu; 1.521 iş
 * denemelerini bitirip veri kaybıyla düştü. Kesici artık iş türünden
 * bağımsız tek noktada (`recordFailure`) açılıyor.
 */
function kur() {
  const acilan: Array<{ platform: string; saniye: number }> = [];
  const svc = Object.create(SyncProcessorService.prototype) as Record<string, unknown>;
  svc.logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
  svc.db = { syncJob: { update: async () => undefined } };
  svc.quota = {
    tripPlatformBreaker: async (platform: string, saniye: number) => {
      acilan.push({ platform, saniye });
    },
  };
  const kaydet = (err: unknown) =>
    (svc as unknown as { recordFailure(id: bigint, e: unknown): Promise<void> }).recordFailure(1n, err);
  return { acilan, kaydet };
}

const googleKota = (detail: PlatformApiError['detail']) =>
  new PlatformApiError('google', 'rate_limited', 'Too many requests', detail);

describe('recordFailure → platform kesicisi', () => {
  it('Google kota hatası, kapsam bilinmese de BÜTÜN Google işlerini Google’ın süresi kadar durduruyor', async () => {
    const { acilan, kaydet } = kur();
    await kaydet(googleKota({ retryAfterSeconds: 31400 }));
    expect(acilan).toEqual([{ platform: 'google', saniye: 31400 }]);
  });

  it('DEVELOPER kapsamı platform geneli', async () => {
    const { acilan, kaydet } = kur();
    await kaydet(googleKota({ retryAfterSeconds: 60, kotaKapsami: 'DEVELOPER' }));
    expect(acilan).toHaveLength(1);
  });

  it('Google açıkça ACCOUNT diyorsa yalnızca hesap kesicisi — bütün platform DURMUYOR', async () => {
    const { acilan, kaydet } = kur();
    await kaydet(googleKota({ retryAfterSeconds: 60, kotaKapsami: 'ACCOUNT' }));
    expect(acilan).toEqual([]);
  });

  it('süre bilinmiyorsa eski varsayılan (900 sn), ama platform geneli', async () => {
    const { acilan, kaydet } = kur();
    await kaydet(googleKota({}));
    expect(acilan).toEqual([{ platform: 'google', saniye: 900 }]);
  });

  it('Meta kotası ve kota dışı Google hatası platform kesicisini AÇMIYOR', async () => {
    const { acilan, kaydet } = kur();
    await kaydet(new PlatformApiError('meta', 'rate_limited', 'x', { retryAfterSeconds: 60 }));
    await kaydet(new PlatformApiError('google', 'transient', 'x'));
    expect(acilan).toEqual([]);
  });
});

describe('worker: kota reddi deneme HAKKI YAKMADAN bekletiliyor', () => {
  it('moveToDelayed sonrası DelayedError fırlatılıyor, değer dönülmüyor', () => {
    const k = readFileSync(resolve(__dirname, '../worker.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const i = k.indexOf('await job.moveToDelayed(');
    if (i < 0) throw new Error('moveToDelayed bulunamadı — tarama boşa düştü.');
    const sonraki = k.slice(i, k.indexOf('}', i));
    expect(sonraki).toContain('throw new DelayedError();');
    expect(sonraki).not.toMatch(/return\s*\{/);
  });
});
