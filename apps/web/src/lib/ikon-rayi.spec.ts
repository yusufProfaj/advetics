import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { kenarBolumleri, visibleSections } from './nav-sections';
import { KAPALI, olusturOgeleri, panelDurumu, rayOgeleri, tiklamaHedefi, type PanelDurumu } from './ikon-rayi';
import { aktifMi } from '@/components/nav';

/** İkon rayı (2026-10-09): Google Ads kullanım mantığı, Advetics görünüşü. */

const bolumler = (rol: keyof typeof ROLE_PERMISSIONS) =>
  kenarBolumleri(visibleSections([...ROLE_PERMISSIONS[rol]], { ustHesapGorunur: true, platformSahibi: false })).bolumler;

describe('rayOgeleri', () => {
  it('ajans: Genel Bakış doğrudan, çok sayfalı bölümler panel, tek sayfalı bölümler doğrudan', () => {
    const r = rayOgeleri(bolumler('admin'));
    expect(r.map((o) => `${o.etiket}:${o.tur}`)).toEqual([
      'Genel Bakış:baglanti',
      'Planla:panel',
      'Yönet:panel',
      'İyileştir:baglanti',
      'Raporlar:baglanti',
      'Base:baglanti',
    ]);
  });

  it('KRİTİK: Oluştur rayda satır DEĞİL, + düğmesinin listesi', () => {
    expect(rayOgeleri(bolumler('admin')).some((o) => o.etiket === 'Oluştur')).toBe(false);
    expect(olusturOgeleri(bolumler('admin')).map((i) => i.label)).toEqual(['Akıllı Boost', 'AdvCampaign']);
  });

  it('KRİTİK: müşteri hesabı — dört doğrudan bağlantı, panel yok, + Oluştur yok', () => {
    const r = rayOgeleri(bolumler('client_viewer'));
    expect(r.map((o) => `${o.etiket}:${o.tur}`)).toEqual([
      'Genel Bakış:baglanti',
      'Planla:baglanti',
      'Yönet:baglanti',
      'Raporlar:baglanti',
    ]);
    expect(olusturOgeleri(bolumler('client_viewer'))).toEqual([]);
    // Tek sayfalı bölümün bağlantısı o sayfanın kendisi.
    const planla = r.find((o) => o.etiket === 'Planla');
    expect(planla?.tur === 'baglanti' && planla.oge.href).toBe('/strateji');
  });
});

describe('panelDurumu', () => {
  const ac = (d: PanelDurumu, ...olaylar: Parameters<typeof panelDurumu>[1][]) => olaylar.reduce(panelDurumu, d);

  it('KRİTİK: üzerine gelmeyle açılan panele tıklamak onu SABİTLER, kapatmaz', () => {
    const d = ac(KAPALI, { tur: 'uzerine', anahtar: 'Planla' }, { tur: 'tik', anahtar: 'Planla' });
    expect(d).toEqual({ acik: 'Planla', acilis: 'tik' });
  });

  it('KRİTİK: tıklamayla açılan panel fare ayrılınca KAPANMAZ; üzerine gelmeyle açılan kapanır', () => {
    expect(ac(KAPALI, { tur: 'tik', anahtar: 'Yönet' }, { tur: 'ayril' })).toEqual({ acik: 'Yönet', acilis: 'tik' });
    expect(ac(KAPALI, { tur: 'uzerine', anahtar: 'Yönet' }, { tur: 'ayril' })).toEqual(KAPALI);
  });

  it('sabitlenmiş panelde başka bölüme gelmek içeriği değiştirir, sabitlemeyi bozmaz', () => {
    expect(ac(KAPALI, { tur: 'tik', anahtar: 'Planla' }, { tur: 'uzerine', anahtar: 'Yönet' })).toEqual({ acik: 'Yönet', acilis: 'tik' });
  });

  it('aynı bölüme ikinci tık kapatır; kapat her durumda kapatır', () => {
    expect(ac(KAPALI, { tur: 'tik', anahtar: 'Planla' }, { tur: 'tik', anahtar: 'Planla' })).toEqual(KAPALI);
    expect(ac(KAPALI, { tur: 'tik', anahtar: 'Planla' }, { tur: 'kapat' })).toEqual(KAPALI);
  });
});

