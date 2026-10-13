import type { KurulumBeyani } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import { yanittakiBeyanlar } from '@/components/kurulum/sihirbaz-akisi';

/**
 * ═══ KURULUM BEYANLARINI OKUMAK — TEK YOL (docs/kurulum-sihirbazi/MIMARI.md § 7) ═══
 *
 * Sayaç beyanları okumazsa "adresimiz yok" denmiş bir workspace sonsuza kadar
 * "eksik" der; OKUNAMAYAN beyanı "yok" saymak da aynı yanlış alarmı üretir.
 * Bu yüzden ÜÇ HÂL: dizi (okundu), hata (okunamadı → sözleşmede `null`), ve
 * bu fonksiyonun hiç çağrılmaması (`undefined`, geçiş — artık çağıran yok).
 *
 * Marka Merkezi sayfası, sihirbaz ve AdvCampaign AYNI fonksiyonu çağırıyor:
 * her biri kendi okumasını yazsaydı biri okunamayan beyanı "yok" sayınca
 * sayaçlar ayrışırdı (`siteYokMu` ile aynı gerekçe).
 *
 * İKİ BİÇİM: Ajan 2 beyanları ya `/kurulum` yanıtına alan olarak ya da ayrı
 * uçta (`/clients/:id/kurulum/beyanlar`) veriyor (MIMARI § 7 "biri"). Alan
 * varsa ikinci istek atılmaz.
 */
export type BeyanOkumasi = { ok: true; v: KurulumBeyani[] } | { ok: false; hata: string };

export async function beyanlariOku(
  getir: <T>(yol: string) => Promise<T>,
  clientId: string,
  /** Aynı istekte okunmuş `/kurulum` yanıtı; okunamadıysa `null`. */
  kurulum: unknown,
): Promise<BeyanOkumasi> {
  const yanitta = yanittakiBeyanlar(kurulum);
  if (yanitta) return { ok: true, v: yanitta };
  try {
    const v = await getir<unknown>(`/clients/${encodeURIComponent(clientId)}/kurulum/beyanlar`);
    /*
     * BOŞ GÖVDE = BEYAN YOK değil, BİÇİM BİLİNMİYOR. Uç dizi döndürmezse
     * okunamadı sayılır; `[]` sanmak verilmiş bir kararı "eksik" gösterirdi.
     */
    const dizi = yanittakiBeyanlar({ beyanlar: Array.isArray(v) ? v : (v as { beyanlar?: unknown } | null)?.beyanlar });
    return dizi ? { ok: true, v: dizi } : { ok: false, hata: 'Kurulum beyanları beklenmeyen biçimde geldi.' };
  } catch (e) {
    return { ok: false, hata: e instanceof ApiRequestError ? e.message : 'Kurulum beyanları okunamadı.' };
  }
}

/**
 * `/kurulum` yanıtı ELDE YOKKEN (AdvCampaign): önce ayrı uç, düşerse
 * `/kurulum` yanıtındaki alan. Ajan 2 hangi biçimi seçerse seçsin kapı
 * çalışsın: yalnız birini denemek, öbür biçimde kapıyı SESSİZCE açık
 * bırakırdı (okunamayan beyan hiçbir amacı kapatmıyor).
 */
export async function beyanlariOkuKurulumsuz(getir: <T>(yol: string) => Promise<T>, clientId: string): Promise<BeyanOkumasi> {
  const ayri = await beyanlariOku(getir, clientId, null);
  if (ayri.ok) return ayri;
  try {
    const k = await getir<unknown>(`/clients/${encodeURIComponent(clientId)}/kurulum`);
    const v = yanittakiBeyanlar(k);
    return v ? { ok: true, v } : ayri;
  } catch {
    // İkinci deneme de düştü: İLK hatanın cümlesi kalır (asıl uç o).
    return ayri;
  }
}

/** Sözleşmenin girdisi: okunamadıysa `null` (beyanlı bitmemiş parça "bilinmiyor"). */
export function beyanGirdisi(b: BeyanOkumasi): KurulumBeyani[] | null {
  return b.ok ? b.v : null;
}
