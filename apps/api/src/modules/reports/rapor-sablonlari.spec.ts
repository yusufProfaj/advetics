import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  REPORT_SECTIONS,
  SECTION_LABELS,
  VARSAYILAN_SABLONLAR,
  sablonPlatformu,
  varsayilanSablon,
} from '@advetics/shared';

/**
 * ═══ ÜÇ VARSAYILAN ŞABLON ═══
 *
 * En kritik iddia PLATFORM SÜZGECİ etrafında: "Google Ads Şablonu" yalnızca
 * bölüm listesini daraltsaydı, raporun ÖZET KARTLARINDA Meta harcaması
 * görünür ve tablolar toplamı tutmazdı — aynı belgede iki farklı gerçek ve
 * hiçbir hata mesajı yok.
 */
const SERVIS = readFileSync(join(__dirname, 'reports.service.ts'), 'utf8');
const PDF = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');

/** Yorum satırlarını atar — dosyalar bu kuralları ANLATAN yorumlar taşıyor. */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('şablon tanımları', () => {
  it('üç şablon var', () => {
    expect(VARSAYILAN_SABLONLAR.map((s) => s.kod)).toEqual(['genel', 'google', 'meta']);
  });

  it('her şablonun bölümleri GEÇERLİ', () => {
    // Geçersiz bir bölüm adı raporda sessizce atlanıyor (`default: null`) ve
    // kullanıcı eksik bölümü bir arıza sanıyor.
    for (const s of VARSAYILAN_SABLONLAR) {
      for (const b of s.sections) {
        expect(REPORT_SECTIONS as readonly string[], `${s.kod}: ${b}`).toContain(b);
      }
    }
  });

  it('her bölümün Türkçe etiketi var', () => {
    // Etiketi olmayan bölüm başlıkta `undefined` yazardı.
    for (const b of REPORT_SECTIONS) {
      expect(SECTION_LABELS[b], `${b} etiketi yok`).toBeTruthy();
    }
  });

  it('bilinmeyen kod GENEL şablona düşüyor', () => {
    // Adres çubuğuna elle yazılan bir değerin raporu boş bırakması, hata
    // mesajı olmayan bir arıza olurdu.
    expect(varsayilanSablon('yok-boyle').kod).toBe('genel');
    expect(varsayilanSablon(undefined).kod).toBe('genel');
  });
});

