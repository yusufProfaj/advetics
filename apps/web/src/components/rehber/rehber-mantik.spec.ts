import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REHBER_ACILIS, REHBER_AMACLARI, REHBER_AMAC_KODLARI, platformGorunurMu, type GorselOrani, type RehberEksigi, type RehberHazirligi, type RehberProvaSonucu } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import {
  setGorunumu,
  setSil,
  setTasi,
  yuvayaEkle,
  type MedyaOgesi,
  adimAltMetni,
  adimBittiMi,
  amacDegisimi,
  hazirAdimlar,
  kurulumAdimlari,
  listeDurumu,
  metinKurali,
  metinKutusu,
  platformAnahtari,
  sonEkranOzeti,
  provaYoklanmaliMi,
  bitisSecenegi,
  bugun,
  degisiklikBirlestir,
  formListesiHali,
  silme,
  videoListesiHali,
  gorunurAmaclar,
  kategoriDegeri,
  kayitHatasi,
  kelimeDegistir,
  kelimeOnerisiHali,
  kelimeSatirlari,
  konumEslemeImzasi,
  metinOnerisiHali,
  onDoldurma,
  oneriHatasi,
  paraGoster,
  platformDurumu,
  platformNedeni,
  provaGosterimi,
  seciliKategori,
  telefonKaydi,
  tutarOku,
  yasKilitliMi,
  yasSecenegi,
  yayinAdimlari,
  yayinBittiMi,
  yayinSonucu,
  geriAlinabilirMi,
  yayinlanabilirMi,
  yerelAlanlar,
  youtubeKimligi,
} from './rehber-mantik';

const z = '2026-10-10T10:00:00Z';
const alan = <T,>(deger: T, kaynak: 'kullanici' | 'marka_merkezi' | 'derleyici' = 'kullanici') => ({ deger, kaynak, kim: null, zaman: z });

