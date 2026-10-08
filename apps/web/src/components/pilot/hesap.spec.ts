import { describe, expect, it } from 'vitest';
import {
  BOS_NEDENLERI,
  KAYNAK_TURLERI,
  KURULUM_SATIR_DURUMLARI,
  MUSTERI_ADINA_GEREKCE_EN_AZ,
  UYUM_KATALOGU,
  UYUM_SEKTORLERI,
  degisiklikUygula,
  musteriOzeti,
  planUret,
  reklamMetinleriniYerlestir,
  type OneriKarti,
  type PlanOnerisi,
  type PlanUretGirdisi,
} from '@advetics/shared';
import {
  BOS_NEDENI_METNI,
  KAYNAK_ETIKETI,
  KURULUM_DURUM_METNI,
  adimHalleri,
  ajansKipNotu,
  altCubuk,
  bosNedeniBaglantisi,
  bugunKutulari,
  degistirCumlesi,
  donemSecenekleri,
  eskiEkranMi,
  eskiPlanNotu,
  yazmaHatasi,
  GERCEK_YAYIN_KAPALI_NOTU,
  gercekYayinGorunumu,
  gercekYayinIstegi,
  ucIzni,
  BEYAN_KURALLARI,
  SEKTOR_ETIKETI,
  beyanBaslangici,
  beyanGerekiyorMu,
  beyanIstegi,
  gerekceEksigi,
  kaynakEtiketi,
  kaynakHedefi,
  kelimeGruplari,
  ONERI_UYGULAMA_ACIK,
  oneriDugmeleri,
  oneriSirala,
  onayIstegi,
  onayRetMesajlari,
  para,
  payMetni,
  pilotUcAdresi,
  planAdresi,
  planSec,
  satirCikarIstegi,
  seritDilimleri,
} from './hesap';
import type { PilotPlanDetayi, PilotPlanSatiriOzeti, PilotWorkspaceBeyani } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import { MM_BOLUMLERI } from '@/components/marka-merkezi/bolumler';

/**
 * ═══ PİLOT EKRANLARI — SAF KARARLAR ÇALIŞTIRILARAK ═══
 *
 * Plan örneği elle yazılmıyor: sözleşmenin `planUret`i üretiyor. Elle
 * yazılmış bir örnek, sözleşmenin biçimi değiştiğinde eski biçimi taşır ve
 * ekran testleri gerçek planla değil hayaliyle yeşil kalırdı.
 *
 * "KRİTİK" işaretliler mutasyonla doğrulandı: ilgili satır bozuldu, test
 * düştü, geri alındı (rapor: Ajan 3 devir notu).
 */

const T = '2026-10-07T06:00:00.000Z';
const M = 1_000_000n;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function girdi(over: Partial<PlanUretGirdisi> = {}): PlanUretGirdisi {
  return {
    clientId: U(1),
    donem: '2026-11',
    bugun: '2026-10-07',
    simdi: T,
    aylikButce: { id: U(2), micros: 120_000n * M, paraBirimi: 'TRY', guncellendi: T },
    ayHarcanan: { deger: 0n, kaynak: { tur: 'gecmis_veri', kimlik: 'insights_daily', zaman: T } },
    hesaplar: [
      { id: U(3), platform: 'meta', paraBirimi: 'TRY' },
      { id: U(4), platform: 'google', paraBirimi: 'TRY' },
    ],
    gecmis: {
      pencere: { from: '2026-07-09', to: '2026-10-06' },
      okundu: T,
      platformlar: [
        { platform: 'meta', harcamaMicros: 50_000n * M, sonuc: 620 },
        { platform: 'google', harcamaMicros: 38_000n * M, sonuc: 380 },
      ],
    },
    marka: { profilId: U(5), guncellendi: T, anaAmac: 'form' },
    kitleler: [
      { id: U(10), ad: 'Varsayılan', katman: 'soguk', varsayilan: true, guncellendi: T },
      { id: U(11), ad: 'Etkileşim 180 gün', katman: 'sicak', varsayilan: false, guncellendi: T },
      { id: U(12), ad: 'Site ziyaretçisi', katman: 'yeniden_pazarlama', varsayilan: false, guncellendi: T },
    ],
    varliklar: [
      { id: U(20), ad: 'ucuz', tur: 'gorsel', yuklendi: '2026-08-01T00:00:00Z', performans: { harcamaMicros: 3_000n * M, sonuc: 60, pencere: { from: '2026-07-09', to: '2026-10-06' }, okundu: T } },
    ],
    kelimeler: [
      { id: U(30), kelime: 'kahve makinesi', grup: 'Kahve makinesi', aylikArama: 90_500, cekim: T },
      { id: U(31), kelime: 'filtre kahve makinesi', grup: 'Kahve makinesi', aylikArama: 9_900, cekim: T },
      { id: U(32), kelime: 'türk kahve makinesi', grup: 'Kahve makinesi', aylikArama: 74_000, cekim: T },
      { id: U(33), kelime: 'kahve çekirdeği', grup: 'Kahve çekirdeği', aylikArama: 49_500, cekim: T },
    ],
    ...over,
  };
}

