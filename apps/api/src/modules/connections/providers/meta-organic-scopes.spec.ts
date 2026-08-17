import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ORGANİK GÖNDERİ ÇEKMENİN İSTEDİĞİ İZİNLER — kaynak taraması.
 *
 * NEDEN KAYNAK TARAMASI VE NEDEN BİRİM TESTİ DEĞİL: burada sınanan şey bir
 * fonksiyonun çıktısı değil, İKİ LİSTENİN BİRBİRİYLE TUTARLILIĞI. İstek
 * gövdesindeki her alan bir izin gerektiriyor ve izin listesi ayrı bir yerde
 * duruyor; ikisi ayrıştığında hiçbir birim testi düşmüyor, hiçbir tip hatası
 * çıkmıyor. Ayrışma yalnızca CANLIDA görülüyor ve orada da yanıltıcı bir
 * biçimde: içgörüler iç içe alan olarak isteniyor, dolayısıyla eksik izin
 * "metrikler boş geldi" değil "GÖNDERİ LİSTESİ HİÇ GELMEDİ" olarak çıkıyor.
 *
 * Üretimde tam olarak bu yaşandı. Facebook sayfası için `read_insights`
 * istenmiyordu ve gönderi listesi boş geliyordu; sebep haftalarca "izin yok"
 * sanıldı, oysa istenmeyen izin başkaydı.
 *
 * `meta-account-path.spec.ts` ve `google-request.spec.ts` ile aynı desen:
 * canlıda öğrenilen ve birim testiyle yakalanamayacak kuralları böyle
 * kilitliyoruz.
 */

const SRC = readFileSync(
  join(__dirname, 'meta.provider.ts'),
  'utf8',
);

/** `optionalScopes` dizisinin gövdesi. */
function optionalScopes(): string {
  const start = SRC.indexOf('readonly optionalScopes');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('] as const;', start);
  return SRC.slice(start, end);
}

/**
 * `fetchOrganicPosts` gövdesi.
 *
 * BİTİŞ SINIRI `\n  }` DEĞİL: metodun imzasındaki nesne parametresi de o
 * dizeyle kapanıyor ve gövde imzada kesiliyordu — testler yeşil sanılırken
 * hiçbir şeyi sınamıyordu. Sınır bir sonraki metodun başlangıcı.
 */
function organicFetch(): string {
  const start = SRC.indexOf('async fetchOrganicPosts');
  expect(start).toBeGreaterThan(-1);
  const sonraki = SRC.indexOf('\n  async ', start + 10);
  return SRC.slice(start, sonraki > -1 ? sonraki : SRC.length);
}

describe('organik gönderi izinleri', () => {
  it('KRİTİK: Facebook gönderi içgörüsü isteniyorsa `read_insights` de isteniyor', () => {
    // Sayfa/gönderi içgörüleri bu izni ayrıca arıyor. Instagram tarafı
    // `instagram_manage_insights` ile karşılanıyordu; Facebook karşılığı
    // atlanmıştı ve sonucu "hiç gönderi yok" olarak görünüyordu.
    const istek = organicFetch();
    if (istek.includes('post_impressions')) {
      expect(optionalScopes()).toContain("'read_insights'");
    }
  });

  it('Instagram medyası isteniyorsa `instagram_basic` ve içgörü izni de isteniyor', () => {
    const istek = organicFetch();
    // Uç nokta koşullu kuruluyor: `${ig ? 'media' : 'posts'}` — dizede eğik
    // çizgi yok, o yüzden alan adının kendisi aranıyor.
    expect(istek).toContain("'media'");
    const scopes = optionalScopes();
    expect(scopes).toContain("'instagram_basic'");
    expect(scopes).toContain("'instagram_manage_insights'");
  });

  it('Sayfa gönderisi isteniyorsa `pages_read_engagement` de isteniyor', () => {
    expect(organicFetch()).toContain('posts');
    expect(optionalScopes()).toContain("'pages_read_engagement'");
  });

  it('KRİTİK: Instagram içgörülerinde `video_views` KULLANILMIYOR', () => {
    /*
     * Meta bu adı Instagram medya içgörülerinde kabul etmiyor ve geçerli
     * değerleri hata mesajında tek tek sayıyor. Tek bir geçersiz metrik
     * BÜTÜN çağrıyı düşürüyor — içgörüler iç içe alan olarak isteniyor —
     * dolayısıyla belirti "video izlenmesi eksik" değil "hiç gönderi yok"
     * oluyor. Canlıda 2026-08-16'da yaşandı.
     */
    const istek = organicFetch();
    // Instagram metrik dizesi TAM olarak aranıyor. "video_views geçmesin"
    // demek yetmez: Facebook dalı `post_video_views` istiyor ve o GEÇERLİ —
    // iki dalı ayırmadan yapılan bir arama yanlış yere alarm verir.
    expect(istek).toContain('insights.metric(impressions,reach,saved,views)');
    expect(istek).not.toContain('insights.metric(impressions,reach,saved,video_views)');
    // Facebook dalının kendi adı duruyor; onunla karışmasın diye ayrıca
    // doğrulanıyor.
    expect(istek).toContain('post_video_views');
  });
});
