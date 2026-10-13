import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AYARLAR_SEKMELERI, MARKA_MERKEZI_BOLUMLERI, PANEL_YERLERI, VARLIKLAR_SEKMELERI } from '@advetics/shared';
import { LOGO_YERI } from './modules/autoboost/youtube-otomatik.service';
import { INSTAGRAM_PARENT_PAGE_MISSING } from './modules/boosts/instagram-boost-guard';

/**
 * ═══ KULLANICIYA YAZILAN "ŞURAYA GİT" CÜMLELERİ ESKİ EKRANI ANLATMIYOR ═══
 * (docs/panel-sadelestirme/MIMARI.md § 11, Ajan 4 kapısı, 2026-10-13)
 *
 * Ayarlar ve Marka Merkezi sadeleştirildikten sonra API'nin hata ve uyarı
 * cümlelerinin on dokuzu hâlâ eski ekranları tarif ediyordu: "Platform
 * Bağlantıları ekranından ata" (atama artık Marka Merkezi › Kurulum'da),
 * "Workspace ayarları'ndan gir" (bölüm artık Workspace bilgileri),
 * "Kütüphane > Formlar" (menüde Kütüphane yok), "Ayarlar → E-posta
 * Ayarları" (sekme yok, kart Hesabım'da). Hiçbiri hata vermiyor; kullanıcı
 * menüde olmayan bir adı arıyor.
 *
 * İki kilit: (1) yer adları sözleşmedeki sekme/bölüm adından TÜRÜYOR, yani
 * bir sekme yeniden adlandırılırsa cümle de değişiyor; (2) API ve shared
 * kaynağında (yorumlar hariç) eski adlar yok.
 */

const KOK = join(__dirname, '..', '..', '..');
const TARANAN = [join(KOK, 'apps/api/src'), join(KOK, 'packages/shared/src')];

/** Eski ekran adları — kullanıcıya görünen METİNDE kalmamalı. */
const ESKI_ADLAR: ReadonlyArray<RegExp> = [
  /Platform Bağlantıları/,
  /Workspace ayarlar/,
  /E-posta Ayarları/,
  /Kütüphane\s*[>›]/,
  /Marka Merkezi › (Bağlantılar|Kitleler|Varlıklar|Ölçüm)/,
  /Senkronizasyon Durumu/,
  /Ekip & Yetkiler/,
  // Sekmenin kısa adıyla "Bağlantılar’dan / ’da" — tam yer adı yazılmalı:
  // "Bağlantılar" Marka Merkezi'nin eski bölümünün de adıydı ve hangisi
  // olduğu cümleden anlaşılmıyor.
  /(?<!› Platform b)Bağlantılar[’']d[ae]n?\b/,
];

/**
 * Yorumu atar (CLAUDE.md "TARAMAYI YORUMSUZ KAYNAKTA YAP"): eski adı
 * ANLATAN yorumlar meşru ve bu dosyanın kendisi gibi kuralı açıklıyor.
 * `//` yalnız satır başında ya da boşluktan sonra yorum sayılıyor; dizge
 * içindeki `https://` atılmasın.
 */
export function yorumsuz(kaynak: string): string {
  return kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function dosyalar(dizin: string): string[] {
  const sonuc: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) {
      if (ad === 'node_modules' || ad === 'dist') continue;
      sonuc.push(...dosyalar(yol));
    } else if (ad.endsWith('.ts') && !ad.endsWith('.spec.ts')) {
      sonuc.push(yol);
    }
  }
  return sonuc;
}

/** Bir kaynakta kalan eski adlar — `dosya: eşleşme` listesi. */
export function eskiAdIhlalleri(ad: string, kaynak: string): string[] {
  const temiz = yorumsuz(kaynak);
  return ESKI_ADLAR.flatMap((d) => {
    const m = temiz.match(d);
    return m ? [`${ad}: ${m[0]}`] : [];
  });
}

describe('yer adları sözleşmeden türüyor', () => {
  it('KRİTİK: her yer adı ilgili sekme/bölüm adını taşıyor', () => {
    const ayar = (k: string) => AYARLAR_SEKMELERI.find((s) => s.kod === k)!.ad;
    const mm = (k: string) => MARKA_MERKEZI_BOLUMLERI.find((b) => b.kod === k)!.ad;
    expect(PANEL_YERLERI.platformBaglantilari).toBe(`Ayarlar › ${ayar('baglantilar')}`);
    expect(PANEL_YERLERI.hesabimEposta).toBe(`Ayarlar › ${ayar('hesabim')} › E-posta`);
    expect(PANEL_YERLERI.kurulum).toBe(`Marka Merkezi › ${mm('kurulum')}`);
    expect(PANEL_YERLERI.workspaceBilgileri).toBe(`Marka Merkezi › ${mm('workspace')}`);
    expect(PANEL_YERLERI.logo).toBe(`Marka Merkezi › ${mm('marka')} › Logo`);
    expect(PANEL_YERLERI.formlar).toBe(`Varlıklar › ${VARLIKLAR_SEKMELERI.find((s) => s.kod === 'formlar')!.ad}`);
  });

  it('API sabitleri yer adını sözleşmeden okuyor (elle kopya yok)', () => {
    expect(LOGO_YERI).toBe(PANEL_YERLERI.logo);
    expect(INSTAGRAM_PARENT_PAGE_MISSING).toContain(PANEL_YERLERI.platformBaglantilari);
  });
});

describe('KRİTİK: API ve shared kaynağında eski ekran adı yok', () => {
  const liste = TARANAN.flatMap(dosyalar);

  it('tarama boşa düşmüyor — dosyalar bulundu ve bilinen bir yer adı kullanan dosya içinde', () => {
    expect(liste.length).toBeGreaterThan(300);
    const sync = liste.find((f) => f.endsWith('modules/sync/sync.controller.ts'));
    expect(sync, 'sync.controller.ts taranmıyor').toBeDefined();
    expect(readFileSync(sync!, 'utf8')).toContain('PANEL_YERLERI.kurulum');
  });

  it('dedektör eski cümleyi yakalıyor, yorumdakini ve yeni adı yakalamıyor', () => {
    expect(eskiAdIhlalleri('x', "throw new Error('Platform Bağlantıları ekranından ata.');")).toHaveLength(1);
    expect(eskiAdIhlalleri('x', "const m = 'Önce Bağlantılar’dan bağla.';")).toHaveLength(1);
    expect(eskiAdIhlalleri('x', "const m = 'Kütüphane > Formlar';")).toHaveLength(1);
    expect(eskiAdIhlalleri('x', '// Platform Bağlantıları eski addı\nconst a = 1;')).toEqual([]);
    expect(eskiAdIhlalleri('x', '/* Workspace ayarları */ const a = 1;')).toEqual([]);
    expect(eskiAdIhlalleri('x', "const m = 'Ayarlar › Platform bağlantıları’ndan bağla.';")).toEqual([]);
  });

  it('hiçbir dosyada eski ad yok', () => {
    const ihlaller = liste.flatMap((f) => eskiAdIhlalleri(relative(KOK, f), readFileSync(f, 'utf8')));
    expect(ihlaller).toEqual([]);
  });
});
