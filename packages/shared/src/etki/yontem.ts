import { ANOMALI } from '../sinyal/anomali';

/**
 * ═══ DEĞİŞİKLİK ETKİSİ — YÖNTEM VE PARAMETRELER (Paket C, B-6) ═══
 *
 * Gerekçe `docs/etki/MIMARI.md` § 6. İlk sürüm BİLEREK sade: FARK İÇİNDE
 * FARK (difference-in-differences), kontrol grubu aynı reklam hesabının
 * değişmeyen varlıkları. Ağır model (BSTS / CausalImpact) YOK: Python ya da
 * R paylaşımlı VPS'e yeni bir ikili bağımlılık demek (CLAUDE.md §1) ve
 * reklam bilmeyen kullanıcıya "%95 güven aralığı" göstermenin karşılığı yok.
 *
 * NEDEN DÜZ ÖNCE/SONRA DEĞİL: değişiklikten sonra maliyet %15 düştüyse bu,
 * değişikliğin değil haftanın (bayram, maaş günü, Meta'nın açık artırması)
 * etkisi olabilir. Aynı hesapta değişmeyen kampanyaların maliyeti de %15
 * düştüyse değişikliğin payı sıfırdır. Kontrol grubu o "her şey birden
 * değişti" payını çıkarıyor.
 *
 * NEDEN ORANLARIN ORANI (log farkı), MUTLAK FARK DEĞİL: deney kampanyası
 * günde 200 ₺, kontrol grubu 5.000 ₺ harcıyor olabilir; mutlak farkları
 * karşılaştırmak ölçeği karıştırır. `(deneySonra/deneyOnce) /
 * (kontrolSonra/kontrolOnce) − 1` ikisini de kendi geçmişine göre ölçüyor.
 *
 * PLASEBO (sahte değişiklik): aynı hesap, değişiklikten ÖNCEKİ iki pencere
 * arasında yapılınca "hiçbir şey değişmemişken" ne kadar fark çıktığını
 * söylüyor. O hesabın olağan gürültüsü. Bulunan etki gürültünün
 * `plaseboKatsayisi` katını geçmiyorsa "henüz belli değil". Hesabı ucuz
 * (dört toplam daha) ve her hesabın gürültüsü farklı olduğu için sabit bir
 * eşikten daha dürüst.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ BÜTÜN SAYILAR CANLI VERİYLE ÖLÇÜLECEK (Ajan 5, MIMARI § 10). Burada   │
 * │ yazanlar Orphex'in kullanıcıya yazdığı parametreler (≥200 tık, 7 gün │
 * │ sonra) ve genel pratikten BAŞLANGIÇ. Ölçümden sonra değer ve ölçümün │
 * │ kendisi (tarih, örneklem, kaç değişiklik "henüz belli değil" kaldı)  │
 * │ buraya yazılır.                                                       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * PLATFORM ÇAĞRISI YOK: her girdi `insights_daily`den. Kota etkisi sıfır.
 */
