import { ETKI, type EtkiHukmu, type EtkiNedeni, type EtkiSonucu } from './yontem';

/**
 * ═══ ETKİ DURUM MAKİNESİ (Paket C, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Gerekçe `docs/etki/MIMARI.md` § 4. Geçiş kararı SAF ve burada: hesaplama
 * işi ve testler aynı fonksiyonu çağırıyor.
 *
 * KISMİ İNDEKS + SON DURUM DERSİ (CLAUDE.md, boosts): iş yalnız açık
 * satırları tarıyor (`durum IN ('bekliyor','olcumde')`). Her açık durumdan
 * bir SON duruma giden yol olmak zorunda; yoksa satır sonsuza kadar
 * taranır ve ekranda sonsuza kadar "ölçülüyor" yazar. Burada bunu ölçüm
 * noktalarının SONLU olması garanti ediyor: son noktada `henuz_belli_degil`
 * üretilemez, `belirsiz` üretilir (`etkiHukmu`, `sonNokta`). Testte kilitli.
 *
 * SON DURUMLARI SAYAN her yer `ETKI_SON_DURUMLARI`nı okur: yalnız
 * `sonuclandi` sayan bir "ölçülen değişiklik" sayacı, ölçülemeyenleri
 * sonsuza kadar "bekleyen" gösterirdi.
 */
export const ETKI_DURUMLARI = ['bekliyor', 'olcumde', 'sonuclandi', 'olculemedi'] as const;
export type EtkiDurumu = (typeof ETKI_DURUMLARI)[number];
export const ETKI_ACIK_DURUMLARI: readonly EtkiDurumu[] = ['bekliyor', 'olcumde'];
export const ETKI_SON_DURUMLARI: readonly EtkiDurumu[] = ['sonuclandi', 'olculemedi'];

export const ETKI_DURUM_ADI: Record<EtkiDurumu, string> = {
  bekliyor: 'Ölçüm bekleniyor',
  olcumde: 'Henüz belli değil',
  sonuclandi: 'Sonuçlandı',
  olculemedi: 'Ölçülemedi',
};

/**
 * Ölçüme başlamadan verilen kararlar (hüküm hesaplanmaz). Sıra önemli:
 * `dogrulanmadi` en önce (değişikliğin olduğunu bile bilmiyoruz),
 * `hesap_tasindi` sonra (veri artık bu workspace'in değil), `karisik` en
 * son (ötekiler doğruysa karışıklık sorusu anlamsız).
 */
export type OnKosulNedeni = Extract<EtkiNedeni, 'dogrulanmadi' | 'hesap_tasindi' | 'veri_yok' | 'karisik'>;

export interface OnKosullar {
  dogrulandi: boolean;
  hesapTasindi: boolean;
  /** Kapsamın sonrası penceresinde HİÇ `insights_daily` satırı yok. */
  veriYok: boolean;
  karisik: boolean;
}

export function onKosulNedeni(k: OnKosullar): OnKosulNedeni | null {
  if (!k.dogrulandi) return 'dogrulanmadi';
  if (k.hesapTasindi) return 'hesap_tasindi';
  if (k.veriYok) return 'veri_yok';
  if (k.karisik) return 'karisik';
  return null;
}

/** Bir değerlendirmenin sonucu: yeni durum ve (varsa) sonraki ölçüm noktası. */
export interface EtkiGecisi {
  durum: EtkiDurumu;
  /** `olcumde` ise sonraki nokta (gün); son durumlarda `null`. */
  sonrakiNoktaGun: number | null;
  /**
   * Satıra YAZILACAK sonuç. Hükümden farklı olabilir: son noktada gelen
   * `henuz_belli_degil` burada `belirsiz`e çevrilir ki kapalı bir satır
   * "henüz" demesin. `olculemedi`de `null`.
   */
  sonuc: EtkiSonucu | null;
}

/**
 * Geçiş: açık bir satır, `noktaGun` noktasında değerlendirildi.
 * - Ön koşul düştüyse → `olculemedi` (son).
 * - Hüküm `henuz_belli_degil` → `olcumde`, sonraki nokta.
 * - Diğer her hüküm (`belirsiz` dahil) → `sonuclandi` (son).
 *
 * `kontrol_grubu_yok` hükmü ÖZEL: bekleyerek düzelmez (kapsam hesap
 * seviyesinde ya da hesapta değişmeyen kampanya yok), yani ilk noktada
 * `olculemedi` olarak kapanır. Aksi hâlde 28 gün boyunca "henüz belli
 * değil" yazıp sonunda aynı cevabı verirdi.
 */
export function etkiGecisi(
  durum: EtkiDurumu,
  noktaGun: number,
  onKosul: OnKosulNedeni | null,
  hukum: EtkiHukmu | null,
): EtkiGecisi {
  if (ETKI_SON_DURUMLARI.includes(durum)) {
    throw new Error(`Kapanmış etki satırı (${durum}) yeniden değerlendirilemez: tarama sorgusu açık durumları süzmüyor.`);
  }
  if (onKosul) return { durum: 'olculemedi', sonrakiNoktaGun: null, sonuc: null };
  if (!hukum) throw new Error('Ön koşul geçti ama hüküm yok: hesaplama işi hükmü çağırmadan geçişe gelmiş.');
  if (hukum.neden === 'kontrol_grubu_yok') return { durum: 'olculemedi', sonrakiNoktaGun: null, sonuc: null };
  if (hukum.sonuc === 'henuz_belli_degil') {
    const sonraki = ETKI.olcumNoktalariGun.find((n) => n > noktaGun) ?? null;
    // Son noktada `etkiHukmu` `henuz_belli_degil` üretmez; yine de gelirse
    // satır KAPANIR (açık kalmak sonsuz tarama demek) ve `belirsiz` yazar.
    if (sonraki === null) return { durum: 'sonuclandi', sonrakiNoktaGun: null, sonuc: 'belirsiz' };
    return { durum: 'olcumde', sonrakiNoktaGun: sonraki, sonuc: 'henuz_belli_degil' };
  }
  return { durum: 'sonuclandi', sonrakiNoktaGun: null, sonuc: hukum.sonuc };
}
