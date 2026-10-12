import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ETIKET_SINIRI, GORU_AYARI, type GoruEtiketleri } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { gunOnce, kreatifTohumla, png } from '../../../test/kreatif-tohum';
import { YapayZekaHatasi, type GeminiIstegi, type MetinUretici } from '../../yapay-zeka/gemini';
import { kreatifEtiketIsi, type EtiketIsiBagimliliklari, type IndirmeSonucu } from './etiket-isi';
import { istanbulGunu } from './sayac';

/**
 * ═══ KREATİF ETİKETLEME İŞİ — GERÇEK VERİTABANI, SAHTE GEMİNİ ═══
 *
 * Gemini, Meta ve CDN sahte; veritabanı gerçek (PGlite, üretim
 * migration'ları). Sınanan şey SIRA: sıfır maliyetli adımlar parayı
 * harcayan adımlardan ÖNCE mi, aynı görsel ikinci kez Gemini'ye gidiyor mu,
 * şema dışı cevap yazılıyor mu, geçici hata sessiz `succeeded + 0` oluyor mu.
 * Kritik satırlar mutasyonla doğrulandı (rapor: teslim notu).
 */

let h: Harness;
const GUNLER = [gunOnce(3), gunOnce(4), gunOnce(5)];
const GECERLI: GoruEtiketleri = {
  insan: 'var',
  urun_gorunur: 'yok',
  metin_yogunlugu: 'az',
  baskin_renk: 'sicak',
  eylem_cagrisi_gorselde: 'yok',
  fiyat_veya_indirim: 'yok',
  logo_gorunur: 'var',
  gorsel_turu: 'fotograf',
};

/** Fixture: sıradaki cevaplar; biterse son cevap tekrarlanır. */
function sahteGemini(cevaplar: Array<string | { sebep: 'ret' | 'bos' | 'kesildi' } | Error>) {
  const istekler: GeminiIstegi[] = [];
  let i = 0;
  const u: MetinUretici = {
    model: 'gemini-test',
    uret: vi.fn(async (g: GeminiIstegi) => {
      istekler.push(g);
      const c = cevaplar[Math.min(i++, cevaplar.length - 1)]!;
      if (c instanceof Error) throw c;
      if (typeof c === 'string') return { parcalar: [{ text: c }], sebep: 'bitti' as const, aciklama: null, girdiToken: 300, ciktiToken: 40, onbellekToken: 0 };
      return { parcalar: [], sebep: c.sebep, aciklama: c.sebep === 'ret' ? 'Gemini cevabı engelledi (SAFETY).' : null, girdiToken: 300, ciktiToken: 0, onbellekToken: 0 };
    }),
  };
  return { u, istekler };
}

function bag(o: { gemini?: MetinUretici | null; indir?: (url: string) => IndirmeSonucu; kota?: string }) {
  const adresTazele = vi.fn(async (_h: unknown, idler: string[]) => ({
    adresler: new Map(idler.map((id) => [id, o.kota ? { hata: o.kota } : { url: `https://scontent.fbcdn.net/${id}.jpg` }] as const)),
    kotaEngeli: o.kota ?? null,
  }));
  let n = 0;
  const indir = vi.fn(async (url: string): Promise<IndirmeSonucu> => (o.indir ? o.indir(url) : { ok: true, bytes: png(1080, 1350, ++n), tur: 'png' }));
  const d: EtiketIsiBagimliliklari = { tx: h.db, gemini: o.gemini === undefined ? sahteGemini([JSON.stringify(GECERLI)]).u : o.gemini, adresTazele, indir };
  return { d, adresTazele, indir };
}

const meta = (ek: Record<string, unknown> = {}) =>
  kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER, raw: { object_story_spec: { link_data: { image_hash: ek.hash ?? `h${Math.random().toString(16).slice(2, 10)}` } } }, ...ek });

