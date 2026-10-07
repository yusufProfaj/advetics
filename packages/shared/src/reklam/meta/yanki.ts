/**
 * Beklenen yankı ve geri okuma karşılaştırması (TASARIM.md § 06.5).
 *
 * "200 döndü" doğrulama değil: Meta bazı alanları KABUL EDİP YOK SAYIYOR ya
 * da başka bir şeye çeviriyor ve gönderilen gövdeye bakan hiçbir test bunu
 * göremez. Tek ilaç kurduktan sonra OKUMAK ve karşılaştırmak.
 *
 * Karşılaştırma gönderilen gövdeyle değil BEKLENEN YANKIYLA yapılıyor:
 * Meta bazı alanları kurallı biçimde değiştirerek saklıyor ve düz
 * karşılaştırma her yayını "fark" ile durdururdu.
 *
 * Kabul edilemez sınıftaki farkta (para, kategori, konum genişlemesi,
 * atıf, durum, ...) "kabul et ve aç" HİÇBİR yüzde yok. Tanımsız düşük
 * riskli fark da durdurur; tablo canlı turla genişler.
 */
import type { MetaGovdesi, NesneTuru } from './derle';
import { BILINEN_KAPATILAMAYAN_OZELLIKLER, YASAL_UYARIDA_DURDURAN_OZELLIK, ozellikSinifi } from './derle';

export type KarsilastirmaTuru = 'esit' | 'esit_kume' | 'normallestir' | 'alt_kume' | 'meta_turetir';
export type AltKumeYonu = 'donen_icinde_gonderilen' | 'gonderilen_icinde_donen';

export interface BeklenenYanki {
  nesne: NesneTuru;
  /** Zincirdeki ad (`kreatif:2`): karşılaştırma bu nesnenin okumasıyla. */
  govde: string;
  alanYolu: string;
  gonderilen: unknown;
  karsilastirma: KarsilastirmaTuru;
  altKumeYonu?: AltKumeYonu;
  /** `normallestir`de kabul edilen ek dönüşler ve tablo satırı. */
  normallestirme?: { satir: string; kabul: unknown[]; bilgi: string };
  kabulEdilemez: boolean;
  ekranEtiketi: string;
}

/**
 * Kabul edilemez sınıf, alan yolunun BAŞINA göre. Listede olmamak "fark
 * kabul edilir" demek DEĞİL: her fark durdurur, bu sınıf yalnız ekranda
 * "kabul et" seçeneğinin hiçbir zaman çıkmayacağını işaretliyor.
 */
const KABUL_EDILEMEZ: ReadonlyArray<[string, string]> = [
  ['daily_budget', 'Bütçe'],
  ['lifetime_budget', 'Bütçe'],
  ['bid_strategy', 'Teklif'],
  ['start_time', 'Başlangıç'],
  ['end_time', 'Bitiş'],
  ['special_ad_categories', 'Özel reklam kategorisi'],
  ['special_ad_category_country', 'Reklamın kategori ülkesi'],
  ['optimization_goal', 'Reklamın hedefi'],
  ['destination_type', 'Tıklayınca nereye gider'],
  ['targeting.geo_locations', 'Konum'],
  ['targeting.age_min', 'En düşük yaş'],
  ['targeting.genders', 'Cinsiyet'],
  ['targeting.excluded_', 'Hariç tutulanlar'],
  ['targeting.targeting_automation', 'Otomatik kitle'],
  ['attribution_spec', 'Sonuç sayma kuralı'],
  ['status', 'Reklamın durumu'],
  ['degrees_of_freedom_spec', "Meta'nın otomatik kreatif özelliği"],
  ['contextual_multi_ads', 'Başka reklamlarla yan yana gösterim'],
  ['object_story_spec.instagram_user_id', 'Instagram hesabı'],
  ['object_story_spec.page_id', 'Facebook sayfası'],
  ['promoted_object', 'Facebook sayfası'],
  ['object_story_spec.link_data.call_to_action', 'Düğme ve hedef'],
  ['object_story_spec.link_data.image_hash', 'Görsel'],
  ['object_story_spec.video_data.call_to_action', 'Düğme ve hedef'],
  ['object_story_spec.video_data.video_id', 'Video'],
  ['object_story_spec.video_data.image_hash', 'Video kapağı'],
  // Form KVKK (M-38..M-41): rıza kanıtının kendisi.
  ['privacy_policy', 'Aydınlatma bağlantısı'],
  ['custom_disclaimer', 'İzin kutusu'],
  ['questions', 'Form soruları'],
  ['block_display_for_non_targeted_viewer', 'Formu kimler görebilir'],
];

