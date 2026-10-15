import type { NavEntry } from '@/components/nav';
import { sec, type Dil } from '@advetics/shared';
import { bildirimSozlugu } from '@/dil/sozlukler/bildirim';

/**
 * ═══ GENEL BAKIŞ › HIZLI ERİŞİM ═══
 *
 * Başlığın yanındaki küçük düğmeler (MIMARI § 3). Bu dosya YETKİ TUTMUYOR:
 * görünürlük menünün süzgecinden (`visibleSections`) çıkmış listeye bakılarak
 * veriliyor. İkinci bir yetki listesi yazmak, menüde görünmeyen bir kısayol
 * (tıklayınca 403) ya da kısayolu olmayan bir menü satırı demekti; ikisi de
 * sessizce ayrışırdı.
 *
 * Etiket menüden FARKLI olabilir ("Yeni reklam" ≠ "AdvCampaign"): kısayol
 * bir EYLEM söylüyor, menü bir ekranın adını. Adres aynı.
 */
/**
 * `anahtar` sözlükteki adı (`bildirim.ts#hizli`); `null` = ürün adı,
 * iki dilde aynı (`sabitAd`). Tanımda Türkçe dize yok: ad hep sözlükten.
 */
export const HIZLI_ERISIM = [
  { href: '/auto-boost', anahtar: 'akilliBoost', sabitAd: null, boostRozeti: true },
  { href: '/reklam', anahtar: 'yeniReklam', sabitAd: null, boostRozeti: false },
  { href: '/strateji', anahtar: null, sabitAd: 'AdvStrategy', boostRozeti: false },
  { href: '/raporlar', anahtar: 'raporlar', sabitAd: null, boostRozeti: false },
] as const;

export type HizliErisimOgesi = (typeof HIZLI_ERISIM)[number];

/** Menüde görünen (süzülmüş) bölümlerden, kullanıcının açabileceği kısayollar. */
export function hizliErisim(
  bolumler: ReadonlyArray<{ items: NavEntry[] }>,
  dil: Dil = 'tr',
): Array<HizliErisimOgesi & { etiket: string }> {
  const acik = new Set(
    bolumler.flatMap((b) => b.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)])),
  );
  const d = sec(bildirimSozlugu, dil).hizli;
  return HIZLI_ERISIM.filter((k) => acik.has(k.href)).map((k) => ({
    ...k,
    etiket: k.anahtar !== null ? d[k.anahtar] : k.sabitAd,
  }));
}