describe('KRİTİK: platform daraltması', () => {
  it('Google şablonu google, Meta şablonu meta, genel null', () => {
    expect(sablonPlatformu('google')).toBe('google');
    expect(sablonPlatformu('meta')).toBe('meta');
    expect(sablonPlatformu('genel')).toBeNull();
  });

  it('Google şablonunda META kampanya bölümü YOK', () => {
    const g = VARSAYILAN_SABLONLAR.find((s) => s.kod === 'google')!;
    expect(g.sections as readonly string[]).not.toContain('meta_campaigns');
  });

  it('Meta şablonunda GOOGLE bölümleri YOK', () => {
    const m = VARSAYILAN_SABLONLAR.find((s) => s.kod === 'meta')!;
    for (const b of ['google_campaigns', 'google_keywords', 'google_search_terms']) {
      expect(m.sections as readonly string[]).not.toContain(b);
    }
  });

  /**
   * Bir metodun gövdesini SINIRINA kadar alır.
   *
   * Sabit uzunluklu dilim iki yönde de kırılgan: gövde büyüyünce iddia
   * dilimden düşüyor, küçülünce komşu metoda taşıyor ve iddia yanlış
   * gövdede tutuyor — ikincisi sessiz.
   */
  const metotGovdesi = (ad: string): string => {
    const k = kod(SERVIS);
    const i = k.indexOf(`private async ${ad}(`);
    if (i === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
    const sonraki = k.indexOf('\n  private ', i + 1);
    return k.slice(i, sonraki === -1 ? undefined : sonraki);
  };

  it.each(['platformBlocks', 'campaignRows', 'dailySeries', 'topAds', 'topAdsMissingPlatforms'])(
    'KRİTİK: %s süzgeci uyguluyor',
    (metot) => {
      /*
       * Bu iddia bir kez gerçek bir hatayı yakaladı: `sorgu` nesnesine
       * `platform` eklendiğinde alt sorguların HİÇBİRİ onu okumuyordu ve
       * süzgeç sessizce etkisizdi. TypeScript bir şey söylemiyordu — fazladan
       * alan hata değil.
       *
       * İDDİA SAYIM DEĞİL, METOT METOT. Önceki hâli "en az yedi yerde geçsin"
       * diyordu ve o sayı, iki metotta ÇİFT yazılmış satırlar sayesinde
       * tutuyordu — yani test hatayı doğruluyordu. Kopyalar temizlenince
       * düştü.
       */
      expect(metotGovdesi(metot)).toContain('platformFiltresi(params.platform');
    },
  );

  it('KRİTİK: kırılım sorgusu hem PLATFORMU hem BOYUTU süzüyor', () => {
    /*
     * BOYUT SÜZGECİ EKSİKTİ ve üretime çıktı: "Yaş Dağılımı" tablosunda
     * Erkek/Kadın/yerleşim satırları görünüyor, "Cinsiyet Dağılımı" birebir
     * aynı satırları basıyordu. Her tablo beş boyutu birden gösteriyor,
     * toplamı beş boyutun toplamı oluyor ve pay yüzdeleri o yanlış toplamdan
     * hesaplanıyordu. Hiçbir hata düşmedi: boyut yalnızca bloğun etiketinde
     * kullanılıyordu.
     */
    /*
     * İDDİA ANA SORGUNUN DİLİMİNE ÇAPALI, metodun tamamına değil.
     *
     * `breakdownBlocks` İKİ sorgu içeriyor: satırları getiren ana sorgu ve
     * "bu boyutu vermeyen platformlar" alt sorgusu. İkincisi de aynı boyut
     * koşulunu taşıyor, yani metot gövdesine bakan bir iddia ANA SORGUDAN
     * koşul silindiğinde bile tutuyordu — mutasyonda tam bu oldu.
     */
    const g = metotGovdesi('breakdownBlocks');
    const bas = g.indexOf('FROM insight_breakdowns b');
    const son = g.indexOf('GROUP BY b.value', bas);
    expect(bas, 'kırılım ana sorgusu bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(son, 'kırılım ana sorgusunun sonu bulunamadı').toBeGreaterThan(bas);
    const anaSorgu = g.slice(bas, son);

    expect(anaSorgu).toContain('AND b.dimension = ${dimension}::"BreakdownDimension"');
    expect(anaSorgu).toContain('AND b.platform = ${params.platform}::"Platform"');
  });

  it('süzgeç hiçbir sorguda İKİ KEZ yazılmıyor', () => {
    // Zararsız ama kopyalanmış bir koşul, sayıma dayanan iddiaları bozuyor
    // ve bir sonraki okuyanı "hangisi doğru" diye düşündürüyor.
    for (const m of ['campaignRows', 'topAds']) {
      const g = metotGovdesi(m);
      expect(g.split('platformFiltresi(params.platform').length - 1, `${m} çift süzgeç`).toBe(1);
    }
  });

  it('süzgeç TEK yerde tanımlı', () => {
    // Yedi sorguya elle yazılsaydı biri unutulduğunda o tablonun toplamı
    // özet kartlarını tutmazdı.
    expect(kod(SERVIS)).toContain('function platformFiltresi(');
  });

  it('Meta şablonunda Google-only sorgular HİÇ koşmuyor', () => {
    // Gösterilmeyecek satırları taramak boşa iş.
    const k = kod(SERVIS);
    expect(k.split("if (params.platform === 'meta') return null;").length - 1).toBe(2);
  });

  it('KRİTİK: öncelik sırası — kendi şablonu > ön ayar > kayıtlı varsayılan', () => {
    /*
     * ÜÇ HÂL VE SIRASI ÖNEMLİ:
     *   · `templateId` verilmiş  → kullanıcının kendi şablonu (en açık tercih)
     *   · `sablon` seçilmiş      → ön ayar
     *   · ikisi de yok           → KAYITLI varsayılan şablon
     *
     * Üçüncüsü ilk yazışımda kayboldu: ön ayarı koşulsuz uyguladığım için
     * org varsayılanı olarak kaydedilmiş bir şablonun bölüm sırası sessizce
     * eziliyordu ve kullanıcı Rapor Şablonları ekranında yaptığı düzenlemeyi
     * raporda hiç göremiyordu. Mevcut testler yakaladı.
     */
    expect(kod(SERVIS)).toContain(
      'params.templateId || !params.sablon ? null : varsayilanSablon(params.sablon)',
    );
  });
});

describe('kırılım bölümleri', () => {
  it('beş boyut da bölüm olarak tanımlı', () => {
    for (const b of [
      'audience_age',
      'audience_gender',
      'audience_placement',
      'audience_hour',
      'audience_city',
    ]) {
      expect(REPORT_SECTIONS as readonly string[]).toContain(b);
    }
  });

  it('KRİTİK: İLGİ ALANI bölümü YOK', () => {
    /*
     * Meta'nın Ads Insights API'sinde ilgi alanı kırılımı bulunmuyor. Bölümü
     * eklemek, Meta raporunda kalıcı boş bir tablo demekti.
     */
    expect(REPORT_SECTIONS.filter((s) => s.includes('interest'))).toEqual([]);
  });

  it('KRİTİK: genel şablonda kırılım YOK, platform şablonlarında VAR', () => {
    /*
     * Genel rapor müşteriye giden özet; beş kırılım tablosu onu beş sayfa
     * uzatıyor ve "reklamlarım ne yaptı" sorusunu cevaplamıyor. Kullanıcı
     * isterse Rapor Şablonları ekranından kendi şablonuna ekliyor.
     */
    /*
     * TABLOLAR VE ÖZET AYRI SAYILIYOR. Önceki hâli `audience_` önekiyle
     * süzüp "beş tane" diyordu; kitle ÖZETİ bölümü eklendiğinde altı oldu ve
     * test düştü — ama düşme sebebi bir hata değil, iddianın önek sayımına
     * dayanmasıydı. Bölüm adları tek tek yazılıyor.
     */
    const bolumler = (kod: string): readonly string[] =>
      VARSAYILAN_SABLONLAR.find((s) => s.kod === kod)!.sections;
    const TABLOLAR = [
      'audience_age',
      'audience_gender',
      'audience_placement',
      'audience_hour',
      'audience_city',
    ];

    for (const t of [...TABLOLAR, 'audience_overview']) {
      expect(bolumler('genel'), `genel şablonda ${t} olmamalı`).not.toContain(t);
    }
    for (const kod of ['google', 'meta']) {
      for (const t of TABLOLAR) {
        expect(bolumler(kod), `${kod} şablonunda ${t} yok`).toContain(t);
      }
      expect(bolumler(kod)).toContain('audience_overview');
    }
  });

  it('KRİTİK: seçilmeyen boyut HİÇ sorgulanmıyor', () => {
    // Beşini de üretip gösterimde elemek, dört sorguyu boşa koşmak demekti.
    expect(kod(SERVIS)).toContain('BOYUT_BOLUMLERI.filter((b) => sections.includes(b.section))');
  });

  it('KRİTİK: kesilen satırlar "Diğer"de — atılmıyor', () => {
    /*
     * 81 ilin hepsini listelemek raporu okunamaz kılar ama kesilenleri atmak
     * tablo toplamını ana rakamdan küçük gösterir ve müşteri "eksik" der.
     */
    /*
     * İDDİA HESABA ÇAPALI, ALAN ADINA DEĞİL. İlk hâli yalnızca `otherCount`
     * adını arıyordu ve `otherCount: 0` yazan mutasyonda HAYATTA KALDI —
     * alan duruyordu ama kesilen satırlar sessizce yok oluyordu.
     */
    const k = kod(SERVIS);
    expect(k).toContain('const kalan = rows.slice(BREAKDOWN_LIMIT)');
    expect(k).toContain('otherCount: kalan.length');
    expect(k).toContain('otherSpendMicros: kalanHarcama.toString()');
  });

  it('KRİTİK: pay yüzdesi SUNUCUDA — panel ve PDF aynı sayıyı görüyor', () => {
    // İki tarafta ayrı hesaplamak yuvarlama farkı üretirdi.
    expect(kod(SERVIS)).toContain('sharePct:');
  });

  it('toplam sıfırken pay SIFIR — NaN değil', () => {
    // Harcaması olmayan bir dönemde NaN yazmak tabloyu okunmaz yapardı.
    expect(kod(SERVIS)).toContain('toplam > 0n ?');
  });

  it('KRİTİK: desteklenmeyen platform boş sonuçtan AYRI', () => {
    // "Bu dönemde veri yok" ile "bu platform bu kırılımı vermiyor" farklı.
    expect(kod(SERVIS)).toContain('unsupportedPlatforms');
  });
});

describe('PDF çizimi', () => {
  it('beş bölüm de PDF’te çiziliyor', () => {
    const k = kod(PDF);
    for (const b of ['audience_age', 'audience_city']) {
      expect(k, `${b} PDF’te yok`).toContain(`case '${b}':`);
    }
    expect(k).toContain('this.kirilim(ctx, bolum)');
  });

  it('KRİTİK: ortak tablo çizicisinden geçiyor', () => {
    /*
     * PDF'te üç tablo üç ayrı şekilde çizilmişti ve kullanıcının tarifi
     * "birbirleriyle alakası yok" olmuştu. Yeni tablolar aynı hatayı
     * tekrarlamamalı.
     */
    const i = kod(PDF).indexOf('private kirilim(');
    expect(i).toBeGreaterThan(-1);
    expect(kod(PDF).slice(i, i + 4000)).toContain('tablo(s, {');
  });

  it('KRİTİK: pay çubuğu YOK — regresyon bekçisiyle uyumlu', () => {
    /*
     * `payCubugu` deseni "çok pastel boya çizimi" geri bildiriminin
     * kaynağıydı ve `rapor-pdf.service.spec.ts` onu yasaklıyor. Yeni tablo
     * payı METİN olarak yazıyor.
     */
    expect(kod(PDF)).not.toContain('payCubugu');
  });

  it('etiket haritası panelle AYNI değerleri çeviriyor', () => {
    /*
     * İki tarafın ayrışması, aynı raporun ekranda "Kadın" PDF'te "female"
     * göstermesi demekti; kullanıcı ikisini yan yana açıyor.
     */
    const panel = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'web', 'src', 'components', 'report', 'report-document.tsx'),
      'utf8',
    );
    for (const deger of ['FEMALE', 'SEARCH_PARTNERS', 'UNDETERMINED']) {
      expect(kod(PDF), `PDF: ${deger}`).toContain(deger);
      expect(kod(panel), `panel: ${deger}`).toContain(deger);
    }
  });
  it('KRİTİK: kitle özeti PDF’te de çiziliyor', () => {
    /*
     * AYNI RAPORUN İKİ GÖSTERİMİ VAR. Panel bir bölümü çizip PDF çizmezse
     * müşteriye giden belge ile ekran ayrışıyor — bu depoda bir kez yaşandı
     * ve referans olarak panel seçildi. Bölüm eklendiğinde iki taraf da
     * güncellenmek zorunda; test o zorunluluğun kendisi.
     */
    const k = kod(PDF);
    expect(k).toContain("case 'audience_overview':");
    expect(k).toContain('this.kitleOzeti(ctx)');
  });

  it('KRİTİK: PDF halkası YAY komutu kullanmıyor', () => {
    /*
     * `pdf-lib`in SVG yol ayrıştırıcısına `A` (arc) vermek sürüme bağlı bir
     * bahis; `M`/`L`/`Z` her sürümde çalışıyor. Ayrıca tek dilim %100
     * olduğunda yay dejenere olur ve HİÇBİR ŞEY çizilmez — tek cinsiyetli
     * bir hesapta halka boş görünürdü.
     */
    const cizim = readFileSync(join(__dirname, 'pdf-cizim.ts'), 'utf8');
    const i = cizim.indexOf('export function halka(');
    expect(i, 'halka() bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = cizim.slice(i, cizim.indexOf('\nexport function', i + 1));
    expect(govde).toContain('drawSvgPath');
    expect(govde).not.toMatch(/`A |A \$\{/);
  });

  it('KRİTİK: özet kartları TOPLAM bloğundan — panelle aynı', () => {
    // Kırılım toplamı ana rakamı tutmayabiliyor (Meta "unknown" kovası);
    // kartı kırılımdan türetmek kartla tablonun farklı sayı göstermesi
    // demekti.
    expect(kod(PDF)).toContain('const ozet = ctx.data.total ?? ctx.data.platforms[0] ?? null;');
  });

  it('dilim renkleri MARKA rengiyle başlıyor — panelle aynı sıra', () => {
    // Farklı sıra, aynı kovanın belgede ve ekranda farklı renkte görünmesi
    // demekti ve okuyan onları farklı şeyler sanardı.
    expect(kod(PDF)).toContain('function pdfDilimRenkleri(markaRengi: RGB): RGB[]');
    expect(kod(PDF)).toContain('return [markaRengi, SLATE.s700');
  });

});
