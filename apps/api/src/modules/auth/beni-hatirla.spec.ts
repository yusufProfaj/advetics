import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { loginSchema } from '@advetics/shared';
import type { AppConfig } from '../../config/configuration';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { ACCESS_COOKIE, REFRESH_COOKIE, setAuthCookies } from './cookies';
import { TokenService } from './token.service';

/**
 * ═══ "BENİ HATIRLA" ═══
 *
 * Özelliğin TAMAMI tek bir şeye dayanıyor: cookie'nin `maxAge` taşıyıp
 * taşımaması. Taşımayan cookie tarayıcı kapanınca ölüyor, taşıyan ölmüyor.
 * Bu yüzden testler "bir alan var mı"ya değil, `maxAge`ın VARLIĞINA/YOKLUĞUNA
 * çapalı.
 *
 * İkinci ve daha sinsi kısım ROTASYON: access token 15 dakikada bir yenileniyor
 * ve yenileme yeni cookie yazıyor. Kalıcılık bilgisi taşınmazsa özellik ilk
 * çeyrek saatte kendiliğinden iptal oluyor ve bunu hiçbir ekran göstermiyor.
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

interface YazilanCookie {
  ad: string;
  deger: string;
  secenekler: Record<string, unknown>;
}

function sahteResponse(): { res: Response; yazilanlar: YazilanCookie[] } {
  const yazilanlar: YazilanCookie[] = [];
  const res = {
    cookie: (ad: string, deger: string, secenekler: Record<string, unknown>) => {
      yazilanlar.push({ ad, deger, secenekler });
    },
  } as unknown as Response;
  return { res, yazilanlar };
}

function cookieAl(yazilanlar: YazilanCookie[], ad: string): YazilanCookie {
  const bulunan = yazilanlar.find((c) => c.ad === ad);
  // Cookie hiç yazılmadıysa `maxAge` iddiası "yok" diyerek BOŞA GEÇERDİ.
  if (!bulunan) throw new Error(`${ad} cookie'si hiç yazılmadı`);
  return bulunan;
}

describe('setAuthCookies — kalıcılık', () => {
  it('KRİTİK: persistent=true iken iki cookie de maxAge taşıyor', () => {
    const { res, yazilanlar } = sahteResponse();
    setAuthCookies(res, CONFIG, { accessToken: 'a', refreshToken: 'r', persistent: true });

    expect(cookieAl(yazilanlar, ACCESS_COOKIE).secenekler.maxAge).toBe(15 * 60_000);
    expect(cookieAl(yazilanlar, REFRESH_COOKIE).secenekler.maxAge).toBe(30 * 86_400_000);
  });

  it('KRİTİK: persistent=false iken HİÇBİR cookie maxAge taşımıyor', () => {
    /*
     * `maxAge: undefined` YETMEZ — express `undefined` gördüğünde alanı
     * atlıyor ama bu davranışa yaslanmak, bir sürüm yükseltmesinde sessizce
     * kalıcı cookie yazmak demek. Anahtarın HİÇ olmaması aranıyor.
     */
    const { res, yazilanlar } = sahteResponse();
    setAuthCookies(res, CONFIG, { accessToken: 'a', refreshToken: 'r', persistent: false });

    for (const ad of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      expect(Object.keys(cookieAl(yazilanlar, ad).secenekler)).not.toContain('maxAge');
    }
  });

  it('kalıcılık dışındaki güvenlik seçenekleri DEĞİŞMİYOR', () => {
    // httpOnly/sameSite'ı yanlışlıkla düşürmek, "beni hatırla" eklerken
    // CSRF ve XSS korumasını kaldırmak olurdu.
    const { res, yazilanlar } = sahteResponse();
    setAuthCookies(res, CONFIG, { accessToken: 'a', refreshToken: 'r', persistent: false });

    const refresh = cookieAl(yazilanlar, REFRESH_COOKIE).secenekler;
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.sameSite).toBe('lax');
    expect(refresh.path).toBe('/api/auth');
  });
});

// ---------------------------------------------------------------------------

interface SahteSatir {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  persistent: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { id: string; orgId: string; status: string };
}

