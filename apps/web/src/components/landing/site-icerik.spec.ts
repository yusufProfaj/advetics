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

  /*
   * ═══ HER İÇ BAĞLANTININ BİR SAYFASI VAR ═══
   *
   * Bağlantılar dört yerde elle ya da listeden yazılıyor (menü, alt bilgi,
   * yasal menü, sayfa içi düğmeler). Var olmayan bir adrese giden bağlantı
   * derlemede hiçbir şey demiyor: ziyaretçi 404 görüyor; oturumsuz
   * açılmayan bir adrese giden bağlantı ise ziyaretçiyi giriş ekranına
   * atıyor. İkisini de yalnız müşteri görür. Adresler `app/` altındaki
   * GERÇEK `page.tsx` dosyalarından çözülüyor (yol grupları atlanıyor,
   * `[x]` bir parça).
   */
  it('KRİTİK: tanıtım ve yasal sayfalardaki her iç bağlantı var olan, oturumsuz açılan bir sayfaya gidiyor', () => {
    const rotalar = (function tara(dizin: string): RegExp[] {
      return readdirSync(dizin).flatMap((ad) => {
        const yol = join(dizin, ad);
        if (statSync(yol).isDirectory()) return tara(yol);
        if (ad !== 'page.tsx') return [];
        const parcalar = relative(APP, dizin)
          .split('/')
          .filter((p) => p && !/^\(.*\)$/.test(p))
          .map((p) => (/^\[.*\]$/.test(p) ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return [new RegExp(`^/${parcalar.join('/')}$`)];
      });
    })(APP);
    expect(rotalar.length, 'rota taraması boşa düştü').toBeGreaterThan(20);

    const kaynaklar = [...SITE_KAYNAKLARI, ...sayfaDosyalari(join(APP, '(legal)'))];
    const baglantilar = new Set<string>();
    for (const d of kaynaklar) {
      const k = yorumsuz(readFileSync(d, 'utf8'));
      for (const m of k.matchAll(/(?:href=|href:\s*)\{?\s*['"`](\/[^'"`#?$]*)/g)) baglantilar.add(m[1]!);
    }
    // Listeden üretilenler: menü, alt bilgi, yasal menü, site haritası, özellik ve çözüm adresleri.
    for (const y of [...UST_MENU, ...YASAL_BELGELER]) baglantilar.add(y.href);
    for (const s of SITE_SAYFALARI) baglantilar.add(s.yol);
    // Tarama gerçekten JSX'teki elle yazılmış bağlantıları buldu mu (yalnız listeler değil).
    expect([...baglantilar]).toContain('/login');
    expect([...baglantilar]).toContain('/cerez-politikasi');
    expect(baglantilar.size).toBeGreaterThan(20);

    const izinli = publicPaths();
    const sayfasiz = [...baglantilar].filter((b) => !rotalar.some((r) => r.test(b.replace(/\/$/, '') || '/')));
    expect(sayfasiz, 'sayfası olmayan bağlantı').toEqual([]);
    const kapali = [...baglantilar].filter(
      (b) => b !== '/' && !izinli.some((p) => b === p || b.startsWith(`${p}/`)),
    );
    expect(kapali, 'oturumsuz açılmayan bağlantı').toEqual([]);
  });

  it('ana sayfanın çapa bağlantıları sayfadaki bir bölüme gidiyor', () => {
    const k = yorumsuz(readFileSync(join(SITE, 'page.tsx'), 'utf8'));
    const capalar = [...k.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
    expect(capalar.length, 'tarama boşa düştü').toBeGreaterThan(0);
    const idler = [...k.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    // Modül bölümlerinin id'si slug (`id={m.slug}`).
    if (k.includes('id={m.slug}')) idler.push(...MODUL_BOLUMLERI.map((m) => m.slug));
    for (const c of capalar) expect(idler, `#${c}`).toContain(c);
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

  it('hero başlığı iki sütunlu düzende iki satıra sığacak ölçüde (tanitim.css yorumu, 1440 px ölçümü)', () => {
    const css = readFileSync(TANITIM_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = css.indexOf('@media (min-width: 901px)');
    if (i === -1) throw new Error('hero medya bloğu bulunamadı');
    const blok = css.slice(i, css.indexOf('\n}', i));
    expect(blok).toMatch(/\.tanitim \.hero \.modul \{\s*grid-template-columns: 6fr 5fr;/);
    const enCok = blok.match(/\.tanitim \.hero \.t-h1 \{\s*font-size: clamp\(\d+px, [\d.]+vw, (\d+)px\);/)?.[1];
    // 6fr sütun ~572 px; ilk cümle 48 px'te ~552 px. Büyütmek cümleyi yine ortasından böler.
    expect(Number(enCok)).toBeLessThanOrEqual(48);
  });

  /*
   * `.kap` başka bir sınıfla AYNI öğede duruyor (`kap yasal`, `kap
   * kapanis-kap`, `kap modul`…). Bu ikililerden birine sonradan yazılan
   * `padding:` kısaltması diğerinin boşluğunu sessizce sıfırlıyordu:
   * telefonda yasal sayfanın üst/alt boşluğu (`.kap` 600 px kuralı) ve
   * 601-1160 px'te kapanış bandının yan boşluğu (`.kapanis-kap`) gitmişti.
   * Kısaltma yalnız `.kap`ın kendi temel kuralında serbest.
   */
  it('KRİTİK: `.kap` ile aynı öğedeki sınıflarda padding kısaltması yok', () => {
    const css = readFileSync(TANITIM_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const ikililer = new Set<string>();
    for (const d of [...SITE_KAYNAKLARI, ...sayfaDosyalari(join(APP, '(legal)'))]) {
      for (const m of readFileSync(d, 'utf8').matchAll(/className=["'`{]*["'`]?([^"'`}]*\bkap\b[^"'`}]*)/g)) {
        for (const s of m[1]!.split(/\s+/)) if (s && s !== 'kap' && /^[a-z-]+$/.test(s)) ikililer.add(s);
      }
    }
    expect([...ikililer], 'tarama boşa düştü').toEqual(expect.arrayContaining(['yasal', 'kapanis-kap', 'modul']));
    const kurallar = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      seciciler: m[1]!.split(',').map((s) => s.trim()),
      govde: m[2]!,
    }));
    const hedef = (s: string) => s === '.tanitim .kap' || [...ikililer].some((c) => s === `.tanitim .${c}`);
    const kisaltmali = kurallar.filter((k) => k.seciciler.some(hedef) && /(^|;|\s)padding:/.test(k.govde));
    // Yalnız temel `.kap` kuralı (dosyadaki ilk `.tanitim .kap`).
    expect(kisaltmali.map((k) => k.seciciler.join(', '))).toEqual(['.tanitim .kap']);
    expect(kisaltmali[0]!.govde).toMatch(/padding: 0 24px/);
  });

  /*
   * TANITIMIN KARANLIK TONU TEK KAYNAKTAN: İŞLETİM SİSTEMİ. globals.css'teki
   * `.tanitim` belirteçleri (`--surface`, `--text`) yalnız
   * `prefers-color-scheme`e bakıyor, panelin `data-theme` seçimine değil.
   * tanitim.css'in karanlık blokları da AYNI koşulu kullanmalı. Ajan 4 bu
   * blokları panelin deseniyle (`:root:not([data-theme='light'])`) korumayı
   * denedi ve ölçünce tersini gördü: panelde "koyu" seçip açık sistemde
   * gelen ziyaretçide zemin ve yazı açık temada kalırken kart #302e2d oluyor,
   * koyu yazı koyu kartta okunmuyordu. İki dosyadan biri tema seçimine
   * bağlanacaksa ikisi birlikte bağlanmalı.
   */
  it('KRİTİK: tanitim.css ve globals.css karanlık tonda aynı koşula bakıyor', () => {
    const css = readFileSync(TANITIM_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const globals = readFileSync(join(APP, 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = globals.indexOf('@media (prefers-color-scheme: dark) {\n  .tanitim {');
    if (i === -1) throw new Error('globals.css karanlık .tanitim bloğu bulunamadı (koşul değiştiyse bu test de değişmeli)');
    expect(globals).not.toMatch(/data-theme[^{]*\.tanitim/);
    expect((css.match(/prefers-color-scheme: dark/g) ?? []).length, 'tarama boşa düştü').toBeGreaterThanOrEqual(4);
    expect(css).not.toMatch(/data-theme/);
  });
});
