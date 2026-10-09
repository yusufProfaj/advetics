import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GENEL BAKIŞ DÜZENİ — ONAYLANAN TASLAK (2026-10-09) ═══
 *
 * Kullanıcı HTML taslağını onayladı, taslağa YAKLAŞAN ilk kod sürümünü
 * reddetti ("taslağın aynısını istiyorum"). Sayfa artık taslağın kendi CSS'i
 * (`components/taslak/taslak.module.css`) ve parçalarıyla çiziliyor. Bu
 * dosya düzenin ve veri kurallarının kilidi; görünüşün kendisini canlı
 * tasarım denetimi doğruluyor (CLAUDE.md §3 "Tasarım").
 */
const WEB = join(__dirname, '..', '..', '..');
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const SAYFA = yorumsuz(join(__dirname, 'page.tsx'));
const PARCA = yorumsuz(join(WEB, 'components', 'taslak', 'genel-bakis-parcalari.tsx'));
const KART = yorumsuz(join(WEB, 'components', 'taslak', 'genel-bakis-kartlari.tsx'));
const CSS = readFileSync(join(WEB, 'components', 'taslak', 'taslak.module.css'), 'utf8');
const tablo = (ad: string): string => yorumsuz(join(WEB, 'components', ad));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SAYFA).toContain('Genel Bakış');
    expect(PARCA).toContain('export function PerformansKarti');
    expect(KART).toContain('export async function BekleyenIslerKarti');
    expect(CSS.length).toBeGreaterThan(5000);
  });
});

