import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ISTISNALAR, KALICI_ISTISNALAR } from './tasarim-sistemi.istisnalar';
import { KILAVUZ, SRC, TARANAN, UI, ihlalSay, mevcutSayilar, yorumsuz } from './tasarim-sistemi.tarama';

/**
 * ═══ BİRLEŞİK TASARIM SİSTEMİ BEKÇİSİ (2026-10-14) ═══
 *
 * Referans `docs/marka/tasarim-sistemi.html`, bileşenler `components/ui/`,
 * kurallar `docs/marka/BILESENLER.md`. Panelde iki tasarım sistemi vardı
 * (Tailwind + `globals.css` katmanı ve dört CSS modülünün kendi token
 * kopyaları) ve 22 farklı düğme sınıfı, 10'dan fazla elle yazılmış modal
 * birikmişti. Bu dosya iki şeyi kilitliyor:
 *
 * 1. TEMEL: token'lar tek yerde ve kılavuzda; birincil düğmenin degradesi ve
 *    parıltısı KALKTI (kullanıcı kararı); modüller kendi `--t-*` kopyasını
 *    tanımlamıyor.
 * 2. YALNIZ KÜÇÜLEN İSTİSNA LİSTESİ: elle düğme, elle modal, elle `h1`,
 *    degrade ve kılavuz dışı renk sayıları DOSYA DOSYA
 *    `tasarim-sistemi.istisnalar.ts`te. Bugünkü sayılarla başladı; sayfa
 *    ajanları dosyaları bileşenlere geçirdikçe liste boşalır. İKİ YÖNLÜ:
 *    sayı ARTARSA test düşer (yeni ihlal), AZALIP listede eski sayı kalırsa
 *    da düşer (listeyi küçült). Aksi hâlde düzeltilmiş bir dosyaya ihlal
 *    sessizce geri dönebilirdi.
 *
 * TARAMA YORUMSUZ KAYNAKTA (CLAUDE.md "TARAMAYI YORUMSUZ KAYNAKTA YAP"):
 * kuralı anlatan yorum (ör. "eski #dc2626 kalktı") sayılmamalı.
 */
describe('tasarım sistemi: istisna listesi yalnız küçülür', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama dosya okudu ve sayaç gerçekten sayıyor', () => {
    expect(TARANAN.length).toBeGreaterThan(150);
    // Sayaç dedektörleri GERÇEKTEN tutuyor (desen bozulursa liste sessizce sıfırlanırdı).
    const ornek = ihlalSay(
      `<button className="rounded-lg bg-brand px-3 text-white">x</button><div className="fixed inset-0 bg-black/40"/><h1>a</h1><i style={{color:'#dc2626'}} className="bg-gradient-to-r"/>`,
      false,
    );
    expect(ornek).toEqual({ renk: 1, degrade: 1, dugme: 1, modal: 1, h1: 1 });
    // Kılavuz rengi, maske ve yorum SAYILMIYOR.
    expect(
      ihlalSay(`/* #dc2626 */ <i className="[mask-image:linear-gradient(black,transparent)]" style={{color:'#ff2400'}}/>`, false),
    ).toEqual({ renk: 0, degrade: 0, dugme: 0, modal: 0, h1: 0 });
  });

  it('kalıcı istisna geçici listede İKİNCİ KEZ yok (bir dosya tek yerde sayılır)', () => {
    for (const d of Object.keys(KALICI_ISTISNALAR)) expect(ISTISNALAR[d], d).toBeUndefined();
  });

  it('KRİTİK: hiçbir dosyada listedekinden FAZLA ihlal yok, düzelen dosya listede kalmıyor', () => {
    const mevcut = mevcutSayilar();
    const hatalar: string[] = [];
    const dosyaAdlari = new Set([...Object.keys(mevcut), ...Object.keys(ISTISNALAR), ...Object.keys(KALICI_ISTISNALAR)]);
    for (const d of dosyaAdlari) {
      for (const tur of ['renk', 'degrade', 'dugme', 'modal', 'h1'] as const) {
        const simdi = mevcut[d]?.[tur] ?? 0;
        // Kalıcı istisna (gerekçeli) da AYNI kesinlikle sayılıyor: büyüyemez, küçülürse listeden düşmeli.
        const izin = ISTISNALAR[d]?.[tur] ?? KALICI_ISTISNALAR[d]?.[tur] ?? 0;
        if (simdi > izin) {
          hatalar.push(`YENİ İHLAL ${d} · ${tur}: ${simdi} (izin ${izin}) — components/ui bileşenini kullan (docs/marka/BILESENLER.md)`);
        } else if (simdi < izin) {
          hatalar.push(`LİSTEYİ KÜÇÜLT ${d} · ${tur}: ${izin} → ${simdi} (tasarim-sistemi.istisnalar.ts)`);
        }
      }
    }
    expect(hatalar).toEqual([]);
  });
});

