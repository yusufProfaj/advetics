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
  join(__dirname, '..', '..', '..', 'components', 'taslak', 'genel-bakis-kartlari.tsx'),
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
const KUTU_GOVDE = fonksiyon(KUTU, 'BekleyenIslerKarti');

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
  it('KRİTİK: kart kendi Suspense sınırında, yedeği "yükleniyor" iskeleti', () => {
    expect(SAYFA).toMatch(
      /<Suspense fallback=\{<BekleyenIskelet \/>\}>\s*<BekleyenIslerKarti\s+sonuc=\{bekleyenler\}/,
    );
  });

  it('KRİTİK: onay cümlesi kullanıcının onay yetkisine göre', () => {
    expect(SAYFA).toContain("onayYetkisi={session.permissions.includes('strategy.approve')}");
  });

  it('kart sağ sütunda, Performans ile aynı ızgarada (onaylanan taslak)', () => {
    const izgara = SAYFA.indexOf('<div className={s.izgara}>');
    const kutu = SAYFA.indexOf('<BekleyenIslerKarti');
    expect(izgara).toBeGreaterThan(SAYFA.indexOf('<header'));
    expect(kutu).toBeGreaterThan(SAYFA.indexOf('<PerformansKarti'));
  });

  it('KRİTİK: Boost rozeti kartla AYNI sözden', () => {
    expect(SAYFA).toContain('<BoostSayisi sonuc={bekleyenler} />');
  });

  it('KRİTİK: kısayollar menünün süzgecinden, layout ile aynı bağlam', () => {
    expect(KISAYOL).toContain('visibleSections(session.permissions, {');
    expect(KISAYOL).toContain('ustHesapGorunur: session.platformAdmin || session.managerAccount !== null');
    expect(KISAYOL).toContain('platformSahibi: session.platformAdmin');
    expect(SAYFA).toContain("kisayollar.find((k) => k.href === '/reklam')");
  });

  it('şirket/workspace/hesap özetleri ve uyarı şeridi yerinde', () => {
    expect(SAYFA).toContain('satirlar={sirketSatirlari(sirketler)}');
    expect(SAYFA).toContain('satirlar={workspaceSatirlari(musteriler)}');
    expect(SAYFA).toContain('satirlar={hesapSatirlari(hesaplar, tasinan)}');
    expect(SAYFA).toContain('<BildirimSeridi');
  });
});

describe('kutunun dört hâli', () => {
  it('KRİTİK: hâl saf fonksiyondan ve her hâl ayrı çiziliyor', () => {
    expect(KUTU_GOVDE).toContain('bekleyenKutuHali(r)');
    expect(KUTU_GOVDE).toContain("r.durum === 'hata'");
    expect(KUTU_GOVDE).toContain('{r.mesaj}');
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
    expect(KUTU).toContain('bekleyenIsCumlesi(is, onayYetkisi)');
    expect(KUTU).toContain('bekleyenIsYasi(is.enEski)');
    expect(KUTU).toContain('href={bekleyenIsAdresi(is)}');
  });

  it('görünüş taslak modülünden: kart kendi gölgesini yazmıyor', () => {
    expect(KUTU).toContain('className={`${s.kart} ${s.gir}`}');
    expect(KUTU).not.toMatch(/shadow-|animate-/);
  });

  it('KRİTİK: ilk satırlar sunucuda gerçek SAYIYLA kesiliyor (istemci referansı değil)', () => {
    // Canlıda (2026-10-09) sabit istemci dosyasından geldi ve kart boş kaldı.
    expect(KUTU).toContain("BEKLEYEN_ILK_SATIR,\n");
    expect(KUTU).toContain('isler.slice(0, BEKLEYEN_ILK_SATIR)');
    expect(KUTU).toContain('isler.slice(BEKLEYEN_ILK_SATIR)');
  });
});
