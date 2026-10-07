import type { GecisYazani } from './plan';
import type { Hucre, Kaynakli } from './kaynak';

/**
 * ═══ PİLOT ÖNERİ KARTI (Tur 2) ═══
 *
 * Ç-3 KAPANDI: Pilot ÖNERİR, hiçbir şeyi kendiliğinden değiştirmez. Her
 * değişiklik bir kart ve bir kişinin tek dokunuşu. `KENDILIGINDEN_UYGULAMA`
 * bu yüzden kapalı ve açılsa bile bütçe ARTIRAN bir eylemi asla kapsamaz
 * (`kendiligindenUygulanabilirMi`, Ajan 4 bunu sınar).
 *
 * KARTIN METNİNİ MODEL YAZMAZ. Neden cümlesi deterministik şablon ve
 * içindeki her sayı `olculer` listesindeki kaynaklı bir değer; model en çok
 * bir açıklama satırı ekler (o da `yzMetniDenetle` süzgecinden geçer).
 *
 * EŞİKLER ADLI SABİT. Ekrandaki cümle ("7 günde …") sabitten türer; sabit
 * değişince metin kendiliğinden güncellenir. Değerler pilot taslağındaki
 * örneklerle tutarlı ilk tahmin; Ajan 5'in ölçüm listesi (Ö-P1…Ö-P4) bunları
 * gerçek hesaplarda sınar ve yanlış alarm oranına göre ayarlar.
 */
export const ONERI_TURLERI = [
  'harcayip_donusmeyen',
  'yorulan_kreatif',
  'negatif_aday_terim',
  'butce_hizi_sapmasi',
] as const;
export type OneriTuru = (typeof ONERI_TURLERI)[number];

/** Harcayıp dönüşmeyen reklam. */
export const HARCAYIP_DONUSMEYEN = {
  /** Bakılan pencere. */
  pencereGun: 7,
  /** Reklam en az bu kadar gündür yayında olmalı (Meta öğrenme dönemi). */
  enAzYasGun: 7,
  /** Harcama, kıyas sonuç başı maliyetinin en az bu katı olmalı. */
  maliyetKati: 2,
} as const;

/** Yorulan kreatif: frekans yüksek VE tıklama oranı düşüyor. */
export const YORULAN_KREATIF = {
  pencereGun: 7,
  /** 7 günlük frekans eşiği. */
  enAzFrekansOnda: 35, // 3,5 — tam sayı (onda bir) tutuluyor, kayan nokta karşılaştırması yok
  /** Önceki 7 güne göre tıklama oranı düşüşü (yüzde). */
  enAzCtrDususuYuzde: 30,
  /** Az gösterimde oran gürültü: altında kart üretilmez. */
  enAzGosterim: 5_000,
} as const;

/** Negatif aday arama terimi (Google). */
export const NEGATIF_ADAY = {
  pencereGun: 30,
  enAzTiklama: 10,
  /** Harcama, hesabın 30 günlük sonuç başı maliyetinin en az bu katı. */
  maliyetKati: 1,
} as const;

/** Bütçe hızı sapması: ay içi harcama planın doğrusal payından sapıyor. */
export const BUTCE_HIZI = {
  /** Ayın ilk günlerinde gürültü: en az bu kadar gün geçmeden bakılmaz. */
  enAzGecenGun: 3,
  /** Sapma eşiği (yüzde). */
  sapmaYuzde: 20,
} as const;

// ─── Saf karar fonksiyonları (worker ve test aynısını koşar) ───────────────

export type KararSonucu = { kart: true } | { kart: false; neden: string };

export function harcayipDonusmeyenMi(o: {
  yasGun: number;
  harcamaMicros: bigint;
  sonuc: number;
  /** Aynı setteki diğer reklamların sonuç başı maliyeti; yoksa hesabın 90 günlüğü; o da yoksa `null`. */
  kiyasMaliyetMicros: bigint | null;
}): KararSonucu {
  if (o.sonuc > 0) return { kart: false, neden: 'sonuc_var' };
  if (o.yasGun < HARCAYIP_DONUSMEYEN.enAzYasGun) return { kart: false, neden: 'ogrenme_donemi' };
  // Kıyas yoksa "çok harcadı" denemez: eşik uydurulmaz, kart üretilmez.
  if (o.kiyasMaliyetMicros === null || o.kiyasMaliyetMicros <= 0n) return { kart: false, neden: 'kiyas_yok' };
  if (o.harcamaMicros < o.kiyasMaliyetMicros * BigInt(HARCAYIP_DONUSMEYEN.maliyetKati)) return { kart: false, neden: 'esik_alti' };
  return { kart: true };
}

