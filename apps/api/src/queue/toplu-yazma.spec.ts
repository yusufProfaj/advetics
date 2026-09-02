import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  GUVENLI_PARAMETRE,
  PARAMETRE_SINIRI,
  parcalaVeTemizle,
  topluUpsert,
} from './toplu-yazma';

/**
 * ═══ ÜRETİMDE İKİ KEZ PATLAYAN HATA SINIFI ═══
 *
 * Kaşkaloğlu Göz Hastanesi'nde aynı anda dört iş birden düştü:
 *   · yapı taraması    → too many bind variables … received 84093
 *   · arama terimleri  → too many bind variables … received 123615
 *   · anahtar kelime   → ON CONFLICT … cannot affect row a second time
 *   · kırılımlar       → ON CONFLICT … cannot affect row a second time
 *
 * Bedeli yalnızca o dört iş değildi: yapı düşünce kampanya satırı oluşmuyor
 * ve BÜTÜN metrik işleri "yapı taraması hiç koşmadı" deyip düşüyor.
 * Kullanıcının gördüğü şey "yeni müşteride hiç veri gelmiyor" oluyor.
 */

describe('parcalaVeTemizle — bağlı parametre sınırı', () => {
  /** Satır başına 18 parametreli gerçekçi bir demet. */
  const demet = (n: number) =>
    Prisma.sql`(${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n})`;

  it('KRİTİK: hiçbir parça Postgres sınırını aşmıyor', () => {
    /*
     * Üretimde düşen sayı 123.615'ti. Burada ondan büyük bir küme
     * kuruyoruz ki sınır GERÇEKTEN zorlansın.
     */
    const satirlar = Array.from({ length: 9000 }, (_, i) => i);
    const { parcalar } = parcalaVeTemizle({
      satirlar,
      anahtar: (n) => String(n),
      deger: demet,
    });

    expect(parcalar.length).toBeGreaterThan(1);
    for (const p of parcalar) {
      expect(p.values.length).toBeLessThanOrEqual(GUVENLI_PARAMETRE);
      expect(p.values.length).toBeLessThan(PARAMETRE_SINIRI);
    }
  });

  it('KRİTİK: HİÇBİR SATIR KAYBOLMUYOR — parçalar toplamı girdiye eşit', () => {
    // Bölme yaparken bir satırı atlamak, sessizce eksik veri demek.
    const satirlar = Array.from({ length: 5000 }, (_, i) => i);
    const { parcalar } = parcalaVeTemizle({
      satirlar,
      anahtar: (n) => String(n),
      deger: demet,
    });
    const toplamParametre = parcalar.reduce((a, p) => a + p.values.length, 0);
    expect(toplamParametre).toBe(5000 * 18);
  });

  it('küçük küme TEK parçada kalıyor — gereksiz bölme yok', () => {
    const { parcalar } = parcalaVeTemizle({
      satirlar: [1, 2, 3],
      anahtar: (n) => String(n),
      deger: demet,
    });
    expect(parcalar).toHaveLength(1);
  });

  it('boş girdi hiç sorgu üretmiyor', () => {
    const { parcalar, mukerrer } = parcalaVeTemizle({
      satirlar: [],
      anahtar: String,
      deger: demet,
    });
    expect(parcalar).toEqual([]);
    expect(mukerrer).toBe(0);
  });

  it('parça boyu SATIR BAŞINA PARAMETREYE göre değişiyor — sabit değil', () => {
    /*
     * Sabit bir satır sayısı (ör. "1000") yazmak, 40 kolonlu bir tabloda
     * sınırı yine aşardı. Boy, demetin GERÇEK parametre sayısından
     * hesaplanıyor.
     */
    const dar = parcalaVeTemizle({
      satirlar: Array.from({ length: 40_000 }, (_, i) => i),
      anahtar: String,
      deger: (n) => Prisma.sql`(${n})`,
    });
    const genis = parcalaVeTemizle({
      satirlar: Array.from({ length: 40_000 }, (_, i) => i),
      anahtar: String,
      deger: demet,
    });
    // Dar demet (1 param) çok daha az parçaya bölünmeli.
    expect(dar.parcalar.length).toBeLessThan(genis.parcalar.length);
  });
});