describe('tasarım sistemi: temel', () => {
  const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8');
  const CSS_YORUMSUZ = yorumsuz(CSS);

  function blok(kaynak: string, bas: string): string {
    const i = kaynak.indexOf(bas);
    if (i === -1) throw new Error(`${bas} bulunamadı — tarama boşa düştü`);
    let d = 0;
    for (let j = kaynak.indexOf('{', i); j < kaynak.length; j++) {
      if (kaynak[j] === '{') d++;
      if (kaynak[j] === '}' && --d === 0) return kaynak.slice(i, j + 1);
    }
    throw new Error(`${bas} kapanmadı`);
  }

  it('KRİTİK: birincil düğme DÜZ — degrade ve parıltı yok (kullanıcı kararı 2026-10-14)', () => {
    const kural = blok(CSS_YORUMSUZ, '.panel :is(button, a).bg-brand {');
    expect(kural).toContain('background-image: none');
    expect(kural).toContain('box-shadow: none');
    expect(kural).not.toMatch(/gradient/);
    const hover = blok(CSS_YORUMSUZ, '.panel :is(button, a).bg-brand:not(:disabled):hover {');
    expect(hover).not.toMatch(/box-shadow|transform/);
    // Bileşenin kendisi de degrade sınıfı taşımıyor.
    const dugme = yorumsuz(readFileSync(join(UI, 'dugme.tsx'), 'utf8'));
    expect(dugme).toContain("birincil: 'border border-brand bg-brand text-white");
    expect(dugme).not.toMatch(/gradient|shadow-\[/);
    expect(dugme).toContain('rounded-full');
  });

  it('KRİTİK: panel zemini ve boş durum kalıbı degrade taşımıyor', () => {
    expect(blok(CSS_YORUMSUZ, '.panel {')).not.toMatch(/gradient/);
    expect(blok(CSS_YORUMSUZ, '.panel :is(div, section, li, p).border-dashed.border-line.text-center {')).not.toMatch(
      /gradient/,
    );
  });

  it('KRİTİK: CSS modülleri kendi `--t-*` kopyasını tanımlamıyor ve degrade taşımıyor', () => {
    const moduller = [
      'components/taslak/taslak.module.css',
      'components/taslak/iyilestir.module.css',
      'components/taslak/kreatif-zeka.module.css',
      'components/rehber/rehber.module.css',
    ];
    for (const m of moduller) {
      const kod = yorumsuz(readFileSync(join(SRC, m), 'utf8'));
      expect(kod, `${m} --t-* tanımlıyor`).not.toMatch(/--t-[\w-]+\s*:/);
      expect(kod, `${m} degrade taşıyor`).not.toMatch(/linear-gradient|radial-gradient/);
    }
    // Adlar globals'ta TEK KEZ bağlı.
    for (const ad of ['--t-brand:', '--t-line:', '--t-ink:', '--t-shadow-pop:', '--t-line2:']) {
      expect(CSS.split(ad).length - 1, ad).toBe(1);
    }
  });

  it('KRİTİK: token bloğunda yalnız kılavuz renkleri (+ belgelenmiş istisnalar)', () => {
    /*
     * İzinli istisnalar adıyla: yeşil durum noktası (açık/koyu), karanlık
     * yüzey (#0d0d0d, referans), Google arama önizlemesinin taklit renkleri.
     */
    const izinli = new Set([...KILAVUZ, '#1e8e3e', '#34a853', '#0d0d0d', '#1a0dab', '#4d5156', '#8ab4f8', '#bdc1c6']);
    const kok = CSS_YORUMSUZ.slice(0, CSS_YORUMSUZ.indexOf('@theme inline'));
    const disari = [...kok.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase()).filter((h) => !izinli.has(h));
    expect(disari).toEqual([]);
    // Eski kılavuz dışı değerler geri gelmedi.
    for (const eski of ['#dc2626', '#d97706', '#0284c7', '#16a34a', '#13151c', '#d21d00']) {
      expect(CSS_YORUMSUZ, eski).not.toContain(eski);
    }
    // Uyarı ve tehlike kırmızı, bilgi gri.
    expect(blok(CSS_YORUMSUZ, ':root {')).toMatch(/--warn: #ff2400;[\s\S]*--danger: #ff2400;[\s\S]*--info: #302e2d;/);
  });

  it('KRİTİK: kartlar gölgesiz, gölge yalnız açılır katmanda', () => {
    const kok = blok(CSS_YORUMSUZ, ':root {');
    expect(kok).toContain('--shadow-card: none;');
    expect(kok).toContain('--shadow-xs: none;');
    expect(kok).toContain('--shadow-hover: none;');
    expect(kok).toMatch(/--shadow-pop: 0 /);
    expect(kok).toContain('--radius: 1rem;');
  });

  it('karanlık tema iki yoldan da aynı değerleri basıyor (sistem tercihi ve `data-theme`)', () => {
    const sistem = blok(CSS_YORUMSUZ, ":root:not([data-theme='light']) {");
    const elle = blok(CSS_YORUMSUZ, ":root[data-theme='dark'] {");
    const govde = (b: string) =>
      b
        .slice(b.indexOf('{') + 1, b.lastIndexOf('}'))
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean)
        .sort();
    expect(govde(elle)).toEqual(govde(sistem));
  });

  it('hareket azaltılmışsa paneldeki geçişler de duruyor', () => {
    expect(CSS_YORUMSUZ).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.panel \*,\s*\.panel \*::before,\s*\.panel \*::after \{\s*transition-duration: 0\.01ms !important;/,
    );
  });
});

describe('tasarım sistemi: ortak bileşenler', () => {
  const oku = (ad: string) => yorumsuz(readFileSync(join(UI, ad), 'utf8'));

  it('pencere ve yan panel: portal, DOM\'da kalır, Esc, odak tuzağı, hareket azaltma', () => {
    const k = oku('pencere.tsx');
    expect(k).toContain('createPortal(');
    // Kapalıyken koşullu render DEĞİL: görünmez + etkisiz.
    expect(k).toContain('inert={!acik}');
    expect(k).toMatch(/acik \? 'visible opacity-100' : 'invisible opacity-0'/);
    expect(k).toContain("e.key === 'Escape'");
    expect(k).toContain("e.key !== 'Tab'");
    expect(k).toContain('motion-reduce:transition-none');
    // Portal panelin içine: marka rengi değişkeni orada.
    expect(k).toContain("document.querySelector<HTMLElement>('.panel')");
  });

  it('düğme beş ton, iki boy (40 / 32)', () => {
    const k = oku('dugme.tsx');
    for (const t of ['birincil:', 'ikincil:', 'koyu:', 'hayalet:', 'tehlike:']) expect(k).toContain(t);
    expect(k).toContain("kucuk: 'h-8");
    expect(k).toContain("orta: 'h-10");
  });

  it('tablo başlığı büyük harf değil, sayı sütunu sağa yaslı ve hizalı', () => {
    const k = oku('tablo.tsx');
    expect(k).toContain('normal-case');
    expect(k).not.toMatch(/(?:^|\s)uppercase(?:\s|$)/m);
    expect(k).toContain("s.sayi ? 'text-right tabular-nums");
  });

  it('boş durum NEDENİ zorunlu, hata platform mesajını taşıyor', () => {
    const k = oku('hal.tsx');
    expect(k).toMatch(/neden: ReactNode;/);
    expect(k).toMatch(/mesaj: ReactNode;/);
  });
});
