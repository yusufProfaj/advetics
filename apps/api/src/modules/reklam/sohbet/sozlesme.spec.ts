import { describe, expect, it } from 'vitest';
import {
  ADV_SOHBET_SINIRLARI,
  ARACLAR,
  ARAC_IZI,
  EN_COK_SORU,
  HAL_METNI,
  SOHBET_HALLERI,
  YASAKLI_ARACLAR,
  aracIziMetni,
  durumKelimesiVar,
  istanbulYarin,
  kotaDurumu,
  medyaKontrol,
  siradakiSoru,
  sohbetHali,
  taslakEksikleri,
  type SohbetHaliGirdisi,
  type SorulabilirAlan,
  type TaslakEksigi,
} from '@advetics/shared';

/**
 * AdvCampaign sohbet sözleşmesi (İP-09): soru sırası, ekran hâli, kota,
 * araç izi, medya girişi. Hepsi saf; panelde render testi olmadığı için
 * ekranın kararları burada kilitleniyor.
 */

const eksik = (alan: string, kod = 'X'): TaslakEksigi => ({ adim: 0, alan, kod, metin: alan }) as TaslakEksigi;

describe('siradakiSoru — S-48', () => {
  it('KRİTİK: sıra sabit — eksiklerin geliş sırası değil SORU_SIRASI belirler', () => {
    const e = [eksik('konumlar'), eksik('takvim'), eksik('butce'), eksik('niyet')];
    expect(siradakiSoru(e, [])?.alan).toBe('niyet');
    expect(siradakiSoru(e.filter((x) => x.alan !== 'niyet'), [])?.alan).toBe('butce');
    expect(siradakiSoru([eksik('konumlar'), eksik('takvim')], [])?.alan).toBe('takvim');
    expect(siradakiSoru([eksik('sayfaId'), eksik('hedefAdres'), eksik('konumlar')], [])?.alan).toBe('konumlar');
  });

  it('KRİTİK: beşinci sorudan sonra null — eksik kalsa bile', () => {
    const sorulan: SorulabilirAlan[] = ['niyet', 'kavramlar', 'butce', 'takvim'];
    expect(siradakiSoru([eksik('konumlar')], sorulan)?.sira).toBe(EN_COK_SORU);
    expect(siradakiSoru([eksik('konumlar')], [...sorulan, 'konumlar'])).toBeNull();
  });

  it('KRİTİK: prova eksiği (OK-17) soru sayılmıyor — alanı niyet olsa da', () => {
    // Canlı tur 2026-10-09: niyet yazılmıştı, prova eksiği niyete bağlıydı
    // ve sistem amacı yeniden sordu; cevap o eksiği asla kapatamazdı.
    expect(siradakiSoru([eksik('niyet', 'OK-17')], [])).toBeNull();
    expect(siradakiSoru([eksik('niyet', 'OK-17'), eksik('hedefAdres')], [])?.alan).toBe('hedefAdres');
  });

  it('KAYNAK kilidi soru sayılmıyor (onay kartında toplu onaylanır)', () => {
    expect(siradakiSoru([eksik('butce', 'KAYNAK')], [])).toBeNull();
    expect(siradakiSoru([eksik('butce', 'KAYNAK'), eksik('takvim')], [])?.alan).toBe('takvim');
  });

  it('KRİTİK: özel kategori modelin sorusu DEĞİL — eksik olsa da sorulmaz', () => {
    expect(siradakiSoru([eksik('ekKategoriler', 'OZK-SORU')], [])).toBeNull();
  });

  it('bütçe sorusunda tutar çipi YOK (varsayılansız alan önerilmez)', () => {
    const s = siradakiSoru([eksik('butce')], [])!;
    expect(s.secenekler).toEqual([]);
    expect(s.serbest).toBe(true);
  });

  it('gerçek taslakEksikleri çıktısıyla çalışıyor: boş taslakta ilk soru niyet', () => {
    expect(siradakiSoru(taslakEksikleri({}), [])?.alan).toBe('niyet');
  });

  it('site adresi çipleri Marka Merkezi sayfalarından', () => {
    const s = siradakiSoru([eksik('hedefAdres')], [], { sikSayfalar: [{ ad: 'Menü', adres: 'https://ornek.com/menu' }] })!;
    expect(s.secenekler).toEqual([{ etiket: 'Menü', deger: 'https://ornek.com/menu' }]);
  });
});

