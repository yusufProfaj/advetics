import { PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { HUNI_ETIKETLERI, tutarGoster, type BosNedeni, type PilotPlanDetayi, type PilotPlanDurumu, type PlanSatiri } from '@advetics/shared';
import { logoOku, yaziTipiOku } from '../reports/pdf-yazi-tipi';
import { kisalt, SLATE, tablo, type TabloSutunu } from '../reports/pdf-cizim';
import { donemAdi } from '../strateji/medya-plani-pdf';

/**
 * ═══ PİLOT PLAN PDF'İ ═══
 *
 * Rapor PDF'inin altyapısı (gömülü DejaVu, tek tablo çizici, depodaki
 * Advetics logosu), ikinci bir kopya değil. SAF: veriyi alır, bayt döndürür.
 *
 * MÜŞTERİ ADINA ONAY AYRI YAZILIR (S-1): "müşteri onayladı" ile "ajans
 * müşteri adına onayladı" aynı belge değil; ikincisinde gerekçe kapakta.
 * Taslak büyük harfle TASLAK: elden ele geçen belge onaylı plan sanılmasın.
 * Uyum ayrıntısı PDF'e GİRMEZ: belge müşteriye gidebiliyor ve uyum ajansın işi.
 * Tablo SAYFALARA BÖLÜNÜR; uzun plan sessizce kesilmez.
 */
const EN = 595.28;
const BOY = 841.89;
const KENAR = 40;
const ALT_SINIR = KENAR + 20;

const DURUM_METNI: Record<PilotPlanDurumu, string> = {
  taslak: 'Taslak',
  musteride: 'Müşteri onayı bekliyor',
  onaylandi: 'Onaylandı',
  kuruluyor: 'Kuruluyor',
  kismen_kuruldu: 'Kısmen kuruldu',
  kuruldu: 'Kuruldu',
  kapatildi: 'Kapatıldı',
  iptal: 'İptal edildi',
};

/** PDF'te boş hücrenin cümlesi: sayı uydurulmaz, neden yazılır. */
const BOS_METNI: Partial<Record<BosNedeni, string>> = {
  aylik_butce_yok: 'Bu ay için Aylık Bütçe tanımlı değil.',
  harcanan_bilinmiyor: 'Bu ay harcanan tutar okunamadı; kalan bütçe hesaplanamadı.',
  ay_butcesi_bitti: 'Bu ayın bütçesi harcanmış.',
  hesap_yok: 'Workspace’e atanmış reklam hesabı yok.',
  karisik_birim: 'Hesaplar farklı para birimleri kullanıyor.',
  donem_gecti: 'Dönem geçti.',
};

interface Ctx {
  doc: PDFDocument;
  normal: PDFFont;
  kalin: PDFFont;
  logo: PDFImage | null;
  birim: string;
}

export async function planPdf(v: { workspace: string; detay: PilotPlanDetayi }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Aylık plan · ${v.workspace} · ${donemAdi(v.detay.plan.donem)}`);
  doc.setProducer('Advetics');
  const normal = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
  const kalin = await doc.embedFont(yaziTipiOku('bold'), { subset: true });
  let logo: PDFImage | null = null;
  const b = logoOku();
  if (b) {
    try {
      logo = await doc.embedPng(b);
    } catch {
      logo = null;
    }
  }
  const ctx: Ctx = { doc, normal, kalin, logo, birim: v.detay.icerik.paraBirimi ?? 'TRY' };
  kapak(ctx, v);
  satirBolumu(ctx, v.detay);
  return Buffer.from(await doc.save());
}

function yazi(ctx: Ctx, s: PDFPage, metin: string, y: number, boyut = 10.5, renk = SLATE.s700): number {
  s.drawText(kisalt(metin, ctx.normal, boyut, EN - 2 * KENAR), { x: KENAR, y, size: boyut, font: ctx.normal, color: renk });
  return y - boyut - 7;
}

function kapak(ctx: Ctx, v: { workspace: string; detay: PilotPlanDetayi }): void {
  const s = ctx.doc.addPage([EN, BOY]);
  const d = v.detay;
  if (ctx.logo) {
    const h = Math.min(40, ctx.logo.height);
    const g = Math.min(180, ctx.logo.width * (h / ctx.logo.height));
    s.drawImage(ctx.logo, { x: EN - KENAR - g, y: BOY - KENAR - 40, width: g, height: h });
  }
  if (d.plan.durum === 'taslak') s.drawText('TASLAK', { x: KENAR, y: BOY - 210, size: 64, font: ctx.kalin, color: SLATE.s300 });
  if (d.plan.durum === 'iptal') s.drawText('İPTAL EDİLDİ', { x: KENAR, y: BOY - 210, size: 44, font: ctx.kalin, color: SLATE.s300 });
  s.drawText('AYLIK PLAN', { x: KENAR, y: BOY - 300, size: 30, font: ctx.kalin, color: SLATE.s900 });
  s.drawText(kisalt(v.workspace, ctx.kalin, 17, EN - 2 * KENAR), { x: KENAR, y: BOY - 330, size: 17, font: ctx.kalin, color: SLATE.s700 });
  s.drawText(donemAdi(d.plan.donem), { x: KENAR, y: BOY - 356, size: 13, font: ctx.normal, color: SLATE.s600 });
  let y = BOY - 400;
  y = yazi(ctx, s, `Durum: ${DURUM_METNI[d.plan.durum]} · Sürüm ${d.plan.surum}`, y);
  const p = d.icerik;
  y = yazi(ctx, s, p.toplam.dolu ? `Toplam bütçe: ${tutarGoster(BigInt(p.toplam.deger), ctx.birim)}` : `Toplam bütçe yok: ${BOS_METNI[p.toplam.emptyReason] ?? p.toplam.emptyReason}`, y);
  for (const c of d.musteriOzeti?.cumleler ?? []) y = yazi(ctx, s, c, y, 9.5, SLATE.s600);
  const o = d.plan.onay;
  if (o) {
    const tarih = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(o.zaman));
    y = yazi(ctx, s, o.rol === 'musteri' ? `Müşteri hesabı onayladı · ${tarih}` : `Ajans müşteri adına onayladı · ${tarih}`, y - 6);
    if (o.rol === 'ajans' && o.gerekce) y = yazi(ctx, s, `Gerekçe: ${o.gerekce}`, y, 9.5, SLATE.s600);
  }
  if (p.ozetMetni.dolu) {
    // Yapay zekânın gerekçesi; sayıları plandaki hücrelerden (yzMetniEkle süzgeci).
    for (const parca of satirlaraBol(ctx, p.ozetMetni.deger, 9.5)) y = yazi(ctx, s, parca, y, 9.5, SLATE.s500);
  }
  s.drawRectangle({ x: KENAR, y: KENAR + 40, width: 68, height: 4, color: SLATE.s900 });
}

function satirlaraBol(ctx: Ctx, metin: string, boyut: number): string[] {
  const sonuc: string[] = [];
  let satir = '';
  for (const k of metin.split(/\s+/)) {
    const aday = satir ? `${satir} ${k}` : k;
    if (ctx.normal.widthOfTextAtSize(aday, boyut) > EN - 2 * KENAR && satir) {
      sonuc.push(satir);
      satir = k;
    } else satir = aday;
  }
  if (satir) sonuc.push(satir);
  return sonuc;
}

function satirBolumu(ctx: Ctx, d: PilotPlanDetayi): void {
  let s = ctx.doc.addPage([EN, BOY]);
  let y = BOY - KENAR;
  s.drawText('Kampanyalar', { x: KENAR, y, size: 14, font: ctx.kalin, color: SLATE.s900 });
  y -= 26;
  const p = d.icerik;
  if (p.satirlar.length === 0) {
    yazi(ctx, s, 'Planda kampanya satırı yok.', y, 9.5, SLATE.s500);
    return;
  }
  const para = (m: string) => tutarGoster(BigInt(m), ctx.birim);
  const sutunlar: Array<TabloSutunu<PlanSatiri>> = [
    { baslik: 'Kampanya', pay: 3, deger: (r) => r.ad },
    { baslik: 'Platform', pay: 1, deger: (r) => (r.platform === 'meta' ? 'Meta' : 'Google') },
    { baslik: 'Katman', pay: 1.4, deger: (r) => HUNI_ETIKETLERI[r.katman] },
    { baslik: 'Tutar', pay: 2, sag: true, kalinDeger: true, deger: (r) => para(r.tutar.deger) },
  ];
  let kalan = p.satirlar;
  while (kalan.length > 0) {
    if (y < ALT_SINIR + 60) {
      s = ctx.doc.addPage([EN, BOY]);
      y = BOY - KENAR;
    }
    const r = tablo(s, { sutunlar, satirlar: kalan, x: KENAR, y, genislik: EN - 2 * KENAR, altSinir: ALT_SINIR, normal: ctx.normal, kalin: ctx.kalin, toplam: null });
    kalan = kalan.slice(r.cizilen);
    y = kalan.length > 0 ? 0 : r.y - 18;
  }
  if (BigInt(p.dagitilmamis.micros) > 0n && y > ALT_SINIR) {
    // Dağıtılmamış kısım SÖYLENİR: görünmezse bütçenin tamamı harcanacak sanılır.
    yazi(ctx, s, `Dağıtılmamış: ${para(p.dagitilmamis.micros)}`, y, 9.5, SLATE.s600);
  }
}
