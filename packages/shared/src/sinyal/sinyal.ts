import { z } from 'zod';
import type { Platform } from '../constants/platforms';
import type { VarlikEylemSeviyesi } from '../schemas/campaign-action.schema';
import type { AnomaliMetrigi, AnomaliYonu } from './anomali';
import type { SaglikKontrolu, SaglikDisaridaKodu } from './saglik';
import type { SinyalDurumu, SinyalKapatmaNedeni } from './durum';

/**
 * ═══ SİNYAL — SÖZLEŞME (Paket A, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Ajan 2 (API) ve Ajan 3 (panel) tip TANIMLAMAZ, buradan okur.
 *
 * İYİLEŞTİR ÖNERİSİNDEN FARKI (MIMARI Ç-4): öneri her istekte yeniden
 * HESAPLANIR ve saklanmaz, çünkü eyleminin değeri (bütçe) bayatlar. Sinyal
 * bir GÖZLEMDİR ("dün maliyet beklenenin 2 katıydı") ve SAKLANIR: kapatma,
 * kendiliğinden kapanma, kötüleşince yeniden açılma ve "bu sabah kanala ne
 * gitti" geçmiş ister. İki kavram tek tipe zorlanmadı.
 */

export const SINYAL_TURLERI = ['anomali', 'saglik'] as const;
export type SinyalTuru = (typeof SINYAL_TURLERI)[number];

export const SINYAL_TURU_ADI: Record<SinyalTuru, string> = {
  anomali: 'Performans',
  saglik: 'Sağlık',
};

/** Sinyal kodu: anomali metriği ya da sağlık kontrolü. CHECK kısıtı ikisinin birleşimi. */
export type SinyalKodu = AnomaliMetrigi | SaglikKontrolu;

/**
 * Kendiliğinden kapanma süresi (gün): koşul bu kadar gün GÖRÜLMEZSE
 * `sure_doldu`. Anomali tek günlük bir olay ve Orphex deseni 7 gün; sağlık
 * kontrolü bir HÂL ve düzelince ertesi değerlendirmede kapanmalı (reddedilen
 * reklam düzeltildiyse bir hafta "açık" görünmesi yanlış alarm).
 */
export const KENDILIGINDEN_KAPANMA_GUN: Record<SinyalTuru, number> = {
  anomali: 7,
  saglik: 1,
};

/**
 * KARARLI ANAHTAR: `tur:kod:yon:seviye:varlikId`. Varlık kimliği bizim
 * UUID'imiz (platformlar arası tekil), yani anahtar `client_id` İÇERMEZ ve
 * tekil indeks de içermez: hesap başka workspace'e taşınınca satır
 * taşınabilir, hedefte çakışma doğmaz (CLAUDE.md hesap-verisi-tasima notu).
 * Yön anahtarın parçası: harcamanın artışı ve düşüşü iki ayrı iş.
 */
export function sinyalAnahtari(p: {
  tur: SinyalTuru;
  kod: SinyalKodu;
  yon: AnomaliYonu | null;
  seviye: SinyalSeviyesi;
  varlikId: string;
}): string {
  return [p.tur, p.kod, p.yon ?? '-', p.seviye, p.varlikId].join(':');
}

export type SinyalSeviyesi = 'account' | 'campaign' | 'ad_group' | 'ad';

// ─── Eylem ───────────────────────────────────────────────────────────────────

/**
 * Sinyalin yanındaki düğme. Yalnız VAR OLAN yazma yolları:
 * - `durdur`: `CampaignActionsService` (Reklam Yöneticisi satır içi
 *   durdurunun aynı yolu, geri okumalı). Google VIDEO kampanyası
 *   (`googleYazilamazMi`) ve LinkedIn'de eylem `null` + `kisit`.
 * - `incele`: panelin bağlantı üreticisine giden HEDEF (panel adresi kendisi
 *   kurar, `lib/reklam-yoneticisi.ts`; CLAUDE.md "bağlantıyı elle birleştirme").
 * - `olcum`: Marka Merkezi › Ölçüm (`donusum_kesildi`).
 *
 * BÜTÇE EYLEMİ YOK: bütçe kararı İyileştir önerisinde ve orada aylık bütçe
 * temposu + %20 adım sınırı + özet kontrolüyle veriliyor. Sinyalden ikinci
 * bir bütçe yolu açmak o korumaları atlatır.
 */
export type SinyalEylemi =
  | { tur: 'durdur'; seviye: VarlikEylemSeviyesi; varlikId: string }
  | { tur: 'incele'; seviye: SinyalSeviyesi; varlikId: string }
  | { tur: 'olcum'; clientId: string };