export function yorulanKreatifMi(o: {
  gosterim: number;
  /** Onda bir: 41 = 4,1. */
  frekansOnda: number;
  /** Tıklama/gösterim, iki pencere için ham sayılar (oranı burada, tam sayıyla). */
  tiklama: number;
  oncekiGosterim: number;
  oncekiTiklama: number;
}): KararSonucu {
  if (o.gosterim < YORULAN_KREATIF.enAzGosterim || o.oncekiGosterim < YORULAN_KREATIF.enAzGosterim) return { kart: false, neden: 'az_gosterim' };
  if (o.frekansOnda < YORULAN_KREATIF.enAzFrekansOnda) return { kart: false, neden: 'frekans_dusuk' };
  if (o.oncekiTiklama === 0) return { kart: false, neden: 'kiyas_yok' };
  // düşüş% = 100 × (1 − (t/g) / (ot/og)) ≥ eşik  ⇔  100·t·og ≤ (100 − eşik)·ot·g
  const sol = 100n * BigInt(o.tiklama) * BigInt(o.oncekiGosterim);
  const sag = BigInt(100 - YORULAN_KREATIF.enAzCtrDususuYuzde) * BigInt(o.oncekiTiklama) * BigInt(o.gosterim);
  return sol <= sag ? { kart: true } : { kart: false, neden: 'esik_alti' };
}

export function negatifAdayMi(o: {
  tiklama: number;
  donusum: number;
  harcamaMicros: bigint;
  hesapMaliyetMicros: bigint | null;
  /** Terim bir anahtar kelimenin AYNISI mı (aynıysa negatif yapmak kelimeyi öldürür). */
  anahtarKelimeyleAyni: boolean;
}): KararSonucu {
  if (o.anahtarKelimeyleAyni) return { kart: false, neden: 'anahtar_kelime' };
  if (o.donusum > 0) return { kart: false, neden: 'sonuc_var' };
  if (o.tiklama < NEGATIF_ADAY.enAzTiklama) return { kart: false, neden: 'az_tiklama' };
  if (o.hesapMaliyetMicros === null || o.hesapMaliyetMicros <= 0n) return { kart: false, neden: 'kiyas_yok' };
  if (o.harcamaMicros < o.hesapMaliyetMicros * BigInt(NEGATIF_ADAY.maliyetKati)) return { kart: false, neden: 'esik_alti' };
  return { kart: true };
}

export function butceHiziSapmasi(o: {
  planMicros: bigint;
  harcananMicros: bigint;
  gecenGun: number;
  ayGun: number;
}): { kart: false; neden: string } | { kart: true; yon: 'hizli' | 'yavas'; beklenenMicros: bigint } {
  if (o.gecenGun < BUTCE_HIZI.enAzGecenGun) return { kart: false, neden: 'erken' };
  const beklenen = (o.planMicros * BigInt(o.gecenGun)) / BigInt(o.ayGun);
  if (beklenen <= 0n) return { kart: false, neden: 'plan_yok' };
  const fark = o.harcananMicros - beklenen;
  const mutlak = fark < 0n ? -fark : fark;
  if (mutlak * 100n < beklenen * BigInt(BUTCE_HIZI.sapmaYuzde)) return { kart: false, neden: 'esik_alti' };
  return { kart: true, yon: fark > 0n ? 'hizli' : 'yavas', beklenenMicros: beklenen };
}

// ─── Kart veri modeli ──────────────────────────────────────────────────────

export interface OneriHedefi {
  platform: 'meta' | 'google';
  seviye: 'kampanya' | 'reklam_seti' | 'reklam' | 'arama_terimi';
  /** Bizim satır kimliğimiz (`ads.id`, `search_term_insights.id`…). */
  nesneId: string;
  /** Platformdaki kimlik (uygulama anında taze okunur, bu yalnız gösterim). */
  platformKimligi: string;
  ad: string;
}

