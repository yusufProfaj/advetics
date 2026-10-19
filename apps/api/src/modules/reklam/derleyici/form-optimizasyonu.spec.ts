import { describe, expect, it } from 'vitest';
import {
  FORM_NOTR_BILDIRIM,
  FORM_ZORUNLU_BILDIRIM,
  REHBER_ACILIS,
  REHBER_KAPALI_SEBEBI,
  UZUN_FORM_SORU_SAYISI,
  VARSAYILAN_FORM_TURU,
  beklenenYankilar,
  derleForm,
  derleMeta,
  formCtaTuru,
  formGeriOkumaDenetimi,
  formGeriOkumaUyarisi,
  formKararHucresi,
  kararTablosu,
  leadFormInputSchema,
  niyetYerlesimKisiti,
  reklamSetiPlani,
  tesekkurDugmesiTuru,
  trTelefonOnerisi,
  type DerlemeGirdisi,
  type FormProfili,
  type FormSablonu,
  type MetaGovdesi,
} from '@advetics/shared';

/**
 * ANLIK FORM OPTİMİZASYONU (2026-10-12, yönetici kararları 1-6, 8).
 *
 * Tek form üreticisi (`derleForm`), varsayılan form türü, "Bizi ara"
 * teşekkür düğmesi, FORM'da elle yerleşimin daralması, sektöre göre düğme,
 * onay ekranının form satırı ve Google formunun kapalılık cümlesi.
 */

const sablon: FormSablonu = {
  surum: 1,
  sorular: [
    { tur: 'standart', kod: 'FULL_NAME' },
    { tur: 'standart', kod: 'PHONE' },
    { tur: 'ozel', anahtar: 'soru_1', etiket: 'Ne zaman almayı düşünüyorsunuz?', secenekler: ['Hemen', '3 ay içinde', 'Sadece bakıyorum'] },
  ],
  hukukiSebep: 'acik_riza',
  pazarlamaIzniMetni: null,
  onayKutulari: [
    { metin: 'KVKK açık rıza metnini okudum.', zorunlu: true },
    { metin: 'Kampanyalardan haberdar olmak istiyorum.', zorunlu: false },
  ],
  kaliteOdakli: true,
  smsDogrulama: false,
};
const profil: FormProfili = { workspaceKisaAdi: 'Ege', aydinlatmaAdresi: 'https://ege.com.tr/kvkk', aydinlatmaBaglantiMetni: 'KVKK' };

function govde(s: Partial<FormSablonu> = {}): Record<string, any> {
  const r = derleForm({ ...sablon, ...s }, profil, '111');
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r.govde.alanlar as Record<string, any>;
}
const retler = (s: Partial<FormSablonu>) => {
  const r = derleForm({ ...sablon, ...s }, profil, '111');
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};

