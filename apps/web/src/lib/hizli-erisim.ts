import type { NavEntry } from '@/components/nav';

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
export const HIZLI_ERISIM = [
  { href: '/auto-boost', etiket: 'Akıllı Boost', boostRozeti: true },
  { href: '/reklam', etiket: 'Yeni reklam', boostRozeti: false },
  { href: '/strateji', etiket: 'AdvStrategy', boostRozeti: false },
  { href: '/raporlar', etiket: 'Raporlar', boostRozeti: false },
] as const;

export type HizliErisimOgesi = (typeof HIZLI_ERISIM)[number];

/** Menüde görünen (süzülmüş) bölümlerden, kullanıcının açabileceği kısayollar. */
export function hizliErisim(bolumler: ReadonlyArray<{ items: NavEntry[] }>): HizliErisimOgesi[] {
  const acik = new Set(
    bolumler.flatMap((b) => b.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)])),
  );
  return HIZLI_ERISIM.filter((k) => acik.has(k.href));
}
