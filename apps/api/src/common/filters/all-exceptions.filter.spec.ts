import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlatformApiError } from '../../modules/connections/provider.types';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * PLATFORM HATALARININ PANELE ULAŞMASI.
 *
 * NEDEN BU DOSYA VAR: `PlatformApiError` bir `HttpException` değil ve filtrede
 * kendi dalı olmadığında son dala düşüyordu — 500 "Beklenmeyen bir hata
 * oluştu". "İzin yok", "kota doldu", "hesap bulunamadı" ve "geçersiz alan"
 * panelde AYNI cümleye dönüşüyordu.
 *
 * Bedeli ölçüldü: 2026-08-17'de elle boost ekranında lokasyon araması boş
 * döndü ve sebebi bulunamadı, çünkü kullanıcıya giden mesajda hiçbir bilgi
 * yoktu. Aynı cümle boost yayınında da görülmüştü.
 */

function host(): ArgumentsHost {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', originalUrl: '/x', requestId: 'r-1' }),
    }),
    // Test yalnızca gövdeyi okuyor; kalan taşıyıcıları taklit etmeye gerek yok.
    __json: json,
    __status: status,
  } as unknown as ArgumentsHost;
}

function govde(exception: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  const h = host();
  new AllExceptionsFilter().catch(exception, h);
  const t = h as unknown as { __json: ReturnType<typeof vi.fn> };
  return t.__json.mock.calls[0]![0] as {
    statusCode: number;
    code: string;
    message: string;
  };
}

describe('AllExceptionsFilter — platform hataları', () => {
  it('KRİTİK: Meta’nın mesajı panele ULAŞIYOR', () => {
    // "Beklenmeyen bir hata oluştu" bu projede en pahalı cümle: kullanıcıya
    // hiçbir şey söylemiyor ve bize de söylemiyor.
    const b = govde(
      new PlatformApiError('meta', 'permission_denied', 'pages_read_engagement gerekiyor'),
    );
    expect(b.message).toContain('pages_read_engagement gerekiyor');
    expect(b.message).not.toContain('Beklenmeyen');
  });

  it('KRİTİK: ALT KOD mesaja giriyor', () => {
    /*
     * Meta'nın hata kataloğunda arama ancak alt kodla yapılabiliyor ve bu iş
     * boyunca en çok işe yarayan ipucu o oldu (2446383 → eksik
     * `destination_type`).
     */
    const b = govde(
      new PlatformApiError('meta', 'permanent', 'Invalid parameter', {
        platformSubcode: 2446383,
      }),
    );
    expect(b.message).toContain('2446383');
  });

  it('alt kod yoksa mesaja boş parantez EKLENMİYOR', () => {
    const b = govde(new PlatformApiError('meta', 'permanent', 'Invalid parameter'));
    expect(b.message).toBe('Meta: Invalid parameter');
  });

  it('KRİTİK: HAM GÖVDE (`raw`) istemciye GİTMİYOR', () => {
    /*
     * Prisma dalıyla aynı gerekçe: istemciye ne olduğunu söylüyoruz,
     * platformun tüm yanıtını değil. Ham gövde platformun döndürdüğü her şeyi
     * taşıyor.
     */
    const b = govde(
      new PlatformApiError('meta', 'permanent', 'Invalid parameter', {
        raw: { gizli: 'bu gitmemeli', trace: 'AQBx...' },
      }),
    );
    expect(JSON.stringify(b)).not.toContain('gizli');
    expect(JSON.stringify(b)).not.toContain('AQBx');
  });

  it('KRİTİK: kota hatası 429 — istemci geri çekilebilsin', () => {
    const b = govde(new PlatformApiError('meta', 'rate_limited', 'Kota doldu'));
    expect(b.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it('kalan platform hataları 502 — 403 KULLANILMIYOR', () => {
    /*
     * Bu uygulamada 403 "kullanıcının panel yetkisi yok" demek. Platform izni
     * eksikliğini oraya koymak, sorunun panel rollerinde olduğunu düşündürüp
     * teşhisi yanlış yere götürürdü.
     */
    for (const kind of ['permission_denied', 'invalid_token', 'permanent', 'transient'] as const) {
      const b = govde(new PlatformApiError('meta', kind, 'x'));
      expect(b.statusCode).toBe(HttpStatus.BAD_GATEWAY);
      expect(b.statusCode).not.toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('hata TÜRÜ kodda görünüyor — log’dan ayırt edilebilsin', () => {
    expect(govde(new PlatformApiError('meta', 'invalid_token', 'x')).code).toBe(
      'PLATFORM_INVALID_TOKEN',
    );
  });

  it('Google hatası GOOGLE diye etiketleniyor', () => {
    expect(govde(new PlatformApiError('google', 'permanent', 'x')).message).toBe(
      'Google: x',
    );
  });

  it('REGRESYON: HttpException davranışı BOZULMUYOR', () => {
    /*
     * Yeni dal Nest'in kendi hatalarına dokunmuyor. Sıra bu testin konusu
     * DEĞİL: `PlatformApiError` ile `HttpException` ayrık türler, dolayısıyla
     * dalların sırası sonucu değiştirmiyor — mutasyonla denendi ve gerçekten
     * değiştirmiyor. Buradaki iddia daha basit ve gerçek olan: 400 hâlâ 400.
     */
    const b = govde(new BadRequestException('Geçersiz istek'));
    expect(b.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(b.message).toBe('Geçersiz istek');
  });

  it('REGRESYON: bilinmeyen hata hâlâ 500 ve şema sızdırmıyor', () => {
    const b = govde(new Error('Table "users" does not exist'));
    expect(b.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(b.message).toBe('Beklenmeyen bir hata oluştu');
  });
});
