import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STRATEJI_V2_UCLARI, sayiTasiyor } from '@advetics/shared';
import { gecmisDerle, kampanyaAmaci, kampanyaDisKimligi, tahminPenceresi } from './gecmis';
import { stratejiAiIstemi, stratejiMetinleri, type StratejiAiGirdisi } from './strateji-ai';
import type { MetinUretici } from '../../../yapay-zeka/gemini';

const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('geçmiş — kampanya → amaç eşlemesi ve platform ayrımı', () => {
  const ham = (platform: 'meta' | 'google', kampanya: string, objective: string, ay: string, harcamaTl: number, o: { tiklama?: number; form?: number; mesaj?: number } = {}) => ({
    platform,
    kampanya,
    objective,
    ay,
    harcama: String(BigInt(harcamaTl) * 1_000_000n),
    tiklama: String(o.tiklama ?? 0),
    izlenme: '0',
    birimler: ['TRY'],
    hamlar:
      platform === 'meta'
        ? [{ actions: [...(o.form ? [{ action_type: 'lead', value: String(o.form) }] : []), ...(o.mesaj ? [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(o.mesaj) }] : [])] }]
        : null,
  });
  const P = { baslangic: '2026-07-01', bitis: '2026-09-30' };

  it('KRİTİK: Meta form ile Google tıklama AYRI; Google Arama yalnız SİTE, form/telefon/satış eşlenmez', () => {
    const g = gecmisDerle(
      [{ currency: 'TRY', platform: 'meta' }, { currency: 'TRY', platform: 'google' }],
      [ham('meta', 'k1', 'OUTCOME_LEADS', '2026-08', 1000, { form: 50 }), ham('google', 'k2', 'SEARCH', '2026-08', 600, { tiklama: 300 })],
      'TRY',
      P,
    );
    expect(g.sonuc('FORM', 'meta')).toEqual({ tur: 'aylar', aylar: [{ harcamaMicros: 0n, sonuc: 0 }, { harcamaMicros: 1000_000_000n, sonuc: 50 }, { harcamaMicros: 0n, sonuc: 0 }] });
    expect(g.sonuc('SITE', 'google')).toMatchObject({ tur: 'aylar' });
    expect(g.sonuc('FORM', 'google')).toEqual({ tur: 'yok', neden: 'eslenemedi' });
    expect(g.sonuc('SITE', 'meta')).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
    expect(g.sonuc('ERISIM', 'meta')).toEqual({ tur: 'yok', neden: 'toplanamaz' });
    // Belge satırları platform başına: "toplam" satırı yok.
    expect(g.belgeSatirlari.map((s) => s.platform)).toEqual(['meta', 'google']);
  });

  it('KRİTİK: hesap para birimi plandan farklıysa o platform "karisik_birim" (kur uydurulmaz)', () => {
    const g = gecmisDerle([{ currency: 'USD', platform: 'meta' }], [ham('meta', 'k1', 'OUTCOME_TRAFFIC', '2026-08', 1000, { tiklama: 9 })], 'TRY', P);
    expect(g.sonuc('SITE', 'meta')).toEqual({ tur: 'yok', neden: 'karisik_birim' });
  });

  it('eşlenemeyen kampanyanın harcaması kaybolmaz, AYRI söylenir', () => {
    const g = gecmisDerle([{ currency: 'TRY', platform: 'meta' }], [ham('meta', 'k1', 'OUTCOME_ENGAGEMENT', '2026-08', 400)], 'TRY', P);
    expect(g.eslenemeyenHarcama.meta).toBe('400000000');
    expect(g.belgeSatirlari).toEqual([expect.objectContaining({ amac: null, harcamaMicros: '400000000', sonuc: null })]);
  });

  it('OUTCOME_LEADS dönemde mesajı çok olan kampanyada WhatsApp, değilse form', () => {
    expect(kampanyaAmaci('meta', 'OUTCOME_LEADS', { form: 3, mesaj: 9, satin_alma: 0, tiklama: 0, izlenme: 0 })).toBe('WHATSAPP');
    expect(kampanyaAmaci('meta', 'OUTCOME_LEADS', { form: 0, mesaj: 0, satin_alma: 0, tiklama: 0, izlenme: 0 })).toBe('FORM');
    expect(kampanyaAmaci('google', 'PERFORMANCE_MAX', { form: 0, mesaj: 0, satin_alma: 9, tiklama: 0, izlenme: 0 })).toBeNull();
  });

  it('pencere son ÜÇ TAM ay; Google kampanya kaynak adından dış kimlik', () => {
    expect(tahminPenceresi('2026-10-20')).toEqual({ baslangic: '2026-07-01', bitis: '2026-09-30' });
    expect(tahminPenceresi('2026-01-05')).toEqual({ baslangic: '2025-10-01', bitis: '2025-12-31' });
    expect(kampanyaDisKimligi('google', 'customers/123/campaigns/555')).toBe('555');
    expect(kampanyaDisKimligi('google', '555')).toBeNull();
    expect(kampanyaDisKimligi('meta', '120001')).toBe('120001');
  });
});

