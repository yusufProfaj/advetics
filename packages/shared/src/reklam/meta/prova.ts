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
}

const YER_TUTUCU = /^\{medya:([0-9a-f-]+)\}$/;

/** Yalnız `{medya:<varlık>}` çözülür; başka yer tutucu provada kalamaz. */
function medyaYerlestir(v: unknown, hashler: ReadonlyMap<string, string>): unknown {
  if (typeof v === 'string') {
    const m = YER_TUTUCU.exec(v);
    if (m) {
      const h = hashler.get(m[1]!);
      if (!h) throw new Error(`Görsel hash'i yok: ${m[1]}`);
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
  const { campaign_id: _c, adlabels: _a, ...setAlanlari } = bul('reklam_seti').alanlar;
  const reklamSeti = { ...setAlanlari, campaign_spec: kampanyaSpec };
  const sonuc: ProvaGovdesi[] = [
    { nesne: 'kampanya', ad: 'kampanya', uc: 'campaigns', alanlar: { ...kampanya, execution_options: ['validate_only'] } },
    { nesne: 'reklam_seti', ad: 'reklam_seti', uc: 'adsets', alanlar: { ...reklamSeti, execution_options: ['validate_only'] } },
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
    });
  }
  for (const p of sonuc) secenekleriDogrula(p.nesne, p.alanlar.execution_options as string[]);
  return sonuc;
}

/** Prova sonucu tazeliği: 30 dakikadan eski prova yayının gerekçesi sayılmaz. */
export const PROVA_TAZELIK_MS = 30 * 60_000;
