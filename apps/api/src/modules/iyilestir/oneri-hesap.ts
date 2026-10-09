import { createHash } from 'node:crypto';
import {
  BUTCE_ADIMI_EN_FAZLA,
  YORGUNLUK,
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  kanonikJson,
  type Oneri,
  type OneriEylemi,
  type OneriKaniti,
  type OneriSeviyesi,
  type OneriTuru,
  type Platform,
} from '@advetics/shared';

/**
 * ═══ ÖNERİ HESABI — SAF FONKSİYONLAR (MIMARI § 2) ═══
 *
 * Veritabanı yok, saat yok: girdi satırları ve "bugün" parametre. Eşik
 * hataları SESSİZ (yanlış eşik ya her reklamı yorgun ilan eder ya hiçbirini)
 * ve sınır değerleri ancak böyle, tek tek sınanabiliyor.
 *
 * Eşik sayıları sözleşmeden (`YORGUNLUK`, `BUTCE_ADIMI_EN_FAZLA`). Bütçe
 * eşikleri (kullanım %90 / %30, CPA %70, en az 5 dönüşüm) sözleşmede YOK,
 * MIMARI § 2 tablosunda; burada tek sabitte duruyorlar ki üretici ve testi
 * aynı sayıyı okusun.
 */
export const BUTCE_ESIKLERI = {
  /** Son 7 günde bütçenin en az bu oranı harcanıyorsa bütçe darboğaz olabilir. */
  artirKullanimEnAz: 0.9,
  /** Dönüşüm başı maliyet workspace ortalamasının en fazla bu katı. */
  artirCpaOraniEnFazla: 0.7,
  /** Az dönüşümde maliyet oranı gürültü. */
  artirDonusumEnAz: 5,
  /** Bütçenin bu oranından azı harcanıyorsa bütçe boşta duruyor. */
  azaltKullanimAlti: 0.3,
  /** Azaltılan bütçe son 7 günün en yüksek günlük harcamasının bu katı. */
  azaltPayi: 1.2,
  /** Pencere (gün); bugün dâhil değil (eksik gün). */
  pencereGun: 7,
} as const;

const MIKRO = 1_000_000n;

// ─── Anahtar, özet, hafta ────────────────────────────────────────────────

/** ISO-8601 hafta: `2026-W41`. Yılın ilk perşembesi kuralı. */
export function isoHafta(gun: string): string {
  const d = new Date(`${gun}T00:00:00Z`);
  const haftaGunu = (d.getUTCDay() + 6) % 7; // pazartesi 0
  d.setUTCDate(d.getUTCDate() - haftaGunu + 3); // o haftanın perşembesi
  const yil = d.getUTCFullYear();
  const ilkPersembe = new Date(Date.UTC(yil, 0, 4));
  const fark = (d.getTime() - ilkPersembe.getTime()) / 86_400_000;
  const hafta = 1 + Math.round((fark - 3 + ((ilkPersembe.getUTCDay() + 6) % 7)) / 7);
  return `${yil}-W${String(hafta).padStart(2, '0')}`;
}

/** Kararlı anahtar `tur:seviye:varlıkId:ISO-hafta` (MIMARI § 2). */
export function oneriAnahtari(tur: OneriTuru, seviye: OneriSeviyesi, id: string, hafta: string): string {
  return `${tur}:${seviye}:${id}:${hafta}`;
}

/**
 * ONAY ÖZETİ — eylem + hedef, kanonik JSON'un sha256'sı. Kanıtlar ve metin
 * DIŞARIDA: harcama her saat değişir ve kart açıkken yenilenen bir rakam
 * "öneri değişti" demek olmamalı. Değişen BÜTÇE ise eylemin içinde
 * (`oncekiMikros`) ve özeti değiştiriyor: başkası bütçeyi değiştirdiyse eski
 * değerle uygulanmıyor.
 */
