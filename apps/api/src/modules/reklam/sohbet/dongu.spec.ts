import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADV_SOHBET_SINIRLARI, type SohbetOlayi, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { TxRunner } from '../yayin-motoru';
import type { AracCalistirici, AracCiktisi } from './araclar';
import { soruBaglami } from './araclar';
import { SohbetDongusu, modelGecmisi, konumAdaylariAl, type ModelAdimSonucu, type ModelAdimi } from './dongu';

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
    for (const p of r.parcalar) if (typeof p.text === 'string' && !p.thought) g.metinParcasi(p.text);
    return r;
  };
  return { fn, s };
}

const metin = (t: string): ModelAdimSonucu => ({ parcalar: [{ text: t }], sebep: 'bitti', aciklama: null, girdiToken: 10, ciktiToken: 5, onbellekToken: 0 });
/** Gemini araç çağrısı; imza ilk çağrı parçasında (gerçek API'deki gibi). */
const arac = (ad: string, girdi: Record<string, unknown>, id = `t${Math.random()}`): ModelAdimSonucu => ({
  parcalar: [{ functionCall: { id, name: ad, args: girdi }, thoughtSignature: `imza-${id}` }],
  sebep: 'arac',
  aciklama: null,
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
    const ret = await topla(dongu(sahteModel([{ ...metin(''), sebep: 'ret', aciklama: 'Gemini cevabı engelledi (SAFETY).' }]).fn).tur(CTX, oturumId, { metin: 'a', medyalar: [] }));
    expect(ret.at(-1)).toMatchObject({ durum: 'ret' });
    const kes = await topla(dongu(sahteModel([{ ...metin('yarım'), sebep: 'kesildi' }]).fn).tur(CTX, oturumId, { metin: 'b', medyalar: [] }));
    expect(kes.at(-1)).toMatchObject({ durum: 'kesildi' });
    // Boş cevap "tamam" sayılmaz.
    const bos = await topla(dongu(sahteModel([{ ...metin(''), sebep: 'bos', aciklama: 'Gemini boş cevap döndü.' }]).fn).tur(CTX, oturumId, { metin: 'c', medyalar: [] }));
    expect(bos.at(-1)).toMatchObject({ durum: 'hata' });
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

  it('KRİTİK: prova eksiği (OK-17, alanı niyet) amaç sorusu ÜRETMİYOR; ekrandaki soru ÇİPLİ', async () => {
    // İlk canlı tur (2026-10-09): kullanıcı amacı söyledi, niyet yazıldı,
    // ama prova eksiği `niyet`e bağlı olduğu için ekran "Bu reklamdan ne
    // olmasını istiyorsun?" diye yeniden sordu ve kart SEÇENEKSİZ geldi.
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no) VALUES ($1, $2, 'meta', 'ai', $3, 1) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user],
    );
    const eksikler = [
      { adim: 0, alan: 'niyet', kod: 'KAYNAK', metin: 'Asistanın önerisini onayla' },
      { adim: 4, alan: 'niyet', kod: 'OK-17', metin: 'Meta provası henüz yapılmadı' },
      { adim: 0, alan: 'hedefAdres', kod: 'SITE-ADRES', metin: 'Site adresi https:// ile başlamalı' },
    ];
    await h.q(
      `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, eksikler, olusturan_id)
       VALUES ($1, $2, $3, 1, '{}', $4, $5, $6)`,
      [t!.id, IDS.org, IDS.client, 'b'.repeat(64), JSON.stringify(eksikler), IDS.user],
    );
    const c = sahteCalistirici(() => ({ sonuc: { hal: 'tamam', veri: {} }, taslakId: t!.id, taslakSurumu: 1 }));
    const o = await topla(dongu(sahteModel([arac('taslak_olustur', {}), metin('Hangi sayfaya gitsin?')]).fn, c.c).tur(CTX, oturumId, { metin: 'site', medyalar: [] }));
    const sorular = o.flatMap((x) => (x.tur === 'soru' ? [x.soru.alan] : []));
    expect(sorular).toEqual(['hedefAdres']);
  });

  it('KRİTİK: turun sonundaki amaç sorusu araçtaki ile AYNI çipleri taşıyor', async () => {
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no) VALUES ($1, $2, 'meta', 'ai', $3, 1) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user],
    );
    await h.q(
      `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, eksikler, olusturan_id)
       VALUES ($1, $2, $3, 1, '{}', $4, $5, $6)`,
      [t!.id, IDS.org, IDS.client, 'c'.repeat(64), JSON.stringify([{ adim: 0, alan: 'niyet', kod: 'NYT-01', metin: 'Amaç' }]), IDS.user],
    );
    const c = sahteCalistirici(() => ({ sonuc: { hal: 'tamam', veri: {} }, taslakId: t!.id, taslakSurumu: 1 }));
    const o = await topla(dongu(sahteModel([arac('taslak_olustur', {}), metin('Ne istersin?')]).fn, c.c).tur(CTX, oturumId, { metin: 'x', medyalar: [] }));
    const soru = o.find((x) => (x as { tur: string }).tur === 'soru') as { soru: { alan: string; secenekler: Array<{ deger: string }> } };
    expect(soru.soru.alan).toBe('niyet');
    expect(soru.soru.secenekler.map((s) => s.deger)).toEqual(soruBaglami().niyetler!.map((n) => n.kod));
    expect(soru.soru.secenekler.length).toBeGreaterThan(0);
  });

  it('başka workspace’in medyası reddedilir', async () => {
    await expect(
      topla(dongu(sahteModel([metin('x')]).fn).tur(CTX, oturumId, { metin: 'a', medyalar: [{ varlikId: '77777777-7777-7777-7777-777777777777' }] })),
    ).rejects.toThrow(/arşivinde değil/);
  });
});

