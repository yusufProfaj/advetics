import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { STRATEJI_BELGE_BOLUMLERI, type Gerceklesen, type StratejiBelgeVerisi, type StratejiKalemi } from '@advetics/shared';
import { glifVarMi } from '../../reports/pdf-yazi-tipi';
import { BASLIK_DOSYASI, GOVDE_DOSYASI, SAYI_DOSYASI, YEDEK_DOSYASI, hepsiVarMi, onayCumlesi, stratejiDosyaAdi, stratejiPdf, stratejiYaziTipiOku } from './strateji-pdf';

/**
 * Strateji PDF'i — ÇALIŞTIRILARAK ve METNİ OKUNARAK (rapor PDF testinin
 * `metinler()` deseni: alt küme gömülü yazı tipi, ToUnicode haritalarının
 * HER BİRİYLE çözülür).
 */
function metinler(pdf: Buffer): string[] {
  const ham = pdf.toString('latin1');
  const akislar: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham)) !== null) {
    const bas = m.index + m[0].length;
    const son = ham.indexOf('endstream', bas);
    if (son === -1) continue;
    try {
      akislar.push(inflateSync(Buffer.from(ham.slice(bas, son), 'latin1')).toString('latin1'));
    } catch {
      akislar.push(ham.slice(bas, son));
    }
  }
  const haritalar: Array<Map<string, string>> = [];
  for (const a of akislar) {
    if (!a.includes('begincmap')) continue;
    const h = new Map<string, string>();
    for (const mm of a.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) h.set(mm[1]!.toLowerCase(), String.fromCodePoint(parseInt(mm[2]!.slice(0, 4), 16)));
    haritalar.push(h);
  }
  const out: string[] = [];
  for (const a of akislar) {
    if (!a.includes('Tj')) continue;
    for (const mm of a.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      const hex = mm[1]!;
      for (const h of haritalar) {
        let t = '';
        for (let i = 0; i + 4 <= hex.length; i += 4) t += h.get(hex.slice(i, i + 4).toLowerCase()) ?? '';
        if (t) out.push(t);
      }
    }
  }
  return out;
}

const kalem = (o: Partial<StratejiKalemi> = {}): StratejiKalemi => ({
  id: '00000000-0000-4000-8000-000000000001',
  sira: 1,
  amac: 'SITE',
  asama: 'ilgi',
  meta: true,
  google: true,
  metaPayi: 60,
  butceMicros: '30000000000',
  baslangic: '2026-11-02',
  bitis: '2026-11-30',
  konumlar: [{ tur: 'region', key: '35', etiket: 'İzmir', ulkeKodu: 'TR' }],
  yasMin: 25,
  yasMax: 65,
  kelimeGrubu: 'Konut',
  varliklar: [],
  metin: null,
  kreatifYonergesi: { metin: 'Deniz manzaralı salon ve ışık.', kaynak: 'ajans', kim: null, zaman: '2026-10-13T10:00:00.000Z' },
  kitleTarifi: null,
  tahmin: { meta: { tur: 'aralik', olcut: 'ziyaret', altSonuc: 1200, ustSonuc: 1800, aySayisi: 3, kaynak: 'veri' }, google: { tur: 'yok', neden: 'gecmis_yok' } },
  kaynaklar: {},
  durum: { tur: 'aktarilmadi' },
  not: null,
  ...o,
});

