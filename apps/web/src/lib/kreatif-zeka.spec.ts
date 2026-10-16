import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  etiketKarsilastir,
  farkCumlesi,
  type EtiketFarkSatiri,
  type EtiketlemeOzeti,
  type KreatifSatiri,
  type KreatifZekaYaniti,
} from '@advetics/shared';
import {
  aralikEkseni,
  bosMetni,
  esikMetni,
  etiketCipleri,
  etiketDurumMetni,
  etiketlemeSeridi,
  farkGruplari,
  halkaCizgisi,
  kisaNeden,
  kovaMetni,
  kreatifKutuHali,
  kreatifZekaYolu,
  metrikMetni,
  puanYokCumlesi,
  rozetSayisi,
} from './kreatif-zeka';
import { SEKMELER, sekmeEtiketi, sekmeCoz } from './iyilestir';

/**
 * ═══ İYİLEŞTİR › KREATİFLER: SAF KARARLAR — ÇALIŞTIRILARAK ═══
 */

const SATIR: KreatifSatiri = {
  creativeId: 'c1',
  adId: 'a1',
  adAdi: 'Ekim · Mutfak',
  kampanyaAdi: 'Satış',
  platform: 'meta',
  kumeAnahtari: 'meta:satis',
  ilkGosterim: '2026-10-08',
  yeni: true,
  gosterim: 10000,
  tiklama: 200,
  donusum: 4,
  harcamaMicros: '640000000',
  paraBirimi: 'TRY',
  anaMetrik: 'donusum_verimi',
  anaDeger: 0.01,
  puan: { puan: null, neden: 'harcama_az', benzer: 8 },
  kova: { kova: 'veri_yetersiz', neden: 'harcama_az', yorgunlukOnerisi: false },
  etiketDurumu: 'etiketlendi',
  etiketNedeni: null,
  etiketler: {
    insan: 'var',
    urun_gorunur: 'yok',
    metin_yogunlugu: 'az',
    baskin_renk: 'sicak',
    eylem_cagrisi_gorselde: 'yok',
    fiyat_veya_indirim: 'yok',
    logo_gorunur: 'var',
    gorsel_turu: 'fotograf',
    bicim: 'gorsel',
    en_boy: 'dikey',
  },
  kismiEtiket: null,
};

describe('sekme', () => {
  it('Kreatifler sekmesi Öneriler, Sinyaller ve Etkisi’nden sonra ve adresle çözülüyor', () => {
    expect(SEKMELER.indexOf('kreatifler')).toBe(SEKMELER.indexOf('etki') + 1);
    expect(sekmeEtiketi('kreatifler')).toBe('Kreatifler');
    expect(sekmeCoz('kreatifler')).toBe('kreatifler');
  });

  it('KRİTİK: çağrı düştüyse rozet YOK (null), "0" değil', () => {
    expect(rozetSayisi({ durum: 'hata', mesaj: 'x' })).toBeNull();
    expect(rozetSayisi({ durum: 'tamam', yanit: { kovaSayilari: { iyi_gidiyor: 1, dikkat: 2, veri_yetersiz: 0 } } as KreatifZekaYaniti })).toBe(2);
  });
});

describe('adres', () => {
  it('süzgeçler tek üreticiden; varsayılanlar adreste taşınmıyor', () => {
    expect(kreatifZekaYolu({ clientId: 'w', kume: null, gorunum: 'yeni', kova: null, sayfa: 1 })).toBe('/kreatif-zeka?clientId=w&gorunum=yeni');
    expect(kreatifZekaYolu({ clientId: 'w', kume: 'meta:satis', gorunum: 'tumu', kova: 'dikkat', sayfa: 3 })).toBe(
      '/kreatif-zeka?clientId=w&kume=meta%3Asatis&gorunum=tumu&kova=dikkat&sayfa=3',
    );
  });
});

describe('dört hâl', () => {
  it('KRİTİK: yükleniyor, hata, boş ve dolu AYRI', () => {
    expect(kreatifKutuHali(null)).toBe('yukleniyor');
    expect(kreatifKutuHali({ durum: 'hata', mesaj: 'x' })).toBe('hata');
    expect(kreatifKutuHali({ durum: 'tamam', yanit: { satirlar: [] } as unknown as KreatifZekaYaniti })).toBe('bos');
    expect(kreatifKutuHali({ durum: 'tamam', yanit: { satirlar: [SATIR] } as unknown as KreatifZekaYaniti })).toBe('dolu');
  });

  it('boş liste nedeniyle; yalnız metin ve hesap yok ayrı cümle', () => {
    expect(bosMetni('yalniz_metin').metin).toContain('metin reklamı');
    expect(bosMetni('hesap_yok').baglanti).toBe('baglantilar');
    expect(bosMetni('suzgec_bos').suzgec).toBe(true);
    expect(bosMetni(null).baslik).toBe('Liste boş');
  });
});