describe('geçmiş', () => {
  it('KRİTİK: cevapsız araç çağrısıyla biten yarım tur geçmişten ATILIR (API reddederdi)', () => {
    const g = modelGecmisi([
      { rol: 'kullanici', icerik: [{ text: 'a' }] },
      { rol: 'asistan', icerik: [{ role: 'model', parts: [{ functionCall: { id: 'x', name: 'hazirlik_oku', args: {} } }] }] },
      { rol: 'kullanici', icerik: [{ text: 'b' }] },
    ]);
    expect(g).toEqual([{ role: 'user', parts: [{ text: 'a' }, { text: 'b' }] }]);
  });

  it('KRİTİK: düşünce imzası geçmişte AYNEN geri gidiyor (parçalar dönüştürülmüyor)', async () => {
    const m = sahteModel([arac('konum_ara', { metin: 'İzmir' }, 'c1'), metin('tamam')]);
    await topla(dongu(m.fn).tur(CTX, oturumId, { metin: 'İzmir', medyalar: [] }));
    // İkinci adıma giden mesajlarda ilk adımın imzası ve araç sonucu var.
    const ikinci = JSON.stringify(m.s.son);
    expect(ikinci).toContain('"thoughtSignature":"imza-c1"');
    expect(ikinci).toContain('"functionResponse":{"id":"c1","name":"konum_ara"');
    // Bir sonraki TURDA da kayıttan aynen kuruluyor.
    const m2 = sahteModel([metin('ok')]);
    await topla(dongu(m2.fn).tur(CTX, oturumId, { metin: 'devam', medyalar: [] }));
    expect(JSON.stringify(m2.s.son)).toContain('"thoughtSignature":"imza-c1"');
  });

  it('konum adayları yalnız konum_ara sonuçlarından', () => {
    const k = { tur: 'city', key: '123', etiket: 'İzmir', ulkeKodu: 'TR' };
    const adaylar = konumAdaylariAl([
      {
        rol: 'asistan',
        icerik: [
          { role: 'model', parts: [{ functionCall: { id: 'k1', name: 'konum_ara', args: {} } }, { functionCall: { id: 'h1', name: 'hazirlik_oku', args: {} } }] },
          {
            role: 'user',
            parts: [
              { functionResponse: { id: 'k1', name: 'konum_ara', response: { hal: 'tamam', veri: [k] } } },
              { functionResponse: { id: 'h1', name: 'hazirlik_oku', response: { hal: 'tamam', veri: [{ key: 'SAHTE' }] } } },
            ],
          },
        ],
      },
    ]);
    expect(adaylar).toEqual([k]);
  });
});
