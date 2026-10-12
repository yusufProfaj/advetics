import { z } from 'zod';
import type { Platform } from '../constants/platforms';
import type { Permission } from '../auth/roles';
import { ALICI_UST_SINIRI } from '../alici-listesi';
import type { PlanSonucu } from '../schemas/rapor-plani.schema';
import type { BekleyenIs } from '../genel-bakis';
import type { SinyalTuru, SinyalKodu } from '../sinyal/sinyal';
import type { DegisiklikTuru, EtkiSonucu, GunAraligi } from '../etki/yontem';
import type { DegisiklikYolu } from '../etki/etki';
import { ISO_HAFTA_DESENI, aralikMetni } from './hafta';

/**
 * ═══ HAFTALIK ÖZET — SÖZLEŞME (Paket B, Ajan 1 · Mimar, 2026-10-12) ═══
 *
 * Gerekçeler `docs/haftalik-ozet/MIMARI.md`. Ajan 2 (API) ve Ajan 3 (panel)
 * tip TANIMLAMAZ, buradan okur.
 *
 * İKİ OKUR, TEK İÇERİK (MIMARI Ç-B1): özet AJANSA (Paket A bildirim
 * kanalları: e-posta, Slack, Teams) ve MÜŞTERİYE (rapor alıcıları,
 * `report_schedules`) gidiyor. İçerik BİR KEZ üretilip saklanıyor
 * (`haftalik_ozetler`), iki görünüm bölüm tablosundan süzülüyor
 * (`OZET_BOLUM_KITLESI`). Sinyaller, bekleyen işler ve öneri ajansın iç
 * bilgisi: müşteri hesabı panelde bunları GÖRMÜYOR (`rule.read` yok), maile
 * koymak o kararı arka kapıdan delmek olurdu.
 */

// ─── Eşikler ─────────────────────────────────────────────────────────────────

/**
 * GÜRÜLTÜ FİLTRESİ. "En çok değişen" listesinin derdi küçük sayıların büyük
 * yüzdeleri: günde 30 ₺ harcayan bir kampanyanın %200 artışı listenin
 * başına geçer ve okuyucu asıl değişikliği göremez. Üç kapı birlikte:
 * HACİM (az gösterimde oran gürültü), GÖRELİ DEĞİŞİM (küçük dalgalanma
 * haber değil), PAY (workspace harcamasında önemsiz kalem haber değil).
 *
 * ÖLÇÜLECEK (Ajan 5): ilk dört pazartesi, workspace başına kaç kalemin
 * hangi kapıdan elendiği (`elenen`) ve kaç özetin "belirgin değişiklik yok"
 * dediği. Paket A'nın hacim eşikleriyle aynı mertebede başlıyor.
 */
export const OZET = {
  /** Gönderim: Pazartesi 09:00 İstanbul (müşteri planında saat değişebilir, gün değişmez). */
  gun: 1,
  varsayilanSaat: 9,
  tz: 'Europe/Istanbul',
  /** "En çok değişen" en fazla bu kadar kalem; kampanya başına EN FAZLA BİR kalem. */
  enCokKalem: 5,
  /** Haftalık gösterim: iki haftada da bunun altındaki kampanya aday değil. ÖLÇÜLECEK. */
  enAzGosterim: 1000,
  /** Dönüşüm kalemi için iki haftanın büyüğünde en az bu kadar dönüşüm (olgun günler). ÖLÇÜLECEK. */
  enAzDonusum: 10,
  /** Dönüşüm başı maliyet kalemi için İKİ haftada da en az bu kadar dönüşüm. ÖLÇÜLECEK. */
  enAzDonusumCpa: 5,
  /** Bu orandan küçük değişim kalem olmaz. ÖLÇÜLECEK. */
  enAzGoreliDegisim: 0.2,
  /** Kampanyanın iki haftalık harcaması workspace toplamının en az bu payı. ÖLÇÜLECEK. */
  enAzPay: 0.05,
  /** Listelerde (yaptıklarımız, etkiler, sinyaller) en fazla bu kadar satır; fazlası "ve N daha". */
  enCokSatir: 8,
} as const;

// ─── Görünümler ──────────────────────────────────────────────────────────────

export const OZET_KITLELERI = ['ajans', 'musteri'] as const;
export type OzetKitlesi = (typeof OZET_KITLELERI)[number];

export const OZET_KITLESI_ADI: Record<OzetKitlesi, string> = {
  ajans: 'Ajans görünümü',
  musteri: 'Müşteriye giden',
};