export const ETKI = {
  /** Değişiklik öncesi pencere (gün). Değişiklik günü HİÇBİR pencereye girmez (yarım gün). ÖLÇÜLECEK. */
  oncesiGun: 14,
  /**
   * Ölçüm noktaları: değişiklikten sonra kaç gün. İlk noktada hacim
   * yetmezse sonraki noktada pencere uzatılarak YENİDEN bakılır; son noktada
   * hâlâ yetmiyorsa sonuç `belirsiz` ve satır kapanır. "Henüz belli değil"
   * böylece gerçekten "henüz" demek oluyor: 7. günde az tıklaması olan
   * küçük bir kampanya 28. günde yeterli hacme ulaşabiliyor. ÖLÇÜLECEK.
   */
  olcumNoktalariGun: [7, 14, 28] as readonly number[],
  /**
   * Dönüşüm gecikmesi: sonrası penceresinin SON günü bu kadar gün
   * olgunlaşmadan ölçülmez (atıf penceresi, `insights_backfill`). Paket A ile
   * AYNI sayı, ayrı bir sabit DEĞİL: biri ölçülüp değiştirildiğinde diğeri
   * eski kalırsa sinyal ile etki aynı dönüşüme iki farklı olgunluk uygular.
   */
  donusumBeklemeGun: ANOMALI.donusumGecikmesiGun,
  /**
   * HACİM EŞİKLERİ — HER PENCERE AYRI AYRI (deney öncesi, deney sonrası,
   * kontrol öncesi, kontrol sonrası). Birinin eksik olması oranı gürültüye
   * çevirir. Tık eşiği Orphex'in yazdığı 200. ÖLÇÜLECEK.
   */
  enAzTiklama: 200,
  /** Dönüşüm başı maliyet için pencere başına en az dönüşüm; altında tıklama başı maliyete düşülür. ÖLÇÜLECEK. */
  enAzDonusum: 15,
  /** Bu orandan küçük etki "fark yok" sayılır (iş için önemsiz). ÖLÇÜLECEK. */
  enAzEtki: 0.15,
  /** Etki, plasebo farkının bu katını geçmeli. ÖLÇÜLECEK. */
  plaseboKatsayisi: 2,
  /**
   * Plasebo için değişiklikten önce gereken ek geçmiş (gün): plasebo
   * `[-oncesiGun-plaseboGun, -oncesiGun-1]` ile `[-oncesiGun, -1]`
   * arasında yapılır. Bu kadar geçmişi olmayan hesapta plasebo yok ve eşik
   * yalnız `enAzEtki`; ekran "kıyas için geçmiş kısa" der.
   */
  plaseboGun: 14,
  /** Keşif geriye bu kadar gün bakar (deploy günü geçmiş değişiklikler de ölçülsün). */
  kesifGeriyeGun: 60,
} as const;

// ─── Ölçüm kapsamı ───────────────────────────────────────────────────────────

export const DEGISIKLIK_TURLERI = ['durdur', 'butce_artir', 'butce_azalt'] as const;
export type DegisiklikTuru = (typeof DEGISIKLIK_TURLERI)[number];

export const DEGISIKLIK_TURU_ADI: Record<DegisiklikTuru, string> = {
  durdur: 'Durduruldu',
  butce_artir: 'Bütçe artırıldı',
  butce_azalt: 'Bütçe azaltıldı',
};

/** Değiştirilen varlığın seviyesi. Hesap seviyesinde yazma yolu yok. */
export type DegisiklikSeviyesi = 'campaign' | 'ad_group' | 'ad';
/** Ölçülen kapsamın seviyesi. */
export type KapsamSeviyesi = 'account' | 'campaign' | 'ad_group';

export interface OlcumKapsami {
  seviye: KapsamSeviyesi;
  /** Kapsam değişen varlığın kendisi mi, üstü mü. */
  hangi: 'kendisi' | 'ustu';
  /**
   * Kontrol grubu kurulabilir mi. Hesap seviyesinde kurulamaz: kontrol
   * "aynı hesabın değişmeyen varlıkları" ve hesabın kendisi ölçülüyorsa
   * dışarıda kalan bir şey yok.
   */
  kontrol: boolean;
  /**
   * Kontrolden ÇIKARILACAK komşular. Meta'da kampanya bütçesi (CBO) bir
   * reklam setini durdurunca bütçeyi KARDEŞ setlere aktarıyor: aynı
   * kampanyanın diğer setleri değişiklikten etkilenmiş olur ve kontrol
   * değil deneyin parçasıdır. Onları kontrole koymak etkiyi yarıya indirir
   * ve hiçbir hata vermez.
   */
  kontroldenCikar: 'yok' | 'ayni_kampanyanin_setleri';
}

/**
 * NEYİ ÖLÇÜYORUZ? Kural tek cümle: BÜTÇE değişikliğinde varlığın KENDİSİ,
 * DURDURMADA varlığın ÜSTÜ.
 *
 * Durdurulan varlığın kendi metriği sıfıra iner; "durdurduktan sonra
 * maliyeti düştü" bir ölçüm değil, bir tanım. Durdurmanın sorusu "geri
 * kalanı daha verimli çalıştı mı": yorgun reklamı durdurmanın etkisi reklam
 * setinde, seti durdurmanın etkisi kampanyada görünür. Kampanyayı durdurmanın
 * üstü hesap ve hesabın kontrol grubu yok (`kontrol: false`): o değişiklik
 * "ölçülemedi · karşılaştırma grubu yok" olarak kapanır ama durmadan önceki
 * harcama ekranda gözlem olarak yazılır (`EtkiGozlemi`).
 */
