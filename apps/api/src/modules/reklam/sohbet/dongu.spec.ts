import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADV_SOHBET_SINIRLARI, type SohbetOlayi, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { TxRunner } from '../yayin-motoru';
import type { AracCalistirici, AracCiktisi } from './araclar';
import { SohbetDongusu, anthropicGecmisi, konumAdaylariAl, type ModelAdimSonucu, type ModelAdimi } from './dongu';

/**
 * Sohbet döngüsü (İP-13): sahte model, gerçek veritabanı. İddialar
 * davranışa çapalı: model çağrı SAYISI, araç çağrı SAYISI, satırın durumu.
 */

const ARKADAS = '66666666-6666-6666-6666-666666666666';
let h: Harness;
let oturumId: string;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: false,
  permissions: ['bulk.write', 'bulk.read'],
} as unknown as TenantContext;

const tx: TxRunner = (fn) => fn(h.db as never);

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ($1, $2, 'a@b.c', 'x', 'Arkadaş', now())`, [ARKADAS, IDS.org]);
  const [o] = await h.q<{ id: string }>(
    `INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model) VALUES ($1, $2, $3, 'x', 'm') RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user],
  );
  oturumId = o!.id;
});

/** Sırayla verilen cevaplar; her çağrı sayılır. */
function sahteModel(cevaplar: Array<ModelAdimSonucu | Error | ((n: number) => ModelAdimSonucu)>) {
  const s = { cagri: 0, son: [] as unknown[] };
  const fn: ModelAdimi = async (g) => {
    s.son = g.mesajlar;
    const c = cevaplar[Math.min(s.cagri, cevaplar.length - 1)]!;
    s.cagri++;
    if (c instanceof Error) throw c;
    const r = typeof c === 'function' ? c(s.cagri) : c;
    for (const b of r.content) if (b.type === 'text') g.metinParcasi(String(b.text));
    return r;
  };
  return { fn, s };
}

const metin = (t: string): ModelAdimSonucu => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn', girdiToken: 10, ciktiToken: 5, onbellekToken: 0 });
const arac = (ad: string, girdi: unknown, id = `t${Math.random()}`): ModelAdimSonucu => ({
  content: [{ type: 'tool_use', id, name: ad, input: girdi }],
  stop_reason: 'tool_use',
  girdiToken: 10,
  ciktiToken: 5,
  onbellekToken: 0,
});

function sahteCalistirici(cikti: (ad: string, girdi: unknown) => AracCiktisi = () => ({ sonuc: { hal: 'tamam', veri: {} } })) {
  const cagrilar: Array<{ ad: string; girdi: unknown }> = [];
  return {
    cagrilar,
    c: { calistir: async (_c: unknown, _o: unknown, ad: string, girdi: unknown) => (cagrilar.push({ ad, girdi }), cikti(ad, girdi)) } as unknown as AracCalistirici,
  };
}

function dongu(model: ModelAdimi, calistirici = sahteCalistirici().c) {
  return new SohbetDongusu({
    tx,
    calistirici,
    model,
    medyaGorseli: async () => null,
    saatDilimi: async () => 'Europe/Istanbul',
    gercekDurum: async () => 'taslak, yayın yok.',
  });
}

async function topla(g: AsyncGenerator<SohbetOlayi>): Promise<SohbetOlayi[]> {
  const o: SohbetOlayi[] = [];
  for await (const e of g) o.push(e);
  return o;
}

const satirlar = () => h.q<{ rol: string; durum: string; sira: number }>(`SELECT rol, durum, sira FROM adv_mesaj ORDER BY sira`);

