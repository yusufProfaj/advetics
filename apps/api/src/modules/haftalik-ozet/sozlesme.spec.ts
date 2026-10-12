import { describe, expect, it } from 'vitest';
import {
  OZET,
  OZET_BOLUMLERI,
  OZET_BOLUM_KITLESI,
  OZET_PENCERE_ANAHTARI,
  OZET_UCLARI,
  PERMISSIONS,
  YORUM_KAYNAK_BOLUMLERI,
  YORUM_SISTEM_TALIMATI,
  aralikMetni,
  bolumGorunurMu,
  donusumKiyasi,
  haftalikOzetPlaniSchema,
  isoHaftaAraligi,
  isoHaftaKodu,
  kalemleriSec,
  kisaOneri,
  kisaOzet,
  metrikYonu,
  ozetHacmi,
  ozetHaftasi,
  ozetKitleyeGore,
  raporPenceresi,
  resolvePermissions,
  yerTutucuDoldur,
  yorumDenetle,
  yorumGirdisi,
  type HaftaToplami,
  type HaftalikOzet,
  type KampanyaHaftasi,
} from '@advetics/shared';
import { isoHafta } from '../iyilestir/oneri-hesap';

/**
 * ═══ HAFTALIK ÖZET SÖZLEŞMESİ (Paket B, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. Mutasyon yapılacaksa önce
 * `packages/shared` yeniden derlenmeli: testler `dist`i okuyor (CLAUDE.md).
 */

const t = (harcama: number, gosterim: number, tiklama: number, donusum: number): HaftaToplami => ({ harcama, gosterim, tiklama, donusum });

function kampanya(id: string, bu: HaftaToplami, onceki: HaftaToplami): KampanyaHaftasi {
  return { varlikId: id, ad: `K-${id}`, hesapAdi: 'Hesap', platform: 'meta', bu: { tam: bu, olgun: bu }, onceki: { tam: onceki, olgun: onceki } };
}

function ozet(ek: Partial<HaftalikOzet> = {}): HaftalikOzet {
  return {
    clientId: '00000000-0000-4000-8000-000000000001',
    clientAdi: 'Acme',
    hafta: '2026-W41',
    aralik: { bas: '2026-10-05', son: '2026-10-11' },
    oncekiAralik: { bas: '2026-09-28', son: '2026-10-04' },
    paraBirimi: 'TRY',
    hacim: 'normal',
    metrikler: [
      { metrik: 'harcama', bu: { sayi: 12400, metin: '12.400 ₺' }, onceki: { sayi: 11500, metin: '11.500 ₺' }, degisim: 0.078, yon: 'notr', kesinlesmedi: false },
      { metrik: 'donusum', bu: { sayi: 84, metin: '84' }, onceki: { sayi: 96, metin: '96' }, degisim: -0.125, yon: 'kotu', kesinlesmedi: true },
    ],
    donusumKiyasi: null,
    degisenler: {
      kalemler: [{ varlikId: 'a', ad: 'Ekim 2026 Satış', hesapAdi: 'H', platform: 'meta', metrik: 'harcama', bu: 5000, onceki: 3000, degisim: 0.67, pay: 0.4, yon: 'notr' }],
      elenen: { hacim_dusuk: 0, degisim_kucuk: 0, pay_kucuk: 0, deger_yok: 0 },
      bosNedeni: null,
    },
    yaptiklarimiz: { satirlar: [], toplam: 0 },
    etkiler: { satirlar: [], toplam: 0, olcumde: 0 },
    sinyaller: {
      satirlar: [{ sinyalId: 's1', tur: 'anomali', kod: 'harcama', baslik: 'Maliyet beklenenin üstünde', varlikAdi: 'GİZLİ-SİNYAL-KAMPANYASI', onem: 'yuksek' }],
      toplam: 1,
      sessizKosum: false,
    },
    bekleyenIsler: { isler: [], acikOneri: 2 },
    oneri: { tur: 'oneri_bekliyor', metin: 'İyileştir\'de onay bekleyen 2 öneri var.', hedef: { ekran: 'iyilestir', ref: null } },
    yorum: { durum: 'yazildi', metin: 'Maliyet arttı.', not: null },
    hatalar: [{ kaynak: 'sinyaller', mesaj: 'okunamadı' }],
    uretildi: '2026-10-12T06:00:00.000Z',
    ...ek,
  };
}

