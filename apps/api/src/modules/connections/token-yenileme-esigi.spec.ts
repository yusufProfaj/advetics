import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PLATFORMS } from '@advetics/shared';
import { TOKEN_UYARI_GUNU } from '../alerts/uyari-kurallari';
import { PlatformApiError, type IAdPlatformProvider } from './provider.types';
import { TokenVaultService } from './token-vault.service';
import type { CryptoService } from '../../crypto/crypto.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';

/**
 * ═══ "SÜREKLİ ŞİMDİ YETKİLENDİR" ═══
 *
 * Kullanıcının bildirdiği hâl: *"sürekli şimdi yetkilendir bildirimi
 * gözüküp duruyor … sürekli yetkilendirme yapmak istemiyorum."*
 *
 * İki sebepten biri buydu: uyarı bandı süre dolmadan 7 GÜN önce
 * "yeniden yetkilendir" demeye başlıyor (`TOKEN_UYARI_GUNU`) ama sistem
 * tazelemeyi SON 5 DAKİKAYA bırakıyordu. Yani bir hafta boyunca her gün
 * elle iş isteniyordu — hâlbuki yapılacak bir şey yoktu.
 *
 * 5 dakika Google için DOĞRU (token'ı 1 saat yaşıyor); Meta ve LinkedIn'in
 * 60 GÜNLÜK token'ı için değil.
 */

const GUN = 86_400_000;

function sahteProvider(platform: 'meta' | 'google' | 'linkedin', yenile: () => Promise<unknown>) {
  return { platform, refreshTokens: yenile } as unknown as IAdPlatformProvider;
}

/** `TokenVaultService`in bu testte kullanılan yüzeyi. */
function kasa(conn: Record<string, unknown>, guncelle = vi.fn()) {
  const db = {
    platformConnection: {
      findUniqueOrThrow: async () => conn,
      findUnique: async () => ({ failureCount: 0 }),
      update: guncelle,
    },
  } as unknown as PrismaAdminService;
  const crypto = {
    encrypt: () => Buffer.from([1]),
    decrypt: () => 'MEVCUT_TOKEN',
    keyVersionOf: () => 1,
  } as unknown as CryptoService;
  return { kasa: new TokenVaultService(crypto, db), guncelle };
}

const AKTIF = {
  id: 'c1',
  status: 'active',
  accessTokenEnc: Buffer.from([9]),
  refreshTokenEnc: null,
};

describe('KRİTİK: eşik UYARI PENCERESİNDEN geniş', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'token-vault.service.ts'), 'utf8');

  it('BOŞA DÜŞME BEKÇİSİ: eşik tablosu okundu', () => {
    expect(KAYNAK).toContain('YENILEME_ESIGI_MS: Record<Platform, number>');
  });

  it('uzun ömürlü token taşıyan platformlarda eşik > uyarı penceresi', async () => {
    /*
     * BU TESTİN TUTTUĞU DEĞİŞMEZ İKİ DOSYAYA YAYILI: eşik burada, uyarı
     * penceresi `uyari-kurallari.ts` içinde. Biri değişip diğeri
     * değişmezse hiçbir şey patlamıyor — kullanıcı yeniden her gün
     * yetkilendirmeye çağrılmaya başlıyor ve sebebi hiçbir ekranda yazmıyor.
     *
     * DAVRANIŞLA ÖLÇÜLÜYOR, sabit okuyarak değil: uyarı penceresinin TAM
     * ortasındaki bir token yenilenmek ZORUNDA.
     */
    for (const platform of ['meta', 'linkedin'] as const) {
      const yenile = vi.fn(async () => ({
        accessToken: 'YENI',
        expiresAt: new Date(Date.now() + 60 * GUN),
        grantedScopes: [],
      }));
      const { kasa: k } = kasa({
        ...AKTIF,
        tokenExpiresAt: new Date(Date.now() + (TOKEN_UYARI_GUNU / 2) * GUN),
      });
      await k.getAccessToken('c1', sahteProvider(platform, yenile));
      expect(yenile, `${platform}: uyarı penceresinde tazeleme DENENMEDİ`).toHaveBeenCalled();
    }
  });

  it('KRİTİK: Google’da eşik KISA kalıyor', async () => {
    /*
     * Google access token'ı 1 SAAT yaşıyor. Eşik günlere çıkarılsaydı HER
     * çağrı bir yenileme tetiklerdi — kota ve gecikme felaketi.
     */
    const yenile = vi.fn();
    const { kasa: k } = kasa({ ...AKTIF, tokenExpiresAt: new Date(Date.now() + 30 * 60_000) });
    await k.getAccessToken('c1', sahteProvider('google', yenile));
    expect(yenile).not.toHaveBeenCalled();
  });

  it('her platform için bir eşik var — liste elle yazılmıyor', () => {
    // `Record<Platform, number>` derlemede zorluyor; bu test listenin
    // gerçekten PLATFORMS ile aynı olduğunu da doğruluyor.
    for (const p of PLATFORMS) {
      expect(KAYNAK, `${p} için eşik yok`).toContain(`${p}:`);
    }
  });
});