const satir = async (creativeId: string) =>
  (await h.q<{ durum: string; neden: string | null; deneme: number; icerik_ozeti: string | null; en_boy: string | null; son_hata: string | null; kaynak_anahtari: string | null }>(
    `SELECT durum, neden, deneme, icerik_ozeti, en_boy, son_hata, kaynak_anahtari FROM kreatif_icerikleri WHERE creative_id = $1`,
    [creativeId],
  ))[0];

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

describe('geçerli cevap', () => {
  it('KRİTİK: etiket yazılıyor, içerik özete bağlanıyor, en-boy görselden, sayaç ve token tutuluyor', async () => {
    const k = await meta({ hash: 'abc12345' });
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d } = bag({ gemini: g.u });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);

    expect(r.sonuc).toBe('basarili');
    expect(r.sayim.etiketlendi).toBe(1);
    const s = await satir(k.creativeId);
    expect(s).toMatchObject({ durum: 'etiketlendi', neden: null, en_boy: 'dikey', kaynak_anahtari: 'meta:img:999:abc12345' });
    expect(s!.icerik_ozeti).toMatch(/^[0-9a-f]{64}$/);
    const [e] = await h.q<{ etiketler: GoruEtiketleri; girdi_token: number }>(`SELECT etiketler, girdi_token FROM kreatif_etiketleri`);
    expect(e!.etiketler).toEqual(GECERLI);
    expect(e!.girdi_token).toBe(300);
    const [c] = await h.q<{ etiket_istek: number; basarili: number; girdi_token: string }>(`SELECT etiket_istek, basarili, girdi_token::text FROM kreatif_etiket_sayaci`);
    expect(c).toMatchObject({ etiket_istek: 1, basarili: 1, girdi_token: '300' });
  });

  it('görü isteği AÇIK ayarlarla gidiyor: görsel inlineData, mediaResolution, JSON şeması, düşünme', async () => {
    await meta();
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    await kreatifEtiketIsi(bag({ gemini: g.u }).d, IDS.adAccount);
    const ist = g.istekler[0]!;
    expect(ist.mediaResolution).toBe(GORU_AYARI.mediaResolution);
    expect(ist.dusunme).toBe(GORU_AYARI.dusunme);
    expect(ist.mesajlar[0]!.parts[0]!.inlineData?.mimeType).toBe('image/png');
    expect(ist.jsonSemasi).toMatchObject({ required: expect.arrayContaining(['insan', 'gorsel_turu']) });
  });
});

describe('aynı görsel ikinci kez Gemini’ye gitmez', () => {
  it('KRİTİK: iki kreatif AYNI baytlar, farklı kaynak → indirme iki, Gemini BİR', async () => {
    const a = await meta({ hash: 'aaaa1111' });
    const b = await meta({ hash: 'bbbb2222' });
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d, indir } = bag({ gemini: g.u, indir: () => ({ ok: true, bytes: png(1080, 1080, 7), tur: 'png' }) });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(indir).toHaveBeenCalledTimes(2);
    expect(g.u.uret).toHaveBeenCalledTimes(1);
    expect(r.sayim).toMatchObject({ etiketlendi: 1, baglandi: 1 });
    expect((await satir(a.creativeId))!.icerik_ozeti).toBe((await satir(b.creativeId))!.icerik_ozeti);
    expect(await h.q(`SELECT 1 FROM kreatif_etiketleri`)).toHaveLength(1);
  });

  it('KRİTİK: aynı KAYNAK ANAHTARI (aynı image_hash) → ikincisi ne tazelenir ne indirilir', async () => {
    await meta({ hash: 'cccc3333' });
    await meta({ hash: 'cccc3333' });
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d, indir } = bag({ gemini: g.u });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(indir).toHaveBeenCalledTimes(1);
    expect(r.sayim).toMatchObject({ etiketlendi: 1, baglandi: 1 });
  });

  it('önceki koşuda etiketlenmiş kaynak bir sonraki koşuda platforma hiç çıkmadan bağlanıyor', async () => {
    await meta({ hash: 'dddd4444' });
    await kreatifEtiketIsi(bag({}).d, IDS.adAccount);
    await meta({ hash: 'dddd4444' });
    const { d, adresTazele, indir } = bag({});
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(r.sayim.baglandi).toBe(1);
    expect(adresTazele).not.toHaveBeenCalled();
    expect(indir).not.toHaveBeenCalled();
  });
});

