import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * ═══ "BEKLENMEYEN BİR HATA OLUŞTU" — ÜÇÜNCÜ KEZ ═══
 *
 * CLAUDE.md bu cümleyi bir kez kaydediyor: "`PlatformApiError` bir
 * `HttpException` DEĞİL … hepsi panelde 'Beklenmeyen bir hata oluştu'
 * oluyor. Bu cümle bu projede bir turu tamamen kaybettirdi."
 *
 * Aynısı HAM SQL'de yaşandı. Prisma yalnızca ORM yollarında
 * P2002/P2003/P2025 üretiyor; `$queryRaw` / `$executeRaw` içindeki kısıt
 * ihlali `P2010` olarak geliyor ve PostgreSQL'in SQLSTATE'i `meta` içinde
 * kalıyor. Bu depoda sorguların büyük kısmı ham SQL (RLS join'siz
 * yazılabilsin diye), yani en sık karşılaşılan kısıt hatası tam da mesajı
 * KAYBOLAN dala düşüyordu.
 *
 * Canlıda görüldü: e-posta ayarı kaydedilirken benzersizlik ihlali oluştu
 * ve kullanıcının gördüğü tek şey "Beklenmeyen bir hata oluştu" oldu.
 */

/**
 * Filtreyi GERÇEK giriş noktasından (`catch`) sürüyor — özel metoda
 * uzanmıyor.
 *
 * `all-exceptions.filter.spec.ts` aynı deseni kullanıyor ve sebebi şu:
 * özel bir metoda `as unknown as` ile ulaşmak, metot adı değiştiğinde
 * DERLEME hatası vermeden testi boşa düşürür.
 */
function host(): ArgumentsHost {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'PUT', originalUrl: '/me/email-account', requestId: 'r-1' }),
    }),
    __json: json,
  } as unknown as ArgumentsHost;
}

function yanit(exception: unknown): {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
} {
  const h = host();
  new AllExceptionsFilter().catch(exception, h);
  const t = h as unknown as { __json: ReturnType<typeof vi.fn> };
  return t.__json.mock.calls[0]![0] as {
    statusCode: number;
    code: string;
    message: string;
    requestId: string;
  };
}

function hamHata(pgKodu: string | undefined): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Raw query failed', {
    code: 'P2010',
    clientVersion: '6.0.0',
    meta: pgKodu ? { code: pgKodu, message: 'duplicate key value violates …' } : {},
  });
}

describe('tarama boşa düşmüyor', () => {
  it('filtre gerçekten yanıt üretiyor', () => {
    // Taklit host yanlış kurulursa `mock.calls[0]` patlıyor ve aşağıdaki
    // iddiaların hepsi anlamsızlaşırdı; burada görünür oluyor.
    expect(yanit(new Error('x')).code).toBe('INTERNAL_ERROR');
  });
});

describe('KRİTİK: ham SQL kısıt ihlali okunabilir', () => {
  it('BENZERSİZLİK ihlali — ORM dalıyla AYNI cümle', () => {
    /*
     * Aynı arıza, hangi yoldan geldiğine göre farklı cümle göstermemeli:
     * kullanıcı iki ayrı sorun olduğunu sanır.
     */
    const r = yanit(hamHata('23505'));
    expect(r.statusCode).toBe(HttpStatus.CONFLICT);
    expect(r.message).toBe('Bu kayıt zaten mevcut');
  });

  it('YABANCI ANAHTAR ihlali', () => {
    const r = yanit(hamHata('23503'));
    expect(r.message).toBe('İlişkili kayıt geçersiz');
  });

  it('CHECK ihlali', () => {
    const r = yanit(hamHata('23514'));
    expect(r.statusCode).toBe(HttpStatus.BAD_REQUEST);
  });

  it('RLS reddi YETKİ hatası olarak dönüyor', () => {
    // Satır var ama bu bağlamda erişilemiyor; kullanıcıya bunu söylemek,
    // sessizce boş dönmekten iyi.
    const r = yanit(hamHata('42501'));
    expect(r.statusCode).toBe(HttpStatus.FORBIDDEN);
  });

  it('KRİTİK: BİLİNMEYEN kodda bile "Beklenmeyen" DEMİYOR — kodu yazıyor', () => {
    /*
     * Veritabanı MESAJI yazılmıyor (tablo ve kolon adları taşıyor, şema
     * bilgisi sızdırmak olurdu) ama SQLSTATE teşhis için yeterli.
     */
    const r = yanit(hamHata('40001'));
    expect(r.message).toContain('40001');
    expect(r.message).not.toContain('Beklenmeyen');
  });

  it('SQLSTATE hiç yoksa da "Beklenmeyen" değil', () => {
    const r = yanit(hamHata(undefined));
    expect(r.code).toBe('DB_ERROR');
  });

  it('KRİTİK: istek kimliği KAYBOLMUYOR', () => {
    /*
     * Eşleşme tablosuna sabit bir `requestId` yazmak, her yanıtın aynı (ve
     * yanlış) kimliği taşıması demekti — log ile ekranı eşleştirmek
     * imkânsızlaşırdı.
     */
    expect(yanit(hamHata('23505')).requestId).toBe('r-1');
    expect(yanit(hamHata('40001')).requestId).toBe('r-1');
  });
});

describe('mevcut dallar bozulmadı', () => {
  it('ORM benzersizlik hatası aynı cevabı veriyor', () => {
    const orm = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    expect(yanit(orm).message).toBe('Bu kayıt zaten mevcut');
  });

  it('BİLİNMEYEN hata hâlâ son dala düşüyor', () => {
    // Dal eklemek, gerçekten beklenmeyen bir hatayı gizlememeli.
    expect(yanit(new TypeError('boom')).message).toBe('Beklenmeyen bir hata oluştu');
  });
});
