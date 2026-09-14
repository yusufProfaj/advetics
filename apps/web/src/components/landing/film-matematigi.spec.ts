import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ETIKETLER,
  FILM,
  KARTLAR,
  KART_PAYI,
  NOKTALAR,
  KART_RENGI,
  KOYU_TEMA_KISMA,
  SAYAC_BASLANGICI,
  SAYAC_GORUNME,
  SAYAC_RENKLERI,
  bicimle,
  bolumIlerlemesi,
  kartKutusu,
  sayacDegerleri,
  sayacIlerlemesi,
  sayacOpakligi,
  videoSaniyesi,
} from './film-matematigi';

/**
 * ═══ HERO FİLMİNİN MATEMATİĞİ ═══
 *
 * Bu dosyadaki hataların hepsi SESSİZ: video yanlış saniyeye bağlanıyor,
 * sayaç kartın yarısına oturuyor ya da rakam İngilizce biçimde çıkıyor.
 * Hiçbiri hata fırlatmıyor ve yalnızca canlıda, gerçek bir ekranda
 * görülüyor.
 */
const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const BILESEN = yorumsuz('kaydirma-filmi.tsx');
const SAYFA = yorumsuz('../../app/page.tsx');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(BILESEN).toContain("'use client'");
    expect(BILESEN.length).toBeGreaterThan(2000);
    expect(SAYFA).toContain('<KaydirmaFilmi>');
  });
});

describe('kaydırma → video saniyesi', () => {
  it('uçlar filme sabitli', () => {
    expect(videoSaniyesi(0)).toBe(0);
    expect(videoSaniyesi(1)).toBe(FILM.sure);
  });

  it('KRİTİK: kaydırma dışına taşan değerler kırpılıyor', () => {
    /*
     * Lastikli kaydırmada (macOS, iOS) `getBoundingClientRect().top` pozitif
     * ya da bölümden büyük olabiliyor. Kırpılmazsa `currentTime`a negatif ya
     * da süreyi aşan bir değer yazılır; tarayıcı hata VERMEZ, videoyu başa
     * sarar ve film kaydırırken sıçrar.
     */
    expect(videoSaniyesi(-0.5)).toBe(0);
    expect(videoSaniyesi(1.5)).toBe(FILM.sure);
  });

  it('monoton artıyor — geri kaydırınca film geri sarıyor', () => {
    let onceki = -1;
    for (let i = 0; i <= 200; i++) {
      const t = videoSaniyesi(i / 200);
      expect(t).toBeGreaterThanOrEqual(onceki);
      onceki = t;
    }
  });

  it('KRİTİK: kırılım noktaları tabloyla birebir', () => {
    for (const n of NOKTALAR) {
      expect(videoSaniyesi(n.s)).toBeCloseTo(n.t, 5);
    }
  });

  it('KRİTİK: sayaç eşiği çekim 3’ün ilk karesine denk geliyor', () => {
    /*
     * Ölçüldü: kartlar ancak 14,0 sn'de (çekim 3'ün ilk karesi) piksel olarak
     * kilitleniyor. Çekim 2 boyunca kamera 16 px dikey kayıyor. Eşik oradan
     * ÖNCE olursa sayaçlar kartların üstünden kayar.
     */
    expect(videoSaniyesi(SAYAC_BASLANGICI)).toBeCloseTo(14.0, 5);
  });

  it('sayaç fazı kaydırmanın yarısından fazlasını alıyor', () => {
    // Kilitli kadraj yavaş taranabiliyor; asıl anlatı da orada.
    expect(1 - SAYAC_BASLANGICI).toBeGreaterThan(0.5);
  });
});