describe('tur', () => {
  it('düz cevap: kullanıcı ve asistan satırı, asistan "tamam" ile kapanır, olaylar sırayla', async () => {
    const m = sahteModel([metin('Merhaba')]);
    const o = await topla(dongu(m.fn).tur(CTX, oturumId, { metin: 'selam', medyalar: [] }));
    expect(o.map((e) => e.tur)).toEqual(['mesaj_basladi', 'metin', 'bitti']);
    expect(await satirlar()).toEqual([
      { rol: 'kullanici', durum: 'tamam', sira: 1 },
      { rol: 'asistan', durum: 'tamam', sira: 2 },
    ]);
  });

  it('KRİTİK: kota doluysa model HİÇ çağrılmaz ve hiçbir satır yazılmaz', async () => {
    for (let i = 0; i < ADV_SOHBET_SINIRLARI.saatlikMesaj; i++) {
      await h.q(
        `INSERT INTO adv_mesaj (oturum_id, org_id, client_id, user_id, sira, rol, icerik) VALUES ($1, $2, $3, $4, $5, 'kullanici', '[]')`,
        [oturumId, IDS.org, IDS.client, IDS.user, 100 + i],
      );
    }
    const m = sahteModel([metin('x')]);
    const o = await topla(dongu(m.fn).tur(CTX, oturumId, { metin: 'selam', medyalar: [] }));
    expect(m.s.cagri).toBe(0);
    expect(o).toEqual([expect.objectContaining({ tur: 'hata', hata: 'kota' })]);
    expect(await h.q(`SELECT 1 FROM adv_mesaj WHERE sira < 100`)).toHaveLength(0);
  });

  it(`KRİTİK: tur başına en çok ${ADV_SOHBET_SINIRLARI.aracAdimi} araç adımı; fazlası ÇALIŞTIRILMAZ, tur "kesildi"`, async () => {
    const m = sahteModel([(n) => arac('konum_ara', { metin: `yer ${n}` })]);
    const c = sahteCalistirici();
    const o = await topla(dongu(m.fn, c.c).tur(CTX, oturumId, { metin: 'selam', medyalar: [] }));
    expect(c.cagrilar).toHaveLength(ADV_SOHBET_SINIRLARI.aracAdimi);
    expect(o.at(-1)).toMatchObject({ tur: 'bitti', durum: 'kesildi' });
    expect((await satirlar()).at(-1)!.durum).toBe('kesildi');
  });

  it('KRİTİK: aynı araç aynı girdiyle ikinci kez ÇALIŞTIRILMAZ (TEKRAR)', async () => {
    const m = sahteModel([arac('konum_ara', { metin: 'İzmir' }), arac('konum_ara', { metin: 'İzmir' }), metin('tamam')]);
    const c = sahteCalistirici();
    await topla(dongu(m.fn, c.c).tur(CTX, oturumId, { metin: 'İzmir', medyalar: [] }));
    expect(c.cagrilar).toHaveLength(1);
    // Modele TEKRAR sonucu gitti.
    expect(JSON.stringify(m.s.son)).toContain('TEKRAR');
  });

  it('KRİTİK: model düşerse satır "akista" KALMAZ, "hata" ile kapanır ve hata olayı çıkar', async () => {
    const m = sahteModel([new Error('529 overloaded')]);
    const o = await topla(dongu(m.fn).tur(CTX, oturumId, { metin: 'selam', medyalar: [] }));
    expect(o.map((e) => e.tur)).toEqual(['mesaj_basladi', 'hata', 'bitti']);
    expect((await satirlar()).map((s) => s.durum)).toEqual(['tamam', 'hata']);
  });

  it('ret ve kesilme ayrı hâller', async () => {
    const ret = await topla(dongu(sahteModel([{ ...metin(''), stop_reason: 'refusal' }]).fn).tur(CTX, oturumId, { metin: 'a', medyalar: [] }));
    expect(ret.at(-1)).toMatchObject({ durum: 'ret' });
    const kes = await topla(dongu(sahteModel([{ ...metin('yarım'), stop_reason: 'max_tokens' }]).fn).tur(CTX, oturumId, { metin: 'b', medyalar: [] }));
    expect(kes.at(-1)).toMatchObject({ durum: 'kesildi' });
  });

  it('KRİTİK: başkasının oturumuna yazılamaz', async () => {
    const m = sahteModel([metin('x')]);
    await expect(topla(dongu(m.fn).tur({ ...CTX, userId: ARKADAS }, oturumId, { metin: 'a', medyalar: [] }))).rejects.toThrow(/başka bir kullanıcının/);
    expect(m.s.cagri).toBe(0);
  });

  it('KRİTİK: model "yayında" derse altına sunucunun gerçek durumu eklenir', async () => {
    const o = await topla(dongu(sahteModel([metin('Reklamın yayında!')]).fn).tur(CTX, oturumId, { metin: 'a', medyalar: [] }));
    expect(o).toContainEqual({ tur: 'durum_duzeltmesi', metin: 'Gerçek durum: taslak, yayın yok.' });
  });

  it('KRİTİK: taslak kurulunca sıradaki soru SUNUCUDAN çıkar ve oturuma yazılır', async () => {
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no) VALUES ($1, $2, 'meta', 'ai', $3, 1) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user],
    );
    await h.q(
      `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, eksikler, olusturan_id)
       VALUES ($1, $2, $3, 1, '{}', $4, $5, $6)`,
      [t!.id, IDS.org, IDS.client, 'a'.repeat(64), JSON.stringify([{ adim: 3, alan: 'butce', kod: 'BTC-01', metin: 'Bütçe' }]), IDS.user],
    );
    const c = sahteCalistirici(() => ({ sonuc: { hal: 'tamam', veri: {} }, taslakId: t!.id, taslakSurumu: 1 }));
    const o = await topla(dongu(sahteModel([arac('taslak_olustur', {}), metin('Ne kadar harcayalım?')]).fn, c.c).tur(CTX, oturumId, { metin: 'form', medyalar: [] }));
    expect(o).toContainEqual(expect.objectContaining({ tur: 'soru', soru: expect.objectContaining({ alan: 'butce', sira: 1 }) }));
    const [s] = await h.q<{ sorulanlar: string[]; taslak_id: string }>(`SELECT sorulanlar, taslak_id::text FROM adv_oturum`);
    expect(s).toEqual({ sorulanlar: ['butce'], taslak_id: t!.id });
  });

  it('başka workspace’in medyası reddedilir', async () => {
    await expect(
      topla(dongu(sahteModel([metin('x')]).fn).tur(CTX, oturumId, { metin: 'a', medyalar: [{ varlikId: '77777777-7777-7777-7777-777777777777' }] })),
    ).rejects.toThrow(/arşivinde değil/);
  });
});