describe('tiklamaHedefi — bölüme tık ilk sayfaya götürür', () => {
  const planla = [{ href: '/strateji' }, { href: '/butce' }];
  it('KRİTİK: bölüm dışındayken ilk sayfa (Planla → AdvStrategy)', () => {
    expect(tiklamaHedefi(planla, (o) => aktifMi(o, '/dashboard'))).toBe('/strateji');
  });
  it('KRİTİK: zaten bölümün bir sayfasındaysa gidilmez (Aylık Bütçe\'den atılmasın)', () => {
    expect(tiklamaHedefi(planla, (o) => aktifMi(o, '/butce'))).toBeNull();
    expect(tiklamaHedefi(planla, (o) => aktifMi(o, '/strateji'))).toBeNull();
  });
  it('boş bölüm', () => expect(tiklamaHedefi([], () => false)).toBeNull());
});

describe('bileşen kaynağı', () => {
  const KAYNAK = readFileSync(join(__dirname, '..', 'components', 'ikon-rayi.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('tarama gerçekten bileşeni okudu', () => {
    expect(KAYNAK).toContain('export function IkonRayi');
  });

  it('KRİTİK: panel DOM\'dan çıkmıyor; görünürlük geçişle, kapalıyken inert', () => {
    // Bağla/çöz yaklaşımı kapanış animasyonunu keser ya da hızlı aç-kapa'da
    // yarım panel bırakır.
    expect(KAYNAK).not.toMatch(/\{acik\s*&&\s*\(\s*<div[^>]*id="ray-paneli"/);
    expect(KAYNAK).toContain('transition-[opacity,transform,visibility]');
    expect(KAYNAK).toContain("'visible translate-x-0 opacity-100 duration-[340ms] ease-[var(--ease-out)]'");
    expect(KAYNAK).toContain("'invisible -translate-x-4 opacity-0 duration-200 ease-in'");
    // İçerik bölüm başına yeniden bağlanıyor: geçişte animasyon oynuyor.
    expect(KAYNAK).toContain("<div key={gosterilen ?? 'bos'} className=\"ray-icerik");
    expect(KAYNAK).toContain('inert={!acik}');
    expect(KAYNAK).toContain('motion-reduce:transition-none');
  });

  it('KRİTİK: panel rayın KARDEŞİ — backdrop-blur fixed çocuğu hapsetmesin', () => {
    const ray = KAYNAK.indexOf('<aside');
    const rayBitis = KAYNAK.indexOf('</aside>');
    const panel = KAYNAK.indexOf('id="ray-paneli"');
    expect(ray).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(rayBitis);
  });

  it('KRİTİK: kapanış yolları — sayfa değişimi, dışarı tıklama, Esc (odağı geri verir), bağlantı', () => {
    expect(KAYNAK).toMatch(/temizle\(\);\s*gonder\(\{ tur: 'kapat' \}\);\s*\}, \[pathname, temizle\]\)/);
    expect(KAYNAK).toContain("document.addEventListener('mousedown', disari)");
    expect(KAYNAK).toContain('aciciRef.current?.focus()');
    expect(KAYNAK).toContain(".closest('a')) gonder({ tur: 'kapat' })");
  });

  it('KRİTİK: üzerine gelmeyle açma yalnız gerçek farede (dokunuş aç-kapa yapmasın)', () => {
    expect(KAYNAK).toContain("'(hover: hover) and (pointer: fine)'");
    expect(KAYNAK).toMatch(/function uzerine\(anahtar: string\) \{\s*if \(!uzerineAcilir\) return;/);
  });

  it('KRİTİK: raydan başlatılan geçiş paneli KAPATMIYOR (tık sabitler + gider)', () => {
    expect(KAYNAK).toMatch(/if \(raydanGecis\.current\) \{\s*raydanGecis\.current = false;\s*return;\s*\}/);
    expect(KAYNAK).toMatch(/if \(hedef && !kapaniyor\) \{\s*raydanGecis\.current = true;\s*router\.push\(hedef\);/);
  });

  it('zamanlayıcı söküldüğünde temizleniyor', () => {
    expect(KAYNAK).toContain('useEffect(() => temizle, [temizle])');
  });
});
