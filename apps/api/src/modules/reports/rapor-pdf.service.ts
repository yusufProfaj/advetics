import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  COLUMN_LABELS,
  DEFAULT_COLUMNS,
  formatMoney,
  formatNumber,
  formatPercent,
  resolveColumns,
  SECTION_LABELS,
  type ColumnKey,
  type ReportCampaignRow,
  type ReportData,
} from '@advetics/shared';
import { yaziTipiOku } from './pdf-yazi-tipi';

/** A4, punto cinsinden. */
const EN = 595.28;
const BOY = 841.89;
const KENAR = 40;

/**
 * ═══ RAPOR PDF'İ — SUNUCUDA, TARAYICISIZ ═══
 *
 * Headless Chrome KULLANILMIYOR ve gerekçesi kod tabanında iki yerde yazılı:
 * üretim sunucusu paylaşımlı, yanında 11 canlı site var ve derleme SUNUCUDA
 * yapılıyor — Puppeteer her deploy'da ~200-300 MB Chromium indirirdi.
 * `pdf-lib` saf JS: kurulum betiği yok, yerel derleme yok, ikili indirmiyor.
 *
 * Bedeli düzeni ELLE kurmak. Kabul edildi çünkü rapor belgesi sabit yapılı
 * (kapak, özet, tablolar) ve serbest akışlı bir HTML sayfası değil.
 *
 * SAYILAR PANELLE AYNI FONKSİYONDAN GEÇİYOR (`formatMoney` vb. artık
 * `packages/shared` içinde). İkinci bir biçimlendirme yazmak, panelde
 * "₺34.026,44" PDF'te "34026.44 TRY" demek olurdu — hiçbir hata vermeden ve
 * farkı müşteriye giden belgede gören olurdu.
 */
@Injectable()
export class RaporPdfService {
  async uret(data: ReportData): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    /*
     * ALT KÜME GÖMÜLÜYOR (`subset: true`). Tam font ~700 KB ve her rapora
     * onu eklemek belgeyi tek başına o boyuta çıkarırdı; e-posta eki olarak
     * gidiyor.
     */
    const normal = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
    const kalin = await doc.embedFont(yaziTipiOku('bold'), { subset: true });

    doc.setTitle(`${data.title} — ${data.client.name}`);
    doc.setCreator('Advetics');
    doc.setProducer('Advetics');

    const ctx: Ctx = { doc, normal, kalin, data };

    for (const bolum of data.sections) {
      switch (bolum) {
        case 'cover':
          this.kapak(ctx);
          break;
        case 'summary':
          this.ozet(ctx);
          break;
        case 'meta_campaigns':
          this.kampanyalar(ctx, 'Meta Ads', data.metaCampaigns, 'meta_campaigns');
          break;
        case 'google_campaigns':
          this.kampanyalar(ctx, 'Google Ads', data.googleCampaigns, 'google_campaigns');
          break;
        case 'google_keywords':
          this.anahtarKelimeler(ctx);
          break;
        case 'closing':
          this.kapanis(ctx);
          break;
        default:
          /*
           * BİLİNMEYEN BÖLÜM SESSİZCE ATLANIYOR — ve bu bilinçli.
           * `top_ads` PDF'te henüz yok (kreatif görsellerini indirmek ayrı
           * bir iş: platform CDN adresleri ölebiliyor ve indirme sırasında
           * bekleyen bir PDF üretimi worker'ı bloklar). Şablonda seçili
           * olması PDF üretimini DÜŞÜRMEMELİ.
           */
          break;
      }
    }