describe('sohbetHali — § 1.5', () => {
  const temel: SohbetHaliGirdisi = {
    hazirlik: 'hazir',
    yazmaYetkisi: true,
    eksikBaglanti: null,
    kota: { tur: 'serbest' },
    akis: 'yok',
    mesajSayisi: 2,
    sonAsistanMesaji: { durum: 'tamam', metinGeldi: true, soruVar: false },
  };
  const hal = (o: Partial<SohbetHaliGirdisi>) => sohbetHali({ ...temel, ...o });

  it('her hâlin bir ekran metni var', () => {
    for (const h of SOHBET_HALLERI) expect(HAL_METNI[h]).toBeDefined();
  });

  it('KRİTİK: hazırlık okunuyor / okunamadı / sonuç ayrı hâller', () => {
    expect(hal({ hazirlik: 'okunuyor' })).toBe('hazirlik_okunuyor');
    expect(hal({ hazirlik: 'okunamadi' })).toBe('hazirlik_okunamadi');
    expect(hal({ eksikBaglanti: 'sayfa' })).toBe('eksik_baglanti');
    expect(hal({ yazmaYetkisi: false, hazirlik: 'okunamadi' })).toBe('yetki_yok_yazma');
  });

  it('KRİTİK: akış koptu ve mesaj akıştaysa "tamam" ya da "hata" DEĞİL', () => {
    expect(hal({ akis: 'koptu', sonAsistanMesaji: { durum: 'akista', metinGeldi: true, soruVar: false } })).toBe('akis_koptu');
    // Mesaj zaten kapanmışsa kopukluk önemsiz: sonuç gösterilir.
    expect(hal({ akis: 'koptu' })).toBe('hazir');
  });

  it('düşünüyor ↔ yazıyor metin parçasıyla ayrılıyor', () => {
    expect(hal({ sonAsistanMesaji: { durum: 'akista', metinGeldi: false, soruVar: false } })).toBe('model_dusunuyor');
    expect(hal({ sonAsistanMesaji: { durum: 'akista', metinGeldi: true, soruVar: false } })).toBe('model_yaziyor');
  });

  it('kota akış sürerken cevabı kesmez, bittikten sonra görünür', () => {
    const doldu = { tur: 'doldu' as const, sebep: 'saatlik_mesaj' as const, yenilenme: null };
    expect(hal({ kota: doldu, sonAsistanMesaji: { durum: 'akista', metinGeldi: true, soruVar: false } })).toBe('model_yaziyor');
    expect(hal({ kota: doldu })).toBe('kota_doldu');
  });

  it('ret, kesildi, hata, soru ve boş oturum ayrı', () => {
    expect(hal({ sonAsistanMesaji: { durum: 'ret', metinGeldi: false, soruVar: false } })).toBe('model_reddetti');
    expect(hal({ sonAsistanMesaji: { durum: 'kesildi', metinGeldi: true, soruVar: false } })).toBe('model_kesildi');
    expect(hal({ sonAsistanMesaji: { durum: 'hata', metinGeldi: false, soruVar: false } })).toBe('model_ulasilamadi');
    expect(hal({ sonAsistanMesaji: { durum: 'tamam', metinGeldi: true, soruVar: true } })).toBe('soru_bekliyor');
    expect(hal({ mesajSayisi: 0, sonAsistanMesaji: null })).toBe('bos_oturum');
  });
});