describe('hafta', () => {
  it('KRİTİK: ISO hafta kodu iyilestir/oneri-hesap ile her gün aynı (3 yıl)', () => {
    let d = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 365 * 3; i++) {
      const gun = d.toISOString().slice(0, 10);
      expect(isoHaftaKodu(gun), gun).toBe(isoHafta(gun));
      d = new Date(d.getTime() + 86_400_000);
    }
  });

  it('hafta aralığı Pazartesi-Pazar ve kod ile gidiş-dönüş', () => {
    expect(isoHaftaAraligi('2026-W41')).toEqual({ bas: '2026-10-05', son: '2026-10-11' });
    expect(isoHaftaAraligi('2026-W01')).toEqual({ bas: '2025-12-29', son: '2026-01-04' });
    expect(isoHaftaAraligi('2025-W53')).toBeNull(); // 2025'te 53. hafta yok
    expect(isoHaftaAraligi('2026-41')).toBeNull();
  });

  it('KRİTİK: Pazartesi 01:00 İstanbul (Pazar 22:00 UTC) geçen haftayı verir, iki hafta öncesini değil', () => {
    expect(ozetHaftasi(new Date('2026-10-11T22:00:00Z'))).toBe('2026-W41');
    expect(ozetHaftasi(new Date('2026-10-12T06:00:00Z'))).toBe('2026-W41');
    // Worker geç kalıp Salı koşsa da plan anı verilirse aynı hafta.
    expect(ozetHaftasi(new Date('2026-10-13T08:00:00Z'))).toBe('2026-W41');
  });

  it('aralık metni uzun tire taşımaz', () => {
    expect(aralikMetni({ bas: '2026-10-05', son: '2026-10-11' })).toBe('5-11 Ekim');
    expect(aralikMetni({ bas: '2026-09-28', son: '2026-10-04' })).toBe('28 Eylül - 4 Ekim');
  });
});

describe('dönüşüm kıyası', () => {
  it('KRİTİK: Pazartesi üretilen özette yalnız olgun günler kıyaslanır (Pzt-Per)', () => {
    const k = donusumKiyasi('2026-W41', '2026-10-12')!;
    expect(k.bu).toEqual({ bas: '2026-10-05', son: '2026-10-08' });
    expect(k.onceki).toEqual({ bas: '2026-09-28', son: '2026-10-01' });
    expect(k.tamHafta).toBe(false);
  });

  it('hafta olgunlaşınca tam hafta', () => {
    expect(donusumKiyasi('2026-W41', '2026-10-15')!.tamHafta).toBe(true);
  });
});

