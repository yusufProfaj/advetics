import { DESTEKLENEN_META_SURUMLERI, type MetaApiSurumu } from '@advetics/shared';
import { MetaBelirsizHata, MetaKesinHata, type MetaYazmaPortu } from './yayin-motoru';

/**
 * Reklam modülünün Graph istemcisi — `MetaYazmaPortu`nun gerçek hâli.
 *
 * ESKİ `meta.provider.ts`'İ KULLANMIYOR (modül sınırı). Onun kalıpları okundu
 * ve iki noktada bilerek ayrışıyor:
 *  1. Hata ikiye değil, KESİN / BELİRSİZ diye ayrılıyor. Motorun bütün
 *     güvenliği bu ayrıma dayanıyor: kesin ret nesne doğmadı demek, belirsiz
 *     sonuç doğmuş olabilir demek ve o halka ASLA kendiliğinden yeniden
 *     POST edilmez.
 *  2. Oluşturma çağrısına `fields` EKLENMİYOR. Okuma kısmı düşerse Graph hata
 *     döner ama yazma geri alınmamış olabilir; "hata aldık, tekrar dene"
 *     ikinci kampanyayı açar (R4-S-2). Okuma her zaman ayrı GET.
 *
 * Token istemciye VERİLİYOR, burada çözülmüyor: şifre çözme `meta-erisim.ts`
 * içinde ve log'a hiçbir yerde token yazılmıyor.
 */

export interface GrafAyarlari {
  apiSurumu: string;
  /** act_ önekli reklam hesabı kimliği. */
  hesap: string;
  kullaniciToken: string;
  /** Form uçları SAYFA token'ı istiyor: sayfa platform kimliği → token. */
  sayfaTokeni: (sayfaId: string) => Promise<string>;
  /** Hesap başına image_hash önbelleği (`asset_platform_refs`). */
  gorselOnbellek: { oku(varlikId: string): Promise<string | null>; yaz(varlikId: string, hash: string): Promise<void> };
  gorselBaytlari: (varlikId: string) => Promise<Buffer>;
  /** Video baytları ve biçimi (yalnız mp4/mov). */
  videoBaytlari?: (varlikId: string) => Promise<{ bayt: Buffer; mime: string }>;
  /** Testte sahte; üretimde global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Açılışta denetlenen sürüm. Listede olmayan bir `META_API_VERSION` ile
 * sessizce çalışmak, süresi biten bir sürümle (v24, 2026-10-06'da bitti)
 * yazmak demek; font bulunamazsa patlayan PDF gibi burası da AÇIKÇA patlıyor.
 */
export function metaSurumuDogrula(surum: string): MetaApiSurumu {
  if (!(DESTEKLENEN_META_SURUMLERI as readonly string[]).includes(surum)) {
    throw new Error(
      `META_API_VERSION=${surum} yeni reklam modülünde desteklenmiyor (desteklenen: ${DESTEKLENEN_META_SURUMLERI.join(', ')})`,
    );
  }
  return surum as MetaApiSurumu;
}

/** Sonucu bilinmeyen Graph hata kodları: 1 = bilinmeyen, 2 = geçici servis. */
const BELIRSIZ_KODLAR = new Set([1, 2]);
const VARSAYILAN_SURE_MS = 30_000;
const GORSEL_SURE_MS = 120_000;
/** Büyük video yüklemesi dakikalar sürebilir. */
const VIDEO_SURE_MS = 10 * 60_000;

interface GrafHatasi {
  message?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  fbtrace_id?: string;
  error_user_msg?: string;
}

/**
 * HTTP sonucunu motorun diline çevirir. Saf; testte doğrudan sınanıyor.
 *
 * KURAL: şüphede BELİRSİZ. Bir hatayı yanlışlıkla kesin saymak "kaldığı
 * yerden devam" ile ikinci nesneyi açtırır; yanlışlıkla belirsiz saymak
 * yalnızca bir arama ve bir insan kararı ister. İkincisi ucuz.
 */
export function hataSiniflandir(httpDurum: number | null, govde: unknown): MetaKesinHata | MetaBelirsizHata {
  if (httpDurum === null) return new MetaBelirsizHata('Meta’ya ulaşılamadı ya da cevap gelmedi');
  const h = (govde && typeof govde === 'object' ? (govde as { error?: GrafHatasi }).error : undefined) ?? undefined;
  const mesaj = h?.error_user_msg || h?.message || `HTTP ${httpDurum}`;
  if (httpDurum >= 500) return new MetaBelirsizHata(`Meta sunucu hatası: ${mesaj}`);
  if (!h) return new MetaBelirsizHata(`Meta beklenmeyen bir cevap verdi (HTTP ${httpDurum})`);
  if (h.is_transient || (h.code !== undefined && BELIRSIZ_KODLAR.has(h.code))) {
    return new MetaBelirsizHata(`Meta geçici hata: ${mesaj}`);
  }
  return new MetaKesinHata(mesaj, h.code, h.error_subcode, h.fbtrace_id);
}

/**
 * Graph form gövdesi: nesne ve dizi değerleri JSON dizgesi olarak gider
 * (`targeting={"geo_locations":...}`), düz değerler olduğu gibi. Graph JSON
 * gövdeyi de kabul ediyor ama alt nesnelerde tutarsız; belgelenen biçim bu.
 */
export function formGovdesi(alanlar: Record<string, unknown>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(alanlar)) {
    if (v === undefined) continue;
    p.set(k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
  }
  return p;
}

export class MetaGrafIstemcisi implements MetaYazmaPortu {
  private readonly kok: string;
  private readonly fetchFn: typeof fetch;
  /** Bu istemcinin kurduğu formlar: arşivlerken SAYFA token'ı gerekiyor. */
  private readonly formSayfasi = new Map<string, string>();

