/**
 * ═══ SİNYAL DURUM MAKİNESİ (Paket A, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Gerekçeler `docs/sinyal/MIMARI.md` § 4. Geçiş kararı SAF ve burada: API
 * (hesaplama işi, kapat/geri aç uçları) ve testler aynı tablodan okuyor.
 * İki yerde ayrı yazılan bir geçiş kuralı ilk eklemede ayrışır.
 *
 * ÜÇ DURUM, İKİSİ "KAPALI". Gerçek anlamda SON durum YOK: kapalı bir sinyal
 * aynı varlıkta yeniden görülürse açılabiliyor (Orphex deseni "kötüleşirse
 * geri açılır"). Kapalı durumları sayan her yer `SINYAL_KAPALI_DURUMLARI`
 * listesini okumalı; "acik değilse kapalı" diye türetmek, ileride eklenecek
 * dördüncü bir durumu sessizce kapalı sayar (CLAUDE.md "bir durum enum'ından
 * ikisini saymak").
 */

export const SINYAL_DURUMLARI = ['acik', 'kapatildi', 'kendiliginden_kapandi'] as const;
export type SinyalDurumu = (typeof SINYAL_DURUMLARI)[number];

/** Panelde "kapalı" sekmesine düşen, bildirim üretmeyen durumlar. */
export const SINYAL_KAPALI_DURUMLARI: readonly SinyalDurumu[] = ['kapatildi', 'kendiliginden_kapandi'];

export const SINYAL_DURUM_ADI: Record<SinyalDurumu, string> = {
  acik: 'Açık',
  kapatildi: 'Kapatıldı',
  kendiliginden_kapandi: 'Kendiliğinden kapandı',
};

/**
 * Geçişi tetikleyen olaylar ve KİMİN yazdığı (kısmi indeks/son durum dersi:
 * her durumdan çıkışı yazan bir kod yolu olmalı).
 *
 * - `gozlendi` (iş): koşul bu değerlendirmede yine tuttu.
 * - `kotulesti` (iş): koşul tuttu VE sapma kapatma anındakinin
 *   `ANOMALI.kotulesmeKatsayisi` katını geçti (`kotulestiMi`).
 * - `sure_doldu` (iş): koşul `KENDILIGINDEN_KAPANMA_GUN` boyunca görülmedi.
 * - `kullanici_kapatti` (kullanıcı, `rule.write`).
 * - `uygulandi` (kullanıcı, `budget.write`): sinyalin "Uygula"sı platformda
 *   geri okumayla doğrulandı.
 * - `kullanici_geri_acti` (kullanıcı, `rule.write`): yanlışlıkla kapatılanı geri al.
 */
export const SINYAL_OLAYLARI = [
  'gozlendi',
  'kotulesti',
  'sure_doldu',
  'kullanici_kapatti',
  'uygulandi',
  'kullanici_geri_acti',
] as const;
export type SinyalOlayi = (typeof SINYAL_OLAYLARI)[number];

/**
 * Geçiş tablosu. `undefined` = olay o durumda anlamsız (çağıran hata
 * fırlatmaz, satıra dokunmaz; kullanıcı ucunda 409 döner).
 *
 * KRİTİK SATIR `kapatildi + sure_doldu → kendiliginden_kapandi`.
 * Orphex taslağında kapatılan sinyal yalnız "kötüleşirse" açılıyordu. Bunu
 * tek başına uygulamak KALICI SESSİZLİK üretir: kullanıcı Mart'ta %40'lık
 * bir harcama sıçramasını kapatır, Ekim'de aynı kampanyada %35'lik yeni bir
 * sıçrama olur ve "Mart'takinden kötü değil" diye HİÇ açılmaz. Kapatmanın
 * referans sapması yalnız O OLAY sürerken geçerli; olay bitince (koşul
 * görülmeyince) satır olayı kapatır ve bir sonraki gözlem YENİ bir olaydır.
 * `kapatildi + gozlendi` ise sessizce kapalı kalır: kullanıcı bu olayı
 * bilerek kapattı ve her gün yeniden açmak onu kapatmanın anlamını yok eder.
 */
export const SINYAL_GECISLERI: Record<SinyalDurumu, Partial<Record<SinyalOlayi, SinyalDurumu>>> = {
  acik: {
    gozlendi: 'acik',
    kotulesti: 'acik',
    sure_doldu: 'kendiliginden_kapandi',
    kullanici_kapatti: 'kapatildi',
    uygulandi: 'kapatildi',
  },
  kapatildi: {
    gozlendi: 'kapatildi',
    kotulesti: 'acik',
    sure_doldu: 'kendiliginden_kapandi',
    kullanici_geri_acti: 'acik',
  },
  kendiliginden_kapandi: {
    gozlendi: 'acik',
    kotulesti: 'acik',
  },
};

