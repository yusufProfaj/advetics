import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DERLENEN_NIYETLER,
  DERLEYICI_NIYETLERI,
  DERLEYICI_SURUMU,
  ERISIM_SIKLIK_SINIRI,
  MANIFESTO,
  NIYET_KATALOGU,
  manifestoSatiriGecerli,
  tanitilanTuru,
  TANINAN_OZELLIK_ANAHTARLARI,
  WHATSAPP_BAGLANTISI,
  derleMeta,
  type DerlemeGirdisi,
  type MetaGovdesi,
} from '@advetics/shared';

const TL = (n: number) => BigInt(n) * 1_000_000n;
const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-07',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: {
    konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }],
    enDusukYas: 18,
    ipucuYas: null,
    ipucuCinsiyet: null,
  },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [
    { gorselHash: 'h1', baslik: 'B1', metin: 'M1' },
    { gorselHash: 'h2', baslik: 'B2', metin: 'M2' },
  ],
  hedefAdres: 'https://ornek.com.tr/kampanya',
  formId: null,
  telefon: null,
  urlEtiketleri: 'utm_source=meta',
};

function govde(g: Partial<DerlemeGirdisi> = {}) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r;
}
const bul = (gs: MetaGovdesi[], ad: string) => gs.find((x) => x.ad === ad)!.alanlar as Record<string, any>;
const retler = (g: Partial<DerlemeGirdisi>) => {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};

describe('derleMeta — yapı', () => {
  it('1 kampanya + 1 reklam seti + kavram başına kreatif ve reklam, zincir sırasıyla', () => {
    expect(govde().govdeler.map((x) => x.ad)).toEqual([
      'kampanya', 'reklam_seti', 'kreatif:1', 'reklam:1', 'kreatif:2', 'reklam:2',
    ]);
  });

  it('KRİTİK M-01: her nesne PAUSED ve "açılmadı" önekiyle', () => {
    for (const g of govde().govdeler) {
      if (g.nesne !== 'kreatif') expect(g.alanlar.status, g.ad).toBe('PAUSED');
      expect(String(g.alanlar.name)).toMatch(/^\[Advetics: açılmadı\] /);
    }
  });

  it('KRİTİK: bütçe KURUŞ olarak kampanyada; paylaşım alanı yok', () => {
    const k = bul(govde().govdeler, 'kampanya');
    expect(k.daily_budget).toBe('50000');
    expect(k).not.toHaveProperty('is_adset_budget_sharing_enabled');
    expect(bul(govde().govdeler, 'reklam_seti')).not.toHaveProperty('daily_budget');
  });

  it('aynı girdi iki kez derlenince AYNI çıktı (determinizm)', () => {
    expect(JSON.stringify(govde().govdeler)).toBe(JSON.stringify(govde().govdeler));
  });

  it('CTA ikinci kavramda da var (eski kodun 2.+ reklam hatası)', () => {
    const gs = govde().govdeler;
    expect(bul(gs, 'kreatif:2').object_story_spec.link_data.call_to_action).toEqual({
      type: 'LEARN_MORE', value: { link: 'https://ornek.com.tr/kampanya' },
    });
    expect(bul(gs, 'reklam:2').creative).toEqual({ creative_id: '{kreatif:2}' });
  });

  it('FORM: form kimliği YALNIZ CTA değerinde, promoted_object’te değil', () => {
    const gs = govde({ niyet: 'FORM', formId: '{form}', hedefAdres: null }).govdeler;
    expect(bul(gs, 'kreatif:1').object_story_spec.link_data.call_to_action).toEqual({
      type: 'SIGN_UP', value: { lead_gen_form_id: '{form}' },
    });
    expect(bul(gs, 'reklam_seti').promoted_object).toEqual({ page_id: '111' });
    expect(bul(gs, 'reklam_seti').destination_type).toBe('ON_AD');
  });

  it('KRİTİK: kreatif özellik anahtarları CANLIDA ÖLÇÜLEN küme (2026-10-07, v25.0) — belgeden anahtar eklenmez', () => {
    expect([...TANINAN_OZELLIK_ANAHTARLARI]).toEqual([
      'IG_VIDEO_NATIVE_SUBTITLE', 'IMAGE_ANIMATION', 'PRODUCT_BROWSING', 'PRODUCT_METADATA_AUTOMATION',
      'PROFILE_CARD', 'STANDARD_ENHANCEMENTS_CATALOG', 'TEXT_OVERLAY_TRANSLATION',
    ]);
  });

  it('her tanınan Advantage+ creative anahtarı OPT_OUT; yan yana reklam OPT_OUT', () => {
    const k = bul(govde().govdeler, 'kreatif:1');
    for (const a of TANINAN_OZELLIK_ANAHTARLARI) {
      expect(k.degrees_of_freedom_spec.creative_features_spec[a], a).toEqual({ enroll_status: 'OPT_OUT' });
    }
    expect(k.contextual_multi_ads).toEqual({ enroll_status: 'OPT_OUT' });
  });
});

