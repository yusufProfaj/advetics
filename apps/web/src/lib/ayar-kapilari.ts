import { sec, type Dil, type SessionResponse } from '@advetics/shared';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';
import {
  AYARLAR_SEKMELERI,
  hesaplarAdresi,
  kapi,
  type AyarlarSekmeKodu,
} from '@/lib/panel-adresleri';

/**
 * ═══ AYARLAR SEKMESİNİN KAPISI — SÖZLEŞMEDEN, ELLE DEĞİL ═══
 *
 * Sekmenin görünme kapısı `AYARLAR_SEKMELERI[].izin` ve menü süzgeci de onu
 * okuyor (`nav-sections.ts`). Sayfa kapısı ELLE yazılırsa (`hasPermission
 * (session, 'org.write')`) ikisi ayrışıyor: eski Şirketler sayfası tam olarak
 * böyleydi, menü `org.write` derken Reklam Yöneticisi workspace açabildiği
 * hâlde listeye giremiyordu (MIMARI Ç-2). Sayfa da menü de buradan okur.
 *
 * `izin: null` = herkes (Hesabım).
 */
export function ayarSekmesiAcik(session: Pick<SessionResponse, 'permissions'>, kod: AyarlarSekmeKodu): boolean {
  const izin = AYARLAR_SEKMELERI.find((s) => s.kod === kod)!.izin;
  return izin === null || session.permissions.includes(izin);
}

/**
 * "HESABI BAĞLA / ATA" BAĞLANTISI — YALNIZ HEDEFİ AÇIKSA.
 *
 * Genel Bakış ve Reklam Yöneticisi "Bağlantılara git" bağlantısını herkese
 * gösteriyordu; müşteri hesabı (client_viewer) tıklayınca 403 alıyordu
 * (MIMARI Ç-19). Hedef `hesaplarAdresi`nin kararıyla aynı: workspace
 * biliniyorsa onun Kurulum'u (kapı Marka Merkezi), bilinmiyorsa Ayarlar'daki
 * havuz (kapı Platform bağlantıları sekmesi). Kapı kapalıysa `null`: çağıran
 * bağlantı yerine "ajansınıza yazın" der, kullanıcı kapalı bir kapıya
 * gönderilmez.
 */
export function hesaplarHedefi(session: SessionResponse, musteri: string | null | undefined): string | null {
  const acik = musteri ? kapi(session, 'markaMerkezi.gor') : ayarSekmesiAcik(session, 'baglantilar');
  return acik ? hesaplarAdresi(musteri) : null;
}

/** Kapı kapalıyken bağlantının yerine yazan cümle — iki ekranda aynı, ekranın dilinde. */
export function hesapAjansta(dil: Dil): string {
  return sec(ayarlarSozlugu, dil).ortak.hesapAjansta;
}

/**
 * TÜRKÇE SABİT — Genel Bakış ve Reklam Yöneticisi sözlüğe geçene kadar
 * (D3). Yeni kod `hesapAjansta(dil)` kullanır; bu ad o iki ekran geçince silinir.
 */
export const HESAP_AJANSTA = hesapAjansta('tr');