const ETIKETLER: Record<string, string> = {
  name: 'Ad',
  objective: 'Kampanya amacı',
  billing_event: 'Ücretlendirme',
  'targeting.user_age_unknown': 'Yaşı bilinmeyenler',
  'targeting.age_range': 'Yaş aralığı (ipucu)',
  'object_story_spec.link_data.name': 'Başlık',
  'object_story_spec.link_data.message': 'Ana metin',
  'object_story_spec.link_data.description': 'Açıklama',
  'object_story_spec.link_data.link': 'Bağlantı',
  url_tags: 'İzleme etiketleri',
  adlabels: 'Advetics etiketi',
  locale: 'Form dili',
};

function sinif(yol: string): { kabulEdilemez: boolean; etiket: string } {
  // `excluded_` gibi alt çizgiyle biten önek bir AİLE: excluded_custom_audiences...
  const k = KABUL_EDILEMEZ.find(([on]) =>
    on.endsWith('_') ? yol.startsWith(on) : yol === on || yol.startsWith(`${on}.`),
  );
  if (k) return { kabulEdilemez: true, etiket: k[1] };
  return { kabulEdilemez: false, etiket: ETIKETLER[yol] ?? yol };
}

/** Bütün olarak karşılaştırılan alanlar: içine inilmez. */
const BUTUN_ALANLAR = new Set([
  'adlabels',
  'special_ad_categories',
  'special_ad_category_country',
  'attribution_spec',
  'targeting.geo_locations',
  'targeting.age_range',
  'targeting.genders',
  'object_story_spec.link_data.call_to_action',
  'object_story_spec.video_data.call_to_action',
  'promoted_object',
  'creative',
  'questions',
  'custom_disclaimer',
  'privacy_policy',
]);

const YER_TUTUCU = /^\{[a-z_]+(?::\d+)?\}$/;

/** Kategori dalında advantage_audience 0 dönebilir (N-06): daralma, genişleme değil. */
const KISITLI_KATEGORILER = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];

