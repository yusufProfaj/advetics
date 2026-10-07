/**
 * `derleMeta()` — taslaktan Meta gövdelerine (TASARIM.md § 06.1, 06.4).
 *
 * SAF: platform çağrısı, veritabanı, saat, rastgelelik yok. Aynı girdi iki
 * kez derlenince AYNI baytlar çıkmalı; prova, onay kartı ve yayın aynı
 * çıktıya bağlanıyor ve ayrışırsa kart sebepsiz bayatlar.
 *
 * "KISMEN DERLENDİ" DİYE BİR HÂL YOK: ya gövdelerin TAMAMI ya ret. Yarım ağaç
 * Meta'da kurulursa geri almak arşiv ister ve arşiv tek yönlü.
 *
 * Ret ile hata AYRI: ret kullanıcının düzeltebileceği şey (konum yok, bütçe
 * yok); manifesto eksiği Advetics'in hatası ve FIRLATIR — kullanıcıya
 * "düzelt" denemez.
 *
 * Gövdeler arası bağlar yer tutucuyla (`{kampanya}`, `{reklam_seti}`,
 * `{kreatif:1}`): kimlikleri yayın motoru zincir sırasında doldurur.
 */
import { ACILMADI_ONEKI, adlabels, kampanyaAdi, reklamAdi, reklamSetiAdi } from './adlandirma';
import { etkinKategoriler, hedeflemeUret, type HedeflemeGirdisi, type OzelKategori } from './hedefleme';
import { NIYET_KATALOGU, type NiyetKodu } from './niyetler';
import { microsToMinor } from '../para';
import type { Butce } from '../butce';
import { ATIF_STANDARTLARI } from '../taslak';

export const DERLEYICI_SURUMU = '1.0.0';
export const DESTEKLENEN_META_SURUMLERI = ['v25.0', 'v26.0'] as const;
export type MetaApiSurumu = (typeof DESTEKLENEN_META_SURUMLERI)[number];

/**
 * Advantage+ creative anahtarları — HER BİRİ OPT_OUT. Karar 2 kitleyi ve
 * yerleşimi kapsıyor, kreatifi DEĞİL: Meta'nın kırpması ya da metni yeniden
 * yazması güvenli banda konan zorunlu uyarıyı görünmez kılabilir.
 * `adapt_to_placement` varsayılan opt-in. Liste belgeden (R6, bölüm 05);
 * canlı turda ölçülür ve tanınmayan bir anahtar isteği düşürürse buradan
 * çıkar. `standard_enhancements` bilerek YOK: kullanımdan kalktı.
 */
export const TANINAN_OZELLIK_ANAHTARLARI = [
  'adapt_to_placement',
  'add_text_overlay',
  'description_automation',
  'enhance_cta',
  'image_animation',
  'image_background_gen',
  'image_brightness_and_contrast',
  'image_templates',
  'image_touchups',
  'image_uncrop',
  'inline_comment',
  'media_type_automation',
  'music',
  'pac_relaxation',
  'product_extensions',
  'reveal_details_over_time',
  'site_extensions',
  'text_generation',
  'text_optimizations',
  'text_translation',
  'video_auto_crop',
  'video_filtering',
  'video_uncrop',
] as const;

/**
 * Ajans geneli atıf standardı (ATF-02). Seçilmeden yayın YOK: onaysız
 * uygulanan bir değer de bir karardır ve kararın sahibi kullanıcı.
 * Etkileşim penceresi belgede `attribution_spec` karşılığı olmadığı için
 * listede yok (canlıda ölçülecek).
 */
export type AtifStandardi = (typeof ATIF_STANDARTLARI)[number];

const ATIF_SPEC: Record<AtifStandardi, Array<{ event_type: string; window_days: number }>> = {
  tik7_gor1: [
    { event_type: 'CLICK_THROUGH', window_days: 7 },
    { event_type: 'VIEW_THROUGH', window_days: 1 },
  ],
  tik7: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
};

