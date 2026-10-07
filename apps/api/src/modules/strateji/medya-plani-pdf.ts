import { PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  HUNI_ETIKETLERI,
  NIYET_KATALOGU,
  tutarGoster,
  type DagilimSatiri,
  type KelimeSatiri,
  type MatrisSatiri,
  type PlanDetayi,
  type PlanDurumu,
} from '@advetics/shared';
import { logoOku, yaziTipiOku } from '../reports/pdf-yazi-tipi';
import { kisalt, SLATE, tablo, type TabloSutunu } from '../reports/pdf-cizim';
import { DIGER_GRUBU } from './kelime-tekil';

/**
 * ═══ MEDYA PLANI PDF'İ (MIMARI § 6.3) ═══
 *
 * RAPOR PDF'İNİN ALTYAPISI, İKİNCİ BİR KOPYASI DEĞİL: gömülü DejaVu
 * (`yaziTipiOku`: yoksa AÇIKÇA patlar, standart yazı tipi `ğ ş ı`yı
 * basamıyor), tek tablo çizici (`pdf-cizim.ts#tablo`), depodaki Advetics
 * logosu (`logoOku`; yoksa kapak sadeleşir, belge yine üretilir). Görsel dil
 * paneldeki raporunki: beyaz zemin, ince slate kurallar.
 *
 * SAF: plan verisini alır, bayt döndürür. Veritabanı ve HTTP yok; testte
 * doğrudan çağrılıp metni okunabiliyor (`metinler()` deseni).
 *
 * GÖRSEL GÖMÜLMÜYOR (bu tur): matris satırında görsellerin ADLARI var. Varlık
 * dosyasını diskten okuyup gömmek ayrı bir iş (boyut, biçim: pdf-lib yalnız
 * JPEG/PNG).
 */

/** A4, punto cinsinden — rapor PDF'iyle aynı. */
const EN = 595.28;
const BOY = 841.89;
const KENAR = 40;
const ALT_SINIR = KENAR + 20;

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const DURUM_METNI: Record<PlanDurumu, string> = {
  taslak: 'Taslak',
  onayda: 'Onay bekliyor',
  onaylandi: 'Onaylandı',
  aktarildi: 'AdvCampaign’e aktarıldı',
  iptal: 'İptal edildi',
};

export interface MedyaPlaniVerisi {
  /** Workspace (müşteri) adı. */
  workspace: string;
  detay: PlanDetayi;
}

/** `2026-11` → `Kasım 2026`. Date'e çevrilmiyor (saat dilimi kayması). */
export function donemAdi(donem: string): string {
  const [y, m] = donem.split('-');
  return `${AYLAR[Number(m) - 1] ?? m} ${y}`;
}