describe('en çok değişenler (gürültü filtresi)', () => {
  it('KRİTİK: küçük kampanyanın büyük yüzdesi (pay) listeye girmez', () => {
    const r = kalemleriSec([
      kampanya('buyuk', t(10_000, 50_000, 900, 40), t(8_000, 50_000, 900, 40)),
      kampanya('kucuk', t(300, 2_000, 30, 1), t(100, 2_000, 30, 1)), // %200 ama pay ~%2
    ]);
    expect(r.kalemler.map((k) => k.varlikId)).toEqual(['buyuk']);
    expect(r.elenen.pay_kucuk).toBeGreaterThan(0);
  });

  it('KRİTİK: düşük gösterimde aday değil', () => {
    const r = kalemleriSec([kampanya('a', t(1000, 500, 10, 0), t(100, 400, 5, 0))]);
    expect(r.kalemler).toHaveLength(0);
    expect(r.elenen.hacim_dusuk).toBe(3); // üç metrik de
  });

  it('küçük değişim haber değil', () => {
    const r = kalemleriSec([kampanya('a', t(10_500, 50_000, 900, 40), t(10_000, 50_000, 900, 40))]);
    expect(r.kalemler).toHaveLength(0);
    expect(r.elenen.degisim_kucuk).toBeGreaterThan(0);
  });

  it('kampanya başına en fazla bir kalem, en fazla OZET.enCokKalem', () => {
    const adaylar = Array.from({ length: 8 }, (_, i) =>
      kampanya(`k${i}`, t(10_000 + i * 1000, 50_000, 900, 60), t(5_000, 50_000, 900, 20)),
    );
    const r = kalemleriSec(adaylar);
    expect(r.kalemler.length).toBe(OZET.enCokKalem);
    expect(new Set(r.kalemler.map((k) => k.varlikId)).size).toBe(r.kalemler.length);
  });

  it('KRİTİK: tek kampanyanın üç metriği listeyi doldurmaz', () => {
    // A: maliyet, dönüşüm ve dönüşüm başı maliyet ÜÇÜ de güçlü değişti; B: yalnız maliyet.
    const r = kalemleriSec([
      kampanya('A', t(20_000, 80_000, 1500, 100), t(10_000, 80_000, 1500, 20)),
      kampanya('B', t(6_000, 30_000, 500, 30), t(4_000, 30_000, 500, 30)),
    ]);
    expect(r.kalemler.map((k) => k.varlikId).sort()).toEqual(['A', 'B']);
  });

  it('dönüşüm başı maliyetin düşmesi iyi, harcama nötr', () => {
    expect(metrikYonu('donusum_basi_maliyet', -0.2)).toBe('iyi');
    expect(metrikYonu('donusum', -0.2)).toBe('kotu');
    expect(metrikYonu('harcama', 0.5)).toBe('notr');
  });

  it('hacim: boş, düşük, normal', () => {
    expect(ozetHacmi(t(0, 0, 0, 0), t(0, 0, 0, 0))).toBe('bos');
    expect(ozetHacmi(t(50, 300, 2, 0), t(40, 200, 1, 0))).toBe('dusuk_hacim');
    expect(ozetHacmi(t(5000, 30_000, 300, 10), t(0, 0, 0, 0))).toBe('normal');
  });
});

describe('kitle', () => {
  it('KRİTİK: müşteri görünümünde sinyal, bekleyen iş ve öneri YOK', () => {
    const m = ozetKitleyeGore(ozet(), 'musteri');
    expect(m.sinyaller).toBeNull();
    expect(m.bekleyenIsler).toBeNull();
    expect(m.oneri).toBeNull();
    expect(m.hatalar).toHaveLength(0); // "sinyaller okunamadı" müşteriye gitmez
    expect(JSON.stringify(m)).not.toContain('GİZLİ-SİNYAL-KAMPANYASI');
  });

  it('ajans görünümü her şeyi taşır', () => {
    const a = ozetKitleyeGore(ozet(), 'ajans');
    expect(a.sinyaller?.toplam).toBe(1);
    expect(a.oneri).not.toBeNull();
  });

  it('her bölümün kitlesi tanımlı ve ajans her bölümü görür', () => {
    for (const b of OZET_BOLUMLERI) {
      expect(OZET_BOLUM_KITLESI[b].length).toBeGreaterThan(0);
      expect(bolumGorunurMu(b, 'ajans')).toBe(true);
    }
  });

  it('KRİTİK: yorumu besleyen bölümler iki kitleye de görünenler', () => {
    expect(YORUM_KAYNAK_BOLUMLERI).not.toContain('sinyaller');
    expect(YORUM_KAYNAK_BOLUMLERI).not.toContain('bekleyen_isler');
    expect(YORUM_KAYNAK_BOLUMLERI).not.toContain('oneri');
    for (const b of YORUM_KAYNAK_BOLUMLERI) expect(bolumGorunurMu(b, 'musteri')).toBe(true);
  });
});