export function oneriOzeti(
  eylem: OneriEylemi | null,
  hedef: { platform: Platform; seviye: OneriSeviyesi; id: string },
): string {
  return createHash('sha256').update(kanonikJson({ eylem, hedef })).digest('hex');
}

export function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Pencereler: "bu hafta" dün dâhil son 7 gün, "geçen hafta" ondan önceki 7.
 * Bugün DIŞARIDA: gün kapanmadı, eksik veri "düştü" diye okunurdu.
 */
export function pencereler(bugun: string): { buBas: string; buSon: string; gecenBas: string; gecenSon: string } {
  const g = YORGUNLUK.pencereGun;
  return {
    buSon: gunEkle(bugun, -1),
    buBas: gunEkle(bugun, -g),
    gecenSon: gunEkle(bugun, -g - 1),
    gecenBas: gunEkle(bugun, -2 * g),
  };
}

// ─── Kreatif yorgunluğu ──────────────────────────────────────────────────

export interface GunlukReklamSatiri {
  gun: string;
  gosterim: number;
  tiklama: number;
  erisim: number;
  harcamaMikros: bigint;
}

export interface YorgunlukGirdisi {
  clientId: string;
  clientAdi: string;
  adId: string;
  adAdi: string;
  setAdi: string | null;
  platform: Platform;
  paraBirimi: string;
  /** Aynı reklam setinde YAYINDAKİ reklam sayısı (bu dâhil). */
  setteYayindaki: number;
  gunler: GunlukReklamSatiri[];
}

interface Toplam {
  gosterim: number;
  tiklama: number;
  erisim: number;
  harcama: bigint;
}

function topla(satirlar: GunlukReklamSatiri[], bas: string, son: string): Toplam {
  const t: Toplam = { gosterim: 0, tiklama: 0, erisim: 0, harcama: 0n };
  for (const s of satirlar) {
    if (s.gun < bas || s.gun > son) continue;
    t.gosterim += s.gosterim;
    t.tiklama += s.tiklama;
    t.erisim += s.erisim;
    t.harcama += s.harcamaMikros;
  }
  return t;
}

/**
 * GÜNLÜK sıklık, haftanın gösterim ağırlıklı ortalaması: Σgösterim ÷ Σgünlük
 * erişim. "Haftalık sıklık" DEĞİL ve öyle yazılmıyor: günlük erişimler
 * toplanamaz (aynı kişi her gün sayılıyor), haftalık tekil erişim tabloda
 * yok (MIMARI § 1).
 */
function gunlukSiklik(t: Toplam): number | null {
  return t.erisim > 0 ? t.gosterim / t.erisim : null;
}