describe('parcalaVeTemizle — mükerrer satır', () => {
  const demet = (r: { k: string; v: number }) => Prisma.sql`(${r.k}, ${r.v})`;

  it('KRİTİK: aynı çakışma anahtarından iki satır TEKE iniyor', () => {
    /*
     * Postgres aynı komutta aynı satırı iki kez güncellemeyi reddediyor ve
     * KOMUTUN TAMAMINI düşürüyor — binlerce satır iki mükerrer yüzünden
     * kayboluyor.
     */
    const { parcalar, mukerrer } = parcalaVeTemizle({
      satirlar: [
        { k: 'a', v: 1 },
        { k: 'b', v: 2 },
        { k: 'a', v: 3 },
      ],
      anahtar: (r) => r.k,
      deger: demet,
    });
    expect(mukerrer).toBe(1);
    expect(parcalar).toHaveLength(1);
    expect(parcalar[0]!.values).toHaveLength(4); // 2 satır × 2 parametre
  });

  it('SON GELEN KAZANIYOR — sırayla iki upsert yapılsaydı çıkacak sonuç', () => {
    const { parcalar } = parcalaVeTemizle({
      satirlar: [
        { k: 'a', v: 1 },
        { k: 'a', v: 99 },
      ],
      anahtar: (r) => r.k,
      deger: demet,
    });
    expect(parcalar[0]!.values).toEqual(['a', 99]);
  });

  it('mükerrer yoksa sayaç sıfır — uydurma rapor yok', () => {
    const { mukerrer } = parcalaVeTemizle({
      satirlar: [
        { k: 'a', v: 1 },
        { k: 'b', v: 2 },
      ],
      anahtar: (r) => r.k,
      deger: demet,
    });
    expect(mukerrer).toBe(0);
  });
});

describe('topluUpsert', () => {
  it('her parçayı yazıyor ve etkilenen satırı topluyor', async () => {
    const cagrilar: number[] = [];
    const sonuc = await topluUpsert({
      satirlar: Array.from({ length: 5000 }, (_, i) => i),
      anahtar: String,
      deger: (n) => Prisma.sql`(${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n}, ${n})`,
      yaz: async (v) => {
        cagrilar.push(v.values.length);
        return v.values.length / 8;
      },
    });
    expect(cagrilar.length).toBeGreaterThan(1);
    expect(sonuc.yazilan).toBe(5000);
    expect(sonuc.parca).toBe(cagrilar.length);
  });
});

/**
 * ═══ BEKÇİ: DÜZELTME ALTI SERVİSTE DE DURMALI ═══
 *
 * Bu hata sınıfı `insights-sync` içinde bir kez düzeltildi ve diğer BEŞ
 * serviste aynen durmaya devam etti — üretimde patlayana kadar. Nokta
 * düzeltme, bu kod tabanının en bilinen tuzağı ("aynı şeyi üreten ikinci
 * fonksiyon") ve buradaki karşılığı "aynı hatayı taşıyan altı fonksiyon".
 *
 * Tarama, senkronizasyon servislerinde CHUNK'SIZ toplu insert kalmadığını
 * kontrol ediyor.
 */
describe('kaynak taraması — chunk’sız toplu insert kalmadı', () => {
  const KUYRUK = __dirname;

  /** Toplu yazma yapan servisler — dosya adından değil, İÇERİKTEN bulunuyor. */
  function topluYazanServisler(): Array<{ ad: string; kaynak: string }> {
    return readdirSync(KUYRUK)
      .filter((f) => f.endsWith('.service.ts'))
      .map((ad) => ({ ad, kaynak: readFileSync(join(KUYRUK, ad), 'utf8') }))
      .filter((f) => /INSERT INTO/i.test(f.kaynak) && /VALUES \$\{/.test(f.kaynak));
  }

  it('tarama BOŞA DÜŞMÜYOR — toplu yazan servisler bulunuyor', () => {
    /*
     * Bu iddia olmadan aşağıdaki test sıfır dosyada koşar ve HER ZAMAN
     * geçerdi. CLAUDE.md: "Tarama BOŞA DÜŞEBİLİR … dilim bulunamazsa HATA
     * FIRLAT."
     */
    const servisler = topluYazanServisler();
    expect(servisler.length).toBeGreaterThanOrEqual(5);
  });

  it('KRİTİK: hiçbir servis Prisma.join(values) ile doğrudan yazmıyor', () => {
    /*
     * `Prisma.join(values)` demek "elimdeki BÜTÜN satırları tek sorguya
     * koy" demek — yani sınırın hesabın büyüklüğüne bırakılması.
     * Doğru yol `topluUpsert` / `parcalaVeTemizle`.
     */
    const suclular = topluYazanServisler()
      .filter((f) => /Prisma\.join\(\s*values/.test(f.kaynak))
      .map((f) => f.ad);
    expect(suclular).toEqual([]);
  });

  it('KRİTİK: toplu yazan her servis paylaşılan yardımcıyı kullanıyor', () => {
    const kullanmayanlar = topluYazanServisler()
      .filter((f) => !/toplu-yazma/.test(f.kaynak))
      .map((f) => f.ad);
    expect(kullanmayanlar).toEqual([]);
  });
});
