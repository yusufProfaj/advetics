import { z } from 'zod';
import type { Platform } from './constants/platforms';
import { KITLE_SINIRLARI, type KitleKonumu, type KitleOzel, type KitleSablonuInput } from './schemas/kitle-sablonu.schema';

/**
 * ═══ HEDEF KİTLE PERFORMANSI (Reklam Yöneticisi › Hedef kitleler) ═══
 *
 * Soru: "hangi kitleden ne dönüş geldi". Meta Insights'ın İLGİ ALANI
 * kırılımı YOK (schema.prisma `InsightBreakdown` notu); yani cevap kırılımdan
 * değil REKLAM SETİNİN HEDEFLEMESİNDEN çıkıyor: aynı hedeflemeyi taşıyan
 * setler tek kitle sayılıp metrikleri toplanıyor.
 *
 * İMZA, hedeflemenin KULLANICININ SEÇTİĞİ kısmından: konum, yaş, cinsiyet,
 * ilgi, özel kitle. Meta geri okumada `location_types`, `targeting_automation`,
 * `brand_safety…` gibi alanlar ekliyor (CLAUDE.md "GERİ OKUMADA META DÖRT ŞEYİ
 * DEĞİŞTİRİYOR"); bunlar imzaya girerse aynı kitle iki satıra bölünür ve
 * toplam yanlış okunur. Diziler SIRALANIYOR: Meta sırayı korumuyor (adlabels).
 *
 * HEDEFLEMESİ OKUNMAYAN SET UYDURULMUYOR: Google reklam grubunun hedeflemesi
 * senkronize edilmiyor (anahtar kelime / kitle ölçütleri ayrı kaynak), LinkedIn
 * ölçütleri farklı bir uzay. Bunlar platform başına TEK "hedefleme bilgisi yok"
 * satırında, sebebiyle duruyor; satırdan atılsalardı toplam harcama sessizce
 * eksik görünürdü.
 */

export interface KitleParcalari {
  konumlar: string[];
  /** Adres çevresi hedeflemeleri ("38.4,27.1 · 8 km"): imzaya girer, özette SAYI olarak yazılır. */
  cevreler: string[];
  yas: string | null;
  cinsiyet: string | null;
  ilgiler: string[];
  ozelKitleler: string[];
  haricKitleler: string[];
  /** Advantage+ kitle açık: Meta seçimi öneri olarak kullanıp genişletebilir. */
  genisletilebilir: boolean;
}

export type KitleImzasi =
  | { tur: 'hedefleme'; anahtar: string; parcalar: KitleParcalari }
  | { tur: 'bilinmiyor'; anahtar: string; neden: string };

