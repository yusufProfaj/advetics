import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Reklam Yöneticisi'nin tek tablosu — onaylanan taslak (2026-10-09). */
const yorumsuz = (yol: string) =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const TABLO = yorumsuz(join(__dirname, 'reklam-yoneticisi-tablosu.tsx'));
const SAYFA = yorumsuz(join(__dirname, '..', '..', 'app', '(dashboard)', 'ads-explorer', 'page.tsx'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(TABLO).toContain('export function ReklamYoneticisiTablosu');
    expect(SAYFA).toContain('<ReklamYoneticisiTablosu');
  });
});

describe('önizlemeler', () => {
  it('KRİTİK: anahtar yalnız reklam düzeyinde çalışıyor, başka düzeyde nedenini söylüyor', () => {
    expect(TABLO).toContain('if (!reklamda) return;');
    expect(TABLO).toContain("'Reklam düzeyinde açılır'");
  });

  it('KRİTİK: karar ortak fonksiyondan (tek önizleme / hepsi)', () => {
    expect(TABLO).toContain('onizlemeAcikMi({ hepsiAcik, tekAcik, kapatilan }, id)');
    expect(TABLO).toContain('kurVeAc([id], () => setTekAcik(id));');
  });

  it("KRİTİK: animasyon hatasız — açılmış önizleme DOM'da, kapalıyken inert", () => {
    expect(TABLO).toContain('(acilmis.has(r.id) || acik) && (');
    expect(TABLO).toContain('<div inert={!acik}>');
    expect(TABLO).toContain('requestAnimationFrame(() => requestAnimationFrame(ac));');
  });
});

describe('düzeyler ve satırlar', () => {
  it('KRİTİK: gidilemeyen düzey soluk ve NEDENİNİ söylüyor', () => {
    expect(SAYFA).toContain("neden: 'Bu düzey için bir workspace seç'");
    // 2026-10-14: düzeyler sayfa içi yan menüde; nedeni `kapaliNedeni`, soluk/tıklanmaz hâli ortak bileşende.
    expect(TABLO).toContain("kapaliNedeni: t.hedef.tur === 'kapali' ? t.hedef.neden : undefined,");
  });

  it('KRİTİK: "Şirketler" sekmesi ajans kapsamına ÖZEL DEĞERLE geçiyor', () => {
    // `null` sunucuda hata vermeden hiçbir şey değiştirmiyordu: sekme ölüydü.
    expect(TABLO).toContain("void kapsamaGec('org', TUM_SIRKETLER, 'Tüm şirketler')");
    expect(TABLO).not.toContain("kapsamaGec('org', null");
  });

  it('KRİTİK: izlenmeyen hesap bağlantı DEĞİL — boş listeye götürürdü', () => {
    const h = SAYFA.slice(SAYFA.indexOf('function hesapSatiri'), SAYFA.indexOf('const DURUM_ADI'));
    expect(h).toContain('eylem: a.syncEnabled');
    expect(h).toContain(': null,');
  });

  it('KRİTİK: sessiz kesme yok — sayaç ve sunucu sınırı yazılı', () => {
    expect(TABLO).toContain('`1 - ${satirlar.length} / ${satirlar.length} ${BIRIM[duzey]}`');
    expect(SAYFA).toContain('`harcamaya göre ilk ${KIRILIM_LIMITI} satır`');
  });

  it('KRİTİK: değeri olmayan satır sıralamada SONDA — "en ucuz" sanılmıyor', () => {
    expect(TABLO).toContain('if (x === null) return 1;');
    expect(TABLO).toContain('if (y === null) return -1;');
  });

  it('KRİTİK: tıklama oranı yüzde ölçeğinde (formatPercent yüzde bekliyor)', () => {
    expect(TABLO).toContain('formatPercent((r.clicks / r.impressions) * 100)');
  });

  it('karışık para biriminde toplam uydurulmuyor', () => {
    expect(TABLO).toContain("(b ? formatMoney(m, b) : 'karışık')");
  });
});

/*
 * ═══ SEKMELER TABLONUN ÜSTÜNDE, OLUŞTUR SEKMEYE GÖRE (kullanıcı, 2026-10-16) ═══
 * "Sekmeler solda değil, tabloların üzerinde olsun; solda yer kazanırız."
 * "Oluştur bulunduğu sekmeye göre değişsin: Kampanyalar › Yeni kampanya,
 * Reklamlar › Reklam, Hedef kitleler › Hedef kitle."
 */
describe('sekmeler ve Oluştur', () => {
  it('KRİTİK: düzeyler yan menüde DEĞİL, tablonun hemen üstünde yatay sekme', () => {
    expect(TABLO).not.toContain('SayfaIcMenu');
    expect(TABLO).not.toContain('SayfaIcDuzen');
    const sekme = TABLO.indexOf('<Sekmeler etiket="Reklam düzeyi"');
    const tablo = TABLO.indexOf('{yerine ?? (');
    expect(sekme).toBeGreaterThan(-1);
    // Sekme, tablo kartının (ya da onun yerine çizilen hâlin) HEMEN önünde.
    expect(tablo).toBeGreaterThan(sekme);
    expect(TABLO.slice(sekme, tablo)).not.toContain('<MetrikKutulari');
  });

  it('KRİTİK: Hedef kitleler sekmesi var; workspace seçilmeden kapalı ve nedenini söylüyor', () => {
    expect(SAYFA).toContain("anahtar: 'kitle', ad: 'Hedef kitleler'");
    expect(SAYFA).toContain("'Bu görünüm için bir workspace seç'");
    expect(SAYFA).toContain("{ seviye: 'kitle', reklamSeti: undefined }");
    expect(SAYFA).toContain('`/metrics/kitleler?${base}`');
  });

  it('KRİTİK: sayfa başlığındaki düğme sekmenin eşlemesinden', () => {
    expect(SAYFA).toContain('const olustur = olusturDugmesi(seciliSekme, session.activeClientId,');
    expect(SAYFA).toContain('＋ {olustur.etiket}');
    expect(SAYFA).not.toContain('＋ Reklam oluştur');
  });
});