export const OZET_BOLUMLERI = [
  'sonuc',
  'degisenler',
  'yaptiklarimiz',
  'etkiler',
  'yorum',
  'sinyaller',
  'bekleyen_isler',
  'oneri',
] as const;
export type OzetBolumu = (typeof OZET_BOLUMLERI)[number];

/**
 * Hangi bölüm kime görünür. TEK TABLO: mail şablonu, Slack metni ve panel
 * önizlemesi buradan okur; üç ayrı `if (kitle === 'musteri')` doğduğu anda
 * biri unutulur ve sinyal müşteriye gider.
 *
 * "Yaptıklarımız" ve "etkiler" MÜŞTERİYE DE gidiyor: beyaz etiketli ürünün
 * vaadi "ajansınız bu hafta şunu yaptı, sonucu bu". Yorum da iki tarafa
 * gidiyor; bu yüzden YORUM YALNIZ ORTAK BÖLÜMLERDEN beslenir (sinyal
 * bilgisini görmüş bir model, müşteri mailine onu sızdırabilirdi).
 */
export const OZET_BOLUM_KITLESI: Record<OzetBolumu, readonly OzetKitlesi[]> = {
  sonuc: ['ajans', 'musteri'],
  degisenler: ['ajans', 'musteri'],
  yaptiklarimiz: ['ajans', 'musteri'],
  etkiler: ['ajans', 'musteri'],
  yorum: ['ajans', 'musteri'],
  sinyaller: ['ajans'],
  bekleyen_isler: ['ajans'],
  oneri: ['ajans'],
};

export function bolumGorunurMu(bolum: OzetBolumu, kitle: OzetKitlesi): boolean {
  return OZET_BOLUM_KITLESI[bolum].includes(kitle);
}

/** Yorumu besleyebilecek bölümler: HER kitleye görünenler. */
export const YORUM_KAYNAK_BOLUMLERI: readonly OzetBolumu[] = OZET_BOLUMLERI.filter((b) =>
  OZET_KITLELERI.every((k) => OZET_BOLUM_KITLESI[b].includes(k)) && b !== 'yorum',
);

// ─── Metrikler (sonuç bölümü) ───────────────────────────────────────────────

export const OZET_METRIKLERI = ['harcama', 'tiklama', 'donusum', 'donusum_basi_maliyet'] as const;
export type OzetMetrigi = (typeof OZET_METRIKLERI)[number];

export const OZET_METRIK_TANIMI: Record<
  OzetMetrigi,
  { ad: string; iyiYon: 'artis' | 'dusus' | null; donusumeBagli: boolean }
> = {
  // Harcamanın artışı ne iyi ne kötü: bütçe kararıdır. Yeşil/kırmızı boyanmaz.
  harcama: { ad: 'Maliyet', iyiYon: null, donusumeBagli: false },
  tiklama: { ad: 'Tıklama', iyiYon: 'artis', donusumeBagli: false },
  donusum: { ad: 'Dönüşüm', iyiYon: 'artis', donusumeBagli: true },
  donusum_basi_maliyet: { ad: 'Dönüşüm başı maliyet', iyiYon: 'dusus', donusumeBagli: true },
};

export interface OzetDeger {
  sayi: number;
  /** Biçimlenmiş ("12.400 ₺"). */
  metin: string;
}

export interface OzetMetrikSatiri {
  metrik: OzetMetrigi;
  /** Haftanın TOPLAMI (dönüşümde olgun olmayan günler dahil, `kesinlesmedi`). */
  bu: OzetDeger | null;
  onceki: OzetDeger | null;
  /**
   * Değişim (oran, işaretli). Dönüşüme bağlı metrikte YALNIZ olgun günler
   * üzerinden (`HaftalikOzet.donusumKiyasi`); toplamların oranı DEĞİL.
   */
  degisim: number | null;
  /** Renk: iyi/kötü/nötr. Harcama her zaman nötr. */
  yon: 'iyi' | 'kotu' | 'notr' | null;
  /** Haftanın son günlerinin dönüşümleri henüz tamamlanmadı. */
  kesinlesmedi: boolean;
}

export function metrikYonu(metrik: OzetMetrigi, degisim: number | null): OzetMetrikSatiri['yon'] {
  if (degisim === null) return null;
  const iyi = OZET_METRIK_TANIMI[metrik].iyiYon;
  if (!iyi || degisim === 0) return 'notr';
  return (degisim > 0) === (iyi === 'artis') ? 'iyi' : 'kotu';
}

// ─── En çok değişenler ───────────────────────────────────────────────────────

/** Haftanın toplamı. Para RAPORLAMA para biriminde (workspace payı için tek birim). */
export interface HaftaToplami {
  harcama: number;
  gosterim: number;
  tiklama: number;
  donusum: number;
}

