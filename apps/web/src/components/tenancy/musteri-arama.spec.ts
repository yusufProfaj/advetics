import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ WORKSPACE ARAMA — ŞİRKETLER SEKMESİ VE ÜST BARDAKİ SEÇİCİ ═══
 *
 * İki yüzey: üst bardaki seçicinin içindeki arama ve Ayarlar › Şirketler ve
 * workspace'ler sekmesindeki workspace tablosunun arama kutusu. İkisi de
 * liste büyüdükçe "aradığım workspace ekranın dışında" sorununu çözüyor.
 *
 * ÜÇÜNCÜ YÜZEY KALKTI (2026-10-13): seçiciden açılan "Yönetim paneli"
 * penceresi (`yonetim-paneli.tsx`) hiçbir yerde çizilmeyen ölü koddu ve
 * workspace kartları/penceresi de kalktı (MIMARI Ç-23). Arama artık
 * `workspace-satirlari.tsx` içinde, kartlar değil SATIRLAR süzülüyor.
 *
 * Bileşenler DOM'da sınanmıyor (kurulum yok); iddialar kaynağa çapalı ama her
 * biri tek bir karara ve o kararın koddaki tek satırına.
 */
const SATIRLAR = readFileSync(join(__dirname, 'workspace-satirlari.tsx'), 'utf8');
/*
 * ÜST BARDAKİ SEÇİCİ `kapsam-secici.tsx`. Arama ŞİRKET VE WORKSPACE
 * adlarında birlikte çalışıyor — Türkçe küçültme kuralı ikisi için de geçerli.
 */
const SECICI = readFileSync(join(__dirname, '..', 'kapsam-secici.tsx'), 'utf8');

/** Yorum satırlarını atar — iddia yoruma değil koda çapalanmalı. */
function kod(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('workspace arama', () => {
  it('KRİTİK: iki yüzeyde de TÜRKÇE küçültme kullanılıyor', () => {
    /*
     * Varsayılan `toLowerCase()` "İ" harfini "i̇" (i + birleşen nokta)
     * yapıyor; "İkon" araması "ikon" ile EŞLEŞMİYOR. Türkçe adlarda sessiz
     * ve şaşırtıcı bir boş sonuç — ve bu panelin bütün workspace adları
     * Türkçe.
     */
    for (const [ad, src] of [
      ['workspace tablosu', SATIRLAR],
      ['seçici', SECICI],
    ] as const) {
      expect(kod(src), `${ad} varsayılan küçültme kullanıyor`).not.toMatch(/\.toLowerCase\(\)/);
      expect(kod(src), `${ad} Türkçe küçültme kullanmıyor`).toContain("toLocaleLowerCase('tr')");
    }
  });

  it('KRİTİK: tablo adda VE kısa adda arıyor', () => {
    expect(kod(SATIRLAR)).toContain('kucult(s.name).includes(q) || kucult(s.slug).includes(q)');
  });

  it('KRİTİK: seçicide arama EN ÜSTTE', () => {
    // Liste büyüdükçe aranan ad ekranın dışında kalıyor.
    const i = kod(SECICI).indexOf('role="tree"');
    expect(i, 'açılır ağaç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kod(SECICI).slice(i);
    const ilkSatir = dilim.indexOf('role="treeitem"');
    expect(ilkSatir, 'ağaçta hiç satır yok — tarama boşa düştü').toBeGreaterThan(-1);
    expect(dilim.indexOf('type="search"')).toBeLessThan(ilkSatir);
  });

  it('KRİTİK: yönetim bağlantısı bir EYLEM — listenin üyesi gibi görünmüyor', () => {
    /*
     * Bir kapsam SEÇMİYOR, başka bir ekran açıyor; listenin DIŞINDA, üst
     * kenarlıklı ayrı bir alt satırda. Kapsam satırlarıyla karışmamalı.
     */
    const i = kod(SECICI).indexOf('Şirketleri yönet');
    expect(i, 'yönetim bağlantısı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const satir = kod(SECICI).lastIndexOf('<div className="flex border-t border-line', i);
    expect(satir, 'alt satır kabı bulunamadı').toBeGreaterThan(-1);
    expect(kod(SECICI).indexOf('overflow-y-auto py-1')).toBeLessThan(satir);
  });

  it('KRİTİK: seçicide arama HER AÇILIŞTA sıfırlanıyor', () => {
    // Önceki aramayla açılan liste, aranan workspace'i "yok" gibi gösteriyor.
    expect(kod(SECICI)).toContain("setArama('');");
  });

  it('KRİTİK: boş sonuç SEBEBİYLE yazılıyor', () => {
    // Sessiz boş liste "workspace yok" ile "arama tutmadı" hâllerini aynı ekrana çevirir.
    expect(kod(SECICI)).toContain('ile eşleşen');
    expect(kod(SATIRLAR)).toContain('ile eşleşen workspace yok.');
  });

  it('KRİTİK: süzülen tabloda kaçının gösterildiği yazılı — sessiz kesme yok', () => {
    expect(kod(SATIRLAR)).toContain('workspace’ten ${suzulmus.length} tanesi gösteriliyor');
  });
});

describe('KRİTİK: workspace PENCERESİ KALKTI — satır Marka Merkezi’ne açılıyor (MIMARI Ç-23)', () => {
  it('pencere, kart ve üçüncü atama arayüzü dosyaları yok', () => {
    for (const d of ['yonetim-paneli.tsx', 'musteri-karti.tsx', 'client-assets.tsx', 'client-actions.tsx', 'musteri-arama.tsx']) {
      expect(existsSync(join(__dirname, d)), d).toBe(false);
    }
  });

  it('workspace bölümü pencere, atama ve kategori bileşeni ÇİZMİYOR', () => {
    const bolum = kod(readFileSync(join(__dirname, 'workspace-bolumu.tsx'), 'utf8'));
    expect(bolum).toContain('<WorkspaceSatirlari');
    for (const yasak of ['MusteriDetay', 'SpecialCategoryPicker', 'ClientAssets', 'MusteriBilgiFormu']) {
      expect(bolum, yasak).not.toContain(yasak);
    }
  });

  it('KRİTİK: "Marka Merkezi’nde aç" önce o workspace’e GEÇİYOR, sonra Kurulum’u açıyor', () => {
    /*
     * Geçmeden açmak, başlıkta A yazıp menüde B'nin verisini gösteren bir
     * panel bırakırdı — eski "Hesapları yönet" düğmesinin hatası.
     */
    const k = kod(SATIRLAR);
    const bas = k.indexOf('async function ac(');
    expect(bas, 'ac() bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = k.slice(bas, k.indexOf('\n  }\n', bas));
    const gecis = govde.indexOf("apiFetch('/auth/switch-client'");
    const git = govde.indexOf("router.push(markaMerkeziAdresi('kurulum', s.id))");
    expect(gecis).toBeGreaterThan(-1);
    expect(git).toBeGreaterThan(gecis);
  });
});