    return Buffer.from(await doc.save());
  }

  // ---------------------------------------------------------------------------

  private kapak(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = BOY - 200;

    s.drawText(ctx.data.client.name, {
      x: KENAR,
      y,
      size: 28,
      font: ctx.kalin,
      color: rgb(0.1, 0.1, 0.12),
    });
    y -= 34;
    s.drawText(ctx.data.title, { x: KENAR, y, size: 16, font: ctx.normal, color: GRI });
    y -= 26;
    s.drawText(`${gun(ctx.data.from)} — ${gun(ctx.data.to)}`, {
      x: KENAR,
      y,
      size: 12,
      font: ctx.normal,
      color: GRI,
    });
  }

  private ozet(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.summary);

    for (const blok of [...ctx.data.platforms, ...(ctx.data.total ? [ctx.data.total] : [])]) {
      s.drawText(blok.label, { x: KENAR, y, size: 12, font: ctx.kalin, color: SIYAH });
      y -= 18;

      const satirlar: Array<[string, string]> = [
        ['Harcama', formatMoney(blok.spendMicros, ctx.data.currency)],
        ['Gösterim', formatNumber(blok.impressions)],
        ['Tıklama', formatNumber(blok.clicks)],
        ['Dönüşüm', formatNumber(blok.conversions)],
        ['Ort. TBM', formatMoney(mikro(blok.cpc), ctx.data.currency)],
      ];
      let x = KENAR;
      for (const [ad, deger] of satirlar) {
        s.drawText(ad, { x, y, size: 8, font: ctx.normal, color: GRI });
        s.drawText(deger, { x, y: y - 13, size: 11, font: ctx.kalin, color: SIYAH });
        x += 104;
      }
      y -= 40;

      // DÖNÜŞÜM KOVALARI YALNIZCA VARSA. Google'da `actions` dizisi yok ve
      // "0 form" yazmak "hiç form gelmedi" gibi okunur.
      const k = blok.conversionCounts;
      if (k.form > 0 || k.message > 0 || k.purchase > 0) {
        s.drawText(
          `Form: ${formatNumber(k.form)}   ·   Mesaj: ${formatNumber(k.message)}` +
            (k.purchase > 0 ? `   ·   Satış: ${formatNumber(k.purchase)}` : ''),
          { x: KENAR, y, size: 9, font: ctx.normal, color: GRI },
        );
        y -= 20;
      }
      y -= 10;
    }
  }

  private kampanyalar(
    ctx: Ctx,
    platform: string,
    satirlar: ReportCampaignRow[],
    bolum: keyof typeof DEFAULT_COLUMNS,
  ): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, `Kampanyalar — ${platform}`);

    if (satirlar.length === 0) {
      s.drawText(`Bu dönemde ${platform} verisi yok.`, {
        x: KENAR,
        y,
        size: 10,
        font: ctx.normal,
        color: GRI,
      });
      return;
    }

    /*
     * SÜTUNLAR PANELLE AYNI KARARDAN GELİYOR: `resolveColumns` ve
     * `DEFAULT_COLUMNS` paylaşılan pakette. Ayrı bir liste tutmak, aynı
     * raporun iki farklı sütun setiyle çıkması demek olurdu.
     */
    const sutunlar = resolveColumns(ctx.data.options[bolum]?.metrics, DEFAULT_COLUMNS[bolum]);

    const adGenislik = 170;
    const kalanGenislik = EN - KENAR * 2 - adGenislik;
    const sutunGenislik = kalanGenislik / sutunlar.length;

    // Başlık
    s.drawText('Kampanya', { x: KENAR, y, size: 7.5, font: ctx.kalin, color: GRI });
    sutunlar.forEach((k, i) => {
      const metin = COLUMN_LABELS[k];
      const x = KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.kalin.widthOfTextAtSize(metin, 7.5);
      s.drawText(metin, { x, y, size: 7.5, font: ctx.kalin, color: GRI });
    });
    y -= 6;
    s.drawLine({
      start: { x: KENAR, y },
      end: { x: EN - KENAR, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.82),
    });
    y -= 14;

    for (const r of satirlar) {
      // SAYFA TAŞMASI: alt kenara gelince yeni sayfa. Kontrol olmadan
      // satırlar sayfanın dışına çizilir ve PDF hata VERMEZ — sadece
      // görünmezler.
      if (y < KENAR + 40) break;

      s.drawText(kirp(r.name, ctx.normal, 8.5, adGenislik - 6), {
        x: KENAR,
        y,
        size: 8.5,
        font: ctx.normal,
        color: SIYAH,
      });

      sutunlar.forEach((k, i) => {
        const metin = hucre(k, r, ctx.data.currency);
        const x =
          KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.normal.widthOfTextAtSize(metin, 8.5);
        s.drawText(metin, { x, y, size: 8.5, font: ctx.normal, color: SIYAH });
      });
      y -= 15;
    }
  }

  private anahtarKelimeler(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.google_keywords);

    // `null` "veri yok" DEĞİL, "bu yetenek yok" demek: Google bağlantısı
    // olmayan müşteride anahtar kelime diye bir şey yok.
    if (ctx.data.keywords === null) {
      s.drawText('Bu müşteride Google Ads bağlantısı yok.', {
        x: KENAR,
        y,
        size: 10,
        font: ctx.normal,
        color: GRI,
      });
      return;
    }
    if (ctx.data.keywords.length === 0) {
      s.drawText('Bu dönemde anahtar kelime verisi yok.', {
        x: KENAR,
        y,
        size: 10,
        font: ctx.normal,
        color: GRI,
      });
      return;
    }

    for (const k of ctx.data.keywords) {
      if (y < KENAR + 40) break;
      s.drawText(kirp(k.keyword, ctx.normal, 9, 260), {
        x: KENAR,
        y,
        size: 9,
        font: ctx.normal,
        color: SIYAH,
      });
      const sag = `${formatMoney(k.spendMicros, ctx.data.currency)}   ${formatNumber(k.clicks)} tık   ${formatPercent(k.ctr)}`;
      s.drawText(sag, {
        x: EN - KENAR - ctx.normal.widthOfTextAtSize(sag, 9),
        y,
        size: 9,
        font: ctx.normal,
        color: SIYAH,
      });
      y -= 15;
    }
  }

  private kapanis(ctx: Ctx): void {
    if (!ctx.data.closingText) return;
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.closing);

    for (const satir of sar(ctx.data.closingText, ctx.normal, 10, EN - KENAR * 2)) {
      if (y < KENAR) break;
      s.drawText(satir, { x: KENAR, y, size: 10, font: ctx.normal, color: SIYAH });
      y -= 15;
    }
  }

  private baslik(ctx: Ctx, s: PDFPage, metin: string): number {
    s.drawText(metin, { x: KENAR, y: BOY - 60, size: 16, font: ctx.kalin, color: SIYAH });
    s.drawText(`${ctx.data.client.name} · ${gun(ctx.data.from)} — ${gun(ctx.data.to)}`, {
      x: KENAR,
      y: BOY - 78,
      size: 8.5,
      font: ctx.normal,
      color: GRI,
    });
    return BOY - 110;
  }
}

