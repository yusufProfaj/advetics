import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ AUTO-BOOST EKRANININ YÜZEYİ ═══
 *
 * Bu ekranda ÜÇ eylem yüzeyi kaldırıldı ve dördüncüsü (bildirim havuzu) tek
 * yayın yolu olarak kaldı. Kullanıcının tarifi "çok karışık ve kullanışsız"
 * idi ama asıl tehlike görsel değildi:
 *
 * "Gönderi öne çıkar" ekranı bir zamanlar beş adımlı bir formdu ve aynı
 * satırda İKİ farklı bütçe davranışı taşıyordu — satıra tıklamak formu
 * besliyor (`POST /boosts/manual`, gövdedeki bütçe), sağdaki düğme ise ön
 * ayarla yayınlıyordu. Aynı gönderi, hangi düğmeye bastığına göre FARKLI
 * BÜTÇEYLE para harcıyordu.
 *
 * Ekran kalktı; kural KALKMADI ve artık DEPO GENELİNDE geçerli: panelde
 * `/boosts/manual` ucunu çağıran tek satır bile olmamalı. Bu tarama onu
 * kilitliyor — kod incelemesinde gözden kaçması kolay, üretimde bedeli para.
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
const WEB_SRC = join(__dirname, '..', '..');

function kod(yol: string): string {
  return readFileSync(join(WEB_SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Panelin bütün kaynak dosyaları — depo geneli iddialar için. */
function tumDosyalar(dizin: string, biriken: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) tumDosyalar(tam, biriken);
    else if (/\.tsx?$/.test(ad) && !ad.endsWith('.spec.ts')) biriken.push(tam);
  }
  return biriken;
}

const SAYFA = kod('app/(dashboard)/auto-boost/page.tsx');
const HAVUZ = kod('components/autoboost/bildirim-havuzu.tsx');
const DUZENLE = kod('components/autoboost/kart-duzenle.tsx');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okundu ve beklenen gövdeyi taşıyor', () => {
    expect(SAYFA).toContain('BildirimHavuzu');
    expect(HAVUZ).toContain('function Kart(');
    expect(DUZENLE).toContain('export function KartDuzenle');
  });
});

describe('KALDIRILAN YÜZEYLER', () => {
  it('KRİTİK: "Gönderi öne çıkar" ekranı YOK', () => {
    /*
     * Havuzla AYNI işi yapan ikinci bir yayın yoluydu ve iki yol iki farklı
     * bütçe uyguluyordu. Dosyanın kendisi de silindi — panelde duran ama
     * hiçbir yerden açılmayan bir ekran, bir sonraki okuyucuya "burada bir
     * şey var" diyen ölü kod olurdu.
     */
    expect(SAYFA).not.toContain('ManualBoost');
    expect(existsSync(join(WEB_SRC, 'components/boost/manual-boost.tsx'))).toBe(false);
  });

  it('KRİTİK: "Onaylananları şimdi oluştur" düğmesi YOK', () => {
    // Havuzdan onaylanan kart zaten anında yayınlanıyor; düğme neredeyse her
    // zaman "0 boost oluşturuldu" diyordu.
    expect(SAYFA).not.toContain('CreateApprovedButton');
    expect(kod('components/boost/boost-controls.tsx')).not.toContain(
      'export function CreateApprovedButton',
    );
  });

  it('KRİTİK: "YouTube kanalı ekle" YOK', () => {
    // Kanal bağlama işi Platform Bağlantıları'na ait ve orada ayrı bir
    // entegrasyon olarak kurulacak.
    expect(SAYFA).not.toContain('YouTubeKanalEkle');
    expect(existsSync(join(WEB_SRC, 'components/autoboost/youtube-kanal-ekle.tsx'))).toBe(
      false,
    );
  });

  it('KRİTİK: PANELDE `/boosts/manual` ucunu çağıran TEK SATIR YOK', () => {
    /*
     * O uç ön ayarı YOK SAYIP gövdedeki bütçe ve hedeflemeyi uyguluyor.
     * Panelden çağrılması, kullanıcının kurduğu bütçenin sessizce
     * atlanması demek. İddia artık tek bir dosyaya değil DEPOYA bakıyor:
     * ekran silindi, kural kalmalı.
     */
    const suclular = tumDosyalar(WEB_SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('/boosts/manual'),
    );
    expect(suclular, `/boosts/manual çağıran dosyalar: ${suclular.join(', ')}`).toEqual([]);
  });
});