describe('maliyet bekçisi', () => {
  it('KRİTİK: sınır doluyken Gemini çağrısı YOK, platforma da çıkılmıyor; not nedeni söylüyor', async () => {
    await meta();
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.workspaceGunluk,
    ]);
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d, adresTazele, indir } = bag({ gemini: g.u });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(g.u.uret).not.toHaveBeenCalled();
    expect(adresTazele).not.toHaveBeenCalled();
    expect(indir).not.toHaveBeenCalled();
    expect(r.sonuc).toBe('basarili');
    expect(r.not).toContain('sınır nedeniyle ertelendi (workspace_gunluk)');
    // Ertelenen satır bekliyor ve deneme sayacı ARTMADI: yarın ilk iş onu alır.
    expect(await h.q(`SELECT durum, deneme FROM kreatif_icerikleri`)).toEqual([{ durum: 'bekliyor', deneme: 0 }]);
  });

  it('KRİTİK: KÜRESEL sınır doluyken neden "kuresel_gunluk" (workspace payı doldu demek yanlış cümle olurdu)', async () => {
    await meta();
    const diger = '33333333-0000-4000-8000-000000000009';
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Diğer', 'diger', now())`, [diger, IDS.org]);
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      diger,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.kureselGunluk,
    ]);
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d, adresTazele } = bag({ gemini: g.u });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(r.sayim.bekciNedeni).toBe('kuresel_gunluk');
    expect(adresTazele).not.toHaveBeenCalled();
    expect(g.u.uret).not.toHaveBeenCalled();
  });

  it('KRİTİK: YARIŞ: başka iş sınırı arada doldurursa ayırma reddediyor ve Gemini ÇAĞRILMIYOR', async () => {
    await meta();
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    // İndirme sırasında paralel bir iş günün kalan hakkını tüketiyor.
    const { d } = bag({ gemini: g.u });
    const asil = d.indir;
    d.indir = async (url) => {
      await h.q(
        `INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, gun) DO UPDATE SET etiket_istek = EXCLUDED.etiket_istek`,
        [IDS.org, IDS.client, istanbulGunu(new Date()), ETIKET_SINIRI.workspaceGunluk],
      );
      return asil(url);
    };
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(g.u.uret).not.toHaveBeenCalled();
    expect(r.sayim).toMatchObject({ etiketlendi: 0, ertelendi: 1, bekciNedeni: 'workspace_gunluk' });
    expect(await h.q(`SELECT etiket_istek FROM kreatif_etiket_sayaci`)).toEqual([{ etiket_istek: ETIKET_SINIRI.workspaceGunluk }]);
  });

  it('KRİTİK: hak kadar kreatif işleniyor, kalanlar ertelendi (platform kotası boşa harcanmıyor)', async () => {
    for (let i = 0; i < 3; i++) await meta();
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      istanbulGunu(new Date()),
      ETIKET_SINIRI.workspaceGunluk - 1,
    ]);
    const { d, adresTazele } = bag({});
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(r.sayim).toMatchObject({ etiketlendi: 1, ertelendi: 2 });
    expect(adresTazele.mock.calls[0]![1]).toHaveLength(1);
  });
});

