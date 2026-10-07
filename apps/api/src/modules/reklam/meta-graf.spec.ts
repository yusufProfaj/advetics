import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { MetaBelirsizHata, MetaKesinHata, type TxRunner } from './yayin-motoru';
import { MetaGrafIstemcisi, formGovdesi, hataSiniflandir, metaSurumuDogrula, type GrafAyarlari } from './meta-graf';
import { gorselOkuyucu, gorselOnbellegi, hesapErisimi, sayfaTokenOkuyucu } from './meta-erisim';

type Cagri = { yontem: string; adres: string; govde: string | null; token: string };

function sahteFetch(cevap: (c: Cagri) => { durum: number; govde: unknown } | 'ag') {
  const cagrilar: Cagri[] = [];
  const fn = (async (adres: string, init: RequestInit) => {
    const c: Cagri = {
      yontem: String(init.method),
      adres,
      govde: init.body ? String(init.body) : null,
      token: String((init.headers as Record<string, string>).Authorization),
    };
    cagrilar.push(c);
    const r = cevap(c);
    if (r === 'ag') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.govde), { status: r.durum });
  }) as unknown as typeof fetch;
  return { fn, cagrilar };
}

const ayar = (fetchFn: typeof fetch, o: Partial<GrafAyarlari> = {}): GrafAyarlari => ({
  apiSurumu: 'v25.0',
  hesap: 'act_1',
  kullaniciToken: 'KULLANICI',
  sayfaTokeni: async () => 'SAYFA',
  gorselOnbellek: { oku: async () => null, yaz: async () => undefined },
  gorselBaytlari: async () => Buffer.from('png'),
  fetchFn,
  ...o,
});

describe('hata sınıflandırma — şüphede BELİRSİZ', () => {
  it('ağ, 5xx, kod 1/2, is_transient ve gövdesiz 4xx belirsiz', () => {
    expect(hataSiniflandir(null, null)).toBeInstanceOf(MetaBelirsizHata);
    expect(hataSiniflandir(500, { error: { code: 100 } })).toBeInstanceOf(MetaBelirsizHata);
    expect(hataSiniflandir(400, { error: { code: 1, message: 'unknown' } })).toBeInstanceOf(MetaBelirsizHata);
    expect(hataSiniflandir(400, { error: { code: 2 } })).toBeInstanceOf(MetaBelirsizHata);
    expect(hataSiniflandir(400, { error: { code: 100, is_transient: true } })).toBeInstanceOf(MetaBelirsizHata);
    expect(hataSiniflandir(400, 'html')).toBeInstanceOf(MetaBelirsizHata);
  });

  it('doğrulama hatası kesin; kullanıcı mesajı ve kodlar taşınıyor', () => {
    const h = hataSiniflandir(400, { error: { code: 100, error_subcode: 1815946, message: 'x', error_user_msg: 'Geçersiz yarıçap', fbtrace_id: 'T' } });
    expect(h).toBeInstanceOf(MetaKesinHata);
    expect(h).toMatchObject({ message: 'Geçersiz yarıçap', kod: 100, altKod: 1815946, fbtrace: 'T' });
  });
});