describe('değişiklik birleştirme ve yerel görüntü', () => {
  it('aynı alan iki kez gitmez, sonuncusu kazanır, sıra ilk görünüşte', () => {
    const k = degisiklikBirlestir(
      [
        { alan: 'amac', deger: 'SITE', kaynak: 'kullanici' },
        { alan: 'telefon', deger: '+90', kaynak: 'kullanici' },
      ],
      [{ alan: 'amac', deger: 'FORM', kaynak: 'kullanici' }],
    );
    expect(k).toEqual([
      { alan: 'amac', deger: 'FORM', kaynak: 'kullanici' },
      { alan: 'telefon', deger: '+90', kaynak: 'kullanici' },
    ]);
  });

  it('KRİTİK: sunucu cevabı yazılmamış değişikliği EZMEZ; `sil` alanı siler, null DEĞER olarak kalır', () => {
    const a = yerelAlanlar(
      { hedefAdres: alan('https://eski'), telefon: alan('+905551112233'), instagramId: alan('ig') },
      [
        { alan: 'hedefAdres', deger: 'https://yeni', kaynak: 'kullanici' },
        silme('telefon'),
        { alan: 'instagramId', deger: null, kaynak: 'kullanici' },
      ],
    );
    expect(a.hedefAdres?.deger).toBe('https://yeni');
    expect(a.telefon).toBeUndefined();
    // "Instagram olmadan" bir karar: alan DURUYOR, değeri null.
    expect(a.instagramId).toBeDefined();
    expect(a.instagramId?.deger).toBeNull();
    expect(silme('telefon')).toEqual({ alan: 'telefon', deger: null, kaynak: 'kullanici', sil: true });
  });

  it('kayıt hatası: 409 çatışma, diğerleri sunucunun mesajıyla', () => {
    expect(kayitHatasi(new ApiRequestError('eski', 409, 'CONFLICT'))).toEqual({ tur: 'catisma' });
    expect(kayitHatasi(new ApiRequestError('Alan geçersiz', 400, 'VALIDATION'))).toEqual({ tur: 'hata', mesaj: 'Alan geçersiz' });
    expect(kayitHatasi('?')).toEqual({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
    expect(kayitHatasi(new TypeError('Failed to fetch'))).toEqual({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
  });
});

describe('öneri: DÖRT HÂL ayrı', () => {
  it('KRİTİK: boş kelime önerisi "geldi" değil "bos" ve sunucunun NEDENİYLE', () => {
    expect(kelimeOnerisiHali({ satirlar: [], toplam: 0, bosNeden: 'Hesap atanmamış' })).toEqual({ tur: 'bos', neden: 'Hesap atanmamış' });
    expect(kelimeOnerisiHali({ satirlar: [], toplam: 0, bosNeden: null }).tur).toBe('bos');
    const dolu = { satirlar: [{ metin: 'villa', aylikArama: 880, rekabet: 'orta' as const }], toplam: 214, bosNeden: null };
    expect(kelimeOnerisiHali(dolu)).toEqual({ tur: 'geldi', deger: dolu });
  });

  it('KRİTİK: düşen çağrı "dustu" ve platformun mesajı — boş liste DEĞİL', () => {
    expect(oneriHatasi(new ApiRequestError('Google kota doldu', 429, 'QUOTA'))).toEqual({ tur: 'dustu', mesaj: 'Google kota doldu' });
    expect(oneriHatasi(new Error('ağ'))).toEqual({ tur: 'dustu', mesaj: 'ağ' });
  });

  it('metin önerisi: tamamen boşsa notlarıyla "bos"', () => {
    expect(metinOnerisiHali({ anaMetin: ' ', basliklar: [''], aciklamalar: [], notlar: ['Site okunamadı'] })).toEqual({ tur: 'bos', neden: 'Site okunamadı' });
    expect(metinOnerisiHali({ anaMetin: 'Merhaba', basliklar: [], aciklamalar: [], notlar: [] }).tur).toBe('geldi');
  });

  it('KRİTİK: video listesi boşsa sunucunun nedeniyle "bos", doluysa "geldi"', () => {
    expect(videoListesiHali({ satirlar: [], toplam: 0, dahaFazlaVar: false, bosNeden: 'Kanal bağlantısı kopmuş' })).toEqual({ tur: 'bos', neden: 'Kanal bağlantısı kopmuş' });
    const r = { satirlar: [{ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım', kucukResim: null, yayinTarihi: null }], toplam: 1, dahaFazlaVar: false, bosNeden: null };
    expect(videoListesiHali(r)).toEqual({ tur: 'geldi', deger: r });
  });

  it('KRİTİK: form listesi: boşsa sunucunun NEDENİYLE "bos", doluysa "geldi"; düşen çağrı ayrı hâl (oneriHatasi)', () => {
    expect(formListesiHali({ satirlar: [], toplam: 0, kesildi: false, bosNeden: 'Yayında form yok' })).toEqual({ tur: 'bos', neden: 'Yayında form yok' });
    const r = { satirlar: [{ id: '123', ad: 'Teklif', gizlilikAdresi: 'https://o.com/kvkk' }], toplam: 1, kesildi: false, bosNeden: null };
    expect(formListesiHali(r)).toEqual({ tur: 'geldi', deger: r });
  });

  it('kelime satırları: seçililer önce ve hepsi, öneriden gelen tekrar Türkçe küçük harfle elenir', () => {
    const s = kelimeSatirlari(
      [{ metin: 'İzmir villa', aylikArama: null }],
      { satirlar: [{ metin: 'izmir villa', aylikArama: 500, rekabet: 'dusuk' }, { metin: 'kiralık villa', aylikArama: 22200, rekabet: 'yuksek' }], toplam: 2, bosNeden: null },
    );
    expect(s.map((x) => [x.metin, x.secili, x.rekabet])).toEqual([
      ['İzmir villa', true, 'dusuk'],
      ['kiralık villa', false, 'yuksek'],
    ]);
    expect(kelimeDegistir([{ metin: 'İzmir villa', aylikArama: null }], { metin: 'izmir villa', aylikArama: 1 })).toEqual([]);
    expect(kelimeDegistir([], { metin: ' villa ', aylikArama: 5 })).toEqual([{ metin: 'villa', aylikArama: 5 }]);
  });
});

describe('görünürlük süzgeci: tek karar platformGorunurMu', () => {
  it('KRİTİK: amaç kartları platformGorunurMu ile AYNI kararı veriyor (ajans yöneticisi ve diğer kullanıcılar)', () => {
    for (const ajans of [true, false]) {
      const beklenen = REHBER_AMAC_KODLARI.filter((k) => platformGorunurMu(k, 'meta', ajans) || platformGorunurMu(k, 'google', ajans));
      expect(gorunurAmaclar(ajans)).toEqual(beklenen);
    }
    // Bugünkü tabloda her şey deneme/kapalı: müşteri hiçbir amaç görmüyor.
    // (Tablo açılınca bu satır güncellenir; ekran boş listeyi SEBEBİYLE gösteriyor.)
    const acikVarMi = REHBER_AMAC_KODLARI.some((k) => REHBER_ACILIS[k].meta === 'acik' || REHBER_ACILIS[k].google === 'acik');
    expect(gorunurAmaclar(false).length > 0).toBe(acikVarMi);
  });

  it('karşılığı olmayan Google sebebini amaç tanımından yazıyor; açılışı kapalı olan "henüz açık değil"', () => {
    expect(platformDurumu('WHATSAPP', 'google', true)).toEqual({ gorunur: false, sebep: "Google'da WhatsApp reklamı yok", deneme: false });
    expect(platformDurumu('FORM', 'google', true)).toEqual({ gorunur: false, sebep: 'Bu amaçta Google henüz açık değil', deneme: false });
    expect(platformDurumu('SITE', 'meta', true).deneme).toBe(REHBER_ACILIS.SITE.meta === 'deneme');
    expect(platformDurumu('SITE', 'meta', false).gorunur).toBe(platformGorunurMu('SITE', 'meta', false));
  });

  it('öneri cümlesi sayı UYDURMUYOR ve hesabı olmayan platformu söylüyor', () => {
    const h = { ajansYoneticisi: true, hesaplar: [{ id: 'm', ad: 'M', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }], googleHesaplari: [] };
    expect(platformNedeni('SITE', h)).toContain('Google Ads hesabı atanmamış');
    const tam = { ...h, googleHesaplari: [{ id: 'g', ad: 'G', musteriNo: '1-2-3', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }] };
    expect(platformNedeni('SITE', tam)).not.toMatch(/\d/);
    // Tek platformlu amaç: Meta dalı kapalıyken (tablodan bağımsız kuruluyor).
    const eski = REHBER_ACILIS.VIDEO.meta;
    try {
      REHBER_ACILIS.VIDEO.meta = 'kapali';
      expect(platformNedeni('VIDEO', tam)).toContain("yalnız Google'da");
    } finally {
      REHBER_ACILIS.VIDEO.meta = eski;
    }
  });
});

describe('ray ve eksikler', () => {
  const e = (adim: 1 | 2 | 3 | 4 | 5 | 6, seviye: 'engel' | 'uyari'): RehberEksigi => ({ adim, alan: null, platform: null, kod: 'X', seviye, metin: 'x' });
  it('KRİTİK: geçilmiş ama engeli kalan adım "bitti" GÖSTERİLMEZ; uyarı engel sayılmaz', () => {
    expect(adimBittiMi([e(2, 'engel')], 2, 4, true)).toBe(false);
    expect(adimBittiMi([e(2, 'uyari')], 2, 4, true)).toBe(true);
    expect(adimBittiMi([], 4, 4, true)).toBe(false); // şu anki adım
    expect(adimBittiMi([e(2, 'engel')], 2, 7, true)).toBe(true); // son ekran
  });

  it('KRİTİK: amaç seçilmeden 2-6 için tik ve "hazır" YOK', () => {
    // Sunucu amaçsız rehberde yalnız AMAC eksiğini döndürüyor; 2-5 engelsiz
    // görünüyor ve ekran beş "hazır" yazıyordu.
    const amacYok: RehberEksigi = { adim: 1, alan: 'amac', platform: null, kod: 'AMAC', seviye: 'engel', metin: 'Amaç seçilmedi' };
    for (const n of [2, 3, 4, 5] as const) {
      expect(adimBittiMi([amacYok], n, 6, false), `adım ${n}`).toBe(false);
      // Ekranda seçildi ama sunucu cevabı henüz gelmedi: yine tik yok.
      expect(adimBittiMi([amacYok], n, 6, true), `adım ${n} bekleyen`).toBe(false);
      expect(adimBittiMi([], n, 6, false), `adım ${n} yerel amaç yok`).toBe(false);
    }
    expect(hazirAdimlar([amacYok], false)).toEqual([]);
    expect(hazirAdimlar([amacYok], true)).toEqual([]);
    expect(hazirAdimlar([], false)).toEqual([]);
    expect(hazirAdimlar([e(3, 'engel'), e(4, 'uyari')], true)).toEqual([1, 2, 5]);
  });

  it('raydaki alt satır seçimi söylüyor', () => {
    const yok = { meta: false, google: false };
    expect(adimAltMetni(2, 'Meta, Google', null, yok)).toBe('Meta, Google');
    expect(adimAltMetni(2, 'Meta, Google', 'SITE', { meta: true, google: false })).toBe('Meta');
    expect(adimAltMetni(2, 'Meta, Google', 'SITE', { meta: true, google: true })).toBe('Meta + Google');
    expect(adimAltMetni(2, 'Meta, Google', 'SITE', yok)).toBe('Platform seçilmedi');
    expect(adimAltMetni(1, 'Ne bekliyorsun', 'SITE', yok)).toBe(REHBER_AMACLARI.SITE.ekranAdi);
    expect(adimAltMetni(1, 'Ne bekliyorsun', null, yok)).toBe('Ne bekliyorsun');
    expect(adimAltMetni(3, 'Konum, yaş', 'SITE', yok)).toBe('Konum, yaş');
  });
});

describe('amaç değişimi ve platform anahtarı', () => {
  const h = {
    ajansYoneticisi: true,
    hesaplar: [{ id: 'm', ad: 'M', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
    googleHesaplari: [{ id: 'g', ad: 'G', musteriNo: '1-2-3', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
  };
  const gorunur = (p: 'meta' | 'google') => REHBER_AMAC_KODLARI.filter((k) => platformGorunurMu(k, p, true));
  const metaAmaclari = gorunur('meta');
  const googlesuz = REHBER_AMAC_KODLARI.filter((k) => !platformGorunurMu(k, 'google', true) && platformGorunurMu(k, 'meta', true));

  it('BOŞA DÜŞME BEKÇİSİ: tablo testin aradığı amaçları içeriyor', () => {
    expect(metaAmaclari.length).toBeGreaterThanOrEqual(2);
    expect(googlesuz.length).toBeGreaterThanOrEqual(1);
  });

  it('KRİTİK: kullanıcının kurulabilir seçimi korunuyor (A → B → A seçimi kaybetmiyor)', () => {
    const [a, b] = metaAmaclari as [typeof metaAmaclari[0], typeof metaAmaclari[0]];
    const secim = alan({ meta: true, google: false });
    const ab = amacDegisimi(b, secim, h);
    expect(ab).toEqual([{ alan: 'amac', deger: b, kaynak: 'kullanici' }]);
    expect(amacDegisimi(a, secim, h)).toEqual([{ alan: 'amac', deger: a, kaynak: 'kullanici' }]);
  });

  it('KRİTİK: seçim yeni amaçta kurulamıyorsa ya da öneriyse öneri yazılıyor', () => {
    const g = googlesuz[0]!;
    const yalnizGoogle = amacDegisimi(g, alan({ meta: false, google: true }), h);
    expect(yalnizGoogle[1]).toEqual({ alan: 'platformlar', deger: { meta: true, google: false }, kaynak: 'derleyici' });
    // İkisi açıkken Google'sız amaca geçiş: Google kurulamıyor, öneri.
    expect(amacDegisimi(g, alan({ meta: true, google: true }), h)).toHaveLength(2);
    // Hiçbiri açık değilse "seçim" yok sayılır.
    expect(amacDegisimi(metaAmaclari[0]!, alan({ meta: false, google: false }), h)).toHaveLength(2);
    // Öneriden gelen (derleyici) seçim her zaman yenilenir.
    expect(amacDegisimi(metaAmaclari[0]!, alan({ meta: true, google: false }, 'derleyici'), h)).toHaveLength(2);
    expect(amacDegisimi(metaAmaclari[0]!, undefined, h)).toHaveLength(2);
  });

  it('KRİTİK: anahtar ekrandaki kümeden yazıyor, kayıttaki görünmeyen platformdan değil', () => {
    // Ekranda yalnız Meta açık (kayıtta Google true ama görünmüyor): Meta'yı
    // kapatmak Google'ı geri açmamalı.
    expect(platformAnahtari({ meta: true, google: false }, 'meta')).toEqual({ meta: false, google: false });
    expect(platformAnahtari({ meta: true, google: false }, 'google')).toEqual({ meta: true, google: true });
    expect(platformAnahtari({ meta: true, google: true }, 'google')).toEqual({ meta: true, google: false });
  });
});

describe('metin kuralı açık platforma göre', () => {
  it('KRİTİK: yalnız Meta açıkken Google kuralı yok (3 başlık, 2 açıklama, reklam gücü)', () => {
    const k = metinKurali({ meta: true, google: false }, 'ARAMA');
    expect(k.gucGoster).toBe(false);
    expect(k.baslikKutu).toBe(1);
    expect(k.aciklamaKutu).toBe(1);
    expect(k.baslikEnCok).toBe(5);
    expect(k.aciklamaEnCok).toBe(1);
    expect(k.baslikNotu).not.toContain('Google');
    expect(k.aciklamaNotu).toContain('İsteğe bağlı');
    const m = metinKutusu(undefined, k);
    expect(k.soru).not.toContain('iki platform');
    expect(m).toEqual({ anaMetin: '', basliklar: [''], aciklamalar: [''] });
  });

  it('Google Arama açıkken Google kuralı ve reklam gücü', () => {
    const k = metinKurali({ meta: true, google: true }, 'ARAMA');
    expect(k.gucGoster).toBe(true);
    expect(k).toMatchObject({ baslikKutu: 3, baslikEnCok: 15, aciklamaKutu: 2, aciklamaEnCok: 4 });
    expect(k.baslikNotu).toContain("Meta ilk 5'ini");
    expect(metinKurali({ meta: false, google: true }, 'ARAMA').baslikNotu).not.toContain('Meta');
    // Kayıttaki fazlası gizlenmiyor.
    expect(metinKutusu({ anaMetin: 'a', basliklar: ['1', '2', '3', '4'], aciklamalar: [] }, k).basliklar).toHaveLength(4);
  });

  it('KRİTİK: SİMETRİ: her ipucu yalnız açık platform(lar)ı anlatır', () => {
    // Canlı tur: yalnız Google açıkken "Meta ilk 5'ini" ve "iki platformun
    // kalıbına bölüyoruz" görünüyordu.
    const kurgular = ['ARAMA', 'TALEP_YARATMA_GORSEL', 'TALEP_YARATMA_VIDEO', 'MAKS_PERFORMANS'] as const;
    for (const kurgu of kurgular) {
      const g = metinKurali({ meta: false, google: true }, kurgu);
      for (const t of [g.soru, g.baslikNotu, g.aciklamaNotu]) expect(t, `${kurgu}: ${t}`).not.toMatch(/Meta|iki platform/);
      const m = metinKurali({ meta: true, google: false }, kurgu);
      for (const t of [m.soru, m.baslikNotu, m.aciklamaNotu]) expect(t, `${kurgu}: ${t}`).not.toMatch(/Google|iki platform/);
      expect(m.gucGoster).toBe(false);
      expect(metinKurali({ meta: true, google: true }, kurgu).soru).toContain('iki platform');
    }
    expect(metinKurali({ meta: false, google: true }, 'ARAMA').soru).toBe("Metni ver; Google'ın kalıbına biz yerleştiriyoruz.");
    expect(metinKurali({ meta: true, google: false }, null).soru).toContain("Meta'nın");
  });

  it('Google arama dışı kurguda reklam gücü yok, açıklama en az 1', () => {
    const k = metinKurali({ meta: false, google: true }, 'TALEP_YARATMA_GORSEL');
    expect(k.gucGoster).toBe(false);
    expect(k.aciklamaNotu).toBe('En az 1');
    expect(k.baslikNotu).toBe('En çok 5 · Google hepsini dener');
  });
});

describe('onay penceresi ve son ekran', () => {
  it('Google adım metni kurguya göre ("kelimeler" yalnız Arama)', () => {
    expect(kurulumAdimlari('google', 'ARAMA')[0]).toContain('kelimeler');
    expect(kurulumAdimlari('google', 'TALEP_YARATMA_VIDEO')[0]).toBe('Duraklatılmış kur (kampanya, grup, reklam)');
    expect(kurulumAdimlari('google', 'TALEP_YARATMA_GORSEL')[0]).not.toContain('kelimeler');
    expect(kurulumAdimlari('google', 'MAKS_PERFORMANS')[0]).toBe('Duraklatılmış kur (kampanya, öğe grubu)');
    expect(kurulumAdimlari('meta', 'ARAMA')[0]).toBe('Duraklatılmış kur (kampanya, set, reklam)');
  });

  it('KRİTİK: arşivlenen platform başlıkta; "Duraklatılmış kuruldu" kalmıyor', () => {
    // Canlı tur: Meta arşivlendi, Google duraklatılmış; başlık eskiden değişmiyordu.
    const karisik = sonEkranOzeti(
      [
        { platform: 'meta', sonuc: 'arsivlendi' },
        { platform: 'google', sonuc: 'duraklatildi' },
      ],
      false,
    );
    expect(karisik.baslik).toBe("Meta'daki reklam arşivlendi");
    expect(karisik.metin).toContain("Google'da duraklatılmış");
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'arsivlendi' }], false)).toMatchObject({ hal: 'arsiv', baslik: 'Reklam arşivlendi' });
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'arsivlendi' }, { platform: 'google', sonuc: 'yayinda' }], false).metin).toBe("Google'da yayında.");
  });

  it('diğer hâller eskisi gibi', () => {
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'duraklatildi' }], false).baslik).toBe('Duraklatılmış kuruldu');
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'yayinda' }], false).metin).toContain("Meta'da kuruldu");
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'yayinda' }, { platform: 'google', sonuc: 'yayinda' }], false).metin).toContain('İki platformda da');
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'hata' }, { platform: 'google', sonuc: 'arsivlendi' }], false).hal).toBe('hata');
    expect(sonEkranOzeti([{ platform: 'meta', sonuc: 'yayinda' }], true).metin).toContain('hiçbir şey gönderilmeden');
  });
});

