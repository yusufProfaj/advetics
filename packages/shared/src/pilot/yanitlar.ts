import type { Hucre } from './kaynak';
import type { KurulumOzeti, KurulumSatiri } from './kurulum';
import type { MusteriOzeti, OnayKapisiSonucu, YayinKipi } from './onay';
import type { OneriKarti } from './oneri';
import type { PilotPlanDurumu, PilotPlanEylemi, PlanOnerisi } from './plan';
import type { UyumBulgusu, UyumDurumu, UyumIsareti } from './uyum';
import type { OzelKategori } from '../reklam/meta/hedefleme';
import type { UyumSektoru } from '../uyum/tipler';

/**
 * ═══ PİLOT UÇLARININ YANIT ZARFI (Ajan 2 eki, 2026-10-07) ═══
 *
 * Sözleşme içerik tiplerini taşıyordu, zarfı değil; panel (Ajan 3) zarfı
 * `apps/web/src/components/pilot/yanitlar.ts`e yazdı ve "Ajan 1 sözleşmeye
 * taşıyınca silinir" dedi. Bu dosya o biçimin BİREBİR kopyası ve sunucu
 * uçları bunu döndürüyor; panel içe aktarmasını buraya çevirdiğinde web
 * kopyası silinmeli (iki kopya ilk değişiklikte ayrışır —
 * `pilot-yanit.spec.ts` ikisini metin olarak karşılaştırıyor).
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
  /** `surum`: "Şimdi kur" eylemi plan sayfasıyla aynı gövdeyi taşısın diye. */
  plan: { id: string; donem: string; durum: PilotPlanDurumu; surum: number; yayinKipi: YayinKipi | null };
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

/** ═══ EK ZARFLAR (Ajan 2, 2026-10-07) — panel kopyasında henüz yok; karşılaştırma bu başlıkta durur ═══ */

/** `GET|PUT /pilot/gercek-yayin`. Müşteri hesabı bu ucu hiç görmez. */
export interface PilotGercekYayinDurumu {
  /** Ajans şirketinin anahtarı; okunamazsa `false` (KAPALI) ve `okunamadi` dolu. */
  acik: boolean;
  /** Anahtarı son değiştiren (ad; kullanıcı silindiyse null), zamanı ve sebebi. */
  degistiren: string | null;
  zaman: string | null;
  sebep: string | null;
  /** Okuyan kişi anahtarı değiştirebilir mi (ajans şirketinin yöneticisi). */
  degistirebilir: boolean;
  /** Okuma düştüyse sebebi; o durumda kip TEST kabul edilir. */
  okunamadi: string | null;
}

/** `GET|PUT /pilot/workspace-beyani`. */
export interface PilotWorkspaceBeyani {
  clientId: string;
  /** `null` = soru hiç cevaplanmadı; `[]` = "hiçbiri" beyanı. */
  ozelKategoriler: OzelKategori[] | null;
  /** Kaydı tanınmayan bir kategori taşıyorsa (eski veri) burada; beyan yeniden yapılmalı. */
  taninmayanKategoriler: string[];
  beyan: { kim: string | null; zaman: string } | null;
  sektor: string | null;
  /** Denetçinin sektörü nasıl okuduğu (`sektorCoz`); null = beyan yok. */
  sektorEslesmesi: UyumSektoru[] | null;
  duzenleyebilir: boolean;
}
