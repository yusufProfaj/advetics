import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `organic_posts` İŞİ İLE ONAY KUYRUĞU (`AutoBoostQueueService`) ARASINDAKİ
 * TEK BAĞLANTI BUYDU VE HİÇ YAZILMAMIŞTI.
 *
 * `AutoBoostQueueService.enqueueForProfile` uzun süredir vardı ve
 * `autoboost.module.ts`'in kendi yorumu bile "organik gönderi süpürmesi
 * (Instagram yolu) onu çağırıyor" diyordu — ama gerçekte hiçbir yerden
 * çağrılmıyordu. Sonuç: gönderi `organic_posts`a doğru yazılıyor, iş
 * `succeeded` kapanıyordu ama Bildirim Havuzu'na hiçbir zaman kart
 * düşmüyordu. Bu, kodun DOĞRU davranmasının yetmediği; yorumun ANLATTIĞI
 * çağrının GERÇEKTEN yapıldığının da ayrıca doğrulanması gerektiği bir
 * durum — CLAUDE.md: "bir fonksiyon test edilmişti ama ÇAĞRILDIĞI test
 * edilmemişti."
 */
describe('kaynak taraması — organic_posts dalı onay kuyruğunu besliyor mu', () => {
  it('organic_posts dalı enqueueForProfile çağırıyor', () => {
    const src = readFileSync(join(__dirname, 'sync-processor.service.ts'), 'utf8');
    const bas = src.indexOf("if (payload.jobType === 'organic_posts') {");
    if (bas === -1) {
      throw new Error('organic_posts dalı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const son = src.indexOf('işleyicisi henüz yazılmadı', bas);
    if (son === -1) {
      throw new Error('dal sonu (fallback mesajı) bulunamadı — tarama boşa düştü.');
    }
    const dal = src.slice(bas, son);

    expect(dal).toContain('this.autoboostQueue.enqueueForProfile(');
    // SIRA ÖNEMLİ DEĞİL ama çağrı `catch` bloğunun İÇİNDE değil `try`'ın
    // içinde olmalı — aksi hâlde bir hata yutulup hiç fark edilmez.
    expect(dal.indexOf('try {')).toBeLessThan(dal.indexOf('this.autoboostQueue.enqueueForProfile('));
  });
});