describe('tek form üreticisi — gövde', () => {
  it('KRİTİK: onay kutuları ÜST SEVİYE custom_disclaimer; legal_content YOK; her kutuda zorunluluk AÇIKÇA', () => {
    const g = govde();
    expect(g).not.toHaveProperty('legal_content');
    expect(g.custom_disclaimer).toEqual({
      title: 'Onaylar',
      body: { text: FORM_ZORUNLU_BILDIRIM },
      checkboxes: [
        { key: 'onay_1', text: 'KVKK açık rıza metnini okudum.', is_required: true, is_checked_by_default: false },
        { key: 'onay_2', text: 'Kampanyalardan haberdar olmak istiyorum.', is_required: false, is_checked_by_default: false },
      ],
    });
  });

  it('zorunlu kutu yoksa nötr bildirim (yalan "isteğe bağlı" cümlesi zorunlu kutunun üstünde durmaz)', () => {
    expect(govde({ onayKutulari: [{ metin: 'Haber ver', zorunlu: false }] }).custom_disclaimer.body.text).toBe(FORM_NOTR_BILDIRIM);
    expect(FORM_ZORUNLU_BILDIRIM.toLocaleLowerCase('tr-TR')).not.toMatch(/onaylı|kabul/);
  });

  it('KRİTİK: locale TR_TR, hedef dışına kapalı, is_optimized_for_quality HER İKİ hâlde açıkça', () => {
    expect(govde()).toMatchObject({ locale: 'TR_TR', block_display_for_non_targeted_viewer: true, is_optimized_for_quality: true });
    const hacim = govde({ kaliteOdakli: false });
    expect(hacim).toHaveProperty('is_optimized_for_quality', false);
  });

  it('çoktan seçmeli soru seçenekleriyle; boş seçenek ret', () => {
    expect(govde().questions[2]).toEqual({
      type: 'CUSTOM',
      key: 'soru_1',
      label: 'Ne zaman almayı düşünüyorsunuz?',
      options: [
        { value: 'Hemen', key: 'soru_1_1' },
        { value: '3 ay içinde', key: 'soru_1_2' },
        { value: 'Sadece bakıyorum', key: 'soru_1_3' },
      ],
    });
    expect(retler({ sorular: [{ tur: 'ozel', anahtar: 'a', etiket: 'Soru', secenekler: ['Tek'] }] })).toEqual(['FRM-SECENEK']);
  });

  it('KRİTİK: "Bizi ara" teşekkür düğmesi E.164 numarayla; ülke kodsuz numara RET', () => {
    const g = govde({ tesekkur: { baslik: 'Teşekkürler', govde: 'Arayacağız', dugme: { tur: 'CALL_BUSINESS', metin: 'Bizi ara', telefon: '+902321234567' } } });
    expect(g.thank_you_page).toEqual({ title: 'Teşekkürler', body: 'Arayacağız', button_type: 'CALL_BUSINESS', button_text: 'Bizi ara', business_phone_number: '+902321234567' });
    expect(retler({ tesekkur: { baslik: 'T', govde: '', dugme: { tur: 'CALL_BUSINESS', metin: 'Ara', telefon: '02321234567' } } })).toEqual(['FRM-TESEKKUR']);
    expect(govde({ tesekkur: { baslik: 'T', govde: '', dugme: { tur: 'NONE' } } }).thank_you_page).toEqual({ title: 'T', body: '', button_type: 'NONE' });
  });

  it('kütüphane yolu hukuki sebebi UYDURMAZ: kontrol yalnız açıkça kapatılınca geçer', () => {
    expect(retler({ hukukiSebep: null })).toEqual(['FRM-07']);
    expect(derleForm({ ...sablon, hukukiSebep: null }, profil, '111', { hukukiSebepZorunlu: false }).tur).toBe('govde');
  });
});