/** Kod (+ yön) → önerilen eylem türü. `null` = yalnız bilgi. */
export function sinyalEylemTuru(kod: SinyalKodu, yon: AnomaliYonu | null, seviye: SinyalSeviyesi): SinyalEylemi['tur'] | null {
  // F1: sitede ölçüm kırık ya da eksik; çaresi Ölçüm ekranında.
  if (kod === 'donusum_kesildi' || kod === 'ga4_anahtar_etkinlik_yok' || kod === 'ga4_veri_gelmiyor') return 'olcum';
  // utm_eksik bir reklam BAĞLANTISI sorunu; durdurmak yanlış eylem.
  if (kod === 'utm_eksik') return null;
  // Durdurmak yalnız para YAKAN yönde anlamlı ve hesap seviyesinde durdurma yok.
  const yakan = (kod === 'harcama' && yon === 'artis') || kod === 'donusum_basi_maliyet' || kod === 'tiklama_basi_maliyet';
  if (yakan && seviye !== 'account') return 'durdur';
  if (seviye === 'account') return null;
  return 'incele';
}

// ─── Sinyal ──────────────────────────────────────────────────────────────────

export interface SinyalDegeri {
  /** Ham sayı (para micros DEĞİL, hesap para biriminde; oran 0-1). */
  sayi: number;
  /** Biçimlenmiş ("4.820 ₺", "%1,2", "18.400"). */
  metin: string;
}

/** Kartın mini grafiği: aynı gün geçmiş haftalar + gözlenen, beklenen bant. */
export interface SinyalSerisi {
  /** `YYYY-MM-DD` (Date'e çevrilmez, saat dilimi kaymasın). */
  gunler: string[];
  degerler: Array<number | null>;
  bant: { alt: number; ust: number } | null;
}

export interface Sinyal {
  id: string;
  anahtar: string;
  tur: SinyalTuru;
  kod: SinyalKodu;
  yon: AnomaliYonu | null;
  platform: Platform;
  clientId: string;
  clientAdi: string;
  adAccountId: string;
  adAccountAdi: string;
  varlik: { seviye: SinyalSeviyesi; id: string; ad: string; ustAd: string | null };
  /** Tek cümle, sade ("Maliyet beklenenin 2 katı"). Düz metin. */
  baslik: string;
  /** Neden + ne yapılır, tek-iki cümle. Düz metin. */
  neden: string;
  /** Gözlem günü. Dönüşüm metriklerinde `donusumGecikmesiGun` geriden. */
  gun: string;
  gozlenen: SinyalDegeri | null;
  beklenen: { alt: SinyalDegeri; ust: SinyalDegeri; nokta: number } | null;
  /** Ekranda "2,1 kat", "%-64". `null` = sağlık kontrolü. */
  sapmaMetni: string | null;
  onem: 'yuksek' | 'orta';
  durum: SinyalDurumu;
  ilkGorulme: string;
  sonGorulme: string;
  /** Son kez açık duruma geçtiği an (özet bu alana bakar). */
  sonAcilma: string;
  /** Kaç kez açıldı (1 = ilk). >1 ekranda "yeniden açıldı" rozeti. */
  acilmaSayisi: number;
  kapatma: { neden: SinyalKapatmaNedeni; kim: string | null; zaman: string; not: string | null } | null;
  eylem: SinyalEylemi | null;
  /** Eylem neden yok/kısıtlı (Google video, LinkedIn yazma yok). */
  kisit: string | null;
  seri: SinyalSerisi | null;
  /**
   * ONAY ÖZETİ (İyileştir deseni): `id + durum + sonGorulme + eylem`in
   * sha256'sı. Uygula bunu taşır; sunucu satırı yeniden okur, değiştiyse
   * 409 "sinyal değişti, yenile". Ekran açıkken kapanmış bir sinyalin
   * kampanyasını durdurmak istenmeyen bir eylem.
   */
  ozet: string;
}

// ─── Liste yanıtı: boş liste NEDENİNİ söyler ────────────────────────────────

/**
 * Hesap başına hesaplama durumu. "Sinyal yok" tek başına bir cevap değil:
 * hesap hiç değerlendirilmediyse, geçmişi yetmiyorsa ya da verisi bayatsa
 * aynı boş liste görünürdü ve dördünün yapılacak işi farklı.
 */
export const HESAP_SINYAL_DURUMLARI = [
  'hesaplandi',
  'hic_hesaplanmadi',
  'gecmis_yetersiz',
  'veri_bayat',
  'hesaplama_dustu',
] as const;
export type HesapSinyalDurumu = (typeof HESAP_SINYAL_DURUMLARI)[number];

