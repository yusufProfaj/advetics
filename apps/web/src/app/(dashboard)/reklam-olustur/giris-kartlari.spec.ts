import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Reklamlar" GİRİŞ KARTLARININ HEDEFİ GERÇEKTEN VAR MI — kaynak taraması.
 *
 * `nav-routes.spec.ts` aynı sınıf hatayı KENAR ÇUBUĞU için yakalıyor
 * (menüde dokuz bağlantı vardı ve dokuzu da 404 veriyordu) ama bu sayfadaki
 * kartları hiçbir şey korumuyordu. Oysa kullanıcı "reklam vereceğim" diye
 * buraya geliyor ve gerçek giriş noktaları bu kartlar: biri kırıksa
 * kullanıcı özelliğin var olmadığını değil, panelin bozuk olduğunu düşünür.
 *
 * Rotanın yalnızca ADI değil, DOSYASI aranıyor — `page.tsx` yoksa Next.js
 * 404 veriyor ve TypeScript hiçbir şey söylemiyor (href düz bir dize).
 */
const HUB = join(__dirname, 'page.tsx');
const DASHBOARD = join(__dirname, '..');
const KAYNAK = readFileSync(HUB, 'utf8');

/** Yorumları atıyor: bir rotayı ANLATAN yorum eşleşip testi yalancı yeşil yapmasın. */
function yorumsuz(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** `href={`/yol?musteri=${clientId}`}` kalıbındaki yolları çıkarır. */
function kartYollari(): string[] {
  const out: string[] = [];
  const re = /href=\{`(\/[^`?]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(yorumsuz(KAYNAK))) !== null) out.push(m[1]!);
  return out;
}

describe('giriş kartları', () => {
  it('tarama gerçekten kart buldu', () => {
    /*
     * BOŞA DÜŞME KORUMASI. `Giris` bileşeni yeniden adlandırılır ya da href
     * biçimi değişirse dizi boşalır ve aşağıdaki "hepsinin sayfası var"
     * iddiası BOŞ KÜMEDE her zaman doğru olur — sessiz bir bekçi, olmayan
     * bir bekçidir.
     */
    const yollar = kartYollari();
    expect(yollar.length).toBeGreaterThanOrEqual(5);
    expect(yollar).toContain('/reklam-olustur/ai-asistan');
  });

  it('KRİTİK: her kartın hedef sayfası VAR', () => {
    const eksik = kartYollari().filter(
      (yol) => !existsSync(join(DASHBOARD, `${yol.replace(/^\//, '')}/page.tsx`)),
    );
    // Hata mesajı yolu YAZIYOR: "0 bekleniyordu, 1 geldi" hangi kartın
    // kırıldığını söylemezdi.
    expect(eksik).toEqual([]);
  });
});

