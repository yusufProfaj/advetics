import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DERLEYICI_SURUMU,
  HIZLI_SORU_EN_COK,
  KARSILAMA_SETTE_YOK_CUMLESI,
  REHBER_AMACLARI,
  WHATSAPP_VARSAYILAN_MESAJ,
  advantageDurumuCumlesi,
  ADVANTAGE_SATIS_YERLESIM_CUMLESI,
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  geriOkumaNotlariniSec,
  karsilamaCoz,
  karsilamaOzu,
  kararTablosu,
  niyetYerlesimKisiti,
  okumaAlanlari,
  ekOkumaAlanlari,
  reklamSetiPlani,
  type DerlemeGirdisi,
  type GorselOrani,
  type Kavram,
  type MetaGovdesi,
} from '@advetics/shared';

/**
 * WHATSAPP KARŞILAMA MESAJI, YERLEŞİM KISITI VE ADVANTAGE+ DURUMU
 * (SENTEZ D-M6, yönetici kararları 2026-10-12). Canlı Meta çağrısı yok:
 * gövde, geri okuma ve karar tablosu saf fonksiyonlarla sınanıyor.
 */

const TL = (n: number) => BigInt(n) * 1_000_000n;
const H = { dikey: 'h-dikey', dik45: 'h-dik45', kare: 'h-kare', yatay: 'h-yatay' } as const;
const set = (...oranlar: GorselOrani[]) => oranlar.map((oran) => ({ oran, gorselHash: H[oran] }));
const kavram = (k: Partial<Kavram> = {}): Kavram => ({ gorselHash: H.kare, baslik: 'Başlık', metin: 'Metin', ...k });

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-12',
  workspaceKisaAdi: 'Ege',
  niyet: 'WHATSAPP',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-13T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [kavram()],
  hedefAdres: null,
  formId: null,
  telefon: null,
  whatsappNumarasi: '+905321234567',
  urlEtiketleri: null,
};

function derle(g: Partial<DerlemeGirdisi> = {}) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r;
}
const bul = (gv: MetaGovdesi[], ad: string) => gv.find((x) => x.ad === ad)!.alanlar as Record<string, any>;
const retler = (g: Partial<DerlemeGirdisi>) => {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler : [];
};
const kreatif = (g: Partial<DerlemeGirdisi> = {}, n = 1) => bul(derle(g).govdeler, `kreatif:${n}`);

const VARSAYILAN_GOVDE = {
  type: 'VISUAL_EDITOR',
  version: 2,
  landing_screen_type: 'welcome_message',
  media_type: 'text',
  text_format: {
    customer_action_type: 'autofill_message',
    message: { autofill_message: { content: WHATSAPP_VARSAYILAN_MESAJ }, text: WHATSAPP_VARSAYILAN_MESAJ },
  },
};

