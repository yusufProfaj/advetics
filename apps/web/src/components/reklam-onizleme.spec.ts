import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ REKLAM ÖNİZLEMESİ — HİYERARŞİNİN SON BASAMAĞI ═══
 *
 * Kullanıcının isteği birebir: "reklam seti › reklam › reklam önizlemesi",
 * dropdown şeklinde ve "farklı reklamın önizlemesini görmek istediğimde
 * diğerinin kapanıp tıkladığım reklamın açılması".
 *
 * Tabloda reklamın yalnızca adı ve sayıları duruyordu; "bu reklam neye
 * benziyor" sorusunun cevabı için Reklam Keşfi ekranına gidip aynı reklamı
 * yeniden bulmak gerekiyordu.
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
const DIR = __dirname;

function kod(yol: string): string {
  return readFileSync(join(DIR, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const ONIZLEME = kod('reklam-onizleme.tsx');
const TABLO = kod('breakdown-table.tsx');

describe('tarama boşa düşmüyor', () => {
  it('iki kaynak da okundu', () => {
    expect(ONIZLEME).toContain('ReklamOnizleme');
    expect(TABLO).toContain('BreakdownTable');
  });
});

describe('açılır önizleme', () => {
  it('KRİTİK: AYNI ANDA TEK ÖNİZLEME AÇIK', () => {
    /*
     * Kullanıcının istediği davranış bu. Tek bir kimlik tutmak onu
     * kendiliğinden sağlıyor; açık KÜMESİ tutup "yalnızca biri" kuralını
     * elle uygulamak, kuralın bir dalda unutulduğu yer olurdu.
     */
    expect(TABLO).toContain('const [acikReklam, setAcikReklam] = useState<string | null>(null)');
    expect(TABLO).toContain("setAcikReklam((a) => (a === r.entityId ? null : r.entityId))");
  });

  it('KRİTİK: yalnızca REKLAM seviyesinde açılıyor', () => {
    // Kampanya ve reklam setinde satır bir ALT LİSTEYE gidiyor; orada
    // açılır kutu, iki farklı tıklama anlamı demekti.
    expect(TABLO).toContain(": level === 'ad' ? (");
    expect(TABLO).toContain('{acikReklam === r.entityId && (');
  });

  it('KRİTİK: durum ERİŞİLEBİLİR olarak duyuruluyor', () => {
    // Açılıp kapanan bir düğme klavye ve ekran okuyucu için de bir durum
    // taşıyor; yalnızca oku döndürmek onu yalnızca göze anlatırdı.
    expect(TABLO).toContain('aria-expanded={acikReklam === r.entityId}');
  });

  it('KRİTİK: önizleme KENDİ SATIRINDA, colSpan ile', () => {
    /*
     * Hücrenin içine koymak tabloyu bozuyor: kart sütun genişliğine sıkışıp
     * okunmaz hâle geliyor ve komşu hücrelerin yüksekliğini şişiriyor.
     */
    expect(TABLO).toContain('colSpan={showRoas ? 9 : 8}');
  });
});

describe('önizleme verisi', () => {
  it('KRİTİK: KART YENİDEN YAZILMADI — `AdCard` kullanılıyor', () => {
    /*
     * `AdCard` içinde canlıda öğrenilmiş kararlar var: arama reklamının
     * kreatifi METNİDİR, görsel `contain` ile çiziliyor, "görsel yok" üç
     * ayrı hâli ayırıyor, platform önizlemesine bağlantı veriyor. İkinci
     * bir önizleme yazmak bunların hepsini ikinci kez öğrenmekti.
     */
    expect(ONIZLEME).toContain("import { AdCard } from '@/components/ad-card'");
    expect(ONIZLEME).toContain('<AdCard ad={reklam}');
  });

  it('KRİTİK: veri AÇILDIĞINDA çekiliyor — önden değil', () => {
    // Tabloda yirmi beş satır var; hepsinin kreatifini önden çekmek yirmi
    // beş istek demek.
    expect(ONIZLEME).toContain('useEffect');
    expect(ONIZLEME).toContain('`/ads/${adId}?from=${from}&to=${to}`');
  });

  it('KRİTİK: YARIŞAN İSTEK ATILIYOR', () => {
    /*
     * Kullanıcı hızlıca iki reklam açarsa geç gelen cevap YENİ satırın
     * altına ESKİ reklamı çizerdi — hata vermeden yanlış önizleme.
     */
    expect(ONIZLEME).toContain('let birakildi = false;');
    expect(ONIZLEME).toContain('if (!birakildi) setReklam(r);');
  });

  it('KRİTİK: hata YUTULMUYOR ve yükleniyor hâlinden AYRI', () => {
    /*
     * `.catch(() => null)` yazmak "yükleniyor" ile "çağrı düştü"yü aynı boş
     * alana çevirirdi; bu depoda adı konmuş yasak.
     */
    expect(ONIZLEME).toContain('ApiRequestError');
    expect(ONIZLEME).toContain('Önizleme yükleniyor…');
    expect(ONIZLEME).toContain("role=\"alert\"");
  });
});
