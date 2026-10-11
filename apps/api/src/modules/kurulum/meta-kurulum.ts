import { parseMetaRateLimit, platformFetch } from '../connections/providers/http';

/**
 * ═══ META KURULUMU — BUSINESS MANAGER, REKLAM HESABI, PİKSEL, ÖDEME ═══
 *
 * Reklam hesabı Business Manager altında açılıyor (`/{bm}/adaccount`);
 * ödeme yöntemi API'den eklenemiyor (MIMARI Ç-2). Sayfa API ile AÇILAMIYOR.
 * CANLIDA ÖLÇÜLMEDİ: hesap açma, uygulamanın Business Management erişim
 * düzeyine bağlı; ilk denemede Meta'nın mesajı adımda görünür.
 */

export const ISTANBUL = 'Europe/Istanbul';

/**
 * SAAT DİLİMİ KİMLİĞİ TAHMİN EDİLMEZ. Meta sayısal `timezone_id` istiyor ve
 * tablosu belgede sabit değil; yanlış kimlik hesabı başka saate kurar ve
 * SONRADAN DEĞİŞTİRİLEMEZ. Aynı BM'de İstanbul saatli bir hesabın kimliği
 * okunur; yoksa null ve adım nedeniyle durur.
 */
export function istanbulSaatKimligi(hesaplar: ReadonlyArray<{ timezone_id?: number | string; timezone_name?: string }>): number | null {
  const h = hesaplar.find((x) => x.timezone_name === ISTANBUL && x.timezone_id !== undefined);
  const n = h ? Number(h.timezone_id) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** `funding_source_details` dolu ve hesap aktifse ödeme hazır. */
export function odemeHazirMi(h: { account_status?: number; funding_source_details?: unknown }): { hazir: boolean; neden: string } {
  if (h.account_status !== undefined && h.account_status !== 1) {
    return { hazir: false, neden: `Hesap aktif değil (Meta durum kodu ${h.account_status}); ödeme ya da inceleme sorunu var.` };
  }
  const f = h.funding_source_details;
  const dolu = f !== undefined && f !== null && typeof f === 'object' && Object.keys(f as object).length > 0;
  return dolu ? { hazir: true, neden: 'Ödeme yöntemi tanımlı.' } : { hazir: false, neden: 'Hesapta ödeme yöntemi yok; Meta Faturalandırma sayfasından ekle.' };
}

export class MetaKurulumIstemcisi {
  constructor(
    private readonly token: string,
    private readonly surum: string,
  ) {}

  private get graph(): string {
    return `https://graph.facebook.com/${this.surum}`;
  }

  private async al<T>(yol: string): Promise<T> {
    const { data } = await platformFetch<T>('meta', `${this.graph}/${yol}`, { headers: { Authorization: `Bearer ${this.token}` } }, parseMetaRateLimit);
    return data;
  }

  private async gonder<T>(yol: string, alanlar: Record<string, string>): Promise<T> {
    const { data } = await platformFetch<T>(
      'meta',
      `${this.graph}/${yol}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(alanlar).toString(),
      },
      parseMetaRateLimit,
    );
    return data;
  }

  /** Sayfalı okuma: ilk 100'de kesmek sessiz kesme olurdu. En çok 10 sayfa. */
  private async hepsi<T>(yol: string): Promise<T[]> {
    const sonuc: T[] = [];
    let r = await this.al<{ data?: T[]; paging?: { next?: string } }>(yol);
    for (let i = 0; i < 10; i++) {
      sonuc.push(...(r.data ?? []));
      const sonraki = r.paging?.next;
      if (!sonraki || !sonraki.startsWith(this.graph)) break;
      r = await this.al<{ data?: T[]; paging?: { next?: string } }>(sonraki.slice(this.graph.length + 1));
    }
    return sonuc;
  }

  async isletmeler(): Promise<Array<{ id: string; ad: string }>> {
    const r = await this.hepsi<{ id: string; name: string }>('me/businesses?fields=id,name&limit=100');
    return r.map((b) => ({ id: b.id, ad: b.name }));
  }

  async saatKimligi(isletmeId: string): Promise<number | null> {
    const r = await this.hepsi<{ timezone_id?: number; timezone_name?: string }>(`${isletmeId}/owned_ad_accounts?fields=timezone_id,timezone_name&limit=100`);
    return istanbulSaatKimligi(r);
  }

  /**
   * `end_advertiser` bir SAYFA ya da uygulama kimliği istiyor (ya da NONE) ve
   * SONRADAN DEĞİŞTİRİLEMİYOR. BM kimliği göndermek yanlış tür; ajans yolunda
   * ajansı son reklamveren yazardı (Ajan 4, Ö9). Workspace'in sayfası varsa o.
   */
  async hesapAc(isletmeId: string, ad: string, saatKimligi: number, sayfaKimligi: string | null): Promise<string> {
    const r = await this.gonder<{ id?: string; account_id?: string }>(`${isletmeId}/adaccount`, {
      name: ad,
      currency: 'TRY',
      timezone_id: String(saatKimligi),
      end_advertiser: sayfaKimligi && /^\d{5,30}$/.test(sayfaKimligi) ? sayfaKimligi : 'NONE',
      media_agency: 'NONE',
      partner: 'NONE',
    });
    const id = r.id ?? (r.account_id ? `act_${r.account_id}` : null);
    if (!id || !/^act_\d+$/.test(id)) throw new Error('Meta yeni reklam hesabının kimliğini döndürmedi.');
    return id;
  }

  async pikselAc(hesapYolu: string, ad: string): Promise<string> {
    if (!/^act_\d+$/.test(hesapYolu)) throw new Error('Reklam hesabı act_ önekli olmalı');
    const r = await this.gonder<{ id?: string }>(`${hesapYolu}/adspixels`, { name: ad });
    if (!r.id) throw new Error('Meta yeni pikselin kimliğini döndürmedi.');
    return r.id;
  }

  async odemeDurumu(hesapYolu: string): Promise<{ hazir: boolean; neden: string }> {
    if (!/^act_\d+$/.test(hesapYolu)) throw new Error('Reklam hesabı act_ önekli olmalı');
    const r = await this.al<{ account_status?: number; funding_source_details?: unknown }>(`${hesapYolu}?fields=account_status,funding_source_details`);
    return odemeHazirMi(r);
  }
}
