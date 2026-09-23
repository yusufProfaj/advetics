import { describe, expect, it, vi } from 'vitest';
import { PlatformApiError } from '../provider.types';
import { GoogleProvider } from './google.provider';

/**
 * ═══ "BAĞLANTI KURULAMADI" ÜÇ AYRI SEBEBİ AYNI CÜMLEYE ÇEVİRİYORDU ═══
 *
 * Kullanıcının gördüğü ekran: *"Google hesabı belirlenemedi. Bu Google
 * kullanıcısının erişebildiği bir Ads hesabı olmayabilir, ya da developer
 * token yalnızca test hesaplarını görüyor olabilir."*
 *
 * O cümle bir TAHMİN. Gerçek sebep üç ayrı yerden gelebiliyor ve üçünün
 * yapılacak işi farklı:
 *
 *   1. Token doğrulanamadı        → yeniden yetkilendir
 *   2. Google çağrıyı reddetti    → Google'ın KENDİ mesajı ne diyorsa o
 *   3. Google boş liste döndürdü  → bu kullanıcının Ads hesabı yok
 *
 * İkincisinde Google'ın cevabı `logger.warn` ile yutuluyordu: sebep yalnızca
 * sunucu log'unda kalıyor, bağlanamayan kullanıcının elinde hiçbir ipucu
 * olmuyordu.
 */
function saglayici(): GoogleProvider {
  return new GoogleProvider({
    platforms: {
      google: {
        clientId: 'cid',
        clientSecret: 'secret',
        developerToken: 'dev',
        apiVersion: 'v25',
        redirectUri: 'https://x/cb',
      },
    },
  } as never);
}

/** `describeToken` private — bağlantı kurulum yolu onu içeriden çağırıyor. */
function tanimla(
  p: GoogleProvider,
  accessToken = 'at',
): Promise<{ externalUserId: string }> {
  return (
    p as unknown as {
      describeToken: (a: string, r: string) => Promise<{ externalUserId: string }>;
    }
  ).describeToken(accessToken, 'rt');
}

describe('Google bağlantısı — sebep tahmin edilmiyor', () => {
  it('düzenek gerçekten kurulum yolunu çağırıyor', async () => {
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: true, externalUserId: 'sub-1' });
    vi.spyOn(
      p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
      'listAccessibleCustomerIds',
    ).mockResolvedValue(['1234567890']);

    const sonuc = await tanimla(p);
    expect(sonuc.externalUserId).toBeTruthy();
  });

  it('KRİTİK: TOKEN DOĞRULANAMADIYSA sebep BU — hesap listesi tahmini değil', async () => {
    /*
     * `verifyToken` geçersiz token'da sessizce `{ valid: false }` dönüyor ve
     * akış devam ediyordu: sonraki çağrı da düşüyor, hatası yutuluyor ve
     * kullanıcı "developer token" hakkında bir tahmin okuyordu.
     */
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: false });
    const liste = vi
      .spyOn(
        p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
        'listAccessibleCustomerIds',
      )
      .mockResolvedValue([]);

    await expect(tanimla(p)).rejects.toThrow(/doğrulanamadı/);
    // GEÇERSİZ TOKENLE HESAP LİSTESİ İSTENMİYOR: sıfır maliyetli bir ret,
    // kesin düşecek bir çağrıdan iyi.
    expect(liste).not.toHaveBeenCalled();
  });

  it('KRİTİK: GOOGLE REDDETTİYSE ONUN KENDİ CÜMLESİ gösteriliyor', async () => {
    /*
     * Üst seviye mesaj her şey için aynı; gerçek sebep gövdenin derininde,
     * `details[].errors[].message` altında ve yapılacak işi söyleyen tek yer
     * orası.
     */
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: true });
    vi.spyOn(
      p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
      'listAccessibleCustomerIds',
    ).mockRejectedValue(
      new PlatformApiError('google', 'permanent', 'Request had invalid arguments', {
        httpStatus: 403,
        raw: {
          error: {
            message: 'Request had invalid arguments',
            details: [
              { errors: [{ message: 'The developer token is not approved.' }] },
            ],
          },
        },
      }),
    );

    await expect(tanimla(p)).rejects.toThrow(/developer token is not approved/);
  });

  it('KRİTİK: DERİN MESAJ YOKSA ÜST SEVİYE MESAJA DÜŞÜLÜYOR', async () => {
    // Genel de olsa Google'ın kendi cümlesi, bizim tahminimizden iyi.
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: true });
    vi.spyOn(
      p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
      'listAccessibleCustomerIds',
    ).mockRejectedValue(
      new PlatformApiError('google', 'permanent', 'normalize edilmiş', {
        raw: { error: { message: 'Version v20 is no longer supported.' } },
      }),
    );

    await expect(tanimla(p)).rejects.toThrow(/Version v20 is no longer supported/);
  });

  it('KRİTİK: BOŞ LİSTE İLE HATA AYRI CÜMLELER', async () => {
    /*
     * Çağrı çalıştı ve sıfır hesap döndü: bu kullanıcının erişebildiği bir Ads
     * hesabı yok. "Hesap listesi alınamadı" demek, çalışan bir kurulumda
     * developer token aratmak olurdu.
     */
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: true });
    vi.spyOn(
      p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
      'listAccessibleCustomerIds',
    ).mockResolvedValue([]);

    await expect(tanimla(p)).rejects.toThrow(/erişebildiği bir Google Ads hesabı yok/);
    await expect(tanimla(p)).rejects.not.toThrow(/alınamadı/);
  });

  it('KRİTİK: HATANIN TÜRÜ KORUNUYOR — kota hatası kalıcı sayılmıyor', async () => {
    /*
     * `PlatformApiError.kind` tekrar denenebilirliği belirliyor. Her sebebi
     * `permanent` yazmak, geçici bir kota hatasında bağlantıyı kalıcı
     * bozukmuş gibi göstermek olurdu.
     */
    const p = saglayici();
    vi.spyOn(p, 'verifyToken').mockResolvedValue({ valid: true });
    vi.spyOn(
      p as unknown as { listAccessibleCustomerIds: () => Promise<string[]> },
      'listAccessibleCustomerIds',
    ).mockRejectedValue(new PlatformApiError('google', 'rate_limited', 'kota'));

    await expect(tanimla(p)).rejects.toMatchObject({ kind: 'rate_limited' });
  });
});