interface Ctx {
  doc: PDFDocument;
  normal: PDFFont;
  kalin: PDFFont;
  data: ReportData;
}

const SIYAH = rgb(0.1, 0.1, 0.12);
const GRI = rgb(0.42, 0.44, 0.48);

/** Micros'a çevir — `formatMoney` micros string bekliyor. */
function mikro(v: number | null): string | null {
  return v === null ? null : String(Math.round(v * 1_000_000));
}

/**
 * Bir sütunun hücre değeri.
 *
 * Panelin `SUTUNLAR` defterinin PDF karşılığı. İkisi ayrı dosyada çünkü biri
 * JSX döndürüyor diğeri düz metin; ANAHTAR LİSTESİ ve VARSAYILANLAR ortak
 * (`packages/shared`), yani bir sütun eklendiğinde ikisi de aynı listeden
 * besleniyor ve buradaki `default` dalı eksiği görünür kılıyor.
 */
function hucre(k: ColumnKey, r: ReportCampaignRow, para: string | null): string {
  switch (k) {
    case 'spend':
      return formatMoney(r.spendMicros, para, { decimals: 2 });
    case 'impressions':
      return formatNumber(r.impressions);
    case 'clicks':
      return formatNumber(r.clicks);
    case 'reach':
      return formatNumber(r.reach);
    case 'ctr':
      return formatPercent(r.ctr);
    case 'cpc':
      return formatMoney(mikro(r.cpc), para);
    case 'cpa':
      return formatMoney(mikro(r.cpa), para);
    case 'conversions':
      return formatNumber(r.conversions);
    case 'form':
      return formatNumber(r.conversionCounts.form);
    case 'message':
      return formatNumber(r.conversionCounts.message);
    case 'purchase':
      return formatNumber(r.conversionCounts.purchase);
    default:
      // Yeni bir sütun anahtarı eklenip burası unutulursa "—" çıkıyor ve
      // sessizce yanlış bir sayı basılmıyor.
      return '—';
  }
}

/** Sığmayan metni kısaltır. pdf-lib kırpma yapmıyor — taşan metin çiziliyor. */
function kirp(metin: string, font: PDFFont, punto: number, genislik: number): string {
  if (font.widthOfTextAtSize(metin, punto) <= genislik) return metin;
  let s = metin;
  while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, punto) > genislik) s = s.slice(0, -1);
  return `${s}…`;
}

/** Basit sarma — pdf-lib satır kırmıyor. */
function sar(metin: string, font: PDFFont, punto: number, genislik: number): string[] {
  const out: string[] = [];
  for (const paragraf of metin.split('\n')) {
    let satir = '';
    for (const kelime of paragraf.split(/\s+/)) {
      const aday = satir ? `${satir} ${kelime}` : kelime;
      if (font.widthOfTextAtSize(aday, punto) > genislik) {
        if (satir) out.push(satir);
        satir = kelime;
      } else {
        satir = aday;
      }
    }
    out.push(satir);
  }
  return out;
}

/** `YYYY-MM-DD` → `1 Tem 2026`. */
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function gun(iso: string): string {
  const [y, a, g] = iso.split('-');
  return `${Number(g)} ${AYLAR[Number(a) - 1]} ${y}`;
}
