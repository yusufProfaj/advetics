import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GENEL BAKIŞ › BEKLEYEN İŞLER VE HIZLI ERİŞİM: SAYFAYA BAĞLANMA ═══
 *
 * Kararların kendisi `lib/bekleyen-isler.spec.ts`, `lib/hizli-erisim.spec.ts`
 * ve `budget/butce-temposu.spec.ts`te ÇALIŞTIRILARAK sınanıyor. Burada
 * yalnızca sayfanın onları DOĞRU çağırdığı kilitli: bir fonksiyonun test
 * edilmesi, çağrıldığının test edilmesi değil (CLAUDE.md mutasyon dersi 1).
 *
 * Tarama YORUMSUZ kaynakta: sayfadaki yorumlar `.catch(() => null)` yasağını
 * kelimesi kelimesine anlatıyor ve ham kaynakta "yok" iddiası kod doğruyken
 * kırmızı verirdi.
 */
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SAYFA = yorumsuz(join(__dirname, 'page.tsx'));
const KUTU = yorumsuz(
  join(__dirname, '..', '..', '..', 'components', 'genel-bakis', 'bekleyen-isler-kutusu.tsx'),
);

/**
 * `baslangic`ın başladığı deyimi, parantez/süslü derinliği sıfırken gelen
 * İLK `;` ile bitiriyor. Sabit uzunluklu dilim komşu deyimi yakalıyordu
 * (CLAUDE.md "sabit uzunluklu dilim komşuyu yakalıyor"); bulunamazsa
 * FIRLATIYOR, boş dilim "yasak dizge yok" iddiasını her zaman doğru yapardı.
 */