describe('giriş listesi durumu', () => {
  const r = { durum: 'yayinda' as const, platformlar: { meta: true, google: true } };
  it('KRİTİK: arşivlenen reklam "Yayında" görünmüyor', () => {
    expect(listeDurumu({ ...r, platformlar: { meta: true, google: false }, yayinlar: [{ platform: 'meta', durum: 'arsivlendi' }] })).toBe('Arşivlendi · Meta');
    expect(
      listeDurumu({
        ...r,
        yayinlar: [
          { platform: 'meta', durum: 'arsivlendi' },
          { platform: 'google', durum: 'kapali_kuruldu' },
        ],
      }),
    ).toBe('Meta: Arşivlendi · Google: Duraklatılmış');
  });
  it('taslak ve yayın bilgisi olmayan satır', () => {
    expect(listeDurumu({ ...r, durum: 'taslak', yayinlar: [] })).toBe('Taslak · Meta + Google');
    expect(listeDurumu({ ...r, yayinlar: [] })).toBe('Yayında · Meta + Google');
    expect(listeDurumu({ ...r, yayinlar: [{ platform: 'meta', durum: 'yayinda' }, { platform: 'google', durum: 'ogreniyor' }] })).toBe('Yayında · Meta + Google');
  });
});

describe('Kime: yaş ve kategori', () => {
  it('KRİTİK: kategori sorusu HİÇ cevaplanmadıysa hiçbir şık seçili değil; "Hayır" boş dizi', () => {
    expect(seciliKategori(undefined)).toBeNull();
    expect(seciliKategori([])).toBe('YOK');
    expect(seciliKategori(['HOUSING'])).toBe('HOUSING');
    expect(kategoriDegeri('YOK')).toEqual([]);
  });

  it('KRİTİK: konut, iş ve kredi yaşı kilitliyor; workspace tabanı da sayılıyor; siyaset kilitlemiyor', () => {
    expect(yasKilitliMi(['HOUSING'], [])).toBe(true);
    expect(yasKilitliMi([], ['EMPLOYMENT'])).toBe(true);
    expect(yasKilitliMi(['ISSUES_ELECTIONS_POLITICS'], [])).toBe(false);
    expect(yasKilitliMi(undefined, [])).toBe(false);
  });

  it('yaş düğmesi kayıtlı aralıktan', () => {
    expect(yasSecenegi(null, false)).toBe('genis');
    expect(yasSecenegi({ min: 25, max: 54 }, false)).toBe('25-54');
    expect(yasSecenegi({ min: 30, max: 40 }, false)).toBe('ozel');
    expect(yasSecenegi(null, true)).toBe('ozel');
  });
});

