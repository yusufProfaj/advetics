import type {
  BaglantiHali,
  KalemAktarimEngeli,
  KalemAktarimKarari,
  KalemMetni,
  KaynakliMetin,
  OnayBaglantisiOzeti,
  PlanDurumu,
  RehberAlanAdi,
  RehberAmacKodu,
  RehberPlatformu,
  StratejiBolumKodu,
  StratejiDurumu,
  StratejiKalemi,
  StratejiOnayRolu,
  StratejiRiski,
} from '@advetics/shared';

/**
 * ═══ v2 UÇLARININ YANIT ŞEKİLLERİ — SÖZLEŞMEDE YOK (BULGU) ═══
 *
 * `packages/shared/src/strateji/v2/` uç LİSTESİNİ (`STRATEJI_V2_UCLARI`),
 * istek şemalarını (`stratejiKalemleriKaydetSchema`, `baglantiKarariSchema`,
 * `onayBaglantisiOlusturSchema`, `stratejiOlusturSchema`) ve yaprak tipleri
 * (`StratejiKalemi`, `StratejiRiski`, `KaynakliMetin`, `OnayBaglantisiOzeti`,
 * `KalemAktarimKarari`) veriyor; ama uçların YANIT gövdesini (plan detayı,
 * girdiler, öneri, yorumlar, aktarım önizlemesi, gerçekleşen, bağlantıdan
 * belge, rehberin kalemi) ve üç isteğin gövdesini (bölümler, yorum, gönder)
 * tanımlamıyor.
 *
 * Ajan 3 tip TANIMLAMAZ; bu dosya bir TANIM değil, ekranın beklediği şeklin
 * TEK YERDE yazılmış hâli: her yaprak sözleşmeden, burada yalnız birleştirme
 * var. Ajan 1 bunları `v2/`ye taşıdığında bu dosya silinir ve ekranlar
 * import yolunu değiştirir; ayrı ayrı bileşenlere dağılmış elle tipler
 * taşımayı imkânsız kılardı. Ajan 2'nin yanıtı buradan ayrışırsa
 * `serverApiFetch<T>` SUSAR (denetimsiz dönüşüm, CLAUDE.md) — Ajan 4
 * kapısında controller yanıtları bu dosyayla karşılaştırılmalı.
 */

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
  /** Amaç eşlenemediyse kampanya amacının iş dilindeki adı. */
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

export interface OlcumSatiri {
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
  riskler: StratejiRiski[];
  isletme: IsletmeSatiri[];
  gecmis: Gecmis;
  olcum: OlcumSatiri[];
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
}

/** `POST …/oner`: motor + yapay zekâ; YAZMAZ. */
export interface StratejiOnerisi {
  kalemler: StratejiKalemi[];
  bolumler: Partial<Record<StratejiBolumKodu, KaynakliMetin>>;
  /** Sayı yasağına iki kez takılan ya da üretilemeyen bölümler, nedeniyle. */
  uretilemeyen: Array<{ bolum: StratejiBolumKodu; neden: string }>;
  /** Motorun cümleleri ("Google payı asgari altında, kapatıldı"). */
  notlar: string[];
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
}

/** `GET …/aktarim-onizleme`: kararı sözleşmenin `kalemAktarimEngeli` verir. */
export interface AktarimOnizlemesi {
  kalemler: Array<{
    kalemId: string;
    karar: KalemAktarimKarari;
    /** Rehberde kullanıcının tamamlayacağı alanlar (`REHBERDE_TAMAMLANAN_ALANLAR`ın bu kalemde boş kalacakları). */
    rehberdeTamamlanacak: RehberAlanAdi[];
    notlar: string[];
  }>;
}

/** `POST …/aktar`. */
export interface AktarimSonucu {
  kalemler: Array<
    | { kalemId: string; tur: 'acildi'; rehberId: string; notlar: string[] }
    | { kalemId: string; tur: 'engel'; engel: KalemAktarimEngeli; notlar: string[] }
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
        }
      >
    >;
  }>;
  guncellendi: string | null;
}

/** `GET /strateji/v2/onay/:token` (oturumsuz). */
export interface BaglantiBelgesi {
  hal: BaglantiHali;
  okunabilir: boolean;
  karar: boolean;
  /** `okunabilir` değilse null: geçersiz bağlantı belge göstermez. */
  belge: StratejiBelgeVerisi | null;
  /** Müşteriye açık yorumlar (ajans içi notlar YOK). */
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

/** `POST …/gonder` yanıtı (rapor gönderiminin `{ kabul, ret }` deseni). */
export interface GonderimSonucu {
  kabul: string[];
  ret: string[];
}

export interface BaglantiListesi {
  baglantilar: OnayBaglantisiOzeti[];
}

// ─── Sözleşmede şeması olmayan istek gövdeleri ──────────────────────────────

export interface BolumlerGovdesi {
  surum: number;
  bolumler: Partial<Record<StratejiBolumKodu, { metin: string; kaynak: 'ajans' }>>;
}

export interface YorumGovdesi {
  surum: number;
  metin: string;
}

export interface GonderGovdesi {
  surum: number;
  alicilar: string[];
}

export type MetinOnerisi = KalemMetni;
