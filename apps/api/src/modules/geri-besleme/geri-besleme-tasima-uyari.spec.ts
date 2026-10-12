import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay } from '../../../test/geri-besleme-tohum';
import { workspaceTasi } from '../manager-account/workspace-tasima';
import { geriBeslemeUyariSatirlari, geriBeslemeUyarisi } from './geri-besleme-uyari';

/**
 * ═══ WORKSPACE TAŞIMA ve UYARI (Paket E, MIMARI § 2 "üç durak", Ç-9) ═══
 *
 * KRİTİK İDDİALAR:
 *   · workspace başka şirkete taşınınca satırlar Postgres cascade'iyle gidiyor
 *     ama AYAR KAPANIYOR ve bekleyenler iptal; sayısı taşıma raporunda (eski
 *     şirketin bağlantısıyla gönderim sürmesin),
 *   · ayar hatası `error`, gönderilemeyen satır `warn`; kapalı ayar uyarı
 *     üretmiyor; detayda Meta'nın cümlesi aynen.
 */
let h: Harness;
const HEDEF = '99999999-9999-4999-8999-999999999999';
const LEAD = 'eeeeeeee-0000-4000-8000-000000000001';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Hedef', 'hedef', now())`, [HEDEF]);
  await lead(h, { id: LEAD, externalId: '123456789012345', submittedAt: new Date(Date.now() - 3_600_000) });
});

describe('workspace taşıma', () => {
  it('KRİTİK: satırlar yeni şirkete gidiyor; ayar KAPANIYOR, bekleyen İPTAL, raporda sayılı', async () => {
    await ayarAc(h);
    await olay(h, { leadId: LEAD, asama: 'ham_lead', durum: 'iletildi', olayZamani: new Date() });
    await olay(h, { leadId: LEAD, asama: 'ulasildi', durum: 'bekliyor', olayZamani: new Date() });
    await h.q(`INSERT INTO lead_durum_gecmisi (org_id, client_id, lead_id, onceki_durum, yeni_durum, kaynak) VALUES ($1, $2, $3, NULL, 'new', 'sistem')`, [
      IDS.org,
      IDS.client,
      LEAD,
    ]);

    const r = await workspaceTasi(h.db, IDS.client, IDS.org, HEDEF);

    expect(r.tasinan['Meta geri beslemesi kapatıldı (yeni şirkette yeniden açılmalı)']).toBe(1);
    expect(r.tasinan['bekleyen Meta bildirimi iptal edildi']).toBe(1);
    const [a] = await h.q<{ etkin: boolean; baglanti_id: string | null; org_id: string }>(
      'SELECT etkin, baglanti_id, org_id::text AS org_id FROM geri_besleme_ayarlari',
    );
    expect(a).toEqual({ etkin: false, baglanti_id: null, org_id: HEDEF });
    const olaylar = await h.q<{ durum: string; org_id: string }>('SELECT durum, org_id::text AS org_id FROM geri_besleme_olaylari ORDER BY asama');
    expect(olaylar).toEqual([
      { durum: 'iletildi', org_id: HEDEF },
      { durum: 'iptal', org_id: HEDEF },
    ]);
    const [g] = await h.q<{ org_id: string }>('SELECT org_id::text AS org_id FROM lead_durum_gecmisi');
    expect(g!.org_id).toBe(HEDEF);
  });
});

describe('uyarı', () => {
  it('KRİTİK: ayar hatası error ve Meta’nın cümlesi aynen; gönderilemeyen satır warn; kapalı ayar uyarı üretmiyor', async () => {
    await ayarAc(h);
    await h.q(`UPDATE geri_besleme_ayarlari SET son_ayar_hatasi = '(#200) Requires ads_management permission', son_ayar_hatasi_zamani = now()`);
    let s = await geriBeslemeUyariSatirlari(h.db, new Date());
    expect(s).toHaveLength(1);
    const u = geriBeslemeUyarisi(s[0]!);
    expect(u).toMatchObject({ kod: 'geri_besleme_dusuyor', siddet: 'error', clientId: IDS.client, platform: 'meta' });
    expect(u.detay).toContain('(#200) Requires ads_management permission');
    expect(u.eylem?.href).toBe(`/potansiyel-musteriler?musteri=${IDS.client}&sekme=gonderimler`);

    await h.q(`UPDATE geri_besleme_ayarlari SET son_ayar_hatasi = NULL, son_ayar_hatasi_zamani = NULL`);
    expect(await geriBeslemeUyariSatirlari(h.db, new Date())).toEqual([]);

    await olay(h, { leadId: LEAD, asama: 'satisa_dondu', durum: 'vazgecildi', olayZamani: new Date(), sonrakiDeneme: null });
    await h.q(`UPDATE geri_besleme_olaylari SET hata = 'Service temporarily unavailable'`);
    s = await geriBeslemeUyariSatirlari(h.db, new Date());
    expect(geriBeslemeUyarisi(s[0]!)).toMatchObject({ siddet: 'warn', detay: expect.stringContaining('1 sonuç gönderilemedi') });

    await h.q(`UPDATE geri_besleme_ayarlari SET etkin = false`);
    expect(await geriBeslemeUyariSatirlari(h.db, new Date())).toEqual([]);
  });
});
