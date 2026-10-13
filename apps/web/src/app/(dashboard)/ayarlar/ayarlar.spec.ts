import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AYARLAR_CAPALARI, AYARLAR_SEKMELERI, ROLE_PERMISSIONS, type AyarlarSekmeKodu } from '@advetics/shared';
import { ayarSekmesiAcik, hesaplarHedefi } from '@/lib/ayar-kapilari';
import type { SessionResponse } from '@/lib/session';

/**
 * ═══ AYARLAR — DÖRT SEKME (Ayarlar ve Marka Merkezi sadeleştirme, Ajan 2) ═══
 *
 * Panelde bileşen render eden bir test altyapısı yok (`vitest.config.ts`
 * bilerek reddediyor); kararlar YORUMSUZ kaynakta taranıyor ve her tarama
 * "gerçekten bir şey yakaladı" bekçisi taşıyor (CLAUDE.md).
 *
 * Kilitlenen kararlar:
 *   1. ÇAPA ↔ SÖZLEŞME: `AYARLAR_CAPALARI`ndaki her çapa sekmenin
 *      kaynağında `id="…"` olarak duruyor. Listede olup sayfada olmayan çapa
 *      KIRIK BAĞLANTI: bildirim zili, Kurulum, eski adres yönlendirmesi oraya
 *      gidiyor ve sayfa başından açılıyor — hata yok, kullanıcı aradığını
 *      bulamıyor.
 *   2. KAPI SÖZLEŞMEDEN: bu modülün dosyalarında `hasPermission(session,
 *      '…')` ya da `session.isOrgAdmin` ile ELLE yazılmış kapı yok
 *      (MIMARI § Yetki kapıları). Aynı düğmenin kapısı iki yerde yazılınca
 *      biri API'den ayrışıyor.
 *   3. KAPSAM BAŞLIKTA: her sekme hangi düzeyi değiştirdiğini söylüyor
 *      (ajans / şirket / kişi).
 */
const SRC = join(__dirname, '..', '..', '..');
const oku = (yol: string): string => readFileSync(join(SRC, yol), 'utf8');
const yorumsuz = (s: string): string =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Sekmenin çizildiği kaynaklar: sayfa + çapa taşıyan bileşenleri. */
const SEKME_KAYNAKLARI: Record<AyarlarSekmeKodu, string[]> = {
  sirketler: ['app/(dashboard)/ayarlar/sirketler/page.tsx', 'components/tenancy/workspace-bolumu.tsx'],
  baglantilar: ['app/(dashboard)/ayarlar/baglantilar/page.tsx'],
  ekip: [
    'app/(dashboard)/ayarlar/ekip/page.tsx',
    'components/tenancy/team-screen.tsx',
    'components/tenancy/workspace-erisimi.tsx',
  ],
  hesabim: ['app/(dashboard)/ayarlar/hesabim/page.tsx'],
};

/** Bu modülün (Ajan 2, MIMARI § 9) Ayarlar tarafı dosyaları — elle kapı taraması. */
const MODUL_DOSYALARI = [
  ...Object.values(SEKME_KAYNAKLARI).flat(),
  'app/(dashboard)/ayarlar/layout.tsx',
  'app/(dashboard)/kurulum/page.tsx',
  'components/tenancy/workspace-satirlari.tsx',
  'components/tenancy/arsiv-listesi.tsx',
  'components/ust-hesap/ust-hesap-ekrani.tsx',
  'components/ust-hesap/ust-hesap-karti.tsx',
  'components/ust-hesap/ust-hesap-yonetimi.tsx',
  'components/kapsam-secici.tsx',
  'components/kenar-cubugu.tsx',
  'lib/ayar-kapilari.ts',
];