export interface Kavram {
  /** Bu reklam hesabındaki `image_hash` (hesap başına; başka hesabınki çalışmaz). */
  gorselHash: string;
  baslik: string;
  metin: string;
  aciklama?: string;
}

export interface DerlemeGirdisi {
  apiSurumu: MetaApiSurumu;
  yayinKimligi: string;
  /** Hesabın saat diliminde `YYYY-MM-DD`; adlarda kullanılıyor. */
  tarih: string;
  workspaceKisaAdi: string;
  niyet: NiyetKodu;
  hesap: { platformId: string; paraBirimi: string };
  sayfaPlatformId: string;
  instagramPlatformId: string | null;
  hedefleme: Omit<HedeflemeGirdisi, 'advantageAudience' | 'kategoriler'>;
  kategoriler: { taban: OzelKategori[]; ek: OzelKategori[] };
  butce: Butce;
  /** ISO 8601, hesabın saat dilimi ofsetiyle. Toplam bütçede bitiş zorunlu. */
  takvim: { baslangic: string; bitis: string | null };
  atif: AtifStandardi | null;
  kavramlar: Kavram[];
  /** SITE: nihai https adresi. */
  hedefAdres: string | null;
  /** FORM: zincirde ilk kurulup geri okunan formun kimliği ya da `{form}`. */
  formId: string | null;
  urlEtiketleri: string | null;
}

export type NesneTuru = 'form' | 'kampanya' | 'reklam_seti' | 'kreatif' | 'reklam';

export interface MetaGovdesi {
  nesne: NesneTuru;
  /** Zincirdeki adı; yer tutucular buna bakar (`kreatif:2`). */
  ad: string;
  /** Hesaba göre uç: `campaigns`, `adsets`, `adcreatives`, `ads`. */
  uc: string;
  alanlar: Record<string, unknown>;
}

export interface SifirCagriRet {
  kod: string;
  mesaj: string;
}

export type DerlemeSonucu =
  | {
      tur: 'govde';
      govdeler: MetaGovdesi[];
      kapattiklarimiz: string[];
      acikcaYazilanAlanlar: string[];
      apiSurumu: MetaApiSurumu;
      derleyiciSurumu: string;
    }
  | { tur: 'ret'; retler: SifirCagriRet[] };

/** Bu turda derlenen niyetler. Diğerleri tahmin yerine retle duruyor. */
const DERLENEN_NIYETLER: readonly NiyetKodu[] = ['FORM', 'SITE'];