function belge(o: Partial<StratejiBelgeVerisi['plan']> = {}): StratejiBelgeVerisi {
  return {
    plan: {
      id: 'p',
      clientId: 'c',
      bicim: 2,
      durum: 'taslak',
      surum: 3,
      onaylananSurum: null,
      baslangic: '2026-11-01',
      bitis: '2026-11-30',
      toplamButceMicros: '50000000000',
      paraBirimi: 'TRY',
      guncellendi: '2026-10-13T10:00:00.000Z',
      guncelleyen: 'Ayşe',
      workspaceAdi: 'Ege Birlik Yapı – Gaziemir',
      hazirlayan: 'Profaj',
      onay: null,
      revizyonNotu: null,
      ...o,
    },
    kalemler: [kalem(), kalem({ id: '00000000-0000-4000-8000-000000000002', sira: 2, amac: 'ERISIM', asama: 'tanitim', google: false, metaPayi: null, kelimeGrubu: null, butceMicros: '20000000000' })],
    bolumler: { ozet: { metin: 'Önce siteye gelen kişiyi artıracağız; ardından bölgede tanınırlık.', kaynak: 'ajans', kim: null, zaman: '2026-10-13T10:00:00.000Z' } },
    riskler: [{ kod: 'R-HESAP', kalem: 1, platform: 'google', metin: 'Google reklam hesabı bu workspace’e atanmadı.' }],
    isletme: [{ etiket: 'Sektör', deger: 'İnşaat' }, { etiket: 'Vaatler', deger: null }],
    gecmis: { gun: 92, satirlar: [{ platform: 'meta', amac: 'SITE', etiket: 'Siteme gelsinler', harcamaMicros: '9000000000', sonuc: 3000, birim: 'site ziyareti' }], bosNedeni: null },
    olcum: [{ etiket: 'Sitede form gönderimi · Kaydediliyor', platform: 'meta', durum: 'hazir' }],
  };
}

const GERCEKLESEN: Gerceklesen = {
  kalemler: [
    {
      kalemId: '00000000-0000-4000-8000-000000000001',
      platformlar: { meta: { harcananMicros: '1000000000', sonuc: 90, kurulanButceMicros: null, planMicros: '18000000000', sonucNedeni: null, tahmin: { tur: 'yok', neden: 'gecmis_yok' } } },
    },
  ],
  guncellendi: '2026-11-10',
};

describe('strateji PDF — bölümler tek listeden', () => {
  it('KRİTİK: her bölüm başlığı PDF metninde ve LİSTEDEKİ SIRAYLA; gerçekleşen yalnız onaylı planda', async () => {
    const { bayt } = await stratejiPdf({ belge: belge(), gerceklesen: null });
    const m = metinler(bayt);
    const beklenen = STRATEJI_BELGE_BOLUMLERI.filter((b) => b.kod !== 'kapak' && !b.onaydanSonra).map((b) => b.baslik);
    const konumlar = beklenen.map((b) => m.indexOf(b));
    for (const [i, k] of konumlar.entries()) expect(k, beklenen[i]).toBeGreaterThanOrEqual(0);
    expect([...konumlar].sort((a, b) => a - b)).toEqual(konumlar);
    expect(m).not.toContain('Plan ve gerçekleşen');

    const onayli = await stratejiPdf({
      belge: belge({ durum: 'onaylandi', onaylananSurum: 3, onay: { rol: 'baglanti', zaman: '2026-10-14T09:00:00.000Z', kim: null, ad: 'Mehmet Kaya', eposta: 'mk@ornek.com', surum: 3 } }),
      gerceklesen: GERCEKLESEN,
    });
    const mo = metinler(onayli.bayt);
    expect(mo).toContain('Plan ve gerçekleşen');
    expect(mo.join(' ')).toContain('Onay bağlantısıyla onaylandı · Mehmet Kaya (mk@ornek.com)');
  });

  it('KRİTİK: taslakta TASLAK filigranı, onaylıda yok; Türkçe harfler gömülü yazı tipinde çözülüyor', async () => {
    const t = metinler((await stratejiPdf({ belge: belge(), gerceklesen: null })).bayt);
    expect(t).toContain('TASLAK');
    expect(t.join(' ')).toContain('Ege Birlik Yapı – Gaziemir');
    expect(t.join(' ')).toContain('Marka Merkezi’nde boş');
    const o = metinler((await stratejiPdf({ belge: belge({ durum: 'onaylandi' }), gerceklesen: null })).bayt);
    expect(o).not.toContain('TASLAK');
  });

  it('platformlar TOPLANMAZ: tahmin hücreleri platform başına; veri yoksa "tahmin yok" cümlesi', async () => {
    const t = metinler((await stratejiPdf({ belge: belge(), gerceklesen: null })).bayt).join(' | ');
    expect(t).toContain('1200 – 1800 site ziyareti');
    expect(t).toContain('Tahmin yok: hesabın');
  });
});

