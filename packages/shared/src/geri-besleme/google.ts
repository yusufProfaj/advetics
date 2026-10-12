/**
 * ═══ GOOGLE ADS TARAFI: v1'DE KAPALI, SÖZLEŞME HAZIR (Paket E, MIMARI Ç-2, Ç-3, Ç-4) ═══
 *
 * NEDEN KAPALI — üç bağımsız sebep, her biri tek başına yeterli:
 *
 * 1. LEAD KAYNAĞI YOK. Bugün `leads` tablosuna kayıt YALNIZ Meta anlık
 *    formlarından geliyor (`LEAD_SOURCES`: webhook, reconcile; `manual` için
 *    uç yok). Bu kayıtlarda Google tıklama kimliği (gclid/gbraid/wbraid)
 *    YOK ve olamaz: kişi formu Meta'da doldurdu.
 *
 * 2. META LEAD'İNİ GOOGLE'A HASH'Lİ E-POSTAYLA GÖNDERMEK YANLIŞ VERİ ÜRETİR.
 *    "Enhanced conversions for leads" yalnız TIKLAMA KİMLİĞİ olmadan da
 *    çalışıyor, yani teknik olarak gider. Ama Google o kişi aynı dönemde bir
 *    Google reklamına da tıkladıysa dönüşümü KENDİNE yazar: aynı satış iki
 *    platformda birden sayılır, Google'ın teklif modeli Meta'nın getirdiği
 *    müşteriyi kendi başarısı sanıp bütçeyi yanlış yere iter. Hata yok,
 *    şişkin ROAS var. Yasak; `googleUygunluk` bunu reddediyor.
 *
 * 3. ESKİ YOL KAPANDI. Google'ın resmî belgesi (conversions/upload-offline,
 *    2026-10-12): "Starting June 15, 2026, UploadClickConversions requests
 *    will fail if the developer token hasn't previously sent requests to
 *    upload offline conversions or enhanced conversions for leads." Bizim
 *    projemiz hiç göndermedi; yol Data Manager API (`events:ingest`), o da
 *    AYRI bir OAuth izni (`datamanager`) ve Google Cloud'da ayrı bir API
 *    açılmasını istiyor.
 *
 * NE ZAMAN AÇILIR: tıklama kimliği taşıyan bir lead kaynağı geldiğinde —
 * site formu (GTM'in `gclidw` dönüşüm bağlayıcısı çerezi zaten yazıyor,
 * `kurulum/gtm.ts`) ya da Google potansiyel müşteri formu öğesi
 * (`lead_form_submission_data`, ölçülmedi). O gün aşağıdaki kurallar hazır.
 */

/** v1'de Google'a hiçbir olay gitmez. Değiştirmek MIMARI Ç-2'nin yeniden açılması demek. */
export const GOOGLE_GERI_BESLEME_ACIK = false as const;

export const DATA_MANAGER = {
  /** Resmî referans: data-manager/api/reference/rest/v1/events/ingest */
  uc: 'https://datamanager.googleapis.com/v1/events:ingest',
  scope: 'https://www.googleapis.com/auth/datamanager',
  /** "At most 2000 Event resources can be sent in a single request." */
  enFazlaOlay: 2000,
  /**
   * Kısmi başarı YOK: "if any event fails validation, the entire request
   * fails and none of the events are processed." Meta ile aynı yarılama.
   * CLAUDE.md'deki `partialFailure: false` kuralı GoogleAdsService.mutate
   * içindi; eski `UploadClickConversions`ta ise belge `partial_failure`ın
   * TRUE olmasını ŞART koşuyordu ("This field must be set to true when
   * importing conversions") — iki yol karıştırılmamalı ve bu modülde eski
   * yol hiç kullanılmıyor.
   */
  kismiBasari: false,
  partiBoyutu: 200,
} as const;

/**
 * Tıklama kimliği. Belge: "In some cases you may be able to associate both
 * a gclid and a gbraid with a conversion" ve öyleyse İKİSİ DE gönderilir.
 * `wbraid`/`gbraid` özel dönüşüm değişkeniyle birlikte KULLANILAMAZ — bu
 * modül özel değişken göndermiyor.
 */
