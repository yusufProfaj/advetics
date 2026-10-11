import { platformFetch } from '../connections/providers/http';
import type { AdsGonder } from './gtm';

/**
 * ═══ GOOGLE ADS KURULUMU — HESAP, MCC DAVETİ, DÖNÜŞÜM İŞLEMİ, FATURA ═══
 *
 * Yeni hesap YALNIZ yönetici hesap (MCC) altında açılabiliyor
 * (`createCustomerClient`); ödeme yöntemi API'den eklenemiyor (MIMARI Ç-2).
 * CANLIDA ÖLÇÜLMEDİ: ilk kullanımda Google Ads arayüzünde gözle kontrol.
 */

export type DonusumTuru = 'form' | 'telefon' | 'whatsapp';

/**
 * Tür → Google Ads kategorisi. Telefon `PHONE_CALL_LEAD`: Google aramayı
 * ancak bu kategoride dönüşüm sayıyor (docs/olcum/MIMARI.md Ç-4).
 */
export const DONUSUM_KATEGORISI: Record<DonusumTuru, string> = {
  form: 'SUBMIT_LEAD_FORM',
  telefon: 'PHONE_CALL_LEAD',
  whatsapp: 'CONTACT',
};

export const DONUSUM_ADI: Record<DonusumTuru, string> = {
  form: 'Advetics · Form',
  telefon: 'Advetics · Telefon tıklaması',
  whatsapp: 'Advetics · WhatsApp tıklaması',
};

/** Etiket parçasından `send_to`: "AW-123456789/AbC-dEf_1". Bulunamazsa null (tahmin yok). */
export function gonderAdresi(parcalar: ReadonlyArray<{ eventSnippet?: string; globalSiteTag?: string }>): AdsGonder | null {
  for (const p of parcalar) {
    const m = /AW-(\d{6,15})\/([A-Za-z0-9_-]{4,64})/.exec(p.eventSnippet ?? '');
    if (m) return { conversionId: m[1]!, conversionLabel: m[2]! };
  }
  return null;
}

export class AdsKurulumIstemcisi {
  constructor(
    private readonly token: string,
    private readonly gelistiriciToken: string,
    private readonly surum: string,
  ) {}

  private async istek<T>(yol: string, govde: unknown, yoneticiNo?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'developer-token': this.gelistiriciToken,
      'Content-Type': 'application/json',
    };
    if (yoneticiNo) headers['login-customer-id'] = yoneticiNo;
    const { data } = await platformFetch<T>('google', `https://googleads.googleapis.com/${this.surum}/${yol}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(govde),
    });
    return data;
  }

  private async ara<T>(musteriNo: string, sorgu: string, yoneticiNo?: string): Promise<T[]> {
    const r = await this.istek<{ results?: T[] }>(`customers/${musteriNo}/googleAds:search`, { query: sorgu }, yoneticiNo);
    return r.results ?? [];
  }

  /** MCC altında yeni hesap. Saat dilimi ve para birimi AÇIKÇA (sonradan değiştirilemiyor). */
  async hesapAc(mccNo: string, ad: string): Promise<string> {
    const r = await this.istek<{ resourceName?: string }>(
      `customers/${mccNo}:createCustomerClient`,
      { customerClient: { descriptiveName: ad, currencyCode: 'TRY', timeZone: 'Europe/Istanbul' } },
      mccNo,
    );
    const m = /^customers\/(\d+)$/.exec(r.resourceName ?? '');
    if (!m) throw new Error(`Google Ads yeni hesabın numarasını döndürmedi (${r.resourceName ?? 'boş'}).`);
    return m[1]!;
  }

  /** Şirketin mevcut hesabına MCC bağlantı daveti; şirket Google Ads'te kabul eder. */
  async davetEt(mccNo: string, musteriNo: string): Promise<void> {
    await this.istek(
      `customers/${mccNo}/customerClientLinks:mutate`,
      { operation: { create: { clientCustomer: `customers/${musteriNo}`, status: 'PENDING' } } },
      mccNo,
    );
  }

  /** Faturalandırma onaylı mı. Satır yoksa false (kurulmamış), okunamazsa hata fırlar. */
  async faturaOnayli(musteriNo: string, yoneticiNo?: string): Promise<boolean> {
    const r = await this.ara<{ billingSetup?: { status?: string } }>(musteriNo, 'SELECT billing_setup.status FROM billing_setup', yoneticiNo);
    return r.some((x) => x.billingSetup?.status === 'APPROVED');
  }

  /** Son 30 günde harcama var mı (canlı hesapta onaysız birincil hedef açmamak için). */
  async harcamaVar(musteriNo: string, yoneticiNo?: string): Promise<boolean> {
    const r = await this.ara<{ metrics?: { costMicros?: string | number } }>(
      musteriNo,
      'SELECT metrics.cost_micros FROM customer WHERE segments.date DURING LAST_30_DAYS',
      yoneticiNo,
    );
    return r.some((x) => Number(x.metrics?.costMicros ?? 0) > 0);
  }

  /** Hesaptaki dönüşüm işlemleri (kaldırılmamış). */
  async donusumIslemleri(
    musteriNo: string,
    yoneticiNo?: string,
  ): Promise<Array<{ resourceName: string; ad: string; kategori: string; birincil: boolean; durum: string }>> {
    const r = await this.ara<{ conversionAction?: { resourceName?: string; name?: string; category?: string; primaryForGoal?: boolean; status?: string } }>(
      musteriNo,
      "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.status != 'REMOVED'",
      yoneticiNo,
    );
    return r.map((x) => ({
      resourceName: x.conversionAction?.resourceName ?? '',
      ad: x.conversionAction?.name ?? '',
      kategori: x.conversionAction?.category ?? '',
      birincil: x.conversionAction?.primaryForGoal === true,
      durum: x.conversionAction?.status ?? '',
    }));
  }

  async donusumAc(musteriNo: string, tur: DonusumTuru, yoneticiNo?: string): Promise<string> {
    const r = await this.istek<{ results?: Array<{ resourceName?: string }> }>(
      `customers/${musteriNo}/conversionActions:mutate`,
      {
        operations: [
          {
            create: {
              name: DONUSUM_ADI[tur],
              type: 'WEBPAGE',
              category: DONUSUM_KATEGORISI[tur],
              status: 'ENABLED',
              primaryForGoal: true,
              // Tıklama başına bir: aynı kişinin iki formu iki müşteri değil.
              countingType: 'ONE_PER_CLICK',
              valueSettings: { defaultValue: 0, alwaysUseDefaultValue: true },
            },
          },
        ],
        partialFailure: false,
      },
      yoneticiNo,
    );
    const ad = r.results?.[0]?.resourceName;
    if (!ad) throw new Error('Google Ads dönüşüm işleminin adını döndürmedi.');
    return ad;
  }

  async gonderAdresiOku(musteriNo: string, kaynakAdi: string, yoneticiNo?: string): Promise<AdsGonder | null> {
    if (!/^customers\/\d+\/conversionActions\/\d+$/.test(kaynakAdi)) throw new Error(`Beklenmeyen dönüşüm kaynak adı: ${kaynakAdi}`);
    const r = await this.ara<{ conversionAction?: { tagSnippets?: Array<{ eventSnippet?: string; globalSiteTag?: string }> } }>(
      musteriNo,
      `SELECT conversion_action.tag_snippets FROM conversion_action WHERE conversion_action.resource_name = '${kaynakAdi}'`,
      yoneticiNo,
    );
    return gonderAdresi(r[0]?.conversionAction?.tagSnippets ?? []);
  }
}