describe('para ve tarih', () => {
  it('tutar Türkçe yazımdan micros dizgesine, belirsiz "1.5" reddedilir', () => {
    expect(tutarOku('1.250,5', 'TRY')).toEqual({ tur: 'tamam', micros: '1250500000' });
    expect(tutarOku('1.5', 'TRY').tur).toBe('hata');
    expect(paraGoster('500000000', 'TRY')).toBe('500 ₺');
    expect(paraGoster('1250500000', 'TRY')).toBe('1.250,5 ₺');
    expect(paraGoster('40000000', 'USD')).toBe('40 USD');
  });

  it('KRİTİK: "bugün" hesabın saat diliminde', () => {
    const an = new Date('2026-10-07T23:00:00Z');
    expect(bugun('Europe/Istanbul', an)).toBe('2026-10-08');
    expect(bugun('America/Los_Angeles', an)).toBe('2026-10-07');
  });

  it('bitiş düğmesi kayıtlı takvimden', () => {
    expect(bitisSecenegi(null)).toBeNull();
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: null })).toBe('yok');
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: '2026-11-09' })).toBe(30);
    expect(bitisSecenegi({ baslangic: '2026-10-25', bitis: '2026-11-01' })).toBe(7); // yaz saati geçişi
    expect(bitisSecenegi({ baslangic: '2026-10-10', bitis: '2026-10-20' })).toBeNull();
  });
});