describe('yapay zekâ yorumu sayı uyduramaz', () => {
  const izinli = new Set(['harcama_degisim', 'k1_ad']);

  it('yer tutuculu temiz yorum geçer ve sorgudan doldurulur', () => {
    const d = yorumDenetle('Maliyet {{harcama_degisim}} arttı; artışın çoğu {{k1_ad}} kampanyasından.', izinli);
    expect(d.gecerli).toBe(true);
    if (d.gecerli) {
      expect(yerTutucuDoldur(d.sablon, { harcama_degisim: '%8', k1_ad: 'Ekim 2026 Satış' })).toBe(
        'Maliyet %8 arttı; artışın çoğu Ekim 2026 Satış kampanyasından.',
      );
    }
  });

  it('KRİTİK: rakam reddedilir', () => {
    expect(yorumDenetle('Maliyet 12 arttı.', izinli)).toMatchObject({ gecerli: false, neden: 'rakam' });
    expect(yorumDenetle('Maliyet ٣ arttı.', izinli)).toMatchObject({ gecerli: false, neden: 'rakam' }); // Unicode rakam
  });

  it('KRİTİK: yüzde ve para simgesi reddedilir', () => {
    expect(yorumDenetle('Maliyet yüksek % oranda arttı.', izinli)).toMatchObject({ gecerli: false, neden: 'simge' });
    expect(yorumDenetle('Bütçe ₺ bazında arttı.', izinli)).toMatchObject({ gecerli: false, neden: 'simge' });
  });

  it('KRİTİK: sayı sözcüğü reddedilir, "bir" serbest', () => {
    expect(yorumDenetle('Maliyet iki katına çıktı.', izinli)).toMatchObject({ gecerli: false, neden: 'sayi_sozcugu' });
    expect(yorumDenetle('Dönüşümler yarı yarıya düştü.', izinli)).toMatchObject({ gecerli: false, neden: 'sayi_sozcugu' });
    expect(yorumDenetle('Maliyette bir artış var.', izinli).gecerli).toBe(true);
  });

  it('KRİTİK: bilinmeyen yer tutucu reddedilir (sinyal bilgisi sızamaz)', () => {
    expect(yorumDenetle('{{s1_baslik}} dikkat çekiyor.', izinli)).toMatchObject({ gecerli: false, neden: 'bilinmeyen_yer_tutucu' });
  });

  it('yer tutucu adındaki rakam meşru, kapanmamış yer tutucu değil', () => {
    expect(yorumDenetle('{{k1_ad}} öne çıktı.', izinli).gecerli).toBe(true);
    expect(yorumDenetle('{{k1_ad öne çıktı.', izinli).gecerli).toBe(false);
  });

  it('uzun tire virgüle çevrilir, HTML ve çok paragraf reddedilir', () => {
    const d = yorumDenetle('Maliyet arttı — dönüşüm düştü.', izinli);
    expect(d.gecerli && d.sablon).toBe('Maliyet arttı, dönüşüm düştü.');
    expect(yorumDenetle('<b>Maliyet</b> arttı.', izinli).gecerli).toBe(false);
    expect(yorumDenetle('Maliyet arttı.\nDönüşüm düştü.', izinli).gecerli).toBe(false);
  });

  it('değeri olmayan yer tutucu doldurulmaz, patlar (müşteriye {{x}} gitmez)', () => {
    expect(() => yerTutucuDoldur('{{k9_ad}}', {})).toThrow();
  });

  it('KRİTİK: modele giden girdide rakam ve sinyal YOK; yer tutucular denetimle uyumlu', () => {
    const g = yorumGirdisi(ozet(), { yuzde: (x) => `%${Math.round(x * 100)}` })!;
    const yerTutucusuz = g.metin.replace(/\{\{[a-z0-9_]+\}\}/g, '');
    expect(yerTutucusuz).not.toMatch(/\p{Nd}/u);
    expect(g.metin).not.toContain('Ekim 2026 Satış'); // kampanya adı yalnız yer tutucuyla
    expect(g.metin).not.toContain('GİZLİ-SİNYAL-KAMPANYASI');
    expect(g.metin).not.toContain('Maliyet beklenenin');
    expect(g.degerler.k1_ad).toBe('Ekim 2026 Satış');
    for (const ad of Object.keys(g.degerler)) expect(ad).toMatch(/^[a-z0-9_]+$/);
  });

  it('düşük hacimde yorum istenmez', () => {
    expect(yorumGirdisi(ozet({ hacim: 'dusuk_hacim' }), { yuzde: String })).toBeNull();
  });

  it('talimat denetimle aynı kuralı anlatıyor', () => {
    expect(YORUM_SISTEM_TALIMATI).toContain('yer tutucu');
    expect(YORUM_SISTEM_TALIMATI).toMatch(/rakam/);
  });
});

