import { PlatformApiError } from '../connections/provider.types';
import { platformFetch } from '../connections/providers/http';

/**
 * ═══ GOOGLE TAG MANAGER — KONTEYNER, ETİKET, YAYIN (docs/kurulum/MIMARI.md) ═══
 *
 * İki parça: `gtmPlani` SAF (hangi etiket, hangi tetik, ne atlandı) ve
 * çalıştırılarak sınanıyor; `GtmIstemcisi` yalnız REST. Plan ile istemciyi
 * ayırmak, "aynı pikseli iki kez başlatma" gibi kararların API'ye gitmeden
 * test edilebilmesi için.
 *
 * CANLIDA ÖLÇÜLMEDİ: etiket tür adları (`googtag`, `gaawe`, `awct`,
 * `gclidw`, `html`) ve parametre anahtarları Tag Manager API belgesinden.
 * İlk kurulumda Tag Manager arayüzünde GÖZLE kontrol edilmeli.
 */

const GTM = 'https://tagmanager.googleapis.com/tagmanager/v2';

/** Tag Manager'ın yerleşik "All Pages" tetiğinin sabit kimliği. */
export const TUM_SAYFALAR_TETIGI = '2147479553';

/** Etiket ve tetik adlarının öneki: yeniden koşunca bulunup GÜNCELLENİYOR, çoğaltılmıyor. */
export const ON_EK = 'Advetics · ';

/** Bizim sürümlerimizin adı: yayını yarım kalan kendi sürümümüzü "başkasının taslağı" sanmamak için. */
export const SURUM_ADI = 'Advetics kurulumu';

type Parametre = { type: 'template' | 'boolean' | 'list' | 'map'; key: string; value?: string; list?: Parametre[]; map?: Parametre[] };

export interface TetikTanimi {
  name: string;
  type: 'pageview' | 'linkClick';
  filter: Array<{ type: 'matchRegex' | 'startsWith'; parameter: Parametre[] }>;
  waitForTags?: Parametre;
  checkValidation?: Parametre;
}

export interface EtiketTanimi {
  name: string;
  type: 'googtag' | 'gaawe' | 'awct' | 'gclidw' | 'html';
  parameter: Parametre[];
  /** Tetik ADI (planda) ya da yerleşik kimlik; uygulayıcı kimliğe çevirir. */
  tetik: string;
  /** Önce çalışması gereken etiketin adı (Meta olayı, piksel başlatıldıktan sonra). */
  onceki?: string;
  /**
   * Sayfa başına BİR KEZ (`oncePerLoad`). Temel piksel ve Google etiketi
   * olay etiketlerinin ön koşulu (`onceki`); varsayılan "olay başına" kalsa
   * her telefon tıklamasında yeniden koşup ikinci bir PageView gönderirdi.
   */
  birKez?: boolean;
}

export interface GtmPlanGirdisi {
  ga4OlcumKimligi: string | null;
  metaPikselId: string | null;
  /** Google Ads dönüşümleri: `send_to` parçaları. */
  ads: { form?: AdsGonder; telefon?: AdsGonder; whatsapp?: AdsGonder };
  tetik: { formYolu: string | null; telefon: boolean; whatsapp: boolean };
  /** Sitede ya da konteynerde ZATEN yüklü olanlar: eklenirse çift sayılırdı. */
  mevcut: Mevcut;
}

export interface Mevcut {
  ga4Yuklu: boolean;
  pikselYuklu: boolean;
  /** Konteynerde başkasının form olayı (GA4 generate_lead / Meta Lead) zaten var. */
  ga4FormYuklu?: boolean;
  metaFormYuklu?: boolean;
}

export interface AdsGonder {
  conversionId: string;
  conversionLabel: string;
}

export interface GtmPlani {
  /** Etkinleştirilecek yerleşik değişkenler. */
  degiskenler: Array<'pagePath' | 'clickUrl'>;
  tetikler: TetikTanimi[];
  etiketler: EtiketTanimi[];
  /** Neyin neden eklenmediği; adımın nedeninde kullanıcıya yazılır. */
  atlananlar: string[];
}