describe('yapay zekâ metni — sayı yasağı', () => {
  const girdi: StratejiAiGirdisi = {
    marka: { ad: 'Ege 2 Yapı', sektor: 'İnşaat', urunler: ['2+1 daire'], vaatler: ['%10 indirim'], hedefKitle: null, bilgi: null, uslup: null },
    site: { adres: 'https://ege35.com', tarama: null },
    kalemler: [{ amac: 'SITE' }, { amac: 'ERISIM' }],
    gecmisAmaclari: ['SITE'],
  };
  const cevap = (o: Record<string, unknown>) => ({ parcalar: [{ text: JSON.stringify(o) }], sebep: 'bitti', girdiToken: 1, ciktiToken: 1, onbellekToken: 0 });
  const temiz = { ozet: 'Siteye ziyaret.', isletme: 'Konut satıyor.', kitle: 'Ev arayan aileler.', kreatif: 'Işık ve deniz.', kalemler: [{ kreatifYonergesi: 'Salon.', kitleTarifi: 'Aileler.' }, { kreatifYonergesi: 'Cephe.', kitleTarifi: 'Bölge.' }] };

  it('KRİTİK: istem rakam TAŞIMAZ (marka alanındaki rakamlar bile modele gitmez)', () => {
    const istem = stratejiAiIstemi(girdi);
    expect(istem).toContain('İnşaat');
    expect(/[\p{Nd}%]/u.test(istem)).toBe(false);
  });

  it('KRİTİK: rakamlı alan reddedilir, BİR KEZ yeniden istenir; yine rakamlıysa alan boş + neden', async () => {
    const uret = vi.fn().mockResolvedValueOnce(cevap({ ...temiz, ozet: 'Yüzde otuz artış.' })).mockResolvedValueOnce(cevap({ ...temiz, ozet: 'İki kat büyüme.' }));
    const r = await stratejiMetinleri({ uret, model: 'x' } as unknown as MetinUretici, girdi);
    expect(uret).toHaveBeenCalledTimes(2);
    expect(r.bolumler.ozet).toMatchObject({ metin: null, neden: 'sayi_var' });
    expect(r.bolumler.isletme).toEqual({ metin: 'Konut satıyor.', kaynak: 'ai' });
    for (const b of Object.values(r.bolumler)) if (b.metin) expect(sayiTasiyor(b.metin)).toBe(false);
  });

  it('ikinci istek temizse alan dolar; yapay zekâ yoksa hepsi NEDENİYLE boş', async () => {
    const uret = vi.fn().mockResolvedValueOnce(cevap({ ...temiz, kitle: 'Kişilerin %40ı' })).mockResolvedValueOnce(cevap(temiz));
    const r = await stratejiMetinleri({ uret, model: 'x' } as unknown as MetinUretici, girdi);
    expect(r.bolumler.kitle).toEqual({ metin: 'Ev arayan aileler.', kaynak: 'ai' });
    const yok = await stratejiMetinleri(null, girdi);
    expect(yok.bolumler.ozet).toMatchObject({ metin: null, neden: 'yapay_zeka_yok' });
    expect(yok.kalemMetinleri).toHaveLength(2);
  });
});

describe('controller ↔ STRATEJI_V2_UCLARI (kaynak taraması)', () => {
  const KAYNAK = yorumsuz(readFileSync(join(__dirname, 'strateji-v2.controller.ts'), 'utf8'));

  function uclar(): Array<{ anahtar: string; izin: string | null }> {
    const out: Array<{ anahtar: string; izin: string | null }> = [];
    const siniflar = [...KAYNAK.matchAll(/@Controller\('([^']+)'\)/g)].map((m) => ({ onek: m[1]!, yer: m.index! }));
    expect(siniflar.length, '@Controller bulunamadı — tarama boşa düşerdi').toBe(2);
    const desen = /@(Get|Post|Put|Patch|Delete)\('([^']*)'\)\s*(?:@RequirePermissions\('([^']+)'\)|@Public\(\))/g;
    for (const m of KAYNAK.matchAll(desen)) {
      const onek = [...siniflar].reverse().find((s) => s.yer < m.index!)!.onek;
      out.push({ anahtar: `${m[1]!.toUpperCase()} /${onek}/${m[2]}`, izin: m[3] ?? null });
    }
    return out;
  }

  it('KRİTİK: her uç listede ve izin AYNI; oturumsuz uç yalnız iki onay ucu', () => {
    const c = uclar().sort((a, b) => a.anahtar.localeCompare(b.anahtar));
    const l = STRATEJI_V2_UCLARI.map((u) => ({ anahtar: `${u.yontem} ${u.yol}`, izin: u.izin })).sort((a, b) => a.anahtar.localeCompare(b.anahtar));
    expect(c).toEqual(l);
    expect(c.filter((x) => x.izin === null).map((x) => x.anahtar).sort()).toEqual(['GET /strateji/v2/onay/:token', 'POST /strateji/v2/onay/:token/karar']);
  });

  it('ölü yol bekçisi: v2 kaynağında adv_oturum geçmez', () => {
    for (const d of ['strateji-v2.service.ts', 'motor.ts', 'onay-baglantisi.service.ts']) {
      const k = yorumsuz(readFileSync(join(__dirname, d), 'utf8'));
      expect(k.length, d).toBeGreaterThan(1000);
      expect(k, d).not.toMatch(/adv_oturum/);
    }
  });
});