describe('kota — § 4.9', () => {
  const simdi = new Date('2026-10-07T20:30:00Z'); // İstanbul 23:30
  const bos = { saatlikMesaj: 0, gunlukGirdiToken: 0, oturumMesaj: 0, saatlikEnEski: null };

  it('sınır altında serbest, sınırda doldu (>=)', () => {
    expect(kotaDurumu({ ...bos, saatlikMesaj: ADV_SOHBET_SINIRLARI.saatlikMesaj - 1 }, simdi).tur).toBe('serbest');
    expect(kotaDurumu({ ...bos, saatlikMesaj: ADV_SOHBET_SINIRLARI.saatlikMesaj }, simdi).tur).toBe('doldu');
  });

  it('KRİTİK: saatlik sınır en eski mesajdan bir saat sonra açılır ve bu söylenir', () => {
    const k = kotaDurumu({ ...bos, saatlikMesaj: 40, saatlikEnEski: new Date('2026-10-07T19:45:00Z') }, simdi);
    expect(k).toEqual({ tur: 'doldu', sebep: 'saatlik_mesaj', yenilenme: '2026-10-07T20:45:00.000Z' });
  });

  it('KRİTİK: günlük sınır İSTANBUL gece yarısında yenilenir', () => {
    expect(istanbulYarin(simdi).toISOString()).toBe('2026-10-07T21:00:00.000Z');
    // UTC'de hâlâ 7 Ekim ama İstanbul'da 8 Ekim 01:30: yenilenme 8'i 9'a
    // bağlayan gece. UTC günüyle hesaplamak bir gün ERKEN açardı.
    expect(istanbulYarin(new Date('2026-10-07T22:30:00Z')).toISOString()).toBe('2026-10-08T21:00:00.000Z');
    const k = kotaDurumu({ ...bos, gunlukGirdiToken: ADV_SOHBET_SINIRLARI.gunlukGirdiToken }, simdi);
    expect(k).toMatchObject({ sebep: 'gunluk_token', yenilenme: '2026-10-07T21:00:00.000Z' });
  });

  it('oturum sınırı önce (yeni oturum hemen çözer)', () => {
    expect(kotaDurumu({ ...bos, oturumMesaj: 120, saatlikMesaj: 40 }, simdi)).toMatchObject({ sebep: 'oturum_mesaj' });
  });
});

describe('araçlar — S-47', () => {
  it('KRİTİK: yasaklı hiçbir ad araç listesinde yok', () => {
    for (const y of YASAKLI_ARACLAR) expect(ARACLAR as readonly string[]).not.toContain(y);
  });

  it('her aracın iz metni var; dört hâl ayrı cümle', () => {
    for (const a of ARACLAR) expect(ARAC_IZI[a].suruyor).toBeTruthy();
    const h = ['tamam', 'sonuc_yok', 'dustu', 'reddedildi', 'bekliyor'] as const;
    expect(new Set(h.map((x) => aracIziMetni('konum_ara', x))).size).toBe(h.length);
  });

  it('durum kelimesi süzgeci: model "yayında" derse yakalanır, "yayın" kökü tek başına değil', () => {
    expect(durumKelimesiVar('Reklamın yayında!')).toBe(true);
    expect(durumKelimesiVar('Kampanya KURULDU.')).toBe(true);
    expect(durumKelimesiVar('Onaylarsan yayına hazırlanır.')).toBe(false);
    expect(durumKelimesiVar('Yayın için onayını bekliyorum.')).toBe(false);
  });
});

describe('medyaKontrol — giriş anında', () => {
  const m = (o: Partial<Parameters<typeof medyaKontrol>[0]>) => medyaKontrol({ mime: 'image/jpeg', bayt: 1000, en: 1080, boy: 1080, ...o });

  it('1:1, 4:5, 9:16 kabul; 16:10 UYARI (ret değil)', () => {
    expect(m({})).toEqual({ sonuc: 'kabul', oran: '1:1' });
    expect(m({ en: 1080, boy: 1350 })).toMatchObject({ sonuc: 'kabul', oran: '4:5' });
    expect(m({ en: 1080, boy: 1920 })).toMatchObject({ sonuc: 'kabul', oran: '9:16' });
    expect(m({ en: 1920, boy: 1200 })).toMatchObject({ sonuc: 'uyari', oran: '1,60:1' });
  });

  it('biçim, boyut ve okunamayan ölçü RET', () => {
    expect(m({ mime: 'image/webp' }).sonuc).toBe('ret');
    expect(m({ bayt: 31 * 1024 * 1024 }).sonuc).toBe('ret');
    expect(m({ mime: 'video/mp4', bayt: 31 * 1024 * 1024, en: 1200, boy: 1200 }).sonuc).toBe('kabul');
    expect(m({ en: 500, boy: 500 }).sonuc).toBe('ret');
    expect(m({ en: null }).sonuc).toBe('ret');
  });

  it('dar yatay video UYARI (ölçülmemiş öneri, ret değil)', () => {
    expect(m({ mime: 'video/mp4', en: 1000, boy: 1000 })).toMatchObject({ sonuc: 'uyari' });
    expect(m({ mime: 'video/mp4', en: 1080, boy: 1920 }).sonuc).toBe('kabul');
  });
});
