import type {
  EksikleriTamamlaKapsami,
  KurulumListesiAdimi,
  KurulumListesiDurumu,
  KurulumListesiKodu,
  KurulumPlatformu,
  KurulumSayaci,
} from '@/lib/panel-adresleri';
import { sec, type Dil, type KurulumAdimKodu } from '@advetics/shared';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';

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
const LISTE_SINIFI: Record<KurulumListesiDurumu, string> = {
  tamam: 'bg-ok-soft text-ok-strong',
  hata: 'bg-danger-soft text-danger-strong',
  soru: 'bg-brand-soft text-brand-strong',
  eksik: 'bg-warn-soft text-warn-strong',
  kullanicida: 'bg-info-soft text-info-strong',
  bilinmiyor: 'bg-surface-sunken text-ink-muted',
  bekliyor: 'bg-surface-sunken text-ink-muted',
  kullanilmiyor: 'bg-surface-sunken text-ink-muted',
  // Kurulum sihirbazı sözleşmesi (2026-10-13): beyanla kapanan parça/adım. Görünüş Ajan 3'ün.
  kapsam_disi: 'bg-surface-sunken text-ink-muted',
};

/** Sözlükte anahtar `kapsamDisi` (kod `kapsam_disi`); sınıf tablosu Record: yeni durum derlemede yakalanır. */
export function listeDurumu(durum: KurulumListesiDurumu, dil: Dil = 'tr'): { etiket: string; sinif: string } {
  const e = sec(markaMerkeziKurulumSozlugu, dil).listeDurumu;
  const etiket = durum === 'kapsam_disi' ? e.kapsamDisi : e[durum];
  return { etiket, sinif: LISTE_SINIFI[durum] };
}

/** Parça kodunun ekrandaki adı; tanınmayan kod olduğu gibi (`?? kod`). */
export function parcaAdi(kod: string, dil: Dil = 'tr'): string {
  // "Site" ve "Logo" iki dilde aynı yazılıyor: sözlükte tutulursa çevrilmemiş sayılır.
  if (kod === 'site') return 'Site';
  if (kod === 'logo') return 'Logo';
  return (sec(markaMerkeziKurulumSozlugu, dil).parcaAdi as Record<string, string>)[kod] ?? kod;
}

/**
 * SATIRIN KISA SONUCU — kapalı satırda tek cümle.
 *
 * Bitmemiş adımda İLK BİTMEMİŞ parçanın nedeni yazar: kullanıcı satırı
 * açmadan neyin eksik olduğunu görmeli. "Eksik" tek başına bir şey
 * söylemiyor. Tamam adımda parçaların kısa sonuçları (hesap adı, piksel
 * kimliği) — boş başlıklar atlanıyor.
 */
export function adimOzeti(a: KurulumListesiAdimi, dil: Dil = 'tr'): string {
  const d = sec(markaMerkeziKurulumSozlugu, dil);
  if (a.durum === 'kullanilmiyor') return d.ozetKullanilmiyor;
  if (a.durum === 'kapsam_disi') return d.ozetKapsamDisi;
  if (a.durum === 'tamam') {
    // AYNI BAŞLIK TEKRARLANMAZ: iki platform da ajansın bağlantısıysa "Ajansın bağlantısı · Ajansın bağlantısı" yazıyordu.
    const basliklar = [...new Set(a.parcalar.map((p) => p.baslik).filter((b): b is string => !!b))];
    return basliklar.length > 0 ? basliklar.join(' · ') : d.ozetTamam;
  }
  const ilk = a.parcalar.find((p) => p.durum !== 'tamam');
  if (!ilk) return d.ozetTamam;
  return ilk.baslik ? `${ilk.baslik}: ${ilk.neden}` : ilk.neden;
}

/**
 * SAYAÇ CÜMLESİ ("5 / 7 adım tamam · 1 okunamadı"). Okunamayan adım AYRI
 * yazılır: sayacın eksik görünmesinin sebebi "yapılacak iş" değil "bilgi
 * yok" olabilir ve ikisinin yapılacak işi farklı.
 */
export function sayacMetni(s: KurulumSayaci, dil: Dil = 'tr'): string {
  const d = sec(markaMerkeziKurulumSozlugu, dil);
  if (s.toplam === 0) return d.sayacYok;
  const temel = d.sayacTamam(s.bitti ? s.toplam : s.tamam, s.toplam);
  const ekler = [s.kapsamDisi > 0 ? d.sayacKapsamDisi(s.kapsamDisi) : null, s.bilinmiyor > 0 ? d.sayacOkunamadi(s.bilinmiyor) : null].filter(Boolean);
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
export function dugmeNedeni(k: EksikleriTamamlaKapsami, yazabilir: boolean, dil: Dil = 'tr'): string | null {
  const d = sec(markaMerkeziKurulumSozlugu, dil);
  if (!yazabilir) return d.yetkiYok;
  if (k.yapacakVar) return null;
  return k.kullaniciyaKalan.length > 0 ? d.sistemYapamazKalanVar : d.sistemYapamaz;
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
