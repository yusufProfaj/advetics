import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASISTAN_ARACLARI, type Oneri, type OneriListesi, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { GeminiParcasi, GeminiSonucu } from '../../../yapay-zeka/gemini';
import { ASISTAN_ARAC_TANIMLARI, geminiAraclari, type AsistanOrtami } from './araclar';
import { AsistanDongusu, AsistanHatasi, ASISTAN_SINIRLARI, type AsistanOlayi, type ModelAdimi } from './dongu';

/**
 * AI ASİSTAN — araç listesi ve tur döngüsü.
 *
 * EN KRİTİK İDDİA: asistanın YAZAN aracı yok. Uygula kartı yalnız öneriyi
 * döndürür; uygulamayı kullanıcı karttaki düğmeyle, öneri uygulamasının
 * AYNI ucundan yapar (MIMARI § 6, § 8).
 */

const yorumsuz = (dosya: string) =>
  readFileSync(join(__dirname, dosya), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('araç listesi', () => {
  it('KRİTİK: modele giden araçlar TAM OLARAK sözleşmedeki liste', () => {
    expect(geminiAraclari().map((a) => a.name)).toEqual([...ASISTAN_ARACLARI]);
    expect(Object.keys(ASISTAN_ARAC_TANIMLARI).sort()).toEqual([...ASISTAN_ARACLARI].sort());
  });

  it('KRİTİK: asistan kodu YAZAN hiçbir yola dokunmuyor (kaynak taraması, yorumsuz)', () => {
    const yasak = /CampaignActions|applyAction|\.uygula\(|\.yoksay\(|campaign-actions|durumOku/;
    for (const d of ['araclar.ts', 'dongu.ts', 'asistan.service.ts', 'istem.ts']) {
      const k = yorumsuz(d);
      // Boşa düşme bekçisi: dosya gerçekten okundu.
      expect(k.length, d).toBeGreaterThan(300);
      expect(k.match(yasak), `${d} yazan bir yola dokunuyor`).toBeNull();
    }
  });

  it('uygula_karti öneriyi KART olarak döndürür, uygulanamazı reddeder', async () => {
    const oneri = { anahtar: 'a', durum: 'acik', eylem: { tur: 'durdur' }, kisit: null } as unknown as Oneri;
    const ortam = { oneriler: async () => ({ oneriler: [oneri, { ...oneri, anahtar: 'b', eylem: null, kisit: 'paylaşılıyor' }], toplam: 2, hatalar: [], buAyUygulanan: 0 }) } as unknown as AsistanOrtami;
    const r = await ASISTAN_ARAC_TANIMLARI.uygula_karti.calistir({ anahtar: 'a' }, ortam);
    expect(r).toMatchObject({ hal: 'tamam', kart: oneri });
    expect(await ASISTAN_ARAC_TANIMLARI.uygula_karti.calistir({ anahtar: 'b' }, ortam)).toMatchObject({ hal: 'reddedildi', neden: 'paylaşılıyor' });
  });

  it('devir aracı HİÇBİR ŞEY YAZMAZ: yalnız /reklam yönlendirmesi; yetki yoksa ret', async () => {
    const yetkisiz = { ctx: { permissions: [] }, clientId: 'c' } as unknown as AsistanOrtami;
    expect((await ASISTAN_ARAC_TANIMLARI.advcampaign_devret.calistir({ istem: 'Yeni ürün için reklam kur' }, yetkisiz)).hal).toBe('reddedildi');
    const yetkili = { ctx: { permissions: ['bulk.write'] }, clientId: 'c' } as unknown as AsistanOrtami;
    const r = await ASISTAN_ARAC_TANIMLARI.advcampaign_devret.calistir({ istem: 'Yeni ürün için reklam kur' }, yetkili);
    expect(r).toMatchObject({ hal: 'tamam', veri: { adres: '/reklam' } });
    expect('devret' in r).toBe(false);
  });

  it('tanınmayan argüman sessizce yok sayılmıyor', async () => {
    const ortam = { bugun: '2026-10-09', metrics: { summary: vi.fn() } } as unknown as AsistanOrtami;
    await expect(ASISTAN_ARAC_TANIMLARI.metrik_ozeti.calistir({ start_date: '2026-01-01' }, ortam)).rejects.toThrow(/start_date/);
  });
});

// ─── Döngü (gerçek Postgres) ─────────────────────────────────────────────

let h: Harness;
const OTURUM = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, permissions: ['bulk.write'] } as unknown as TenantContext;

const ONERI = {
  anahtar: `kreatif_yorgunlugu:ad:${IDS.adAccount}:2026-W41`,
  durum: 'acik',
  eylem: { tur: 'durdur' },
  kisit: null,
  baslik: 'Reklam yoruldu',
} as unknown as Oneri;

function adim(parcalar: GeminiParcasi[], sebep: GeminiSonucu['sebep']): GeminiSonucu {
  return { parcalar, sebep, aciklama: null, girdiToken: 10, ciktiToken: 5, onbellekToken: 0 };
}

function dongu(model: ModelAdimi | null, ortamEk: Partial<AsistanOrtami> = {}) {
  const oneriler = vi.fn(async (): Promise<OneriListesi> => ({ oneriler: [ONERI], toplam: 1, hatalar: [], buAyUygulanan: 0 }));
  const d = new AsistanDongusu({
    tx: (fn) => fn(h.db as never),
    model,
    ortam: (ctx, clientId) => ({ ctx, clientId, bugun: '2026-10-09', oneriler, ...ortamEk }) as unknown as AsistanOrtami,
  });
  return { d, oneriler };
}

async function topla(g: AsyncGenerator<AsistanOlayi>): Promise<AsistanOlayi[]> {
  const out: AsistanOlayi[] = [];
  for await (const e of g) out.push(e);
  return out;
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO iyilestir_asistan_oturum (id, org_id, client_id, user_id) VALUES ($1, $2, $3, $4)`, [OTURUM, IDS.org, IDS.client, IDS.user]);
});

describe('asistan döngüsü', () => {
  it('KRİTİK: model anahtarı yoksa AÇIK hata, sessiz boş cevap değil', async () => {
    const { d } = dongu(null);
    await expect(d.tur(CTX, OTURUM, 'merhaba').next()).rejects.toMatchObject({ kod: 'MODEL_YOK' });
    expect(await h.q(`SELECT 1 FROM iyilestir_asistan_mesaj`)).toHaveLength(0);
  });

  it('KRİTİK: öneriler → uygula kartı; kart ekrana gidiyor, hiçbir şey YAZILMIYOR, iki mesaj kaydediliyor', async () => {
    const model = vi
      .fn<ModelAdimi>()
      .mockResolvedValueOnce(adim([{ functionCall: { id: '1', name: 'oneriler', args: {} } }], 'arac'))
      .mockResolvedValueOnce(adim([{ functionCall: { id: '2', name: 'uygula_karti', args: { anahtar: ONERI.anahtar } } }], 'arac'))
      .mockResolvedValueOnce(adim([{ text: 'Kartı onaylarsan reklam durur.' }], 'bitti'));
    const { d } = dongu(model);
    const olaylar = await topla(d.tur(CTX, OTURUM, 'ne yapmalıyım?'));
    const parcalar = olaylar.filter((e) => e.tur === 'parca').map((e) => (e as { parca: { tur: string } }).parca.tur);
    expect(parcalar).toEqual(['arac', 'arac', 'uygula_karti']);
    const bitti = olaylar.at(-1) as Extract<AsistanOlayi, { tur: 'bitti' }>;
    expect(bitti.mesaj.parcalar.map((p) => p.tur)).toEqual(['arac', 'arac', 'uygula_karti', 'metin']);
    const satirlar = await h.q<{ rol: string }>(`SELECT rol FROM iyilestir_asistan_mesaj ORDER BY created_at, (rol = 'asistan')`);
    expect(satirlar.map((s) => s.rol)).toEqual(['kullanici', 'asistan']);
    // Model ikinci adımda birinci aracın SONUCUNU görüyor.
    const ikinci = model.mock.calls[1]![0].mesajlar.at(-1)!;
    expect(ikinci.parts[0]!.functionResponse?.name).toBe('oneriler');
  });

  it('KRİTİK: önceki tur geçmişi imzalarıyla birlikte modele geri gidiyor', async () => {
    const model = vi.fn<ModelAdimi>().mockResolvedValue(adim([{ text: 'Merhaba', thoughtSignature: 'IMZA' }], 'bitti'));
    const { d } = dongu(model);
    await topla(d.tur(CTX, OTURUM, 'bir'));
    await topla(d.tur(CTX, OTURUM, 'iki'));
    const mesajlar = model.mock.calls[1]![0].mesajlar;
    expect(mesajlar.map((m) => m.role)).toEqual(['user', 'model', 'user']);
    expect(mesajlar[1]!.parts[0]!.thoughtSignature).toBe('IMZA');
  });

  it('aynı araç aynı girdiyle ikinci kez ÇALIŞTIRILMIYOR', async () => {
    const model = vi
      .fn<ModelAdimi>()
      .mockResolvedValueOnce(adim([{ functionCall: { name: 'oneriler', args: {} } }], 'arac'))
      .mockResolvedValueOnce(adim([{ functionCall: { name: 'oneriler', args: {} } }], 'arac'))
      .mockResolvedValueOnce(adim([{ text: 'tamam' }], 'bitti'));
    const { d, oneriler } = dongu(model);
    await topla(d.tur(CTX, OTURUM, 'x'));
    expect(oneriler).toHaveBeenCalledTimes(1);
  });

  it('model düşerse hata parçası yazılıyor ve asistan satırı YİNE kaydediliyor', async () => {
    const model = vi.fn<ModelAdimi>().mockRejectedValue(new Error('503'));
    const { d } = dongu(model);
    const olaylar = await topla(d.tur(CTX, OTURUM, 'x'));
    expect(olaylar.some((e) => e.tur === 'parca' && e.parca.tur === 'hata')).toBe(true);
    expect(await h.q(`SELECT 1 FROM iyilestir_asistan_mesaj WHERE rol = 'asistan'`)).toHaveLength(1);
  });

  it('başkasının oturumuna yazılmıyor; saatlik sınır model çağrılmadan önce', async () => {
    const model = vi.fn<ModelAdimi>();
    const { d } = dongu(model);
    await expect(d.tur({ ...CTX, userId: IDS.org } as TenantContext, OTURUM, 'x').next()).rejects.toBeInstanceOf(AsistanHatasi);
    for (let i = 0; i < ASISTAN_SINIRLARI.saatlikMesaj; i++) {
      await h.q(
        `INSERT INTO iyilestir_asistan_mesaj (oturum_id, org_id, client_id, user_id, rol, parcalar) VALUES ($1, $2, $3, $4, 'kullanici', '[]')`,
        [OTURUM, IDS.org, IDS.client, IDS.user],
      );
    }
    await expect(d.tur(CTX, OTURUM, 'x').next()).rejects.toMatchObject({ kod: 'KOTA' });
    expect(model).not.toHaveBeenCalled();
  });
});
