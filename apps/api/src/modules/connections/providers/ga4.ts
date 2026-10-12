import { GA4_ISTEK_SINIRI, GA4_RAPORLARI, ga4Kalite, type Ga4Kalite, type Ga4RaporKodu } from '@advetics/shared';
import { platformFetch } from './http';

/**
 * ═══ GOOGLE ANALYTICS 4 — MÜLK, AKIŞ, ADS BAĞLANTISI, RAPOR ═══
 *
 * Analytics Admin API v1beta ve Data API v1beta. HESAP açılamıyor (tarayıcıda
 * şart kabulü istiyor, MIMARI Ç-1); mülk ve web akışı açılabiliyor.
 * CANLIDA ÖLÇÜLMEDİ: ilk kurulumda Analytics arayüzünde gözle kontrol.
 *
 * TEK İSTEMCİ (docs/veri-kaynagi/MIMARI.md § 3.7): kurulum rehberi (yazma,
 * mülk/akış açma) ve veri kaynakları (okuma, `runReport`) bunu kullanıyor.
 * `kurulum/` altından buraya taşındı; ikinci bir GA4 istemcisi aynı hatayı
 * iki yerde iki farklı biçimde ayrıştırırdı.
 */

/**
 * Data API'nin döndürdüğü mülk kotası (`returnPropertyQuota: true`).
 * Kalan/toplam; `ga4KotaIzni` bununla karar veriyor. Alan dönmezse `null`
 * (ilk istek, ya da Google göndermedi): bilinmeyen kota "izin" sayılır ama
 * işin notuna "kota bilinmiyor" yazılır.
 */
export interface Ga4MulkKotasi {
  gunKalan?: number;
  gunToplam?: number;
  saatKalan?: number;
  saatToplam?: number;
}

export interface Ga4RaporSatiri {
  boyutlar: string[];
  metrikler: string[];
}

export interface Ga4RaporSonucu {
  satirlar: Ga4RaporSatiri[];
  /** Google'ın bildirdiği toplam satır; okunanla kıyaslanır (sessiz kesme yok). */
  satirSayisi: number;
  kalite: Ga4Kalite;
  kota: Ga4MulkKotasi | null;
  /** Kaç sayfa (istek) gitti; jeton maliyeti ölçümü için (Ajan 5). */
  istek: number;
  /** Sayfalama YARIDA kesildiyse nedeni (kota, sayfa sınırı, eksik satır). Kısmi sonuç YAZILMAZ. */
  durdu: string | null;
  /** Kesinti Google'ın EKSİK satır döndürmesinden mi (geçici: tekrar denenmeli), kotadan mı (yarına kalır). */
  eksik: boolean;
}

interface HamRapor {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
  metadata?: {
    dataLossFromOtherRow?: boolean;
    subjectToThresholding?: boolean;
    samplingMetadatas?: Array<{ samplesReadCount?: string; samplingSpaceSize?: string }>;
  };
  propertyQuota?: {
    tokensPerDay?: { consumed?: number; remaining?: number };
    tokensPerHour?: { consumed?: number; remaining?: number };
  };
}

/** PropertyQuota → kalan/toplam. Toplam = tüketilen + kalan (Google toplamı ayrıca vermiyor). */
export function ga4KotaOku(q: HamRapor['propertyQuota']): Ga4MulkKotasi | null {
  if (!q) return null;
  const kova = (k?: { consumed?: number; remaining?: number }) =>
    k && typeof k.remaining === 'number' ? { kalan: k.remaining, toplam: k.remaining + (k.consumed ?? 0) } : null;
  const gun = kova(q.tokensPerDay);
  const saat = kova(q.tokensPerHour);
  if (!gun && !saat) return null;
  return {
    ...(gun ? { gunKalan: gun.kalan, gunToplam: gun.toplam } : {}),
    ...(saat ? { saatKalan: saat.kalan, saatToplam: saat.toplam } : {}),
  };
}

