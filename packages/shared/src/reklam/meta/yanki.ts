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

export type KarsilastirmaTuru =
  | 'esit'
  | 'esit_kume'
  | 'normallestir'
  | 'alt_kume'
  | 'meta_turetir'
  /** Meta'nın eklediği DEĞERİ false/null olan ek anahtarlar kabul (canlı tur 1, N-07). */
  | 'ek_false_kabul'
  /** Geçmiş saat gönderildiyse Meta kurulum anını yazıyor (N-09). */
  | 'baslangic';
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
          // TEK İSTİSNA `location_types` (N-08, karşılaştırıcıda).
          y.karsilastirma = 'alt_kume';
          y.altKumeYonu = 'gonderilen_icinde_donen';
        } else if (yol === 'promoted_object') {
          y.karsilastirma = 'ek_false_kabul';
        } else if (yol === 'start_time') {
          y.karsilastirma = 'baslangic';
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

/**
 * KREATİF ÖZELLİK ANAHTARLARI META'DA KÜÇÜK HARFLE DÖNÜYOR (canlı tur 1,
 * 2026-10-10, v25.0): `IMAGE_ANIMATION: OPT_OUT` gönderiliyor,
 * `image_animation: OPT_OUT` okunuyor. Büyük harfle arayan karşılaştırıcı
 * yedi anahtarı da "döndü ama farklı" sayıp yayını durdurdu. Yalnız
 * `creative_features_spec` altındaki anahtar harf duyarsız aranır; başka
 * yolda harf farkı gerçek bir farktır.
 */
function ozellikDuyarsizAl(o: unknown, yol: string): unknown {
  const tam = al(o, yol);
  if (tam !== undefined) return tam;
  const onek = 'degrees_of_freedom_spec.creative_features_spec.';
  if (!yol.startsWith(onek)) return tam;
  const [anahtar, ...kalan] = yol.slice(onek.length).split('.');
  const spec = al(o, onek.slice(0, -1));
  if (!spec || typeof spec !== 'object' || !anahtar) return tam;
  const gercek = Object.keys(spec as Record<string, unknown>).find((k) => k.toLowerCase() === anahtar.toLowerCase());
  if (!gercek) return tam;
  return kalan.length ? al((spec as Record<string, unknown>)[gercek], kalan.join('.')) : (spec as Record<string, unknown>)[gercek];
}

/**
 * KONUM TÜRLERİ (N-08): konum gönderildiğinde Meta `location_types:
 * [home, recent, frequently_in]` ekliyor ("yaşayan ya da yakın zamanda
 * bulunan"). Bu bir GENİŞLEME DEĞİL, Meta'nın kişiyi konuma bağlama biçimi.
 * `travel_in` (yalnız seyahat edenler) ya da tanımadığımız bir tür kabul
 * EDİLMEZ: reklam bölgeyle ilgisi olmayan kişilere kayardı.
 */
const KABUL_KONUM_TURLERI = new Set(['home', 'recent', 'frequently_in']);
function konumTurleriniAyir(donen: unknown): { kalan: unknown; turler: string[] | null } {
  if (!donen || typeof donen !== 'object' || Array.isArray(donen)) return { kalan: donen, turler: null };
  const { location_types: turler, ...kalan } = donen as Record<string, unknown>;
  if (turler === undefined) return { kalan: donen, turler: null };
  if (!Array.isArray(turler) || !turler.every((t) => typeof t === 'string' && KABUL_KONUM_TURLERI.has(t))) {
    return { kalan: donen, turler: null };
  }
  return { kalan, turler: turler as string[] };
}

/**
 * N-07: Meta `promoted_object`e `smart_pse_enabled: false` ekliyor. Değeri
 * false/null olan EK anahtar bir şey açmıyor; true ya da başka bir değer
 * taşıyan ek anahtar ise gerçek fark (Meta bir özelliği açmış olur).
 */
const EK_FALSE_KABUL = new Set(['smart_pse_enabled']);
function ekFalseHaricAyni(gonderilen: unknown, donen: unknown): boolean {
  if (!gonderilen || !donen || typeof gonderilen !== 'object' || typeof donen !== 'object') return kanonik(gonderilen) === kanonik(donen);
  const g = gonderilen as Record<string, unknown>;
  const d = { ...(donen as Record<string, unknown>) };
  // YALNIZ ölçülen anahtar ve YALNIZ false (Ajan 4, BULGU-8): `null` "hesabın
  // varsayılanı" demek olabilir, tanımadığımız `xxx_only: false` bir
  // daraltmayı kapatıp genişletebilir.
  for (const k of Object.keys(d)) if (!(k in g) && EK_FALSE_KABUL.has(k) && d[k] === false) delete d[k];
  return kanonik(g) === kanonik(d);
}

/**
 * N-09: geçmiş bir başlangıç gönderilince Meta kurulum anını yazıyor
 * (gönderilen 00:00, dönen 04:02). Kabul koşulu AN ÜZERİNDEN (Ajan 4,
 * BULGU-9/10): gönderilen GEÇMİŞTE (okuma anından önce) VE dönen
 * gönderilenden sonra VE okuma anını en çok 15 dk aşmıyor (saat farkı payı).
 * İleri tarihli bir başlangıcın kayması ya da erkene çekilme gerçek fark;
 * metinle "aynı gün" karşılaştırması ofset farkında yanlış gün sayıyordu.
 */
const BASLANGIC_PAYI_MS = 15 * 60_000;
function baslangicKurulumAnina(gonderilen: unknown, donen: unknown, simdi: Date | undefined): boolean {
  if (!simdi || typeof gonderilen !== 'string' || typeof donen !== 'string') return false;
  const g = Date.parse(gonderilen.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  const d = Date.parse(donen.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(g) || Number.isNaN(d)) return false;
  const s = simdi.getTime();
  return g < s && d >= g && d <= s + BASLANGIC_PAYI_MS;
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
  /**
   * `simdi`: geri okuma anı. Başlangıç normalleştirmesi (N-09) YALNIZ bununla
   * çalışır: gönderilen geçmişte mi, dönen kurulum anı mı (Ajan 4, BULGU-9).
   * Verilmezse N-09 hiç uygulanmaz — güvenli yön.
   */
  secenek: { yasalUyariVar: boolean; simdi?: Date },
): GeriOkumaSonucu {
  const satirlar: FarkSatiri[] = [];
  const bilgiler: FarkSatiri[] = [];

  for (const y of yankilar) {
    const nesne = okunan[y.govde];
    const donen = nesne === undefined ? undefined : ozellikDuyarsizAl(nesne, y.alanYolu);
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
      case 'alt_kume': {
        const k = y.alanYolu === 'targeting.geo_locations' ? konumTurleriniAyir(donen) : { kalan: donen, turler: null };
        ayni =
          y.altKumeYonu === 'donen_icinde_gonderilen' ? kapsar(k.kalan, y.gonderilen) : kapsar(y.gonderilen, k.kalan);
        if (ayni && k.turler) {
          bilgiler.push(satir('normallesti', "Meta konumu 'bu bölgede yaşayan ya da yakın zamanda bulunan' kişilere uyguladı (seyahat edenler dahil değil)."));
          continue;
        }
        break;
      }
      case 'ek_false_kabul':
        ayni = ekFalseHaricAyni(y.gonderilen, donen);
        break;
      case 'baslangic':
        ayni = kanonik(donen) === kanonik(y.gonderilen);
        if (!ayni && baslangicKurulumAnina(y.gonderilen, donen, secenek.simdi)) {
          bilgiler.push(satir('normallesti', 'Başlangıç saati geçmişte kalmıştı; Meta reklamı kurulduğu andan başlattı.'));
          continue;
        }
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
      // DEĞER HARF DUYARSIZ ve "OPT_OUT DEĞİLSE" (Ajan 4, BULGU-6): Meta bu
      // yanıtta anahtar harfini değiştirdi; `opt_in`, eksik ya da tanımsız bir
      // durum "kapalı" sayılamaz — tahmin etmektense kısıtla.
      const durum = String(al(deger, 'enroll_status') ?? '').toUpperCase();
      if (durum === 'OPT_OUT') continue;
      if (sinif === 'kapatildi') {
        // BULGU-7: kapattığımız özellik başka harf biçimiyle AÇIK dönerse
        // ilk döngü tam eşleşeni (OPT_OUT) görüp geçmişti; burada durur.
        // İlk döngü aynı özelliği zaten yazdıysa ikinci satır yok.
        const onek = `degrees_of_freedom_spec.creative_features_spec.${anahtar.toLowerCase()}.`;
        if (satirlar.some((x) => x.govde === ad && `${x.alanYolu.toLowerCase()}.`.startsWith(onek))) continue;
        satirlar.push({
          govde: ad,
          alanYolu: `degrees_of_freedom_spec.creative_features_spec.${anahtar}`,
          ekranEtiketi: `Kapattığımız bir özellik açık döndü: ${anahtar}`,
          tur: 'fark',
          gonderilen: 'OPT_OUT',
          donen: deger,
          kabulEdilemez: true,
        });
        continue;
      }
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
