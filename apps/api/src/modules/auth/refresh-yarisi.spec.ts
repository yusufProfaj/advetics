import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { AppConfig } from '../../config/configuration';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import {
  TokenService,
  YENIDEN_KULLANIM_TOLERANSI_MS,
  yenidenKullanimToleransli,
} from './token.service';

/**
 * ═══ REFRESH ROTASYONU — SEKMELER ARASI YARIŞ ═══
 *
 * Üretim, 2026-10-09 20:44: `Refresh token yeniden kullanıldı (olası
 * hırsızlık)` ve kullanıcı birden çok sekmeyle çalışırken her yerden düştü.
 * Aynı tarayıcının iki isteği aynı çerezi taşıyor; biri döndürünce diğeri
 * iptal edilmiş token'ı sunuyor ve eski kod bunu hırsızlık sayıp AİLEYİ
 * öldürüyordu.
 *
 * Testler GERÇEK Postgres'te (PGlite) koşuyor, çünkü yarışın bir yarısı
 * veritabanında: iki istek aynı satırı okuyor ve kimin iptal edeceğine
 * koşullu UPDATE karar veriyor. Sahte bir `update` bunu taklit edemezdi.
 *
 * Güvenlik yarısı da aynı ağırlıkta: pencere DIŞINDAKİ, başka tarayıcıdan
 * gelen ya da kapatılmış ailedeki tekrar kullanım HÂLÂ aileyi iptal etmeli.
 */

const CONFIG = {
  jwt: {
    accessSecret: 'x'.repeat(32),
    refreshSecret: 'y'.repeat(32),
    accessTtl: '15m',
    refreshTtl: '30d',
  },
  cookie: { domain: 'localhost', secure: false },
} as unknown as AppConfig;

const UA = 'Mozilla/5.0 (Macintosh) Chrome/141';

/**
 * `PrismaAdminService.refreshToken`in TokenService'in kullandığı yüzeyi,
 * PGlite üzerinde SQL ile. Tanımadığı bir `where` biçimi görürse PATLIYOR:
 * sessizce yanlış süzgeç uygulamak testi yalancı yapardı.
 */
function refreshTokenModeli(h: Harness) {
  const satir = (r: Record<string, unknown>) => ({
    id: r.id as string,
    userId: r.user_id as string,
    tokenHash: r.token_hash as string,
    familyId: r.family_id as string,
    expiresAt: new Date(r.expires_at as string),
    revokedAt: r.revoked_at ? new Date(r.revoked_at as string) : null,
    revokedReason: (r.revoked_reason as string | null) ?? null,
    replacedById: (r.replaced_by_id as string | null) ?? null,
    persistent: r.persistent as boolean,
    userAgent: (r.user_agent as string | null) ?? null,
  });

  const kosul = (where: Record<string, unknown>, params: unknown[]): string => {
    const parcalar: string[] = [];
    for (const [k, v] of Object.entries(where)) {
      if (k === 'id' || k === 'familyId' || k === 'userId' || k === 'tokenHash') {
        const kolon = { id: 'id', familyId: 'family_id', userId: 'user_id', tokenHash: 'token_hash' }[k];
        params.push(v);
        parcalar.push(`${kolon} = $${params.length}`);
      } else if (k === 'revokedAt' && v === null) {
        parcalar.push('revoked_at IS NULL');
      } else if (k === 'revokedAt' && JSON.stringify(v) === '{"not":null}') {
        parcalar.push('revoked_at IS NOT NULL');
      } else if (k === 'NOT' && typeof v === 'object' && v && 'revokedReason' in v) {
        params.push((v as { revokedReason: string }).revokedReason);
        parcalar.push(`revoked_reason IS DISTINCT FROM $${params.length}`);
      } else {
        throw new Error(`Test modeli bu where alanını tanımıyor: ${k}=${JSON.stringify(v)}`);
      }
    }
    return parcalar.join(' AND ');
  };

  const set = (data: Record<string, unknown>, params: unknown[]): string =>
    Object.entries(data)
      .map(([k, v]) => {
        const kolon = { revokedAt: 'revoked_at', revokedReason: 'revoked_reason', replacedById: 'replaced_by_id' }[k];
        if (!kolon) throw new Error(`Test modeli bu data alanını tanımıyor: ${k}`);
        params.push(v instanceof Date ? v.toISOString() : v);
        return `${kolon} = $${params.length}`;
      })
      .join(', ');

  return {
    async findUnique(args: { where: Record<string, unknown>; include?: unknown }) {
      const params: unknown[] = [];
      const [r] = await h.q(`SELECT * FROM refresh_tokens WHERE ${kosul(args.where, params)}`, params);
      if (!r) return null;
      const s = satir(r);
      if (!args.include) return s;
      const [u] = await h.q<{ id: string; org_id: string; status: string }>(
        `SELECT id, org_id, status FROM users WHERE id = $1`,
        [s.userId],
      );
      return { ...s, user: { id: u!.id, orgId: u!.org_id, status: u!.status } };
    },
    async create(args: { data: Record<string, unknown> }) {
      const d = args.data;
      const [r] = await h.q<{ id: string }>(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at, persistent, ip, user_agent)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [d.userId, d.tokenHash, d.familyId, (d.expiresAt as Date).toISOString(), d.persistent, d.ip, d.userAgent],
      );
      return { id: r!.id };
    },
    async update(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const params: unknown[] = [];
      const s = set(args.data, params);
      await h.q(`UPDATE refresh_tokens SET ${s} WHERE ${kosul(args.where, params)}`, params);
      return {};
    },
    async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const params: unknown[] = [];
      const s = set(args.data, params);
      // RETURNING ile SAY: sıfır satırlık UPDATE de "başarılı" dönüyor ve
      // yarışın kaybedeni tam olarak o sıfırla anlaşılıyor.
      const rows = await h.q(`UPDATE refresh_tokens SET ${s} WHERE ${kosul(args.where, params)} RETURNING id`, params);
      return { count: rows.length };
    },
    async count(args: { where: Record<string, unknown> }) {
      const params: unknown[] = [];
      const [r] = await h.q<{ n: number }>(
        `SELECT count(*)::int AS n FROM refresh_tokens WHERE ${kosul(args.where, params)}`,
        params,
      );
      return r!.n;
    },
  };
}