export function olcumKapsami(tur: DegisiklikTuru, seviye: DegisiklikSeviyesi): OlcumKapsami {
  if (tur !== 'durdur') {
    // Reklamın bütçesi yok (campaign-actions bunu zaten reddediyor); gelirse kendisi değil üstü.
    if (seviye === 'ad') return { seviye: 'ad_group', hangi: 'ustu', kontrol: true, kontroldenCikar: 'ayni_kampanyanin_setleri' };
    if (seviye === 'ad_group') return { seviye: 'ad_group', hangi: 'kendisi', kontrol: true, kontroldenCikar: 'ayni_kampanyanin_setleri' };
    return { seviye: 'campaign', hangi: 'kendisi', kontrol: true, kontroldenCikar: 'yok' };
  }
  if (seviye === 'ad') return { seviye: 'ad_group', hangi: 'ustu', kontrol: true, kontroldenCikar: 'ayni_kampanyanin_setleri' };
  if (seviye === 'ad_group') return { seviye: 'campaign', hangi: 'ustu', kontrol: true, kontroldenCikar: 'yok' };
  return { seviye: 'account', hangi: 'ustu', kontrol: false, kontroldenCikar: 'yok' };
}

// ─── Pencereler ──────────────────────────────────────────────────────────────

export interface GunAraligi {
  /** `YYYY-MM-DD`, dahil. */
  bas: string;
  /** `YYYY-MM-DD`, dahil. */
  son: string;
}

export interface EtkiPencereleri {
  /** Plasebonun "öncesi"; geçmiş yoksa ekranda yazılır, hesap yine yapılır. */
  plasebo: GunAraligi;
  once: GunAraligi;
  sonra: GunAraligi;
  /** Bu noktanın hesaplanabileceği en erken gün (sonra.son + dönüşüm bekleme + 1). */
  hesaplanabilir: string;
}

function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Değişiklik gününden pencereler. `degisiklikGunu` HESABIN zaman diliminde
 * olmalı (`insights_daily.date` öyle yazılıyor): değişiklik anını UTC
 * günüyle eşlemek, gece 01:00 İstanbul'da yapılan değişikliği bir önceki
 * güne yazar ve o günün yarısı "öncesi" sayılırdı.
 *
 * DEĞİŞİKLİK GÜNÜ İKİ PENCEREYE DE GİRMEZ: günün bir kısmı eski, bir kısmı
 * yeni ayarla geçti. Birine koymak etkiyi o yöne kaydırır.
 */
export function etkiPencereleri(degisiklikGunu: string, noktaGun: number): EtkiPencereleri {
  const once = { bas: gunEkle(degisiklikGunu, -ETKI.oncesiGun), son: gunEkle(degisiklikGunu, -1) };
  const plasebo = { bas: gunEkle(once.bas, -ETKI.plaseboGun), son: gunEkle(once.bas, -1) };
  const sonra = { bas: gunEkle(degisiklikGunu, 1), son: gunEkle(degisiklikGunu, noktaGun) };
  return { plasebo, once, sonra, hesaplanabilir: gunEkle(sonra.son, ETKI.donusumBeklemeGun + 1) };
}

// ─── Toplamlar ve metrik ─────────────────────────────────────────────────────

/**
 * Bir pencerenin toplamı. Para hesap para biriminde ve micros DEĞİL
 * (oranlarda birim sadeleşiyor; ekrandaki metni API biçimliyor).
 * `gun` pencerenin gün sayısı: sayımlar günlük ortalamaya çevrilirken
 * kullanılır, öncesi 14 sonrası 7 gün olduğu için ZORUNLU.
 */
export interface PencereToplami {
  gun: number;
  harcama: number;
  tiklama: number;
  donusum: number;
}

export const ETKI_METRIKLERI = ['donusum_basi_maliyet', 'tiklama_basi_maliyet', 'gunluk_harcama', 'gunluk_donusum'] as const;
export type EtkiMetrigi = (typeof ETKI_METRIKLERI)[number];

