import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../../test/pglite-harness';
import type { AppConfig } from '../../../config/configuration';
import { CryptoService } from '../../../crypto/crypto.service';
import type { PrismaAdminService } from '../../../prisma/prisma-admin.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { ikiAdimiKaldir, satirOku, sirketZorunluYaz, type SorguCalistirici } from './iki-adim-deposu';
import { IkiAdimService } from './iki-adim.service';
import { base32Coz, totpKodu } from './totp';

/**
 * ═══ 2FA — AJAN 4 KAPI TESTLERİ (saldırgan gözüyle) ═══
 *
 * İki grup:
 *   1. EŞZAMANLILIK — kilit, tekrar kullanım ve kurtarma kodu PARALEL
 *      isteklerle. Sıralı testler kilidin varlığını sınıyor; saldırgan
 *      sıralı istek atmıyor.
 *   2. GERÇEK RLS — yönetici sıfırlaması ve şirket zorunluluğu `SET ROLE`
 *      altında, `RETURNING` ile etkilenen satır sayılarak (CLAUDE.md:
 *      "patlamadı" yetmez). Yazan ajanın paketi `withTenant`i taklit edip
 *      politikayı HİÇ çalıştırmıyordu.
 */

const CONFIG = {
  encryption: { keys: { 1: Buffer.alloc(32, 7).toString('base64') }, activeVersion: 1 },
} as unknown as AppConfig;

// ---------------------------------------------------------------------------
// 1. Eşzamanlılık
// ---------------------------------------------------------------------------

