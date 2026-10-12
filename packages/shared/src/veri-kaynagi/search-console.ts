/**
 * ═══ F2 · SEARCH CONSOLE (iskelet) ═══
 *
 * `POST https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query`,
 * izin `webmasters.readonly` (YENİ: Google Cloud onay ekranına eklenmeli,
 * BAGLANTI.md). Kaynak: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 *
 * ÖLÇÜLMÜŞ SINIRLAR (belge, 2026-10-12): `rowLimit` en çok 25.000, `startRow`
 * ile sayfalı; gün ve arama türü başına en çok 50.000 satır; site ve
 * kullanıcı başına 1.200 istek/dk; sorgu/sayfa ile gruplamak "load" kotasını
 * daha çok yiyor. Veri 2-3 gün geriden.
 *
 * İKİ İSTEK, İKİ TABLO: Sorgu boyutlu satırların toplamı mülk toplamını
 * TUTMAZ (Google bazı sorguları göstermiyor ve en üst satırları döndürüyor).
 * Toplam boyutsuz istekle ayrı alınır (`sc_gunluk`); "sorgu satırlarını
 * topla = toplam" yazan ekran organik tıklamayı eksik gösterir.
 */

export const SC_ISTEKLERI = {
  toplam: { dimensions: ['date'], type: 'web', dataState: 'final', aggregationType: 'byProperty' },
  sorgu: { dimensions: ['date', 'query'], type: 'web', dataState: 'final' },
} as const;

export const SC_SINIR = { satirIstek: 25_000, satirGunEnFazla: 50_000 } as const;

/**
 * KONUM TOPLANAMAZ, ORTALAMASI DA ALINAMAZ: satırların `position`
 * ortalaması 1 gösterimli bir sorguyu 10.000 gösterimliyle eşit tartar.
 * Saklanan `konum × gösterim`; dönem konumu gösterim ağırlıklı.
 */
export function agirlikliKonum(satirlar: ReadonlyArray<{ konum: number; gosterim: number }>): number | null {
  let pay = 0;
  let payda = 0;
  for (const s of satirlar) {
    pay += s.konum * s.gosterim;
    payda += s.gosterim;
  }
  return payda > 0 ? pay / payda : null;
}

/**
 * Arama metni normalleştirme: organik sorgu ile ücretli arama terimi
 * (`search_term_insights.search_term`) aynı anahtarda buluşsun diye.
 * Türkçe küçük harf + boşluk; aksan ve noktalama SİLİNMEZ (tahmin olur).
 */
export function aramaMetniNormalize(metin: string): string {
  return metin.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

export const ORTUSME_TURLERI = ['ikisi_de', 'yalniz_ucretli', 'yalniz_organik'] as const;
export type OrtusmeTuru = (typeof ORTUSME_TURLERI)[number];

/**
 * Organik + ücretli arama örtüşmesi. YORUM YAPMAZ: "organikte ilk sıradasın,
 * reklamı kapat" demek yamyamlaşma iddiası ve ölçülmeden doğru değil
 * (marka aramalarında rakip reklamı sıranın üstüne çıkabiliyor). Ekran
 * yalnız yan yana gösterir.
 */
export function aramaOrtusmesi(
  organik: ReadonlyArray<{ sorgu: string; tiklama: number; gosterim: number; konum: number | null }>,
  ucretli: ReadonlyArray<{ terim: string; tiklama: number; harcamaMikro: bigint }>,
): Array<{ anahtar: string; tur: OrtusmeTuru; organikTiklama: number; organikKonum: number | null; ucretliTiklama: number; harcamaMikro: bigint }> {
  const harita = new Map<string, { organikTiklama: number; organikKonumPay: number; organikGosterim: number; organikVar: boolean; ucretliTiklama: number; harcamaMikro: bigint; ucretliVar: boolean }>();
  const al = (k: string) => {
    let v = harita.get(k);
    if (!v) {
      v = { organikTiklama: 0, organikKonumPay: 0, organikGosterim: 0, organikVar: false, ucretliTiklama: 0, harcamaMikro: 0n, ucretliVar: false };
      harita.set(k, v);
    }
    return v;
  };
  for (const o of organik) {
    const v = al(aramaMetniNormalize(o.sorgu));
    v.organikVar = true;
    v.organikTiklama += o.tiklama;
    if (o.konum !== null) {
      v.organikKonumPay += o.konum * o.gosterim;
      v.organikGosterim += o.gosterim;
    }
  }
  for (const u of ucretli) {
    const v = al(aramaMetniNormalize(u.terim));
    v.ucretliVar = true;
    v.ucretliTiklama += u.tiklama;
    v.harcamaMikro += u.harcamaMikro;
  }
  return [...harita.entries()].map(([anahtar, v]) => ({
    anahtar,
    tur: v.organikVar && v.ucretliVar ? 'ikisi_de' : v.ucretliVar ? 'yalniz_ucretli' : 'yalniz_organik',
    organikTiklama: v.organikTiklama,
    organikKonum: v.organikGosterim > 0 ? v.organikKonumPay / v.organikGosterim : null,
    ucretliTiklama: v.ucretliTiklama,
    harcamaMikro: v.harcamaMikro,
  }));
}

/** Search Console izin düzeyi (`sites.list` `permissionLevel`). Doğrulanmamış kullanıcı veri okuyamaz. */
export const SC_IZIN_DUZEYLERI = ['siteOwner', 'siteFullUser', 'siteRestrictedUser', 'siteUnverifiedUser'] as const;
export const SC_OKUYABILEN: readonly string[] = ['siteOwner', 'siteFullUser', 'siteRestrictedUser'];
