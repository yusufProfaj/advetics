import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';

import { AJANS, usd } from './fiyat';
import {
  BAGLANDIGI_YERLER,
  COZUMLER,
  ENTEGRASYON_GRUPLARI,
  FIYAT_SORULARI,
  GUVENLIK,
  GUVENLIK_OZETI,
  MODUL_BOLUMLERI,
  NASIL_CALISIR,
  OZELLIKLER,
  SENARYOLAR,
  SITE_SAYFALARI,
  UST_MENU,
  YAKINDA_ENTEGRASYONLAR,
  YASAL_BELGELER,
} from './site-icerik';

/**
 * ═══ TANITIM SİTESİ BEKÇİSİ ═══
 *
 * Kilitlenen şeylerin hepsi SESSİZ arızalar:
 *  · Middleware listesine yazılmayan sayfa oturumsuz ziyaretçiyi /login'e
 *    atıyor; geliştiricinin oturumu açıkken HİÇ görünmüyor.
 *  · Site haritasına girmeyen sayfa aranmıyor; hata yok.
 *  · Menüde başka, sayfada başka ad (CLAUDE.md, "AYNI EKRANIN MENÜDE VE
 *    SAYFADA İKİ AYRI ADI").
 *  · Kılavuz dışı renk, uzun tire, uydurulmuş fiyat ya da sertifika: hiçbiri
 *    derlemeyi bozmuyor, yalnız sitenin sözünü bozuyor.
 *
 * Taramalar YORUMSUZ kaynakta (CLAUDE.md, "TARAMAYI YORUMSUZ KAYNAKTA YAP"):
 * kuralı anlatan yorum, kuralın ihlal edildiği kodla aynı dizeyi taşıyor.
 */

const APP = join(__dirname, '../../app');
const SITE = join(APP, '(site)');

function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

function sayfaDosyalari(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return sayfaDosyalari(yol);
    return ad === 'page.tsx' ? [yol] : [];
  });
}

/** `(site)/ozellikler/[ozellik]/page.tsx` → gerçek adresler. */
function adresler(dosya: string): string[] {
  const rota = '/' + relative(SITE, dosya).replace(/\/?page\.tsx$/, '');
  const temiz = rota === '/' ? '/' : rota.replace(/\/$/, '');
  if (temiz.includes('[ozellik]')) return OZELLIKLER.map((o) => temiz.replace('[ozellik]', o.slug));
  if (temiz.includes('[cozum]')) return COZUMLER.map((c) => temiz.replace('[cozum]', c.slug));
  if (temiz.includes('[')) throw new Error(`Bilinmeyen dinamik bölüm: ${temiz}`);
  return [temiz];
}

