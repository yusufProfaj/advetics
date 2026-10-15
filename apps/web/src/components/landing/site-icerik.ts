/**
 * ═══ TANITIM SİTESİNİN BÜTÜN METNİ, TEK YERDE ═══
 *
 * Neden tek dosya: menü, alt bilgi, ana sayfadaki kartlar, özellik sayfasının
 * başlığı ve site haritası AYNI listeden okuyor. Menüde "İyileştirme" yazıp
 * sayfada "Optimizasyon" başlığı açmak (CLAUDE.md, "AYNI EKRANIN MENÜDE VE
 * SAYFADA İKİ AYRI ADI") kullanıcıya yanlış sayfaya düştüğünü düşündürüyor;
 * ad bir kez yazıldığında ikisi ayrışamıyor. `site-icerik.spec.ts` kilitliyor.
 *
 * Metinler JSX içinde değil burada, çünkü Türkçe metin kesme işaretiyle dolu
 * ve JSX gövdesinde `react/no-unescaped-entities` hatası üretiyor.
 *
 * YAZIM KURALLARI (kullanıcı kararı, 2026-10-12):
 *  · Okuyan reklamcılık bilmiyor. Terim gerekiyorsa yanında tek cümlelik
 *    açıklama var.
 *  · Uzun tire yok, kısa cümle.
 *  · YALNIZCA ÜRÜNÜN BUGÜN YAPTIĞI ŞEY anlatılıyor. Yapılmayan iş `yakinda`
 *    alanında ve sayfada "Yakında" rozetiyle duruyor. Müşteri sayısı, logo,
 *    yorum, sertifika YOK: hiçbiri elimizde değil ve uydurulmuş bir güven
 *    işareti, ilk görüşmede çürüyen bir söz.
 *  · FİYAT RAKAMI YALNIZ `fiyat.ts`TEN (kullanıcı kararı 2026-10-14). Bu
 *    dosyada elle yazılmış bir dolar tutarı yok; sık sorulanlar da rakamı
 *    oradan okuyor (`site-icerik.spec.ts`).
 *  · Rapor PDF'inin kapağında ajansın değil Advetics'in logosu basılıyor
 *    (CLAUDE.md). O yüzden "kendi logonuzla PDF" YAZILMIYOR; doğru cümle
 *    "panel logonuz ve renginizle açılır, PDF markanızın rengini taşır".
 *
 * İKİ DİL (2026-10-15, docs/i18n/MIMARI.md): METİN artık
 * `dil/sozlukler/site.tr.ts` ve `site.en.ts`te, aynı yapıda; ekranlar
 * `siteIcerigi(dil)` ile okur. Burada tipler, adres yardımcıları ve site
 * haritası kalıyor. Aşağıdaki öneksiz sabitler TÜRKÇE metnin adları
 * (site haritası ve testler); ekran kodu onları kullanmaz, kullanırsa
 * İngilizce sayfada Türkçe metin çıkar.
 */

import { sec, type Dil } from '@advetics/shared';
import { siteSozlugu } from '@/dil/sozlukler/site';
import { SITE_TR, type SiteMetni } from '@/dil/sozlukler/site.tr';
import { yerelYol } from '@/lib/site-yollari';
import { DEMO_EPOSTA } from './iletisim';

export { DEMO_EPOSTA };

/** Ekranın dilindeki site metni. */
export function siteIcerigi(dil: Dil): SiteMetni {
  return sec(siteSozlugu, dil);
}

export const {
  DEMO_MAILTO,
  OZELLIKLER,
  COZUMLER,
  ENTEGRASYON_GRUPLARI,
  YAKINDA_ENTEGRASYONLAR,
  SENARYOLAR,
  GUVENLIK,
  FIYAT_SORULARI,
  MODUL_BOLUMLERI,
  BAGLANDIGI_YERLER,
  NASIL_CALISIR,
  GUVENLIK_OZETI,
  YASAL_BELGELER,
  UST_MENU,
} = SITE_TR;

export interface Madde {
  baslik: string;
  metin: string;
}

export interface Ozellik {
  /** Adres: `/ozellikler/<slug>`. */
  slug: string;
  /** Menüdeki ad ve sayfanın üst başlığı. İkisi AYNI dizeden okunuyor. */
  ad: string;
  /** Paneldeki ekranın adı. Ziyaretçi demoda aynı adı görsün. */
  panelAdi: string;
  /** Kartlarda ve menü açıklamasında görünen tek cümle. */
  kisa: string;
  baslik: string;
  ozet: string;
  faydalar: Madde[];
  adimlar: Madde[];
  /** Ürünün YAPMADIĞI şeyler, açıkça. Söylenmezse ziyaretçi varsayar. */
  sinirlar?: string[];
  yakinda?: Madde[];
}

