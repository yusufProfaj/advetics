import { createHash, randomBytes } from 'node:crypto';
import {
  OKUMA_ANAHTARI_GORUNEN_UZUNLUK,
  OKUMA_ANAHTARI_ONEKI,
  YAZMA_ANAHTARI_ONEKI,
  type AnahtarYetkisi,
} from '@advetics/shared';

/**
 * Okuma anahtarının SAF parçaları — üretim, özet, tanıma.
 *
 * Servisten ayrı ve saf: kimlik bekçisi de panel servisi de aynı özet
 * fonksiyonunu kullanmak ZORUNDA. İki yerde ayrı yazılsaydı biri hex,
 * diğeri base64 üretip hiçbir anahtarın doğrulanmadığı bir hâle düşerdi ve
 * belirtisi yalnızca "anahtar geçersiz" olurdu.
 */

/** 32 bayt = 256 bit rastgelelik. base64url: başlığa ve JSON'a kaçışsız yazılıyor. */
export function anahtarUret(yetki: AnahtarYetkisi = 'okuma'): { anahtar: string; ozet: string; gorunenOnek: string } {
  const onek = yetki === 'yazma' ? YAZMA_ANAHTARI_ONEKI : OKUMA_ANAHTARI_ONEKI;
  const anahtar = `${onek}${randomBytes(32).toString('base64url')}`;
  return {
    anahtar,
    ozet: anahtarOzeti(anahtar),
    gorunenOnek: anahtar.slice(0, OKUMA_ANAHTARI_GORUNEN_UZUNLUK),
  };
}

/**
 * SHA-256 hex. TUZSUZ ve bu yeterli: tuz, tahmin edilebilir PAROLALARI
 * sözlük saldırısından korur; bu değer 256 bit rastgele, sözlüğü yok.
 * Tuz eklemek ise tek indeks aramasını imkânsız kılıp her istekte bütün
 * satırları taramayı gerektirirdi.
 */
export function anahtarOzeti(anahtar: string): string {
  return createHash('sha256').update(anahtar, 'utf8').digest('hex');
}

/**
 * Bearer değeri bir Advetics anahtarı mı (JWT `eyJ` ile başlıyor, çakışmıyor).
 * İKİ ÖNEK DE: yazma anahtarı bu kontrolden geçmeseydi JWT doğrulayıcısına
 * düşer ve "oturum geçersiz" gibi anahtarla ilgisiz bir hata alırdı. Yetki
 * önekten OKUNMUYOR; satırdaki `yetki` kolonu karar veriyor.
 */
export function okumaAnahtariMi(deger: string): boolean {
  return deger.startsWith(OKUMA_ANAHTARI_ONEKI) || deger.startsWith(YAZMA_ANAHTARI_ONEKI);
}
