/**
 * Reklam modülünün hazırlık okuması (TASARIM.md § 01.2 "Reklam hazırlığı").
 *
 * TEK UÇ, TEK TİP: akış açılırken hesap, sayfa, Instagram, görsel, marka ve
 * kitle bilgisi tek istekte geliyor. Eski Hızlı Reklam yedi ayrı uca gidip
 * her birinin düşüşünü ayrı yorumluyordu; yeni modül eski uçlara bağlı
 * KALMIYOR (kullanıcı kararı 2026-10-07, "tamamen ayrı modül") — eskiler
 * Aşama 7'de silinince bu tip etkilenmemeli.
 *
 * Her parça kendi `hata` alanını taşıyor: "okunamadı" ile "tanımlı değil"
 * farklı iş (CLAUDE.md, `.catch(() => [])` yasağı).
 */
import type { HedefKonum, OzelKategori } from './meta/hedefleme';

export interface HazirlikHesabi {
  id: string;
  ad: string;
  paraBirimi: string;
  saatDilimi: string;
}

export interface HazirlikProfili {
  id: string;
  ad: string;
  /** Instagram hesabı için bağlı Facebook sayfasının platform kimliği. */
  ustSayfaPlatformId: string | null;
}

export interface HazirlikGorseli {
  id: string;
  ad: string;
  onizlemeAdresi: string;
  genislik: number;
  yukseklik: number;
}

export interface ReklamHazirligi {
  hesaplar: HazirlikHesabi[];
  sayfalar: HazirlikProfili[];
  instagramHesaplari: HazirlikProfili[];
  gorseller: { satirlar: HazirlikGorseli[]; toplam: number };
  marka: {
    yasalUyari: string | null;
    metinSablonlari: string[];
    /** Marka Merkezi profili hiç kurulmamışsa `false`. */
    profilVar: boolean;
  };
  /**
   * Varsayılan kitle şablonu; tanımlı değilse `null`. `konumlar` taslağa
   * KOPYA yazılır ("Marka Merkezi'nden"), referans değil: şablon sonradan
   * değişirse açık taslak sessizce değişmez.
   */
  varsayilanKitle: { id: string; ad: string; ozet: string; konumlar: HedefKonum[] } | null;
  /**
   * Müşteri kartındaki özel kategori TABANI. Taslakta düşürülemez; ekranda
   * kilitli çip olarak görünür. Eski `CREDIT` değeri Meta'nın halefi
   * `FINANCIAL_PRODUCTS_SERVICES` olarak okunuyor (Aşama 0b veriyi kalıcı
   * çevirecek); tanınmayan değer DÜŞÜRÜLMEZ, `tanınmayanKategoriler`de durur.
   */
  ozelKategoriTabani: OzelKategori[];
  taninmayanKategoriler: string[];
}

/** Görsel listesi bu sayıda kesiliyor ve `toplam` ayrıca yazılıyor. */
export const HAZIRLIK_GORSEL_SINIRI = 60;