export function yorgunlukOnerisi(g: YorgunlukGirdisi, bugun: string): Oneri | null {
  // v1 YALNIZ META: Google ve LinkedIn'de reklam seviyesinde erişim gelmiyor
  // (ölçüm: 0 satır) ve sıklık hesaplanamıyor. Ekranda söyleniyor.
  if (g.platform !== 'meta') return null;
  const p = pencereler(bugun);
  const bu = topla(g.gunler, p.buBas, p.buSon);
  const gecen = topla(g.gunler, p.gecenBas, p.gecenSon);
  if (bu.gosterim < YORGUNLUK.enAzGosterim || gecen.gosterim < YORGUNLUK.enAzGosterim) return null;
  if (gecen.tiklama <= 0) return null;
  // ORAN TAM SAYIYLA: (ctrBu / ctrGecen) <= 0,7 ⇔ tıkBu·gösGeçen·100 <=
  // 70·gösBu·tıkGeçen. Kayan noktada 0,07 / 0,1 = 0,7000000000000001 ve
  // TAM sınırdaki reklam sessizce dışarıda kalıyordu.
  const pay = bu.tiklama * gecen.gosterim * 100;
  const payda = Math.round(YORGUNLUK.ctrOraniEnFazla * 100) * bu.gosterim * gecen.tiklama;
  if (pay > payda) return null;
  const ctrBu = bu.tiklama / bu.gosterim;
  const ctrGecen = gecen.tiklama / gecen.gosterim;
  const oran = ctrBu / ctrGecen;
  const siklikBu = gunlukSiklik(bu);
  const siklikGecen = gunlukSiklik(gecen);
  // Sıklık bilinmiyorsa "arttı" denemez: tahmin etmektense öneri yok.
  if (siklikBu === null || siklikGecen === null) return null;
  if (YORGUNLUK.siklikArtmali && !(siklikBu > siklikGecen)) return null;

  const dusus = Math.round((1 - oran) * 100);
  const tek = g.setteYayindaki <= 1;
  const kanitlar: OneriKaniti[] = [
    { etiket: 'Tıklama oranı', once: formatPercent(ctrGecen * 100), simdi: formatPercent(ctrBu * 100), yon: 'kotu' },
    { etiket: 'Günlük sıklık', once: formatDecimal(siklikGecen), simdi: formatDecimal(siklikBu), yon: 'kotu' },
    { etiket: 'Gösterim', once: formatNumber(gecen.gosterim), simdi: formatNumber(bu.gosterim), yon: 'notr' },
  ];
  const eylem: OneriEylemi = { tur: 'durdur' };
  const seri = gunlukSeri(g.gunler, p.gecenBas, p.buSon);
  return {
    anahtar: oneriAnahtari('kreatif_yorgunlugu', 'ad', g.adId, isoHafta(bugun)),
    tur: 'kreatif_yorgunlugu',
    platform: g.platform,
    clientId: g.clientId,
    clientAdi: g.clientAdi,
    varlik: { seviye: 'ad', id: g.adId, ad: g.adAdi, ustAd: g.setAdi },
    baslik: `"${g.adAdi}" reklamı yoruldu`,
    neden:
      `Tıklama oranı bir haftada %${dusus} düştü ve reklam aynı kişilere daha sık gösteriliyor.` +
      (tek
        ? ' Bu, reklam setindeki tek yayındaki reklam: durdurursan set yayın yapmaz. Önce AdvCampaign ile yeni kreatif hazırla.'
        : ''),
    kanitlar,
    seri: {
      adlar: ['Tıklama oranı (%)', 'Günlük sıklık'],
      a: seri.map((s) => (s.gosterim > 0 ? Math.round((s.tiklama / s.gosterim) * 10_000) / 100 : 0)),
      b: seri.map((s) => (s.erisim > 0 ? Math.round((s.gosterim / s.erisim) * 100) / 100 : 0)),
    },
    harcamaMikros: bu.harcama.toString(),
    paraBirimi: g.paraBirimi,
    eylem,
    kisit: null,
    durum: 'acik',
    uygulama: null,
    ozet: oneriOzeti(eylem, { platform: g.platform, seviye: 'ad', id: g.adId }),
  };
}

/** Eksik günler SIFIRLA dolduruluyor: grafikte gün atlamak eğimi yalan gösterir. */
function gunlukSeri(satirlar: GunlukReklamSatiri[], bas: string, son: string): GunlukReklamSatiri[] {
  const harita = new Map(satirlar.map((s) => [s.gun, s]));
  const out: GunlukReklamSatiri[] = [];
  for (let d = bas; d <= son; d = gunEkle(d, 1)) {
    out.push(harita.get(d) ?? { gun: d, gosterim: 0, tiklama: 0, erisim: 0, harcamaMikros: 0n });
  }
  return out;
}

// ─── Bütçe ───────────────────────────────────────────────────────────────