describe('kart', () => {
  it('kova cümlesi şablondan, tutar ve eşik ekranda yazılı', () => {
    const k = kovaMetni(SATIR)!;
    expect(k).toMatchObject({ kova: 'veri_yetersiz', ad: 'Veri yetersiz', oneriye: false });
    expect(k.cumle).toBe('640 ₺ harcadı, karar için 1.000 ₺ gerekiyor');
  });

  it('KRİTİK: yorgunluk önerisi varsa cümle ÖNERİYE bağlanıyor (aynı olay iki dilde anlatılmıyor)', () => {
    const k = kovaMetni({ ...SATIR, kova: { kova: 'dikkat', neden: 'ortancanin_alti', yorgunlukOnerisi: true } })!;
    expect(k.oneriye).toBe(true);
    expect(k.cumle).toContain('önerisi var');
  });

  it('eşik başka para biriminde TL karşılığı olarak yazılıyor', () => {
    expect(esikMetni('TRY')).toBe('1.000 ₺');
    expect(esikMetni('USD')).toBe('1.000 ₺ karşılığı');
  });

  it('KRİTİK: verim ölçeği tersine çevrilip gösteriliyor (0,01 dönüşüm / ₺ = 100 ₺ dönüşüm başı)', () => {
    expect(metrikMetni('donusum_verimi', 0.01, 'TRY')).toBe('100 ₺');
    expect(metrikMetni('tiklama_orani', 0.025, 'TRY')).toBe('%2,5');
    expect(metrikMetni('donusum_verimi', 0, 'TRY')).toBe('-');
  });

  it('etiket çiplerinde iki değerli alanın "yok"u gösterilmiyor; en-boy ve biçim gösteriliyor', () => {
    expect(etiketCipleri(SATIR.etiketler)).toEqual(['İnsan var', 'Az yazı', 'Sıcak renkler', 'Logo var', 'Fotoğraf', 'Tek görsel', 'Dikey']);
    expect(etiketCipleri(null)).toEqual([]);
  });

  it('etiketsiz kartın nedeni yazılıyor (boş alan yok)', () => {
    expect(etiketDurumMetni({ ...SATIR, etiketDurumu: 'etiketlenemez', etiketNedeni: 'metin_reklami', etiketler: null })).toBe('Metin reklamı, görseli yok');
    expect(etiketDurumMetni({ ...SATIR, etiketDurumu: 'bekliyor', etiketNedeni: 'gemini_kota', etiketler: null })).toBe('İnceleme bekliyor: yapay zekâ kotası dolu');
    expect(etiketDurumMetni(SATIR)).toBeNull();
  });

  it('puan yoksa nedeni; halka ölçüleri sınırlı', () => {
    expect(puanYokCumlesi({ puan: null, neden: 'benzer_az', benzer: 3 }, 'TRY')).toBe('Karşılaştırılacak 3 benzer var, en az 5 gerekiyor');
    expect(puanYokCumlesi({ puan: 70, benzer: 9, altinda: 6, esit: 0 }, 'TRY')).toBeNull();
    expect(halkaCizgisi(150).dolu).toBeCloseTo(halkaCizgisi(100).cevre);
    expect(halkaCizgisi(null).dolu).toBe(0);
  });
});