export const ETKI_METRIK_TANIMI: Record<EtkiMetrigi, { ad: string; dusukIyi: boolean }> = {
  donusum_basi_maliyet: { ad: 'Dönüşüm başı maliyet', dusukIyi: true },
  tiklama_basi_maliyet: { ad: 'Tıklama başı maliyet', dusukIyi: true },
  gunluk_harcama: { ad: 'Günlük maliyet', dusukIyi: false },
  gunluk_donusum: { ad: 'Günlük dönüşüm', dusukIyi: false },
};

/** Metriğin değeri; payda sıfırsa `null` (uydurma bir sıfır üretme). */
export function metrikDegeri(m: EtkiMetrigi, t: PencereToplami): number | null {
  if (m === 'donusum_basi_maliyet') return t.donusum > 0 ? t.harcama / t.donusum : null;
  if (m === 'tiklama_basi_maliyet') return t.tiklama > 0 ? t.harcama / t.tiklama : null;
  if (t.gun <= 0) return null;
  return m === 'gunluk_harcama' ? t.harcama / t.gun : t.donusum / t.gun;
}

/**
 * HÜKÜM METRİĞİ. Reklam verimliliğinin ölçüsü dönüşüm başı maliyet; dönüşüm
 * azsa tıklama başı maliyete düşülür ve ekran bunu SÖYLER ("dönüşüm az,
 * tıklama maliyetine bakıldı"). İkisi de yetmiyorsa `null` = hacim yetersiz.
 *
 * Eşik HER pencereye ayrı uygulanır: dört pencereden birindeki 3 dönüşüm,
 * oranı tek bir dönüşümün düşüp düşmemesine bağlar.
 */
export function hukumMetrigi(pencereler: readonly PencereToplami[]): 'donusum_basi_maliyet' | 'tiklama_basi_maliyet' | null {
  if (pencereler.length === 0) return null;
  if (pencereler.every((p) => p.donusum >= ETKI.enAzDonusum)) return 'donusum_basi_maliyet';
  if (pencereler.every((p) => p.tiklama >= ETKI.enAzTiklama)) return 'tiklama_basi_maliyet';
  return null;
}

/**
 * Fark içinde fark, oran olarak: `(dS/dÖ) / (kS/kÖ) − 1`. Kontrol yoksa
 * düz önce/sonra (`dS/dÖ − 1`); ÇAĞIRAN bunu hükme çevirmez, yalnız gözlem
 * olarak yazar. Herhangi bir değer `null`/0 ise `null`.
 */
export function farkIcindeFark(
  m: EtkiMetrigi,
  deney: { once: PencereToplami; sonra: PencereToplami },
  kontrol: { once: PencereToplami; sonra: PencereToplami } | null,
): number | null {
  const dO = metrikDegeri(m, deney.once);
  const dS = metrikDegeri(m, deney.sonra);
  if (dO === null || dS === null || dO === 0) return null;
  const deneyOrani = dS / dO;
  if (!kontrol) return deneyOrani - 1;
  const kO = metrikDegeri(m, kontrol.once);
  const kS = metrikDegeri(m, kontrol.sonra);
  if (kO === null || kS === null || kO === 0 || kS === 0) return null;
  return deneyOrani / (kS / kO) - 1;
}

// ─── Hüküm ───────────────────────────────────────────────────────────────────

/**
 * Sonuç sınıfları. `henuz_belli_degil` ARA sonuç (bir sonraki ölçüm
 * noktası bekleniyor); `belirsiz` SON sonuç (son noktada da yetmedi).
 * İkisini tek değerde birleştirmek "bekliyor muyuz, vazgeçtik mi" sorusunu
 * cevapsız bırakırdı.
 */
export const ETKI_SONUCLARI = ['iyilesti', 'kotulesti', 'fark_yok', 'henuz_belli_degil', 'belirsiz'] as const;
export type EtkiSonucu = (typeof ETKI_SONUCLARI)[number];

export const ETKI_SONUCU_ADI: Record<EtkiSonucu, string> = {
  iyilesti: 'İyileşti',
  kotulesti: 'Kötüleşti',
  fark_yok: 'Belirgin fark yok',
  henuz_belli_degil: 'Henüz belli değil',
  belirsiz: 'Belli olmadı',
};

