import { z } from 'zod';
import type { RehberAmacKodu, RehberPlatformu } from '../../reklam/rehber/amaclar';
import type { RehberAlanAdi } from '../../reklam/rehber/alanlar';
import type { PlanDetayi } from '../detay';
import type { PlanDurumu } from '../plan';
import { STRATEJI_BELGE_BOLUMLERI, type StratejiBolumKodu, type StratejiRiski } from './belge';
import type { StratejiDurumu, StratejiEylemi, StratejiOnayRolu } from './durum';
import type { KalemAktarimEngeli, KalemAktarimKarari } from './rehber-esleme';
import type { KalemMetni, KalemTahmini, StratejiKalemi } from './kalem';
import type { KaynakliMetin } from './kaynak';
import type { BaglantiHali, OnayBaglantisiOzeti } from './paylasim';
import type { StratejiSihirbazi } from './sihirbaz';

/**
 * ═══ ADVSTRATEGY v2 — UÇ GÖVDELERİ VE YANITLARI ═══
 *
 * AJAN 2 SAPMASI (2026-10-13, YENIDEN-TASARIM.md § 9.7): sözleşme uç
 * LİSTESİNİ ve yaprak tipleri taşıyordu, YANITLARI ve üç isteğin gövdesini
 * değil. Ajan 3 panelin beklediği şekilleri tek dosyada yazmıştı
 * (`apps/web/src/components/strateji/v2/yanit.ts`); bu dosya o şekilleri
 * BİREBİR AD ve alanla taşıyor, panel buradan okur ve controller dönüşleri
 * bu tiplere bağlı (`serverApiFetch<T>` denetimsiz dönüşüm: iki ayrı tanım
 * ayrıştığı anda panel susarak `undefined` okurdu). Panel şeklinden
 * SAPILAN yerler (API'nin doğru biçimi seçildi) alanın yanında `SAPMA:`
 * notuyla; panelin okumadığı ek alanlar `EK:` notuyla.
 */

// ─── İstek gövdeleri ────────────────────────────────────────────────────

/** `POST …/eylem`: onay ve revizyon KENDİ uçlarında (approve izni). */
export const STRATEJI_PANEL_EYLEMLERI = ['onaya_gonder', 'geri_cek', 'kapat', 'iptal'] as const satisfies readonly StratejiEylemi[];
export const stratejiEylemSchema = z.object({
  eylem: z.enum(STRATEJI_PANEL_EYLEMLERI),
  surum: z.number().int().positive(),
});
export type StratejiEylemGirdisi = z.infer<typeof stratejiEylemSchema>;

export const stratejiOnaySchema = z.object({ surum: z.number().int().positive() });

export const stratejiRevizyonSchema = z.object({
  surum: z.number().int().positive(),
  yorum: z.string().trim().min(1, 'Ne değişmesi gerektiğini yazın').max(2000),
});
export type StratejiRevizyonGirdisi = z.infer<typeof stratejiRevizyonSchema>;

/** `POST …/yorumlar` (panelin `YorumGovdesi`; EK: isteğe bağlı kalem). */
export const stratejiYorumSchema = z.object({
  surum: z.number().int().positive(),
  metin: z.string().trim().min(1).max(2000),
  kalemId: z.string().uuid().nullable().optional(),
});
export type YorumGovdesi = z.infer<typeof stratejiYorumSchema>;

const BOLUM_KODLARI = STRATEJI_BELGE_BOLUMLERI.map((b) => b.kod) as [StratejiBolumKodu, ...StratejiBolumKodu[]];

/**
 * `PUT …/bolumler` (panelin `BolumlerGovdesi`). `null` = bölümü boşalt.
 * EK: kaynak `ai` da kabul (önerinin olduğu gibi saklanması; belgeye girmez).
 * Sunucu `kim` + `zaman` basar.
 */
export const stratejiBolumleriKaydetSchema = z.object({
  surum: z.number().int().positive(),
  bolumler: z
    .record(z.enum(BOLUM_KODLARI), z.object({ metin: z.string().trim().min(1).max(2000), kaynak: z.enum(['ai', 'ajans']) }).nullable())
    .refine((r) => Object.keys(r).length > 0, 'En az bir bölüm gönderilmeli'),
});
export type BolumlerGovdesi = z.infer<typeof stratejiBolumleriKaydetSchema>;