export interface GoogleTiklamaKimligi {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
}

export function tiklamaKimligiVarMi(k: GoogleTiklamaKimligi): boolean {
  return Boolean(k.gclid?.trim() || k.gbraid?.trim() || k.wbraid?.trim());
}

export const GOOGLE_UYGUNSUZLUK_NEDENLERI = ['kapali', 'meta_lead', 'tiklama_kimligi_yok'] as const;
export type GoogleUygunsuzlukNedeni = (typeof GOOGLE_UYGUNSUZLUK_NEDENLERI)[number];

export const GOOGLE_UYGUNSUZLUK_ADI: Record<GoogleUygunsuzlukNedeni, string> = {
  kapali: 'Google’a geri bildirim bu sürümde kapalı.',
  meta_lead: 'Bu kişi formu Meta’da doldurdu; Google’a göndermek aynı satışı iki platformda saydırır.',
  tiklama_kimligi_yok: 'Kayıtta Google tıklama kimliği yok; Google bu kişiyi bir reklamla eşleştiremez.',
};

/**
 * Bir lead Google'a gidebilir mi. Sıra önemli: Meta'dan gelen lead, ileride
 * Google AÇILSA bile reddedilir (sebep 2 kalıcı).
 */
export function googleUygunluk(lead: { kaynakPlatform: 'meta' | 'google' | 'site'; tiklama: GoogleTiklamaKimligi }): GoogleUygunsuzlukNedeni | null {
  if (lead.kaynakPlatform === 'meta') return 'meta_lead';
  if (!GOOGLE_GERI_BESLEME_ACIK) return 'kapali';
  if (!tiklamaKimligiVarMi(lead.tiklama)) return 'tiklama_kimligi_yok';
  return null;
}

// -----------------------------------------------------------------------------
// Normalleştirme (hash'ten ÖNCE; hash API'de, `node:crypto` ile)
// -----------------------------------------------------------------------------

/**
 * Bu modülde v1'de kişisel veri platforma GİTMEZ (Meta yalnız `lead_id`).
 * Normalleştirme ileride Google'ın "enhanced conversions for leads" yolu
 * için ve yalnız TIKLAMA KİMLİĞİ OLAN lead'lerde ek eşleşme anahtarı olarak
 * kullanılacak. Kurallar platforma göre FARKLI ve fark sessiz: yanlış
 * normalleştirilmiş bir hash hata vermez, eşleşmeyi düşürür.
 *
 * Google (upload-offline belgesi): baştaki/sondaki boşluk at, küçük harf;
 * gmail.com ve googlemail.com'da kullanıcı adındaki NOKTALARI ve `+` sonrası
 * eki at; diğer alan adlarında yalnız boşluk + küçük harf. Telefon E.164.
 */
export function googleEpostaNormalize(ham: string): string | null {
  const e = ham.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  let kullanici = e.slice(0, at);
  const alan = e.slice(at + 1);
  if (alan === 'gmail.com' || alan === 'googlemail.com') {
    kullanici = kullanici.split('+')[0]!.replace(/\./g, '');
  }
  return kullanici ? `${kullanici}@${alan}` : null;
}

/**
 * Türkiye telefonu → E.164 (`+905321234567`). Ülke kodu ŞART: kodsuz numara
 * Meta'da da Google'da da eşleşmez ("Türkiye'deki tüm müşteriler" varsayımı
 * belgenin uyardığı hatanın ta kendisi). Tanınmayan biçim `null` — tahmin
 * etmek başka birinin numarasını hash'lemek olur.
 */
export function telefonE164(ham: string): string | null {
  const rakam = ham.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(rakam)) return rakam;
  const r = rakam.replace(/\D/g, '');
  if (/^90[5]\d{9}$/.test(r)) return `+${r}`;
  if (/^0[5]\d{9}$/.test(r)) return `+9${r}`;
  if (/^[5]\d{9}$/.test(r)) return `+90${r}`;
  return null;
}