export function derleMeta(g: DerlemeGirdisi): DerlemeSonucu {
  const retler: SifirCagriRet[] = [];
  const niyet = NIYET_KATALOGU[g.niyet];

  if (!(DESTEKLENEN_META_SURUMLERI as readonly string[]).includes(g.apiSurumu)) {
    throw new Error(`Desteklenmeyen Meta API sürümü: ${g.apiSurumu}`);
  }
  if (!niyet.meta) {
    return { tur: 'ret', retler: [{ kod: 'NYT-YONLENDIRME', mesaj: `${niyet.ekranAdi} Akıllı Boost'ta yapılır.` }] };
  }
  if (!DERLENEN_NIYETLER.includes(g.niyet)) {
    retler.push({
      kod: 'NYT-OLCULMEDI',
      mesaj: `"${niyet.ekranAdi}" henüz yayınlanamıyor: Meta'daki kurulumu canlıda doğrulanmadı.`,
    });
  }
  if (g.atif === null) {
    retler.push({
      kod: 'OK-16',
      mesaj: 'Atıf standardı henüz seçilmedi. Ajans yöneticisi seçene kadar yeni reklam yayınlanamaz.',
    });
  }
  if (g.kavramlar.length < 1 || g.kavramlar.length > 5) {
    retler.push({ kod: 'KRT-SAYI', mesaj: 'Bir reklamda 1 ile 5 arasında fikir olur.' });
  }
  for (const [i, k] of g.kavramlar.entries()) {
    if (!k.gorselHash) retler.push({ kod: 'KRT-GORSEL', mesaj: `Fikir ${i + 1}: görsel bu hesaba yüklenmemiş.` });
    if (!k.baslik.trim() || !k.metin.trim()) {
      retler.push({ kod: 'KRT-METIN', mesaj: `Fikir ${i + 1}: başlık ya da metin boş.` });
    }
  }
  if (g.niyet === 'SITE' && !(g.hedefAdres && /^https:\/\/[^\s/]+\.[^\s]+/.test(g.hedefAdres))) {
    retler.push({ kod: 'SITE-ADRES', mesaj: 'Site adresi https:// ile başlayan geçerli bir adres olmalı.' });
  }
  if (g.niyet === 'FORM' && !g.formId) {
    retler.push({ kod: 'FORM-YOK', mesaj: 'Form seçilmedi.' });
  }
  if (g.butce.seviye !== 'kampanya') {
    // ABO yalnız Gelişmiş'te ve paylaşım alanı kuralıyla; bu turda yok.
    retler.push({ kod: 'BTC-02', mesaj: 'Reklam seti bütçesi bu sürümde desteklenmiyor.' });
  }
  if (g.butce.tip === 'toplam' && !g.takvim.bitis) {
    retler.push({ kod: 'BTC-02', mesaj: 'Toplam bütçede Meta bitiş tarihi istiyor.' });
  }
  let butceMinor: bigint | null = null;
  try {
    butceMinor = microsToMinor(g.butce.micros, g.hesap.paraBirimi);
    if (butceMinor <= 0n) throw new Error('sıfır');
  } catch {
    retler.push({ kod: 'BTC-01', mesaj: 'Bütçe tutarı bu para biriminde geçerli değil.' });
  }

  const kategoriler = etkinKategoriler(g.kategoriler.taban, g.kategoriler.ek);
  // Sağlık turizmi dalı (advantage 0) burada yok: dal sektör profilinden
  // gelecek; o güne kadar yeni modül her yayında 1 yazıyor (karar 2).
  const hedef = hedeflemeUret({ ...g.hedefleme, advantageAudience: 1, kategoriler });
  if (hedef.tur === 'ret') retler.push(...hedef.retler);

  if (retler.length > 0 || hedef.tur === 'ret' || butceMinor === null) return { tur: 'ret', retler };

  const m = niyet.meta;
  const adG = {
    workspaceKisaAdi: g.workspaceKisaAdi,
    niyet: g.niyet,
    tarih: g.tarih,
    yayinKimligi: g.yayinKimligi,
  };
  const etiketler = adlabels(g.yayinKimligi);

  const kampanya: Record<string, unknown> = {
    name: ACILMADI_ONEKI + kampanyaAdi(adG),
    objective: m.objective,
    status: 'PAUSED',
    special_ad_categories: kategoriler,
    // CBO: bütçe kampanyada; paylaşım alanı GÖNDERİLMEZ (true → 4834002).
    [g.butce.tip === 'gunluk' ? 'daily_budget' : 'lifetime_budget']: butceMinor.toString(),
    // Yazılmayınca hesap varsayılanına kalıyor; iki müşteride iki teklif.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    adlabels: etiketler,
  };
  if (kategoriler.length > 0) {
    // Boş bırakılırsa Meta HESABIN VERGİ ÜLKESİNE düşer.
    kampanya.special_ad_category_country = hedef.ulkeler;
  }

  const reklamSeti: Record<string, unknown> = {
    name: ACILMADI_ONEKI + reklamSetiAdi(adG),
    campaign_id: '{kampanya}',
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: m.optimizationGoal,
    promoted_object: { page_id: g.sayfaPlatformId },
    targeting: hedef.targeting,
    attribution_spec: ATIF_SPEC[g.atif!],
    start_time: g.takvim.baslangic,
    adlabels: etiketler,
  };
  if (m.destinationType) reklamSeti.destination_type = m.destinationType;
  if (g.takvim.bitis) reklamSeti.end_time = g.takvim.bitis;

  const govdeler: MetaGovdesi[] = [
    { nesne: 'kampanya', ad: 'kampanya', uc: 'campaigns', alanlar: kampanya },
    { nesne: 'reklam_seti', ad: 'reklam_seti', uc: 'adsets', alanlar: reklamSeti },
  ];

  g.kavramlar.forEach((k, i) => {
    const n = i + 1;
    // CTA HER kavramda aynı biçim: eski kodda 2.+ reklam CTA'sız kuruluyordu.
    const cta: Record<string, unknown> =
      g.niyet === 'FORM'
        ? { type: m.cta, value: { lead_gen_form_id: g.formId } }
        : { type: m.cta, value: { link: g.hedefAdres } };
    const linkData: Record<string, unknown> = {
      image_hash: k.gorselHash,
      name: k.baslik,
      message: k.metin,
      call_to_action: cta,
      // FORM'da bağlantı yine zorunlu ama tıklama formu açıyor; Meta'nın
      // belgelediği sabit bağlantı.
      link: g.niyet === 'FORM' ? 'http://fb.me/' : g.hedefAdres,
    };
    if (k.aciklama) linkData.description = k.aciklama;
    const oss: Record<string, unknown> = { page_id: g.sayfaPlatformId, link_data: linkData };
    // IG seçiliyse daima: yoksa Instagram'da HİÇ yayın olmaz, hata da yok.
    if (g.instagramPlatformId) oss.instagram_user_id = g.instagramPlatformId;

    const kreatif: Record<string, unknown> = {
      name: ACILMADI_ONEKI + reklamAdi(adG, n),
      object_story_spec: oss,
      degrees_of_freedom_spec: {
        creative_features_spec: Object.fromEntries(
          TANINAN_OZELLIK_ANAHTARLARI.map((a) => [a, { enroll_status: 'OPT_OUT' }]),
        ),
      },
      // Varsayılan OPT_IN: reklam başka markaların reklamlarıyla yan yana.
      contextual_multi_ads: { enroll_status: 'OPT_OUT' },
      adlabels: etiketler,
    };
    if (g.urlEtiketleri) kreatif.url_tags = g.urlEtiketleri;
    govdeler.push({ nesne: 'kreatif', ad: `kreatif:${n}`, uc: 'adcreatives', alanlar: kreatif });
    govdeler.push({
      nesne: 'reklam',
      ad: `reklam:${n}`,
      uc: 'ads',
      alanlar: {
        name: ACILMADI_ONEKI + reklamAdi(adG, n),
        adset_id: '{reklam_seti}',
        creative: { creative_id: `{kreatif:${n}}` },
        status: 'PAUSED',
        adlabels: etiketler,
      },
    });
  });

  const acikcaYazilanAlanlar = govdeler.flatMap((gv) => alanYollari(gv.nesne, gv.alanlar)).filter(tekil);
  manifestoDogrula(govdeler, { kategoriVar: kategoriler.length > 0, instagram: !!g.instagramPlatformId });

  return {
    tur: 'govde',
    govdeler,
    kapattiklarimiz: [
      ...hedef.kapatilanlar,
      'Başka markaların reklamlarıyla yan yana gösterim kapalı.',
      "Meta'nın yapay zekâyla görseli ve metni değiştirmesi kapalı.",
    ],
    acikcaYazilanAlanlar,
    apiSurumu: g.apiSurumu,
    derleyiciSurumu: DERLEYICI_SURUMU,
  };
}