/**
 * Bir kampanyanın iki haftası. `tam` bütün hafta (harcama kalemi),
 * `olgun` dönüşüm kıyası günleri (dönüşüm ve dönüşüm başı maliyet kalemi).
 */
export interface KampanyaHaftasi {
  varlikId: string;
  ad: string;
  hesapAdi: string;
  platform: Platform;
  bu: { tam: HaftaToplami; olgun: HaftaToplami };
  onceki: { tam: HaftaToplami; olgun: HaftaToplami };
}

export const KALEM_METRIKLERI = ['harcama', 'donusum', 'donusum_basi_maliyet'] as const;
export type KalemMetrigi = (typeof KALEM_METRIKLERI)[number];

export const KALEM_ELEME_NEDENLERI = ['hacim_dusuk', 'degisim_kucuk', 'pay_kucuk', 'deger_yok'] as const;
export type KalemElemeNedeni = (typeof KALEM_ELEME_NEDENLERI)[number];

export interface OzetKalemi {
  varlikId: string;
  ad: string;
  hesapAdi: string;
  platform: Platform;
  metrik: KalemMetrigi;
  bu: number;
  onceki: number;
  /** İşaretli oran. */
  degisim: number;
  /** Kampanyanın iki haftalık harcama payı (0-1). */
  pay: number;
  yon: 'iyi' | 'kotu' | 'notr';
}

function kalemDegeri(m: KalemMetrigi, t: { tam: HaftaToplami; olgun: HaftaToplami }): number | null {
  if (m === 'harcama') return t.tam.harcama;
  if (m === 'donusum') return t.olgun.donusum;
  return t.olgun.donusum > 0 ? t.olgun.harcama / t.olgun.donusum : null;
}

function kalemHacmiYeter(m: KalemMetrigi, k: KampanyaHaftasi): boolean {
  if (k.bu.tam.gosterim < OZET.enAzGosterim || k.onceki.tam.gosterim < OZET.enAzGosterim) return false;
  if (m === 'donusum') return Math.max(k.bu.olgun.donusum, k.onceki.olgun.donusum) >= OZET.enAzDonusum;
  if (m === 'donusum_basi_maliyet') return Math.min(k.bu.olgun.donusum, k.onceki.olgun.donusum) >= OZET.enAzDonusumCpa;
  return true;
}

/**
 * "En çok değişen 3-5 kalem". SAF: iş bunu çağırır, test ÇALIŞTIRARAK
 * sınar. Elenenler NEDENİYLE sayılır (`elenen`); "belirgin değişiklik yok"
 * cümlesi ancak bu sayılarla birlikte dürüst.
 *
 * SIRALAMA: `|değişim| × pay`. Yalnız yüzdeye bakmak küçük kampanyayı,
 * yalnız paya bakmak hiç değişmeyen büyük kampanyayı öne çıkarır.
 * KAMPANYA BAŞINA BİR KALEM: aynı kampanyanın harcaması, dönüşümü ve
 * maliyeti üç satır olunca liste tek kampanyanın hikâyesine dönüyor.
 */
export function kalemleriSec(adaylar: readonly KampanyaHaftasi[]): {
  kalemler: OzetKalemi[];
  elenen: Record<KalemElemeNedeni, number>;
} {
  const elenen: Record<KalemElemeNedeni, number> = { hacim_dusuk: 0, degisim_kucuk: 0, pay_kucuk: 0, deger_yok: 0 };
  const toplamHarcama = adaylar.reduce((t, k) => t + k.bu.tam.harcama + k.onceki.tam.harcama, 0);
  const enIyi = new Map<string, OzetKalemi & { puan: number }>();
  for (const k of adaylar) {
    const pay = toplamHarcama > 0 ? (k.bu.tam.harcama + k.onceki.tam.harcama) / toplamHarcama : 0;
    for (const m of KALEM_METRIKLERI) {
      if (!kalemHacmiYeter(m, k)) {
        elenen.hacim_dusuk++;
        continue;
      }
      const bu = kalemDegeri(m, k.bu);
      const onceki = kalemDegeri(m, k.onceki);
      if (bu === null || onceki === null || onceki === 0) {
        elenen.deger_yok++;
        continue;
      }
      const degisim = (bu - onceki) / onceki;
      if (Math.abs(degisim) < OZET.enAzGoreliDegisim) {
        elenen.degisim_kucuk++;
        continue;
      }
      if (pay < OZET.enAzPay) {
        elenen.pay_kucuk++;
        continue;
      }
      const puan = Math.abs(degisim) * pay;
      const onceki_ = enIyi.get(k.varlikId);
      if (onceki_ && onceki_.puan >= puan) continue;
      const yon = metrikYonu(m, degisim) ?? 'notr';
      enIyi.set(k.varlikId, { varlikId: k.varlikId, ad: k.ad, hesapAdi: k.hesapAdi, platform: k.platform, metrik: m, bu, onceki, degisim, pay, yon, puan });
    }
  }
  const kalemler = [...enIyi.values()]
    .sort((a, b) => b.puan - a.puan)
    .slice(0, OZET.enCokKalem)
    .map(({ puan: _p, ...k }) => k);
  return { kalemler, elenen };
}