/** Neden belli değil / ölçülemedi — ekranda ayrı cümle (`emptyReason` deseni). */
export const ETKI_NEDENLERI = [
  /** Pencerelerden birinde tık/dönüşüm eşiğin altında. */
  'hacim_yetersiz',
  /** Etki, hesabın olağan dalgalanmasından (plasebo) ayırt edilemiyor. */
  'gurultulu',
  /** Kapsam hesap seviyesinde ya da kontrol eşiğini geçen değişmemiş varlık yok. */
  'kontrol_grubu_yok',
  /** Pencere içinde aynı kapsamda başka bir değişikliğimiz var; etkiler ayrılamıyor. */
  'karisik',
  /** Değişiklik platformda geri okumayla doğrulanmadı (`uyusmadi`). */
  'dogrulanmadi',
  /** Reklam hesabı ölçüm penceresinde başka workspace'e taşındı. */
  'hesap_tasindi',
  /** Kapsamın `insights_daily` satırı yok (varlık silinmiş ya da çekilmemiş). */
  'veri_yok',
] as const;
export type EtkiNedeni = (typeof ETKI_NEDENLERI)[number];

export interface EtkiGirdisi {
  deney: { plasebo: PencereToplami | null; once: PencereToplami; sonra: PencereToplami };
  /** `null` = kontrol kurulamadı (kapsam hesap ya da uygun varlık yok). */
  kontrol: { plasebo: PencereToplami | null; once: PencereToplami; sonra: PencereToplami } | null;
  /** Bu, son ölçüm noktası mı (`ETKI.olcumNoktalariGun` sonu). */
  sonNokta: boolean;
}

export type EtkiHukmu =
  | {
      sonuc: Exclude<EtkiSonucu, 'henuz_belli_degil' | 'belirsiz'>;
      metrik: 'donusum_basi_maliyet' | 'tiklama_basi_maliyet';
      /** İşaretli oran (−0,18 = %18 düştü). */
      etki: number;
      /** Kullanılan eşik (gürültü dahil). */
      esik: number;
      /** Plasebo farkı; geçmiş yetmediyse `null`. */
      plasebo: number | null;
      neden: null;
    }
  | {
      sonuc: 'henuz_belli_degil' | 'belirsiz';
      metrik: 'donusum_basi_maliyet' | 'tiklama_basi_maliyet' | null;
      etki: number | null;
      esik: number | null;
      plasebo: number | null;
      neden: 'hacim_yetersiz' | 'gurultulu' | 'kontrol_grubu_yok';
    };

/**
 * Tek ölçüm noktası için hüküm. SAF: iş bunu çağırır, test ÇALIŞTIRARAK
 * sınar. Sıra bilinçli ve ekrandaki "neden belli değil" cümlesi bu sıradan
 * gelir: kontrol var mı → hacim yeter mi → etki gürültüden büyük mü →
 * önemli mi → yön.
 *
 * `karisik`, `dogrulanmadi`, `hesap_tasindi`, `veri_yok` burada DEĞİL:
 * onlar ölçüme hiç başlamadan verilen kararlar (`olculemedi`), hesaplama
 * işi bu fonksiyonu çağırmadan önce onlara bakar. Ölçüm yapıp sonra
 * "karışıktı" demek, kullanıcıya bir sayı gösterip geri almak olurdu.
 */
