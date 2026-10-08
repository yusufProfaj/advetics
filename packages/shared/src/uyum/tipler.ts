import type { OzelKategori } from '../reklam/meta/hedefleme';
import type { NiyetKodu } from '../reklam/meta/niyetler';
import type { UyumBulgusu, UyumSeviyesi } from '../pilot/uyum';

/**
 * ═══ UYUM KATALOĞUNUN TİPLERİ (TASARIM.md §10.1.2–10.1.3, S-5) ═══
 *
 * Bulgu ve denetim tipleri SÖZLEŞMEDE (`pilot/uyum.ts`), burada değil:
 * plan onayı onları okuyor ve iki ayrı bulgu tipi, panelin gösterdiği ile
 * sunucunun kapattığı şeyin ayrışması demek olurdu. Bu dosya yalnız
 * KATALOĞUN kendi şeklini (kural, profil, girdi) taşıyor.
 */

/** Paket = bir sektör ya da konunun kural kümesi (ana-spek §2.7). */
export const UYUM_PAKETLERI = ['GENEL', 'FORM_KVKK', 'KONUT', 'FINANS', 'ETICARET', 'YEREL_HIZMET', 'SAGLIK'] as const;
export type UyumPaketi = (typeof UYUM_PAKETLERI)[number];

/** Kapalı sektör sözlüğü (ana-spek §2.6). Çoklu seçim. */
export const UYUM_SEKTORLERI = [
  'KONUT_GELISTIRICI',
  'EMLAK_ARACI',
  'SAGLIK_KURULUSU',
  'SAGLIK_MESLEK_MENSUBU',
  'SAGLIK_TURIZMI',
  'OTEL_KONAKLAMA',
  'KISA_SURELI_KIRALIK',
  'SEYAHAT_ACENTASI',
  'ETICARET',
  'B2B_URETICI',
  'YEREL_HIZMET',
  'EGITIM_MEB',
  'EGITIM_DIGER',
  'DIGER',
] as const;
export type UyumSektoru = (typeof UYUM_SEKTORLERI)[number];

/**
 * Denetlenen metin parçası. `uretici` AYRI taşınıyor çünkü bazı kurallar
 * yapay zekâ ürettiğinde sertleşiyor (`aiUretimindeSeviye`): insanın
 * yazdığı "Borçların mı var?" UYARI, modelin yazdığı ENGEL (R6-O-52).
 */
export interface UyumMetni {
  alan: 'ad' | 'kitle' | 'kelime' | 'baslik' | 'metin' | 'ozet' | 'adres';
  metin: string;
  uretici: 'kullanici' | 'ai' | 'sistem';
}

export interface UyumSatiri {
  /** Plan satırı anahtarı; bulgunun `yer`i olur. */
  yer: string;
  platform: 'meta' | 'google';
  niyet: NiyetKodu | null;
  /** Meta satırında kitle şablonunun yaş/cinsiyet/özel kitle bilgisi; okunamadıysa `null`. */
  kitle: { yasMin: number; yasMax: number; cinsiyet: string; ozelKitleVar: boolean } | null;
  metinler: UyumMetni[];
}

/**
 * Denetçinin girdisi. İki an var: `plan` (onay öncesi) ve `taslak`
 * (kurulum öncesi). Aynı kurallar ikisinde de koşar (TASARIM §10.2 "üç an").
 * 2026-10-08'den (karar (a)) beri reklam metni PLANDA yazılıyor, yani metne
 * bakan kurallar plan anında da metni görür; taslak anı aynı metni (onaylı
 * satırdan kopya) bir kez daha denetler.
 */
export interface UyumGirdisi {
  an: 'plan' | 'taslak';
  /** `YYYY-MM-DD`, çağıran verir (yürürlük karşılaştırması testte sabitlensin). */
  bugun: string;
  /** Denetlenen içeriğin özeti: onay kapısı denetimin BU sürüme ait olduğunu bununla anlar. */
  icerikOzeti: string;
  satirlar: UyumSatiri[];
  /** Plan seviyesindeki metinler (yapay zekâ gerekçe paragrafı). */
  planMetinleri: UyumMetni[];
}

/**
 * Workspace'in uyum profili. `null` = BEYAN YOK. "Boş" ile "yok" ayrı:
 * özel kategoride `[]` "Hayır, hiçbiri" demek, `null` "soru hiç sorulmadı"
 * (B-13). İkisini aynı boş diziye çevirmek beyansız konut reklamı üretir.
 *
 * Bugün şemada KARŞILIĞI OLMAYAN alanlar (`kvkkAydinlatmaAdresi`,
 * `konutSatisYapan`, `cerezRizasiBeyani`) çağıran tarafından `null`
 * verilir ve ilgili kural `bilinmiyor` döner: kanıtı olmayan kural "geçti"
 * sayılmaz (§10.1.1).
 */
export interface UyumProfili {
  /** Serbest metin Marka Merkezi sektöründen `sektorCoz` ile; boşsa `null`. */
  sektorler: UyumSektoru[] | null;
  /** Ham beyan (eşleme sözlüğünün kaçırdığını görmek için medikal sözlük de buna bakar). */
  sektorMetni: string | null;
  ozelKategoriler: OzelKategori[] | null;
  yasalUyari: string | null;
  kvkkAydinlatmaAdresi: string | null;
  konutSatisYapan: 'gelistirici' | 'araci' | null;
  cerezRizasiBeyani: boolean | null;
}

export interface KuralSonucu {
  yer: string;
  durum: 'kaldi' | 'bilinmiyor';
  /** Mesajın sonuna eklenen somut ayrıntı ("'kiralık daire' geçiyor"). */
  ek?: string;
  /** İhlali yapay zekânın yazdığı metin mi üretti (`aiUretimindeSeviye`). */
  ai?: boolean;
}

export interface UyumKurali {
  /** `KNT-02` biçimi; bir kez verilir, YENİDEN KULLANILMAZ (işaretler kimliğe bağlı). */
  kimlik: string;
  paket: UyumPaketi;
  seviye: UyumSeviyesi;
  mesaj: string;
  neYapmali: string;
  kimCozer: UyumBulgusu['kimCozer'];
  dayanak: { metin: string; madde: string; tarih: string };
  /** `YYYY-MM-DD`; gelecekteyse kural o güne kadar BİLGİ olarak görünür. */
  yururlukTarihi: string;
  /** Kuralın kaynağına en son bakıldığı gün. */
  sonKontrol: string;
  hukukGorusu: 'gerekli' | 'alindi' | 'gerekmez';
  aiUretimindeSeviye?: 'ENGEL';
  denetle(g: UyumGirdisi, p: UyumProfili): KuralSonucu[];
}
