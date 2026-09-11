import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gecisHedefi, gecisYolu } from './kapsam-hedefi';

/**
 * ═══ KAPSAM DEĞİŞİNCE SAYFADA KALMAK ═══
 *
 * Eski davranış her geçişte `/dashboard`a atıyordu. Yeni davranışın iki
 * ucu var ve İKİSİ DE kırılabilir:
 *   · fazla korumacı olmak → kullanıcı yine genel bakışa düşer (arıza aynı),
 *   · fazla cömert olmak → eski kapsamın kimliğini yeni şirkete taşır ve
 *     sayfa boş/yetkisiz açılır.
 */

describe('gecisYolu', () => {
  it('KRİTİK: kimliksiz yol AYNEN korunuyor', () => {
    // Asıl istek bu: kurallar ekranındayken şirket değiştiren kişi
    // kurallarda kalmalı.
    expect(gecisYolu('/kurallar')).toBe('/kurallar');
    expect(gecisYolu('/ayarlar/baglantilar')).toBe('/ayarlar/baglantilar');
    expect(gecisYolu('/kutuphane/kreatifler')).toBe('/kutuphane/kreatifler');
    expect(gecisYolu('/reklam-olustur/uzman')).toBe('/reklam-olustur/uzman');
  });

  it('KRİTİK: UUID taşıyan yol BÖLÜM KÖKÜNE kesiliyor', () => {
    /*
     * `/ayarlar/musteriler/<uuid>/kanallar` yeni şirkette YOK: o uuid
     * başka bir kiracının workspace'i. Oraya düşmek "yetkiniz yok"
     * demek ve kullanıcı bunu KAPSAM DEĞİŞİMİNİN hatası sanardı.
     */
    expect(gecisYolu('/ayarlar/musteriler/6f1c2c9e-1111-4b0a-8f2d-0b7f9a3c1234/kanallar')).toBe(
      '/ayarlar/musteriler',
    );
    expect(gecisYolu('/ayarlar/musteriler/6f1c2c9e-1111-4b0a-8f2d-0b7f9a3c1234/ekip')).toBe(
      '/ayarlar/musteriler',
    );
  });

  it('BÜYÜK HARFLİ UUID de kimlik sayılıyor', () => {
    // Adresler her zaman küçük harfle üretilmiyor; büyük harfli bir uuid
    // süzgeçten kaçarsa koruma yalnızca bazen çalışır — en kötü tür.
    expect(gecisYolu('/ayarlar/musteriler/6F1C2C9E-1111-4B0A-8F2D-0B7F9A3C1234/ekip')).toBe(
      '/ayarlar/musteriler',
    );
  });

  it('KÖK ve geçersiz giriş genel bakışa düşüyor', () => {
    expect(gecisYolu('/')).toBe('/dashboard');
    expect(gecisYolu('')).toBe('/dashboard');
    expect(gecisYolu(null)).toBe('/dashboard');
    expect(gecisYolu(undefined)).toBe('/dashboard');
    // Mutlak olmayan bir değer `window.location.assign` için tehlikeli:
    // "//baska.site" tarayıcıda BAŞKA BİR SUNUCUYA gider.
    expect(gecisYolu('kurallar')).toBe('/dashboard');
    expect(gecisYolu('https://baska.site/x')).toBe('/dashboard');
  });

  it('KRİTİK: üretimi mutlak yol — açık yönlendirme üretmiyor', () => {
    // `//baska.site` `/` ile BAŞLIYOR ve saf bir "başta / var mı" kontrolünü
    // geçer; ilk parça kimlik olmadığı için de korunurdu. Sonuç tarayıcıda
    // protokol-bağımsız bir DIŞ adres olurdu.
    expect(gecisYolu('//baska.site/x')).toBe('/baska.site/x');
    expect(gecisHedefi('//baska.site/x')).not.toMatch(/^\/\//);
  });
});

describe('gecisHedefi — süzgeçler', () => {
  it('KRİTİK: tarih aralığı TAŞINIYOR', () => {
    // Aralığı düşürmek, kullanıcının seçtiği dönemi haber vermeden bugüne
    // çevirmek demek; iki şirketi karşılaştıran kişi farklı dönemlere bakar.
    const h = gecisHedefi('/dashboard', { aralik: 'ozel', baslangic: '2026-01-01', bitis: '2026-01-31' });
    expect(h).toContain('aralik=ozel');
    expect(h).toContain('baslangic=2026-01-01');
    expect(h).toContain('bitis=2026-01-31');
  });

  it('KRİTİK: ESKİ KAPSAMIN KİMLİKLERİ DÜŞÜYOR', () => {
    /*
     * `musteri` cookie'yi EZİYOR (`params.musteri ?? session.activeClientId`):
     * taşınırsa üst bar yeni şirketi, gövde eskisini gösterir — ve ikisi
     * ekranda yan yana durur.
     */
    const h = gecisHedefi('/dashboard', {
      musteri: '6f1c2c9e-1111-4b0a-8f2d-0b7f9a3c1234',
      hesap: '44444444-4444-4444-4444-444444444444',
      kampanya: 'c1',
      kural: 'r1',
      sablon: 's1',
      form: 'f1',
      sohbet: 'x1',
    });
    expect(h).toBe('/dashboard');
  });

  it('boş değerli süzgeç anahtarı üretmiyor', () => {
    expect(gecisHedefi('/dashboard', { platform: '' })).toBe('/dashboard');
  });

  it('süzgeçler kesilen yola da uygulanıyor', () => {
    expect(
      gecisHedefi('/ayarlar/musteriler/6f1c2c9e-1111-4b0a-8f2d-0b7f9a3c1234/ekip', {
        aralik: 'son7',
      }),
    ).toBe('/ayarlar/musteriler?aralik=son7');
  });
});

describe('KRİTİK: seçici GERÇEKTEN bu hedefi kullanıyor', () => {
  /*
   * Saf fonksiyonun doğru olması yetmiyor — ÇAĞRILDIĞI da test edilmeli.
   * CLAUDE.md'deki boşa düşen mutasyonlardan biri tam olarak buydu:
   * "bir fonksiyon test edilmişti ama ÇAĞRILDIĞI test edilmemişti."
   */
  const SECICI = readFileSync(
    resolve(__dirname, '..', 'components', 'kapsam-secici.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(SECICI).toContain('export function KapsamSecici');
    expect(SECICI.length).toBeGreaterThan(2000);
  });

  it('tam sayfa geçişi `/dashboard` SABİTİNE gitmiyor', () => {
    expect(SECICI).toContain('gecisHedefi(');
    expect(SECICI).not.toContain("window.location.assign('/dashboard')");
  });
});