describe('video fikri', () => {
  it('KRİTİK: video_data kuruluyor (link_data DEĞİL); kapak hash’i, başlık ve aynı CTA', () => {
    const r = govde({ kavramlar: [{ gorselHash: 'KAPAK', videoId: 'VID', baslik: 'B', metin: 'M' }] });
    const oss = bul(r.govdeler, 'kreatif:1').object_story_spec;
    expect(oss).not.toHaveProperty('link_data');
    expect(oss.video_data).toEqual({
      video_id: 'VID',
      image_hash: 'KAPAK',
      title: 'B',
      message: 'M',
      call_to_action: { type: 'LEARN_MORE', value: { link: 'https://ornek.com.tr/kampanya' } },
    });
  });

  it('FORM videosunda CTA form kimliğini taşıyor', () => {
    const r = govde({ niyet: 'FORM', formId: '{form}', hedefAdres: null, kavramlar: [{ gorselHash: 'K', videoId: 'V', baslik: 'B', metin: 'M' }] });
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action).toEqual({
      type: 'SIGN_UP', value: { lead_gen_form_id: '{form}', link: 'http://fb.me/' },
    });
  });
});

describe('manifesto', () => {
  const dallar: Array<[string, Partial<DerlemeGirdisi>]> = [
    ['SITE', {}],
    ['FORM', { niyet: 'FORM', formId: '{form}', hedefAdres: null }],
    ['konut', { kategoriler: { taban: ['HOUSING'], ek: [] } }],
    ['toplam bütçe', { butce: { tip: 'toplam', micros: TL(5000), seviye: 'kampanya' }, takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: '2026-10-20T23:59:00+0300' } }],
    ['v26', { apiSurumu: 'v26.0' }],
  ];
  for (const [ad, g] of dallar) {
    it(`${ad}: her manifesto satırı açıkça yazılı`, () => {
      const r = govde(g);
      const kategori = (g.kategoriler?.taban.length ?? 0) > 0;
      const niyet = g.niyet ?? temel.niyet;
      for (const s of MANIFESTO) {
        if (!manifestoSatiriGecerli(s.kosul, { kategoriVar: kategori, instagram: true, tanitilan: tanitilanTuru(niyet), erisim: NIYET_KATALOGU[niyet].meta?.optimizationGoal === 'REACH' })) continue;
        for (const gv of r.govdeler.filter((x) => x.nesne === s.nesne)) {
          const yollar = typeof s.yol === 'string' ? [s.yol] : s.yol;
          expect(yollar.some((y) => r.acikcaYazilanAlanlar.includes(`${s.nesne}:${y}`)), `${s.kod} ${gv.ad}`).toBe(true);
        }
      }
    });
  }

  it('KRİTİK M-04: konutta ülke kümesi kampanyada, vergi ülkesine bırakılmıyor', () => {
    const k = bul(govde({ kategoriler: { taban: ['HOUSING'], ek: [] } }).govdeler, 'kampanya');
    expect(k.special_ad_categories).toEqual(['HOUSING']);
    expect(k.special_ad_category_country).toEqual(['TR']);
  });

  it('KRİTİK: yerleşim alanı HİÇ yazılmıyor (Advantage+ yerleşim), age_max yok', () => {
    const t = bul(govde().govdeler, 'reklam_seti').targeting;
    for (const y of ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'age_max']) {
      expect(t, y).not.toHaveProperty(y);
    }
  });

  it('KRİTİK: atıf NİYET BAŞINA — form ve site ziyareti 1 gün tıklama (S-07)', () => {
    // FORM ÖLÇÜLDÜ (2026-10-11, canlı tur): anlık formlu reklam seti 7 gün
    // tıklamayı "(1, 0)" ile REDDETTİ. Ajans standardı form için geçerli değil.
    for (const atif of ['tik7', 'tik7_gor1'] as const) {
      expect(bul(govde({ atif, niyet: 'FORM', formId: '{form}', hedefAdres: null }).govdeler, 'reklam_seti').attribution_spec).toEqual([
        { event_type: 'CLICK_THROUGH', window_days: 1 },
      ]);
    }
    // Site ziyaretinde ajans standardı Meta'da geçerli değil: yazılsa ya
    // reddedilir ya sessizce değişirdi.
    expect(bul(govde({ atif: 'tik7_gor1', niyet: 'SITE' }).govdeler, 'reklam_seti').attribution_spec).toEqual([
      { event_type: 'CLICK_THROUGH', window_days: 1 },
    ]);
  });

  it('KRİTİK: ekran yalnız gerçekten kapattığımızı "kapalı" diyor; kapatamadıklarımız ayrı listede', () => {
    const d = derleMeta(temel);
    if (d.tur !== 'govde') throw new Error('gövde bekleniyordu');
    expect(d.kapattiklarimiz.join(' ')).not.toMatch(/metni değiştirmesi kapalı/);
    expect(d.metaOtomatikYapabilir).toContain('metnin farklı varyasyonlarını gösterebilir');
  });
});

