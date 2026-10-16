import { sec, type Dil, type KurulumBeyani } from '@advetics/shared';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { ApiRequestError } from '@/lib/api';
import { beyanDizisi } from '@/components/kurulum/sihirbaz-akisi';

/**
 * ═══ KURULUM BEYANLARINI OKUMAK — TEK YOL (docs/kurulum-sihirbazi/MIMARI.md § 7) ═══
 *
 * Sayaç beyanları okumazsa "adresimiz yok" denmiş bir workspace sonsuza kadar
 * "eksik" der; OKUNAMAYAN beyanı "yok" saymak da aynı yanlış alarmı üretir.
 * Bu yüzden İKİ HÂL: dizi (okundu) ve hata (okunamadı → sözleşmede `null`).
 *
 * TEK BİÇİM: ayrı uç `GET /clients/:id/kurulum/beyanlar`, yanıt DİZİ (Ajan 2'nin
 * seçimi, entegrasyon 2026-10-13). Bir süre `/kurulum` yanıtında alan da
 * aranıyordu ve AdvCampaign iki biçimi sırayla deniyordu: iki okuma yolu
 * birinin hatasını öbürünün "beyan yok"una çevirebiliyordu.
 *
 * Marka Merkezi, sihirbaz, Genel Bakış şeridi ve AdvCampaign AYNI fonksiyonu
 * çağırıyor: her biri kendi okumasını yazsaydı biri okunamayan beyanı "yok"
 * sayınca sayaçlar ayrışırdı (`siteYokMu` ile aynı gerekçe).
 */
export type BeyanOkumasi = { ok: true; v: KurulumBeyani[] } | { ok: false; hata: string };

export function beyanlarYolu(clientId: string): string {
  return `/clients/${encodeURIComponent(clientId)}/kurulum/beyanlar`;
}

export async function beyanlariOku(getir: <T>(yol: string) => Promise<T>, clientId: string, dil: Dil = 'tr'): Promise<BeyanOkumasi> {
  const d = sec(markaMerkeziKurulumSozlugu, dil);
  try {
    const dizi = beyanDizisi(await getir<unknown>(beyanlarYolu(clientId)));
    /*
     * BOŞ GÖVDE = BEYAN YOK değil, BİÇİM BİLİNMİYOR. Uç dizi döndürmezse
     * okunamadı sayılır; `[]` sanmak verilmiş bir kararı "eksik" gösterirdi.
     */
    return dizi ? { ok: true, v: dizi } : { ok: false, hata: d.beyanBicim };
  } catch (e) {
    return { ok: false, hata: e instanceof ApiRequestError ? e.message : d.beyanOkunamadi };
  }
}

/** Sözleşmenin girdisi: okunamadıysa `null` (beyanlı bitmemiş parça "bilinmiyor"). */
export function beyanGirdisi(b: BeyanOkumasi): KurulumBeyani[] | null {
  return b.ok ? b.v : null;
}
