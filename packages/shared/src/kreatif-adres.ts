/**
 * ═══ KREATİF GÖRSEL ADRESİ SÜZGECİ — TEK KAYNAK ═══
 *
 * `creatives.asset_urls` bir JSONB dizisi ve İÇİNDE HER ZAMAN ADRES YOK.
 * Google sağlayıcısı oraya Google Ads'in KAYNAK ADINI yazıyor
 * (`customers/1234567890/assets/98765`) — çünkü okuduğu alan
 * `AdImageAsset.asset` ve o alan bir URL değil, bir Asset referansı. Gerçek
 * adres ayrı bir sorgu (`FROM asset` → `image_asset.full_size.url`) istiyor ve
 * o sorgu henüz yazılmadı.
 *
 * ┌─ NEDEN "sadece string" YETMİYOR ──────────────────────────────────────┐
 * │ Kaynak adı da bir string. `typeof u === 'string'` süzgecinden geçiyor, │
 * │ `imageUrl` alanına yazılıyor ve TRUTHY oluyor. Sonuç raporda şu:       │
 * │  • `new URL('customers/…')` fırlatıyor → "adres okunamadı"             │
 * │  • `imageUrl` dolu olduğu için PDF "görsel alınamadı" DALINA giriyor,  │
 * │    metin önizlemesi dalına HİÇ ULAŞMIYOR                              │
 * │  • dipnottaki "N reklamın görseli alınamadı" sayacı ŞİŞİYOR — yani     │
 * │    gerçek bir arıza, uydurma bir arızanın içinde kayboluyor            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SÜZGEÇ İKİ YERDE VARDI VE AYRIŞMIŞTI: panel yolu (`ads.service.ts`)
 * `https?` kontrolü yapıyordu, rapor yolu (`reports.service.ts`) yapmıyordu.
 * Belirti farkı tam da bundan: aynı reklam panelde "görsel yok", PDF'te
 * "alınamadı" diyordu. CLAUDE.md'nin "AYNI SÜZGECİ İKİ YERDE YAZMA" kuralı
 * bire bir bu durum — artık tek yerde.
 *
 * `http` de KABUL EDİLİYOR: bu süzgecin işi güvenlik değil, "bu değer bir
 * adres mi" ayrımı. Şema ve ana makine kontrolü indirmeden hemen önce
 * yapılıyor (`kreatif-gorseli.ts`), çünkü orası isteğin gerçekten çıktığı yer
 * ve güvenlik kontrolü oraya ait.
 */
export function gecerliGorselAdresi(deger: unknown): deger is string {
  return typeof deger === 'string' && /^https?:\/\//i.test(deger);
}

/** `asset_urls` JSONB değerinden yalnızca gerçek adresler. */
export function gorselAdresleri(assetUrls: unknown): string[] {
  return Array.isArray(assetUrls) ? assetUrls.filter(gecerliGorselAdresi) : [];
}