// ─── Hacim (boş / düşük) ─────────────────────────────────────────────────────

/**
 * Workspace'in haftası:
 * - `bos`: iki haftada da harcama 0. Müşteri maili GÖNDERİLMEZ (plan
 *   `skipped`, neden yazılı; zamanlanmış raporun `bosDonem` kuralı).
 *   Ajans kanalına da gitmez: boş özet, kanalı susturmayı öğretir.
 * - `dusuk_hacim`: harcama var ama gösterim iki haftada da eşiğin altında.
 *   Sonuç tablosu gider; "en çok değişen" ve yorum ÜRETİLMEZ (gürültü),
 *   neden yazılır.
 * - `normal`.
 */
export const OZET_HACIMLERI = ['bos', 'dusuk_hacim', 'normal'] as const;
export type OzetHacmi = (typeof OZET_HACIMLERI)[number];

export function ozetHacmi(bu: HaftaToplami, onceki: HaftaToplami): OzetHacmi {
  if (bu.harcama <= 0 && onceki.harcama <= 0) return 'bos';
  if (bu.gosterim < OZET.enAzGosterim && onceki.gosterim < OZET.enAzGosterim) return 'dusuk_hacim';
  return 'normal';
}

// ─── Bölüm tipleri ───────────────────────────────────────────────────────────

export interface OzetDegisikligi {
  etkiId: string;
  tur: DegisiklikTuru;
  /** "Bütçe 500 ₺ → 600 ₺" (`degisiklikMetni`). */
  metin: string;
  varlikAdi: string;
  yol: DegisiklikYolu;
  gun: string;
}

export interface OzetEtkisi {
  etkiId: string;
  varlikAdi: string;
  /** Değişikliğin kendisi ("Bütçe artırıldı · 29 Eylül"). */
  ne: string;
  sonuc: EtkiSonucu;
  /** `etkiCumlesi`. */
  cumle: string;
}

export interface OzetSinyali {
  sinyalId: string;
  tur: SinyalTuru;
  kod: SinyalKodu;
  baslik: string;
  varlikAdi: string;
  onem: 'yuksek' | 'orta';
}

/** Kısa öneri: VERİDEN, şablonla. Yapay zekâ yazmaz. */
export const OZET_ONERI_TURLERI = ['sinyal_uygula', 'oneri_bekliyor', 'bekleyen_is'] as const;
export type OzetOneriTuru = (typeof OZET_ONERI_TURLERI)[number];

export interface OzetOnerisi {
  tur: OzetOneriTuru;
  /** Düz metin, tek cümle. */
  metin: string;
  /** Panel bağlantı üreticisinin hedefi (adres panelde kurulur). */
  hedef: { ekran: 'sinyaller' | 'iyilestir' | 'genel_bakis'; ref: string | null };
}

/**
 * Önerinin önceliği SABİT: (1) para yakan, uygulanabilir yüksek önemli bir
 * sinyal, (2) onay bekleyen İyileştir önerileri, (3) diğer bekleyen işler.
 * "Kısa öneri" tek cümle; üç şeyi birden önermek hiçbirini önermemek.
 */
export function kisaOneri(g: {
  sinyaller: ReadonlyArray<OzetSinyali & { uygulanabilir: boolean }>;
  acikOneri: number;
  bekleyenIsler: readonly BekleyenIs[];
}): OzetOnerisi | null {
  const s = g.sinyaller.find((x) => x.onem === 'yuksek' && x.uygulanabilir);
  if (s) {
    return {
      tur: 'sinyal_uygula',
      metin: `${s.varlikAdi}: ${s.baslik}. Sinyaller ekranından inceleyip durdurabilirsiniz.`,
      hedef: { ekran: 'sinyaller', ref: s.sinyalId },
    };
  }
  if (g.acikOneri > 0) {
    return {
      tur: 'oneri_bekliyor',
      metin: g.acikOneri === 1 ? 'İyileştir\'de onay bekleyen bir öneri var.' : `İyileştir'de onay bekleyen ${g.acikOneri} öneri var.`,
      hedef: { ekran: 'iyilestir', ref: null },
    };
  }
  const is = g.bekleyenIsler[0];
  if (is) return { tur: 'bekleyen_is', metin: 'Genel Bakış\'ta bekleyen işler var.', hedef: { ekran: 'genel_bakis', ref: is.tur } };
  return null;
}

