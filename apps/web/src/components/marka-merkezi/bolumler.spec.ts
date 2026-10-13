import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { butceAdresi } from '@/lib/butce-adresi';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import {
  MARKA_MERKEZI_BOLUMLERI,
  MARKA_MERKEZI_CAPALARI,
  markaMerkeziBolumu,
} from '@/lib/panel-adresleri';
import { MM_ALT_BASLIKLARI, gorunurVarlikSekmeleri, sirketAdi, varlikSekmesiCoz } from './bolumler';

/**
 * ═══ MARKA MERKEZİ'NİN İÇ YAPISI — ÇALIŞTIRILARAK ═══
 *
 * Eski yedi bölümlük model (`MM_BOLUMLERI`, `bolumCoz`, `mmAdresi`)
 * sözleşmeye taşındı ve üçe indi (docs/panel-sadelestirme/MIMARI.md). Bu
 * dosya aynı KARARLARIN yeni hâlini kilitliyor: bilinmeyen bölüm ilk bölüme
 * düşer, yetkisiz sekme açılmaz, bütçe Marka Merkezi'nin bölümü değildir,
 * menüdeki her alt başlığın sayfada bir kartı vardır.
 */
const u = (adres: string) => new URL(adres, 'https://x');
const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('bölümler', () => {
  it('üç bölüm, Kurulum ilk; bilinmeyen değer null (sayfa önce eskiyi çevirir, sonra Kurulum’a düşer)', () => {
    expect(MARKA_MERKEZI_BOLUMLERI.map((b) => b.kod)).toEqual(['kurulum', 'marka', 'workspace']);
    expect(markaMerkeziBolumu('marka')).toBe('marka');
    expect(markaMerkeziBolumu('kitleler')).toBeNull();
    const sayfa = yorumsuz('../../app/(dashboard)/marka-merkezi/page.tsx');
    expect(sayfa).toContain("markaMerkeziBolumu(hamBolum) ?? 'kurulum'");
    // ESKİ KOD SESSİZCE KURULUM'A DÜŞMÜYOR: önce eşleme, sonra varsayılan.
    expect(sayfa.indexOf('eskiMarkaMerkeziYonu(')).toBeLessThan(sayfa.indexOf('markaMerkeziBolumu(hamBolum)'));
  });

  it('KRİTİK: iç menünün her alt başlığı sözleşmedeki çapalarla BİREBİR', () => {
    for (const b of MARKA_MERKEZI_BOLUMLERI) {
      expect(MM_ALT_BASLIKLARI[b.kod].map((a) => a.capa), b.kod).toEqual([...MARKA_MERKEZI_CAPALARI[b.kod]]);
    }
  });

  it('KRİTİK: her çapanın sayfada bir kimliği var (çapa listede, sayfada yok = kırık bağlantı)', () => {
    const kaynak = ['../../app/(dashboard)/marka-merkezi/page.tsx', 'workspace-bilgileri.tsx', 'kurulum-listesi.tsx']
      .map(yorumsuz)
      .join('\n');
    // Kurulum'un yedi adımı listeden üretiliyor: satır `id={a.kod}`.
    expect(kaynak).toContain('<li id={a.kod} className="scroll-mt-24">');
    const kurulumAdimlari = new Set(['meta', 'sayfa', 'piksel', 'google', 'olcum', 'marka', 'varsayilanlar']);
    for (const [, capalar] of Object.entries(MARKA_MERKEZI_CAPALARI)) {
      for (const c of capalar) {
        if (kurulumAdimlari.has(c)) continue;
        // Kart ya `id="…"` ya `<Kart id="…"` ile.
        expect(kaynak.includes(`id="${c}"`), c).toBe(true);
      }
    }
  });

  it('KRİTİK: Aylık Bütçe Marka Merkezi bölümü DEĞİL; eski adres önce yakalanıyor ve ay taşınıyor', () => {
    expect(MARKA_MERKEZI_BOLUMLERI.map((b) => b.kod as string)).not.toContain('butce');
    const mm = yorumsuz('../../app/(dashboard)/marka-merkezi/page.tsx');
    expect(mm).toContain("if (hamBolum === 'butce') redirect(butceAdresi(musteriParam, { ay: first(params.ay) }));");
    // Yönlendirme workspace kapısından ÖNCE: kapı "workspace seç" derse eski
    // bağlantı bütçeye hiç ulaşmaz.
    expect(mm.indexOf("=== 'butce') redirect(")).toBeLessThan(mm.indexOf('sayfaWorkspaceId(session'));
    expect(u(butceAdresi('ws-1', { ay: '2026-11' })).searchParams.get('ay')).toBe('2026-11');
  });
});

describe('başlıktaki şirket adı', () => {
  const session = {
    organization: { id: 'org-ev', name: 'Profaj', slug: 'p', plan: 'x', ustHesabaBagli: true },
    managerAccount: { organizations: [{ id: 'org-kardes', name: 'Biltaş', slug: 'b' }] },
  } as unknown as Parameters<typeof sirketAdi>[0];

  it('KRİTİK: workspace’in KENDİ şirketi (tüm şirketler modunda kardeş şirket)', () => {
    expect(sirketAdi(session, 'org-kardes')).toBe('Biltaş');
    expect(sirketAdi(session, 'org-ev')).toBe('Profaj');
  });

  it('bilinmeyen şirket adı UYDURULMUYOR', () => {
    expect(sirketAdi(session, 'org-yabanci')).toBeNull();
    expect(sirketAdi(session, null)).toBeNull();
  });
});

describe('Varlıklar sekmeleri', () => {
  it('KRİTİK: yetkisiz sekme açılmıyor — paylaşılan bağlantı boş sayfa vermesin', () => {
    const okur = ['client.read'];
    expect(gorunurVarlikSekmeleri(okur)).toEqual(['kitleler']);
    expect(varlikSekmesiCoz('gorseller', okur)).toBe('kitleler');
    expect(varlikSekmesiCoz('formlar', [])).toBeNull();
    expect(varlikSekmesiCoz('kitleler', ROLE_PERMISSIONS.ad_manager)).toBe('kitleler');
  });
});

describe('eski üretici kalmadı', () => {
  it('KRİTİK: mmAdresi / varlikYonu / bilgiBankasiYonu tanımı silindi', () => {
    const b = yorumsuz('bolumler.ts');
    expect(b).not.toMatch(/export function (mmAdresi|varlikYonu|bilgiBankasiYonu)\b/);
    expect(b).not.toContain('MM_BOLUMLERI');
  });

  it('bu dizinde elle Marka Merkezi adresi kuran kod yok (tarama boşa düşmüyor)', () => {
    const dosyalar: string[] = [];
    const gez = (d: string) => {
      for (const ad of readdirSync(d)) {
        const y = join(d, ad);
        if (statSync(y).isDirectory()) gez(y);
        else if (/\.tsx?$/.test(ad) && !ad.endsWith('.spec.ts')) dosyalar.push(y);
      }
    };
    gez(__dirname);
    expect(dosyalar.length).toBeGreaterThan(10);
    for (const d of dosyalar) {
      const k = readFileSync(d, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(k, d).not.toMatch(/['"`]\/marka-merkezi[?'"`]/);
    }
  });
});
