import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REKLAM KARTI — "GÖRSEL YOK" ÜÇ FARKLI ŞEYDİ.
 *
 * Aynı boş 4:5 kutu şunların hepsini temsil ediyordu ve üçünün yapılacak işi
 * farklı:
 *
 *   · Google ARAMA reklamı — görsel ZATEN YOK. Kutu göstermek raporda ve
 *     ekranda görüntü kirliliği üretiyor.
 *   · Google Display — kaynak adı URL sanılıp KIRIK GÖRSEL çıkıyordu.
 *   · Meta kreatifi — CDN adresi ölmüş ya da hiç senkronize edilmemiş.
 *
 * Kaynak taraması, çünkü bunlar render kararları ve birim testiyle
 * yakalanmaları için bütün ağacı kurmak gerekirdi; ayrışma ise tek satırlık.
 */
const KART = readFileSync(join(__dirname, 'ad-card.tsx'), 'utf8');

function govde(): string {
  const bas = KART.indexOf('export function AdCard(');
  if (bas === -1) {
    throw new Error('AdCard bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KART.slice(bas, KART.indexOf('\nfunction PreviewLink'));
  if (!g.includes('PreviewLink')) {
    throw new Error('AdCard dilimi görseli render etmiyor — tarama boşa düştü.');
  }
  return g;
}

describe('AdCard', () => {
  it('ARAMA reklamı platform + kreatif türünden ayırt ediliyor', () => {
    /*
     * İDDİA `aramaReklami` TANIMINA ÇAPALI. İlk yazımda gövdenin tamamında
     * `ad.platform === 'google'` aranıyordu; o dizge platform ROZETİNDE de
     * geçtiği için platform kontrolünü tanımdan silmek testi düşürmüyordu.
     * Mutasyonla yakalandı.
     *
     * Yalnızca `creativeType`e bakmak yetmez: Meta'da da SEARCH geçen bir tür
     * çıkarsa görsel kutusu haksız yere gizlenir.
     */
    const g = govde();
    const bas = g.indexOf('const aramaReklami');
    if (bas === -1) {
      throw new Error('aramaReklami tanımı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const tanim = g.slice(bas, g.indexOf(';', bas));
    expect(tanim).toContain("ad.platform === 'google'");
    expect(tanim).toContain('/SEARCH/i');
  });

  it('KRİTİK: arama reklamında GÖRSEL KUTUSU yerine METİN ÖNİZLEMESİ var', () => {
    /*
     * KARAR GENİŞLEDİ. Önce yalnızca "boş kutu gösterilmesin" idi ve doğruydu:
     * boş bir 4:5 kutu "eksik bir şey var" izlenimi veriyor. Ama yerine
     * hiçbir şey koymamak ekranın asıl sorusunu cevapsız bırakıyordu: bu
     * reklam NE DİYOR. Metin reklamının kreatifi metnidir.
     */
    const g = govde();
    expect(g).toContain('<AramaReklamiOnizleme');
    // Görsel kutusu arama reklamı dalında DEĞİL: koşul önizlemeyi seçiyor.
    // 2026-10-14: kart iki biçimde (satır/ızgara) aynı kutuyu kullanıyor; koşul kutuyu seçiyor.
    expect(g).toContain('const gorselKutusu = aramaReklami ? (');
  });

  it('KRİTİK: önizleme GERÇEK arama sonucunun yapısını taşıyor', () => {
    /*
     * Kullanıcının isteği: "gerçek reklamdaki gibi görünsün." İlk sürümde
     * yalnızca rozet, adres ve başlık vardı; eksik olan sıra ve biçimdi.
     * Gerçek sonuçta: sponsorlu etiketi, site simgesi + alan adı, kırıntı
     * yolu, MAVİ başlık, açıklama.
     */
    const onizleme = readFileSync(
      join(__dirname, 'arama-reklami-onizleme.tsx'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(onizleme).toContain('Ücretli sponsorlu reklam');
    expect(onizleme).toContain('<DunyaSimgesi />');
    expect(onizleme).toContain('adres.kirintiYolu');
    expect(onizleme).toContain('text-arama-baslik');
  });

  it('KRİTİK: site simgesi UZAKTAN çekilmiyor', () => {
    /*
     * Gerçek sonuçta orada sitenin favicon'u duruyor. Onu getirmek, panelin
     * VERİTABANINDAN gelen bir adrese istek atması demek ve bu depoda dışarı
     * giden her istek beyaz listeyle kapalı (CLAUDE.md).
     */
    /*
     * YORUMSUZ KAYNAKTA aranıyor: kuralı ANLATAN yorumun kendisi "favicon"
     * kelimesini taşıyor ve ham kaynakta iddia KOD DOĞRUYKEN kırmızı
     * veriyordu. CLAUDE.md: iddia yoruma değil koda çapalanır.
     */
    const onizleme = readFileSync(join(__dirname, 'arama-reklami-onizleme.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(onizleme).not.toContain('<img');
    expect(onizleme).not.toContain('favicon');
  });

  it('KRİTİK: kart hedef adresi de GEÇİRİYOR — kırıntı yolu ondan türüyor', () => {
    // `displayUrl` çoğu zaman yalnızca alan adı; yol `destinationUrl`de.
    // Geçirilmezse önizleme tek satırlık bir adres gösterir ve gerçek
    // sonuçtan ayrışır.
    expect(govde()).toContain('hedefAdres={ad.creative?.destinationUrl ?? null}');
  });

  it('KRİTİK: açıklama için YEDEK alan okunuyor', () => {
    /*
     * Google, RSA açıklamalarının ilkini `primaryText`e yazıyor ve
     * `description`ı boş bırakıyor (`mapGoogleCreative`). Yalnızca
     * `description` okumak her arama reklamının açıklamasını sessizce
     * kaybetmek demekti; raporda tam olarak bu oluyordu.
     */
    expect(govde()).toContain('ad.creative?.description ?? ad.creative?.primaryText');
  });

  it('KRİTİK: başlık ve metin kartta İKİ KEZ basılmıyor', () => {
    // Kreatif başlığı önizleme kutusunda duruyor; gövdede reklamın kendi adı
    // yazıyor ve gövde metni arama reklamında hiç tekrarlanmıyor.
    const g = govde();
    expect(g).toContain('const baslikMetni = aramaReklami ? ad.name');
    expect(g).toContain('{!aramaReklami && ad.creative?.primaryText && (');
  });

  it('yüklenemeyen görsel için İSTEMCİ bileşeni kullanılıyor', () => {
    // `onError` sunucu bileşenine bağlanamıyor. Çıplak `<img>` kalırsa
    // tarayıcı kırık resim ikonu gösteriyor — şemanın ve bileşenin kendi
    // yorumunun yasakladığı şey.
    const g = govde();
    expect(g).toContain('<KreatifGorsel');
    expect(g).not.toContain('<img');
  });

  it('"görsel alınamadı" ile "görsel yok" AYRI cümleler', () => {
    // İkisi aynı olsaydı ayrım yapmanın anlamı kalmazdı.
    const g = govde();
    expect(g).toContain('görsel alınamadı');
    // Metin kısaldı ve uzun tire kalktı (panel metin kuralı); AYRIM aynı.
    expect(g).toContain('Arama reklamı, görseli yok');
  });

  it('PLATFORM ROZETİ basılıyor — iki platform tek listede', () => {
    expect(govde()).toContain('<PlatformLogo');
  });
});

describe('KreatifGorsel', () => {
  const KAYNAK = readFileSync(join(__dirname, 'kreatif-gorsel.tsx'), 'utf8');

  it("'use client' EN ÜSTTE — onError olmadan yer tutucu çalışmaz", () => {
    expect(KAYNAK.trimStart().startsWith("'use client'")).toBe(true);
  });

  const YORUMSUZ = KAYNAK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('onError önce yedek uca BİR KEZ, sonra cümleye düşürüyor (kırık resim ikonu yok)', () => {
    expect(YORUMSUZ).toContain('onError={dustu}');
    // Yalnız saklanan adres düşünce yedek; blob da düşerse yeniden istek yok (döngü olmasın).
    expect(YORUMSUZ).toContain("if (hal.tur === 'adres' && yedekYol) void tazele(yedekYol);");
    expect(YORUMSUZ).toMatch(/else setHal\(\{ tur: 'hata'/);
  });

  it('KRİTİK: yedek uç hatasında SUNUCUNUN cümlesi yazıyor; geç gelen yanıt yeni kartı ezmiyor', () => {
    expect(YORUMSUZ).toContain('if (g?.message) mesaj = g.message;');
    expect(YORUMSUZ).toContain('if (nesil.current !== benim)');
  });
});

describe('Reklam kartı önizleme görselini tazeleyen uca bağlı (2026-10-14)', () => {
  const KART = readFileSync(join(__dirname, 'ad-card.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  it('KRİTİK: KreatifGorsel yedekYol = /ads/:id/gorsel ile çağrılıyor; saklanan adres yoksa da', () => {
    expect(KART).toContain('src={image ?? null}');
    expect(KART).toContain('yedekYol={ad.creative ? `/ads/${encodeURIComponent(ad.id)}/gorsel` : undefined}');
  });
});

describe('Akıllı Boost kartı görseli tazeleyen uca bağlı (2026-10-14)', () => {
  const HAVUZ = readFileSync(join(__dirname, 'autoboost/bildirim-havuzu.tsx'), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  it('KRİTİK: Meta kartında yedek uç var, YouTube kartında yok; img onError hook’a gidiyor', () => {
    expect(HAVUZ).toContain("kayit.platform === 'meta' ? `/autoboost/queue/${encodeURIComponent(kayit.id)}/gorsel` : undefined");
    expect(HAVUZ).toContain('onError={gorsel.dustu}');
    // Eski tek bayrak kalmadı: düşen görsel ile hiç olmayan görsel aynı cümle değil.
    expect(HAVUZ).not.toContain('setGorselDustu');
  });
});
