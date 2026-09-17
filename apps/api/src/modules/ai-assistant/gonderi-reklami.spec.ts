import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GÖNDERİ REKLAMI ASİSTANDAN AÇILABİLİYOR ═══
 *
 * Kullanıcının isteği: *"bağladığım instagram hesabını kontrol edip en son
 * çıkan gönderinin id'sini alıp etkileşim kampanyası açıp reklamını
 * oluşturabiliyor olması gerekiyor"*. Asistan bu yolu bilmediği için
 * kullanıcıdan görsel istiyor ve üç hedefle sınırlı kalıyordu.
 *
 * YENİ YAYIN YOLU YAZILMADI: canlıda doğrulanmış `boosts` modülü çağrılıyor.
 * İkinci bir yol, Instagram medyasının üç kimlik uzayı gibi canlıda
 * öğrenilmiş bilgiyi eksik tekrarlamak olurdu.
 */
const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ARACLAR = yorumsuz(readFileSync(join(__dirname, 'tools.ts'), 'utf8'));
const SERVIS = yorumsuz(readFileSync(join(__dirname, 'ai-assistant.service.ts'), 'utf8'));
const PROMPT = yorumsuz(readFileSync(join(__dirname, 'system-prompt.ts'), 'utf8'));

function aracGovdesi(ad: string): string {
  const bas = ARACLAR.indexOf(`name: '${ad}'`);
  if (bas === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
  const sonraki = ARACLAR.indexOf("name: '", bas + ad.length + 10);
  return ARACLAR.slice(bas, sonraki === -1 ? undefined : sonraki);
}

describe('tarama boşa düşmüyor', () => {
  it('iki araç da var', () => {
    expect(aracGovdesi('list_boostable_posts').length).toBeGreaterThan(300);
    expect(aracGovdesi('boost_post').length).toBeGreaterThan(300);
  });
});

describe('gönderi listesi', () => {
  it('KRİTİK: var olan boost servisini çağırıyor', () => {
    // İkinci bir okuma yolu, "boostlanamaz" kurallarını (sayfa atanmamış,
    // gönderi zaten boostlanmış) ikinci kez yazmak olurdu.
    expect(aracGovdesi('list_boostable_posts')).toContain('deps.boosts.listBoostablePosts');
  });

  it('KRİTİK: boş liste SEBEBİNİ söylüyor', () => {
    // "Gönderin yok" ile "sayfa atanmamış" aynı boşluğa çevrilemez.
    expect(aracGovdesi('list_boostable_posts')).toContain('liste.emptyReason');
  });

  it('KRİTİK: boostlanamayan gönderinin ENGELİ modele söyleniyor', () => {
    // Engelli bir gönderiyi önerip kullanıcıyı onay kartına kadar getirmek,
    // en son anda reddedilen bir işlem demek.
    expect(aracGovdesi('list_boostable_posts')).toContain('engel: p.blockedReason');
  });
});

describe('gönderiyi reklama çevirme', () => {
  it('KRİTİK: araç YAYINLAMIYOR, onay kartı üretiyor', () => {
    /*
     * Canlı para mutasyonunun bu üründeki sözleşmesi: araç çağrıldığında
     * platformda hiçbir şey olmuyor.
     */
    const g = aracGovdesi('boost_post');
    expect(g).toContain("status: 'pending_confirmation'");
    expect(g).not.toContain('createManualBoost');
  });

  it('KRİTİK: ENGEL kart üretilmeden ÖNCE kontrol ediliyor', () => {
    /*
     * İDDİA KOŞULUN KENDİSİNE ÇAPALI. İlk yazımda yalnızca alan adını
     * arıyordu ve koşulu `if (false)` yapan mutasyonda GEÇTİ: alan adı
     * bloğun İÇİNDE de duruyor.
     */
    const g = aracGovdesi('boost_post');
    const engel = g.indexOf('if (gonderi.blockedReason) {');
    const kart = g.indexOf("status: 'pending_confirmation'");
    expect(engel, 'engel kontrolü yok').toBeGreaterThan(-1);
    expect(engel).toBeLessThan(kart);
  });

  it('KRİTİK: özet PARAYI ve SÜREYİ yazıyor', () => {
    // Kullanıcı ne kadar taahhüt ettiğini karta bakarken görmeli.
    const g = aracGovdesi('boost_post');
    expect(g).toContain('TOPLAM ${butce} ₺');
    expect(g).toContain('${gun} gün');
  });

  it('KRİTİK: çözülemeyen ŞEHİR sessizce düşürülmüyor', () => {
    /*
     * Meta şehir ADI kabul etmiyor, kendi anahtarını istiyor. Çözülemeyen
     * adı atmak, kullanıcının "İzmir'e ver" dediği reklamı Türkiye geneline
     * açmak olurdu — bütçenin nereye gittiği tamamen değişir ve hiçbir hata
     * görünmez.
     */
    const g = aracGovdesi('boost_post');
    expect(g).toContain('cozulemeyen');
    expect(g).toContain('searchGeoLocations');
    /*
     * SIRA İDDİASI ÖNCE VARLIĞI SORMAK ZORUNDA: `indexOf` bulamayınca -1
     * dönüyor ve -1 her indeksten küçük — blok tamamen silindiğinde iddia
     * yine geçerdi. Mutasyon testinde tam olarak bu oldu.
     */
    const hata = g.indexOf('cozulemeyen.length > 0');
    const kart = g.indexOf("status: 'pending_confirmation'");
    expect(hata, 'çözülemeyen kontrolü yok').toBeGreaterThan(-1);
    expect(hata).toBeLessThan(kart);
  });

  it('KRİTİK: onayda ÇÖZÜLMÜŞ anahtarlar kullanılıyor, ad yeniden aranmıyor', () => {
    // Onay saniyeler sonra geliyor; aramayı tekrarlamak, arada değişen bir
    // sonuçla BAŞKA bir yere harcamak demek.
    expect(SERVIS).toContain('locations: b.lokasyonlar');
  });
});

describe('onay yolu', () => {
  it('KRİTİK: boost onayı AYRI YETKİ istiyor', () => {
    /*
     * Ucun dekoratörü `budget.write` istiyor ve bu kampanya aksiyonları için
     * doğru; gönderi reklamı `boost.approve` istiyor ve onay AYRI BİR
     * İSTEK — aradaki sürede yetki alınmış olabilir.
     */
    const i = SERVIS.indexOf("pending.detail.kind === 'boost'");
    expect(i, 'boost dalı yok').toBeGreaterThan(-1);
    expect(SERVIS.slice(i, i + 900)).toContain("assertPermissions(ctx, 'boost.approve')");
  });

  it('KRİTİK: ESKİ kartlar bozulmuyor', () => {
    /*
     * `kind` yeni bir alan ve bu alan eklenmeden önce yazılmış kartlar
     * veritabanında duruyor. Zorunlu yapmak, kullanıcının açık sohbetindeki
     * bir onayı "bozuk kayıt" sayıp sessizce ölü hâle getirirdi.
     */
    expect(SERVIS).toContain("kind?: 'campaign'");
  });

  it('boost detayı ALAN ALAN denetleniyor', () => {
    const i = SERVIS.indexOf('function isPendingActionDetail');
    const dilim = SERVIS.slice(i, i + 900);
    for (const alan of ['clientId', 'organicPostId', 'totalBudget', 'durationDays']) {
      expect(dilim, `denetimde eksik: ${alan}`).toContain(alan);
    }
  });
});

describe('prompt', () => {
  it('KRİTİK: gönderi reklamında GÖRSEL istenmiyor', () => {
    // Kreatif gönderinin kendisi; asistan bu yolu bilmediği için görsel
    // istiyordu.
    expect(PROMPT).toContain('GÖNDERİ REKLAMINDA GÖRSEL İSTEME');
  });

  it('yol sırayla anlatılıyor', () => {
    expect(PROMPT).toContain('list_boostable_posts');
    expect(PROMPT).toContain('boost_post');
  });
});
