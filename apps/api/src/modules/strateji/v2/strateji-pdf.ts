import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  AMAC_OLCUTU,
  REHBER_AMACLARI,
  STRATEJI_ASAMA_ETIKETI,
  STRATEJI_BELGE_BOLUMLERI,
  STRATEJI_ONAY_CUMLESI,
  STRATEJI_KAYNAK_ETIKETI,
  TAHMIN_YOK_METNI,
  butceBol,
  tutarGoster,
  type Gerceklesen,
  type KalemTahmini,
  type RehberPlatformu,
  type StratejiBelgeVerisi,
  type StratejiBolumKodu,
  type StratejiDurumu,
  type StratejiKalemi,
} from '@advetics/shared';
import { glifVarMi, logoOku } from '../../reports/pdf-yazi-tipi';
import { halka, kisalt, MARKA, tablo, type TabloPaleti, type TabloSutunu } from '../../reports/pdf-cizim';

/**
 * ═══ STRATEJİ PDF'İ — PROFAJ KILAVUZU, ADVETICS LOGOSU ═══
 * (YENIDEN-TASARIM.md § 3, § 9.4; kullanıcı kararı K-1)
 *
 * - RENK: yalnız kılavuzun dört rengi (`MARKA`) + grinin SAYDAMLIĞI. `SLATE`
 *   bu dosyada geçmez (rapor PDF'inin dili; test tarıyor). Kırmızı yalnız
 *   vurgu: kapaktaki kısa çizgi, bölüm numarası, Google serisi.
 * - KAPAK: YALNIZ Advetics logosu (`logoOku`, rapor PDF'iyle AYNI dosya);
 *   ajansın ya da Profaj'ın logosu yok.
 * - BÖLÜMLER `STRATEJI_BELGE_BOLUMLERI` listesinden, SIRAYLA: rapor PDF'indeki
 *   `PLATFORM_SIRASI` dersi — döngünün gezmediği bölüm hata vermeden hiç
 *   çizilmez. Test PDF metnindeki başlıkları listeyle karşılaştırıyor.
 * - YAZI TİPİ: başlık ve SAYILAR Montserrat (kılavuz: "büyük sayılar
 *   Montserrat"; `₺` onda var). Gövde de Montserrat Regular — AJAN 2 SAPMASI
 *   (§ 9.7): Open Sans'ın tam TTF'i depoda ve makinede yok, indirmek
 *   kullanıcı izni istiyor. Dosya eklenince `GOVDE_DOSYASI` değişir.
 *   Bir dizgenin glifi yazı tipinde yoksa o DİZGE DejaVu ile çizilir (karar
 *   dize başına, cmap'ten); sessiz düşme yok. Dosya bulunamazsa AÇIKÇA patlar.
 * - SAF: veriyi alır, bayt döndürür; veritabanı ve HTTP yok.
 */

const EN = 595.28;
const BOY = 841.89;
const KENAR = 48;
const ALT_SINIR = KENAR + 24;
const GENISLIK = EN - 2 * KENAR;

/** `apps/api/assets/fonts` — `src` ve `dist` altında dört seviye yukarısı (pdf-yazi-tipi.ts ile aynı mantık). */
export const STRATEJI_FONT_DIZINI = resolve(__dirname, '../../../../assets/fonts');
export const BASLIK_DOSYASI = 'Montserrat-Bold.ttf';
export const SAYI_DOSYASI = 'Montserrat-Medium.ttf';
export const GOVDE_DOSYASI = 'Montserrat-Regular.ttf';
export const YEDEK_DOSYASI = 'DejaVuSans.ttf';

const onbellek = new Map<string, Buffer>();

