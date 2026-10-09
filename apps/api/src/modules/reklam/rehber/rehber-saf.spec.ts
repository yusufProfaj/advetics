import { describe, expect, it } from 'vitest';
import { UYUM_SURUMU, type RehberEksigi, type UyumSonucu } from '@advetics/shared';
import { degisiklikleriUygula, rehberOzeti } from './rehber-kayit';
import { GOOGLE_TURKIYE, kelimeOnerisiHazirla, kelimeTohumlari, konumEsle, metinOnerisiTemizle } from './oneriler';
import { formKosuluCoz, metaAsgariCoz } from './platform-okuma';
import { rehberYayinKapilari, type KapiOkuyuculari } from './yayin-kapilari';

const KIM = '11111111-1111-4111-8111-111111111111';
const Z1 = '2026-10-10T09:00:00.000+03:00';
const Z2 = '2026-10-10T10:00:00.000+03:00';

describe('rehber kaydı — özet ve birleştirme', () => {
  it('KRİTİK: kim ve zaman özete GİRMİYOR; değer ya da kaynak değişince özet değişiyor', () => {
    const a = degisiklikleriUygula({}, [{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }], KIM, Z1);
    const b = degisiklikleriUygula({}, [{ alan: 'amac', deger: 'SITE', kaynak: 'kullanici' }], '22222222-2222-4222-8222-222222222222', Z2);
    if (a.tur !== 'tamam' || b.tur !== 'tamam') throw new Error('ret');
    expect(rehberOzeti(a.alanlar)).toBe(rehberOzeti(b.alanlar));
    const c = degisiklikleriUygula({}, [{ alan: 'amac', deger: 'FORM', kaynak: 'kullanici' }], KIM, Z1);
    expect(c.tur === 'tamam' && rehberOzeti(c.alanlar)).not.toBe(rehberOzeti(a.alanlar));
    expect(rehberOzeti(a.alanlar)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('KRİTİK: kim ve zaman SUNUCUNUN; SİLME yalnız sil:true, deger:null DEĞERİN kendisi', () => {
    const a = degisiklikleriUygula({}, [{ alan: 'telefon', deger: '+905551112233', kaynak: 'kullanici' }], KIM, Z1);
    if (a.tur !== 'tamam') throw new Error('ret');
    expect(a.alanlar.telefon).toEqual({ deger: '+905551112233', kaynak: 'kullanici', kim: KIM, zaman: Z1 });
    const nul = degisiklikleriUygula(a.alanlar, [{ alan: 'telefon', deger: null, kaynak: 'kullanici' }], KIM, Z2);
    expect(nul.tur === 'tamam' && nul.alanlar.telefon?.deger).toBeNull();
    const b = degisiklikleriUygula(a.alanlar, [{ alan: 'telefon', deger: null, kaynak: 'kullanici', sil: true }], KIM, Z2);
    expect(b.tur === 'tamam' && 'telefon' in b.alanlar).toBe(false);
  });

  it('KRİTİK: tanınmayan alan ve istemcinin yazamayacağı kaynak RET; şema dışı değer RET', () => {
    expect(degisiklikleriUygula({}, [{ alan: 'butceSeviyesi', deger: 'x', kaynak: 'kullanici' }], KIM, Z1)).toMatchObject({ tur: 'ret' });
    expect(degisiklikleriUygula({}, [{ alan: 'amac', deger: 'SITE', kaynak: 'meta_okumasi' }], KIM, Z1)).toMatchObject({ tur: 'ret' });
    expect(degisiklikleriUygula({}, [{ alan: 'amac', deger: 'YOK', kaynak: 'kullanici' }], KIM, Z1)).toMatchObject({ tur: 'ret' });
  });

  it('ai_onerisi kaydedilebiliyor (yarım iş kaybolmasın); kilit eksik listesinde', () => {
    const r = degisiklikleriUygula({}, [{ alan: 'metin', deger: { anaMetin: 'a', basliklar: [], aciklamalar: [] }, kaynak: 'ai_onerisi' }], KIM, Z1);
    expect(r.tur).toBe('tamam');
  });
});

describe('anahtar kelime önerisi', () => {
  const f = (kelime: string, arama: string | null, alt = '100', ust = '900', rekabet = 'LOW') => ({
    kelime,
    aylikArama: arama,
    rekabet,
    teklifAltMicros: alt,
    teklifUstMicros: ust,
  });

  it('KRİTİK: yakın varyant (aynı arama + aynı teklif) TEK satır; hacim ikiye katlanmaz, toplam tekil sayı', () => {
    const r = kelimeOnerisiHazirla([f('türk kahve makinesi', '74000'), f('turk kahve makinesi', '74000'), f('kahve makinesi', '90500', '200')], []);
    expect(r.satirlar.map((s) => s.metin)).toEqual(['kahve makinesi', 'türk kahve makinesi']);
    expect(r.satirlar.find((s) => s.metin === 'türk kahve makinesi')!.aylikArama).toBe(74000);
    expect(r.toplam).toBe(2);
    expect(r.bosNeden).toBeNull();
  });

  it('aynı metin farklı metrik = ayrı kelime değil ama farklı kelime aynı kova AYRI kalır', () => {
    const r = kelimeOnerisiHazirla([f('villa', '49500'), f('kuşadası', '49500')], []);
    expect(r.satirlar).toHaveLength(2);
  });

  it('hacim null "ölçülmedi" (sıfır değil); rekabet Türkçeye çevrilir', () => {
    const r = kelimeOnerisiHazirla([f('a b c', null, '1', '2', 'HIGH')], []);
    expect(r.satirlar[0]).toEqual({ metin: 'a b c', aylikArama: null, rekabet: 'yuksek' });
  });

  it('boş cevap NEDENİYLE; hepsi seçiliyse ayrı neden; seçili olan listeden düşer ama toplamdan düşmez', () => {
    expect(kelimeOnerisiHazirla([], []).bosNeden).toMatch(/öneri döndürmedi/);
    const r = kelimeOnerisiHazirla([f('villa', '10')], ['Villa']);
    expect(r).toMatchObject({ satirlar: [], toplam: 1 });
    expect(r.bosNeden).toMatch(/zaten seçili/);
  });

  it('tohum: verilen > başlıklar > alan adı; hiçbiri yoksa boş', () => {
    expect(kelimeTohumlari(['  villa '], ['x'], null)).toEqual(['villa']);
    expect(kelimeTohumlari(undefined, ['Havuzlu Villa', ''], null)).toEqual(['Havuzlu Villa']);
    expect(kelimeTohumlari(undefined, [], 'https://www.garden-villas.com.tr/')).toEqual(['garden villas']);
    expect(kelimeTohumlari(undefined, [], null)).toEqual([]);
  });
});

describe('konum eşleme — yalnız TAM ad', () => {
  const izmir = { key: 'geoTargetConstants/1012782', name: 'İzmir', countryCode: 'TR' };
  it('KRİTİK: tek tam eşleşme yazılır; iki aday ya da yakın ad null (en yakını SEÇİLMEZ)', () => {
    expect(konumEsle({ tur: 'city', etiket: 'İzmir' }, [izmir])).toEqual({ kaynak: izmir.key, ad: 'İzmir' });
    expect(konumEsle({ tur: 'city', etiket: 'İzmir' }, [izmir, { ...izmir, key: 'geoTargetConstants/9' }])).toBeNull();
    expect(konumEsle({ tur: 'city', etiket: 'İzmir' }, [{ ...izmir, name: 'İzmir Province' }])).toBeNull();
    expect(konumEsle({ tur: 'city', etiket: 'İzmir' }, [{ ...izmir, countryCode: 'US' }])).toBeNull();
  });
  it('Türkiye ülke kimliği sabit; başka ülke null', () => {
    expect(konumEsle({ tur: 'country', etiket: 'Türkiye', ulkeKodu: 'TR' }, [])).toEqual({ kaynak: GOOGLE_TURKIYE, ad: 'Türkiye' });
    expect(konumEsle({ tur: 'country', etiket: 'Almanya', ulkeKodu: 'DE' }, [])).toBeNull();
  });
});

describe('metin önerisi — uydurma taraması', () => {
  const g = { kaynakMetin: 'Amaç: Siteme gelsinler\nİşletme: Garden Villas\nVaatler: 3+1 bahçeli villa', yasalUyari: null };

  it('KRİTİK: girdide olmayan sayı ve fiyat/indirim sözü taşıyan satır ATILIR ve notlara yazılır', () => {
    const r = metinOnerisiTemizle(
      { anaMetin: 'Bahçeli villalar.', basliklar: ['%20 İndirimli Villalar', '3+1 Bahçeli Villa', 'Peşin Fiyatına'], aciklamalar: ['5 yıl taksit imkânı.', 'Garden Villas ile tanışın.'], notlar: [] },
      g,
    );
    expect(r.basliklar).toEqual(['3+1 Bahçeli Villa']);
    expect(r.aciklamalar).toEqual(['Garden Villas ile tanışın.']);
    expect(r.notlar.join(' ')).toMatch(/20/);
    expect(r.notlar.join(' ')).toMatch(/taksit|5/);
  });

  it('satır başındaki Türkçe söz de yakalanır ("Ücretsiz keşif"); girdide geçiyorsa serbest', () => {
    expect(metinOnerisiTemizle({ anaMetin: 'a', basliklar: ['Ücretsiz Keşif', 'Bedava Proje'], aciklamalar: [] }, g).basliklar).toEqual([]);
    expect(metinOnerisiTemizle({ anaMetin: 'a', basliklar: ['Ücretsiz Keşif'], aciklamalar: [] }, { ...g, kaynakMetin: 'Vaat: ücretsiz keşif' }).basliklar).toEqual(['Ücretsiz Keşif']);
  });

  it('KRİTİK: sınırı aşan başlık KIRPILMAZ, atılır', () => {
    const uzun = 'Bu başlık otuz karakterden kesinlikle uzun';
    const r = metinOnerisiTemizle({ anaMetin: 'a', basliklar: [uzun, 'Kısa'], aciklamalar: [], notlar: [] }, g);
    expect(r.basliklar).toEqual(['Kısa']);
    expect(r.notlar.some((n) => n.includes(uzun))).toBe(true);
  });

  it('ana metinde uydurma sayı varsa ana metin boşalır; yasal uyarı yoksa sona eklenir ve söylenir', () => {
    expect(metinOnerisiTemizle({ anaMetin: '100 villa kaldı', basliklar: [], aciklamalar: [] }, g).anaMetin).toBe('');
    const r = metinOnerisiTemizle({ anaMetin: 'Villalar.', basliklar: [], aciklamalar: ['Açıklama'] }, { ...g, yasalUyari: 'Yatırım tavsiyesi değildir.' });
    expect(r.anaMetin).toBe('Villalar.\n\nYatırım tavsiyesi değildir.');
    expect(r.notlar.join(' ')).toMatch(/sonuna eklendi/);
    expect(r.notlar.join(' ')).toMatch(/Google açıklamasında yok/);
  });
});

describe('platform okumaları — çözümleyiciler', () => {
  it('KRİTİK: Meta asgarisi KURUŞ → micros (4934 kuruş = 49,34 ₺); hesabın para birimi satırı', () => {
    const g = { data: [{ currency: 'USD', min_daily_budget_imp: 100 }, { currency: 'TRY', min_daily_budget_imp: 4934, min_daily_budget_low_freq: 999999 }] };
    expect(metaAsgariCoz(g, 'TRY')).toBe('49340000');
    expect(metaAsgariCoz(g, 'USD')).toBe('1000000');
  });
  it('okunamayan asgari null — sayı UYDURULMUYOR', () => {
    expect(metaAsgariCoz({ data: [{ currency: 'EUR', min_daily_budget_imp: 100 }] }, 'TRY')).toBeNull();
    expect(metaAsgariCoz({ data: [{ currency: 'TRY', min_daily_budget_imp: 49.34 }] }, 'TRY')).toBeNull();
    expect(metaAsgariCoz(null, 'TRY')).toBeNull();
  });
  it('form koşulu üç hâlli: alan yoksa null, false değil', () => {
    expect(formKosuluCoz({ leadgen_tos_accepted: true })).toBe(true);
    expect(formKosuluCoz({ leadgen_tos_accepted: false })).toBe(false);
    expect(formKosuluCoz({ id: '1' })).toBeNull();
  });
});

describe('yayın kapıları — sıra ve tembellik', () => {
  const O = 'a'.repeat(64);
  const engel: RehberEksigi = { adim: 4, alan: 'metin', platform: null, kod: 'METIN', seviye: 'engel', metin: 'Reklam metni yazılmadı' };
  const uyari: RehberEksigi = { ...engel, kod: 'G-KELIME-AZ', seviye: 'uyari', metin: 'az' };
  const GECTI: UyumSonucu = { tur: 'gecti', surum: UYUM_SURUMU };

  function okuyucu(o: Partial<{ prova: 'gecti' | 'bayat'; yazma: boolean; uyum: UyumSonucu }> = {}) {
    const cagri: string[] = [];
    const r: KapiOkuyuculari = {
      prova: async (p) => {
        cagri.push(`prova:${p}`);
        return o.prova === 'bayat' ? { tur: 'bayat', metin: 'eski' } : { tur: 'gecti' };
      },
      yazma: async (p) => {
        cagri.push(`yazma:${p}`);
        return o.yazma === false ? { acik: false, sebep: 'durduruldu' } : { acik: true };
      },
      uyum: () => {
        cagri.push('uyum');
        return o.uyum ?? GECTI;
      },
    };
    return { r, cagri };
  }
  const girdi = (o: Partial<Parameters<typeof rehberYayinKapilari>[0]> = {}) => ({
    istenenOzet: O,
    guncelOzet: O,
    provaOzeti: O,
    eksikler: [uyari],
    acik: { meta: true, google: true },
    ...o,
  });

  it('KRİTİK: özet uyuşmazsa HİÇBİR okuma yapılmaz', async () => {
    const { r, cagri } = okuyucu();
    expect(await rehberYayinKapilari(girdi({ istenenOzet: 'b'.repeat(64) }), r)).toMatchObject({ tur: 'ret', kapi: 'OZET' });
    expect(cagri).toEqual([]);
  });

  it('KRİTİK: engel varsa prova/yazma/uyum okunmaz; uyarı engel değil', async () => {
    const { r, cagri } = okuyucu();
    expect(await rehberYayinKapilari(girdi({ eksikler: [engel, uyari] }), r)).toMatchObject({ tur: 'ret', kapi: 'EKSIK', mesajlar: ['Reklam metni yazılmadı'] });
    expect(cagri).toEqual([]);
  });

  it('KRİTİK: prova başka içeriğe yapıldıysa platform kaydı OKUNMADAN ret; bayat prova yazma kapısını okutmaz', async () => {
    const a = okuyucu();
    expect(await rehberYayinKapilari(girdi({ provaOzeti: 'c'.repeat(64) }), a.r)).toMatchObject({ kapi: 'PROVA' });
    expect(a.cagri).toEqual([]);
    const b = okuyucu({ prova: 'bayat' });
    expect(await rehberYayinKapilari(girdi(), b.r)).toMatchObject({ kapi: 'PROVA', mesajlar: ['Meta: eski', 'Google: eski'] });
    expect(b.cagri).toEqual(['prova:meta', 'prova:google']);
  });

  it('yazma kapısı kapalıysa uyum çalışmaz; uyum durdu ise bulgular döner; hepsi geçerse uyum kararı döner', async () => {
    const a = okuyucu({ yazma: false });
    expect(await rehberYayinKapilari(girdi(), a.r)).toMatchObject({ kapi: 'YAZMA', mesajlar: ['durduruldu', 'durduruldu'] });
    expect(a.cagri).not.toContain('uyum');
    const durdu: UyumSonucu = { tur: 'durdu', surum: UYUM_SURUMU, bulgular: [{ kod: 'UYUM-SIYASI', platform: null, metin: 'siyasi' }] };
    expect(await rehberYayinKapilari(girdi(), okuyucu({ uyum: durdu }).r)).toMatchObject({ kapi: 'UYUM', uyum: durdu });
    const c = okuyucu();
    expect(await rehberYayinKapilari(girdi({ acik: { meta: false, google: true } }), c.r)).toEqual({ tur: 'gecti', uyum: GECTI });
    expect(c.cagri).toEqual(['prova:google', 'yazma:google', 'uyum']);
  });
});
