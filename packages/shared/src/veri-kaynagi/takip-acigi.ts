import type { Platform } from '../constants/platforms';
import type { EslenemediNedeni } from './esleme';

/**
 * ═══ TAKİP AÇIĞI — "PLATFORM X DÖNÜŞÜM DİYOR, SİTE Y GÖRDÜ" ═══
 *
 * İki sayı ASLA aynı olmaz ve bu bir hata değil: Meta görüntüleme sonrası
 * dönüşümü ve modellenmiş dönüşümü sayıyor, GA4 oturumun kaynağına yazıyor,
 * pencereler farklı. Bu yüzden fark yüzdesi tek başına bir uyarı DEĞİL;
 * etiket yalnız fark BÜYÜKSE ve hacim YETERLİYSE basılır. Küçük hacimde
 * "%300 fark" 1'e karşı 4 demek ve her gün yanlış alarm üretir.
 *
 * İki yön, iki ayrı iş:
 *  - `platform_fazla`: platform sitenin görmediği dönüşüm sayıyor. Sebep
 *    çoğu zaman sitede GA4 etiketi ya da anahtar etkinlik eksikliği, ya da
 *    utm etiketinin düşmesi (yönlendirme). Kullanıcıya: "siteniz bu
 *    kampanyadan geleni görmüyor".
 *  - `site_fazla`: site dönüşümü görüyor, platform saymıyor. Sebep pikselin/
 *    dönüşüm işleminin eksikliği: platform algoritması iyi trafiği
 *    öğrenemiyor (reklam verimliliğine doğrudan zarar).
 *
 * SAYILAR ÖLÇÜLECEK (Ajan 5): ilk değerler başlangıç; canlı veriyle
 * ayarlanınca ölçüm BURAYA yazılır.
 */
export const TAKIP_ACIGI = {
  /** site/platform oranı bu aralıktaysa uyumlu. */
  uyumluAlt: 0.6,
  uyumluUst: 1.5,
  /** İki taraftan büyüğü bundan azsa karar verilmez. */
  enAzDonusum: 10,
  /** Platformda bu kadar tıklama yoksa site tarafı anlamsız. */
  enAzTiklama: 100,
  /** GA4 verisi işlenmesini bitirmeden kıyas yapılmaz (son N gün dışarıda). */
  isleniyorGun: 2,
} as const;

export const TAKIP_ETIKETLERI = ['uyumlu', 'platform_fazla', 'site_fazla', 'site_hic_gormuyor', 'veri_yetersiz'] as const;
export type TakipEtiketi = (typeof TAKIP_ETIKETLERI)[number];

export const TAKIP_ETIKET_METNI: Record<TakipEtiketi, string> = {
  uyumlu: 'Uyumlu',
  platform_fazla: 'Site daha az görüyor',
  site_fazla: 'Platform daha az sayıyor',
  site_hic_gormuyor: 'Site hiç görmüyor',
  veri_yetersiz: 'Veri yetersiz',
};

export interface TakipGirdisi {
  platformDonusum: number;
  siteDonusum: number;
  platformTiklama: number;
}

export interface TakipSonucu {
  etiket: TakipEtiketi;
  /** site / platform; platform 0 ise null. */
  oran: number | null;
}

export function takipAcigi(g: TakipGirdisi): TakipSonucu {
  const oran = g.platformDonusum > 0 ? g.siteDonusum / g.platformDonusum : null;
  if (g.platformTiklama < TAKIP_ACIGI.enAzTiklama || Math.max(g.platformDonusum, g.siteDonusum) < TAKIP_ACIGI.enAzDonusum) {
    return { etiket: 'veri_yetersiz', oran };
  }
  // Ayrı etiket: "az görüyor" ile "hiç görmüyor" farklı iş. Hiç görmüyorsa
  // büyük ihtimalle anahtar etkinlik tanımlı değil ya da etiket kırık.
  if (g.siteDonusum === 0) return { etiket: 'site_hic_gormuyor', oran: 0 };
  if (oran === null) return { etiket: 'site_fazla', oran: null };
  if (oran < TAKIP_ACIGI.uyumluAlt) return { etiket: 'platform_fazla', oran };
  if (oran > TAKIP_ACIGI.uyumluUst) return { etiket: 'site_fazla', oran };
  return { etiket: 'uyumlu', oran };
}

/**
 * Eşlenemeyen pay — sessiz kesme yok. Ekran her zaman "site dönüşümlerinin
 * %N'i bir kampanyaya bağlanamadı" yazar ve nedenleri sayar. Payda ÜCRETLİ
 * trafik: organik oturumu paydaya koymak her workspace'te %90 "eşlenemedi"
 * yazdırır ve gerçek sorun (utm eksik) okunmaz olur.
 */
export function eslenemeyenPay(
  satirlar: ReadonlyArray<{ eslendi: boolean; ucretli: boolean; anahtarEtkinlik: number }>,
): { pay: number | null; eslenemeyen: number; ucretliToplam: number } {
  let toplam = 0;
  let eslenemeyen = 0;
  for (const s of satirlar) {
    if (!s.ucretli) continue;
    toplam += s.anahtarEtkinlik;
    if (!s.eslendi) eslenemeyen += s.anahtarEtkinlik;
  }
  return { pay: toplam > 0 ? eslenemeyen / toplam : null, eslenemeyen, ucretliToplam: toplam };
}

export interface TakipAcigiSatiri {
  platform: Platform;
  kampanyaId: string;
  kampanyaAdi: string;
  platformDonusum: number;
  siteDonusum: number;
  platformTiklama: number;
  siteOturum: number;
  etiket: TakipEtiketi;
  oran: number | null;
}

export interface TakipAcigiYaniti {
  donem: { from: string; to: string };
  /** Son `TAKIP_ACIGI.isleniyorGun` gün dışarıda bırakıldıysa gerçek bitiş. */
  kiyasBitis: string;
  /** Kaynak bağlı değilse, izin yoksa vb. — boş listenin NEDENİ (emptyReason deseni). */
  emptyReason: 'kaynak_yok' | 'izin_eksik' | 'cekim_kosmadi' | 'veri_yok' | null;
  satirlar: TakipAcigiSatiri[];
  /** Kesme yok: kaç satır döndü, toplam kaç. */
  toplamSatir: number;
  eslenemeyen: {
    pay: number | null;
    anahtarEtkinlik: number;
    nedenler: Partial<Record<EslenemediNedeni, number>>;
  };
  /** Saat dilimi ya da para birimi farkı gibi kıyası zayıflatan durumlar, cümleyle. */
  uyarilar: string[];
  /** GA4 yanıt kalitesi (eşikleme, (other), örnekleme) dönem boyunca görüldü mü. */
  kalite: { digerSatiri: boolean; esiklendi: boolean; ornekleme: boolean };
}