describe('Graph istemcisi', () => {
  it('desteklenmeyen sürümle KURULMAZ', () => {
    expect(() => metaSurumuDogrula('v24.0')).toThrow(/desteklenmiyor/);
    expect(() => new MetaGrafIstemcisi(ayar(fetch, { apiSurumu: 'v23.0' }))).toThrow();
  });

  it('nesne ve dizi değerleri JSON dizgesi, düz değerler olduğu gibi', () => {
    expect(formGovdesi({ status: 'PAUSED', targeting: { age_min: 18 }, adlabels: [{ name: 'a' }] }).toString()).toBe(
      'status=PAUSED&targeting=%7B%22age_min%22%3A18%7D&adlabels=%5B%7B%22name%22%3A%22a%22%7D%5D',
    );
  });

  it('KRİTİK: oluşturma POST’unda fields YOK; kampanya hesabın ucunda, kullanıcı token’ıyla', async () => {
    const f = sahteFetch(() => ({ durum: 200, govde: { id: '42' } }));
    const g = new MetaGrafIstemcisi(ayar(f.fn));
    expect(await g.olustur('act_1', 'campaigns', { name: 'K', status: 'PAUSED' })).toEqual({ id: '42' });
    expect(f.cagrilar[0]).toMatchObject({ yontem: 'POST', adres: 'https://graph.facebook.com/v25.0/act_1/campaigns', token: 'Bearer KULLANICI' });
    expect(f.cagrilar[0]!.adres).not.toContain('fields');
    await expect(g.olustur('act_1', 'campaigns', { fields: 'id' })).rejects.toThrow(/fields/);
  });

  it('form SAYFA token’ıyla kuruluyor, okunuyor ve arşivleniyor', async () => {
    const f = sahteFetch((c) => ({ durum: 200, govde: c.yontem === 'GET' ? { locale: 'TR_TR' } : c.adres.endsWith('leadgen_forms') ? { id: '77' } : { success: true } }));
    const g = new MetaGrafIstemcisi(ayar(f.fn));
    await g.olustur('act_1', '111/leadgen_forms', { name: 'F' });
    await g.oku('77', ['locale']);
    await g.durumYaz('77', { status: 'ARCHIVED' });
    expect(f.cagrilar.map((c) => c.token)).toEqual(['Bearer SAYFA', 'Bearer SAYFA', 'Bearer SAYFA']);
    expect(f.cagrilar[0]!.adres).toBe('https://graph.facebook.com/v25.0/111/leadgen_forms');
  });

  it('ağ hatası ve 5xx BELİRSİZ, 400 doğrulama KESİN olarak motora gidiyor', async () => {
    await expect(new MetaGrafIstemcisi(ayar(sahteFetch(() => 'ag').fn)).olustur('act_1', 'campaigns', {})).rejects.toBeInstanceOf(MetaBelirsizHata);
    await expect(new MetaGrafIstemcisi(ayar(sahteFetch(() => ({ durum: 503, govde: {} })).fn)).olustur('act_1', 'campaigns', {})).rejects.toBeInstanceOf(MetaBelirsizHata);
    await expect(
      new MetaGrafIstemcisi(ayar(sahteFetch(() => ({ durum: 400, govde: { error: { code: 100, message: 'x' } } })).fn)).olustur('act_1', 'campaigns', {}),
    ).rejects.toBeInstanceOf(MetaKesinHata);
  });

  it('200 ama kimliksiz cevap belirsiz (oluşmuş olabilir)', async () => {
    const g = new MetaGrafIstemcisi(ayar(sahteFetch(() => ({ durum: 200, govde: {} })).fn));
    await expect(g.olustur('act_1', 'campaigns', {})).rejects.toBeInstanceOf(MetaBelirsizHata);
  });

  it('başka bir hesap için kurulmuş istemci reddeder', async () => {
    const g = new MetaGrafIstemcisi(ayar(sahteFetch(() => ({ durum: 200, govde: { id: '1' } })).fn));
    await expect(g.olustur('act_2', 'campaigns', {})).rejects.toThrow(/act_1/);
  });

  it('etiket araması: ad → etiket kimliği → bylabels; etiket yoksa boş', async () => {
    const f = sahteFetch((c) =>
      c.adres.includes('/adlabels')
        ? { durum: 200, govde: { data: [{ id: '9', name: 'adv-yayin-x' }] } }
        : { durum: 200, govde: { data: [{ id: '5', name: 'K' }] } },
    );
    const g = new MetaGrafIstemcisi(ayar(f.fn));
    expect(await g.etiketleAra('act_1', 'campaigns', 'adv-yayin-x')).toEqual([{ id: '5', name: 'K' }]);
    expect(decodeURIComponent(f.cagrilar[1]!.adres)).toContain('campaignsbylabels?ad_label_ids=["9"]');
    expect(await g.etiketleAra('act_1', 'campaigns', 'yok')).toEqual([]);
  });

  it('KRİTİK: sayfalamada token Meta dışına TAŞINMAZ', async () => {
    const f = sahteFetch(() => ({ durum: 200, govde: { data: [], paging: { next: 'https://evil.example/x' } } }));
    await expect(new MetaGrafIstemcisi(ayar(f.fn)).etiketleAra('act_1', 'campaigns', 'a')).rejects.toThrow(/Beklenmeyen adres/);
    expect(f.cagrilar).toHaveLength(1);
  });

  it('görsel: önbellekte varsa yüklemez; yoksa yükler, hash’i önbelleğe yazar', async () => {
    const yazilan: string[] = [];
    const f = sahteFetch(() => ({ durum: 200, govde: { images: { 'x.png': { hash: 'H1' } } } }));
    const g = new MetaGrafIstemcisi(ayar(f.fn, { gorselOnbellek: { oku: async (v) => (v === 'eski' ? 'H0' : null), yaz: async (_v, h) => void yazilan.push(h) } }));
    expect(await g.gorselYukle('act_1', 'eski')).toBe('H0');
    expect(f.cagrilar).toHaveLength(0);
    expect(await g.gorselYukle('act_1', 'yeni')).toBe('H1');
    expect(yazilan).toEqual(['H1']);
  });

  it('durum yazımında success:false başarı sayılmaz', async () => {
    const g = new MetaGrafIstemcisi(ayar(sahteFetch(() => ({ durum: 200, govde: { success: false } })).fn));
    await expect(g.durumYaz('5', { status: 'ACTIVE' })).rejects.toBeInstanceOf(MetaBelirsizHata);
  });
});