export const stratejiAktarSchema = z.object({
  surum: z.number().int().positive(),
  /** Verilmezse onaylı planın bütün kalemleri. */
  kalemIdleri: z.array(z.string().uuid()).min(1).max(12).optional(),
});
export type StratejiAktarGirdisi = z.infer<typeof stratejiAktarSchema>;

/**
 * `POST …/gonder` (panelin `GonderGovdesi`: `surum` + `alicilar`). EK: konu
 * ve gövde isteğe bağlı; verilmezse sunucunun şablonu yazar. `alicilar` boşsa
 * workspace'in kayıtlı rapor alıcıları (`nihaiAlicilar`).
 */
export const stratejiGonderSchema = z.object({
  surum: z.number().int().positive(),
  alicilar: z.array(z.string().trim().toLowerCase().email()).max(20).default([]),
  konu: z.string().trim().min(1).max(200).optional(),
  html: z.string().max(20_000).optional(),
  /** Girişsiz onay bağlantısı oluşturulup gövdeye eklensin mi (yalnız `onayda`). */
  onayBaglantisi: z.boolean().default(true),
  sureGun: z.number().int().min(1).max(30).optional(),
});
export type GonderGovdesi = z.input<typeof stratejiGonderSchema>;

// ─── Liste ve plan ──────────────────────────────────────────────────────

/** Liste satırı: v1 (`bicim: 1`, salt okunur) ve v2 aynı listede. */
export interface StratejiListeSatiri {
  id: string;
  bicim: 1 | 2;
  durum: StratejiDurumu | PlanDurumu;
  /** v2: `YYYY-MM-DD`; v1'de null. */
  baslangic: string | null;
  bitis: string | null;
  /** v1: `YYYY-MM`; v2'de null. */
  donem: string | null;
  toplamButceMicros: string;
  paraBirimi: string;
  surum: number;
  guncellendi: string;
  /** EK: v2'de kalem, v1'de matris satırı sayısı. */
  kalemSayisi: number;
}

export interface StratejiListesi {
  planlar: StratejiListeSatiri[];
  /** Sunucu listeyi keserse "N / toplam" yazılır (sessiz kesme yok). */
  toplam: number;
}

export interface StratejiOnayKaydi {
  rol: StratejiOnayRolu;
  zaman: string;
  /** Panel kullanıcısının adı; bağlantı onayında null. */
  kim: string | null;
  /** Yalnız `baglanti`: kişinin BEYANI. */
  ad: string | null;
  eposta: string | null;
  surum: number;
}

export interface StratejiPlani {
  id: string;
  clientId: string;
  bicim: 2;
  durum: StratejiDurumu;
  surum: number;
  onaylananSurum: number | null;
  baslangic: string;
  bitis: string;
  toplamButceMicros: string;
  paraBirimi: string;
  guncellendi: string;
  /** SAPMA: sunucu son değiştireni değil planı OLUŞTURANI biliyor; onun adı. */
  guncelleyen: string | null;
  workspaceAdi: string;
  /** Kapakta "Hazırlayan": ajansın şirket adı. */
  hazirlayan: string | null;
  onay: StratejiOnayKaydi | null;
  revizyonNotu: string | null;
}

/** "İşletme ve pazar" satırı. `deger: null` = Marka Merkezi'nde BOŞ; uydurulmaz. */
export interface IsletmeSatiri {
  etiket: string;
  deger: string | null;
}

/** "Bugüne kadar": platform × amaç; platformlar TOPLANMAZ, toplam satırı yok. */
export interface GecmisSatiri {
  platform: RehberPlatformu;
  amac: RehberAmacKodu | null;
  /** Amaç eşlenemediyse "Amacı eşlenemeyen kampanyalar". */
  etiket: string;
  harcamaMicros: string;
  sonuc: number | null;
  birim: string;
}

export interface Gecmis {
  gun: number;
  satirlar: GecmisSatiri[];
  /** Boş listenin NEDENİ (`emptyReason`): hesap yok, veri yok, okunamadı ayrı iş. */
  bosNedeni: string | null;
}

