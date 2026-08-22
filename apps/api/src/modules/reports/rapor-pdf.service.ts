import { Injectable } from '@nestjs/common';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  COLUMN_LABELS,
  COLUMN_TOTALS,
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
import { acikTon, altbilgi, grafik, okunakliYazi, payCubugu, renk } from './pdf-cizim';

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

  private kapak(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);

    /*
     * ÜST BANT — kapağın tek görsel öğesi ve marka rengini taşıyor.
     *
     * Öncesinde kapak, beyaz bir sayfada üç satır metindi. "Boş bir Word
     * belgesi" izlenimi tam olarak oradan başlıyordu: müşteriye gönderilen
     * dosyanın İLK gördüğü sayfa hiçbir şey söylemiyordu.
     */
    const BANT_Y = 300;
    s.drawRectangle({ x: 0, y: BOY - BANT_Y, width: EN, height: BANT_Y, color: ctx.ana });
    s.drawRectangle({ x: 0, y: BOY - BANT_Y - 7, width: EN, height: 7, color: ctx.vurgu });

    const bantYazi = okunakliYazi(ctx.ana);

    /*
     * LOGO VARSA ÜSTTE. Yoksa kompozisyon kaymıyor: metin bloğu sabit
     * yerinde duruyor ve logosuz kapak da dengeli görünüyor. Logoyu
     * zorunlu kılmak, henüz marka yüklememiş ajansta boş bir kutu bırakırdı.
     */
    if (ctx.logo) {
      const enBoy = 44 / ctx.logo.height;
      s.drawImage(ctx.logo, {
        x: KENAR,
        y: BOY - 108,
        width: Math.min(180, ctx.logo.width * enBoy),
        height: 44,
      });
    }

    s.drawText(ctx.data.client.name, {
      x: KENAR,
      y: BOY - 196,
      size: 30,
      font: ctx.kalin,
      color: bantYazi,
    });
    s.drawText(ctx.data.title, {
      x: KENAR,
      y: BOY - 224,
      size: 13,
      font: ctx.normal,
      color: bantYazi,
      opacity: 0.85,
    });

    // Dönem, bandın içinde bir "rozet": kapağın ikinci en önemli bilgisi.
    const donem = `${gun(ctx.data.from)} — ${gun(ctx.data.to)}`;
    const rozetG = ctx.kalin.widthOfTextAtSize(donem, 10) + 20;
    s.drawRectangle({
      x: KENAR,
      y: BOY - 262,
      width: rozetG,
      height: 22,
      color: ctx.vurgu,
    });
    s.drawText(donem, {
      x: KENAR + 10,
      y: BOY - 255,
      size: 10,
      font: ctx.kalin,
      color: okunakliYazi(ctx.vurgu),
    });

    s.drawText(`${ctx.data.rangeDays} günlük dönem · ${ctx.data.platforms.length} platform`, {
      x: KENAR,
      y: BOY - BANT_Y - 40,
      size: 11,
      font: ctx.normal,
      color: GRI,
    });

    /*
     * KAPAK BİLGİ DE TAŞIYOR — yalnızca marka değil.
     *
     * Bandın altı boş bir alandı ve müşterinin ilk gördüğü sayfa hiçbir şey
     * söylemiyordu. Üç başlık sayısı burada: raporun tamamını açmadan "ne
     * oldu" sorusunun cevabı. Sayılar özet sayfasıyla AYNI bloktan geliyor;
     * ikinci bir hesap yapmak ikisinin ayrışması demekti.
     */
    const ozet = ctx.data.total ?? ctx.data.platforms[0];
    if (ozet) {
      const one: Array<[string, string]> = [
        ['Toplam harcama', formatMoney(ozet.spendMicros, ctx.data.currency)],
        ['Dönüşüm', formatNumber(ozet.conversions)],
        ['Ort. EBM', formatMoney(mikro(ozet.cpa), ctx.data.currency)],
      ];
      const g = (EN - 2 * KENAR) / 3;
      one.forEach(([ad, deger], i) => {
        const x = KENAR + i * g;
        s.drawRectangle({ x, y: BOY - BANT_Y - 130, width: 3, height: 40, color: ctx.vurgu });
        s.drawText(ad, { x: x + 10, y: BOY - BANT_Y - 104, size: 9, font: ctx.normal, color: GRI });
        s.drawText(kirp(deger, ctx.kalin, 18, g - 20), {
          x: x + 10,
          y: BOY - BANT_Y - 128,
          size: 18,
          font: ctx.kalin,
          color: SIYAH,
        });
      });
    }

    // Alt bilgi ajansın kendi metni — beyaz etiketin bir parçası.
    if (ctx.data.branding.footerText) {
      s.drawText(kirp(ctx.data.branding.footerText, ctx.normal, 9, EN - 2 * KENAR), {
        x: KENAR,
        y: KENAR + 10,
        size: 9,
        font: ctx.normal,
        color: GRI,
      });
    }
  }

  private ozet(ctx: Ctx): void {
    const s = ctx.doc.addPage([EN, BOY]);
    let y = this.baslik(ctx, s, SECTION_LABELS.summary);

    const bloklar = [...ctx.data.platforms, ...(ctx.data.total ? [ctx.data.total] : [])];

    /*
     * PAY ÇUBUĞU EN ÜSTTE — raporun en çok sorulan sorusu "para nereye
     * gitti". İki sayıyı yan yana koymak bunu cevaplamıyor: 43.173 ile
     * 16.579'un oranını okuyucu kafasında hesaplıyor.
     *
     * Yalnızca birden çok platform varsa: tek platformda çubuk %100 dolu
     * çıkıyor ve hiçbir şey söylemiyor.
     */
    if (ctx.data.platforms.length > 1) {
      y = payCubugu(s, {
        dilimler: ctx.data.platforms.map((b, i) => ({
          etiket: b.label,
          deger: Number(BigInt(b.spendMicros) / 1_000_000n),
          renk: i === 0 ? ctx.ana : ctx.vurgu,
        })),
        x: KENAR,
        y,
        genislik: EN - 2 * KENAR,
        yukseklik: 14,
        font: ctx.normal,
        gri: GRI,
      });
      y -= 6;
    }

    for (const [bi, blok] of bloklar.entries()) {
      // RENKLİ RAY: platform adının solunda kısa bir dikey şerit. Toplam
      // satırı ana renkte, platformlar sırayla ana/vurgu — hangi kartın
      // hangi platforma ait olduğu pay çubuğuyla eşleşiyor.
      const rayRengi = bi === 0 ? ctx.ana : bi === 1 ? ctx.vurgu : SIYAH;
      s.drawRectangle({ x: KENAR, y: y - 2, width: 3, height: 14, color: rayRengi });
      s.drawText(blok.label, { x: KENAR + 9, y, size: 12, font: ctx.kalin, color: SIYAH });
      y -= 18;

      const satirlar: Array<[string, string]> = [
        ['Harcama', formatMoney(blok.spendMicros, ctx.data.currency)],
        ['Gösterim', formatNumber(blok.impressions)],
        ['Tıklama', formatNumber(blok.clicks)],
        ['Dönüşüm', formatNumber(blok.conversions)],
        ['Ort. TBM', formatMoney(mikro(blok.cpc), ctx.data.currency)],
      ];
      /*
       * KARTLAR — çerçeveli kutular, çıplak metin değil.
       *
       * Beş sayı yan yana yazılınca hangisinin hangi etikete ait olduğu
       * ancak dikkatle okunuyordu; müşteriye giden belgede bu, "özensiz"
       * izleniminin yarısı. Kutu, gözü sayıya bağlıyor.
       */
      const KART_G = (EN - 2 * KENAR - 4 * 8) / 5;
      const KART_Y = 42;
      satirlar.forEach(([ad, deger], i) => {
        const x = KENAR + i * (KART_G + 8);
        s.drawRectangle({
          x,
          y: y - KART_Y + 12,
          width: KART_G,
          height: KART_Y,
          // İlk kart (harcama) marka tonunda: gözün ilk gitmesi gereken sayı o.
          color: i === 0 ? acikTon(ctx.ana, 0.1) : rgb(0.97, 0.97, 0.98),
          borderColor: i === 0 ? acikTon(ctx.ana, 0.35) : rgb(0.89, 0.89, 0.91),
          borderWidth: 0.5,
        });
        s.drawText(ad, { x: x + 7, y: y + 1, size: 7.5, font: ctx.normal, color: GRI });
        s.drawText(kirp(deger, ctx.kalin, 11, KART_G - 14), {
          x: x + 7,
          y: y - 15,
          size: 11,
          font: ctx.kalin,
          color: SIYAH,
        });
      });
      y -= KART_Y + 14;

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

    /*
     * GÜNLÜK GRAFİK — VERİ ELDE DURUYORDU AMA HİÇ ÇİZİLMİYORDU.
     *
     * `data.daily` panelde grafik olarak gösteriliyor; PDF onu hiç
     * kullanmıyordu ve müşteriye giden belge yalnızca sayı listesiydi.
     * Kullanıcının bildirdiği "grafikleri yok, boş text gibi" tam olarak bu.
     *
     * Tek günlük aralıkta çizilmiyor: bir gün için grafik tek bir bar
     * demek ve kartlar aynı bilgiyi zaten daha okunur veriyor.
     */
    if (ctx.data.daily.length > 1 && y > KENAR + 140) {
      y -= 8;
      s.drawText('Günlük harcama ve dönüşüm', {
        x: KENAR,
        y,
        size: 10,
        font: ctx.kalin,
        color: SIYAH,
      });
      y -= 22;
      y = grafik(s, {
        noktalar: ctx.data.daily,
        from: ctx.data.from,
        to: ctx.data.to,
        x: KENAR,
        y,
        genislik: EN - 2 * KENAR,
        yukseklik: Math.min(150, y - KENAR - 30),
        barRengi: ctx.ana,
        cizgiRengi: ctx.vurgu,
        font: ctx.normal,
        gri: GRI,
      });
      s.drawText('Barlar harcama · çizgi dönüşüm', {
        x: KENAR,
        y: y - 2,
        size: 7.5,
        font: ctx.normal,
        color: GRI,
      });
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
    const BANT = 16;
    s.drawRectangle({
      x: KENAR,
      y: y - 5,
      width: EN - 2 * KENAR,
      height: BANT,
      color: ctx.ana,
    });
    const bantYazi = okunakliYazi(ctx.ana);
    s.drawText('Kampanya', { x: KENAR + 6, y, size: 7.5, font: ctx.kalin, color: bantYazi });
    sutunlar.forEach((k, i) => {
      const metin = COLUMN_LABELS[k];
      const x =
        KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.kalin.widthOfTextAtSize(metin, 7.5) - 6;
      s.drawText(metin, { x, y, size: 7.5, font: ctx.kalin, color: bantYazi });
    });
    y -= BANT + 8;

    /*
     * VERİ ÇUBUĞU ÖLÇEĞİ: en yüksek harcama. Satır satır hesaplamak her
     * satırı %100 yapar ve çubuk hiçbir şey anlatmazdı.
     */
    const enYuksekHarcama = Math.max(
      ...satirlar.map((r) => Number(BigInt(r.spendMicros) / 1000n) / 1000),
      0,
    );

    for (const [sira, r] of satirlar.entries()) {
      // SAYFA TAŞMASI: alt kenara gelince yeni sayfa. Kontrol olmadan
      // satırlar sayfanın dışına çizilir ve PDF hata VERMEZ — sadece
      // görünmezler.
      if (y < KENAR + 40) break;

      /*
       * ZEBRA — gözün on beş sütunlu bir satırda kaymaması için.
       * Kampanya adı solda, sayılar sağda; ayırıcı olmadan okuyucu yanlış
       * satırın rakamını okuyor ve bu, müşteriye giden belgede sessiz bir
       * yanlış bilgi.
       */
      if (sira % 2 === 1) {
        s.drawRectangle({
          x: KENAR,
          y: y - 4,
          width: EN - 2 * KENAR,
          height: 14,
          color: rgb(0.973, 0.973, 0.98),
        });
      }

      /*
       * VERİ ÇUBUĞU — harcamanın satırlar arasındaki PAYI, adın ARKASINDA.
       *
       * Rakamlar sağa yaslı ve okunuyor ama "hangi kampanya baskın" sorusu
       * yine kafada hesaplanıyordu.
       *
       * İlk denemede çubuk adın ALTINA ince bir çizgi olarak çiziliyordu ve
       * ALTÇİZGİ gibi okunuyordu — bir bağlantı ya da vurgu sanılıyor,
       * büyüklük anlatmıyordu. Arka plan dolgusu (Excel'in "veri çubuğu"
       * deseni) aynı bilgiyi yanlış okunmadan veriyor.
       */
      if (enYuksekHarcama > 0) {
        const oran = Number(BigInt(r.spendMicros) / 1000n) / 1000 / enYuksekHarcama;
        s.drawRectangle({
          x: KENAR + 4,
          y: y - 3.5,
          width: Math.max(2, (adGenislik - 10) * oran),
          height: 13,
          color: acikTon(ctx.ana, 0.16),
        });
      }

      s.drawText(kirp(r.name, ctx.normal, 8.5, adGenislik - 6), {
        x: KENAR + 6,
        y,
        size: 8.5,
        font: ctx.normal,
        color: SIYAH,
      });

      sutunlar.forEach((k, i) => {
        const metin = hucre(k, r, ctx.data.currency);
        const x =
          // SAĞ İÇ BOŞLUK BAŞLIKLA AYNI (6): ayrışırsa sayı sütunu
          // başlığından bir tık kayıyor ve tablo eğri görünüyor.
          KENAR + adGenislik + (i + 1) * sutunGenislik - ctx.normal.widthOfTextAtSize(metin, 8.5) - 6;
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
        thickness: 0.8,
        color: rgb(0.75, 0.75, 0.78),
      });
      s.drawText('TOPLAM', { x: KENAR + 6, y, size: 8.5, font: ctx.kalin, color: SIYAH });
      sutunlar.forEach((k, i) => {
        // TOPLANAMAYAN SÜTUN BOŞ KALIYOR, sıfır yazılmıyor: erişimde toplam
        // "iki kat kitle" demek olurdu.
        const bicim = COLUMN_TOTALS[k];
        if (!bicim) return;
        const metin = bicim(t, ctx.data.currency);
        s.drawText(metin, {
          x:
            KENAR +
            adGenislik +
            (i + 1) * sutunGenislik -
            ctx.kalin.widthOfTextAtSize(metin, 8.5) -
            6,
          y,
          size: 8.5,
          font: ctx.kalin,
          color: SIYAH,
        });
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

  private baslik(ctx: Ctx, s: PDFPage, metin: string): number {
    // BÖLÜM ADININ ÜSTÜNDE MARKA RENGİNDE KISA BİR KURAL. Sayfanın nerede
    // başladığını söylüyor ve belgeye kimliğini taşıyan üçüncü öğe.
    s.drawRectangle({ x: KENAR, y: BOY - 48, width: 34, height: 4, color: ctx.vurgu });
    s.drawText(metin, { x: KENAR, y: BOY - 72, size: 17, font: ctx.kalin, color: SIYAH });
    s.drawText(`${ctx.data.client.name} · ${gun(ctx.data.from)} — ${gun(ctx.data.to)}`, {
      x: KENAR,
      y: BOY - 89,
      size: 8.5,
      font: ctx.normal,
      color: GRI,
    });

    /*
     * ALTBİLGİ HER İÇERİK SAYFASINDA. Yazıcıdan çıkan ya da e-postayla
     * dolaşan bir belgede sayfalar ayrılabiliyor; hangi müşteriye ve hangi
     * döneme ait olduğu her sayfada yazmalı.
     *
     * Sayfa numarası `getPageCount()`ten: bölümler şablona göre değiştiği
     * için sabit bir numara tutmak, bir bölüm çıkarıldığında sessizce
     * yanlış numaralar üretirdi.
     */
    altbilgi(s, {
      sol: ctx.data.branding.footerText ?? ctx.data.client.name,
      sag: `Sayfa ${ctx.doc.getPageCount()}`,
      x: KENAR,
      genislik: EN - 2 * KENAR,
      alt: KENAR - 18,
      font: ctx.normal,
      gri: GRI,
    });

    return BOY - 122;
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