export interface ButceGirdisi {
  clientId: string;
  clientAdi: string;
  seviye: 'campaign' | 'ad_group';
  id: string;
  ad: string;
  ustAd: string | null;
  platform: Platform;
  adAccountId: string;
  paraBirimi: string;
  /** Yalnız GÜNLÜK bütçe; toplam bütçeli varlık bu üreticiye gelmiyor. */
  gunlukButceMikros: bigint;
  /** Pencere içindeki günler (eksik gün = sıfır harcama). */
  gunler: Array<{ gun: string; harcamaMikros: bigint; donusum: number }>;
  /** Son 30 günde ilk veri günü; pencereden yeniyse varlık 7 gündür yayında değil. */
  ilkVeriGunu: string | null;
  /** Google bütçesi başka kampanyalarla paylaşılıyorsa yazılamaz (MIMARI § 2). */
  paylasimliButce: boolean;
}

/**
 * Aylık bütçe kapısı (Planla › Aylık Bütçe, `budgets.pacing`). `null` =
 * bu hesap için tanımlı bir sınır YOK (öneri serbest); "okunamadı" ayrı bir
 * hâl ve çağıran o durumda hiç artırma önerisi üretmiyor.
 */
export interface AylikButceKapisi {
  /** Ay sonuna kadar bu hızla gidilirse harcanacak (micros). */
  projeksiyonMikros: bigint;
  butceMikros: bigint;
  /** Bugün dâhil kalan gün. */
  kalanGun: number;
  etiket: string;
}

/** Bütçe adımı sınırı (kullanıcı kararı: tek öneride en fazla %20). */
export function adimSinirIcinde(onceki: bigint, yeni: bigint): boolean {
  if (onceki <= 0n || yeni <= 0n) return false;
  const fark = yeni > onceki ? yeni - onceki : onceki - yeni;
  // Tam sayı aritmetiğiyle: fark / önceki <= 0.2  ⇔  fark * 100 <= önceki * 20.
  return fark * 100n <= onceki * BigInt(Math.round(BUTCE_ADIMI_EN_FAZLA * 100));
}

function asagiYuvarla(m: bigint): bigint {
  return (m / MIKRO) * MIKRO;
}
function yukariYuvarla(m: bigint): bigint {
  return ((m + MIKRO - 1n) / MIKRO) * MIKRO;
}

export interface ButceBaglami {
  bugun: string;
  /** Workspace'in son 7 günlük dönüşüm başı maliyeti, PARA BİRİMİ başına (micros). */
  ortalamaCpa: Map<string, bigint>;
  /**
   * Aylık bütçe kapıları: hesap bütçesi ve (aynı para birimindeyse) workspace
   * bütçesi. `undefined` = pacing okunamadı → artırma önerisi YOK.
   */
  kapilar: AylikButceKapisi[] | undefined;
}

