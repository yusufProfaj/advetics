import { describe, expect, it } from 'vitest';
import {
  ERISIM_SIKLIK_SINIRI,
  MANIFESTO,
  derleMeta,
  manifestoSatiriGecerli,
  tanitilanTuru,
  videoDugmesiVar,
  type DerlemeGirdisi,
  type MetaGovdesi,
} from '@advetics/shared';

/*
 * DALGA 3: VİDEO İZLENME, ERİŞİM, SATIŞ, WHATSAPP NUMARASI. Altın gövdeler
 * kreatifin `object_story_spec`ini ve reklam setinin niyete bağlı alanlarını
 * TAM karşılaştırıyor; bir alan eklenir ya da düşerse test kırılmalı.
 * Fikstür `derle.spec.ts` ile aynı biçimde (oradaki `temel`).
 */
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

const WA = '+905559876543';
const waGirdisi: Partial<DerlemeGirdisi> = { niyet: 'WHATSAPP', hedefAdres: null, whatsappNumarasi: WA };
const VIDEO_FIKRI = { gorselHash: 'KAPAK', videoId: 'VID', baslik: 'B', metin: 'M' };
const videoGirdisi: Partial<DerlemeGirdisi> = { niyet: 'VIDEO_IZLENME', hedefAdres: null, kavramlar: [VIDEO_FIKRI] };
const erisimGirdisi: Partial<DerlemeGirdisi> = { niyet: 'ERISIM', hedefAdres: null };
const PIKSEL = '424242424242';
const satisGirdisi: Partial<DerlemeGirdisi> = { niyet: 'SATIS', pikselId: PIKSEL };

