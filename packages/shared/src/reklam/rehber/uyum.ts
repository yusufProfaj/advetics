/**
 * UYUM DENETÇİSİ v1 — gerçek yayının son kapısı (K-4: doğrudan yayın).
 *
 * Meta motoru bugün gerçek yayını `UYUM` retiyle durduruyor; rehber
 * yayınları bu fonksiyon `gecti` dediğinde o reti kaldırır. Saf ve
 * sabit kurallı: kural listesi büyüdükçe test listesi de büyür.
 *
 * KAPSAM BİLEREK DAR. Denetçi platformların kendi incelemesinin yerine
 * geçmiyor; yalnız Advetics'in BİLDİĞİ ve platformun sessizce geçirdiği
 * şeyleri durduruyor:
 * 1. Siyasi/toplumsal kategori (Advetics'ten yayınlanmıyor).
 * 2. Zorunlu yasal uyarı her platformun metninde.
 * 3. Kısıtlı kategoride (konut, iş, kredi) yaş/cinsiyet daraltması yok —
 *    Meta Türkiye'de beyanı zorunlu tutmuyor, kısıtsız konut reklamı HATASIZ
 *    yayınlanır.
 * 4. Meta'nın metin varyasyonu yasal uyarılı workspace'te AÇIK dönerse dur
 *    (bu, geri okumada; burada yalnız kural adı sabit).
 * Bunların dışında kalan (sağlık iddiası, yasak ürün) platform incelemesine
 * kalıyor ve ekranda öyle yazıyor: denetçinin "geçti" demesi "platform da
 * onaylayacak" demek değil.
 */
import { metinUyariIceriyor } from '../taslak-alanlari';
import type { OzelKategori } from '../meta/hedefleme';
import type { RehberPlatformu } from './amaclar';

export const UYUM_SURUMU = '1.0.0';

export interface UyumGirdisi {
  platformlar: Record<RehberPlatformu, boolean>;
  kategoriler: OzelKategori[];
  yasalUyari: string | null;
  metaAnaMetin: string;
  googleAciklamalar: string[];
  enDusukYas: number;
  yasAraligi: { min: number; max: number } | null;
  /** Cinsiyet daraltması var mı (rehberde alanı yok; ileride eklenirse kapı hazır). */
  cinsiyetDaraltmasi: boolean;
}

export interface UyumBulgusu {
  kod: string;
  platform: RehberPlatformu | null;
  metin: string;
}

export type UyumSonucu = { tur: 'gecti'; surum: string } | { tur: 'durdu'; surum: string; bulgular: UyumBulgusu[] };

const KISITLI: readonly OzelKategori[] = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];

export function uyumDenetle(g: UyumGirdisi): UyumSonucu {
  const b: UyumBulgusu[] = [];
  if (g.kategoriler.includes('ISSUES_ELECTIONS_POLITICS')) {
    b.push({ kod: 'UYUM-SIYASI', platform: null, metin: "Siyasi ve toplumsal konulu reklamlar Advetics'ten yayınlanamıyor." });
  }
  if (g.yasalUyari) {
    if (g.platformlar.meta && !metinUyariIceriyor(g.metaAnaMetin, g.yasalUyari)) {
      b.push({ kod: 'UYUM-YASAL-META', platform: 'meta', metin: 'Zorunlu yasal uyarı Meta ana metninde yok.' });
    }
    if (g.platformlar.google && !g.googleAciklamalar.some((a) => metinUyariIceriyor(a, g.yasalUyari as string))) {
      b.push({ kod: 'UYUM-YASAL-GOOGLE', platform: 'google', metin: 'Zorunlu yasal uyarı hiçbir Google açıklamasında yok.' });
    }
  }
  if (g.kategoriler.some((k) => KISITLI.includes(k))) {
    const dar = g.enDusukYas !== 18 || (g.yasAraligi !== null && (g.yasAraligi.min !== 18 || g.yasAraligi.max < 65)) || g.cinsiyetDaraltmasi;
    if (dar) {
      b.push({ kod: 'UYUM-KISITLI-KITLE', platform: null, metin: 'Konut, iş ilanı ve kredi reklamında yaş ve cinsiyet daraltılamaz.' });
    }
  }
  return b.length ? { tur: 'durdu', surum: UYUM_SURUMU, bulgular: b } : { tur: 'gecti', surum: UYUM_SURUMU };
}
