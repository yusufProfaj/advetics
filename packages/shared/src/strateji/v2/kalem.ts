import { z } from 'zod';
import { monthSchema } from '../../schemas/budget.schema';
import { REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberPlatformu } from '../../reklam/rehber/amaclar';
import { rehberKonumuSchema, type RehberKonumu } from '../../reklam/rehber/alanlar';
import type { RehberDurumu } from '../../reklam/rehber/api';
import type { YayinDurumu } from '../../reklam/yayin';
import { tutarGirdisiSchema } from '../plan';
import type { KaynakliMetin, StratejiKaynagi } from './kaynak';

/**
 * ═══ ADVSTRATEGY v2 — STRATEJİ KALEMİ (YENIDEN-TASARIM.md § 4.1) ═══
 *
 * 1 KALEM = 1 ADVCAMPAIGN REHBERİ. Rehber bir amaç + iki platform + tek
 * bütçe + Meta payı taşıyor (`reklam/rehber/alanlar.ts`); kalem birebir aynı
 * biçimde. v1'deki "platform başına satır" iki rehber, iki bütçe ve iki kez
 * görsel/metin girişi demekti ve hiçbir zaman birebir aktarılamadı.
 *
 * AMAÇ LİSTESİ REHBERİN LİSTESİ (`REHBER_AMAC_KODLARI`). v1 sohbetin niyet
 * kataloğunu kullanıyordu ve aktarım kapısı eski derleyiciye
 * (`DERLENEN_NIYETLER`) bağlıydı; ikinci bir amaç listesi doğduğu anda
 * ayrışır.
 *
 * KİTLE = KONUM + YAŞ. Rehber ilgi alanı, kitle şablonu ya da yeniden
 * pazarlama kitlesi TAŞIMIYOR; kalem de taşımaz (aktarılamayan seçenek
 * gösterilmez). "Kime anlatıyoruz" metni (`kitleTarifi`) kreatife yön verir,
 * hedefleme DEĞİLDİR.
 */

// ─── Aşama ve ölçüt: amaçtan TÜRER, kullanıcı seçmez ──────────────────────

export const STRATEJI_ASAMALARI = ['tanitim', 'ilgi', 'donusum'] as const;
export type StratejiAsamasi = (typeof STRATEJI_ASAMALARI)[number];

export const STRATEJI_ASAMA_ETIKETI: Record<StratejiAsamasi, string> = {
  tanitim: 'Tanıtım',
  ilgi: 'İlgi',
  donusum: 'Dönüşüm',
};

/**
 * Amaç → aşama. `Record` her amacı ZORUNLU kılıyor: rehbere sekizinci amaç
 * eklenince derleme burada kırılır ve aşaması unutulamaz.
 */
export const AMAC_ASAMASI: Record<RehberAmacKodu, StratejiAsamasi> = {
  ERISIM: 'tanitim',
  VIDEO: 'tanitim',
  SITE: 'ilgi',
  FORM: 'donusum',
  WHATSAPP: 'donusum',
  TELEFON: 'donusum',
  SATIS: 'donusum',
};

/**
 * Kalemin TEK ölçütü ve ekrandaki birimi. Tahmin ve "gerçekleşen" bu ölçütle
 * yazılır. Meta ve Google aynı adı taşısa da AYRI sayılır (atıf farkı):
 * hiçbir yerde toplanmaz.
 */
export const AMAC_OLCUTU: Record<RehberAmacKodu, { kod: string; birim: string }> = {
  SITE: { kod: 'ziyaret', birim: 'site ziyareti' },
  FORM: { kod: 'form', birim: 'form' },
  WHATSAPP: { kod: 'mesaj', birim: 'WhatsApp mesajı' },
  TELEFON: { kod: 'arama', birim: 'telefon araması' },
  VIDEO: { kod: 'izlenme', birim: 'video izlenmesi' },
  ERISIM: { kod: 'erisim', birim: 'kişiye erişim' },
  SATIS: { kod: 'satin_alma', birim: 'satın alma' },
};

