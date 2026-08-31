import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `insights_breakdowns` İŞİ, DİĞER BÜTÜN İŞ TÜRLERİYLE AYNI DESENİ İZLEMEK
 * ZORUNDA: `markSucceeded`/`recordFailure` çağrılmazsa `sync_jobs.status`
 * satırı BAŞARIYLA bitse bile sonsuza dek 'running' kalır — worker hiç
 * çökmese bile. Üretimde bu yüzden 72 satır 3+ gündür takılıydı; bu bir
 * çökme yan etkisi değil, dalın doğuştan eksik olan parçasıydı.
 */
describe('kaynak taraması — insights_breakdowns durum güncelliyor mu', () => {
  it('insights_breakdowns dalı markSucceeded VE recordFailure çağırıyor', () => {
    const src = readFileSync(join(__dirname, 'sync-processor.service.ts'), 'utf8');
    const bas = src.indexOf("if (payload.jobType === 'insights_breakdowns') {");
    if (bas === -1) {
      throw new Error('insights_breakdowns dalı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const sonrakiDal = src.indexOf("if (payload.jobType === 'keyword_insights') {", bas);
    if (sonrakiDal === -1) {
      throw new Error('bir sonraki dal (keyword_insights) bulunamadı — tarama boşa düştü.');
    }
    const dal = src.slice(bas, sonrakiDal);

    expect(dal).toContain('this.markSucceeded(');
    expect(dal).toContain('this.recordFailure(');
    // Hesap/tarih eksikse de sessizce 'running' kalmamalı.
    expect(dal).toContain('this.markFailed(');
  });
});
