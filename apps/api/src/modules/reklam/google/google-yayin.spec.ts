import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TABAN_NEGATIFLER, UYUM_SURUMU, gecisIzinliMi, type GoogleDerlemeGirdisi } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import type { TxRunner } from '../yayin-motoru';
import { derleGoogle, GOOGLE_ATIF, GOOGLE_DERLEYICI_SURUMU } from './derle-google';
import { googleGeriOkumaKarsilastir, googleYayinIsle, googleYayinKaydiOlustur, type GoogleOkunan, type GoogleYayinPortu } from './google-yayin';

/**
 * GOOGLE YAYIN İŞLEYİCİSİ — gerçek şema (PGlite), sahte Google.
 *
 * En kritik iddialar: (1) sonucu bilinmeyen atomik istek ASLA yeniden
 * gönderilmez, (2) geri okumada fark varsa ya da açılış `deneme` ise kampanya
 * AÇILMAZ, (3) yazma kesicisi kapalıyken Google'a TEK istek gitmez.
 */
let h: Harness;
let tx: TxRunner;
const HESAP = '44444444-0000-4000-8000-0000000000a1';
const TASLAK = '99999999-0000-4000-8000-000000000001';
const YAYIN = 'abcdef12-0000-4000-8000-000000000001';
const MUSTERI = '1234567890';

const GIRDI: GoogleDerlemeGirdisi = {
  kurgu: 'ARAMA',
  ulasma: 'site',
  teklif: 'MAKS_TIKLAMA',
  musteriId: MUSTERI,
  paraBirimi: 'TRY',
  saatDilimi: 'Europe/Istanbul',
  konumlar: ['geoTargetConstants/1012782'],
  dil: 'languageConstants/1037',
  enDusukYas: 18,
  butce: { tip: 'gunluk', micros: 250_000_000n },
  takvim: { baslangic: '2026-10-11', bitis: null },
  hedefAdres: 'https://ornek.com.tr/',
  telefon: null,
  basliklar: ['Bir', 'İki', 'Üç'],
  aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'],
  anahtarKelimeler: ['kuşadası villa', 'havuzlu villa'],
  negatifler: [...TABAN_NEGATIFLER],
  gorselVarlikIdleri: [],
  youtubeVideoId: null,
  isletmeAdi: 'Ornek',
  logoVarlikId: null,
  kategoriler: [],
};

/** Kusursuz Google: gönderileni kurar, geri okumada aynen döndürür; testler sapma enjekte eder. */
class SahteGoogle implements GoogleYayinPortu {
  mutateSayisi = 0;
  acilan: string[] = [];
  mutateHatasi: Error | null = null;
  /** Hata atar AMA kurar (zaman aşımı sonrası istek uygulanmış). */
  yineDeKur = false;
  bozucu: ((o: Record<string, unknown>) => void) | null = null;
  kampanyaAdi: string | null = null;
  durum = 'PAUSED';
  private govde: Array<Record<string, unknown>> = [];

  async tokenAl() {
    return 'TOKEN';
  }
  async mutate(_c: FetchContext, g: { mutateOperations: Array<Record<string, unknown>> }) {
    this.mutateSayisi++;
    if (this.mutateHatasi) {
      if (this.yineDeKur) this.kur(g.mutateOperations);
      throw this.mutateHatasi;
    }
    this.kur(g.mutateOperations);
    return g.mutateOperations.map((op) => {
      const tur = Object.keys(op)[0]!;
      const sonuc = tur.replace('Operation', 'Result');
      const id =
        tur === 'campaignOperation'
          ? `customers/${MUSTERI}/campaigns/555`
          : tur === 'adGroupOperation'
            ? `customers/${MUSTERI}/adGroups/666`
            : tur === 'adGroupAdOperation'
              ? `customers/${MUSTERI}/adGroupAds/666~777`
              : `customers/${MUSTERI}/x/1`;
      return { [sonuc]: { resourceName: id } };
    });
  }
  private kur(ops: Array<Record<string, unknown>>) {
    this.govde = ops;
    const k = ops.find((o) => o.campaignOperation)!.campaignOperation as { create: { name: string } };
    this.kampanyaAdi = k.create.name;
  }
  async ara<T>(_c: FetchContext, sorgu: string): Promise<T[]> {
    if (!this.kampanyaAdi) return [];
    const c = (tur: string) => this.govde.filter((o) => o[tur]).map((o) => (o[tur] as { create: Record<string, unknown> }).create);
    if (sorgu.includes('FROM ad_group_ad')) {
      return [{ campaign: { resourceName: `customers/${MUSTERI}/campaigns/555` }, adGroup: { resourceName: `customers/${MUSTERI}/adGroups/666` }, adGroupAd: { resourceName: `customers/${MUSTERI}/adGroupAds/666~777` } }] as T[];
    }
    if (sorgu.includes('FROM campaign_criterion')) {
      return c('campaignCriterionOperation').map((x) => ({ campaignCriterion: { type: x.location ? 'LOCATION' : x.language ? 'LANGUAGE' : 'KEYWORD', negative: x.negative === true } })) as T[];
    }
    if (sorgu.includes('FROM ad_group_criterion')) {
      return c('adGroupCriterionOperation').map((x) => ({ adGroupCriterion: { type: x.location ? 'LOCATION' : 'KEYWORD', negative: false } })) as T[];
    }
    const k = c('campaignOperation')[0]!;
    const b = c('campaignBudgetOperation')[0]!;
    const o: Record<string, unknown> = {
      campaign: {
        name: k.name,
        status: this.durum,
        advertisingChannelType: k.advertisingChannelType,
        networkSettings: k.networkSettings,
        geoTargetTypeSetting: { positiveGeoTargetType: (k.geoTargetTypeSetting as { positiveGeoTargetType: string }).positiveGeoTargetType },
      },
      campaignBudget: { amountMicros: b.amountMicros },
    };
    this.bozucu?.(o);
    return [o] as T[];
  }
  async kampanyaAc(_c: FetchContext, kaynak: string) {
    this.acilan.push(kaynak);
    this.durum = 'ENABLED';
  }
}

