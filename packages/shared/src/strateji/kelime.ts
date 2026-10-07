import { z } from 'zod';

/**
 * ═══ BİLEŞEN 2 — ARAMA HACMİ ODAKLI GOOGLE KURGUSU ═══
 *
 * KAYNAK `KeywordPlanIdeaService.GenerateKeywordIdeas`
 * (`GoogleProvider.kelimeFikirleri`). Servis Explorer erişiminde YASAK ve
 * projenin seviyesi ölçülmedi (Ç-3): bu bileşen bir ÖLÇÜM KAPISININ
 * arkasında. Ekran ERİŞİM DURUMUNU ayrı söyler; "erişim yok" ile "sonuç yok"
 * aynı boş tablo olmaz.
 *
 * EKRAN HAM API'Yİ OKUMAZ. Fikirler `strateji_kelimeleri`ne ÇEKİM ZAMANIYLA
 * yazılır ve ekran tabloyu okur: (a) servis 1 QPS, her sayfa açılışında
 * çağırmak kotayı ilk kullanıcıda bitirir; (b) müşterinin onayladığı plan,
 * onayladığı gündeki sayıları taşımalı, Google'ın ertesi gün döndürdüğünü
 * değil.
 */
export const KELIME_ERISIM_DURUMLARI = [
  /** Kapı kapalı: henüz ölçülmedi. Bileşen "yakında" değil, NEDENİYLE kapalı. */
  'olculmedi',
  'var',
  /** Google reddetti (ör. geliştirici token'ı seviyesi). Platform mesajı ekranda. */
  'yok',
] as const;
export type KelimeErisimDurumu = (typeof KELIME_ERISIM_DURUMLARI)[number];

/**
 * Hedefleme AÇIK yazılır. Boş "her yer, her dil" demek ve Türk müşterinin
 * planına dünya hacmi girer (CLAUDE.md "platformun varsayılanına güvenme").
 * Varsayılan Türkçe + Türkiye; değer bir SABİT, kullanıcı girdisi değil.
 */
export const KELIME_VARSAYILAN_HEDEF = {
  dilKaynagi: 'languageConstants/1037',
  konumKaynaklari: ['geoTargetConstants/2792'],
} as const;

/** Google'ın sınırı: 1–20 tohum (A1 §4.5). */
export const kelimeAraSchema = z.object({
  tohumlar: z
    .array(z.string().trim().min(2).max(80))
    .min(1, 'En az bir kelime yazın')
    .max(20, 'En çok 20 kelime'),
});
export type KelimeAraGirdisi = z.infer<typeof kelimeAraSchema>;

export interface KelimeSatiri {
  id: string;
  kelime: string;
  /** `null` = Google değer vermedi. Sıfır DEĞİL: sıfır göstermek kelimeyi haksız yere eler. */
  aylikArama: number | null;
  rekabet: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  teklifAltMicros: string | null;
  teklifUstMicros: string | null;
  /**
   * Google'ın AYNI metrikle döndürdüğü yakın varyantlar ("türk kahve
   * makinesi" / "turk kahve makinesi", ölçüldü 2026-10-08). Ayrı satır
   * olsalardı hacim toplamı ikiye katlanırdı; tek satırda tutuluyorlar.
   */
  varyantlar: string[];
  /** Önerilen reklam grubu adı; kullanıcı değiştirebilir. */
  grup: string | null;
  /**
   * Grup adını kullanıcı mı yazdı. `true` ise yeniden gruplama onu EZMEZ
   * (MIMARI §6.2) ve ekran bunu gösterir; göstermezse kullanıcı hangi
   * grupların kendisine ait olduğunu bilemez.
   */
  grupElle: boolean;
  /**
   * Plana alındı mı. Varsayılan FALSE: fikirler tohumun dışına geniş yayılıyor
   * (rakip marka terimleri dahil) ve otomatik seçim planı onlarla doldururdu.
   */
  secili: boolean;
  cekimZamani: string;
}

export interface KelimeAramaSonucu {
  erisim: KelimeErisimDurumu;
  /** `erisim: 'yok'` ise Google'ın kendi mesajı. */
  platformMesaji: string | null;
  satirlar: KelimeSatiri[];
  /**
   * Gösterilen / toplam. Sessiz kesme yok: Google 10.000'e kadar döndürüyor,
   * plan ekranı ilk N'i taşıyor ve bunu söylüyor.
   */
  gosterilen: number;
  toplam: number;
}

/**
 * Ayrı reklam grubu eşiği: "ayda 1.000 aramanın altı kendi grubunu taşımaz".
 * Değer AdvCampaign K-06 kararı (`docs/advcampaign/TASARIM-PLAN.md` §0).
 * K-06 `ARAMA_HACMI_ESIGI` adıyla yalnız belgede; 2026-10-08 itibarıyla
 * kodda karşılığı YOK. Tek kaynak burası: AdvCampaign o eşiği yazarken
 * bunu içe aktarmalı, ikinci bir sabit doğarsa aynı kelime bir ekranda grup,
 * diğerinde alt kelime olur.
 */
export const AYRI_GRUP_HACIM_ESIGI = 1_000;
