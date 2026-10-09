/**
 * Rehber bütçesinin iki platforma bölünmesi ve günlük eşdeğer.
 *
 * Kullanıcı TEK tutar yazıyor. Bölme saf ve tek yerde: ekrandaki pay
 * çubuğu, eksik listesindeki asgari kontrolü ve iki platformun türetilmiş
 * taslağı aynı fonksiyonu okuyor. İki ayrı bölme yazılsaydı ekran "Meta
 * 250 ₺" derken Meta'ya 249,99 ₺ giderdi.
 *
 * KURUŞ KAYBI YOK: Meta'nın payı para biriminin en küçük birimine AŞAĞI
 * yuvarlanır, Google KALANI alır. İkisinin toplamı her zaman kullanıcının
 * yazdığı tutar; yuvarlama farkı bir platformda kaybolmaz.
 */
import { paraOndaligi } from '../para';
import { donemGunSayisi } from '../butce';

export interface PlatformButcesi {
  meta: bigint;
  google: bigint;
}

export function butceBol(
  toplamMicros: bigint,
  platformlar: { meta: boolean; google: boolean },
  metaPayiYuzde: number,
  paraBirimi: string,
): PlatformButcesi {
  if (toplamMicros <= 0n) throw new Error('Bütçe sıfırdan büyük olmalı');
  if (!platformlar.meta && !platformlar.google) throw new Error('En az bir platform açık olmalı');
  if (!platformlar.google) return { meta: toplamMicros, google: 0n };
  if (!platformlar.meta) return { meta: 0n, google: toplamMicros };
  if (!Number.isInteger(metaPayiYuzde) || metaPayiYuzde < 10 || metaPayiYuzde > 90) {
    throw new Error(`Meta payı 10 ile 90 arasında tam sayı olmalı: ${metaPayiYuzde}`);
  }
  const birim = 10n ** BigInt(6 - paraOndaligi(paraBirimi));
  const ham = (toplamMicros * BigInt(metaPayiYuzde)) / 100n;
  const meta = ham - (ham % birim);
  return { meta, google: toplamMicros - meta };
}

/**
 * Günlük eşdeğer: asgari bütçe kontrolü GÜNLÜK. Toplam bütçede dönem gün
 * sayısına bölünür; bitişsiz toplam zaten eksik listesinde ret (BTC-02),
 * burada `null` döner ve kontrol koşmaz.
 */
export function gunlukEsdeger(micros: bigint, tip: 'gunluk' | 'toplam', takvim: { baslangic: string; bitis: string | null } | null): bigint | null {
  if (tip === 'gunluk') return micros;
  if (!takvim) return null;
  const gun = donemGunSayisi(takvim);
  return gun === null ? null : micros / BigInt(gun);
}
