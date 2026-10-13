import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GERI_ALINABILIR_DURUMLAR, TABAN_NEGATIFLER, UYUM_SURUMU, gecisIzinliMi, type GoogleDerlemeGirdisi } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import type { TxRunner } from '../yayin-motoru';
import { reklamIsiniIsle } from '../yayin-isleyici';
import { derleGoogle, GOOGLE_ATIF, GOOGLE_DERLEYICI_SURUMU, type GoogleDerlemeBaglami } from './derle-google';
import { googleGeriAlIsle, googleGeriOkumaKarsilastir, googleKaldirmaGovdesi, googleYayinIsle, googleYayinKaydiOlustur, ulusalNumara, type GoogleOkunan, type GoogleYayinPortu } from './google-yayin';

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
  /** Arama öğesi satırlarını geri okumada değiştirir (kayıp öğe, başka numara, biçimli numara). */
  ogeBozucu: ((satirlar: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) | null = null;
  kampanyaAdi: string | null = null;
  durum = 'PAUSED';
  /** Dalga 3 geri okumasını bozar: `tur` sorgunun kaynağı (`ad_group`, `asset_group_asset`, `pmax_kampanya` …). */
  dalga3Bozucu: ((tur: string, satirlar: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) | null = null;
  sorgular: string[] = [];
  private govde: Array<Record<string, unknown>> = [];
  // ── Geri al (kaldırma) ──
  tokenSayisi = 0;
  kaldirmaGovdeleri: Array<{ mutateOperations: Array<Record<string, unknown>>; partialFailure: boolean; validateOnly: boolean }> = [];
  kaldirilan = new Set<string>();
  /** 200 döner AMA kaldırmaz (kabul edip görmezden gelme). */
  kaldirmayiYutar = false;
  kaldirmaHatasi: Error | null = null;
  /** Hata atar AMA kaldırır (cevap kaybolmuş). */
  yineDeKaldir = false;
  /** Adında bu yayının izi olan, kaydımızda olmayan ek kopyalar. */
  ekKopyalar: string[] = [];
  aramaHatasi: Error | null = null;
  durumOkumaHatasi: Error | null = null;

  async tokenAl() {
    this.tokenSayisi++;
    return 'TOKEN';
  }
  async mutate(_c: FetchContext, g: { mutateOperations: Array<Record<string, unknown>>; partialFailure: boolean; validateOnly: boolean }) {
    this.mutateSayisi++;
    const kaldir = g.mutateOperations.map((o) => (o.campaignOperation as { remove?: string } | undefined)?.remove).filter((x): x is string => !!x);
    if (kaldir.length > 0) {
      this.kaldirmaGovdeleri.push(g);
      if (this.kaldirmaHatasi) {
        if (this.yineDeKaldir) kaldir.forEach((k) => this.kaldirilan.add(k));
        throw this.kaldirmaHatasi;
      }
      if (!this.kaldirmayiYutar) kaldir.forEach((k) => this.kaldirilan.add(k));
      return kaldir.map((k) => ({ campaignResult: { resourceName: k } }));
    }
    if (this.mutateHatasi) {
      if (this.yineDeKur) this.kur(g.mutateOperations);
      throw this.mutateHatasi;
    }
    this.kur(g.mutateOperations);
    return g.mutateOperations.map((op, i) => {
      const tur = Object.keys(op)[0]!;
      const sonuc = tur.replace('Operation', 'Result');
      const id =
        tur === 'campaignOperation'
          ? `customers/${MUSTERI}/campaigns/555`
          : tur === 'adGroupOperation'
            ? `customers/${MUSTERI}/adGroups/666`
            : tur === 'adGroupAdOperation'
              ? `customers/${MUSTERI}/adGroupAds/666~777`
              : tur === 'assetGroupOperation'
                ? `customers/${MUSTERI}/assetGroups/888`
                : tur === 'assetOperation'
                  ? `customers/${MUSTERI}/assets/${900 + i}`
                  : `customers/${MUSTERI}/x/1`;
      return { [sonuc]: { resourceName: id } };
    });
  }
  private kur(ops: Array<Record<string, unknown>>) {
    this.govde = ops;
    const k = ops.find((o) => o.campaignOperation)!.campaignOperation as { create: { name: string } };
    this.kampanyaAdi = k.create.name;
  }
  private kampanyalar(): string[] {
    return [...(this.kampanyaAdi ? [`customers/${MUSTERI}/campaigns/555`] : []), ...this.ekKopyalar];
  }
  async ara<T>(_c: FetchContext, sorgu: string): Promise<T[]> {
    this.sorgular.push(sorgu);
    gaqlKurali(sorgu);
    if (sorgu.includes('campaign.resource_name, campaign.status FROM campaign')) {
      if (this.durumOkumaHatasi) throw this.durumOkumaHatasi;
      const idler = /IN \(([^)]*)\)/.exec(sorgu)![1]!.split(',').map((x) => x.trim());
      return this.kampanyalar()
        .filter((k) => idler.includes(k.slice(k.lastIndexOf('/') + 1)))
        .map((k) => ({ campaign: { resourceName: k, status: this.kaldirilan.has(k) ? 'REMOVED' : this.durum } })) as T[];
    }
    if (sorgu.includes('FROM ad_group_ad') && sorgu.includes("campaign.status != 'REMOVED'")) {
      if (this.aramaHatasi) throw this.aramaHatasi;
      // Kaldırılmamış kopyalar (gerçek sorgunun süzgeci).
      return this.kampanyalar()
        .filter((k) => !this.kaldirilan.has(k))
        .map((k) => ({ campaign: { resourceName: k }, adGroup: { resourceName: `customers/${MUSTERI}/adGroups/666` }, adGroupAd: { resourceName: `customers/${MUSTERI}/adGroupAds/666~777` } })) as T[];
    }
    if (!this.kampanyaAdi) return [];
    const c = (tur: string) => this.govde.filter((o) => o[tur]).map((o) => (o[tur] as { create: Record<string, unknown> }).create);
    const boz = (tur: string, satirlar: Array<Record<string, unknown>>) => (this.dalga3Bozucu ? this.dalga3Bozucu(tur, satirlar) : satirlar) as T[];
    // ── Dalga 3: Talep Yaratma görsel ──
    if (/FROM ad_group\s/.test(sorgu)) {
      return boz('ad_group', c('adGroupOperation').map((g) => ({ adGroup: { status: g.status, demandGenAdGroupSettings: g.demandGenAdGroupSettings } })));
    }
    if (sorgu.includes('FROM ad_group_ad') && sorgu.includes('demand_gen_multi_asset_ad')) {
      return boz(
        'ad_group_ad',
        c('adGroupAdOperation').map((a) => {
          const ad = a.ad as { demandGenMultiAssetAd?: Record<string, unknown[]> };
          return { adGroupAd: { status: a.status, ad: { type: 'DEMAND_GEN_MULTI_ASSET_AD', demandGenMultiAssetAd: ad.demandGenMultiAssetAd }, adGroupAdAssetAutomationSettings: a.adGroupAdAssetAutomationSettings } };
        }),
      );
    }
    // ── Dalga 3: Maks. Performans ──
    if (sorgu.includes('brand_guidelines_enabled')) {
      const k = c('campaignOperation')[0]!;
      return boz('pmax_kampanya', [{ campaign: { brandGuidelinesEnabled: k.brandGuidelinesEnabled, assetAutomationSettings: k.assetAutomationSettings } }]);
    }
    if (sorgu.includes('FROM asset_group_asset')) {
      return boz('asset_group_asset', c('assetGroupAssetOperation').map((b) => ({ assetGroupAsset: { fieldType: b.fieldType, status: 'ENABLED', source: 'ADVERTISER' } })));
    }
    if (/FROM asset_group\s/.test(sorgu)) {
      if (sorgu.includes('LIKE')) {
        return [{ campaign: { resourceName: `customers/${MUSTERI}/campaigns/555` }, assetGroup: { resourceName: `customers/${MUSTERI}/assetGroups/888` } }] as T[];
      }
      return boz('asset_group', c('assetGroupOperation').map((g) => ({ assetGroup: { resourceName: `customers/${MUSTERI}/assetGroups/888`, status: g.status, finalUrls: g.finalUrls } })));
    }
    if (sorgu.includes('FROM ad_group_ad')) {
      return [{ campaign: { resourceName: `customers/${MUSTERI}/campaigns/555` }, adGroup: { resourceName: `customers/${MUSTERI}/adGroups/666` }, adGroupAd: { resourceName: `customers/${MUSTERI}/adGroupAds/666~777` } }] as T[];
    }
    if (sorgu.includes('FROM campaign_asset')) {
      // GOOGLE'IN KURALI TAKLİTTE DE (canlı turda ölçüldü, 2026-10-11): WHERE'de
      // süzülen `campaign.id` SELECT'te yoksa sorgu reddediliyor. Taklit bunu
      // yapmadığı için geri okuma burada yeşildi, canlıda "kurulamadı" dedi.
      if (/WHERE[\s\S]*campaign\.id/.test(sorgu) && !/SELECT[\s\S]*campaign\.id[\s\S]*FROM/.test(sorgu)) {
        throw new Error("EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: 'campaign.id'");
      }
      // Atomik isteğin bağı ve öğesi: bağ, geçici öğe kimliğiyle eşleşiyor.
      const ogeler = c('assetOperation');
      const satirlar = c('campaignAssetOperation').map((bag) => {
        const oge = ogeler.find((o) => o.resourceName === bag.asset) as { callAsset?: { countryCode: string; phoneNumber: string } } | undefined;
        return { campaignAsset: { fieldType: bag.fieldType, status: 'ENABLED' }, asset: { callAsset: oge?.callAsset ? { countryCode: oge.callAsset.countryCode, phoneNumber: oge.callAsset.phoneNumber } : undefined } };
      });
      return (this.ogeBozucu ? this.ogeBozucu(satirlar) : satirlar) as T[];
    }
    if (sorgu.includes('FROM campaign_conversion_goal')) {
      // Kampanya hedefleri: gövdedeki GÜNCELLEMELERİN aynası (kaynak adının
      // son iki parçası kategori ve kaynak; geçici kimlik gerçek kimliğe döner).
      const satirlar = this.govde
        .map((o) => (o.campaignConversionGoalOperation as { update?: { resourceName: string; biddable: boolean } } | undefined)?.update)
        .filter((u): u is { resourceName: string; biddable: boolean } => !!u)
        .map((u) => {
          const [, kategori, kaynak] = u.resourceName.slice(u.resourceName.lastIndexOf('/') + 1).split('~');
          return { campaignConversionGoal: { campaign: `customers/${MUSTERI}/campaigns/555`, category: kategori, origin: kaynak, biddable: u.biddable } };
        });
      return boz('campaign_conversion_goal', satirlar);
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
        biddingStrategyType: k.targetSpend ? 'TARGET_SPEND' : k.maximizeConversions ? 'MAXIMIZE_CONVERSIONS' : 'MANUAL_CPC',
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

/**
 * GOOGLE'IN GAQL KURALI TAKLİTTE, BÜTÜN SORGULARDA: WHERE'de geçen ve FROM
 * kaynağına ait OLMAYAN (iliştirilmiş kaynağın) her alan SELECT'te de
 * olmalı. Canlıda `campaign_asset` + `campaign.id` ile ölçüldü (2026-10-11).
 * FROM kaynağının kendi alanı (ör. `FROM campaign WHERE campaign.id`)
 * seçilmeden canlıda geçti; o yüzden kural ona uygulanmıyor.
 */
function gaqlKurali(sorgu: string): void {
  const m = /SELECT([\s\S]*?)FROM\s+(\w+)([\s\S]*)$/.exec(sorgu);
  if (!m) throw new Error(`GAQL çözümlenemedi: ${sorgu.slice(0, 80)}`);
  const secilen = new Set(m[1]!.split(',').map((x) => x.trim()));
  const kaynak = m[2]!;
  const nerede = /WHERE([\s\S]*?)(?:LIMIT|ORDER BY|$)/.exec(m[3]!)?.[1] ?? '';
  for (const [alan] of nerede.replace(/'[^']*'/g, "''").matchAll(/\b[a-z_]+(?:\.[a-z_]+)+\b/g)) {
    if (alan.startsWith(`${kaynak}.`)) continue;
    if (!secilen.has(alan)) throw new PlatformApiError('google', 'permanent', `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: '${alan}'`);
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

async function yayinKur(kapaliKalacak = false, girdi: GoogleDerlemeGirdisi = GIRDI) {
  const d = derleGoogle(girdi, {
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

  it('KRİTİK: TELEFON — arama öğesi geri okumada YOKSA fark_var, kampanya AÇILMAZ (numarasız telefon reklamı)', async () => {
    const TEL: GoogleDerlemeGirdisi = { ...GIRDI, ulasma: 'telefon', telefon: '+902325551234' };
    await yayinKur(false, TEL);
    const g = new SahteGoogle();
    g.ogeBozucu = () => [];
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
    const [r] = await h.q<{ satirlar: Array<{ alan: string }> }>('SELECT satirlar FROM geri_okuma');
    expect(r!.satirlar.map((s) => s.alan)).toEqual(['aramaOgesi']);
  });

  it('TELEFON: öğe doğru numarayla (Google biçimlendirse bile) okunursa açılır; gövde öğeyi taşıyor', async () => {
    const TEL: GoogleDerlemeGirdisi = { ...GIRDI, ulasma: 'telefon', telefon: '+902325551234' };
    await yayinKur(false, TEL);
    const g = new SahteGoogle();
    g.ogeBozucu = (x) => x.map((s) => ({ ...s, asset: { callAsset: { countryCode: 'TR', phoneNumber: '0232 555 12 34' } } }));
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(1);
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
    aramaOgeleri: [],
    // g-1.1.0: Arama'da teklif de geri okunuyor (eşik kararı gövdeye yansıdı mı).
    teklif: 'TARGET_SPEND',
  };
  it('temiz okuma temiz; okunamayan alan (null) FARK sayılır; eksik negatif fark', () => {
    expect(googleGeriOkumaKarsilastir(b.beklenen, temiz)).toEqual({ sonuc: 'temiz', satirlar: [] });
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, konumTuru: null }).sonuc).toBe('fark');
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, negatifSayisi: 3 }).satirlar.map((s) => s.alan)).toEqual(['negatif.sayisi']);
    expect(googleGeriOkumaKarsilastir(b.beklenen, { ...temiz, konumTuru: 'PRESENCE_OR_INTEREST' }).sonuc).toBe('fark');
  });

  it('site reklamına kampanya düzeyinde arama öğesi İLİŞMİŞSE fark (beklenmeyen öğe de söz dışı)', () => {
    const o = { ...temiz, aramaOgeleri: [{ countryCode: 'TR', phoneNumber: '2325551234' }] };
    expect(googleGeriOkumaKarsilastir(b.beklenen, o).satirlar.map((s) => s.alan)).toEqual(['aramaOgesi']);
  });

  it('eski yayın satırı (beklenen_yanki’de aramaOgesi alanı HİÇ yok) öğesiz okumada temiz', () => {
    // JSON'a hiç yazılmamış alan: `aramaOgesi` opsiyonel, cast gerekmiyor.
    const { aramaOgesi: _yok, ...eski } = b.beklenen;
    expect('aramaOgesi' in eski).toBe(false);
    expect(googleGeriOkumaKarsilastir(eski, temiz).sonuc).toBe('temiz');
  });

  describe('telefon', () => {
    const t = derleGoogle({ ...GIRDI, ulasma: 'telefon', telefon: '+902325551234' }, { kimlik: YAYIN, workspaceKisaAdi: 'WS', amacEkranAdi: 'S', simdi: new Date('2026-10-10T09:00:00+03:00'), validateOnly: false, logo: null, youtubeVideoBasligi: null });
    if (t.tur !== 'govde') throw new Error('derleme');
    const okunan = (aramaOgeleri: GoogleOkunan['aramaOgeleri']): GoogleOkunan => ({ ...temiz, kampanyaAdi: t.beklenen.kampanyaAdi, aramaOgeleri });

    it('tek öğe doğru numarayla temiz; öğe yoksa, başka numaraysa ya da iki öğe varsa fark', () => {
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan([{ countryCode: 'TR', phoneNumber: '2325551234' }])).sonuc).toBe('temiz');
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan([])).satirlar.map((s) => s.alan)).toEqual(['aramaOgesi']);
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan([{ countryCode: 'TR', phoneNumber: '2325559999' }])).sonuc).toBe('fark');
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan([{ countryCode: 'US', phoneNumber: '2325551234' }])).sonuc).toBe('fark');
      const iki = [{ countryCode: 'TR', phoneNumber: '2325551234' }, { countryCode: 'TR', phoneNumber: '2325551234' }];
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan(iki)).sonuc).toBe('fark');
      // Okunamayan numara (null) bilinmeyendir, doğru varsayılmaz.
      expect(googleGeriOkumaKarsilastir(t.beklenen, okunan([{ countryCode: 'TR', phoneNumber: null }])).sonuc).toBe('fark');
    });

    it('biçim farkı fark DEĞİL (boşluk, 0 öneki, +90), rakam farkı fark', () => {
      for (const n of ['0232 555 12 34', '+90 (232) 555-1234', '902325551234', '(232) 555 12 34', '2325551234']) {
        expect(ulusalNumara({ countryCode: 'tr', phoneNumber: n })).toEqual({ countryCode: 'TR', phoneNumber: '2325551234' });
      }
      expect(ulusalNumara({ countryCode: 'TR', phoneNumber: '0232 555 12 35' }).phoneNumber).toBe('2325551235');
      // Öneki yalnız TR'de ve yalnız doğru uzunlukta atıyoruz: başka ülkede dokunulmaz.
      expect(ulusalNumara({ countryCode: 'US', phoneNumber: '02325551234' }).phoneNumber).toBe('02325551234');
    });
  });
});