describe('strateji PDF — kılavuz renkleri ve yazı tipi', () => {
  const KAYNAK = readFileSync(join(__dirname, 'strateji-pdf.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('KRİTİK: SLATE ve serbest rgb() yok; renkler yalnız MARKA sabitinden', () => {
    expect(KAYNAK.length).toBeGreaterThan(3000);
    expect(KAYNAK).not.toMatch(/\bSLATE\b/);
    expect(KAYNAK).not.toMatch(/\brgb\(/);
    expect(KAYNAK).toMatch(/MARKA\.kirmizi/);
    const cizim = readFileSync(join(__dirname, '../../reports/pdf-cizim.ts'), 'utf8');
    const marka = /export const MARKA = \{([\s\S]*?)\} as const;/.exec(cizim)?.[1];
    expect(marka, 'MARKA sabiti bulunamadı').toBeTruthy();
    expect(marka!.match(/rgb\(/g)).toHaveLength(4);
    expect(marka).toMatch(/0x30 \/ 255, 0x2e \/ 255, 0x2d \/ 255/);
    expect(marka).toMatch(/rgb\(1, 0x24 \/ 255, 0\)/);
  });

  it('KRİTİK: Montserrat ve DejaVu cmap’inde ğ ş ı İ ₺ var (glif tablosundan, addan değil)', () => {
    for (const d of [BASLIK_DOSYASI, SAYI_DOSYASI, GOVDE_DOSYASI, YEDEK_DOSYASI]) {
      const v = stratejiYaziTipiOku(d);
      for (const ch of 'ğĞşŞıİçÇöÖüÜ₺') expect(glifVarMi(v, ch.codePointAt(0)!), `${d} ${ch}`).toBe(true);
    }
  });

  it('KRİTİK: Montserrat’ta olmayan glif dizesi DejaVu’ya AÇIKÇA düşer (sessiz kutu yok)', async () => {
    const mont = stratejiYaziTipiOku(GOVDE_DOSYASI);
    const dejavu = stratejiYaziTipiOku(YEDEK_DOSYASI);
    const ozel = '⌘';
    expect(hepsiVarMi(mont, ozel)).toBe(false);
    expect(hepsiVarMi(dejavu, ozel)).toBe(true);
    const r = await stratejiPdf({ belge: { ...belge(), isletme: [{ etiket: 'Kısayol', deger: `Tuş ${ozel}` }] }, gerceklesen: null });
    expect(r.yedegeDusen).toContain(`Tuş ${ozel}`);
    expect(metinler(r.bayt).join(' ')).toContain(`Tuş ${ozel}`);
  });

  it('yazı tipi dosyası yoksa AÇIKÇA patlar', () => {
    expect(() => stratejiYaziTipiOku('YOK.ttf', '/olmayan/dizin')).toThrow(/yazı tipi bulunamadı/);
  });

  it('onay cümlesi üç rolü ayrı yazar; dosya adı ASCII ve taslakta işaretli', () => {
    expect(onayCumlesi({ rol: 'musteri', zaman: '2026-10-14T09:00:00.000Z', kim: 'Ali', ad: null, eposta: null, surum: 2 })).toMatch(/^Müşteri hesabı onayladı · Ali · 14\.10\.2026 · sürüm 2$/);
    expect(onayCumlesi({ rol: 'ajans', zaman: '2026-10-14T09:00:00.000Z', kim: 'Ayşe', ad: null, eposta: null, surum: 2 })).toMatch(/^Ajans onayladı \(müşteri hesabı adına\)/);
    expect(stratejiDosyaAdi('Ege "Birlik"\r\n', '2026-11-01', 3, 'taslak')).toBe('strateji-ege-birlik-2026-11-01-s3-taslak.pdf');
    expect(stratejiDosyaAdi('ege', '2026-11-01', 3, 'onaylandi')).toBe('strateji-ege-2026-11-01-s3.pdf');
  });
});
