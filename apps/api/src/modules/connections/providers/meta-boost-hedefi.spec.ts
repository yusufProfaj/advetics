import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOST_HEDEFLERI } from '@advetics/shared';
import type { BoostRequest, BoostSource } from '../provider.types';
import {
  MetaProvider,
  boostHedefiParametreleri,
  buildBoostAdSetParams,
  hedefUyustuMu,
  instagramCreativeBody,
} from './meta.provider';

/**
 * ═══ MCP BOOST'U — HEDEF EŞLEMESİ VE DURAKLATILMIŞ KURULUM ═══
 * (`docs/okuma-api/MCP-BOOST-MIMARI.md` § 2)
 *
 * Buradaki hataların hepsi SESSİZ: yanlış hedef Meta'da kabul edilip
 * başka bir sonuca para harcatır, "duraklatılmış" kurulumun son adımda
 * kampanyayı yine de açması onaysız harcama demektir. Panelin (hedefsiz)
 * gövdesinin DEĞİŞMEDİĞİ de kilitli: o yol canlıda doğrulandı.
 */

const NOW = new Date('2026-10-21T09:00:00.000Z');
const IG: Extract<BoostSource, { surface: 'instagram' }> = {
  surface: 'instagram',
  pageExternalId: '345736801957026',
  instagramUserId: '17841457593418725',
  mediaExternalId: '17895695668004550',
  mediaType: 'photo',
};
const FB: BoostSource = { surface: 'facebook_page', pageExternalId: 'page-1', postExternalId: 'post-1' };

function req(over: Partial<BoostRequest> = {}): BoostRequest {
  return {
    adAccountExternalId: '123',
    source: IG,
    budget: { mode: 'lifetime', totalMicros: 300_000_000n },
    durationDays: 5,
    objective: 'OUTCOME_ENGAGEMENT',
    currency: 'TRY',
    name: 'Boost',
    ...over,
  };
}

describe('boostHedefiParametreleri', () => {
  it('KRİTİK: her hedefin amaç + hedef + optimizasyon üçlüsü (Meta Ads MCP belgesi)', () => {
    const tablo = Object.fromEntries(
      BOOST_HEDEFLERI.map((h) => {
        const p = boostHedefiParametreleri(h, 'instagram', 'https://ornek.com');
        return [h, [p.objective, p.destinationType, p.optimizationGoal, p.dugme?.tip ?? null, p.sayfaGerekli]];
      }),
    );
    expect(tablo).toEqual({
      etkilesim: ['OUTCOME_ENGAGEMENT', 'ON_POST', 'POST_ENGAGEMENT', null, false],
      erisim: ['OUTCOME_AWARENESS', 'UNDEFINED', 'REACH', null, false],
      profil_ziyareti: ['OUTCOME_TRAFFIC', 'INSTAGRAM_PROFILE', 'VISIT_INSTAGRAM_PROFILE', 'VIEW_INSTAGRAM_PROFILE', true],
      mesaj: ['OUTCOME_ENGAGEMENT', 'INSTAGRAM_DIRECT', 'CONVERSATIONS', 'INSTAGRAM_MESSAGE', true],
      trafik: ['OUTCOME_TRAFFIC', 'WEBSITE', 'LINK_CLICKS', 'LEARN_MORE', false],
    });
  });

  it('KRİTİK: Facebook gönderisinde düğmeli hedef REDDEDİLİYOR, etkileşime düşmüyor', () => {
    for (const h of ['profil_ziyareti', 'mesaj', 'trafik'] as const) {
      expect(() => boostHedefiParametreleri(h, 'facebook_page', 'https://ornek.com')).toThrow(/yalnız Instagram/);
    }
    expect(boostHedefiParametreleri('etkilesim', 'facebook_page').objective).toBe('OUTCOME_ENGAGEMENT');
    expect(boostHedefiParametreleri('erisim', 'facebook_page').objective).toBe('OUTCOME_AWARENESS');
  });

  it('trafik adressiz ya da https olmadan kurulmuyor', () => {
    expect(() => boostHedefiParametreleri('trafik', 'instagram')).toThrow(/https/);
    expect(() => boostHedefiParametreleri('trafik', 'instagram', 'http://ornek.com')).toThrow(/https/);
    expect(boostHedefiParametreleri('trafik', 'instagram', 'https://ornek.com').dugme).toEqual({ tip: 'LEARN_MORE', link: 'https://ornek.com' });
  });
});

