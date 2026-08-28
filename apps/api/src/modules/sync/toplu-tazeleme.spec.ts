import { describe, expect, it } from 'vitest';
import {
  EN_AZ_ORNEK,
  ESZAMANLILIK,
  PENCERE_GUN,
  gunSayisi,
  ilerleme,
  pencereler,
  planla,
} from './toplu-tazeleme';

/**
 * ═══ TOPLU TAZELEME — PLANLAMA ═══
 *
 * Bölme matematiği bu projede bir kez bedelini ödetti: bir günlük BOŞLUK
 * sessizce eksik veri, bir günlük ÖRTÜŞME boşa çağrı ve ikisi de kaynak
 * taramasıyla görünmüyor. Bu yüzden pencereler ÇALIŞTIRILARAK sınanıyor —
 * gözle okunarak değil.
 */
describe('pencereler', () => {
  it('tek pencereye sığan aralık bölünmüyor', () => {
    expect(pencereler('2026-08-01', '2026-08-30')).toEqual([
      { from: '2026-08-01', to: '2026-08-30' },
    ]);
  });

  it('KRİTİK: pencereler arasında BOŞLUK yok', () => {
    /*
     * Bir günlük boşluk, o günün verisinin HİÇ çekilmemesi demek ve rapor
     * onu "harcama yok" diye gösterir. Hiçbir hata düşmez.
     */
    const p = pencereler('2024-08-28', '2026-08-27');
    const sirali = [...p].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sirali.length; i++) {
      const oncekiBitis = new Date(`${sirali[i - 1]!.to}T00:00:00Z`);
      oncekiBitis.setUTCDate(oncekiBitis.getUTCDate() + 1);
      expect(sirali[i]!.from, `${i}. pencerede boşluk`).toBe(
        oncekiBitis.toISOString().slice(0, 10),
      );
    }
  });

  it('KRİTİK: pencereler ÖRTÜŞMÜYOR', () => {
    // Örtüşme boşa çağrı ve kota harcaması; upsert yüzünden veri bozulmuyor
    // ama iki yıl × fazladan pencere ciddi bir maliyet.
    const p = pencereler('2024-08-28', '2026-08-27');
    const sirali = [...p].sort((a, b) => a.from.localeCompare(b.from));
    for (let i = 1; i < sirali.length; i++) {
      expect(sirali[i]!.from > sirali[i - 1]!.to, `${i}. pencere örtüşüyor`).toBe(true);
    }
  });

  it('KRİTİK: aralığın TAMAMI kapsanıyor', () => {
    // Toplam gün sayısı, pencerelerin gün sayıları toplamına EŞİT olmalı.
    const from = '2024-08-28';
    const to = '2026-08-27';
    const p = pencereler(from, to);
    const toplamGun = p.reduce((a, w) => a + gunSayisi(w.from, w.to), 0);
    expect(toplamGun).toBe(gunSayisi(from, to));
  });

  it('hiçbir pencere sınırı AŞMIYOR', () => {
    // Sınırı aşan bir pencere, `backfillSchema`nın 365 gün kuralını ve
    // "hesabın işleyemeyeceği boyut" gerekçesini ihlal ederdi.
    for (const w of pencereler('2024-08-28', '2026-08-27')) {
      expect(gunSayisi(w.from, w.to)).toBeLessThanOrEqual(PENCERE_GUN);
    }
  });

  it('KRİTİK: EN YENİ pencere ÖNCE', () => {
    /*
     * Kullanıcı iki yıl bekliyor ama önce SON ayları görmek istiyor.
     * Kronolojik sıra, ilk yararlı verinin en sonda gelmesi demekti.
     */
    const p = pencereler('2024-08-28', '2026-08-27');
    expect(p[0]!.to).toBe('2026-08-27');
    expect(p[0]!.from > p[1]!.from).toBe(true);
  });

  it('ters aralık BOŞ dönüyor — sonsuz döngü değil', () => {
    expect(pencereler('2026-08-27', '2024-08-28')).toEqual([]);
  });

  it('tek günlük aralık tek pencere', () => {
    expect(pencereler('2026-08-27', '2026-08-27')).toEqual([
      { from: '2026-08-27', to: '2026-08-27' },
    ]);
  });

  it('iki yıl için makul sayıda pencere', () => {
    // 730 gün / 90 = 9 pencere. Sayı patlarsa kota da patlar.
    expect(pencereler('2024-08-28', '2026-08-27')).toHaveLength(9);
  });
});