describe('2FA — paralel istekler', () => {
  let h: Harness;
  let servis: IkiAdimService;
  let saat: number;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    const audit = {
      recordUnauthenticated: async () => undefined,
      record: async () => undefined,
    } as unknown as AuditService;
    const prisma = {
      withTenant: (_c: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(h.db),
    } as unknown as PrismaService;
    servis = new IkiAdimService(h.db as unknown as PrismaAdminService, prisma, new CryptoService(CONFIG), audit);
    saat = 1_800_000_000_000;
    servis.saat = () => saat;
  });

  async function kur(): Promise<{ anahtar: Buffer; kodlar: string[] }> {
    const bilgi = await servis.kurulumBaslat(IDS.user);
    const anahtar = base32Coz(bilgi.anahtar);
    const kodlar = await servis.kurulumOnayla(IDS.user, totpKodu(anahtar, saat), null);
    saat += 30_000;
    return { anahtar, kodlar };
  }

  /**
   * BULGU (B): KİLİT KONTROLÜ OKUMADA, SAYAÇ YAZMADA — paralel istek kilidi
   * atlıyor. `kodDogrula` kilidi `satirOku` ile okuyor, sayacı ayrı bir
   * UPDATE ile artırıyor. Aynı anda gelen N istek kilidi HEPSİ "yok" görüyor
   * ve N tahminin hepsi değerlendiriliyor. Beşinci hatada kilit yazılsa da
   * yoldaki istekler geçiyor. Kilit "5 tahmin / pencere" değil "saldırganın
   * bant genişliği / pencere" oluyor; 2FA.md K-8'deki yıllık olasılık hesabı
   * geçersiz.
   *
   * Kanıt: 19 yanlış + 1 doğru kod aynı anda. Kilit doğru çalışsaydı en çok
   * beş deneme değerlendirilir ve doğru kod (20.) 429 alırdı.
   */
  it('KRİTİK: 20 paralel denemede en çok 5 tahmin değerlendiriliyor, 20. (doğru) kod KİLİTTE kalıyor', async () => {
    const { anahtar } = await kur();
    const dogru = totpKodu(anahtar, saat);
    const yanlis = dogru === '000000' ? '111111' : '000000';
    const istekler = Array.from({ length: 20 }, (_, i) => (i === 19 ? dogru : yanlis));

    const sonuclar = await Promise.allSettled(istekler.map((k) => servis.kodDogrula(IDS.user, k)));

    const kabul = sonuclar.filter((s) => s.status === 'fulfilled').length;
    const hataliKod = sonuclar.filter(
      (s) => s.status === 'rejected' && (s.reason as { status?: number }).status === 401,
    ).length;

    // Kilit sağlamsa: en çok 4 "Kod hatalı" (5.si kilidi açar ve 429 döner),
    // geri kalan HER ŞEY 429 ve doğru kod KABUL EDİLMEZ.
    expect({ hataliKodUstSiniri4: Math.min(hataliKod, 5) <= 4, dogruKodKabul: kabul }).toEqual({
      hataliKodUstSiniri4: true,
      dogruKodKabul: 0,
    });
  });

  it('pozitif kontrol: aynı TOTP kodu iki sekmeden aynı anda — yalnız biri geçiyor', async () => {
    const { anahtar } = await kur();
    const kod = totpKodu(anahtar, saat);
    const [a, b] = await Promise.allSettled([servis.kodDogrula(IDS.user, kod), servis.kodDogrula(IDS.user, kod)]);
    expect([a.status, b.status].filter((s) => s === 'fulfilled')).toHaveLength(1);
  });

  it('pozitif kontrol: aynı kurtarma kodu aynı anda iki kez — yalnız biri harcanıyor', async () => {
    const { kodlar } = await kur();
    const k = kodlar[0]!;
    const r = await Promise.allSettled([servis.kodDogrula(IDS.user, k), servis.kodDogrula(IDS.user, k)]);
    expect(r.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect((await satirOku(h.db, IDS.user))!.kalanKurtarma).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// 2. Gerçek RLS
// ---------------------------------------------------------------------------

const RLS_ROL = 'advetics_iki_adim_rls_test';

const UST = 'a0000000-0000-0000-0000-0000000000aa';
const ORG_A = 'a1111111-1111-1111-1111-111111111111'; // ajans (üst hesap UST)
const ORG_B = 'b2222222-2222-2222-2222-222222222222'; // kardeş şirket (UST altında)
const ORG_C = 'c3333333-3333-3333-3333-333333333333'; // bağımsız başka şirket

const ADMIN_A = 'aaaa0000-0000-0000-0000-0000000000a1';
const UYE_A = 'aaaa0000-0000-0000-0000-0000000000a2';
const ADMIN_B = 'bbbb0000-0000-0000-0000-0000000000b1';
const UYE_B = 'bbbb0000-0000-0000-0000-0000000000b2';
const UYE_C = 'cccc0000-0000-0000-0000-0000000000c1';

interface Baglam {
  orgId: string;
  userId: string;
  isOrgAdmin: boolean;
  managerAccountId?: string | null;
  tumSirketler?: boolean;
}

describe('2FA — gerçek RLS (SET ROLE + RETURNING)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
    await h.q(`CREATE ROLE ${RLS_ROL} NOLOGIN`);
    await h.q(`GRANT USAGE ON SCHEMA public, app TO ${RLS_ROL}`);
    await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_ROL}`);
    await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${RLS_ROL}`);
    // Politikaların gerçekten uygulanması: koşum ortamı RLS'i kapatıyor.
    for (const t of ['users', 'organizations']) {
      await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
    await h.q(
      `INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
       VALUES ($1, 'Ajans', 'ajans-2fa', 'active', now(), now())`,
      [UST],
    );
    await h.q(
      `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES
         ($1, 'Ajans', 'a-2fa', $4, now()),
         ($2, 'Kardeş', 'b-2fa', $4, now()),
         ($3, 'Yabancı', 'c-2fa', NULL, now())`,
      [ORG_A, ORG_B, ORG_C, UST],
    );
    await h.q(
      `INSERT INTO users (id, org_id, email, password_hash, full_name, mfa_enabled, updated_at) VALUES
         ($1, $6, 'admin-a@x.com', 'x', 'Admin A', true, now()),
         ($2, $6, 'uye-a@x.com',   'x', 'Üye A',   true, now()),
         ($3, $7, 'admin-b@x.com', 'x', 'Admin B', true, now()),
         ($4, $7, 'uye-b@x.com',   'x', 'Üye B',   true, now()),
         ($5, $8, 'uye-c@x.com',   'x', 'Üye C',   true, now())`,
      [ADMIN_A, UYE_A, ADMIN_B, UYE_B, UYE_C, ORG_A, ORG_B, ORG_C],
    );
  });

  afterAll(async () => {
    await h.close();
  });

  /** Deponun GERÇEK fonksiyonunu politika uygulanan rolle çalıştırır. */
  async function rolIle<T>(b: Baglam, fn: (db: SorguCalistirici) => Promise<T>): Promise<T> {
    await h.q(
      `SELECT set_config('app.current_org_id', $1, false),
              set_config('app.current_user_id', $2, false),
              set_config('app.is_org_admin', $3, false),
              set_config('app.current_manager_account_id', $4, false),
              set_config('app.tum_sirketler', $5, false),
              set_config('app.current_client_ids', '', false),
              set_config('app.current_active_client_id', '', false)`,
      [b.orgId, b.userId, b.isOrgAdmin ? 'on' : 'off', b.managerAccountId ?? '', b.tumSirketler ? 'on' : 'off'],
    );
    await h.q(`SET ROLE ${RLS_ROL}`);
    try {
      return await fn(h.db as unknown as SorguCalistirici);
    } finally {
      await h.q('RESET ROLE');
    }
  }

  const sifirla = (b: Baglam, hedef: string) => rolIle(b, (db) => ikiAdimiKaldir(db, hedef));
  const zorunlu = (b: Baglam, org: string) => rolIle(b, (db) => sirketZorunluYaz(db, org, true));

  const adminA: Baglam = { orgId: ORG_A, userId: ADMIN_A, isOrgAdmin: true, managerAccountId: UST };
  const uyeA: Baglam = { orgId: ORG_A, userId: UYE_A, isOrgAdmin: false, managerAccountId: UST };
  const adminB: Baglam = { orgId: ORG_B, userId: ADMIN_B, isOrgAdmin: true, managerAccountId: null };

  beforeEach(async () => {
    await h.q(`UPDATE users SET mfa_enabled = true`);
    await h.q(`UPDATE organizations SET iki_adim_zorunlu = false`);
  });

  it('BOŞA DÜŞME BEKÇİSİ: fikstür yazıldı ve RLS açık', async () => {
    expect((await h.q<{ n: number }>('SELECT count(*)::int AS n FROM users'))[0]!.n).toBe(5);
    const r = await h.q<{ r: boolean }>(`SELECT relrowsecurity AS r FROM pg_class WHERE relname = 'users'`);
    expect(r[0]!.r).toBe(true);
    // Rol altında hiçbir şey görünmüyorsa aşağıdaki "0 satır" iddiaları anlamsız olurdu.
    expect(await sifirla(adminA, UYE_A)).toBe(1);
  });

  it('KRİTİK: yönetici KENDİ şirketindeki kullanıcıyı sıfırlıyor ve gerçekten temizleniyor', async () => {
    expect(await sifirla(adminA, UYE_A)).toBe(1);
    const s = await h.q<{ m: boolean }>('SELECT mfa_enabled AS m FROM users WHERE id = $1', [UYE_A]);
    expect(s[0]!.m).toBe(false);
  });

  it('KRİTİK: yönetici BAŞKA şirketin kullanıcısını sıfırlayamıyor (kardeş ve yabancı)', async () => {
    expect(await sifirla(adminA, UYE_B)).toBe(0);
    expect(await sifirla(adminA, UYE_C)).toBe(0);
    const s = await h.q<{ id: string; m: boolean }>('SELECT id, mfa_enabled AS m FROM users WHERE id IN ($1, $2)', [UYE_B, UYE_C]);
    expect(s.every((x) => x.m)).toBe(true);
  });

  it('KRİTİK: kardeş şirket yöneticisi AJANS kullanıcısını sıfırlayamıyor', async () => {
    expect(await sifirla(adminB, ADMIN_A)).toBe(0);
    expect(await sifirla(adminB, UYE_A)).toBe(0);
  });

  it('KRİTİK: yönetici olmayan başkasını sıfırlayamıyor', async () => {
    expect(await sifirla(uyeA, ADMIN_A)).toBe(0);
  });

  it('karar (2FA.md K-4/K-12 ile tutarlı): "tüm şirketler" modunda ajans yöneticisi kardeş şirket kullanıcısını sıfırlayabiliyor, yabancıyı DEĞİL', async () => {
    const tum: Baglam = { ...adminA, tumSirketler: true };
    expect(await sifirla(tum, UYE_B)).toBe(1);
    expect(await sifirla(tum, UYE_C)).toBe(0);
  });

  it('KRİTİK: şirket zorunluluğu — yönetici yalnız SEÇİLİ şirketini değiştiriyor', async () => {
    expect(await zorunlu(adminA, ORG_A)).toBe(1);
    expect(await zorunlu(adminA, ORG_B)).toBe(0);
    expect(await zorunlu(adminA, ORG_C)).toBe(0);
    expect(await zorunlu(adminB, ORG_A)).toBe(0);
    expect(await zorunlu(adminB, ORG_B)).toBe(1);
    const z = await h.q<{ id: string; z: boolean }>('SELECT id, iki_adim_zorunlu AS z FROM organizations');
    expect(z.find((x) => x.id === ORG_C)!.z).toBe(false);
  });

  it('KRİTİK: yönetici olmayan şirket ayarını değiştiremiyor; "tüm şirketler" modunda kardeşe yazılamıyor', async () => {
    expect(await zorunlu(uyeA, ORG_A)).toBe(0);
    expect(await zorunlu({ ...adminA, tumSirketler: true }, ORG_B)).toBe(0);
  });

  it('kaynak: servis iki yönetici yolunu BAĞLAMLI istemciyle çağırıyor (RLS yukarıda sınandı)', () => {
    const k = readFileSync(join(__dirname, 'iki-adim.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const sifirlaGovde = k.slice(k.indexOf('async kullaniciyiSifirla'), k.indexOf('async sirketZorunluAyarla'));
    const zorunluGovde = k.slice(k.indexOf('async sirketZorunluAyarla'), k.indexOf('private async denetim'));
    if (!sifirlaGovde || !zorunluGovde) throw new Error('gövde bulunamadı');
    for (const g of [sifirlaGovde, zorunluGovde]) {
      expect(g).toMatch(/this\.prisma\.withTenant\(/);
      expect(g).not.toMatch(/this\.db\b/);
    }
  });
});