describe('karşılama mesajı: derleyici gövdesi', () => {
  it('KRİTİK: tek görselde `link_data.page_welcome_message` Türkçe varsayılanla gider (resmî belgedeki autofill biçimi)', () => {
    expect(kreatif().object_story_spec.link_data.page_welcome_message).toEqual(VARSAYILAN_GOVDE);
    // Varsayılan cümle Türkçe ve Meta'nın İngilizce varsayılanı değil.
    expect(WHATSAPP_VARSAYILAN_MESAJ).toBe('Merhaba, reklamınızı gördüm, bilgi almak istiyorum.');
  });

  it('KRİTİK: videoda `video_data.page_welcome_message`, `link_data` yok', () => {
    const k = kreatif({ kavramlar: [kavram({ videoId: '{video:v1}' })] });
    expect(k.object_story_spec.video_data.page_welcome_message).toEqual(VARSAYILAN_GOVDE);
    expect(k.object_story_spec.link_data).toBeUndefined();
  });

  it('kullanıcının mesajı aynen gider; kaynak "kullanici"', () => {
    const k = kreatif({ whatsappKarsilama: { mesaj: '  Merhaba, fiyat almak istiyorum.  ', hizliSorular: [] } });
    const m = k.object_story_spec.link_data.page_welcome_message.text_format.message;
    expect(m).toEqual({ autofill_message: { content: 'Merhaba, fiyat almak istiyorum.' }, text: 'Merhaba, fiyat almak istiyorum.' });
    expect(karsilamaCoz({ mesaj: 'x', hizliSorular: [] }).kaynak).toBe('kullanici');
  });

  it('KRİTİK: boş ya da boşluk mesaj VARSAYILANA döner (boş göndermek Meta İngilizcesine düşürürdü)', () => {
    for (const mesaj of ['', '   ']) {
      expect(kreatif({ whatsappKarsilama: { mesaj, hizliSorular: [] } }).object_story_spec.link_data.page_welcome_message).toEqual(VARSAYILAN_GOVDE);
    }
    expect(karsilamaCoz(null)).toEqual({ mesaj: WHATSAPP_VARSAYILAN_MESAJ, hizliSorular: [], kaynak: 'varsayilan' });
  });

  it('KRİTİK: hızlı soru varsa TEK eylem türü `ice_breakers`; autofill ile birleşik gövde uydurulmaz', () => {
    const pwm = kreatif({ whatsappKarsilama: { mesaj: 'Hoş geldiniz', hizliSorular: ['Fiyat?', '  ', 'Adres?'] } }).object_story_spec.link_data.page_welcome_message;
    expect(pwm.text_format).toEqual({
      customer_action_type: 'ice_breakers',
      message: { text: 'Hoş geldiniz', ice_breakers: [{ title: 'Fiyat?' }, { title: 'Adres?' }] },
    });
    expect(JSON.stringify(pwm)).not.toContain('autofill_message');
  });

  it('en çok üç hızlı soru: fazlası gövdeye girmez, şema da reddeder', () => {
    expect(karsilamaCoz({ mesaj: 'a', hizliSorular: ['1', '2', '3', '4'] }).hizliSorular).toHaveLength(HIZLI_SORU_EN_COK);
  });

  it('KRİTİK: UYDURMA YOK: kullanıcı yazmadıysa hızlı soru gövdeye hiç girmez', () => {
    const json = JSON.stringify(derle().govdeler);
    expect(json).not.toContain('ice_breakers');
    expect(json).toContain('page_welcome_message');
  });

  it('KRİTİK: banner setinde karşılama GÖNDERİLMEZ ve "Meta yapabilir" listesi bunu söyler', () => {
    const r = derle({ kavramlar: [kavram({ setGorselleri: set('dikey', 'dik45', 'kare', 'yatay') })] });
    const k = bul(r.govdeler, 'kreatif:1');
    expect(k.asset_feed_spec).toBeDefined();
    expect(JSON.stringify(k)).not.toContain('page_welcome_message');
    expect(r.metaOtomatikYapabilir).toContain(KARSILAMA_SETTE_YOK_CUMLESI);
  });

  it('setli fikir yoksa liste temiz (cümle yalnız gerçekten gitmediğinde)', () => {
    expect(derle().metaOtomatikYapabilir).not.toContain(KARSILAMA_SETTE_YOK_CUMLESI);
  });

  it('KRİTİK: başka niyette karşılama yok (alan verilse bile)', () => {
    const k = { whatsappKarsilama: { mesaj: 'Merhaba', hizliSorular: [] } };
    expect(JSON.stringify(derle({ ...k, niyet: 'SITE', hedefAdres: 'https://ege.com.tr' }).govdeler)).not.toContain('page_welcome_message');
    expect(JSON.stringify(derle({ ...k, niyet: 'TELEFON', telefon: '+905321234567' }).govdeler)).not.toContain('page_welcome_message');
    expect(JSON.stringify(derle({ ...k, niyet: 'FORM', formId: '123' }).govdeler)).not.toContain('page_welcome_message');
  });

  it('derleyici sürümü 1.8.0 ya da sonrası (eski provalar karşılamalı gövdeyi kanıtlamaz)', () => {
    // 1.10.0: VIDEO_IZLENME elle yerleşim (Audience Network hariç) ve adressiz düğmesiz video.
    expect(DERLEYICI_SURUMU).toBe('1.10.0');
  });

  it('karışık fikirler: setsiz kare görsel karşılama taşır, setli fikir taşımaz', () => {
    const r = derle({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dik45', 'kare') }), kavram({ oran: 'kare', gorselHash: 'h2' })] });
    expect(JSON.stringify(bul(r.govdeler, 'kreatif:1'))).not.toContain('page_welcome_message');
    expect(bul(r.govdeler, 'kreatif:2').object_story_spec.link_data.page_welcome_message).toEqual(VARSAYILAN_GOVDE);
    expect(r.metaOtomatikYapabilir).toContain(KARSILAMA_SETTE_YOK_CUMLESI);
  });
});

describe('yerleşim kısıtı: WHATSAPP de akış, hikâye, Reels', () => {
  it('KRİTİK: FORM ile AYNI küme (tek kural), ayrı ekran cümlesi', () => {
    const w = niyetYerlesimKisiti('WHATSAPP')!;
    const f = niyetYerlesimKisiti('FORM')!;
    expect(w.gruplar).toBe(f.gruplar);
    expect(w.cikarilanKonumlar).toBe(f.cikarilanKonumlar);
    expect(w.aciklama).toContain('WhatsApp reklamı yalnız akış, hikâye ve Reels');
    expect(niyetYerlesimKisiti('SITE')).toBeNull();
    // TELEFON'un KENDİ kümesi var (Marketplace ve FB Reels açık, IG Reels kapalı).
    expect(niyetYerlesimKisiti('TELEFON')!.gruplar).not.toBe(f.gruplar);
  });

  it('KRİTİK: elle yerleşimde sağ sütun, arama, Marketplace ve Keşfet KAPALI', () => {
    const r = derle({ kavramlar: [kavram({ oran: 'kare' })] });
    const t = bul(r.govdeler, 'reklam_seti').targeting;
    const konumlar = [...(t.facebook_positions ?? []), ...(t.instagram_positions ?? [])];
    for (const yok of ['right_hand_column', 'search', 'marketplace', 'explore']) expect(konumlar).not.toContain(yok);
    expect(t.facebook_positions).toContain('feed');
    expect(r.kapattiklarimiz).toContain(niyetYerlesimKisiti('WHATSAPP')!.aciklama);
    expect(reklamSetiPlani([['kare']], 'WHATSAPP').niyetKapanan).toEqual(['yan', 'pazar']);
  });

  it('KRİTİK: SITE etkilenmez (aynı görselde sağ sütun ve Marketplace açık)', () => {
    const t = bul(derle({ niyet: 'SITE', hedefAdres: 'https://ege.com.tr', kavramlar: [kavram({ oran: 'kare' })] }).govdeler, 'reklam_seti').targeting;
    expect(t.facebook_positions).toEqual(expect.arrayContaining(['right_hand_column', 'marketplace']));
    expect(t.instagram_positions).toContain('explore');
  });

  it('dört boyut tamsa (Advantage+ yerleşim) kısıt uygulanmaz', () => {
    const t = bul(derle({ kavramlar: [kavram({ setGorselleri: set('dikey', 'dik45', 'kare', 'yatay') })] }).govdeler, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toBeUndefined();
  });

  it('yalnız yatay görsel: ret sebebi WhatsApp cümlesiyle (form değil)', () => {
    const r = retler({ kavramlar: [kavram({ oran: 'yatay' })] });
    expect(r.find((x) => x.kod === 'KRT-ORAN')?.mesaj).toMatch(/^WhatsApp reklamı yalnız akış/);
  });
});

/** Gövdeyi Meta'nın aynen döndürdüğü bir okuma (tur 1 normalleştirmeleri gerekmeyen alanlar). */
function ayna(gv: MetaGovdesi[], degistir: (ad: string, o: Record<string, any>) => void = () => {}): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const g of gv) {
    const o = JSON.parse(JSON.stringify(g.alanlar));
    degistir(g.ad, o);
    out[g.ad] = o;
  }
  return out;
}

describe('geri okuma: karşılama UYARI, durdurmaz (N-20)', () => {
  // TEMBEL: derleme `describe` gövdesinde koşsaydı bir derleyici hatası
  // dosyanın tamamını yükletmez ve sonuç "no tests" olurdu (mutasyonda görüldü).
  let gv: MetaGovdesi[] = [];
  let yankilar: ReturnType<typeof beklenenYankilar> = [];
  beforeAll(() => {
    gv = derle().govdeler;
    yankilar = beklenenYankilar(gv);
  });
  const kos = (okunan: Record<string, Record<string, unknown> | undefined>) => geriOkumaKarsilastir(yankilar, okunan, { yasalUyariVar: false });
  const uyarilar = (r: ReturnType<typeof kos>) => r.bilgiler.filter((x) => x.tur === 'uyari');

  it('yankı türü `karsilama`, kabul edilemez DEĞİL', () => {
    const y = yankilar.find((x) => x.alanYolu === 'object_story_spec.link_data.page_welcome_message')!;
    expect(y.karsilastirma).toBe('karsilama');
    expect(y.kabulEdilemez).toBe(false);
    // İçine inilmiyor: alt anahtarlar ayrı yankı olsaydı her biri durdururdu.
    expect(yankilar.some((x) => x.alanYolu.startsWith('object_story_spec.link_data.page_welcome_message.'))).toBe(false);
  });

  it('aynı dönerse temiz ve uyarısız', () => {
    const r = kos(ayna(gv));
    expect(r.sonuc).toBe('temiz');
    expect(uyarilar(r)).toEqual([]);
  });

  it('KRİTİK: farklı dönerse yayın DURMAZ ama ekranda uyarı var', () => {
    const r = kos(ayna(gv, (ad, o) => ad === 'kreatif:1' && (o.object_story_spec.link_data.page_welcome_message.text_format.message.text = 'Hello! Can I get more info on this?')));
    expect(r.sonuc).toBe('temiz');
    expect(uyarilar(r)).toHaveLength(1);
    expect(uyarilar(r)[0]!.bilgi).toMatch(/farklı kaydetti/);
  });

  it('KRİTİK: hiç dönmezse yayın DURMAZ, "döndürmedi" uyarısı', () => {
    const r = kos(ayna(gv, (ad, o) => ad === 'kreatif:1' && delete o.object_story_spec.link_data.page_welcome_message));
    expect(r.sonuc).toBe('temiz');
    expect(uyarilar(r)[0]!.bilgi).toMatch(/döndürmedi/);
  });

  it('`object_story_spec` kökünde dönerse (belgenin okuma örneği) uyarı yok', () => {
    const r = kos(
      ayna(gv, (ad, o) => {
        if (ad !== 'kreatif:1') return;
        o.object_story_spec.page_welcome_message = o.object_story_spec.link_data.page_welcome_message;
        delete o.object_story_spec.link_data.page_welcome_message;
      }),
    );
    expect(uyarilar(r)).toEqual([]);
  });

  it('JSON DİZGE dönerse çözülüp kıyaslanır; çözülemeyen dizge uyuşmaz', () => {
    const dizge = kos(ayna(gv, (ad, o) => ad === 'kreatif:1' && (o.object_story_spec.link_data.page_welcome_message = JSON.stringify(o.object_story_spec.link_data.page_welcome_message))));
    expect(uyarilar(dizge)).toEqual([]);
    expect(karsilamaOzu('{bozuk')).toBeNull();
  });

  it('KRİTİK: karşılama farkı başka bir gerçek farkı GİZLEMEZ (bütçe farkı yine durdurur)', () => {
    const r = kos(
      ayna(gv, (ad, o) => {
        if (ad === 'kampanya') o.daily_budget = '999999';
        if (ad === 'kreatif:1') delete o.object_story_spec.link_data.page_welcome_message;
      }),
    );
    expect(r.sonuc).toBe('fark');
    expect(uyarilar(r)).toHaveLength(1);
  });
});

describe('N-21 SATIŞTA (yönetici kararı 2026-10-13)', () => {
  const satis = (g: Partial<DerlemeGirdisi> = {}) => derle({ niyet: 'SATIS', pikselId: '424242', hedefAdres: 'https://magaza.com', whatsappNumarasi: null, ...g }).govdeler;

  it('KRİTİK: satış kampanyasında Advantage+ durumu AYRI ikinci okumada; ana okumada yok', () => {
    const y = beklenenYankilar(satis());
    expect(okumaAlanlari(y, 'kampanya')).not.toContain('advantage_state_info');
    expect(ekOkumaAlanlari(y, 'kampanya')).toEqual(['advantage_state_info']);
    expect(y.find((x) => x.alanYolu === 'advantage_state_info')?.ekBilgi).toBeUndefined();
  });

  it('KRİTİK: elle yerleşime düşülmüşse "Advantage+ satış koşulu (otomatik yerleşim) sağlanmadı" bilgisi; yayın temiz', () => {
    const gv = satis({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dik45', 'kare') })] });
    expect(bul(gv, 'reklam_seti').targeting.publisher_platforms).toBeDefined();
    const y = beklenenYankilar(gv);
    const r = geriOkumaKarsilastir(y, ayna(gv, (ad, o) => ad === 'kampanya' && (o.advantage_state_info = { advantage_state: 'DISABLED' })), { yasalUyariVar: false });
    expect(r.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe(`Meta bu kampanyayı Advantage+ olarak işaretlemedi. ${ADVANTAGE_SATIS_YERLESIM_CUMLESI}`);
    expect(ADVANTAGE_SATIS_YERLESIM_CUMLESI).toMatch(/^Advantage\+ satış koşulu \(otomatik yerleşim\) sağlanmadı/);
    // Otomatik yerleşimde ek cümle YOK.
    const oto = satis();
    const r2 = geriOkumaKarsilastir(beklenenYankilar(oto), ayna(oto), { yasalUyariVar: false });
    expect(r2.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe(advantageDurumuCumlesi(undefined));
  });
});

describe('geri okuma: advantage_state_info bilgi satırı (N-21)', () => {
  const kur = (g: Partial<DerlemeGirdisi>) => {
    const gv = derle(g).govdeler;
    return { gv, yankilar: beklenenYankilar(gv) };
  };

  it('KRİTİK: WHATSAPP ve FORM kampanyasında okunur; SITE ve TELEFON\'da okunmaz (dar kapsam)', () => {
    for (const g of [{}, { niyet: 'FORM' as const, formId: '123' }]) {
      const { yankilar } = kur(g);
      // Ö-1: ANA okumada YOK (reddedilirse bütün kampanya okuması düşerdi),
      // isteğe bağlı ikinci okumada var.
      expect(okumaAlanlari(yankilar, 'kampanya')).not.toContain('advantage_state_info');
      expect(ekOkumaAlanlari(yankilar, 'kampanya')).toEqual(['advantage_state_info']);
      expect(okumaAlanlari(yankilar, 'kampanya')).toContain('daily_budget');
      expect(yankilar.find((x) => x.alanYolu === 'advantage_state_info')).toMatchObject({ karsilastirma: 'yalniz_bilgi', kabulEdilemez: false, nesne: 'kampanya' });
    }
    for (const g of [{ niyet: 'SITE' as const, hedefAdres: 'https://ege.com.tr' }, { niyet: 'TELEFON' as const, telefon: '+905321234567' }]) {
      expect(okumaAlanlari(kur(g).yankilar, 'kampanya')).not.toContain('advantage_state_info');
      expect(ekOkumaAlanlari(kur(g).yankilar, 'kampanya')).toEqual([]);
    }
  });

  it('KRİTİK: Advantage+ işaretlendiyse bilgi, FARK DEĞİL', () => {
    const { gv, yankilar } = kur({});
    const okunan = ayna(gv, (ad, o) => ad === 'kampanya' && (o.advantage_state_info = { advantage_state: 'ADVANTAGE_PLUS_LEADS', advantage_budget_state: 'ENABLED' }));
    const r = geriOkumaKarsilastir(yankilar, okunan, { yasalUyariVar: false });
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe('Meta bu kampanyayı Advantage+ olarak işaretledi (ADVANTAGE_PLUS_LEADS).');
  });

  it('DISABLED ve dönmeyen hâl ayrı cümle; ikisi de durdurmaz', () => {
    const { gv, yankilar } = kur({});
    const disabled = geriOkumaKarsilastir(yankilar, ayna(gv, (ad, o) => ad === 'kampanya' && (o.advantage_state_info = { advantage_state: 'DISABLED' })), { yasalUyariVar: false });
    expect(disabled.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe('Meta bu kampanyayı Advantage+ olarak işaretlemedi.');
    const yok = geriOkumaKarsilastir(yankilar, ayna(gv), { yasalUyariVar: false });
    expect(yok.sonuc).toBe('temiz');
    expect(yok.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe(advantageDurumuCumlesi(undefined));
    // Kampanya hiç okunamadıysa da durum cümlesi "döndürmedi"; satır sayılmıyor.
    const okunamadi = ayna(gv);
    delete okunamadi.kampanya;
    const r = geriOkumaKarsilastir(yankilar, okunamadi, { yasalUyariVar: false });
    expect(('satirlar' in r ? r.satirlar : []).some((x) => x.alanYolu === 'advantage_state_info')).toBe(false);
    expect(r.bilgiler.find((x) => x.alanYolu === 'advantage_state_info')?.bilgi).toBe(advantageDurumuCumlesi(undefined));
  });

  it('KRİTİK: ikinci okuma düştüyse bilgi satırı SEBEBİYLE "okunamadı", yayın temiz', () => {
    const { gv, yankilar } = kur({});
    const r = geriOkumaKarsilastir(yankilar, ayna(gv), { yasalUyariVar: false, ekOkumaHatalari: { kampanya: '(#100) Tried accessing nonexisting field' } });
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.find((x) => x.tur === 'bilgi')?.bilgi).toBe('Advantage+ durumu okunamadı: (#100) Tried accessing nonexisting field');
  });

  it('ekrana giden notlar: yalnız uyarı ve bilgi, tekil', () => {
    const notlar = geriOkumaNotlariniSec([
      { tur: 'uyari', bilgi: 'A' },
      { tur: 'uyari', bilgi: 'A' },
      { tur: 'normallesti', bilgi: 'N' },
      { tur: 'bilgi', bilgi: 'B' },
      null,
    ]);
    expect(notlar).toEqual([
      { tur: 'uyari', metin: 'A' },
      { tur: 'bilgi', metin: 'B' },
    ]);
    expect(geriOkumaNotlariniSec(null)).toEqual([]);
  });
});

describe('karar tablosu ve Google sebebi', () => {
  const satir = (ek: Parameters<typeof kararTablosu>[5]) => kararTablosu('WHATSAPP', { meta: true, google: false }, 'MAKS_TIKLAMA', true, null, ek).find((x) => x.kod === 'KARSILAMA');

  it('KRİTİK: WhatsApp\'ta "İlk mesaj" satırı derleyicinin göndereceği metni gösterir', () => {
    expect(satir({})?.meta).toEqual({ deger: `"${WHATSAPP_VARSAYILAN_MESAJ}"`, not: 'Varsayılan Türkçe mesaj · Hızlı soru yok' });
    expect(satir({ whatsappKarsilama: { kayit: { mesaj: 'Selam', hizliSorular: ['Fiyat?'] }, setler: { setli: 0, toplam: 1 } } })?.meta).toEqual({
      deger: '"Selam"',
      not: 'Senin yazdığın · Hızlı sorular: Fiyat?',
    });
  });

  it('KRİTİK: bütün fikirler banner setiyse tablo "Meta\'nın varsayılanı" der (söz gövdeyle aynı)', () => {
    expect(satir({ whatsappKarsilama: { kayit: null, setler: { setli: 2, toplam: 2 } } })?.meta).toEqual({ deger: "Meta'nın varsayılanı", not: KARSILAMA_SETTE_YOK_CUMLESI });
    expect(satir({ whatsappKarsilama: { kayit: null, setler: { setli: 1, toplam: 2 } } })?.meta?.not).toContain(KARSILAMA_SETTE_YOK_CUMLESI);
  });

  it('başka amaçta satır yok', () => {
    expect(kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true).some((x) => x.kod === 'KARSILAMA')).toBe(false);
  });

  it('Google sebebi izin listesini söylüyor ("WhatsApp reklamı yok" yanlıştı, S-15)', () => {
    const g = REHBER_AMACLARI.WHATSAPP.google;
    expect(g.kurgu).toBeNull();
    expect('sebep' in g && g.sebep).toBe("Google'da WhatsApp'a yönlendiren öğe izin listesine bağlı; bu hesapta açık değil");
    expect(JSON.stringify(g)).not.toContain('—');
  });
});

describe('kaynak taramaları: alan uçtan uca taşınıyor', () => {
  const yorumsuz = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('yayın derleme girdisi karşılamayı taslaktan okuyor', () => {
    expect(yorumsuz('../yayin-baslat.ts')).toMatch(/whatsappKarsilama: alanlar\.whatsappKarsilama\?\.deger \?\? null/);
  });

  it('rehber türetmesi karşılamayı YALNIZ WhatsApp\'ta taşıyor', () => {
    expect(yorumsuz('../../../../../../packages/shared/src/reklam/rehber/turet.ts')).toMatch(
      /a\.whatsappKarsilama && REHBER_AMACLARI\[amac\]\.meta\.niyet === 'WHATSAPP' \? \{ whatsappKarsilama: a\.whatsappKarsilama \}/,
    );
  });

  it('rehber servisi notları ve karar tablosu girdisini veriyor', () => {
    const k = yorumsuz('../rehber/rehber.service.ts');
    expect(k).toMatch(/geriOkumaNotlari: notlar/);
    expect(k).toMatch(/whatsappKarsilama: \{ kayit: a\.whatsappKarsilama\?\.deger \?\? null, setler: rehberFikirSetleri\(/);
  });

  it('panel: notlar sonuç satırında, karşılama alanı WhatsApp\'ta', () => {
    expect(yorumsuz('../../../../../web/src/components/rehber/adim-kontrol.tsx')).toMatch(/p\.geriOkumaNotlari \?\? \[\]\)\.map/);
    expect(yorumsuz('../../../../../web/src/components/rehber/adim-reklam.tsx')).toMatch(/<WhatsappKarsilamaAlani b=\{b\} \/>/);
  });
});