describe('sayaçlar', () => {
  it('eşikten önce hiç ilerlemiyor', () => {
    expect(sayacIlerlemesi(0)).toBe(0);
    expect(sayacIlerlemesi(SAYAC_BASLANGICI)).toBe(0);
    expect(sayacDegerleri(0.1).form).toBe(0);
    expect(sayacDegerleri(0.1).mesaj).toBe(0);
  });

  it('sonda hedef değerlerde', () => {
    const d = sayacDegerleri(1);
    expect(d.roas).toBeCloseTo(4.7, 5);
    expect(d.form).toBe(312);
    expect(d.mesaj).toBe(1284);
  });

  it('KRİTİK: eğri son üçte birde ölü kalmıyor', () => {
    /*
     * İlk hâlinde `easeOutCubic` vardı ve kaydırmanın %70'inde doyuyordu:
     * kullanıcı kaydırmaya devam ediyor, rakamlar kıpırdamıyordu. Son üçte
     * birde hâlâ gözle görülür bir artış OLMALI.
     */
    const a = sayacDegerleri(0.8).mesaj;
    const b = sayacDegerleri(1).mesaj;
    expect(b - a).toBeGreaterThan(100);
  });

  it('monoton artıyor', () => {
    let onceki = -1;
    for (let i = 0; i <= 200; i++) {
      const v = sayacDegerleri(i / 200).mesaj;
      expect(v).toBeGreaterThanOrEqual(onceki);
      onceki = v;
    }
  });

  it('KRİTİK: biçim tr-TR — ondalık VİRGÜL, binlik NOKTA', () => {
    /*
     * `toFixed(1)` "4.7×" yazardı; Türkçe arayüzde bu, binlik ayırıcıyla
     * karışan bir sayı demek. 1284 de "1,284" değil "1.284" olmalı.
     */
    expect(bicimle('roas', 4.7)).toBe('4,7×');
    expect(bicimle('mesaj', 1284)).toBe('1.284');
    expect(bicimle('form', 312)).toBe('312');
  });

  it('KRİTİK: üçüncü sayaç "Lead" DEĞİL', () => {
    /*
     * `CONVERSION_BUCKETS.form` zaten `lead` aksiyon tipini içeriyor. İkisini
     * ayrı sayaç yapmak aynı sayıyı iki kez göstermek ve ana sayfayla raporu
     * ayrıştırmak olurdu.
     */
    const etiketler = Object.values(ETIKETLER).map((e) => e.toLocaleLowerCase('tr'));
    expect(etiketler).not.toContain('lead');
    expect(etiketler).toContain('mesaj');
  });

  it('KRİTİK: katman kartlar KİLİTLENMEDEN görünmüyor', () => {
    /*
     * İlk yazımda pencere 0,36–0,44 idi ve bu test onu yakaladı: katman
     * eşikte %75 opaklıktaydı, yani sayaçlar çekim 2'nin son saniyelerinde —
     * kamera hâlâ 16 px kayarken — yarı görünür oluyordu.
     */
    expect(sayacOpakligi(0)).toBe(0);
    expect(sayacOpakligi(SAYAC_BASLANGICI - 0.01)).toBe(0);
    expect(sayacOpakligi(SAYAC_BASLANGICI)).toBe(0);
    expect(sayacOpakligi(SAYAC_GORUNME.son)).toBe(1);
    expect(sayacOpakligi(1)).toBe(1);
    // Pencere eşikten ÖNCE açılmamalı.
    expect(SAYAC_GORUNME.bas).toBeGreaterThanOrEqual(SAYAC_BASLANGICI);
  });
});

