import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_SECTIONS, SECTION_LABELS, VARSAYILAN_SABLONLAR } from '@advetics/shared';

/**
 * ═══ KİTLE ÖZETİ VE BÖLÜM AYRIMI ═══
 *
 * İki şikâyet birden: tablolar "çok bitişik" görünüyordu (ekranda bölümler
 * arasında hiçbir ayrım yoktu — yazdırmada sayfa sonu var ama ekranda yok)
 * ve Meta şablonunun özeti referans belgedeki gibi olsun isteniyordu.
 */
const OZET = readFileSync(join(__dirname, 'kitle-ozeti.tsx'), 'utf8');
const BELGE = readFileSync(join(__dirname, 'report-document.tsx'), 'utf8');

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

const OZET_KOD = kod(OZET);
const BELGE_KOD = kod(BELGE);

describe('tarama gerçekten bir şey yakaladı', () => {
  it('dilimler boş değil', () => {
    expect(OZET_KOD.length).toBeGreaterThan(2000);
    expect(BELGE_KOD).toContain('KitleOzetiIcerik');
  });
});

describe('bölüm tanımı', () => {
  it('kitle özeti bir rapor bölümü', () => {
    expect(REPORT_SECTIONS).toContain('audience_overview');
    expect(SECTION_LABELS.audience_overview).toBe('Kitle Özeti');
  });

  it('KRİTİK: özet TABLOLARDAN ÖNCE geliyor', () => {
    /*
     * Grafik ORANI, tablo SAYIYI gösteriyor. Önce oranı görüp sonra detaya
     * inmek okunabilir; tersi, okuyucuyu beş tablodan geçirip sonunda özete
     * ulaştırmak demek.
     */
    for (const s of VARSAYILAN_SABLONLAR) {
      if (!s.sections.includes('audience_overview')) continue;
      expect(
        s.sections.indexOf('audience_overview'),
        `${s.kod}: özet tablolardan sonra`,
      ).toBeLessThan(s.sections.indexOf('audience_age'));
    }
  });

  it('KRİTİK: genel şablonda YOK, platform şablonlarında VAR', () => {
    // Genel rapor müşteriye giden özet; kitle sayfası onu uzatıyor ve
    // "reklamlarım ne yaptı" sorusunu cevaplamıyor.
    const bul = (k: string) => VARSAYILAN_SABLONLAR.find((s) => s.kod === k)!;
    expect(bul('genel').sections as readonly string[]).not.toContain('audience_overview');
    expect(bul('meta').sections as readonly string[]).toContain('audience_overview');
    expect(bul('google').sections as readonly string[]).toContain('audience_overview');
  });
});

describe('KRİTİK: ekranda bölüm ayrımı', () => {
  it('ardışık bölümler arasında çizgi ve boşluk var', () => {
    /*
     * Yazdırmada `break-before: page` zaten ayırıyordu ama EKRANDA hiçbir şey
     * yoktu ve bölümler uç uca geliyordu — kullanıcının tarifi "çok bitişik".
     */
    expect(BELGE_KOD).toContain('.rpt-page + .rpt-page {');
    expect(BELGE_KOD).toContain('border-top: 1px solid');
  });

  it('KRİTİK: ayraç YAZDIRMADA kapatılıyor', () => {
    /*
     * Sayfa sonu zaten ayırıyor; çizgi yeni sayfanın tepesinde yalnız kalır
     * ve belgede anlamsız bir şerit olurdu.
     */
    const i = BELGE_KOD.indexOf('@media print');
    expect(i).toBeGreaterThan(-1);
    const yazdirma = BELGE_KOD.slice(i);
    expect(yazdirma).toContain('.rpt-page + .rpt-page {');
    expect(yazdirma).toContain('border-top: none;');
  });
});

