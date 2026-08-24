import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportData } from '@advetics/shared';
import { RaporPdfService } from './rapor-pdf.service';

/**
 * RAPOR PDF'İ.
 *
 * "PDF üretildi" DOĞRULAMA DEĞİL. Bir PDF her zaman üretilir: yanlış yazı
 * tipiyle, taşan satırlarla, eksik sütunlarla. Bu yüzden testler üretilen
 * BAYTLARA bakıyor — gerçek PDF mi, metin gömülü mü, Türkçe geçiyor mu.
 *
 * pdf-lib metin çıkarma sunmuyor; ama `subset` gömmede kullanılan glifler
 * ToUnicode haritasına yazılıyor ve ham baytlarda aranabiliyor. Aranan şey
 * gösterim değil VARLIK: "bu belge o karakteri gerçekten taşıyor mu".
 */
const VERI: ReportData = {
  client: { id: 'c1', name: 'Sabancı İnşaat' },
  branding: {
    logoUrl: null,
    primaryColor: '#000000',
    accentColor: '#111111',
    fontFamily: 'sans',
    footerText: null,
    hidePoweredBy: false,
  },
  title: 'Dijital Pazarlama Raporu',
  /*
   * METİN, SINANAN KARAKTERLERİN HEPSİNİ TAŞIMAK ZORUNDA.
   *
   * İlk hâlinde `ğ` hiç geçmiyordu ve test "belgede yok" diye düşüyordu —
   * kodun değil FIXTURE'ın eksiği. Gerçek bir rapor cümlesi yazıldı.
   */
  closingText:
    'Temmuz ayı genelinde Meta Ads reklamları 180 nitelikli form ve 213 anlık mesaj ile ' +
    'satış ekibinizin potansiyel müşteri havuzunu sağlamlaştırmıştır. ' +
    'Toplam harcama ₺34.026,44 · doğrudan arama niyeti güçlü.',
  from: '2026-07-01',
  to: '2026-07-31',
  sections: ['cover', 'summary', 'meta_campaigns', 'google_campaigns', 'google_keywords', 'closing'],
  options: {},
  rangeDays: 31,
  currency: 'TRY',
  platforms: [
    {
      label: 'Meta Ads',
      platform: 'meta',
      currency: 'TRY',
      impressions: 261_287,
      clicks: 3151,
      spendMicros: '24671710000',
      conversions: 393,
      conversionValueMicros: '0',
      ctr: 1.21,
      cpc: 7.83,
      cpa: 62.78,
      roas: null,
      conversionCounts: { form: 180, message: 213, purchase: 0 },
    },
  ] as unknown as ReportData['platforms'],
  total: null,
  metaCampaigns: [
    {
      id: 'k1',
      name: 'İkon Live — Lead (Form) · Bağcılar & Çiğli, geniş hedefleme',
      impressions: 4184,
      clicks: 66,
      spendMicros: '821770000',
      conversions: 5,
      conversionValueMicros: '0',
      reach: 3900,
      reachIsDailyAverage: false,
      dayCount: 31,
      ctr: 1.58,
      cpc: 12.45,
      cpa: 164.35,
      roas: null,
      conversionCounts: { form: 5, message: 0, purchase: 0 },
    },
  ] as unknown as ReportData['metaCampaigns'],
  googleCampaigns: [],
  daily: [],
  topAds: [],
  topAdsMissingPlatforms: [],
  keywords: [
    { keyword: 'urla satılık villa', spendMicros: '3037000000', impressions: 6250, clicks: 302, ctr: 4.83, cpc: 10.05 },
  ],
  searchTerms: [
    {
      term: 'urla satılık villa',
      keyword: 'urla villa',
      status: 'NONE',
      spendMicros: '3037000000',
      impressions: 6250,
      clicks: 302,
      conversions: 15,
      ctr: 4.83,
    },
  ],
  generatedAt: '2026-08-22T00:00:00.000Z',
};

const svc = new RaporPdfService();

/**
 * PDF'in İÇİNİ AÇIP BAKAR.
 *
 * İlk denemede ham baytlarda arıyordum ve test yanlış sebeple düşüyordu:
 * pdf-lib akışları FlateDecode ile SIKIŞTIRIYOR, yani ToUnicode haritası
 * ham baytlarda görünmüyor. Sıkıştırılmış içeriğe bakan bir doğrulama,
 * "PDF üretildi" demekten daha iyi değil.
 *
 * Bütün akışlar açılıp birleştiriliyor; ToUnicode haritası gömülü yazı
 * tipinin GERÇEKTEN hangi Unicode kod noktalarını taşıdığını yazıyor.
 */
