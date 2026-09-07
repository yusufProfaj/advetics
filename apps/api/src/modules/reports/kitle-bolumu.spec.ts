import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KIRILIM_SUNAN_PLATFORMLAR,
  PLATFORMS,
  kitleBolumuKarari,
  platformKirilimSunuyorMu,
} from '@advetics/shared';

/**
 * ═══ LINKEDIN'DE KİTLE ÖZETİ SAYFASI ÇİZİLMİYOR ═══
 *
 * Kullanıcı kararı (2026-09-07). Gerekçe: LinkedIn'in pivot listesinde yaş,
 * cinsiyet ve saat HİÇ YOK; sayfa çizilseydi her LinkedIn raporunda
 * *"Kitle verisi henüz toplanmadı. Kırılımlar gecelik güncellemeyle geliyor."*
 * yazacaktı. O cümle YALAN: veri toplanmadığı için değil, boyut platformda
 * OLMADIĞI için boş — ve yalan müşteriye giden belgede duruyor.
 */

describe('platformKirilimSunuyorMu', () => {
  it('KRİTİK: LinkedIn kırılım SUNMUYOR, Meta ve Google sunuyor', () => {
    expect(platformKirilimSunuyorMu('linkedin')).toBe(false);
    expect(platformKirilimSunuyorMu('meta')).toBe(true);
    expect(platformKirilimSunuyorMu('google')).toBe(true);
  });

  it('sunanlar listesi `PLATFORMS`tan türüyor', () => {
    /*
     * Elle yazılan ikinci bir liste, dördüncü platform eklendiğinde sessizce
     * eskirdi: yeni platform "kırılım sunuyor" sayılıp sayfaya sokulur ve
     * orada boş kalırdı.
     */
    expect(KIRILIM_SUNAN_PLATFORMLAR.every((p) => PLATFORMS.includes(p))).toBe(true);
    expect(KIRILIM_SUNAN_PLATFORMLAR).not.toContain('linkedin');
  });
});

describe('kitleBolumuKarari — üç hâl', () => {
  it('KRİTİK: yalnızca LinkedIn ise sayfa HİÇ ÇİZİLMİYOR', () => {
    const k = kitleBolumuKarari(['linkedin']);
    expect(k.ciz).toBe(false);
    if (!k.ciz) expect(k.sebep).toContain('LinkedIn');
  });

  it('Meta ve Google ise normal çiziliyor, uyarı YOK', () => {
    for (const p of [['meta'], ['google'], ['meta', 'google']] as const) {
      const k = kitleBolumuKarari([...p]);
      expect(k.ciz).toBe(true);
      if (k.ciz) expect(k.not).toBeNull();
    }
  });

  it('KRİTİK: KARMA raporda sayfa çiziliyor AMA dışarıda kalan söyleniyor', () => {
    /*
     * Sayfa Meta'yı çiziyor, LinkedIn harcaması dağılımın DIŞINDA kalıyor.
     * Söylememek, kırılım toplamının özet kartlarıyla tutmamasını
     * açıklanamaz bırakırdı — okuyan ya toplamanın yanlış olduğunu sanır ya
     * da farkı hiç görmez. "Sessiz kesme yok" kuralının tam konusu.
     */
    const k = kitleBolumuKarari(['meta', 'linkedin']);
    expect(k.ciz).toBe(true);
    if (k.ciz) {
      expect(k.not).not.toBeNull();
      expect(k.not).toContain('LinkedIn Ads');
      expect(k.not, 'kalan platform yazılmamış').toContain('Meta Ads');
    }
  });

  it('KRİTİK: HİÇ platform yoksa sayfa ÇİZİLİYOR — "veri yok" hâli kaybolmasın', () => {
    /*
     * Bu hâl "dönemde harcama yok" demek ve mevcut boş kutu davranışı DOĞRU:
     * orada "kitle verisi henüz toplanmadı" gerçekten doğru cümle. `false`
     * döndürmek, veri bekleyen bir raporda sayfayı sessizce kaybettirirdi —
     * yani bu düzeltmenin kendisi yeni bir sessiz hata üretirdi.
     */
    const k = kitleBolumuKarari([]);
    expect(k.ciz).toBe(true);
    if (k.ciz) expect(k.not).toBeNull();
  });

  it('platform sırası uyarıyı değiştirmiyor', () => {
    const a = kitleBolumuKarari(['meta', 'linkedin']);
    const b = kitleBolumuKarari(['linkedin', 'meta']);
    expect(a.ciz && b.ciz && a.not).toBe(b.ciz ? b.not : null);
  });
});

/**
 * ═══ PDF VE PANEL AYNI KARARDAN OKUYOR ═══
 *
 * Bu depoda rapor PDF'i ile panel daha önce ayrıştı ve fark yalnızca
 * müşteriye giden belgeyi ekranla yan yana koyunca görünüyordu. İkisi ayrı
 * yazsaydı burada da aynısı olurdu: ekran sayfayı çizer, PDF çizmez.
 */
describe('kaynak taraması — tek karar, iki tüketici', () => {
  const PDF = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');
  const PANEL = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'web', 'src', 'components', 'report', 'report-document.tsx'),
    'utf8',
  );

  /** Yorumsuz kaynak — iddia açıklamaya değil KODA çapalanmalı. */
  const kod = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('tarama gerçekten gövdeyi yakaladı', () => {
    expect(PDF).toContain('audience_overview');
    expect(PANEL).toContain('audience_overview');
  });

  it('KRİTİK: İKİSİ DE `kitleBolumuKarari` çağırıyor', () => {
    expect(kod(PDF)).toContain('kitleBolumuKarari(');
    expect(kod(PANEL)).toContain('kitleBolumuKarari(');
  });

  it('KRİTİK: PDF kararı SAYFA AÇMADAN ÖNCE veriyor', () => {
    /*
     * `kitleOzeti` ilk satırında `addPage` çağırıyor. Karar o metodun İÇİNE
     * girseydi belgede BOŞ BİR SAYFA kalırdı — sayfa açılmış, hiçbir şey
     * çizilmemiş. Kontrol `case` dalında olmak zorunda.
     */
    const k = kod(PDF);
    expect(k).toMatch(/case 'audience_overview':\s*\n\s*if \(kitleKarari\.ciz\)/);
    expect(k).toMatch(/case 'audience_city':\s*\n\s*if \(kitleKarari\.ciz\)/);
  });

  it('KRİTİK: BEŞ boyut bölümü de karara bağlı — yalnızca özet değil', () => {
    /*
     * Özet sayfası atlanıp yaş/cinsiyet/yerleşim/saat/şehir sayfaları
     * çizilseydi, LinkedIn raporunda beş boş sayfa kalırdı ve hepsi aynı
     * yanlış cümleyi yazardı.
     */
    for (const kaynak of [kod(PDF), kod(PANEL)]) {
      const i = kaynak.indexOf("case 'audience_age':");
      expect(i, 'kırılım dalı bulunamadı — tarama boşa düştü').toBeGreaterThan(0);
      const dilim = kaynak.slice(i, kaynak.indexOf("case 'top_ads':", i));
      expect(dilim).toContain('kitleKarari.ciz');
    }
  });

  it('KRİTİK: karma raporun uyarısı İKİSİNDE DE basılıyor', () => {
    // Uyarı yalnızca birinde olsaydı ekran ile belge farklı şey söylerdi.
    expect(kod(PDF)).toContain('not !== null');
    expect(kod(PANEL)).toContain('not !== null &&');
  });
});
