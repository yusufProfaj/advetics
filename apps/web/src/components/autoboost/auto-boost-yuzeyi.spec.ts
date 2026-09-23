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

  it('KRİTİK: "YouTube kanalı ekle" BU EKRANDA DEĞİL — bağlantılar ekranında', () => {
    /*
     * Kanal bağlamak bir BAĞLANTI KURULUMU işi. Boost ekranında dururken
     * kurulumu boost yetkisinin yanına koyuyordu: kart onaylayabilen herkes
     * yeni kanal bağlayabiliyordu.
     *
     * İddia "hiçbir yerde yok" DEĞİL "burada yok": ekran gerçekten kuruldu
     * ve "yok" diyen bir test, taşındığını değil silindiğini kilitlerdi.
     */
    expect(SAYFA).not.toContain('YouTubeKanalEkle');
    expect(existsSync(join(WEB_SRC, 'components/autoboost/youtube-kanal-ekle.tsx'))).toBe(
      false,
    );
    expect(existsSync(join(WEB_SRC, 'components/connections/youtube-kanal-ekle.tsx'))).toBe(
      true,
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
    /*
     * "Yeni içerikler" başlığı da kalktı: yayınlanmış ve reddedilmiş kartlar
     * artık listeden çıkmıyor, yani liste birkaç hafta sonra çoğunlukla ESKİ
     * içerikten oluşuyor ve başlık listeyi anlatmıyordu.
     */
    /*
     * İDDİA BAŞLIK ETİKETİNE ÇAPALI: "İçerikler" dosyanın başka yerlerinde de
     * geçiyor (yükleniyor, açılamadı) ve yalnızca onu aramak, başlık silinse
     * bile yeşil kalırdı.
     */
    expect(HAVUZ).toContain('<h2 className="text-sm font-semibold text-ink">\n          İçerikler');
    expect(HAVUZ).not.toContain('Yeni içerikler');
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

describe('BİLDİRİM HAVUZU — üç hâl, üç düğme takımı', () => {
  it('KRİTİK: KARAR BEKLEYEN kartta Yayınla · Düzenle · Yayınlama', () => {
    /*
     * Etiketler kullanıcının kendi kelimeleri. "Onayla/Reddet" ikilisi bir
     * ONAY SÜRECİ anlatıyordu; buradaki karar ise "bunu yayınla" ya da
     * "bunu yayınlama" — aynı şey değil ve yanlış kelime, kullanıcıya
     * onaylaması gereken bir merci varmış izlenimi veriyordu.
     */
    expect(HAVUZ).toContain('Yayınla');
    expect(HAVUZ).toContain('Düzenle');
    expect(HAVUZ).toContain('Yayınlama');
    expect(HAVUZ).not.toContain('>Onayla<');
    expect(HAVUZ).not.toContain('Reddet');
  });

  it('KRİTİK: YAYINDAKİ kartta Duraklat · Düzenle · İptal', () => {
    /*
     * Kart yayına girdikten sonra panelde yapılacak hiçbir şey kalmıyordu:
     * reklam Meta'da harcamaya devam ediyor, kullanıcı onu durdurmak için
     * Ads Manager'a gidiyordu. Başlatabilip durduramayan bir panel, "reklamcı
     * olmayan da kullanabilsin" vaadini tutmuyor.
     */
    expect(HAVUZ).toContain('Yayını duraklat');
    expect(HAVUZ).toContain('Yayını sürdür');
    expect(HAVUZ).toContain('İptal');
  });

  it('KRİTİK: KAPANMIŞ kartta Tekrar yayınla · Düzenle · Yayınlama', () => {
    expect(HAVUZ).toContain('Tekrar yayınla');
    expect(HAVUZ).toContain('function kapat()');
  });

  it('KRİTİK: DÜĞME TAKIMI `boostDurumu`NDAN SEÇİLİYOR — kart durumundan değil', () => {
    /*
     * Kart `launched` olduğu hâlde kampanya çoktan bitmiş olabilir. Bitmiş
     * bir kampanyaya "duraklat" göstermek, basıldığında hata veren bir düğme
     * göstermek olurdu.
     */
    expect(HAVUZ).toContain("kayit.boostDurumu === 'active'");
    expect(HAVUZ).toContain("kayit.boostDurumu === 'paused'");
    expect(HAVUZ).toContain('const tekrarGosterilsin = !canli');
  });

  it('KRİTİK: İPTAL ile YAYINLAMA AYRI İŞLER', () => {
    /*
     * İptal yayındaki reklamı DURDURUYOR; Yayınlama yalnızca kartı
     * kapatıyor. Birleştirmek, listeden kaldırmak isteyen kullanıcının
     * farkında olmadan yayındaki reklamı durdurması olurdu.
     */
    expect(HAVUZ).toContain("yayinKontrol('iptal')");
    expect(HAVUZ).toContain("/kapat`");
  });

  it('KRİTİK: KİME GİDİYOR KARTTA YAZIYOR', () => {
    /*
     * Hedefleme ön ayarın içinde duruyordu ve kartta hiç görünmüyordu:
     * kullanıcı onayladığı reklamın kime gideceğini görmek için ön ayarı
     * açmak zorundaydı. Her onay para harcıyor ve kime harcandığı, ne kadar
     * harcandığı kadar önemli.
     */
    expect(HAVUZ).toContain('hedeflemeOzeti(kayit.preset.settings)');
    expect(HAVUZ).toContain('<Hedefleme kayit={kayit} />');
  });

  it('KRİTİK: ROZET KAMPANYANIN DURUMUNU SÖYLÜYOR', () => {
    /*
     * Kart yayına girdikten sonra durumu `launched` olarak KALIYOR: kampanya
     * duraklatılsa da bitse de kart aynı. Rozet kart durumundan okununca
     * süresi dolmuş bir boost "Yayında" yazıyor, hemen altındaki düğme
     * "Tekrar yayınla" diyordu — aynı kartta iki farklı gerçek.
     */
    expect(HAVUZ).toContain('const anahtar = kayit.boostDurumu ?? kayit.status;');
    expect(HAVUZ).toContain("paused: 'Duraklatıldı'");
  });

  it('KRİTİK: GÖNDERİ METNİNİN TAMAMI AÇILABİLİYOR', () => {
    // İki satıra kırpılıyordu ve kırpılan yer çoğu zaman teklifin kendisiydi.
    expect(HAVUZ).toContain('Metnin tamamı');
    expect(HAVUZ).toContain("metinAcik ? '' : 'line-clamp-2'");
  });

  it('KRİTİK: Düzenle ONAYIN İÇİNE gömülmedi — ayrı düğme', () => {
    /*
     * Önce pencere sonra yayın akışı, kartların çoğu için fazladan bir adım
     * olurdu: çoğu kart ön ayarla yayınlanıyor ve akışın vaadi "tek tık".
     */
    expect(HAVUZ).toContain('onClick={() => setDuzenleAcik(true)}');
    expect(HAVUZ).toContain('onClick={() => void karar(true).catch(() => undefined)}');
  });

  it('KRİTİK: kart SATIR düzeninde — dikey ızgara değil', () => {
    /*
     * Kartlar 4:5 oranında dikey ızgara kutularıydı ve o düzen bir şeyi
     * taşıyamıyordu: yayınlanmış kartın SONUCU. Kullanıcı boostladığı
     * gönderinin ne yaptığını görmek için Genel Bakış'a gidip kampanyayı
     * aramak zorundaydı.
     *
     * Satır düzeni üç bölgeyi yan yana koyuyor (görsel · metin ve karar ·
     * rakamlar) ve dar ekranda alt alta yığılıyor.
     */
    expect(HAVUZ).toContain('sm:flex-row');
    expect(HAVUZ).toContain('h-24 w-24 shrink-0');
    expect(HAVUZ).not.toContain('aspect-[4/5]');
  });

  it('KRİTİK: TEK SÜTUN — ızgara değil', () => {
    /*
     * Izgarada sıra soldan sağa akıp alta atlıyor ve göz onu takip etmiyor;
     * kartlar artık GÖNDERİ TARİHİNE göre diziliyor ve tarih sırası ancak
     * tek sütunda okunabiliyor.
     */
    expect(HAVUZ).toContain('<ul className="space-y-2">');
    expect(HAVUZ).not.toContain('xl:grid-cols-4');
    expect(HAVUZ).not.toContain('2xl:grid-cols-5');
  });

  it('KRİTİK: YAYINLANMIŞ GÖNDERİ BULANIK — ve üstünde YAZIYOR', () => {
    /*
     * Kullanıcının isteği birebir: boostlanan gönderi listeden çıkmıyor,
     * bulanıklaşıp "Yayınlandı" diyor.
     *
     * İDDİA İKİ PARÇALI ve ikincisi asıl olan: bulanıklık TEK BAŞINA işaret
     * olamaz. Bir efekt ya da renk tek başına anlam taşırsa, onu göremeyen
     * kullanıcı için o anlam hiç yok.
     */
    expect(HAVUZ).toContain("yayinda ? 'scale-105 blur-[3px]' : ''");
    expect(HAVUZ).toContain('{yayinda && (');
    expect(HAVUZ).toContain('Yayınlandı');
  });

  it('KRİTİK: SIRALAMA GÖNDERİ TARİHİNE GÖRE — mutlak tarih yazılı', () => {
    /*
     * Kart üstünde "3 gün önce" yazıyordu. Göreli zaman tazelik sorusunun
     * cevabı; burada sorulan şey gönderinin TARİHİ ve kullanıcı kartı kendi
     * içerik takviminde arıyor.
     *
     * İKİ TARİH AYRI: gönderinin yayın tarihi ile reklamın açıldığı tarih
     * arasında haftalar olabiliyor.
     */
    expect(HAVUZ).toContain('formatTarih(kayit.publishedAt)');
    expect(HAVUZ).toContain('formatTarih(kayit.launchedAt)');
    expect(HAVUZ).not.toContain('formatRelative(kayit.publishedAt)');
  });

  it('KRİTİK: görsel `referrerPolicy="no-referrer"` ile çekiliyor', () => {
    // Meta CDN referrer'lı isteği reddediyor ve beyaz etiket alan adını da
    // sızdırmak istemiyoruz.
    expect(HAVUZ).toContain('referrerPolicy="no-referrer"');
  });

  it('KRİTİK: harcanacak tutar KARARIN YANINDA — kartın kendi sütununda', () => {
    /*
     * Bu düğmeler para harcıyor ve tutar karara BAKARKEN görünmeli.
     * Eskiden düğmelerin üstündeydi; satır düzeninde sağ sütuna taşındı ve
     * orada her zaman görünür — metin uzunluğu ne olursa olsun aşağı
     * kaymıyor.
     *
     * İDDİA SÜTUNUN VARLIĞINA DEĞİL İÇERİĞİNE ÇAPALI: sütun dursa ve
     * bütçeyi çizmese, "sağ sütun var" testi yine yeşil kalırdı.
     */
    expect(HAVUZ).toContain('function SagBolge(');
    expect(HAVUZ).toContain("formatMoney(kayit.preset.budgetMicros, 'TRY')");
    expect(HAVUZ).toContain('<SagBolge kayit={kayit} />');
  });

  it('KRİTİK: YAYINDAKİ KARTIN SONUCU GÖSTERİLİYOR', () => {
    /*
     * Kart onaydan önce "ne kadara mal olacak", onaydan sonra "ne oldu"
     * sorusunu taşıyor ve ikincisinin cevabı bu ekranda hiç yoktu.
     */
    expect(HAVUZ).toContain('kayit.performance');
    expect(HAVUZ).toContain('etiket="Harcama"');
    expect(HAVUZ).toContain('etiket="Dönüşüm"');
  });

  it('KRİTİK: SAYI YOKSA SEBEBİ YAZIYOR', () => {
    /*
     * "Kampanya henüz senkronize edilmedi" ile "hiç gösterim almadı" aynı
     * boş alana çevrilirse, kullanıcı çalışan bir kampanyayı bozuk sanıp
     * aramaya çıkar.
     */
    expect(HAVUZ).toContain('kayit.performanceNote');
  });

  it('KRİTİK: TO ve EBM TANIMSIZKEN SIFIR GÖSTERİLMİYOR', () => {
    /*
     * Gösterim yoksa TO tanımsız, dönüşüm yoksa EBM tanımsız. "%0" yazmak
     * müşteriye "kampanyan çalışmıyor" demek olur.
     *
     * EBM'nin böleni ayrıca SIFIRA YUVARLANABİLİYOR (Google kısmi dönüşüm
     * döndürüyor) ve `BigInt` bölmesi sıfıra bölümde fırlatıyor — kartın
     * tamamı çizilmez hâle gelirdi. Koşul bölenin KENDİSİNE bakıyor.
     */
    expect(HAVUZ).toContain('p.impressions > 0 ? (p.clicks / p.impressions) * 100 : null');
    expect(HAVUZ).toContain('const bolen = Math.round(p.conversions * 1000)');
    expect(HAVUZ).toContain('bolen > 0 ?');
  });
});

describe('TEKRAR BOOSTLA', () => {
  /*
   * Kullanıcının isteği: yayınlanmış gönderi listede kalıyor ve tekrar
   * boostlanabiliyor. Tehlike, aynı gönderi için ikinci bir AKTİF kampanya:
   * boosts_active_post_uniq kısmi tekil indeksi buna izin vermiyor ve engeli
   * onay anında öğrenmek, sebebi yazmayan bir veritabanı hatası göstermek
   * olurdu.
   */
  it('KRİTİK: kendi ucunu çağırıyor — karar ucunu DEĞİL', () => {
    // Karar ucu yalnızca `pending` kart kabul ediyor; kapanmış bir kartı
    // oraya göndermek "bu kart zaten işlendi" ile dönerdi.
    expect(HAVUZ).toContain('/tekrar');
    expect(HAVUZ).toContain('async function tekrarBoostla()');
  });

  it('KRİTİK: ENGEL SEBEBİ EKRANDA — `title` ipucunda değil', () => {
    /*
     * Kapalı bir düğmeye ipucu koymak, sebebi yalnızca fareyle üstüne gelen
     * kullanıcıya söylemek olurdu; dokunmatik ve klavye kullanıcısı hiçbir
     * şey görmez.
     */
    expect(HAVUZ).toContain('{kayit.reBoostBlockedReason && (');
    expect(HAVUZ).toContain('disabled={busy !== null || kayit.reBoostBlockedReason !== null}');
  });

  it('KRİTİK: AÇIK DURUM LİSTESİ SUNUCUYLA AYNI', () => {
    /*
     * Ayrışırlarsa panel açık bir düğme gösterir ve sunucu reddeder;
     * kullanıcı sebebi kendi kurulumunda arar. İki dosyadaki liste birebir
     * karşılaştırılıyor — biri güncellenip diğeri unutulursa test düşüyor.
     */
    const api = readFileSync(
      join(WEB_SRC, '../../../apps/api/src/modules/autoboost/autoboost-launch.service.ts'),
      'utf8',
    );
    const desen = /const TEKRAR_ACIK_DURUMLAR = new Set\((\[[^\]]*\])\)/;
    const panelde = desen.exec(HAVUZ)?.[1];
    const sunucuda = desen.exec(api)?.[1];
    expect(panelde, 'panelde liste bulunamadı — tarama boşa düştü').toBeTruthy();
    expect(sunucuda, 'sunucuda liste bulunamadı — tarama boşa düştü').toBeTruthy();
    expect(panelde).toBe(sunucuda);
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

describe('İKİ MECRA TEK EKRANDA', () => {
  /*
   * Instagram gönderisi ve YouTube videosu aynı ızgarada duruyor ve bu doğru:
   * ikisi de aynı kararı bekliyor. Ama ikisinin görsel oranı, mecra adı ve
   * logosu farklı ve bu farkları elle yazılmış koşullarla yönetmek, üçüncü
   * bir kaynakta YANLIŞ ROZET üretir — yanlış rozet eksik rozetten kötüdür,
   * kullanıcı sorgulamaz.
   */
  it('KRİTİK: mecra tabloları `Record` — koşul zinciri değil', () => {
    expect(HAVUZ).toContain('Record<AutoBoostPlatform, string>');
    expect(HAVUZ).toContain('Record<AutoBoostPlatform, ChannelKind>');
    expect(HAVUZ).toContain('GORSEL_BICIMI');
  });

  it('KRİTİK: YATAY GÖRSEL KIRPILMIYOR — kutuya sığdırılıyor', () => {
    /*
     * YouTube küçük resmi 16:9 ve kart kutusu 4:5. `object-cover` iki yanı
     * kesiyor; küçük resimde metin çoğu zaman tam oraya yazılıyor. Kart
     * oranını içeriğe göre değiştirmek ise ızgaradaki satır hizasını bozuyor.
     */
    /*
     * DİLİM TABLONUN KENDİ SINIRINDAN ÇIKARILIYOR.
     *
     * Eskiden bitiş işareti bir YORUM metniydi ve yorumlar taramadan önce
     * siliniyor: `indexOf` -1 dönüyor, `slice(i, -1)` dosyanın sonuna kadar
     * uzanıyordu. Test geçiyordu ama tabloyu değil dosyanın tamamını
     * ölçüyordu.
     */
    const bas = HAVUZ.indexOf('const GORSEL_BICIMI');
    expect(bas, 'tablo bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const blok = HAVUZ.slice(bas, HAVUZ.indexOf('};', bas));
    expect(blok).toContain("google: { oturtma: 'object-contain'");
    expect(blok).toContain("meta: { oturtma: 'object-cover'");
  });

  it('KRİTİK: sığdırılan görselin arkasında BULANIK ZEMİN var', () => {
    // Düz gri boşluk kartı "yüklenmemiş" gösteriyor; zemin görselin
    // kendisinden geliyor.
    // İddia ANAHTARA değil KULLANIMA çapalı: tabloda alan durup JSX'te hiç
    // okunmasa, "bulanikZemin geçiyor" testi yine yeşil kalırdı.
    expect(HAVUZ).toContain('{bicim.bulanikZemin && (');
    expect(HAVUZ).toContain('blur-xl');
  });

  it('KRİTİK: rozet HESABIN ADINI taşıyor', () => {
    /*
     * "Instagram" yazması hangi Instagram hesabı olduğunu söylemiyordu; bir
     * workspace'te birden çok hesap ve kanal olabiliyor.
     */
    expect(HAVUZ).toContain('kayit.socialProfileName ??');
  });

  it('KRİTİK: MECRA SÜZGECİ var ve sayıları yazıyor', () => {
    expect(HAVUZ).toContain('SuzgecDugmesi');
    expect(HAVUZ).toContain("useState<AutoBoostPlatform | 'hepsi'>('hepsi')");
  });

  it('KRİTİK: SÜZGEÇ TEK KAYNAKTA ÇİZİLMİYOR', () => {
    // Tek kaynaklı bir workspace'te süzgeç, hiçbir işe yaramayan bir seçim.
    expect(HAVUZ).toContain('mecralar.length > 1');
  });

  it('KRİTİK: DURUM SÜZGECİ var — yayınlananlar listede kalıyor', () => {
    /*
     * Yayınlanan kart artık listeden çıkmıyor (kullanıcının isteği) ve bunun
     * bedeli liste uzunluğu: bir yıl sonra onay bekleyen üç kart, yayınlanmış
     * yüz kartın arasında kalıyor. Süzgeç o bedeli ödüyor.
     */
    expect(HAVUZ).toContain('DURUM_SUZGECLERI');
    expect(HAVUZ).toContain("etiket: 'Onay bekliyor'");
    expect(HAVUZ).toContain("etiket: 'Yayında'");
  });

  it('KRİTİK: süzgecin gizlediği kart sayısı YAZILI', () => {
    /*
     * Süzgeci unutan kullanıcı eksik listeyi "kart gelmemiş" diye okur.
     * Ayrıca süzgeç yüzünden boşalan liste, GERÇEKTEN boş listeyle aynı
     * görünmemeli: biri "kart yok", diğeri "kartlar başka sekmede".
     */
    expect(HAVUZ).toContain('kart süzgeçte');
    expect(HAVUZ).toContain('Bu süzgeçte kart yok');
  });
});

describe('GEÇMİŞ İÇERİK DÜĞMESİ', () => {
  /*
   * Kart üretiminin iki otomatik yolu da TEK SEFERLİKTİ (ön ayarın tohum
   * damgası, kanalın atanma anı). Koşullardan biri o an yerinde değilse
   * fırsat harcanıyor ve kullanıcının elinde hiçbir düğme kalmıyordu —
   * üretimde bir workspace'te YouTube kartları geldi, Instagram kartları
   * gelmedi.
   */
  it('KRİTİK: düğme var ve kendi ucunu çağırıyor', () => {
    expect(HAVUZ).toContain("'/autoboost/gecmis-icerik'");
    expect(HAVUZ).toContain('Geçmiş içerikleri getir');
  });

  it('KRİTİK: YETKİYE BAĞLI — okuyan kullanıcıda çizilmiyor', () => {
    // Kart üretmek `boost.write` işi; okuma yetkisi olan kullanıcıya
    // çalışmayacak bir düğme göstermek "bozuk" olarak okunur.
    expect(HAVUZ).toContain('{canWrite && (');
    expect(kod('app/(dashboard)/auto-boost/page.tsx')).toContain('canWrite={canWrite}');
  });

  it('KRİTİK: SONUÇ PROFİL BAZINDA YAZILIYOR', () => {
    /*
     * Tek bir "0 kart" cümlesi, düğmenin bozuk olduğunu düşündürüyor. Sunucu
     * her profil için sebebini söylüyor (arşiv boş, ön ayar yok, kota
     * doldu) ve ekran onu OLDUĞU GİBİ taşıyor.
     */
    expect(HAVUZ).toContain('gecmisNotlari');
    expect(HAVUZ).toContain('r.notlar');
  });

  it('KRİTİK: çekimden sonra liste YENİDEN ÇEKİLİYOR', () => {
    // `router.refresh()` istemci state'ine dokunmuyor; kartlar bu bileşenin
    // kendi state'inde duruyor ve yenilenmezse düğme hiçbir şey yapmamış
    // gibi görünürdü.
    /*
     * İDDİA TEK SATIRA ÇAPALI, "yakınında geçiyor"a DEĞİL.
     *
     * İlk yazımda dilim `gecmisiCek`ten dosya SONUNA kadar uzanıyordu ve
     * çağrıyı silmek testi düşürmüyordu: aynı ad `useEffect` içinde de
     * geçiyor. Bu depoda üçüncü kez düşülen tuzak.
     */
    expect(HAVUZ).toContain('setGecmisNotlari(r.notlar);\n      kuyruguYukle();');
  });
});
