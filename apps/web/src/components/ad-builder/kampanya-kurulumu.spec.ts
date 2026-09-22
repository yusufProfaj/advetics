import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KAMPANYA KURMA EKRANI SEKME DEĞİŞTİRTMİYOR ═══
 *
 * Kullanıcının bildirdiği hâl birebir: "illa arşive yüklemem gerekiyorsa
 * sekme değiştirmeyim, kampanya kurma ekranından görseli ya da videoyu
 * ekleyebileceğim şekilde yapmanı istiyorum".
 *
 * Eski ekran boş arşivde yalnızca "Kütüphane → Görsel Arşivi bölümünden
 * yükleyebilirsin" yazıyordu: kullanıcı yeni sekme açıyor, yüklüyor, geri
 * dönüyor, listeyi tazelemek için sayfayı yeniliyor ve YAZDIĞI HER ŞEY
 * gidiyordu.
 *
 * İkinci istek: "metinleri oluşturmak istersem de yapay zeka ile doldur
 * diyeyim doldursun bütün metinleri".
 *
 * Bileşen render edilmiyor (`vitest.config.ts` bunu bilinçli reddediyor),
 * o yüzden kararlar kaynak taramasıyla sınanıyor.
 */
/**
 * ═══ YORUM TEMİZLEYİCİ `image/*` YÜZÜNDEN DOSYAYI YUTUYORDU ═══
 *
 * Bu depodaki alışılmış temizleyici `/\/\*[\s\S]*?\*\//` ile başlıyor ve
 * `accept="image/*"` niteliğindeki `/*` onun için bir YORUM BAŞLANGICI:
 * oradan sonraki ilk `*​/`e kadar her şey siliniyor ve tarama, kaynağın
 * yarısını hiç görmeden yeşil geçiyordu. Mutasyon testinde yakalandı.
 *
 * Çözüm: `/*` yalnızca SATIR BAŞINDA (boşluktan sonra) ya da `{` hemen
 * ardındaysa yorum sayılıyor — bu kod tabanının yorum biçimi bu.
 */
const KAYNAK = readFileSync(join(__dirname, 'simple-builder.tsx'), 'utf8')
  .replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu', () => {
    expect(KAYNAK).toContain('SimpleAdBuilder');
    expect(KAYNAK.length).toBeGreaterThan(5000);
  });
});

describe('görsel bu ekrandan yükleniyor', () => {
  it('KRİTİK: yükleme kutusu builder içinde', () => {
    expect(KAYNAK).toContain('async function gorselYukle(');
    expect(KAYNAK).toContain('type="file"');
  });

  it('KRİTİK: AYNI UÇ kullanılıyor — ikinci bir yükleme yolu yok', () => {
    /*
     * İkinci bir yükleme yolu, mükerrer kontrolünü ve boyut sınırını ikinci
     * kez yazmak olurdu; biri güncellenmediğinde aynı dosya iki kayıt açar.
     */
    expect(KAYNAK).toContain('`${API_URL}/assets?clientId=${clientId}&kind=${kind}`');
  });

  it('KRİTİK: yüklenen görsel KENDİLİĞİNDEN seçiliyor', () => {
    // Yükleyip bir de listeden bulup tıklamak gereksiz bir adım.
    expect(KAYNAK).toContain('setAssetIds((cur) =>');
    expect(KAYNAK).toContain('cur.includes(result.asset.id) ? cur : [...cur, result.asset.id]');
  });

  it('KRİTİK: MÜKERRER dosya da seçiliyor', () => {
    /*
     * Aynı dosyayı ikinci kez yükleyen kullanıcı onu KULLANMAK istiyor;
     * "zaten vardı" deyip seçmemek, listede aramasına yol açardı.
     */
    const i = KAYNAK.indexOf('if (result.duplicate) mukerrer++;');
    expect(i).toBeGreaterThan(-1);
    const sonrasi = KAYNAK.slice(i, i + 400);
    expect(sonrasi).toContain('setAssetIds(');
  });

  it('KRİTİK: yükleme hatası YUTULMUYOR', () => {
    // Boyut, biçim ve kota hatalarında sunucunun kendi cümlesi görünmeli.
    const i = KAYNAK.indexOf('async function gorselYukle(');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n  }', i));
    expect(govde).toContain('setError(');
    expect(govde).toContain('b?.message ??');
  });

  it('KRİTİK: boş arşiv mesajı artık SEKME DEĞİŞTİRTMİYOR', () => {
    // Eski cümle tek seçenek olarak Görsel Arşivi'ni gösteriyordu.
    expect(KAYNAK).toContain('Yukarıdaki düğmeyle bilgisayarından yükleyebilir');
  });

  it('aynı dosya İKİNCİ KEZ seçilebiliyor', () => {
    // `value` temizlenmezse `change` bir daha tetiklenmiyor ve kullanıcı
    // "yükleme çalışmıyor" der.
    expect(KAYNAK).toContain("e.target.value = ''");
  });
});