describe('kısa sürüm ve öneri', () => {
  it('Slack/Teams metni en fazla 6 satır, sessiz kesme yok', () => {
    const k = kisaOzet(ozet(), '/raporlar?sekme=ozet');
    expect(k.satirlar.length).toBeLessThanOrEqual(6);
    const kalabalik = ozet({
      metrikler: Array.from({ length: 4 }, () => ozet().metrikler[0]!),
    });
    const k2 = kisaOzet(kalabalik, '/x');
    expect(k2.satirlar).toHaveLength(6);
    expect(k2.satirlar[5]).toMatch(/satır daha panelde/);
  });

  it('öneri önceliği: uygulanabilir yüksek sinyal > bekleyen öneri > bekleyen iş', () => {
    const s = { sinyalId: 's', tur: 'anomali' as const, kod: 'harcama' as const, baslik: 'Maliyet yüksek', varlikAdi: 'K', onem: 'yuksek' as const };
    expect(kisaOneri({ sinyaller: [{ ...s, uygulanabilir: true }], acikOneri: 3, bekleyenIsler: [] })?.tur).toBe('sinyal_uygula');
    expect(kisaOneri({ sinyaller: [{ ...s, uygulanabilir: false }], acikOneri: 3, bekleyenIsler: [] })?.tur).toBe('oneri_bekliyor');
    expect(kisaOneri({ sinyaller: [], acikOneri: 0, bekleyenIsler: [] })).toBeNull();
  });
});

describe('plan', () => {
  it('KRİTİK: özet pencere anahtarı rapor penceresine düşerse null (yanlış dönemli rapor yerine atlama)', () => {
    expect(raporPenceresi(OZET_PENCERE_ANAHTARI, '2026-10-12')).toBeNull();
  });

  it('plan varsayılan saati 09:00, alıcı boş olabilir', () => {
    const v = haftalikOzetPlaniSchema.parse({ clientId: '00000000-0000-4000-8000-000000000001', etkin: true });
    expect(v.saat).toBe(9);
    expect(v.toEmails).toEqual([]);
  });
});

describe('uçlar ve izinler', () => {
  it('uç izinleri gerçek izinler', () => {
    for (const u of OZET_UCLARI) expect(PERMISSIONS).toContain(u.izin);
  });

  it('müşteri hesabı önizlemeyi görür, planı yönetemez', () => {
    const musteri = resolvePermissions('client_viewer');
    const onizleme = OZET_UCLARI.find((u) => u.yol === '/haftalik-ozet/onizleme')!;
    expect(musteri.has(onizleme.izin)).toBe(true);
    expect(musteri.has('rule.read')).toBe(false); // ajans görünümü kapalı
    for (const u of OZET_UCLARI.filter((x) => x.yol !== '/haftalik-ozet/onizleme')) expect(musteri.has(u.izin)).toBe(false);
  });
});