function deyim(kaynak: string, baslangic: string): string {
  const i = kaynak.indexOf(baslangic);
  if (i < 0) throw new Error(`deyim bulunamadı: ${baslangic}`);
  let derinlik = 0;
  for (let j = i; j < kaynak.length; j++) {
    const ch = kaynak[j];
    if (ch === '(' || ch === '{' || ch === '[') derinlik++;
    else if (ch === ')' || ch === '}' || ch === ']') derinlik--;
    else if (ch === ';' && derinlik === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`deyimin sonu bulunamadı: ${baslangic}`);
}

/** `async function ad(` gövdesi — süslü sayarak. */
function fonksiyon(kaynak: string, ad: string): string {
  const i = kaynak.indexOf(`function ${ad}(`);
  if (i < 0) throw new Error(`fonksiyon bulunamadı: ${ad}`);
  const ac = kaynak.indexOf(') {', i);
  let derinlik = 0;
  for (let j = ac + 2; j < kaynak.length; j++) {
    if (kaynak[j] === '{') derinlik++;
    else if (kaynak[j] === '}' && --derinlik === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error(`fonksiyonun sonu bulunamadı: ${ad}`);
}

const CAGRI = deyim(SAYFA, 'const bekleyenler');
const KISAYOL = deyim(SAYFA, 'const kisayollar');
const KUTU_GOVDE = fonksiyon(KUTU, 'BekleyenIslerKutusu');

describe('tarama boşa düşmüyor', () => {
  it('KRİTİK: dilimler gerçekten yakalandı', () => {
    expect(CAGRI).toContain('serverApiFetch<BekleyenIslerYaniti>');
    expect(CAGRI.length).toBeLessThan(600); // komşu deyimlere taşmadı
    expect(KISAYOL).toContain('hizliErisim(');
    expect(KUTU_GOVDE).toContain('await sonuc');
  });
});

describe('çağrı', () => {
  it('KRİTİK: adres tek üreticiden ve aktif workspace ile', () => {
    // "Tüm workspace'ler" kipinde activeClientId null ve üretici clientId'yi düşürüyor.
    expect(CAGRI).toContain('bekleyenIslerYolu(session.activeClientId)');
  });

  it('KRİTİK: hata yutulmuyor, sebebiyle nesneye çevriliyor', () => {
    expect(CAGRI).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
    expect(CAGRI).toContain("(e: unknown) => ({ durum: 'hata', mesaj: hataMetni(e) })");
    expect(CAGRI).toContain("(yanit) => ({ durum: 'tamam', yanit })");
  });

  it('KRİTİK: diğer okumalarla paralel — beklenmiyor ve seri kapsam çağrısından ÖNCE başlıyor', () => {
    expect(CAGRI).not.toContain('await');
    const i = SAYFA.indexOf('const bekleyenler');
    expect(i).toBeLessThan(SAYFA.indexOf('const kapsam'));
    expect(i).toBeLessThan(SAYFA.indexOf('await Promise.all'));
  });
});

describe('yerleşim', () => {
  it('KRİTİK: kutu kendi Suspense sınırında, yedeği "yükleniyor" iskeleti', () => {
    expect(SAYFA).toMatch(
      /<Suspense fallback=\{<BekleyenIslerIskeleti \/>\}>\s*<BekleyenIslerKutusu\s+sonuc=\{bekleyenler\}/,
    );
  });

  it('KRİTİK: onay cümlesi kullanıcının onay yetkisine göre', () => {
    expect(SAYFA).toContain("onayYetkisi={session.permissions.includes('strategy.approve')}");
  });

  it('kutu sağ sütunda, Performans ile aynı ızgarada (2026-10-09 düzeni)', () => {
    // Kullanıcı: "daraltıp ayrı bir kart yap". Tam genişlik liste metrikleri
    // ekranın altına itiyordu; Google Ads'te teşhis kartı da yan sütunda.
    const izgara = SAYFA.indexOf('lg:grid-cols-3');
    const kutu = SAYFA.indexOf('<BekleyenIslerKutusu');
    expect(izgara).toBeGreaterThan(SAYFA.indexOf('<SayfaBasligi'));
    expect(kutu).toBeGreaterThan(izgara);
    expect(kutu).toBeGreaterThan(SAYFA.indexOf('<PerformansKutulari'));
  });

  it('KRİTİK: Boost rozeti kutuyla AYNI sözden', () => {
    expect(SAYFA).toContain('<BoostRozeti sonuc={bekleyenler} />');
  });

  it('KRİTİK: kısayollar menünün süzgecinden, layout ile aynı bağlam', () => {
    expect(KISAYOL).toContain('visibleSections(session.permissions, {');
    expect(KISAYOL).toContain('ustHesapGorunur: session.platformAdmin || session.managerAccount !== null');
    expect(KISAYOL).toContain('platformSahibi: session.platformAdmin');
    expect(SAYFA).toContain('<HizliErisim');
    expect(SAYFA).toContain('ogeler={kisayollar}');
  });

  it('şirket/workspace tabloları ve uyarı kutusu yerinde (sonraki aşamada taşınacak)', () => {
    expect(SAYFA).toContain('<SirketTablosu');
    expect(SAYFA).toContain('<MusteriTablosu');
    expect(SAYFA).toContain('<Uyarilar');
  });
});

describe('kutunun dört hâli', () => {
  it('KRİTİK: hâl saf fonksiyondan ve her hâl ayrı çiziliyor', () => {
    expect(KUTU_GOVDE).toContain('bekleyenKutuHali(s)');
    expect(KUTU_GOVDE).toContain("s.durum === 'hata'");
    expect(KUTU_GOVDE).toContain('{s.mesaj}');
    expect(KUTU_GOVDE).toContain("hal === 'bos' &&");
    expect(KUTU_GOVDE).toContain('Bekleyen iş yok');
    expect(KUTU_GOVDE).toContain("hal === 'dolu' &&");
  });

  it('KRİTİK: kısmi hata ve kesme metni çiziliyor', () => {
    expect(KUTU_GOVDE).toContain('kaynakHataMetni(h)');
    expect(KUTU_GOVDE).toContain('kesmeMetni(yanit)');
    expect(KUTU_GOVDE).toContain('{kesme && ');
  });

  it('satır cümlesi, yaşı ve adresi saf fonksiyonlardan', () => {
    expect(KUTU_GOVDE).toContain('bekleyenIsCumlesi(is, onayYetkisi)');
    expect(KUTU_GOVDE).toContain('bekleyenIsYasi(is.enEski)');
    expect(KUTU_GOVDE).toContain('href={bekleyenIsAdresi(is)}');
  });

  it('kart kalıbı: yeni gölge/animasyon yok', () => {
    expect(KUTU).toContain('rounded-xl border border-line bg-surface');
    expect(KUTU).not.toMatch(/shadow-|animate-/);
  });
});