describe('metinleri yapay zekâ dolduruyor', () => {
  it('KRİTİK: düğme ve uç var', () => {
    expect(KAYNAK).toContain('async function metinleriDoldur(');
    expect(KAYNAK).toContain("'/creatives/metin-onerisi'");
    expect(KAYNAK).toContain('Yapay zekâ ile doldur');
  });

  it('KRİTİK: ÜÇ ALANI BİRDEN dolduruyor', () => {
    /*
     * Ayrı ayrı üretmek üç farklı reklam gibi konuşan bir metin çıkarırdı:
     * ana metin bir vaat verirken başlık başka bir şey söyler.
     */
    const i = KAYNAK.indexOf('async function metinleriDoldur(');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n  }', i));
    expect(govde).toContain('setPrimaryText(r.primaryText)');
    expect(govde).toContain('setHeadline(r.headline)');
    expect(govde).toContain('setDescription(r.description)');
  });

  it('KRİTİK: YAZILANI EZDİĞİ ekranda yazılı', () => {
    // Sessizce ezmek, kullanıcının yazdığı cümleyi bulamaması demekti.
    expect(KAYNAK).toContain('yazdıklarının üzerine yazılır');
  });

  it('KRİTİK: hata YUTULMUYOR', () => {
    const i = KAYNAK.indexOf('async function metinleriDoldur(');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n  }', i));
    expect(govde).toContain('ApiRequestError');
  });

  it('hedef seçilmeden düğme KAPALI', () => {
    // Kampanya tipi metnin ne söyleyeceğini belirliyor; tipsiz üretim
    // rastgele bir metin demekti.
    expect(KAYNAK).toContain('disabled={!goal || busy !== null}');
  });
});

describe('MANUEL GİRİLEN TEK ŞEY: METİN VE GÖRSEL', () => {
  /*
   * Kullanıcının cümlesi: "başka herhangi bir bilgi doldurmak istemiyorum,
   * diğerlerinin hepsinin otomatik olması lazım ya da seçenekli olması lazım;
   * manuel gireceğim tek yer metinler ve kreatif görselleri".
   */
  it('KRİTİK: WHATSAPP NUMARASI HİÇ SORULMUYOR', () => {
    /*
     * Kullanıcının verdiği örnek buydu. Meta numarayı ad set'ten alıyor
     * (`destination_type: WHATSAPP` + `promoted_object.page_id`); elle
     * yazdırmak, Meta'da zaten tanımlı bir bilgiyi ikinci kez ve HATALI
     * girme fırsatıydı — yazılan numara ile mesaj düşen numara ayrıştığında
     * kimse fark etmiyor.
     */
    expect(KAYNAK).not.toContain('whatsappNumber');
    expect(KAYNAK).not.toContain('905551112233');
  });

  it('KRİTİK: KAMPANYA ADI kendiliğinden yazılıyor', () => {
    // Yalnızca ajansın gördüğü bir etiket; kullanıcıdan istemek sonucu
    // değiştirmeyen bir yazma işiydi.
    expect(KAYNAK).toContain('export function otomatikAd(');
    expect(KAYNAK).toContain('setName(otomatikAd(secilen))');
  });

  it('KRİTİK: ad ZORUNLU EKSİK listesinde DEĞİL', () => {
    // Otomatik dolan bir alanı "devam etmek için" listesine koymak,
    // kullanıcıyı hiç yapmadığı bir eksikle karşılamak olurdu.
    expect(KAYNAK).not.toContain("list.push('Kampanyaya bir ad ver.')");
  });

  it('KRİTİK: SİTE ADRESİ workspace kartından ÖN DOLGU', () => {
    expect(KAYNAK).toContain('clientWebsite');
    expect(KAYNAK).toContain("setLinkUrl((cur) => cur || clientWebsite)");
  });

  it('KRİTİK: hesap ve sayfa YALNIZCA BİRDEN FAZLAYSA soruluyor', () => {
    // Tek seçenekte açılır liste göstermek, cevabı belli bir soru sormak.
    expect(KAYNAK).toContain('accounts.length > 1');
    expect(KAYNAK).toContain('pages.length > 1');
  });

  it('KRİTİK: SÜRE SEÇENEK — yazılan sayı değil', () => {
    /*
     * Eski hâl bir sayı kutusuydu ve "0 yazarsan süresiz olur" diyordu:
     * süresiz kampanya KEŞFEDİLMESİ gereken bir davranıştı. Kullanıcının
     * istediği kurgu "süresiz mi belirli bir süre mi açık kalacağını
     * seçersin".
     */
    expect(KAYNAK).toContain('SURE_SECENEKLERI');
    expect(KAYNAK).toContain('Süresiz — sen durdurana kadar');
    expect(KAYNAK).not.toContain('0 yazarsan süresiz olur');
  });
});

