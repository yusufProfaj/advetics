/**
 * ADVCAMPAIGN SOHBETİ — EKRAN HÂLİ (TASARIM-PLAN § 1.5).
 *
 * Panelde bileşen render eden test altyapısı yok; ekranın "şu an ne
 * gösteriyorum" kararı buraya, saf bir fonksiyona çıkarıldı. Bu projede
 * hataların çoğu sessizdi ve sessizliğin en sık biçimi şuydu: "okunuyor",
 * "okunamadı", "sonuç yok" ve "bağlantı koptu" AYNI boş alana düşüyordu.
 * Her hâlin kendi cümlesi ve eylemi var; `HAL_METNI` `satisfies Record`
 * olduğu için yeni bir hâl metinsiz eklenemez (derleme kırılır).
 *
 * Öncelik sırası bilinçli: yetki ve hazırlık hataları sohbetin önünde
 * (o hâlde gönderilen mesaj zaten düşer), kota modelden önce (sıfır maliyetli
 * ret), akış hâlleri son mesajdan önce (yarım kalmış bir akış "tamam"
 * görünmemeli).
 */

export const SOHBET_HALLERI = [
  'hazirlik_okunuyor',
  'hazirlik_okunamadi',
  'yetki_yok_yazma',
  'eksik_baglanti',
  'kota_doldu',
  'akis_koptu',
  'model_dusunuyor',
  'model_yaziyor',
  'model_reddetti',
  'model_kesildi',
  'model_ulasilamadi',
  'soru_bekliyor',
  'bos_oturum',
  'hazir',
] as const;

export type SohbetHali = (typeof SOHBET_HALLERI)[number];

export type MesajDurumu = 'akista' | 'tamam' | 'kesildi' | 'ret' | 'hata';

export interface SohbetHaliGirdisi {
  hazirlik: 'okunuyor' | 'okunamadi' | 'hazir';
  yazmaYetkisi: boolean;
  /** Meta hesabı ya da sayfası yoksa hangisi eksik. */
  eksikBaglanti: 'hesap' | 'sayfa' | null;
  kota: KotaDurumu;
  /** İstemcinin akış bağlantısı. */
  akis: 'yok' | 'bagli' | 'koptu';
  mesajSayisi: number;
  sonAsistanMesaji: null | {
    durum: MesajDurumu;
    /** Akışta metin parçası geldi mi (düşünüyor ↔ yazıyor ayrımı). */
    metinGeldi: boolean;
    /** Son tur bir soru ile bitti mi. */
    soruVar: boolean;
  };
}

export type KotaDurumu = { tur: 'serbest' } | { tur: 'doldu'; sebep: 'saatlik_mesaj' | 'gunluk_token' | 'oturum_mesaj'; yenilenme: string | null };

export function sohbetHali(g: SohbetHaliGirdisi): SohbetHali {
  if (!g.yazmaYetkisi) return 'yetki_yok_yazma';
  if (g.hazirlik === 'okunuyor') return 'hazirlik_okunuyor';
  if (g.hazirlik === 'okunamadi') return 'hazirlik_okunamadi';
  if (g.eksikBaglanti) return 'eksik_baglanti';
  const m = g.sonAsistanMesaji;
  // Akış kopmuşsa ve mesaj hâlâ "akışta" ise sunucu yazmaya devam ediyor
  // olabilir; bunu "tamam" ya da "hata" diye göstermek yalan olur.
  if (g.akis === 'koptu' && m?.durum === 'akista') return 'akis_koptu';
  if (m?.durum === 'akista') return m.metinGeldi ? 'model_yaziyor' : 'model_dusunuyor';
  // Kota akış bittikten SONRA: yazmakta olan cevap kotadan dolayı kesilmez.
  if (g.kota.tur === 'doldu') return 'kota_doldu';
  if (m?.durum === 'ret') return 'model_reddetti';
  if (m?.durum === 'kesildi') return 'model_kesildi';
  if (m?.durum === 'hata') return 'model_ulasilamadi';
  if (m?.soruVar) return 'soru_bekliyor';
  if (g.mesajSayisi === 0) return 'bos_oturum';
  return 'hazir';
}

/** Her hâlin ekran cümlesi ve eylemi. Metin panel dilinde: kısa, uzun tire yok. */
export const HAL_METNI = {
  hazirlik_okunuyor: { metin: 'Workspace okunuyor.', eylem: null },
  hazirlik_okunamadi: { metin: 'Workspace bilgisi okunamadı.', eylem: 'Yeniden dene' },
  yetki_yok_yazma: { metin: 'Reklam oluşturma yetkin yok. Workspace yöneticine danış.', eylem: null },
  eksik_baglanti: { metin: 'Bu workspace’te reklam kurmak için bir bağlantı eksik.', eylem: 'Bağlantılara git' },
  kota_doldu: { metin: 'Asistanın bugünkü sınırı doldu. Taslağı panelden bitirebilirsin.', eylem: 'Paneli aç' },
  akis_koptu: { metin: 'Bağlantı koptu. Sunucu cevabı yazmaya devam ediyor olabilir; durumu soruyorum.', eylem: null },
  model_dusunuyor: { metin: 'Düşünüyor', eylem: 'Durdur' },
  model_yaziyor: { metin: 'Yazıyor', eylem: 'Durdur' },
  model_reddetti: { metin: 'Asistan bu isteği yapamadı. Taslağı panelden kurabilirsin.', eylem: 'Paneli aç' },
  model_kesildi: { metin: 'Cevap yarıda kesildi.', eylem: 'Devam et' },
  model_ulasilamadi: { metin: 'Asistana ulaşılamadı. Panel çalışıyor.', eylem: 'Yeniden dene' },
  soru_bekliyor: { metin: 'Cevabını bekliyorum.', eylem: null },
  bos_oturum: { metin: 'Görselini ya da videonu bırak, ne istediğini tek cümleyle yaz.', eylem: null },
  hazir: { metin: '', eylem: null },
} as const satisfies Record<SohbetHali, { metin: string; eylem: string | null }>;