describe('sıfır çağrılı retler', () => {
  it('atıf standardı seçilmeden yayın yok (OK-16)', () => {
    expect(retler({ atif: null })).toEqual(['OK-16']);
  });
  it('konum boşsa ret, gövde yok', () => {
    expect(retler({ hedefleme: { ...temel.hedefleme, konumlar: [] } })).toEqual(['KNM-01']);
  });
  it('ölçülmemiş niyet tahminle derlenmez; yönlendirme niyeti hiç derlenmez', () => {
    expect(retler({ niyet: 'IG_MESAJ' })).toEqual(['NYT-OLCULMEDI']);
    expect(retler({ niyet: 'ONE_CIKAR' })).toEqual(['NYT-YONLENDIRME']);
  });
  it('KRİTİK: TELEFON numarasız ya da ülke kodsuz derlenmez (TEL-YOK)', () => {
    expect(retler({ niyet: 'TELEFON', telefon: null })).toEqual(['TEL-YOK']);
    expect(retler({ niyet: 'TELEFON', telefon: '05321234567' })).toEqual(['TEL-YOK']);
    expect(retler({ niyet: 'TELEFON', telefon: '+90 532 123 45 67' })).toEqual(['TEL-YOK']);
    // B4: yalnız +90 ve 10 hane. Başka ülke kodu TR hedeflemesiyle sessizce
    // derleniyordu; mesaj zaten "+90 ile başlamalı" diyor.
    expect(retler({ niyet: 'TELEFON', telefon: '+442071234567' })).toEqual(['TEL-YOK']);
    expect(retler({ niyet: 'TELEFON', telefon: '+9053212345' })).toEqual(['TEL-YOK']);
  });
  it('numara yalnız TELEFON’da okunur: SITE numarasız derlenir', () => {
    expect(retler({ telefon: null })).toEqual([]);
  });
  it('site adresi https değilse, toplam bütçede bitiş yoksa, fikir sayısı yanlışsa', () => {
    expect(retler({ hedefAdres: 'http://ornek.com' })).toEqual(['SITE-ADRES']);
    expect(retler({ butce: { tip: 'toplam', micros: TL(5000), seviye: 'kampanya' } })).toEqual(['BTC-02']);
    expect(retler({ kavramlar: [] })).toEqual(['KRT-SAYI']);
  });
  it('kuruşu tam olmayan bütçe kırpılmaz, reddedilir', () => {
    expect(retler({ butce: { tip: 'gunluk', micros: 500_001n, seviye: 'kampanya' } })).toEqual(['BTC-01']);
  });
});

/*
 * DALGA 2: ARAMA VE WHATSAPP REKLAMI. Altın gövdeler: kreatifin
 * `object_story_spec`i ve reklam setinin niyete bağlı alanları TAM olarak
 * karşılaştırılıyor; bir alanın eklenmesi ya da düşmesi testi kırmalı.
 */
const TEL = '+905321234567';
const telefonGirdisi: Partial<DerlemeGirdisi> = { niyet: 'TELEFON', telefon: TEL, hedefAdres: null };
const WA = '+905559876543';
const waGirdisi: Partial<DerlemeGirdisi> = { niyet: 'WHATSAPP', hedefAdres: null, whatsappNumarasi: WA };