  constructor(private readonly a: GrafAyarlari) {
    if (!/^act_\d+$/.test(a.hesap)) throw new Error(`Reklam hesabı act_ önekli olmalı: ${a.hesap}`);
    this.kok = `https://graph.facebook.com/${metaSurumuDogrula(a.apiSurumu)}`;
    this.fetchFn = a.fetchFn ?? fetch;
  }

  async gorselYukle(hesap: string, varlikId: string): Promise<string> {
    this.hesapDogrula(hesap);
    // image_hash HESAP BAŞINA: bir hesabın hash'i diğerinde çalışmaz.
    const onbellek = await this.a.gorselOnbellek.oku(varlikId);
    if (onbellek) return onbellek;
    const bayt = await this.a.gorselBaytlari(varlikId);
    const r = await this.cagri<{ images?: Record<string, { hash?: string }> }>(
      'POST',
      `${hesap}/adimages`,
      this.a.kullaniciToken,
      new URLSearchParams({ bytes: bayt.toString('base64') }),
      GORSEL_SURE_MS,
    );
    // Hash `images.<gönderilen ad>.hash` altında; anahtar adına güvenme.
    const hash = Object.values(r.images ?? {})[0]?.hash;
    if (!hash) throw new MetaBelirsizHata('Görsel yüklendi ama Meta hash döndürmedi');
    await this.a.gorselOnbellek.yaz(varlikId, hash);
    return hash;
  }

  /**
   * VİDEO: `POST /act/advideos`, çok parçalı gövde, alan adı `source`.
   * Sınır `FormData` ile kuruluyor (elle yazılan sınır tek baytta "geçersiz
   * istek" veriyor ve hangi bayt olduğunu söylemiyor). Kimlik hesap başına
   * önbellekte; aynı video aynı hesaba ikinci kez yüklenmiyor.
   */
  async videoYukle(hesap: string, varlikId: string): Promise<string> {
    this.hesapDogrula(hesap);
    const onbellek = await this.a.gorselOnbellek.oku(varlikId);
    if (onbellek) return onbellek;
    if (!this.a.videoBaytlari) throw new MetaKesinHata('Video okuyucusu kurulmamış');
    const v = await this.a.videoBaytlari(varlikId);
    const form = new FormData();
    form.append('source', new Blob([new Uint8Array(v.bayt)], { type: v.mime }), v.mime === 'video/quicktime' ? 'video.mov' : 'video.mp4');
    const r = await this.istek<{ id?: string }>('POST', `${this.kok}/${hesap}/advideos`, this.a.kullaniciToken, form, VIDEO_SURE_MS);
    if (!r.id) throw new MetaBelirsizHata('Video yüklendi ama Meta kimlik döndürmedi');
    await this.a.gorselOnbellek.yaz(varlikId, r.id);
    return r.id;
  }