describe('halka grafikleri', () => {
  it('kütüphane YOK — saf SVG', () => {
    /*
     * Raporun bir kopyası sunucuda PDF olarak üretiliyor ve orada tarayıcı
     * yok; `pdf-lib` tam olarak yeni bir ikili bağımlılıktan kaçınmak için
     * seçildi. Panelde kütüphaneyle çizmek, iki tarafın ayrışması demek.
     */
    expect(OZET_KOD).toContain('<svg');
    expect(OZET).not.toMatch(/^import .* from ['"](recharts|chart\.js|d3)/m);
  });

  it('KRİTİK: dilim çizimi TAM DAİREDE de çalışıyor', () => {
    /*
     * `stroke-dasharray` seçildi, `path` + yay DEĞİL: tek dilim %100 olduğunda
     * yay dejenere oluyor (başlangıç ve bitiş aynı nokta) ve hiç çizilmiyor —
     * halka boş görünürdü. Tek cinsiyetli bir hesapta bu kesin.
     */
    expect(OZET_KOD).toContain('strokeDasharray');
    expect(OZET_KOD).not.toContain('A ${');
  });

  it('KRİTİK: toplam sıfırken SEBEP yazılıyor', () => {
    // Boş bir halka "veri sıfır" ile "veri gelmedi" arasında ayrım yapmıyor.
    expect(OZET_KOD).toContain('if (toplam <= 0)');
    expect(OZET_KOD).toContain('Veri yok');
  });

  it('KRİTİK: kesilen dilimler "Diğer"de — atılmıyor', () => {
    /*
     * Yirmi dilimli halka okunmuyor ama kalanı atmak yüzdeleri %100'e
     * tamamlanmaz hâle getirirdi.
     */
    expect(OZET_KOD).toContain("etiket: `Diğer (${sirali.length - 6})`");
  });

  it('lejant YÜZDE de taşıyor', () => {
    // Yalnızca renk ve etiket vermek, iki yakın dilimin hangisinin büyük
    // olduğunu göze bırakıyor — halka grafiğin bilinen zayıflığı.
    expect(OZET_KOD).toContain('toFixed(1)');
  });
});

describe('özet kartları', () => {
  it('KRİTİK: kartlar TOPLAM bloğundan, kırılımlardan DEĞİL', () => {
    /*
     * Kırılım toplamı ana rakamı tutmayabiliyor: Meta "unknown" kovası
     * taşıyor ve bazı gösterimler hiçbir kovaya düşmüyor. Kartları kırılımdan
     * türetmek, aynı sayfada kartla tablonun farklı sayı göstermesi demekti.
     */
    expect(OZET_KOD).toContain('const ozet = data.total ?? data.platforms[0] ?? null;');
  });

  it('KRİTİK: CTR null iken "0" değil "—"', () => {
    // `null` "hesaplanamaz" demek; "%0,00" reklamın hiç tıklanmadığını söyler.
    expect(OZET_KOD).toContain("ozet.ctr === null ? '—'");
  });

  it('referanstaki beş kart da var', () => {
    for (const e of ['Gösterim', 'Harcama', 'Tıkl. Oranı', 'Form', 'Mesaj']) {
      expect(OZET_KOD, `${e} kartı yok`).toContain(`etiket="${e}"`);
    }
  });
});

describe('etiketler ve boş hâl', () => {
  it('KRİTİK: etiket çevirisi TABLOLARLA aynı fonksiyondan', () => {
    /*
     * İkinci bir kopya, halkada "female" yazarken tabloda "Kadın" yazması
     * demekti — aynı sayfada iki farklı dil.
     */
    expect(BELGE_KOD).toContain("yasEtiketi={(v) => kirilimEtiketi('age', v)}");
    expect(BELGE_KOD).toContain("cinsiyetEtiketi={(v) => kirilimEtiketi('gender', v)}");
    expect(OZET_KOD).not.toContain('Kadın');
  });

  it('KRİTİK: veri yokken SEBEP yazılıyor', () => {
    // Kırılım gecelik toplanıyor; hesap yeni bağlandıysa henüz koşmamış
    // olabilir ve "veri yok" demek olmayan bir arızayı aratır.
    const i = BELGE_KOD.indexOf('function KitleOzeti(');
    expect(i).toBeGreaterThan(-1);
    expect(BELGE_KOD.slice(i, i + 1600)).toContain('gecelik güncellemeyle');
  });
});