/** Erişim katmanı — gerçek şema. */
describe('Meta erişimi', () => {
  let h: Harness;
  let tx: TxRunner;
  const crypto = { decrypt: (b: Buffer) => `cozuldu:${b.toString('hex')}` };
  const HESAP = '44444444-0000-4000-8000-000000000001';
  beforeAll(async () => {
    h = await createHarness();
    tx = (fn) => fn(h.db as never);
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    await h.q('DELETE FROM ad_accounts');
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_77', 'H', 'TRY', 'Europe/Istanbul', now())`,
      [HESAP, IDS.org, IDS.client, IDS.connection],
    );
  });

  it('token çözülüyor; act_ öneki çiftlenmiyor', async () => {
    const e = await hesapErisimi(tx, crypto, HESAP, IDS.client);
    expect(e.hesap).toBe('act_77');
    expect(e.kullaniciToken).toMatch(/^cozuldu:/);
  });

  it('KRİTİK: hesap başka workspace’e geçtiyse ya da bağlantı aktif değilse YAZMA YOK', async () => {
    await expect(hesapErisimi(tx, crypto, HESAP, '99999999-0000-4000-8000-000000000000')).rejects.toThrow(/atanmış değil/);
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth'`);
    await expect(hesapErisimi(tx, crypto, HESAP, IDS.client)).rejects.toThrow(/yeniden yetkilendirilmeli/);
  });

  it('süresi geçmiş token reddedilir', async () => {
    await h.q(`UPDATE platform_connections SET token_expires_at = now() - interval '1 minute'`);
    await expect(hesapErisimi(tx, crypto, HESAP, IDS.client)).rejects.toBeInstanceOf(MetaKesinHata);
  });

  it('sayfa token’ı yalnız bu workspace’in sayfasından', async () => {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'facebook_page', '111', 'S', '\\x0102', now())`,
      [IDS.org, IDS.client, IDS.connection],
    );
    expect(await sayfaTokenOkuyucu(tx, crypto, IDS.client)('111')).toBe('cozuldu:0102');
    await expect(sayfaTokenOkuyucu(tx, crypto, '99999999-0000-4000-8000-000000000000')('111')).rejects.toBeInstanceOf(MetaKesinHata);
  });

  it('görsel önbelleği hesap başına; görsel okuyucu kök dışına çıkmaz ve başka workspace’in görselini okumaz', async () => {
    const kok = mkdtempSync(join(tmpdir(), 'reklam-'));
    mkdirSync(join(kok, 'o'), { recursive: true });
    writeFileSync(join(kok, 'o', 'g.png'), 'PNG');
    const [v] = await h.q<{ id: string }>(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'image', 'g', 'g.png', 'image/png', 3, 1, 1, 'o/g.png', $3, now()) RETURNING id::text`,
      [IDS.org, IDS.client, '1'.repeat(64)],
    );
    const oku = gorselOkuyucu(tx, kok, IDS.client);
    expect((await oku(v!.id)).toString()).toBe('PNG');
    await expect(gorselOkuyucu(tx, kok, '99999999-0000-4000-8000-000000000000')(v!.id)).rejects.toBeInstanceOf(MetaKesinHata);
    await h.q(`UPDATE assets SET storage_key = '../../etc/passwd' WHERE id = $1`, [v!.id]);
    await expect(oku(v!.id)).rejects.toThrow(/Geçersiz depolama anahtarı/);

    const o = gorselOnbellegi(tx, IDS.org, HESAP);
    expect(await o.oku(v!.id)).toBeNull();
    await o.yaz(v!.id, 'H1');
    await o.yaz(v!.id, 'H2');
    expect(await o.oku(v!.id)).toBe('H2');
  });
});
