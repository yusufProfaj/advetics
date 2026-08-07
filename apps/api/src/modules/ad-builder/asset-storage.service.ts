import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * Yüklenen reklam görsellerinin disk katmanı.
 *
 * NEDEN VERİTABANI DEĞİL: 30 MB'a kadar görseller. Bytea kolonunda saklamak
 * her yedeği şişirir ve `pg_dump` süresini dakikalara çıkarır.
 *
 * NEDEN S3/R2 DEĞİL (henüz): mimari dokümanda S3 planlanmıştı ama kurulmadı.
 * Disk, tek sunuculu bu kurulumda doğru çalışıyor ve arayüz `storageKey`
 * üzerinden soyutlanmış — S3'e geçiş bu sınıfın içinde kalır.
 *
 * SUNUCU KISITI: bu proje 11 başka sitenin paylaştığı bir VPS'te çalışıyor.
 * Kök dizin yapılandırmadan geliyor ve üretimde /home/advetics altında.
 */
@Injectable()
export class AssetStorageService {
  private readonly logger = new Logger(AssetStorageService.name);
  private readonly root: string;

  constructor(@Inject(CONFIG) config: AppConfig) {
    const dir = config.uploads.dir;
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  /**
   * Görseli diske yazar ve göreli anahtarını döner.
   *
   * ANAHTAR KİRACIYI İÇERİYOR (`<org>/<draft>/<uuid>.<ext>`). Böylece diskte
   * gezinen biri hangi dosyanın kime ait olduğunu görebiliyor ve org bazlı
   * temizlik tek bir dizin silmekle yapılabiliyor.
   *
   * DOSYA ADI KULLANICIDAN GELMİYOR. Orijinal ad yalnızca veritabanında
   * gösterim için saklanıyor; diske yazarken UUID kullanılıyor. Kullanıcı
   * adını kullanmak yol geçişi (`../../etc/passwd`) ve çakışma demek.
   */
  async save(params: {
    orgId: string;
    draftId: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<string> {
    const ext = params.mimeType === 'image/png' ? 'png' : 'jpg';
    const key = `${params.orgId}/${params.draftId}/${randomUUID()}.${ext}`;
    const target = this.absolute(key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, params.bytes);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.absolute(key));
  }

  /**
   * Siler. Başarısızlık YUTULUYOR ve loglanıyor.
   *
   * Dosya silinemediği için bir taslağın silinmesini engellemek yanlış olur:
   * kullanıcı taslağı silmek istedi, diskte kalan bir dosya onun sorunu değil.
   * Yetim dosyalar loglanıyor ve gerekirse toplu temizlenebilir.
   */
  async remove(key: string): Promise<void> {
    try {
      await unlink(this.absolute(key));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Görsel silinemedi (${key}): ${message}`);
    }
  }

  /**
   * Göreli anahtarı mutlak yola çevirir — YOL GEÇİŞİNE KARŞI DOĞRULAYARAK.
   *
   * Anahtarlar bizim ürettiğimiz UUID'ler ama veritabanından geliyorlar ve
   * veritabanı da bir gün başka bir yoldan yazılabilir. `..` içeren bir
   * anahtar, kök dizinin dışındaki herhangi bir dosyayı okutabilirdi —
   * paylaşımlı bir sunucuda bu, diğer 11 sitenin dosyalarını okumak demek.
   */
  private absolute(key: string): string {
    const target = resolve(this.root, key);
    const rootWithSep = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (!target.startsWith(rootWithSep)) {
      throw new Error(`Geçersiz depolama anahtarı: ${key}`);
    }
    return target;
  }

  /**
   * İçerik özeti — aynı görselin iki kez yüklenmesini tespit için.
   *
   * Şu an yalnızca loglanıyor; kütüphane (BASE) bölümü yazıldığında yeniden
   * kullanım burada bağlanacak.
   */
  static digest(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  }

  /** Testlerin kök dizini görebilmesi için. */
  get rootDir(): string {
    return this.root;
  }

  /** Yol birleştirmenin tek yeri — testler de bunu kullanıyor. */
  static joinKey(...parts: string[]): string {
    return join(...parts);
  }
}