/** Onay tarihi İstanbul takvimiyle; sunucunun saat dilimi belgeyi değiştirmemeli. */
function tarih(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

/**
 * Onay satırı. "Müşteri onayladı" ile "ajans müşteri adına onayladı" AYNI
 * belge değil (PlanOzeti.onaylayan): kapak ikisini ayrı cümleyle yazıyor.
 */
export function onayMetni(d: PlanDetayi): string | null {
  const o = d.plan.onaylayan;
  if (!o) return d.plan.durum === 'onayda' ? 'Müşteri hesabı onayı bekleniyor.' : null;
  const kim = o.rol === 'musteri' ? 'Müşteri hesabı onayladı' : 'Ajans onayladı';
  return `${kim} · ${tarih(o.zaman)}`;
}

interface Ctx {
  doc: PDFDocument;
  normal: PDFFont;
  kalin: PDFFont;
  logo: PDFImage | null;
  birim: string;
}

export async function medyaPlaniPdf(v: MedyaPlaniVerisi): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Medya planı · ${v.workspace} · ${donemAdi(v.detay.plan.donem)}`);
  doc.setProducer('Advetics');
  const normal = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
  const kalin = await doc.embedFont(yaziTipiOku('bold'), { subset: true });
  let logo: PDFImage | null = null;
  const bayt = logoOku();
  if (bayt) {
    try {
      logo = await doc.embedPng(bayt);
    } catch {
      logo = null;
    }
  }
  const ctx: Ctx = { doc, normal, kalin, logo, birim: v.detay.plan.paraBirimi };

  kapak(ctx, v);
  let s = yeniSayfa(ctx);
  let y = BOY - KENAR;
  ({ s, y } = dagilimBolumu(ctx, s, y, v.detay));
  ({ s, y } = matrisBolumu(ctx, s, y, v.detay.matris));
  kelimeBolumu(ctx, s, y, v.detay.kelimeler.satirlar);

  return Buffer.from(await doc.save());
}

function yeniSayfa(ctx: Ctx): PDFPage {
  return ctx.doc.addPage([EN, BOY]);
}

function kapak(ctx: Ctx, v: MedyaPlaniVerisi): void {
  const s = yeniSayfa(ctx);
  const p = v.detay.plan;
  if (ctx.logo) {
    const h = Math.min(40, ctx.logo.height);
    const g = ctx.logo.width * (h / ctx.logo.height);
    s.drawImage(ctx.logo, { x: EN - KENAR - Math.min(180, g), y: BOY - KENAR - 40, width: Math.min(180, g), height: h });
  }
  /*
   * TASLAK BÜYÜK HARFLE. Sözleşme taslağın da indirilmesine izin veriyor
   * (ajans iç değerlendirme için ister); ama elden ele geçen bir belgenin
   * onaylı plan sanılması, müşteriye hiç onaylamadığı bir bütçenin
   * "kararlaştırıldı" diye gösterilmesi olurdu.
   */
  if (p.durum === 'taslak') {
    s.drawText('TASLAK', { x: KENAR, y: BOY - 210, size: 64, font: ctx.kalin, color: SLATE.s300 });
  }
  if (p.durum === 'iptal') {
    s.drawText('İPTAL EDİLDİ', { x: KENAR, y: BOY - 210, size: 44, font: ctx.kalin, color: SLATE.s300 });
  }
  s.drawText('MEDYA PLANI', { x: KENAR, y: BOY - 300, size: 30, font: ctx.kalin, color: SLATE.s900 });
  s.drawText(kisalt(v.workspace, ctx.kalin, 17, EN - 2 * KENAR), { x: KENAR, y: BOY - 330, size: 17, font: ctx.kalin, color: SLATE.s700 });
  s.drawText(donemAdi(p.donem), { x: KENAR, y: BOY - 356, size: 13, font: ctx.normal, color: SLATE.s600 });

  const satirlar = [
    `Durum: ${DURUM_METNI[p.durum]} · Sürüm ${p.surum}`,
    `Toplam bütçe: ${tutarGoster(BigInt(p.toplamButceMicros), ctx.birim)}`,
    onayMetni(v.detay),
    // Onaylanan sürüm: ileride aynı planın başka bir sürümüyle karıştırılmasın.
    p.onaylayan ? `Onaylanan sürüm: ${p.surum}` : null,
  ].filter((x): x is string => x !== null);
  let y = BOY - 400;
  for (const metin of satirlar) {
    s.drawText(kisalt(metin, ctx.normal, 10.5, EN - 2 * KENAR), { x: KENAR, y, size: 10.5, font: ctx.normal, color: SLATE.s700 });
    y -= 17;
  }
  if (p.not) {
    s.drawText(kisalt(`Not: ${p.not}`, ctx.normal, 9.5, EN - 2 * KENAR), { x: KENAR, y: y - 6, size: 9.5, font: ctx.normal, color: SLATE.s500 });
  }
  s.drawRectangle({ x: KENAR, y: KENAR + 40, width: 68, height: 4, color: SLATE.s900 });
}

function baslik(ctx: Ctx, s: PDFPage, y: number, metin: string): number {
  s.drawText(metin, { x: KENAR, y, size: 14, font: ctx.kalin, color: SLATE.s900 });
  return y - 26;
}

/**
 * Tabloyu SAYFALARA BÖLEREK çizer. `tablo()` sığmayan satırı çizmiyor ve
 * kaç satır çizdiğini döndürüyor; kalanı yeni sayfada sürmek çağıranın işi.
 * Burada yapılmasaydı uzun bir matris ya da kelime listesi SESSİZCE kesilirdi
 * (müşteriye giden belgede eksik satır, hata yok).
 */
function sayfaliTablo<T>(
  ctx: Ctx,
  s: PDFPage,
  y: number,
  sutunlar: Array<TabloSutunu<T>>,
  satirlar: T[],
): { s: PDFPage; y: number } {
  let kalan = satirlar;
  while (kalan.length > 0) {
    if (y < ALT_SINIR + 60) {
      s = yeniSayfa(ctx);
      y = BOY - KENAR;
    }
    const r = tablo(s, {
      sutunlar,
      satirlar: kalan,
      x: KENAR,
      y,
      genislik: EN - 2 * KENAR,
      altSinir: ALT_SINIR,
      normal: ctx.normal,
      kalin: ctx.kalin,
      toplam: null,
    });
    kalan = kalan.slice(r.cizilen);
    // Hiç satır sığmadıysa bir sonraki tur yeni sayfa açsın (sonsuz döngü yok).
    y = kalan.length > 0 ? 0 : r.y;
  }
  return { s, y: y - 18 };
}

/**
 * TOPLAM SATIRI tablodan AYRI çiziliyor: `tablo()`nun toplamı, tablo
 * sayfaya bölündüğünde ara sayfaya düşebilirdi ve ara sayfada yazan bir
 * "toplam" o sayfanın değil bütün tablonun sayısı olduğu için yanlış okunur.
 * Değer son (tutar) sütununa, sağa yaslı.
 */
function toplamSatiri(ctx: Ctx, s: PDFPage, y: number, deger: string): number {
  s.drawLine({ start: { x: KENAR, y: y + 22 }, end: { x: EN - KENAR, y: y + 22 }, thickness: 1.6, color: SLATE.s300 });
  s.drawText('TOPLAM', { x: KENAR, y: y + 8, size: 7.5, font: ctx.kalin, color: SLATE.s500 });
  const g = ctx.kalin.widthOfTextAtSize(deger, 8.5);
  s.drawText(deger, { x: EN - KENAR - g, y: y + 8, size: 8.5, font: ctx.kalin, color: SLATE.s900 });
  return y - 14;
}

const platformAdi = (p: string) => (p === 'meta' ? 'Meta' : 'Google');

function dagilimBolumu(ctx: Ctx, s: PDFPage, y: number, d: PlanDetayi): { s: PDFPage; y: number } {
  y = baslik(ctx, s, y, 'Bütçe dağılımı');
  if (d.dagilim.length === 0) {
    s.drawText('Dağılım henüz yazılmadı.', { x: KENAR, y, size: 9.5, font: ctx.normal, color: SLATE.s500 });
    return { s, y: y - 30 };
  }
  const para = (m: string) => tutarGoster(BigInt(m), ctx.birim);
  const sutunlar: Array<TabloSutunu<DagilimSatiri>> = [
    { baslik: 'Platform', pay: 1.2, deger: (r) => platformAdi(r.platform) },
    { baslik: 'Kitle katmanı', pay: 2, deger: (r) => HUNI_ETIKETLERI[r.katman] },
    { baslik: 'Kaynak', pay: 1.4, deger: (r) => (r.kaynak === 'gecmis_veri' ? 'Geçmiş veriden' : 'Elle') },
    // Para sütunu GENİŞ: kırpılmış bir tutar yanlış sayı göstermekle aynı şey.
    { baslik: 'Tutar', pay: 2, sag: true, kalinDeger: true, deger: (r) => para(r.tutarMicros) },
  ];
  const toplam = d.dagilim.reduce((a, r) => a + BigInt(r.tutarMicros), 0n);
  ({ s, y } = sayfaliTablo(ctx, s, y, sutunlar, d.dagilim));
  if (y < ALT_SINIR) {
    s = yeniSayfa(ctx);
    y = BOY - KENAR - 30;
  }
  y = toplamSatiri(ctx, s, y, para(toplam.toString()));
  const kalan = BigInt(d.plan.toplamButceMicros) - toplam;
  // Dağıtılmamış kısım SÖYLENİR: toplamdan az dağılım geçerli ama görünmezse
  // müşteri bütçenin tamamının harcanacağını sanır.
  if (kalan > 0n) {
    s.drawText(`Dağıtılmamış: ${para(kalan.toString())}`, { x: KENAR, y, size: 9.5, font: ctx.normal, color: SLATE.s600 });
    y -= 24;
  }
  return { s, y: y - 10 };
}

function matrisBolumu(ctx: Ctx, s: PDFPage, y: number, matris: MatrisSatiri[]): { s: PDFPage; y: number } {
  if (y < ALT_SINIR + 120) {
    s = yeniSayfa(ctx);
    y = BOY - KENAR;
  }
  y = baslik(ctx, s, y, 'Kitle ve kreatif');
  if (matris.length === 0) {
    s.drawText('Matris henüz yazılmadı.', { x: KENAR, y, size: 9.5, font: ctx.normal, color: SLATE.s500 });
    return { s, y: y - 30 };
  }
  const sutunlar: Array<TabloSutunu<MatrisSatiri>> = [
    { baslik: 'Platform', pay: 1, deger: (r) => platformAdi(r.platform) },
    { baslik: 'Amaç', pay: 2, deger: (r) => NIYET_KATALOGU[r.niyet].ekranAdi },
    {
      baslik: 'Kitle',
      pay: 2.2,
      // Meta'da kitle zorunlu: null yalnız SİLİNMİŞ demek. Google aramada kitle
      // kelimeden gelir; orada kelime grubu yazılır.
      deger: (r) =>
        r.kitle?.ad ??
        (r.platform === 'meta' ? 'Silinmiş kitle' : r.kelimeGrubu ? `Kelime grubu: ${r.kelimeGrubu}` : '—'),
    },
    { baslik: 'Görseller', pay: 2.4, deger: (r) => (r.varliklar.length ? r.varliklar.map((v) => v.ad ?? 'silinmiş görsel').join(', ') : '—') },
    { baslik: 'Tutar', pay: 1.8, sag: true, kalinDeger: true, deger: (r) => tutarGoster(BigInt(r.tutarMicros), ctx.birim) },
  ];
  return sayfaliTablo(ctx, s, y, sutunlar, matris);
}

/** Hacim "yaklaşık": Google'ın değerleri yuvarlanmış kova (MIMARI § 4.1). */
function hacimMetni(k: KelimeSatiri): string {
  return k.aylikArama === null ? 'bilinmiyor' : `~${k.aylikArama.toLocaleString('tr-TR')}`;
}

function teklifMetni(k: KelimeSatiri, birim: string): string {
  if (k.teklifAltMicros === null && k.teklifUstMicros === null) return '—';
  const t = (m: string | null) => (m === null ? '?' : tutarGoster(BigInt(m), birim));
  return `${t(k.teklifAltMicros)} – ${t(k.teklifUstMicros)}`;
}

function kelimeBolumu(ctx: Ctx, s: PDFPage, y: number, satirlar: KelimeSatiri[]): void {
  if (y < ALT_SINIR + 120) {
    s = yeniSayfa(ctx);
    y = BOY - KENAR;
  }
  y = baslik(ctx, s, y, 'Arama kelimeleri');
  // Yalnız SEÇİLİ kelimeler planın parçası; seçilmemiş fikirler öneri.
  const secili = satirlar.filter((k) => k.secili);
  if (secili.length === 0) {
    s.drawText('Plana alınmış kelime yok.', { x: KENAR, y, size: 9.5, font: ctx.normal, color: SLATE.s500 });
    return;
  }
  const gruplar = new Map<string, KelimeSatiri[]>();
  for (const k of secili) {
    const g = k.grup ?? DIGER_GRUBU;
    gruplar.set(g, [...(gruplar.get(g) ?? []), k]);
  }
  // Grup adı sırası; "Diğer" en sonda.
  const sirali = [...gruplar.keys()].sort((a, b) => (a === DIGER_GRUBU ? 1 : b === DIGER_GRUBU ? -1 : a.localeCompare(b, 'tr')));
  const sutunlar: Array<TabloSutunu<KelimeSatiri>> = [
    { baslik: 'Kelime', pay: 3, deger: (k) => k.kelime },
    { baslik: 'Aylık arama (yaklaşık)', pay: 1.8, sag: true, deger: hacimMetni },
    { baslik: 'Teklif aralığı', pay: 2.4, sag: true, deger: (k) => teklifMetni(k, ctx.birim) },
  ];
  for (const g of sirali) {
    if (y < ALT_SINIR + 60) {
      s = yeniSayfa(ctx);
      y = BOY - KENAR;
    }
    s.drawText(kisalt(`${g} (${gruplar.get(g)!.length})`, ctx.kalin, 10.5, EN - 2 * KENAR), { x: KENAR, y, size: 10.5, font: ctx.kalin, color: SLATE.s700 });
    y -= 18;
    ({ s, y } = sayfaliTablo(ctx, s, y, sutunlar, gruplar.get(g)!));
  }
}