describe('prova ve yayın', () => {
  const OZ = 'a'.repeat(64);
  const prova: RehberProvaSonucu = { icerikOzeti: OZ, meta: { tur: 'gecti', zaman: z, not: null }, google: { tur: 'reddetti', zaman: z, mesajlar: ['Başlık uzun'] } };

  it('KRİTİK: içerik değiştiyse eski prova "bayat" — Yayınla açılmaz', () => {
    expect(provaGosterimi(prova, OZ, 'meta', false)).toEqual({ tur: 'gecti', not: null });
    expect(provaGosterimi(prova, 'b'.repeat(64), 'meta', false)).toEqual({ tur: 'bayat' });
    expect(yayinlanabilirMi([], { meta: true, google: false }, prova, OZ)).toBe(true);
    expect(yayinlanabilirMi([], { meta: true, google: false }, prova, 'b'.repeat(64))).toBe(false);
  });

  it('KRİTİK: açık platformlardan biri reddettiyse ya da engel varsa Yayınla kapalı', () => {
    expect(yayinlanabilirMi([], { meta: true, google: true }, prova, OZ)).toBe(false);
    const engel: RehberEksigi = { adim: 5, alan: 'butce', platform: null, kod: 'BTC-01', seviye: 'engel', metin: 'x' };
    expect(yayinlanabilirMi([engel], { meta: true, google: false }, prova, OZ)).toBe(false);
    const uyari: RehberEksigi = { ...engel, seviye: 'uyari' };
    expect(yayinlanabilirMi([uyari], { meta: true, google: false }, prova, OZ)).toBe(true);
    expect(yayinlanabilirMi([], { meta: false, google: false }, prova, OZ)).toBe(false);
  });

  it('onay penceresi adımları GERÇEK durumdan; deneme "atlandi"', () => {
    expect(yayinAdimlari(null)).toEqual(['suruyor', 'bekliyor', 'bekliyor']);
    expect(yayinAdimlari('geri_okuma')).toEqual(['bitti', 'suruyor', 'bekliyor']);
    expect(yayinAdimlari('fark_var')).toEqual(['bitti', 'hata', 'bekliyor']);
    expect(yayinAdimlari('kapali_kuruldu')).toEqual(['bitti', 'bitti', 'atlandi']);
    expect(yayinAdimlari('yayinda')).toEqual(['bitti', 'bitti', 'bitti']);
  });

  it('KRİTİK: yoklama motor ilerlerken sürüyor, son durumda duruyor; uyum durdurduysa hemen', () => {
    expect(yayinSonucu({ durum: 'kuruluyor' })).toBe('suruyor');
    expect(yayinSonucu({ durum: null })).toBe('suruyor');
    expect(yayinSonucu({ durum: 'kapali_kuruldu' })).toBe('duraklatildi');
    expect(yayinSonucu({ durum: 'iletildi' })).toBe('yayinda');
    expect(yayinSonucu({ durum: 'kurulamadi' })).toBe('hata');
    expect(yayinBittiMi([{ durum: 'yayinda' }, { durum: 'aciliyor' }], false)).toBe(false);
    expect(yayinBittiMi([{ durum: 'yayinda' }, { durum: 'kurulamadi' }], false)).toBe(true);
    expect(yayinBittiMi([], false)).toBe(false);
    expect(yayinBittiMi([], true)).toBe(true);
  });
});