/** SAPMA (ad): panelde `OlcumSatiri`; shared'da `olcum/index.ts`in `OlcumSatiri`yla çakışıyordu. */
export interface StratejiOlcumSatiri {
  etiket: string;
  platform: RehberPlatformu | null;
  /** `bilinmiyor` = okunamadı; "kurulmalı" gibi gösterilmez (yanlış alarm). */
  durum: 'hazir' | 'kurulmali' | 'bilinmiyor';
}

/** `GET /strateji/v2/planlar/:id`. */
export interface StratejiDetayi {
  plan: StratejiPlani;
  kalemler: StratejiKalemi[];
  bolumler: Partial<Record<StratejiBolumKodu, KaynakliMetin>>;
  /** Kalem kaydında / onaya gönderimde alınan hâl: onaylanan belge sonradan değişmez. */
  riskler: StratejiRiski[];
  isletme: IsletmeSatiri[];
  gecmis: Gecmis;
  /** Riskler gibi KAYIT ANINDAKİ hâl (müşteri onayladığı belgeyi görür). */
  olcum: StratejiOlcumSatiri[];
  /** EK: durum × izin; düğmeler BUNDAN çizilir (`stratejiYapilabilir` ile aynı). */
  yapilabilir: StratejiEylemi[];
  /** EK: kelime araması (v1 ile AYNI tablo ve kuyruk). */
  kelimeler: PlanDetayi['kelimeler'];
  /**
   * EK (2026-10-13, adım adım akış): oluşturma adımlarının durumu. Sihirbazdan
   * önce açılmış planda ve müşteri hesabında `null`: müşteri ajansın çalışma
   * hâlini değil belgeyi görür.
   */
  sihirbaz: StratejiSihirbazi | null;
}

/** Belgenin ihtiyacı: panel belgesi ve girişsiz bağlantı AYNI veriyi okur. */
export type StratejiBelgeVerisi = Pick<StratejiDetayi, 'plan' | 'kalemler' | 'bolumler' | 'riskler' | 'isletme' | 'gecmis' | 'olcum'>;

/** `GET …/girdiler`: "Önerinin dayandığı bilgiler" + editörün ihtiyaçları. */
export interface StratejiGirdileri {
  satirlar: Array<{
    kod: string;
    baslik: string;
    durum: 'hazir' | 'eksik' | 'bilinmiyor' | 'bos';
    ayrinti: string | null;
    /** Eksiği gideren ekranın panel adresi (sunucu üretir). */
    baglanti: string | null;
  }>;
  /** Konum araması Meta hesabı üzerinden; atanmamışsa null ve arama kapalı. */
  konumHesabi: string | null;
  /** Kelime grupları (`strateji_kelimeleri.grup`) ve kaçar kelime. */
  kelimeGruplari: Array<{ grup: string; kelime: number }>;
  /** Özel reklam kategorisi beyanı: yaş ve bölge kilitli. */
  ozelKategori: boolean;
  /** EK: amaç × platform kurulabilir mi, değilse NEDENİ (editörün amaç seçicisi). */
  acilis: Record<RehberAmacKodu, Record<RehberPlatformu, { acik: boolean; sebep: string | null }>>;
}

/** `POST …/oner`: motor + yapay zekâ; YAZMAZ. */
export interface StratejiOnerisi {
  /**
   * Henüz KAYITLI DEĞİL: `id` sunucunun ürettiği geçici kimlik; panel bunları
   * olduğu gibi `PUT …/kalemler`e gönderebilir (planda olmayan kimlik yeni
   * kalem sayılır). `durum` hep `aktarilmadi`.
   */
  kalemler: StratejiKalemi[];
  bolumler: Partial<Record<StratejiBolumKodu, KaynakliMetin>>;
  /** Sayı yasağına iki kez takılan ya da üretilemeyen bölümler, nedeniyle. */
  uretilemeyen: Array<{ bolum: StratejiBolumKodu; neden: string }>;
  /** Motorun cümleleri ("Google payı asgari altında, kapatıldı"). */
  notlar: string[];
  /** EK: önerinin riskleri (kaydedilmemiş hâl). */
  riskler: StratejiRiski[];
  /** EK: aynı girdiyle ikinci çağrı yapay zekâya gitmedi. */
  onbellekten: boolean;
}