/** Sayfa boyutu: API en çok 250.000 kabul ediyor; 100.000 bir yanıtı makul tutuyor (MIMARI § 3.2). */
export const GA4_SAYFA = 100_000;
/** Sonsuz döngü kesicisi: 100.000 × 30 = 3 milyon satır, bir mülkün bir parçası için fazlasıyla. */
const GA4_EN_FAZLA_SAYFA = 30;

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

  /**
   * Mülkün saat dilimi ve para birimi. Rapor tarihleri MÜLKÜN gününde
   * geliyor; reklam hesabının dilimini kullanmak gece yarısına yakın
   * oturumları komşu güne yazardı (shared pencere.ts).
   */
  async mulkAyari(mulkId: string): Promise<{ ad: string; saatDilimi: string | null; paraBirimi: string | null }> {
    const r = await this.istek<{ displayName?: string; timeZone?: string; currencyCode?: string }>(`${ADMIN}/properties/${mulkId}`);
    return { ad: r.displayName ?? mulkId, saatDilimi: r.timeZone ?? null, paraBirimi: r.currencyCode ?? null };
  }

  /**
   * TEK SAYFA `runReport`. Tanım `GA4_RAPORLARI`ndan: boyut ve metrik adı
   * burada elle yazılmıyor (iki rapor iki tabloya gidiyor, tanım tek yerde).
   * `returnPropertyQuota` HER İSTEKTE: kota müşterinin panosuyla paylaşılıyor
   * ve her sayfadan sonra yeniden değerlendiriliyor (`ga4KotaIzni`).
   */
  async raporSayfasi(
    mulkId: string,
    rapor: Ga4RaporKodu,
    aralik: { from: string; to: string },
    offset: number,
    limit = GA4_SAYFA,
  ): Promise<HamRapor> {
    const tanim = GA4_RAPORLARI[rapor];
    if (tanim.boyutlar.length > GA4_ISTEK_SINIRI.boyut || tanim.metrikler.length > GA4_ISTEK_SINIRI.metrik) {
      throw new Error(`GA4 rapor tanımı API sınırını aşıyor: ${rapor}`);
    }
    return this.istek<HamRapor>(`${DATA}/properties/${mulkId}:runReport`, {
      method: 'POST',
      govde: {
        dateRanges: [{ startDate: aralik.from, endDate: aralik.to }],
        dimensions: tanim.boyutlar.map((name) => ({ name })),
        metrics: tanim.metrikler.map((name) => ({ name })),
        limit: String(limit),
        offset: String(offset),
        returnPropertyQuota: true,
        keepEmptyRows: false,
        /*
         * ANAHTAR ETKİNLİK RAPORU YALNIZ keyEvents > 0: eventName boyutu
         * mülkün BÜTÜN olaylarını (page_view, scroll...) satır yapar; süzgeç
         * olmadan rapor yüz kat büyür ve kotayı boşa yer.
         */
        ...(rapor === 'anahtarEtkinlik'
          ? { metricFilter: { filter: { fieldName: 'keyEvents', numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } } } } }
          : {}),
      },
    });
  }

  /**
   * Bütün sayfalar. Her sayfadan sonra `devamEt(kota)` sorulur; `false`
   * dönerse sayfalama DURUR ve `durdu` dolu döner: çağıran bu kısmi sonucu
   * YAZMAMALI (pencere sil-yeniden-yaz ile yazılıyor; yarım pencere, eski
   * tam pencereyi silip eksik veriyle değiştirmek olurdu).
   *
   * Okunan satır `rowCount`tan azsa (Google sayfayı kısa kesti) bu da
   * `durdu` değil ama `satirSayisi` ile kıyas çağıranın notuna yazılır.
   */
  async raporTamami(
    mulkId: string,
    rapor: Ga4RaporKodu,
    aralik: { from: string; to: string },
    devamEt: (kota: Ga4MulkKotasi | null) => string | null,
    limit = GA4_SAYFA,
  ): Promise<Ga4RaporSonucu> {
    const satirlar: Ga4RaporSatiri[] = [];
    let satirSayisi = 0;
    let kalite: Ga4Kalite = { digerSatiri: false, esiklendi: false, ornekleme: null };
    let kota: Ga4MulkKotasi | null = null;
    let istek = 0;
    for (let sayfa = 0; sayfa < GA4_EN_FAZLA_SAYFA; sayfa++) {
      const r = await this.raporSayfasi(mulkId, rapor, aralik, satirlar.length, limit);
      istek++;
      const gelen = (r.rows ?? []).map((row) => ({
        boyutlar: (row.dimensionValues ?? []).map((d) => d.value ?? ''),
        metrikler: (row.metricValues ?? []).map((m) => m.value ?? '0'),
      }));
      satirlar.push(...gelen);
      satirSayisi = r.rowCount ?? satirlar.length;
      const k = ga4Kalite(r.metadata);
      // Bayraklar sayfalar arasında BİRLEŞİR: (other) bir sayfada görüldüyse rapor onu taşıyor.
      kalite = {
        digerSatiri: kalite.digerSatiri || k.digerSatiri,
        esiklendi: kalite.esiklendi || k.esiklendi,
        ornekleme: k.ornekleme ?? kalite.ornekleme,
      };
      kota = ga4KotaOku(r.propertyQuota) ?? kota;
      if (satirlar.length >= satirSayisi) {
        return { satirlar, satirSayisi, kalite, kota, istek, durdu: null, eksik: false };
      }
      /*
       * BOŞ SAYFA AMA OKUNAN < BİLDİRİLEN (Ajan 4, Ö-4): GA4 son günleri hâlâ
       * işliyor ve sayfalar arasında rowCount küçülüp offset sona taşabiliyor.
       * Bunu "tamam" saymak, pencereyi silip EKSİK veriyle yazmak demekti
       * (tek iz notta "x/y satır"). Sonuç KISMİ: `durdu` dolu, `eksik` doğru;
       * çağıran yazmaz ve işi tekrar denenebilir düşürür.
       */
      if (gelen.length === 0) {
        return { satirlar, satirSayisi, kalite, kota, istek, durdu: `Analytics eksik satır döndürdü (${satirlar.length}/${satirSayisi})`, eksik: true };
      }
      const neden = devamEt(kota);
      if (neden) return { satirlar, satirSayisi, kalite, kota, istek, durdu: neden, eksik: false };
    }
    // Sayfa sınırına dayandı: yarım rapor, yazılmamalı (sessiz kesme yok).
    return { satirlar, satirSayisi, kalite, kota, istek, eksik: false, durdu: `sayfa sınırı (${GA4_EN_FAZLA_SAYFA} sayfa, ${satirlar.length}/${satirSayisi} satır)` };
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