/** Yazı tipini okur; YOKSA AÇIKÇA PATLAR (standart yazı tipine sessiz düşüş `ğ ş ı`yı kaybeder). */
export function stratejiYaziTipiOku(dosya: string, dizin = STRATEJI_FONT_DIZINI): Buffer {
  const yol = resolve(dizin, dosya);
  const m = onbellek.get(yol);
  if (m) return m;
  let veri: Buffer;
  try {
    veri = readFileSync(yol);
  } catch {
    throw new Error(`Strateji PDF yazı tipi bulunamadı: ${yol}. Dosyalar depoda (apps/api/assets/fonts); deploy sırasında düşmüş olabilir.`);
  }
  onbellek.set(yol, veri);
  return veri;
}

interface Yazi {
  font: PDFFont;
  veri: Buffer;
}

interface Ctx {
  doc: PDFDocument;
  baslik: Yazi;
  sayi: Yazi;
  govde: Yazi;
  yedek: Yazi;
  logo: PDFImage | null;
  birim: string;
  /** Kaç dizge yedek yazı tipine düştü (test ve log için; sessiz değil). */
  yedegeDusen: string[];
}

/** Dizgenin TÜM karakterleri bu yazı tipinde mi (boşluk ve satır sonu hariç). */
export function hepsiVarMi(veri: Buffer, metin: string): boolean {
  for (const ch of metin) {
    const k = ch.codePointAt(0)!;
    if (k === 0x20 || k === 0x0a) continue;
    if (!glifVarMi(veri, k)) return false;
  }
  return true;
}

/** Dize başına yazı tipi: tercih edilende glif yoksa DejaVu (kayıt düşülür). */
function sec(ctx: Ctx, y: Yazi, metin: string): PDFFont {
  if (hepsiVarMi(y.veri, metin)) return y.font;
  ctx.yedegeDusen.push(metin);
  return ctx.yedek.font;
}

const GRI = { color: MARKA.gri };
const SOLUK = { color: MARKA.gri, opacity: 0.6 };
const PALET: TabloPaleti = {
  baslik: { renk: MARKA.gri, opaklik: 0.7 },
  kural: { renk: MARKA.gri, opaklik: 0.35 },
  ayirici: { renk: MARKA.gri, opaklik: 0.12 },
  metin: { renk: MARKA.siyah },
  soluk: { renk: MARKA.gri, opaklik: 0.5 },
};

const DURUM_METNI: Record<StratejiDurumu, string> = {
  taslak: 'Taslak',
  onayda: 'Onay bekliyor',
  revizyon: 'Revizyon istendi',
  onaylandi: 'Onaylandı',
  kapandi: 'Kapandı',
  iptal: 'İptal edildi',
};

const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

export interface StratejiPdfVerisi {
  belge: StratejiBelgeVerisi;
  gerceklesen: Gerceklesen | null;
}

