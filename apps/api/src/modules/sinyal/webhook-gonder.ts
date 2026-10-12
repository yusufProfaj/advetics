import { lookup as dnsLookup } from 'node:dns/promises';
import { webhookDenetle } from '@advetics/shared';
import { ozelAdres } from '../tenancy/site-oku';

/**
 * ═══ WEBHOOK GÖNDERİMİ — SUNUCUDAN DIŞARI GİDEN İSTEK (MIMARI § 8) ═══
 *
 * Adres kullanıcıdan geliyor ve paylaşımlı VPS'te bu, iç ağa ya da bulut
 * metadata ucuna (`169.254.169.254`) yapılmış bir istek olabilir.
 *
 *  1. Kayıtta `webhookDenetle` (https, beyaz liste `endsWith`, IP literali,
 *     kullanıcı bilgisi, port). GÖNDERİMDE DE yeniden: şifreli kolon bir gün
 *     başka bir yoldan yazılırsa koruma kayıt anına bağlı kalmasın.
 *  2. KORUMA ADRESTE DEĞİL ÇÖZÜLEN IP'DE: `hooks.slack.com` dahi olsa DNS
 *     çözülür ve tek bir iç ağ adresi bütün isteği reddeder.
 *  3. `redirect: 'manual'`: 3xx KALICI HATA, izlenmez. İzlenirse beyaz liste
 *     anlamsızlaşır.
 *  4. Zaman aşımı 10 sn; yanıt gövdesi en çok 4 KB (yalnız hata cümlesi
 *     için); istek gövdesi en çok 40 KB.
 *
 * Kalan risk DNS rebinding (çözme ile bağlantı arasında kaydın değişmesi);
 * logo indirme ile aynı kabul edilen kalıntı.
 */

export const WEBHOOK_ZAMAN_ASIMI_MS = 10_000;
export const WEBHOOK_YANIT_EN_COK = 4 * 1024;
export const WEBHOOK_GOVDE_EN_COK = 40 * 1024;

export interface WebhookSonucu {
  /** HTTP durumu; ağ hatası ya da istek hiç atılmadıysa `null`. */
  httpDurum: number | null;
  /** İstek hiç atılmadan reddedildiyse KALICI (yeniden denemek aynı sonucu verir). */
  reddedildi: boolean;
  /** Platformun cümlesi ya da bizim reddimizin nedeni. Başarıda `null`. */
  hata: string | null;
}

export interface WebhookBagimliliklari {
  lookup: (host: string) => Promise<Array<{ address: string; family: number }>>;
  fetch: typeof fetch;
}

const VARSAYILAN: WebhookBagimliliklari = {
  lookup: (host) => dnsLookup(host, { all: true }),
  fetch: (...a) => fetch(...a),
};

export async function webhookGonder(
  tur: 'slack' | 'teams',
  adres: string,
  govde: unknown,
  bag: WebhookBagimliliklari = VARSAYILAN,
): Promise<WebhookSonucu> {
  const ret = (hata: string): WebhookSonucu => ({ httpDurum: null, reddedildi: true, hata });

  const denetim = webhookDenetle(tur, adres);
  if (!denetim.gecerli) return ret(`Kayıtlı adres artık geçerli değil: ${denetim.neden}`);
  const url = new URL(denetim.adres);

  const metin = JSON.stringify(govde);
  if (Buffer.byteLength(metin, 'utf8') > WEBHOOK_GOVDE_EN_COK) {
    return ret('Mesaj gövdesi sınırı aştı; gönderilmedi.');
  }

  let adresler: Array<{ address: string; family: number }>;
  try {
    adresler = await bag.lookup(url.hostname);
  } catch (e) {
    // DNS geçici olarak düşebilir: kalıcı ret DEĞİL, yeniden denensin.
    return { httpDurum: null, reddedildi: false, hata: `Adres çözülemedi (${url.hostname}): ${mesaj(e)}` };
  }
  // TEK BİR İÇ AĞ ADRESİ YETİYOR: hangisine bağlanılacağını seçemiyoruz.
  if (adresler.length === 0 || adresler.some((a) => ozelAdres(a.address))) {
    return ret('Webhook adresi iç ağa işaret ediyor; istek gönderilmedi.');
  }

  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(), WEBHOOK_ZAMAN_ASIMI_MS);
  try {
    const res = await bag.fetch(url.toString(), {
      method: 'POST',
      redirect: 'manual',
      signal: kontrol.signal,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'Advetics/1.0 (+bildirim)' },
      body: metin,
    });
    if (res.status >= 300 && res.status < 400) {
      return {
        httpDurum: res.status,
        reddedildi: true,
        hata: 'Webhook yönlendirme döndürdü ve yönlendirmeler güvenlik gereği izlenmiyor. Kanal adresini yeniden kopyala.',
      };
    }
    if (res.status >= 200 && res.status < 300) return { httpDurum: res.status, reddedildi: false, hata: null };
    const govdeMetni = await yanitiOku(res);
    return { httpDurum: res.status, reddedildi: false, hata: govdeMetni || `HTTP ${res.status}` };
  } catch (e) {
    const zamanAsimi = kontrol.signal.aborted;
    return {
      httpDurum: null,
      reddedildi: false,
      hata: zamanAsimi ? `Webhook ${WEBHOOK_ZAMAN_ASIMI_MS / 1000} saniyede cevap vermedi.` : `Webhook isteği düştü: ${mesaj(e)}`,
    };
  } finally {
    clearTimeout(zamanlayici);
  }
}

/** Yanıt gövdesi SINIR OKUNURKEN: `content-length` yalan söyleyebiliyor. */
async function yanitiOku(res: Response): Promise<string> {
  if (!res.body) return '';
  const okuyucu = res.body.getReader();
  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  try {
    while (toplam < WEBHOOK_YANIT_EN_COK) {
      const { done, value } = await okuyucu.read();
      if (done || !value) break;
      parcalar.push(value);
      toplam += value.byteLength;
    }
  } finally {
    await okuyucu.cancel().catch(() => undefined);
  }
  return Buffer.concat(parcalar.map((p) => Buffer.from(p)))
    .subarray(0, WEBHOOK_YANIT_EN_COK)
    .toString('utf8')
    .trim();
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
