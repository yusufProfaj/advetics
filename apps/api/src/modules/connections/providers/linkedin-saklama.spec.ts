import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LINKEDIN_GEO_URN_ONEKI,
  LINKEDIN_RAPOR_SAKLAMA_GUN,
  linkedinGeoEtiketi,
  linkedinGeoUrnMu,
} from '@advetics/shared';

/**
 * ═══ COĞRAFİ KIRILIM: URN SAKLA, ÇÖZÜLMÜŞ ADI SAKLAMA ═══
 *
 * Kullanıcı kararı (2026-09-07). Gerekçe HUKUKİ BİR YORUM: LinkedIn'in
 * saklama tablosu Bing kaynaklı lokasyon verisini saklamayı yasaklıyor ama
 * yasağın ham `urn:li:geo:...` + sayı satırını kapsayıp kapsamadığını
 * AYIRMIYOR. Belirsizlikte dar tarafta duruyoruz.
 *
 * ┌─ BU DOSYANIN ZOR KISMI ───────────────────────────────────────────────┐
 * │ Kuralın bağlayacağı kod HENÜZ YOK: `fetchBreakdowns` açık hata         │
 * │ fırlatıyor. Var olmayan kodu tarayan bir test BOŞ KÜMEDE her zaman     │
 * │ doğrudur ve bu depoda kaynak taramaları tam bu yüzden boşa düştü.      │
 * │                                                                        │
 * │ Çözüm: test ÖNCE kendi ön koşulunu doğruluyor (metot gerçekten hâlâ    │
 * │ fırlatıyor mu), sonra koşullu bekçiyi kuruyor. Yani bugün de bir şey   │
 * │ İDDİA EDİYOR — "bu kural henüz bağlayıcı değil ÇÜNKÜ kod yazılmadı" —  │
 * │ ve kod yazıldığı gün kendiliğinden bağlayıcı hâle geliyor.             │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const SAGLAYICI = readFileSync(join(__dirname, 'linkedin.provider.ts'), 'utf8');

/** `fetchBreakdowns` metodunun gövdesi — süslü parantez sayarak. */
function fetchBreakdownsGovdesi(): string {
  const i = SAGLAYICI.indexOf('async fetchBreakdowns(');
  if (i < 0) throw new Error('fetchBreakdowns bulunamadı — tarama boşa düştü.');
  const bas = SAGLAYICI.indexOf('{', SAGLAYICI.indexOf(')', i));
  let d = 0;
  for (let j = bas; j < SAGLAYICI.length; j++) {
    if (SAGLAYICI[j] === '{') d++;
    else if (SAGLAYICI[j] === '}') {
      d--;
      if (d === 0) return SAGLAYICI.slice(bas, j);
    }
  }
  throw new Error('fetchBreakdowns gövdesi kapanmadı — tarama boşa düştü.');
}

describe('linkedinGeoUrnMu / linkedinGeoEtiketi — bugün çalışan kod', () => {
  it('URN tanınıyor, düz metin tanınmıyor', () => {
    expect(linkedinGeoUrnMu('urn:li:geo:103644278')).toBe(true);
    // Meta ve Google şehir kırılımı ÇÖZÜLMÜŞ ad gönderiyor; onlar URN değil
    // ve bu fonksiyondan etkilenmemeli.
    expect(linkedinGeoUrnMu('İzmir')).toBe(false);
    expect(linkedinGeoUrnMu('')).toBe(false);
  });

  it('çözülen ad varsa o gösteriliyor', () => {
    expect(linkedinGeoEtiketi('urn:li:geo:103644278', 'İstanbul')).toBe('İstanbul');
  });

  it('KRİTİK: ÇÖZÜLEMEYEN satır ATILMIYOR — URN gösteriliyor ve sebebi yazılıyor', () => {
    /*
     * Satırı listeden düşürmek, o bölgenin harcamasını rapordan SESSİZCE
     * silmek demek: toplam tutmaz ve sebebi hiçbir yerde yazmaz. Ham URN
     * okunaksız ama DOĞRU.
     */
    const etiket = linkedinGeoEtiketi('urn:li:geo:103644278', null);
    expect(etiket).toContain('urn:li:geo:103644278');
    expect(etiket).toContain('çözülemedi');
  });

  it('KRİTİK: BOŞ dize "çözüldü" sayılmıyor', () => {
    /*
     * Geo API bir bölge için boş ad döndürebiliyor ve `cozulen !== null`
     * kontrolü tek başına onu geçirirdi: tabloda ADSIZ bir satır kalır ve
     * okuyan hangi bölgeye baktığını bilemez.
     */
    expect(linkedinGeoEtiketi('urn:li:geo:1', '')).toContain('çözülemedi');
    expect(linkedinGeoEtiketi('urn:li:geo:1', '   ')).toContain('çözülemedi');
  });

  it('URN OLMAYAN değer olduğu gibi geçiyor', () => {
    // Meta/Google şehir satırları bu fonksiyondan geçse bile bozulmamalı.
    expect(linkedinGeoEtiketi('İzmir', null)).toBe('İzmir');
  });

  it('saklama süresi bir yıl', () => {
    expect(LINKEDIN_RAPOR_SAKLAMA_GUN).toBe(365);
  });
});