function tokenServisi(mevcut?: SahteSatir) {
  const yazilanSatirlar: Array<Record<string, unknown>> = [];

  const jwt = { signAsync: async () => 'access-token' } as unknown as JwtService;
  const db = {
    refreshToken: {
      create: async (args: { data: Record<string, unknown> }) => {
        yazilanSatirlar.push(args.data);
        return { id: 'yeni-satir' };
      },
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      findUnique: async () => mevcut ?? null,
    },
  } as unknown as PrismaAdminService;

  return { servis: new TokenService(jwt, db, CONFIG), yazilanSatirlar };
}

describe('TokenService — kalıcılık satırda duruyor', () => {
  it('issueSession(persistent=false) satıra false yazıyor VE geri döndürüyor', async () => {
    const { servis, yazilanSatirlar } = tokenServisi();
    const tokens = await servis.issueSession('u1', 'o1', {}, false);

    expect(yazilanSatirlar[0]?.persistent).toBe(false);
    // Dönüş değeri `setAuthCookies`in tek girdisi — satıra yazılıp dönüşte
    // kaybolsa cookie yine kalıcı yazılırdı.
    expect(tokens.persistent).toBe(false);
  });

  it('issueSession varsayılanı kalıcı — kolon eklenmeden önceki davranış', async () => {
    const { servis, yazilanSatirlar } = tokenServisi();
    await servis.issueSession('u1', 'o1');
    expect(yazilanSatirlar[0]?.persistent).toBe(true);
  });

  it('KRİTİK: rotate, kalıcı OLMAYAN oturumu kalıcıya ÇEVİRMİYOR', async () => {
    /*
     * Bu testin varlık sebebi: access token 15 dakikada bir yenileniyor.
     * Rotasyon `persistent`i taşımazsa "beni hatırlama" diyen kullanıcının
     * oturumu ilk çeyrek saatte 30 günlük kalıcı bir oturuma dönüşür ve
     * ortak bilgisayarda tarayıcı kapansa bile açık kalır.
     */
    const { servis, yazilanSatirlar } = tokenServisi({
      id: 'eski',
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'h',
      persistent: false,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      user: { id: 'u1', orgId: 'o1', status: 'active' },
    });

    const tokens = await servis.rotate('sunulan-token');

    expect(yazilanSatirlar[0]?.persistent).toBe(false);
    expect(tokens.persistent).toBe(false);
  });

  it('rotate kalıcı oturumu kalıcı bırakıyor', async () => {
    const { servis, yazilanSatirlar } = tokenServisi({
      id: 'eski',
      userId: 'u1',
      familyId: 'f1',
      tokenHash: 'h',
      persistent: true,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      user: { id: 'u1', orgId: 'o1', status: 'active' },
    });

    await servis.rotate('sunulan-token');
    expect(yazilanSatirlar[0]?.persistent).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('loginSchema — rememberMe', () => {
  it('alan hiç gönderilmezse KALICI sayılıyor', () => {
    // Varsayılanı false yapmak, bu alanı bilmeyen her çağıranı sessizce
    // "tarayıcı kapanınca çık" davranışına geçirirdi.
    const r = loginSchema.parse({ email: 'a@b.com', password: 'gecerli-sifre-1' });
    expect(r.rememberMe).toBe(true);
  });

  it('false geçilebiliyor', () => {
    const r = loginSchema.parse({
      email: 'a@b.com',
      password: 'gecerli-sifre-1',
      rememberMe: false,
    });
    expect(r.rememberMe).toBe(false);
  });
});

describe('login yolu rememberMe\'yi TAŞIYOR', () => {
  it('completeLogin çağrısı input.rememberMe geçiriyor', () => {
    /*
     * KAYNAK TARAMASI, çünkü dördüncü parametrenin varsayılanı `true`:
     * çağrıdan düşürülse ne derleme kırılır ne de bir birim testi düşer —
     * özellik sessizce kapanır ve belirtisi yalnızca "kutuyu işaretlemesem
     * de hatırlıyor" olur.
     */
    const kaynak = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      '',
    );

    // BOŞA DÜŞME BEKÇİSİ: metot adı değişirse dilim boşalır ve iddia her
    // zaman doğru olurdu.
    expect(kaynak).toContain('completeLogin(');
    expect(kaynak).toContain('this.completeLogin(user.id, user.orgId, meta, input.rememberMe)');
  });
});