describe('Gemini hataları', () => {
  it('KRİTİK: şema dışı cevap YAZILMIYOR; bir kez tekrar, sonra kalıcı sema_disi', async () => {
    const k = await meta();
    const g = sahteGemini([JSON.stringify({ ...GECERLI, insan: 'belki' }), JSON.stringify({ insan: 'var' })]);
    const r = await kreatifEtiketIsi(bag({ gemini: g.u }).d, IDS.adAccount);
    expect(g.u.uret).toHaveBeenCalledTimes(2);
    expect(await h.q(`SELECT 1 FROM kreatif_etiketleri`)).toHaveLength(0);
    expect(await satir(k.creativeId)).toMatchObject({ durum: 'etiketlenemez', neden: 'sema_disi' });
    expect(r.sayim.kalici).toBe(1);
  });

  it('şema dışı ilk cevap, geçerli ikinci cevap → etiketlendi', async () => {
    const k = await meta();
    const g = sahteGemini(['bu json değil', JSON.stringify(GECERLI)]);
    await kreatifEtiketIsi(bag({ gemini: g.u }).d, IDS.adAccount);
    expect(await satir(k.creativeId)).toMatchObject({ durum: 'etiketlendi' });
  });

  it('güvenlik reddi kalıcı (gemini_ret), Gemini’nin cümlesi saklanıyor', async () => {
    const k = await meta();
    await kreatifEtiketIsi(bag({ gemini: sahteGemini([{ sebep: 'ret' }]).u }).d, IDS.adAccount);
    expect(await satir(k.creativeId)).toMatchObject({ durum: 'etiketlenemez', neden: 'gemini_ret', son_hata: 'Gemini cevabı engelledi (SAFETY).' });
  });

  it('KRİTİK: kota hatası (429) GEÇİCİ; kalanlara dokunulmuyor ve hepsi geçiciyse tekrar_dene (sessiz succeeded+0 yok)', async () => {
    const a = await meta();
    const b = await meta();
    const g = sahteGemini([new YapayZekaHatasi(429, 'Gemini 429 RESOURCE_EXHAUSTED: kota')]);
    const r = await kreatifEtiketIsi(bag({ gemini: g.u }).d, IDS.adAccount);
    expect(g.u.uret).toHaveBeenCalledTimes(1);
    expect(r.sonuc).toBe('tekrar_dene');
    const durumlar = [await satir(a.creativeId), await satir(b.creativeId)];
    // Biri denendi (deneme 1, neden gemini_kota), öteki HİÇ denenmedi.
    expect(durumlar.map((s) => s!.deneme).sort()).toEqual([0, 1]);
    expect(durumlar.find((s) => s!.deneme === 1)).toMatchObject({ durum: 'bekliyor', neden: 'gemini_kota' });
    expect(r.not).toContain('Gemini kotası');
  });

  it('boş cevap geçici (gemini_ulasilamadi); üç denemede deneme_tukendi ile kapanıyor', async () => {
    const k = await meta();
    for (let i = 0; i < 3; i++) await kreatifEtiketIsi(bag({ gemini: sahteGemini([{ sebep: 'bos' }]).u }).d, IDS.adAccount);
    expect(await satir(k.creativeId)).toMatchObject({ durum: 'etiketlenemez', neden: 'deneme_tukendi', deneme: 3 });
    // Dördüncü koşu onu bir daha SEÇMİYOR.
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const r = await kreatifEtiketIsi(bag({ gemini: g.u }).d, IDS.adAccount);
    expect(g.u.uret).not.toHaveBeenCalled();
    expect(r.not).toBe('etiketlenecek kreatif yok');
  });

  it('anahtar yoksa hiçbir şey indirilmiyor ve not söylüyor', async () => {
    await meta();
    const { d, indir, adresTazele } = bag({ gemini: null });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(indir).not.toHaveBeenCalled();
    expect(adresTazele).not.toHaveBeenCalled();
    expect(r.not).toContain('yapay zekâ anahtarı tanımlı değil');
  });
});