// ====================================================================// DALGA 3 — Talep Yaratma GÖRSEL ve Maks. Performans yayını
// ===========================================================================

const G_YATAY = '00000000-0000-4000-8000-0000000000b1';
const G_KARE = '00000000-0000-4000-8000-0000000000b2';
const G_GORSEL: GoogleDerlemeGirdisi = {
  ...GIRDI,
  kurgu: 'TALEP_YARATMA_GORSEL',
  ulasma: null,
  anahtarKelimeler: [],
  gorseller: [
    { varlikId: G_YATAY, oran: 'yatay' },
    { varlikId: G_KARE, oran: 'kare' },
  ],
};
const G_PMAX: GoogleDerlemeGirdisi = {
  ...G_GORSEL,
  kurgu: 'MAKS_PERFORMANS',
  teklif: 'MAKS_DONUSUM',
  uzunBasliklar: ['Kuşadası’nda bahçeli villalar.'],
  aciklamalar: ['Kısa açıklama.', 'İkinci açıklama.'],
  donusumHedefleri: [
    { kategori: 'PURCHASE', kaynak: 'WEBSITE' },
    { kategori: 'SUBMIT_LEAD_FORM', kaynak: 'WEBSITE' },
    { kategori: 'PHONE_CALL_LEAD', kaynak: 'CALL_FROM_ADS' },
  ],
};
const G_BAGLAM: Partial<GoogleDerlemeBaglami> = {
  logo: { resource: `customers/${MUSTERI}/assets/77` },
  gorselKaynaklari: new Map([
    [G_YATAY, { kaynak: { yeniGorsel: { name: 'yatay', bytes: Buffer.from('y') } }, olcu: { genislik: 1200, yukseklik: 628, bayt: 1000 } }],
    [G_KARE, { kaynak: { yeniGorsel: { name: 'kare', bytes: Buffer.from('k') } }, olcu: { genislik: 1200, yukseklik: 1200, bayt: 1000 } }],
  ]),
};