describe('reklam adımı yardımcıları', () => {
  it('YouTube kimliği bağlantının üç biçiminden ve çıplak kimlikten', () => {
    expect(youtubeKimligi('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeKimligi('https://vimeo.com/123')).toBeNull();
  });

  it('telefon E.164, baştaki sıfır atılıyor', () => {
    expect(telefonKaydi('0 232 555 01 23')).toBe('+902325550123');
    expect(telefonKaydi('')).toBeNull();
  });

  it('konum eşlemesi: aynı eşlenmemiş küme İKİNCİ kez istenmez, Google kapalıysa hiç', () => {
    const a = { konumlar: alan([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }]) };
    expect(konumEslemeImzasi(a, false, new Set())).toBeNull();
    const imza = konumEslemeImzasi(a, true, new Set());
    expect(imza).toBe('city:1');
    expect(konumEslemeImzasi(a, true, new Set([imza!]))).toBeNull();
    const eslenmis = { konumlar: alan([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1', ad: 'İzmir' } }]) };
    expect(konumEslemeImzasi(eslenmis, true, new Set())).toBeNull();
  });
});

describe('açılışta önden doldurma', () => {
  const h = {
    hesaplar: [{ id: 'm1', ad: 'M', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
    googleHesaplari: [],
    sayfalar: [
      { id: 's1', ad: 'A', ustSayfaPlatformId: null },
      { id: 's2', ad: 'B', ustSayfaPlatformId: null },
    ],
    instagramHesaplari: [],
    youtubeKanallari: [],
    varsayilanKitle: { id: 'k', ad: 'K', ozet: '', konumlar: [{ tur: 'city', key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }] },
    iletisim: { telefon: null, siteAdresi: 'https://ornek.com' },
  } as unknown as RehberHazirligi;

  it('KRİTİK: tek seçenek doldurulur, birden çok sayfada "listenin ilki" SEÇİLMEZ', () => {
    const d = onDoldurma({}, h);
    expect(d.map((x) => [x.alan, x.kaynak])).toEqual([
      ['metaHesabiId', 'workspace_profili'],
      ['konumlar', 'marka_merkezi'],
      ['hedefAdres', 'marka_merkezi'],
    ]);
  });

  it('dolu alana dokunulmaz', () => {
    expect(onDoldurma({ metaHesabiId: alan('m9'), konumlar: alan([]), hedefAdres: alan(null) }, h)).toEqual([]);
  });
});

/**
 * KAYNAK TARAMASI: panel eksik listesi KURMAZ, hatayı YUTMAZ, görünürlüğü
 * kendisi KARAR VERMEZ, açılan pencere DOM'dan ÇIKMAZ. Taramalar yorumsuz
 * kaynakta (kuralı anlatan yorum eşleşip testi yeşil tutmasın).
 */
const yorumsuz = (f: string) =>
  readFileSync(join(__dirname, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const DOSYALAR = ['rehber-ekrani.tsx', 'adim-amac-nerede.tsx', 'adim-kime.tsx', 'adim-reklam.tsx', 'adim-butce.tsx', 'adim-kontrol.tsx', 'rehber-girisi.tsx'];

describe('kaynak: sözleşmeye bağlılık', () => {
  it('BOŞA DÜŞME BEKÇİSİ: bileşenler gerçekten okundu', () => {
    expect(yorumsuz('rehber-ekrani.tsx')).toContain('export function RehberEkrani');
    expect(yorumsuz('adim-kontrol.tsx')).toContain('export function OnayPenceresi');
  });

  it('KRİTİK: eksik listesi sunucudan; panelde rehberEksikleri çağrılmıyor', () => {
    for (const f of DOSYALAR) expect(yorumsuz(f), f).not.toMatch(/rehberEksikleri\s*\(|yayinaEngelVarMi\s*\(/);
    expect(yorumsuz('rehber-ekrani.tsx')).toContain('kayit.eksikler');
  });

  it('KRİTİK: hata yutulmuyor (`.catch(() =>` yok)', () => {
    for (const f of DOSYALAR) expect(yorumsuz(f), f).not.toMatch(/\.catch\(\(\)\s*=>/);
  });

  it('KRİTİK: görünürlüğü REHBER_ACILIS tablosuna doğrudan bakarak değil platformGorunurMu üzerinden veriyor', () => {
    const nerede = yorumsuz('adim-amac-nerede.tsx');
    expect(nerede).toContain('gorunurAmaclar(b.h.ajansYoneticisi)');
    expect(nerede).toContain('platformDurumu(');
    expect(nerede).not.toContain('REHBER_ACILIS');
    // Anahtar görünmeyen platformda kapalı.
    expect(nerede).toContain('disabled={!d.gorunur}');
  });

  it('KRİTİK: onay penceresi koşulsuz çiziliyor, görünürlük sınıfla', () => {
    const k = yorumsuz('adim-kontrol.tsx');
    expect(k).toContain("className={`${s.perde} ${acik ? s.acik : ''}`}");
    expect(k).not.toMatch(/if \(!acik\) return null/);
    expect(yorumsuz('rehber-ekrani.tsx')).toMatch(/<OnayPenceresi\s/);
    expect(yorumsuz('rehber-ekrani.tsx')).not.toMatch(/onayAcik\s*&&\s*<OnayPenceresi/);
  });

  it('KRİTİK: yayın sözleşmedeki içerik özetiyle gidiyor; prova öncesi bekleyenler yazılıyor', () => {
    const e = yorumsuz('rehber-ekrani.tsx');
    expect(e).toContain('icerikOzeti: kaydedici.durum().kayit.icerikOzeti');
    const prova = e.slice(e.indexOf('async function provaEt'), e.indexOf('async function yayinla'));
    expect(prova.length).toBeGreaterThan(50);
    expect(prova.indexOf('kaydedici.simdi()')).toBeLessThan(prova.indexOf('/prova'));
  });

  it('KRİTİK: boşaltılan kutu alanı SİLİYOR (`sil`), null değer yazmıyor; "Instagram olmadan" null DEĞER', () => {
    const r = yorumsuz('adim-reklam.tsx');
    const bt = yorumsuz('adim-butce.tsx');
    const n = yorumsuz('adim-amac-nerede.tsx');
    for (const a of ['telefon', 'hedefAdres', 'youtubeVideo']) expect(r, a).toContain(`sil(b, '${a}')`);
    for (const a of ['butce', 'takvim']) expect(bt, a).toContain(`sil(b, '${a}')`);
    for (const f of [r, bt, n]) expect(f).not.toMatch(/yaz\(b, '(telefon|hedefAdres|youtubeVideo|butce|takvim)', null\)/);
    expect(n).toContain("degisti={(v) => yaz(b, 'instagramId', v)}");
    expect(n).toContain("v === null ? sil(b, 'metaHesabiId')");
  });

  it('KRİTİK: Dalga 3 kararları bileşende ÇAĞRILIYOR (saf fonksiyonun testi tek başına yetmez)', () => {
    const e = yorumsuz('rehber-ekrani.tsx');
    expect(e).toContain('adimBittiMi(kayit.eksikler, x.no, ekran, amac !== null)');
    expect(e).toContain('adimAltMetni(x.no, x.alt, amac, acik)');
    expect(e).toContain('hazirAdimlar(kayit.eksikler, amacSecili)');
    expect(e).not.toMatch(/\{x\.alt\}/);
    const n = yorumsuz('adim-amac-nerede.tsx');
    expect(n).toContain('b.degistir(amacDegisimi(kod, b.a.platformlar, b.h))');
    expect(n).toContain("yaz(b, 'platformlar', platformAnahtari(b.acik, p))");
    const r = yorumsuz('adim-reklam.tsx');
    expect(r).toContain('{metinKurali(b.acik, kurgu).soru}');
    expect(r).toContain('{kural.gucGoster && (');
    expect(r).toContain('{kural.baslikNotu}');
    expect(r).not.toContain('Google hepsini dener');
    const k = yorumsuz('adim-kontrol.tsx');
    expect(k).toContain('kurulumAdimlari(p, ');
    expect(k).toContain('sonEkranOzeti(');
    expect(k).toContain('<h2>{ozet.baslik}</h2>');
    expect(yorumsuz('rehber-girisi.tsx')).toContain('{listeDurumu(r)}');
  });

  it('KRİTİK: metin önerisi kendiliğinden yazılmıyor; "Kullan" kullanici kaynağıyla yazıyor', () => {
    const r = yorumsuz('adim-reklam.tsx');
    const oner = r.slice(r.indexOf('async function oner()'), r.indexOf('function kullan('));
    expect(oner).toContain('setOneri(metinOnerisiHali(r))');
    expect(oner).not.toContain("yaz(b, 'metin'");
    expect(r).toMatch(/function metinYaz\(yeni: Metin\) \{\s*yaz\(b, 'metin', yeni\);/);
  });
});

describe('kaynak: sayfa', () => {
  const sayfa = readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', 'page.tsx'), 'utf8');
  it('rehber kimliği adreste, workspace eşleşmesi kontrol ediliyor', () => {
    expect(sayfa).toContain('first(params.rehber)');
    expect(sayfa).toContain('r.value.clientId !== clientId');
    expect(sayfa).toContain('/reklam/rehber/hazirlik?clientId=');
  });
  it('eski adresler /reklam’a yönleniyor', () => {
    for (const d of ['yeni', 'onizleme']) {
      const k = readFileSync(join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam', d, 'page.tsx'), 'utf8');
      expect(k).toContain("redirect(baglanti('/reklam', { musteri }))");
    }
  });
});

describe('provaYoklanmaliMi — kuyruktaki prova yoklanır', () => {
  const ozet = 'a'.repeat(64);
  it('bir platform bekliyorsa ve içerik aynıysa yoklanır; bayat ya da bitmişse yoklanmaz', () => {
    const bekliyor = { icerikOzeti: ozet, meta: { tur: 'bekliyor' as const, zaman: '2026-10-10T10:00:00Z' }, google: null };
    expect(provaYoklanmaliMi(bekliyor, ozet)).toBe(true);
    expect(provaYoklanmaliMi(bekliyor, 'b'.repeat(64))).toBe(false);
    expect(provaYoklanmaliMi({ ...bekliyor, meta: { tur: 'gecti' as const, zaman: 'x', not: null } }, ozet)).toBe(false);
    expect(provaYoklanmaliMi(null, ozet)).toBe(false);
  });
});

describe('geri al (Vazgeç ve arşivle) — canlı tur, 2026-10-10', () => {
  const y = 'aaaaaaaa-0000-4000-8000-000000000001';
  it('duraklatılmış ve durmuş META kurulumunda görünür; yayındayken ve sürerken görünmez', () => {
    expect(geriAlinabilirMi({ platform: 'meta', durum: 'kapali_kuruldu', yayinId: y })).toBe(true);
    expect(geriAlinabilirMi({ platform: 'meta', durum: 'fark_var', yayinId: y })).toBe(true);
    expect(geriAlinabilirMi({ platform: 'meta', durum: 'yayinda', yayinId: y })).toBe(false);
    expect(geriAlinabilirMi({ platform: 'meta', durum: 'kuruluyor', yayinId: y })).toBe(false);
    expect(geriAlinabilirMi({ platform: 'meta', durum: 'arsivlendi', yayinId: y })).toBe(false);
  });
  it('KRİTİK: Google kurulumunda GÖRÜNMEZ (sunucu reddediyor; Google Ads’ten kaldırılır)', () => {
    expect(geriAlinabilirMi({ platform: 'google', durum: 'kapali_kuruldu', yayinId: y })).toBe(false);
  });
  it('arşivlenen reklam "Kurulamadı" değil "Arşivlendi"', () => {
    expect(yayinSonucu({ durum: 'arsivlendi' })).toBe('arsivlendi');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Banner seti: taşıma, silme, yuvaya ekleme
// ─────────────────────────────────────────────────────────────────────────────
describe('banner seti (panel)', () => {
  // UUID şeması panelde denetlenmiyor; okunur kimlikler yeterli.
  const O = new Map<string, GorselOrani | null>([
    ['d1', 'dikey'], ['a1', 'dik45'], ['k1', 'kare'], ['y1', 'yatay'],
    ['a2', 'dik45'], ['k2', 'kare'], ['x', null],
  ]);
  const m = (...idler: string[]) => idler.map((varlikId) => ({ varlikId }));
  const setIdleri = (medya: readonly MedyaOgesi[]) =>
    setGorunumu(medya, O).setler.map((st) => Object.values(st).map((x) => x!.varlikId).sort());

  it('aynı boyutun ikinci görseli yeni set açar; ayrım sunucununkiyle aynı', () => {
    expect(setIdleri(m('d1', 'a1', 'k1', 'y1', 'a2'))).toEqual([['a1', 'd1', 'k1', 'y1'], ['a2']]);
  });

  it('kullanılamaz ve bilinmeyen boyut AYRI döner', () => {
    const g = setGorunumu(m('k1', 'x', 'bilinmiyor'), O);
    expect(g.kullanilamaz.map((x) => x.varlikId)).toEqual(['x']);
    expect(g.bilinmeyen.map((x) => x.varlikId)).toEqual(['bilinmiyor']);
  });

  it('taşıma: hedefte aynı boyut varsa yer değiştirir, hiçbir görsel kaybolmaz', () => {
    const t = setTasi(m('d1', 'a1', 'k1', 'y1', 'a2', 'k2'), O, 'a2', 0);
    expect(setIdleri(t)).toEqual([['a2', 'd1', 'k1', 'y1'], ['a1', 'k2']]);
    expect(t).toHaveLength(6);
  });

  it('taşıma SABİTLEYEREK yapılır: numarasız komşu yerinden oynamaz', () => {
    // a2 tek başına 2. sette; k1'i oraya taşımak 1. setin kalanını bozmamalı.
    const t = setTasi(m('d1', 'a1', 'k1', 'a2'), O, 'k1', 1);
    expect(setIdleri(t)).toEqual([['a1', 'd1'], ['a2', 'k1']]);
  });

  it('yeni sete taşıma; boşalan set kaybolur ve numaralar sıkışır', () => {
    const t = setTasi(m('d1', 'a2', 'k2'), O, 'd1', 'yeni');
    expect(setIdleri(t)).toEqual([['a2', 'k2'], ['d1']]);
    const geri = setTasi(t, O, 'd1', 0);
    expect(setIdleri(geri)).toEqual([['a2', 'd1', 'k2']]);
    expect(geri.every((x) => x.setNo === 1)).toBe(true);
  });

  it('sınırda yeni set açılmaz, aynı sete taşıma değişiklik üretmez', () => {
    const bes = m('k1', 'k2', 'a1', 'a2').map((x, i) => ({ ...x, setNo: i + 1 }));
    const tam = [...bes, { varlikId: 'y1', setNo: 5 }];
    expect(setTasi(tam, O, 'k1', 'yeni')).toBe(tam);
    expect(setTasi(tam, O, 'k1', 0)).toBe(tam);
  });

  it('set silme yalnız o setin görsellerini çıkarır', () => {
    // k2 sırayla 1. sete düşer (kare orada boş): 1. set d1 + a1 + k2, 2. set a2.
    const t = setSil(m('d1', 'a1', 'a2', 'k2', 'y1'), O, 1);
    expect(setIdleri(t)).toEqual([['a1', 'd1', 'k2', 'y1']]);
    expect(setIdleri(setSil(m('d1', 'a1', 'a2', 'k2'), O, 0))).toEqual([['a2']]);
  });

  it('yuvaya ekleme: boyut sette boşsa o sete, doluysa yeni sete', () => {
    const once = m('d1', 'a1', 'a2');
    const bos = yuvayaEkle(once, O, { varlikId: 'k2' }, 1);
    expect(setIdleri(bos)).toEqual([['a1', 'd1'], ['a2', 'k2']]);
    const dolu = yuvayaEkle(once, O, { varlikId: 'a2x' }, 0);
    // a2x'in oranı bilinmiyor: numarasız eklenir, sessizce bir sete itilmez.
    expect(dolu.find((x) => x.varlikId === 'a2x')?.setNo).toBeUndefined();
    const O2 = new Map(O).set('a3', 'dik45');
    const carp = yuvayaEkle(once, O2, { varlikId: 'a3' }, 0);
    expect(carp.find((x) => x.varlikId === 'a3')?.setNo).toBeUndefined();
  });
});

describe('Google görsel rozeti sunucunun kuralıyla', () => {
  it('KRİTİK: 1200×640 Meta’da yatay ama Google’da DEĞİL (±%1); 9:16 Google’da yok', async () => {
    const { googleGorselRozeti } = await import('./rehber-mantik');
    expect(googleGorselRozeti('yatay', 1200, 628)).toBeNull();
    expect(googleGorselRozeti('yatay', 1200, 640)).toMatch(/tam/);
    expect(googleGorselRozeti('dikey', 1080, 1920)).toMatch(/9:16/);
    expect(googleGorselRozeti('kare', 1200, 1200)).toBeNull();
  });
});