export function amacAsamasi(amac: RehberAmacKodu): StratejiAsamasi {
  return AMAC_ASAMASI[amac];
}

// ─── Sınırlar (rehberin sınırlarıyla aynı mertebe) ───────────────────────

export const KALEM_SINIRI = 12;
/** Rehber `medya` en çok 10. */
export const KALEM_VARLIK_SINIRI = 10;
/** Rehber `anahtarKelimeler` en çok 50. */
export const KALEM_KELIME_SINIRI = 50;
/** Rehber `konumlar` en çok 25. */
export const KALEM_KONUM_SINIRI = 25;
/** Strateji en çok üç ay: daha uzun bir plan, ölçmeden üç ay sonrasını vaat eder. */
export const STRATEJI_EN_UZUN_AY = 3;

const tarihSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı');

// ─── Plan oluşturma ve dönem ────────────────────────────────────────────

export const stratejiOlusturSchema = z.object({
  clientId: z.string().uuid(),
  /** İlk ay, `YYYY-MM` STRING (Date'e çevirmek saat dilimi kayması üretir). */
  baslangicAyi: monthSchema,
  sureAy: z.number().int().min(1).max(STRATEJI_EN_UZUN_AY),
  toplamButce: tutarGirdisiSchema,
  paraBirimi: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'ISO 4217 kodu olmalı').optional(),
});
export type StratejiOlusturGirdisi = z.infer<typeof stratejiOlusturSchema>;

/**
 * `2026-11` + 3 ay → `2026-11-01`…`2027-01-31`. SAF tarih aritmetiği,
 * `Date` yalnız UTC'de ay sonu için (saat dilimi yok).
 */
export function stratejiDonemi(baslangicAyi: string, sureAy: number): { baslangic: string; bitis: string } {
  const [y, m] = baslangicAyi.split('-').map(Number) as [number, number];
  if (!Number.isInteger(sureAy) || sureAy < 1 || sureAy > STRATEJI_EN_UZUN_AY) throw new Error(`Süre 1-${STRATEJI_EN_UZUN_AY} ay olmalı: ${sureAy}`);
  // Ay sonu: bir sonraki ayın 0. günü.
  const son = new Date(Date.UTC(y, m - 1 + sureAy, 0));
  return { baslangic: `${baslangicAyi}-01`, bitis: son.toISOString().slice(0, 10) };
}

// ─── Kalem girdisi (PUT …/kalemler) ─────────────────────────────────────

/**
 * Reklam metni. Kaynak `ai` (rehberin metin motorunun önerisi, henüz
 * "Kullan" denmedi) ya da `ajans`. Aktarımda `ai` metin rehbere ÖNERİ
 * (`ai_onerisi`) olarak gider ve orada onay bekler (`rehber-esleme.ts`).
 */
export const kalemMetniSchema = z.object({
  anaMetin: z.string().max(5000),
  basliklar: z.array(z.string().max(200)).max(15),
  aciklamalar: z.array(z.string().max(300)).max(4),
  kaynak: z.enum(['ai', 'ajans']),
});
export type KalemMetni = z.infer<typeof kalemMetniSchema>;

/**
 * İstemcinin yazabildiği metin kaynakları. `veri`, `kural`, `marka`
 * SUNUCUNUN beyanı: istemci bir ajans cümlesini "Marka Merkezi'nden" diye
 * gösteremesin (v1 dağılımındaki `kaynakBelirle` dersi).
 */
export const ISTEMCI_METIN_KAYNAKLARI = ['ai', 'ajans'] as const satisfies readonly StratejiKaynagi[];

const istemciMetniSchema = z.object({
  metin: z.string().trim().min(1).max(2000),
  kaynak: z.enum(ISTEMCI_METIN_KAYNAKLARI),
});