describe('TELEFON (arama düğmeli reklam)', () => {
  it('KRİTİK: altın kreatif — numara CTA’da tel: ile, link sayfanın adresi', () => {
    const oss = bul(govde(telefonGirdisi).govdeler, 'kreatif:1').object_story_spec;
    expect(oss).toEqual({
      page_id: '111',
      instagram_user_id: '222',
      link_data: {
        image_hash: 'h1',
        name: 'B1',
        message: 'M1',
        call_to_action: { type: 'CALL_NOW', value: { link: `tel:${TEL}` } },
        // ÖLÇÜLMEDİ (derle.ts `sayfaAdresi`): Meta belgesindeki "işletme
        // sayfası adresi". Canlı provada doğrulanacak.
        link: 'https://facebook.com/111',
      },
    });
  });

  it('KRİTİK: site adresi verilse bile link sayfa adresi (gövde taslağa göre değişmez)', () => {
    const oss = bul(govde({ ...telefonGirdisi, hedefAdres: 'https://ornek.com.tr' }).govdeler, 'kreatif:1').object_story_spec;
    expect(oss.link_data.link).toBe('https://facebook.com/111');
    expect(oss.link_data.call_to_action.value).toEqual({ link: `tel:${TEL}` });
  });

  it('KRİTİK: reklam seti QUALITY_CALL + PHONE_CALL, kampanya OUTCOME_LEADS, atıf 1 gün tıklama', () => {
    const gs = govde({ ...telefonGirdisi, atif: 'tik7_gor1' }).govdeler;
    const rs = bul(gs, 'reklam_seti');
    expect(rs.optimization_goal).toBe('QUALITY_CALL');
    expect(rs.destination_type).toBe('PHONE_CALL');
    expect(rs.promoted_object).toEqual({ page_id: '111' });
    // Ajans standardı (7 gün) arama hedefinde Meta'da geçerli değil (S-07).
    expect(rs.attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
    expect(bul(gs, 'kampanya').objective).toBe('OUTCOME_LEADS');
  });

  it('CTA ikinci kavramda da aynı', () => {
    expect(bul(govde(telefonGirdisi).govdeler, 'kreatif:2').object_story_spec.link_data.call_to_action).toEqual({
      type: 'CALL_NOW', value: { link: `tel:${TEL}` },
    });
  });

  it('video fikrinde CTA aynı numarayı taşıyor', () => {
    const r = govde({ ...telefonGirdisi, kavramlar: [{ gorselHash: 'K', videoId: 'V', baslik: 'B', metin: 'M' }] });
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action).toEqual({
      type: 'CALL_NOW', value: { link: `tel:${TEL}` },
    });
  });
});

