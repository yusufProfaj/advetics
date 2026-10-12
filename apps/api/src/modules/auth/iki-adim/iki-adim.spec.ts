import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import * as argon2 from 'argon2';
import { ikiAdimKodTuru, kurtarmaKoduNormallestir, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../../test/pglite-harness';
import type { AppConfig } from '../../../config/configuration';
import { CryptoService } from '../../../crypto/crypto.service';
import type { PrismaAdminService } from '../../../prisma/prisma-admin.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { AuthService } from '../auth.service';
import { ACCESS_COOKIE, IKI_ADIM_COOKIE } from '../cookies';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import type { OkumaAnahtariDogrulayici } from '../okuma-anahtari-dogrulayici.service';
import type { TenantContextService } from '../tenant-context.service';
import { TokenService, ikiAdimZorunluIhlali } from '../token.service';
import { kurulumuOnayla, satirOku } from './iki-adim-deposu';
import { IkiAdimService } from './iki-adim.service';
import { qrDataAdresi } from './qr';
import {
  base32Coz,
  base32Kodla,
  hotp,
  kilitSuresiMs,
  otpauthAdresi,
  totpDogrula,
  totpKodu,
} from './totp';

/**
 * ═══ İKİ ADIMLI DOĞRULAMA ═══
 *
 * Üç katman:
 *   1. ALGORİTMA — RFC'lerin KENDİ test vektörleri. Elle seçilmiş örnek
 *      "kendi kodumla kendi kodumu doğruladım" olurdu; RFC vektörü başka
 *      bir uygulamanın (telefondaki) ne üreteceğinin kanıtı.
 *   2. VERİTABANI — tekrar kullanım, kurtarma kodunun tek kullanımı, kaba
 *      kuvvet kilidi. PGlite (gerçek Postgres): koşullar UPDATE'in
 *      WHERE'inde ve taklitle sınanırsa taklidin kendisi sınanmış olur.
 *   3. KAPI — ara token GERÇEK bekçiden geçemiyor; giriş ikinci adımda
 *      oturum çerezi yazmıyor.
 */

const RFC_ANAHTAR = Buffer.from('12345678901234567890', 'ascii');

describe('RFC 4226 Ek D — HOTP', () => {
  const BEKLENEN = [
    '755224', '287082', '359152', '969429', '338314',
    '254676', '287922', '162583', '399871', '520489',
  ];
  it.each(BEKLENEN.map((k, i) => [i, k] as const))('sayaç %i → %s', (sayac, kod) => {
    expect(hotp(RFC_ANAHTAR, BigInt(sayac))).toBe(kod);
  });
});

describe('RFC 6238 Ek B — TOTP (SHA1, 8 hane)', () => {
  // T (saniye) → kod. Tablonun SHA1 sütunu.
  const VEKTORLER: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  it.each(VEKTORLER)('T=%i → %s', (t, kod) => {
    expect(totpKodu(RFC_ANAHTAR, t * 1000, 8)).toBe(kod);
  });
});

describe('RFC 4648 — base32', () => {
  // Dolgusuz: otpauth adresinde `=` yok.
  const VEKTORLER: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];
  it.each(VEKTORLER)('"%s" → "%s" ve geri', (duz, kodlu) => {
    expect(base32Kodla(Buffer.from(duz))).toBe(kodlu);
    expect(base32Coz(kodlu).toString()).toBe(duz);
  });

  it('20 baytlık anahtar gidiş-dönüşte bozulmuyor (bit maskesi)', () => {
    const a = Buffer.from(Array.from({ length: 20 }, (_, i) => (i * 37 + 250) & 0xff));
    expect(base32Coz(base32Kodla(a)).equals(a)).toBe(true);
    expect(base32Coz(base32Kodla(a).toLowerCase().replace(/(.{4})/g, '$1 ')).equals(a)).toBe(true);
  });

  it('geçersiz karakter FIRLATIYOR, sessizce atılmıyor', () => {
    expect(() => base32Coz('MZ1W')).toThrow();
  });
});

describe('totpDogrula — zaman kayması penceresi', () => {
  const T = 1_700_000_000_000; // adım ortası değil, rastgele bir an
  const adim = BigInt(Math.floor(T / 30_000));

  it('şimdiki adım kabul ve EŞLEŞEN ADIM dönüyor', () => {
    expect(totpDogrula(RFC_ANAHTAR, totpKodu(RFC_ANAHTAR, T), T)).toBe(adim);
  });

  it('KRİTİK: ±1 adım kabul, dönen adım kodun KENDİ adımı', () => {
    expect(totpDogrula(RFC_ANAHTAR, totpKodu(RFC_ANAHTAR, T - 30_000), T)).toBe(adim - 1n);
    expect(totpDogrula(RFC_ANAHTAR, totpKodu(RFC_ANAHTAR, T + 30_000), T)).toBe(adim + 1n);
  });

  it('KRİTİK: ±2 adım reddediliyor', () => {
    expect(totpDogrula(RFC_ANAHTAR, totpKodu(RFC_ANAHTAR, T - 60_000), T)).toBeNull();
    expect(totpDogrula(RFC_ANAHTAR, totpKodu(RFC_ANAHTAR, T + 60_000), T)).toBeNull();
  });

  it('yanlış uzunluk ve boş girdi reddediliyor', () => {
    expect(totpDogrula(RFC_ANAHTAR, '12345', T)).toBeNull();
    expect(totpDogrula(RFC_ANAHTAR, '', T)).toBeNull();
  });
});