export const stratejiKalemiGirdiSchema = z
  .object({
    /** Var olan kalemi güncellerken; yoksa yeni kalem. Aktarılmış kalemin kimliği korunmalı (rehber bağı). */
    id: z.string().uuid().optional(),
    amac: z.enum(REHBER_AMAC_KODLARI),
    meta: z.boolean(),
    google: z.boolean(),
    /** Yalnız İKİ platform açıkken; rehberin aralığı (10-90). */
    metaPayi: z.number().int().min(10).max(90).nullable(),
    /** Kalemin dönem TOPLAMI (aktarımda rehbere `tip: 'toplam'`). */
    butce: tutarGirdisiSchema,
    baslangic: tarihSchema,
    bitis: tarihSchema,
    konumlar: z.array(rehberKonumuSchema).min(1, 'En az bir bölge seçilmeli').max(KALEM_KONUM_SINIRI),
    /**
     * Yaş İPUCU aralığı (18-65; 65 = "65 ve üzeri"). Rehberde `yasAraligi`
     * (Advantage+ ipucu) olur; rehberin SERT alt sınırı `enDusukYas`
     * (18-25) stratejiden yazılmaz ve rehberin varsayılanında (18) kalır:
     * ipucunu sert sınıra çevirmek kitleyi sessizce daraltırdı. İkisi de
     * dolu ya da ikisi de boş. Özel kategoride rehber daraltmayı reddeder.
     */
    yasMin: z.number().int().min(18).max(65).nullable(),
    yasMax: z.number().int().min(18).max(65).nullable(),
    /** Google Arama kurgulu amaçlarda kelime grubu (`strateji_kelimeleri.grup`). */
    kelimeGrubu: z.string().trim().max(80).nullable(),
    varlikIdleri: z.array(z.string().uuid()).max(KALEM_VARLIK_SINIRI),
    metin: kalemMetniSchema.nullable(),
    kreatifYonergesi: istemciMetniSchema.nullable(),
    kitleTarifi: istemciMetniSchema.nullable(),
    not: z.string().trim().max(500).nullable().optional(),
  })
  .refine((k) => k.meta || k.google, { message: 'En az bir platform açık olmalı', path: ['meta'] })
  .refine((k) => (k.meta && k.google) === (k.metaPayi !== null), {
    message: 'Platform payı yalnız iki platform birlikte açıkken yazılır',
    path: ['metaPayi'],
  })
  .refine((k) => k.baslangic <= k.bitis, { message: 'Bitiş başlangıçtan önce olamaz', path: ['bitis'] })
  .refine((k) => (k.yasMin === null) === (k.yasMax === null), { message: 'Yaş aralığının iki ucu birlikte yazılır', path: ['yasMax'] })
  .refine((k) => k.yasMin === null || k.yasMax === null || k.yasMin <= k.yasMax, { message: 'Yaş aralığı ters', path: ['yasMax'] })
  .refine((k) => new Set(k.varlikIdleri).size === k.varlikIdleri.length, { message: 'Aynı görsel iki kez eklenemez', path: ['varlikIdleri'] });
export type StratejiKalemiGirdisi = z.infer<typeof stratejiKalemiGirdiSchema>;

export const stratejiKalemleriKaydetSchema = z.object({
  surum: z.number().int().positive(),
  kalemler: z.array(stratejiKalemiGirdiSchema).max(KALEM_SINIRI),
});
export type StratejiKalemleriKaydetGirdisi = z.infer<typeof stratejiKalemleriKaydetSchema>;

/**
 * Kalem tarihi plan döneminin İÇİNDE mi. SAF: servis kayıtta reddeder, panel
 * yazarken uyarır; iki ayrı kural ekran "tamam" deyip sunucunun reddetmesi
 * demek.
 */
export function kalemTarihHatasi(
  k: Pick<StratejiKalemiGirdisi, 'baslangic' | 'bitis'>,
  plan: { baslangic: string; bitis: string },
): string | null {
  if (k.baslangic < plan.baslangic || k.bitis > plan.bitis) {
    return `Kampanya tarihi strateji dönemi (${plan.baslangic} – ${plan.bitis}) dışına taşıyor.`;
  }
  return null;
}

// ─── Tahmin: YALNIZ hesabın kendi verisinden ─────────────────────────────

