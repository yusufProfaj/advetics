import type {
  EksikleriTamamlaKapsami,
  KurulumListesiAdimi,
  KurulumListesiDurumu,
  KurulumListesiKodu,
  KurulumPlatformu,
  KurulumSayaci,
} from '@/lib/panel-adresleri';
import type { KurulumAdimKodu } from '@advetics/shared';

/**
 * ═══ KURULUM LİSTESİ — EKRANIN SAF KARARLARI ═══
 *
 * Birleştirme sözleşmede (`kurulumListesi`, `kurulumSayaci`,
 * `eksikleriTamamlaKapsami`); burada yalnız ekranın söyledikleri: rozet,
 * satırın kısa sonucu, sayaç cümlesi, düğmenin neden kapalı olduğu. Panelde
 * bileşen render eden test altyapısı yok (CLAUDE.md "REACT EFFECT'İNİN
 * İÇİNDEKİ KARAR TEST EDİLEMİYOR — DIŞARI ÇIKAR").
 */

/**
 * Durum rozeti. SÖZLÜK, dallanma değil: sözleşmeye yeni bir durum eklenince
 * derleme kırılsın. Yeşil YALNIZ durumda (kılavuz).
 */
export const LISTE_DURUMU: Record<KurulumListesiDurumu, { etiket: string; sinif: string }> = {
  tamam: { etiket: 'Tamam', sinif: 'bg-ok-soft text-ok-strong' },
  hata: { etiket: 'Hata', sinif: 'bg-danger-soft text-danger-strong' },
  soru: { etiket: 'Cevap bekliyor', sinif: 'bg-brand-soft text-brand-strong' },
  eksik: { etiket: 'Eksik', sinif: 'bg-warn-soft text-warn-strong' },
  kullanicida: { etiket: 'Sizde', sinif: 'bg-info-soft text-info-strong' },
  bilinmiyor: { etiket: 'Okunamadı', sinif: 'bg-surface-sunken text-ink-muted' },
  bekliyor: { etiket: 'Bekliyor', sinif: 'bg-surface-sunken text-ink-muted' },
  kullanilmiyor: { etiket: 'Kullanılmıyor', sinif: 'bg-surface-sunken text-ink-muted' },
  // Kurulum sihirbazı sözleşmesi (2026-10-13): beyanla kapanan parça/adım. Görünüş Ajan 3'ün.
  kapsam_disi: { etiket: 'Kapsam dışı', sinif: 'bg-surface-sunken text-ink-muted' },
};

/** Parça kodunun ekrandaki adı — kurulum adımları sözleşmede, hazırlama/hazırlık burada. */
export const PARCA_ADI: Record<string, string> = {
  site: 'Site',
  marka: 'Marka bilgileri',
  olcum: 'Sitedeki ölçüm',
  piksel: 'Piksel seçimi',
  kategori: 'Özel reklam kategorisi',
  konum: 'Varsayılan konum',
  butce: 'Varsayılan günlük bütçe',
  marka_bilgisi: 'Marka alanları',
  logo: 'Logo',
  // Sihirbazın hazırlık maddeleri (HAZIRLIK_KODLARI sonundaki altı madde).
  site_adresi: 'Web sitesi',
  iletisim: 'İletişim kişisi ve telefon',
  rapor_alicisi: 'Rapor alıcıları',
  adres: 'Adres ve harita konumu',
  bildirim: 'Bildirim kanalı',
  erisim: 'Sorumlu kişi',
  veri_akisi: 'Veri akışı',
};

/**
 * SATIRIN KISA SONUCU — kapalı satırda tek cümle.
 *
 * Bitmemiş adımda İLK BİTMEMİŞ parçanın nedeni yazar: kullanıcı satırı
 * açmadan neyin eksik olduğunu görmeli. "Eksik" tek başına bir şey
 * söylemiyor. Tamam adımda parçaların kısa sonuçları (hesap adı, piksel
 * kimliği) — boş başlıklar atlanıyor.
 */
export function adimOzeti(a: KurulumListesiAdimi): string {
  if (a.durum === 'kullanilmiyor') return 'Bu platformu kullanmadığını söyledin; sayaca girmiyor.';
  if (a.durum === 'kapsam_disi') return 'Kapsam dışı bırakıldı; sayaca girmiyor.';
  if (a.durum === 'tamam') {
    // AYNI BAŞLIK TEKRARLANMAZ: iki platform da ajansın bağlantısıysa "Ajansın bağlantısı · Ajansın bağlantısı" yazıyordu.
    const basliklar = [...new Set(a.parcalar.map((p) => p.baslik).filter((b): b is string => !!b))];
    return basliklar.length > 0 ? basliklar.join(' · ') : 'Tamam.';
  }
  const ilk = a.parcalar.find((p) => p.durum !== 'tamam');
  if (!ilk) return 'Tamam.';
  return ilk.baslik ? `${ilk.baslik}: ${ilk.neden}` : ilk.neden;
}

