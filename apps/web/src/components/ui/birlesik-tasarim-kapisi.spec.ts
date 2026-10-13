import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BİRLEŞİK TASARIM GEÇİŞİ — AJAN 4 KAPISI (2026-10-14) ═══
 *
 * Dört grup paralel çalıştı; bu dosya denetimde bulunan ve düzeltilen
 * açıkları kilitliyor. Hepsi kaynak taraması (panelde bileşen çizen test
 * altyapısı yok, `vitest.config.ts`). Tarama YORUMSUZ kaynakta: kuralı
 * anlatan yorum aynı dosyada duruyor ve eşleşip testi yeşil tutardı.
 */
const KOK = join(__dirname, '../../..');
function oku(yol: string): string {
  return readFileSync(join(KOK, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
function dilim(kaynak: string, bas: string, son: string): string {
  const i = kaynak.indexOf(bas);
  if (i < 0) throw new Error(`${bas} bulunamadı — tarama boşa düştü`);
  const j = kaynak.indexOf(son, i + bas.length);
  if (j < 0) throw new Error(`${son} bulunamadı — tarama boşa düştü`);
  return kaynak.slice(i, j);
}

describe('Aylık Bütçe başlığında birincil "Bütçeyi düzenle" (taslak #butce)', () => {
  const ICERIK = oku('src/components/butce/butce-icerik.tsx');
  it('KRİTİK: başlık eylemi workspace geneli BudgetForm, birincil ton', () => {
    const birincil = dilim(ICERIK, 'const birincil =', 'return (');
    expect(birincil).toContain('canWrite && data ?');
    expect(birincil).toContain('adAccountId={null}');
    expect(birincil).toContain("ton: 'birincil'");
    expect(birincil).toContain("'Bütçeyi düzenle'");
    expect(ICERIK).toContain('<SayfaBasligi baslik={baslik.baslik} aciklama={baslik.aciklama} eylemler={birincil} />');
  });
  it('kartta ikinci bir tetik yok; satır tetikleri duruyor', () => {
    expect(dilim(ICERIK, 'function OverallCard(', 'function AccountTable(')).not.toContain('<BudgetForm');
    expect(ICERIK.split('<BudgetForm').length - 1).toBe(2);
  });
  it('sayfa başlığı içerikte çiziliyor (menü adı kaynakta kalıyor)', () => {
    const SAYFA = oku('src/app/(dashboard)/butce/page.tsx');
    expect(SAYFA).toContain('<ButceIcerik clientId={clientId} params={params} baslik={basliklar} />');
    expect(SAYFA).toContain("baslik: 'Aylık Bütçe'");
  });
  it('BudgetForm tetiği verilmezse eski küçük ikincil düğme', () => {
    const FORM = oku('src/components/budget/budget-form.tsx');
    expect(FORM).toContain("ton={tetik?.ton ?? 'ikincil'} boyut={tetik?.boyut ?? 'kucuk'}");
  });
});

describe('Marka Merkezi başlığında "Eksikleri tamamla" (taslak #marka)', () => {
  const LISTE = oku('src/components/marka-merkezi/kurulum-listesi.tsx');
  const SAYFA = oku('src/app/(dashboard)/marka-merkezi/page.tsx');
  it('KRİTİK: sayfa başlığında yuva var, liste düğmeleri oraya portal ile çiziyor', () => {
    expect(SAYFA).toContain('<div id={KURULUM_EYLEM_YUVASI}');
    expect(SAYFA).toMatch(/eylemler=\{bolum === 'kurulum' \? <div id=\{KURULUM_EYLEM_YUVASI\}/);
    expect(LISTE).toContain('{yuva && createPortal(eylemler, yuva)}');
    expect(LISTE).toContain('{yuva === null && eylemler}');
    expect(LISTE).toContain('document.getElementById(KURULUM_EYLEM_YUVASI)');
  });
  it('KRİTİK: TEK birincil — yazabilene "Eksikleri tamamla", sihirbaz ikincil', () => {
    const e = dilim(LISTE, 'const eylemler = (', 'const hesapAdimiAcik');
    expect(e).toContain('<Dugme ton="birincil"');
    expect(e).toContain("dugmeSinifi(yazabilir ? 'ikincil' : 'birincil')");
    expect(e.match(/ton="birincil"/g)?.length).toBe(1);
  });
  it('sabit düz modülde (istemci modülünden sunucuya dize aktarılamaz)', () => {
    const YUVA = oku('src/components/marka-merkezi/baslik-yuvasi.ts');
    expect(YUVA).toContain('export const KURULUM_EYLEM_YUVASI');
    expect(YUVA).not.toContain("'use client'");
    expect(SAYFA).toContain("from '@/components/marka-merkezi/baslik-yuvasi'");
  });
});

describe('AcilirMenu: Esc, odak ve tablo içinde kırpılma', () => {
  const M = oku('src/components/ui/acilir-menu.tsx');
  it('KRİTİK: Esc yakalama evresinde ve yayılmayı durduruyor (yan paneli kapatmasın)', () => {
    expect(M).toContain("document.addEventListener('keydown', tus, true)");
    expect(M).toContain("document.removeEventListener('keydown', tus, true)");
    const tus = dilim(M, 'function tus(e: KeyboardEvent)', "document.addEventListener('mousedown'");
    expect(tus).toContain('e.stopPropagation()');
  });
  it('KRİTİK: öğe seçilince odak tetiğe dönüyor', () => {
    const s = dilim(M, 'const secildi = useCallback(', '}, [degistir]);');
    expect(s).toContain('tetikRef.current?.focus()');
    expect(M).toContain('<AcilirBaglam.Provider value={{ kapat: secildi }}>');
  });
  it('KRİTİK: portal modu body’ye çiziyor, dışarı tıklama paneli de sayıyor', () => {
    expect(M).toContain('createPortal(govde, document.body)');
    expect(M).toContain('panel.current?.contains(hedef)');
    expect(M).toContain("window.addEventListener('scroll', konumla, true)");
  });
  it('KRİTİK: tablo içindeki ⋯ menüleri portal modunda', () => {
    for (const f of [
      'src/components/ayar-sekmeleri.tsx',
      'src/components/taslak/reklam-yoneticisi-tablosu.tsx',
      'src/components/report/faturalar.tsx',
      'src/components/report/sablon-yonetimi.tsx',
      'src/components/iyilestir/sinyaller-sekmesi.tsx',
      'src/components/marka-merkezi/kitleler-bolumu.tsx',
      'src/components/marka-merkezi/varliklar/creative-library.tsx',
      'src/components/rules/rule-controls.tsx',
      'src/components/strateji/v2/giris.tsx',
      'src/components/rehber/rehber-girisi.tsx',
    ]) {
      const k = oku(f);
      const menuler = k.split('<AcilirMenu').length - 1;
      expect(menuler, f).toBeGreaterThan(0);
      expect(k.split('tasma="portal"').length - 1, f).toBe(menuler);
    }
  });
  it('tetik `acik`ı DOM’a sızdırmıyor', () => {
    for (const f of ['src/components/marka-merkezi/kitleler-bolumu.tsx', 'src/components/marka-merkezi/varliklar/creative-library.tsx']) {
      expect(oku(f), f).not.toContain('tetik={(o) =>');
    }
  });
});

describe('Pencere / YanPanel katman yığını', () => {
  const P = oku('src/components/ui/pencere.tsx');
  it('KRİTİK: tuşları yalnız en üstteki katman işliyor', () => {
    const tus = dilim(P, 'function tus(e: KeyboardEvent)', "if (e.key === 'Escape')");
    expect(tus).toContain('if (yigin[yigin.length - 1] !== ben) return;');
    expect(P).toContain('yigin.push(ben)');
    expect(P).toContain('yigin.splice(i, 1)');
  });
  it('odak iadesi yalnız bağlı ve inert olmayan öğeye', () => {
    expect(P).toContain("if (onceki?.isConnected && !onceki.closest('[inert]')) onceki.focus?.();");
  });
});

describe('Tablo satırı klavyeyle ve hücre eylemleri satırı tetiklemiyor', () => {
  const T = oku('src/components/ui/tablo.tsx');
  it('KRİTİK: onSatir varsa satır odaklanabilir ve Enter/Boşluk açar', () => {
    expect(T).toContain('tabIndex={onSatir ? 0 : undefined}');
    expect(T).toContain("if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;");
  });
  it('KRİTİK: hücredeki düğme/bağlantı/menü öğesi satır tıklaması sayılmıyor', () => {
    expect(T).toContain('satirOlayi(e.target, e.currentTarget) && onSatir(satir)');
    const f = dilim(T, 'export function satirOlayi(', '\n}\n');
    expect(f).toContain('[role="menuitem"]');
    expect(f).toContain('!satir.contains(hedef)');
  });
});

describe('İşlev kaybı ve yetki düzeltmeleri', () => {
  it('KRİTİK: "Hesapları tara" menüde de ve yalnız connection.write ile', () => {
    const K = oku('src/components/connections/kanal-kartlari.tsx');
    const menu = dilim(K, '<DigerMenusu', '</DigerMenusu>');
    expect(menu).toMatch(/\{canManage && \(\s*<MenuOgesi devreDisi=\{meslul\} onClick=\{\(\) => void calistir\('refresh', hesaplariTara\)\}>/);
    expect(K).toMatch(/\) : canManage \? \(\s*<Dugme\s+ton="ikincil"/);
  });
  it('KRİTİK: potansiyel müşteri durum hatası yan panelin içinde', () => {
    const L = oku('src/components/leads/lead-table.tsx');
    expect(L).toContain('durumHatasi={error}');
    expect(dilim(L, 'function KayitPaneli(', '<legend')).toContain('durumHatasi');
    expect(L).toMatch(/\{durumHatasi && \(\s*<Serit ton="hata"/);
  });
  it('workspace ⋯ öğeleri iş sürerken kapalı, hata pencerenin içinde', () => {
    const W = oku('src/components/tenancy/workspace-satirlari.tsx');
    const menu = dilim(W, '<DigerMenusu', '</DigerMenusu>');
    expect(menu.match(/<MenuOgesi/g)?.length).toBe(4);
    expect(menu.match(/devreDisi=\{mesgul !== null\}/g)?.length).toBe(4);
    expect(W.split('<PencereHatasi metin={hata.metin} />').length - 1).toBe(2);
  });
  it('Raporlar bölümleri geçmişe yazıyor (geri tuşu)', () => {
    const R = oku('src/components/report/rapor-sekmeleri.tsx');
    expect(R).toContain('router.push(adres(kod as RaporSekmesi))');
    expect(R).not.toContain('router.replace(');
  });
  it('Hesabım geri/ileri ile bölüm değiştiriyor', () => {
    const H = oku('src/components/hesap/hesabim-bolumleri.tsx');
    expect(H).toContain("window.addEventListener('popstate', capaDegisti)");
    expect(H).toContain("window.removeEventListener('popstate', capaDegisti)");
  });
  it('her sayfadaki menü ve uyarı bandı depo erişiminde düşmüyor', () => {
    for (const [f, depo] of [
      ['src/components/nav.tsx', 'localStorage'],
      ['src/components/uyari-bandi.tsx', 'sessionStorage'],
    ] as const) {
      const k = oku(f);
      const satirlar = k.split('\n').filter((l) => l.includes(`${depo}.`));
      expect(satirlar.length, f).toBe(2);
      for (const s of satirlar) {
        const i = k.indexOf(s);
        expect(k.slice(Math.max(0, i - 60), i), `${f}: ${s.trim()}`).toContain('try {');
      }
    }
  });
});