export interface Cozum {
  /** Adres: `/cozumler/<slug>`. */
  slug: string;
  ad: string;
  kisa: string;
  baslik: string;
  ozet: string;
  maddeler: Madde[];
  /** Bu kitle için öne çıkan özellik sayfaları (OZELLIKLER içindeki slug). */
  ozellikler: string[];
  senaryo: { baslik: string; adimlar: string[] };
}

export interface Entegrasyon {
  ad: string;
  alt?: string;
  ne: string;
}

export interface GuvenlikMaddesi extends Madde {
  /** Teknik okuyucu için tek satır. Ziyaretçinin çoğu okumayacak; yine de doğru olmalı. */
  teknik: string;
}

/**
 * ═══ ANA SAYFA ═══ (onaylı taslak, `docs/site/taslak.html`)
 *
 * Sekiz modül bölümü, her biri kendi sahnesiyle ve sağ/sol dönüşümlü.
 * Üst başlık özelliğin ADIYLA başlıyor (menüdeki ad; ayrışmasın diye
 * `site-icerik.spec.ts`); "Ayrıntılar" özelliğin kendi sayfasına gidiyor.
 *
 * Taslaktan iki sapma, ikisi de ürünün bugün yaptığı şeye çekildi:
 *  · Raporlama: "PDF kurumsal kimliğinizle üretilir" → "markanızın
 *    rengiyle". PDF kapağında ajansın değil Advetics'in logosu basılıyor
 *    (CLAUDE.md); "kurumsal kimlik" logoyu da vaat ediyordu.
 *  · Planlama: "kurumsal kimlikli bir rapor" → "PDF olarak da inen bir
 *    rapor". Strateji raporunun markalı olduğu doğrulanmadı.
 */
export interface ModulBolumu {
  slug: string;
  ust: string;
  baslik: string;
  metin: string;
  maddeler: string[];
}

/** Adres yardımcıları: bağlantılar elle birleştirilmesin (CLAUDE.md, "BAĞLANTIYI ELLE BİRLEŞTİRME"). */
/**
 * Üst menüdeki bir sayfanın ETİKETİ: sayfa başlığı ve sekme başlığı bu
 * dizeden (CLAUDE.md "AYNI EKRANIN MENÜDE VE SAYFADA İKİ AYRI ADI";
 * `site-icerik.spec.ts`). Menüde olmayan adres sorulursa PATLAR: sessizce
 * boş başlık çizmek yerine.
 */
export function menuEtiketi(dil: Dil, href: string): string {
  const m = siteIcerigi(dil).UST_MENU.find((x) => x.href === href);
  if (!m) throw new Error(`UST_MENU: ${href} yok`);
  return m.etiket;
}

export const ozellikAdresi = (slug: string, dil: Dil = 'tr') => yerelYol(`/ozellikler/${slug}`, dil);
export const cozumAdresi = (slug: string, dil: Dil = 'tr') => yerelYol(`/cozumler/${slug}`, dil);

export function ozellikBul(slug: string, dil: Dil = 'tr'): Ozellik | undefined {
  return siteIcerigi(dil).OZELLIKLER.find((o) => o.slug === slug);
}

export function cozumBul(slug: string, dil: Dil = 'tr'): Cozum | undefined {
  return siteIcerigi(dil).COZUMLER.find((c) => c.slug === slug);
}

/**
 * Tanıtım sitesinin bütün sayfaları. Site haritası, middleware'in herkese
 * açık listesi ve testler bunu okuyor: yeni sayfa eklenip buraya yazılmazsa
 * `site-icerik.spec.ts` düşüyor.
 */
export const SITE_SAYFALARI: { yol: string; oncelik: number }[] = [
  { yol: '/', oncelik: 1 },
  { yol: '/ozellikler', oncelik: 0.9 },
  ...OZELLIKLER.map((o) => ({ yol: ozellikAdresi(o.slug), oncelik: 0.8 })),
  ...COZUMLER.map((c) => ({ yol: cozumAdresi(c.slug), oncelik: 0.8 })),
  { yol: '/entegrasyonlar', oncelik: 0.7 },
  { yol: '/fiyatlandirma', oncelik: 0.7 },
  { yol: '/guvenlik', oncelik: 0.6 },
  { yol: '/demo', oncelik: 0.7 },
];