/**
 * SAYAÇ CÜMLESİ ("5 / 7 adım tamam · 1 okunamadı"). Okunamayan adım AYRI
 * yazılır: sayacın eksik görünmesinin sebebi "yapılacak iş" değil "bilgi
 * yok" olabilir ve ikisinin yapılacak işi farklı.
 */
export function sayacMetni(s: KurulumSayaci): string {
  if (s.toplam === 0) return 'Sayılacak adım yok';
  const temel = s.bitti ? `${s.toplam} / ${s.toplam} adım tamam` : `${s.tamam} / ${s.toplam} adım tamam`;
  const ekler = [s.kapsamDisi > 0 ? `${s.kapsamDisi} kapsam dışı` : null, s.bilinmiyor > 0 ? `${s.bilinmiyor} okunamadı` : null].filter(Boolean);
  return ekler.length > 0 ? `${temel} · ${ekler.join(' · ')}` : temel;
}

/** İç menü rozeti: kısa ve aynı fonksiyondan (`kurulumSayaci`). */
export function rozetMetni(s: KurulumSayaci): { metin: string; ton: 'tamam' | 'eksik' | 'notr' } {
  if (s.toplam === 0) return { metin: '—', ton: 'notr' };
  if (s.bitti) return { metin: `${s.tamam} / ${s.toplam}`, ton: 'tamam' };
  return { metin: `${s.tamam} / ${s.toplam}`, ton: s.bilinmiyor > 0 && s.tamam + s.bilinmiyor === s.toplam ? 'notr' : 'eksik' };
}

/**
 * "EKSİKLERİ TAMAMLA" NEDEN KAPALI. Pasif düğmenin sebebi yazılı olmalı:
 * sebepsiz gri düğme "bozuk" diye okunur.
 */
export function dugmeNedeni(k: EksikleriTamamlaKapsami, yazabilir: boolean): string | null {
  if (!yazabilir) return 'Kurulumu değiştirme yetkin yok.';
  if (k.yapacakVar) return null;
  return k.kullaniciyaKalan.length > 0
    ? 'Sistemin kendi yapabileceği eksik yok; kalan adımlar aşağıda nedeniyle yazıyor.'
    : 'Sistemin kendi yapabileceği eksik yok.';
}

/**
 * Bir adımda hangi kurulum adımları SATIR olarak çizilecek (parçaların
 * kurulum kaynaklı olanları, sırasıyla). Kullanılmayan platformun parçası
 * zaten parça listesinden düşmüş geliyor.
 */
export function kurulumParcalari(a: KurulumListesiAdimi): KurulumAdimKodu[] {
  return a.parcalar.filter((p) => p.kaynak === 'kurulum').map((p) => p.kod as KurulumAdimKodu);
}

/**
 * HESAP SEÇEN / AÇAN adımlar. Bunların eylemi `kurulum.hesap` kapısı
 * istiyor (havuz atamasıyla aynı, MIMARI Ç-20); `kurulum.yaz` yetmez.
 */
export const HESAP_ADIMLARI: ReadonlySet<KurulumAdimKodu> = new Set(['meta_hesap', 'google_hesap', 'sayfa']);

/**
 * KULLANILMAYAN PLATFORM BEYANI: tıklanan platformun yeni listesi. En çok
 * bir platform kapatılabilir (sözleşme şeması); ikincisi istenirse null —
 * düğme kapalı ve nedeni yazıyor ("ikisi birden kapalıysa arşivle").
 */
export function beyanDegistir(
  mevcut: readonly KurulumPlatformu[],
  platform: KurulumPlatformu,
): KurulumPlatformu[] | null {
  if (mevcut.includes(platform)) return mevcut.filter((p) => p !== platform);
  if (mevcut.length >= 1) return null;
  return [...mevcut, platform];
}

/** Adımın birincil eylemi açılır panel mi, başka bölüme bağlantı mı. */
export function adimEylemi(kod: KurulumListesiKodu): 'ac' | 'marka' {
  return kod === 'marka' ? 'marka' : 'ac';
}
