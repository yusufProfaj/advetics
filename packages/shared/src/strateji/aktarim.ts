import type { Permission } from '../auth/roles';
import { DERLENEN_NIYETLER } from '../reklam/meta/derle';
import { NIYET_KATALOGU, type NiyetKodu } from '../reklam/meta/niyetler';
import { tutarGoster } from '../reklam/para';
import { HUNI_ETIKETLERI, type AktarimAtlamaNedeni, type HuniKatmani, type StratejiPlatformu } from './plan';

/**
 * ═══ AKTARIM — ONAYLI PLAN → ADVCAMPAIGN (ikinci tur, 2026-10-08) ═══
 *
 * Ç-2 kararı: plan platforma YAZMAZ. Her aktarılabilir matris satırı için
 * AdvCampaign'de bir oturum açılır ve oturum HAZIR DOLDURULMUŞ gelir:
 * `adv_oturum.hazir_istem` (giriş kutusundaki metin) + `hazir_medyalar`
 * (Base varlık kimlikleri; AdvCampaign'in mesaj ucu medyayı zaten
 * `varlikId` ile alıyor).
 *
 * NEDEN "KULLANICI MESAJI YAZMAK" DEĞİL: sohbet döngüsü mesajları modelin
 * kendi biçiminde ve sırasıyla saklıyor (düşünce imzaları dahil). Dışarıdan
 * elle bir `kullanici` satırı eklemek, cevabı olmayan bir tur bırakır ve
 * döngünün varsayımını bozar. Hazır metin ise kullanıcı GÖNDERİNCE normal
 * yoldan geçiyor: kullanıcı ne gönderdiğini görüyor ve düzeltebiliyor.
 *
 * TEKRAR AKTARIMDA İKİNCİ OTURUM AÇILMAZ: `adv_oturum.strateji_matris_id`
 * tekil; yarıda düşen bir aktarım yeniden denenince yalnız eksikler açılır.
 *
 * İZİN İKİ ANAHTAR: planı aktarmak (`strategy.write`) VE reklam kurmak
 * (`bulk.write`, AdvCampaign'in kendi kapısı). Yalnız birincisiyle aktarım,
 * kullanıcının açamayacağı oturumlar üretirdi.
 */
/**
 * ═══ V1 AKTARIMI KAPALI (2026-10-13, kullanıcı onayı) ═══
 *
 * Aktarım `adv_oturum`a (AdvCampaign SOHBETİ) yazıyordu; sohbet 2026-10-10'da
 * kaldırıldı ve o satırları okuyan ekran YOK. Kullanıcı "Aktar"a basıyor,
 * ekran "aktarıldı" diyor, plan geri dönüşsüz `aktarildi` oluyor ve
 * AdvCampaign'de tek taslak açılmıyordu — hata yok, log yok
 * (docs/advstrategy/YENIDEN-TASARIM.md § 1.1).
 *
 * Yeni aktarım (kalem → rehber taslağı) yazılana kadar KAPALI: sunucu
 * reddeder ve `yapilabilir` listesine `aktar` girmez, yani düğme hiç
 * çizilmez. Sabit tek yerde: servis, panel ve testler onu okur; ikisi ayrı
 * kapansaydı biri açık kalırdı.
 */
export const V1_AKTARIM_ACIK = false as boolean;

export const V1_AKTARIM_KAPALI_SEBEBI =
  'AdvCampaign’e aktarım yeniden yazılıyor: eski aktarım kaldırılmış sohbet ekranına gidiyor ve AdvCampaign’de taslak açmıyordu. Onaylı plan olduğu gibi korunur; yeni aktarım gelince buradan yapılacak.';

/**
 * Daha önce `aktarildi` olmuş planın kutusu. Eski kutu "AdvCampaign oturumu"
 * bağlantıları gösteriyordu; o bağlantılar rehber listesine düşüyor ve
 * hiçbir şey açmıyor. Gerçeği söylemek zorunda: taslak YOK.
 */
export const V1_ESKI_AKTARIM_NOTU =
  'Bu plan eski AdvCampaign sohbetine aktarılmıştı. O ekran 10 Ekim 2026’da kaldırıldı; AdvCampaign’de bu plandan açılmış bir taslak yok. Reklamlar AdvCampaign’de yeni reklam olarak kurulmalı.';

export const AKTARIM_IZINLERI: readonly Permission[] = ['strategy.write', 'bulk.write'];

/**
 * AdvCampaign Google'da bugün KAPALI (K-02: Google yazma kapısı). Liste
 * buradan okunur; Google açıldığında tek satır değişir ve aktarım o satırları
 * kendiliğinden almaya başlar.
 */
export const AKTARILABILIR_PLATFORMLAR: readonly StratejiPlatformu[] = ['meta'];

export interface AktarimSatiriGirdisi {
  platform: StratejiPlatformu;
  katman: HuniKatmani;
  niyet: NiyetKodu;
  /** Kitle şablonunun ADI; silinmişse `null`. */
  kitleAdi: string | null;
  /** Varlık kimlikleri, YALNIZ hâlâ var olanlar (silinenler çağıranda ayıklanır). */
  varlikIdleri: readonly string[];
  /** Plan sırasında var olan varlık sayısı; ayıklanan varsa fark ondan anlaşılır. */
  planlananVarlikSayisi: number;
  tutarMicros: bigint;
  paraBirimi: string;
  donem: string;
  not: string | null;
}

/**
 * Satır aktarılabilir mi — SAF KARAR, servis ve panel aynısını koşar
 * (panel "N satır aktarılacak, M atlanacak"ı önceden gösterir).
 */
export function aktarimEngeli(s: AktarimSatiriGirdisi): AktarimAtlamaNedeni | null {
  if (!AKTARILABILIR_PLATFORMLAR.includes(s.platform)) return 'platform_kapali';
  if (!(DERLENEN_NIYETLER as readonly string[]).includes(s.niyet)) return 'niyet_desteklenmiyor';
  // Meta'da kitle zorunlu; silinmişse oturum kitlesiz kurulamaz.
  if (s.kitleAdi === null) return 'kaynak_silinmis';
  // Görsellerin bir kısmı silindiyse satır yine de aktarılabilirdi, ama
  // müşterinin onayladığı kreatif seti eksik giderdi: sessizce eksiltmek
  // yerine atla ve nedenini söyle.
  if (s.varlikIdleri.length < s.planlananVarlikSayisi) return 'kaynak_silinmis';
  if (s.tutarMicros <= 0n) return 'butce_sifir';
  return null;
}

/**
 * Hazır metin. AdvCampaign'in modeli bu metni İLK kullanıcı mesajı olarak
 * okur; bütçe "aylık" diye yazılır ve model onu günlük bütçeye kendi
 * çevirir (AdvCampaign'in bütçe kuralı tek yerde kalsın). Metin uydurma
 * içermez: yalnız plandaki alanlar.
 */
export function aktarimIstemi(s: AktarimSatiriGirdisi): string {
  const satirlar = [
    `${s.donem} medya planından: ${NIYET_KATALOGU[s.niyet].ekranAdi}.`,
    `Kitle: ${s.kitleAdi ?? 'yok'} (${HUNI_ETIKETLERI[s.katman].toLocaleLowerCase('tr-TR')}).`,
    `Bu ay için bütçe: ${tutarGoster(s.tutarMicros, s.paraBirimi)}.`,
    s.varlikIdleri.length > 0 ? `Ekteki ${s.varlikIdleri.length} görseli kullan.` : 'Görsel eklenmedi.',
  ];
  if (s.not) satirlar.push(`Not: ${s.not}`);
  return satirlar.join('\n');
}
