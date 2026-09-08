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