describe('KRİTİK: erken yenileme hatası ÖLDÜRMÜYOR', () => {
  it('token günlerce geçerliyken başarısız yenileme MEVCUT token’ı döndürüyor', async () => {
    /*
     * Eşik 5 dakikadan 10 güne çıkınca yeni bir risk doğdu: on gün önce
     * yaşanan GEÇİCİ bir hata (ağ, platform kesintisi) bağlantıyı
     * `needs_reauth`'a düşürüp BÜTÜN senkronizasyonu durdururdu — oysa
     * mevcut token günlerce daha çalışacaktı. Düzeltmeye çalıştığımız
     * arızadan beteri.
     */
    const yenile = vi.fn(async () => {
      throw new PlatformApiError('meta', 'rate_limited', 'geçici');
    });
    const { kasa: k } = kasa({ ...AKTIF, tokenExpiresAt: new Date(Date.now() + 8 * GUN) });
    await expect(k.getAccessToken('c1', sahteProvider('meta', yenile))).resolves.toBe(
      'MEVCUT_TOKEN',
    );
    expect(yenile).toHaveBeenCalled();
  });

  it('KRİTİK: SON ANDA başarısız yenileme HÂLÂ ölümcül', async () => {
    /*
     * Gevşetmenin sınırı burada. Token gerçekten dolmak üzereyken sessizce
     * geçersiz bir token döndürmek, senkronizasyonun 401 alıp sebebini hiç
     * söylememesi demekti — bu depoda "sessiz hata" başlığının ta kendisi.
     */
    const yenile = vi.fn(async () => {
      throw new PlatformApiError('meta', 'invalid_token', 'bitti');
    });
    const { kasa: k } = kasa({ ...AKTIF, tokenExpiresAt: new Date(Date.now() + 60_000) });
    /*
     * İDDİA SEBEBE ÇAPALI. İlk yazımda yalnızca `rejects.toThrow()` vardı
     * ve mock'um bozukken de GEÇTİ — atılan şey bir `TypeError`dı. Bir
     * reddin doğru sebepten geldiğini söylemeyen iddia, hiç iddia değil.
     */
    await expect(k.getAccessToken('c1', sahteProvider('meta', yenile))).rejects.toThrow(
      PlatformApiError,
    );
    expect(yenile).toHaveBeenCalled();
  });

  it('KRİTİK: bağlantı zaten bozuksa yenileme DENENİYOR ve hata YUTULMUYOR', async () => {
    // `needs_reauth` bir bağlantıda mevcut token'ı döndürmek, kopmuş bir
    // bağlantıyı çalışıyor gibi göstermek olurdu.
    const yenile = vi.fn(async () => {
      throw new PlatformApiError('meta', 'invalid_token', 'bitti');
    });
    const { kasa: k } = kasa({
      ...AKTIF,
      status: 'needs_reauth',
      tokenExpiresAt: new Date(Date.now() + 30 * GUN),
    });
    await expect(k.getAccessToken('c1', sahteProvider('meta', yenile))).rejects.toThrow(
      PlatformApiError,
    );
    expect(yenile).toHaveBeenCalled();
  });
});