describe('WHATSAPP (Click-to-WhatsApp)', () => {
  it('KRİTİK: altın kreatif — sabit bağlantı, CTA app_destination, numara kreatifte YOK (reklam setinde)', () => {
    const oss = bul(govde(waGirdisi).govdeler, 'kreatif:1').object_story_spec;
    expect(oss).toEqual({
      page_id: '111',
      instagram_user_id: '222',
      link_data: {
        image_hash: 'h1',
        name: 'B1',
        message: 'M1',
        call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
        link: 'https://api.whatsapp.com/send',
      },
    });
  });

  it('KRİTİK: site adresi taslakta dursa bile CTA’ya { link } düşmez (düğme web sayfasına dönerdi)', () => {
    const r = govde({ ...waGirdisi, hedefAdres: 'https://ornek.com.tr' });
    const ld = bul(r.govdeler, 'kreatif:1').object_story_spec.link_data;
    expect(ld.call_to_action.value).toEqual({ app_destination: 'WHATSAPP' });
    expect(ld.link).toBe('https://api.whatsapp.com/send');
    expect(JSON.stringify(r.govdeler)).not.toContain('ornek.com.tr');
  });

  it('ARAMA numarası (`telefon`) WhatsApp gövdesine HİÇ girmez; yalnız WhatsApp hattı', () => {
    expect(JSON.stringify(govde({ ...waGirdisi, telefon: TEL }).govdeler)).not.toContain('905321234567');
  });

  it('KRİTİK: reklam seti CONVERSATIONS + WHATSAPP + sayfa + AÇIK numara; atıf 1 gün tıklama', () => {
    const rs = bul(govde({ ...waGirdisi, atif: 'tik7_gor1' }).govdeler, 'reklam_seti');
    expect(rs.optimization_goal).toBe('CONVERSATIONS');
    expect(rs.destination_type).toBe('WHATSAPP');
    // Dalga 3: hat açıkça; Meta sayfaya bağlı olmayan numarayı reddetmeli
    // (sessizce başka hatta düşmek yerine açık hata). Biçim ÖLÇÜLMEDİ.
    expect(rs.promoted_object).toEqual({ page_id: '111', whatsapp_phone_number: WA });
    expect(rs.attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
  });

  it('video fikrinde de app_destination', () => {
    const r = govde({ ...waGirdisi, kavramlar: [{ gorselHash: 'K', videoId: 'V', baslik: 'B', metin: 'M' }] });
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action).toEqual({
      type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' },
    });
  });

  it('KRİTİK: eski kurucu (meta.provider.ts) AYNI sabit bağlantıyı ve CTA değerini yazıyor', () => {
    // İki kurucu aynı reklamı üretiyor; biri değişip diğeri kalırsa Akıllı
    // Boost ile AdvCampaign aynı sayfa için farklı WhatsApp reklamı kurar.
    const eski = readFileSync(join(__dirname, '../../connections/providers/meta.provider.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(eski).toContain('function buildCreativeSpec(');
    expect(eski).toContain(`'${WHATSAPP_BAGLANTISI}'`);
    expect(eski).toContain("{ app_destination: 'WHATSAPP' }");
  });
});

describe('Dalga 2 sürüm ve açılış', () => {
  it('derleyici sürümü yükseldi: eski provalar yeni gövdeyi kanıtlamaz', () => {
    // 1.3.0: video izlenme, erişim ve satış derleniyor; WhatsApp numarası
    // reklam setinde; erişimde sıklık sınırı (Dalga 3).
    // 1.3.1: banner seti yokken yerleşim planı birleşim.
    // 1.3.2: kreatif adı 100 karaktere sığdırılıyor.
    expect(DERLEYICI_SURUMU).toBe('1.3.2');
  });

  it('KRİTİK: TELEFON/WHATSAPP derleniyor ama üründe AÇIK DEĞİL (canlı tur bekliyor)', () => {
    expect([...DERLEYICI_NIYETLERI]).toEqual(['FORM', 'SITE', 'TELEFON', 'WHATSAPP', 'VIDEO_IZLENME', 'ERISIM', 'SATIS']);
    // AI taslağı ve AdvStrategy aktarımı bu listeyi okuyor; canlı provadan
    // önce genişlerse arama/WhatsApp reklamı sohbetten kurulabilir hâle gelir.
    expect([...DERLENEN_NIYETLER]).toEqual(['FORM', 'SITE']);
  });

  it('manifesto TELEFON ve WHATSAPP gövdelerinde de eksiksiz', () => {
    for (const g of [telefonGirdisi, waGirdisi]) {
      const r = govde(g);
      for (const s of MANIFESTO.filter((x) => !x.kosul || x.kosul === tanitilanTuru(g.niyet!))) {
        for (const gv of r.govdeler.filter((x) => x.nesne === s.nesne)) {
          const yollar = typeof s.yol === 'string' ? [s.yol] : s.yol;
          expect(yollar.some((y) => r.acikcaYazilanAlanlar.includes(`${s.nesne}:${y}`)), `${s.kod} ${gv.ad}`).toBe(true);
        }
      }
    }
  });
});

describe('kreatif adı 100 karakter (satış canlı turu, 2026-10-11)', () => {
  it('KRİTİK: uzun amaç adında kreatif adı 100 karaktere sığar; Fikir N ve kısa kimlik korunur', async () => {
    const { kreatifAdi, reklamAdi, ACILMADI_ONEKI, META_KREATIF_AD_SINIRI } = await import('@advetics/shared');
    const g = { workspaceKisaAdi: 'Ege Birlik Yapı', niyet: 'SATIS' as const, tarih: '2026-10-11', yayinKimligi: '49cb0000-0000-4000-8000-000000000000' };
    expect([...(ACILMADI_ONEKI + reklamAdi(g, 1))].length).toBeGreaterThan(META_KREATIF_AD_SINIRI);
    const ad = kreatifAdi(g, 1, ACILMADI_ONEKI);
    expect([...ad].length).toBeLessThanOrEqual(META_KREATIF_AD_SINIRI);
    expect(ad.endsWith('· 2026-10-11 · 49CB · Fikir 1')).toBe(true);
    expect(ad).toContain('…');
    // Sığan ad dokunulmadan kalır.
    const kisa = { ...g, niyet: 'SITE' as const };
    expect(kreatifAdi(kisa, 2, ACILMADI_ONEKI)).toBe(ACILMADI_ONEKI + reklamAdi(kisa, 2));
  });
  it('derleyici kreatif gövdesinde bu adı kullanıyor', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const k = readFileSync(join(__dirname, '../../../../../../packages/shared/src/reklam/meta/derle.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(k).toContain('name: kreatifAdi(adG, n, ACILMADI_ONEKI)');
  });
});