/** İstanbul takvimiyle `GG.AA.YYYY`. */
function tarih(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

function gun(g: string): string {
  const [y, m, d] = g.split('-');
  return `${d}.${m}.${y}`;
}

export function tahminMetni(t: KalemTahmini, amac: StratejiKalemi['amac']): string {
  if (t.tur === 'yok') return TAHMIN_YOK_METNI[t.neden];
  const birim = AMAC_OLCUTU[amac].birim;
  const tekAy = t.altSonuc === t.ustSonuc;
  return tekAy ? `${t.altSonuc} ${birim} (tek ay verisi)` : `${t.altSonuc} – ${t.ustSonuc} ${birim} (${t.aySayisi} ayın verisi)`;
}

/** Bölümün çizilip çizilmeyeceği: `gerceklesen` yalnız onaylı/kapanmış planda. */
export function bolumCizilirMi(kod: StratejiBolumKodu, durum: StratejiDurumu, gerceklesen: Gerceklesen | null): boolean {
  const b = STRATEJI_BELGE_BOLUMLERI.find((x) => x.kod === kod)!;
  if (!b.onaydanSonra) return true;
  return (durum === 'onaylandi' || durum === 'kapandi') && gerceklesen !== null;
}

export async function stratejiPdf(v: StratejiPdfVerisi): Promise<{ bayt: Buffer; yedegeDusen: string[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const p = v.belge.plan;
  doc.setTitle(`Dijital reklam stratejisi · ${p.workspaceAdi} · ${gun(p.baslangic)} – ${gun(p.bitis)}`);
  doc.setProducer('Advetics');
  const yaz = async (dosya: string): Promise<Yazi> => {
    const veri = stratejiYaziTipiOku(dosya);
    // BAĞLAMA (ligatür) KAPALI: Montserrat "fl"yi tek glife çeviriyor ve
    // ToUnicode onu tek harfe eşliyor; belgeden kopyalanan ve aranan metin
    // "Hedefer" oluyordu (testte yakalandı). Görünüş farkı yok denecek kadar az.
    return { veri, font: await doc.embedFont(veri, { subset: true, features: { liga: false, clig: false, dlig: false } }) };
  };
  let logo: PDFImage | null = null;
  const lb = logoOku();
  if (lb) {
    try {
      logo = await doc.embedPng(lb);
    } catch {
      logo = null;
    }
  }
  const ctx: Ctx = {
    doc,
    baslik: await yaz(BASLIK_DOSYASI),
    sayi: await yaz(SAYI_DOSYASI),
    govde: await yaz(GOVDE_DOSYASI),
    yedek: await yaz(YEDEK_DOSYASI),
    logo,
    birim: p.paraBirimi,
    yedegeDusen: [],
  };

  let s: PDFPage | null = null;
  let y = 0;
  let no = 0;
  for (const b of STRATEJI_BELGE_BOLUMLERI) {
    if (!bolumCizilirMi(b.kod, p.durum, v.gerceklesen)) continue;
    if (b.kod === 'kapak') {
      kapak(ctx, v.belge);
      continue;
    }
    no += 1;
    if (!s || y < ALT_SINIR + 140) {
      s = ctx.doc.addPage([EN, BOY]);
      y = BOY - KENAR;
    }
    const r = bolumBasligi(ctx, s, y, no, b.baslik);
    ({ s, y } = BOLUM_CIZICI[b.kod](ctx, s, r, v));
    y -= 18;
  }
  return { bayt: Buffer.from(await doc.save()), yedegeDusen: ctx.yedegeDusen };
}

function metinYaz(ctx: Ctx, s: PDFPage, metin: string, o: { x: number; y: number; punto: number; yazi?: Yazi; renk?: { color: typeof MARKA.gri; opacity?: number } }): void {
  const font = sec(ctx, o.yazi ?? ctx.govde, metin);
  s.drawText(metin, { x: o.x, y: o.y, size: o.punto, font, ...(o.renk ?? { color: MARKA.siyah }) });
}

/** Paragrafı sözcük sınırında satırlara böler (sığmayan tek sözcük kırpılır, görünür). */
function satirlar(ctx: Ctx, metin: string, punto: number, genislik: number): string[] {
  const out: string[] = [];
  for (const parca of metin.split('\n')) {
    let satir = '';
    for (const kelime of parca.split(/\s+/).filter(Boolean)) {
      const aday = satir ? `${satir} ${kelime}` : kelime;
      if (sec(ctx, ctx.govde, aday).widthOfTextAtSize(aday, punto) <= genislik) satir = aday;
      else {
        if (satir) out.push(satir);
        satir = kisalt(kelime, ctx.govde.font, punto, genislik);
      }
    }
    if (satir) out.push(satir);
  }
  return out;
}

function paragraf(ctx: Ctx, s: PDFPage, y: number, metin: string, punto = 10, renk?: { color: typeof MARKA.gri; opacity?: number }): { s: PDFPage; y: number } {
  for (const satir of satirlar(ctx, metin, punto, GENISLIK)) {
    if (y < ALT_SINIR) {
      s = ctx.doc.addPage([EN, BOY]);
      y = BOY - KENAR;
    }
    metinYaz(ctx, s, satir, { x: KENAR, y, punto, renk });
    y -= punto * 1.45;
  }
  return { s, y };
}

function bolumBasligi(ctx: Ctx, s: PDFPage, y: number, no: number, baslik: string): number {
  metinYaz(ctx, s, String(no).padStart(2, '0'), { x: KENAR, y, punto: 11, yazi: ctx.sayi, renk: { color: MARKA.kirmizi } });
  metinYaz(ctx, s, baslik, { x: KENAR + 26, y, punto: 15, yazi: ctx.baslik, renk: { color: MARKA.siyah } });
  s.drawLine({ start: { x: KENAR, y: y - 9 }, end: { x: EN - KENAR, y: y - 9 }, thickness: 0.8, color: MARKA.gri, opacity: 0.25 });
  return y - 30;
}

function sayfaliTablo<T>(ctx: Ctx, s: PDFPage, y: number, sutunlar: Array<TabloSutunu<T>>, satirlarListesi: T[]): { s: PDFPage; y: number } {
  let kalan = satirlarListesi;
  while (kalan.length > 0) {
    if (y < ALT_SINIR + 50) {
      s = ctx.doc.addPage([EN, BOY]);
      y = BOY - KENAR;
    }
    const r = tablo(s, {
      sutunlar,
      satirlar: kalan,
      x: KENAR,
      y,
      genislik: GENISLIK,
      altSinir: ALT_SINIR,
      normal: ctx.govde.font,
      kalin: ctx.baslik.font,
      sayiFontu: ctx.sayi.font,
      toplam: null,
      palet: PALET,
      // Hücrede glif yoksa o hücre DejaVu ile (dize başına karar, sessiz kutu yok).
      fontSec: (metin, font) => (font === ctx.baslik.font ? sec(ctx, ctx.baslik, metin) : font === ctx.sayi.font ? sec(ctx, ctx.sayi, metin) : sec(ctx, ctx.govde, metin)),
    });
    kalan = kalan.slice(r.cizilen);
    y = kalan.length > 0 ? 0 : r.y;
  }
  return { s, y: y - 8 };
}

function bolumMetni(ctx: Ctx, s: PDFPage, y: number, v: StratejiPdfVerisi, kod: StratejiBolumKodu): { s: PDFPage; y: number } {
  const m = v.belge.bolumler[kod];
  if (!m) return paragraf(ctx, s, y, 'Bu bölüm henüz yazılmadı.', 10, SOLUK);
  const r = paragraf(ctx, s, y, m.metin, 10.5);
  metinYaz(ctx, r.s, `Kaynak: ${STRATEJI_KAYNAK_ETIKETI[m.kaynak]}`, { x: KENAR, y: r.y - 2, punto: 7.5, renk: SOLUK });
  return { s: r.s, y: r.y - 16 };
}

function kapak(ctx: Ctx, b: StratejiBelgeVerisi): void {
  const s = ctx.doc.addPage([EN, BOY]);
  const p = b.plan;
  if (ctx.logo) {
    const h = Math.min(36, ctx.logo.height);
    const g = Math.min(170, ctx.logo.width * (h / ctx.logo.height));
    s.drawImage(ctx.logo, { x: KENAR, y: BOY - KENAR - h, width: g, height: h });
  }
  /*
   * ONAYLANMAMIŞ BELGEDE FİLİGRAN. Elden ele geçen bir taslağın onaylı
   * strateji sanılması, müşteriye onaylamadığı bir bütçenin
   * "kararlaştırıldı" diye gösterilmesi olurdu.
   */
  const filigran = p.durum === 'iptal' ? 'İPTAL EDİLDİ' : p.durum === 'onaylandi' || p.durum === 'kapandi' ? null : 'TASLAK';
  if (filigran) metinYaz(ctx, s, filigran, { x: KENAR, y: BOY - 250, punto: 60, yazi: ctx.baslik, renk: { color: MARKA.gri, opacity: 0.12 } });
  s.drawRectangle({ x: KENAR, y: BOY - 318, width: 56, height: 4, color: MARKA.kirmizi });
  metinYaz(ctx, s, 'Dijital Reklam Stratejisi', { x: KENAR, y: BOY - 350, punto: 28, yazi: ctx.baslik, renk: { color: MARKA.siyah } });
  metinYaz(ctx, s, kisalt(p.workspaceAdi, ctx.baslik.font, 17, GENISLIK), { x: KENAR, y: BOY - 380, punto: 17, yazi: ctx.baslik, renk: GRI });
  metinYaz(ctx, s, `${gun(p.baslangic)} – ${gun(p.bitis)}`, { x: KENAR, y: BOY - 404, punto: 13, yazi: ctx.sayi, renk: GRI });
  const satir = [
    `Durum: ${DURUM_METNI[p.durum]} · Sürüm ${p.surum}`,
    `Toplam bütçe: ${tutarGoster(BigInt(p.toplamButceMicros), ctx.birim)}`,
    p.onay ? onayCumlesi(p.onay) : null,
    p.hazirlayan ? `Hazırlayan: ${p.hazirlayan}` : null,
  ].filter((x): x is string => x !== null);
  let y = BOY - 446;
  for (const m of satir) {
    metinYaz(ctx, s, kisalt(m, ctx.govde.font, 10.5, GENISLIK), { x: KENAR, y, punto: 10.5, renk: GRI });
    y -= 17;
  }
}

/** Onay cümlesi: üç rol AYRI cümle; bağlantıyla onay bir BEYAN (doğrulanmış kimlik değil). */
export function onayCumlesi(o: NonNullable<StratejiBelgeVerisi['plan']['onay']>): string {
  const kim = o.rol === 'baglanti' ? [o.ad, o.eposta ? `(${o.eposta})` : null].filter(Boolean).join(' ') : o.kim;
  return `${STRATEJI_ONAY_CUMLESI[o.rol]}${kim ? ` · ${kim}` : ''} · ${tarih(o.zaman)} · sürüm ${o.surum}`;
}

function kalemAdi(k: StratejiKalemi): string {
  return `${k.sira}. ${REHBER_AMACLARI[k.amac].ekranAdi}`;
}

function platformlar(k: StratejiKalemi): string {
  const acik = [k.meta && 'Meta', k.google && 'Google'].filter(Boolean).join(' + ');
  return k.metaPayi !== null ? `${acik} (Meta %${k.metaPayi})` : acik;
}

function paylar(k: StratejiKalemi, birim: string): Record<RehberPlatformu, bigint> {
  const b = butceBol(BigInt(k.butceMicros), { meta: k.meta, google: k.google }, k.metaPayi ?? 50, birim);
  return { meta: b.meta, google: b.google };
}

type Cizici = (ctx: Ctx, s: PDFPage, y: number, v: StratejiPdfVerisi) => { s: PDFPage; y: number };

const BOLUM_CIZICI: Record<StratejiBolumKodu, Cizici> = {
  kapak: (_c, s, y) => ({ s, y }),
  ozet: (ctx, s, y, v) => {
    const r = bolumMetni(ctx, s, y, v, 'ozet');
    const toplam = tutarGoster(BigInt(v.belge.plan.toplamButceMicros), ctx.birim);
    const tahminli = v.belge.kalemler.some((k) => k.tahmin.meta.tur === 'aralik' || k.tahmin.google.tur === 'aralik');
    const kutular: Array<[string, string]> = [
      ['Toplam bütçe', toplam],
      ['Dönem', `${gun(v.belge.plan.baslangic)} – ${gun(v.belge.plan.bitis)}`],
      ['Kampanya', String(v.belge.kalemler.length)],
      ['Beklenen sonuç', tahminli ? 'Kampanyalar bölümünde' : 'Tahmin yok'],
    ];
    const g = (GENISLIK - 18) / 4;
    kutular.forEach(([e, d], i) => {
      const x = KENAR + i * (g + 6);
      r.s.drawRectangle({ x, y: r.y - 46, width: g, height: 50, borderColor: MARKA.gri, borderOpacity: 0.3, borderWidth: 0.8 });
      metinYaz(ctx, r.s, e.toLocaleUpperCase('tr'), { x: x + 8, y: r.y - 10, punto: 7, yazi: ctx.baslik, renk: SOLUK });
      metinYaz(ctx, r.s, kisalt(d, ctx.sayi.font, 10.5, g - 14), { x: x + 8, y: r.y - 32, punto: 10.5, yazi: ctx.sayi });
    });
    return { s: r.s, y: r.y - 60 };
  },
  isletme: (ctx, s, y, v) => {
    const r = bolumMetni(ctx, s, y, v, 'isletme');
    return sayfaliTablo(ctx, r.s, r.y, [
      { baslik: 'Bilgi', pay: 1, deger: (x: { etiket: string; deger: string | null }) => x.etiket },
      { baslik: 'Marka Merkezi', pay: 3, deger: (x) => x.deger ?? 'Marka Merkezi’nde boş' },
    ], v.belge.isletme);
  },
  gecmis: (ctx, s, y, v) => {
    const g = v.belge.gecmis;
    if (g.satirlar.length === 0) return paragraf(ctx, s, y, g.bosNedeni ?? 'Veri yok.', 10, SOLUK);
    const r = paragraf(ctx, s, y, `Son ${g.gun} gün. Meta ve Google sonuçları farklı tanım ve atıf penceresiyle sayıldığı için toplanmaz.`, 9, SOLUK);
    return sayfaliTablo(ctx, r.s, r.y - 4, [
      { baslik: 'Platform', pay: 1, deger: (x: (typeof g.satirlar)[number]) => PLATFORM_ADI[x.platform] },
      { baslik: 'Amaç', pay: 2.4, deger: (x) => x.etiket },
      { baslik: 'Harcama', pay: 1.6, sag: true, deger: (x) => tutarGoster(BigInt(x.harcamaMicros), ctx.birim) },
      { baslik: 'Sonuç', pay: 1.6, sag: true, deger: (x) => (x.sonuc === null ? '—' : `${x.sonuc.toLocaleString('tr-TR')} ${x.birim}`) },
    ], g.satirlar);
  },
  hedefler: (ctx, s, y, v) =>
    sayfaliTablo(ctx, s, y, [
      { baslik: 'Kampanya', pay: 2, deger: (k: StratejiKalemi) => kalemAdi(k) },
      { baslik: 'Ölçüt', pay: 1.3, deger: (k) => AMAC_OLCUTU[k.amac].birim },
      { baslik: 'Meta', pay: 2.2, deger: (k) => (k.meta ? tahminMetni(k.tahmin.meta, k.amac) : '—') },
      { baslik: 'Google', pay: 2.2, deger: (k) => (k.google ? tahminMetni(k.tahmin.google, k.amac) : '—') },
    ], v.belge.kalemler),
  butce: (ctx, s, y, v) => {
    const top: Record<RehberPlatformu, bigint> = { meta: 0n, google: 0n };
    for (const k of v.belge.kalemler) {
      const p = paylar(k, ctx.birim);
      top.meta += p.meta;
      top.google += p.google;
    }
    // Bütçe micros'u toplamak doğru (aynı para birimi); SONUÇ toplanmaz.
    const toplam = top.meta + top.google;
    if (toplam > 0n) {
      halka(s, {
        cx: KENAR + 50,
        cy: y - 50,
        disR: 44,
        icR: 26,
        dilimler: [
          { oran: Number((top.meta * 1000n) / toplam) / 1000, renk: MARKA.gri },
          { oran: Number((top.google * 1000n) / toplam) / 1000, renk: MARKA.kirmizi },
        ],
      });
      metinYaz(ctx, s, `Meta ${tutarGoster(top.meta, ctx.birim)}`, { x: KENAR + 120, y: y - 40, punto: 10, yazi: ctx.sayi, renk: GRI });
      metinYaz(ctx, s, `Google ${tutarGoster(top.google, ctx.birim)}`, { x: KENAR + 120, y: y - 58, punto: 10, yazi: ctx.sayi, renk: { color: MARKA.kirmizi } });
      y -= 112;
    }
    return sayfaliTablo(ctx, s, y, [
      { baslik: 'Aşama', pay: 1.2, deger: (k: StratejiKalemi) => STRATEJI_ASAMA_ETIKETI[k.asama] },
      { baslik: 'Kampanya', pay: 2.2, deger: (k) => kalemAdi(k) },
      { baslik: 'Meta', pay: 1.4, sag: true, deger: (k) => (k.meta ? tutarGoster(paylar(k, ctx.birim).meta, ctx.birim) : '—') },
      { baslik: 'Google', pay: 1.4, sag: true, deger: (k) => (k.google ? tutarGoster(paylar(k, ctx.birim).google, ctx.birim) : '—') },
    ], v.belge.kalemler);
  },
  kampanyalar: (ctx, s, y, v) => {
    let r = { s, y };
    if (v.belge.kalemler.length === 0) return paragraf(ctx, s, y, 'Bu stratejide kampanya yok.', 10, SOLUK);
    for (const k of v.belge.kalemler) {
      if (r.y < ALT_SINIR + 120) r = { s: ctx.doc.addPage([EN, BOY]), y: BOY - KENAR };
      metinYaz(ctx, r.s, kalemAdi(k), { x: KENAR, y: r.y, punto: 12, yazi: ctx.baslik });
      r.y -= 18;
      const bilgi = [
        `Platformlar: ${platformlar(k)}`,
        `Bütçe: ${tutarGoster(BigInt(k.butceMicros), ctx.birim)} · ${gun(k.baslangic)} – ${gun(k.bitis)}`,
        `Bölge: ${k.konumlar.map((x) => x.etiket).join(', ') || '—'}${k.yasMin !== null ? ` · Yaş ${k.yasMin}–${k.yasMax === 65 ? '65+' : k.yasMax}` : ''}`,
        k.kelimeGrubu ? `Arama kelimeleri: ${k.kelimeGrubu}` : null,
        k.kreatifYonergesi ? `Kreatif: ${k.kreatifYonergesi.metin}` : null,
        k.metin?.basliklar.length ? `Örnek başlıklar: ${k.metin.basliklar.slice(0, 3).join(' · ')}` : null,
      ].filter((x): x is string => x !== null);
      for (const b of bilgi) r = paragraf(ctx, r.s, r.y, b, 9.5);
      r.y -= 10;
    }
    return r;
  },
  kitle: (ctx, s, y, v) => {
    const r = bolumMetni(ctx, s, y, v, 'kitle');
    const bolgeler = [...new Set(v.belge.kalemler.flatMap((k) => k.konumlar.map((x) => x.etiket)))];
    return paragraf(ctx, r.s, r.y, `Bölgeler: ${bolgeler.join(', ') || '—'}. Kitle tarifi kreatife yön verir; reklamın hedeflemesi bölge ve yaştır.`, 9.5, GRI);
  },
  kreatif: (ctx, s, y, v) => {
    let r = bolumMetni(ctx, s, y, v, 'kreatif');
    for (const k of v.belge.kalemler) {
      if (!k.kreatifYonergesi) continue;
      r = paragraf(ctx, r.s, r.y, `${kalemAdi(k)}: ${k.kreatifYonergesi.metin}`, 9.5);
    }
    return r;
  },
  takvim: (ctx, s, y, v) =>
    sayfaliTablo(ctx, s, y, [
      { baslik: 'Kampanya', pay: 3, deger: (k: StratejiKalemi) => kalemAdi(k) },
      { baslik: 'Başlangıç', pay: 1.2, sag: true, deger: (k) => gun(k.baslangic) },
      { baslik: 'Bitiş', pay: 1.2, sag: true, deger: (k) => gun(k.bitis) },
    ], v.belge.kalemler),
  olcum: (ctx, s, y, v) => {
    if (v.belge.olcum.length === 0) return paragraf(ctx, s, y, 'Ölçüm durumu kaydedilmedi.', 10, SOLUK);
    const DURUM = { hazir: 'Hazır', kurulmali: 'Kurulmalı', bilinmiyor: 'Bilinmiyor' } as const;
    return sayfaliTablo(ctx, s, y, [
      { baslik: 'Sonuç', pay: 3.4, deger: (x: (typeof v.belge.olcum)[number]) => x.etiket },
      { baslik: 'Platform', pay: 1, deger: (x) => (x.platform ? PLATFORM_ADI[x.platform] : '—') },
      { baslik: 'Durum', pay: 1, deger: (x) => DURUM[x.durum] },
    ], v.belge.olcum);
  },
  riskler: (ctx, s, y, v) => {
    if (v.belge.riskler.length === 0) return paragraf(ctx, s, y, 'Kayıt anında kural tablosunda risk çıkmadı.', 10, SOLUK);
    let r = { s, y };
    for (const x of v.belge.riskler) r = paragraf(ctx, r.s, r.y, `• ${x.kalem !== null ? `Kampanya ${x.kalem}: ` : ''}${x.metin}`, 9.5);
    return r;
  },
  onay: (ctx, s, y, v) => {
    const p = v.belge.plan;
    const metin = p.onay
      ? onayCumlesi(p.onay)
      : p.durum === 'onayda'
        ? 'Onay bekleniyor. Bu belgeyi panelden ya da size gönderilen onay bağlantısından onaylayabilir veya revizyon isteyebilirsiniz.'
        : p.durum === 'revizyon'
          ? `Revizyon istendi${p.revizyonNotu ? `: ${p.revizyonNotu}` : '.'}`
          : 'Henüz onaya gönderilmedi.';
    return paragraf(ctx, s, y, metin, 10.5);
  },
  gerceklesen: (ctx, s, y, v) => {
    const g = v.gerceklesen!;
    const satir: Array<{ k: StratejiKalemi; p: RehberPlatformu; d: NonNullable<Gerceklesen['kalemler'][number]['platformlar']['meta']> }> = [];
    for (const k of v.belge.kalemler) {
      const x = g.kalemler.find((z) => z.kalemId === k.id);
      for (const p of ['meta', 'google'] as const) {
        const d = x?.platformlar[p];
        if (d) satir.push({ k, p, d });
      }
    }
    if (satir.length === 0) return paragraf(ctx, s, y, 'Henüz AdvCampaign’e aktarılan kampanya yok.', 10, SOLUK);
    return sayfaliTablo(ctx, s, y, [
      { baslik: 'Kampanya', pay: 2.2, deger: (x: (typeof satir)[number]) => kalemAdi(x.k) },
      { baslik: 'Platform', pay: 0.9, deger: (x) => PLATFORM_ADI[x.p] },
      { baslik: 'Plan', pay: 1.3, sag: true, deger: (x) => tutarGoster(BigInt(x.d.planMicros), ctx.birim) },
      { baslik: 'Harcanan', pay: 1.3, sag: true, deger: (x) => tutarGoster(BigInt(x.d.harcananMicros), ctx.birim) },
      { baslik: 'Sonuç', pay: 1.3, sag: true, deger: (x) => (x.d.sonuc === null ? '—' : `${x.d.sonuc.toLocaleString('tr-TR')} ${AMAC_OLCUTU[x.k.amac].birim}`) },
    ], satir);
  },
};

/** PDF dosya adı: ASCII, başlık enjeksiyonuna kapalı; sürüm ve taslak adında. */
export function stratejiDosyaAdi(slug: string, baslangic: string, surum: number, durum: StratejiDurumu): string {
  const temiz = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  const taslak = durum === 'onaylandi' || durum === 'kapandi' ? '' : '-taslak';
  return `strateji-${temiz}-${baslangic}-s${surum}${taslak}.pdf`;
}
