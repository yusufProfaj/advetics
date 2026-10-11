import { platformFetch } from '../connections/providers/http';

/**
 * ═══ GOOGLE ANALYTICS 4 — MÜLK, AKIŞ, ADS BAĞLANTISI, ANLIK RAPOR ═══
 *
 * Analytics Admin API v1beta ve Data API v1beta. HESAP açılamıyor (tarayıcıda
 * şart kabulü istiyor, MIMARI Ç-1); mülk ve web akışı açılabiliyor.
 * CANLIDA ÖLÇÜLMEDİ: ilk kurulumda Analytics arayüzünde gözle kontrol.
 */

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';

export interface Ga4Hesabi {
  hesapId: string;
  ad: string;
  mulkler: Array<{ mulkId: string; ad: string }>;
}

export interface Ga4Akisi {
  yol: string;
  olcumKimligi: string;
  adres: string | null;
}

/** "properties/123" → "123"; biçim dışı değer sessizce geçmesin. */
function kimlikSonu(ad: string, onek: string): string {
  const m = new RegExp(`^${onek}/(\\d+)$`).exec(ad);
  if (!m) throw new Error(`Beklenmeyen Analytics kaynak adı: ${ad}`);
  return m[1]!;
}

export class Ga4Istemcisi {
  constructor(private readonly token: string) {}

  private async istek<T>(url: string, init: { method?: string; govde?: unknown } = {}): Promise<T> {
    const { data } = await platformFetch<T>('google', url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      ...(init.govde !== undefined ? { body: JSON.stringify(init.govde) } : {}),
    });
    return data;
  }

  async hesaplar(): Promise<Ga4Hesabi[]> {
    const sonuc: Ga4Hesabi[] = [];
    let sayfa: string | undefined;
    // Sayfalı: ajansın onlarca hesabı olabilir; ilk sayfada kesmek sessiz kesme olurdu.
    for (let i = 0; i < 20; i++) {
      const r = await this.istek<{
        accountSummaries?: Array<{ account: string; displayName: string; propertySummaries?: Array<{ property: string; displayName: string }> }>;
        nextPageToken?: string;
      }>(`${ADMIN}/accountSummaries?pageSize=200${sayfa ? `&pageToken=${encodeURIComponent(sayfa)}` : ''}`);
      for (const a of r.accountSummaries ?? []) {
        sonuc.push({
          hesapId: kimlikSonu(a.account, 'accounts'),
          ad: a.displayName,
          mulkler: (a.propertySummaries ?? []).map((p) => ({ mulkId: kimlikSonu(p.property, 'properties'), ad: p.displayName })),
        });
      }
      if (!r.nextPageToken) break;
      sayfa = r.nextPageToken;
    }
    return sonuc;
  }

  async mulkAc(hesapId: string, ad: string): Promise<string> {
    const r = await this.istek<{ name: string }>(`${ADMIN}/properties`, {
      method: 'POST',
      // Saat dilimi ve para birimi AÇIKÇA: varsayılana bırakmak raporu
      // Pasifik saatine ve USD'ye kaydırırdı (platformun varsayılanına güvenme).
      govde: { parent: `accounts/${hesapId}`, displayName: ad, timeZone: 'Europe/Istanbul', currencyCode: 'TRY' },
    });
    return kimlikSonu(r.name, 'properties');
  }

  async webAkislari(mulkId: string): Promise<Ga4Akisi[]> {
    const r = await this.istek<{ dataStreams?: Array<{ name: string; type: string; webStreamData?: { measurementId?: string; defaultUri?: string } }> }>(
      `${ADMIN}/properties/${mulkId}/dataStreams`,
    );
    return (r.dataStreams ?? [])
      .filter((d) => d.type === 'WEB_DATA_STREAM' && d.webStreamData?.measurementId)
      .map((d) => ({ yol: d.name, olcumKimligi: d.webStreamData!.measurementId!, adres: d.webStreamData?.defaultUri ?? null }));
  }

  async webAkisiAc(mulkId: string, ad: string, adres: string): Promise<Ga4Akisi> {
    const r = await this.istek<{ name: string; webStreamData?: { measurementId?: string; defaultUri?: string } }>(`${ADMIN}/properties/${mulkId}/dataStreams`, {
      method: 'POST',
      govde: { type: 'WEB_DATA_STREAM', displayName: ad, webStreamData: { defaultUri: adres } },
    });
    if (!r.webStreamData?.measurementId) throw new Error('Analytics web akışı ölçüm kimliği döndürmedi.');
    return { yol: r.name, olcumKimligi: r.webStreamData.measurementId, adres: r.webStreamData.defaultUri ?? adres };
  }

  async adsBaglantilari(mulkId: string): Promise<string[]> {
    const r = await this.istek<{ googleAdsLinks?: Array<{ customerId: string }> }>(`${ADMIN}/properties/${mulkId}/googleAdsLinks`);
    return (r.googleAdsLinks ?? []).map((l) => l.customerId.replace(/-/g, ''));
  }

  async adsBagla(mulkId: string, musteriNo: string): Promise<void> {
    await this.istek(`${ADMIN}/properties/${mulkId}/googleAdsLinks`, { method: 'POST', govde: { customerId: musteriNo.replace(/-/g, '') } });
  }

  async anahtarEtkinlikler(mulkId: string): Promise<string[]> {
    const r = await this.istek<{ keyEvents?: Array<{ eventName: string }> }>(`${ADMIN}/properties/${mulkId}/keyEvents`);
    return (r.keyEvents ?? []).map((k) => k.eventName);
  }

  async anahtarEtkinlikAc(mulkId: string, olay: string): Promise<void> {
    await this.istek(`${ADMIN}/properties/${mulkId}/keyEvents`, { method: 'POST', govde: { eventName: olay, countingMethod: 'ONCE_PER_EVENT' } });
  }

  /** Son 30 dakikanın olay sayıları (anlık rapor). Olay adı → sayım. */
  async anlikOlaylar(mulkId: string): Promise<Record<string, number>> {
    const r = await this.istek<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>(
      `${DATA}/properties/${mulkId}:runRealtimeReport`,
      {
        method: 'POST',
        govde: { dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }] },
      },
    );
    const sonuc: Record<string, number> = {};
    for (const row of r.rows ?? []) {
      const ad = row.dimensionValues?.[0]?.value;
      const n = Number(row.metricValues?.[0]?.value ?? 0);
      if (ad) sonuc[ad] = (sonuc[ad] ?? 0) + (Number.isFinite(n) ? n : 0);
    }
    return sonuc;
  }
}