/**
 * Geçmiş yoksa TAHMİN YOK (kullanıcı kararı 3, 2026-10-13). Ajansın elle
 * girdiği bir varsayım aralığı da gösterilmez. Neden ayrı yazılır
 * (`emptyReason` deseni): "geçmiş yok" ile "ölçüm kurulmamış" farklı iş.
 */
export const TAHMIN_YOK_NEDENLERI = ['gecmis_yok', 'olcum_yok', 'karisik_birim', 'platform_kapali'] as const;
export type TahminYokNedeni = (typeof TAHMIN_YOK_NEDENLERI)[number];

export const TAHMIN_YOK_METNI: Record<TahminYokNedeni, string> = {
  gecmis_yok: 'Tahmin yok: hesabın bu amaçta geçmiş verisi yok.',
  olcum_yok: 'Tahmin yok: bu sonuç ölçülmüyor.',
  karisik_birim: 'Tahmin yok: geçmiş veri başka para biriminde.',
  platform_kapali: 'Bu platform bu kampanyada kapalı.',
};

/** Kaç ayın verisine bakılır (en iyi ve en kötü ay arası). */
export const TAHMIN_AY_SAYISI = 3;

export type KalemTahmini =
  | {
      tur: 'aralik';
      olcut: string;
      /** Tam sayı sonuç; `alt === ust` ise tek ayın verisi (ekran "tek ay verisi" der). */
      altSonuc: number;
      ustSonuc: number;
      aySayisi: number;
      kaynak: 'veri';
    }
  | { tur: 'yok'; neden: TahminYokNedeni };

/**
 * Bütçe ÷ [en kötü, en iyi] aylık sonuç başı maliyet. ± yüzde YOK: aralığın
 * iki ucu da gerçekleşmiş birer ay. Sonuç `insights_daily.conversions`
 * DECIMAL(14,4) olduğu için dört basamak ölçekli tam sayıyla bölünür
 * (kayan nokta yok). Harcaması ya da sonucu sıfır olan ay ATLANIR: sıfır
 * sonuçlu ay "sonsuz maliyet" demek ve aralığın alt ucunu sıfıra çekerdi;
 * o ayın varlığı `aySayisi`na girmez, ekran kaç aya bakıldığını söyler.
 */
export function kalemTahmini(
  amac: RehberAmacKodu,
  butceMicros: bigint,
  aylar: ReadonlyArray<{ harcamaMicros: bigint; sonuc: number }>,
): KalemTahmini {
  const gecerli = aylar
    .slice(-TAHMIN_AY_SAYISI)
    .map((a) => ({ h: a.harcamaMicros, s: BigInt(Math.round(a.sonuc * 10_000)) }))
    .filter((a) => a.h > 0n && a.s > 0n);
  if (gecerli.length === 0 || butceMicros <= 0n) return { tur: 'yok', neden: 'gecmis_yok' };
  // sonuç = bütçe × s / h (s 10^4 ölçekli).
  const sonuclar = gecerli.map((a) => (butceMicros * a.s) / a.h / 10_000n);
  const alt = sonuclar.reduce((x, y) => (y < x ? y : x));
  const ust = sonuclar.reduce((x, y) => (y > x ? y : x));
  return { tur: 'aralik', olcut: AMAC_OLCUTU[amac].kod, altSonuc: Number(alt), ustSonuc: Number(ust), aySayisi: gecerli.length, kaynak: 'veri' };
}

// ─── Kalem durumu: rehberden TÜRER, saklanmaz ───────────────────────────

/** Bir platformun kalem içindeki durumu. */
export const KALEM_PLATFORM_DURUMLARI = ['taslakta', 'kuruluyor', 'incelemede', 'yayinda', 'duraklatilmis', 'sorunlu', 'arsivlendi'] as const;
export type KalemPlatformDurumu = (typeof KALEM_PLATFORM_DURUMLARI)[number];

/**
 * Yayın makinesinin 22 durumu → kalemin 7 hâli. `Record` EKSİKSİZ: yayın
 * makinesine durum eklenince derleme burada kırılır; sessizce "taslakta"
 * sayılan yeni bir durum, yayındaki reklamı raporda kurulmamış gösterirdi.
 */
