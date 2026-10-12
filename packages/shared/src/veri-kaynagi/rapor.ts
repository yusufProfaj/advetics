import { PLATFORM_KISA_ADLARI } from '../constants/platforms';
import { formatNumber } from '../format';
import { ESLENEMEDI_NEDEN_METNI, type EslenemediNedeni } from './esleme';
import { TAKIP_ETIKET_METNI, type TakipAcigiSatiri, type TakipAcigiYaniti } from './takip-acigi';

/**
 * ═══ "SİTE VE DÖNÜŞÜM" BÖLÜMÜ — EKRAN VE PDF İÇİN TEK TANIM (Ajan 2/3 eki) ═══
 *
 * Panel (`report-document.tsx`, Raporlar) ve PDF (`rapor-pdf.service.ts`)
 * aynı sütunları, aynı boş cümleyi ve aynı çizim kararını BURADAN okuyor.
 * İki ayrı yazılsaydı ekran ile müşteriye giden belge ayrışırdı ve fark
 * yalnız ALICI tarafından görülürdü (CLAUDE.md "AYNI GÖRSEL ÖĞE İKİ KEZ
 * ÇİZİLİYORSA ÜÇÜNCÜSÜNDE AYRIŞIR", "TABLO BAŞLIĞI ... TEK LİSTEDEN").
 * Toplanamayan "kullanıcı" sütunu YOK (MIMARI § 3.5).
 */

export interface SiteDonusumSutunu {
  baslik: string;
  /** Sağa yaslı sayı sütunu mu. */
  sag: boolean;
  /** Tablo payı (PDF genişliği). */
  pay: number;
  deger: (r: TakipAcigiSatiri) => string;
  /** Toplam satırı; toplanamıyorsa `null`. */
  toplam: ((s: readonly TakipAcigiSatiri[]) => string) | null;
}

const topla = (s: readonly TakipAcigiSatiri[], f: (r: TakipAcigiSatiri) => number) => s.reduce((a, r) => a + f(r), 0);
const oranMetni = (o: number | null) => (o === null ? '-' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(o));

export const SITE_DONUSUM_SUTUNLARI: readonly SiteDonusumSutunu[] = [
  { baslik: 'Kampanya', sag: false, pay: 28, deger: (r) => `${r.kampanyaAdi} (${PLATFORM_KISA_ADLARI[r.platform]})`, toplam: () => 'Toplam' },
  { baslik: 'Tıklama', sag: true, pay: 12, deger: (r) => formatNumber(r.platformTiklama), toplam: (s) => formatNumber(topla(s, (r) => r.platformTiklama)) },
  { baslik: 'Platform dönüşümü', sag: true, pay: 14, deger: (r) => formatNumber(r.platformDonusum), toplam: (s) => formatNumber(topla(s, (r) => r.platformDonusum)) },
  { baslik: 'Sitede görülen', sag: true, pay: 13, deger: (r) => formatNumber(r.siteDonusum), toplam: (s) => formatNumber(topla(s, (r) => r.siteDonusum)) },
  {
    baslik: 'Site / platform',
    sag: true,
    pay: 11,
    deger: (r) => oranMetni(r.oran),
    toplam: (s) => {
      const p = topla(s, (r) => r.platformDonusum);
      return oranMetni(p > 0 ? topla(s, (r) => r.siteDonusum) / p : null);
    },
  },
  { baslik: 'Durum', sag: false, pay: 22, deger: (r) => TAKIP_ETIKET_METNI[r.etiket], toplam: null },
];

/**
 * GA4 bağlı değilse bölüm ÇİZİLMEZ (kitle bölümüyle aynı karar: platform
 * sunmuyorsa sayfa açılmıyor). "Analytics bağlı değil" müşteriye giden
 * belgede bir bilgi değil, ajansın kurulum işi; o Marka Merkezi'nde yazar.
 */
export function siteDonusumuCizilir(v: TakipAcigiYaniti | null): v is TakipAcigiYaniti {
  // İZİN EKSİK de çizilmez (Ajan 4, N): "bağlantının izni yenilenmeli" ajansın
  // işi, müşteriye giden belgenin cümlesi değil. Panelde (Marka Merkezi kartı,
  // Reklam Yöneticisi "Sitede" notu) ajansa söyleniyor.
  return v !== null && v.emptyReason !== 'kaynak_yok' && v.emptyReason !== 'izin_eksik';
}

/** Boş tablonun NEDENİ, müşteriye giden dille. */
export function siteDonusumuBosSebebi(v: TakipAcigiYaniti): string {
  switch (v.emptyReason) {
    case 'izin_eksik':
      return 'Analytics verisine erişilemiyor; bağlantının izni yenilenmeli.';
    case 'cekim_kosmadi':
      return 'Analytics verisi henüz çekilmedi.';
    case 'veri_yok':
      return 'Bu dönemde sitede reklamdan gelen anahtar etkinlik görülmedi.';
    default:
      return 'Bu dönemde kıyaslanacak kampanya yok.';
  }
}

/** Dipnotlar: eşlenemeyen pay ve nedenleri, uyarılar, kalite. Sessiz kesme yok. */
export function siteDonusumuDipnotlari(v: TakipAcigiYaniti): string[] {
  const n: string[] = [];
  if (v.eslenemeyen.pay !== null && v.eslenemeyen.anahtarEtkinlik > 0) {
    const nedenler = (Object.entries(v.eslenemeyen.nedenler) as Array<[EslenemediNedeni, number]>)
      .filter(([, x]) => x > 0)
      .map(([k, x]) => `${ESLENEMEDI_NEDEN_METNI[k].toLocaleLowerCase('tr-TR')} ${formatNumber(x)}`);
    n.push(
      `Kampanyaya bağlanamayan ${formatNumber(v.eslenemeyen.anahtarEtkinlik)} etkinlik (ücretli trafiğin %${Math.round(v.eslenemeyen.pay * 100)}'i)` +
        (nedenler.length ? `: ${nedenler.join(' · ')}.` : '.'),
    );
  }
  n.push('Sayılar hiçbir zaman birebir tutmaz: platform görüntüleme sonrası dönüşümü de sayar. Durum yalnız fark büyükse ve yeterli veri varsa işaretlenir.');
  n.push(...v.uyarilar);
  if (v.kalite.digerSatiri) n.push('Analytics bazı kampanyaları "(other)" satırında topladı; o satırlar eşlenemedi.');
  if (v.kalite.esiklendi) n.push('Analytics bu dönemde bazı satırları gizledi (Google signals eşiği).');
  if (v.kalite.ornekleme) n.push('Analytics bu dönemde örneklenmiş veri döndürdü.');
  return n;
}
