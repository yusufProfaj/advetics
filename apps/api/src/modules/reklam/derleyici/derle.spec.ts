import { describe, expect, it } from 'vitest';
import { MANIFESTO, TANINAN_OZELLIK_ANAHTARLARI, derleMeta, type DerlemeGirdisi, type MetaGovdesi } from '@advetics/shared';

const TL = (n: number) => BigInt(n) * 1_000_000n;
const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-07',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: {
    konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }],
    enDusukYas: 18,
    ipucuYas: null,
    ipucuCinsiyet: null,
  },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [
    { gorselHash: 'h1', baslik: 'B1', metin: 'M1' },
    { gorselHash: 'h2', baslik: 'B2', metin: 'M2' },
  ],
  hedefAdres: 'https://ornek.com.tr/kampanya',
  formId: null,
  urlEtiketleri: 'utm_source=meta',
};

function govde(g: Partial<DerlemeGirdisi> = {}) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r;
}
const bul = (gs: MetaGovdesi[], ad: string) => gs.find((x) => x.ad === ad)!.alanlar as Record<string, any>;
const retler = (g: Partial<DerlemeGirdisi>) => {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};

describe('derleMeta — yapı', () => {
  it('1 kampanya + 1 reklam seti + kavram başına kreatif ve reklam, zincir sırasıyla', () => {
    expect(govde().govdeler.map((x) => x.ad)).toEqual([
      'kampanya', 'reklam_seti', 'kreatif:1', 'reklam:1', 'kreatif:2', 'reklam:2',
    ]);
  });

  it('KRİTİK M-01: her nesne PAUSED ve "açılmadı" önekiyle', () => {
    for (const g of govde().govdeler) {
      if (g.nesne !== 'kreatif') expect(g.alanlar.status, g.ad).toBe('PAUSED');
      expect(String(g.alanlar.name)).toMatch(/^\[Advetics: açılmadı\] /);
    }
  });

  it('KRİTİK: bütçe KURUŞ olarak kampanyada; paylaşım alanı yok', () => {
    const k = bul(govde().govdeler, 'kampanya');
    expect(k.daily_budget).toBe('50000');
    expect(k).not.toHaveProperty('is_adset_budget_sharing_enabled');
    expect(bul(govde().govdeler, 'reklam_seti')).not.toHaveProperty('daily_budget');
  });

  it('aynı girdi iki kez derlenince AYNI çıktı (determinizm)', () => {
    expect(JSON.stringify(govde().govdeler)).toBe(JSON.stringify(govde().govdeler));
  });

  it('CTA ikinci kavramda da var (eski kodun 2.+ reklam hatası)', () => {
    const gs = govde().govdeler;
    expect(bul(gs, 'kreatif:2').object_story_spec.link_data.call_to_action).toEqual({
      type: 'LEARN_MORE', value: { link: 'https://ornek.com.tr/kampanya' },
    });
    expect(bul(gs, 'reklam:2').creative).toEqual({ creative_id: '{kreatif:2}' });
  });

  it('FORM: form kimliği YALNIZ CTA değerinde, promoted_object’te değil', () => {
    const gs = govde({ niyet: 'FORM', formId: '{form}', hedefAdres: null }).govdeler;
    expect(bul(gs, 'kreatif:1').object_story_spec.link_data.call_to_action).toEqual({
      type: 'SIGN_UP', value: { lead_gen_form_id: '{form}' },
    });
    expect(bul(gs, 'reklam_seti').promoted_object).toEqual({ page_id: '111' });
    expect(bul(gs, 'reklam_seti').destination_type).toBe('ON_AD');
  });

  it('KRİTİK: kreatif özellik anahtarları CANLIDA ÖLÇÜLEN küme (2026-10-07, v25.0) — belgeden anahtar eklenmez', () => {
    expect([...TANINAN_OZELLIK_ANAHTARLARI]).toEqual([
      'IG_VIDEO_NATIVE_SUBTITLE', 'IMAGE_ANIMATION', 'PRODUCT_BROWSING', 'PRODUCT_METADATA_AUTOMATION',
      'PROFILE_CARD', 'STANDARD_ENHANCEMENTS_CATALOG', 'TEXT_OVERLAY_TRANSLATION',
    ]);
  });

  it('her tanınan Advantage+ creative anahtarı OPT_OUT; yan yana reklam OPT_OUT', () => {
    const k = bul(govde().govdeler, 'kreatif:1');
    for (const a of TANINAN_OZELLIK_ANAHTARLARI) {
      expect(k.degrees_of_freedom_spec.creative_features_spec[a], a).toEqual({ enroll_status: 'OPT_OUT' });
    }
    expect(k.contextual_multi_ads).toEqual({ enroll_status: 'OPT_OUT' });
  });
});