function tekil<T>(v: T, i: number, a: T[]): boolean {
  return a.indexOf(v) === i;
}

function alanYollari(nesne: string, o: Record<string, unknown>, onek = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    const yol = onek ? `${onek}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return [`${nesne}:${yol}`, ...alanYollari(nesne, v as Record<string, unknown>, yol)];
    }
    return [`${nesne}:${yol}`];
  });
}

/**
 * MANİFESTO (§ 06.4): her satır ilgili nesnede AÇIKÇA yazılmış olmalı.
 * Gönderilmeyen alan kararı hesabın varsayılanına bırakır ve aynı kod iki
 * müşteride farklı davranır, hata dönmeden.
 */
export const MANIFESTO: ReadonlyArray<{ kod: string; nesne: NesneTuru; yol: string; kosul?: 'kategori' | 'instagram' }> = [
  { kod: 'M-01', nesne: 'kampanya', yol: 'status' },
  { kod: 'M-01', nesne: 'reklam_seti', yol: 'status' },
  { kod: 'M-01', nesne: 'reklam', yol: 'status' },
  { kod: 'M-02', nesne: 'kampanya', yol: 'objective' },
  { kod: 'M-03', nesne: 'kampanya', yol: 'special_ad_categories' },
  { kod: 'M-04', nesne: 'kampanya', yol: 'special_ad_category_country', kosul: 'kategori' },
  { kod: 'M-06', nesne: 'kampanya', yol: 'bid_strategy' },
  { kod: 'M-07', nesne: 'reklam_seti', yol: 'billing_event' },
  { kod: 'M-08', nesne: 'reklam_seti', yol: 'optimization_goal' },
  { kod: 'M-10', nesne: 'reklam_seti', yol: 'promoted_object.page_id' },
  { kod: 'M-12', nesne: 'reklam_seti', yol: 'start_time' },
  { kod: 'M-13', nesne: 'reklam_seti', yol: 'targeting.targeting_automation.advantage_audience' },
  { kod: 'M-14', nesne: 'reklam_seti', yol: 'targeting.age_min' },
  { kod: 'M-16', nesne: 'reklam_seti', yol: 'targeting.user_age_unknown' },
  { kod: 'M-18', nesne: 'reklam_seti', yol: 'targeting.geo_locations' },
  { kod: 'M-21', nesne: 'reklam_seti', yol: 'attribution_spec' },
  { kod: 'M-24', nesne: 'kreatif', yol: 'object_story_spec.instagram_user_id', kosul: 'instagram' },
  { kod: 'M-25', nesne: 'kreatif', yol: 'object_story_spec.link_data.call_to_action' },
  { kod: 'M-26', nesne: 'kreatif', yol: 'degrees_of_freedom_spec.creative_features_spec.adapt_to_placement' },
  { kod: 'M-27', nesne: 'kreatif', yol: 'degrees_of_freedom_spec.creative_features_spec.pac_relaxation' },
  { kod: 'M-28', nesne: 'kreatif', yol: 'contextual_multi_ads.enroll_status' },
  { kod: 'M-35', nesne: 'reklam', yol: 'creative.creative_id' },
  { kod: 'M-35', nesne: 'reklam', yol: 'adset_id' },
  { kod: 'M-36', nesne: 'kampanya', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'reklam_seti', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'kreatif', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'reklam', yol: 'adlabels' },
];

/** Yerleşim BİLEREK boş: Advantage+ yerleşim yalnız bu alanların yokluğuyla tanımlı. */
const YASAK_YERLESIM = ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'messenger_positions', 'audience_network_positions'];

function deger(o: Record<string, unknown>, yol: string): unknown {
  return yol.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
}

function manifestoDogrula(govdeler: MetaGovdesi[], d: { kategoriVar: boolean; instagram: boolean }): void {
  for (const satir of MANIFESTO) {
    if (satir.kosul === 'kategori' && !d.kategoriVar) continue;
    if (satir.kosul === 'instagram' && !d.instagram) continue;
    for (const gv of govdeler.filter((x) => x.nesne === satir.nesne)) {
      const v = deger(gv.alanlar, satir.yol);
      if (v === undefined || v === null) {
        throw new Error(`Manifesto ${satir.kod}: ${gv.ad} içinde ${satir.yol} yazılmadı`);
      }
    }
  }
  for (const gv of govdeler.filter((x) => x.nesne === 'reklam_seti')) {
    const t = (gv.alanlar.targeting ?? {}) as Record<string, unknown>;
    for (const y of YASAK_YERLESIM) {
      if (y in t) throw new Error(`Yerleşim alanı yazıldı (${y}); Advantage+ yerleşim kapanır`);
    }
    if ('age_max' in t) throw new Error('age_max yazıldı; Advantage+ açıkken gönderilmez');
  }
}