export interface StratejiYorumu {
  id: string;
  rol: StratejiOnayRolu;
  tur: 'yorum' | 'revizyon' | 'onay';
  ad: string | null;
  metin: string;
  surum: number;
  kalemSira: number | null;
  zaman: string;
}

export interface StratejiYorumlari {
  yorumlar: StratejiYorumu[];
  /** EK: sessiz kesme yok. */
  toplam: number;
}

/** `GET …/aktarim-onizleme`: kararı sözleşmenin `kalemAktarimEngeli` verir. */
export interface AktarimOnizlemesi {
  kalemler: Array<{
    kalemId: string;
    karar: KalemAktarimKarari;
    /**
     * Rehberde KULLANICININ seçeceği alanlar. Workspace'te TEK seçeneği olan
     * hesap/sayfa rehber açılınca kendiliğinden dolar (`onDoldurma`); onlar
     * buraya değil `notlar`a yazılır.
     */
    rehberdeTamamlanacak: RehberAlanAdi[];
    notlar: string[];
    /** EK: aktarılmışsa açılan rehber. */
    rehberId: string | null;
  }>;
}

/** `POST …/aktar`. SAPMA (ad): panelde `AktarimSonucu`; v1'in `AktarimSonucu`yla (strateji/plan.ts) çakışıyordu. */
export interface StratejiAktarimSonucu {
  kalemler: Array<
    | { kalemId: string; tur: 'acildi'; rehberId: string; notlar: string[] }
    /** EK: `zaten_aktarildi` engelinde var olan rehber ("Rehberde aç"). */
    | { kalemId: string; tur: 'engel'; engel: KalemAktarimEngeli; notlar: string[]; rehberId: string | null }
  >;
}

/** `GET …/gerceklesen`: kalem × platform, TOPLANMAZ. */
export interface Gerceklesen {
  kalemler: Array<{
    kalemId: string;
    platformlar: Partial<
      Record<
        RehberPlatformu,
        {
          harcananMicros: string;
          sonuc: number | null;
          /** Rehberde kurulan bütçe planla ayrıştıysa (sapma görünür, ezilmez). */
          kurulanButceMicros: string | null;
          /** EK: kalemin plandaki payı (micros). */
          planMicros: string;
          /** EK: `sonuc: null` ise NEDENİ. */
          sonucNedeni: string | null;
          /** EK: kayıtlı tahmin (aralık ya da yok + neden). */
          tahmin: KalemTahmini;
        }
      >
    >;
  }>;
  /** Verinin son günü (dün); kalem yoksa null. */
  guncellendi: string | null;
}

/** `GET /strateji/v2/onay/:token` (oturumsuz). */
export interface BaglantiBelgesi {
  hal: BaglantiHali;
  okunabilir: boolean;
  karar: boolean;
  /** `okunabilir` değilse null: geçersiz bağlantı belge göstermez. */
  belge: StratejiBelgeVerisi | null;
  /** Belgedeki yorumlar (kişi e-postaları YOK). */
  yorumlar: StratejiYorumu[];
}

/** `GET /reklam/rehberler/:id/strateji`: bağlı kalem yoksa `null` (boş gövde). */
export interface RehberinStratejisi {
  planId: string;
  clientId: string;
  baslangic: string;
  bitis: string;
  sira: number;
  amac: RehberAmacKodu;
  kreatifYonergesi: KaynakliMetin | null;
  kitleTarifi: KaynakliMetin | null;
}

/**
 * `POST …/gonder` yanıtı. SAPMA: panel `ret: string[]` bekliyordu; rapor
 * gönderiminin deseniyle reddin SEBEBİ de taşınıyor (adres listesi "neden"
 * sorusunu cevapsız bırakır). EK: gövdeye eklenen onay bağlantısı.
 */
export interface GonderimSonucu {
  kabul: string[];
  ret: Array<{ adres: string; sebep: string }>;
  baglanti: OnayBaglantisiOzeti | null;
}

export interface BaglantiListesi {
  baglantilar: OnayBaglantisiOzeti[];
}

/** `POST …/kalemler/:kalemId/metin-oner`: rehberin metin motorunun önerisi (kaynak `ai`). */
export type KalemMetinOnerisi = KalemMetni & { notlar: string[] };