/*
 * Metni yazılmış plan (karar (a), 2026-10-08): `planUret` Meta satırlarını
 * "metin bekliyor" engeliyle üretir; ekran fixture'ı sunucunun gönderdiği
 * hâli (metin yazılmış) taklit etmeli, yoksa her Meta satırı kurulamaz görünür.
 */
const HAM_PLAN = planUret(girdi());
const PLAN = reklamMetinleriniYerlestir(
  HAM_PLAN,
  new Map(
    HAM_PLAN.satirlar
      .filter((s) => s.platform === 'meta')
      .map((s) => [
        s.anahtar,
        {
          tur: 'tamam' as const,
          metinler: [{ varlikId: s.varliklar?.dolu ? s.varliklar.deger[0]!.deger.id : null, baslik: 'Taze kahve', metin: 'Kahve makinesinde yeni sezon.' }],
          kaynak: { tur: 'yz_metin' as const, kimlik: 'test-modeli', zaman: '2026-10-07T06:00:00.000Z' },
          notlar: [],
        },
      ]),
  ),
  { yasalUyari: null },
);

function detay(over: Partial<PilotPlanDetayi> & { durum?: PilotPlanDetayi['plan']['durum'] } = {}): PilotPlanDetayi {
  const { durum, ...kalan } = over;
  return {
    plan: { id: U(90), clientId: U(1), donem: '2026-11', durum: durum ?? 'taslak', surum: 3, icerikOzeti: 'a'.repeat(64), yayinKipi: null, onay: null, musteriNotu: null, guncellendi: T },
    icerik: PLAN,
    musteriOzeti: musteriOzeti(PLAN),
    rol: 'ajans',
    yapilabilir: [],
    onayKapisi: null,
    uyum: null,
    ...kalan,
  };
}

describe('örnek plan gerçekten üretildi', () => {
  it('planUret satır ve toplam üretti (aksi hâlde aşağıdakiler boşa geçer)', () => {
    expect(PLAN.engeller).toEqual([]);
    expect(PLAN.toplam.dolu).toBe(true);
    expect(PLAN.satirlar.length).toBeGreaterThanOrEqual(3);
    expect(PLAN.satirlar.some((s) => s.platform === 'google')).toBe(true);
  });
});