/**
 * Eylem ve geri alma ÇİFT olarak tanımlı: geri alınamayan bir eylem kart
 * olamaz. `artirir` bayrağı eylemden TÜRER (elle yazılmaz): bütçe değişikliği
 * yeni tutar eskisinden büyükse artırır.
 */
export type OneriEylemi =
  | { tur: 'durdur' }
  | { tur: 'butce_degistir'; oncekiMicros: string; yeniMicros: string }
  | { tur: 'negatif_ekle'; terimler: string[]; eslesme: 'tam' | 'ifade' }
  | { tur: 'kreatif_varyasyon_taslagi' };

export type GeriAlma =
  | { tur: 'yeniden_ac' }
  | { tur: 'butceyi_geri_yaz'; micros: string }
  | { tur: 'negatifi_kaldir'; terimler: string[] }
  | { tur: 'taslagi_sil' };

export function geriAlmaAdimi(e: OneriEylemi): GeriAlma {
  switch (e.tur) {
    case 'durdur':
      return { tur: 'yeniden_ac' };
    case 'butce_degistir':
      return { tur: 'butceyi_geri_yaz', micros: e.oncekiMicros };
    case 'negatif_ekle':
      return { tur: 'negatifi_kaldir', terimler: [...e.terimler] };
    case 'kreatif_varyasyon_taslagi':
      return { tur: 'taslagi_sil' };
  }
}

export function eylemArtirirMi(e: OneriEylemi): boolean {
  return e.tur === 'butce_degistir' && BigInt(e.yeniMicros) > BigInt(e.oncekiMicros);
}

/**
 * KENDİLİĞİNDEN UYGULAMA KAPALI (Ç-3, 2026-10-07). Sabit ileride açılırsa
 * bile bütçe artıran eylem asla kendiliğinden uygulanmaz; yalnız DURDURMA ve
 * KISMA. Fonksiyon sabitten bağımsız bu ikinci kuralı da taşır: biri sabiti
 * açıp ikinci kuralı unutursa test düşer.
 */
export const KENDILIGINDEN_UYGULAMA = false as boolean;

export function kendiligindenUygulanabilirMi(e: OneriEylemi, acik: boolean = KENDILIGINDEN_UYGULAMA): boolean {
  if (!acik) return false;
  if (eylemArtirirMi(e)) return false;
  return e.tur === 'durdur' || e.tur === 'butce_degistir';
}

export interface OneriKarti {
  id: string;
  clientId: string;
  taramaId: string;
  tur: OneriTuru;
  hedef: OneriHedefi;
  /** Deterministik cümle; sayılar `olculer`den. */
  neden: string;
  /** Kanıt: her ölçü kaynaklı (pencere + okuma zamanı). */
  olculer: Array<{ etiket: string } & Kaynakli<string | number>>;
  /** Beklenen etki ("7 günde ~1.240 ₺ tasarruf"); hesaplanamıyorsa boş + neden. */
  beklenenEtki: Hucre<{ tur: 'tasarruf' | 'sonuc_artisi' | 'hiz_duzeltme'; micros: string | null; adet: number | null }>;
  eylem: OneriEylemi;
  geriAlma: GeriAlma;
  durum: OneriDurumu;
  /** Bu andan sonra kart BAYAT: ölçü eskidi. */
  gecerlilikSonu: string;
  /** Uygulama/geri alma düşerse platformun kendi mesajı. */
  platformMesaji: string | null;
  olusturuldu: string;
}

// ─── Durum makinesi ────────────────────────────────────────────────────────

