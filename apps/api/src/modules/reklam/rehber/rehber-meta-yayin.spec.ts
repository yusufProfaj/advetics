import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DERLEYICI_SURUMU, UYUM_SURUMU, gecisIzinliMi, taslakKanonikIcerik, type TaslakAlanlari, type TenantContext } from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import { SahteMeta } from '../../../../test/reklam-sahte-meta';
import { yayinBaslat } from '../yayin-baslat';
import { yayinIsiniIsle, type IsleyiciBagimliliklari } from '../yayin-isleyici';
import type { TxRunner } from '../yayin-motoru';

/**
 * REHBERİN META YAYINI — uyum kapısı ve "duraklatılmış kur" (MIMARI § 5).
 *
 * Eski yolda gerçek yayın UYUM retiyle duruyordu ve DURMAYA devam etmeli;
 * rehber yalnız uyum `gecti` ise o reti kaldırıyor. `deneme` açılışında
 * kurulum geri okunur ve AÇILMAZ: Meta'da tek bir ACTIVE nesne olmamalı.
 */
let h: Harness;
let tx: TxRunner;
const HESAP = '44444444-0000-4000-8000-000000000001';
const SAYFA = '55555555-0000-4000-8000-000000000001';
const VARLIK = '66666666-0000-4000-8000-000000000001';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true, managerAccountId: AJANS_UST_HESAP } as TenantContext;
const SIMDI = new Date('2026-10-07T09:00:00Z');
const kok = mkdtempSync(join(tmpdir(), 'rehber-meta-'));
writeFileSync(join(kok, 'g.png'), 'PNG');
const GECTI = { tur: 'gecti' as const, surum: UYUM_SURUMU };

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
  await seedAjans(h);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_77', 'H', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', '111', 'Sayfa', now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 3, 1080, 1080, 'g.png', $4, now())`,
    [VARLIK, IDS.org, IDS.client, '1'.repeat(64)],
  );
  await h.q(`INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ($1, 'tik7_gor1', now())`, [IDS.org]);
});

const z = '2026-10-07T08:00:00.000Z';
const k = <T,>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: IDS.user, zaman: z });
const DOLU: TaslakAlanlari = {
  niyet: k('SITE' as const),
  reklamHesabiId: k(HESAP),
  sayfaId: k(SAYFA),
  konumlar: k([{ tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }]),
  kavramlar: k([{ varlikId: VARLIK, baslik: 'Başlık', metin: 'Metin' }]),
  hedefAdres: k('https://ornek.com.tr'),
  butce: k({ tip: 'gunluk' as const, micros: '500000000' }),
  takvim: k({ baslangic: '2026-10-08', bitis: '2026-10-21' }),
  ekKategoriler: k([]),
};

/** Taslak + sürüm + TAZE ve GEÇMİŞ prova (gerçek yayının ön koşulu). */
async function provaliTaslak() {
  const ozet = createHash('sha256').update(taslakKanonikIcerik(DOLU)).digest('hex');
  const [t] = await h.q<{ id: string }>(
    `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no, ad_account_id)
     VALUES ($1, $2, 'meta', 'acemi', $3, 1, $4) RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user, HESAP],
  );
  await h.q(
    `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, olusturan_id)
     VALUES ($1, $2, $3, 1, $4::jsonb, $5, $6)`,
    [t!.id, IDS.org, IDS.client, JSON.stringify(DOLU), ozet, IDS.user],
  );
  await h.q(
    `INSERT INTO prova (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id, api_surumu, derleyici_surumu, durum, bitti_at)
     VALUES ($1, $2, $3, 1, $4, $5, 'v25.0', $6, 'gecti', $7)`,
    [IDS.org, IDS.client, t!.id, ozet, HESAP, DERLEYICI_SURUMU, new Date(SIMDI.getTime() - 5 * 60_000).toISOString()],
  );
  return { taslakId: t!.id, ozet };
}

const gercek = (t: { taslakId: string; ozet: string }, rehber?: Parameters<typeof yayinBaslat>[2]['rehber']) =>
  yayinBaslat(tx, CTX, { taslakId: t.taslakId, surumNo: 1, icerikOzeti: t.ozet, testKipi: false, ...(rehber ? { rehber } : {}) }, { apiSurumu: 'v25.0', simdi: SIMDI });
const kodlar = (r: Awaited<ReturnType<typeof yayinBaslat>>) => (r.tur === 'ret' ? r.retler.map((x) => x.kod) : []);

function bagimlilik(meta: SahteMeta): IsleyiciBagimliliklari {
  return {
    tx,
    crypto: { decrypt: () => 'TOKEN' },
    apiSurumu: 'v25.0',
    yuklemeKoku: kok,
    kilit: { al: async () => true, birak: async () => undefined },
    kilitOneki: 'advetics',
    portKur: () => meta,
  };
}