describe('ad set gövdesi', () => {
  it('KRİTİK: hedef YOKSA panelin canlıda doğrulanan gövdesi aynen', () => {
    const p = buildBoostAdSetParams(req({ source: FB }), 'c1', NOW);
    expect(p.optimization_goal).toBe('POST_ENGAGEMENT');
    expect(p.destination_type).toBe('ON_POST');
    expect(p.promoted_object).toBeUndefined();
  });

  it('KRİTİK: mesaj hedefi Direct + CONVERSATIONS + ana sayfa', () => {
    const p = buildBoostAdSetParams(req({ hedef: 'mesaj' }), 'c1', NOW);
    expect(p.optimization_goal).toBe('CONVERSATIONS');
    expect(p.destination_type).toBe('INSTAGRAM_DIRECT');
    expect(JSON.parse(p.promoted_object!)).toEqual({ page_id: IG.pageExternalId });
  });

  it('erişim hedefinde sayfa nesnesi gitmiyor', () => {
    const p = buildBoostAdSetParams(req({ hedef: 'erisim' }), 'c1', NOW);
    expect(p.optimization_goal).toBe('REACH');
    expect(p.destination_type).toBe('UNDEFINED');
    expect(p.promoted_object).toBeUndefined();
  });
});

describe('Instagram kreatifinin düğmesi', () => {
  it('KRİTİK: düğme yalnız hedef isterse; etkileşimde alan HİÇ yok', () => {
    expect(instagramCreativeBody(IG, 'B').call_to_action).toBeUndefined();
    expect(JSON.parse(instagramCreativeBody(IG, 'B', { tip: 'INSTAGRAM_MESSAGE' }).call_to_action!)).toEqual({ type: 'INSTAGRAM_MESSAGE' });
    expect(JSON.parse(instagramCreativeBody(IG, 'B', { tip: 'LEARN_MORE', link: 'https://o.com' }).call_to_action!)).toEqual({
      type: 'LEARN_MORE',
      value: { link: 'https://o.com' },
    });
  });
});

describe('hedefUyustuMu', () => {
  const p = boostHedefiParametreleri('mesaj', 'instagram');
  it('KRİTİK: optimizasyon ya da hedef farklıysa uyuşmuyor', () => {
    expect(hedefUyustuMu(p, 'CONVERSATIONS', 'INSTAGRAM_DIRECT')).toBe(true);
    expect(hedefUyustuMu(p, 'POST_ENGAGEMENT', 'INSTAGRAM_DIRECT')).toBe(false);
    expect(hedefUyustuMu(p, 'CONVERSATIONS', 'ON_POST')).toBe(false);
    expect(hedefUyustuMu(p, null, null)).toBe(false);
  });
  it('erişimde boş hedef uyuşma sayılıyor, optimizasyon yine birebir', () => {
    const e = boostHedefiParametreleri('erisim', 'instagram');
    expect(hedefUyustuMu(e, 'REACH', null)).toBe(true);
    expect(hedefUyustuMu(e, 'IMPRESSIONS', null)).toBe(false);
  });
});

