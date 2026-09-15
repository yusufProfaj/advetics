import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KANAL KARTLARI: BAĞLANMAK VE DURUM AYNI YERDE ═══
 *
 * Bu ekranda bir platformla ilgili bilgi üç ayrı bloğa dağılmıştı ve
 * kullanıcının tarifi "hepsi birbirine karışmış" oldu. Buradaki iddialar
 * yeniden dağılmasını engelliyor.
 *
 * Hiçbiri hata üretmiyor: bozulduklarında ekran çalışmaya devam ediyor,
 * yalnızca yanlış şeyi söylüyor ya da okunmaz hâle geliyor.
 */
const DIR = __dirname;
const yorumsuz = (m: string): string =>
  m
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const KANAL = yorumsuz(readFileSync(join(DIR, 'kanal-kartlari.tsx'), 'utf8'));
const SAYFA = yorumsuz(
  readFileSync(
    join(DIR, '..', '..', 'app', '(dashboard)', 'ayarlar', 'baglantilar', 'page.tsx'),
    'utf8',
  ),
);

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(KANAL).toContain('export function KanalKartlari');
    expect(KANAL.length).toBeGreaterThan(3000);
    expect(SAYFA).toContain('Platform Bağlantıları');
  });
});

describe('bağlanma kanalın İÇİNDE', () => {
  it('KRİTİK: ayrı bir "Yeni bağlantı" kutusu YOK', () => {
    /*
     * "Bağlan" ayrı bir kutudaydı ve bağlı olup olmadığını SÖYLEMİYORDU:
     * Meta zaten bağlıyken de aynı düğme aynı şekilde duruyordu. "Bağlan"
     * bir kanalın DURUMLARINDAN biri; ayrı kutu onu bağlantının kendisinden
     * kopuk bir işlem gibi gösteriyordu.
     */
    expect(SAYFA).not.toContain('ConnectButtons');
    expect(SAYFA).not.toContain('Yeni bağlantı');
    expect(SAYFA).toContain('<KanalKartlari');
  });

  it('KRİTİK: bağlanma düğmesi YALNIZCA bağlı olmayan kanalda', () => {
    // Bağlıyken de "Bağlan" göstermek, kullanıcıya ikinci bir yetkilendirme
    // yaptırıp platformda ilk token'ı geçersiz kıldırırdı.
    const i = KANAL.indexOf('{!bagli ? (');
    expect(i, 'bağlı/bağlı değil dallanması yok').toBeGreaterThan(-1);
    const dilim = KANAL.slice(i, KANAL.indexOf(') : (', i));
    expect(dilim).toContain('BaglanmaAlani');
  });

  it('KRİTİK: yapılandırılmamış kanal GİZLENMİYOR, sebebi yazılıyor', () => {
    /*
     * Kartı hiç çizmemek, kullanıcının o platformun desteklenmediğini
     * sanması demekti; eksik olan şey sunucudaki anahtar.
     */
    expect(KANAL).toContain('if (!uygunluk.configured)');
    expect(KANAL).toContain('uygunluk.missingConfig.join');
  });

  it('yetkisiz kullanıcıda düğme kapalı VE sebebi yazılı', () => {
    // Sebepsiz kapalı bir düğme, kullanıcıyı olmayan bir arızayı aramaya
    // gönderiyor.
    expect(KANAL).toContain('disabled={!canManage || pending}');
    expect(KANAL).toContain('Bağlantı kurmak yöneticinin işi.');
  });
});

describe('sayılar', () => {
  it('KRİTİK: üç sayı TEK cümlede ve kapsama ilişkisi okunuyor', () => {
    /*
     * Aynı hesaplar üç ayrı yerde, üç ayrı kelimeyle sayılıyordu
     * ("keşfedildi", "boşta", "izlenen") ve hangisinin hangisini kapsadığı
     * hiçbir yerde yazmıyordu; kullanıcı sayıları topluyordu.
     */
    expect(KANAL).toContain('reklam hesabı');
    expect(KANAL).toContain('atanmış,');
    expect(KANAL).toContain('veri çekiyor');
  });

  it('KRİTİK: atanmış ama veri çekmeyen hesap AYRICA söyleniyor', () => {
    /*
     * Bu üründe en sık çıkan sessiz arıza: panelde "bağlı" görünen hesap
     * hiçbir şey getirmiyor. İki sayıyı tek rakamda toplamak onu görünmez
     * yapardı.
     */
    const i = KANAL.indexOf('{atanmis > izlenen && (');
    expect(i, 'kapalı hesap uyarısı yok').toBeGreaterThan(-1);
    expect(KANAL.slice(i, i + 400)).toContain('veri çekmiyor');
  });
});