describe('geçmiş', () => {
  it('KRİTİK: cevapsız araç çağrısıyla biten yarım tur geçmişten ATILIR (API reddederdi)', () => {
    const g = anthropicGecmisi([
      { rol: 'kullanici', icerik: [{ type: 'text', text: 'a' }] },
      { rol: 'asistan', icerik: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'hazirlik_oku', input: {} }] }] },
      { rol: 'kullanici', icerik: [{ type: 'text', text: 'b' }] },
    ]);
    expect(g).toEqual([{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }]);
  });

  it('konum adayları yalnız konum_ara sonuçlarından', () => {
    const k = { tur: 'city', key: '123', etiket: 'İzmir', ulkeKodu: 'TR' };
    const adaylar = konumAdaylariAl([
      {
        rol: 'asistan',
        icerik: [
          { role: 'assistant', content: [{ type: 'tool_use', id: 'k1', name: 'konum_ara', input: {} }, { type: 'tool_use', id: 'h1', name: 'hazirlik_oku', input: {} }] },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'k1', content: [{ type: 'text', text: JSON.stringify({ hal: 'tamam', veri: [k] }) }] },
              { type: 'tool_result', tool_use_id: 'h1', content: [{ type: 'text', text: JSON.stringify({ hal: 'tamam', veri: [{ key: 'SAHTE' }] }) }] },
            ],
          },
        ],
      },
    ]);
    expect(adaylar).toEqual([k]);
  });
});
