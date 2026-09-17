import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ YAYINDAKİ KAMPANYALAR EKRANI ═══
 *
 * Kullanıcının bildirdiği eksik: "sadece adveticsten yayınladığım reklamlar
 * gözüküyor … toplu oluşturda sadece boostlar var ama aktif olan reklam
 * kampanyalarını seçemiyorum".
 *
 * Panelde bileşen render eden bir test altyapısı yok (vitest.config.ts bunu
 * bilerek reddediyor), o yüzden kararlar kaynak taramasıyla kilitleniyor.
 */
const yorumsuz = (m: string): string =>
  m
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const KOMPONENT = yorumsuz(readFileSync(join(__dirname, 'canli-kampanyalar.tsx'), 'utf8'));
const HUB = yorumsuz(
  readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam-olustur', 'page.tsx'), 'utf8'),
);
const TOPLU = yorumsuz(
  readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'toplu-olustur', 'page.tsx'), 'utf8'),
);

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(KOMPONENT).toContain('export function CanliKampanyalar');
    expect(HUB).toContain('<CanliKampanyalar');
    expect(TOPLU).toContain('<CanliKampanyalar');
  });
});

describe('liste', () => {
  it('KRİTİK: yayındakiler taslaklardan AYRI bölümde', () => {
    /*
     * İkisinin yapabilecekleri farklı: taslak YAYINLANABİLİR, canlı olan
     * DURDURULABİLİR. Tek listede birleştirmek, satır başına hangi düğmenin
     * çıkacağını kullanıcıya tahmin ettirirdi.
     */
    // Başlık bileşenin VARSAYILANI; hub onu ezmiyor. Düz dizeyi hub'da
    // aramak, tek kaynaktan gelen doğru çözümü yanlış gösterirdi.
    expect(KOMPONENT).toContain("baslik = 'Yayında olanlar'");
    expect(HUB.indexOf('<CanliKampanyalar')).toBeLessThan(HUB.indexOf('<DraftGroupList'));
  });

  it('KRİTİK: durum İKİ parça — kendi durumu ve platformunki', () => {
    // Kampanya `active` görünürken reklam seti duraklatılmış olabiliyor;
    // tek rozete indirgemek para harcamayan bir kampanyayı "yayında"
    // göstermek olurdu.
    expect(KOMPONENT).toContain('effectiveStatus');
    expect(KOMPONENT).toContain('platformda:');
  });

  it('KRİTİK: veri yoksa SIFIR yazmıyor', () => {
    // "Hiç harcamadı" ile "veri gelmedi" aynı şey değil.
    expect(KOMPONENT).toContain('Son 7 günde veri yok');
    expect(KOMPONENT).toContain('m === null');
  });

  it('SESSİZ KESME YOK: toplam yazılı', () => {
    expect(KOMPONENT).toContain('toplam > rows.length');
  });
});

describe('aksiyonlar', () => {
  it('KRİTİK: Google satırında düğmeler kapalı VE sebebi yazılı', () => {
    /*
     * `google.provider.applyAction` canlı mutasyonu açıkça reddediyor.
     * Düğmeyi açık bırakmak, kullanıcıya çalıştığını sandığı bir şeyi
     * denetmek olurdu; sebepsiz kapatmak ise olmayan bir arızayı aratırdı.
     */
    expect(KOMPONENT).toContain("const yazilabilir = kampanya.platform === 'meta'");
    expect(KOMPONENT).toContain('disabled={!yazilabilir || busy}');
    expect(KOMPONENT).toContain('Google Ads’ten yapman gerekiyor');
  });

  it('KRİTİK: bütçe değişikliği ÖĞRENME EVRESİNİ söylüyor', () => {
    // Söylemezsek kullanıcı "iyileştirdim" sanıp performansı düşürür.
    expect(KOMPONENT).toContain('öğrenme evresine');
  });

  it('KRİTİK: bütçe formu eski ve yeni değeri YAN YANA yazıyor', () => {
    const i = KOMPONENT.indexOf('function ButceFormu');
    expect(i, 'bütçe formu yok — tarama boşa düştü').toBeGreaterThan(-1);
    expect(KOMPONENT.slice(i)).toContain("{' → '}");
  });
});

describe('çoğaltma', () => {
  it('KRİTİK: kopyayı PLATFORM çıkarıyor — tip `copy`', () => {
    expect(KOMPONENT).toContain("type: 'copy'");
    expect(KOMPONENT).toContain('deepCopy: derin');
  });

  it('KRİTİK: kopyanın DURAKLATILMIŞ açılacağı ekranda yazılı', () => {
    /*
     * Sessizce yayına giren bir kopya, iki katı harcama demek. Kullanıcı
     * onaylamadan önce okumalı.
     */
    const i = KOMPONENT.indexOf('function KopyaFormu');
    expect(i, 'kopya formu yok — tarama boşa düştü').toBeGreaterThan(-1);
    expect(KOMPONENT.slice(i)).toContain('duraklatılmış');
  });

  it('KRİTİK: kopya listede HENÜZ YOK bilgisi veriliyor', () => {
    /*
     * Kampanya platformda var; bizim tablomuza onu yapı taraması yazıyor.
     * Söylemezsek kullanıcı kopyanın oluşmadığını sanıp ikinci kez basar —
     * para harcayan mükerrerlik.
     */
    expect(KOMPONENT).toContain('Listeye birkaç dakika içinde düşecek');
  });

  it('KRİTİK: Meta sınırı önden söyleniyor', () => {
    // Belge: eşzamanlı çağrıda en fazla 3 alt reklam. Bilmeyen kullanıcı
    // eksik kopyayı hata sanar.
    expect(KOMPONENT).toContain('3 reklama kadar');
  });

  it('KRİTİK: Toplu Oluştur ekranında da var', () => {
    // Kullanıcının bildirdiği eksik buydu: "toplu oluşturda sadece boostlar
    // var, aktif kampanyaları seçemiyorum".
    expect(TOPLU).toContain('Yayındaki kampanyadan çoğalt');
  });

  it('aksiyon yetkisi `budget.write` — taslak yetkisi DEĞİL', () => {
    // Uç noktanın kendi izniyle aynı; ayrışması sunucunun reddedeceği bir
    // düğme göstermek olurdu.
    for (const kaynak of [HUB, TOPLU]) {
      expect(kaynak).toContain("hasPermission(session, 'budget.write')");
    }
  });
});
