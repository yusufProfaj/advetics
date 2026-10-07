import { describe, expect, it } from 'vitest';
import {
  FORM_NOTR_BILDIRIM,
  beklenenYankilar,
  derleForm,
  geriOkumaKarsilastir,
  yasakSoruKonusu,
  type FormProfili,
  type FormSablonu,
} from '@advetics/shared';

const sablon: FormSablonu = {
  surum: 3,
  sorular: [
    { tur: 'standart', kod: 'FULL_NAME' },
    { tur: 'standart', kod: 'PHONE' },
    { tur: 'ozel', anahtar: 'oda_sayisi', etiket: 'Kaç odalı daire arıyorsunuz?' },
  ],
  hukukiSebep: 'acik_riza',
  pazarlamaIzniMetni: 'Kampanyalardan SMS, e-posta ve telefonla haberdar olmak istiyorum.',
  kaliteOdakli: true,
  smsDogrulama: false,
};
const profil: FormProfili = {
  workspaceKisaAdi: 'Örnek Yapı',
  aydinlatmaAdresi: 'https://ornek.com.tr/kvkk',
  aydinlatmaBaglantiMetni: 'KVKK Aydınlatma Metni',
};

function govde(s: Partial<FormSablonu> = {}, p: Partial<FormProfili> = {}) {
  const r = derleForm({ ...sablon, ...s }, { ...profil, ...p }, '111');
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r.govde;
}
const retler = (s: Partial<FormSablonu> = {}, p: Partial<FormProfili> = {}) => {
  const r = derleForm({ ...sablon, ...s }, { ...profil, ...p }, '111');
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};

describe('form derleyicisi', () => {
  it('Türkçe, aydınlatma işletmeden, hedef dışına kapalı, sayfanın ucunda', () => {
    const g = govde();
    expect(g.uc).toBe('111/leadgen_forms');
    expect(g.alanlar).toMatchObject({
      name: 'Örnek Yapı · Form · ş3',
      locale: 'TR_TR',
      privacy_policy: { url: 'https://ornek.com.tr/kvkk', link_text: 'KVKK Aydınlatma Metni' },
      block_display_for_non_targeted_viewer: true,
      is_optimized_for_quality: true,
      is_phone_sms_verify_enabled: false,
    });
    expect(g.alanlar.questions).toEqual([
      { type: 'FULL_NAME' },
      { type: 'PHONE' },
      { type: 'CUSTOM', key: 'oda_sayisi', label: 'Kaç odalı daire arıyorsunuz?' },
    ]);
  });

  it('KRİTİK FRM-03: pazarlama kutusu ÜST SEVİYE, is_required ve is_checked_by_default AÇIKÇA false', () => {
    const g = govde();
    expect(g.alanlar).not.toHaveProperty('legal_content');
    expect(g.alanlar.custom_disclaimer).toEqual({
      title: 'İletişim izni',
      body: { text: FORM_NOTR_BILDIRIM },
      checkboxes: [
        {
          key: 'pazarlama_izni',
          text: 'Kampanyalardan SMS, e-posta ve telefonla haberdar olmak istiyorum.',
          is_required: false,
          is_checked_by_default: false,
        },
      ],
    });
  });

  it('FRM-04: bildirim gövdesinde "onaylıyorum" yok', () => {
    expect(FORM_NOTR_BILDIRIM.toLocaleLowerCase('tr-TR')).not.toMatch(/onaylı|kabul/);
  });

  it('izin kutusu yoksa custom_disclaimer hiç yazılmaz (zorunlu kutu üretilmez)', () => {
    expect(govde({ pazarlamaIzniMetni: null }).alanlar).not.toHaveProperty('custom_disclaimer');
  });

  it('KRİTİK FRM-01: aydınlatma adresi yoksa, https değilse ya da Advetics’inse ret', () => {
    expect(retler({}, { aydinlatmaAdresi: null })).toEqual(['FRM-01']);
    expect(retler({}, { aydinlatmaAdresi: 'http://ornek.com/kvkk' })).toEqual(['FRM-01']);
    expect(retler({}, { aydinlatmaAdresi: 'https://advetics.com/gizlilik' })).toEqual(['FRM-01']);
  });

  it('bağlantı metni en çok 70, soru en çok 15, hukuki sebep zorunlu', () => {
    expect(retler({}, { aydinlatmaBaglantiMetni: 'x'.repeat(71) })).toEqual(['FRM-09']);
    expect(retler({ sorular: Array.from({ length: 16 }, () => ({ tur: 'standart', kod: 'EMAIL' }) as const) })).toEqual(['FRM-06']);
    expect(retler({ hukukiSebep: null })).toEqual(['FRM-07']);
  });

  it('KRİTİK FRM-05: yasak sorular — Türkçe harfle başlayan kelimeler dahil', () => {
    expect(yasakSoruKonusu('Herhangi bir sağlık sorununuz var mı?')).toBe('sağlık ve tedavi');
    expect(yasakSoruKonusu('Aylık geliriniz nedir?')).toBe('gelir ve borç');
    expect(yasakSoruKonusu('T.C. kimlik no')).toBe('kimlik numarası');
    expect(yasakSoruKonusu('Çocuğunuzun doğum tarihi')).toBe('çocuğun doğum tarihi');
    expect(yasakSoruKonusu('IBAN')).toBe('hesap numarası');
    expect(yasakSoruKonusu('SAĞLIK DURUMUNUZ')).toBe('sağlık ve tedavi');
    expect(yasakSoruKonusu('Dini inancınız')).toBe('din');
    // Yanlış alarm yok:
    expect(yasakSoruKonusu('Dinlenme alanı ister misiniz?')).toBeNull();
    expect(yasakSoruKonusu('Kaç odalı daire arıyorsunuz?')).toBeNull();
    expect(yasakSoruKonusu('Ödeme planı tercihiniz')).toBeNull();
    expect(retler({ sorular: [{ tur: 'ozel', anahtar: 'g', etiket: 'Maaşınız?' }] })).toEqual(['FRM-05']);
  });
});

describe('form geri okuması', () => {
  const g = govde();
  const yankilar = beklenenYankilar([g]);
  const ayna = () => ({ form: structuredClone(g.alanlar) as Record<string, any> });

  it('aynı dönerse temiz', () => {
    expect(geriOkumaKarsilastir(yankilar, ayna()).sonuc).toBe('temiz');
  });

  it('KRİTİK: Meta kutuyu zorunlu yaparsa ya da kutuyu düşürürse durur, kabul edilemez', () => {
    const o = ayna();
    o.form.custom_disclaimer.checkboxes[0].is_required = true;
    const r = geriOkumaKarsilastir(yankilar, o);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'fark') expect(r.satirlar[0]).toMatchObject({ ekranEtiketi: 'İzin kutusu', kabulEdilemez: true });

    const d = ayna();
    delete d.form.custom_disclaimer;
    expect(geriOkumaKarsilastir(yankilar, d).sonuc).toBe('dogrulanamadi');
  });

  it('aydınlatma adresi değişirse kabul edilemez fark', () => {
    const o = ayna();
    o.form.privacy_policy.url = 'https://ornek.com.tr/';
    const r = geriOkumaKarsilastir(yankilar, o);
    expect(r.sonuc === 'fark' && r.satirlar[0]!.ekranEtiketi).toBe('Aydınlatma bağlantısı');
  });
});
