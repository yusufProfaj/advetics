import type { Response } from 'express';
export { AssetStorageService } from '../modules/ad-builder/asset-storage.service';

/**
 * ═══ VARLIK ÖNİZLEMESİ — TEK YANIT YAZICISI ═══
 *
 * İki uç aynı baytları gönderiyor: arşivin `/assets/:id/preview`ı (reklam
 * oluşturucu izni) ve pilot plan belgesinin `/pilot/planlar/:id/varliklar/
 * :varlikId`i (plan izni; müşteri hesabı arşivi göremiyor ama onayladığı
 * planın görselini görmeli). Başlıklar tek yerde: biri önbellek süresini ya
 * da `Content-Type`ı değiştirip diğeri unutulursa aynı görsel iki ekranda
 * farklı davranır.
 *
 * `AssetStorageService` buradan da dışa aktarılıyor: disk katmanı
 * `StorageModule` ile GLOBAL ve reklam oluşturucunun dizininde duruyor;
 * pilot eski iş modüllerini içe aktarmıyor (pilot-kayit.spec), altyapıyı
 * altyapı yolundan alıyor.
 */
export function onizlemeGonder(res: Response, v: { buffer: Buffer; mimeType: string }): void {
  res.setHeader('Content-Type', v.mimeType);
  // Değişmez içerik: aynı kimlik her zaman aynı baytları veriyor (yeni
  // yükleme yeni kayıt açıyor). Uzun önbellek güvenli.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(v.buffer);
}