beforeAll(async () => {
  h = await createHarness();
  tx = (fn) => fn(h.db as never);
});
afterAll(async () => h.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', $5, 'G', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, IDS.org, IDS.client, IDS.connection, MUSTERI],
  );
  await h.q(
    `INSERT INTO reklam_taslagi (id, org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no, ad_account_id)
     VALUES ($1, $2, $3, 'google', 'acemi', $4, 1, $5)`,
    [TASLAK, IDS.org, IDS.client, IDS.user, HESAP],
  );
  await h.q(
    `INSERT INTO taslak_surumu (taslak_id, org_id, client_id, surum_no, alanlar, icerik_ozeti, olusturan_id)
     VALUES ($1, $2, $3, 1, '{}'::jsonb, $4, $5)`,
    [TASLAK, IDS.org, IDS.client, 'e'.repeat(64), IDS.user],
  );
});

async function yayinKur(kapaliKalacak = false) {
  const d = derleGoogle(GIRDI, {
    kimlik: YAYIN,
    workspaceKisaAdi: 'WS',
    amacEkranAdi: 'Siteme gelsinler',
    simdi: new Date('2026-10-10T09:00:00+03:00'),
    validateOnly: false,
    logo: null,
    youtubeVideoBasligi: null,
  });
  if (d.tur !== 'govde') throw new Error(JSON.stringify(d));
  await googleYayinKaydiOlustur(tx, {
    id: YAYIN,
    orgId: IDS.org,
    clientId: IDS.client,
    taslakId: TASLAK,
    taslakSurumNo: 1,
    icerikOzeti: 'e'.repeat(64),
    adAccountId: HESAP,
    govde: { platform: 'google', kurgu: d.kurgu, govde: d.govde, sira: d.sira, logoVarlikId: null },
    beklenen: d.beklenen,
    apiSurumu: 'v25',
    derleyiciSurumu: GOOGLE_DERLEYICI_SURUMU,
    atifStandardi: GOOGLE_ATIF,
    baslatanId: IDS.user,
    kapaliKalacak,
    uyum: { surum: UYUM_SURUMU, tur: 'gecti' },
  });
}
const isle = (g: SahteGoogle, kilit = true) =>
  googleYayinIsle({ tx, google: g, kilit: { al: async () => kilit, birak: async () => undefined }, kilitOneki: 'adv' }, YAYIN, 'is-1');
const yayin = async () => (await h.q<{ durum: string; sebep: string | null; sonlanma_sebebi: string | null }>('SELECT durum, sebep, sonlanma_sebebi FROM yayin'))[0]!;
const nesneler = async () => h.q<{ ad: string; durum: string; meta_id: string | null }>('SELECT ad, durum, meta_id FROM yayin_nesnesi ORDER BY sira');

describe('Google yayını — mutlu yol', () => {
  it('KRİTİK: kur → geri oku → tekillik → AÇ; kampanya yalnız EN SONDA açılıyor', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(1);
    expect(g.acilan).toEqual([`customers/${MUSTERI}/campaigns/555`]);
    expect((await nesneler()).map((n) => [n.ad, n.durum])).toEqual([
      ['kampanya', 'acildi'],
      ['reklam_grubu', 'kuruldu'],
      ['reklam', 'kuruldu'],
    ]);
    const [o] = await h.q<{ sonuc: string }>('SELECT sonuc FROM geri_okuma');
    expect(o!.sonuc).toBe('temiz');
    const [t] = await h.q<{ durum: string }>('SELECT durum FROM reklam_taslagi');
    expect(t!.durum).toBe('yayinda');
  });

  it('KRİTİK: aynı iş ikinci kez gelirse atomik istek YENİDEN GÖNDERİLMEZ', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    await isle(g);
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(1);
  });
});