export interface HesapSinyalOzeti {
  adAccountId: string;
  adAccountAdi: string;
  platform: Platform;
  durum: HesapSinyalDurumu;
  /** Son başarılı değerlendirme (sync_jobs `signals_evaluate`). */
  sonHesaplama: string | null;
  /** Kaç haftalık geçmiş var (anomali için `ANOMALI.enAzGecmisNokta` gerekir). */
  gecmisHafta: number;
  /** İşin notu ya da hatası, aynen. */
  not: string | null;
}

export const SINYAL_BOS_NEDENLERI = [
  /** Workspace'e hiç reklam hesabı atanmamış. */
  'hesap_yok',
  /** Hesaplar var ama hiçbiri değerlendirilmedi (iş hiç koşmadı). */
  'hesaplanmadi',
  /** Değerlendirildi, geçmiş yetmediği için anomali aranamadı (sağlık kontrolleri yine koştu). */
  'gecmis_yetersiz',
  /** Değerlendirildi, açık sinyal yok. Gerçek "her şey yolunda". */
  'sinyal_yok',
  /** Süzgeç (tür/platform/durum) her şeyi eledi. */
  'suzgec_bos',
] as const;
export type SinyalBosNedeni = (typeof SINYAL_BOS_NEDENLERI)[number];

export interface SinyalListesi {
  sinyaller: Sinyal[];
  /** Süzgeçten sonra, kesmeden önce. Sessiz kesme yok. */
  toplam: number;
  /** Süzgeçten bağımsız durum sayıları (sekme rozetleri). */
  sayilar: Record<SinyalDurumu, number>;
  /** `sinyaller` boşsa dolu, değilse null. */
  emptyReason: SinyalBosNedeni | null;
  hesaplar: HesapSinyalOzeti[];
  /** Ekranın "Kontrol edilmeyenler" satırı (`SAGLIK_DISARIDA`). */
  kontrolEdilmeyen: SaglikDisaridaKodu[];
  /** Okunamayan kaynak; diğerleri yine döner. */
  hatalar: Array<{ kaynak: string; mesaj: string }>;
  /**
   * SESSİZ KOŞUM (MIMARI § 10): ilk iki hafta sinyaller hesaplanır ama
   * kanala gitmez. `true` iken uç sinyalleri YALNIZ org yöneticisine
   * döndürür (yanlış alarm ölçümü onun işi), diğer kullanıcıya boş liste +
   * bu bayrak; panel "Ölçüm döneminde, sinyaller henüz gösterilmiyor" yazar.
   * Boş liste "sinyal yok" sanılmasın diye bayrak ayrı.
   */
  sessizKosum: boolean;
  uretildi: string;
}

/** Yanıtta en çok bu kadar sinyal; fazlası `toplam`da ve sayfalamada. */
export const SINYAL_SAYFA_BOYUTU = 50;

export const sinyalListeSorgusuSchema = z.object({
  clientId: z.string().uuid().optional(),
  durum: z.enum(['acik', 'kapali']).default('acik'),
  tur: z.enum(['anomali', 'saglik']).optional(),
  platform: z.enum(['meta', 'google', 'linkedin']).optional(),
  sayfa: z.coerce.number().int().min(1).max(1000).default(1),
});
export type SinyalListeSorgusu = z.infer<typeof sinyalListeSorgusuSchema>;

export const sinyalKapatSchema = z.object({
  /** İsteğe bağlı kısa not ("kampanya bilerek durduruldu"). */
  not: z.string().trim().max(300).optional(),
});
export type SinyalKapatGirdisi = z.infer<typeof sinyalKapatSchema>;

export const sinyalUygulaSchema = z.object({
  ozet: z.string().regex(/^[0-9a-f]{64}$/),
});
export type SinyalUygulaGirdisi = z.infer<typeof sinyalUygulaSchema>;

/** Uygula sonucu: geri okuma (İyileştir `UygulamaSonucu` ile aynı anlam). */
export interface SinyalUygulamaSonucu {
  dogrulama: 'dogrulandi' | 'uyusmadi';
  platformDegeri: string;
  sinyal: Sinyal;
}

// ─── Genel Bakış entegrasyonu ───────────────────────────────────────────────

/**
 * Genel Bakış "Bekleyen işler" yeni türü. `BEKLEYEN_IS_TURLERI`ne Ajan 2
 * ekler (genel-bakis/index.ts), AYNI commit'te `KAYNAK_HATASI` ve panelin
 * tür tablosu: üçü de `Record` ve derleme o commit'i zorlar. Burada yalnız
 * ad ve izin sabit: tür listesine şimdi eklemek API ve panel derlemesini
 * Ajan 2-3 başlamadan kırardı.
 *
 * Sıra: `boost_onay`dan SONRA, `strateji_onay`dan ÖNCE (para yakan bir
 * anomali, bekleyen bir plan onayından acil).
 */
export const SINYAL_BEKLEYEN_IS = { tur: 'sinyal_acik', izin: 'rule.read' } as const;
