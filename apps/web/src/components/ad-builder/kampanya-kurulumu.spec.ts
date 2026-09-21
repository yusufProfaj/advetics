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
    expect(KAYNAK).toContain('`${API_URL}/assets?clientId=${clientId}&kind=image`');
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
