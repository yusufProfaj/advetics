/**
 * ═══ UYUM DENETÇİSİ — SÖZLEŞME (Ç-4: Tur 1'in İLK işi) ═══
 *
 * Kural içeriği (katalog) burada YOK: `docs/meta-reklam-brief/tasarim/
 * TASARIM.md` §10 tarifi ve `packages/shared/src/uyum/katalog/` altında Ajan
 * 2'nin yazacağı veri (MIMARI.md §5.1). Burada yalnız TİPLER ve KAPI var:
 * denetçinin çıktısının plan onayını nasıl kapattığı.
 *
 * EN ÖNEMLİ KURAL: KATALOG YOKSA "GEÇTİ" YOK. Boş bir bulgu listesi iki şey
 * demek olabilir — "denetlendi, sorun yok" ve "denetlenmedi". İkisi aynı
 * boş diziye çevrilirse uyum denetçisi yazılmadan gerçek yayın açılır. O
 * yüzden denetimin kendisi (`UyumDenetimi | null`) ayrı taşınır; `null` =
 * `bagli_degil` = test kipi.
 */
export const UYUM_SEVIYELERI = ['ENGEL', 'UYARI', 'BILGI'] as const;
export type UyumSeviyesi = (typeof UYUM_SEVIYELERI)[number];

export interface UyumBulgusu {
  /** `KNT-02` biçimi; bir kez verilir, yeniden kullanılmaz. */
  kuralKimligi: string;
  seviye: UyumSeviyesi;
  /** `bilinmiyor`: kanıt yok (sektör seçilmemiş). ENGEL'de bilinmiyor = kaldı (T-45). */
  durum: 'kaldi' | 'bilinmiyor';
  /** Plan satırı anahtarı ya da `plan`. */
  yer: string;
  mesaj: string;
  neYapmali: string;
  kimCozer: 'kullanici' | 'ajans' | 'sayfa_yoneticisi' | 'katalog';
  dayanak: string;
}

export interface UyumDenetimi {
  /** `2026.10.1` biçimi. Rapor bu sürümle okunur, değişmez. */
  katalogSurumu: string;
  /** Hangi plan sürümünün içerik özeti denetlendi. */
  icerikOzeti: string;
  zaman: string;
  bulgular: UyumBulgusu[];
}

/** UYARI'yı yalnız AJANS kullanıcısı işaretler ("Okudum, sorumluluk bende"); müşteri ve yapay zekâ asla. */
export interface UyumIsareti {
  kuralKimligi: string;
  /** İşaretlendiği andaki mesaj; metin değişirse işaret düşer (TASARIM §10.2 kural 2). */
  mesaj: string;
  userId: string;
  zaman: string;
}

export type UyumDurumu = 'bagli_degil' | 'gecti' | 'uyari_isaret_bekliyor' | 'engel' | 'bayat';

/**
 * Plan onayının uyum yüzü. Sıra önemli: ENGEL (kimse aşamaz) → bayat
 * (denetlenen sürüm bu sürüm değil) → işaretsiz UYARI → geçti.
 */
export function uyumDurumu(
  denetim: UyumDenetimi | null,
  isaretler: readonly UyumIsareti[],
  guncelIcerikOzeti: string,
): UyumDurumu {
  if (denetim === null) return 'bagli_degil';
  if (denetim.bulgular.some((b) => b.seviye === 'ENGEL')) return 'engel';
  if (denetim.icerikOzeti !== guncelIcerikOzeti) return 'bayat';
  const isaretsiz = denetim.bulgular.filter(
    (b) => b.seviye === 'UYARI' && !isaretler.some((i) => i.kuralKimligi === b.kuralKimligi && i.mesaj === b.mesaj),
  );
  return isaretsiz.length > 0 ? 'uyari_isaret_bekliyor' : 'gecti';
}

/** Bulgu sırası belirlenimci: ENGEL → UYARI → BİLGİ, sonra kural kimliği. */
export function bulgulariSirala(b: readonly UyumBulgusu[]): UyumBulgusu[] {
  const s: Record<UyumSeviyesi, number> = { ENGEL: 0, UYARI: 1, BILGI: 2 };
  return [...b].sort((x, y) => s[x.seviye] - s[y.seviye] || x.kuralKimligi.localeCompare(y.kuralKimligi) || x.yer.localeCompare(y.yer));
}