// ─── Yorum durumu ────────────────────────────────────────────────────────────

/**
 * Yorumun hâli. Mail yalnız `yazildi`da yorum taşır; diğerlerinde bölüm
 * hiç çizilmez ve ajans önizlemesi NEDENİ söyler (yorumun neden olmadığını
 * bilmeyen kullanıcı "yapay zekâ bozuk" sanır).
 */
export const YORUM_DURUMLARI = ['yazildi', 'reddedildi', 'hata', 'atlandi', 'kapali'] as const;
export type YorumDurumu = (typeof YORUM_DURUMLARI)[number];

export const YORUM_DURUMU_ADI: Record<YorumDurumu, string> = {
  yazildi: 'Yazıldı',
  reddedildi: 'Yorum sayı içerdiği için kullanılmadı',
  hata: 'Yapay zekâya ulaşılamadı',
  atlandi: 'Hacim düşük, yorum yazılmadı',
  kapali: 'Yapay zekâ anahtarı tanımlı değil',
};

// ─── Özet ────────────────────────────────────────────────────────────────────

export interface HaftalikOzet {
  clientId: string;
  clientAdi: string;
  /** `YYYY-Www`. */
  hafta: string;
  aralik: GunAraligi;
  oncekiAralik: GunAraligi;
  /** Workspace toplamlarının para birimi (raporlama). */
  paraBirimi: string;
  hacim: OzetHacmi;
  metrikler: OzetMetrikSatiri[];
  /** Dönüşüm değişiminin hesaplandığı olgun günler (`donusumKiyasi`). */
  donusumKiyasi: { bu: GunAraligi; onceki: GunAraligi; tamHafta: boolean } | null;
  degisenler: {
    kalemler: OzetKalemi[];
    elenen: Record<KalemElemeNedeni, number>;
    /** Kalem yoksa NEDEN: hacim düşük mü, gerçekten belirgin değişim yok mu. */
    bosNedeni: 'dusuk_hacim' | 'belirgin_degisim_yok' | null;
  };
  yaptiklarimiz: { satirlar: OzetDegisikligi[]; toplam: number };
  etkiler: { satirlar: OzetEtkisi[]; toplam: number; olcumde: number };
  /** Ajans görünümünde dolu; müşteri görünümünde `null` (`ozetKitleyeGore`). */
  sinyaller: { satirlar: OzetSinyali[]; toplam: number; sessizKosum: boolean } | null;
  bekleyenIsler: { isler: BekleyenIs[]; acikOneri: number } | null;
  oneri: OzetOnerisi | null;
  yorum: { durum: YorumDurumu; metin: string | null; not: string | null };
  /** Okunamayan kaynak; diğer bölümler yine üretilir (sessiz düşüş yok). */
  hatalar: Array<{ kaynak: OzetBolumu; mesaj: string }>;
  uretildi: string;
}

/**
 * Kitleye göre görünüm. Ajans-yalnız bölümler `null`. SAF ve TEK yer:
 * mail, Slack ve önizleme bunu çağırır. Hata satırları da süzülür (müşteri
 * "sinyaller okunamadı" görmemeli).
 */
export function ozetKitleyeGore(o: HaftalikOzet, kitle: OzetKitlesi): HaftalikOzet {
  if (kitle === 'ajans') return o;
  return {
    ...o,
    sinyaller: bolumGorunurMu('sinyaller', kitle) ? o.sinyaller : null,
    bekleyenIsler: bolumGorunurMu('bekleyen_isler', kitle) ? o.bekleyenIsler : null,
    oneri: bolumGorunurMu('oneri', kitle) ? o.oneri : null,
    hatalar: o.hatalar.filter((h) => bolumGorunurMu(h.kaynak, kitle)),
    yorum: o.yorum.durum === 'yazildi' ? o.yorum : { durum: o.yorum.durum, metin: null, not: null },
  };
}

export function ozetKonusu(o: Pick<HaftalikOzet, 'clientAdi' | 'aralik'>): string {
  return `Haftalık özet · ${o.clientAdi} · ${aralikMetni(o.aralik)}`;
}