describe('MetaProvider.createBoost — duraklatılmış kurulum', () => {
  let orijinal: typeof fetch;
  beforeEach(() => {
    orijinal = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = orijinal;
  });
  const yanit = (govde: unknown, status = 200) =>
    ({ ok: status < 300, status, headers: new Headers(), json: async () => govde, text: async () => JSON.stringify(govde) }) as unknown as Response;
  const provider = () => new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);

  /** Sahte Graph: her çağrıyı kaydeder; ad set geri okuması `geriOkuma` döner. */
  function sahteGraph(geriOkuma: Record<string, unknown>, kullaniciAdi: string | null = 'profaj') {
    const cagrilar: Array<{ yol: string; yontem: string; govde: URLSearchParams | null }> = [];
    globalThis.fetch = vi.fn(async (u: string, init?: RequestInit) => {
      const yol = new URL(u).pathname.replace('/v25.0/', '');
      const yontem = init?.method ?? 'GET';
      cagrilar.push({ yol, yontem, govde: init?.body ? new URLSearchParams(String(init.body)) : null });
      if (yontem === 'POST' && yol.endsWith('/campaigns')) return yanit({ id: 'c1' });
      if (yontem === 'POST' && yol.endsWith('/adsets')) return yanit({ id: 'as1' });
      if (yontem === 'POST' && yol.endsWith('/adcreatives')) return yanit({ id: 'cr1' });
      if (yontem === 'POST' && yol.endsWith('/ads')) return yanit({ id: 'ad1' });
      if (yontem === 'GET' && yol === 'cr1') return yanit({ source_instagram_media_id: IG.mediaExternalId, effective_instagram_media_id: IG.mediaExternalId });
      if (yontem === 'GET' && yol === 'as1') return yanit(geriOkuma);
      if (yontem === 'GET' && yol === IG.instagramUserId) return yanit(kullaniciAdi === null ? {} : { username: kullaniciAdi });
      return yanit({ success: true });
    }) as unknown as typeof fetch;
    return cagrilar;
  }

  it('KRİTİK: duraklatılmış kurulumda kampanya ACTIVE yapılmıyor; hedef geri okunuyor', async () => {
    const c = sahteGraph({ optimization_goal: 'CONVERSATIONS', destination_type: 'INSTAGRAM_DIRECT' });
    const r = await provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ hedef: 'mesaj', duraklatilmis: true }));
    // Kampanyanın KENDİ yoluna (`c1`) hiçbir POST gitmedi: yayına alma yok.
    expect(c.filter((x) => x.yontem === 'POST' && x.yol === 'c1')).toHaveLength(0);
    const kampanya = c.find((x) => x.yol.endsWith('/campaigns'))!;
    expect(kampanya.govde!.get('status')).toBe('PAUSED');
    expect(kampanya.govde!.get('objective')).toBe('OUTCOME_ENGAGEMENT');
    expect(JSON.parse(c.find((x) => x.yol.endsWith('/adcreatives'))!.govde!.get('call_to_action')!)).toEqual({ type: 'INSTAGRAM_MESSAGE' });
    expect(r.hedefGeriOkuma).toEqual({ optimizationGoal: 'CONVERSATIONS', destinationType: 'INSTAGRAM_DIRECT', uyustu: true });
  });

  it('KRİTİK: panel yolu (duraklatma yok) kampanyayı yine yayına alıyor ve geri okuma yapmıyor', async () => {
    const c = sahteGraph({});
    const r = await provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req());
    const acma = c.filter((x) => x.yontem === 'POST' && x.yol === 'c1');
    expect(acma).toHaveLength(1);
    expect(acma[0]!.govde!.get('status')).toBe('ACTIVE');
    expect(r.hedefGeriOkuma).toBeUndefined();
    expect(c.some((x) => x.yontem === 'GET' && x.yol === 'as1')).toBe(false);
  });

  it('KRİTİK (canlıda öğrenildi): profil düğmesi kullanıcı adından adres taşıyor, okuma kampanyadan ÖNCE', async () => {
    const c = sahteGraph({ optimization_goal: 'VISIT_INSTAGRAM_PROFILE', destination_type: 'INSTAGRAM_PROFILE' });
    await provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ hedef: 'profil_ziyareti', duraklatilmis: true }));
    expect(JSON.parse(c.find((x) => x.yol.endsWith('/adcreatives'))!.govde!.get('call_to_action')!)).toEqual({
      type: 'VIEW_INSTAGRAM_PROFILE',
      value: { link: 'https://www.instagram.com/profaj/' },
    });
    expect(c.findIndex((x) => x.yol === IG.instagramUserId)).toBeLessThan(c.findIndex((x) => x.yol.endsWith('/campaigns')));
  });

  it('KRİTİK: kullanıcı adı okunamazsa HİÇBİR ŞEY açılmıyor', async () => {
    const c = sahteGraph({}, null);
    await expect(provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ hedef: 'profil_ziyareti', duraklatilmis: true }))).rejects.toThrow(/kullanıcı adı okunamadı/);
    expect(c.filter((x) => x.yontem === 'POST')).toHaveLength(0);
  });

  it('KRİTİK: Meta başka optimizasyon yazdıysa "uyuşmadı" dönüyor', async () => {
    sahteGraph({ optimization_goal: 'POST_ENGAGEMENT', destination_type: 'ON_POST' });
    const r = await provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ hedef: 'profil_ziyareti', duraklatilmis: true }));
    expect(r.hedefGeriOkuma?.uyustu).toBe(false);
  });

  it('KRİTİK: var olan kampanyada duraklatılmış kurulum HİÇBİR ŞEY açılmadan reddediliyor', async () => {
    const c = sahteGraph({});
    await expect(
      provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ duraklatilmis: true, campaign: { mode: 'existing', externalCampaignId: 'eski' } })),
    ).rejects.toThrow(/yalnız yeni kampanyada/);
    expect(c).toHaveLength(0);
  });

  it('KRİTİK: Facebook gönderisinde mesaj hedefi HİÇBİR ŞEY açılmadan reddediliyor', async () => {
    const c = sahteGraph({});
    await expect(provider().createBoost({ accessToken: 'T', accountExternalId: '123' }, req({ source: FB, hedef: 'mesaj', duraklatilmis: true }))).rejects.toThrow(/yalnız Instagram/);
    expect(c).toHaveLength(0);
  });

  it('boostZamanla başlangıç ve bitişi ad set\'e yazıyor; ters takvimi reddediyor', async () => {
    const c = sahteGraph({});
    const bas = new Date('2026-10-25T08:00:00.000Z');
    const bit = new Date('2026-10-30T08:00:00.000Z');
    await provider().boostZamanla({ accessToken: 'T', accountExternalId: '123' }, 'as1', bas, bit);
    expect(c[0]!.yol).toBe('as1');
    expect(c[0]!.govde!.get('start_time')).toBe(bas.toISOString());
    expect(c[0]!.govde!.get('end_time')).toBe(bit.toISOString());
    await expect(provider().boostZamanla({ accessToken: 'T', accountExternalId: '123' }, 'as1', bit, bas)).rejects.toThrow(/sonra/);
  });
});
