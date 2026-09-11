import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { YavasIstekInterceptor } from './yavas-istek.interceptor';

/**
 * ═══ ÖLÇÜM ARACININ KENDİSİ SESSİZCE BOZULABİLİR ═══
 *
 * Bu ara katmanın tek işi teşhis: ajans genel bakışının hangi ucunda
 * beklendiğini söylemek. Bozulduğunda hiçbir şey patlamıyor — yalnızca
 * log'da satır çıkmıyor ve bu, "demek ki yavaş değilmiş" diye okunuyor.
 * En pahalı yanlış cevap.
 */

let yazilanlar: string[] = [];

beforeEach(() => {
  yazilanlar = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
    yazilanlar.push(String(m));
  });
});
afterEach(() => vi.restoreAllMocks());

function baglam(url: string, statusCode = 200): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: url }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

/** Gecikmeyi TAKLİT ETMEK yerine saati ileri alıyoruz — test beklemesin. */
function saatiIlerlet(ms: number) {
  const gercek = process.hrtime.bigint;
  let ilk = true;
  vi.spyOn(process.hrtime, 'bigint').mockImplementation(() => {
    const t = gercek.call(process.hrtime);
    if (ilk) {
      ilk = false;
      return t;
    }
    return t + BigInt(ms) * 1_000_000n;
  });
}

describe('eşik', () => {
  it('KRİTİK: eşiğin ALTINDAKİ istek log’a YAZILMIYOR', async () => {
    // Paylaşımlı sunucuda her isteği yazmak diski doldurur; eşiğin var
    // olma sebebi bu.
    const i = new YavasIstekInterceptor(1000);
    const h: CallHandler = { handle: () => of('x') };
    await firstValueFrom(i.intercept(baglam('/api/metrics/summary'), h));
    expect(yazilanlar).toHaveLength(0);
  });

  it('KRİTİK: eşiğin ÜSTÜNDEKİ istek SÜRESİYLE yazılıyor', async () => {
    saatiIlerlet(4210);
    const i = new YavasIstekInterceptor(1000);
    const h: CallHandler = { handle: () => of('x') };
    await firstValueFrom(i.intercept(baglam('/api/metrics/organizations?from=2026-01-01'), h));
    expect(yazilanlar).toHaveLength(1);
    expect(yazilanlar[0]).toContain('4210ms');
    // UÇ ADI ŞART: "bir şey yavaştı" bir teşhis değil.
    expect(yazilanlar[0]).toContain('/api/metrics/organizations');
    expect(yazilanlar[0]).toContain('GET');
  });
});

describe('KRİTİK: HATA veren istek de ölçülüyor', () => {
  it('hata dalında da satır yazılıyor', async () => {
    /*
     * En yavaş istek çoğu zaman zaman aşımına düşüp HATA veren istek
     * oluyor — 20 saniyelik transaction tavanına çarpan sorgu tam olarak
     * bu. Yalnızca başarıyı ölçen bir sayaç aradığımız vakayı kaçırırdı.
     */
    saatiIlerlet(20_500);
    const i = new YavasIstekInterceptor(1000);
    const h: CallHandler = { handle: () => throwError(() => new Error('zaman aşımı')) };
    await expect(
      firstValueFrom(i.intercept(baglam('/api/metrics/clients', 500), h)),
    ).rejects.toThrow('zaman aşımı');
    expect(yazilanlar).toHaveLength(1);
    expect(yazilanlar[0]).toContain('20500ms');
    expect(yazilanlar[0]).toContain('hata');
  });
});

describe('KRİTİK: yol MASKELENİYOR', () => {
  it('adresindeki belirteç log’a düşmüyor', async () => {
    /*
     * Bu satırlar `pm2 logs` çıktısına, oradan da sohbete yapıştırılıyor.
     * YouTube geri çağrı adresi tahmin edilemez bir belirteç taşıyor ve o
     * belirteç, isteği gönderebilmenin TEK şartı.
     */
    saatiIlerlet(1500);
    const i = new YavasIstekInterceptor(1000);
    const h: CallHandler = { handle: () => of('x') };
    await firstValueFrom(i.intercept(baglam('/api/webhooks/youtube/gizli-belirtec-123'), h));
    expect(yazilanlar).toHaveLength(1);
    expect(yazilanlar[0]).not.toContain('gizli-belirtec-123');
    // Ama hangi uca geldiği HÂLÂ görünüyor; maskeleme teşhisi öldürmemeli.
    expect(yazilanlar[0]).toContain('/api/webhooks/youtube/');
  });
});

describe('KRİTİK: gerçekten KURULU', () => {
  /*
   * Ara katmanı yazmak yetmiyor; `main.ts`e bağlanmazsa hiçbir şey
   * patlamıyor ve log sessiz kalıyor — "yavaş değilmiş" diye okunurdu.
   */
  const MAIN = readFileSync(resolve(__dirname, '..', '..', 'main.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(MAIN).toContain('app.listen(');
    expect(MAIN.length).toBeGreaterThan(1000);
  });

  it('global interceptor olarak ekleniyor ve eşiği config’ten alıyor', () => {
    expect(MAIN).toContain(
      'app.useGlobalInterceptors(new YavasIstekInterceptor(config.yavasIstekMs))',
    );
  });
});
