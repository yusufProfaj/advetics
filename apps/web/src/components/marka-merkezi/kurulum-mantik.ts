import type { KurulumAdimDurumu, KurulumAdimKodu, KurulumIstegi } from '@advetics/shared';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';

/**
 * Kurulum parçası satırının saf kararları (`kurulum-bolumu.tsx`). Panelde
 * bileşen render eden test altyapısı yok; karar burada, çizim orada.
 *
 * ÜÇ GRUP BAŞLIĞI KALKTI (2026-10-13): kurulum artık yedi adımlı TEK liste
 * (`KURULUM_LISTESI`, docs/panel-sadelestirme/MIMARI.md § 7) ve grupların
 * yerini adımlar aldı.
 */

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

/**
 * TAMAMLANMIŞ ADIMI DEĞİŞTİRMENİN SONUCU — seçmeden ÖNCE okunur. Konteyner
 * değişince sitedeki kod da değişmek zorunda; bunu söylemeden değiştirmek,
 * sitede eski kod kalıp etiketlerin boş konteynere yazılması (ya da iki
 * konteynerin birlikte çalışıp dönüşümü İKİ KEZ sayması) demek ve ikisi de
 * sessiz. Metinler sunucunun gerçekten yaptığını anlatıyor
 * (`kurulum.service.ts` konteyner/mulk/piksel), fazlasını vaat etmiyor.
 */
export const DEGISIM_SONUCU: Partial<Record<KurulumAdimKodu, string>> = {
  gtm_konteyner:
    'Sitedeki kod değişir: yeni konteynerin kodunu siteye ekle ve eskisini kaldır, ikisi birlikte kalırsa dönüşümler iki kez sayılır. Ölçüm etiketleri yeni konteynere yeniden yazılıp yayınlanır; eski konteynerdeki etiketlere dokunulmaz.',
  ga4_mulk:
    'Etiketler yeni ölçüm kimliğiyle yeniden yayınlanmalı (Ölçüm etiketleri adımı "Güncellenmeli" olur) ve Google Ads bağlantısı yeni mülk için yeniden kurulur. Eski mülkte toplanan veri orada kalır.',
  meta_piksel:
    'Etiketler yeni pikselle yeniden yayınlanmalı (Ölçüm etiketleri adımı "Güncellenmeli" olur). Bundan sonra kurulan reklamlar yeni pikseli kullanır; yayındaki reklamlar eskisinde kalır.',
};

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

/**
 * İzin akışının dönüş adresi: Kurulum bölümü, aynı workspace. ÇAPASIZ:
 * OAuth dönüş denetimi (`connections.controller.ts`) `#` kabul etmiyor ve
 * çapalı adres sessizce varsayılan dönüşe düşerdi.
 */
export function izinDonusu(clientId: string): string {
  return markaMerkeziAdresi('kurulum', clientId);
}
