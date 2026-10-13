import { kapiAcikMi, type PanelKapiAnahtari, type SessionResponse } from '@advetics/shared';

/**
 * ═══ PANELİN AYARLAR / MARKA MERKEZİ / VARLIKLAR ADRESLERİ — TEK KAPI ═══
 *
 * Üreticilerin kendisi `@advetics/shared` içinde (`packages/shared/src/panel`),
 * çünkü API de aynı adresleri yazıyor (uyarı kuralları, OAuth dönüşü). Panel
 * kodu BURADAN içe aktarır: dosya taraması (`panel-adresleri.spec.ts`)
 * `/ayarlar/`, `/marka-merkezi`, `/varliklar`, `/kutuphane/`, `/hesabim`
 * dizgesini elle yazan dosyayı yakalıyor ve izinli tek kaynak burası +
 * shared.
 *
 * Mimari: `docs/panel-sadelestirme/MIMARI.md`.
 */
export {
  ACILIS_ADI,
  ACILIS_TURLERI,
  AYARLAR_CAPALARI,
  AYARLAR_SEKMELERI,
  ESKI_ADRESLER,
  ESKI_MM_BOLUMLERI,
  KURULUM_LISTESI,
  KURULUM_LISTESI_DURUMLARI,
  KURULUM_PLATFORMLARI,
  kurulumPlatformBeyaniSchema,
  MARKA_MERKEZI_BOLUMLERI,
  MARKA_MERKEZI_CAPALARI,
  MARKA_MERKEZI_IZNI,
  PANEL_KAPILARI,
  PANEL_YOLLARI,
  VARLIKLAR_IZNI,
  VARLIKLAR_SEKMELERI,
  acilisAdresi,
  ayarlarAdresi,
  ayarlarYolu,
  eksikleriTamamlaKapsami,
  eskiAdresYonu,
  eskiCapaYonu,
  eskiMarkaMerkeziYonu,
  hesaplarAdresi,
  kapiAcikMi,
  kurulumListesi,
  kurulumSayaci,
  markaMerkeziAdresi,
  markaMerkeziBolumu,
  platformBaglantilariAdresi,
  varliklarAdresi,
  varliklarSekmesi,
  veriDurumuAdresi,
} from '@advetics/shared';
export type {
  AcilisTuru,
  AyarlarCapasi,
  AyarlarSekmeKodu,
  EskiAdresAnahtari,
  EskiAdresGirdisi,
  EksikleriTamamlaKapsami,
  KurulumListesiAdimi,
  KurulumListesiDurumu,
  KurulumListesiGirdisi,
  KurulumListesiKodu,
  KurulumPlatformBeyani,
  KurulumPlatformu,
  KurulumSayaci,
  MarkaMerkeziBolumKodu,
  MarkaMerkeziCapasi,
  PanelKapiAnahtari,
  VarliklarSekmeKodu,
} from '@advetics/shared';

/**
 * Oturumdan kapı. Panelde `hasPermission(session, '…')` ile ELLE yazılmış
 * kapı bu modülün ekranlarında kalmayacak: aynı düğmenin kapısı iki yerde
 * yazılınca biri API'den ayrışıyor (MIMARI § Yetki kapıları).
 */
export function kapi(session: SessionResponse, anahtar: PanelKapiAnahtari): boolean {
  return kapiAcikMi(session, anahtar);
}
