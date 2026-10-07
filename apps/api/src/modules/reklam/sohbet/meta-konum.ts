import type { HedefKonum, KonumTuru } from '@advetics/shared';
import { hataSiniflandir } from '../meta-graf';

/**
 * Meta konum araması (`/search?type=adgeolocation`) — yeni modülün kendi
 * okuması. Eski bağlantı modülü içe aktarılmıyor (modül sınırı testle
 * kilitli); istek yalnız graph.facebook.com'a gidiyor.
 *
 * ANAHTARSIZ SATIR ATILIYOR: `key` hedeflemeye giden değerin kendisi;
 * olmadan seçilen bir konum Meta'ya gönderilemez. Bilinmeyen tür de atılıyor:
 * derleyici yalnız ülke, bölge ve şehir kovalarını tanıyor.
 *
 * HTTP 200 + boş dizi "eşleşme yok" demek ve öyle döner; çağrı hatası
 * fırlatılır. İkisini aynı boş diziye çevirmek, lokasyon aramasının neden
 * boş döndüğünü teşhis edilemez yapmıştı (CLAUDE.md).
 */
const TURLER: Record<string, KonumTuru> = { country: 'country', region: 'region', city: 'city' };

export async function metaKonumAra(
  a: { apiSurumu: string; token: string; fetchFn?: typeof fetch },
  metin: string,
): Promise<HedefKonum[]> {
  const url = new URL(`https://graph.facebook.com/${a.apiSurumu}/search`);
  url.searchParams.set('type', 'adgeolocation');
  url.searchParams.set('location_types', JSON.stringify(['country', 'region', 'city']));
  url.searchParams.set('q', metin);
  url.searchParams.set('limit', '25');
  url.searchParams.set('locale', 'tr_TR');
  let res: Response;
  try {
    res = await (a.fetchFn ?? fetch)(url, { headers: { Authorization: `Bearer ${a.token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw hataSiniflandir(null, null);
  }
  const govde = (await res.json().catch(() => null)) as { data?: Array<Record<string, unknown>> } | null;
  if (!res.ok) throw hataSiniflandir(res.status, govde);
  return (govde?.data ?? []).flatMap((r): HedefKonum[] => {
    const tur = TURLER[String(r.type)];
    if (typeof r.key !== 'string' || typeof r.name !== 'string' || !tur) return [];
    const parcalar = [r.name, typeof r.region === 'string' && r.region !== r.name ? r.region : null, typeof r.country_name === 'string' ? r.country_name : null];
    return [{ tur, key: r.key, etiket: parcalar.filter(Boolean).join(', '), ulkeKodu: typeof r.country_code === 'string' ? r.country_code : null }];
  });
}
