import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REKLAM KREATİFLERİ ORGANİK GÖNDERİ LİSTESİNE GİRMEMELİ.
 *
 * `/{ig-user}/media` yalnızca organik gönderileri döndürmüyor: `AD` türü
 * medya da listeye giriyor. Bu iki şeyi birden bozuyor:
 *
 *   1. Elle boost ekranında reklam kreatifleri "öne çıkarılabilir gönderi"
 *      olarak listeleniyor.
 *   2. Otomatik boost'ta (1.0) sistemin KENDİ reklamı "yeni gönderi" sanılıp
 *      yeni bir reklam doğuruyor — GERİ BESLEME DÖNGÜSÜ.
 *
 * Eleme iki şeye bağlı ve İKİSİ DE kolayca sessizce kaybolabilir: alanın
 * `fields` listesinde İSTENMESİ (istenmezse Meta göndermiyor ve karşılaştırma
 * her zaman false olur) ve eleme satırının kendisi. Bu yüzden kaynak
 * taraması: birim testi gerçek HTTP olmadan ikisini de göremiyor.
 */

const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

const GOVDE = (() => {
  const imza = 'async fetchOrganicPosts(params: {';
  const bas = SOURCE.indexOf(imza);
  if (bas < 0) throw new Error('fetchOrganicPosts bulunamadı — tarama boşa düşer');
  const i = SOURCE.indexOf('{', SOURCE.indexOf('Promise<DiscoveredOrganicPost[]>', bas));
  let d = 0;
  for (let j = i; j < SOURCE.length; j++) {
    if (SOURCE[j] === '{') d++;
    else if (SOURCE[j] === '}') {
      d--;
      if (d === 0) return SOURCE.slice(i, j + 1);
    }
  }
  throw new Error('fetchOrganicPosts gövdesi kapanmadı');
})();

describe('organik gönderi süpürmesi — reklam elemesi', () => {
  it('tarama BOŞA DÜŞMÜYOR', () => {
    // Dilim gerçekten metodu yakaladı mı? Boş bir dilimde her "içermiyor"
    // iddiası doğrudur ve tarama sessizce işe yaramaz hâle gelir.
    expect(GOVDE.length).toBeGreaterThan(800);
    expect(GOVDE).toContain("'media'");
    expect(GOVDE).toContain('mapOrganicPost');
  });

  it('KRİTİK: `media_product_type` alanı İSTENİYOR', () => {
    /*
     * İstenmezse Meta bu alanı göndermiyor, karşılaştırma her zaman false
     * oluyor ve eleme SESSİZCE hiçbir şey yapmıyor — kod doğru görünürken
     * reklamlar listeye girmeye devam ediyor.
     */
    expect(GOVDE).toContain("'media_product_type'");
  });

  it('KRİTİK: `AD` türü medya ELENİYOR', () => {
    expect(GOVDE).toMatch(/media_product_type === 'AD'/);
  });

  it('KRİTİK: eleme `mapOrganicPost` ÇAĞRISINDAN ÖNCE', () => {
    /*
     * Sonra elenirse gönderi zaten eşlenmiş olur; asıl mesele sıralama değil
     * elemenin çağrıdan önce gelmesi — sonraya bırakılırsa bir gün biri
     * "zaten eşlenmiş, ekleyelim" diye devam ettirir.
     */
    const elemeIdx = GOVDE.indexOf("media_product_type === 'AD'");
    const mapIdx = GOVDE.indexOf('mapOrganicPost(ham');
    expect(elemeIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeGreaterThan(elemeIdx);
  });

  it('eleme ÇAĞIRANA bırakılmamış — sağlayıcının içinde', () => {
    // `fetchOrganicPosts` "organik gönderi" vaat ediyor; reklam döndürmesi
    // sözleşme ihlali. Çağırana bırakmak üç ayrı yerde hatırlanacak bir
    // kural demekti.
    expect(GOVDE).toContain('continue;');
  });
});