  async videoDurumu(videoId: string): Promise<'hazir' | 'isleniyor' | 'hata'> {
    const r = await this.cagri<{ status?: { video_status?: string } }>('GET', `${videoId}?fields=status`, this.a.kullaniciToken);
    const s = r.status?.video_status;
    return s === 'ready' ? 'hazir' : s === 'error' ? 'hata' : 'isleniyor';
  }

  async olustur(hesap: string, uc: string, alanlar: Record<string, unknown>): Promise<{ id: string }> {
    this.hesapDogrula(hesap);
    if ('fields' in alanlar) throw new Error('Oluşturma çağrısına fields eklenmez');
    // Prova seçenekleri gerçek kurulumda olamaz: yanlış yere düşmüş bir
    // prova gövdesi ya nesne açmaz ya da beklenmeyen biçimde açar.
    if ('execution_options' in alanlar) throw new Error('Oluşturma çağrısına execution_options eklenmez');
    const form = /^(\d+)\/leadgen_forms$/.exec(uc);
    const token = form ? await this.a.sayfaTokeni(form[1]!) : this.a.kullaniciToken;
    const yol = form ? uc : `${hesap}/${uc}`;
    const r = await this.cagri<{ id?: string }>('POST', yol, token, formGovdesi(alanlar));
    if (!r.id) throw new MetaBelirsizHata(`Meta ${uc} için kimlik döndürmedi`);
    if (form) this.formSayfasi.set(r.id, form[1]!);
    return { id: r.id };
  }

  /**
   * PROVA. `validate_only` YOKSA ÇAĞRI YAPILMAZ: aynı uç validate_only'siz
   * gerçek nesne açıyor ve "prova" diye kurulmuş bir kampanya, kimsenin
   * izlemediği bir kampanya olurdu.
   */
  async dogrula(hesap: string, uc: string, alanlar: Record<string, unknown>): Promise<void> {
    this.hesapDogrula(hesap);
    const sec = alanlar.execution_options;
    if (!Array.isArray(sec) || !sec.includes('validate_only')) {
      throw new Error('Prova validate_only olmadan gönderilmez');
    }
    const r = await this.cagri<{ success?: boolean; id?: string }>('POST', `${hesap}/${uc}`, this.a.kullaniciToken, formGovdesi(alanlar));
    // validate_only'de Meta kimlik DÖNDÜRMEMELİ. Dönerse nesne açılmış
    // demektir: bunu "geçti" saymak sessizce yetim bir nesne bırakır.
    if (r.id) throw new MetaBelirsizHata(`Prova Meta'da nesne açmış görünüyor (${r.id}); kontrol edin`);
    if (r.success === false) throw new MetaBelirsizHata('Meta provayı onaylamadı ama hata da vermedi');
  }

  async oku(metaId: string, alanlar: string[]): Promise<Record<string, unknown>> {
    const sayfa = this.formSayfasi.get(metaId);
    const token = sayfa ? await this.a.sayfaTokeni(sayfa) : this.a.kullaniciToken;
    return this.cagri('GET', `${metaId}?fields=${encodeURIComponent(alanlar.join(','))}`, token);
  }