describe('uyum kapısı', () => {
  it('KRİTİK: eski yol (rehbersiz) prova geçmiş olsa da UYUM ile durur — değişmedi', async () => {
    const t = await provaliTaslak();
    expect(kodlar(await gercek(t))).toEqual(['UYUM']);
  });

  it('KRİTİK: rehberin uyum kararı "durdu" ise UYUM reti bulgularla kalır', async () => {
    const t = await provaliTaslak();
    const r = await gercek(t, { uyum: { tur: 'durdu', surum: UYUM_SURUMU, bulgular: [{ kod: 'UYUM-SIYASI', platform: null, metin: 'Siyasi reklam yok.' }] }, kapaliKalacak: false });
    expect(r.tur === 'ret' && r.retler).toEqual([{ kod: 'UYUM', mesaj: 'Siyasi reklam yok.' }]);
    expect(await h.q('SELECT id FROM yayin')).toHaveLength(0);
  });

  it('KRİTİK: rehberin uyum kararı "gecti" ise yayın başlar ve karar yayın kaydına DEĞİŞMEZ yazılır', async () => {
    const t = await provaliTaslak();
    const r = await gercek(t, { uyum: GECTI, kapaliKalacak: true });
    expect(r.tur).toBe('basladi');
    const [y] = await h.q<{ uyum_surumu: string; uyum_sonucu: unknown; kapali_kalacak: boolean; test_kipi: boolean }>(
      'SELECT uyum_surumu, uyum_sonucu, kapali_kalacak, test_kipi FROM yayin',
    );
    expect(y).toEqual({ uyum_surumu: UYUM_SURUMU, uyum_sonucu: GECTI, kapali_kalacak: true, test_kipi: false });
    await expect(h.q(`UPDATE yayin SET uyum_sonucu = '{"tur":"durdu"}'::jsonb`)).rejects.toThrow(/degismez/);
    await expect(h.q(`UPDATE yayin SET kapali_kalacak = false`)).rejects.toThrow(/degismez/);
  });

  it('uyum geçse de prova yoksa gerçek yayın yok (OK-17)', async () => {
    const t = await provaliTaslak();
    await h.q('DELETE FROM prova');
    expect(kodlar(await gercek(t, { uyum: GECTI, kapaliKalacak: false }))).toEqual(['OK-17']);
  });
});

describe('deneme açılışı: kur, geri oku, AÇMA', () => {
  it('KRİTİK: kapali_kalacak yayında Meta’da tek bir ACTIVE nesne yok, arşiv de yok (duraklatılmış kalır)', async () => {
    const t = await provaliTaslak();
    const r = await gercek(t, { uyum: GECTI, kapaliKalacak: true });
    if (r.tur !== 'basladi') throw new Error(JSON.stringify(r));
    const meta = new SahteMeta();
    const s = await yayinIsiniIsle(bagimlilik(meta), { yayinId: r.yayinId, adim: 'kur' }, 'is-1');
    expect(meta.acmaSirasi).toEqual([]);
    const durumlar = [...meta.kayitlar.values()].map((x) => x.status);
    expect(durumlar.length).toBeGreaterThan(0);
    expect(durumlar.every((d) => d === 'PAUSED')).toBe(true);
    // Durum makinesi kapali_kuruldu'ya izin veriyorsa oraya, vermiyorsa
    // olduğu yerde ve SEBEBİYLE kalır — iki durumda da AÇILMAZ.
    const [y] = await h.q<{ durum: string; sebep: string | null; sonlanma_sebebi: string | null }>('SELECT durum, sebep, sonlanma_sebebi FROM yayin');
    if (gecisIzinliMi('tekillik_kapisi', 'kapali_kuruldu')) {
      expect(s).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
      expect(y!.sonlanma_sebebi).toBe('kapali_kuruldu');
    } else {
      expect(s).toEqual({ tur: 'bitti', durum: 'tekillik_kapisi' });
      expect(y!.sebep).toMatch(/AÇILMADI/);
    }
  });

  it('açılış "acik" (kapali_kalacak=false) ise aynı yayın AÇILIR — fark bayrakta', async () => {
    const t = await provaliTaslak();
    const r = await gercek(t, { uyum: GECTI, kapaliKalacak: false });
    if (r.tur !== 'basladi') throw new Error(JSON.stringify(r));
    const meta = new SahteMeta();
    expect(await yayinIsiniIsle(bagimlilik(meta), { yayinId: r.yayinId, adim: 'kur' }, 'is-1')).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(meta.acmaSirasi).toEqual(['campaigns', 'adsets', 'ads']);
  });
});
