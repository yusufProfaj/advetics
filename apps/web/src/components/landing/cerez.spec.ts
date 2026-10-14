import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CEREZLER, CEREZ_ANAHTARI, CEREZ_SURUMU, DEPOLAMA, bildirimGorunsunMu } from './cerez';

/**
 * Çerez bildirimi: kararın kendisi ve depo erişiminin korunduğu.
 * Bileşen render edilemiyor (vitest.config), o yüzden depo erişimi kaynak
 * taramasıyla, karar çalıştırılarak sınanıyor.
 */
describe('çerez bildirimi', () => {
  it('hiç kayıt yoksa ya da eski sürümse görünür, bu sürümse görünmez', () => {
    expect(bildirimGorunsunMu(null)).toBe(true);
    expect(bildirimGorunsunMu('0')).toBe(true);
    expect(bildirimGorunsunMu('true')).toBe(true);
    expect(bildirimGorunsunMu(CEREZ_SURUMU)).toBe(false);
  });

  it('KRİTİK: her localStorage erişimi try bloğunun içinde', () => {
    const k = readFileSync(join(__dirname, 'cerez-bildirimi.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const erisimler = [...k.matchAll(/localStorage\.(getItem|setItem)/g)];
    expect(erisimler.length, 'tarama boşa düştü').toBe(2);
    for (const e of erisimler) {
      const once = k.slice(0, e.index);
      // En yakın `try {` erişimden önce ve arada kapanmış bir `catch` yok.
      const sonTry = once.lastIndexOf('try {');
      const sonCatch = once.lastIndexOf('catch');
      expect(sonTry, e[0]).toBeGreaterThan(sonCatch);
    }
  });

  it('kart DOM\'dan çıkmıyor: koşullu render değil, sınıfla gizleniyor', () => {
    const k = readFileSync(join(__dirname, 'cerez-bildirimi.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain("className={`cerez${gor ? ' gor' : ''}`}");
    expect(k).not.toMatch(/\{gor &&|if \(!gor\) return null/);
    // Yalnız "Anladım": zorunlu çerez onay istemiyor.
    expect(k).toContain('Anladım');
    expect(k).not.toMatch(/Kabul|Reddet/);
  });
});

/**
 * ═══ ÇEREZ POLİTİKASI KODLA AYNI ═══
 *
 * Taslak üç çerez sayıp üçüne de "HttpOnly" diyordu; kodda altı çerez var
 * ve üçü `httpOnly: false`. Beyan ile gerçek böyle ayrışıyor ve hiçbir hata
 * düşmüyor. Bu test API'nin çerez tanımlarını KAYNAKTAN okuyup politikadaki
 * tabloyla karşılaştırıyor: yeni bir çerez eklenip politikaya yazılmazsa,
 * süre ya da HttpOnly değişirse düşer.
 */
const KOK = join(__dirname, '../../../../..');
const API_CEREZ = readFileSync(join(KOK, 'apps/api/src/modules/auth/cookies.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const API_AYAR = readFileSync(join(KOK, 'apps/api/src/config/configuration.ts'), 'utf8');

/** `res.cookie(AD_SABITI, ..., { ... })` çağrısının seçenek gövdesi (süslü parantez sayarak). */
function cerezYazimi(sabit: string): string {
  const i = API_CEREZ.indexOf(`res.cookie(${sabit},`);
  if (i === -1) throw new Error(`${sabit} yazımı bulunamadı — tarama boşa düştü`);
  const bas = API_CEREZ.indexOf('{', i);
  let d = 0;
  for (let j = bas; j < API_CEREZ.length; j++) {
    if (API_CEREZ[j] === '{') d++;
    if (API_CEREZ[j] === '}' && --d === 0) return API_CEREZ.slice(bas, j + 1);
  }
  throw new Error(`${sabit} kapanmadı`);
}

describe('KRİTİK: çerez politikası API\'nin yazdığı çerezlerle aynı', () => {
  const sabitler = [...API_CEREZ.matchAll(/export const (\w+_COOKIE) = '([^']+)'/g)].map((m) => ({
    sabit: m[1]!,
    ad: m[2]!,
  }));

  it('BOŞA DÜŞME BEKÇİSİ: API\'de altı çerez sabiti bulundu', () => {
    expect(sabitler.map((s) => s.ad).sort()).toEqual(
      ['adv_at', 'adv_client', 'adv_mfa', 'adv_mgr', 'adv_org', 'adv_rt'].sort(),
    );
  });

  it('API\'nin her çerezi politikada, politikada fazladan çerez yok', () => {
    expect(CEREZLER.map((c) => c.ad).sort()).toEqual(sabitler.map((s) => s.ad).sort());
  });

  it('HttpOnly yazılan çerezler politikada HttpOnly, panelin okuduğu seçim çerezleri değil', () => {
    for (const { sabit, ad } of sabitler) {
      const yazim = cerezYazimi(sabit);
      const httpOnlyKapali = /httpOnly:\s*false/.test(yazim);
      const satir = CEREZLER.find((c) => c.ad === ad)!;
      expect(satir.tur.includes('HttpOnly'), ad).toBe(!httpOnlyKapali);
    }
  });

  it('süreler koddan: 30 günlük seçimler, süresiz üst hesap, 5 dakikalık iki adım, varsayılan TTL', () => {
    const sure = (ad: string) => CEREZLER.find((c) => c.ad === ad)!.sure;
    /*
     * HER YAZIM BİR DALA DÜŞMEK ZORUNDA. İlk sürüm yalnız `parseTtl('30d')`
     * ve "maxAge yok" hâllerini soruyordu: API'de 30d → 7d yapınca ya da
     * `adv_mgr`e süre eklenince hiçbir iddia çalışmıyor ve test yeşil
     * kalıyordu (Ajan 4, mutasyonla görüldü). Tanınmayan biçim artık düşüyor.
     */
    for (const { sabit, ad } of sabitler) {
      const yazim = cerezYazimi(sabit);
      const gun = yazim.match(/maxAge: parseTtl\('(\d+)d'\)/);
      if (gun) expect(sure(ad), ad).toBe(`${gun[1]} gün`);
      else if (/tokens\.persistent \? \{ maxAge: parseTtl\(config\.jwt\.(access|refresh)Ttl\) \}/.test(yazim)) continue; // aşağıda
      else if (/maxAge: IKI_ADIM_BEKLEME_DK \* 60_000/.test(yazim)) continue; // aşağıda
      else if (!/maxAge/.test(yazim)) expect(sure(ad), ad).toMatch(/tarayıcı kapanınca silinir/i);
      else throw new Error(`${ad}: tanınmayan süre biçimi, politika satırı elle doğrulanmalı`);
    }
    expect(cerezYazimi('IKI_ADIM_COOKIE')).toContain('IKI_ADIM_BEKLEME_DK * 60_000');
    const dk = readFileSync(join(KOK, 'packages/shared/src/iki-adim/index.ts'), 'utf8').match(
      /IKI_ADIM_BEKLEME_DK = (\d+);/,
    )?.[1];
    expect(sure('adv_mfa')).toBe(`${dk} dakika`);
    // "Beni hatırla" yoksa maxAge yazılmıyor: politika iki hâli de söylemeli.
    expect(cerezYazimi('ACCESS_COOKIE')).toMatch(/tokens\.persistent \? \{ maxAge: parseTtl\(config\.jwt\.accessTtl\)/);
    expect(API_AYAR).toContain("JWT_ACCESS_TTL: z.string().default('15m')");
    expect(API_AYAR).toContain("JWT_REFRESH_TTL: z.string().default('30d')");
    expect(sure('adv_at')).toMatch(/15 dakika.*tarayıcı kapanınca silinir/);
    expect(sure('adv_rt')).toMatch(/30 gün.*tarayıcı kapanınca silinir/);
  });

  it('tarayıcı depolaması listesi panelin gerçekten kullandığı anahtarları taşıyor', () => {
    const anahtarlar = DEPOLAMA.map((d) => d.ad);
    expect(anahtarlar).toContain(CEREZ_ANAHTARI);
    const WEB = join(KOK, 'apps/web/src');
    const kaynaklar: Record<string, string> = {
      'advetics.tema': 'lib/tema.ts',
      'advetics.nav.*': 'components/nav.tsx',
      'advetics.kurulumSeridi.*': 'components/kurulum/sihirbaz-akisi.ts',
      'advetics.oturum.sonYenileme': 'components/oturum-tazeleyici.tsx',
      'advetics.topluTazeleme': 'components/connections/toplu-tazeleme.tsx',
      'advetics.gizliUyarilar': 'components/uyari-bandi.tsx',
    };
    for (const [ad, dosya] of Object.entries(kaynaklar)) {
      expect(anahtarlar, ad).toContain(ad);
      const onek = ad.replace('.*', '.');
      expect(readFileSync(join(WEB, dosya), 'utf8'), `${ad} ${dosya} içinde yok`).toContain(onek);
    }
  });

  /*
   * Yukarıdaki test listedeki anahtarların VAR olduğunu soruyor, listenin
   * EKSİKSİZ olduğunu değil: panele yeni bir `localStorage` anahtarı
   * eklenince politika onu hiç saymadan yeşil kalırdı. Depoya dokunan her
   * dosya burada adıyla; yeni bir dosya görülürse politika tablosuna bakılıp
   * buraya eklenmeli.
   */
  it('KRİTİK: tarayıcı deposuna dokunan her panel dosyası bilinen bir anahtarın evi', () => {
    const WEB = join(KOK, 'apps/web/src');
    const BILINEN = [
      'components/connections/toplu-tazeleme.tsx',
      'components/genel-bakis/kurulum-seridi.tsx',
      'components/landing/cerez-bildirimi.tsx',
      'components/nav.tsx',
      'components/oturum-tazeleyici.tsx',
      'components/tema.tsx',
      'components/uyari-bandi.tsx',
      'lib/tema.ts',
    ];
    const bulunan: string[] = [];
    (function tara(d: string) {
      for (const ad of readdirSync(d)) {
        const yol = join(d, ad);
        if (statSync(yol).isDirectory()) tara(yol);
        else if (/\.tsx?$/.test(ad) && !/\.spec\.tsx?$/.test(ad)) {
          const k = readFileSync(yol, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
          if (/(local|session)Storage\.(getItem|setItem)/.test(k)) bulunan.push(relative(WEB, yol));
        }
      }
    })(WEB);
    expect(bulunan.length, 'tarama boşa düştü').toBeGreaterThan(4);
    expect(bulunan.sort()).toEqual(BILINEN);
  });
});
