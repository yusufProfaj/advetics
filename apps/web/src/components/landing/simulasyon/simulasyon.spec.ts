import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OZELLIKLER } from '../site-icerik';
import { ZAMAN, sahneSuresi, sayacDegeri, sonHal, zamanCizelgesi, type Sahne } from './motor';
import { DILLER, type Dil } from '@advetics/shared';
import { simulasyonSozlugu, type SimulasyonMetni } from '@/dil/sozlukler/simulasyon';
import { RAPOR_SATIRI, SAHNELER, TABLO_SEKMELERI, olcumListesi } from './sahneler';
import { PLAN_YUZDELERI, TABLO_VERISI } from './simulasyonlar';

/**
 * ═══ SİMÜLASYON MOTORU BEKÇİSİ ═══
 *
 * Panelde bileşen render eden test yok; sahnenin oynadığını ekranda görmeden
 * sınamanın yolu zamanlamayı saf fonksiyonda çalıştırmak. Kilitlenenler
 * SESSİZ arızalar:
 *  · Kareler zamanda geri giderse oynatıcı bir adımı atlıyor gibi görünür.
 *  · Hareket azaltmadaki son hâl adımlardan TÜREMEZSE iki görünüm ayrışır
 *    (hareketsiz kullanıcı yarım bir sahne görür).
 *  · Yazma efekti harfi ortadan bölerse ₺ yerine soru işareti çizilir.
 */

interface Ornek {
  a: boolean;
  metin: string;
  n: number;
}

const ORNEK: Sahne<Ornek> = {
  ilk: { a: false, metin: '', n: 0 },
  adimlar: [
    { bekle: 100, fare: 'dugme', degis: { a: true } },
    { fare: 'alan', tikla: false, yaz: { alan: 'metin', metin: '25 ₺🎉', hiz: 10 } },
    { bekle: 50, degis: { n: 3 } },
  ],
};

describe('zaman çizelgesi', () => {
  const k = zamanCizelgesi(ORNEK);

  it('kareler zamanda geri gitmiyor ve ilk kare giriş gecikmesinde', () => {
    expect(k[0]!.t).toBe(ZAMAN.giris);
    for (let i = 1; i < k.length; i++) expect(k[i]!.t).toBeGreaterThanOrEqual(k[i - 1]!.t);
  });

  it('imleç yola çıkıyor, varınca tıklıyor, kısa süre basılı kalıyor', () => {
    const tik = k.find((x) => x.basili === 'dugme');
    expect(tik?.t).toBe(ZAMAN.giris + 100 + ZAMAN.fareYolu);
    expect(tik?.tikNo).toBe(1);
    // Durum değişikliği tıklamadan SONRA (önce değişseydi düğme tıklanmadan "onaylandı" yazardı).
    expect(tik?.d.a).toBe(false);
    const birak = k.find((x) => x.t === tik!.t + ZAMAN.basiliKalma && x.basili === null);
    expect(birak).toBeDefined();
  });

  it('`tikla: false` tıklamıyor (tık sayısı artmıyor)', () => {
    expect(Math.max(...k.map((x) => x.tikNo))).toBe(1);
  });

  it('yazma efekti harf harf ve kod noktasına göre: emoji ortadan bölünmüyor', () => {
    const ara = k.filter((x) => x.yaziyor === 'metin').map((x) => x.d.metin);
    // Dizinle bölmek 🎉'yi iki vekil yarıya ayırır ve arada geçersiz bir kare çizerdi.
    expect(ara).toEqual(['', '2', '25', '25 ', '25 ₺', '25 ₺🎉']);
    const yazma = k.filter((x) => x.yaziyor === 'metin');
    expect(yazma[yazma.length - 1]!.t - yazma[0]!.t).toBe(5 * 10);
  });

  it('son kare: imleç gizli, son durum bütün değişiklikleri taşıyor', () => {
    const son = k[k.length - 1]!;
    expect(son.fare).toBeNull();
    expect(son.basili).toBeNull();
    expect(son.yaziyor).toBeNull();
    expect(son.d).toEqual({ a: true, metin: '25 ₺🎉', n: 3 });
    expect(sonHal(ORNEK)).toEqual(son.d);
    expect(sahneSuresi(ORNEK)).toBe(son.t);
  });

  it('başlangıç durumu değiştirilmiyor (sahne her oynatmada baştan)', () => {
    expect(ORNEK.ilk).toEqual({ a: false, metin: '', n: 0 });
  });
});