describe('kilitSuresiMs — katlanan kilit', () => {
  it('beşin katı olmayan sayıda kilit yok', () => {
    for (const n of [0, 1, 4, 6, 9]) expect(kilitSuresiMs(n)).toBe(0);
  });
  it('KRİTİK: 5 → 15 dk, 10 → 30 dk, 15 → 60 dk, en çok 24 sa', () => {
    expect(kilitSuresiMs(5)).toBe(15 * 60_000);
    expect(kilitSuresiMs(10)).toBe(30 * 60_000);
    expect(kilitSuresiMs(15)).toBe(60 * 60_000);
    expect(kilitSuresiMs(500)).toBe(24 * 60 * 60_000);
  });
});

describe('kod biçimi (panel ve API ortak)', () => {
  it('6 hane totp, boşluk yok sayılıyor', () => {
    expect(ikiAdimKodTuru('123456')).toBe('totp');
    expect(ikiAdimKodTuru('123 456')).toBe('totp');
  });
  it('kurtarma kodu: tire, büyük harf ve karışan harfler normalleşiyor', () => {
    expect(ikiAdimKodTuru('ABCD-EFGH-JKMN')).toBe('kurtarma');
    expect(kurtarmaKoduNormallestir('AbcO-L1I0')).toBe('abc0-1110'.replace('-', ''));
  });
  it('5 hane ya da alfabe dışı karakter reddediliyor', () => {
    expect(ikiAdimKodTuru('12345')).toBeNull();
    expect(ikiAdimKodTuru('abcd-efgh-jku!')).toBeNull();
  });
});