describe('form geri okuma', () => {
  const g = govde();
  const okunan = (ek: Record<string, unknown> = {}) => ({
    id: '9',
    locale: 'TR_TR',
    is_optimized_for_quality: true,
    block_display_for_non_targeted_viewer: true,
    legal_content: { custom_disclaimer: structuredClone(g.custom_disclaimer) },
    privacy_policy_url: g.privacy_policy.url,
    questions: structuredClone(g.questions),
    ...ek,
  });

  it('aynı dönerse temiz (onay kutuları legal_content altında da okunur)', () => {
    expect(formGeriOkumaDenetimi(g, okunan()).sonuc).toBe('temiz');
    expect(formGeriOkumaDenetimi(g, { ...okunan(), legal_content: undefined, custom_disclaimer: g.custom_disclaimer }).sonuc).toBe('temiz');
  });

  it('KRİTİK: KVKK kutusu düşerse ya da zorunluluk değişirse FARK ve uyarı cümlesi kutuyu adıyla söyler', () => {
    const d = okunan();
    (d.legal_content as any).custom_disclaimer.checkboxes = [g.custom_disclaimer.checkboxes[1]];
    const r = formGeriOkumaDenetimi(g, d);
    expect(r.sonuc).toBe('fark');
    expect(formGeriOkumaUyarisi(r)).toContain('KVKK açık rıza metnini okudum.');

    const z = okunan();
    (z.legal_content as any).custom_disclaimer.checkboxes[1].is_required = true;
    expect(formGeriOkumaDenetimi(g, z).sonuc).toBe('fark');
  });

  it('dil farklıysa fark; kutular hiç okunamadıysa "doğrulanamadı" — TEMİZ DEĞİL', () => {
    expect(formGeriOkumaDenetimi(g, okunan({ locale: 'EN_US' })).sonuc).toBe('fark');
    // Meta dil kodunu küçük harfle saklıyor (canlı, 2026-10-20): aynı dil fark DEĞİL.
    expect(formGeriOkumaDenetimi(g, okunan({ locale: 'tr_TR' })).sonuc).toBe('temiz');
    expect(formGeriOkumaDenetimi(g, okunan({ locale: 'en_US' })).sonuc).toBe('fark');
    expect(formGeriOkumaDenetimi(g, okunan({ legal_content: undefined })).sonuc).toBe('dogrulanamadi');
    const r = formGeriOkumaDenetimi(g, null, '(#100) nonexisting field');
    expect(r.sonuc).toBe('dogrulanamadi');
    expect(formGeriOkumaUyarisi(r)).toContain('nonexisting field');
    expect(formGeriOkumaUyarisi({ sonuc: 'temiz' })).toBeNull();
  });
});

describe('kütüphane formu varsayılanları', () => {
  const temelGirdi = {
    clientId: '11111111-1111-4111-8111-111111111111',
    socialProfileId: '22222222-2222-4222-8222-222222222222',
    name: 'F',
    prefillQuestions: ['FULL_NAME', 'PHONE'],
    privacyPolicyUrl: 'https://o.com/kvkk',
  };
  it('varsayılan tür "daha yüksek niyet"', () => {
    expect(VARSAYILAN_FORM_TURU).toBe('higher_intent');
    expect(leadFormInputSchema.parse(temelGirdi).formType).toBe('higher_intent');
  });
  it('KRİTİK: "Bizi ara" numarasız kaydedilmez (giriş anında); eski istemcide tür adresten türer', () => {
    expect(leadFormInputSchema.safeParse({ ...temelGirdi, thankYouCtaType: 'CALL_BUSINESS' }).success).toBe(false);
    expect(leadFormInputSchema.safeParse({ ...temelGirdi, thankYouCtaType: 'CALL_BUSINESS', thankYouPhone: '+905321234567' }).success).toBe(true);
    expect(tesekkurDugmesiTuru({ thankYouCtaUrl: 'https://o.com' })).toBe('VIEW_WEBSITE');
    expect(tesekkurDugmesiTuru({ thankYouCtaUrl: null })).toBe('NONE');
  });
  it('Marka Merkezi telefonu E.164 önerisi; çözülemeyen biçim önerilmez', () => {
    expect(trTelefonOnerisi('0232 123 45 67')).toBe('+902321234567');
    expect(trTelefonOnerisi('+90 532 123 45 67')).toBe('+905321234567');
    expect(trTelefonOnerisi('123')).toBeNull();
  });
});

// ─── Derleyici: yerleşim ve düğme ────────────────────────────────────────────

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-12',
  workspaceKisaAdi: 'Ege',
  niyet: 'FORM',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 250_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-13T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h-kare', baslik: 'Başlık', metin: 'Metin', oran: 'kare' }],
  hedefAdres: 'https://ege.com.tr/',
  formId: '{form}',
  telefon: null,
  urlEtiketleri: null,
};
function derle(g: Partial<DerlemeGirdisi>): MetaGovdesi[] {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r.govdeler;
}
const bul = (gv: MetaGovdesi[], ad: string) => gv.find((x) => x.ad === ad)!.alanlar as Record<string, any>;