describe('etiketleme şeridi', () => {
  const O: EtiketlemeOzeti = {
    toplam: 312,
    sayilar: { bekliyor: 14, etiketlendi: 288, etiketlenemez: 10 },
    etiketlenemez: { metin_reklami: 6, gorsel_yok: 3, bicim: 1 },
    bekleyenNedenleri: {},
    bugunKullanilan: 40,
    gunlukSinir: 40,
    buAyKullanilan: 120,
    aylikSinir: 400,
    bekci: 'workspace_gunluk',
    sonIs: null,
    hesapIsleri: [],
  };

  it('KRİTİK: bekleyen ve incelenemeyen AYRI sayılıyor, nedenleriyle; bekçi cümlesi sınırı söylüyor', () => {
    const d = etiketlemeSeridi(O);
    expect(d.incelendi).toBe('288 / 312 kreatif incelendi');
    expect(d.sirada).toBe('14 sırada · bugünkü sınır doldu, yarın devam (40 / 40)');
    expect(d.incelenemiyor).toBe('10 incelenemiyor');
    expect(d.dokum.map((x) => x.sayi)).toEqual([6, 3, 1]);
  });

  it('KRİTİK (Ö-3): aylık sınırda AYLIK sayı yazılıyor, ürün geneli sınırda workspace sayısı yazılmıyor', () => {
    expect(etiketlemeSeridi({ ...O, bekci: 'workspace_aylik' }).sirada).toBe('14 sırada · bu ayın sınırı doldu, gelecek ay devam (120 / 400)');
    expect(etiketlemeSeridi({ ...O, bekci: 'kuresel_gunluk' }).sirada).toBe('14 sırada · günlük toplam sınır doldu, yarın devam');
  });

  it('KRİTİK (N): hesap başına son iş; başarısız ve hiç koşmamış hesap SORUNLU görünüyor', () => {
    const d = etiketlemeSeridi({
      ...O,
      hesapIsleri: [
        { adAccountId: 'a', hesapAdi: 'Ana', durum: 'succeeded', zaman: '2026-10-12T08:00:00Z', not: 'seçilen 1: 1 etiketlendi' },
        { adAccountId: 'b', hesapAdi: 'İkinci', durum: 'failed', zaman: '2026-10-12T07:00:00Z', not: 'Gemini 500' },
        { adAccountId: 'c', hesapAdi: 'Yeni', durum: null, zaman: null, not: null },
      ],
    });
    expect(d.hesaplar).toEqual([
      { ad: 'Ana', cumle: 'tamam: seçilen 1: 1 etiketlendi', sorunlu: false },
      { ad: 'İkinci', cumle: 'başarısız: Gemini 500', sorunlu: true },
      { ad: 'Yeni', cumle: 'hiç incelenmedi', sorunlu: true },
    ]);
  });

  it('küçük görselin hata nedeni kısa (boş kutu değil)', () => {
    expect(kisaNeden('Görsel alınamadı: sunucu 403')).toBe('sunucu 403');
    expect(kisaNeden('Görsel alınamadı: platform bu reklam için görsel adresi vermiyor').length).toBeLessThanOrEqual(18);
  });

  it('bekçi yoksa geçici nedenler sayısıyla', () => {
    const d = etiketlemeSeridi({ ...O, bekci: null, bekleyenNedenleri: { gemini_kota: 4 } });
    expect(d.sirada).toBe('14 sırada · 4 tanesinde yapay zekâ kotası dolu');
  });
});

describe('ne işe yarıyor', () => {
  const grup = (taban: number, n = 6) => Array.from({ length: n }, (_, i) => ({ deger: taban + i * 0.001, harcamaMicros: 2_000_000_000n }));
  const fark = (alan: 'insan' | 'logo_gorunur', a: number, b: number): EtiketFarkSatiri => {
    const f = etiketKarsilastir(grup(a), grup(b));
    return { alan, deger: 'var', karsi: 'yok', metrik: 'tiklama_orani', fark: f, cumle: farkCumlesi(alan, 'var', 'tiklama_orani', f) };
  };

  it('KRİTİK: en çok 5 anlamlı fark gösteriliyor, fazlası ve belirsizler katlanmış listede (sessiz kesme yok)', () => {
    const anlamlilar = Array.from({ length: 7 }, () => fark('insan', 0.03, 0.01));
    const belirsiz = fark('logo_gorunur', 0.02, 0.02);
    const g = farkGruplari([...anlamlilar, belirsiz]);
    expect(g.anlamli).toHaveLength(5);
    expect(g.diger).toHaveLength(3);
  });

  it('aralık çubuğu sıfırı ve bandı AYNI eksende konumluyor', () => {
    const f = fark('insan', 0.03, 0.01);
    const c = aralikEkseni([f])(f)!;
    expect(c.sifir).toBe(0);
    expect(c.sol).toBeGreaterThan(c.sifir);
    expect(c.orta).toBeGreaterThan(c.sol);
    expect(c.sol + c.genislik).toBeLessThanOrEqual(100.1);
  });
});

describe('bileşen kaynak taraması', () => {
  const src = readFileSync(join(__dirname, '../components/iyilestir/kreatifler-sekmesi.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('KRİTİK: hata yutan .catch(() => setX([])) yok; dört hâl `kreatifKutuHali`nden', () => {
    expect(src).not.toMatch(/\.catch\(\(\)\s*=>/);
    expect(src).toContain('kreatifKutuHali(sonuc)');
  });

  it('görsel adresi KULLANIM ANINDA, çerezle ve uçtan; hata sunucunun cümlesiyle', () => {
    expect(src).toContain("fetch(`${API_URL}${gorselYolu(creativeId)}`, { credentials: 'include' })");
    expect(src).toContain('URL.revokeObjectURL(adres)');
  });

  it('brief AdvCampaign’e oturum açıp yönleniyor; kopya metni shared şablondan', () => {
    expect(src).toContain('router.push(advcampaignAdresi(r.clientId, r.oturumId))');
    expect(src).toContain('briefKopyaMetni(b)');
  });
});