export const YAYIN_KALEM_DURUMU: Record<YayinDurumu, KalemPlatformDurumu> = {
  on_kontrol: 'kuruluyor',
  medya: 'kuruluyor',
  kuruluyor: 'kuruluyor',
  uzlastirma: 'kuruluyor',
  geri_okuma: 'kuruluyor',
  tekillik_kapisi: 'kuruluyor',
  aciliyor: 'kuruluyor',
  sonuc_belirsiz: 'sorunlu',
  kayit_belirsiz: 'sorunlu',
  kurulamadi: 'sorunlu',
  fark_var: 'sorunlu',
  dogrulanamadi: 'sorunlu',
  kismen_acik: 'sorunlu',
  sorunlu: 'sorunlu',
  iletildi: 'incelemede',
  incelemede: 'incelemede',
  ogreniyor: 'yayinda',
  yayinda: 'yayinda',
  bekletildi: 'duraklatilmis',
  durduruldu: 'duraklatilmis',
  kapali_kuruldu: 'duraklatilmis',
  arsivlendi: 'arsivlendi',
};

export type KalemDurumu =
  | { tur: 'aktarilmadi' }
  | { tur: 'aktarildi'; rehberId: string; rehberDurumu: RehberDurumu; platformlar: Partial<Record<RehberPlatformu, KalemPlatformDurumu>> };

/**
 * Rehber özetinden kalem durumu. Yayın kaydı olmayan platform `taslakta`;
 * rehber arşivlendiyse platformlar ne derse desin `arsivlendi` (rehberin
 * kendi `durum`u "Vazgeç ve arşivle"den sonra da `yayinda` kalabiliyor —
 * `RehberOzeti.yayinlar` açıklaması; bu yüzden platform kaydı da okunur).
 */
export function kalemDurumu(
  rehber: { id: string; durum: RehberDurumu; yayinlar: ReadonlyArray<{ platform: RehberPlatformu; durum: YayinDurumu | null }> } | null,
  acikPlatformlar: readonly RehberPlatformu[],
): KalemDurumu {
  if (!rehber) return { tur: 'aktarilmadi' };
  const platformlar: Partial<Record<RehberPlatformu, KalemPlatformDurumu>> = {};
  for (const p of acikPlatformlar) {
    const y = rehber.yayinlar.find((x) => x.platform === p);
    platformlar[p] = rehber.durum === 'arsivlendi' ? 'arsivlendi' : y?.durum ? YAYIN_KALEM_DURUMU[y.durum] : 'taslakta';
  }
  return { tur: 'aktarildi', rehberId: rehber.id, rehberDurumu: rehber.durum, platformlar };
}

// ─── Yanıt tipi ─────────────────────────────────────────────────────────

export interface StratejiKalemi {
  id: string;
  sira: number;
  amac: RehberAmacKodu;
  asama: StratejiAsamasi;
  meta: boolean;
  google: boolean;
  metaPayi: number | null;
  /** micros DİZGE (JSON sayısı 2^53 üstünde yuvarlanır). */
  butceMicros: string;
  baslangic: string;
  bitis: string;
  konumlar: RehberKonumu[];
  yasMin: number | null;
  yasMax: number | null;
  kelimeGrubu: string | null;
  varliklar: Array<{ id: string; ad: string | null; kucukResimAdresi: string | null; silinmis: boolean }>;
  metin: KalemMetni | null;
  kreatifYonergesi: KaynakliMetin | null;
  kitleTarifi: KaynakliMetin | null;
  /** Platform başına; TOPLANMAZ (atıf farkı). Kapalı platform `platform_kapali`. */
  tahmin: Record<RehberPlatformu, KalemTahmini>;
  /** Sunucunun beyanı: alan → kaynak (ekrandaki rozet). */
  kaynaklar: Partial<Record<'amac' | 'platformlar' | 'metaPayi' | 'butce' | 'takvim' | 'konumlar' | 'yas', StratejiKaynagi>>;
  durum: KalemDurumu;
  not: string | null;
}