let h: Harness;
let servis: TokenService;

beforeAll(async () => {
  h = await createHarness();
  const jwt = { signAsync: async () => 'access-token' } as unknown as JwtService;
  const db = { refreshToken: refreshTokenModeli(h) } as unknown as PrismaAdminService;
  servis = new TokenService(jwt, db, CONFIG);
}, 60_000);

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  // `seedTenant` kullanıcıyı şemanın varsayılanıyla (davetli) yazıyor;
  // rotasyon yalnızca aktif kullanıcıya izin veriyor.
  await h.q(`UPDATE users SET status = 'active' WHERE id = $1`, [IDS.user]);
});

const meta = { userAgent: UA, ip: '10.0.0.1' };

async function canliSayisi(): Promise<number> {
  const [r] = await h.q<{ n: number }>(
    `SELECT count(*)::int AS n FROM refresh_tokens WHERE revoked_at IS NULL`,
  );
  return r!.n;
}

async function reuseTespitEdildi(): Promise<boolean> {
  const r = await h.q(`SELECT 1 FROM refresh_tokens WHERE revoked_reason = 'reuse_detected'`);
  return r.length > 0;
}

/** Döndürülmüş token'ın iptal anını geçmişe çeker — gerçek saat beklemeden. */
async function iptaliGeriAl(saniye: number): Promise<void> {
  await h.q(
    `UPDATE refresh_tokens SET revoked_at = revoked_at - make_interval(secs => $1::int)
      WHERE revoked_reason = 'rotated'`,
    [saniye],
  );
}

describe('YARIŞ — aynı tarayıcıdan iki sekme', () => {
  it('KRİTİK: tam eşzamanlı iki rotasyon ikisi de başarılı, aile ölmüyor', async () => {
    /*
     * Üretimdeki arızanın en sıkı hâli: iki istek AYNI satırı okuyor. Eski
     * kodda koşulsuz `update` yüzünden ikisi de döndürüyordu (aile
     * çatallanıyordu); yarıştan sonra gelen her tekrar ise aileyi
     * öldürüyordu.
     */
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    const [a, b] = await Promise.all([
      servis.rotate(ilk.refreshToken, meta),
      servis.rotate(ilk.refreshToken, meta),
    ]);

    expect(a.refreshToken).not.toBe(b.refreshToken);
    expect(await reuseTespitEdildi()).toBe(false);
    // Hangisi çerez kavanozunda son kalırsa kalsın, ikisi de yenilenebilmeli.
    await expect(servis.rotate(a.refreshToken, meta)).resolves.toBeDefined();
    await expect(servis.rotate(b.refreshToken, meta)).resolves.toBeDefined();
  });

  it('KRİTİK: döndürülmüş token birkaç saniye sonra tekrar sunulunca yeni çift veriliyor', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    const kazanan = await servis.rotate(ilk.refreshToken, meta);
    await iptaliGeriAl(5);

    const kaybeden = await servis.rotate(ilk.refreshToken, meta);

    expect(kaybeden.refreshToken).not.toBe(kazanan.refreshToken);
    expect(await reuseTespitEdildi()).toBe(false);
    // Kazananın token'ı İPTAL EDİLMEMELİ: kavanozda o kalırsa bir sonraki
    // yenileme aileyi öldürürdü.
    expect(await canliSayisi()).toBe(2);
    await expect(servis.rotate(kazanan.refreshToken, meta)).resolves.toBeDefined();
  });

  it('kalıcılık tolerans yolunda da taşınıyor', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta, false);
    await servis.rotate(ilk.refreshToken, meta);
    const tekrar = await servis.rotate(ilk.refreshToken, meta);
    expect(tekrar.persistent).toBe(false);
  });
});