describe('kural, bağlayacağı yerde YAZILI', () => {
  it('tarama gerçekten gövdeyi yakaladı', () => {
    const g = fetchBreakdownsGovdesi();
    expect(g.length).toBeGreaterThan(50);
  });

  it('KRİTİK: `fetchBreakdowns` HÂLÂ yazılmadı — koşullu bekçinin ön koşulu', () => {
    /*
     * BU İDDİA TESTİN KENDİ KAPSAMINI SÖYLÜYOR. Aşağıdaki koşullu bekçi
     * bugün çalışmıyor ve bunu gizlemek yerine burada açıkça yazıyoruz:
     * metot fırlattığı sürece kural bağlayıcı değil.
     *
     * Metot yazıldığı gün BU test düşecek ve düşmesi doğru: yazan kişi
     * aşağıdaki bekçiyi okumak ZORUNDA kalacak.
     */
    expect(
      fetchBreakdownsGovdesi(),
      'fetchBreakdowns yazılmış — aşağıdaki geo disiplinini uygula ve bu iddiayı kaldır',
    ).toContain('henüz yazılmadı');
  });

  it('KRİTİK: geo kuralı metodun DOKÜMANINDA — dosyanın herhangi bir yerinde değil', () => {
    /*
     * İddia METODUN KENDİ doküman bloğuna çapalı. Dosyanın tamamında aramak,
     * kuralı sınıfın başındaki uzun yorumda bulup geçmek olurdu — ve kodu
     * yazan kişi metoda bakarken onu görmezdi.
     */
    const i = SAGLAYICI.indexOf('async fetchBreakdowns(');
    const dokBas = SAGLAYICI.lastIndexOf('/**', i);
    expect(dokBas, 'metodun doküman bloğu yok').toBeGreaterThan(0);
    const dokuman = SAGLAYICI.slice(dokBas, i);

    expect(dokuman).toContain('urn:li:geo:');
    expect(dokuman, 'çözülmüş adın saklanmayacağı yazılmamış').toMatch(/HİÇBİR YERE/);
    expect(dokuman, 'gerekçenin YORUM olduğu yazılmamış').toMatch(/YORUM/);
  });

  it('KRİTİK: kural yazıldığında bağlayıcı — koşullu bekçi', () => {
    /*
     * BUGÜN BOŞ GEÇİYOR VE BUNU BİLİYORUZ (yukarıdaki ön koşul testi bunu
     * iddia ediyor). Metot yazıldığı an bu bekçi devreye giriyor:
     * `fetchBreakdowns` artık fırlatmıyorsa, geo disiplininin izlerini
     * TAŞIMAK ZORUNDA.
     */
    const govde = fetchBreakdownsGovdesi();
    if (govde.includes('henüz yazılmadı')) return; // henüz yazılmadı — bkz. ön koşul

    expect(govde, 'geo değeri URN olarak yazılmıyor').toContain(LINKEDIN_GEO_URN_ONEKI);
    expect(
      govde,
      'Geo API çözümü sağlayıcıda yapılıyor — çözülmüş ad saklanma riski',
    ).not.toMatch(/\/rest\/geo|geoLocations/);
  });
});