describe('SESSİZ HATA YOK — kampanya listesini okuyan ÜÇ SAYFA', () => {
  /*
   * Aynı liste (`/draft-campaigns`) üç ekranda okunuyordu ve ÜÇÜ DE
   * `.catch(() => [])` ile yutuyordu. Üçünün belirtisi ayrı ve üçü de yalan:
   *
   *   · Hub      → "Bu workspace'te henüz kampanya yok"
   *   · Toplu    → "kaynak kampanya yok" (kullanıcıyı sıfırdan kurmaya iter)
   *   · Hızlı    → EN KÖTÜSÜ: `/connections` boş kalınca "Meta bağlantın yok"
   *                ekranı basılıyor ve kullanıcı sağlam bir bağlantıyı
   *                düzeltmeye gönderiliyordu.
   */
  const SAYFALAR: Array<[string, string]> = [
    ['hub', join(__dirname, 'page.tsx')],
    ['hızlı', join(__dirname, 'basit', 'page.tsx')],
    ['toplu', join(__dirname, '..', 'toplu-olustur', 'page.tsx')],
  ];

  it('tarama gerçekten sayfaları okudu', () => {
    for (const [ad, yol] of SAYFALAR) {
      expect(readFileSync(yol, 'utf8'), `${ad} okunamadı`).toContain('/draft-campaigns');
    }
  });

  it('KRİTİK: hiçbiri `.catch(() => [])` kullanmıyor', () => {
    const suclu = SAYFALAR.filter(([, yol]) =>
      yorumsuz(readFileSync(yol, 'utf8')).includes('.catch(() => []'),
    ).map(([ad]) => ad);
    expect(suclu).toEqual([]);
  });

  it('KRİTİK: üçü de sebebi EKRANA yazıyor', () => {
    for (const [ad, yol] of SAYFALAR) {
      const kod = yorumsuz(readFileSync(yol, 'utf8'));
      expect(kod, `${ad}: allSettled yok`).toContain('allSettled');
      expect(kod, `${ad}: sunucunun mesajı basılmıyor`).toContain('ApiRequestError');
    }
  });

  it('KRİTİK: bağlantı çağrısı düşerse "eksik ön koşul" ekranı BASILMIYOR', () => {
    /*
     * Sıra önemli: hata dalı `Missing` çağrısından ÖNCE dönmeli. Sonra
     * gelirse `metaAccounts.length === 0` koşulu zaten çalışmış ve ekran
     * yalan söylemiş olur.
     */
    const kod = yorumsuz(readFileSync(join(__dirname, 'basit', 'page.tsx'), 'utf8'));
    const hata = kod.indexOf("baglantiSonuc.status === 'rejected'");
    const eksik = kod.indexOf('<Missing');
    expect(hata, 'hata dalı yok').toBeGreaterThan(-1);
    expect(eksik, 'Missing ekranı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(hata).toBeLessThan(eksik);
  });
});

describe('HUB: kartlar ve liste', () => {
  const HUB_KOD = yorumsuz(KAYNAK);

  it('KRİTİK: kartlar İKİ GRUBA ayrılmış', () => {
    /*
     * Beş kart tek ızgaradaydı ve aralarındaki fark okunmuyordu: üçü
     * sıfırdan kampanya kuruyor, ikisi VAR OLAN bir şeyden üretiyor. İlk kez
     * gelen kullanıcı için ikinci grup boş bir ekrana çıkıyor.
     */
    expect(HUB_KOD).toContain('Sıfırdan kampanya');
    expect(HUB_KOD).toContain('Var olandan üret');
  });

  it('KRİTİK: boost kartı kenar çubuğuyla AYNI adı taşıyor', () => {
    // Kart "Gönderiyi Öne Çıkar", menü "Akıllı Boost" diyordu: tek ekran,
    // iki ad.
    expect(HUB_KOD).toContain('baslik="Akıllı Boost"');
    expect(HUB_KOD).not.toContain('Gönderiyi Öne Çıkar');
  });

  it('KRİTİK: liste KESİLİYOR ve kesildiği yazılıyor', () => {
    /*
     * `/draft-campaigns` limitsiz dönüyor ve kampanya başına ad gruplarını
     * ve reklamları da çekiyor. Bir yıl kampanya kuran workspace'te sayfa
     * yüzlerce satırla açılır ve asıl iş en üstte kaybolur.
     */
    expect(HUB_KOD).toContain('LISTE_SINIRI');
    expect(HUB_KOD).toContain('slice(0, LISTE_SINIRI)');
    expect(HUB_KOD).toContain('toplam={groups.length}');
  });

  it('KRİTİK: yetkisiz kullanıcıya SEBEP yazılıyor', () => {
    // Kartlar yetkiye bağlı; sebepsiz boş bir ekran kullanıcıyı olmayan bir
    // arızayı aramaya gönderir.
    expect(HUB_KOD).toContain('Reklam oluşturmak yöneticinin işi.');
  });
});

/**
 * ONAY KARTI — "200 döndü doğrulama değil" ilkesinin arayüzdeki karşılığı.
 *
 * Onay ucu HTTP 200 dönse bile gövde `{status:'failed'}` olabiliyor: platform
 * reddi, çift tıklama, kota. Kart yalnızca `success` görünce "Uygulandı"
 * demeli; aksi hâlde kullanıcı canlı bir PARA mutasyonunun olmadığı hâlde
 * olduğunu sanır — ve bu, bu üründeki en pahalı sessiz hata sınıfı.
 */
describe('onay kartı', () => {
  const KART = readFileSync(
    join(__dirname, '../../../components/ai-asistan/onay-karti.tsx'),
    'utf8',
  );

  it('tarama gerçekten dosyayı okudu', () => {
    expect(KART).toContain('OnayKarti');
  });

  it("KRİTİK: başarı YALNIZCA status === 'success' iken yazılıyor", () => {
    // İddia YORUMA DEĞİL KODA çapalanıyor: kuralı anlatan yorum aynı dosyada
    // duruyor ve `toContain` ikisini ayırt etmiyor.
    expect(yorumsuz(KART)).toContain("res.status === 'success'");
  });

  it('ret sebebi EKRANA basılıyor — yutulmuyor', () => {
    expect(yorumsuz(KART)).toContain('res.reason');
  });
});
