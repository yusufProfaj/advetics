import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { CryptoService } from '../../crypto/crypto.service';
import type { IAdPlatformProvider } from './provider.types';
import { TokenVaultService } from './token-vault.service';
import { yetkiBitisi } from './yetki-bitisi';

/**
 * ═══ YETKİNİN BİTİŞİ ERİŞİM TOKEN'ININKİ DEĞİL ═══
 *
 * Canlıda Google Ads bağlantısı her saat "yetki 1 gün içinde doluyor"
 * diyordu: uyarılar ERİŞİM token'ının bitişini (Google'da saatlik) yetkinin
 * ömrü sanıyordu. Bu paket üç katmanı sınıyor: saf karar, token kasasının
 * yenilemede yazdığı değer, ve mevcut satırları dolduran migration.
 */
const SAAT = 3_600_000;
const GUN = 86_400_000;
const SIMDI = new Date('2026-09-28T13:56:00Z');

describe('karar', () => {
  it('Meta: yenileme yok, yetki erişim token\'ıyla ölüyor', () => {
    const erisim = new Date(SIMDI.getTime() + 60 * GUN);
    expect(yetkiBitisi({ yenilemeVar: false, erisimBitisi: erisim, yenilemeBitisi: undefined })).toBe(
      erisim,
    );
  });

  it('KRİTİK: Google: saatlik erişim token\'ı yetki bitişi DEĞİL, süresiz', () => {
    const erisim = new Date(SIMDI.getTime() + SAAT);
    expect(
      yetkiBitisi({ yenilemeVar: true, erisimBitisi: erisim, yenilemeBitisi: undefined }),
    ).toBeNull();
  });

  it('KRİTİK: LinkedIn: yenileme token\'ının bildirilen ömrü', () => {
    const erisim = new Date(SIMDI.getTime() + 60 * GUN);
    const yenileme = new Date(SIMDI.getTime() + 365 * GUN);
    expect(yetkiBitisi({ yenilemeVar: true, erisimBitisi: erisim, yenilemeBitisi: yenileme })).toBe(
      yenileme,
    );
  });
});

describe('token kasası yenilemede', () => {
  function kasa(conn: Record<string, unknown>, platform: 'google' | 'linkedin', fresh: object) {
    const guncelle = vi.fn(async () => ({}));
    const db = {
      platformConnection: {
        findUniqueOrThrow: async () => conn,
        findUnique: async () => ({ failureCount: 0 }),
        update: guncelle,
      },
    } as unknown as PrismaAdminService;
    const crypto = {
      encrypt: () => Buffer.from([1]),
      decrypt: () => 'MEVCUT',
      keyVersionOf: () => 1,
    } as unknown as CryptoService;
    const provider = {
      platform,
      refreshTokens: async () => ({ accessToken: 'YENI', grantedScopes: [], ...fresh }),
    } as unknown as IAdPlatformProvider;
    return { kasa: new TokenVaultService(crypto, db), guncelle, provider };
  }

  const SURESI_DOLMUS = {
    id: 'c1',
    status: 'active',
    accessTokenEnc: Buffer.from([9]),
    refreshTokenEnc: Buffer.from([7]),
    tokenExpiresAt: new Date(Date.now() - SAAT),
  };

  it('KRİTİK: Google yanıtta refresh token göndermese de yetki SÜRESİZ yazılıyor', async () => {
    // Google yenileme yanıtında refresh token yok; eskisi satırda duruyor.
    // Yanıta bakıp "yenileme yok" demek bağlantıyı saatlik ölüme mahkûm
    // gösterirdi.
    const { kasa: k, guncelle, provider } = kasa(SURESI_DOLMUS, 'google', {
      expiresAt: new Date(Date.now() + SAAT),
    });
    await k.getAccessToken('c1', provider);
    const veri = (guncelle.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(veri.authorizationExpiresAt).toBeNull();
    expect(veri.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it('LinkedIn yenilemesi platformun bildirdiği yenileme bitişini yazıyor', async () => {
    const yenileme = new Date(Date.now() + 300 * GUN);
    const { kasa: k, guncelle, provider } = kasa(SURESI_DOLMUS, 'linkedin', {
      refreshToken: 'AYNI',
      expiresAt: new Date(Date.now() + 60 * GUN),
      refreshTokenExpiresAt: yenileme,
    });
    await k.getAccessToken('c1', provider);
    const veri = (guncelle.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(veri.authorizationExpiresAt).toBe(yenileme);
  });
});

describe('migration mevcut satırları doğru dolduruyor', () => {
  /*
   * Koşum ortamı migration'ı BOŞ tabloya uyguluyor; UPDATE'ler hiçbir satıra
   * dokunmadan geçiyor ve yanlış yazılmış bir koşul fark edilmiyordu. Burada
   * migration dosyasının UPDATE'leri DOLU bir tabloya karşı yeniden
   * çalıştırılıyor (`roller-uce-indi.spec.ts` deseni).
   */
  let h: Harness;
  const MIG = readFileSync(
    resolve(__dirname, '../../../prisma/migrations/20260928120000_yetki_bitisi/migration.sql'),
    'utf8',
  );
  // YORUMLAR ÖNCE SİLİNİYOR, SONRA BÖLÜNÜYOR: yorum satırı ';' taşıyabilir
  // ve ters sırada bir UPDATE yorumun artığıyla başlayıp filtreden düşüyordu.
  const GUNCELLEMELER = MIG.replace(/--.*$/gm, '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('UPDATE'));

  beforeAll(async () => {
    h = await createHarness();
    await seedTenant(h);
  });
  afterAll(async () => {
    await h.close();
  });

  it('tarama boşa düşmüyor: iki UPDATE okundu', () => {
    expect(GUNCELLEMELER).toHaveLength(2);
  });

  it('KRİTİK: Meta taşınıyor, Google NULL kalıyor, LinkedIn alt sınır', async () => {
    const META = IDS.connection;
    const GOOGLE = '66666666-6666-6666-6666-666666666666';
    const LINKEDIN = '77777777-7777-7777-7777-777777777777';
    await h.q(
      `INSERT INTO platform_connections
         (id, org_id, platform, status, external_user_id, account_label, access_token_enc,
          refresh_token_enc, token_expires_at, granted_scopes, connected_by_user_id,
          created_at, updated_at)
       VALUES ($1, $3, 'google',   'active', 'g', 'G', '\\x00', '\\x01', now() + interval '1 hour',
               '{}', $4, now(), now()),
              ($2, $3, 'linkedin', 'active', 'l', 'L', '\\x00', '\\x01', now() + interval '60 days',
               '{}', $4, '2026-09-08T07:23:55Z', now())`,
      [GOOGLE, LINKEDIN, IDS.org, IDS.user],
    );
    await h.q(
      `UPDATE platform_connections SET token_expires_at = '2026-11-01T00:00:00Z',
              refresh_token_enc = NULL WHERE id = $1`,
      [META],
    );
    await h.q(`UPDATE platform_connections SET authorization_expires_at = NULL`);

    for (const u of GUNCELLEMELER) await h.q(u);

    const satir = async (id: string) =>
      (
        await h.q<{ a: string | null }>(
          `SELECT authorization_expires_at::text AS a FROM platform_connections WHERE id = $1`,
          [id],
        )
      )[0]?.a;
    expect(await satir(META)).toMatch(/^2026-11-01/);
    expect(await satir(GOOGLE)).toBeNull();
    expect(await satir(LINKEDIN)).toMatch(/^2027-09-08/);
  });
});