/**
 * Slack / Teams KISA SÜRÜMÜ. Yalnız ajans kanallarına gider (kanallar
 * Paket A'da ajansın). En fazla `KISA_EN_COK_SATIR` satır, sonda panel
 * bağlantısı; kalan her şey panelde. SAF: panel önizlemesi ve gönderici
 * aynı satırları gösterir.
 */
export const KISA_EN_COK_SATIR = 6;

export interface KisaOzet {
  baslik: string;
  satirlar: string[];
  /** Panel yolu (`/raporlar?sekme=ozet&...`); tam adresi gönderici kurar. */
  panelYolu: string;
}

export function kisaOzet(o: HaftalikOzet, panelYolu: string): KisaOzet {
  const satirlar: string[] = [];
  const yuzde = (x: number) => `%${Math.round(Math.abs(x) * 100)} ${x < 0 ? 'düştü' : 'arttı'}`;
  if (o.hacim === 'bos') {
    satirlar.push('Bu hafta harcama yok.');
  } else {
    for (const m of o.metrikler) {
      if (!m.bu) continue;
      const ek = m.degisim === null ? '' : ` (${yuzde(m.degisim)})`;
      satirlar.push(`${OZET_METRIK_TANIMI[m.metrik].ad}: ${m.bu.metin}${ek}`);
    }
    const k = o.degisenler.kalemler[0];
    if (k) satirlar.push(`En çok değişen: ${k.ad}, ${OZET_METRIK_TANIMI[k.metrik].ad.toLocaleLowerCase('tr')} ${yuzde(k.degisim)}`);
  }
  if (o.sinyaller && o.sinyaller.toplam > 0) satirlar.push(`${o.sinyaller.toplam} açık sinyal`);
  if (o.oneri) satirlar.push(o.oneri.metin);
  const kesik = satirlar.slice(0, KISA_EN_COK_SATIR);
  if (satirlar.length > KISA_EN_COK_SATIR) kesik[KISA_EN_COK_SATIR - 1] = `ve ${satirlar.length - KISA_EN_COK_SATIR + 1} satır daha panelde`;
  return { baslik: ozetKonusu(o), satirlar: kesik, panelYolu };
}

// ─── Önizleme ────────────────────────────────────────────────────────────────

export const ozetOnizlemeSorgusuSchema = z.object({
  clientId: z.string().uuid(),
  kitle: z.enum(OZET_KITLELERI).default('ajans'),
  /** Boşsa en son TAMAMLANMIŞ hafta (`ozetHaftasi(simdi)`). Gelecek/şimdiki hafta 400. */
  hafta: z.string().regex(ISO_HAFTA_DESENI).optional(),
});
export type OzetOnizlemeSorgusu = z.infer<typeof ozetOnizlemeSorgusuSchema>;

export interface HaftalikOzetOnizleme {
  ozet: HaftalikOzet;
  kitle: OzetKitlesi;
  /**
   * GÖNDERİLECEK MAİLİN KENDİSİ: aynı oluşturucudan (API). Panel bunu
   * yalıtılmış çerçevede gösterir; ekranda ikinci bir şablon YAZMAZ
   * (önizleme borcu, CLAUDE.md "önizleme eklemek onu doğru tutma borcu").
   */
  eposta: { konu: string; html: string };
  /** Ajans görünümünde Slack/Teams metni; müşteride `null`. */
  kisa: KisaOzet | null;
  /** `kayitli`: bu hafta zaten üretilmiş (gönderilenle aynı); `yeni`: şimdi üretildi ve saklandı. */
  kaynak: 'kayitli' | 'yeni';
  /** Bu hafta nereye gitti / gidecek. */
  gonderim: {
    musteri: { durum: PlanSonucu | 'planli' | 'kapali'; zaman: string | null; alicilar: string[] };
    kanallar: Array<{ kanalId: string; ad: string; durum: 'bekliyor' | 'gonderildi' | 'basarisiz' | 'vazgecildi' | 'planli' }>;
  };
}

// ─── Müşteri planı (report_schedules üstünde) ───────────────────────────────

/**
 * `report_schedules`e YENİ KOLON `tur` (varchar + CHECK, enum değil).
 * Değer listesi burada; `RaporPlaniOzeti`ne `tur` alanını Ajan 2 kendi
 * commit'inde ekler (şimdi eklemek API derlemesini kırar, Paket A
 * `SINYAL_BEKLEYEN_IS` deseni).
 */
export const RAPOR_PLANI_TURLERI = ['rapor', 'haftalik_ozet'] as const;
export type RaporPlaniTuru = (typeof RAPOR_PLANI_TURLERI)[number];

