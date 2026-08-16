import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOCAL,
  MIN_IMAGE_EDGE,
  canCrop,
  matchRatio,
  planAllCrops,
  planCrop,
} from '@advetics/shared';

/**
 * Kırpma matematiği.
 *
 * HATASI SESSİZ: yanlış hesaplanan bir kırpma, ürünün yarısı kesilmiş bir
 * reklam demek ve bunu ancak yayına çıktıktan sonra bakan biri varsa fark
 * eder. `goal-mapping.spec.ts` ile aynı sınıfta bir test paketi.
 */

describe('kırpma dikdörtgeni', () => {
  it('yatay fotoğraftan kare — YÜKSEKLİK tam kullanılıyor', () => {
    // 4000×3000 bir telefon fotoğrafı: kare için genişlik kırpılıyor.
    const p = planCrop({ width: 4000, height: 3000 }, 'square');
    expect(p.sh).toBe(3000);
    expect(p.sw).toBe(3000);
  });

  it('dikey fotoğraftan yatay — GENİŞLİK tam kullanılıyor', () => {
    const p = planCrop({ width: 1080, height: 1920 }, 'horizontal');
    expect(p.sw).toBe(1080);
    expect(p.sh).toBe(Math.floor(1080 / (16 / 9)));
  });

  it('üretilen görsel HEDEF ORANA oturuyor', () => {
    /**
     * ASIL SINAV BU: ürettiğimiz görsel `matchRatio` kovasına girmezse
     * kullanıcı kırpma aracını çalıştırıp sonucun yine reddedildiğini görür.
     */
    for (const source of [
      { width: 4000, height: 3000 },
      { width: 1200, height: 1600 },
      { width: 2048, height: 2048 },
      { width: 3000, height: 1000 },
    ]) {
      for (const plan of planAllCrops(source)) {
        if (!plan.usable) continue;
        expect(matchRatio(plan.outWidth, plan.outHeight)).toBe(plan.ratio);
      }
    }
  });

  it('BÜYÜTME YOK — kaynak küçükse çıktı da küçük', () => {
    // Yukarı ölçeklemek, bulanık bir görseli "yeterli çözünürlükte" gibi
    // göstermek olurdu; Meta bunu reddetmiyor, yalnızca kötü görünüyor.
    const p = planCrop({ width: 800, height: 800 }, 'square');
    expect(p.outWidth).toBe(800);
  });

  it('önerilen boyuttan büyük üretilmiyor', () => {
    const p = planCrop({ width: 6000, height: 6000 }, 'square');
    expect(p.outWidth).toBe(1080);
    expect(p.outHeight).toBe(1080);
  });
});

describe('odak noktası', () => {
  it('varsayılan odak ÜST ORTA, tam merkez değil', () => {
    // İnsan fotoğrafında yüz genelde üst yarıda; merkez dikey kırpmada
    // çeneden kesiyor.
    expect(DEFAULT_FOCAL.y).toBeLessThan(0.5);

    const p = planCrop({ width: 1000, height: 2000 }, 'square');
    // Odak 0.4 → merkez 800. Kare 1000 yüksek, üst kenar 800 - 500 = 300.
    expect(p.sy).toBe(300);
  });

  it('odak sola dayandığında KIRPMA KÜÇÜLMÜYOR, kenara yaslanıyor', () => {
    /**
     * Dikdörtgeni içeri sıkıştırmak, aynı odak için farklı boyutlarda
     * çıktılar üretirdi ve kullanıcı neden bir kırpmanın daha düşük
     * çözünürlüklü olduğunu anlayamazdı.
     */
    const p = planCrop({ width: 4000, height: 3000 }, 'square', { x: 0, y: 0.5 });
    expect(p.sx).toBe(0);
    expect(p.sw).toBe(3000);
  });

  it('odak sağa dayandığında sağ kenara yaslanıyor', () => {
    const p = planCrop({ width: 4000, height: 3000 }, 'square', { x: 1, y: 0.5 });
    expect(p.sx).toBe(1000);
    expect(p.sx + p.sw).toBe(4000);
  });

  it('aralık dışı odak kırpmayı taşırmıyor', () => {
    for (const focal of [
      { x: -5, y: -5 },
      { x: 9, y: 9 },
      { x: Number.NaN, y: Number.NaN },
    ]) {
      const p = planCrop({ width: 4000, height: 3000 }, 'vertical', focal);
      expect(p.sx).toBeGreaterThanOrEqual(0);
      expect(p.sy).toBeGreaterThanOrEqual(0);
      expect(p.sx + p.sw).toBeLessThanOrEqual(4000);
      expect(p.sy + p.sh).toBeLessThanOrEqual(3000);
    }
  });
});

describe('çözünürlük sınırı — aracın sessiz yan etkisi', () => {
  it('KRİTİK: küçük görselden dikey kırpma KULLANILAMAZ diyor', () => {
    /**
     * 800×600'den 9:16 kırpmak 338×600 üretiyor ve kısa kenar Meta'nın alt
     * sınırının altına düşüyor. Sessizce üretip yüklemek, bulanık bir reklam
     * demek olurdu.
     */
    const p = planCrop({ width: 800, height: 600 }, 'vertical');
    expect(p.usable).toBe(false);
    expect(p.reason).toContain(String(MIN_IMAGE_EDGE));
    // MESAJ NE KALDIĞINI SÖYLÜYOR: "çok küçük" demek kullanıcıya bir sonraki
    // adımı vermiyor.
    expect(p.reason).toContain(`${p.outWidth}×${p.outHeight}`);
  });

  it('yeterli görselde üç oran da kullanılabilir', () => {
    const plans = planAllCrops({ width: 4000, height: 3000 });
    expect(plans.every((p) => p.usable)).toBe(true);
  });

  it('canCrop kare bile çıkmıyorsa ERKEN hayır diyor', () => {
    // Kullanıcı odak sürükleyip üç kırpma ürettikten sonra "olmadı"
    // duymamalı.
    const kucuk = canCrop({ width: 400, height: 400 });
    expect(kucuk.ok).toBe(false);
    expect(kucuk.reason).toContain('400×400');

    expect(canCrop({ width: 1080, height: 1080 }).ok).toBe(true);
  });
});

describe('korunan alan', () => {
  it('kare kaynakta kare kırpma HİÇBİR ŞEY kaybetmiyor', () => {
    expect(planCrop({ width: 1080, height: 1080 }, 'square').retained).toBeCloseTo(1, 5);
  });

  it('yatay kaynakta dikey kırpma çoğunu kaybediyor ve oran DOĞRU', () => {
    // Kullanıcı "%X kırpılacak" cümlesini bu sayıdan görüyor; yanlış olması,
    // yanlış bir güven vermek demek.
    const p = planCrop({ width: 4000, height: 3000 }, 'vertical');
    // 9:16 → genişlik 3000 * 9/16 = 1687, alan oranı 1687*3000 / (4000*3000)
    expect(p.retained).toBeCloseTo(1687 / 4000, 2);
  });
});
