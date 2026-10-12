/**
 * ═══ ETİKETLEME DURUMU + MALİYET BEKÇİSİ + İŞ SONUCU ═══
 *
 * Üçü aynı dosyada çünkü aynı soruyu cevaplıyorlar: "bu kreatif neden hâlâ
 * etiketsiz?" Cevap ya sınır doldu, ya geçici bir hata, ya kalıcı bir engel;
 * üçünün yapılacak işi farklı ve üçü de ekranda AYRI cümle (CLAUDE.md
 * "boş liste NEDENİNİ söylesin").
 */

// ─── Kreatif içeriği durum makinesi ─────────────────────────────────────────

export const ICERIK_DURUMLARI = ['bekliyor', 'etiketlendi', 'etiketlenemez'] as const;
export type IcerikDurumu = (typeof ICERIK_DURUMLARI)[number];

/** Son durumlar: iş bunları bir daha seçmez. Sayan her yer bu listeyi okur. */
export const ICERIK_SON_DURUMLARI: readonly IcerikDurumu[] = ['etiketlendi', 'etiketlenemez'];

/**
 * KALICI nedenler: tekrar denemek sonucu değiştirmez, kota harcar.
 * Her biri ekranda kendi cümlesiyle (`ETIKETLENEMEZ_CUMLESI`).
 */
export const ETIKETLENEMEZ_NEDENLERI = [
  /** Google arama reklamı: görseli yok ve olmayacak. Hata değil, kapsam. */
  'metin_reklami',
  /** Platform bu kreatif için görsel adresi döndürmüyor (ör. PMax, katalog). */
  'gorsel_yok',
  /** Platform desteklenmiyor (LinkedIn v1). */
  'platform_disi',
  /** Gövde JPEG/PNG/WebP değil. */
  'bicim',
  /** `GORU_AYARI.maxBayt` üstü. */
  'boyut',
  /** Gemini güvenlik engeli (`sebep: 'ret'`). */
  'gemini_ret',
  /** İki denemede de şema dışı cevap. */
  'sema_disi',
  /** Geçici hata `ETIKET_EN_FAZLA_DENEME` kez tekrarlandı. */
  'deneme_tukendi',
] as const;
export type EtiketlenemezNedeni = (typeof ETIKETLENEMEZ_NEDENLERI)[number];

export const ETIKETLENEMEZ_CUMLESI: Record<EtiketlenemezNedeni, string> = {
  metin_reklami: 'Metin reklamı, görseli yok',
  gorsel_yok: 'Platform görsel vermiyor',
  platform_disi: 'Bu platformda etiketleme yok',
  bicim: 'Görsel biçimi desteklenmiyor',
  boyut: 'Görsel çok büyük',
  gemini_ret: 'Yapay zekâ görseli işlemedi',
  sema_disi: 'Yapay zekâ cevabı okunamadı',
  deneme_tukendi: 'Üç denemede de alınamadı',
};

/**
 * GEÇİCİ nedenler: satır `bekliyor`da kalır, `deneme` artar, sonraki işte
 * yeniden seçilir. Sınıra varınca `deneme_tukendi` ile kapanır (sonsuz
 * deneme yok, `succeeded + rows=0` döngüsü yok).
 */
export const GECICI_NEDENLER = ['gemini_kota', 'gemini_ulasilamadi', 'adres_alinamadi', 'indirme_dustu', 'platform_kotasi'] as const;
export type GeciciNeden = (typeof GECICI_NEDENLER)[number];

export const ETIKET_EN_FAZLA_DENEME = 3;

export type IcerikOlayi =
  | { tur: 'etiketlendi' }
  | { tur: 'kalici'; neden: EtiketlenemezNedeni }
  | { tur: 'gecici'; neden: GeciciNeden }
  /** Etiket şeması sürümü arttı: eski etiketler yeniden sıraya girer. */
  | { tur: 'sema_yukseldi' };

export interface IcerikHali {
  durum: IcerikDurumu;
  deneme: number;
  neden: EtiketlenemezNedeni | GeciciNeden | null;
}

/**
 * Tek geçiş fonksiyonu. Geçici hatanın sayacı BURADA artıyor ve sınırı
 * burada kontrol ediliyor: sayacı artıran yer ile sınırı okuyan yer ayrı
 * olsaydı biri unutulup satır sonsuza kadar `bekliyor` kalırdı.
 */
export function icerikGecisi(h: IcerikHali, o: IcerikOlayi): IcerikHali {
  switch (o.tur) {
    case 'etiketlendi':
      return { durum: 'etiketlendi', deneme: h.deneme + 1, neden: null };
    case 'kalici':
      return { durum: 'etiketlenemez', deneme: h.deneme + 1, neden: o.neden };
    case 'gecici': {
      const deneme = h.deneme + 1;
      if (deneme >= ETIKET_EN_FAZLA_DENEME) return { durum: 'etiketlenemez', deneme, neden: 'deneme_tukendi' };
      return { durum: 'bekliyor', deneme, neden: o.neden };
    }
    case 'sema_yukseldi':
      // Yalnız etiketlenmiş satır yeniden sıraya girer; kalıcı engeller (metin
      // reklamı, biçim) şema değişince de engel.
      return h.durum === 'etiketlendi' ? { durum: 'bekliyor', deneme: 0, neden: null } : h;
  }
}

// ─── Maliyet bekçisi ────────────────────────────────────────────────────────