describe('kart konumları', () => {
  const yuzde = (s: string) => Number(s.replace('%', ''));

  it('KRİTİK: her sayaç kutusu kendi kartının İÇİNDE', () => {
    for (const kart of KARTLAR) {
      const k = kartKutusu(kart);
      const sol = (yuzde(k.left) / 100) * FILM.kareEn;
      const ust = (yuzde(k.top) / 100) * FILM.kareBoy;
      const en = (yuzde(k.width) / 100) * FILM.kareEn;
      const boy = (yuzde(k.height) / 100) * FILM.kareBoy;

      expect(sol).toBeGreaterThanOrEqual(kart.x + KART_PAYI - 0.5);
      expect(ust).toBeGreaterThanOrEqual(kart.y + KART_PAYI - 0.5);
      expect(sol + en).toBeLessThanOrEqual(kart.x + kart.en - KART_PAYI + 0.5);
      expect(ust + boy).toBeLessThanOrEqual(kart.y + kart.boy - KART_PAYI + 0.5);
    }
  });

  it('KRİTİK: kutular birbiriyle ÇAKIŞMIYOR', () => {
    const kutular = KARTLAR.map((kart) => {
      const k = kartKutusu(kart);
      const sol = yuzde(k.left);
      return { sol, sag: sol + yuzde(k.width) };
    }).sort((a, b) => a.sol - b.sol);
    for (let i = 1; i < kutular.length; i++) {
      expect(kutular[i]!.sol).toBeGreaterThan(kutular[i - 1]!.sag);
    }
  });

  it('kartlar film karesinin dışına taşmıyor', () => {
    for (const kart of KARTLAR) {
      expect(kart.x + kart.en).toBeLessThanOrEqual(FILM.kareEn);
      expect(kart.y + kart.boy).toBeLessThanOrEqual(FILM.kareBoy);
    }
  });

  it('her sayaç için tam bir kart var', () => {
    expect(KARTLAR).toHaveLength(Object.keys(ETIKETLER).length);
    for (const kart of KARTLAR) expect(ETIKETLER[kart.anahtar]).toBeTruthy();
  });
});

describe('bölüm ilerlemesi', () => {
  it('bölüm üstteyken 0, sonundayken 1', () => {
    expect(bolumIlerlemesi(0, 5000, 800)).toBe(0);
    expect(bolumIlerlemesi(-4200, 5000, 800)).toBe(1);
    expect(bolumIlerlemesi(-2100, 5000, 800)).toBeCloseTo(0.5, 3);
  });

  it('KRİTİK: bölüm görünümden kısaysa SIFIRA BÖLMÜYOR', () => {
    /*
     * `lg:h-[500vh]` yalnızca masaüstünde uygulanıyor; dar ekranda bölüm
     * içeriği kadar yüksek ve yol negatif olabiliyor. `-ust / 0` `Infinity`
     * üretir ve `currentTime`a `NaN` yazmak videoyu SESSİZCE dondurur.
     */
    expect(bolumIlerlemesi(-100, 600, 800)).toBe(0);
    expect(bolumIlerlemesi(-100, 800, 800)).toBe(0);
    expect(Number.isFinite(bolumIlerlemesi(-100, 800, 800))).toBe(true);
  });

  it('lastikli kaydırmada kırpılıyor', () => {
    expect(bolumIlerlemesi(200, 5000, 800)).toBe(0);
    expect(bolumIlerlemesi(-9999, 5000, 800)).toBe(1);
  });
});