function nesne(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function dizi(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** `[{id, name}]` → adlar (ad yoksa kimlik), sıralı ve tekil. */
function adlar(v: unknown): string[] {
  const out = new Set<string>();
  for (const x of dizi(v)) {
    const o = nesne(x);
    if (o) {
      const ad = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : o.id != null ? String(o.id) : null;
      if (ad) out.add(ad);
    } else if (typeof x === 'string' || typeof x === 'number') {
      out.add(String(x));
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'tr'));
}

const META_ILGI_KOVALARI = ['interests', 'behaviors', 'life_events', 'industries', 'work_positions', 'family_statuses', 'income', 'education_statuses'];

const BILINMIYOR_NEDENI: Record<Platform, string> = {
  meta: 'Reklam setinin hedeflemesi henüz senkronize edilmedi.',
  google: 'Google reklam gruplarının kitle ve anahtar kelime ölçütleri bu tabloya taşınmıyor; anahtar kelime sonuçları Raporlar’da.',
  linkedin: 'LinkedIn hedeflemesi (şirket, ünvan, sektör) bu tabloda henüz çözülmüyor.',
};

/**
 * Reklam setinin `targeting` alanından kitle imzası. Yalnız Meta biçimi
 * çözülüyor; diğerleri `bilinmiyor`.
 */
export function kitleImzasi(platform: Platform, targeting: unknown): KitleImzasi {
  const t = nesne(targeting);
  if (platform !== 'meta' || !t) {
    return { tur: 'bilinmiyor', anahtar: `bilinmiyor:${platform}`, neden: BILINMIYOR_NEDENI[platform] };
  }
  const geo = nesne(t.geo_locations) ?? {};
  const konumlar = [
    ...dizi(geo.countries).map((c) => String(c)),
    ...adlar(geo.regions),
    ...adlar(geo.cities),
    ...adlar(geo.zips),
  ].sort((a, b) => a.localeCompare(b, 'tr'));
  const cevreler = dizi(geo.custom_locations)
    .map((c) => {
      const o = nesne(c);
      if (!o) return String(c);
      const birim = o.distance_unit === 'mile' ? 'mil' : 'km';
      return `${o.name ?? `${o.latitude},${o.longitude}`} · ${o.radius ?? '?'} ${birim}`;
    })
    .sort();

  const yasMin = typeof t.age_min === 'number' ? t.age_min : null;
  const yasMax = typeof t.age_max === 'number' ? t.age_max : null;
  // 65 Meta'da "65 ve üzeri"; hiç gönderilmemişse de üst sınır yok.
  const yas = yasMin === null && yasMax === null ? null : yasMax === null || yasMax >= 65 ? `${yasMin ?? 18}+` : `${yasMin ?? 18}-${yasMax}`;

  const g = dizi(t.genders).map(Number);
  const cinsiyet = g.length === 1 ? (g[0] === 1 ? 'Erkek' : g[0] === 2 ? 'Kadın' : null) : null;

  // flexible_spec: her öğe bir VE grubu, öğe içindeki kovalar VEYA. İmza için
  // adların birleşimi yeterli; aynı adlar farklı mantıkla nadir ve ekranda
  // zaten ayırt edilemez.
  const ilgiKaynaklari: unknown[] = [];
  for (const k of META_ILGI_KOVALARI) ilgiKaynaklari.push(...dizi(t[k]));
  for (const grup of dizi(t.flexible_spec)) {
    const o = nesne(grup);
    if (o) for (const k of META_ILGI_KOVALARI) ilgiKaynaklari.push(...dizi(o[k]));
  }
  const ilgiler = adlar(ilgiKaynaklari);
  const ozelKitleler = adlar(t.custom_audiences);
  const haricKitleler = adlar(t.excluded_custom_audiences);
  const otomasyon = nesne(t.targeting_automation);
  const genisletilebilir = otomasyon?.advantage_audience === 1 || otomasyon?.advantage_audience === true;

  const parcalar: KitleParcalari = { konumlar, cevreler, yas, cinsiyet, ilgiler, ozelKitleler, haricKitleler, genisletilebilir };
  return { tur: 'hedefleme', anahtar: `meta:${JSON.stringify(parcalar)}`, parcalar };
}

/** "Türkiye · 25-44 · Kadın · ilgi: Golf, Otomobil +2" */
export function kitleImzasiOzeti(imza: KitleImzasi): string {
  if (imza.tur === 'bilinmiyor') return 'Hedefleme bilgisi yok';
  const p = imza.parcalar;
  const bolumler: string[] = [];
  // Adres çevresi koordinatla yazılmıyor ("38.48907,27.081299"): sayı ve yarıçap okunur.
  const yaricaplar = [...new Set(p.cevreler.map((c) => c.split(' · ')[1] ?? ''))].filter(Boolean);
  const cevre = p.cevreler.length > 0 ? `${p.cevreler.length} adres çevresi${yaricaplar.length === 1 ? ` (${yaricaplar[0]})` : ''}` : null;
  const konum = [p.konumlar.length > 0 ? kisalt(p.konumlar, 3) : null, cevre].filter(Boolean).join(', ');
  bolumler.push(konum || 'Konum yok');
  bolumler.push(p.yas ? `${p.yas} yaş` : 'Tüm yaşlar');
  if (p.cinsiyet) bolumler.push(p.cinsiyet);
  if (p.ozelKitleler.length > 0) bolumler.push(`özel kitle: ${kisalt(p.ozelKitleler, 2)}`);
  if (p.ilgiler.length > 0) bolumler.push(`ilgi: ${kisalt(p.ilgiler, 2)}`);
  if (p.ozelKitleler.length === 0 && p.ilgiler.length === 0) bolumler.push('geniş kitle');
  if (p.haricKitleler.length > 0) bolumler.push(`${p.haricKitleler.length} kitle hariç`);
  return bolumler.join(' · ');
}

/** SESSİZ KESME YOK: kaç öğenin gizlendiği yazıyor. */
function kisalt(liste: string[], n: number): string {
  return liste.slice(0, n).join(', ') + (liste.length > n ? ` +${liste.length - n}` : '');
}

/** Kitle satırının metrik toplamı (micros BigInt değil sayı-dizgesi: JSON taşınabilir). */
export interface KitlePerformansSatiri {
  anahtar: string;
  tur: KitleImzasi['tur'];
  ozet: string;
  /** `bilinmiyor` satırında neden; `hedefleme` satırında null. */
  neden: string | null;
  parcalar: KitleParcalari | null;
  platform: Platform;
  /** Bu kitleyi taşıyan reklam setleri (ilk 5 ad + toplam sayı). */
  setSayisi: number;
  setler: Array<{ id: string; ad: string; kampanyaAdi: string | null }>;
  /** Kitle şablonu olarak kaydetmek için örnek setin hedeflemesi (yalnız Meta). */
  ornekSetId: string | null;
  currency: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
}

export interface KitlePerformansi {
  satirlar: KitlePerformansSatiri[];
  /** Harcaması olan toplam reklam seti; satırlara dağılan setlerle aynı olmalı. */
  toplamSet: number;
  /** Tablo sınırı aşıldıysa gizlenen kitle sayısı. */
  gizlenenKitle: number;
  /** Sunucu set sınırına ulaştıysa (en çok harcayan N set okundu): SESSİZ KESME YOK. */
  setSiniri: number | null;
  /**
   * Kampanya düzeyinde raporlanıp reklam seti düzeyinde raporlanmayan
   * harcama, para birimine göre. Canlıda ölçüldü (2026-10-16, Eren Altay):
   * Meta kampanya toplamı set toplamından 237 ₺, Google 32 ₺ fazla. Kitle
   * tablosu setlerden kurulduğu için o tutar hiçbir kitleye yazılamıyor;
   * özetteki harcamayla tablo toplamı ayrışıyor ve bu SÖYLENİYOR.
   */
  setDisiHarcama: Array<{ currency: string; tutar: number }>;
}

export interface KitleSetGirdisi {
  setId: string;
  setAdi: string;
  kampanyaAdi: string | null;
  platform: Platform;
  targeting: unknown;
  currency: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
}

/**
 * Setleri kitleye göre topla. Para birimi farklı setler AYNI satıra girmiyor
 * (anahtar para birimini de taşıyor): TRY ile USD'yi toplamak yanlış sayı.
 */
export function kitlelereGoreTopla(setler: KitleSetGirdisi[], sinir = 100): KitlePerformansi {
  const gruplar = new Map<string, { imza: KitleImzasi; setler: KitleSetGirdisi[] }>();
  for (const s of setler) {
    const imza = kitleImzasi(s.platform, s.targeting);
    const anahtar = `${imza.anahtar}|${s.currency}`;
    const g = gruplar.get(anahtar);
    if (g) g.setler.push(s);
    else gruplar.set(anahtar, { imza, setler: [s] });
  }
  const satirlar: KitlePerformansSatiri[] = [...gruplar.entries()].map(([anahtar, { imza, setler: ss }]) => {
    const top = (k: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversionValue') =>
      ss.reduce((a, s) => a + (Number.isFinite(s[k]) ? s[k] : 0), 0);
    const impressions = top('impressions');
    const clicks = top('clicks');
    const spend = top('spend');
    const conversions = top('conversions');
    const conversionValue = top('conversionValue');
    const siraliSetler = [...ss].sort((a, b) => b.spend - a.spend);
    return {
      anahtar,
      tur: imza.tur,
      ozet: kitleImzasiOzeti(imza),
      neden: imza.tur === 'bilinmiyor' ? imza.neden : null,
      parcalar: imza.tur === 'hedefleme' ? imza.parcalar : null,
      platform: ss[0]!.platform,
      setSayisi: ss.length,
      setler: siraliSetler.slice(0, 5).map((s) => ({ id: s.setId, ad: s.setAdi, kampanyaAdi: s.kampanyaAdi })),
      ornekSetId: imza.tur === 'hedefleme' ? siraliSetler[0]!.setId : null,
      currency: ss[0]!.currency,
      impressions,
      clicks,
      spend,
      conversions,
      conversionValue,
      ctr: impressions > 0 ? clicks / impressions : null,
      cpa: conversions > 0 ? spend / conversions : null,
      roas: spend > 0 && conversionValue > 0 ? conversionValue / spend : null,
    };
  });
  // Bilinen kitleler önce, sonra harcamaya göre.
  satirlar.sort((a, b) => (a.tur === b.tur ? b.spend - a.spend : a.tur === 'hedefleme' ? -1 : 1));
  return {
    satirlar: satirlar.slice(0, sinir),
    toplamSet: setler.length,
    gizlenenKitle: Math.max(0, satirlar.length - sinir),
    setSiniri: null,
    setDisiHarcama: [],
  };
}

// -----------------------------------------------------------------------------
// Reklam setinin kitlesini kütüphaneye almak ("hedeflemede kullanılsın")
// -----------------------------------------------------------------------------

export const settenKitleIstegiSchema = z.object({
  clientId: z.string().uuid(),
  adGroupId: z.string().uuid(),
  name: z.string().trim().min(1, 'Kitle adı boş olamaz').max(KITLE_SINIRLARI.ad),
});
export type SettenKitleIstegi = z.infer<typeof settenKitleIstegiSchema>;

export interface SettenKitleSonucu {
  /** Şablon alanları (ad ve workspace hariç); kitle şablonu şemasından geçer. */
  alanlar: Omit<KitleSablonuInput, 'clientId' | 'name'>;
  /**
   * Şablona TAŞINAMAYAN parçalar, kullanıcıya söylenir: şablon konum + yaş +
   * cinsiyet + ilgi + özel kitle taşıyor. Davranış, adres çevresi, posta
   * kodu ve VE grupları sessizce düşseydi kaydedilen kitle reklamdakinden
   * GENİŞ olurdu ve kimse fark etmezdi.
   */
  atilanlar: string[];
}

/**
 * Meta reklam setinin `targeting`inden kitle şablonu. Kimlikler Meta'dan
 * geldiği gibi; yeni bir arama yapılmıyor (tahmin yok).
 */
export function settenKitleSablonu(targeting: unknown, hesap: { id: string; ad: string }): SettenKitleSonucu {
  const t = nesne(targeting) ?? {};
  const atilanlar: string[] = [];
  const geo = nesne(t.geo_locations) ?? {};
  const locations: KitleKonumu[] = [];
  for (const c of dizi(geo.countries)) {
    if (typeof c === 'string' && c.length === 2) locations.push({ key: c, type: 'country', label: c, countryCode: c });
  }
  for (const [kova, tur] of [['regions', 'region'], ['cities', 'city']] as const) {
    for (const x of dizi(geo[kova])) {
      const o = nesne(x);
      if (!o || o.key == null) continue;
      const ulke = typeof o.country === 'string' ? o.country : null;
      locations.push({ key: String(o.key), type: tur, label: String(o.name ?? o.key), countryCode: ulke && ulke.length === 2 ? ulke : null });
      if (tur === 'city' && o.radius != null) atilanlar.push(`${String(o.name ?? o.key)} çevresindeki ${String(o.radius)} ${String(o.distance_unit ?? 'km')} yarıçap`);
    }
  }
  if (dizi(geo.zips).length > 0) atilanlar.push(`${dizi(geo.zips).length} posta kodu`);
  if (dizi(geo.custom_locations).length > 0) atilanlar.push(`${dizi(geo.custom_locations).length} adres çevresi`);

  const yasMin = typeof t.age_min === 'number' ? t.age_min : 18;
  const yasMax = typeof t.age_max === 'number' ? t.age_max : 65;
  if (yasMin < 18) atilanlar.push(`alt yaş ${yasMin} (şablon 18'den başlıyor)`);
  const g = dizi(t.genders).map(Number);
  const genders = g.length === 1 ? (g[0] === 1 ? 'male' : g[0] === 2 ? 'female' : 'all') : 'all';

  const ilgiler = new Map<string, string>();
  const ilgiTopla = (o: Record<string, unknown>) => {
    for (const x of dizi(o.interests)) {
      const i = nesne(x);
      if (i && i.id != null && /^\d{1,25}$/.test(String(i.id))) ilgiler.set(String(i.id), String(i.name ?? i.id));
    }
    for (const k of META_ILGI_KOVALARI) {
      if (k !== 'interests' && dizi(o[k]).length > 0) atilanlar.push(`${dizi(o[k]).length} ${k === 'behaviors' ? 'davranış' : 'demografik ayrıntı'}`);
    }
  };
  ilgiTopla(t);
  const gruplar = dizi(t.flexible_spec).map(nesne).filter((x): x is Record<string, unknown> => x !== null);
  for (const grup of gruplar) ilgiTopla(grup);
  // Şablonda ilgiler BİRLEŞİM; reklamda birden çok grup VE demek. Birleştirmek
  // kitleyi genişletir: söyleniyor.
  if (gruplar.length > 1) atilanlar.push(`${gruplar.length} ilgi grubu arasındaki "ve" koşulu (şablonda ilgiler "veya")`);

  const ozelKitleler: KitleOzel[] = [];
  for (const [kova, mod] of [['custom_audiences', 'dahil'], ['excluded_custom_audiences', 'haric']] as const) {
    for (const x of dizi(t[kova])) {
      const o = nesne(x);
      if (o && o.id != null && /^\d{1,25}$/.test(String(o.id))) {
        ozelKitleler.push({ id: String(o.id), name: String(o.name ?? o.id), tip: 'ozel', mod, hesapId: hesap.id, hesapAdi: hesap.ad });
      }
    }
  }
  const ilgiListesi = [...ilgiler].map(([id, name]) => ({ id, name }));
  if (ilgiListesi.length > KITLE_SINIRLARI.ilgi) atilanlar.push(`${ilgiListesi.length - KITLE_SINIRLARI.ilgi} ilgi alanı (şablon sınırı ${KITLE_SINIRLARI.ilgi})`);
  if (locations.length > KITLE_SINIRLARI.konum) atilanlar.push(`${locations.length - KITLE_SINIRLARI.konum} konum (şablon sınırı ${KITLE_SINIRLARI.konum})`);
  if (ozelKitleler.length > KITLE_SINIRLARI.ozelKitle) atilanlar.push(`${ozelKitleler.length - KITLE_SINIRLARI.ozelKitle} özel kitle (şablon sınırı ${KITLE_SINIRLARI.ozelKitle})`);
  return {
    alanlar: {
      locations: locations.slice(0, KITLE_SINIRLARI.konum),
      ageMin: Math.min(65, Math.max(18, yasMin)),
      ageMax: Math.min(65, Math.max(18, yasMax)),
      genders,
      interests: ilgiListesi.slice(0, KITLE_SINIRLARI.ilgi),
      ozelKitleler: ozelKitleler.slice(0, KITLE_SINIRLARI.ozelKitle),
      // Meta setinin Google karşılığı yok; kullanıcı kütüphanede ekliyor.
      google: { ilgiler: [], kelimeler: [] },
    },
    atilanlar,
  };
}