/** Geçişin hedefi; olay bu durumda anlamsızsa `null`. */
export function sinyalGecisi(durum: SinyalDurumu, olay: SinyalOlayi): SinyalDurumu | null {
  return SINYAL_GECISLERI[durum][olay] ?? null;
}

/**
 * Kapatma nedeni — ekranda "kim, neden kapattı" sorusunun cevabı. Sinyal
 * hem kullanıcı kararıyla hem Uygula ile `kapatildi`ya geçebiliyor ve ikisi
 * ayrı bilgi: biri "gördüm, önemsiz", diğeri "gördüm, durdurdum".
 */
export const SINYAL_KAPATMA_NEDENLERI = ['kullanici', 'uygulandi', 'sure_doldu'] as const;
export type SinyalKapatmaNedeni = (typeof SINYAL_KAPATMA_NEDENLERI)[number];

/** Olay → kapatma nedeni (yalnız kapalı bir duruma götüren olaylar). */
export function kapatmaNedeni(olay: SinyalOlayi): SinyalKapatmaNedeni | null {
  if (olay === 'kullanici_kapatti') return 'kullanici';
  if (olay === 'uygulandi') return 'uygulandi';
  if (olay === 'sure_doldu') return 'sure_doldu';
  return null;
}

/**
 * Bu geçiş bir bildirim olayı mı? Yalnız KAPALIDAN AÇIĞA geçiş ve ilk
 * açılış bildirilir. `acik → acik` (her gün yeniden gözlem) bildirilseydi
 * aynı sinyal her sabah kanala düşer ve kanal bir hafta içinde susturulur.
 */
export function bildirilirMi(onceki: SinyalDurumu | null, sonraki: SinyalDurumu): boolean {
  if (sonraki !== 'acik') return false;
  return onceki === null || SINYAL_KAPALI_DURUMLARI.includes(onceki);
}

// ─── Teslim (gönderim) durum makinesi ───────────────────────────────────────

/**
 * Kanala gönderim kaydı. `bildirim_gonderimleri` satırı bir NİYET kaydı;
 * gerçek teslim platformun cevabı. Satır `bekliyor`da sonsuza kadar kalamaz
 * (CLAUDE.md "sync_jobs satırı niyet, kuyruk gerçek" dersi): her deneme
 * sonucu yazılır, `TESLIM_EN_FAZLA_DENEME` dolunca `vazgecildi`.
 *
 * SON durumlar `gonderildi` ve `vazgecildi`. Teslim sayan her yer ikisini
 * birlikte saymalı; yalnız `gonderildi` sayan bir ilerleme hiç bitmez.
 */
export const TESLIM_DURUMLARI = ['bekliyor', 'gonderildi', 'basarisiz', 'vazgecildi'] as const;
export type TeslimDurumu = (typeof TESLIM_DURUMLARI)[number];
export const TESLIM_SON_DURUMLARI: readonly TeslimDurumu[] = ['gonderildi', 'vazgecildi'];

/** Geçici hatada toplam deneme sayısı (ilk deneme dahil). */
export const TESLIM_EN_FAZLA_DENEME = 4;
/** Denemeler arası bekleme (dakika): 5, 30, 120. */
export const TESLIM_BEKLEME_DK: readonly number[] = [5, 30, 120];

export type TeslimSonucu = 'basarili' | 'gecici_hata' | 'kalici_hata';

/**
 * HTTP cevabından sonuç sınıfı. 2xx başarılı; 408/429/5xx ve ağ hatası
 * (`null`) geçici; kalan 4xx kalıcı (Slack 404 `no_service`, 410
 * `channel_is_archived`: webhook silinmiş, yeniden denemek boşuna).
 *
 * "200 DÖNDÜ" TESLİM KANITIDIR AMA DOĞRULAMA DEĞİLDİR: Slack mesajı kabul
 * edip başka bir kanala düşürebilir. Kanalın gerçekten çalıştığını
 * kullanıcı "Deneme mesajı geldi mi?" sorusuyla doğrular (`dogrulandi`).
 */
export function teslimSonucu(httpDurum: number | null): TeslimSonucu {
  if (httpDurum === null) return 'gecici_hata';
  if (httpDurum >= 200 && httpDurum < 300) return 'basarili';
  if (httpDurum === 408 || httpDurum === 429 || httpDurum >= 500) return 'gecici_hata';
  return 'kalici_hata';
}

/** Bir denemenin ardından satırın yeni durumu. `deneme` = yapılmış deneme sayısı (≥1). */
export function teslimSonrakiDurum(sonuc: TeslimSonucu, deneme: number): TeslimDurumu {
  if (sonuc === 'basarili') return 'gonderildi';
  if (sonuc === 'kalici_hata') return 'vazgecildi';
  return deneme >= TESLIM_EN_FAZLA_DENEME ? 'vazgecildi' : 'basarisiz';
}
