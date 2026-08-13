import { Global, Module } from '@nestjs/common';
import { AssetStorageService } from '../modules/ad-builder/asset-storage.service';

/**
 * Disk depolama — GLOBAL.
 *
 * NEDEN AYRI MODÜL: hem reklam oluşturucu (taslak görselleri) hem varlık
 * arşivi (kütüphane) aynı disk katmanını kullanıyor. Arşivin reklam
 * oluşturucuyu içe aktarması gerekseydi ve reklam yayıncısı da arşivi
 * kullandığı için, iki modül birbirini içe aktarırdı — Nest bunu
 * `forwardRef` olmadan çözemez ve `forwardRef` ihtiyacı genelde yanlış
 * yerleştirilmiş bir bağımlılığın işareti.
 *
 * Depolama ikisinin de ALTINDA duran bir altyapı parçası; yeri burası.
 */
@Global()
@Module({
  providers: [AssetStorageService],
  exports: [AssetStorageService],
})
export class StorageModule {}