/**
 *   yeni ──uygula(kişi)──► uygulaniyor ──(worker: geri okundu)──► uygulandi ──geri_al(kişi)──► geri_aliniyor ──(worker)──► geri_alindi
 *     │                       │  └─(worker: platform reddetti)──► yeni (platformMesaji dolu)        └─(worker: reddetti)──► uygulandi
 *     │                       └─(worker: cevap yok)──► sonuc_belirsiz ──(worker: uzlaştırma)──► uygulandi | yeni
 *     ├──gec(kişi)──► gecildi
 *     └──(sistem: süre doldu / hedef değişti / yeni tarama)──► bayat
 *
 * SON: `gecildi`, `bayat`, `geri_alindi`. `uygulandi` SON DEĞİL (geri alma
 * açık) ama bekleyen değil: kısmi tekil indeks (`hedef_nesne_id, tur`)
 * yalnız `yeni | uygulaniyor | sonuc_belirsiz | geri_aliniyor`u kapsar; her
 * birinin çıkışını worker ya da kişi yazar (testte kilitli). Aksi hâlde bir
 * reklama bir kez öneri düşünce bir daha hiç düşmezdi (boost `active` dersi).
 *
 * BELİRSİZDE YENİDEN ÇAĞRI YOK: "durdur" cevabı gelmediyse kendiliğinden
 * tekrar göndermek değil, durumu okumak (uzlaştırma). Yayın motorunun
 * `sonuc_belirsiz` kuralının aynısı.
 */
export const ONERI_DURUMLARI = [
  'yeni',
  'uygulaniyor',
  'sonuc_belirsiz',
  'uygulandi',
  'geri_aliniyor',
  'gecildi',
  'bayat',
  'geri_alindi',
] as const;
export type OneriDurumu = (typeof ONERI_DURUMLARI)[number];
export const ONERI_SON_DURUMLARI: readonly OneriDurumu[] = ['gecildi', 'bayat', 'geri_alindi'];
/** Kısmi tekil indeksin yüklemi: hedef + tür başına tek açık kart. */
export const ONERI_ACIK_DURUMLARI: readonly OneriDurumu[] = ['yeni', 'uygulaniyor', 'sonuc_belirsiz', 'geri_aliniyor'];

export const ONERI_GECISLERI: Readonly<Record<OneriDurumu, ReadonlyArray<{ hedef: OneriDurumu; yazan: GecisYazani }>>> = {
  yeni: [
    { hedef: 'uygulaniyor', yazan: 'ajans' },
    { hedef: 'gecildi', yazan: 'ajans' },
    { hedef: 'bayat', yazan: 'sistem' },
  ],
  uygulaniyor: [
    { hedef: 'uygulandi', yazan: 'worker' },
    { hedef: 'yeni', yazan: 'worker' },
    { hedef: 'sonuc_belirsiz', yazan: 'worker' },
  ],
  sonuc_belirsiz: [
    { hedef: 'uygulandi', yazan: 'worker' },
    { hedef: 'yeni', yazan: 'worker' },
  ],
  uygulandi: [{ hedef: 'geri_aliniyor', yazan: 'ajans' }],
  geri_aliniyor: [
    { hedef: 'geri_alindi', yazan: 'worker' },
    { hedef: 'uygulandi', yazan: 'worker' },
  ],
  gecildi: [],
  bayat: [],
  geri_alindi: [],
};

export function oneriGecisiIzinliMi(nereden: OneriDurumu, nereye: OneriDurumu, yazan: GecisYazani): boolean {
  return ONERI_GECISLERI[nereden].some((g) => g.hedef === nereye && g.yazan === yazan);
}

/** Kartın ömrü: ölçü bundan eskiyse "Uygula" yerine "yeniden tara". */
export const ONERI_OMRU_SAAT = 36;

/**
 * Uygula anında TAZE kontrol: kart eskidiyse ya da hedef nesne kart
 * üretildiğinden beri değiştiyse (zaten durdurulmuş, bütçesi başkası
 * tarafından değişmiş) kart bayattır ve eylem gönderilmez. Eski bir kartla
 * bütçe yazmak, MCP'den ya da Ads Manager'dan yapılmış güncel bir kararı
 * ezmek olurdu (hafıza: "Meta hesapları artık MCP ile yönetiliyor").
 */
export function oneriBayatMi(
  k: Pick<OneriKarti, 'gecerlilikSonu' | 'eylem'>,
  simdi: string,
  hedefSimdi: { durum: 'acik' | 'durdurulmus' | 'yok'; butceMicros: string | null },
): boolean {
  if (simdi >= k.gecerlilikSonu) return true;
  if (hedefSimdi.durum === 'yok') return true;
  if (k.eylem.tur === 'durdur' && hedefSimdi.durum !== 'acik') return true;
  if (k.eylem.tur === 'butce_degistir' && hedefSimdi.butceMicros !== k.eylem.oncekiMicros) return true;
  return false;
}
