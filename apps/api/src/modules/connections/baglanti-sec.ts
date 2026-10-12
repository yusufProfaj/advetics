import type { HesapSahibi } from '@advetics/shared';

/**
 * ═══ BİR WORKSPACE İÇİN HANGİ GOOGLE/META BAĞLANTISININ TOKEN'I ═══
 *
 * Kurulum rehberinde doğdu (`kurulum.service`) ve veri kaynakları da aynı
 * soruyu soruyor (GA4 mülkünü hangi Google kimliğiyle okuyacağız). İKİNCİ BİR
 * SEÇİCİ YAZILMADI (docs/veri-kaynagi/MIMARI.md Ç-3): iki modül farklı kural
 * izlerse rehberin kurduğu mülk, veri kaynağında başka bir kimlikle okunmaya
 * çalışılır ve "erişim yok" der, sebebi hiçbir ekranda görünmez.
 *
 * Kural: atanmış hesap varsa ONUN bağlantısı (hesaba erişebildiği kesin);
 * yoksa hesap sahibi kararına göre: şirket → workspace'in kendi bağlantısı,
 * ajans → havuz. Diğerine düşmek kararı sessizce bozardı, o yüzden yalnız
 * karar verilmemişse ikisinden biri.
 */
export interface SecilebilirBaglanti {
  id: string;
  platform: 'meta' | 'google';
  clientId: string | null;
  orgId: string;
  scopes: string[];
}

export interface BaglantiSecimGirdisi<B extends SecilebilirBaglanti = SecilebilirBaglanti> {
  /** Workspace'e atanmış hesabın bağlantısı (platform başına ilk hesap). */
  meta: { connectionId: string } | null;
  google: { connectionId: string } | null;
  baglantilar: B[];
  sahip: HesapSahibi | null;
  orgId: string;
  ajansOrgId: string | null;
}

export function baglantiSec<B extends SecilebilirBaglanti>(b: BaglantiSecimGirdisi<B>, platform: 'meta' | 'google'): B | null {
  const hesap = platform === 'meta' ? b.meta : b.google;
  const adaylar = b.baglantilar.filter((x) => x.platform === platform);
  if (hesap) {
    const h = adaylar.find((x) => x.id === hesap.connectionId);
    if (h) return h;
  }
  /*
   * İKİ HAVUZ, İKİSİ DE `client_id IS NULL` (Ajan 4, Ö6): ajansın havuzu
   * ajans şirketinde, şirketin kendi havuzu kendi şirketinde. Ayırmadan
   * "en eski NULL bağlantı" almak, ajans kararıyla şirketin kendi Meta'sında
   * hesap açmak demekti. Ajans bilinmiyorsa (üst hesap yok) havuz şirketin.
   */
  const ajansOrg = b.ajansOrgId ?? b.orgId;
  const ajansHavuzu = adaylar.find((x) => x.clientId === null && x.orgId === ajansOrg) ?? null;
  const sirketin =
    adaylar.find((x) => x.clientId !== null) ?? adaylar.find((x) => x.clientId === null && x.orgId === b.orgId && b.orgId !== ajansOrg) ?? null;
  if (b.sahip === 'sirket') return sirketin;
  if (b.sahip === 'ajans') return ajansHavuzu;
  return sirketin ?? ajansHavuzu;
}
