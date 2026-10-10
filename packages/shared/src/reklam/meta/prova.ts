/**
 * Meta PROVASI — nesne açmadan "bu gövdeyi kabul eder misin?" (TASARIM.md
 * § 11.10, § 11.13, § 04.3).
 *
 * Provada hiçbir nesne kurulmadığı için kimlik yer tutucuları çözülemez:
 * reklam seti `campaign_id` yerine satır içi `campaign_spec`, reklam
 * `adset_id` ve kreatif kimliği yerine satır içi `adset_spec` ve kreatif
 * taşır. Görsel hash'i ise GERÇEK olmalı (görsel yüklemek para harcamaz ve
 * hesap başına önbellekte kalır).
 *
 * Satır içi şekiller belgeden; canlı turda ölçülene kadar provanın "geçti"
 * demesi ile Meta'nın gerçek kurulumu kabul etmesi arasında fark olabilir.
 * Kurulumdan sonraki geri okuma bu yüzden yerinde duruyor.
 */
import type { MetaGovdesi, NesneTuru } from './derle';

/**
 * Uç başına İZİNLİ `execution_options` — tek sabit. Yanlış birleşim kodda
 * reddedilir ve Meta'ya hiç gitmez; `synchronous_ad_review` yalnız
 * `validate_only` ile birlikte ve yalnız reklamda.
 */
export const EXECUTION_OPTIONS: Record<Exclude<NesneTuru, 'form'>, readonly string[]> = {
  kampanya: ['validate_only', 'include_recommendations'],
  reklam_seti: ['validate_only', 'include_recommendations'],
  kreatif: ['validate_only'],
  reklam: ['validate_only', 'synchronous_ad_review', 'include_recommendations'],
};

export function secenekleriDogrula(nesne: Exclude<NesneTuru, 'form'>, secenekler: readonly string[]): void {
  if (!secenekler.includes('validate_only')) throw new Error('Prova validate_only olmadan gönderilmez');
  for (const s of secenekler) {
    if (!EXECUTION_OPTIONS[nesne].includes(s)) throw new Error(`${nesne} ucunda izinsiz execution_options: ${s}`);
  }
}

export interface ProvaGovdesi {
  nesne: Exclude<NesneTuru, 'form'>;
  ad: string;
  uc: string;
  alanlar: Record<string, unknown>;
  /** Geçerse ekranda söylenecek kapsama sınırı (sessizce yeşile dönmesin). */
  not?: string;
}

/**
 * ÖZEL KATEGORİ SATIR İÇİ KAMPANYADA SINANAMIYOR — ölçüldü (2026-10-10,
 * v25.0, `meta-kategori-prova`, Ege Birlik Yapı). `campaign_spec` içinde
 * `special_ad_categories` hangi biçimde giderse gitsin (`["HOUSING"]`,
 * ülkeyle birlikte, düz dize) Meta değeri kendi sıra numarasına çevirip
 * `(#100) ... must be one of {...} - got "2"` ile reddediyor; kampanya
 * TEK BAŞINA kategoriyle geçiyor. Gerçek kurulum `campaign_id` kullandığı
 * için bu yoldan geçmiyor.
 *
 * Bu yüzden kategoriyi YALNIZ satır içi kampanyadan çıkarıyoruz: kampanya
 * provası kategoriyi taşımaya devam ediyor ve kısıtlı kategori kuralları
 * (yaş, cinsiyet, yarıçap) Meta'dan önce `hedeflemeUret` içinde zaten
 * dayatılıyor. Meta'nın kendi konut denetimi kurulumda koşuyor; düşerse
 * kurulum duraklatılmış kampanyada durur ve geri okuma kategoriyi
 * karşılaştırır. Kategoriyi provanın TAMAMINDAN atmak, kampanyanın
 * kategorili kabul edildiğini de kanıtlamayan yalancı bir prova olurdu.
 */
export const KATEGORI_PROVA_NOTU =
  'Meta konut, iş ve kredi kurallarını yalnız kurulum sırasında denetleyebiliyor; yaş ve konum kısıtlarını biz uyguladık.';

/** Satır içi kampanya: özel kategori ve ülkesi çıkarılmış hâl (bkz. üstteki not). */
function kategorisizKampanya(spec: Record<string, unknown>): { spec: Record<string, unknown>; kategoriVar: boolean } {
  const kategoriler = spec.special_ad_categories;
  if (!Array.isArray(kategoriler) || kategoriler.length === 0) return { spec, kategoriVar: false };
  const { special_ad_category_country: _u, ...kalan } = spec;
  return { spec: { ...kalan, special_ad_categories: [] }, kategoriVar: true };
}

