import type { SessionResponse } from '@advetics/shared';
import { kapi } from '@/lib/panel-adresleri';
import type { AdimYetkileri } from '@/components/marka-merkezi/adim-icerigi';

/**
 * Kurulum adımlarının kapıları — Marka Merkezi › Kurulum ve sihirbaz AYNI
 * fonksiyondan. İki sayfa ayrı ayrı `kapi(...)` dizseydi biri yeni bir kapıyı
 * (beyan) unuttuğunda aynı düğme bir ekranda görünüp diğerinde kaybolurdu.
 * Kapılar `PANEL_KAPILARI` aynası; elle `hasPermission` yok (MIMARI § 8).
 */
export function adimYetkileri(session: SessionResponse): AdimYetkileri {
  return {
    yazabilir: kapi(session, 'kurulum.yaz'),
    hesapYazabilir: kapi(session, 'kurulum.hesap'),
    beyanYazabilir: kapi(session, 'kurulum.beyan'),
    firmaYazabilir: kapi(session, 'firma.yaz'),
    bildirimGor: kapi(session, 'bildirim.gor'),
    bildirimYaz: kapi(session, 'bildirim.yaz'),
    erisimGor: kapi(session, 'erisim.gor'),
    ekipYonet: kapi(session, 'ekip.yonet'),
    veriGor: kapi(session, 'veriDurumu.gor'),
    markaYaz: kapi(session, 'marka.yaz'),
  };
}