export function etkiHukmu(g: EtkiGirdisi): EtkiHukmu {
  const kapanis = g.sonNokta ? 'belirsiz' : 'henuz_belli_degil';
  if (!g.kontrol) return { sonuc: kapanis, metrik: null, etki: null, esik: null, plasebo: null, neden: 'kontrol_grubu_yok' };

  const metrik = hukumMetrigi([g.deney.once, g.deney.sonra, g.kontrol.once, g.kontrol.sonra]);
  if (!metrik) return { sonuc: kapanis, metrik: null, etki: null, esik: null, plasebo: null, neden: 'hacim_yetersiz' };

  const etki = farkIcindeFark(metrik, g.deney, g.kontrol);
  if (etki === null) return { sonuc: kapanis, metrik, etki: null, esik: null, plasebo: null, neden: 'hacim_yetersiz' };

  /*
   * PLASEBO: aynı hesaplama, değişiklikten ÖNCEKİ iki pencere arasında.
   * Plasebo pencereleri hacim eşiğini geçmiyorsa plasebo YOK sayılır
   * (gürültülü bir plasebo eşiği şişirip her şeyi "belli değil" yapardı)
   * ve eşik yalnız `enAzEtki` kalır.
   */
  let plasebo: number | null = null;
  if (g.deney.plasebo && g.kontrol.plasebo && hukumMetrigi([g.deney.plasebo, g.kontrol.plasebo]) !== null) {
    plasebo = farkIcindeFark(
      metrik,
      { once: g.deney.plasebo, sonra: g.deney.once },
      { once: g.kontrol.plasebo, sonra: g.kontrol.once },
    );
  }
  const esik = Math.max(ETKI.enAzEtki, plasebo === null ? 0 : ETKI.plaseboKatsayisi * Math.abs(plasebo));

  if (Math.abs(etki) < esik) {
    /*
     * KÜÇÜK ETKİ İKİ FARKLI ŞEY: gürültü sakin ve etki küçükse bu bir
     * cevap ("belirgin fark yok"); gürültü eşiği büyütmüşse ve etki
     * `enAzEtki`yi geçiyorsa cevap yok ("henüz belli değil · gürültülü").
     * İkisini birleştirmek, gerçek bir %25'lik iyileşmeyi gürültülü bir
     * hesapta "fark yok" diye kapatırdı.
     */
    if (Math.abs(etki) < ETKI.enAzEtki) return { sonuc: 'fark_yok', metrik, etki, esik, plasebo, neden: null };
    return { sonuc: kapanis, metrik, etki, esik, plasebo, neden: 'gurultulu' };
  }
  const iyi = ETKI_METRIK_TANIMI[metrik].dusukIyi ? etki < 0 : etki > 0;
  return { sonuc: iyi ? 'iyilesti' : 'kotulesti', metrik, etki, esik, plasebo, neden: null };
}

// ─── Karışık değişiklik ──────────────────────────────────────────────────────

export interface KapsamDegisikligi {
  /** Değişiklik günü (hesap TZ). */
  gun: string;
  tur: DegisiklikTuru;
}

/**
 * Bu değişikliğin etkisi diğerlerinden ayrılabilir mi? Aynı kapsamda,
 * plasebo başından O ANKİ ölçüm noktasının sonuna kadar BAŞKA bir
 * değişikliğimiz varsa ayrılamaz (`karisik`). Nokta parametre: 7. günde
 * hükme bağlanmış bir değişiklik, 10. günde gelen ikinci değişiklikle
 * geriye dönük "karışık" olmaz; ama 7. günde "henüz belli değil" kalıp
 * 14. güne uzatılan pencereye düşen değişiklik onu karıştırır. Plasebo dahil: öncesi
 * penceresinde başka bir bütçe değişikliği varsa "önce" zaten temiz değil.
 *
 * İSTİSNA, AYNI GÜN AYNI TÜR: İyileştir yorgun iki reklamı aynı gün aynı
 * setten durdurabiliyor. Onları "karışık" saymak en sık senaryoyu ölçülemez
 * yapardı; ikisi BİRLİKTE ölçülür ve ekran "2 değişiklik birlikte ölçüldü"
 * der. Aynı gün ARTIR + AZALT ise gerçekten karışık.
 *
 * "Aynı kapsam" kararını (hiyerarşi) çağıran SQL'de verir; buraya yalnız o
 * kapsama düşen DİĞER değişiklikler gelir.
 */
export function karisikMi(bu: KapsamDegisikligi, digerleri: readonly KapsamDegisikligi[], noktaGun: number): boolean {
  const p = etkiPencereleri(bu.gun, noktaGun);
  return digerleri.some((d) => {
    if (d.gun < p.plasebo.bas || d.gun > p.sonra.son) return false;
    return !(d.gun === bu.gun && d.tur === bu.tur);
  });
}

/** Aynı gün aynı türdeki kardeşler: birlikte ölçülür. */
export function birlikteOlculenler(bu: KapsamDegisikligi, digerleri: readonly KapsamDegisikligi[]): number {
  return digerleri.filter((d) => d.gun === bu.gun && d.tur === bu.tur).length;
}