export function beklenenYankilar(govdeler: MetaGovdesi[]): BeklenenYanki[] {
  const kampanya = govdeler.find((g) => g.nesne === 'kampanya');
  const kategoriler = (kampanya?.alanlar.special_ad_categories as string[] | undefined) ?? [];
  const kisitli = kategoriler.some((k) => KISITLI_KATEGORILER.includes(k));
  const sonuc: BeklenenYanki[] = [];

  for (const gv of govdeler) {
    const gez = (o: Record<string, unknown>, onek: string) => {
      for (const [k, v] of Object.entries(o)) {
        const yol = onek ? `${onek}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && !BUTUN_ALANLAR.has(yol)) {
          gez(v as Record<string, unknown>, yol);
          continue;
        }
        const { kabulEdilemez, etiket } = sinif(yol);
        const y: BeklenenYanki = {
          nesne: gv.nesne,
          govde: gv.ad,
          alanYolu: yol,
          gonderilen: v,
          karsilastirma: 'esit',
          kabulEdilemez,
          ekranEtiketi: etiket,
        };
        if (typeof v === 'string' && YER_TUTUCU.test(v)) y.karsilastirma = 'meta_turetir';
        else if (yol === 'creative') y.karsilastirma = 'meta_turetir';
        else if (yol === 'adlabels') {
          y.karsilastirma = 'alt_kume';
          y.altKumeYonu = 'donen_icinde_gonderilen';
        } else if (yol === 'targeting.geo_locations') {
          // Meta DARALTABİLİR, GENİŞLETEMEZ: eklediği her şey genişleme.
          y.karsilastirma = 'alt_kume';
          y.altKumeYonu = 'gonderilen_icinde_donen';
        } else if (yol === 'special_ad_categories' || yol === 'special_ad_category_country') {
          y.karsilastirma = 'esit_kume';
        } else if (yol === 'targeting.targeting_automation.advantage_audience' && kisitli && v === 1) {
          y.karsilastirma = 'normallestir';
          y.normallestirme = {
            satir: 'N-06',
            kabul: [0],
            bilgi: 'Bu reklam türünde Meta otomatik kitleyi kapattı. Reklam seçtiğin kesin sınırlar içinde gösterilecek.',
          };
        } else if (yol === 'optimization_goal' && v === 'REACH') {
          y.karsilastirma = 'normallestir';
          y.normallestirme = {
            satir: 'N-01',
            kabul: ['IMPRESSIONS'],
            bilgi: 'Meta erişim hedefini gösterim olarak kaydetti; bu beklenen bir davranış.',
          };
        }
        sonuc.push(y);
      }
    };
    gez(gv.alanlar, '');
  }
  return sonuc;
}

/** Geri okumada istenecek alanlar: her nesne için yankıların üst düzey adları. */
export function okumaAlanlari(yankilar: BeklenenYanki[], govde: string): string[] {
  const set = new Set(yankilar.filter((y) => y.govde === govde).map((y) => y.alanYolu.split('.')[0]!));
  return [...set].sort();
}

export type FarkTuru = 'fark' | 'donmedi' | 'normallesti' | 'tanimsiz_ozellik' | 'meta_otomatik';

export interface FarkSatiri {
  govde: string;
  alanYolu: string;
  ekranEtiketi: string;
  tur: FarkTuru;
  gonderilen: unknown;
  donen: unknown;
  kabulEdilemez: boolean;
  bilgi?: string;
}

export type GeriOkumaSonucu =
  | { sonuc: 'temiz'; bilgiler: FarkSatiri[] }
  /** Kabul edilemez bir alan dönmedi: bilinmiyor = kaldı, açılmaz. */
  | { sonuc: 'dogrulanamadi'; satirlar: FarkSatiri[]; bilgiler: FarkSatiri[] }
  | { sonuc: 'fark'; satirlar: FarkSatiri[]; bilgiler: FarkSatiri[] };

function al(o: unknown, yol: string): unknown {
  return yol.split('.').reduce<unknown>(
    (a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined),
    o,
  );
}

/**
 * Sayı ↔ dizge eşitliği bilerek GEVŞEK: Graph bütçeyi dizge, yaşı sayı
 * döndürüyor ve gönderdiğimiz biçim her zaman aynı değil. Başka hiçbir
 * normalleştirme yok — anahtar sırası dışında yapı birebir aynı olmalı.
 */
function kanonik(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.map(kanonik).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${k}:${kanonik(o[k])}`).join(',')}}`;
}

function kumeAyni(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const x = a.map(kanonik).sort();
  const y = b.map(kanonik).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** `ic`in her öğesi `dis`ta var mı (kovalar ve öğeler kanonik). */
function kapsar(dis: unknown, ic: unknown): boolean {
  if (Array.isArray(dis) && Array.isArray(ic)) {
    const d = new Set(dis.map(kanonik));
    return ic.every((v) => d.has(kanonik(v)));
  }
  if (dis && ic && typeof dis === 'object' && typeof ic === 'object') {
    return Object.entries(ic as Record<string, unknown>).every(([k, v]) =>
      kapsar((dis as Record<string, unknown>)[k] ?? [], v),
    );
  }
  return kanonik(dis) === kanonik(ic);
}

/**
 * `okunan`: govde adı → Meta'nın döndürdüğü nesne. Bir nesne hiç okunamadıysa
 * anahtarı YOK; o nesnenin bütün alanları `donmedi` olur.
 */
export function geriOkumaKarsilastir(
  yankilar: BeklenenYanki[],
  okunan: Record<string, Record<string, unknown> | undefined>,
  secenek: { yasalUyariVar: boolean },
): GeriOkumaSonucu {
  const satirlar: FarkSatiri[] = [];
  const bilgiler: FarkSatiri[] = [];

  for (const y of yankilar) {
    const nesne = okunan[y.govde];
    const donen = nesne === undefined ? undefined : al(nesne, y.alanYolu);
    const satir = (tur: FarkTuru, bilgi?: string): FarkSatiri => ({
      govde: y.govde,
      alanYolu: y.alanYolu,
      ekranEtiketi: y.ekranEtiketi,
      tur,
      gonderilen: y.gonderilen,
      donen,
      kabulEdilemez: y.kabulEdilemez,
      ...(bilgi ? { bilgi } : {}),
    });

    if (donen === undefined) {
      // Kabul edilemez alan dönmediyse yayın açılamaz; diğerleri kayıt.
      (y.kabulEdilemez ? satirlar : bilgiler).push(satir('donmedi'));
      continue;
    }
    let ayni: boolean;
    switch (y.karsilastirma) {
      case 'meta_turetir':
        ayni = donen !== null && donen !== '';
        break;
      case 'esit_kume':
        ayni = kumeAyni(y.gonderilen, donen);
        break;
      case 'alt_kume':
        ayni =
          y.altKumeYonu === 'donen_icinde_gonderilen' ? kapsar(donen, y.gonderilen) : kapsar(y.gonderilen, donen);
        break;
      default:
        ayni = kanonik(donen) === kanonik(y.gonderilen);
    }
    if (ayni) continue;
    if (y.karsilastirma === 'normallestir' && y.normallestirme?.kabul.some((k) => kanonik(k) === kanonik(donen))) {
      bilgiler.push(satir('normallesti', y.normallestirme.bilgi));
      continue;
    }
    satirlar.push(satir('fark'));
  }

  // Kreatif özellikleri ÜÇ SINIFLA (derle.ts `ozellikSinifi`): kapattığımız
  // anahtarlar zaten beklenen yankıda; bilinen kapatılamayan bir uyarlama açık
  // dönerse DURMAZ, bilgi olarak yazılır; üretken ya da tanımsız olan durdurur.
  for (const [ad, nesne] of Object.entries(okunan)) {
    if (!ad.startsWith('kreatif:') || !nesne) continue;
    const spec = al(nesne, 'degrees_of_freedom_spec.creative_features_spec');
    if (!spec || typeof spec !== 'object') continue;
    for (const [anahtar, deger] of Object.entries(spec as Record<string, unknown>)) {
      const sinif = ozellikSinifi(anahtar);
      if (sinif === 'kapatildi' || al(deger, 'enroll_status') !== 'OPT_IN') continue;
      const durdurur =
        sinif === 'uretken_ya_da_tanimsiz' || (secenek.yasalUyariVar && anahtar.toLowerCase() === YASAL_UYARIDA_DURDURAN_OZELLIK);
      if (!durdurur) {
        bilgiler.push({
          govde: ad,
          alanYolu: `degrees_of_freedom_spec.creative_features_spec.${anahtar}`,
          ekranEtiketi: `Meta ${BILINEN_KAPATILAMAYAN_OZELLIKLER[anahtar.toLowerCase()]}`,
          tur: 'meta_otomatik',
          gonderilen: undefined,
          donen: deger,
          kabulEdilemez: false,
        });
        continue;
      }
      satirlar.push({
        govde: ad,
        alanYolu: `degrees_of_freedom_spec.creative_features_spec.${anahtar}`,
        ekranEtiketi:
          sinif === 'bilinen_kapatilamayan'
            ? `Meta metnin varyasyonlarını gösterebilir; bu workspace'te zorunlu yasal uyarı var ve düşebilir`
            : `Meta tanımadığımız bir özelliği açtı: ${anahtar}`,
        tur: 'tanimsiz_ozellik',
        gonderilen: undefined,
        donen: deger,
        kabulEdilemez: true,
      });
    }
  }

  if (satirlar.length === 0) return { sonuc: 'temiz', bilgiler };
  if (satirlar.every((s) => s.tur === 'donmedi')) return { sonuc: 'dogrulanamadi', satirlar, bilgiler };
  return { sonuc: 'fark', satirlar, bilgiler };
}