function icerik(pdf: Buffer): string {
  const parcalar: string[] = [pdf.toString('latin1')];
  const ham = pdf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham)) !== null) {
    const bas = m.index + m[0].length;
    const son = ham.indexOf('endstream', bas);
    if (son === -1) continue;
    try {
      parcalar.push(
        inflateSync(Buffer.from(ham.slice(bas, son), 'latin1')).toString('latin1'),
      );
    } catch {
      /* sıkıştırılmamış ya da başka filtre — ham hâli zaten listede */
    }
  }
  return parcalar.join('\n').toLowerCase();
}

/**
 * Belgede ÇİZİLMİŞ metinler — her ToUnicode haritasıyla çözülmüş ADAYLAR.
 *
 * `iceriyorMu` yalnızca "şu karakter belgede geçiyor mu" diyebiliyor ve bu,
 * iddiaları karakter numarasına mahkûm ediyordu: bir cümlenin çizildiğini
 * sınamak için o cümleye özgü bir Türkçe harf aramak gerekiyordu. Burada
 * glif kimlikleri gerçek metne çevriliyor, yani `toContain('TOPLAM')`
 * diyebiliyoruz.
 *
 * NEDEN HER HARİTAYLA: alt küme gömmede aynı glif kimliği normal ve kalın
 * fontta FARKLI harfe karşılık geliyor, ve pdf-lib kaynak adını
 * `DejaVuSans-9742682568` gibi üretiyor — ada bakarak hangi haritanın hangi
 * fonta ait olduğu güvenilir biçimde çıkarılamıyor. Doğru haritayı seçmeye
 * çalışmak yerine HEPSİYLE çözüp adayların tamamı döndürülüyor: aranan
 * dizgenin yanlış bir haritadan tesadüfen çıkması pratikte imkânsız,
 * yanlış haritayı seçip metni kaçırmak ise kolay (bu dosyayı yazarken oldu).
 */