describe('planla', () => {
  const hesaplar = [
    { id: 'a1', clientId: 'c1', platform: 'meta' as const },
    { id: 'a2', clientId: 'c1', platform: 'google' as const },
  ];

  it('KRİTİK: her hesap için YAPI işi ÖNCE', () => {
    /*
     * Metrik satırı, ait olduğu kampanya satırı veritabanında yoksa
     * yazılamıyor — "atadım, veri gelmiyor" hâlinin en yaygın sebebi.
     */
    const isler = planla({ hesaplar, from: '2026-08-01', to: '2026-08-30', kirilimlar: false });
    expect(isler[0]).toMatchObject({ adAccountId: 'a1', jobType: 'structure' });
    const a2Ilk = isler.findIndex((i) => i.adAccountId === 'a2');
    expect(isler[a2Ilk]).toMatchObject({ jobType: 'structure' });
  });

  it('hesap başına yapı + pencere sayısı kadar metrik işi', () => {
    const isler = planla({ hesaplar, from: '2024-08-28', to: '2026-08-27', kirilimlar: false });
    // 2 hesap × (1 yapı + 9 metrik) = 20
    expect(isler).toHaveLength(20);
  });

  it('KRİTİK: kırılım OPT-IN — varsayılan kapalı değilse kota ikiye katlanır', () => {
    const kapali = planla({ hesaplar, from: '2024-08-28', to: '2026-08-27', kirilimlar: false });
    const acik = planla({ hesaplar, from: '2024-08-28', to: '2026-08-27', kirilimlar: true });
    expect(kapali.some((i) => i.jobType === 'insights_breakdowns')).toBe(false);
    // Kırılım açıkken pencere sayısı kadar İŞ daha ekleniyor.
    expect(acik).toHaveLength(kapali.length + 2 * 9);
  });

  it('her metrik işi bir tarih aralığı TAŞIYOR', () => {
    /*
     * Tarihsiz gelen bir iş `[missing_dates]` ile düşüyor ve tek iz
     * `sync_jobs` — anahtar kelimelerde tam olarak bu oldu.
     */
    const isler = planla({ hesaplar, from: '2026-01-01', to: '2026-08-27', kirilimlar: true });
    for (const i of isler.filter((x) => x.jobType !== 'structure')) {
      expect(i.dateFrom, `${i.jobType} tarihsiz`).toBeTruthy();
      expect(i.dateTo, `${i.jobType} tarihsiz`).toBeTruthy();
    }
  });

  it('hesap yoksa iş de yok', () => {
    expect(planla({ hesaplar: [], from: '2026-01-01', to: '2026-08-27', kirilimlar: true })).toEqual(
      [],
    );
  });
});

describe('ilerleme', () => {
  it('sıfır işte %100 — sıfıra bölme yok', () => {
    expect(ilerleme(0, { tamamlanan: 0, dusen: 0, kosan: 0 }, null).yuzde).toBe(100);
  });

  it('KRİTİK: DÜŞEN iş de "bitmiş" sayılıyor', () => {
    /*
     * Sayılmasaydı çubuk kalıcı olarak %90'da takılır ve kullanıcı bitmeyen
     * bir işlemi beklerdi. Düşen sayısı AYRICA gösteriliyor: yüzde
     * tamamlandığında hepsi başarılı demek değil.
     */
    const i = ilerleme(10, { tamamlanan: 7, dusen: 3, kosan: 0 }, 10);
    expect(i.yuzde).toBe(100);
    expect(i.bitti).toBe(true);
    expect(i.dusen).toBe(3);
  });

  it('yüzde 100’ü AŞMIYOR', () => {
    // Mükerrer engeline takılan işler paydayı bozabiliyor.
    expect(ilerleme(5, { tamamlanan: 7, dusen: 0, kosan: 0 }, 10).yuzde).toBe(100);
  });

  it('KRİTİK: örnek yetersizken tahmin YOK', () => {
    /*
     * İlk iş bittiğinde "23 saat kaldı" yazan bir çubuk, birkaç dakika sonra
     * "40 dakika" diyor ve kullanıcı ikisine de güvenmeyi bırakıyor.
     */
    expect(ilerleme(10, { tamamlanan: 1, dusen: 0, kosan: 1 }, null).kalanSaniye).toBeNull();
  });

  it('KRİTİK: kalan süre EŞ ZAMANLILIĞA bölünüyor', () => {
    /*
     * Worker dört işi paralel koşuyor. Bölmeyi unutmak süreyi dört katı
     * gösterirdi ve kullanıcı iki saatlik bir işlem için sekiz saat görürdü.
     */
    const i = ilerleme(100, { tamamlanan: 20, dusen: 0, kosan: 4 }, 60);
    expect(i.kalanSaniye).toBe(Math.round((80 * 60) / ESZAMANLILIK));
  });

  it('bittiğinde kalan süre YOK', () => {
    expect(ilerleme(10, { tamamlanan: 10, dusen: 0, kosan: 0 }, 60).kalanSaniye).toBeNull();
  });

  it('bekleyen sayısı negatif olmuyor', () => {
    expect(ilerleme(5, { tamamlanan: 5, dusen: 0, kosan: 3 }, 10).bekleyen).toBe(0);
  });

  it('en az örnek sayısı makul', () => {
    expect(EN_AZ_ORNEK).toBeGreaterThanOrEqual(3);
  });
});
