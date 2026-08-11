import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Google istek gövdesi statik korumaları.
 *
 * NEDEN KAYNAK KODU OKUYORUZ: bu kısıtlar Google'ın çalışma anında
 * dayattığı kurallar ve TypeScript hiçbirini görmüyor. Gerçek bir HTTP
 * çağrısı yapmadan davranışı test etmenin başka yolu yok; kaynağı taramak
 * ise ucuz ve hatanın geri gelmesini engelliyor.
 *
 * `sql-template.spec.ts` ile aynı desen — o da `Prisma.sql` şablonlarındaki
 * backtick hatasını böyle yakalıyor.
 */

const SOURCE = readFileSync(join(__dirname, 'google.provider.ts'), 'utf8');

/** Yorum satırlarını atar: yasak alan adı yorumda geçebilir ve geçiyor. */
function codeLines(): string[] {
  return SOURCE.split('\n').filter((line) => {
    const t = line.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}

describe('Google arama isteği', () => {
  it('KRİTİK: pageSize GÖNDERİLMİYOR', () => {
    // Google v25 bu alanı reddediyor:
    //   PAGE_SIZE_NOT_SUPPORTED — "Setting the page size is not supported.
    //   Search Responses will have fixed page size of '10000' rows."
    //
    // İlk canlı çalıştırmada yapı ve metrik sorgularının ÜÇÜ DE bu yüzden
    // 400 aldı. Hesap keşfi çalışıyordu çünkü sayfasız yolu kullanıyor —
    // yani hata yalnızca sayfalı sorgularda görünüyordu.
    const offenders = codeLines().filter((l) => /\bpageSize\b/.test(l));
    expect(offenders, `pageSize hâlâ gönderiliyor:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('sayfalama pageToken ile yapılıyor', () => {
    // pageSize kaldırıldı ama sayfalama KALMALI: 10.000 satırdan büyük
    // hesaplarda tek sayfa yetmiyor ve eksik veriyi tam sanmak, varlıkları
    // silinmiş göstermek demek.
    expect(SOURCE).toContain('nextPageToken');
    expect(SOURCE).toContain('pageToken');
  });

  it('developer-token ve login-customer-id başlıkları kuruluyor', () => {
    // login-customer-id MCC altındaki hesaplarda zorunlu; eksikse Google
    // USER_PERMISSION_DENIED döndürüyor ve mesaj token sorunu gibi okunuyor.
    expect(SOURCE).toContain("'developer-token'");
    expect(SOURCE).toContain("'login-customer-id'");
  });
});