describe('iki "yenile" birbirine karışmıyor', () => {
  it('KRİTİK: hesap taraması ile veri tazeleme AYRI adlarda', () => {
    /*
     * Sayfada iki işlem vardı ve ikisi de "yenile" diyordu: bağlantı
     * kartındaki "Hesapları yenile" platformdan HESAP LİSTESİNİ okuyor,
     * sayfanın üstündeki "Tüm verileri güncelle" METRİK çekiyor. Aynı
     * kelime iki farklı işi anlatınca kullanıcı hangisine basacağını
     * bilemiyordu.
     */
    expect(KANAL).toContain('Hesapları tara');
    expect(KANAL).not.toContain('Hesapları yenile');
  });
});

describe('sayfanın sırası', () => {
  it('KRİTİK: kanallar önce, bakım en sonda', () => {
    /*
     * Veri tazeleme sayfanın EN ÜSTÜNDEYDİ: ekranın ilk gördüğü şey bir
     * bakım işlemiydi. Bağlantı sağlığı ise en alttaydı, oysa bağlantı
     * bozuksa sayfanın geri kalanı anlamsız.
     */
    const kanallar = SAYFA.indexOf('<KanalKartlari');
    const havuz = SAYFA.indexOf('<HavuzKartlari');
    const atananlar = SAYFA.indexOf('<IzlenenHesaplar');
    const bakim = SAYFA.indexOf('<TopluTazeleme');
    for (const [ad, i] of [
      ['kanallar', kanallar],
      ['havuz', havuz],
      ['atananlar', atananlar],
      ['bakım', bakim],
    ] as const) {
      expect(i, `${ad} bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);
    }
    expect(kanallar).toBeLessThan(havuz);
    expect(havuz).toBeLessThan(atananlar);
    expect(atananlar).toBeLessThan(bakim);
  });
});

describe('ekranda geliştirici notu yok', () => {
  it('KRİTİK: platform onay süreci PANELDEN kalktı', () => {
    /*
     * "Meta App Review", izin kodları ve "Business Verification ve ekran
     * kaydı demo zorunlu" satırları bir GELİŞTİRME notuydu ve beyaz
     * etiketli bir üründe ajansın MÜŞTERİSİNİN okuduğu ekranda duruyordu:
     * kendi paneline girip Advetics'in başvuru durumunu görüyordu. İçerik
     * silinmedi, `docs/DEPLOYMENT.md`e taşındı.
     */
    for (const yasak of [
      'Platform onayları',
      'App Review',
      'ads_management',
      'Developer Token',
      'Business Verification',
    ]) {
      expect(SAYFA, `panelde geliştirici notu: ${yasak}`).not.toContain(yasak);
    }
  });

  it('BOŞA DÜŞME BEKÇİSİ: içerik belgeye taşındı', () => {
    // "Yok" iddiası tek başına, bilgi tamamen silinse de geçerdi.
    const belge = readFileSync(join(DIR, '..', '..', '..', '..', '..', 'docs', 'DEPLOYMENT.md'), 'utf8');
    expect(belge).toContain('Platform onayları');
    expect(belge).toContain('ads_management');
  });
});

describe('hata görünürlüğü', () => {
  it('KRİTİK: liste `.catch(() => [])` ile yutulmuyor', () => {
    /*
     * "Hiç bağlantı yok" ile "liste okunamadı" aynı boş ekrana
     * çevriliyordu. Birincisi tamamen normal bir durum; ikincisinde
     * kullanıcı var olan bağlantısını kaybettiğini sanıyor.
     */
    expect(SAYFA).not.toContain('.catch(() => [])');
    expect(SAYFA).toContain('allSettled');
    expect(SAYFA).toContain('yuklemeHatasi');
  });
});
