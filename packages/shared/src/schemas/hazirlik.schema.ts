/**
 * ═══ MARKA MERKEZİ: "BU WORKSPACE REKLAMA HAZIR MI?" ═══
 *
 * Bir workspace'i kurmak dokuz ayrı ekrana dağılmıştı ve hangisinin eksik
 * olduğunu söyleyen tek bir yer yoktu. Belirtisi hep aynıydı: "atadım ama
 * veri gelmiyor", "reklam oluşturamıyorum", "AI marka hakkında hiçbir şey
 * bilmiyor". Her birinin sebebi başka bir ekrandaydı.
 *
 * Liste üç hâlli ve bu KASITLI: `bilinmiyor`, "eksik" DEĞİL. Bütçeyi okuma
 * yetkisi olmayan birine "bütçe yok" demek, ona sağlam bir kurulumu bozmaya
 * gönderen yanlış bir alarm olurdu (CLAUDE.md: görünmeyen satırı "yok"
 * saymak).
 *
 * METİN SUNUCUDA, BAĞLANTI PANELDE. `aciklama` durumu anlatıyor ve veriyi
 * gören taraf onu en doğru yazabilen taraf. Hangi ekrana gidileceği ise
 * panelin rotası; API'ye rota yazmak, bir sayfa taşındığında sunucunun
 * kullanıcıyı ölü bir adrese göndermesi demek.
 */
export const HAZIRLIK_KODLARI = [
  'reklam_hesabi',
  'veri_akisi',
  'marka_bilgisi',
  'logo',
  'aylik_butce',
  'sosyal_kanal',
] as const;
export type HazirlikKodu = (typeof HAZIRLIK_KODLARI)[number];

export type HazirlikDurumu = 'tamam' | 'eksik' | 'bilinmiyor';

export interface HazirlikMaddesi {
  kod: HazirlikKodu;
  /**
   * Zorunlu maddeler eksikse workspace reklama HAZIR DEĞİL. Diğerleri
   * önerilen: eksik olmaları bir şeyi durdurmuyor, bir şeyi kötüleştiriyor
   * (AI markayı tanımıyor, harcama hızı izlenmiyor).
   */
  zorunlu: boolean;
  durum: HazirlikDurumu;
  /**
   * Tamamsa kısa özet ("2 reklam hesabı: 1 Meta Ads, 1 Google Ads"),
   * eksikse NEDEN eksik olduğu ve ne yapılacağı. Boş dize dönmüyor.
   */
  aciklama: string;
}

export interface WorkspaceHazirlik {
  clientId: string;
  clientName: string;
  maddeler: HazirlikMaddesi[];
  /** Zorunlu maddelerin hepsi `tamam`. */
  hazir: boolean;
}