describe('bütçe şeridi', () => {
  it('KRİTİK: dilimlerin toplamı plan toplamına EŞİT', () => {
    const d = seritDilimleri(PLAN);
    expect(d.length).toBeGreaterThan(0);
    const toplam = d.reduce((a, x) => a + x.micros, 0n);
    expect(PLAN.toplam.dolu && toplam).toBe(PLAN.toplam.dolu ? BigInt(PLAN.toplam.deger) : null);
  });

  it('KRİTİK: çıkarılan satırın tutarı "Dağıtılmamış" dilimi olarak şeritte kalıyor', () => {
    const meta = PLAN.satirlar.find((s) => s.platform === 'meta')!;
    const s = degisiklikUygula(PLAN, [{ tur: 'satir_cikar', anahtar: meta.anahtar }], { tur: 'kullanici', kimlik: U(99), zaman: T });
    expect(s.tur).toBe('tamam');
    const yeni = (s as { plan: PlanOnerisi }).plan;
    const d = seritDilimleri(yeni);
    const dag = d.find((x) => x.platform === 'dagitilmamis');
    expect(dag?.micros).toBe(BigInt(meta.tutar.deger));
    expect(d.reduce((a, x) => a + x.micros, 0n)).toBe(yeni.toplam.dolu ? BigInt(yeni.toplam.deger) : -1n);
  });

  it('Meta önce, katman sırası soğuk → sıcak → yeniden; aynı platformda ton artıyor', () => {
    const d = seritDilimleri(PLAN).filter((x) => x.platform !== 'dagitilmamis');
    const ilkGoogle = d.findIndex((x) => x.platform === 'google');
    expect(d.slice(0, ilkGoogle).every((x) => x.platform === 'meta')).toBe(true);
    expect(d.filter((x) => x.platform === 'meta').map((x) => x.ton)).toEqual([0, 1, 2]);
    expect(d[0]!.etiket).toBe('Meta · yeni kitle');
  });

  it('toplam boşsa şerit çizilmez (sıfır genişlikte dilim yok)', () => {
    expect(seritDilimleri(planUret(girdi({ aylikButce: null })))).toEqual([]);
  });

  it('KRİTİK: kuruşu sıfır tutar ",00" taşımıyor, kuruşlu tutar olduğu gibi', () => {
    expect(para(String(36_000n * M), 'TRY')).toBe('36.000 TL');
    expect(para(String(120_577_600_000n), 'TRY')).toBe('120.577,60 TL');
  });

  it('pay metni: %1 altı sıfır yazılmaz', () => {
    expect(payMetni(6200)).toBe('%62');
    expect(payMetni(40)).toBe('%1’den az');
    expect(payMetni(0)).toBe('%0');
  });
});

describe('kaynak çipi ve boş hücre', () => {
  it('her kaynak türünün ve her boş nedenin cümlesi var (tablolar sözleşmeyle aynı boyda)', () => {
    expect(Object.keys(KAYNAK_ETIKETI).sort()).toEqual([...KAYNAK_TURLERI].sort());
    expect(Object.keys(BOS_NEDENI_METNI).sort()).toEqual([...BOS_NEDENLERI].sort());
    for (const n of BOS_NEDENLERI) {
      expect(BOS_NEDENI_METNI[n].ne.length, n).toBeGreaterThan(5);
      expect(BOS_NEDENI_METNI[n].neYapmali.length, n).toBeGreaterThan(5);
    }
  });

  it('pencereli kaynak gün sayısını yazar', () => {
    expect(kaynakEtiketi({ tur: 'gecmis_veri', kimlik: 'insights_daily', zaman: T, pencere: { from: '2026-07-09', to: '2026-10-06' } })).toBe('Geçmiş veri · 90 gün');
    expect(kaynakEtiketi({ tur: 'aylik_butce', kimlik: U(2), zaman: T })).toBe('Aylık Bütçe');
  });

  it('KRİTİK: kaynağa giden bağlantı workspace’i taşıyor; ekranı olmayan kaynak bağlanmıyor', () => {
    expect(kaynakHedefi({ tur: 'aylik_butce', kimlik: U(2), zaman: T }, U(1))).toBe(`/marka-merkezi?musteri=${U(1)}&bolum=butce`);
    expect(kaynakHedefi({ tur: 'sabit_kural', kimlik: 'META_KATMAN_PAYI_YUZ', zaman: T }, U(1))).toBeNull();
    expect(kaynakHedefi({ tur: 'yz_metin', kimlik: 'gemini', zaman: T }, U(1))).toBeNull();
  });

  it('boş neden kendi bölümüne gönderiyor; "yeniden hazırla" bir bağlantı değil', () => {
    expect(bosNedeniBaglantisi('kitle_yok', U(1))).toContain('bolum=kitleler');
    expect(bosNedeniBaglantisi('harcanan_bilinmiyor', U(1))).toBeNull();
  });
});

