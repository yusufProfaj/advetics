import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  COLUMN_LABELS,
  COLUMN_TOTALS,
  CONVERSION_BUCKETS,
  DEFAULT_COLUMNS,
  formatMoney,
  formatNumber,
  formatPercent,
  resolveColumns,
  sumRows,
  SECTION_LABELS,
  type ColumnKey,
  type ReportCampaignRow,
  type ReportData,
} from '@advetics/shared';
import { yaziTipiOku } from './pdf-yazi-tipi';
import { gorselleriIndir, logoIndir, type GorselSonucu } from './kreatif-gorseli';
import { donusumGrafigi, okunakliYazi, renk, rozet, SLATE } from './pdf-cizim';

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
  /**
   * `opts.getir` YALNIZCA TEST İÇİN VAR ve imzada durması bilinçli.
   *
   * Kreatif görselleri gerçek CDN'den geliyor; testte oraya çıkmak hem yavaş
   * hem de CDN'in o günkü hâline bağımlı olurdu. Modül seviyesinde `fetch`i
   * yamamak ise aynı süreçteki başka testleri de etkiliyor.
   */
  async uret(data: ReportData, opts: { getir?: typeof fetch } = {}): Promise<Buffer> {
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

    /*
     * GÖRSELLER YALNIZCA BÖLÜM SEÇİLİYSE İNDİRİLİYOR.
     *
     * Koşulsuz indirmek, `top_ads` içermeyen her raporu altı ağ isteği kadar
     * yavaşlatırdı — ve o isteklerin hiçbiri belgede görünmeyecekti.
     * İndirme ÖNDEN yapılıyor: çizim döngüsünün ortasında ağ beklemek,
     * yarısı çizilmiş bir sayfayı zaman aşımına açık bırakırdı.
     */
    const gorseller = data.sections.includes('top_ads')
      ? await this.gorselleriHazirla(doc, data, opts.getir)
      : new Map<string, { img: PDFImage } | { hata: string }>();

    /*
     * MARKA RENGİ ARTIK KULLANILIYOR. `branding` alanı veride duruyordu ama
     * PDF'e hiç geçmiyordu: panelde markasını ayarlayan ajans, müşteriye
     * giden belgede onu göremiyordu. Beyaz etiketli bir üründe bu, ürünün
     * ana vaadinin belgede görünmemesi demek.
     */
    /*
     * LOGO — ajansın kendi alan adından, beyaz liste UYGULANAMAZ.
     *
     * Koruma çözülen IP üzerinden (`logoIndir`): iç ağa düşen bir adrese
     * istek hiç yapılmıyor. Gelmezse kapak logosuz basılıyor; bir logo
     * yüzünden müşteriye giden belgenin üretilmemesi kabul edilemez.
     */
    const logo = await this.logoyuHazirla(doc, data.branding.logoUrl, opts.getir);

    const ctx: Ctx = {
      doc,
      normal,
      kalin,
      data,
      gorseller,
      logo,
      ana: renk(data.branding.primaryColor),
      vurgu: renk(data.branding.accentColor, renk(data.branding.primaryColor)),
    };

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
        case 'google_search_terms':
          this.aramaTerimleri(ctx);
          break;
        case 'top_ads':
          this.enIyiReklamlar(ctx);
          break;
        case 'closing':
          this.kapanis(ctx);
          break;
        default:
          /*
           * BİLİNMEYEN BÖLÜM SESSİZCE ATLANIYOR — ve bu bilinçli.
           *
           * Şablonlar veritabanında duruyor ve eski bir şablon, bu sürümde
           * artık var olmayan bir bölüm adı taşıyabiliyor. Onun yüzünden PDF
           * üretiminin tamamının düşmesi, müşteriye giden belgeyi bir isim
           * değişikliğine bağlamak olurdu.
           */
          break;
      }
    }

    return Buffer.from(await doc.save());
  }

  // ---------------------------------------------------------------------------

  /**
   * KAPAK — panelin `Cover` bileşeninin aynısı.
   *
   * BEYAZ ZEMİN. Önceki denemede tam sayfa lacivert bant vardı ve kullanıcının
   * tarifi "pastel boya çizimi" oldu; panelin kapağı ise beyaz: üstte tarih
   * rozeti ve logo, ortada KELİMESİ ALT ALTA büyük başlık, altında marka
   * renginde müşteri adı, en altta kısa bir marka çizgisi.
   *
   * Başlığın kelime kelime kırılması bir tercih değil, referansın kendisi
   * (`data.title.split(' ').map(... <span className="block">)`). Tek satıra
   * sığdırmak aynı belgenin iki farklı kapakla çıkması demek olurdu.
   */
  private kapak(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);

    // Üst şerit: solda tarih rozeti, sağda logo.
    rozet(s, {
      metin: `${gun(ctx.data.from)} — ${gun(ctx.data.to)}`,
      x: KENAR,
      y: BOY - KENAR - 18,
      font: ctx.normal,
    });

    if (ctx.logo) {
      const h = Math.min(40, ctx.logo.height);
      const g = ctx.logo.width * (h / ctx.logo.height);
      s.drawImage(ctx.logo, {
        x: EN - KENAR - Math.min(180, g),
        y: BOY - KENAR - 40,
        width: Math.min(180, g),
        height: h,
      });
    }

    // Başlık: her kelime kendi satırında, büyük harf.
    const kelimeler = ctx.data.title.toLocaleUpperCase('tr').split(/\s+/).filter(Boolean);
    const PUNTO = 34;
    let y = BOY / 2 + (kelimeler.length * PUNTO * 0.95) / 2;
    for (const kelime of kelimeler) {
      s.drawText(kirp(kelime, ctx.kalin, PUNTO, EN - 2 * KENAR), {
        x: KENAR,
        y,
        size: PUNTO,
        font: ctx.kalin,
        color: SLATE.s900,
      });
      y -= PUNTO * 0.95;
    }

    s.drawText(kirp(ctx.data.client.name, ctx.kalin, 17, EN - 2 * KENAR), {
      x: KENAR,
      y: y - 18,
      size: 17,
      font: ctx.kalin,
      color: ctx.ana,
    });

    // Marka çizgisi — panelde `h-1.5 w-24`.
    s.drawRectangle({ x: KENAR, y: KENAR + 40, width: 68, height: 4, color: ctx.ana });

    if (ctx.data.branding.footerText) {
      s.drawText(kirp(ctx.data.branding.footerText, ctx.normal, 8.5, EN - 2 * KENAR), {
        x: KENAR,
        y: KENAR + 18,
        size: 8.5,
        font: ctx.normal,
        color: SLATE.s500,
      });
    }
  }


  /**
   * ÖZET — panelin `Summary` + `SummaryBlock` bileşenlerinin aynısı.
   *
   * Her platform ÇERÇEVELİ BİR KART. TOPLAM kartı marka renginde dolu ve
   * yazısı beyaz; diğerleri beyaz zemin, slate çerçeve. Marka rengi bu
   * belgede yalnızca üç yerde görünüyor ve biri burası — bant, rozet, ray
   * gibi eklemeler panelin dilinde YOK.
   *
   * ETİKETLER DE REFERANSTAN: "Maliyet", "Gösterim", "Tıklama", "Dönüşüm",
   * "EBM". Önceki hâlde PDF "Harcama" ve "Ort. TBM" yazıyordu — aynı raporun
   * iki gösterimi farklı metrikleri farklı adlarla gösteriyordu ve bunu
   * fark eden müşteri olurdu.
   */
  private ozet(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.summary, this.platformAdlari(ctx));

    const bloklar = [...ctx.data.platforms, ...(ctx.data.total ? [ctx.data.total] : [])];
    if (bloklar.length === 0) {
      this.bosKutu(ctx, s, y, 'Bu dönemde harcama kaydı yok.');
      return;
    }

    for (const blok of bloklar) {
      const toplamMi = blok.label === 'TOPLAM';
      const kovalar = Object.entries(blok.conversionCounts).filter(([, n]) => n > 0);
      const KART_Y = kovalar.length > 0 ? 84 : 68;
      if (y - KART_Y < KENAR) break;

      s.drawRectangle({
        x: KENAR,
        y: y - KART_Y,
        width: EN - 2 * KENAR,
        height: KART_Y,
        color: toplamMi ? ctx.ana : SLATE.beyaz,
        borderColor: toplamMi ? ctx.ana : SLATE.s200,
        borderWidth: 0.8,
      });

      const yazi = toplamMi ? okunakliYazi(ctx.ana) : SLATE.s900;
      const soluk = toplamMi ? okunakliYazi(ctx.ana) : SLATE.s500;

      s.drawText(blok.label.toLocaleUpperCase('tr'), {
        x: KENAR + 14,
        y: y - 20,
        size: 8,
        font: ctx.kalin,
        color: soluk,
        opacity: toplamMi ? 0.85 : 1,
      });

      const alanlar: Array<[string, string, boolean]> = [
        ['Maliyet', formatMoney(blok.spendMicros, ctx.data.currency ?? blok.currency), true],
        ['Gösterim', formatNumber(blok.impressions), false],
        ['Tıklama', formatNumber(blok.clicks), false],
        ['Dönüşüm', formatNumber(blok.conversions), false],
        ['EBM', formatMoney(mikro(blok.cpa), ctx.data.currency ?? blok.currency), false],
      ];
      /*
       * İLK SÜTUN DAHA GENİŞ. Panelde beş eşit sütun var ama orada sayfa
       * 880 piksel; A4'te aynı bölüşüm "43.173,03 ₺"yi kırpıyordu ve
       * müşteriye giden belgede kırpılmış bir PARA TUTARI, yanlış sayı
       * göstermekle aynı şey.
       */
      const kullanilir = EN - 2 * KENAR - 28;
      const birim = kullanilir / (alanlar.length + 0.6);
      const genislikler = alanlar.map((_, i) => (i === 0 ? birim * 1.6 : birim));
      alanlar.forEach(([ad, deger, buyuk], i) => {
        const x = KENAR + 14 + genislikler.slice(0, i).reduce((a, b) => a + b, 0);
        const sutunG = genislikler[i]!;
        s.drawText(ad.toLocaleUpperCase('tr'), {
          x,
          y: y - 38,
          size: 7,
          font: ctx.kalin,
          color: soluk,
          opacity: toplamMi ? 0.75 : 1,
        });
        s.drawText(kirp(deger, ctx.kalin, buyuk ? 14 : 10, sutunG - 6), {
          x,
          y: y - 54,
          size: buyuk ? 14 : 10,
          font: ctx.kalin,
          color: yazi,
        });
      });

      /*
       * DÖNÜŞÜM KOVALARI YALNIZCA VARSA — panelde de öyle. Google'da
       * `actions` dizisi yok ve "0 form" yazmak "hiç form gelmedi" gibi
       * okunuyor; oysa doğrusu "bu platformda böyle bir sayaç yok".
       */
      if (kovalar.length > 0) {
        const metin = kovalar
          .map(([k, n]) => `${KOVA_ADI[k] ?? k}: ${formatNumber(n)}`)
          .join('   ·   ');
        s.drawText(kirp(metin, ctx.normal, 8.5, EN - 2 * KENAR - 28), {
          x: KENAR + 14,
          y: y - 72,
          size: 8.5,
          font: ctx.normal,
          color: toplamMi ? soluk : SLATE.s600,
          opacity: toplamMi ? 0.85 : 1,
        });
      }

      y -= KART_Y + 10;
    }
  }

  /** Bölüm alt başlığı: hangi platformlar var. Panelde `platformNames`. */
  private platformAdlari(ctx: Ctx): string {
    return ctx.data.platforms.map((p) => p.label).join(' · ') || 'Veri yok';
  }

  /** Panelin `Empty` bileşeni: kesikli çerçeveli, ortalanmış açıklama. */
  private bosKutu(ctx: Ctx, s: PDFPage, y: number, metin: string): void {
    s.drawRectangle({
      x: KENAR,
      y: y - 46,
      width: EN - 2 * KENAR,
      height: 46,
      borderColor: SLATE.s200,
      borderWidth: 0.8,
    });
    s.drawText(metin, {
      x: KENAR + (EN - 2 * KENAR - ctx.normal.widthOfTextAtSize(metin, 9)) / 2,
      y: y - 27,
      size: 9,
      font: ctx.normal,
      color: SLATE.s500,
    });
  }


  private kampanyalar(
    ctx: Ctx,
    platform: string,
    satirlar: ReportCampaignRow[],
    bolum: keyof typeof DEFAULT_COLUMNS,
  ): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, 'Kampanyalar', platform);

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

    /*
     * AD SÜTUNU GENİŞLETİLDİ (170 → 200). Meta kampanya adları uzun ve
     * anlamlı ("Kampanya B · Web Sitesi Ziyareti (Trafik)"); 170 puntoda
     * tam da ayırt edici kısım kırpılıyordu ve tabloda iki satır aynı
     * görünüyordu.
     */
    const adGenislik = 200;
    const kalanGenislik = EN - KENAR * 2 - adGenislik;
    const sutunGenislik = kalanGenislik / sutunlar.length;

    /*
     * BAŞLIK BANDI — marka renginde dolgu, üstünde okunaklı yazı.
     *
     * Öncesinde başlık gri metindi ve altında ince bir çizgi vardı; tablo
     * ile üstündeki paragraf birbirine karışıyordu. Bant, tablonun nerede
     * başladığını tek bakışta söylüyor ve belgeye markanın rengini taşıyan
     * ikinci öğe.
     */
    /*
     * BAŞLIK SATIRI SADE — panelin tablosunda dolgulu bant YOK.
     *
     * Önceki hâlde marka renginde dolu bir bant vardı; referansta başlık
     * 10 punto BÜYÜK HARF, slate-500 ve altında 2 punto slate-300 kural.
     * Dolgulu bant tablonun ağırlık merkezini başlığa kaydırıyordu, oysa
     * belgenin konusu rakamlar.
     */
    s.drawText('KAMPANYA ADI', { x: KENAR, y, size: 7, font: ctx.kalin, color: SLATE.s500 });
    sutunlar.forEach((k, i) => {
      const metin = COLUMN_LABELS[k].toLocaleUpperCase('tr');
      const x =
        KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.kalin.widthOfTextAtSize(metin, 7);
      s.drawText(metin, { x, y, size: 7, font: ctx.kalin, color: SLATE.s500 });
    });
    y -= 7;
    s.drawLine({
      start: { x: KENAR, y },
      end: { x: EN - KENAR, y },
      thickness: 1.6,
      color: SLATE.s300,
    });
    y -= 14;

    for (const r of satirlar) {
      // SAYFA TAŞMASI: alt kenara gelince yeni sayfa. Kontrol olmadan
      // satırlar sayfanın dışına çizilir ve PDF hata VERMEZ — sadece
      // görünmezler.
      if (y < KENAR + 40) break;

      /*
       * SATIR AYIRICI — panelin `border-b border-slate-100`ı.
       *
       * Zebra dolgu ve harcama payını gösteren veri çubukları kaldırıldı:
       * ikisi de benim eklemelerimdi ve referansta yok. Panelin tablosu
       * yalnızca ince bir çizgiyle ayrılıyor; ekstra dolgular belgeyi
       * "başka bir ürünün çıktısı" gibi gösteriyordu.
       */
      s.drawLine({
        start: { x: KENAR, y: y - 5 },
        end: { x: EN - KENAR, y: y - 5 },
        thickness: 0.5,
        color: SLATE.s100,
      });

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
          // SAĞ HİZA BAŞLIKLA AYNI NOKTADA: ayrışırsa sayı sütunu
          // başlığından bir tık kayıyor ve tablo eğri görünüyor.
          KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.normal.widthOfTextAtSize(metin, 8.5);
        s.drawText(metin, { x, y, size: 8.5, font: ctx.normal, color: SIYAH });
      });
      y -= 15;
    }
    /*
     * TOPLAM SATIRI — PANELLE AYNI KAYNAKTAN.
     *
     * PDF'te toplam HİÇ YOKTU: aynı rapor ekranda toplamlı, müşteriye giden
     * belgede toplamsız çıkıyordu. Danışman "bu ay ne kadar harcadık"
     * sorusunu belgede cevaplayamıyordu.
     *
     * `sumRows` ve `COLUMN_TOTALS` artık paylaşılan pakette. Toplamı burada
     * ikinci kez yazmak, bir sütun eklenip toplamının unutulması demekti ve
     * TypeScript hiçbir şey demezdi — tablo sessizce kayardı.
     */
    if (satirlar.length > 0 && y > KENAR + 24) {
      const t = sumRows(satirlar);
      y -= 4;
      s.drawLine({
        start: { x: KENAR, y: y + 10 },
        end: { x: EN - KENAR, y: y + 10 },
        thickness: 1.6,
        color: SLATE.s300,
      });
      s.drawText('GENEL TOPLAM', { x: KENAR, y, size: 7.5, font: ctx.kalin, color: SLATE.s500 });
      sutunlar.forEach((k, i) => {
        /*
         * TOPLANAMAYAN SÜTUNA "—" — panelde de öyle (`text-slate-400`).
         * Boş bırakmak "hesaplanmadı" gibi okunuyordu; sıfır yazmak ise
         * erişimde "iki kat kitle" demek olurdu.
         */
        const bicim = COLUMN_TOTALS[k];
        const metin = bicim ? bicim(t, ctx.data.currency) : '—';
        s.drawText(metin, {
          x:
            KENAR +
            adGenislik +
            (i + 1) * sutunGenislik -
            ctx.kalin.widthOfTextAtSize(metin, 8.5),
          y,
          size: 8.5,
          font: ctx.kalin,
          color: bicim ? SLATE.s900 : SLATE.s400,
        });
      });
    }

    /*
     * GRAFİK TABLONUN ALTINDA VE YALNIZCA META SAYFASINDA — panelde de öyle
     * (`CampaignPage`e `daily` yalnızca meta_campaigns için geçiliyor).
     *
     * Bir süre bu grafiği ÖZET sayfasına koymuştum ve harcama barı + dönüşüm
     * çizgisi çiziyordum; referanstaki grafik ise FORM ve MESAJ'ın GRUPLU
     * barları. Yığmak ya da tek seriye indirmek "toplam dönüşüm" izlenimi
     * verir, oysa müşterinin sorusu "hangisi artıyor".
     */
    if (bolum === 'meta_campaigns' && ctx.data.daily.length > 1 && y > KENAR + 180) {
      // ARALIK 60 PUNTO: grafiğin başlığı `y + 14`e yazılıyor ve daha dar bir
      // boşlukta toplam satırının üstüne biniyordu.
      const grafikUst = y - 60;
      donusumGrafigi(s, {
        noktalar: ctx.data.daily,
        from: ctx.data.from,
        to: ctx.data.to,
        x: KENAR,
        y: grafikUst,
        genislik: EN - 2 * KENAR,
        yukseklik: Math.min(150, grafikUst - KENAR - 20),
        formRengi: ctx.ana,
        mesajRengi: ctx.vurgu,
        font: ctx.normal,
        kalin: ctx.kalin,
      });
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

  private aramaTerimleri(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.google_search_terms);

    if (ctx.data.searchTerms === null) {
      s.drawText('Bu müşteride Google Ads bağlantısı yok.', {
        x: KENAR, y, size: 10, font: ctx.normal, color: GRI,
      });
      return;
    }
    if (ctx.data.searchTerms.length === 0) {
      s.drawText('Bu dönemde arama terimi verisi yok.', {
        x: KENAR, y, size: 10, font: ctx.normal, color: GRI,
      });
      return;
    }

    s.drawText(
      'Kullanıcıların arama kutusuna yazdığı sorgular. † işaretli olanlar henüz ' +
        'anahtar kelime ya da negatif olarak tanımlı değil.',
      { x: KENAR, y, size: 8, font: ctx.normal, color: GRI },
    );
    y -= 20;

    for (const t of ctx.data.searchTerms) {
      if (y < KENAR + 40) break;
      /*
       * TANIMSIZ TERİM İŞARETLENİYOR. `NONE` olan bir terim para harcıyor ama
       * ne anahtar kelime ne negatif olarak tanımlı — raporun en eyleme
       * dönük satırı bu ve işaretlenmezse diğerlerinin arasında kaybolur.
       */
      const isaret = t.status === 'NONE' ? '† ' : '';
      s.drawText(kirp(`${isaret}${t.term}`, ctx.normal, 9, 250), {
        x: KENAR, y, size: 9, font: ctx.normal, color: SIYAH,
      });
      const sag = `${formatMoney(t.spendMicros, ctx.data.currency)}   ${formatNumber(t.clicks)} tık   ${formatNumber(t.conversions)} dönüşüm`;
      s.drawText(sag, {
        x: EN - KENAR - ctx.normal.widthOfTextAtSize(sag, 9),
        y, size: 9, font: ctx.normal, color: SIYAH,
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

  /** Logoyu indirip belgeye gömer; her başarısızlıkta `null`. */
  private async logoyuHazirla(
    doc: PDFDocument,
    adres: string | null,
    getir?: typeof fetch,
  ): Promise<PDFImage | null> {
    if (!adres) return null;
    const sonuc = await logoIndir(adres, { getir });
    if (!sonuc.ok) return null;
    try {
      return sonuc.tur === 'jpg' ? await doc.embedJpg(sonuc.bytes) : await doc.embedPng(sonuc.bytes);
    } catch {
      return null;
    }
  }

  /**
   * Görselleri indirir ve BELGEYE GÖMER.
   *
   * Gömme ayrı bir adım olarak burada: baytlar doğru imzayı taşıyıp yine de
   * bozuk olabiliyor (kesik indirme) ve `embedJpg` o durumda fırlatıyor. Tek
   * bir reklamın görseli yüzünden müşteriye giden belgenin tamamını
   * kaybetmek kabul edilemez; hata yakalanıp SEBEP olarak saklanıyor.
   */
  private async gorselleriHazirla(
    doc: PDFDocument,
    data: ReportData,
    getir?: typeof fetch,
  ): Promise<Map<string, { img: PDFImage } | { hata: string }>> {
    const indirilen: Map<string, GorselSonucu> = await gorselleriIndir(
      data.topAds.map((a) => a.imageUrl),
      { getir },
    );
    const out = new Map<string, { img: PDFImage } | { hata: string }>();

    for (const [adres, sonuc] of indirilen) {
      if (!sonuc.ok) {
        out.set(adres, { hata: sonuc.sebep });
        continue;
      }
      try {
        const img =
          sonuc.tur === 'jpg' ? await doc.embedJpg(sonuc.bytes) : await doc.embedPng(sonuc.bytes);
        out.set(adres, { img });
      } catch (err) {
        out.set(adres, { hata: err instanceof Error ? err.message : 'gömülemedi' });
      }
    }

    return out;
  }

  /**
   * En çok harcayan reklamlar — küçük görsel + metin.
   *
   * SATIR DÜZENİ, KART IZGARASI DEĞİL. Google arama reklamlarının görseli
   * YOK (kullanıcının bildirdiği sorun tam buydu: kart ızgarasında o
   * reklamlar kocaman boş kutulara dönüşüyordu). Satırda görsel yeri 56
   * punto: varsa görsel, yoksa sebebi yazan gri bir kutu — düzen ikisinde de
   * bozulmuyor.
   *
   * ÜÇ AYRI DURUM, ÜÇ AYRI CÜMLE. "Metin reklamı" (görsel adresi hiç yok),
   * "görsel alınamadı" (adres vardı, indirme düştü) ve gerçek görsel farklı
   * şeyler. İlk ikisini aynı boş kutuya çevirmek, danışmanın müşteriye
   * "görseller neden yok" sorusunu cevaplayamaması demekti.
   */
  private enIyiReklamlar(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.top_ads);

    /*
     * EKSİK PLATFORM ÖNCE YAZILIYOR — listenin ALTINDA değil.
     *
     * Bölüm harcamaya göre sıralıyor ve platform ayırmıyor; bir platformun
     * reklam seviyesi satırı hiç yoksa liste sessizce yalnızca diğerini
     * gösteriyor. Okuyan "Meta'nın öne çıkan reklamı yokmuş" diye anlıyor,
     * oysa doğrusu "o dönemde Meta için reklam seviyesi veri toplanmadı".
     *
     * Üstte, çünkü listeyi okumadan ÖNCE bilinmesi gereken bir kısıt.
     */
    if (ctx.data.topAdsMissingPlatforms.length > 0) {
      const adlar = ctx.data.topAdsMissingPlatforms.map((p) => PLATFORM_ADI[p]).join(' ve ');
      for (const [i, satir] of sar(
        `${adlar} için bu dönemde reklam seviyesi veri yok — geçmiş çekimi kampanya ` +
          'seviyesinde yapılıyor, reklam kırılımı yalnızca son günler için toplanıyor. ' +
          'Aşağıdaki liste bu yüzden diğer platformu gösteriyor.',
        ctx.normal,
        8,
        EN - 2 * KENAR - 16,
      ).entries()) {
        s.drawText(satir, {
          x: KENAR + 10,
          y: y - 4 - i * 11,
          size: 8,
          font: ctx.normal,
          color: SLATE.s600,
        });
      }
      // Panelin `Note` bileşeni: solda 3 punto vurgu şeridi, açık zemin.
      s.drawRectangle({ x: KENAR, y: y - 30, width: 2.5, height: 34, color: ctx.vurgu });
      y -= 46;
    }

    if (ctx.data.topAds.length === 0) {
      s.drawText('Bu dönemde harcama yapan reklam yok.', {
        x: KENAR,
        y,
        size: 10,
        font: ctx.normal,
        color: GRI,
      });
      return;
    }

    const KUTU = 56;
    const METIN_X = KENAR + KUTU + 12;
    const SAG = EN - KENAR;
    let alinamayan = 0;
    /*
     * SEBEPLER TOPLANIYOR ÇÜNKÜ YAPILACAK İŞ FARKLI.
     *
     * "zaman aşımı" geçici — raporu yeniden üretmek çözüyor. "desteklenmeyen
     * biçim" kalıcı: Meta thumbnail'ı WebP dönmüş ve pdf-lib onu gömemiyor,
     * yeniden üretmek hiçbir şeyi değiştirmiyor. İkisini aynı cümleye
     * çevirmek, danışmanı sonuçsuz bir denemeye göndermek olurdu.
     */
    const sebepler = new Set<string>();
    /*
     * ÇİZİLEN SATIR SAYILIYOR — SESSİZ KESME YOK.
     *
     * Sayfa dolduğunda döngü kırılıyor ve kalan reklamlar hiç görünmüyor.
     * Bugün sorgu altı satırla sınırlı ve sayfaya sığıyor; ama o sınır bir
     * gün büyütülürse belge sessizce eksik basılır ve farkı ilk gören
     * müşteri olur. Kaç tanesinin sığdığı yazılıyor.
     */
    let cizilen = 0;

    for (const reklam of ctx.data.topAds) {
      // SAYFA TAŞMASI: kalan yer bir satıra yetmiyorsa kes. Taşan çizim
      // pdf-lib'de hata vermiyor, sayfanın dışına düşüyor ve GÖRÜNMÜYOR.
      if (y < KENAR + KUTU + 10) break;

      const ust = y;
      const sonuc = reklam.imageUrl ? ctx.gorseller.get(reklam.imageUrl) : undefined;

      if (sonuc && 'img' in sonuc) {
        /*
         * EN-BOY ORANI KORUNUYOR. Sabit 56×56 çizmek, 1200×628 bir banner'ı
         * kareye EZİYOR ve bunu ilk gören müşteri oluyor — belgenin tamamı
         * "özensiz" görünüyor. Görsel kutuya SIĞDIRILIP ortalanıyor.
         */
        const o = Math.min(KUTU / sonuc.img.width, KUTU / sonuc.img.height);
        const g = sonuc.img.width * o;
        const yk = sonuc.img.height * o;
        s.drawImage(sonuc.img, {
          x: KENAR + (KUTU - g) / 2,
          y: ust - KUTU + (KUTU - yk) / 2,
          width: g,
          height: yk,
        });
      } else {
        // ADRES VARDI AMA GELMEDİ ile ADRES HİÇ YOKTU ayrı sayılıyor:
        // ilki bir arıza, ikincisi Google arama reklamının normal hâli.
        if (reklam.imageUrl) {
          alinamayan++;
          sebepler.add(sonuc && 'hata' in sonuc ? sonuc.hata : 'indirilemedi');
        }
        this.gorselYeri(ctx, s, ust, KUTU, reklam.imageUrl ? 'alinamadi' : 'metin');
      }

      s.drawText(kirp(reklam.name, ctx.kalin, 10, 300), {
        x: METIN_X,
        y: ust - 12,
        size: 10,
        font: ctx.kalin,
        color: SIYAH,
      });
      s.drawText(kirp(reklam.campaignName, ctx.normal, 8.5, 300), {
        x: METIN_X,
        y: ust - 26,
        size: 8.5,
        font: ctx.normal,
        color: GRI,
      });
      if (reklam.headline) {
        s.drawText(kirp(reklam.headline, ctx.normal, 8.5, 300), {
          x: METIN_X,
          y: ust - 40,
          size: 8.5,
          font: ctx.normal,
          color: GRI,
        });
      }

      // Sayılar SAĞA yaslı — göz tek bir dikey çizgide tarıyor.
      const satirlar = [
        formatMoney(reklam.spendMicros, ctx.data.currency),
        `${formatNumber(reklam.conversions)} dönüşüm · EBM ${
          reklam.cpa === null ? '—' : formatMoney(mikro(reklam.cpa), ctx.data.currency)
        }`,
        `TO ${formatPercent(reklam.ctr)}`,
      ];
      satirlar.forEach((metin, i) => {
        const punto = i === 0 ? 10 : 8.5;
        const font = i === 0 ? ctx.kalin : ctx.normal;
        s.drawText(metin, {
          x: SAG - font.widthOfTextAtSize(metin, punto),
          y: ust - 12 - i * 14,
          size: punto,
          font,
          color: i === 0 ? SIYAH : GRI,
        });
      });

      cizilen++;
      y = ust - KUTU - 14;
    }

    /*
     * ALINAMAYAN GÖRSEL SAYISI YAZILIYOR.
     *
     * Platform CDN adresleri süreli: aynı rapor iki hafta sonra üretilince
     * görseller sessizce kaybolabiliyor. Sayı yazılmazsa danışman belgeyi
     * müşteriye gönderdikten sonra öğreniyor.
     */
    if (cizilen < ctx.data.topAds.length) {
      s.drawText(
        `${ctx.data.topAds.length} reklamdan ${cizilen} tanesi sayfaya sığdı.`,
        { x: KENAR, y: KENAR + 10, size: 8, font: ctx.normal, color: GRI },
      );
    }

    if (alinamayan > 0 && y > KENAR + 20) {
      /*
       * CÜMLENİN SONU SABİT ve bu bir üslup tercihi değil: sebep dizgesi
       * duruma göre değişiyor (bazıları tamamen ASCII, "sunucu 404" gibi),
       * dolayısıyla uyarının çizildiğini sınayan test değişken bir metne
       * dayanamıyor. Sabit son aynı zamanda okuyucuya en gerekli bilgiyi
       * veriyor: belge görselsiz basıldı ve her sebep yeniden denemeyle
       * çözülmüyor.
       */
      const metin =
        `${alinamayan} reklamın görseli alınamadı (${[...sebepler].join(', ')}) — ` +
        'görselsiz basıldı, kalıcı biçim hatalarında yeniden üretmek çözmez.';
      s.drawText(kirp(metin, ctx.normal, 8, EN - 2 * KENAR), {
        x: KENAR,
        y: y - 4,
        size: 8,
        font: ctx.normal,
        color: GRI,
      });
    }
  }

  /** Görsel yerine geçen gri kutu — SEBEBİ yazıyor. */
  private gorselYeri(
    ctx: Ctx,
    s: PDFPage,
    ust: number,
    kutu: number,
    sebep: 'metin' | 'alinamadi',
  ): void {
    s.drawRectangle({
      x: KENAR,
      y: ust - kutu,
      width: kutu,
      height: kutu,
      color: rgb(0.94, 0.94, 0.95),
    });
    /*
     * ETİKET İKİ SATIR ve kısa: kutu 56 punto ve yazı 7 punto. "metin
     * reklamı" tek satıra sığmıyor, kırpılmış bir "metin rek…" ise hiçbir
     * şey anlatmıyor.
     */
    const etiket = sebep === 'metin' ? 'metin\nreklamı' : 'görsel\nyok';
    etiket.split('\n').forEach((satir, i) => {
      s.drawText(satir, {
        x: KENAR + (kutu - ctx.normal.widthOfTextAtSize(satir, 7)) / 2,
        y: ust - kutu / 2 - 3 - i * 9,
        size: 7,
        font: ctx.normal,
        color: GRI,
      });
    });
  }

  /**
   * BÖLÜM BAŞLIĞI — panelin `PageHead`i.
   *
   * Büyük harf başlık, altında MARKA RENGİNDE alt başlık, sağda tarih rozeti,
   * altta ince slate kuralı. Önceki hâlde başlığın üstünde marka renginde
   * kalın bir çizgi vardı; panelde öyle bir öğe YOK.
   *
   * Sayfa numarası ve altbilgi de kaldırıldı: referans belgede yok ve
   * "panelin aynısı" istendi. Baskıda numara isteniyorsa bu bilinçli bir
   * sapma olur ve ayrıca kararlaştırılmalı.
   */
  private baslik(ctx: Ctx, s: PDFPage, metin: string, altBaslik?: string): number {
    s.drawText(metin.toLocaleUpperCase('tr'), {
      x: KENAR,
      y: BOY - 72,
      size: 18,
      font: ctx.kalin,
      color: SLATE.s900,
    });
    if (altBaslik) {
      s.drawText(altBaslik.toLocaleUpperCase('tr'), {
        x: KENAR,
        y: BOY - 87,
        size: 8.5,
        font: ctx.kalin,
        color: ctx.ana,
      });
    }

    const donem = `${gun(ctx.data.from)} — ${gun(ctx.data.to)}`;
    rozet(s, {
      metin: donem,
      x: EN - KENAR - (ctx.normal.widthOfTextAtSize(donem, 8) + 16),
      y: BOY - 82,
      font: ctx.normal,
    });

    s.drawLine({
      start: { x: KENAR, y: BOY - 99 },
      end: { x: EN - KENAR, y: BOY - 99 },
      thickness: 0.8,
      color: SLATE.s200,
    });

    return BOY - 124;
  }
}

interface Ctx {
  doc: PDFDocument;
  normal: PDFFont;
  kalin: PDFFont;
  data: ReportData;
  /**
   * Adres → BELGEYE GÖMÜLMÜŞ görsel ya da başarısızlık sebebi.
   *
   * Gömme indirmeyle birlikte ÖNDEN yapılıyor. `embedJpg`/`embedPng` async
   * ve çizim döngüsü senkron; ikisini karıştırmak, `drawImage`e çözülmemiş
   * bir Promise vermek demekti — TypeScript bir `as` ile buna izin veriyor
   * ve hata yalnızca üretilen belgede, boş bir kutu olarak görünüyor.
   */
  gorseller: Map<string, { img: PDFImage } | { hata: string }>;
  /** Marka renkleri — panelde girilen değerlerden, bozuksa nötre düşüyor. */
  ana: RGB;
  vurgu: RGB;
  /** Gömülmüş logo — yoksa (adres yok ya da indirilemedi) `null`. */
  logo: PDFImage | null;
}

/**
 * Dönüşüm kovalarının adları — panelle AYNI kaynaktan.
 *
 * `CONVERSION_BUCKETS` paylaşılan pakette ve panelin `BucketLine`ı da onu
 * okuyor. Burada elle "Form"/"Mesaj" yazmak, kova adı değiştiğinde iki
 * belgenin ayrışması demekti.
 */
/** Platform kimliğinin insan adı — panelde de aynı iki etiket kullanılıyor. */
const PLATFORM_ADI: Record<string, string> = { meta: 'Meta Ads', google: 'Google Ads' };

const KOVA_ADI: Record<string, string> = Object.fromEntries(
  Object.entries(CONVERSION_BUCKETS).map(([k, v]) => [k, v.label]),
);

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
