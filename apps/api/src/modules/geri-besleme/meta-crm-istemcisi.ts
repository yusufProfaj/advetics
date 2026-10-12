import { META_CRM, type MetaYaniti } from '@advetics/shared';
import { PlatformApiError, type RateLimitSnapshot } from '../connections/provider.types';
import { parseMetaRateLimit, platformFetch } from '../connections/providers/http';

/**
 * ═══ META CONVERSIONS API — CRM OLAYI GÖNDERİCİSİ (MIMARI § 6.1) ═══
 *
 * İKİ İSTEK, İKİSİ DE SABİT ANA MAKİNEYE (`graph.facebook.com`): adres
 * kullanıcıdan gelmiyor, dataset kimliği yalnız rakam (yol enjeksiyonu yok,
 * MIMARI § 7). Token yalnız `Authorization` başlığında; URL'de ve log'da YOK.
 *
 * HATA FIRLATMIYOR, CEVABI DÖNDÜRÜYOR. Gönderim işinin her cevaba ayrı bir
 * karar vermesi gerekiyor (kabul / geçici / olay hatası / ayar hatası,
 * `metaYanitSinifi`); `platformFetch`in hatasını yukarı fırlatmak o kararı
 * `catch` bloklarına dağıtırdı ve "200 döndü ama 49 olay alındı" hâli hiçbir
 * catch'e düşmezdi.
 *
 * `test_event_code` YOK ve OLAMAZ (Meta test olaylarını ATMIYOR, üretim
 * verisine işliyor; 08-olcum § Tuzaklar 1). Kaynak taramasıyla kilitli.
 */
export interface MetaGonderimSonucu extends MetaYaniti {
  /** Meta'nın cümlesi AYNEN (zenginleştirilmiş: error_user_msg, subcode, fbtrace). */
  mesaj: string | null;
  fbtraceId: string | null;
  rateLimit?: RateLimitSnapshot;
}

const DATASET = /^\d{5,20}$/;

function graph(): string {
  return `https://graph.facebook.com/${META_CRM.surum}`;
}

export class MetaCrmIstemcisi {
  /**
   * `POST /{dataset}/events`. Gövde METİN olarak geliyor (`metaGovdeMetni`):
   * 17 haneli `lead_id` JavaScript sayısına sığmıyor ve gövdeyi burada
   * yeniden `JSON.stringify` etmek onu bozardı. Bu fonksiyon gövdeye
   * DOKUNMUYOR.
   */
  async olayGonder(datasetId: string, token: string, govdeMetni: string): Promise<MetaGonderimSonucu> {
    if (!DATASET.test(datasetId)) throw new Error('Veri kümesi kimliği yalnız rakam olmalı');
    try {
      const r = await platformFetch<{ events_received?: unknown; fbtrace_id?: unknown }>(
        'meta',
        `${graph()}/${datasetId}/events`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: govdeMetni,
        },
        parseMetaRateLimit,
      );
      return {
        http: 200,
        eventsReceived: typeof r.data?.events_received === 'number' ? r.data.events_received : null,
        hataKodu: null,
        hataAltKodu: null,
        mesaj: null,
        fbtraceId: typeof r.data?.fbtrace_id === 'string' ? r.data.fbtrace_id : null,
        rateLimit: r.rateLimit,
      };
    } catch (err) {
      return hatadanYanit(err);
    }
  }

  /**
   * `GET /{dataset}?fields=name,is_crm,owner_business,is_unavailable`
   * (ayar kontrolü, MIMARI Ç-7). `is_crm` okunamazsa `null`: tahmin yok.
   * Hata FIRLATIYOR: burada karar veren yok, ekran Meta'nın cümlesini görmeli.
   */
  async veriKumesiOku(datasetId: string, token: string): Promise<{ ad: string | null; crm: boolean | null; kullanilamaz: boolean }> {
    if (!DATASET.test(datasetId)) throw new PlatformApiError('meta', 'permanent', 'Veri kümesi kimliği yalnız rakam olmalı');
    const url = new URL(`${graph()}/${datasetId}`);
    url.searchParams.set('fields', 'name,is_crm,owner_business,is_unavailable');
    const r = await platformFetch<{ name?: unknown; is_crm?: unknown; is_unavailable?: unknown }>(
      'meta',
      url.toString(),
      { headers: { Authorization: `Bearer ${token}` } },
      parseMetaRateLimit,
    );
    return {
      ad: typeof r.data?.name === 'string' ? r.data.name : null,
      crm: typeof r.data?.is_crm === 'boolean' ? r.data.is_crm : null,
      kullanilamaz: r.data?.is_unavailable === true,
    };
  }
}

/** `platformFetch` hatasını `metaYanitSinifi`nın okuduğu biçime çevirir. */
export function hatadanYanit(err: unknown): MetaGonderimSonucu {
  if (err instanceof PlatformApiError) {
    const d = err.detail;
    const kod = d?.platformCode === undefined ? null : Number(d.platformCode);
    const alt = d?.platformSubcode === undefined ? null : Number(d.platformSubcode);
    const ham = (d?.raw ?? {}) as { error?: { fbtrace_id?: unknown } };
    return {
      // Ağ hatası ve zaman aşımında HTTP durumu yok: `null` = geçici
      // (`teslimSonucu`). 0 yazmak onu kalıcı hata sınıfına sokardı.
      http: d?.httpStatus ?? null,
      eventsReceived: null,
      hataKodu: Number.isFinite(kod) ? kod : null,
      hataAltKodu: Number.isFinite(alt) ? alt : null,
      mesaj: err.message,
      fbtraceId: typeof ham.error?.fbtrace_id === 'string' ? ham.error.fbtrace_id : null,
    };
  }
  return {
    http: null,
    eventsReceived: null,
    hataKodu: null,
    hataAltKodu: null,
    mesaj: err instanceof Error ? err.message : String(err),
    fbtraceId: null,
  };
}
