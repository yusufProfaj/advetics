import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoBoostDecisionSchema, autoBoostQueueOverrideSchema } from '@advetics/shared';

/**
 * ═══ YOUTUBE KARTINDA REKLAM METNİ DÜZENLEME ═══
 *
 * Üç sessiz hata ihtimali ve üçü de burada kilitli:
 *   · kartta düzeltilen metnin yayında YOK SAYILMASI (üretilen gider),
 *   · Instagram kartına gönderilen metnin kabul edilip yok sayılması,
 *   · önizleme ucunun bir GET'te logoyu Görsel Arşivi'ne yazması.
 */

describe('şema — Google sınırları girişte', () => {
  const tamam = { baslik: 'Yeni proje', uzunBaslik: 'Yalıkavak villaları', aciklama: 'Deniz manzaralı' };

  it('geçerli metin kabul ediliyor, kenar boşlukları kırpılıyor', () => {
    const r = autoBoostQueueOverrideSchema.parse({ texts: { ...tamam, baslik: '  Yeni proje  ' } });
    expect(r.texts?.baslik).toBe('Yeni proje');
  });

  it('KRİTİK: başlık 30, uzun başlık ve açıklama 90 karakterle sınırlı', () => {
    expect(autoBoostQueueOverrideSchema.safeParse({ texts: { ...tamam, baslik: 'x'.repeat(31) } }).success).toBe(false);
    expect(autoBoostQueueOverrideSchema.safeParse({ texts: { ...tamam, baslik: 'x'.repeat(30) } }).success).toBe(true);
    expect(autoBoostQueueOverrideSchema.safeParse({ texts: { ...tamam, uzunBaslik: 'x'.repeat(91) } }).success).toBe(false);
    expect(autoBoostQueueOverrideSchema.safeParse({ texts: { ...tamam, aciklama: 'x'.repeat(91) } }).success).toBe(false);
  });

  it('boş alan reddediliyor — Google üçünü de zorunlu tutuyor', () => {
    expect(autoBoostQueueOverrideSchema.safeParse({ texts: { ...tamam, aciklama: '   ' } }).success).toBe(false);
  });

  it('reddedilen karta metin gönderilemiyor', () => {
    expect(autoBoostDecisionSchema.safeParse({ approve: false, override: { texts: tamam } }).success).toBe(false);
  });
});

const KAYNAK = readFileSync(resolve(__dirname, 'autoboost-launch.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function metot(bas: string): string {
  const i = KAYNAK.indexOf(bas);
  if (i < 0) throw new Error(`"${bas}" bulunamadı — tarama boşa düşerdi`);
  return KAYNAK.slice(i, KAYNAK.indexOf('\n  }\n', i));
}

describe('yayın yolu', () => {
  it('KRİTİK: kartta yazılan metin üretilenin YERİNE geçiyor', () => {
    const g = metot('private async launchGoogle(');
    expect(g).toContain('const metin: VideoMetinleri = metinOzel');
    expect(g).toContain('headlines: [metinOzel.baslik]');
    expect(g).toContain('descriptions: [metinOzel.aciklama]');
    expect(g).toContain('(await this.videodanMetin(kayit, degerler.businessName)).metin');
  });

  it('KRİTİK: karar yolu metni Google dalına GEÇİRİYOR', () => {
    expect(metot('async decide(')).toContain('this.launchGoogle(ctx, scoped, ozellestirilmis, override?.texts)');
  });

  it('KRİTİK: Instagram kartına metin REDDEDİLİYOR — yok sayılmıyor', () => {
    expect(metot('async decide(')).toMatch(
      /if \(override\?\.texts && kayit\.platform !== 'google'\) \{\s*throw new BadRequestException/,
    );
  });
});

describe('metin ucu — yayınla aynı üretici, yan etkisiz', () => {
  const u = metot('async youtubeMetinleri(');

  it('kartı yayınla AYNI sorguyla okuyor', () => {
    expect(u).toContain('this.kartiOku(scoped, queueItemId)');
    expect(metot('async decide(')).toContain('this.kartiOku(scoped, queueItemId)');
  });

  it('metni yayınla AYNI üreticiden alıyor', () => {
    expect(u).toContain('this.videodanMetin(kayit, marka)');
  });

  it('KRİTİK: logoyu arşive ALMIYOR — yayinDegerleri çağrılmıyor', () => {
    expect(u).not.toContain('yayinDegerleri');
    expect(u).toContain('this.youtubeOtomatik.markaAdi(');
  });
});