describe('VIDEO_IZLENME (Videom izlensin)', () => {
  it('KRİTİK: altın kreatif — video_data, adres yoksa DÜĞMESİZ (S3; eskiden Facebook sayfasına bağlanıyordu)', () => {
    const oss = bul(govde(videoGirdisi).govdeler, 'kreatif:1').object_story_spec;
    expect(oss).toEqual({
      page_id: '111',
      instagram_user_id: '222',
      video_data: {
        video_id: 'VID',
        image_hash: 'KAPAK',
        title: 'B',
        message: 'M',
      },
    });
  });

  it('KRİTİK: site adresi verilirse düğme ona gider; link null GİTMEZ', () => {
    const r = govde({ ...videoGirdisi, hedefAdres: 'https://ornek.com.tr/v' });
    expect(bul(r.govdeler, 'kreatif:1').object_story_spec.video_data.call_to_action.value).toEqual({ link: 'https://ornek.com.tr/v' });
    expect(JSON.stringify(govde(videoGirdisi).govdeler)).not.toContain('"link":null');
  });

  it('KRİTİK: reklam seti THRUPLAY + ON_VIDEO + sayfa, kampanya ENGAGEMENT; sıklık sınırı YOK', () => {
    const r = govde(videoGirdisi);
    const rs = bul(r.govdeler, 'reklam_seti');
    expect(bul(r.govdeler, 'kampanya').objective).toBe('OUTCOME_ENGAGEMENT');
    expect(rs.optimization_goal).toBe('THRUPLAY');
    expect(rs.destination_type).toBe('ON_VIDEO');
    expect(rs.promoted_object).toEqual({ page_id: '111' });
    expect(rs).not.toHaveProperty('frequency_control_specs');
    // ÖLÇÜLMEDİ: 1 gün tıklama (derle.ts atıf notu); canlı tur söyleyecek.
    expect(rs.attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
  });

  it('KRİTİK: görsel fikri bu amaçta derlenmez (KRT-VIDEO-ZORUNLU)', () => {
    expect(retler({ ...videoGirdisi, kavramlar: [VIDEO_FIKRI, { gorselHash: 'h', baslik: 'B', metin: 'M' }] })).toEqual(['KRT-VIDEO-ZORUNLU']);
  });

  it('verilen adres https değilse ret (isteğe bağlı alan da geçerli olmalı)', () => {
    expect(retler({ ...videoGirdisi, hedefAdres: 'http://ornek.com' })).toEqual(['SITE-ADRES']);
  });
});

describe('ERISIM (Bölgemde çok kişi görsün)', () => {
  it('KRİTİK: reklam seti REACH + haftada en çok 2 sıklık sınırı; destination_type YOK', () => {
    const r = govde(erisimGirdisi);
    const rs = bul(r.govdeler, 'reklam_seti');
    expect(bul(r.govdeler, 'kampanya').objective).toBe('OUTCOME_AWARENESS');
    expect(rs.optimization_goal).toBe('REACH');
    expect(rs.frequency_control_specs).toEqual([{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 2 }]);
    expect(rs).not.toHaveProperty('destination_type');
    expect(rs.promoted_object).toEqual({ page_id: '111' });
    expect(rs.attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
  });

  it('KRİTİK: sıklık sözü amaç kartıyla AYNI (haftada en çok 2)', () => {
    expect(ERISIM_SIKLIK_SINIRI).toEqual([{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 2 }]);
  });

  it('KRİTİK: altın kreatif — adres yoksa sayfa, varsa site', () => {
    const ld = bul(govde(erisimGirdisi).govdeler, 'kreatif:1').object_story_spec.link_data;
    expect(ld).toEqual({
      image_hash: 'h1',
      name: 'B1',
      message: 'M1',
      call_to_action: { type: 'LEARN_MORE', value: { link: 'https://facebook.com/111' } },
      link: 'https://facebook.com/111',
    });
    const ld2 = bul(govde({ ...erisimGirdisi, hedefAdres: 'https://ornek.com.tr' }).govdeler, 'kreatif:1').object_story_spec.link_data;
    expect(ld2.link).toBe('https://ornek.com.tr');
    expect(ld2.call_to_action.value).toEqual({ link: 'https://ornek.com.tr' });
  });

  it('sıklık sınırı yalnız erişimde: site reklamında yok', () => {
    expect(bul(govde().govdeler, 'reklam_seti')).not.toHaveProperty('frequency_control_specs');
  });
});

describe('SATIS (Sitemden satış gelsin)', () => {
  it('KRİTİK: reklam seti promoted_object = piksel + PURCHASE, sayfa kimliği YOK', () => {
    const rs = bul(govde(satisGirdisi).govdeler, 'reklam_seti');
    expect(rs.promoted_object).toEqual({ pixel_id: PIKSEL, custom_event_type: 'PURCHASE' });
    expect(rs.optimization_goal).toBe('OFFSITE_CONVERSIONS');
    expect(rs.destination_type).toBe('WEBSITE');
  });

  it('KRİTİK: satışta ajans atıf standardı uygulanır (dönüşüm optimizasyonu)', () => {
    expect(bul(govde({ ...satisGirdisi, atif: 'tik7_gor1' }).govdeler, 'reklam_seti').attribution_spec).toEqual([
      { event_type: 'CLICK_THROUGH', window_days: 7 },
      { event_type: 'VIEW_THROUGH', window_days: 1 },
    ]);
  });

  it('KRİTİK: altın kreatif — SHOP_NOW, site adresi', () => {
    const ld = bul(govde(satisGirdisi).govdeler, 'kreatif:1').object_story_spec.link_data;
    expect(ld).toEqual({
      image_hash: 'h1',
      name: 'B1',
      message: 'M1',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://ornek.com.tr/kampanya' } },
      link: 'https://ornek.com.tr/kampanya',
    });
  });

  it('KRİTİK: pikselsiz ya da adressiz satış derlenmez', () => {
    expect(retler({ niyet: 'SATIS', pikselId: null })).toEqual(['PIKSEL-YOK']);
    expect(retler({ niyet: 'SATIS' })).toEqual(['PIKSEL-YOK']);
    expect(retler({ niyet: 'SATIS', pikselId: 'abc' })).toEqual(['PIKSEL-YOK']);
    expect(retler({ ...satisGirdisi, hedefAdres: null })).toEqual(['SITE-ADRES']);
  });
});

describe('WHATSAPP numarası (Dalga 3)', () => {
  it('KRİTİK: numarasız ya da +90 dışı WhatsApp derlenmez (WA-NUMARA)', () => {
    expect(retler({ niyet: 'WHATSAPP', hedefAdres: null })).toEqual(['WA-NUMARA']);
    expect(retler({ niyet: 'WHATSAPP', hedefAdres: null, whatsappNumarasi: '05551234567' })).toEqual(['WA-NUMARA']);
    expect(retler({ niyet: 'WHATSAPP', hedefAdres: null, whatsappNumarasi: '+442071234567' })).toEqual(['WA-NUMARA']);
  });

  it('KRİTİK: numara reklam setinde, kreatifte yok', () => {
    const r = govde(waGirdisi);
    expect(bul(r.govdeler, 'reklam_seti').promoted_object).toEqual({ page_id: '111', whatsapp_phone_number: WA });
    expect(JSON.stringify(bul(r.govdeler, 'kreatif:1'))).not.toContain('905559876543');
  });

  it('numara yalnız WhatsApp’ta: site gövdesine girmez', () => {
    expect(JSON.stringify(govde({ whatsappNumarasi: WA }).govdeler)).not.toContain('905559876543');
  });
});

describe('Dalga 3 manifesto', () => {
  it('KRİTİK: yeni amaçların gövdelerinde geçerli her manifesto satırı açıkça yazılı', () => {
    for (const g of [videoGirdisi, erisimGirdisi, satisGirdisi, waGirdisi]) {
      const r = govde(g);
      // Video (1.10.0): elle yerleşim satırı (M-19V) ve KOŞULLU düğme (M-25, adres yoksa düğme yok).
      const hal = { kategoriVar: false, instagram: true, tanitilan: tanitilanTuru(g.niyet!), erisim: g.niyet === 'ERISIM', video: g.niyet === 'VIDEO_IZLENME', dugme: videoDugmesiVar({ niyet: g.niyet!, hedefAdres: g.hedefAdres ?? null }) };
      const satirlar = MANIFESTO.filter((s) => manifestoSatiriGecerli(s.kosul, hal));
      for (const s of satirlar) {
        const yollar = typeof s.yol === 'string' ? [s.yol] : s.yol;
        expect(yollar.some((y) => r.acikcaYazilanAlanlar.includes(`${s.nesne}:${y}`)), `${g.niyet} ${s.kod}`).toBe(true);
      }
    }
  });

  it('KRİTİK: satışta sayfa satırı (M-10) uygulanmaz, piksel satırları (M-10P) uygulanır', () => {
    const hal = { kategoriVar: false, instagram: true, tanitilan: 'piksel' as const, erisim: false };
    const kodlar = MANIFESTO.filter((s) => manifestoSatiriGecerli(s.kosul, hal)).map((s) => s.kod);
    expect(kodlar).toContain('M-10P');
    expect(kodlar).not.toContain('M-10');
    expect(kodlar).not.toContain('M-11F');
    expect(tanitilanTuru('SATIS')).toBe('piksel');
    expect(tanitilanTuru('WHATSAPP')).toBe('whatsapp');
    expect(tanitilanTuru('ERISIM')).toBe('sayfa');
  });
});