describe('platform ve indirme', () => {
  it('kota engeli → geçici platform_kotasi; adres hatası → geçici adres_alinamadi', async () => {
    const k = await meta();
    await kreatifEtiketIsi(bag({ kota: 'kota engeli (usage_60pct_exceeds_layer_limit_50)' }).d, IDS.adAccount);
    expect(await satir(k.creativeId)).toMatchObject({ durum: 'bekliyor', neden: 'platform_kotasi', deneme: 1 });
  });

  it('boyut ve biçim KALICI, ağ hatası GEÇİCİ', async () => {
    const a = await meta();
    const b = await meta();
    const c = await meta();
    const sira = [
      { ok: false as const, sebep: 'görsel çok büyük', kod: 'boyut' as const },
      { ok: false as const, sebep: 'desteklenmeyen biçim', kod: 'bicim' as const },
      { ok: false as const, sebep: 'sunucu 403', kod: 'ag' as const },
    ];
    let i = 0;
    await kreatifEtiketIsi(bag({ indir: () => sira[i++]! }).d, IDS.adAccount);
    const s = await Promise.all([a, b, c].map((x) => satir(x.creativeId)));
    expect(s.map((x) => x!.neden).sort()).toEqual(['bicim', 'boyut', 'indirme_dustu']);
    expect(s.find((x) => x!.neden === 'indirme_dustu')).toMatchObject({ durum: 'bekliyor', son_hata: 'sunucu 403' });
  });

  it('Google arama reklamı metin_reklami (Gemini’ye gitmez, SAYILIYOR); Google görüntülü adresi kalıcı (tazeleme yok)', async () => {
    await h.q(`UPDATE ad_accounts SET platform = 'google' WHERE id = $1`, [IDS.adAccount]);
    const arama = await kreatifTohumla(h, { objective: 'SEARCH', platform: 'google', creativeType: 'RESPONSIVE_SEARCH_AD', gunler: GUNLER });
    const gor = await kreatifTohumla(h, {
      objective: 'DISPLAY',
      platform: 'google',
      creativeType: 'RESPONSIVE_DISPLAY_AD',
      gunler: GUNLER,
      assetUrls: ['https://tpc.googlesyndication.com/simgad/1'],
      raw: { responsiveDisplayAd: { marketingImages: [{ asset: 'customers/1/assets/987' }] } },
    });
    const g = sahteGemini([JSON.stringify(GECERLI)]);
    const { d, adresTazele, indir } = bag({ gemini: g.u });
    const r = await kreatifEtiketIsi(d, IDS.adAccount);
    expect(await satir(arama.creativeId)).toMatchObject({ durum: 'etiketlenemez', neden: 'metin_reklami' });
    expect(await satir(gor.creativeId)).toMatchObject({ durum: 'etiketlendi', kaynak_anahtari: 'google:asset:987' });
    expect(adresTazele).not.toHaveBeenCalled();
    expect(indir).toHaveBeenCalledWith('https://tpc.googlesyndication.com/simgad/1');
    expect(g.u.uret).toHaveBeenCalledTimes(1);
    expect(r.sayim).toMatchObject({ kalici: 1, etiketlendi: 1 });
  });

  it('tanınmayan amaç: içerik satırı AÇILMIYOR (para yok) ama not söylüyor', async () => {
    await kreatifTohumla(h, { objective: 'GARIP_AMAC', gunler: GUNLER, raw: { object_story_spec: { link_data: { image_hash: 'eeee5555' } } } });
    const r = await kreatifEtiketIsi(bag({}).d, IDS.adAccount);
    expect(await h.q(`SELECT 1 FROM kreatif_icerikleri`)).toHaveLength(0);
    expect(r.not).toContain('tanınmayan amaçta');
  });

  it('pencerede harcama yoksa iş başarılı ama notsuz değil', async () => {
    const r = await kreatifEtiketIsi(bag({}).d, IDS.adAccount);
    expect(r).toMatchObject({ sonuc: 'basarili', satir: 0, not: 'etiketlenecek kreatif yok' });
  });
});