describe('taslağın düzeni', () => {
  it('KRİTİK: sayfa taslağın stil modülüyle çiziliyor', () => {
    expect(SAYFA).toContain("import s from '@/components/taslak/taslak.module.css';");
    expect(SAYFA).toContain('<div className={s.kok}>');
  });

  it('KRİTİK: iki sütun — solda Performans ve liste, sağda bekleyen işler', () => {
    const izgara = SAYFA.indexOf('<div className={s.izgara}>');
    const perf = SAYFA.indexOf('<PerformansKarti');
    const bekleyen = SAYFA.indexOf('<BekleyenIslerKarti');
    expect(izgara).toBeGreaterThan(-1);
    expect(perf).toBeGreaterThan(izgara);
    expect(bekleyen).toBeGreaterThan(perf);
    expect(CSS).toMatch(/\.izgara \{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/);
  });

  it('KRİTİK: ajans görünümünde sağ sütun boş kalmıyor — mecra dağılımı ve kapsam', () => {
    // Kullanıcı: "ajans görünümündeyken boşlukları doldur".
    expect(SAYFA).toContain('<MecraDagilimi');
    expect(SAYFA).toContain('<KapsamOzeti');
  });

  it('KRİTİK: marka dışı renk yok — mecra halkası platform renklerini KULLANMIYOR', () => {
    const renk = PARCA.slice(PARCA.indexOf('const MECRA_RENGI'), PARCA.indexOf('};', PARCA.indexOf('const MECRA_RENGI')));
    expect(renk.length).toBeGreaterThan(50);
    expect(renk).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(renk).toContain('var(--brand-primary)');
  });

  it('veri tazeliği başlıkta, güncelle düğmesinin içinde', () => {
    const bas = SAYFA.indexOf('<header');
    const son = SAYFA.indexOf('</header>');
    expect(SAYFA.slice(bas, son)).toContain('sonGuncelleme={summary?.lastFetchedAt ?? null}');
  });

  it('tamamlanmamış gün uyarısı YAZILI', () => {
    expect(SAYFA).toContain('Gün bitmedi');
  });
});

describe('uyarılar', () => {
  it('KRİTİK: hepsi TEK şeritte ve hiç yoksa şerit çizilmiyor', () => {
    expect(SAYFA).toContain('<BildirimSeridi bildirimler={bildirimler(summary)} />');
    expect(PARCA).toContain('if (bildirimler.length === 0) return null;');
  });

  it('hata `alert`, uyarı `status`', () => {
    expect(SAYFA).toContain('role="alert"');
    expect(PARCA).toContain('<div className={s.bildirim} role="status">');
  });

  it('KRİTİK: özet hatası sunucunun cümlesiyle', () => {
    expect(SAYFA).toContain('ozetHatasi = hataMetni(e);');
    expect(SAYFA).toContain('{ozetHatasi && <span> {ozetHatasi}</span>}');
  });
});

describe('Performans kartı', () => {
  it('KRİTİK: en çok İKİ seri seçilebiliyor', () => {
    expect(PARCA).toContain('return y.length > 2 ? y.slice(1) : y;');
  });

  it('KRİTİK: erişimin günlük serisi yok — seçilemiyor ve nedenini söylüyor', () => {
    expect(PARCA).toContain("if (k === 'erisim') return;");
    expect(PARCA).toContain('Erişimin günlük serisi yok, grafikte çizilemiyor');
  });

  it('KRİTİK: maliyet metriklerinde düşüş İYİ', () => {
    const i = SAYFA.indexOf("anahtar: 'dbm'");
    expect(SAYFA.slice(i, SAYFA.indexOf('},', i))).toContain('ters: true');
    // Karar ortak fonksiyonda (`lib/degisim.spec.ts` çalıştırarak sınıyor).
    expect(PARCA).toContain('const h = degisimHali(d, ters);');
    const h = SAYFA.indexOf("anahtar: 'harcama'");
    expect(SAYFA.slice(h, SAYFA.indexOf('},', h))).not.toContain('ters');
  });

  it('KRİTİK: çizgi animasyonu hareket azaltılmışsa oynamıyor', () => {
    expect(PARCA).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  /*
   * Aşağıdaki üçü eski `metrics-chart.tsx`ten taşındı (2026-10-09): grafik
   * yenilendi, karşılaştırma kuralları değişmedi.
   */
  it('KRİTİK: önceki dönem GÜN SIRASINA göre hizalanıyor ve taşan gün çizilmiyor', () => {
    // Karşılaştırma penceresinin tarihleri farklı; tarihle çizmek onu grafiğin
    // dışına atardı. Uzun pencerenin fazla günü olmayan bir tarihe düşerdi.
    expect(PARCA).toContain('onceki.slice(0, n).map((p) => gunlukDeger(p, k))');
  });

  it('KRİTİK: ölçek iki dönemi BİRDEN kapsıyor', () => {
    // Ayrı ölçek, yarıya düşen bir harcamayı "aynı kalmış" gibi gösterirdi.
    expect(PARCA).toContain('const sayilar = [...v, ...vo].filter(');
  });

  it('KRİTİK: boş grafik, önceki dönemde veri VARSA bunu söylüyor', () => {
    // "Hiç koşmamış hesap" ile "bu dönemde tamamen durmuş hesap" aynı boş
    // kutu olmamalı; ikincisi acil.
    const i = PARCA.indexOf('noktalar.length === 0 ? (');
    expect(i, 'boş grafik dalı bulunamadı').toBeGreaterThan(-1);
    const dilim = PARCA.slice(i, PARCA.indexOf('</p>', i));
    expect(dilim).toContain('onceki !== null && onceki.length > 0');
    expect(dilim).toContain('Kampanyalar durmuş olabilir');
  });

  it('tek günlük aralıkta grafik yerine açıklama', () => {
    expect(SAYFA).toContain('tekGun={range.days <= 1}');
    expect(PARCA).toContain('Tek günlük aralıkta grafik çizilmiyor');
  });
});

describe('iniş Reklam Yöneticisi’nde', () => {
  it('KRİTİK: eski iniş adresi oraya YÖNLENİYOR — süzgeç sessizce düşmüyor', () => {
    for (const k of ["'hesap'", "'kampanya'", "'reklamSeti'", "'seviye'"]) {
      expect(SAYFA.slice(SAYFA.indexOf('const INIS_PARAMETRELERI'), SAYFA.indexOf('as const'))).toContain(k);
    }
    expect(SAYFA).toContain('redirect(`${REKLAM_YONETICISI}?${tasi}`);');
  });

  it('KRİTİK: liste KESİLİYOR ama söyleniyor', () => {
    expect(SAYFA).toContain('.slice(0, OZET_SATIR)');
    expect(PARCA).toContain('{satirlar.length < toplam ? `${satirlar.length} / ${toplam}` : toplam} {tumuEtiket}');
  });

  it('KRİTİK: pay GELEN bütün satırların toplamından', () => {
    const p = SAYFA.slice(SAYFA.indexOf('function paylar'), SAYFA.indexOf('function sirketSatirlari'));
    expect(p).toContain('const toplam = rows.reduce(');
    expect(p).not.toContain('slice(');
  });

  it('KRİTİK: izlenmeyen hesap bağlantı DEĞİL — boş listeye götürürdü', () => {
    const h = SAYFA.slice(SAYFA.indexOf('function hesapSatirlari'), SAYFA.indexOf('function izlenmeyenNotu'));
    expect(h).toContain('eylem: a.syncEnabled');
    expect(h).toContain(': null,');
  });

  it('KRİTİK: kampanya kartının dört hâli ayrı (yükleniyor, hata, boş, dolu)', () => {
    const k = PARCA.slice(PARCA.indexOf('export function EnCokHarcayanlarKarti'));
    expect(k).toContain('hata[duzey] ? (');
    expect(k).toContain('!satirlar ? (');
    expect(k).toContain('gosterilen.length === 0 ? (');
    expect(k).toContain("e instanceof ApiRequestError ? e.message : 'Liste alınamadı.'");
  });
});

describe('tablolarda kaydırma', () => {
  it('KRİTİK: yatay kayan tablolar kendi kabında — sayfa gövdesi kaymıyor', () => {
    expect(CSS).toMatch(/\.tabloSar \{\s*overflow-x: auto;/);
    expect(PARCA).toContain('<div className={s.tabloSar}>');
    expect(tablo('taslak/reklam-yoneticisi-tablosu.tsx')).toContain('<div className={s.tabloSar}>');
  });
});
