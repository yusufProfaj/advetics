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

describe('Google hata mesajları', () => {
  it('KRİTİK: yazma hataları "Basic Access" demiyor', () => {
    /**
     * ERİŞİM 2026-08-16'DA ALINDI. O tarihe kadar yazma metotlarının hata
     * metni "Basic Access onayı bekleniyor" diyordu ve doğruydu; artık
     * kullanıcıyı ÇÖZÜLMÜŞ bir sorunu çözmeye gönderiyor.
     *
     * Bu, `preflight.sh`'ın veritabanını "kapalı" göstermesiyle aynı sınıf
     * hata: kod çalışmıyor değil, TEŞHİS yanlış. Ve bu tür bayat metinler
     * hiçbir testte, hiçbir logda görünmüyor — yalnızca onları okuyan
     * kullanıcı yanlış yere gidiyor.
     *
     * Yazma yolu yazıldığında bu metinler zaten kalkacak. Test o güne kadar
     * eski gerekçenin geri sızmasını engelliyor.
     */
    const offenders = codeLines().filter((l) => /Basic Access/.test(l));
    expect(
      offenders,
      `Hata metninde bayat erişim gerekçesi kalmış:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('hesap etiketine kök müşteri SAYISI yazılmıyor', () => {
    /**
     * `listAccessibleCustomers` KÖK kimlikleri döndürüyor — çoğu yönetici
     * (MCC) hesabı ve `listAdAccounts` onları bilerek eliyor. Etiket bir
     * dönem "(28 hesap)" yazıyordu; aynı kartta hesap seçici "2 / 127" ve
     * "havuzdaki 125 hesap" diyordu. Üç sayı, hiçbiri diğerini açıklamıyor.
     *
     * Üstelik etiket yalnızca yetkilendirme anında yazılıyor: `refreshAccounts`
     * ona dokunmadığı için "Hesapları yenile" sonrası iki sayı sessizce
     * ayrışıyordu.
     */
    const offenders = codeLines().filter((l) => /customers\.length\}\s*hesap/.test(l));
    expect(
      offenders,
      `Etikete yine kök müşteri sayısı yazılmış:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