describe('KRİTİK: ÇAPALAR sözleşmeyle birebir — kırık bağlantı yok', () => {
  it('tarama boşa düşmüyor: dört sekmenin kaynağı da var ve okunuyor', () => {
    for (const s of AYARLAR_SEKMELERI) {
      expect(SEKME_KAYNAKLARI[s.kod].length, s.kod).toBeGreaterThan(0);
      for (const d of SEKME_KAYNAKLARI[s.kod]) expect(existsSync(join(SRC, d)), d).toBe(true);
    }
    expect(Object.values(AYARLAR_CAPALARI).flat().length).toBeGreaterThanOrEqual(17);
  });

  it.each(AYARLAR_SEKMELERI.map((s) => s.kod))('%s: her çapa kaynakta id olarak duruyor', (kod) => {
    const kaynak = SEKME_KAYNAKLARI[kod].map((d) => yorumsuz(oku(d))).join('\n');
    const eksik = AYARLAR_CAPALARI[kod].filter((c) => !kaynak.includes(`id="${c}"`));
    expect(eksik, `${kod} sekmesinde çapası olmayan kart`).toEqual([]);
  });

  it('sekme yolu sayfanın kendisi: her sekmenin page.tsx’i sözleşmedeki yolda', () => {
    for (const s of AYARLAR_SEKMELERI) {
      expect(existsSync(join(SRC, 'app', '(dashboard)', ...s.yol.replace(/^\//, '').split('/'), 'page.tsx')), s.yol).toBe(true);
    }
  });
});

describe('KRİTİK: SEKME BAŞLIĞI = sözleşmedeki ad, KAPSAM başlıkta, kapı sözleşmeden', () => {
  it.each(AYARLAR_SEKMELERI.map((s) => [s.kod, s.ad] as const))('%s', (kod, ad) => {
    const sayfa = yorumsuz(oku(SEKME_KAYNAKLARI[kod][0]!));
    // Menü etiketi = sayfa başlığı = sekme başlığı (`nav-sections.spec.ts`).
    expect(sayfa).toContain(`metadata = { title: '${ad} · Advetics' }`);
    expect(sayfa).toContain(`baslik="${ad}"`);
    // Kapsam satırı: ajans / şirket / kişi.
    expect(sayfa).toMatch(/<AyarKapsami duzey="(ajans|sirket|kisi)"/);
    // Hesabım herkese açık; diğerleri sekme kapısını sözleşmeden okuyor.
    if (kod === 'hesabim') expect(sayfa).not.toContain('ayarSekmesiAcik(');
    else expect(sayfa).toContain(`if (!ayarSekmesiAcik(session, '${kod}')) redirect('/dashboard');`);
  });

  it('Hesabım kişisel, Bağlantılar ve Ekip şirket düzeyinde', () => {
    expect(yorumsuz(oku(SEKME_KAYNAKLARI.hesabim[0]!))).toContain('<AyarKapsami duzey="kisi"');
    expect(yorumsuz(oku(SEKME_KAYNAKLARI.baglantilar[0]!))).toContain('<AyarKapsami duzey="sirket"');
    expect(yorumsuz(oku(SEKME_KAYNAKLARI.ekip[0]!))).toContain('<AyarKapsami duzey="sirket"');
  });
});

describe('KRİTİK: bu modülde ELLE yazılmış kapı yok — hepsi PANEL_KAPILARI’ndan', () => {
  it('tarama boşa düşmüyor: dosyalar var ve kapı çağrısı içeriyor', () => {
    let kapiCagrisi = 0;
    for (const d of MODUL_DOSYALARI) {
      expect(existsSync(join(SRC, d)), d).toBe(true);
      kapiCagrisi += (yorumsuz(oku(d)).match(/\bkapi\(session, '/g) ?? []).length;
    }
    expect(kapiCagrisi).toBeGreaterThanOrEqual(15);
  });

  it.each(MODUL_DOSYALARI)('%s', (d) => {
    const k = yorumsuz(oku(d));
    expect(k).not.toMatch(/hasPermission\(session,\s*'/);
    expect(k).not.toContain('session.isOrgAdmin');
  });

  it('`.catch(() => …)` ile hata yutan yok', () => {
    for (const d of MODUL_DOSYALARI) expect(yorumsuz(oku(d)), d).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>/);
  });
});

/*
 * SAF KARARLAR — gerçekten çalıştırılarak. Rol matrisiyle: kaynak taraması
 * "doğru fonksiyon çağrılıyor" der, bu blok "fonksiyon doğru karar veriyor".
 */
function oturum(rol: keyof typeof ROLE_PERMISSIONS, ek: Partial<SessionResponse> = {}): SessionResponse {
  return {
    permissions: [...ROLE_PERMISSIONS[rol]],
    isOrgAdmin: rol === 'admin',
    platformAdmin: false,
    managerAccount: null,
    ...ek,
  } as SessionResponse;
}

describe('KRİTİK: sekme kapısı rol matrisiyle', () => {
  it('Reklam Yöneticisi Şirketler sekmesini açıyor (MIMARI Ç-2); müşteri hesabı yalnız Hesabım’ı', () => {
    expect(ayarSekmesiAcik(oturum('ad_manager'), 'sirketler')).toBe(true);
    for (const kod of ['sirketler', 'baglantilar', 'ekip'] as const) {
      expect(ayarSekmesiAcik(oturum('client_viewer'), kod), kod).toBe(false);
    }
    expect(ayarSekmesiAcik(oturum('client_viewer'), 'hesabim')).toBe(true);
  });
});

describe('KRİTİK: "hesap bağla" bağlantısı yalnız hedefi açıksa (MIMARI Ç-19)', () => {
  it('müşteri hesabına bağlantı YOK — ne workspace’le ne workspace’siz', () => {
    expect(hesaplarHedefi(oturum('client_viewer'), 'ws-1')).toBeNull();
    expect(hesaplarHedefi(oturum('client_viewer'), null)).toBeNull();
  });

  it('ajans rolü: workspace biliniyorsa onun Kurulum’u, bilinmiyorsa havuz', () => {
    expect(hesaplarHedefi(oturum('admin'), 'ws-1')).toBe('/marka-merkezi?musteri=ws-1&bolum=kurulum#kanallar');
    expect(hesaplarHedefi(oturum('admin'), null)).toBe('/ayarlar/baglantilar#havuz');
  });

  it('iki ekran da yardımcıyı kullanıyor, elle bağlantı yazmıyor', () => {
    for (const d of ['app/(dashboard)/dashboard/page.tsx', 'app/(dashboard)/ads-explorer/page.tsx']) {
      const k = yorumsuz(oku(d));
      expect(k, d).toContain('const hesapHedefi = hesaplarHedefi(session, session.activeClientId);');
      expect(k, d).toContain('HESAP_AJANSTA');
    }
  });
});