describe('otpauth adresi ve QR', () => {
  it('parametreler AÇIKÇA yazılıyor', () => {
    const a = otpauthAdresi(RFC_ANAHTAR, 'ayse@ornek.com');
    expect(a.startsWith('otpauth://totp/Advetics:ayse%40ornek.com?')).toBe(true);
    const p = new URL(a.replace('otpauth://', 'https://')).searchParams;
    expect(p.get('secret')).toBe(base32Kodla(RFC_ANAHTAR));
    expect(p.get('issuer')).toBe('Advetics');
    expect(p.get('algorithm')).toBe('SHA1');
    expect(p.get('digits')).toBe('6');
    expect(p.get('period')).toBe('30');
  });

  it('QR bir SVG data adresi, kılavuz renkleri, betik yok', () => {
    const d = qrDataAdresi(otpauthAdresi(RFC_ANAHTAR, 'a@b.com'));
    expect(d.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const svg = Buffer.from(d.split(',')[1]!, 'base64').toString();
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toMatch(/<script|on\w+=/i);
    // Modül var: boş bir yol "QR çizildi" görünür ama okunamaz.
    expect((svg.match(/h1v1h-1z/g) ?? []).length).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Veritabanı — gerçek Postgres
// ---------------------------------------------------------------------------

const CONFIG = {
  encryption: { keys: { 1: Buffer.alloc(32, 7).toString('base64') }, activeVersion: 1 },
  jwt: { accessSecret: 'a'.repeat(32), refreshSecret: 'r'.repeat(32), accessTtl: '15m', refreshTtl: '30d' },
  cookie: { domain: 'localhost', secure: false },
} as unknown as AppConfig;

const BASKA = '66666666-6666-6666-6666-666666666666';

function baglam(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: IDS.user,
    orgId: IDS.org,
    clientIds: [],
    activeClientId: null,
    managerAccountId: null,
    platformAdmin: false,
    tumSirketler: false,
    role: 'admin',
    isOrgAdmin: true,
    permissions: [],
    ...over,
  } as TenantContext;
}

describe('IkiAdimService — veritabanıyla', () => {
  let h: Harness;
  let servis: IkiAdimService;
  let saat: number;
  const denetim: string[] = [];

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    await h.q(
      `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
       VALUES ($1, $2, 'diger@advetics.com', 'x', 'Diğer', now())`,
      [BASKA, IDS.org],
    );
    denetim.length = 0;
    const audit = {
      recordUnauthenticated: async (_o: string, e: { action: string }) => void denetim.push(e.action),
      record: async (_tx: unknown, _c: unknown, e: { action: string }) => void denetim.push(e.action),
    } as unknown as AuditService;
    const prisma = {
      withTenant: (_c: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(h.db),
    } as unknown as PrismaService;
    servis = new IkiAdimService(
      h.db as unknown as PrismaAdminService,
      prisma,
      new CryptoService(CONFIG),
      audit,
    );
    saat = 1_800_000_000_000;
    servis.saat = () => saat;
  });

  /** Kurulumu baştan sona yapar; anahtarı ve kurtarma kodlarını döndürür. */
  async function kur(userId: string = IDS.user): Promise<{ anahtar: Buffer; kodlar: string[] }> {
    const bilgi = await servis.kurulumBaslat(userId);
    const anahtar = base32Coz(bilgi.anahtar);
    const kodlar = await servis.kurulumOnayla(userId, totpKodu(anahtar, saat), null);
    return { anahtar, kodlar };
  }

  it('kurulum: anahtar ŞİFRELİ saklanıyor, açılınca 10 kod ve son adım yazılıyor', async () => {
    const bilgi = await servis.kurulumBaslat(IDS.user);
    const ham = (await h.q<{ mfa_secret_enc: Uint8Array; mfa_enabled: boolean }>(
      'SELECT mfa_secret_enc, mfa_enabled FROM users WHERE id = $1',
      [IDS.user],
    ))[0]!;
    expect(ham.mfa_enabled).toBe(false);
    // Düz anahtar baytları veritabanında YOK.
    expect(Buffer.from(ham.mfa_secret_enc).includes(base32Coz(bilgi.anahtar))).toBe(false);

    const kodlar = await servis.kurulumOnayla(IDS.user, totpKodu(base32Coz(bilgi.anahtar), saat), null);
    expect(kodlar).toHaveLength(10);
    expect(new Set(kodlar).size).toBe(10);
    for (const k of kodlar) expect(k).toMatch(/^[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/);

    const s = (await satirOku(h.db, IDS.user))!;
    expect(s.acik).toBe(true);
    expect(s.kalanKurtarma).toBe(10);
    expect(s.sonAdim).toBe(BigInt(Math.floor(saat / 30_000)));
    // Özet saklanıyor, kod değil.
    const ozetler = (await h.q<{ k: string[] }>('SELECT mfa_kurtarma_kodlari AS k FROM users WHERE id = $1', [IDS.user]))[0]!.k;
    expect(ozetler.some((o) => kodlar.includes(o))).toBe(false);
  });

  it('yanlış kodla kurulum açılmıyor', async () => {
    await servis.kurulumBaslat(IDS.user);
    await expect(servis.kurulumOnayla(IDS.user, '000000', null)).rejects.toThrow(/Kod tutmadı/);
    expect((await satirOku(h.db, IDS.user))!.acik).toBe(false);
  });

  it('KRİTİK: açıkken kurulum yeniden başlatılamıyor (anahtar ezilmiyor)', async () => {
    const { anahtar } = await kur();
    await expect(servis.kurulumBaslat(IDS.user)).rejects.toThrow(/zaten açık/);
    saat += 30_000;
    await expect(servis.kodDogrula(IDS.user, totpKodu(anahtar, saat))).resolves.toMatchObject({ tur: 'totp' });
  });

  it('KRİTİK: onay, OKUNAN anahtar değiştiyse yazmıyor (iki sekme yarışı)', async () => {
    const ilk = await servis.kurulumBaslat(IDS.user);
    const eskiSifreli = (await satirOku(h.db, IDS.user))!.anahtarSifreli!;
    await servis.kurulumBaslat(IDS.user); // ikinci sekme
    const n = await kurulumuOnayla(h.db, IDS.user, eskiSifreli, [], 1n, new Date(saat));
    expect(n).toBe(0);
    expect(ilk.anahtar).toBeTruthy();
  });

  it('KRİTİK: aynı kod iki kez geçmiyor (tekrar kullanım)', async () => {
    const { anahtar } = await kur();
    saat += 30_000;
    const kod = totpKodu(anahtar, saat);
    await expect(servis.kodDogrula(IDS.user, kod)).resolves.toMatchObject({ tur: 'totp' });
    await expect(servis.kodDogrula(IDS.user, kod)).rejects.toThrow(/az önce kullanıldı/);
  });

  it('KRİTİK: daha yeni bir adım kullanıldıktan sonra ESKİ adımın kodu (pencerede olsa da) geçmiyor', async () => {
    const { anahtar } = await kur();
    saat += 60_000;
    const yeni = totpKodu(anahtar, saat);
    const onceki = totpKodu(anahtar, saat - 30_000);
    await servis.kodDogrula(IDS.user, yeni);
    await expect(servis.kodDogrula(IDS.user, onceki)).rejects.toThrow(/az önce kullanıldı/);
  });

  it('KRİTİK: kurtarma kodu TEK kullanımlık, biçim farkı (büyük harf, tiresiz) aynı kod', async () => {
    const { kodlar } = await kur();
    const k = kodlar[3]!;
    const r = await servis.kodDogrula(IDS.user, k.toUpperCase().replace(/-/g, ' '));
    expect(r).toEqual({ tur: 'kurtarma', kalanKurtarma: 9 });
    await expect(servis.kodDogrula(IDS.user, k)).rejects.toThrow(/Kurtarma kodu hatalı/);
    expect((await satirOku(h.db, IDS.user))!.kalanKurtarma).toBe(9);
    expect(denetim).toContain('auth.iki_adim_kurtarma_kodu_kullanildi');
  });

  it('KRİTİK: 5 hatalı denemede kilit; kilitliyken DOĞRU kod da reddediliyor ve tüketilmiyor', async () => {
    const { anahtar } = await kur();
    saat += 30_000;
    for (let i = 0; i < 4; i++) {
      await expect(servis.kodDogrula(IDS.user, '000000')).rejects.toThrow(/Kod hatalı/);
    }
    await expect(servis.kodDogrula(IDS.user, '000000')).rejects.toMatchObject({ status: 429 });
    expect(denetim).toContain('auth.iki_adim_kilitlendi');

    const once = (await satirOku(h.db, IDS.user))!.sonAdim;
    await expect(servis.kodDogrula(IDS.user, totpKodu(anahtar, saat))).rejects.toMatchObject({ status: 429 });
    expect((await satirOku(h.db, IDS.user))!.sonAdim).toBe(once);

    // Kilit bitince doğru kod geçiyor ve sayaç sıfırlanıyor.
    saat += 15 * 60_000 + 1_000;
    await expect(servis.kodDogrula(IDS.user, totpKodu(anahtar, saat))).resolves.toMatchObject({ tur: 'totp' });
    const s = (await satirOku(h.db, IDS.user))!;
    expect(s.basarisiz).toBe(0);
    expect(s.kilitBitis).toBeNull();
  });

  it('kilit katlanıyor: 10. hatada 30 dakika', async () => {
    await kur();
    for (let i = 1; i <= 10; i++) {
      await servis.kodDogrula(IDS.user, '000000').catch(() => undefined);
      if (i === 5) saat += 15 * 60_000 + 1_000; // ilk kilidi bekle
    }
    const s = (await satirOku(h.db, IDS.user))!;
    expect(s.basarisiz).toBe(10);
    expect(s.kilitBitis!.getTime() - saat).toBe(30 * 60_000);
  });

  it('biçimi bozuk girdi deneme hakkı yemiyor', async () => {
    await kur();
    for (let i = 0; i < 6; i++) {
      await expect(servis.kodDogrula(IDS.user, '12345')).rejects.toThrow(/6 haneli/);
    }
    expect((await satirOku(h.db, IDS.user))!.basarisiz).toBe(0);
  });

  it('kurtarma kodu yenilemesi yalnızca UYGULAMA kodu kabul ediyor ve eskileri geçersiz kılıyor', async () => {
    const { anahtar, kodlar } = await kur();
    await expect(servis.kurtarmaKodlariniYenile(baglam(), kodlar[0]!, {})).rejects.toThrow(/Uygulamadaki/);
    saat += 30_000;
    const yeni = await servis.kurtarmaKodlariniYenile(baglam(), totpKodu(anahtar, saat), {});
    expect(yeni).toHaveLength(10);
    await expect(servis.kodDogrula(IDS.user, kodlar[1]!)).rejects.toThrow(/Kurtarma kodu hatalı/);
    await expect(servis.kodDogrula(IDS.user, yeni[0]!)).resolves.toMatchObject({ tur: 'kurtarma' });
  });

  it('kapatma: geçerli kod şart; kapanınca anahtar, kodlar, sayaç temizleniyor', async () => {
    const { anahtar } = await kur();
    saat += 30_000;
    await expect(servis.kapat(baglam(), '000000', {})).rejects.toThrow(/Kod hatalı/);
    await servis.kapat(baglam(), totpKodu(anahtar, saat), {});
    const s = (await satirOku(h.db, IDS.user))!;
    expect(s).toMatchObject({ acik: false, anahtarSifreli: null, kalanKurtarma: 0, sonAdim: null, basarisiz: 0 });
  });

  it('KRİTİK: şirket zorunlu tutuyorsa kapatılamıyor', async () => {
    const { anahtar } = await kur();
    await h.q('UPDATE organizations SET iki_adim_zorunlu = true WHERE id = $1', [IDS.org]);
    saat += 30_000;
    await expect(servis.kapat(baglam(), totpKodu(anahtar, saat), {})).rejects.toThrow(/zorunlu/);
    expect((await satirOku(h.db, IDS.user))!.acik).toBe(true);
  });

  it('yönetici sıfırlaması: kendine kapalı, yönetici olmayana kapalı, başkasında temizliyor', async () => {
    await kur(BASKA);
    await expect(servis.kullaniciyiSifirla(baglam(), IDS.user, {})).rejects.toThrow(/Hesabım/);
    await expect(
      servis.kullaniciyiSifirla(baglam({ isOrgAdmin: false }), BASKA, {}),
    ).rejects.toThrow(/yöneticiler/);
    await servis.kullaniciyiSifirla(baglam(), BASKA, {});
    expect((await satirOku(h.db, BASKA))!.acik).toBe(false);
    expect(denetim).toContain('user.iki_adim_sifirlandi');
  });

  it('yönetici sıfırlaması görünmeyen kullanıcıda "bulunamadı" — sessiz başarı DEĞİL', async () => {
    await expect(
      servis.kullaniciyiSifirla(baglam(), '77777777-7777-7777-7777-777777777777', {}),
    ).rejects.toThrow(/bulunamadı/);
  });

  it('KRİTİK: şirket zorunluluğunu açmak için yöneticinin kendi 2FA\'sı açık olmalı', async () => {
    await expect(servis.sirketZorunluAyarla(baglam(), true, {})).rejects.toThrow(/Önce kendi hesabında/);
    await kur();
    await servis.sirketZorunluAyarla(baglam(), true, {});
    const d = await servis.durum(baglam());
    expect(d.sirketteZorunlu).toBe(true);
    expect(d.secilenSirket).toMatchObject({ ad: 'Test', zorunlu: true, degistirebilir: true });
    // Kapatmak için 2FA şartı yok.
    await servis.sirketZorunluAyarla(baglam(), false, {});
    expect((await servis.durum(baglam())).sirketteZorunlu).toBe(false);
  });

  it('"tüm şirketler" görünümünde şirket ayarı yok', async () => {
    const d = await servis.durum(baglam({ tumSirketler: true }));
    expect(d.secilenSirket).toBeNull();
    await expect(servis.sirketZorunluAyarla(baglam({ tumSirketler: true }), false, {})).rejects.toThrow(
      /şirket seç/,
    );
  });

  it('KRİTİK (B-1): kurtarma kodu yolu da hak ayırıyor — 5. hatalı kurtarma kodu kilitliyor', async () => {
    await kur();
    for (let i = 0; i < 4; i++) {
      await expect(servis.kodDogrula(IDS.user, 'zzzz-zzzz-zzzz')).rejects.toMatchObject({ status: 401 });
    }
    await expect(servis.kodDogrula(IDS.user, 'zzzz-zzzz-zzzz')).rejects.toMatchObject({ status: 429 });
    expect((await satirOku(h.db, IDS.user))!.kilitBitis!.getTime() - saat).toBe(15 * 60_000);
  });

  it('KRİTİK (B-1): SQL kilit süresi kilitSuresiMs ile aynı (15. hatada 60 dk)', async () => {
    await kur();
    for (let i = 1; i <= 15; i++) {
      await servis.kodDogrula(IDS.user, '000000').catch(() => undefined);
      if (i % 5 === 0 && i < 15) saat += kilitSuresiMs(i) + 1_000;
    }
    expect((await satirOku(h.db, IDS.user))!.kilitBitis!.getTime() - saat).toBe(kilitSuresiMs(15));
  });

  describe('Ö-1: oturumla kurulum onayı parola istiyor', () => {
    beforeEach(async () => {
      await h.q('UPDATE users SET password_hash = $1 WHERE id = $2', [
        await argon2.hash('dogru-parola-123'),
        IDS.user,
      ]);
    });

    it('KRİTİK: yanlış parola 2FA AÇMIYOR ve deneme hakkı yiyor', async () => {
      const b = await servis.kurulumBaslat(IDS.user);
      const kod = totpKodu(base32Coz(b.anahtar), saat);
      await expect(servis.kurulumOnayla(IDS.user, kod, 'yanlis-parola-1')).rejects.toThrow('Şifre hatalı');
      const s = (await satirOku(h.db, IDS.user))!;
      expect(s.acik).toBe(false);
      expect(s.basarisiz).toBe(1);
    });

    it('KRİTİK: parola tahmini de kilitleniyor (çalınmış oturum sınırsız tahmin yapamaz)', async () => {
      const b = await servis.kurulumBaslat(IDS.user);
      const kod = totpKodu(base32Coz(b.anahtar), saat);
      for (let i = 0; i < 4; i++) {
        await expect(servis.kurulumOnayla(IDS.user, kod, `yanlis-${i}`)).rejects.toThrow('Şifre hatalı');
      }
      await expect(servis.kurulumOnayla(IDS.user, kod, 'yanlis-5')).rejects.toMatchObject({ status: 429 });
      await expect(servis.kurulumOnayla(IDS.user, kod, 'dogru-parola-123')).rejects.toMatchObject({ status: 429 });
    });

    it('doğru parola + doğru kod açıyor, sayaç sıfır', async () => {
      const b = await servis.kurulumBaslat(IDS.user);
      const kod = totpKodu(base32Coz(b.anahtar), saat);
      await servis.kurulumOnayla(IDS.user, kod, 'dogru-parola-123');
      expect((await satirOku(h.db, IDS.user))!).toMatchObject({ acik: true, basarisiz: 0 });
    });
  });
});

// ---------------------------------------------------------------------------
// Kapı: ara token korumalı uca geçemiyor (GERÇEK bekçi)
// ---------------------------------------------------------------------------

function bekci(tokens: TokenService): JwtAuthGuard {
  const reflector = { getAllAndOverride: () => undefined } as unknown as Reflector;
  // Token doğrulanırsa bağlam her zaman kurulur: bekçinin reddi YALNIZCA
  // token türünden gelmek zorunda.
  const tenant = {
    resolve: async () => ({ actor: { orgId: IDS.org }, context: baglam() }),
  } as unknown as TenantContextService;
  return new JwtAuthGuard(reflector, tokens, tenant, {} as OkumaAnahtariDogrulayici);
}

function istek(opts: { bearer?: string; cookies?: Record<string, string> }): ExecutionContext {
  const req = {
    cookies: opts.cookies ?? {},
    get: (h: string) => (h.toLowerCase() === 'authorization' && opts.bearer ? `Bearer ${opts.bearer}` : undefined),
  };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('ara token — gerçek bekçi ve gerçek JWT', () => {
  const tokens = new TokenService(new JwtService({}), {} as PrismaAdminService, CONFIG);

  it('pozitif kontrol: erişim token\'ı bekçiden geçiyor', async () => {
    const at = await tokens.signAccessToken(IDS.user, IDS.org);
    await expect(bekci(tokens).canActivate(istek({ bearer: at }))).resolves.toBe(true);
  });

  it('KRİTİK: ara token Bearer olarak reddediliyor', async () => {
    const ara = await tokens.signIkiAdimToken(IDS.user, IDS.org, 'dogrula', true);
    await expect(bekci(tokens).canActivate(istek({ bearer: ara }))).rejects.toThrow(/Oturum geçersiz/);
  });

  it('KRİTİK: ara token erişim çerezine konsa da reddediliyor', async () => {
    const ara = await tokens.signIkiAdimToken(IDS.user, IDS.org, 'kurulum', false);
    await expect(
      bekci(tokens).canActivate(istek({ cookies: { [ACCESS_COOKIE]: ara } })),
    ).rejects.toThrow(/Oturum geçersiz/);
  });

  it('KRİTİK: yalnızca ara çerez taşıyan istek oturumsuz sayılıyor', async () => {
    const ara = await tokens.signIkiAdimToken(IDS.user, IDS.org, 'dogrula', true);
    await expect(
      bekci(tokens).canActivate(istek({ cookies: { [IKI_ADIM_COOKIE]: ara } })),
    ).rejects.toThrow(/Oturum açmanız gerekiyor/);
  });

  it('ters yön: erişim token\'ı ara token yerine geçmiyor, amaç karışmıyor', async () => {
    const at = await tokens.signAccessToken(IDS.user, IDS.org);
    await expect(tokens.verifyIkiAdimToken(at, 'dogrula')).rejects.toThrow(/süresi doldu/);
    const kurulum = await tokens.signIkiAdimToken(IDS.user, IDS.org, 'kurulum', true);
    await expect(tokens.verifyIkiAdimToken(kurulum, 'dogrula')).rejects.toThrow(/süresi doldu/);
    await expect(tokens.verifyIkiAdimToken(kurulum, 'kurulum')).resolves.toMatchObject({
      sub: IDS.user,
      hatirla: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Giriş: parola doğru + 2FA açık → OTURUM YOK
// ---------------------------------------------------------------------------

describe('AuthService.login — ikinci adım', () => {
  async function servis(kullanici: { mfaEnabled: boolean; zorunlu: boolean }) {
    const hash = await argon2.hash('dogru-parola-123');
    const oturumAcildi: string[] = [];
    const admin = {
      user: {
        findMany: async () => [
          {
            id: IDS.user,
            orgId: IDS.org,
            passwordHash: hash,
            mfaEnabled: kullanici.mfaEnabled,
            organization: { ikiAdimZorunlu: kullanici.zorunlu },
          },
        ],
      },
    } as unknown as PrismaAdminService;
    const tokens = new TokenService(new JwtService({}), {} as PrismaAdminService, CONFIG);
    (tokens as unknown as { issueSession: () => never }).issueSession = () => {
      oturumAcildi.push('issueSession');
      throw new Error('OTURUM AÇILDI');
    };
    const auth = new AuthService(
      admin,
      {} as PrismaService,
      tokens,
      {} as TenantContextService,
      {} as AuditService,
      CONFIG,
      {} as IkiAdimService,
    );
    return { auth, oturumAcildi, tokens };
  }

  it('KRİTİK: 2FA açıksa oturum açılmıyor, "dogrula" ara token\'ı dönüyor', async () => {
    const { auth, oturumAcildi, tokens } = await servis({ mfaEnabled: true, zorunlu: false });
    const r = await auth.login({ email: 'a@b.com', password: 'dogru-parola-123', rememberMe: false }, {});
    expect(oturumAcildi).toEqual([]);
    expect(r).toMatchObject({ ikiAdim: 'dogrula' });
    const p = await tokens.verifyIkiAdimToken((r as { araToken: string }).araToken, 'dogrula');
    expect(p.hatirla).toBe(false);
  });

  it('KRİTİK: şirket zorunlu ve kullanıcı kurmamışsa "kurulum"', async () => {
    const { auth, oturumAcildi } = await servis({ mfaEnabled: false, zorunlu: true });
    const r = await auth.login({ email: 'a@b.com', password: 'dogru-parola-123', rememberMe: true }, {});
    expect(oturumAcildi).toEqual([]);
    expect(r).toMatchObject({ ikiAdim: 'kurulum' });
  });

  it('KRİTİK: parola yanlışken 2FA bilgisi sızmıyor — aynı hata', async () => {
    const { auth } = await servis({ mfaEnabled: true, zorunlu: false });
    await expect(
      auth.login({ email: 'a@b.com', password: 'yanlis-parola-999', rememberMe: true }, {}),
    ).rejects.toThrow('E-posta veya şifre hatalı');
  });

  it('2FA yok ve zorunlu değilse oturum açılıyor (eski davranış)', async () => {
    const { auth, oturumAcildi } = await servis({ mfaEnabled: false, zorunlu: false });
    await expect(
      auth.login({ email: 'a@b.com', password: 'dogru-parola-123', rememberMe: true }, {}),
    ).rejects.toThrow('OTURUM AÇILDI');
    expect(oturumAcildi).toEqual(['issueSession']);
  });
});

describe('oturum yenileme — şirket zorunluluğu', () => {
  it('saf karar: yalnızca zorunlu VE kapalıyken ihlal; eksik alan ihlal değil', () => {
    expect(ikiAdimZorunluIhlali({ mfaEnabled: false, organization: { ikiAdimZorunlu: true } })).toBe(true);
    expect(ikiAdimZorunluIhlali({ mfaEnabled: true, organization: { ikiAdimZorunlu: true } })).toBe(false);
    expect(ikiAdimZorunluIhlali({ mfaEnabled: false, organization: { ikiAdimZorunlu: false } })).toBe(false);
    expect(ikiAdimZorunluIhlali({})).toBe(false);
  });

  it('KRİTİK: rotate zorunluluk ihlalinde aileyi kapatıyor ve yeni token VERMİYOR', async () => {
    const kapatilan: string[] = [];
    const db = {
      refreshToken: {
        findUnique: async () => ({
          id: 't1',
          userId: IDS.user,
          familyId: 'aile',
          persistent: true,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          revokedReason: null,
          userAgent: null,
          user: {
            id: IDS.user,
            orgId: IDS.org,
            status: 'active',
            mfaEnabled: false,
            organization: { ikiAdimZorunlu: true },
          },
        }),
        updateMany: async (a: { where: { familyId?: string }; data: { revokedReason: string } }) => {
          kapatilan.push(`${a.where.familyId}:${a.data.revokedReason}`);
          return { count: 1 };
        },
        create: async () => {
          throw new Error('YENİ TOKEN ÜRETİLDİ');
        },
      },
    } as unknown as PrismaAdminService;
    const tokens = new TokenService(new JwtService({}), db, CONFIG);
    await expect(tokens.rotate('herhangi')).rejects.toThrow(/zorunlu yaptı/);
    expect(kapatilan).toEqual(['aile:iki_adim_zorunlu']);
  });

  it('KRİTİK (N-1): 30 sn tolerans yolu da zorunluluğu denetliyor, yeni token VERMİYOR', async () => {
    const kapatilan: string[] = [];
    const db = {
      refreshToken: {
        // Az önce döndürülmüş, aynı tarayıcıdan tekrar sunulan token: tolerans koşullarının hepsi tutuyor.
        findUnique: async () => ({
          id: 't1',
          userId: IDS.user,
          familyId: 'aile',
          persistent: true,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(Date.now() - 1_000),
          revokedReason: 'rotated',
          userAgent: 'UA',
          user: {
            id: IDS.user,
            orgId: IDS.org,
            status: 'active',
            mfaEnabled: false,
            organization: { ikiAdimZorunlu: true },
          },
        }),
        count: async () => 0,
        updateMany: async (a: { where: { familyId?: string }; data: { revokedReason: string } }) => {
          kapatilan.push(`${a.where.familyId}:${a.data.revokedReason}`);
          return { count: 1 };
        },
        create: async () => {
          throw new Error('YENİ TOKEN ÜRETİLDİ');
        },
      },
    } as unknown as PrismaAdminService;
    const tokens = new TokenService(new JwtService({}), db, CONFIG);
    await expect(tokens.rotate('herhangi', { userAgent: 'UA' })).rejects.toThrow(/zorunlu yaptı/);
    expect(kapatilan).toEqual(['aile:iki_adim_zorunlu']);
  });

  it('pozitif kontrol: zorunluluk yoksa tolerans yolu token veriyor', async () => {
    let olusturuldu = 0;
    const db = {
      refreshToken: {
        findUnique: async () => ({
          id: 't1', userId: IDS.user, familyId: 'aile', persistent: true,
          expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(Date.now() - 1_000),
          revokedReason: 'rotated', userAgent: 'UA',
          user: { id: IDS.user, orgId: IDS.org, status: 'active', mfaEnabled: false, organization: { ikiAdimZorunlu: false } },
        }),
        count: async () => 0,
        updateMany: async () => ({ count: 1 }),
        create: async () => {
          olusturuldu++;
          return { id: 'yeni' };
        },
      },
    } as unknown as PrismaAdminService;
    const tokens = new TokenService(new JwtService({}), db, CONFIG);
    await tokens.rotate('herhangi', { userAgent: 'UA' });
    expect(olusturuldu).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Kaynak taramaları — birim testinin göremediği bağlantılar
// ---------------------------------------------------------------------------

const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('kaynak taramaları', () => {
  const kaynak = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

  it('KRİTİK: Nest modül kaydı — denetleyici ve servis auth modülünde', () => {
    // Kayıt eksikliği derlemede değil AÇILIŞTA patlıyor (CLAUDE.md).
    const m = kaynak('../auth.module.ts');
    expect(m).toMatch(/controllers:\s*\[[^\]]*IkiAdimController/);
    expect(m).toMatch(/providers:\s*\[[\s\S]*?IkiAdimService[\s\S]*?\]/);
  });

  it('KRİTİK: bekçi ara çerezi OKUMUYOR', () => {
    const g = kaynak('../guards/jwt-auth.guard.ts');
    expect(g).toContain('ACCESS_COOKIE'); // boşa düşme bekçisi: doğru dosya
    expect(g).not.toContain('IKI_ADIM_COOKIE');
    expect(g).not.toContain('adv_mfa');
  });

  it('KRİTİK: girişte ara token dalı oturum çerezini YAZMADAN dönüyor', () => {
    const c = kaynak('../auth.controller.ts');
    const bas = c.indexOf('async login(');
    expect(bas).toBeGreaterThan(-1);
    const govde = c.slice(bas, c.indexOf('\n  }\n', bas));
    const dal = govde.slice(govde.indexOf("'araToken' in result"));
    const donus = dal.indexOf('return { ikiAdim');
    expect(donus).toBeGreaterThan(-1);
    expect(dal.slice(0, donus)).not.toContain('setAuthCookies');
  });

  it('KRİTİK (Ö-1): oturum yolu parolayı geçiriyor; null YALNIZCA girişteki kurulumda', () => {
    const c = kaynak('./iki-adim.controller.ts');
    expect(c).toContain('this.ikiAdim.kurulumOnayla(ctx.userId, dto.kod, dto.parola)');
    expect(c).toContain('zodBody(ikiAdimKurulumOnaySchema)');
    const a = kaynak('../auth.service.ts');
    const nullCagri = [...a.matchAll(/kurulumOnayla\([^)]*\bnull\)/g)];
    expect(nullCagri).toHaveLength(1);
    const giris = a.slice(a.indexOf('async girisKurulumOnayla('));
    expect(giris.indexOf('kurulumOnayla(user.id, kod, null)')).toBeGreaterThan(-1);
  });

  it('kurulum onayı diğer oturumları kapatıyor', () => {
    const c = kaynak('./iki-adim.controller.ts');
    const bas = c.indexOf('async kurulumOnay(');
    expect(bas).toBeGreaterThan(-1);
    expect(c.slice(bas, c.indexOf('\n  }\n', bas))).toContain('revokeOthersForUser');
  });
});