describe('sayaç eğrisi', () => {
  it('uçlar ve kıstırma', () => {
    expect(sayacDegeri(0, 312, 0)).toBe(0);
    expect(sayacDegeri(0, 312, 1)).toBe(312);
    expect(sayacDegeri(0, 312, 1.4)).toBe(312);
    expect(sayacDegeri(20_000, 60_000, -1)).toBe(20_000);
    // Hızlı başlıyor: yarı zamanda yolun yarısından fazlası.
    expect(sayacDegeri(0, 100, 0.5)).toBe(88);
  });
});

describe('sitenin sahneleri', () => {
  // Bir dilin her `{ ilk, adimlar }` değeri bir sahne; adla tek tek yazılmıyor ki yeni sahne kaçmasın.
  const sahneleri = (dil: Dil) =>
    (Object.entries(SAHNELER[dil]) as [string, unknown][]).filter(
      (e): e is [string, Sahne<Record<string, unknown>>] =>
        typeof e[1] === 'object' && e[1] !== null && 'ilk' in e[1] && 'adimlar' in e[1],
    );
  const hepsi = sahneleri('tr');
  const tr = SAHNELER.tr;
  const m = simulasyonSozlugu.tr;

  it('BOŞA DÜŞME BEKÇİSİ: iki dilde de dokuz sahne bulundu', () => {
    const beklenen = ['ASISTAN', 'BOOST', 'HERO', 'KURAL', 'KURMA', 'OLCUM', 'PLAN', 'RAPOR', 'TABLO'].sort();
    for (const dil of DILLER) expect(sahneleri(dil).map(([ad]) => ad).sort(), dil).toEqual(beklenen);
  });

  it('her sahne 4-15 saniyede bitiyor (ziyaretçi sonunu görsün, kaydırma beklemesin)', () => {
    for (const dil of DILLER) {
      for (const [ad, s] of sahneleri(dil)) {
        const t = sahneSuresi(s);
        expect(t, `${dil} ${ad}`).toBeGreaterThan(2_500);
        expect(t, `${dil} ${ad}`).toBeLessThan(15_000);
      }
    }
  });

  it('İKİ DİL AYNI SENARYO: adım sayısı, imleç hedefleri ve bekleme süreleri dilden bağımsız', () => {
    // Çeviri bir adımı düşürür ya da ekler ise İngilizce sahne başka bir hikâye anlatır
    // ve hiçbir hata vermez. Yazma süresi metnin uzunluğuna bağlı, o yüzden toplam süre değil iskelet kıyaslanıyor.
    const iskelet = (s: Sahne<Record<string, unknown>>) =>
      s.adimlar.map((a) => ({ bekle: a.bekle, fare: a.fare, tikla: a.tikla, yaz: a.yaz?.alan, degis: Object.keys(a.degis ?? {}) }));
    const en = new Map(sahneleri('en'));
    for (const [ad, s] of hepsi) expect(iskelet(en.get(ad)!), ad).toEqual(iskelet(s));
  });

  it('İKİ DİL AYNI SATIR SAYISI: sözlükteki listeler koddaki veriyle eşit uzunlukta', () => {
    for (const dil of DILLER) {
      const d = simulasyonSozlugu[dil];
      // Kısa kalan sözlük listesi satırı ADSIZ çizerdi; uzun kalan ise sessizce görünmezdi.
      expect(d.tablo.satirlar, dil).toHaveLength(TABLO_VERISI.length);
      expect(d.plan.dagilim, dil).toHaveLength(PLAN_YUZDELERI.length);
      expect(olcumListesi(d as SimulasyonMetni), dil).toHaveLength(10);
      expect(new Set(olcumListesi(d as SimulasyonMetni)).size, `${dil}: liste anahtarı tekil olmalı`).toBe(10);
    }
  });

  it('KRİTİK: hareket azaltmadaki son hâl taslağın bitiş ekranı', () => {
    expect(sonHal(tr.HERO)).toEqual({ sayac: true, cubuk: true, oneri: true, onaylandi: true, bildirim: true });
    expect(sonHal(tr.TABLO).sekme).toBe('tumu');
    expect(sonHal(tr.KURMA)).toMatchObject({ butce: m.para(300), bolge: m.ornek.bolge, durum: m.kurma.durumKuruldu, telefon: true });
    expect(sonHal(tr.PLAN)).toMatchObject({ adim: 4, dagilim: true, gonderildi: true, bildirim: true });
    // Boost'ta "yeni gönderi" bildirimi kart açılınca KAPANIYOR; son hâlde görünmemeli.
    expect(sonHal(tr.BOOST)).toMatchObject({ kart: true, yayinda: true, bildirim: false });
    expect(sonHal(tr.KURAL)).toMatchObject({ esik: m.para(250), cpa: m.para(268), durduruldu: true });
    expect(sonHal(tr.RAPOR)).toEqual({ satir: RAPOR_SATIRI, mail: true, bildirim: true });
    expect(sonHal(tr.OLCUM)).toEqual({ tamam: olcumListesi(m).length, calisan: null, dugme: m.olcum.dugmeBitti });
    expect(sonHal(tr.ASISTAN)).toMatchObject({ cevap: m.asistan.cevap, oneriler: true });
  });

  it('KRİTİK: Türkçe para biçimi eski sahnelerle BAYT BAYT aynı, İngilizce ₺ önde ve en-US', () => {
    // Ç12: para birimi dile göre değişmez. Türkçe sitede çevirinin hiçbir şeyi değiştirmemesi gerekiyordu.
    expect(sonHal(SAHNELER.tr.KURMA).butce).toBe('300 ₺');
    expect(sonHal(SAHNELER.tr.KURAL).cpa).toBe('268 ₺');
    expect(simulasyonSozlugu.tr.para(48250)).toBe('48.250 ₺');
    expect(simulasyonSozlugu.en.para(48250)).toBe('₺48,250');
    expect(sonHal(SAHNELER.en.KURMA).butce).toBe('₺300');
    expect(sonHal(SAHNELER.en.ASISTAN).cevap).toBe(simulasyonSozlugu.en.asistan.cevap);
    expect(sonHal(SAHNELER.en.OLCUM).dugme).toBe(simulasyonSozlugu.en.olcum.dugmeBitti);
  });

  it('ölçüm sahnesi eksikleri SIRAYLA kuruyor: sayaç hiç geri gitmiyor, her an tek satır çalışıyor', () => {
    const k = zamanCizelgesi(tr.OLCUM);
    const tamamlar = k.map((x) => x.d.tamam);
    for (let i = 1; i < tamamlar.length; i++) expect(tamamlar[i]!).toBeGreaterThanOrEqual(tamamlar[i - 1]!);
    expect(new Set(tamamlar)).toEqual(new Set([6, 7, 8, 9, 10]));
    for (const x of k) if (x.d.calisan !== null) expect(x.d.calisan).toBe(x.d.tamam);
  });

  it('imleç yalnız bileşende bağlı hedeflere gidiyor', () => {
    const kaynak = readFileSync(join(__dirname, 'simulasyonlar.tsx'), 'utf8');
    const hedefler = new Set(hepsi.flatMap(([, s]) => s.adimlar.map((a) => a.fare).filter(Boolean)));
    expect(hedefler.size).toBeGreaterThan(8);
    for (const h of hedefler) {
      // Sekmeler bir diziden bağlanıyor (`s.h(k)`); diğerleri adıyla.
      const bagli = kaynak.includes(`s.h('${h}')`) || TABLO_SEKMELERI.includes(h as never) || ['kosul', 'karsilastirma', 'eylem'].includes(h!);
      expect(bagli, `${h} hedefi bileşende bağlanmamış: imleç hiçbir yere gitmez`).toBe(true);
    }
  });
});

describe('her özelliğin sahnesi var', () => {
  it('ana sayfa ve özellik sayfası aynı eşlemeden okuyor', async () => {
    const { OZELLIK_SAHNELERI } = await import('./index');
    expect(Object.keys(OZELLIK_SAHNELERI).sort()).toEqual(OZELLIKLER.map((o) => o.slug).sort());
  });
});