describe('alt çubuk: tek birincil eylem, sunucunun listesinden', () => {
  it('KRİTİK: ajans taslakta "Müşteriye gönder" birincil ve açılış gününü söylüyor', () => {
    const a = altCubuk(detay({ yapilabilir: ['musteriye_gonder', 'iptal', 'degistir'] }));
    expect(a.birincil?.etiket).toBe('Müşteriye gönder');
    expect(a.metin).toContain('1 Kasım');
    expect(a.ikincil.map((x) => x.eylem)).toEqual(['iptal']);
  });

  it('KRİTİK: yapilabilir boşsa düğme yok (panel kendi listesini kurmuyor)', () => {
    const a = altCubuk(detay({ yapilabilir: [] }));
    expect(a.birincil).toBeNull();
    expect(a.ikincil).toEqual([]);
  });

  it('KRİTİK: ajans "müşteri adına onayla"yı birincil göremez', () => {
    const a = altCubuk(detay({ durum: 'musteride', yapilabilir: ['onayla', 'geri_cek'] }));
    expect(a.birincil).toBeNull();
    expect(a.ikincil.map((x) => x.etiket)).toEqual(['Geri çek', 'Müşteri adına onayla']);
  });

  it('müşteri onayı birincil ve en çok tutarı söylüyor', () => {
    const a = altCubuk(detay({ durum: 'musteride', rol: 'musteri', yapilabilir: ['onayla', 'degisiklik_iste'] }));
    expect(a.birincil?.etiket).toBe('Onayla');
    // Google günlük esnekliği yüzünden en çok tutar toplamdan BÜYÜK; ekranda o yazmalı.
    expect(a.metin).toContain('en çok 120.577,60 TL');
    expect(a.ikincil.map((x) => x.etiket)).toEqual(['Değişiklik iste']);
  });

  it('müşteri onaylayamıyorsa onay kapısının MÜŞTERİ mesajı yazılıyor', () => {
    const a = altCubuk(
      detay({
        durum: 'musteride',
        rol: 'musteri',
        yapilabilir: ['degisiklik_iste'],
        onayKapisi: { tur: 'ret', retler: [{ kod: 'UYUM_ENGEL', musteriMesaji: 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', ajansMesaji: 'Uyum denetçisinde ENGEL var.' }] },
      }),
    );
    expect(a.metin).toBe('Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.');
    expect(a.metin).not.toContain('ENGEL');
  });

  it('kısmen kurulmuşta "Şimdi kur" birincil', () => {
    expect(altCubuk(detay({ durum: 'kismen_kuruldu', yapilabilir: ['yeniden_dene', 'kapat'] })).birincil?.etiket).toBe('Şimdi kur');
  });

  it('kurulamayan satır sayısı yazılıyor', () => {
    const p = { ...PLAN, satirlar: PLAN.satirlar.map((s, i) => (i === 0 ? { ...s, engeller: ['sayfa_yok' as const] } : s)) };
    expect(altCubuk({ ...detay({ yapilabilir: [] }), icerik: p }).metin).toBe('1 kampanya kurulamıyor. Eksikleri tamamlayınca gönderebilirsin.');
  });
});

describe('onay', () => {
  it('KRİTİK: onay isteği ekrandaki sürümü ve özeti taşıyor', () => {
    expect(onayIstegi({ surum: 3, icerikOzeti: 'b'.repeat(64) })).toEqual({ surum: 3, icerikOzeti: 'b'.repeat(64) });
    expect(onayIstegi({ surum: 3, icerikOzeti: 'b'.repeat(64) }, '  Müşteri telefonda onayladı, mail gelecek  ')).toEqual({
      surum: 3,
      icerikOzeti: 'b'.repeat(64),
      musteriAdinaGerekce: 'Müşteri telefonda onayladı, mail gelecek',
    });
  });

  it('KRİTİK: gerekçe sınırı sözleşmeden, boşluk sayılmıyor', () => {
    expect(gerekceEksigi('')).toBe(MUSTERI_ADINA_GEREKCE_EN_AZ);
    expect(gerekceEksigi(' '.repeat(40))).toBe(MUSTERI_ADINA_GEREKCE_EN_AZ);
    expect(gerekceEksigi('x'.repeat(MUSTERI_ADINA_GEREKCE_EN_AZ))).toBe(0);
  });

  it('KRİTİK: ret mesajı role göre; müşteriye boş mesaj ve uyum ayrıntısı gitmiyor', () => {
    const s = {
      tur: 'ret' as const,
      retler: [
        { kod: 'GEREKCE' as const, musteriMesaji: '', ajansMesaji: 'Gerekçe zorunlu.' },
        { kod: 'UYUM_UYARI' as const, musteriMesaji: 'Kontrol ediliyor.', ajansMesaji: 'İşaretlenmemiş UYARI var.' },
        { kod: 'UYUM_BAYAT' as const, musteriMesaji: 'Kontrol ediliyor.', ajansMesaji: 'Denetim bayat.' },
      ],
    };
    expect(onayRetMesajlari(s, 'musteri')).toEqual(['Kontrol ediliyor.']);
    // GEREKÇE ajansa listede değil, onay kutusunun kendi alanında soruluyor.
    expect(onayRetMesajlari(s, 'ajans')).toEqual(['İşaretlenmemiş UYARI var.', 'Denetim bayat.']);
    expect(onayRetMesajlari({ tur: 'kabul', kip: 'gercek', ajansNotu: null }, 'ajans')).toEqual([]);
  });

  it('KRİTİK: test/kapalı kip yalnız ajansa yazılıyor', () => {
    const p = detay().plan;
    expect(ajansKipNotu({ rol: 'musteri', onayKapisi: null, plan: { ...p, yayinKipi: 'test' } })).toBeNull();
    expect(ajansKipNotu({ rol: 'ajans', onayKapisi: null, plan: { ...p, yayinKipi: 'test' } })).toContain('test kipinde');
    expect(ajansKipNotu({ rol: 'ajans', onayKapisi: null, plan: { ...p, yayinKipi: 'kapali' } })).toContain('platforma bir şey yazılmadı');
    expect(ajansKipNotu({ rol: 'ajans', onayKapisi: null, plan: { ...p, yayinKipi: 'gercek' } })).toBeNull();
  });
});

describe('yazma hatası (409 retleri)', () => {
  it('KRİTİK: retler olduğu gibi, başlıktan ayrı; tekrar eden ve başlıkla aynı cümle bir kez', () => {
    const e = new ApiRequestError('Plan müşteriye gönderilemez.', 409, 'CONFLICT', undefined, [
      { kod: 'UYUM_ENGEL', mesaj: 'Uyum denetçisinde ENGEL var.' },
      { kod: 'KURULAMAYAN_SATIR', mesaj: '2 satır kurulamıyor ya da plan boş.' },
      { kod: 'X', mesaj: 'Uyum denetçisinde ENGEL var.' },
      { kod: 'Y', mesaj: 'Plan müşteriye gönderilemez.' },
    ]);
    expect(yazmaHatasi(e)).toEqual({ mesaj: 'Plan müşteriye gönderilemez.', retler: ['Uyum denetçisinde ENGEL var.', '2 satır kurulamıyor ya da plan boş.'] });
  });

  it('retsiz hata ve ağ hatası ayrı cümle', () => {
    expect(yazmaHatasi(new ApiRequestError('Bulunamadı', 404, 'NOT_FOUND'))).toEqual({ mesaj: 'Bulunamadı', retler: [] });
    expect(yazmaHatasi(new TypeError('fetch failed'))).toEqual({ mesaj: 'Sunucuya ulaşılamadı.', retler: [] });
  });
});

describe('değiştir kutusu', () => {
  it('boş ve uzun cümle istek göndermiyor', () => {
    expect(degistirCumlesi(2, '   ').tur).toBe('hata');
    expect(degistirCumlesi(2, 'x'.repeat(501)).tur).toBe('hata');
    expect(degistirCumlesi(2, ' Google’a 5.000 TL daha ayır ')).toEqual({ tur: 'tamam', govde: { surum: 2, cumle: 'Google’a 5.000 TL daha ayır' } });
  });

  it('satır çıkarma gövdesi sözleşmenin şemasından geçiyor', () => {
    expect(satirCikarIstegi(4, 'meta:soguk:x')).toEqual({ surum: 4, degisiklikler: [{ tur: 'satir_cikar', anahtar: 'meta:soguk:x' }] });
    expect(() => satirCikarIstegi(0, 'x')).toThrow();
  });
});

describe('adım şeridi ve dönem', () => {
  it('durumdan adım', () => {
    expect(adimHalleri('taslak')).toEqual(['bitti', 'simdi', 'bekliyor', 'bekliyor']);
    expect(adimHalleri('musteride')).toEqual(['bitti', 'bitti', 'simdi', 'bekliyor']);
    expect(adimHalleri('kuruldu')).toEqual(['bitti', 'bitti', 'bitti', 'bitti']);
    expect(adimHalleri('iptal')).toBeNull();
  });

  it('ayın 20sinden sonra varsayılan gelecek ay; aralıkta yıl dönüyor', () => {
    expect(donemSecenekleri('2026-10-07').varsayilan).toBe('2026-10');
    expect(donemSecenekleri('2026-10-20').varsayilan).toBe('2026-11');
    expect(donemSecenekleri('2026-12-25')).toEqual({ buAy: '2026-12', gelecekAy: '2027-01', varsayilan: '2027-01' });
  });

  it('adresteki plan yoksa açık plan seçiliyor ve bu söyleniyor', () => {
    const p = (id: string, durum: PilotPlanSatiriOzeti['durum']): PilotPlanSatiriOzeti => ({ id, donem: '2026-11', durum, surum: 1, toplamMicros: null, paraBirimi: 'TRY', guncellendi: T });
    const liste = [p('a', 'kuruldu'), p('b', 'taslak')];
    expect(planSec(liste, undefined)).toEqual({ plan: liste[1], adrestekiYok: false });
    expect(planSec(liste, 'yok')).toEqual({ plan: liste[1], adrestekiYok: true });
    expect(planSec(liste, 'a').plan?.id).toBe('a');
    expect(planSec([], undefined).plan).toBeNull();
  });
});

describe('adresler', () => {
  it('KRİTİK: uç yolu sözleşmeden, kimlik kodlanıyor', () => {
    expect(pilotUcAdresi('/pilot/planlar/:id/onayla', 'a/b')).toBe('/pilot/planlar/a%2Fb/onayla');
    expect(() => pilotUcAdresi('/pilot/planlar/:id')).toThrow();
  });

  it('eski ekrana dönüş yolu: açık istek ya da eski sohbet oturumu', () => {
    expect(eskiEkranMi({ eski: '1' })).toBe(true);
    expect(eskiEkranMi({ oturum: 'x' })).toBe(true);
    expect(eskiEkranMi({})).toBe(false);
    expect(eskiEkranMi({ eski: '0' })).toBe(false);
    expect(planAdresi(U(1), { eski: true })).toBe(`/strateji?musteri=${U(1)}&eski=1`);
  });
});

describe('geçiş dönemi (S-4)', () => {
  it('KRİTİK: aynı ayın AÇIK eski planı söyleniyor; aktarılmış ya da iptal edilmiş söylenmiyor', () => {
    expect(eskiPlanNotu([{ donem: '2026-11', durum: 'onaylandi' }], '2026-11')).toContain('Kasım 2026');
    expect(eskiPlanNotu([{ donem: '2026-11', durum: 'aktarildi' }, { donem: '2026-11', durum: 'iptal' }], '2026-11')).toBeNull();
    expect(eskiPlanNotu([{ donem: '2026-10', durum: 'taslak' }], '2026-11')).toBeNull();
  });
});

describe('kelimeler', () => {
  it('Google satırlarının grupları; örnek iki kelime + kalan sayı', () => {
    const g = kelimeGruplari(PLAN);
    expect(g.length).toBeGreaterThan(0);
    const km = g.find((x) => x.grup === 'Kahve makinesi');
    expect(km?.ornekler.length).toBeLessThanOrEqual(2);
    expect((km?.ornekler.length ?? 0) + (km?.kalan ?? 0)).toBe(km?.sayi);
  });
});

describe('Pilot açılışı', () => {
  const kart = (id: string, micros: string | null, olusturuldu = T): OneriKarti => ({
    id,
    clientId: U(1),
    taramaId: U(2),
    tur: 'harcayip_donusmeyen',
    hedef: { platform: 'meta', seviye: 'reklam', nesneId: U(3), platformKimligi: '1', ad: 'R' },
    neden: 'n',
    olculer: [],
    beklenenEtki: micros === null ? { dolu: false, emptyReason: 'gecmis_yok' } : { dolu: true, deger: { tur: 'tasarruf', micros, adet: null }, kaynak: { tur: 'gecmis_veri', kimlik: 'x', zaman: T } },
    eylem: { tur: 'durdur' },
    geriAlma: { tur: 'yeniden_ac' },
    durum: 'yeni',
    gecerlilikSonu: '2026-10-08T18:00:00.000Z',
    platformMesaji: null,
    olusturuldu,
  });

  it('KRİTİK: en çok para etkileyen üstte, etkisi bilinmeyen altta', () => {
    const s = oneriSirala([kart('a', '1000'), kart('b', null), kart('c', '5000')]);
    expect(s.map((k) => k.id)).toEqual(['c', 'a', 'b']);
  });

  it('KRİTİK: Tur 1\'de kartlar yalnız okunur: hiçbir düğme yok', () => {
    expect(ONERI_UYGULAMA_ACIK).toBe(false);
    expect(oneriDugmeleri(kart('a', null), '2026-10-08T00:00:00.000Z')).toEqual([]);
    expect(oneriDugmeleri({ ...kart('a', null), durum: 'uygulandi' }, T)).toEqual([]);
  });

  it('KRİTİK: açılınca süresi geçmiş kartta "Uygula" yok', () => {
    expect(oneriDugmeleri(kart('a', null), '2026-10-08T00:00:00.000Z', true)).toEqual(['uygula', 'gec']);
    expect(oneriDugmeleri(kart('a', null), '2026-10-08T18:00:00.000Z', true)).toEqual(['gec']);
    expect(oneriDugmeleri({ ...kart('a', null), durum: 'uygulandi' }, T, true)).toEqual(['geri_al']);
    expect(oneriDugmeleri({ ...kart('a', null), durum: 'sonuc_belirsiz' }, T, true)).toEqual([]);
  });

  it('bugün kutuları: boş hücre nedenini taşıyor, ay bütçesi hız çubuğunu', () => {
    const k = bugunKutulari({
      paraBirimi: 'TRY',
      sonTarama: null,
      dun: { harcamaMicros: { dolu: true, deger: String(3912n * M), kaynak: { tur: 'gecmis_veri', kimlik: 'x', zaman: T } }, sonuc: { dolu: false, emptyReason: 'donusum_yok' }, sonucBasiMicros: { dolu: false, emptyReason: 'donusum_yok' } },
      ay: { butceMicros: { dolu: true, deger: String(120_000n * M), kaynak: { tur: 'aylik_butce', kimlik: U(2), zaman: T } }, harcananMicros: { dolu: true, deger: String(27_600n * M), kaynak: { tur: 'gecmis_veri', kimlik: 'x', zaman: T } }, gecenGun: 7, ayGun: 31 },
    });
    expect(k.map((x) => x.deger)).toEqual(['3.912 TL', null, null, '%23']);
    expect(k[1]!.bos).toBe('donusum_yok');
    expect(k[3]!.hiz).toEqual({ harcananYuzde: 23, gecenYuzde: 23 });
  });

  it('her kurulum durumunun ekran metni var', () => {
    expect(Object.keys(KURULUM_DURUM_METNI).sort()).toEqual([...KURULUM_SATIR_DURUMLARI].sort());
    // "kayıt belirsiz" yeniden kurulmaz; ekran bunu söylemeli, "düştü" gibi okunmamalı.
    expect(KURULUM_DURUM_METNI.kayit_belirsiz.metin).toContain('tekrar kurulmaz');
  });
});

describe('gerçek yayın anahtarı', () => {
  const d = (o: Partial<Parameters<typeof gercekYayinGorunumu>[0]> = {}) => ({ acik: false, degistiren: 'Ayşe', zaman: T, sebep: 'Uyum doğrulandı', degistirebilir: true, okunamadi: null, ...o });

  it('KRİTİK: okunamayan anahtar kapalı ve DÜĞMESİZ', () => {
    const g = gercekYayinGorunumu(d({ acik: true, okunamadi: 'zaman aşımı' }));
    expect(g.acik).toBe(false);
    expect(g.eylem).toBeNull();
    expect(g.baslik).toContain('okunamadı, kapalı sayılıyor');
  });

  it('KRİTİK: kapalıyken ajans notu; yalnız değiştirebilen "aç" görür', () => {
    expect(gercekYayinGorunumu(d()).baslik).toBe(GERCEK_YAYIN_KAPALI_NOTU);
    expect(gercekYayinGorunumu(d()).eylem).toBe('ac');
    expect(gercekYayinGorunumu(d({ degistirebilir: false })).eylem).toBeNull();
    expect(gercekYayinGorunumu(d({ acik: true })).eylem).toBe('kapat');
  });

  it('son değişikliğin izi kim · ne zaman · neden', () => {
    expect(gercekYayinGorunumu(d()).iz).toMatch(/^Ayşe · .+ · “Uyum doğrulandı”$/);
    expect(gercekYayinGorunumu(d({ zaman: null })).iz).toBeNull();
  });

  it('KRİTİK: sebep iki yönde de zorunlu (sözleşmenin şeması)', () => {
    expect(gercekYayinIstegi(true, 'kısa').tur).toBe('hata');
    expect(gercekYayinIstegi(false, '   ').tur).toBe('hata');
    expect(gercekYayinIstegi(true, ' Uyum canlıda doğrulandı ')).toEqual({ tur: 'tamam', govde: { acik: true, sebep: 'Uyum canlıda doğrulandı' } });
  });

  it('uç izni sözleşmeden; olmayan uç patlıyor', () => {
    expect(ucIzni('GET', '/pilot/gercek-yayin')).toBe('strategy.write');
    expect(ucIzni('PUT', '/pilot/gercek-yayin')).toBe('org.write');
    expect(() => ucIzni('PUT', '/pilot/bugun')).toThrow();
  });
});

describe('workspace beyanı', () => {
  const b = (ozelKategoriler: PilotWorkspaceBeyani['ozelKategoriler'], taninmayanKategoriler: string[] = []) => ({ ozelKategoriler, taninmayanKategoriler });

  it('KRİTİK: cevaplanmamış beyan SEÇİMSİZ açılıyor; "hiçbiri" ayrı hâl', () => {
    expect(beyanBaslangici(b(null))).toBeNull();
    expect(beyanBaslangici(b([]))).toBe('hicbiri');
    expect(beyanBaslangici(b(['HOUSING']))).toEqual(['HOUSING']);
  });

  it('KRİTİK: tanınmayan kategori taşıyan kayıt yeniden beyan ister (seçim açık)', () => {
    expect(beyanBaslangici(b(['HOUSING'], ['ESKI_KATEGORI']))).toBeNull();
  });

  it('KRİTİK: cevapsız ya da boş "evet" gönderilmiyor; "Hayır" boş liste olarak gidiyor', () => {
    expect(beyanIstegi(U(1), null, 'Konut satışı').tur).toBe('hata');
    expect(beyanIstegi(U(1), [], 'Konut satışı')).toEqual({ tur: 'hata', mesaj: 'En az bir kategori seç ya da "Hayır" de.' });
    expect(beyanIstegi(U(1), 'hicbiri', ' Diş kliniği ')).toEqual({ tur: 'tamam', govde: { clientId: U(1), ozelKategoriler: [], sektor: 'Diş kliniği' } });
    expect(beyanIstegi(U(1), ['HOUSING'], 'x').tur).toBe('hata');
  });

  it('KRİTİK: beyan kuralları katalogda gerçekten var (kimlik değişirse bağlantı sessizce kaybolmasın)', () => {
    const kimlikler = UYUM_KATALOGU.map((k) => k.kimlik);
    for (const k of BEYAN_KURALLARI) expect(kimlikler, k).toContain(k);
    expect(beyanGerekiyorMu([{ kuralKimligi: 'GNL-20' }])).toBe(true);
    expect(beyanGerekiyorMu([{ kuralKimligi: 'GNL-14' }])).toBe(false);
  });

  it('KRİTİK: bölümün izni beyanı okuyan ucun izniyle aynı; boş neden oraya gönderiyor', () => {
    expect(MM_BOLUMLERI.find((x) => x.kod === 'beyan')?.izin).toBe(ucIzni('GET', '/pilot/workspace-beyani'));
    expect(bosNedeniBaglantisi('ozel_kategori_sorulmadi', U(1))).toContain('bolum=beyan');
  });

  it('her sektörün ekran adı var', () => {
    expect(Object.keys(SEKTOR_ETIKETI).sort()).toEqual([...UYUM_SEKTORLERI].sort());
  });
});