async function dalga3Kur(girdi: GoogleDerlemeGirdisi) {
  for (const [id, w, hh] of [
    [G_YATAY, 1200, 628],
    [G_KARE, 1200, 1200],
  ] as const) {
    await h.q(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES ($1, $2, $3, 'image', 'g', 'g.png', 'image/png', 1000, $4, $5, 'k', $6, now())`,
      [id, IDS.org, IDS.client, w, hh, id],
    );
  }
  const d = derleGoogle(girdi, {
    kimlik: YAYIN,
    workspaceKisaAdi: 'WS',
    amacEkranAdi: 'Bölgemde çok kişi görsün',
    simdi: new Date('2026-10-10T09:00:00+03:00'),
    validateOnly: false,
    youtubeVideoBasligi: null,
    logo: null,
    ...G_BAGLAM,
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
    kapaliKalacak: false,
    uyum: { surum: UYUM_SURUMU, tur: 'gecti' },
  });
  return d;
}

type Satirlar = Array<Record<string, unknown>>;
const kanaliBoz = (degistir: (k: Record<string, boolean>) => Record<string, boolean>) => (tur: string, s: Satirlar): Satirlar =>
  tur === 'ad_group'
    ? s.map((x) => {
        const a = x.adGroup as { demandGenAdGroupSettings: { channelControls: { selectedChannels: Record<string, boolean> } } };
        return { adGroup: { ...a, demandGenAdGroupSettings: { channelControls: { selectedChannels: degistir(a.demandGenAdGroupSettings.channelControls.selectedChannels) } } } };
      })
    : s;

describe('Dalga 3 — Talep Yaratma GÖRSEL yayını', () => {
  it('KRİTİK: kur → geri oku (kanallar + görsel sayısı + otomasyon) → aç; yeni görseller önbelleğe yazılıyor', async () => {
    const d = await dalga3Kur(G_GORSEL);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    const [o] = await h.q<{ sonuc: string; satirlar: unknown[] }>('SELECT sonuc, satirlar FROM geri_okuma');
    expect(o).toEqual({ sonuc: 'temiz', satirlar: [] });
    expect((await nesneler()).map((n) => n.ad)).toEqual(['kampanya', 'reklam_grubu', 'reklam']);
    // Önbellek: yanıttaki kaynak adı, işlem sırasından, kendi varlığına.
    const refs = await h.q<{ asset_id: string; external_ref: string }>('SELECT asset_id::text, external_ref FROM asset_platform_refs ORDER BY asset_id');
    expect(refs).toHaveLength(2);
    expect(refs).toEqual(
      [...d.sira.gorseller!].sort((a, b) => a.varlikId.localeCompare(b.varlikId)).map((x) => ({ asset_id: x.varlikId, external_ref: `customers/${MUSTERI}/assets/${900 + x.sira}` })),
    );
    // Kurguya özgü sorgular gerçekten soruldu.
    expect(g.sorgular.some((s) => s.includes('selected_channels.display'))).toBe(true);
  });

  it('KRİTİK: Görüntülü Reklam Ağı açık döndü → fark_var (alan gorselReklam), AÇILMAZ', async () => {
    await dalga3Kur(G_GORSEL);
    const g = new SahteGoogle();
    g.dalga3Bozucu = kanaliBoz((k) => ({ ...k, display: true }));
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
    const [r] = await h.q<{ satirlar: Array<{ alan: string }> }>('SELECT satirlar FROM geri_okuma');
    expect(r!.satirlar.map((x) => x.alan)).toEqual(['gorselReklam']);
  });

  it('Google false kanalı HİÇ göndermese de (proto3 JSON) temiz: eksik bayrak kapalı sayılıyor', async () => {
    await dalga3Kur(G_GORSEL);
    const g = new SahteGoogle();
    g.dalga3Bozucu = kanaliBoz((k) => Object.fromEntries(Object.entries(k).filter(([, v]) => v)));
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
  });

  it('otomasyon ayarı geri okunamadıysa (Google yankılamadı) FARK — bilinmeyen doğru sayılmaz', async () => {
    await dalga3Kur(G_GORSEL);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) => (tur === 'ad_group_ad' ? s.map((x) => ({ adGroupAd: { ...(x.adGroupAd as object), adGroupAdAssetAutomationSettings: [] } })) : s);
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
  });
});

describe('Dalga 3 — Maks. Performans yayını', () => {
  it('KRİTİK: kur → geri oku (varlık grubu, marka, otomasyon, teklif) → aç; nesneler kampanya + varlık grubu (reklam YOK)', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect((await nesneler()).map((n) => [n.ad, n.durum, n.meta_id])).toEqual([
      ['kampanya', 'acildi', `customers/${MUSTERI}/campaigns/555`],
      ['varlik_grubu', 'kuruldu', `customers/${MUSTERI}/assetGroups/888`],
    ]);
    const [o] = await h.q<{ sonuc: string; satirlar: unknown[] }>('SELECT sonuc, satirlar FROM geri_okuma');
    expect(o).toEqual({ sonuc: 'temiz', satirlar: [] });
    // Tekillik kapısı ad_group_ad'den DEĞİL varlık grubundan aradı.
    // Ad araması TEK (tekillik kapısı): yanıttaki kaynak adları yetti, reklam
    // nesnesi olmadığı için "belirsiz" sayılıp uzlaştırmaya düşülmedi.
    expect(g.sorgular.filter((s) => /FROM asset_group\s[\s\S]*LIKE/.test(s))).toHaveLength(1);
    expect(g.sorgular.some((s) => /FROM ad_group_ad[\s\S]*LIKE/.test(s))).toBe(false);
  });

  it('KRİTİK: URL genişletme Google’da AÇIK okunursa fark_var (alan varlikGrubu), kampanya AÇILMAZ', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) =>
      tur === 'pmax_kampanya'
        ? s.map((x) => {
            const c = x.campaign as { assetAutomationSettings: Array<{ assetAutomationType: string; assetAutomationStatus: string }> };
            return {
              campaign: {
                ...c,
                assetAutomationSettings: c.assetAutomationSettings.map((a) =>
                  a.assetAutomationType === 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION' ? { ...a, assetAutomationStatus: 'OPTED_IN' } : a,
                ),
              },
            };
          })
        : s;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
    const [r] = await h.q<{ satirlar: Array<{ alan: string }> }>('SELECT satirlar FROM geri_okuma');
    expect(r!.satirlar.map((x) => x.alan)).toEqual(['varlikGrubu']);
  });

  it('Google’ın KENDİ ürettiği varlık (AUTOMATICALLY_CREATED video) fark sayılmaz', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) =>
      tur === 'asset_group_asset' ? [...s, { assetGroupAsset: { fieldType: 'YOUTUBE_VIDEO', status: 'ENABLED', source: 'AUTOMATICALLY_CREATED' } }] : s;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
  });

  it('bizim bağladığımız bir başlık eksik okunursa fark', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) => {
      if (tur !== 'asset_group_asset') return s;
      const i = s.findIndex((x) => (x.assetGroupAsset as { fieldType: string }).fieldType === 'HEADLINE');
      return s.filter((_, j) => j !== i);
    };
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
  });

  it('KRİTİK: zaman aşımı → YENİDEN POST YOK; varlık grubundan uzlaştırılıp devam eder', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'transient', 'zaman aşımı');
    g.yineDeKur = true;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(1);
    expect((await nesneler()).map((n) => n.meta_id)).toEqual([`customers/${MUSTERI}/campaigns/555`, `customers/${MUSTERI}/assetGroups/888`]);
  });

  it('teklif Google’da başka okunursa (ör. tıklama) fark', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.bozucu = (o) => {
      (o.campaign as { biddingStrategyType: string }).biddingStrategyType = 'TARGET_SPEND';
    };
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
  });

  /*
   * DÖNÜŞÜM HEDEFLERİ (g-1.4.0): "200 döndü doğrulama değil". Güncelleme
   * kabul edilse bile Google bir hedefi hesap varsayılanıyla açık
   * bırakabilir; geri okuma teklife giren kümeyi TAM OLARAK bekliyor.
   */
  it('KRİTİK: temiz kurulumda teklife giren küme yalnız PURCHASE~WEBSITE okunur ve kampanya açılır', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    const hedefSorgusu = g.sorgular.find((s) => s.includes('FROM campaign_conversion_goal'));
    expect(hedefSorgusu).toContain(`campaign_conversion_goal.campaign = 'customers/${MUSTERI}/campaigns/555'`);
  });

  it('KRİTİK: Google form hedefini AÇIK bırakırsa fark_var (alan kampanya.donusumHedefleri), kampanya AÇILMAZ', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) =>
      tur === 'campaign_conversion_goal'
        ? s.map((x) => {
            const c = x.campaignConversionGoal as { category: string };
            return c.category === 'SUBMIT_LEAD_FORM' ? { campaignConversionGoal: { ...c, biddable: true } } : x;
          })
        : s;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
    const [r] = await h.q<{ satirlar: Array<{ alan: string; okunan: unknown }> }>('SELECT satirlar FROM geri_okuma');
    expect(r!.satirlar).toEqual([{ alan: 'kampanya.donusumHedefleri', beklenen: ['PURCHASE~WEBSITE'], okunan: ['PURCHASE~WEBSITE', 'SUBMIT_LEAD_FORM~WEBSITE'] }]);
  });

  /*
   * PROTO3 JSON: false değerli alan HİÇ gelmeyebilir. Yalnız `true` teklife
   * giren sayılır; "false değilse açık" okumak, Google'ın düzgün kapattığı
   * her hedefi açık sayıp temiz kurulumu durdururdu (ya da tersine).
   */
  it('KRİTİK: kapalı hedeflerde biddable alanı hiç gelmezse kapalı sayılır, kurulum temiz', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) =>
      tur === 'campaign_conversion_goal'
        ? s.map((x) => {
            const c = x.campaignConversionGoal as { biddable: boolean };
            return c.biddable ? x : { campaignConversionGoal: { ...c, biddable: undefined } };
          })
        : s;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
  });

  it('satın alma teklife GİRMİYORSA (biddable alanı hiç gelmedi) fark', async () => {
    await dalga3Kur(G_PMAX);
    const g = new SahteGoogle();
    g.dalga3Bozucu = (tur, s) =>
      tur === 'campaign_conversion_goal' ? s.map((x) => ({ campaignConversionGoal: { ...(x.campaignConversionGoal as object), biddable: undefined } })) : s;
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'fark_var' });
    expect(g.acilan).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GERİ AL ("Vazgeç ve kaldır") — 2026-10-11: duraklatılmış deneme kampanyaları
// müşterinin Google Ads hesabında birikiyordu ve Advetics'ten geri alınamıyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('Google geri al (kaldır)', () => {
  const K555 = `customers/${MUSTERI}/campaigns/555`;
  const geriAl = (g: SahteGoogle, kilit = true) =>
    googleGeriAlIsle({ tx, google: g, kilit: { al: async () => kilit, birak: async () => undefined }, kilitOneki: 'adv' }, YAYIN, 'is-2');
  /** Duraklatılmış kurulmuş yayın: geri almanın en sık hâli. */
  async function kapaliKurulmus(): Promise<SahteGoogle> {
    await yayinKur(true);
    const g = new SahteGoogle();
    expect((await isle(g)).tur).toBe('bitti');
    expect((await yayin()).durum).toBe('kapali_kuruldu');
    g.mutateSayisi = 0;
    g.tokenSayisi = 0;
    return g;
  }

  it('durum makinesi: geri alınabilir HER durumdan arsivlendi geçişi var (tek son durum, Meta ile ortak)', () => {
    for (const d of GERI_ALINABILIR_DURUMLAR) expect(gecisIzinliMi(d, 'arsivlendi'), d).toBe(true);
  });

  it('gövde: campaignOperation.remove, partialFailure false, validateOnly false; geçersiz kaynak reddedilir', () => {
    expect(googleKaldirmaGovdesi([K555])).toEqual({
      mutateOperations: [{ campaignOperation: { remove: K555 } }],
      partialFailure: false,
      validateOnly: false,
    });
    expect(() => googleKaldirmaGovdesi([])).toThrow(/Kaldırılacak/);
    expect(() => googleKaldirmaGovdesi(['customers/1/adGroups/2'])).toThrow(/Geçersiz/);
    expect(() => googleKaldirmaGovdesi(["customers/1/campaigns/2' OR 1=1"])).toThrow(/Geçersiz/);
  });

  it('KRİTİK: kapali_kuruldu → kampanya Google’da KALDIRILIR, geri okunur, yayın arsivlendi + geri_alindi, taslak serbest', async () => {
    const g = await kapaliKurulmus();
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.kaldirmaGovdeleri).toEqual([{ mutateOperations: [{ campaignOperation: { remove: K555 } }], partialFailure: false, validateOnly: false }]);
    expect(g.kaldirilan.has(K555)).toBe(true);
    expect(await yayin()).toMatchObject({ durum: 'arsivlendi', sonlanma_sebebi: 'geri_alindi' });
    expect((await nesneler()).find((n) => n.ad === 'kampanya')!.durum).toBe('arsivlendi');
    const [t] = await h.q<{ durum: string }>('SELECT durum FROM reklam_taslagi');
    expect(t!.durum).toBe('taslak');
  });

  it('KRİTİK: "200 döndü" kaldırıldı DEĞİL — geri okumada REMOVED yoksa yayın yerinde kalır, sebep yazılır', async () => {
    const g = await kapaliKurulmus();
    g.kaldirmayiYutar = true;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    const y = await yayin();
    expect(y.durum).toBe('kapali_kuruldu');
    expect(y.sebep).toMatch(/Kaldırılamadı: 555 \(PAUSED\)/);
  });

  it('KRİTİK: geri okumada kampanya HİÇ görünmezse de kaldırılmış sayılmaz', async () => {
    const g = await kapaliKurulmus();
    g.kaldirmayiYutar = true;
    g.kampanyaAdi = null; // okuma satır döndürmüyor (yanlış hesap/yetki)
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect((await yayin()).sebep).toMatch(/555 \(okunamadı\)/);
  });

  it('kaldırma hata verdi AMA uygulandı (cevap kayboldu) → karar geri okumadan: arsivlendi', async () => {
    const g = await kapaliKurulmus();
    g.kaldirmaHatasi = new PlatformApiError('google', 'transient', 'zaman aşımı');
    g.yineDeKaldir = true;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
  });

  it('kaldırma reddedildi → yerinde kalır, Google’ın cümlesi ekranda', async () => {
    const g = await kapaliKurulmus();
    g.kaldirmaHatasi = new PlatformApiError('google', 'permanent', 'OPERATION_NOT_PERMITTED_FOR_REMOVED_RESOURCE');
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect((await yayin()).sebep).toMatch(/Kaldırılamadı: 555.*OPERATION_NOT_PERMITTED/);
  });

  it('KRİTİK: yazma kesicisi kapalıyken Google’a TEK yazma gitmez; yayın yerinde, sebep yazılı', async () => {
    const g = await kapaliKurulmus();
    await h.q(`INSERT INTO ajans_ayari (org_id, google_yazma_durduruldu, google_durdurma_at, google_durdurma_sebebi) VALUES ($1, true, now(), 'olay')`, [IDS.org]);
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect(g.mutateSayisi).toBe(0);
    expect((await yayin()).sebep).toMatch(/durduruldu: olay/);
  });

  // Ajan 4 (Dalga 3): hesap-workspace denetimi mutasyonda YAŞIYORDU
  // (`h.client_id !== y.client_id` silindiğinde hiçbir test düşmedi).
  it('KRİTİK: hesap artık bu workspace’e atanmış değilse Google’a TEK yazma gitmez; yayın yerinde, sebep yazılı', async () => {
    const g = await kapaliKurulmus();
    await h.q(`UPDATE ad_accounts SET client_id = NULL`);
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect(g.mutateSayisi).toBe(0);
    expect(g.tokenSayisi).toBe(0);
    expect((await yayin()).sebep).toMatch(/artık bu workspace’e atanmış değil/);
  });

  it('KRİTİK: adında bu yayının izi olan EK KOPYA da aynı atomik istekte kaldırılır', async () => {
    const g = await kapaliKurulmus();
    const K999 = `customers/${MUSTERI}/campaigns/999`;
    g.ekKopyalar = [K999];
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.kaldirmaGovdeleri).toHaveLength(1);
    expect(g.kaldirmaGovdeleri[0]!.mutateOperations).toEqual([{ campaignOperation: { remove: K555 } }, { campaignOperation: { remove: K999 } }]);
  });

  it('arama düşerse kaldırma YAPILMAZ (eksik hedefle "geri alındı" denmez)', async () => {
    const g = await kapaliKurulmus();
    g.aramaHatasi = new Error('INTERNAL');
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect(g.mutateSayisi).toBe(0);
    expect((await yayin()).sebep).toMatch(/aranamadı: INTERNAL/);
  });

  it('kaldırma sonrası durum okunamazsa yerinde kalır', async () => {
    const g = await kapaliKurulmus();
    g.durumOkumaHatasi = new Error('okuma düştü');
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'kapali_kuruldu' });
    expect((await yayin()).sebep).toMatch(/gönderildi ama sonuç okunamadı: okuma düştü/);
  });

  it('KRİTİK: kurulamadi (Google kesin reddetti, kimlik yok) → SIFIR Google çağrısıyla kapanır', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'permanent', 'INVALID_ARGUMENT');
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'kurulamadi' });
    g.mutateSayisi = 0;
    g.tokenSayisi = 0;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.mutateSayisi).toBe(0);
    expect(g.tokenSayisi).toBe(0);
    expect(await yayin()).toMatchObject({ sonlanma_sebebi: 'geri_alindi' });
  });

  it('sonuc_belirsiz (kimlik yok) → ad araması karar verir: kopya yoksa kaldırma olmadan kapanır', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'transient', 'zaman aşımı');
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'sonuc_belirsiz' });
    g.mutateSayisi = 0;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.mutateSayisi).toBe(0);
    expect((await yayin()).sebep).toMatch(/kampanya bulunmadı/);
  });

  it('sonuc_belirsiz ama Google’da kurulmuş → bulunan kampanya kaldırılır', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    g.mutateHatasi = new PlatformApiError('google', 'transient', 'zaman aşımı');
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'sonuc_belirsiz' });
    g.ekKopyalar = [`customers/${MUSTERI}/campaigns/321`, `customers/${MUSTERI}/campaigns/322`];
    g.mutateHatasi = null;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.kaldirmaGovdeleri[0]!.mutateOperations).toHaveLength(2);
  });

  it('geri alınamaz durumda (açık yayın) hiçbir şey yapmaz; çift tıklamada ikinci iş boşa döner', async () => {
    await yayinKur(false);
    const g = new SahteGoogle();
    expect(await isle(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    g.mutateSayisi = 0;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'iletildi' });
    expect(g.mutateSayisi).toBe(0);
  });

  it('ikinci geri al (zaten arşivde) Google’a gitmez', async () => {
    const g = await kapaliKurulmus();
    await geriAl(g);
    g.mutateSayisi = 0;
    expect(await geriAl(g)).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.mutateSayisi).toBe(0);
  });

  it('KRİTİK: worker `google_geri_al` işini Google işleyicisine yönlendiriyor (Meta motoruna DEĞİL)', async () => {
    // Yanlış dal sessiz olurdu: iş Meta motorunun son dalına (geri oku)
    // düşer ve Google hesabına Meta token'ıyla gider.
    const g = await kapaliKurulmus();
    const d = { tx, google: g, kilit: { al: async () => true, birak: async () => undefined }, kilitOneki: 'adv' } as unknown as Parameters<typeof reklamIsiniIsle>[0];
    expect(await reklamIsiniIsle(d, { yayinId: YAYIN, adim: 'google_geri_al' }, 'is-3')).toEqual({ tur: 'bitti', durum: 'arsivlendi' });
    expect(g.kaldirilan.has(K555)).toBe(true);
    const bos = { ...d, google: undefined } as Parameters<typeof reklamIsiniIsle>[0];
    await expect(reklamIsiniIsle(bos, { yayinId: YAYIN, adim: 'google_geri_al' }, 'is-4')).rejects.toThrow(/Google yayın erişimi/);
  });

  it('kilit doluysa ertelenir, Google’a istek yok', async () => {
    const g = await kapaliKurulmus();
    expect((await geriAl(g, false)).tur).toBe('ertele');
    expect(g.mutateSayisi).toBe(0);
  });
});