describe('manifesto', () => {
  const dallar: Array<[string, Partial<DerlemeGirdisi>]> = [
    ['SITE', {}],
    ['FORM', { niyet: 'FORM', formId: '{form}', hedefAdres: null }],
    ['konut', { kategoriler: { taban: ['HOUSING'], ek: [] } }],
    ['toplam bütçe', { butce: { tip: 'toplam', micros: TL(5000), seviye: 'kampanya' }, takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: '2026-10-20T23:59:00+0300' } }],
    ['v26', { apiSurumu: 'v26.0' }],
  ];
  for (const [ad, g] of dallar) {
    it(`${ad}: her manifesto satırı açıkça yazılı`, () => {
      const r = govde(g);
      const kategori = (g.kategoriler?.taban.length ?? 0) > 0;
      for (const s of MANIFESTO) {
        if (s.kosul === 'kategori' && !kategori) continue;
        for (const gv of r.govdeler.filter((x) => x.nesne === s.nesne)) {
          expect(r.acikcaYazilanAlanlar, `${s.kod} ${gv.ad}`).toContain(`${s.nesne}:${s.yol}`);
        }
      }
    });
  }

  it('KRİTİK M-04: konutta ülke kümesi kampanyada, vergi ülkesine bırakılmıyor', () => {
    const k = bul(govde({ kategoriler: { taban: ['HOUSING'], ek: [] } }).govdeler, 'kampanya');
    expect(k.special_ad_categories).toEqual(['HOUSING']);
    expect(k.special_ad_category_country).toEqual(['TR']);
  });

  it('KRİTİK: yerleşim alanı HİÇ yazılmıyor (Advantage+ yerleşim), age_max yok', () => {
    const t = bul(govde().govdeler, 'reklam_seti').targeting;
    for (const y of ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'age_max']) {
      expect(t, y).not.toHaveProperty(y);
    }
  });

  it('atıf spec ajans standardından', () => {
    expect(bul(govde({ atif: 'tik7' }).govdeler, 'reklam_seti').attribution_spec).toEqual([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
    ]);
  });
});

describe('sıfır çağrılı retler', () => {
  it('atıf standardı seçilmeden yayın yok (OK-16)', () => {
    expect(retler({ atif: null })).toEqual(['OK-16']);
  });
  it('konum boşsa ret, gövde yok', () => {
    expect(retler({ hedefleme: { ...temel.hedefleme, konumlar: [] } })).toEqual(['KNM-01']);
  });
  it('ölçülmemiş niyet tahminle derlenmez; yönlendirme niyeti hiç derlenmez', () => {
    expect(retler({ niyet: 'WHATSAPP' })).toEqual(['NYT-OLCULMEDI']);
    expect(retler({ niyet: 'ONE_CIKAR' })).toEqual(['NYT-YONLENDIRME']);
  });
  it('site adresi https değilse, toplam bütçede bitiş yoksa, fikir sayısı yanlışsa', () => {
    expect(retler({ hedefAdres: 'http://ornek.com' })).toEqual(['SITE-ADRES']);
    expect(retler({ butce: { tip: 'toplam', micros: TL(5000), seviye: 'kampanya' } })).toEqual(['BTC-02']);
    expect(retler({ kavramlar: [] })).toEqual(['KRT-SAYI']);
  });
  it('kuruşu tam olmayan bütçe kırpılmaz, reddedilir', () => {
    expect(retler({ butce: { tip: 'gunluk', micros: 500_001n, seviye: 'kampanya' } })).toEqual(['BTC-01']);
  });
});
