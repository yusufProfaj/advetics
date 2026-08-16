import { describe, expect, it } from 'vitest';
import { mapPageProfiles } from './meta.provider';

/**
 * `/me/accounts` → sosyal profil eşlemesi.
 *
 * NEDEN AYRI TEST: bu eşlemenin hatası SESSİZ. Profil kaydedilir, panelde adı
 * ve fotoğrafı doğru görünür, gönderileri çekilir — yanlış olan tek şey yayın
 * anında kullanılacak kimliktir ve o da ancak Meta'ya çağrı gidince ortaya
 * çıkar.
 *
 * Somut hata buydu: bir Graph satırı İKİ profil üretiyor ve ikisinin
 * kimlikleri farklı uzaydan geliyor — sayfanınki Facebook sayfa kimliği,
 * Instagram'ınki IG kullanıcı kimliği. Instagram satırı sayfanın kimliğini
 * taşımıyordu, dolayısıyla boost yolu IG kullanıcı kimliğini sayfa kimliği
 * sanıyordu (bkz. `instagram-boost-guard.ts`).
 */

/** Meta'nın gerçek yanıt biçimi — IG hesabı sayfanın İÇİNDE iç içe geliyor. */
const igliSayfa = {
  id: '111111111',
  name: 'Ege Birlik',
  username: 'egebirlik',
  access_token: 'sayfa-token',
  picture: { data: { url: 'https://cdn/page.jpg' } },
  instagram_business_account: {
    id: '17841400000000000',
    username: 'egebirlik.tr',
    name: 'Ege Birlik',
    profile_picture_url: 'https://cdn/ig.jpg',
  },
};

const igsizSayfa = {
  id: '222222222',
  name: 'Yalnız Sayfa',
  access_token: 'sayfa-token-2',
};

describe('mapPageProfiles', () => {
  it('IG bağlı sayfa İKİ profil üretiyor', () => {
    const p = mapPageProfiles(igliSayfa);
    expect(p).toHaveLength(2);
    expect(p[0]!.profileType).toBe('facebook_page');
    expect(p[1]!.profileType).toBe('instagram_business');
  });

  it('IG bağlı olmayan sayfa TEK profil üretiyor', () => {
    expect(mapPageProfiles(igsizSayfa)).toHaveLength(1);
  });

  it('KRİTİK: Instagram profili ANA SAYFANIN kimliğini taşıyor', () => {
    // Bu satır olmadan "bu Instagram hesabı hangi sayfaya ait" sorusunun
    // veritabanında cevabı yok ve Meta'ya reklam kurulamıyor: her reklam bir
    // Facebook sayfasına bağlı, Instagram'a yayınlanan da.
    const ig = mapPageProfiles(igliSayfa)[1]!;
    expect(ig.parentPageExternalId).toBe('111111111');
  });

  it('KRİTİK: Instagram profilinin external_id’si SAYFA KİMLİĞİ DEĞİL', () => {
    // İkisinin karıştırılması bu işin başlangıç noktasıydı. Ayrı kalmaları
    // testle kilitleniyor.
    const [sayfa, ig] = mapPageProfiles(igliSayfa);
    expect(ig!.externalId).toBe('17841400000000000');
    expect(ig!.externalId).not.toBe(sayfa!.externalId);
  });

  it('Facebook profilinde ana sayfa alanı BOŞ', () => {
    // Dolu olması kolona ikinci bir anlam yüklemek olurdu; veritabanındaki
    // CHECK kısıtı da bunu reddediyor.
    expect(mapPageProfiles(igliSayfa)[0]!.parentPageExternalId).toBeUndefined();
    expect(mapPageProfiles(igsizSayfa)[0]!.parentPageExternalId).toBeUndefined();
  });

  it('SAYFA TOKEN’I her iki profile de yazılıyor', () => {
    // IG Business hesabına erişim, bağlı olduğu sayfanın token'ı ile oluyor —
    // IG'nin kendi token'ı yok.
    const p = mapPageProfiles(igliSayfa);
    expect(p[0]!.pageAccessToken).toBe('sayfa-token');
    expect(p[1]!.pageAccessToken).toBe('sayfa-token');
  });

  it('IG adı yoksa kullanıcı adına düşüyor', () => {
    const p = mapPageProfiles({
      ...igliSayfa,
      instagram_business_account: { id: '99', username: 'sadece_kullanici' },
    });
    expect(p[1]!.name).toBe('sadece_kullanici');
    // Ana sayfa yine taşınıyor — ada düşmek kimliği etkilemiyor.
    expect(p[1]!.parentPageExternalId).toBe('111111111');
  });
});