export function butceOnerisi(g: ButceGirdisi, b: ButceBaglami): Oneri | null {
  if (g.gunlukButceMikros <= 0n) return null;
  const p = pencereler(b.bugun);
  // Varlık penceredeki ilk günden ÖNCE de veri üretmiş olmalı: 3 gündür
  // yayında olan bir kampanyanın düşük kullanımı "bütçe boşta" demek değil.
  if (!g.ilkVeriGunu || g.ilkVeriGunu > p.buBas) return null;
  const pencere = g.gunler.filter((x) => x.gun >= p.buBas && x.gun <= p.buSon);
  const harcama = pencere.reduce((t, x) => t + x.harcamaMikros, 0n);
  const donusum = pencere.reduce((t, x) => t + x.donusum, 0);
  const enYuksek = pencere.reduce((m, x) => (x.harcamaMikros > m ? x.harcamaMikros : m), 0n);
  const gun = BigInt(BUTCE_ESIKLERI.pencereGun);
  const kullanim = Number((harcama * 10_000n) / (g.gunlukButceMikros * gun)) / 10_000;
  // Eşik karşılaştırması TAM SAYIYLA (yuvarlanmış `kullanim` yalnız ekran için).
  const yuzde = (oran: number) => g.gunlukButceMikros * gun * BigInt(Math.round(oran * 100));
  const harcamaYuzle = harcama * 100n;

  const hedef = { platform: g.platform, seviye: g.seviye, id: g.id } as const;
  const ortak = {
    platform: g.platform,
    clientId: g.clientId,
    clientAdi: g.clientAdi,
    varlik: { seviye: g.seviye, id: g.id, ad: g.ad, ustAd: g.ustAd },
    harcamaMikros: harcama.toString(),
    paraBirimi: g.paraBirimi,
    durum: 'acik' as const,
    uygulama: null,
    seri: {
      adlar: ['Günlük harcama', 'Günlük bütçe'] as [string, string],
      a: tamGunler(pencere, p.buBas, p.buSon).map((x) => Number(x) / 1e6),
      b: Array.from({ length: BUTCE_ESIKLERI.pencereGun }, () => Number(g.gunlukButceMikros) / 1e6),
    },
  };
  const para = (m: bigint) => formatMoney(m.toString(), g.paraBirimi);
  const kullanimKaniti = (yon: OneriKaniti['yon']): OneriKaniti => ({
    etiket: 'Bütçe kullanımı (7 gün)',
    once: null,
    simdi: formatPercent(kullanim * 100, 0),
    yon,
  });

  // ── ARTIR ──
  if (harcamaYuzle >= yuzde(BUTCE_ESIKLERI.artirKullanimEnAz) && donusum >= BUTCE_ESIKLERI.artirDonusumEnAz) {
    const ort = b.ortalamaCpa.get(g.paraBirimi);
    const cpa = (harcama * 10_000n) / BigInt(Math.round(donusum * 10_000));
    if (!ort || ort <= 0n) return null;
    // cpa <= ort × 0.7, tam sayıyla.
    if (cpa * 100n > ort * BigInt(Math.round(BUTCE_ESIKLERI.artirCpaOraniEnFazla * 100))) return null;
    // Aylık bütçe okunamadıysa SIĞIP SIĞMADIĞI bilinmiyor: öneri yok.
    if (b.kapilar === undefined) return null;
    const yeni = asagiYuvarla((g.gunlukButceMikros * BigInt(100 + Math.round(BUTCE_ADIMI_EN_FAZLA * 100))) / 100n);
    if (yeni <= g.gunlukButceMikros || !adimSinirIcinde(g.gunlukButceMikros, yeni)) return null;
    const fark = yeni - g.gunlukButceMikros;
    for (const k of b.kapilar) {
      if (k.projeksiyonMikros + fark * BigInt(Math.max(0, k.kalanGun)) > k.butceMikros) return null;
    }
    if (g.paylasimliButce) return paylasimliKart(g, ortak, hedef, kullanimKaniti('iyi'), b.bugun);
    const eylem: OneriEylemi = {
      tur: 'butce',
      butceSeviyesi: g.seviye,
      butceTipi: 'daily',
      oncekiMikros: g.gunlukButceMikros.toString(),
      yeniMikros: yeni.toString(),
    };
    return {
      ...ortak,
      anahtar: oneriAnahtari('butce_artir', g.seviye, g.id, isoHafta(b.bugun)),
      tur: 'butce_artir',
      baslik: `"${g.ad}" bütçesini artır`,
      neden: 'Bütçenin neredeyse tamamı harcanıyor ve dönüşüm maliyeti workspace ortalamasının belirgin altında.',
      kanitlar: [
        kullanimKaniti('iyi'),
        { etiket: 'Dönüşüm başı maliyet', once: para(ort), simdi: para(cpa), yon: 'iyi' },
        { etiket: 'Dönüşüm (7 gün)', once: null, simdi: formatDecimal(donusum, 0), yon: 'notr' },
        { etiket: 'Günlük bütçe', once: para(g.gunlukButceMikros), simdi: para(yeni), yon: 'notr' },
        ...b.kapilar.map((k) => ({ etiket: k.etiket, once: null, simdi: `${para(k.projeksiyonMikros + fark * BigInt(Math.max(0, k.kalanGun)))} / ${para(k.butceMikros)}`, yon: 'notr' as const })),
      ],
      eylem,
      kisit: null,
      ozet: oneriOzeti(eylem, hedef),
    };
  }

  // ── AZALT ──
  if (harcamaYuzle < yuzde(BUTCE_ESIKLERI.azaltKullanimAlti)) {
    // Hiç harcamayan varlık bütçe değil teslim sorunu: bütçeyi kısmak
    // sebebi gizler.
    if (harcama <= 0n) return null;
    const payli = (enYuksek * BigInt(Math.round(BUTCE_ESIKLERI.azaltPayi * 100))) / 100n;
    const taban = (g.gunlukButceMikros * BigInt(100 - Math.round(BUTCE_ADIMI_EN_FAZLA * 100))) / 100n;
    const yeni = yukariYuvarla(payli > taban ? payli : taban);
    if (yeni >= g.gunlukButceMikros || !adimSinirIcinde(g.gunlukButceMikros, yeni)) return null;
    if (g.paylasimliButce) return paylasimliKart(g, ortak, hedef, kullanimKaniti('kotu'), b.bugun);
    const eylem: OneriEylemi = {
      tur: 'butce',
      butceSeviyesi: g.seviye,
      butceTipi: 'daily',
      oncekiMikros: g.gunlukButceMikros.toString(),
      yeniMikros: yeni.toString(),
    };
    return {
      ...ortak,
      anahtar: oneriAnahtari('butce_azalt', g.seviye, g.id, isoHafta(b.bugun)),
      tur: 'butce_azalt',
      baslik: `"${g.ad}" bütçesini düşür`,
      neden: 'Son 7 günde bütçenin küçük bir kısmı harcandı; kullanılmayan bütçe başka yerde iş görebilir.',
      kanitlar: [
        kullanimKaniti('kotu'),
        { etiket: 'En yüksek günlük harcama', once: null, simdi: para(enYuksek), yon: 'notr' },
        { etiket: 'Günlük bütçe', once: para(g.gunlukButceMikros), simdi: para(yeni), yon: 'notr' },
      ],
      eylem,
      kisit: null,
      ozet: oneriOzeti(eylem, hedef),
    };
  }
  return null;
}

