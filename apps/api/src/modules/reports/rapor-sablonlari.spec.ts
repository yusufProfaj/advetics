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

  it('KRİTİK: süzgeç BÜTÜN sorgulara gidiyor', () => {
    /*
     * Bu iddia bir kez üretimde ödenmeye aday bir hatayı yakaladı: `sorgu`
     * nesnesine `platform` eklendiğinde alt sorguların HİÇBİRİ onu
     * okumuyordu ve süzgeç sessizce etkisizdi. TypeScript de bir şey
     * söylemiyordu — fazladan alan hata değil.
     *
     * Yedi sorgu: platform blokları, kampanyalar, günlük seri, öne çıkan
     * reklamlar (×2 sorgu), kırılımlar (×2 sorgu).
     */
    const k = kod(SERVIS);
    expect(k.split('platformFiltresi(params.platform').length - 1).toBeGreaterThanOrEqual(7);
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
    const kirilim = (kod: string) =>
      VARSAYILAN_SABLONLAR.find((s) => s.kod === kod)!.sections.filter((b) =>
        b.startsWith('audience_'),
      );
    expect(kirilim('genel')).toEqual([]);
    expect(kirilim('google')).toHaveLength(5);
    expect(kirilim('meta')).toHaveLength(5);
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
});
