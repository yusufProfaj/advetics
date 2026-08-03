import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config/configuration';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM için önerilen
const TAG_LENGTH = 16;

/**
 * Uygulama katmanı şifrelemesi (AES-256-GCM).
 *
 * Modül 2'de Meta ve Google OAuth token'ları bununla şifrelenecek. Şimdiden
 * yazılmasının sebebi, anahtar rotasyonunun sonradan eklenmesinin acı verici
 * olması: her şifreli değerin başına anahtar sürümü yazılmazsa, anahtar
 * değiştiğinde eski verinin hangi anahtarla açılacağı bilinemez.
 *
 * Depolama formatı (tek bytea kolonu):
 *   [1 byte sürüm][12 byte IV][16 byte GCM tag][ciphertext]
 *
 * Rotasyon: yeni anahtarı ENCRYPTION_KEY_V2 olarak ekle,
 * ENCRYPTION_ACTIVE_KEY_VERSION=2 yap. Eski kayıtlar v1 ile açılmaya devam
 * eder; arka planda yeniden şifreleme işi kendi zamanında çalışır.
 */
@Injectable()
export class CryptoService {
  private readonly keys: Map<number, Buffer>;
  private readonly activeVersion: number;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.activeVersion = config.encryption.activeVersion;
    this.keys = new Map();

    for (const [version, encoded] of Object.entries(config.encryption.keys)) {
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY_V${version} 32 byte olmalı (base64 çözülmüş hali). Şu an: ${key.length} byte. ` +
            'Üretmek için: openssl rand -base64 32',
        );
      }
      this.keys.set(Number(version), key);
    }

    if (!this.keys.has(this.activeVersion)) {
      throw new Error(
        `Aktif şifreleme anahtarı (v${this.activeVersion}) tanımlı değil. ENCRYPTION_KEY_V${this.activeVersion} ekle.`,
      );
    }
  }

  encrypt(plaintext: string): Buffer {
    const key = this.keys.get(this.activeVersion);
    if (!key) throw new Error('Aktif şifreleme anahtarı bulunamadı');

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([Buffer.from([this.activeVersion]), iv, tag, ciphertext]);
  }

  decrypt(payload: Buffer): string {
    if (payload.length < 1 + IV_LENGTH + TAG_LENGTH) {
      throw new Error('Şifreli veri bozuk: beklenenden kısa');
    }

    const version = payload[0] as number;
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(
        `Şifreli veri v${version} anahtarıyla üretilmiş ama bu anahtar yüklü değil. ` +
          `ENCRYPTION_KEY_V${version} ortam değişkenini geri ekle.`,
      );
    }

    const iv = payload.subarray(1, 1 + IV_LENGTH);
    const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const ciphertext = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** Bir değerin hangi anahtar sürümüyle şifrelendiğini söyler. */
  keyVersionOf(payload: Buffer): number {
    if (payload.length === 0) throw new Error('Boş şifreli veri');
    return payload[0] as number;
  }

  get needsRotation(): (payload: Buffer) => boolean {
    return (payload: Buffer) => this.keyVersionOf(payload) !== this.activeVersion;
  }
}