/**
 * PAYLAŞIMLI GOOGLE BÜTÇESİ: bilgi kartı, eylem YOK. Yazmak öneride adı
 * geçmeyen kampanyaların da bütçesini değiştirirdi.
 */
function paylasimliKart(
  g: ButceGirdisi,
  ortak: Omit<Oneri, 'anahtar' | 'tur' | 'baslik' | 'neden' | 'kanitlar' | 'eylem' | 'kisit' | 'ozet'>,
  hedef: { platform: Platform; seviye: OneriSeviyesi; id: string },
  kanit: OneriKaniti,
  bugun: string,
): Oneri {
  const tur: OneriTuru = kanit.yon === 'iyi' ? 'butce_artir' : 'butce_azalt';
  return {
    ...ortak,
    anahtar: oneriAnahtari(tur, g.seviye, g.id, isoHafta(bugun)),
    tur,
    baslik: `"${g.ad}" bütçesi`,
    neden: tur === 'butce_artir' ? 'Bütçe darboğaz görünüyor.' : 'Bütçenin küçük bir kısmı harcanıyor.',
    kanitlar: [kanit],
    eylem: null,
    kisit: 'Bütçe başka kampanyalarla paylaşılıyor; değiştirmek onları da etkiler. Google Ads’te elle karar ver.',
    ozet: oneriOzeti(null, hedef),
  };
}

function tamGunler(satirlar: Array<{ gun: string; harcamaMikros: bigint }>, bas: string, son: string): bigint[] {
  const h = new Map(satirlar.map((x) => [x.gun, x.harcamaMikros]));
  const out: bigint[] = [];
  for (let d = bas; d <= son; d = gunEkle(d, 1)) out.push(h.get(d) ?? 0n);
  return out;
}