/** Parça notları tek cümlede; aynı not her reklamda tekrar ettiği için tekilleştirilir. */
export function provaNotu(sonuclar: ReadonlyArray<{ not?: string | null }>): string | null {
  const notlar = [...new Set(sonuclar.map((s) => s.not).filter((n): n is string => !!n))];
  return notlar.length ? notlar.join(' ') : null;
}

const YER_TUTUCU = /^\{(?:medya|video):([0-9a-f-]+)\}$/;

/** Yalnız `{medya:<varlık>}` çözülür; başka yer tutucu provada kalamaz. */
function medyaYerlestir(v: unknown, hashler: ReadonlyMap<string, string>): unknown {
  if (typeof v === 'string') {
    const m = YER_TUTUCU.exec(v);
    if (m) {
      const anahtar = v.startsWith('{video:') ? `video:${m[1]}` : m[1]!;
      const h = hashler.get(anahtar);
      if (!h) throw new Error(`Medya kimliği yok: ${v}`);
      return h;
    }
    if (/^\{[a-z_]+(?::[0-9a-z-]+)?\}$/.test(v)) throw new Error(`Provada çözülemeyen yer tutucu: ${v}`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => medyaYerlestir(x, hashler));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, medyaYerlestir(x, hashler)]));
  return v;
}

/**
 * Derlenmiş gövdelerden prova gövdeleri. Reklam başına bir reklam provası
 * (her kavramın kreatifi ayrı doğrulanıyor: metin ya da görsel tek fikirde
 * reddedilebilir). Kampanya bütçesi ve teklifi satır içi kampanyada da
 * taşınıyor: CBO'da reklam seti bütçesizdir ve bütçesiz satır içi kampanya
 * "bütçe gerekli" ile düşebilirdi [Canlı ölçülecek].
 */
export function provaGovdeleri(govdeler: MetaGovdesi[], hashler: ReadonlyMap<string, string>): ProvaGovdesi[] {
  const bul = (ad: string) => {
    const g = govdeler.find((x) => x.ad === ad);
    if (!g) throw new Error(`Gövde yok: ${ad}`);
    return g;
  };
  const kampanya = bul('kampanya').alanlar;
  const { adlabels: _k, status: _ks, ...kampanyaSpec } = kampanya;
  const satirIci = kategorisizKampanya(kampanyaSpec);
  const not = satirIci.kategoriVar ? { not: KATEGORI_PROVA_NOTU } : {};
  const { campaign_id: _c, adlabels: _a, ...setAlanlari } = bul('reklam_seti').alanlar;
  const reklamSeti = { ...setAlanlari, campaign_spec: satirIci.spec };
  const sonuc: ProvaGovdesi[] = [
    // Kampanya kendi ucunda kategoriyle sınanıyor: orada Meta onu kabul ediyor.
    { nesne: 'kampanya', ad: 'kampanya', uc: 'campaigns', alanlar: { ...kampanya, execution_options: ['validate_only'] } },
    { nesne: 'reklam_seti', ad: 'reklam_seti', uc: 'adsets', alanlar: { ...reklamSeti, execution_options: ['validate_only'] }, ...not },
  ];
  for (const g of govdeler.filter((x) => x.nesne === 'kreatif')) {
    const kreatif = medyaYerlestir(g.alanlar, hashler) as Record<string, unknown>;
    sonuc.push({ nesne: 'kreatif', ad: g.ad, uc: 'adcreatives', alanlar: { ...kreatif, execution_options: ['validate_only'] } });
    const n = g.ad.split(':')[1];
    const { adset_id: _s, creative: _cr, adlabels: _ra, ...reklam } = bul(`reklam:${n}`).alanlar;
    const { adlabels: _ka, ...satirIciKreatif } = kreatif;
    sonuc.push({
      nesne: 'reklam',
      ad: `reklam:${n}`,
      uc: 'ads',
      alanlar: {
        ...reklam,
        adset_spec: reklamSeti,
        creative: satirIciKreatif,
        execution_options: ['validate_only', 'synchronous_ad_review'],
      },
      ...not,
    });
  }
  for (const p of sonuc) secenekleriDogrula(p.nesne, p.alanlar.execution_options as string[]);
  return sonuc;
}

/** Prova sonucu tazeliği: 30 dakikadan eski prova yayının gerekçesi sayılmaz. */
export const PROVA_TAZELIK_MS = 30 * 60_000;