  /**
   * `{tür}bylabels` etiket ADI değil etiket KİMLİĞİ istiyor; önce hesabın
   * etiketlerinden kimlik bulunuyor. Etiket yoksa hiçbir nesne o etiketi
   * taşımıyor demektir: boş liste (hata değil). Görünür olma gecikmesi
   * canlıda ölçülecek.
   */
  async etiketleAra(hesap: string, tur: 'campaigns' | 'adsets' | 'ads', etiket: string): Promise<Array<{ id: string; name: string }>> {
    this.hesapDogrula(hesap);
    const etiketler = await this.hepsi<{ id: string; name: string }>(`${hesap}/adlabels?fields=id,name&limit=500`);
    const e = etiketler.find((x) => x.name === etiket);
    if (!e) return [];
    return this.hepsi<{ id: string; name: string }>(
      `${hesap}/${tur}bylabels?ad_label_ids=${encodeURIComponent(JSON.stringify([e.id]))}&operator=ANY&fields=id,name&limit=500`,
    );
  }

  async durumYaz(metaId: string, alanlar: { status: 'ACTIVE' | 'ARCHIVED'; name?: string }): Promise<void> {
    const sayfa = this.formSayfasi.get(metaId);
    const token = sayfa ? await this.a.sayfaTokeni(sayfa) : this.a.kullaniciToken;
    const r = await this.cagri<{ success?: boolean }>('POST', metaId, token, formGovdesi(alanlar));
    // `success: false` bir HATA: 200 döndü diye yazıldı sayılmaz.
    if (r.success === false) throw new MetaBelirsizHata(`Meta ${metaId} durumunu yazmadı`);
  }

  /** Sayfalı GET; `paging.next` izlenir, üst sınır 20 sayfa (sessiz kesme yok: aşarsa hata). */
  private async hepsi<T>(yol: string): Promise<T[]> {
    const sonuc: T[] = [];
    let sonraki: string | null = `${this.kok}/${yol}`;
    for (let i = 0; sonraki; i++) {
      if (i >= 20) throw new MetaBelirsizHata('Arama 20 sayfayı aştı; sonuç eksik olabilir');
      const r: { data?: T[]; paging?: { next?: string } } = await this.istek('GET', sonraki, this.a.kullaniciToken);
      sonuc.push(...(r.data ?? []));
      sonraki = r.paging?.next ?? null;
    }
    return sonuc;
  }

  private cagri<T>(yontem: 'GET' | 'POST', yol: string, token: string, govde?: URLSearchParams | FormData, sure?: number): Promise<T> {
    return this.istek<T>(yontem, `${this.kok}/${yol}`, token, govde, sure);
  }

  private async istek<T>(yontem: 'GET' | 'POST', adres: string, token: string, govde?: URLSearchParams | FormData, sure = VARSAYILAN_SURE_MS): Promise<T> {
    // `paging.next` Meta'dan gelen bir adres: yalnız graph.facebook.com'a
    // gidilir. Token'ı başka bir ana makineye taşımak, yanıtı değiştiren
    // herkese token vermek olurdu.
    if (!adres.startsWith('https://graph.facebook.com/')) throw new Error(`Beklenmeyen adres: ${adres}`);
    let res: Response;
    try {
      res = await this.fetchFn(adres, {
        method: yontem,
        headers: {
          Authorization: `Bearer ${token}`,
          // FormData'da Content-Type'ı fetch KENDİSİ yazar (sınırla birlikte).
          ...(govde instanceof URLSearchParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: govde instanceof FormData ? govde : govde?.toString(),
        redirect: 'manual',
        signal: AbortSignal.timeout(sure),
      });
    } catch {
      throw hataSiniflandir(null, null);
    }
    const metin = await res.text().catch(() => '');
    let veri: unknown = null;
    try {
      veri = metin ? JSON.parse(metin) : null;
    } catch {
      veri = null;
    }
    if (!res.ok) throw hataSiniflandir(res.status, veri);
    if (veri === null || typeof veri !== 'object') throw new MetaBelirsizHata('Meta’nın cevabı okunamadı');
    return veri as T;
  }

  private hesapDogrula(hesap: string): void {
    if (hesap !== this.a.hesap) throw new Error(`İstemci ${this.a.hesap} için kuruldu, ${hesap} istendi`);
  }
}
