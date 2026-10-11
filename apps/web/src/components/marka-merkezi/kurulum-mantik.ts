import type { KurulumAdimDurumu, KurulumAdimKodu, KurulumGrubu, KurulumIstegi } from '@advetics/shared';

/**
 * Kurulum bölümünün saf kararları (`kurulum-bolumu.tsx`). Panelde bileşen
 * render eden test altyapısı yok; karar burada, çizim orada.
 */

export const GRUP_BASLIGI: Record<KurulumGrubu, { baslik: string; aciklama: string }> = {
  hesaplar: { baslik: '1. Reklam hesapları', aciklama: 'Her projenin kendi Meta ve Google Ads hesabı, sayfası ve ödeme yöntemi.' },
  olcum: { baslik: '2. Dönüşüm ölçümü', aciklama: 'Tag Manager, Analytics, piksel ve dönüşümler; en sonda verinin doğru geldiği canlı olarak doğrulanır.' },
  marka: { baslik: '3. Marka bilgileri', aciklama: 'Reklam açarken önden dolan bilgiler ve varsayılanlar.' },
};

export const DURUM_GOSTERIMI: Record<KurulumAdimDurumu, { etiket: string; sinif: string }> = {
  tamam: { etiket: 'Tamam', sinif: 'bg-ok-soft text-ok-strong' },
  eksik: { etiket: 'Eksik', sinif: 'bg-warn-soft text-warn-strong' },
  kullanicida: { etiket: 'Sizde', sinif: 'bg-info-soft text-info-strong' },
  hata: { etiket: 'Hata', sinif: 'bg-danger-soft text-danger-strong' },
  atlandi: { etiket: 'Bekliyor', sinif: 'bg-surface-sunken text-ink-muted' },
};

/** Ödeme adımlarının "Kontrol et" isteği; diğer dış eylemlerde kontrol yok. */
export const KONTROL_ISTEGI: Partial<Record<KurulumAdimKodu, KurulumIstegi>> = {
  meta_odeme: { kod: 'meta_odeme' },
  google_odeme: { kod: 'google_odeme' },
};

/** Otomatik eylemin isteği. `gtm_etiket` kayıtlı tetikle gider (yoksa null: önce seçilmeli). */
export function otomatikIstek(kod: KurulumAdimKodu, tetik: { formYolu: string | null; telefon: boolean; whatsapp: boolean } | null): KurulumIstegi | null {
  if (kod === 'gtm_etiket') return tetik ? { kod: 'gtm_etiket', tetik } : null;
  if (kod === 'ads_donusum' || kod === 'ga4_ads_bag' || kod === 'site_kodu' || kod === 'dogrulama') return { kod };
  return null;
}

/** Seçim formundan istek: mevcut değer, yeni açma ya da Google daveti. */
export type SecimFormu =
  | { tur: 'mevcut'; deger: string }
  | { tur: 'yeni'; ust: string; ad: string }
  | { tur: 'davet'; ust: string; musteriNo: string };

export function secimIstegi(kod: KurulumAdimKodu, f: SecimFormu): KurulumIstegi | null {
  switch (kod) {
    case 'meta_hesap':
      if (f.tur === 'mevcut') return { kod, secim: { tur: 'mevcut', adAccountId: f.deger } };
      if (f.tur === 'yeni') return { kod, secim: { tur: 'yeni', businessId: f.ust, ad: f.ad } };
      return null;
    case 'google_hesap':
      if (f.tur === 'mevcut') return { kod, secim: { tur: 'mevcut', adAccountId: f.deger } };
      if (f.tur === 'yeni') return { kod, secim: { tur: 'yeni', mccId: f.ust, ad: f.ad } };
      return { kod, secim: { tur: 'davet', mccId: f.ust, musteriNo: f.musteriNo } };
    case 'sayfa':
      return f.tur === 'mevcut' ? { kod, sayfaId: f.deger } : null;
    case 'meta_piksel':
      return f.tur === 'mevcut' ? { kod, secim: { tur: 'mevcut', pikselId: f.deger } } : { kod, secim: { tur: 'yeni' } };
    case 'gtm_konteyner':
      return f.tur === 'mevcut' ? { kod, secim: { tur: 'mevcut', konteynerYolu: f.deger } } : f.tur === 'yeni' ? { kod, secim: { tur: 'yeni', gtmHesapId: f.ust } } : null;
    case 'ga4_mulk':
      return f.tur === 'mevcut' ? { kod, secim: { tur: 'mevcut', mulkId: f.deger } } : f.tur === 'yeni' ? { kod, secim: { tur: 'yeni', gaHesapId: f.ust } } : null;
    default:
      return null;
  }
}

/** Yeni açılırken ad isteyen adımlar (Meta/Google hesabı); diğerleri workspace adını kullanır. */
export const AD_ISTEYEN: ReadonlySet<KurulumAdimKodu> = new Set(['meta_hesap', 'google_hesap']);

/** Geliştiriciye gidecek e-posta: kod + nereye ekleneceği. `mailto:` gövdesi 2.000 karakteri aşmasın diye kısa. */
export function gelistiriciEpostasi(site: string | null, gtmKimligi: string, head: string, body: string): string {
  const konu = `Siteye Google Tag Manager kodu (${gtmKimligi})`;
  const govde = [
    `Merhaba,`,
    ``,
    `${site ?? 'Sitemize'} aşağıdaki iki kodu ekleyebilir misiniz? Reklam ölçümü için gerekiyor.`,
    ``,
    `1) Her sayfanın <head> bölümüne, olabildiğince yukarıya:`,
    head,
    ``,
    `2) <body> etiketinin hemen ardına:`,
    body,
    ``,
    `WordPress kullanıyorsanız "Site Kit by Google" ya da "GTM4WP" eklentisine yalnız ${gtmKimligi} kimliğini yazmanız yeterli.`,
    ``,
    `Teşekkürler.`,
  ].join('\n');
  return `mailto:?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(govde)}`;
}

/** İzin akışının dönüş adresi: kurulum bölümü, aynı workspace. */
export function izinDonusu(clientId: string): string {
  return `/marka-merkezi?bolum=kurulum&musteri=${encodeURIComponent(clientId)}`;
}