/**
 * Özet planının `range_key` değeri. `raporPenceresi()` bu anahtarı
 * TANIMIYOR ve bu bilinçli: rapor dalına yanlışlıkla düşen bir özet planı
 * pencereyi `null` alır ve `skipped` yazar (yanlış dönemli rapor değil,
 * görünür bir atlama). Özet dalı haftayı `ozetHaftasi(next_run_at)`ten alır.
 */
export const OZET_PENCERE_ANAHTARI = 'onceki_iso_hafta';

/**
 * Workspace başına EN FAZLA BİR özet planı (kısmi tekil indeks
 * `(client_id) WHERE tur = 'haftalik_ozet'`). Ekran bir anahtar ve saat
 * gösteriyor; ikinci plan aynı müşteriye iki mail demek.
 *
 * Gün sabit Pazartesi: "geçen hafta" anlamını taşıyan tek gün. Saat ve
 * alıcılar değişebilir. Alıcı boş = workspace'in rapor alıcıları
 * (`nihaiAlicilar`), rapor planlarıyla aynı kural.
 *
 * VARSAYILAN KAPALI: mail MÜŞTERİYE ve danışmanın adresinden gidiyor;
 * kimse açmadan müşteriye yeni bir mail başlatmak geri alınamaz.
 */
export const haftalikOzetPlaniSchema = z.object({
  clientId: z.string().uuid(),
  etkin: z.boolean(),
  saat: z.number().int().min(0).max(23).default(OZET.varsayilanSaat),
  toEmails: z.array(z.string().trim().email()).max(ALICI_UST_SINIRI).default([]),
});
export type HaftalikOzetPlaniGirdisi = z.infer<typeof haftalikOzetPlaniSchema>;

export interface HaftalikOzetPlani {
  clientId: string;
  /** Satır var mı (hiç açılmadıysa `false`, ekran "Kapalı" der). */
  kurulu: boolean;
  etkin: boolean;
  saat: number;
  toEmails: string[];
  /** Gönderim anında kullanılacak liste; boşsa plan çalışamaz ve ekran bunu söyler. */
  cozulenAliciListesi: string[];
  siradaki: string | null;
  son: { zaman: string; durum: PlanSonucu; hata: string | null; alici: string | null } | null;
  /** Mail bu kişinin SMTP kimliğiyle gider (planı kuran). */
  gonderen: { ad: string | null; eposta: string | null } | null;
  /** `RaporPlaniOzeti.senderReady` ile aynı üç hâl (`null` = bilinmiyor, RLS). */
  senderReady: boolean | null;
}

export const ozetDenemeSchema = z.object({
  clientId: z.string().uuid(),
  kitle: z.enum(OZET_KITLELERI).default('musteri'),
});

// ─── Paket A entegrasyonu ───────────────────────────────────────────────────

/**
 * Ajans özetinin Paket A bildirim olayı. `BILDIRIM_OLAYLARI`na (sinyal
 * modülü) Paket A'nın Ajan 2'si eklemeden ÖNCE eklenemez: `BILDIRIM_OLAYI_ADI`
 * bir `Record` ve CHECK listesi orada; şimdi eklemek Paket A sözleşmesini
 * ve testini değiştirmek olur (bu işin sınırı). Ekleyen commit: Paket B
 * Ajan 2, Paket A tabloları canlıdayken. Gönderim anahtarı
 * `haftalik:<YYYY-Www>` (kanal başına tekil, Paket A `UNIQUE (kanal_id,
 * anahtar)` idempotentliği).
 */
export const OZET_BILDIRIM_OLAYI = { olay: 'haftalik_ozet', ad: 'Haftalık özet (pazartesi sabahı)' } as const;

export function ozetGonderimAnahtari(hafta: string): string {
  return `haftalik:${hafta}`;
}

// ─── Uçlar ───────────────────────────────────────────────────────────────────

/**
 * TEK KAYNAK. İzinler:
 * - Önizleme `report.read`: Raporlar sayfasının sekmesi; müşteri hesabı da
 *   KENDİ özetini görür. `kitle=ajans` ise servis AYRICA `rule.read` ister
 *   (yoksa 403): sinyal ve bekleyen işler ajansın iç bilgisi.
 * - Plan ve deneme gönderimi `report.share`: zamanlanmış rapor planlarıyla
 *   AYNI izin (aynı tablo, aynı gönderen).
 */
export const OZET_AJANS_IZNI: Permission = 'rule.read';