describe('FORM yerleşimi (elle yerleşimde yalnız akış, hikâye, Reels)', () => {
  it('KRİTİK: yalnız kare görselde FORM sağ sütun, arama, Marketplace ve Keşfet KAPALI; SITE açık', () => {
    const form = bul(derle({}), 'reklam_seti').targeting;
    expect(form.facebook_positions).toEqual(['feed']);
    expect(form.instagram_positions).toEqual(['stream']);
    const site = bul(derle({ niyet: 'SITE', formId: null }), 'reklam_seti').targeting;
    expect(site.facebook_positions).toEqual(['feed', 'marketplace', 'right_hand_column', 'search']);
    expect(site.instagram_positions).toEqual(['explore', 'stream']);
  });

  it('dikey de varsa hikâye ve Reels açılır; dört boyutta otomatik yerleşim (kısıt uygulanmaz)', () => {
    const t = bul(derle({ kavramlar: [{ gorselHash: 'k', baslik: 'B', metin: 'M', oran: 'kare' }, { gorselHash: 'd', baslik: 'B', metin: 'M', oran: 'dikey' }] }), 'reklam_seti').targeting;
    expect(t.facebook_positions).toEqual(['facebook_reels', 'feed', 'story']);
    expect(t.instagram_positions).toEqual(['reels', 'story', 'stream']);
    expect(reklamSetiPlani([['dikey', 'dik45', 'kare', 'yatay']], 'FORM')).toMatchObject({ otomatik: true, niyetKapanan: [] });
  });

  it('niyetin kapattığı yerleşim "görsel yok" listesine GİRMEZ (kullanıcı 1.91:1 yüklemeye gönderilmez)', () => {
    const p = reklamSetiPlani([['kare']], 'FORM');
    expect(p.kapanan).toEqual(['hikaye']);
    expect(p.niyetKapanan).toEqual(['yan', 'pazar']);
    // Yalnız 9:16: sağ sütun boyuttan da kapalı olurdu ama sebebi NİYET; uyarı
    // listesinde (kapanan) yalnız akış kalır.
    expect(reklamSetiPlani([['dikey']], 'FORM')).toMatchObject({ gruplar: { hikaye: 'dikey' }, kapanan: ['akis'], niyetKapanan: ['yan', 'pazar'] });
    expect(niyetYerlesimKisiti('SITE')).toBeNull();
  });

  it('yalnız 1.91:1 görselli FORM: sebep niyet, "1.91:1 ekle" DEĞİL', () => {
    const r = derleMeta({ ...temel, kavramlar: [{ gorselHash: 'y', baslik: 'B', metin: 'M', oran: 'yatay' }] });
    expect(r.tur).toBe('ret');
    if (r.tur === 'ret') expect(r.retler.find((x) => x.kod === 'KRT-ORAN')?.mesaj).toContain('akış, hikâye ve Reels');
  });

  it('banner seti kuralları da daraltılmış konumla (reklam seti ile kreatif aynı listeyi görür)', () => {
    const gv = derle({ kavramlar: [{ gorselHash: 'k', baslik: 'B', metin: 'M', setGorselleri: [{ oran: 'kare', gorselHash: 'k' }, { oran: 'yatay', gorselHash: 'y' }] }] });
    const kurallar = bul(gv, 'kreatif:1').asset_feed_spec.asset_customization_rules as Array<{ customization_spec: Record<string, string[]> }>;
    const konumlar = kurallar.flatMap((k) => [...(k.customization_spec.facebook_positions ?? []), ...(k.customization_spec.instagram_positions ?? [])]);
    expect(konumlar).not.toContain('right_hand_column');
    expect(konumlar).not.toContain('marketplace');
    expect(konumlar).not.toContain('explore');
  });

  it('kapattıklarımız listesi niyet kısıtını söylüyor', () => {
    const r = derleMeta(temel);
    expect(r.tur === 'govde' && r.kapattiklarimiz.join(' ')).toContain('Form reklamı yalnız akış');
  });
});

