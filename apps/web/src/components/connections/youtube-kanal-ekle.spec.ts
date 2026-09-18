import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ YOUTUBE KANALI BAĞLANTILAR EKRANINDA ═══
 *
 * Kullanıcının isteği: "nasıl instagram hesabı listelenebiliyorsa bunda da
 * youtube hesabı listelensin". Instagram hesapları kendiliğinden listeleniyor
 * çünkü Meta yetkilendirmesi sayfaları bize VERİYOR; Google yetkilendirmesi
 * yalnızca Google Ads kapsamı taşıyor ve kanal listesi ayrı bir kapsam ister.
 * O kapsamı eklemek BÜTÜN Google bağlantısının yeniden yetkilendirilmesi
 * demek ve bu projede yeniden yetkilendirme daha önce canlı bağlantıları
 * kopardı.
 *
 * Bu yüzden kanal BİR KEZ yapıştırılıyor, sonrası Instagram hesabıyla birebir
 * aynı: aynı havuz kartı, aynı atama penceresi.
 */
const DIR = __dirname;
const EKLE = readFileSync(join(DIR, 'youtube-kanal-ekle.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(DIR, '..', '..', 'app', '(dashboard)', 'ayarlar', 'baglantilar', 'page.tsx'),
  'utf8',
);

function yorumsuz(k: string): string {
  return k
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okundu', () => {
    expect(EKLE.length).toBeGreaterThan(500);
    expect(SAYFA.length).toBeGreaterThan(500);
  });
});

describe('kanal ekleme yüzeyi', () => {
  it('KRİTİK: bağlantılar sayfasında çiziliyor', () => {
    // Boost ekranında dururken bağlantı kurulumunu boost yetkisinin yanına
    // koyuyordu: kart onaylayabilen herkes yeni kanal bağlayabiliyordu.
    expect(yorumsuz(SAYFA)).toContain('<YouTubeKanalEkle');
  });

  it('KRİTİK: kanal HAVUZA giriyor — doğrudan bir workspace’e değil', () => {
    /*
     * `clientId` gönderilseydi kanalı ekleyen kişi o an hangi müşteriye ait
     * olduğunu seçmek zorunda kalırdı; seçim yanlışsa kanal yanlış müşteride
     * abone olur ve videoları başka bir markanın paneline düşerdi.
     */
    const kod = yorumsuz(EKLE);
    expect(kod).toContain("'/autoboost/youtube/channels'");
    expect(kod).not.toContain('clientId');
  });

  it('KRİTİK: sunucunun kendi cümlesi ekranda', () => {
    /*
     * "Kanal eklenemedi" demek, kullanıcıyı yapıştırdığı adresi suçlamaya
     * gönderiyor; oysa mesaj çoğu zaman doğrudan söylüyor (Google Ads
     * bağlantısı yok, kanal bulunamadı, API anahtarı tanımsız).
     */
    const kod = yorumsuz(EKLE);
    expect(kod).toContain('ApiRequestError');
    expect(kod).toContain('err.message');
  });

  it('KRİTİK: ekledikten sonra sayfa TAZELENİYOR', () => {
    // Havuz sayacı sunucu tarafında hesaplanıyor; yenilenmezse kanal listede
    // görünmez ve kullanıcı eklemeyi başarısız sanar.
    expect(yorumsuz(EKLE)).toContain('router.refresh()');
  });

  it('yetkisi olmayan kullanıcıya SEBEBİ yazılı', () => {
    // Düğmeyi kapatıp sebebini söylememek "çalışmıyor" göstermek olurdu.
    expect(yorumsuz(EKLE)).toContain('yöneticinin işi');
  });
});