describe('GÜVENLİK — gerçek yeniden kullanım hâlâ aileyi iptal ediyor', () => {
  it('KRİTİK: pencere DIŞINDA tekrar → aile iptal, kazananın token\'ı da ölü', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    const kazanan = await servis.rotate(ilk.refreshToken, meta);
    await iptaliGeriAl(YENIDEN_KULLANIM_TOLERANSI_MS / 1000 + 5);

    await expect(servis.rotate(ilk.refreshToken, meta)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await reuseTespitEdildi()).toBe(true);
    expect(await canliSayisi()).toBe(0);
    await expect(servis.rotate(kazanan.refreshToken, meta)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('KRİTİK: TAM EŞZAMANLI ama başka tarayıcıdan gelen istek aileyi ÇATALLAYAMIYOR', async () => {
    /*
     * Koşulsuz iptalde iki istek de "iptal edilmemiş" görüp ikisi de
     * döndürüyordu: çalıntı token, meşru istekle aynı anda sunulursa hiçbir
     * kontrolden geçmeden kendi dalını açıyordu. Koşullu iptalde yarışın
     * kaybedeni tekrar kullanım yoluna düşüyor ve orada UA kontrolüne
     * takılıyor. (Promise.all sırası: ilk çağrı önce okuyup önce iptal
     * ediyor, yani kaybeden ikinci çağrı.)
     */
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    const sonuc = await Promise.allSettled([
      servis.rotate(ilk.refreshToken, meta),
      servis.rotate(ilk.refreshToken, { userAgent: 'curl/8.4.0', ip: '203.0.113.9' }),
    ]);

    expect(sonuc[1]!.status).toBe('rejected');
    expect(await reuseTespitEdildi()).toBe(true);
    expect(await canliSayisi()).toBe(0);
  });

  it('KRİTİK: başka tarayıcıdan (farklı User-Agent) pencere içinde tekrar → aile iptal', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    await servis.rotate(ilk.refreshToken, meta);

    await expect(
      servis.rotate(ilk.refreshToken, { userAgent: 'curl/8.4.0', ip: '203.0.113.9' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await reuseTespitEdildi()).toBe(true);
    expect(await canliSayisi()).toBe(0);
  });

  it('KRİTİK: aile kapatıldıysa (şifre değişimi) pencere içinde bile tolerans YOK', async () => {
    /*
     * Toleransın arka kapıya dönüştüğü senaryo: kullanıcı hırsızlıktan
     * şüphelenip şifresini değiştiriyor; ondan hemen önce döndürülmüş
     * çalıntı token 30 saniye içinde yeni oturum açamamalı.
     */
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    await servis.rotate(ilk.refreshToken, meta);
    await servis.revokeAllForUser(IDS.user, 'password_changed');

    await expect(servis.rotate(ilk.refreshToken, meta)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await canliSayisi()).toBe(0);
  });

  it('çıkış yapılmış token tolerans almıyor', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    await servis.revokeByToken(ilk.refreshToken);
    await expect(servis.rotate(ilk.refreshToken, meta)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await canliSayisi()).toBe(0);
  });

  it('devre dışı kullanıcı tolerans yolundan da giremiyor', async () => {
    const ilk = await servis.issueSession(IDS.user, IDS.org, meta);
    await servis.rotate(ilk.refreshToken, meta);
    await h.q(`UPDATE users SET status = 'disabled' WHERE id = $1`, [IDS.user]);
    await expect(servis.rotate(ilk.refreshToken, meta)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await canliSayisi()).toBe(0);
  });
});

describe('yenidenKullanimToleransli — saf karar', () => {
  const simdi = Date.parse('2026-10-09T20:44:00Z');
  const satir = (sn: number, sebep: string | null = 'rotated', ua: string | null = UA) => ({
    revokedAt: new Date(simdi - sn * 1000),
    revokedReason: sebep,
    userAgent: ua,
  });

  it('sınır: tam pencere içinde evet, bir milisaniye sonra hayır', () => {
    expect(yenidenKullanimToleransli(satir(YENIDEN_KULLANIM_TOLERANSI_MS / 1000), UA, simdi)).toBe(true);
    expect(
      yenidenKullanimToleransli(satir(YENIDEN_KULLANIM_TOLERANSI_MS / 1000), UA, simdi + 1),
    ).toBe(false);
  });

  it('sebep rotated değilse hayır', () => {
    for (const sebep of ['logout', 'reuse_detected', 'password_changed', null]) {
      expect(yenidenKullanimToleransli(satir(1, sebep), UA, simdi)).toBe(false);
    }
  });

  it('pencere kısa kalıyor', () => {
    // Pencereyi dakikalara çıkarmak, çalıntı token'a o kadar süre tanımak.
    expect(YENIDEN_KULLANIM_TOLERANSI_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('kaynak bekçisi', () => {
  const kaynak = readFileSync(join(__dirname, 'token.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('rotasyon iptali koşullu — revokedAt: null', () => {
    const i = kaynak.indexOf("revokedReason: 'rotated'");
    if (i < 0) throw new Error('rotasyon iptali bulunamadı — tarama boşa düştü');
    expect(kaynak.slice(kaynak.lastIndexOf('updateMany', i), i)).toContain('revokedAt: null');
  });
});