describe('KRİTİK: sayaç okunabilirliği — ÖLÇÜLEREK', () => {
  /*
   * Kaynak taraması "renk şu değer" diyebilir ama o değerin OKUNABİLİR
   * olduğunu söyleyemez. Kontrast burada hesaplanıyor: kartın gerçek rengi
   * canlı kareden ölçüldü ve oranlar WCAG formülüyle çıkarılıyor.
   */
  const kanal = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const parlaklik = (rgb: readonly number[]) =>
    0.2126 * kanal(rgb[0]!) + 0.7152 * kanal(rgb[1]!) + 0.0722 * kanal(rgb[2]!);
  const hex = (h: string): number[] =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const kontrast = (a: readonly number[], b: readonly number[]) => {
    const [x, y] = [parlaklik(a), parlaklik(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  /** Koyu temada video `brightness-90` ile kısılıyor; zemin koyulaşıyor. */
  const kartKoyu = KART_RENGI.map((c) => Math.round(c * KOYU_TEMA_KISMA));

  it('formül doğru — bilinen bir çift beklenen oranı veriyor', () => {
    // Siyah üstünde beyaz 21:1 — formülün kendisi sınanmadan sonuçlara güvenilmez.
    expect(kontrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('KRİTİK: sayaç değeri AA geçiyor (iki temada da)', () => {
    const renk = hex(SAYAC_RENKLERI.deger);
    expect(kontrast(KART_RENGI, renk)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(kartKoyu, renk)).toBeGreaterThanOrEqual(4.5);
  });

  it('KRİTİK: etiket AA geçiyor — küçük büyük harfli metin 4,5:1 istiyor', () => {
    /*
     * İlk seçim `--text-muted` (#6b7280) idi ve 2,94:1 veriyordu; `#4b5563`
     * açık temada 4,59 ama koyu temadaki kısma ile 3,70'e düşüyordu. Bu test
     * ikisini de reddeder.
     */
    const renk = hex(SAYAC_RENKLERI.etiket);
    expect(kontrast(KART_RENGI, renk)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(kartKoyu, renk)).toBeGreaterThanOrEqual(4.5);
  });

  it('KRİTİK: bileşen bu renkleri GERÇEKTEN kullanıyor', () => {
    /*
     * Sabitlerin doğru olması yetmiyor — işaretlemede başka bir değer
     * yazsaydı testler yine yeşil kalırdı.
     */
    expect(BILESEN).toContain(`text-[${SAYAC_RENKLERI.deger}]`);
    expect(BILESEN).toContain(`text-[${SAYAC_RENKLERI.etiket}]`);
  });
});

describe('KRİTİK: bileşen sözleşmesi', () => {
  it('video mobilde İNDİRİLMİYOR — `src` niteliği işaretlemede yok', () => {
    /*
     * 5,3 MB'lık dosya `src` olarak yazılsaydı her ziyaretçi indirirdi.
     * Kaynak yalnızca masaüstü dalında, effect içinde veriliyor.
     */
    const etiket = BILESEN.slice(BILESEN.indexOf('<video'), BILESEN.indexOf('/>', BILESEN.indexOf('<video')));
    expect(etiket.length, 'video etiketi bulunamadı — tarama boşa düştü').toBeGreaterThan(60);
    expect(etiket).not.toContain('src=');
    expect(etiket).toContain('preload="none"');
    expect(etiket).toContain('poster=');
  });

  it('KRİTİK: `object-cover` KULLANILMIYOR', () => {
    /*
     * Kırpma, kart yüzdelerini yalan söyler hâle getirir: sayaçlar geniş
     * ekranda kartların dışına kayar. Film 16:9 kutuda kırpılmadan duruyor;
     * bedeli kenar boşluğu ve film de zemin de beyaz olduğu için görünmüyor.
     */
    expect(BILESEN).not.toContain('object-cover');
    expect(BILESEN).toContain('aspect-video');
  });

  it('KRİTİK: hareket azaltma dalı var', () => {
    expect(BILESEN).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  });

  it('KRİTİK: yapışkan sahne üst çubuğun ALTINDA', () => {
    /*
     * `SiteNav` `sticky top-0` ve `h-16`. `lg:top-16` düşerse sahne çubuğun
     * arkasına giriyor ve başlığın ilk satırı kayboluyor.
     */
    expect(BILESEN).toContain('lg:top-16');
    expect(BILESEN).toContain('lg:h-[calc(100dvh-4rem)]');
  });

  it('KRİTİK: butonlar sunucudan geliyor — istemci paketine girmiyor', () => {
    /*
     * Başlık ve butonlar `children` olarak veriliyor. Bileşenin içine
     * yazılsalardı istemci paketine girer ve LCP metni JavaScript'e bağlanırdı;
     * `page.tsx` tam olarak bunu engellemek için sıfır istemci JS taşıyordu.
     */
    expect(BILESEN).toContain('children');
    expect(BILESEN).not.toContain('Demo Talep Et');
    expect(SAYFA).toContain('Demo Talep Et');
    expect(SAYFA).toContain('Nasıl Çalışır?');
  });

  it('KRİTİK: butonlar filmin ÜSTÜNDE değil', () => {
    /*
     * Film neredeyse tamamen beyaz ve panelin kadrajdaki yeri ekrana göre
     * değişiyor; üstüne konan bir buton bazı ekranlarda kartların üstüne
     * düşer. Butonlar kendi sütununda, düz zemin üzerinde.
     */
    const i = SAYFA.indexOf('Demo Talep Et');
    const dilim = SAYFA.slice(Math.max(0, i - 700), i);
    expect(dilim).not.toContain('absolute');
    expect(dilim).not.toContain('inset-0');
  });

  it('KRİTİK: video üstündeki metin TEMAYA bağlanmıyor', () => {
    /*
     * `text-ink` koyu temada beyaza dönüyor (globals.css) ama altındaki video
     * HER ZAMAN beyaz — sayaçlar koyu temada görünmez oluyordu. Tarayıcıda
     * bakılınca görüldü ve mutasyon testinde bu iddia YOKKEN geçti; yani
     * kural korumasızdı.
     *
     * Dilim, kartları basan `map` gövdesinden çıkarılıyor: sabit uzunluklu
     * bir pencere komşu işaretlemeyi de yakalar ve iddia boşa düşer.
     */
    const bas = BILESEN.indexOf('KARTLAR.map(');
    expect(bas, 'kart döngüsü bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = BILESEN.slice(bas, BILESEN.indexOf('))}', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(300);

    expect(dilim).not.toContain('text-ink');
    expect(dilim).toContain(`text-[${SAYAC_RENKLERI.deger}]`);
    expect(dilim).toContain(`text-[${SAYAC_RENKLERI.etiket}]`);
  });

  it('KRİTİK: film kutusunun zemini de temaya bağlanmıyor', () => {
    /*
     * `bg-surface` koyu temada `#14161c`. Video yüklenene kadar 16:9 kutu
     * o rengi gösteriyor ve beyaz posterin yerinde siyah bir dikdörtgen
     * beliriyordu — sonra bir anda beyaza dönüyor.
     */
    expect(BILESEN).toContain('rounded-2xl border border-line bg-white');
    expect(BILESEN).toContain('dark:brightness-90');
  });

  it('KRİTİK: dal seçimi CANLI — tek seferlik değil', () => {
    /*
     * İlk yazımda `matchMedia` yalnızca mount anında okunuyordu: dar bir
     * pencerede yüklenip sonra genişletilen sayfa MOBİL dalında kalıyordu —
     * video hiç indirilmiyor, kaydırma filmi hiç çalışmıyor ve hiçbir hata
     * düşmüyor. Pencereyi büyütmek, tableti döndürmek, geliştirici
     * araçlarını açıp kapatmak bunu üretiyor.
     *
     * BU YOL TARAYICIDA DOĞRULANAMADI: görünüm emülasyonu `innerWidth`i
     * değiştirirken `resize` ya da `change` olayı YAYMIYOR (ölçüldü: ikisi
     * de 0). O yüzden kural burada kaynak taramasıyla kilitleniyor.
     */
    const bas = BILESEN.indexOf('const senkronla');
    expect(bas, 'senkronla bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = BILESEN.slice(bas, BILESEN.indexOf('\n    };', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(80);

    // Mod değişmediyse hiçbir şey yapılmıyor: `resize` sürükleme boyunca
    // onlarca kez ateşliyor ve her seferinde videoyu yeniden kurmak onu
    // baştan indirmek olurdu.
    expect(dilim).toContain('if (m === mevcutMod) return;');
    expect(dilim).toContain('temizle?.();');

    // Genişlik `resize`e bağlı (emülasyonda `change` yayılmayabiliyor),
    // hareket tercihi `change`e — o `resize` üretmiyor.
    expect(BILESEN).toContain("window.addEventListener('resize', senkronla)");
    expect(BILESEN).toContain("azHareket.addEventListener('change', senkronla)");
    // Sökülüyor da: sökülmezse bileşen kaldırıldıktan sonra da koşar.
    expect(BILESEN).toContain("window.removeEventListener('resize', senkronla)");
    expect(BILESEN).toContain("azHareket.removeEventListener('change', senkronla)");
  });

  it('KRİTİK: sayaçlar React durumunda TUTULMUYOR', () => {
    /*
     * Kaydırma boyunca saniyede ~60 kez değişiyorlar; her değişimde yeniden
     * render etmek kaydırmayı takıyor. Metin doğrudan DOM'a yazılıyor.
     */
    expect(BILESEN).toContain('textContent');
    expect(BILESEN).not.toContain('useState');
  });
});