describe('açmayan yollar', () => {
  it('KRİTİK: deneme açılışı (kapali_kalacak) kurar, geri okur ama AÇMAZ', async () => {
    await yayinKur(true);
    const g = new SahteGoogle();
    const s = await isle(g);
    expect(g.acilan).toEqual([]);
    expect(g.mutateSayisi).toBe(1);
    const y = await yayin();
    if (gecisIzinliMi('tekillik_kapisi', 'kapali_kuruldu')) {
      expect(s).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    } else {
      expect(s).toEqual({ tur: 'bitti', durum: 'tekillik_kapisi' });
      expect(y.sebep).toMatch(/AÇILMADI/);
    }
  });

  it('KRİTİK: geri okumada fark (ağ bayrağı açık döndü) → fark_var, kampanya AÇILMAZ, fark kaydı yazılır', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.bozucu = (o) => {
      (o.campaign as { networkSettings: Record<string, boolean> }).networkSettings.targetContentNetwork = true;
    };
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
    const [r] = await h.q<{ sonuc: string; satirlar: Array<{ alan: string }> }>('SELECT sonuc, satirlar FROM geri_okuma');
    expect(r!.sonuc).toBe('fark');
    expect(r!.satirlar.map((s) => s.alan)).toEqual(['kampanya.aglar']);
  });

  it('KRİTİK: Google kesin reddettiyse (atomik: hiçbir şey kurulmadı) kurulamadi + nesneler reddedildi', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'permanent', 'INVALID_ARGUMENT · alan=campaign.name');
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'kurulamadi' });
    expect((await nesneler()).every((n) => n.durum === 'reddedildi')).toBe(true);
    expect((await yayin()).sebep).toMatch(/INVALID_ARGUMENT/);
  });

  it('KRİTİK: zaman aşımı (belirsiz) → YENİDEN POST YOK, yalnız arama; bulunursa uzlaştırılıp devam eder', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'transient', 'İstek 30000ms içinde tamamlanmadı');
    g.yineDeKur = true;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(1);
    expect((await nesneler())[0]!.meta_id).toBe(`customers/${MUSTERI}/campaigns/555`);
  });

  it('belirsiz ve aramada YOK → sonuc_belirsiz (insan karar verir), ikinci POST yok', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'transient', 'zaman aşımı');
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'sonuc_belirsiz' });
    expect(g.mutateSayisi).toBe(1);
  });

  it('KRİTİK: yazma kesicisi kapalıyken Google’a TEK istek gitmez; yayın ön kontrolde sebebiyle kapanır', async () => {
    await yayinKur(false);
    await h.q(`INSERT INTO ajans_ayari (org_id, google_yazma_durduruldu, google_durdurma_at, google_durdurma_sebebi) VALUES ($1, true, now(), 'olay')`, [IDS.org]);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.mutateSayisi).toBe(0);
    expect(await yayin()).toMatchObject({ sonlanma_sebebi: 'on_kontrol_reddi' });
  });

  it('kilit doluysa ertelenir, Google’a istek yok', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    expect((await isle(g, false)).tur).toBe('ertele');
    expect(g.mutateSayisi).toBe(0);
  });
});

describe('geri okuma karşılaştırması', () => {
  const b = derleGoogle(GIRDI, { kimlik: YAYIN, workspaceKisaAdi: 'WS', amacEkranAdi: 'S', simdi: new Date('2026-10-10T09:00:00+03:00'), validateOnly: false, logo: null, youtubeVideoBasligi: null });
  if (b.tur !== 'govde') throw new Error('derleme');
  const temiz: GoogleOkunan = {
    kampanyaAdi: b.beklenen.kampanyaAdi,
    durum: 'PAUSED',
    kanal: 'SEARCH',
    gunlukButceMicros: '250000000',
    aglar: { googleSearch: true, searchNetwork: false, contentNetwork: false, partnerSearchNetwork: false },
    konumTuru: 'PRESENCE',
    konumSayisi: 1,
    anahtarKelimeSayisi: 2,
    negatifSayisi: TABAN_NEGATIFLER.length,
  };
  it('temiz okuma temiz; okunamayan alan (null) FARK sayılır; eksik negatif fark', () => {
    expect(googleGeriOkumaKarsilastir(b.beklenen, temiz)).toEqual({ sonuc: 'temiz', satirlar: [] });
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, konumTuru: null }).sonuc).toBe('fark');
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, negatifSayisi: 3 }).satirlar.map((s) => s.alan)).toEqual(['negatif.sayisi']);
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, konumTuru: 'PRESENCE_OR_INTEREST' }).sonuc).toBe('fark');
  });
});
