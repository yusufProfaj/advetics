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
import { logoOku, yaziTipiOku } from './pdf-yazi-tipi';
import { gorselleriIndir, type GorselSonucu } from './kreatif-gorseli';
import { donusumGrafigi, egri, halka, kisalt, okunakliYazi, renk, rozet, SLATE, tablo } from './pdf-cizim';

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
/**
 * Halka dilim renkleri — PANELLE AYNI SIRA.
 *
 * Marka rengi ilk, gerisi slate tonları. Farklı sıra, aynı kovanın belgede
 * ve ekranda farklı renkte görünmesi demekti ve okuyan onları farklı şeyler
 * sanardı.
 */
function pdfDilimRenkleri(markaRengi: RGB): RGB[] {
  return [markaRengi, SLATE.s700, SLATE.s500, SLATE.s400, SLATE.s300, SLATE.s200, SLATE.s100];
}

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
     * LOGO DEPODAN OKUNUYOR — ağdan değil.
     *
     * Kapakta her zaman Advetics logosu basılıyor; ajansın `branding.logoUrl`
     * değeri burada KULLANILMIYOR (panel arayüzünde kullanılmaya devam
     * ediyor). Beyaz etiket vaadinden bilinçli bir sapma.
     *
     * Uzaktan indirmek, müşteriye giden bir belgenin üretimini ağa bağımlı
     * yapardı: adres cevap vermediğinde rapor logosuz çıkar ve bunu ilk gören
     * müşteri olur.
     */
    const logo = await this.logoyuHazirla(doc);

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
        case 'audience_overview':
          this.kitleOzeti(ctx);
          break;
        case 'audience_age':
        case 'audience_gender':
        case 'audience_placement':
        case 'audience_hour':
        case 'audience_city':
          this.kirilim(ctx, bolum);
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

  /**
   * Tablonun üstünde tek satırlık gri not.
   *
   * `bosKutu` DEĞİL: o "hiç veri yok" demek ve çerçeveli bir kutu çiziyor.
   * Bu not tablonun YANINDA duruyor — veri var ama kapsamı dar.
   */
  private notSatiri(ctx: Ctx, s: PDFPage, y: number, metin: string): number {
    s.drawText(kisalt(metin, ctx.normal, 8, EN - 2 * KENAR), {
      x: KENAR,
      y: y - 10,
      size: 8,
      font: ctx.normal,
      color: SLATE.s500,
    });
    return y - 22;
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
    const t = sumRows(satirlar);

    /*
     * KAMPANYA TABLOSU DA ORTAK ÇİZİCİDEN GEÇİYOR.
     *
     * Üç tablo (kampanya, anahtar kelime, arama terimi) ayrı ayrı
     * çiziliyordu ve ikisi düz listeydi. Ayrı çizildiklerinde biri
     * düzeltilip diğeri unutuluyor; tek çizici bunu imkânsız kılıyor.
     *
     * Ad sütunu paya çevrildi: sabit 200 punto, sütun sayısı arttığında
     * sayıları sıkıştırıyordu.
     */
    const { y: sonY } = tablo(s, {
      sutunlar: [
        { baslik: 'Kampanya Adı', pay: 32, deger: (r: ReportCampaignRow) => r.name },
        /*
         * HARCAMA SÜTUNU DİĞERLERİNDEN GENİŞ (1,5 kat).
         *
         * Eşit paylaştırmada "9.930,38 ₺" kırpılıp "9.930,38…" oluyordu ve
         * KIRPILMIŞ BİR PARA TUTARI yanlış sayı göstermekle aynı şey. Para
         * dizesi hem en uzun hem de tablonun en çok bakılan sütunu; ad
         * sütununun kırpılması ise panelde de böyle (`truncate`).
         */
        ...sutunlar.map((k) => ({
          baslik: COLUMN_LABELS[k],
          pay: (68 / (sutunlar.length + (sutunlar.includes('spend') ? 0.5 : 0))) *
            (k === 'spend' ? 1.5 : 1),
          sag: true,
          kalinDeger: k === 'spend',
          deger: (r: ReportCampaignRow) => hucre(k, r, ctx.data.currency),
        })),
      ],
      satirlar,
      x: KENAR,
      y,
      genislik: EN - 2 * KENAR,
      altSinir: KENAR + 20,
      normal: ctx.normal,
      kalin: ctx.kalin,
      /*
       * TOPLAM PANELLE AYNI KAYNAKTAN (`COLUMN_TOTALS`). Burada ikinci kez
       * yazmak, bir sütun eklenip toplamının unutulması demekti ve
       * TypeScript hiçbir şey demezdi.
       */
      toplam: {
        etiket: 'Genel toplam',
        degerler: sutunlar.map((k) => {
          const bicim = COLUMN_TOTALS[k];
          return bicim ? bicim(t, ctx.data.currency) : null;
        }),
      },
    });
    y = sonY;

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

  /**
   * ANAHTAR KELİME PERFORMANSI — panelle AYNI sütunlar.
   *
   * Öncesinde düz listeydi: solda kelime, sağda birleştirilmiş bir metrik
   * dizesi. Panelde altı sütunlu bir tablo duruyordu ve aynı raporun iki
   * gösterimi birbirine benzemiyordu.
   */
  private anahtarKelimeler(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    const y = this.baslik(ctx, s, SECTION_LABELS.google_keywords, 'Google Ads');

    // `null` "veri yok" DEĞİL, "bu yetenek yok": Google bağlantısı olmayan
    // müşteride anahtar kelime diye bir şey yok.
    if (ctx.data.keywords === null) {
      this.bosKutu(ctx, s, y, 'Bu müşteride Google Ads bağlantısı bulunmuyor.');
      return;
    }
    if (ctx.data.keywords.length === 0) {
      this.bosKutu(ctx, s, y, 'Bu dönemde anahtar kelime verisi yok.');
      return;
    }

    const para = (m: string | null): string => formatMoney(m, ctx.data.currency);
    const { y: son, cizilen } = tablo(s, {
      sutunlar: [
        { baslik: 'Anahtar Kelime', pay: 34, deger: (k) => k.keyword },
        { baslik: 'Harcama', pay: 14, sag: true, kalinDeger: true, deger: (k) => para(k.spendMicros) },
        { baslik: 'Gösterim', pay: 13, sag: true, deger: (k) => formatNumber(k.impressions) },
        { baslik: 'Tıklama', pay: 13, sag: true, deger: (k) => formatNumber(k.clicks) },
        { baslik: COLUMN_LABELS.ctr, pay: 13, sag: true, deger: (k) => formatPercent(k.ctr) },
        { baslik: COLUMN_LABELS.cpc, pay: 13, sag: true, deger: (k) => para(mikro(k.cpc)) },
      ],
      satirlar: ctx.data.keywords,
      x: KENAR,
      y,
      genislik: EN - 2 * KENAR,
      altSinir: KENAR + 20,
      normal: ctx.normal,
      kalin: ctx.kalin,
    });

    this.sigmayanlar(ctx, s, son, cizilen, ctx.data.keywords.length, 'anahtar kelime');
  }


  /**
   * ARAMA TERİMLERİ — panelle AYNI sütunlar, "Eşleşen Kelime" dahil.
   *
   * Öncesinde düz listeydi ve EŞLEŞEN KELİME sütunu HİÇ YOKTU — oysa bir
   * terimin hangi anahtar kelimeyle eşleştiği, raporun en eyleme dönük
   * bilgisi: "ikon cadde satılık" sorgusu "ikon tower" ile eşleşiyorsa
   * orada yanlış bir eşleşme var ve para oraya akıyor.
   */
  /**
   * ═══ KİTLE KIRILIMI — panelle AYNI tablo ═══
   *
   * Beş bölüm tek çiziciden geçiyor: dördü tek satır farkla aynı tablo ve
   * beş kopya, bir sütun eklendiğinde dördünün unutulması demekti. PDF'te üç
   * tablonun üç ayrı şekilde çizilmesi tam olarak bu yüzden ayrışmıştı.
   *
   * PAY SÜTUNU METİN, ÇUBUK DEĞİL. Panelde çubuk var ama PDF'te vektörel bir
   * çubuk çizmek `payCubugu` kalıntısını geri getirirdi — o desen "çok
   * pastel boya çizimi" geri bildiriminin kaynağıydı ve regresyon bekçisi
   * onu yasaklıyor.
   */
  /**
   * ═══ KİTLE ÖZETİ — panelin karşılığı ═══
   *
   * Panel bu bölümü çiziyorsa PDF de çizmek ZORUNDA. Aynı raporun iki
   * gösterimi var ve biri diğerinde olmayan bir sayfa taşırsa müşteriye
   * giden belge ile ekran ayrışıyor — bu depoda bir kez yaşandı ve referans
   * olarak panel seçildi.
   *
   * DİLİM RENKLERİ PANELLE AYNI SIRADA: marka rengi ilk, gerisi slate
   * tonları. Farklı sıra, aynı kovanın iki belgede farklı renkte görünmesi
   * demekti ve okuyan onları farklı şeyler sanardı.
   */
  private kitleOzeti(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    const y0 = this.baslik(ctx, s, SECTION_LABELS.audience_overview, this.platformAdlari(ctx));

    const yas = ctx.data.breakdowns.find((b) => b.dimension === 'age');
    const cinsiyet = ctx.data.breakdowns.find((b) => b.dimension === 'gender');
    const varMi = (yas?.rows.length ?? 0) > 0 || (cinsiyet?.rows.length ?? 0) > 0;

    if (!varMi) {
      this.bosKutu(
        ctx,
        s,
        y0,
        'Kitle verisi henüz toplanmadı. Kırılımlar gecelik güncellemeyle geliyor.',
      );
      return;
    }

    let y = y0;

    /*
     * ÖZET KARTLARI TOPLAM BLOĞUNDAN, kırılımlardan DEĞİL — panelle aynı
     * gerekçe: Meta "unknown" kovası taşıyor ve kırılım toplamı ana rakamı
     * tutmayabiliyor. Kartı kırılımdan türetmek, aynı sayfada kartla
     * tablonun farklı sayı göstermesi demekti.
     */
    const ozet = ctx.data.total ?? ctx.data.platforms[0] ?? null;
    if (ozet) {
      const kartlar: Array<[string, string]> = [
        ['GÖSTERİM', formatNumber(ozet.impressions)],
        ['HARCAMA', formatMoney(ozet.spendMicros, ctx.data.currency)],
        // `null` "hesaplanamaz" demek, sıfır DEĞİL.
        ['TIKL. ORANI', ozet.ctr === null ? '—' : `%${ozet.ctr.toFixed(2)}`],
        ['FORM', formatNumber(ozet.conversionCounts.form)],
        ['MESAJ', formatNumber(ozet.conversionCounts.message)],
      ];
      const kartEn = (EN - 2 * KENAR - 4 * 6) / kartlar.length;
      kartlar.forEach(([etiket, deger], i) => {
        const x = KENAR + i * (kartEn + 6);
        s.drawRectangle({
          x,
          y: y - 34,
          width: kartEn,
          height: 34,
          borderColor: SLATE.s200,
          borderWidth: 0.8,
        });
        s.drawText(etiket, { x: x + 6, y: y - 13, size: 6, font: ctx.normal, color: SLATE.s500 });
        s.drawText(kisalt(deger, ctx.kalin, 11, kartEn - 12), {
          x: x + 6,
          y: y - 28,
          size: 11,
          font: ctx.kalin,
          color: SLATE.s900,
        });
      });
      y -= 50;
    }

    // Dört halka: gösterim ve tıklamanın cinsiyete ve yaşa göre dağılımı.
    const paletDizisi = pdfDilimRenkleri(renk(ctx.data.branding.primaryColor));

    const grafikler: Array<[string, typeof yas, 'impressions' | 'clicks']> = [
      ['Gösterim / Cinsiyet', cinsiyet, 'impressions'],
      ['Tıklama / Cinsiyet', cinsiyet, 'clicks'],
      ['Gösterim / Yaş', yas, 'impressions'],
      ['Tıklama / Yaş', yas, 'clicks'],
    ];

    const sutunEn = (EN - 2 * KENAR - 3 * 10) / 4;
    grafikler.forEach(([baslik, blok, alan], i) => {
      const x = KENAR + i * (sutunEn + 10);
      s.drawText(baslik, { x, y: y - 8, size: 6.5, font: ctx.kalin, color: SLATE.s500 });

      const dilimler = this.halkaDilimleri(blok, alan);
      const cx = x + sutunEn / 2;
      const cy = y - 58;
      if (dilimler.length === 0) {
        s.drawText('Veri yok', { x, y: cy, size: 7, font: ctx.normal, color: SLATE.s400 });
        return;
      }

      halka(s, {
        cx,
        cy,
        disR: 26,
        icR: 15,
        dilimler: dilimler.map((d, j) => ({
          oran: d.oran,
          renk: paletDizisi[j % paletDizisi.length]!,
        })),
      });

      // LEJANT YÜZDE TAŞIYOR: iki yakın dilimin hangisinin büyük olduğunu
      // göze bırakmak, halka grafiğin bilinen zayıflığı.
      dilimler.forEach((d, j) => {
        const ly = y - 92 - j * 9;
        s.drawRectangle({
          x,
          y: ly,
          width: 5,
          height: 5,
          color: paletDizisi[j % paletDizisi.length]!,
        });
        s.drawText(
          `${kisalt(d.etiket, ctx.normal, 6.5, sutunEn - 34)}  %${(d.oran * 100).toFixed(1)}`,
          { x: x + 8, y: ly, size: 6.5, font: ctx.normal, color: SLATE.s600 },
        );
      });
    });

    y -= 92 + 8 * 9 + 20;

    // Günlük form eğrisi — panelin altındaki grafiğin karşılığı.
    if (ctx.data.daily.length >= 2) {
      s.drawText('GÜNLÜK FORM', { x: KENAR, y, size: 6.5, font: ctx.kalin, color: SLATE.s500 });
      egri(s, ctx.normal, {
        x: KENAR,
        y: y - 60,
        genislik: EN - 2 * KENAR,
        yukseklik: 48,
        degerler: ctx.data.daily.map((d) => d.conversionCounts.form),
        renk: renk(ctx.data.branding.primaryColor),
      });
    }
  }

  /**
   * Bir kırılım bloğunu halka dilimlerine çevirir — PANELLE AYNI KURAL.
   *
   * En büyük altı, kalanı "Diğer". Yirmi dilimli halka okunmuyor ama kalanı
   * ATMAK yüzdeleri %100'e tamamlanmaz hâle getirirdi.
   */
  private halkaDilimleri(
    blok: ReportData['breakdowns'][number] | undefined,
    alan: 'impressions' | 'clicks',
  ): Array<{ etiket: string; oran: number }> {
    if (!blok) return [];
    const sirali = blok.rows
      .map((r) => ({ etiket: pdfKirilimEtiketi(blok.dimension, r.value, false), deger: r[alan] }))
      .filter((d) => d.deger > 0)
      .sort((a, b) => b.deger - a.deger);

    const toplam = sirali.reduce((a, d) => a + d.deger, 0);
    if (toplam <= 0) return [];

    const ilk = sirali.slice(0, 6);
    const kalan = sirali.slice(6).reduce((a, d) => a + d.deger, 0);
    const hepsi =
      kalan > 0 ? [...ilk, { etiket: `Diğer (${sirali.length - 6})`, deger: kalan }] : ilk;

    return hepsi.map((d) => ({ etiket: d.etiket, oran: d.deger / toplam }));
  }

  private kirilim(ctx: Ctx, bolum: KirilimBolumu): void {
    const s = ctx.doc.addPage([EN, BOY]);
    const boyut = PDF_BOLUM_BOYUT[bolum];
    const blok = ctx.data.breakdowns.find((b) => b.dimension === boyut);
    const y0 = this.baslik(ctx, s, SECTION_LABELS[bolum], this.platformAdlari(ctx));

    if (!blok || blok.rows.length === 0) {
      /*
       * BOŞ HÂLİN SEBEBİ YAZILI. Kırılım gecelik süpürmeyle toplanıyor;
       * "veri yok" demek, kullanıcıyı olmayan bir arızayı aramaya gönderir.
       */
      this.bosKutu(
        ctx,
        s,
        y0,
        'Bu dönemde kırılım verisi yok. Kırılımlar gecelik güncellemeyle toplanıyor.',
      );
      return;
    }

    let y = y0;
    // DESTEKLENMEYEN PLATFORM AÇIKÇA — boş tabloyla aynı şey değil.
    if (blok.unsupportedPlatforms.length > 0) {
      const adlar = blok.unsupportedPlatforms
        .map((p) => (p === 'google' ? 'Google Ads' : 'Meta'))
        .join(', ');
      y = this.notSatiri(
        ctx,
        s,
        y,
        `${adlar} bu kırılımı raporlamıyor — tablo diğer platformu kapsıyor.`,
      );
    }

    const para = (m: string): string => formatMoney(m, ctx.data.currency);
    /*
     * "DİĞER" SATIRI TABLONUN İÇİNDE, toplam satırı olarak DEĞİL: o bir
     * toplam değil, kesilen satırların birikimi. Toplam satırı olarak
     * çizmek onu tablonun tamamının toplamı sanmaya yol açardı.
     */
    const satirlar = [
      ...blok.rows.map((r) => ({ ...r, diger: false })),
      ...(blok.otherCount > 0
        ? [
            {
              value: `Diğer (${blok.otherCount})`,
              spendMicros: blok.otherSpendMicros,
              sharePct: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              diger: true,
            },
          ]
        : []),
    ];

    const { y: son, cizilen } = tablo(s, {
      sutunlar: [
        { baslik: PDF_BOYUT_BASLIK[boyut] ?? 'Değer', pay: 30, deger: (r) => pdfKirilimEtiketi(boyut, r.value, r.diger) },
        // PARA SÜTUNU DİĞERLERİNDEN GENİŞ: eşit paylaştırmada tutar
        // kırpılıyor ve kırpılmış bir para tutarı yanlış sayı göstermekle aynı.
        { baslik: 'Harcama', pay: 18, sag: true, kalinDeger: true, deger: (r) => para(r.spendMicros) },
        { baslik: 'Pay', pay: 10, sag: true, deger: (r) => (r.diger ? '' : `%${r.sharePct.toFixed(1)}`) },
        { baslik: 'Gösterim', pay: 14, sag: true, deger: (r) => (r.diger ? '' : formatNumber(r.impressions)) },
        { baslik: 'Tıklama', pay: 14, sag: true, deger: (r) => (r.diger ? '' : formatNumber(r.clicks)) },
        { baslik: 'Dönüşüm', pay: 14, sag: true, deger: (r) => (r.diger ? '' : formatNumber(r.conversions)) },
      ],
      satirlar,
      x: KENAR,
      y,
      genislik: EN - 2 * KENAR,
      altSinir: KENAR + 20,
      normal: ctx.normal,
      kalin: ctx.kalin,
    });

    this.sigmayanlar(ctx, s, son, cizilen, satirlar.length, 'satır');
  }

  private aramaTerimleri(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.google_search_terms, 'Google Ads');

    if (ctx.data.searchTerms === null) {
      this.bosKutu(ctx, s, y, 'Bu müşteride Google Ads bağlantısı bulunmuyor.');
      return;
    }
    if (ctx.data.searchTerms.length === 0) {
      this.bosKutu(ctx, s, y, 'Bu dönemde arama terimi verisi yok.');
      return;
    }

    for (const [i, satir] of sar(
      'Kullanıcıların arama kutusuna yazdığı sorgular. † işaretli olanlar henüz ' +
        'anahtar kelime ya da negatif olarak tanımlı değil.',
      ctx.normal,
      8,
      EN - 2 * KENAR,
    ).entries()) {
      s.drawText(satir, { x: KENAR, y: y - i * 11, size: 8, font: ctx.normal, color: SLATE.s500 });
    }
    y -= 30;

    const para = (m: string | null): string => formatMoney(m, ctx.data.currency);
    const { y: son, cizilen } = tablo(s, {
      sutunlar: [
        {
          baslik: 'Arama Terimi',
          pay: 30,
          /*
           * TANIMSIZ TERİM İŞARETLENİYOR. `NONE` olan bir terim para
           * harcıyor ama ne anahtar kelime ne negatif olarak tanımlı —
           * raporun en eyleme dönük satırı bu ve işaretlenmezse
           * diğerlerinin arasında kaybolur.
           */
          deger: (t) => `${t.status === 'NONE' ? '† ' : ''}${t.term}`,
        },
        { baslik: 'Eşleşen Kelime', pay: 24, deger: (t) => t.keyword ?? '—' },
        { baslik: 'Harcama', pay: 13, sag: true, kalinDeger: true, deger: (t) => para(t.spendMicros) },
        { baslik: 'Tıklama', pay: 11, sag: true, deger: (t) => formatNumber(t.clicks) },
        { baslik: COLUMN_LABELS.ctr, pay: 11, sag: true, deger: (t) => formatPercent(t.ctr) },
        { baslik: 'Dönüşüm', pay: 11, sag: true, deger: (t) => formatNumber(t.conversions) },
      ],
      satirlar: ctx.data.searchTerms,
      x: KENAR,
      y,
      genislik: EN - 2 * KENAR,
      altSinir: KENAR + 20,
      normal: ctx.normal,
      kalin: ctx.kalin,
    });

    this.sigmayanlar(ctx, s, son, cizilen, ctx.data.searchTerms.length, 'arama terimi');
  }

  /**
   * SIĞMAYAN SATIRLAR SESSİZCE DÜŞMÜYOR.
   *
   * Sayfaya kaç satır sığdığı ve toplamın kaç olduğu yazılıyor; yoksa
   * kırpılmış bir tablo "hepsi bu kadarmış" gibi okunuyor.
   */
  private sigmayanlar(
    ctx: Ctx,
    s: PDFPage,
    y: number,
    cizilen: number,
    toplam: number,
    birim: string,
  ): void {
    if (cizilen >= toplam) return;
    s.drawText(`${toplam} ${birim}den ${cizilen} tanesi sayfaya sığdı.`, {
      x: KENAR,
      y: y - 6,
      size: 7.5,
      font: ctx.normal,
      color: SLATE.s500,
    });
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

  /**
   * Logoyu belgeye gömer; okunamazsa `null` ve kapak logosuz basılır.
   *
   * `embedPng` ASYNC: gömme çizimden ÖNCE yapılmak zorunda. Kreatif
   * görsellerinde tam bu noktada bir `as` cast'i çözülmemiş Promise'i
   * `drawImage`e sokmuştu ve hata yalnızca belgede, boş kutu olarak
   * görünmüştü.
   */
  private async logoyuHazirla(doc: PDFDocument): Promise<PDFImage | null> {
    const bayt = logoOku();
    if (!bayt) return null;
    try {
      return await doc.embedPng(bayt);
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
  /**
   * ÖNE ÇIKAN REKLAMLAR — PLATFORM BAŞINA AYRI SAYFA.
   *
   * Tek sayfada karışık listelendiğinde harcaması büyük olan platform
   * listeyi tamamen dolduruyordu: Google'ın en iyi reklamı Meta'nın altında
   * hiç görünmüyordu. Rapor iki platformu her yerde ayrı ayrı anlatıyor,
   * bu bölüm de öyle.
   *
   * REKLAMI OLMAYAN PLATFORM İÇİN SAYFA AÇILMIYOR — boş bir sayfa müşteriye
   * giden belgede "burada bir şey olacaktı" izlenimi bırakır. Ama eksikliğin
   * SEBEBİ yazılıyor: veri hiç toplanmadıysa bu ilk sayfanın üstünde
   * bildiriliyor.
   */
  private enIyiReklamlar(ctx: Ctx): void {
    const platformlar = PLATFORM_SIRASI.filter((pf) =>
      ctx.data.topAds.some((a) => a.platform === pf),
    );

    // Hiç reklam yoksa TEK sayfa: eksikliğin sebebini yazacak bir yer lazım.
    if (platformlar.length === 0) {
      this.reklamSayfasi(ctx, null);
      return;
    }
    for (const [i, pf] of platformlar.entries()) {
      this.reklamSayfasi(ctx, pf, i === 0);
    }
  }

  private reklamSayfasi(ctx: Ctx, platform: (typeof PLATFORM_SIRASI)[number] | null, ilk = true): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(
      ctx,
      s,
      SECTION_LABELS.top_ads,
      platform ? PLATFORM_ADI[platform] : undefined,
    );
    const reklamlar = platform
      ? ctx.data.topAds.filter((a) => a.platform === platform)
      : ctx.data.topAds;

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
    if (ilk && ctx.data.topAdsMissingPlatforms.length > 0) {
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

    if (reklamlar.length === 0) {
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

    /*
     * İKİ SÜTUNLU KART IZGARASI — panelin düzeninin aynısı.
     *
     * Öncesinde tek sütunlu satır listesiydi: sayfada altı reklam görünüyor,
     * geri kalanı "sığmadı" notuna düşüyordu. Kart ızgarası aynı sayfaya on
     * ikisini de sığdırıyor ve panelle aynı belgeyi gösteriyor.
     */
    const SUTUN = 2;
    const ARA = 12;
    const KART_G = (EN - 2 * KENAR - ARA) / SUTUN;
    const KART_Y = 104;

    for (const [i, reklam] of reklamlar.entries()) {
      const sutun = i % SUTUN;
      const satir = Math.floor(i / SUTUN);
      const kx = KENAR + sutun * (KART_G + ARA);
      const ky = y - satir * (KART_Y + ARA);

      // SAYFA TAŞMASI: kalan yer bir karta yetmiyorsa kes. Taşan çizim
      // pdf-lib'de hata vermiyor, sayfanın dışına düşüyor ve GÖRÜNMÜYOR.
      if (ky - KART_Y < KENAR) break;

      s.drawRectangle({
        x: kx,
        y: ky - KART_Y,
        width: KART_G,
        height: KART_Y,
        borderColor: SLATE.s200,
        borderWidth: 0.8,
      });

      const ic = 10;
      /*
       * METİN REKLAMI DAHA GENİŞ BİR ALAN İSTİYOR.
       *
       * Görsel için 52 punto yeterli — kreatifi kreatifin kendisi anlatıyor.
       * Metin reklamında anlatan şey METNİN KENDİSİ ve 52 puntoda başlık
       * ortasından kırpılıyordu: "İzmir Urla'da Satılık Villa |" diye biten
       * bir önizleme, reklamın ne dediğini göstermek yerine gizliyor.
       *
       * Sayfa içinde tutarlı kalıyor: Google sayfasındaki kartların hepsi
       * metin, Meta'dakilerin hepsi görsel.
       */
      const gorselG = reklam.imageUrl ? 52 : 108;
      const gorselY = KART_Y - ic * 2;
      const metinX = kx + ic + gorselG + 10;
      const metinG = KART_G - ic * 2 - gorselG - 10;
      const sonuc = reklam.imageUrl ? ctx.gorseller.get(reklam.imageUrl) : undefined;

      if (sonuc && 'img' in sonuc) {
        /*
         * EN-BOY ORANI KORUNUYOR. Sabit ölçüde çizmek 1200×628 bir banner'ı
         * eziyor ve bunu ilk gören müşteri oluyor.
         */
        const o = Math.min(gorselG / sonuc.img.width, gorselY / sonuc.img.height);
        s.drawImage(sonuc.img, {
          x: kx + ic + (gorselG - sonuc.img.width * o) / 2,
          y: ky - ic - gorselY + (gorselY - sonuc.img.height * o) / 2,
          width: sonuc.img.width * o,
          height: sonuc.img.height * o,
        });
      } else if (reklam.imageUrl) {
        // ADRES VARDI AMA GELMEDİ: bir arıza, sayısı aşağıda bildiriliyor.
        alinamayan++;
        /*
         * TAZELEME HATASI VARSA O YAZILIYOR — indirme hatası DEĞİL.
         *
         * Saklanan Meta CDN adresi imzalı ve ölüyor; adresi yenileyemediğimiz
         * durumda indirme kaçınılmaz olarak "sunucu 403" veriyor. O cümleyi
         * yazmak BELİRTİYİ raporlamak olurdu ve danışmanı CDN'e baktırırdı;
         * oysa sebep bağlantı tarafında ("token geçersiz", "kota doldu") ve
         * yapılacak iş orada.
         */
        sebepler.add(
          reklam.imageUrlHatasi ?? (sonuc && 'hata' in sonuc ? sonuc.hata : 'indirilemedi'),
        );
        this.gorselYeri(ctx, s, ky - ic, gorselG, 'alinamadi', kx + ic, gorselY);
      } else {
        /*
         * METİN REKLAMI ÖNİZLEMESİ — boş kutu DEĞİL.
         *
         * Google arama reklamının görseli yok ve olmayacak; onu anlatan şey
         * METNİ. Boş bir gri kutu koymak "burada bir görsel olacaktı" gibi
         * duruyordu ve raporu okuyan reklamın neye benzediğini göremiyordu.
         */
        this.metinReklamiOnizleme(ctx, s, reklam, kx + ic, ky - ic, gorselG, gorselY);
      }

      s.drawText(kirp(reklam.campaignName.toLocaleUpperCase('tr'), ctx.normal, 6.5, metinG), {
        x: metinX,
        y: ky - ic - 7,
        size: 6.5,
        font: ctx.normal,
        color: SLATE.s500,
      });

      /*
       * BAŞLIK İKİ SATIRA SARILIYOR, kırpılmıyor — panelde de `line-clamp-2`.
       * Tek satıra kırpmak Meta reklam adlarının ayırt edici kısmını
       * ("… - LEAD (FORM)" gibi) düşürüyor ve iki kart aynı görünüyor.
       */
      sar(reklam.headline ?? reklam.name, ctx.kalin, 8.5, metinG)
        .slice(0, 2)
        .forEach((satir, k) => {
          s.drawText(satir, {
            x: metinX,
            y: ky - ic - 21 - k * 11,
            size: 8.5,
            font: ctx.kalin,
            color: SLATE.s900,
          });
        });

      /*
       * DÖRT METRİK 2×2 — panelde de öyle. Tek sütunda alt alta yazmak kartı
       * uzatıp sayfaya altı kart sığdırırdı.
       */
      const kutular: Array<[string, string]> = [
        ['HARCAMA', formatMoney(reklam.spendMicros, ctx.data.currency)],
        ['DÖNÜŞÜM', formatNumber(reklam.conversions)],
        ['TO', formatPercent(reklam.ctr)],
        ['EBM', reklam.cpa === null ? '—' : formatMoney(mikro(reklam.cpa), ctx.data.currency)],
      ];
      /*
       * SOL SÜTUN DAHA GENİŞ (%58). İki eşit sütunda para tutarı kırpılıyordu
       * ("1.350,70…") ve kırpılmış bir para tutarı, yanlış sayı göstermekle
       * aynı şey. Sağdaki sütun dönüşüm/EBM taşıyor ve onlar daha kısa.
       */
      const solPay = 0.58;
      kutular.forEach(([etiket, deger], k) => {
        const sag = k % 2 === 1;
        const mx = metinX + (sag ? metinG * solPay : 0);
        const hucreG = (sag ? 1 - solPay : solPay) * metinG - 4;
        const my = ky - ic - 50 - Math.floor(k / 2) * 22;
        s.drawText(etiket, { x: mx, y: my, size: 5.5, font: ctx.normal, color: SLATE.s500 });
        s.drawText(kirp(deger, ctx.kalin, 8, hucreG), {
          x: mx,
          y: my - 10,
          size: 8,
          font: ctx.kalin,
          color: SLATE.s900,
        });
      });

      cizilen++;
    }

    y -= Math.ceil(cizilen / SUTUN) * (KART_Y + ARA);

    if (cizilen < reklamlar.length) {
      s.drawText(
        `${reklamlar.length} reklamdan ${cizilen} tanesi sayfaya sığdı.`,
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
  /**
   * METİN REKLAMI ÖNİZLEMESİ — Google arama reklamının "kreatifi".
   *
   * Arama reklamının görseli yok ve olmayacak; onu anlatan şey metni.
   * Öncesinde yerine boş bir gri kutu çiziliyordu ve raporu okuyan reklamın
   * neye benzediğini göremiyordu — kutu "burada bir görsel olacaktı" gibi
   * duruyordu.
   *
   * Gerçek arama sonucunun yapısı taklit ediliyor: üstte "Reklam" rozeti ve
   * görünen adres, altında başlık, en altta açıklama. Uydurma yok — üçü de
   * `creatives` tablosundan geliyor; olmayan alan çizilmiyor.
   */
  private metinReklamiOnizleme(
    ctx: Ctx,
    s: PDFPage,
    reklam: ReportData['topAds'][number],
    x: number,
    ust: number,
    genislik: number,
    yukseklik: number,
  ): void {
    s.drawRectangle({
      x,
      y: ust - yukseklik,
      width: genislik,
      height: yukseklik,
      color: SLATE.s50,
      borderColor: SLATE.s200,
      borderWidth: 0.5,
    });

    let y = ust - 9;
    s.drawText('Reklam', { x: x + 4, y, size: 5, font: ctx.kalin, color: SLATE.s600 });
    if (reklam.displayUrl) {
      s.drawText(kirp(reklam.displayUrl, ctx.normal, 5, genislik - 8), {
        x: x + 4,
        y: y - 7,
        size: 5,
        font: ctx.normal,
        color: SLATE.s500,
      });
    }

    y -= 18;
    for (const [i, satir] of sar(reklam.headline ?? reklam.name, ctx.kalin, 6, genislik - 8)
      .slice(0, 2)
      .entries()) {
      s.drawText(satir, { x: x + 4, y: y - i * 8, size: 6, font: ctx.kalin, color: ctx.ana });
    }

    if (reklam.description) {
      y -= 20;
      for (const [i, satir] of sar(reklam.description, ctx.normal, 5, genislik - 8)
        .slice(0, 3)
        .entries()) {
        if (y - i * 7 < ust - yukseklik + 3) break;
        s.drawText(satir, { x: x + 4, y: y - i * 7, size: 5, font: ctx.normal, color: SLATE.s600 });
      }
    }
  }

  private gorselYeri(
    ctx: Ctx,
    s: PDFPage,
    ust: number,
    kutu: number,
    sebep: 'metin' | 'alinamadi',
    x = KENAR,
    yukseklik = kutu,
  ): void {
    s.drawRectangle({
      x,
      y: ust - yukseklik,
      width: kutu,
      height: yukseklik,
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
        x: x + (kutu - ctx.normal.widthOfTextAtSize(satir, 7)) / 2,
        y: ust - yukseklik / 2 - 3 - i * 9,
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

/**
 * Sayfa sırası — raporun geri kalanıyla AYNI.
 *
 * Özet blokları ve kampanya tabloları Meta'yı önce anlatıyor; öne çıkan
 * reklamların sırası ondan ayrılırsa okuyan aynı belgede iki farklı düzenle
 * karşılaşır.
 */
const PLATFORM_SIRASI = ['meta', 'google'] as const;

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


/** Rapor bölümü → kırılım boyutu. Panelin `BOLUM_BOYUT`u ile aynı eşleme. */
type KirilimBolumu =
  | 'audience_age'
  | 'audience_gender'
  | 'audience_placement'
  | 'audience_hour'
  | 'audience_city';

const PDF_BOLUM_BOYUT: Record<KirilimBolumu, string> = {
  audience_age: 'age',
  audience_gender: 'gender',
  audience_placement: 'placement',
  audience_hour: 'hour',
  audience_city: 'city',
};

const PDF_BOYUT_BASLIK: Record<string, string> = {
  age: 'Yaş aralığı',
  gender: 'Cinsiyet',
  placement: 'Yerleşim / ağ',
  hour: 'Saat',
  city: 'Şehir',
};

/**
 * Ham platform değerini okunur hâle çevirir — PANELLE AYNI harita.
 *
 * İki tarafın ayrışması, aynı raporun ekranda "Kadın" PDF'te "female"
 * göstermesi demekti; kullanıcı ikisini yan yana açıyor.
 *
 * TANINMAYAN DEĞER OLDUĞU GİBİ: haritada olmayanı "Diğer"e atmak, yeni bir
 * platform kovası eklendiğinde onu sessizce gizlerdi.
 */
function pdfKirilimEtiketi(boyut: string, deger: string, diger: boolean): string {
  if (diger) return deger;
  if (boyut === 'hour') return `${deger}:00 — ${deger}:59`;
  const harita: Record<string, string> = {
    female: 'Kadın',
    FEMALE: 'Kadın',
    male: 'Erkek',
    MALE: 'Erkek',
    unknown: 'Bilinmiyor',
    UNDETERMINED: 'Belirlenemedi',
    UNKNOWN: 'Bilinmiyor',
    SEARCH: 'Arama ağı',
    SEARCH_PARTNERS: 'Arama ortakları',
    CONTENT: 'Görüntülü reklam ağı',
    YOUTUBE_SEARCH: 'YouTube arama',
    YOUTUBE_WATCH: 'YouTube video',
    MIXED: 'Karma',
  };
  return harita[deger] ?? deger;
}
