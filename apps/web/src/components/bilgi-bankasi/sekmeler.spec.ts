import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, type Permission } from '@advetics/shared';
import { SAYFA_GIRIS_IZNI, SEKMELER, SEKME_IZINLERI, gorunurSekmeler } from './sekmeler';

/**
 * BİLGİ BANKASI SEKMELERİ — HER SEKME KENDİ YETKİSİYLE.
 *
 * NEDEN YAZILDI: sayfa tek bir `client.write` hesaplayıp bütün sekmelere
 * geçiriyordu ve sekmeler AYNI uca gitmiyor. Ölçülen sonuç: `bulk.read`
 * taşımayan `customer_service` ve `client_viewer` rollerinde Logo sekmesi
 * doğrudan arka uçtan gelen kırmızı "Yüklenemedi" kutusuyla açılıyordu —
 * kullanıcı bunu bir ARIZA sanıyor, oysa bir YETKİ kararı.
 *
 * Bu dosya panelin bileşenlerini render etmiyor (vitest.config.ts bunu
 * bilinçli reddediyor); karar zaten saf bir fonksiyona çıkarıldı ve
 * sınanan şey o.
 */

const izin = (rol: keyof typeof ROLE_PERMISSIONS): Permission[] => [...ROLE_PERMISSIONS[rol]];
const kodlar = (rol: keyof typeof ROLE_PERMISSIONS): string[] =>
  gorunurSekmeler(izin(rol)).map((s) => s.kod);

describe('sekme listesi tarama boşa düşmüyor', () => {
  it('beş sekme ve hepsinin okuma/yazma yetkisi tanımlı', () => {
    /*
     * Sayı testte yazılı: liste boşalsa ya da yetki alanları silinse
     * aşağıdaki "görünmüyor" iddialarının hepsi her zaman doğru olurdu.
     * Altıncı bir sekme eklenirse burası düşer ve yetkisi bilinçli olarak
     * kararlaştırılır.
     */
    expect(SEKMELER.map((s) => s.kod)).toEqual([
      'bilgi-bankasi',
      'butce',
      'hedef-kitle',
      'marka',
      'logo',
    ]);
    for (const s of SEKMELER) {
      expect(s.oku, `${s.kod} okuma yetkisiz`).toBeTruthy();
      expect(s.yaz, `${s.kod} yazma yetkisiz`).toBeTruthy();
    }
  });

  it('SEKME_IZINLERI listesi SEKMELER’den türüyor — elle yazılmıyor', () => {
    // Sayfa istemciye bu listeyi süzerek geçiriyor. Elle yazılsaydı yeni bir
    // sekme eklendiğinde onun yetkisi listeye girmez, sekme herkesten
    // gizlenirdi — hata yok, log yok, sadece kayıp bir sekme.
    for (const s of SEKMELER) {
      expect(SEKME_IZINLERI).toContain(s.oku);
      expect(SEKME_IZINLERI).toContain(s.yaz);
    }
    // Tekrarsız: `client.read` üç sekmede geçiyor.
    expect(new Set(SEKME_IZINLERI).size).toBe(SEKME_IZINLERI.length);
  });
});

describe('YETKİSİ OLMAYAN SEKME GÖSTERİLMİYOR', () => {
  it('KRİTİK: client_viewer Logo sekmesini GÖRMÜYOR (bulk.read yok)', () => {
    expect(ROLE_PERMISSIONS.client_viewer).not.toContain('bulk.read');
    expect(kodlar('client_viewer')).not.toContain('logo');
  });

  it('KRİTİK: customer_service Logo sekmesini GÖRMÜYOR (bulk.read yok)', () => {
    expect(ROLE_PERMISSIONS.customer_service).not.toContain('bulk.read');
    expect(kodlar('customer_service')).not.toContain('logo');
  });

  it('ters yön: her şeyi gizleyen bir süzgeç de yukarıdakileri geçerdi', () => {
    // client_viewer `client.read` ve `budget.read` taşıyor — dört sekmeyi
    // GÖRMELİ. Süzgeç fazla kesiyorsa müşteri kendi bilgisini göremez.
    expect(kodlar('client_viewer')).toEqual(['bilgi-bankasi', 'butce', 'hedef-kitle', 'marka']);
    // owner her şeyi görüyor.
    expect(kodlar('owner')).toEqual(SEKMELER.map((s) => s.kod));
  });

  it('yetkisiz kullanıcıda liste BOŞ — sayfa bunu yazıya döküyor', () => {
    // Boş dönüş bir hata değil, bir hâl: `BilgiBankasiIcerik` bunu görünce
    // sebebini yazıyor. Sessizce boş bir sekme çubuğu çizmek "yetkin yok"
    // ile "yükleniyor"u aynı boşluğa çevirirdi.
    expect(gorunurSekmeler([])).toEqual([]);
  });
});

describe('SAYFA GİRİŞ YETKİSİ', () => {
  it('giriş yetkisi varsa EN AZ BİR sekme görünüyor', () => {
    /*
     * Menü satırı tek bir `Permission` taşıyabiliyor, sayfanın gerçek kapısı
     * ise "en az bir sekme". İkisinin ayrışma YÖNÜ kasıtlı: giriş yetkisi
     * olan biri sayfayı BOŞ bulmamalı — menüde görünen ama açılmayan bir
     * satır, `roles.ts`in yasakladığı "tıklayınca 403" durumu.
     */
    expect(gorunurSekmeler([SAYFA_GIRIS_IZNI]).length).toBeGreaterThan(0);
  });

  it('giriş yetkisini TAŞIYAN her rol sayfada bir şey görüyor', () => {
    for (const rol of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      if (!ROLE_PERMISSIONS[rol].includes(SAYFA_GIRIS_IZNI)) continue;
      expect(kodlar(rol).length, `${rol} sayfayı boş görüyor`).toBeGreaterThan(0);
    }
  });
});