const tpl = (key: string, value: string): Parametre => ({ type: 'template', key, value });
const bool = (key: string, value: boolean): Parametre => ({ type: 'boolean', key, value: String(value) });

/** Regex'te özel karakterleri kaçırır: "/teşekkür.html" noktası her karakteri eşlemesin. */
function regexKacir(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Teşekkür sayfası yolunun regex'i. `{{Page Path}}` YÜZDE KODLU geliyor
 * ("/te%C5%9Fekk%C3%BCr"), kullanıcı ise "/teşekkür" yazıyor: yalnız ham
 * biçimi aramak Türkçe karakterli sayfada tetiği HİÇ çalıştırmazdı. İki
 * biçim de kabul ediliyor; sondaki / isteğe bağlı.
 */
export function yolRegex(yol: string): string {
  const kodlu = encodeURI(decodeURISafe(yol));
  const bicimler = [...new Set([yol, kodlu])].map(regexKacir);
  return `^(${bicimler.join('|')})/?$`;
}

function decodeURISafe(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * Meta'nın resmî temel piksel kodu. Yalnız kimlik değişiyor; noscript satırı
 * GTM'nin özel HTML'inde çalışmadığı için yok (GTM <noscript> yürütmüyor).
 */
export function metaPikselKodu(pikselId: string): string {
  if (!/^\d{5,30}$/.test(pikselId)) throw new Error(`Geçersiz piksel kimliği: ${pikselId}`);
  return (
    `<script>\n!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n` +
    `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\n` +
    `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\n` +
    `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\n` +
    `document,'script','https://connect.facebook.net/en_US/fbevents.js');\n` +
    `fbq('init', '${pikselId}');\nfbq('track', 'PageView');\n</script>`
  );
}

/**
 * HANGİ ETİKET, HANGİ TETİK. Kurallar:
 * - Sitede ya da konteynerde aynı GA4 kimliği / aynı piksel zaten yüklüyse
 *   TEMEL etiket eklenmez (sayfa görüntüleme iki kez sayılırdı); olaylar yine
 *   eklenir, çünkü onlar mevcut yükleyiciyle de çalışır.
 * - Form tetiği teşekkür sayfasının TAM yolu (regex, sondaki / isteğe bağlı):
 *   "içerir" yazmak "/tesekkurler-blog"u da dönüşüm sayardı.
 * - Meta olayı, piksel başlatıldıktan sonra çalışsın diye sıralı (`onceki`).
 */
export function gtmPlani(g: GtmPlanGirdisi): GtmPlani {
  const degiskenler = new Set<'pagePath' | 'clickUrl'>();
  const tetikler: TetikTanimi[] = [];
  const etiketler: EtiketTanimi[] = [];
  const atlananlar: string[] = [];
  const pikselEtiketi = `${ON_EK}Meta pikseli`;

  if (g.ga4OlcumKimligi) {
    if (g.mevcut.ga4Yuklu) atlananlar.push(`${g.ga4OlcumKimligi} sitede zaten yüklü; Google etiketi eklenmedi (sayfa görüntüleme iki kez sayılırdı).`);
    else etiketler.push({ name: `${ON_EK}Google etiketi`, type: 'googtag', parameter: [tpl('tagId', g.ga4OlcumKimligi)], tetik: TUM_SAYFALAR_TETIGI, birKez: true });
  }
  const pikselVar = Boolean(g.metaPikselId);
  if (g.metaPikselId) {
    if (g.mevcut.pikselYuklu) atlananlar.push(`Meta pikseli ${g.metaPikselId} sitede zaten yüklü; temel kod eklenmedi.`);
    else
      etiketler.push({
        name: pikselEtiketi,
        type: 'html',
        parameter: [tpl('html', metaPikselKodu(g.metaPikselId)), bool('supportDocumentWrite', false)],
        tetik: TUM_SAYFALAR_TETIGI,
        birKez: true,
      });
  }
  const adsVar = Boolean(g.ads.form || g.ads.telefon || g.ads.whatsapp);
  // Dönüşüm bağlayıcı: Google Ads tıklama kimliğini (gclid) çerezde tutar;
  // yoksa farklı sayfada olan dönüşüm reklama bağlanamaz.
  if (adsVar) etiketler.push({ name: `${ON_EK}Dönüşüm bağlayıcı`, type: 'gclidw', parameter: [], tetik: TUM_SAYFALAR_TETIGI });

  const olay = (ad: string, tetikAdi: string, ga4Olay: string, metaOlay: string, ads: AdsGonder | undefined, atla: { ga4?: boolean; meta?: boolean } = {}) => {
    if (atla.ga4) atlananlar.push(`Konteynerde zaten bir GA4 ${ga4Olay} etiketi var; ${ad} için ikincisi eklenmedi.`);
    if (atla.meta) atlananlar.push(`Konteynerde zaten bir Meta ${metaOlay} etiketi var; ${ad} için ikincisi eklenmedi.`);
    if (g.ga4OlcumKimligi && !atla.ga4)
      etiketler.push({ name: `${ON_EK}GA4 ${ad}`, type: 'gaawe', parameter: [tpl('eventName', ga4Olay), tpl('measurementIdOverride', g.ga4OlcumKimligi)], tetik: tetikAdi });
    if (pikselVar && !atla.meta)
      etiketler.push({
        name: `${ON_EK}Meta ${ad}`,
        type: 'html',
        parameter: [tpl('html', `<script>if (window.fbq) fbq('track', '${metaOlay}');</script>`), bool('supportDocumentWrite', false)],
        tetik: tetikAdi,
        ...(g.mevcut.pikselYuklu ? {} : { onceki: pikselEtiketi }),
      });
    if (ads)
      etiketler.push({
        name: `${ON_EK}Google Ads ${ad}`,
        type: 'awct',
        parameter: [tpl('conversionId', ads.conversionId), tpl('conversionLabel', ads.conversionLabel)],
        tetik: tetikAdi,
      });
  };

  if (g.tetik.formYolu) {
    degiskenler.add('pagePath');
    const ad = `${ON_EK}Teşekkür sayfası`;
    tetikler.push({
      name: ad,
      type: 'pageview',
      filter: [{ type: 'matchRegex', parameter: [tpl('arg0', '{{Page Path}}'), tpl('arg1', yolRegex(g.tetik.formYolu))] }],
    });
    olay('form', ad, 'generate_lead', 'Lead', g.ads.form, { ga4: g.mevcut.ga4FormYuklu, meta: g.mevcut.metaFormYuklu });
  } else {
    atlananlar.push('Form dönüşümü kurulmadı: teşekkür sayfası seçilmedi.');
  }
  if (g.tetik.telefon) {
    degiskenler.add('clickUrl');
    const ad = `${ON_EK}Telefon tıklaması`;
    tetikler.push({
      name: ad,
      type: 'linkClick',
      filter: [{ type: 'startsWith', parameter: [tpl('arg0', '{{Click URL}}'), tpl('arg1', 'tel:')] }],
      waitForTags: bool('waitForTags', false),
      checkValidation: bool('checkValidation', false),
    });
    olay('telefon', ad, 'click_to_call', 'Contact', g.ads.telefon);
  }
  if (g.tetik.whatsapp) {
    degiskenler.add('clickUrl');
    const ad = `${ON_EK}WhatsApp tıklaması`;
    tetikler.push({
      name: ad,
      type: 'linkClick',
      filter: [{ type: 'matchRegex', parameter: [tpl('arg0', '{{Click URL}}'), tpl('arg1', '^https?://(wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com)/')] }],
      waitForTags: bool('waitForTags', false),
      checkValidation: bool('checkValidation', false),
    });
    olay('whatsapp', ad, 'whatsapp_click', 'Contact', g.ads.whatsapp);
  }
  if (etiketler.length === 0) atlananlar.push('Yazılacak etiket yok: Analytics mülkü, Meta pikseli ya da Google Ads dönüşümü bağlı değil.');
  return { degiskenler: [...degiskenler], tetikler, etiketler, atlananlar };
}

/**
 * Konteynerdeki etiketlerden "zaten yüklü" bilgisi (BİZİM olmayan etiketler).
 * Temel etiketlerin yanında form olayları ve topluluk şablonuyla (`cvt_…`)
 * kurulmuş Meta pikseli de sayılıyor: ikisi de ikinci kez eklenirse Lead ve
 * PageView çift sayılır.
 */
export function konteynerdeYuklu(
  etiketler: ReadonlyArray<{ name?: string; type?: string; parameter?: Parametre[] }>,
  ga4: string | null,
  piksel: string | null,
): Required<Mevcut> {
  const bizim = (e: { name?: string }) => (e.name ?? '').startsWith(ON_EK);
  const deger = (e: { parameter?: Parametre[] }, k: string) => e.parameter?.find((p) => p.key === k)?.value ?? '';
  const tumDegerler = (e: { parameter?: Parametre[] }): string => JSON.stringify(e.parameter ?? []);
  const yabanci = etiketler.filter((e) => !bizim(e));
  const html = (e: { type?: string; parameter?: Parametre[] }) => (e.type === 'html' ? deger(e, 'html') : '');
  return {
    ga4Yuklu: Boolean(ga4) && yabanci.some((e) => (e.type === 'googtag' || e.type === 'gaawc') && [deger(e, 'tagId'), deger(e, 'measurementId')].includes(ga4!)),
    pikselYuklu:
      Boolean(piksel) &&
      yabanci.some((e) => new RegExp(`fbq\\(\\s*['"]init['"]\\s*,\\s*['"]${piksel}['"]`).test(html(e)) || ((e.type ?? '').startsWith('cvt_') && tumDegerler(e).includes(piksel!))),
    ga4FormYuklu: yabanci.some((e) => e.type === 'gaawe' && deger(e, 'eventName') === 'generate_lead'),
    metaFormYuklu: yabanci.some((e) => /fbq\(\s*['"]track['"]\s*,\s*['"]Lead['"]/.test(html(e)) || ((e.type ?? '').startsWith('cvt_') && /"Lead"/.test(tumDegerler(e)))),
  };
}

export interface GtmKonteyner {
  path: string;
  containerId: string;
  name: string;
  publicId: string;
}

/** Yalnız REST; karar vermiyor. Hata platformun mesajıyla (`platformFetch`). */
export class GtmIstemcisi {
  constructor(private readonly token: string) {}

  private async istek<T>(yol: string, init: { method?: string; govde?: unknown } = {}): Promise<T> {
    const { data } = await platformFetch<T>('google', `${GTM}/${yol}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(init.govde !== undefined ? { body: JSON.stringify(init.govde) } : {}),
    });
    return data;
  }

  /**
   * SAYFALAR SONUNA KADAR OKUNUYOR. Liste yanıtı `nextPageToken` taşıyabiliyor
   * ve yalnız ilk sayfayı okumak, kalan hesapları/konteynerleri hiçbir uyarı
   * vermeden düşürürdü. Üst sınır sonsuz döngüye karşı: 50 sayfadan sonrası
   * bir arıza.
   */
  private async hepsi<T>(yol: string, alan: string): Promise<T[]> {
    const sonuc: T[] = [];
    let sayfa: string | undefined;
    for (let i = 0; i < 50; i++) {
      const ek = sayfa ? `${yol.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(sayfa)}` : '';
      const r = await this.istek<Record<string, unknown> & { nextPageToken?: string }>(`${yol}${ek}`);
      sonuc.push(...((r[alan] as T[] | undefined) ?? []));
      if (!r.nextPageToken) return sonuc;
      sayfa = r.nextPageToken;
    }
    throw new Error(`Tag Manager listesi 50 sayfayı aştı (${yol}); liste eksik kalmasın diye durduruldu.`);
  }

  async hesaplar(): Promise<Array<{ accountId: string; name: string }>> {
    return this.hepsi<{ accountId: string; name: string }>('accounts', 'account');
  }

  async konteynerler(hesapId: string): Promise<GtmKonteyner[]> {
    const r = await this.hepsi<GtmKonteyner & { usageContext?: string[] }>(`accounts/${hesapId}/containers`, 'container');
    return r.filter((c) => !c.usageContext || c.usageContext.includes('web'));
  }

  /**
   * KİMLİKLE BUL — `GTM-XXXX` tek çağrıda, BÜTÜN hesaplarda
   * (`accounts.containers.lookup`). Hesap hesap konteyner listelemek kota
   * başına 0,25 istekle dakikalar sürüyor; sitede görülen kimlik zaten
   * elimizde. Bulunamadı ya da erişim yoksa `null` (404/403); kalan hatalar
   * (kota, ağ) fırlıyor: "yok" sanılırsa sitede kod varken yeni konteyner
   * açılır ve veri ikiye bölünürdü.
   */
  async ara(publicId: string): Promise<(GtmKonteyner & { accountId: string }) | null> {
    try {
      return await this.istek<GtmKonteyner & { accountId: string }>(`accounts/containers:lookup?tagId=${encodeURIComponent(publicId)}`);
    } catch (e) {
      const durum = e instanceof PlatformApiError ? e.detail?.httpStatus : undefined;
      // KOTA DA 403 DÖNÜYOR (Tag Manager belgesi: kota aşımı "403 Forbidden").
      // Kotayı "erişim yok" saymak, kullanıcıya olmayan bir izin sorununu
      // aratırdı; mesajında kota/hız geçen 403 fırlıyor.
      const kota = /rate|quota|limit|exhausted/i.test(e instanceof Error ? e.message : '');
      if (durum === 404 || (durum === 403 && !kota)) return null;
      throw e;
    }
  }

  async konteyner(yol: string): Promise<GtmKonteyner> {
    return this.istek<GtmKonteyner>(yol);
  }

  async konteynerAc(hesapId: string, ad: string): Promise<GtmKonteyner> {
    return this.istek<GtmKonteyner>(`accounts/${hesapId}/containers`, { method: 'POST', govde: { name: ad, usageContext: ['web'] } });
  }

  /** Bizim çalışma alanımız: varsa o, yoksa yeni. Başkasının taslağına dokunmamak için ayrı. */
  async calismaAlani(konteynerYolu: string): Promise<string> {
    const r = await this.istek<{ workspace?: Array<{ path: string; name: string }> }>(`${konteynerYolu}/workspaces`);
    // ESKİ ÇALIŞMA ALANI SİLİNİP YENİDEN AÇILIYOR: yarım kalmış bir koşunun
    // alanı eski sürüme dayalı; senkronlamadan üstüne yazmak çakışma ya da
    // geri alınmış bir değişikliği yeniden yayınlama demekti. Bizim
    // değişikliklerimiz her koşuda baştan yazıldığı için silmek güvenli.
    const eski = (r.workspace ?? []).find((w) => w.name === 'Advetics');
    if (eski) await this.istek(eski.path, { method: 'DELETE' });
    const yeni = await this.istek<{ path: string }>(`${konteynerYolu}/workspaces`, {
      method: 'POST',
      govde: { name: 'Advetics', description: 'Advetics kurulum rehberinin yaptığı değişiklikler' },
    });
    return yeni.path;
  }

  async etiketler(alan: string): Promise<Array<{ path: string; tagId: string; name: string; type: string; parameter?: Parametre[] }>> {
    const r = await this.istek<{ tag?: Array<{ path: string; tagId: string; name: string; type: string; parameter?: Parametre[] }> }>(`${alan}/tags`);
    return r.tag ?? [];
  }

  async tetikler(alan: string): Promise<Array<{ path: string; triggerId: string; name: string }>> {
    const r = await this.istek<{ trigger?: Array<{ path: string; triggerId: string; name: string }> }>(`${alan}/triggers`);
    return r.trigger ?? [];
  }

  async yerlesikDegiskenleriAc(alan: string, turler: readonly string[]): Promise<void> {
    if (turler.length === 0) return;
    const r = await this.istek<{ builtInVariable?: Array<{ type: string }> }>(`${alan}/built_in_variables`);
    const acik = new Set((r.builtInVariable ?? []).map((v) => v.type));
    const eksik = turler.filter((t) => !acik.has(t));
    if (eksik.length === 0) return;
    await this.istek(`${alan}/built_in_variables?${eksik.map((t) => `type=${t}`).join('&')}`, { method: 'POST' });
  }

  async tetikYaz(alan: string, t: TetikTanimi, var_?: { path: string }): Promise<string> {
    const r = await this.istek<{ triggerId: string }>(var_ ? var_.path : `${alan}/triggers`, { method: var_ ? 'PUT' : 'POST', govde: t });
    return r.triggerId;
  }

  async etiketYaz(alan: string, govde: Record<string, unknown>, var_?: { path: string }): Promise<void> {
    await this.istek(var_ ? var_.path : `${alan}/tags`, { method: var_ ? 'PUT' : 'POST', govde });
  }

  async etiketSil(etiketYolu: string): Promise<void> {
    await this.istek(etiketYolu, { method: 'DELETE' });
  }

  async sonSurum(konteynerYolu: string): Promise<{ id: string | null; ad: string | null; silinmis: boolean }> {
    const r = await this.istek<{ containerVersionId?: string; name?: string; deleted?: boolean }>(`${konteynerYolu}/version_headers:latest`);
    return { id: r.containerVersionId ?? null, ad: r.name ?? null, silinmis: r.deleted === true };
  }

  async canliSurum(konteynerYolu: string): Promise<string | null> {
    try {
      const r = await this.istek<{ containerVersionId?: string }>(`${konteynerYolu}/versions:live`);
      return r.containerVersionId ?? null;
    } catch (e) {
      // Hiç yayınlanmamış yeni konteynerde canlı sürüm YOK (404); bu bir hata değil.
      if (e instanceof Error && /404|not found/i.test(e.message)) return null;
      throw e;
    }
  }

  async surumOlusturVeYayinla(alan: string, not: string): Promise<{ surumYolu: string; surumId: string }> {
    const v = await this.istek<{ containerVersion?: { path: string; containerVersionId: string }; compilerError?: boolean; syncStatus?: { mergeConflict?: boolean; syncError?: boolean } }>(
      `${alan}:create_version`,
      { method: 'POST', govde: { name: SURUM_ADI, notes: not } },
    );
    if (v.compilerError) throw new Error('Tag Manager sürümü derlenemedi (etiketlerden biri geçersiz). Tag Manager’da Advetics çalışma alanına bak.');
    if (v.syncStatus?.mergeConflict || v.syncStatus?.syncError) throw new Error('Tag Manager çalışma alanı son sürümle çakışıyor; Tag Manager’da Advetics çalışma alanını güncelle.');
    if (!v.containerVersion) throw new Error('Tag Manager sürüm döndürmedi.');
    const p = await this.istek<{ compilerError?: boolean }>(`${v.containerVersion.path}:publish`, { method: 'POST' });
    if (p.compilerError) throw new Error('Tag Manager sürümü yayınlanamadı (derleme hatası).');
    return { surumYolu: v.containerVersion.path, surumId: v.containerVersion.containerVersionId };
  }
}