const MIDDLEWARE = readFileSync(join(__dirname, '../../middleware.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
  '',
);

function publicPaths(): string[] {
  const m = MIDDLEWARE.match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('PUBLIC_PATHS bulunamadı');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const SIM = join(__dirname, 'simulasyon');

/**
 * İSTEMCİ BİLEŞENLERİ (`'use client'`), adıyla. Sayfanın geri kalanı sunucuda
 * statik üretiliyor; buraya yazılmayan bir dosyada istemci işareti görülürse
 * test düşüyor, yani bir sayfa ya da ortak parça sessizce istemciye taşınamaz.
 */
const ISTEMCI_DOSYALARI = [
  join(SIM, 'sahne.tsx'),
  join(SIM, 'simulasyonlar.tsx'),
  join(__dirname, 'fiyat-paketleri.tsx'),
  join(__dirname, 'cerez-bildirimi.tsx'),
  join(__dirname, 'gorunurlukte.tsx'),
];

/** Sitenin kendi yazdığı kaynaklar (yasal METİNLER hariç: onların dili hukuki ve korunuyor). */
const SITE_KAYNAKLARI = [
  ...sayfaDosyalari(SITE),
  join(SITE, 'layout.tsx'),
  join(APP, '(legal)', 'layout.tsx'),
  join(__dirname, 'site-icerik.ts'),
  join(__dirname, 'site-parcalari.tsx'),
  join(__dirname, 'site-nav.tsx'),
  join(__dirname, 'site-footer.tsx'),
  join(__dirname, 'yasal-duzen.tsx'),
  join(__dirname, 'fiyat-tablosu.tsx'),
  join(SIM, 'index.ts'),
  join(SIM, 'sahneler.ts'),
  join(SIM, 'motor.ts'),
  ...ISTEMCI_DOSYALARI,
];

const TANITIM_CSS = join(__dirname, 'tanitim.css');

/** Ziyaretçinin okuyacağı bütün metin, veri olarak. */
const METIN = JSON.stringify({
  OZELLIKLER,
  COZUMLER,
  ENTEGRASYON_GRUPLARI,
  YAKINDA_ENTEGRASYONLAR,
  SENARYOLAR,
  GUVENLIK,
  FIYAT_SORULARI,
  MODUL_BOLUMLERI,
  BAGLANDIGI_YERLER,
  NASIL_CALISIR,
  GUVENLIK_OZETI,
});

describe('tanıtım sitesi: sayfalar, middleware ve site haritası', () => {
  const dosyalar = sayfaDosyalari(SITE);
  const gercek = dosyalar.flatMap(adresler).sort();

  it('BOŞA DÜŞME BEKÇİSİ: tarama sayfaları buldu', () => {
    expect(dosyalar.length).toBeGreaterThanOrEqual(8);
    expect(gercek).toContain('/');
    expect(gercek).toContain('/ozellikler/reklam-kurma');
    expect(gercek).toContain('/cozumler/ajanslar');
  });

  it('KRİTİK: her sayfa SITE_SAYFALARI içinde ve listede olmayan sayfa yok', () => {
    expect(SITE_SAYFALARI.map((s) => s.yol).sort()).toEqual(gercek);
  });

  it('KRİTİK: kök dışındaki her sayfa middleware PUBLIC_PATHS ile oturumsuz açılıyor', () => {
    const izinli = publicPaths();
    const kapali = gercek
      .filter((y) => y !== '/')
      .filter((y) => !izinli.some((p) => y === p || y.startsWith(`${p}/`)));
    expect(kapali).toEqual([]);
  });

  it('KRİTİK: PUBLIC_PATHS içinde kök (`/`) YOK (middleware.ts yorumu: paneli açardı)', () => {
    expect(publicPaths()).not.toContain('/');
  });

  it('site haritası her sayfayı taşıyor', () => {
    const haritada = sitemap().map((s) => new URL(s.url).pathname);
    const eksik = gercek.filter((y) => !haritada.includes(y));
    expect(eksik).toEqual([]);
  });

  it('KRİTİK: her yasal belge var, oturumsuz açılıyor ve site haritasında', () => {
    const izinli = publicPaths();
    const haritada = sitemap().map((s) => new URL(s.url).pathname);
    expect(YASAL_BELGELER.length).toBeGreaterThanOrEqual(4);
    for (const y of YASAL_BELGELER) {
      expect(existsSync(join(APP, '(legal)', y.href.slice(1), 'page.tsx')), y.href).toBe(true);
      expect(izinli, y.href).toContain(y.href);
      expect(haritada, y.href).toContain(y.href);
    }
    // KVKK aydınlatma metni hukukçu yazmadan menüye girmiyor (site-icerik.ts yorumu).
    expect(JSON.stringify(YASAL_BELGELER)).not.toMatch(/KVKK/);
  });

  it('kökteki eski tek sayfa kalmadı (iki `/` sayfası derlemeyi bozar)', () => {
    expect(existsSync(join(APP, 'page.tsx'))).toBe(false);
  });
});

describe('tanıtım sitesi: aynı ad menüde ve sayfada', () => {
  it('özellik ve çözüm sayfaları üst başlığı ve sekme başlığını listedeki addan alıyor', () => {
    const oz = yorumsuz(readFileSync(join(SITE, 'ozellikler/[ozellik]/page.tsx'), 'utf8'));
    expect(oz).toContain('ust={o.ad}');
    expect(oz).toContain('title: `${o.ad} | Advetics`');
    const coz = yorumsuz(readFileSync(join(SITE, 'cozumler/[cozum]/page.tsx'), 'utf8'));
    expect(coz).toContain('ust={c.ad}');
    expect(coz).toContain('title: `${c.ad} | Advetics`');
  });

  it('üst menüdeki her bağlantının sayfası aynı etiketle açılıyor', () => {
    expect(UST_MENU.length).toBeGreaterThanOrEqual(3);
    for (const m of UST_MENU) {
      const kaynak = yorumsuz(readFileSync(join(SITE, m.href.slice(1), 'page.tsx'), 'utf8'));
      expect(kaynak, m.href).toContain(`title: '${m.etiket} | Advetics'`);
      expect(kaynak, m.href).toContain(`ust="${m.etiket}"`);
    }
  });

  it('ana sayfanın sekiz bölümü özelliklerle aynı sırada ve üst başlık özelliğin ADIYLA başlıyor', () => {
    expect(MODUL_BOLUMLERI.map((m) => m.slug)).toEqual(OZELLIKLER.map((o) => o.slug));
    for (const m of MODUL_BOLUMLERI) {
      const o = OZELLIKLER.find((x) => x.slug === m.slug)!;
      expect(m.ust.startsWith(o.ad), m.slug).toBe(true);
    }
  });

  it('çözümler: üç okur, eski adresler duruyor', () => {
    expect(COZUMLER.map((c) => c.slug)).toEqual(['isletmeler', 'sirketler', 'ajanslar']);
  });

  it('bağlandığı yerler şeridinde yakında olan bir şey yok', () => {
    for (const y of YAKINDA_ENTEGRASYONLAR) expect(BAGLANDIGI_YERLER).not.toContain(y);
  });

  it('slug tekil, çapraz bağlar var olan sayfaya gidiyor', () => {
    const sluglar = OZELLIKLER.map((o) => o.slug);
    expect(new Set(sluglar).size).toBe(sluglar.length);
    for (const c of COZUMLER) for (const s of c.ozellikler) expect(sluglar, c.slug).toContain(s);
    for (const s of SENARYOLAR) expect(sluglar, s.kim).toContain(s.ozellik);
  });
});

describe('tanıtım sitesi: söz ve kimlik', () => {
  it('BOŞA DÜŞME BEKÇİSİ: metin ve kaynak gerçekten okundu', () => {
    expect(METIN.length).toBeGreaterThan(5000);
    expect(SITE_KAYNAKLARI.length).toBeGreaterThanOrEqual(12);
  });

  it('uzun tire yok (kullanıcı kararı: kısa, sade dil)', () => {
    expect(METIN).not.toContain('—');
    for (const d of SITE_KAYNAKLARI) {
      expect(yorumsuz(readFileSync(d, 'utf8')), d).not.toContain('—');
    }
  });

  it('KRİTİK: uydurulabilecek sözler yok (elle yazılmış fiyat, sertifika, müşteri sayısı)', () => {
    /*
     * FİYAT ARTIK VAR (kullanıcı kararı 2026-10-14) ama YALNIZ `fiyat.ts`te;
     * bu dosyalarda elle yazılmış bir dolar ya da TL tutarı, sabit
     * değişince eski rakamı söylemeye devam eden bir sayfa demek. Sahnelerin
     * ₺ tutarları ÖRNEK veri ve sayfada öyle yazıyor; ₺ serbest.
     */
    for (const d of SITE_KAYNAKLARI) {
      const k = yorumsuz(readFileSync(d, 'utf8'));
      // `\b` Türkçe harfi kelime saymıyor: "kayıtlı" içindeki "tl" eşleşiyordu.
      // Sınır Unicode harf sınıfıyla (`\p{L}`) çiziliyor.
      expect(k, d).not.toMatch(
        /\$\s?\d|\d\s*(?:TL|USD|dolar)(?!\p{L})|ISO\s?\d|[Ss]ertifika|\d+\+?\s*(müşteri|ajans|marka)(?!\p{L})/u,
      );
    }
  });

  it('KRİTİK: sık sorulanlardaki ajans rakamları fiyat sabitinden', () => {
    const ajans = FIYAT_SORULARI.find((s) => s.baslik.startsWith('Ajans paketinde'));
    expect(ajans?.metin).toContain(usd(AJANS.kademeBirSent));
    expect(ajans?.metin).toContain(usd(AJANS.kademeIkiSent));
    expect(ajans?.metin).toContain(`${AJANS.dahilWorkspace} workspace dahil`);
    // Kaynakta elle yazılmış dolar yok (test yukarıda); şablon gerçekten sabiti okuyor.
    expect(readFileSync(join(__dirname, 'site-icerik.ts'), 'utf8')).toContain('usd(AJANS.kademeBirSent)');
  });

  it('ana sayfa: sahnelerin örnek olduğu yazıyor', () => {
    expect(readFileSync(join(SITE, 'page.tsx'), 'utf8')).toContain('Ekrandaki rakamlar örnektir.');
    expect(readFileSync(join(__dirname, 'site-parcalari.tsx'), 'utf8')).toContain('Ekrandaki rakamlar örnektir.');
  });

  it('KRİTİK: PDF raporda ajans LOGOSU vaat edilmiyor (kapakta Advetics logosu basılıyor)', () => {
    // CLAUDE.md, "RAPOR KAPAĞINDA AJANSIN DEĞİL ADVETICS LOGOSU BASILIYOR".
    const cumleler = METIN.split(/[.!?]/);
    expect(cumleler.filter((c) => /PDF/.test(c) && /logo/i.test(c))).toEqual([]);
  });

  it('KRİTİK: yakında olan bağlantı bugün varmış gibi listelenmiyor', () => {
    const bugun = ENTEGRASYON_GRUPLARI.flatMap((g) => g.ogeler.map((o) => o.ad));
    for (const y of YAKINDA_ENTEGRASYONLAR) expect(bugun).not.toContain(y);
  });

  it('KRİTİK: renk yalnız kılavuzun dördü (beyaz, siyah, gri, kırmızı)', () => {
    const izinli = new Set(['#ffffff', '#fff', '#000000', '#000', '#302e2d', '#ff2400']);
    for (const d of [...SITE_KAYNAKLARI, TANITIM_CSS]) {
      const renkler = yorumsuz(readFileSync(d, 'utf8')).match(/#[0-9a-f]{3,8}\b/gi) ?? [];
      expect(renkler.filter((r) => !izinli.has(r.toLowerCase())), d).toEqual([]);
    }
    const css = readFileSync(join(APP, 'globals.css'), 'utf8');
    const i = css.indexOf('.tanitim {');
    if (i === -1) throw new Error('.tanitim bloğu bulunamadı');
    const blok = css.slice(i, css.indexOf('}\n}', i));
    const renkler = blok.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    expect(renkler.length).toBeGreaterThan(5);
    expect(renkler.filter((r) => !izinli.has(r.toLowerCase()))).toEqual([]);
  });

  it('KRİTİK: istemci JavaScript yalnız adı yazılı küçük parçalarda (sayfalar ve düzenler statik)', () => {
    const istemci = SITE_KAYNAKLARI.filter((d) => /^['"]use client['"]/m.test(readFileSync(d, 'utf8')));
    expect(istemci.sort()).toEqual([...ISTEMCI_DOSYALARI].sort());
  });

  it('tanıtım stilleri `.tanitim` kapsamında (panele sızmıyor) ve hareket azaltmada kapanıyor', () => {
    const css = readFileSync(TANITIM_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const seciciler = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)]
      .map((m) => m[2]!.trim())
      .filter((x) => x && !/^(from|to|\d+%)$/.test(x));
    expect(seciciler.length, 'tarama boşa düştü').toBeGreaterThan(100);
    const kapsamsiz = seciciler.flatMap((x) => x.split(',').map((y) => y.trim())).filter((y) => !y.startsWith('.tanitim'));
    expect(kapsamsiz).toEqual([]);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tanitim \*,\s*\.tanitim \*::before,\s*\.tanitim \*::after \{\s*transition: none !important;\s*animation: none !important;/);
    expect(css).not.toMatch(/linear-gradient|radial-gradient/);
  });
});