describe('FORM düğmesi (sektöre göre)', () => {
  it('KRİTİK: varsayılan LEARN_MORE; inşaat/emlak/konut/hizmet GET_QUOTE; tanınmayan sektör varsayılan', () => {
    expect(formCtaTuru(null)).toBe('LEARN_MORE');
    expect(formCtaTuru({ sektor: 'İnşaat', kategoriler: [] })).toBe('GET_QUOTE');
    expect(formCtaTuru({ sektor: null, kategoriler: ['Konut projeleri'] })).toBe('GET_QUOTE');
    expect(formCtaTuru({ sektor: 'Emlak danışmanlığı', kategoriler: [] })).toBe('GET_QUOTE');
    expect(formCtaTuru({ sektor: 'Temizlik hizmetleri', kategoriler: [] })).toBe('GET_QUOTE');
    expect(formCtaTuru({ sektor: 'Kozmetik', kategoriler: ['Cilt bakımı'] })).toBe('LEARN_MORE');
  });

  it('gövdedeki düğme ve BEKLENEN YANKI aynı karardan', () => {
    const gv = derle({ sektor: { sektor: 'İnşaat', kategoriler: [] } });
    const cta = bul(gv, 'kreatif:1').object_story_spec.link_data.call_to_action;
    expect(cta).toEqual({ type: 'GET_QUOTE', value: { lead_gen_form_id: '{form}' } });
    const y = beklenenYankilar(gv).find((x) => x.alanYolu === 'object_story_spec.link_data.call_to_action');
    expect(y?.gonderilen).toEqual(cta);
    expect(bul(derle({}), 'kreatif:1').object_story_spec.link_data.call_to_action.type).toBe('LEARN_MORE');
  });
});

describe('onay ekranı (karar tablosu) form satırı', () => {
  const tablo = (form: Parameters<typeof formKararHucresi>[0]) =>
    kararTablosu('FORM', { meta: true, google: false }, 'MAKS_TIKLAMA', true, null, { form }).find((x) => x.kod === 'FORM')!.meta!;

  it('KRİTİK: tür ve soru sayısı yazar; 6+ soruda uzun form uyarısı', () => {
    expect(tablo({ ad: 'Teklif', sayfadaYayinda: true, gizlilikAdresi: true, tur: 'higher_intent', soruSayisi: 3 })).toEqual({ deger: '"Teklif" · daha yüksek niyet · 3 soru' });
    expect(tablo({ ad: 'Uzun', sayfadaYayinda: true, gizlilikAdresi: true, tur: 'higher_intent', soruSayisi: UZUN_FORM_SORU_SAYISI }).not).toBe('Uzun form daha az doldurulur');
    expect(tablo({ ad: 'Uzun', sayfadaYayinda: true, gizlilikAdresi: true, tur: 'higher_intent', soruSayisi: UZUN_FORM_SORU_SAYISI - 1 }).not).toBeUndefined();
  });

  it('okunamayan tür TAHMİN EDİLMEZ; form yalnız FORM amacında ve Meta açıkken', () => {
    expect(tablo({ ad: 'X', sayfadaYayinda: true, gizlilikAdresi: true, tur: null, soruSayisi: null }).deger).toBe('"X" · türü okunamadı · soru sayısı okunamadı');
    expect(tablo({ ad: 'H', sayfadaYayinda: true, gizlilikAdresi: true, tur: 'more_volume', soruSayisi: 2 }).deger).toContain('daha fazla hacim');
    expect(kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true).some((x) => x.kod === 'FORM')).toBe(false);
  });
});

describe('Google formu kapalı ve SEBEBİ yazılı', () => {
  it('FORM Google kapalı kalıyor; cümle panele çekme yolunu söylüyor', () => {
    expect(REHBER_ACILIS.FORM.google).toBe('kapali');
    expect(REHBER_KAPALI_SEBEBI.FORM?.google).toBe("Google'da form henüz yok: gelen kişileri panele çekecek yol yazılınca açılacak");
  });
});