/**
 * SINIRLAR. Sayılar BAŞLANGIÇ; ölçüm betiği (§ 9.1) kreatif başına maliyeti
 * söyleyince güncellenir ve ölçüm buraya yazılır.
 *
 * - `workspaceGunluk`: ilk atamada 90 günlük geçmişte yüzlerce kreatif
 *   çıkabilir; hepsini bir gecede etiketlemek bir müşterinin bütün aylık
 *   payını bir günde yer. Günde 40 ile 200 kreatiflik bir hesap 5 günde
 *   biter ve en çok harcayanlar ilk gün gelir (iş harcamaya göre sıralı).
 * - `workspaceAylik`: maliyetin tavanı.
 * - `kureselGunluk`: Gemini anahtarı TEK ve ürünün diğer işleri de (AI
 *   Asistan, AdvCampaign, reklam metni) aynı kotayı kullanıyor. Kreatif
 *   etiketlemesi arka plan işi; kullanıcının ekranda beklediği sohbetin
 *   kotasını yiyemez.
 * - `briefGunluk`: brief kullanıcı düğmesiyle, ama düğmeye on kez basmak on
 *   çağrı demek. Aynı girdinin brief'i zaten önbellekten döner (`girdiOzeti`).
 */
export const ETIKET_SINIRI = {
  workspaceGunluk: 40,
  workspaceAylik: 400,
  kureselGunluk: 1500,
  briefGunluk: 5,
} as const;

export interface SayacDurumu {
  workspaceBugun: number;
  workspaceBuAy: number;
  kureselBugun: number;
}

export const BEKCI_RET_NEDENLERI = ['workspace_gunluk', 'workspace_aylik', 'kuresel_gunluk'] as const;
export type BekciRetNedeni = (typeof BEKCI_RET_NEDENLERI)[number];

/**
 * ÇAĞRIDAN ÖNCE sorulur, maliyeti sıfır (CLAUDE.md "önce kontrol, sonra
 * çağrı"). Önce küresel: küresel sınır doluyken workspace'e "senin payın
 * doldu" demek yanlış bir cümle olurdu.
 *
 * BU FONKSİYON TEK BAŞINA YARIŞI ÖNLEMEZ: worker `concurrency: 4` ile dört
 * işi paralel koşturuyor. API tarafında ayırma ATOMİK bir UPDATE ile
 * yapılır (`... SET istek = istek + 1 WHERE istek < sinir RETURNING`), bu
 * fonksiyon ekranın ve işin "neden durdu" cümlesini üretir.
 */
export function bekciKarari(s: SayacDurumu): { izin: true } | { izin: false; neden: BekciRetNedeni } {
  if (s.kureselBugun >= ETIKET_SINIRI.kureselGunluk) return { izin: false, neden: 'kuresel_gunluk' };
  if (s.workspaceBuAy >= ETIKET_SINIRI.workspaceAylik) return { izin: false, neden: 'workspace_aylik' };
  if (s.workspaceBugun >= ETIKET_SINIRI.workspaceGunluk) return { izin: false, neden: 'workspace_gunluk' };
  return { izin: true };
}

// ─── İş sonucu: `succeeded + rows=0` NOTSUZ OLAMAZ ─────────────────────────

export interface EtiketIsSayimi {
  /** Bu koşumda seçilen (bekleyen) içerik sayısı. */
  secilen: number;
  /** Gemini'ye gidip etiketlenen. */
  etiketlendi: number;
  /** İçerik özeti zaten etiketliydi: Gemini'ye gitmeden bağlandı. */
  baglandi: number;
  kalici: number;
  gecici: number;
  /** Bekçi reddi ile ERTELENEN (bir sonraki güne). */
  ertelendi: number;
  bekciNedeni: BekciRetNedeni | null;
}

export type EtiketIsSonucu =
  | { sonuc: 'basarili'; satir: number; not: string }
  /** BullMQ yeniden denesin: iş hiçbir şey yapamadı ve sebep geçici. */
  | { sonuc: 'tekrar_dene'; not: string };

/**
 * İşin `sync_jobs` kaydı. KURAL: satır sayısı 0 ise not BOŞ OLAMAZ ve
 * nedeni söyler (CLAUDE.md "`succeeded` + `rows = 0` BU PROJEDE BİR HATA
 * TÜRÜ"). Tek "tekrar dene" hâli: seçilen vardı, hepsi geçici hatayla
 * düştü (Gemini 429/5xx, adres tazelenemedi). Bekçi reddi tekrar denenmez:
 * sınır yarın açılıyor, beş deneme beş kez aynı reddi alır.
 */
export function etiketIsSonucu(s: EtiketIsSayimi): EtiketIsSonucu {
  const satir = s.etiketlendi + s.baglandi + s.kalici;
  const parcalar: string[] = [];
  if (s.etiketlendi) parcalar.push(`${s.etiketlendi} etiketlendi`);
  if (s.baglandi) parcalar.push(`${s.baglandi} önceki etiketle eşleşti`);
  if (s.kalici) parcalar.push(`${s.kalici} etiketlenemez`);
  if (s.gecici) parcalar.push(`${s.gecici} geçici hatayla ertelendi`);
  if (s.ertelendi) parcalar.push(`${s.ertelendi} sınır nedeniyle ertelendi (${s.bekciNedeni ?? 'bilinmiyor'})`);

  if (s.secilen === 0) return { sonuc: 'basarili', satir: 0, not: 'etiketlenecek kreatif yok' };
  if (satir === 0 && s.gecici > 0 && s.ertelendi === 0) {
    return { sonuc: 'tekrar_dene', not: `seçilen ${s.secilen}: ${parcalar.join(', ')}` };
  }
  return { sonuc: 'basarili', satir, not: `seçilen ${s.secilen}: ${parcalar.join(', ') || 'işlem yok'}` };
}