describe('EKRANIN ADI VE BÖLÜM BAŞLIKLARI', () => {
  it('KRİTİK: sayfa kenar çubuğuyla AYNI adı taşıyor', () => {
    /*
     * Menüde "Akıllı Boost" yazıyor, sayfa "Auto-Boost" açılıyordu. Aynı
     * şeyin iki adı olması kullanıcıya yanlış sayfaya düştüğünü
     * düşündürüyor; üstelik "Auto-Boost" Türkçe de değil.
     */
    expect(SAYFA).toContain('Akıllı Boost');
    expect(SAYFA).not.toContain('>Auto-Boost<');
    expect(SAYFA).toContain("title: 'Akıllı Boost · Advetics'");
  });

  it('KRİTİK: iki onay kuyruğunun başlığı KAYNAĞINI söylüyor', () => {
    /*
     * Sayfada iki ayrı onay kuyruğu var ve eskiden ikisi de yalnızca "onay
     * bekliyor" diyordu: üstteki kartlar YENİ yayınlanan içerikler,
     * alttakiler kuralın performansa bakıp seçtikleri. Aynı cümle ikisini
     * de anlattığı için kullanıcı bir gönderinin neden birinde olup
     * diğerinde olmadığını okuyamıyordu.
     */
    expect(HAVUZ).toContain('Yeni içerikler');
    expect(HAVUZ).not.toContain('Bildirim Havuzu');
    expect(SAYFA).toContain('Kuralın seçtikleri');
    expect(SAYFA).not.toContain('gönderi onay bekliyor');
  });

  it('KRİTİK: değerlendirme sıklığı KURALIN yanında, sayfa başlığında değil', () => {
    /*
     * "günde iki kez değerlendiriliyor" sayfa başlığındaydı ve bütün ekran
     * için geçerli gibi okunuyordu. Yeni içerik kartları yayınlandığı anda
     * düşüyor; yalnızca kural motoru günde iki kez koşuyor. Kartını bekleyen
     * kullanıcıya akşamı beklettiren bir cümleydi.
     */
    const kurallar = SAYFA.indexOf('Boost kuralları');
    const siklik = SAYFA.indexOf("08:30 ve 20:30");
    expect(kurallar, 'kural başlığı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(siklik).toBeGreaterThan(kurallar);
    expect(SAYFA).not.toContain('günde iki kez değerlendiriliyor');
  });
});

describe('SESSİZ HATA YOK', () => {
  it('KRİTİK: kural listesi okunamazsa SÖYLENİYOR', () => {
    /*
     * `.catch(() => null)` ile alınan kural listesi düştüğünde bölüm hiç
     * çizilmiyordu: kuralı olan kullanıcı, kuralı SİLİNMİŞ gibi bir ekran
     * görüyordu ve hiçbir yerde tek bir kelime yazmıyordu.
     */
    expect(SAYFA).toContain('allSettled');
    expect(SAYFA).not.toContain('.catch(() => null)');
    expect(SAYFA).toContain('Kurallar okunamadı');
  });

  it('KRİTİK: sunucunun kendi cümlesi ekranda', () => {
    // "Veri alınamadı" kullanıcıyı sebebi kendi kurulumunda aramaya
    // gönderiyor; mesaj çoğu zaman doğrudan söylüyor.
    expect(SAYFA).toContain('function hataMetni');
    expect(SAYFA).toContain('ApiRequestError');
  });

  it('KRİTİK: kural çalıştırma hatası yutulmuyor', () => {
    const kontrol = kod('components/boost/boost-controls.tsx');
    expect(kontrol).not.toContain('} catch {');
    expect(kontrol).toContain('err instanceof ApiRequestError ? err.message');
  });
});

describe('GEÇMİŞ SAYFAYI BOĞMUYOR', () => {
  it('KRİTİK: geçmiş KESİLİYOR ve kesildiği yazılıyor', () => {
    /*
     * `/boosts` ucu limitsiz dönüyor ve her kayıt tam boy kart olarak
     * çiziliyordu: günde iki boost açan bir workspace'te sayfa bir yıl sonra
     * yüzlerce görselle açılır. Sessiz kesme de yok — toplam yazılı.
     */
    expect(SAYFA).toContain('const gecmisSiniri');
    expect(SAYFA).toContain('others.slice(0, gecmisSiniri)');
    expect(SAYFA).toContain('toplam ${others.length}');
  });

  it('KRİTİK: geçmiş satırı ONAY KARTI DEĞİL', () => {
    /*
     * Geçmişte verilecek bir karar yok; aynı kartı kullanmak sayfanın asıl
     * işini (onay) geçmişin içinde kaybediyordu.
     */
    const i = SAYFA.indexOf('function GecmisSatiri');
    expect(i, 'geçmiş satırı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = SAYFA.slice(i, i + 2000);
    expect(dilim).not.toContain('BoostDecision');
    expect(dilim).toContain('h-9 w-9');
  });
});

describe('BİLDİRİM HAVUZU — üç düğme', () => {
  it('KRİTİK: Onayla, Düzenle ve Reddet birlikte', () => {
    // Üç ayrı karar: ön ayarla yayınla · sadece bu gönderi için değiştir ·
    // kartı kapat.
    expect(HAVUZ).toContain('Onayla');
    expect(HAVUZ).toContain('Düzenle');
    expect(HAVUZ).toContain('Reddet');
  });

  it('KRİTİK: Düzenle ONAYIN İÇİNE gömülmedi — ayrı düğme', () => {
    /*
     * Önce pencere sonra yayın akışı, kartların çoğu için fazladan bir adım
     * olurdu: çoğu kart ön ayarla yayınlanıyor ve akışın vaadi "tek tık".
     */
    expect(HAVUZ).toContain('onClick={() => setDuzenleAcik(true)}');
    expect(HAVUZ).toContain('onClick={() => void karar(true).catch(() => undefined)}');
  });

  it('KRİTİK: kart DİKEY gönderi tasarımında — 4:5', () => {
    /*
     * Kartlar yatay şeritlerdi ve görsel 64 pikseldi; kullanıcı neyi
     * onayladığını ancak içeriği yeni sekmede açarak anlıyordu. Kare oran
     * dikey gönderilerin ve reels'in üstünü/altını kırpıyor.
     */
    expect(HAVUZ).toContain('aspect-[4/5]');
    expect(HAVUZ).toContain('object-cover');
    expect(HAVUZ).not.toContain('h-16 w-16');
  });

  it('KRİTİK: SIĞDIĞI KADAR KOLON — geniş ekranda üçle sınırlı değil', () => {
    /*
     * Üç kolonda kartlar geniş ekranda gereksiz büyüyordu ve tek satıra
     * üçten fazla gönderi sığmıyordu. Kart bir gönderi ÖNİZLEMESİ; onu
     * tanımak için 260 piksel yetiyor.
     */
    expect(HAVUZ).toContain('xl:grid-cols-4');
    expect(HAVUZ).toContain('2xl:grid-cols-5');
  });

  it('KRİTİK: görsel `referrerPolicy="no-referrer"` ile çekiliyor', () => {
    // Meta CDN referrer'lı isteği reddediyor ve beyaz etiket alan adını da
    // sızdırmak istemiyoruz.
    expect(HAVUZ).toContain('referrerPolicy="no-referrer"');
  });

  it('KRİTİK: harcanacak tutar DÜĞMELERİN ÜSTÜNDE', () => {
    // Bu düğmeler para harcıyor; tutarı altına koymak, kullanıcının
    // tıkladıktan sonra okuması demek olurdu.
    /*
     * İDDİA DÜĞME SATIRINA ÇAPALI, `grid-cols-3`E DEĞİL.
     * İlk yazımda öyleydi ve havuzun KENDİ ızgarası (`xl:grid-cols-3`)
     * dosyada daha ÖNCE geçtiği için iddia yanlış yeri ölçtü — kod
     * doğruyken kırmızı verdi.
     */
    const butce = HAVUZ.indexOf('kayit.preset.budgetMicros');
    const dugmeler = HAVUZ.indexOf('grid grid-cols-3 gap-1.5');
    expect(butce).toBeGreaterThan(-1);
    expect(dugmeler, 'düğme satırı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(dugmeler).toBeGreaterThan(butce);
  });
});

describe('SADECE BU GÖNDERİ İÇİN — düzenleme penceresi', () => {
  it('KRİTİK: bütçe, süre, kitle ve şehir birlikte sunuluyor', () => {
    // Kullanıcının isteği birebir buydu: "kaç gün, toplamda kaç TL, hangi
    // hedef kitle ve şehir".
    expect(DUZENLE).toContain('Bütçe ve süre');
    expect(DUZENLE).toContain('Hedef kitle ve şehir');
    expect(DUZENLE).toContain('durationDays: gun');
  });

  it('KRİTİK: HEDEFLEME SEÇİCİSİ ORTAK — ikinci bir kopya yok', () => {
    /*
     * Ön ayar formu ve bu pencere AYNI seçiciyi kullanıyor. İkinci bir
     * kopya doğduğu anda ayrışır ve iki ekran farklı hedefleme kurardı —
     * bu depoda `meta-targeting` ile bir kez yaşandı.
     */
    expect(DUZENLE).toContain('<HedeflemeSecici');
    expect(kod('components/autoboost/boost-on-ayarlari-formu.tsx')).toContain(
      '<HedeflemeSecici',
    );
    expect(existsSync(join(WEB_SRC, 'components/autoboost/hedefleme-secici.tsx'))).toBe(true);
  });

  it('KRİTİK: pencere ÖN AYARI KAYDETMİYOR — kaydeden uç çağrılmıyor', () => {
    /*
     * "Sadece o gönderi için" denen bir ayarın sonraki bütün gönderileri
     * sessizce etkilemesi, istenenin tam tersi olurdu.
     */
    expect(DUZENLE).not.toContain('/autoboost/presets');
    expect(DUZENLE).toContain('Ön ayar değişmiyor');
  });

  it('KRİTİK: `override` yalnızca VARSA gönderiliyor', () => {
    /*
     * Şema `.strict()`; boş bir nesne göndermek "hiçbir alanı değiştirme"
     * ile "hepsini sıfırla" arasındaki farkı sunucuya taşımak olurdu.
     */
    expect(HAVUZ).toContain('JSON.stringify(override ? { approve, override } : { approve })');
  });

  it('KRİTİK: GOOGLE kartında toplam bütçe seçeneği GÖSTERİLMİYOR', () => {
    /*
     * Google'da bütçe ayrı bir kaynak ve günlük. Seçtirip sunucuda
     * reddetmek, kullanıcıyı çalışmayan bir seçeneğe davet etmek olurdu.
     */
    expect(DUZENLE).toContain("const gunlukZorunlu = kayit.platform === 'google'");
    expect(DUZENLE).toContain('{!gunlukZorunlu && (');
  });

  it('KRİTİK: toplam taahhüt tutar girilmeden SIFIR gösterilmiyor', () => {
    // Boş bir alanda "0 ₺ taahhüt" yazmak hesaplanmış bir sayı gibi okunur
    // ve kullanıcı bedava sanır.
    expect(DUZENLE).toContain('return null');
    expect(DUZENLE).toContain('Tutar girilince toplam taahhüt burada yazacak');
  });
});