export const OZET_UCLARI = [
  { yontem: 'GET', yol: '/haftalik-ozet/onizleme', izin: 'report.read', ne: 'Haftanın özeti + mail HTML + kısa metin (kitle=ajans ayrıca rule.read)' },
  { yontem: 'GET', yol: '/haftalik-ozet/plan', izin: 'report.share', ne: 'Müşteri özet planı (report_schedules, tur=haftalik_ozet)' },
  { yontem: 'PUT', yol: '/haftalik-ozet/plan', izin: 'report.share', ne: 'Planı aç/kapat, saat, alıcılar' },
  { yontem: 'POST', yol: '/haftalik-ozet/deneme', izin: 'report.share', ne: 'Özeti YALNIZ isteyen kullanıcının kendi adresine gönder' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;

// ─── Yorum girdisi (yapay zekâya giden) ─────────────────────────────────────

function buyukluk(d: number): string {
  const a = Math.abs(d);
  if (a < 0.1) return 'hafif';
  if (a < 0.3) return 'belirgin';
  return 'güçlü';
}

/**
 * Modele giden METİN ve sunucunun dolduracağı DEĞERLER. SAF.
 *
 * - Metinde RAKAM YOK: yalnız yön ("arttı"), büyüklük kovası ("belirgin")
 *   ve yer tutucu adları. Modelin elinde uyduracağı bir sayı yoksa, yazdığı
 *   her rakam denetimde yakalanır (`yorumDenetle`).
 * - YALNIZ `YORUM_KAYNAK_BOLUMLERI`: sinyal ve bekleyen iş modele HİÇ
 *   gitmez. Aynı yorum müşteri mailine de giriyor.
 * - Kampanya ADI modele gitmez, yalnız yer tutucusu (`yorum.ts` notu).
 * - `hacim !== 'normal'` ise `null` (yorum `atlandi`): düşük hacimli
 *   haftaya yorum yazdırmak gürültüyü cümleye çevirir.
 */
export function yorumGirdisi(
  o: HaftalikOzet,
  bicim: { yuzde: (oran: number) => string },
): { metin: string; degerler: Record<string, string> } | null {
  if (o.hacim !== 'normal') return null;
  const degerler: Record<string, string> = {};
  const satirlar: string[] = ['Geçen haftanın, bir önceki haftaya göre özeti:'];
  for (const m of o.metrikler) {
    if (!m.bu) continue;
    const ad = OZET_METRIK_TANIMI[m.metrik].ad;
    degerler[`${m.metrik}_bu`] = m.bu.metin;
    if (m.onceki) degerler[`${m.metrik}_onceki`] = m.onceki.metin;
    if (m.degisim === null) {
      satirlar.push(`- ${ad}: kıyas yok. Yer tutucu: {{${m.metrik}_bu}}.`);
      continue;
    }
    degerler[`${m.metrik}_degisim`] = bicim.yuzde(Math.abs(m.degisim));
    const yon = m.degisim === 0 ? 'değişmedi' : m.degisim > 0 ? 'arttı' : 'düştü';
    const iyi = m.yon === 'iyi' ? ', bu iyi' : m.yon === 'kotu' ? ', bu kötü' : '';
    satirlar.push(`- ${ad}: ${yon} (${buyukluk(m.degisim)}${iyi}). Yer tutucular: {{${m.metrik}_bu}}, {{${m.metrik}_degisim}}.`);
  }
  o.degisenler.kalemler.forEach((k, i) => {
    const n = i + 1;
    degerler[`k${n}_ad`] = k.ad;
    degerler[`k${n}_degisim`] = bicim.yuzde(Math.abs(k.degisim));
    const yon = k.degisim > 0 ? 'arttı' : 'düştü';
    satirlar.push(
      `- Öne çıkan kampanya {{k${n}_ad}}: ${OZET_METRIK_TANIMI[k.metrik].ad.toLocaleLowerCase('tr')} ${yon} (${buyukluk(k.degisim)}). Yer tutucu: {{k${n}_degisim}}.`,
    );
  });
  if (o.yaptiklarimiz.toplam > 0) satirlar.push('- Bu hafta ajans hesapta değişiklik yaptı; ayrıntısı mailde ayrı listede.');
  const iyi = o.etkiler.satirlar.some((e) => e.sonuc === 'iyilesti');
  const kotu = o.etkiler.satirlar.some((e) => e.sonuc === 'kotulesti');
  if (iyi || kotu) {
    satirlar.push(`- Önceki değişikliklerin ölçülen etkisi: ${iyi ? 'iyileşen var' : 'iyileşen yok'}, ${kotu ? 'kötüleşen var' : 'kötüleşen yok'}.`);
  }
  return { metin: satirlar.join('\n'), degerler };
}
