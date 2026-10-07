import type {
  Hucre,
  KurulumOzeti,
  KurulumSatiri,
  MusteriOzeti,
  OnayKapisiSonucu,
  OneriKarti,
  PilotPlanDurumu,
  PilotPlanEylemi,
  PlanOnerisi,
  UyumBulgusu,
  UyumDurumu,
  UyumIsareti,
  YayinKipi,
} from '@advetics/shared';

/**
 * ═══ PİLOT UÇLARININ YANIT BİÇİMİ — SÖZLEŞME BEKLİYOR ═══
 *
 * `packages/shared/src/pilot/` uçların YOLUNU ve İZNİNİ (`PILOT_UCLARI`) ve
 * içerik tiplerini (`PlanOnerisi`, `MusteriOzeti`, `OneriKarti`…) taşıyor ama
 * YANIT ZARFINI taşımıyor: `GET /pilot/planlar/:id` neyi hangi alanda
 * döndürüyor, liste "gösterilen/toplam"ı nerede söylüyor, yazılmamış.
 * Ajan 3 tip tanımlamaz; bu dosya bir tanım değil, panelin BEKLEDİĞİ biçimin
 * tek yazılı hâli. Ajan 1 bunu sözleşmeye taşıdığında dosya silinir ve
 * içe aktarmalar `@advetics/shared`a döner. Biçimi ayrı ayrı bileşenlere
 * dağıtmak, sözleşme gelince hangisinin eskidiğini bulmayı imkânsız kılardı.
 *
 * İÇERİK ALANLARI SÖZLEŞMEDEN: burada yeni bir içerik tipi yok, yalnız
 * sözleşmenin tiplerini taşıyan kutular.
 */

/** Panelin çizdiği eylemler: sözleşmedeki plan eylemleri + yazma uçları. */
export type PilotEkranEylemi =
  | Extract<PilotPlanEylemi, 'musteriye_gonder' | 'geri_cek' | 'yeniden_dene' | 'kapat' | 'iptal' | 'onayla' | 'degisiklik_iste'>
  | 'degistir'
  | 'yeniden_hazirla'
  | 'uyum_isaret';

export interface PilotPlanSatiriOzeti {
  id: string;
  donem: string;
  durum: PilotPlanDurumu;
  surum: number;
  toplamMicros: string | null;
  paraBirimi: string | null;
  guncellendi: string;
}

/** `GET /pilot/planlar` — sessiz kesme yok: gösterilen ve toplam ayrı. */
export interface PilotPlanListesi {
  planlar: PilotPlanSatiriOzeti[];
  gosterilen: number;
  toplam: number;
}

/** `GET /pilot/planlar/:id`. */
export interface PilotPlanDetayi {
  plan: {
    id: string;
    clientId: string;
    donem: string;
    durum: PilotPlanDurumu;
    surum: number;
    /** `planKanonikIcerik` SHA-256'sı; onay isteği bunu geri taşır. */
    icerikOzeti: string;
    yayinKipi: YayinKipi | null;
    onay: { rol: 'musteri' | 'ajans'; zaman: string; kim: string | null; gerekce: string | null } | null;
    /** Müşterinin son "değişiklik iste" notu. */
    musteriNotu: string | null;
    guncellendi: string;
  };
  icerik: PlanOnerisi;
  musteriOzeti: MusteriOzeti | null;
  /** İsteği yapan kişinin bu plandaki rolü (sunucu söyler, panel tahmin etmez). */
  rol: 'musteri' | 'ajans';
  /** Durum × yetki kararı SUNUCUDA; panel düğmeleri yalnız buradan çizer. */
  yapilabilir: PilotEkranEylemi[];
  /** Onay kapısının şu anki cevabı (sunucu koşar); müşteriye `musteriMesaji`, ajansa `ajansMesaji`. */
  onayKapisi: OnayKapisiSonucu | null;
  /** Yalnız ajans rolünde dolu; müşteriye uyum ayrıntısı gitmez. */
  uyum: { durum: UyumDurumu; bulgular: UyumBulgusu[]; isaretler: UyumIsareti[] } | null;
}

/** `POST /pilot/planlar/hazirla` cevabı. */
export interface PilotHazirlaYaniti {
  id: string;
}

/** `GET /pilot/planlar/:id/kurulum`. */
export interface PilotKurulumYaniti {
  plan: { id: string; donem: string; durum: PilotPlanDurumu; yayinKipi: YayinKipi | null };
  ozet: KurulumOzeti;
  satirlar: KurulumSatiri[];
  yapilabilir: PilotEkranEylemi[];
}

/** `GET /pilot/bugun`. */
export interface PilotBugun {
  paraBirimi: string | null;
  /** Son tarama; hiç koşmadıysa `null` ("istenmedi" ile "sonuç yok" ayrı). */
  sonTarama: {
    bitis: string;
    kartSayisi: number;
    taranan: { reklam: number; kelime: number; terim: number };
    not: string | null;
  } | null;
  dun: { harcamaMicros: Hucre<string>; sonuc: Hucre<number>; sonucBasiMicros: Hucre<string> };
  ay: { butceMicros: Hucre<string>; harcananMicros: Hucre<string>; gecenGun: number; ayGun: number };
}

/**
 * Öneri listesi boşsa NEDENİ. `BOS_NEDENLERI` plan hücreleri için; tarama
 * hâlleri orada yok ve dördü farklı iş: hiç koşmadı (bekle), düştü (sebebi
 * oku), koştu ve kart yok (iyi haber), bu süzgeçte yok.
 */
export type OneriBosNedeni = 'tarama_kosmadi' | 'tarama_dustu' | 'oneri_yok' | 'suzgecte_yok';

/** `GET /pilot/oneriler`. */
export interface PilotOneriListesi {
  kartlar: OneriKarti[];
  gosterilen: number;
  toplam: number;
  emptyReason: OneriBosNedeni | null;
  /** `tarama_dustu`ta platformun ya da işçinin mesajı. */
  taramaMesaji: string | null;
}