describe('yapay zekâ GÖRSELLERE BAKIYOR', () => {
  it('KRİTİK: seçili görseller isteğe giriyor', () => {
    /*
     * Kullanıcının cümlesi: "görselleri tarayıp yapay zekanın yazması için
     * butona tıklarsın". Görseli görmeden yazılan metin her işe uyan ve
     * hiçbir işe yaramayan cümleler üretiyor.
     */
    expect(KAYNAK).toContain('assetIds: assetIds.slice(0, 3)');
  });

  it('düğmenin altındaki cümle görsel seçilince DEĞİŞİYOR', () => {
    // Kullanıcı görsele bakıp bakmadığını bilmeli.
    expect(KAYNAK).toContain('Seçtiğin görsellere bakarak yazar');
  });
});

describe('VİDEO AYNI ADIMDAN YÜKLENİYOR', () => {
  /*
   * Ayrı bir sekmeye ya da ayrı bir kampanya tipine koymak, kullanıcıyı
   * "videolu reklam nasıl veriliyor" diye aratırdı. Aynı adım, iki düğme.
   */
  it('KRİTİK: video düğmesi var ve doğru türle yüklüyor', () => {
    expect(KAYNAK).toContain("accept=\"video/mp4,video/quicktime\"");
    expect(KAYNAK).toContain("void gorselYukle(e.target.files, 'video')");
  });

  it('KRİTİK: yükleme ucu TÜRÜ parametre alıyor — ikinci bir yol yok', () => {
    // Video için ayrı bir uç yazmak, mükerrer kontrolünü ve boyut sınırını
    // ikinci kez yazmak olurdu.
    expect(KAYNAK).toContain("kind: 'image' | 'video' = 'image'");
  });

  it('KRİTİK: VİDEO İLE GÖRSEL BİR ARADA SEÇİLEMİYOR', () => {
    /*
     * Meta tek kreatifte ikisini kabul etmiyor ve ikisini birden göndermek
     * "Invalid parameter" ile dönüyor. Yayın anında hata vermek yerine
     * SEÇİM ANINDA diğeri bırakılıyor — doğrulama kullanım anında değil
     * giriş anında.
     */
    expect(KAYNAK).toContain('const secilenVideo = videoMu(a.kind);');
    expect(KAYNAK).toContain('return secilenVideo ? [a.id] : [...kalan, a.id];');
  });

  it('KRİTİK: video `<video>` ile çiziliyor — `<img>` ile değil', () => {
    /*
     * Sunucuda küçük resim üretmek ffmpeg demekti ve paylaşımlı VPS'e
     * sistem ikilisi kurmak yasak. Tarayıcı ilk kareyi kendisi gösteriyor.
     */
    expect(KAYNAK).toContain('{video ? (');
    expect(KAYNAK).toContain('preload="metadata"');
  });

  it('KRİTİK: VİDEO ORAN KOVASINA SOKULMUYOR', () => {
    /*
     * Görsel üç kovaya oturmak zorunda (eksik kova = kapalı yerleşim), video
     * ise bir ARALIĞA giriyor. Aynı kuralı ikisine birden uygulamak akışın en
     * yaygın video oranını (4:5) seçilemez yapıyordu ve altındaki kaçış yolu
     * görsel kırpıcısına gidiyor — videoda hiç çalışmıyor.
     */
    expect(KAYNAK).toContain('videoOraniUygun(a.width, a.height)');
    expect(KAYNAK).toContain('matchRatio(a.width, a.height) !== null');
    expect(KAYNAK).toContain('disabled={!uygun}');
  });

  it('KRİTİK: VİDEODA KIRPMA DÜĞMESİ YOK', () => {
    // Kırpıcı görsel kırpıyor; videoda basıldığında yapacağı bir şey yok ve
    // çalışmayan bir düğme kullanıcıyı olmayan bir çözüme gönderir.
    expect(KAYNAK).toContain('{!video && (');
  });
});