function metinler(pdf: Buffer): string[] {
  const ham = pdf.toString('latin1');
  const akislar: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ham)) !== null) {
    const bas = m.index + m[0].length;
    const son = ham.indexOf('endstream', bas);
    if (son === -1) continue;
    try {
      akislar.push(inflateSync(Buffer.from(ham.slice(bas, son), 'latin1')).toString('latin1'));
    } catch {
      akislar.push(ham.slice(bas, son));
    }
  }

  const haritalar: Array<Map<string, string>> = [];
  for (const a of akislar) {
    if (!a.includes('begincmap')) continue;
    const h = new Map<string, string>();
    for (const mm of a.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) {
      h.set(mm[1]!.toLowerCase(), String.fromCodePoint(parseInt(mm[2]!.slice(0, 4), 16)));
    }
    haritalar.push(h);
  }

  const out: string[] = [];
  for (const a of akislar) {
    if (!a.includes('Tj')) continue;
    for (const mm of a.matchAll(/<([0-9a-fA-F]+)>\s*Tj/g)) {
      const hex = mm[1]!;
      for (const h of haritalar) {
        let t = '';
        for (let i = 0; i + 4 <= hex.length; i += 4) t += h.get(hex.slice(i, i + 4).toLowerCase()) ?? '';
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/** Karakterin ToUnicode haritasında geçip geçmediği. */
function iceriyorMu(pdf: Buffer, karakter: string): boolean {
  const kod = karakter.codePointAt(0)!.toString(16).padStart(4, '0').toLowerCase();
  return icerik(pdf).includes(`<${kod}>`);
}

describe('RaporPdfService', () => {
  it('gerçek bir PDF üretiyor', async () => {
    const pdf = await svc.uret(VERI);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(3000);
  });

  it('KRİTİK: TÜRKÇE karakterler ve ₺ belgeye GİRİYOR', async () => {
    /*
     * "PDF üretildi" yetmiyor: standart yazı tipiyle de üretilirdi, yalnızca
     * `ğ ş ı ₺` düşerdi ve bunu ilk gören müşteri olurdu.
     */
    const KARAKTERLER = ['ş', 'İ', 'ı', 'ğ', 'ü', 'ç', '₺'];

    /*
     * ÖNCE ÖNCÜL: metin o karakterleri GERÇEKTEN taşıyor mu?
     *
     * İlk yazımda taşımıyordu (`ğ` fixture'da hiç geçmiyordu) ve test kodun
     * hatasıymış gibi düşüyordu. Öncülü doğrulamayan bir test, düştüğünde
     * yanlış yere baktırıyor.
     */
    const metin = [VERI.title, VERI.client.name, VERI.closingText ?? '', VERI.metaCampaigns[0]!.name]
      .join(' ');
    for (const ch of KARAKTERLER) {
      expect(metin, `fixture ${ch} taşımıyor — test kendi öncülünü sınayamaz`).toContain(ch);
    }

    const pdf = await svc.uret(VERI);
    for (const ch of KARAKTERLER) {
      expect(iceriyorMu(pdf, ch), `${ch} belgede yok`).toBe(true);
    }
  });

  it('bölüm SIRASI şablondan geliyor — sayfa sayısı bölüm sayısına bağlı', async () => {
    const az = await svc.uret({ ...VERI, sections: ['cover'] });
    const cok = await svc.uret(VERI);
    expect(cok.byteLength).toBeGreaterThan(az.byteLength);
  });

  it('KRİTİK: bilinmeyen bölüm PDF üretimini DÜŞÜRMÜYOR', async () => {
    // `top_ads` PDF'te henüz yok; şablonda seçili olması üretimi
    // patlatmamalı — kullanıcı raporu hiç alamazdı.
    await expect(
      svc.uret({ ...VERI, sections: ['cover', 'top_ads', 'closing'] }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('KRİTİK: şablondaki SÜTUN seçimi PDF’e yansıyor', async () => {
    // Panelde seçilen sütunlar PDF'te de geçerli olmalı; ayrışırsa aynı
    // rapor iki farklı tabloyla çıkar.
    const varsayilan = await svc.uret(VERI);
    const tekSutun = await svc.uret({
      ...VERI,
      options: { meta_campaigns: { metrics: ['spend'] } },
    });
    expect(tekSutun.byteLength).toBeLessThan(varsayilan.byteLength);
  });

  it('boş kampanya listesi SEBEBİYLE yazılıyor — boş sayfa değil', async () => {
    // Boş sayfa ile "veri yok" yazan sayfa arasındaki fark ölçülüyor:
    // sessizce boş bir sayfa göndermek, müşteriye "kampanyan yoktu" demek.
    const pdf = await svc.uret({ ...VERI, sections: ['google_campaigns'], googleCampaigns: [] });
    expect(iceriyorMu(pdf, 'ö')).toBe(true); // "dönemde" — Türkçe metin çizildi
    expect(pdf.byteLength).toBeGreaterThan(1500);
  });

  it('anahtar kelime null ise "yetenek yok" yazılıyor', async () => {
    // `null` "veri yok" değil "bu müşteride Google bağlantısı yok" demek.
    await expect(
      svc.uret({ ...VERI, sections: ['google_keywords'], keywords: null }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('kapanış metni yoksa sayfa AÇILMIYOR', async () => {
    const ile = await svc.uret({ ...VERI, sections: ['closing'] });
    const olmadan = await svc.uret({ ...VERI, sections: ['closing'], closingText: null });
    expect(olmadan.byteLength).toBeLessThan(ile.byteLength);
  });

  it('belge ÜSTVERİSİ müşteri adını taşıyor — okuyucu sekmesi ve dosya adı', async () => {
    const pdf = await svc.uret(VERI);
    // Başlık üstveride düz metin (UTF-16BE) olarak duruyor.
    expect(icerik(pdf)).toContain('/title');
  });
});

/**
 * ═══ ÖNE ÇIKAN REKLAMLAR BÖLÜMÜ ═══
 *
 * Bu bölüm PDF'te uzun süre YOKTU: kreatif görselini indirmek sunucudan
 * dışarı bir HTTP isteği demek ve o istek üç ayrı şekilde zarar verebiliyor
 * (SSRF, askıda kalan bağlantı, sınırsız gövde). Kontroller
 * `kreatif-gorseli.spec.ts` içinde; burada sınanan şey ÇİZİM: görsel gelsin
 * ya da gelmesin sayfanın bozulmaması ve eksiğin SEBEBİNİN yazılması.
 *
 * METİN DÜZ ARANAMIYOR. Yazı tipi ALT KÜME gömülüyor, yani çizilen metin
 * belgede glif kimlikleri olarak duruyor. Bu yüzden iddialar `iceriyorMu`
 * ile ToUnicode haritasına bakıyor ve fixture'ın geri kalanı BİLEREK ASCII:
 * belgede bir Türkçe karakter görünüyorsa kaynağı yalnızca uyarı cümlesi
 * olabilir. (Aynı tuzağa bu dosyanın ilk hâlinde de düşülmüştü.)
 */
describe('öne çıkan reklamlar', () => {
  const JPEG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  );

  /**
   * KÜÇÜK `ç` UYARI CÜMLESİNE ÖZGÜ — ve bu seçim ölçülerek yapıldı.
   *
   * İlk denemem `ı` idi ve YANLIŞTI: bölüm başlığı "Öne Çıkan Reklamlar"
   * zaten `ı` taşıyor, yani harf uyarı hiç çizilmese de belgede vardı ve
   * iddia her zaman doğru çıkıyordu.
   *
   * Küçük `ç` yalnızca uyarının son kelimesinde ("çözebilir") geçiyor:
   * başlıktaki `Ç` BÜYÜK (ayrı kod noktası), satırlardaki "dönüşüm" ve
   * yer tutucudaki "görsel yok" `ç` taşımıyor, fixture metinleri ASCII.
   *
   * Bu ikisi birbirini doğruluyor: NEGATİF test (görseli olmayan reklam)
   * belgede başka hiçbir `ç` kaynağı olmadığını, POZİTİF test uyarının onu
   * eklediğini gösteriyor.
   */
  const UYARI_HARFI = 'ç';

  function veri(over: Partial<ReportData> = {}): ReportData {
    return {
      ...VERI,
      // Fixture ASCII: aşağıdaki iddia buna dayanıyor.
      client: { id: 'c1', name: 'Sabanci Insaat' },
      title: 'Rapor',
      closingText: null,
      sections: ['top_ads'],
      topAds: [
        {
          id: 'a1',
          name: 'Ikon Live gorselli reklam',
          campaignName: 'Bagcilar kampanyasi',
          platform: 'meta' as const,
          imageUrl: 'https://scontent.xx.fbcdn.net/v/gorsel.jpg',
          headline: 'Simdi kesfet',
          spendMicros: '821770000',
          conversions: 5,
          cpa: 164.35,
          ctr: 1.58,
        },
        {
          id: 'a2',
          name: 'Urla villa arama reklami',
          campaignName: 'Google Search',
          platform: 'google' as const,
          // GÖRSEL ADRESİ HİÇ YOK: Google arama reklamının normal hâli.
          imageUrl: null,
          headline: 'Urlada satilik villa',
          spendMicros: '303700000',
          conversions: 15,
          cpa: 20.24,
          ctr: 4.83,
        },
      ],
      ...over,
    };
  }

  /** Ağ ÇAĞRILMIYOR: gerçek CDN'e çıkmak testi hem yavaş hem kırılgan yapardı. */
  const dusen = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
  const veren = (async () => new Response(JPEG_1x1)) as unknown as typeof fetch;

  it('KRİTİK: fixture ASCII — test kendi öncülünü sınıyor', () => {
    /*
     * Bu iddia olmadan aşağıdaki testler SESSİZCE değersizleşir: fixture'a
     * bir gün Türkçe karakter girerse `iceriyorMu` her zaman true döner ve
     * "uyarı çizildi" iddiası hep doğru olur.
     */
    const d = veri();
    const metin = [
      d.title,
      d.client.name,
      ...d.topAds.flatMap((a) => [a.name, a.campaignName, a.headline ?? '']),
    ].join(' ');
    expect(metin).not.toContain(UYARI_HARFI);
  });

  it('KRİTİK: bölüm GERÇEKTEN çiziliyor — sessizce atlanmıyor', async () => {
    /*
     * ESKİ DAVRANIŞ: `top_ads` şablonda seçiliyse PDF onu SESSİZCE atlıyordu.
     * Danışman bölümü seçiyor, belgede hiç görmüyor ve sebebini hiçbir yerde
     * bulamıyordu.
     */
    const ile = await svc.uret(veri(), { getir: veren });
    const olmadan = await svc.uret(veri({ sections: [] }), { getir: veren });
    expect(ile.byteLength).toBeGreaterThan(olmadan.byteLength + 500);
  });

  it('KRİTİK: alınamayan görsel SAYIYLA bildiriliyor', async () => {
    // Platform CDN adresleri süreli. Sayı yazılmazsa danışman belgeyi
    // müşteriye gönderdikten SONRA öğreniyor.
    const pdf = await svc.uret(veri(), { getir: dusen });
    expect(iceriyorMu(pdf, UYARI_HARFI), 'uyarı cümlesi çizilmemiş').toBe(true);
  });

  it('KRİTİK: görseli OLMAYAN reklam "alınamadı" SAYILMIYOR', async () => {
    /*
     * İKİ DURUM AYRI. Google arama reklamının görseli hiç yok — bu bir arıza
     * değil. İkisini aynı cümleye çevirmek, olmayan bir sorunu her raporda
     * bildirmek olurdu ve uyarı okunmaz hâle gelirdi.
     */
    const yalnizMetin = veri().topAds[1]!;
    const pdf = await svc.uret(veri({ topAds: [yalnizMetin] }), { getir: dusen });
    expect(iceriyorMu(pdf, UYARI_HARFI), 'olmayan bir arıza bildirilmiş').toBe(false);
  });

  it('gerçek JPEG belgeye GÖMÜLÜYOR', async () => {
    const pdf = await svc.uret(veri(), { getir: veren });
    // Gömülü JPEG PDF'te DCTDecode filtresiyle duruyor.
    expect(icerik(pdf)).toContain('/dctdecode');
    // Ve görsel geldiği için uyarı YOK.
    expect(iceriyorMu(pdf, UYARI_HARFI)).toBe(false);
  });

  it('KRİTİK: geniş görsel KAREYE EZİLMİYOR', async () => {
    /*
     * Reklam görselleri çoğunlukla 1200×628. Sabit 56×56 çizmek onu kareye
     * sıkıştırıyor ve müşteriye giden belgenin tamamını özensiz gösteriyor.
     *
     * Ölçüm çizim komutundan: pdf-lib görselin genişlik/yükseklik matrisini
     * içerik akışına yazıyor. Kare çizimde ikisi EŞİT olurdu.
     */
    const kaynak = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');
    const i = kaynak.indexOf("if (sonuc && 'img' in sonuc)");
    expect(i, 'çizim dalı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kaynak.slice(i, kaynak.indexOf('} else {', i));
    expect(dilim).toContain('Math.min(KUTU / sonuc.img.width, KUTU / sonuc.img.height)');
    expect(dilim).not.toContain('width: KUTU, height: KUTU');
  });

  it('KRİTİK: bozuk baytlar PDF üretimini DÜŞÜRMÜYOR', async () => {
    /*
     * Baytlar doğru JPEG imzasını taşıyıp yine de bozuk olabiliyor (kesik
     * indirme). `embedJpg` o durumda fırlatıyor ve tek bir reklamın görseli
     * yüzünden müşteriye giden belgenin tamamı kaybolurdu.
     */
    const bozuk = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x02]);
    const getir = (async () => new Response(bozuk)) as unknown as typeof fetch;
    const pdf = await svc.uret(veri(), { getir });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(iceriyorMu(pdf, UYARI_HARFI), 'bozuk görsel sessizce yutulmuş').toBe(true);
  });

  it('KRİTİK: KALICI hata GEÇİCİ hatadan ayrı yazılıyor', async () => {
    /*
     * YAPILACAK İŞ FARKLI. "zaman aşımı" geçici — raporu yeniden üretmek
     * çözüyor. "desteklenmeyen biçim" kalıcı: Meta thumbnail'ı WebP dönmüş
     * ve pdf-lib onu gömemiyor; yeniden üretmek hiçbir şeyi değiştirmiyor.
     * Tek bir "alınamadı" cümlesi danışmanı sonuçsuz bir denemeye gönderirdi.
     */
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    const getir = (async () => new Response(webp)) as unknown as typeof fetch;
    const webpPdf = await svc.uret(veri(), { getir });
    const dusenPdf = await svc.uret(veri(), { getir: dusen });

    /*
     * `J` SEBEP DİZGESİNE ÖZGÜ: "desteklenmeyen biçim (yalnızca JPEG/PNG)".
     * Belgenin geri kalanında — başlık, tarih, ASCII fixture, sayılar — hiç
     * `J` yok. 404 belgesinde de yok; ikisinin karşılaştırılması sebebin
     * GERÇEKTEN yazıldığını, sabit bir cümle olmadığını gösteriyor.
     */
    expect(iceriyorMu(webpPdf, 'J'), 'kalıcı sebep yazılmamış').toBe(true);
    expect(iceriyorMu(dusenPdf, 'J'), 'sebep sabit yazılıyor olmalı değil').toBe(false);
    expect(iceriyorMu(webpPdf, UYARI_HARFI)).toBe(true);
  });

  it('KRİTİK: bölüm seçili DEĞİLSE hiç indirme yapılmıyor', async () => {
    // Koşulsuz indirmek, `top_ads` içermeyen her raporu altı ağ isteği kadar
    // yavaşlatırdı — ve o istekler belgede hiç görünmezdi.
    let cagri = 0;
    const sayan = (async () => {
      cagri++;
      return new Response(JPEG_1x1);
    }) as unknown as typeof fetch;
    await svc.uret(veri({ sections: ['summary'] }), { getir: sayan });
    expect(cagri).toBe(0);
  });

  it('KRİTİK: her platform AYRI SAYFADA', async () => {
    /*
     * Tek sayfada karışık listelendiğinde harcaması büyük olan platform
     * listeyi tamamen dolduruyordu: Google'ın en iyi reklamı Meta'nın
     * altında hiç görünmüyordu.
     */
    const [meta, google] = veri().topAds;
    const pdf = await svc.uret(veri({ topAds: [meta!, google!] }), { getir: veren });

    const t = metinler(pdf);
    // Başlık her sayfada, alt başlıkta platform adı.
    expect(t.filter((x) => x === 'ÖNE ÇIKAN REKLAMLAR')).toHaveLength(2);
    expect(t).toContain('META ADS');
    expect(t).toContain('GOOGLE ADS');
  });

  it('KRİTİK: reklamı OLMAYAN platform için sayfa açılmıyor', async () => {
    // Boş bir sayfa, müşteriye giden belgede "burada bir şey olacaktı"
    // izlenimi bırakır.
    const meta = veri().topAds[0]!;
    const pdf = await svc.uret(veri({ topAds: [meta] }), { getir: veren });
    expect(metinler(pdf).filter((x) => x === 'ÖNE ÇIKAN REKLAMLAR')).toHaveLength(1);
  });

  it('eksik platform uyarısı YALNIZCA ilk sayfada', async () => {
    // Her sayfada tekrarlayan bir uyarı okunmaz hâle gelir.
    const [meta, google] = veri().topAds;
    const say = async (reklamlar: typeof veri extends never ? never : Parameters<typeof veri>[0]) =>
      metinler(await svc.uret(veri(reklamlar), { getir: veren })).filter((x) =>
        x.includes('reklam seviyesi veri yok'),
      ).length;

    /*
     * İDDİA İKİ BELGENİN KIYASI, MUTLAK SAYI DEĞİL.
     *
     * `metinler` her dizgeyi iki ToUnicode haritasıyla çözüyor ve uyarı
     * satırlara sarılıyor; mutlak bir sayı beklemek kırılgan ve gevşek
     * oluyordu — "her sayfada yaz" mutasyonu üst sınırın altında kalıp
     * yakalanmadı. İki sayfalı belge, tek sayfalıyla AYNI sayıda uyarı
     * taşımalı.
     */
    const ikiSayfa = await say({
      topAds: [meta!, google!],
      topAdsMissingPlatforms: ['meta'],
    });
    const tekSayfa = await say({ topAds: [meta!], topAdsMissingPlatforms: ['meta'] });

    expect(tekSayfa).toBeGreaterThan(0);
    expect(ikiSayfa).toBe(tekSayfa);
  });

  it('KRİTİK: REKLAM SEVİYESİ VERİSİ OLMAYAN platform bildiriliyor', async () => {
    /*
     * BÖLÜMÜN EN YANILTICI HÂLİ BUYDU. Liste harcamaya göre sıralıyor ve
     * platform ayırmıyor; Meta'nın reklam seviyesi satırı hiç yoksa sayfa
     * yalnızca Google reklamlarını gösteriyor ve okuyan "Meta'nın öne çıkan
     * reklamı yokmuş" diye anlıyor.
     *
     * Doğrusu yapısal: 90 günlük ilk çekim BİLEREK yalnızca kampanya
     * seviyesinde koşuyor (ad seviyesinde 90 gün çekmek kotayı saatlerce
     * bloklar), reklam kırılımı yalnızca gecelik iş ve 7 günlük geri
     * düzeltmeden geliyor. Hesap o dönemde gecelik senkronize etmiyorsa o
     * dönemin reklam verisi HİÇ gelmiyor.
     */
    const pdf = await svc.uret(veri({ topAdsMissingPlatforms: ['meta'] }), { getir: veren });
    const t = metinler(pdf).join(' ');
    expect(t).toContain('Meta Ads');
    expect(t).toContain('reklam seviyesi veri yok');
  });

  it('eksik platform yoksa uyarı da YOK', async () => {
    // Her raporda duran bir uyarı okunmaz hâle gelir ve gerçek bir eksiklik
    // onun içinde kaybolur.
    const pdf = await svc.uret(veri({ topAdsMissingPlatforms: [] }), { getir: veren });
    expect(metinler(pdf).join(' ')).not.toContain('reklam seviyesi veri yok');
  });

  it('KRİTİK: liste BOŞ olsa bile eksik platform bildiriliyor', async () => {
    /*
     * İki platformun da reklam seviyesi verisi yoksa liste boş kalıyor.
     * Bölümü tamamen atlamak, "bu dönemde öne çıkan reklam yok" demekle
     * aynı sessiz yanlışa düşerdi.
     */
    const pdf = await svc.uret(
      veri({ topAds: [], topAdsMissingPlatforms: ['meta', 'google'] }),
      { getir: veren },
    );
    const t = metinler(pdf).join(' ');
    expect(t).toContain('Meta Ads ve Google Ads');
  });

  it('KRİTİK: sayfaya sığmayan reklamlar SESSİZCE düşmüyor', async () => {
    /*
     * Sayfa dolduğunda döngü kırılıyor. Bugün sorgu altı satırla sınırlı ve
     * hepsi sığıyor; o sınır büyütülürse belge sessizce eksik basılır ve
     * farkı ilk gören müşteri olur — bu projenin tekrar eden hata deseni.
     *
     * `Z` SAYIM CÜMLESİNE ÖZGÜ DEĞİL, o yüzden ölçüm karşılaştırmayla:
     * on iki reklamlı belge, altı reklamlı belgeden BÜYÜK olmalı ama
     * satırların hepsini çizemez; uyarı cümlesi farkı `ğ` ile gösteriyor
     * ("sığdı").
     */
    const tek = veri().topAds[1]!;
    const cok = Array.from({ length: 14 }, (_, i) => ({ ...tek, id: `a${i}`, name: `Reklam ${i}` }));
    const pdf = await svc.uret(veri({ topAds: cok }), { getir: veren });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(iceriyorMu(pdf, 'ğ'), 'kesme bildirilmemiş').toBe(true);
  });

  it('reklam yoksa SEBEBİ yazılıyor — boş sayfa değil', async () => {
    const bos = await svc.uret(veri({ topAds: [] }), { getir: veren });
    // "Bu dönemde harcama yapan reklam yok." — Türkçe metin çizildi.
    expect(iceriyorMu(bos, 'ö')).toBe(true);
  });
});

/**
 * ═══ PDF GÖRSELLİĞİ — REFERANS PANELDEKİ BELGE ═══
 *
 * Bu testlerin ilk hâli BENİM tasarım tercihlerimi kilitliyordu: tam sayfa
 * marka bandı, dolgulu tablo başlığı, zebra satırlar, veri çubukları, sayfa
 * altbilgisi. Kullanıcının cevabı "çok pastel boya çizimi gibi olmuş" oldu ve
 * haklıydı — aynı raporun iki gösterimi iki farklı görsel dil konuşuyordu.
 *
 * Referans `apps/web/src/components/report/report-document.tsx`. Aşağıdaki
 * iddialar oradan ölçülen kararları tutuyor; birini gevşetmek iki belgeyi
 * yeniden ayrıştırır.
 */
describe('PDF görselliği', () => {
  const KAYNAK = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');

  function gunluk(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      spendMicros: String((i + 1) * 1_000_000),
      conversionCounts: { form: (i % 3) + 1, message: 1, purchase: 0 },
    }));
  }

  it('KRİTİK: MARKA RENGİ belgeye giriyor', async () => {
    /*
     * Beyaz etiketli bir üründe markanın rengi müşteriye giden belgede
     * görünmüyorsa ürünün ana vaadi orada yok demektir. Renk ÜÇ yerde:
     * bölüm alt başlığı, TOPLAM kartının dolgusu, kapaktaki kısa çizgi.
     *
     * Ölçüm renk operatöründen: #E4572E → 0.894 0.341 0.18 rg.
     */
    const pdf = await svc.uret({
      ...VERI,
      sections: ['summary'],
      branding: { ...VERI.branding, primaryColor: '#E4572E', accentColor: '#E4572E' },
    });
    expect(icerik(pdf)).toMatch(/0\.89\d+ 0\.34\d+ 0\.18\d* rg/);
  });

  it('KRİTİK: BOZUK marka rengi PDF üretimini düşürmüyor', async () => {
    // Renk panelden serbest metin giriliyor; tek hatalı karakter yüzünden
    // müşteriye giden belgenin üretilmemesi kabul edilemez.
    await expect(
      svc.uret({
        ...VERI,
        sections: ['cover'],
        branding: { ...VERI.branding, primaryColor: 'mavi', accentColor: '' },
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('KRİTİK: ÖZET ETİKETLERİ panelle aynı', async () => {
    /*
     * PDF "Harcama" ve "Ort. TBM" yazıyordu, panel ise "Maliyet" ve "EBM".
     * Aynı rapor iki gösterimde farklı metrikleri farklı adlarla
     * gösteriyordu ve bunu fark eden müşteri olurdu.
     */
    const t = metinler(await svc.uret({ ...VERI, sections: ['summary'] }));
    expect(t).toContain('MALİYET');
    expect(t).toContain('EBM');
    expect(t).not.toContain('ORT. TBM');
  });

  it('KRİTİK: GÜNLÜK DÖNÜŞÜM GRAFİĞİ kampanya sayfasında çiziliyor', async () => {
    /*
     * Grafik bir süre ÖZET sayfasındaydı ve harcama barı + dönüşüm çizgisi
     * çiziyordu. Referansta grafik KAMPANYA sayfasında ve FORM ile MESAJ'ın
     * GRUPLU barları — yığmak ya da tek seriye indirmek "toplam dönüşüm"
     * izlenimi verir, oysa soru "hangisi artıyor".
     */
    const ile = await svc.uret({ ...VERI, sections: ['meta_campaigns'], daily: gunluk(20) });
    const olmadan = await svc.uret({ ...VERI, sections: ['meta_campaigns'], daily: [] });
    expect(metinler(ile)).toContain('Günlük dönüşüm seyri');
    expect(metinler(olmadan)).not.toContain('Günlük dönüşüm seyri');
  });

  it('tek günlük seride grafik çizilmiyor', async () => {
    // KIYAS BOŞ SERİYLE: bir noktayı yirmi noktayla kıyaslamak, koşulu
    // `> 1`den `> 0`a çeviren mutasyonu kaçırıyordu.
    const bir = await svc.uret({ ...VERI, sections: ['meta_campaigns'], daily: gunluk(1) });
    const bos = await svc.uret({ ...VERI, sections: ['meta_campaigns'], daily: [] });
    expect(bir.byteLength).toBe(bos.byteLength);
  });

  it('KRİTİK: kampanya tablosunda GENEL TOPLAM satırı var', async () => {
    const pdf = await svc.uret({ ...VERI, sections: ['meta_campaigns'] });
    expect(metinler(pdf)).toContain('GENEL TOPLAM');
  });

  it('KRİTİK: TOPLANAMAYAN sütun toplam satırında "—" basıyor', async () => {
    /*
     * Erişimde toplam "iki kat kitle" demek: aynı kişi iki kampanyayı da
     * görmüş olabilir. Boş bırakmak "hesaplanmadı" gibi okunuyordu; panelde
     * de "—" basılıyor.
     */
    const erisim = await svc.uret({
      ...VERI,
      sections: ['meta_campaigns'],
      options: { meta_campaigns: { metrics: ['reach'] } },
    });
    expect(metinler(erisim)).toContain('—');
  });

  it('KRİTİK: toplam PANELLE aynı kaynaktan — ikinci defter yok', () => {
    expect(KAYNAK).toContain('COLUMN_TOTALS[k]');
    expect(KAYNAK).not.toMatch(/const\s+TOPLAMLAR\s*[:=]/);
  });

  it('KRİTİK: panelde OLMAYAN süslemeler geri gelmiyor', () => {
    /*
     * REGRESYON BEKÇİSİ. Dolgulu tablo başlığı, zebra satır, veri çubuğu,
     * sayfa altbilgisi ve platform pay çubuğu benim eklemelerimdi ve
     * referansta yok. Biri geri eklenirse belge yeniden panelden ayrışır.
     */
    for (const yasak of ['payCubugu', 'altbilgi(', 'acikTon(', 'const BANT']) {
      expect(KAYNAK, `${yasak} geri gelmiş`).not.toContain(yasak);
    }
  });

  it('KRİTİK: KAPAK panelin düzeninde — başlık kelime kelime', () => {
    /*
     * Referans başlığı `title.split(' ')` ile kelime kelime satıra
     * bölüyor. Tek satıra sığdırmak aynı belgenin iki farklı kapakla
     * çıkması demekti.
     */
    const i = KAYNAK.indexOf('private kapak');
    expect(i, 'kapak bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = KAYNAK.slice(i, KAYNAK.indexOf('private ozet', i));
    expect(dilim).toContain(".split(/\\s+/)");
    expect(dilim).not.toContain('BANT_Y');
  });

  it('logo YOKSA / İNDİRİLEMEZSE kapak yine basılıyor', async () => {
    const getir = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    const pdf = await svc.uret(
      {
        ...VERI,
        sections: ['cover'],
        branding: { ...VERI.branding, logoUrl: 'https://profaj.com/logo.png' },
      },
      { getir },
    );
    expect(metinler(pdf)).toContain(VERI.client.name);
  });
});
