import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * META ATIF AYARI — VARSAYILANA BIRAKILMIYOR.
 *
 * Bu üç parametre bir süre isteğe HİÇ konmuyordu ve kararı Meta veriyordu.
 * CLAUDE.md'nin "platformun varsayılanına güvenme — aynı kod iki müşteride
 * farklı davranır" kuralının doğrudan ihlaliydi ve belirtisi görünmezdi:
 * iki reklam hesabının atıf penceresi farklıysa CPA ve ROAS
 * karşılaştırılamaz hâle geliyor, hiçbir hata çıkmıyor ve raporda yalnızca
 * "sayılar tuhaf" olarak beliriyordu.
 *
 * KAYNAK TARAMASI, çünkü bunu birim testiyle yakalamak mümkün değil:
 * parametreyi silmek hiçbir davranışı bozmuyor, yalnızca kararı sessizce
 * platforma geri veriyor.
 */
const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

/** `fetchInsights` gövdesi — istek burada kuruluyor. */
function insightsGovdesi(): string {
  const bas = SOURCE.indexOf('async fetchInsights(');
  if (bas === -1) {
    throw new Error('fetchInsights bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const son = SOURCE.indexOf('\n  async ', bas + 10);
  const govde = SOURCE.slice(bas, son === -1 ? SOURCE.length : son);
  // ANTİ-BOŞLUK: dilim gerçekten isteği kuran kod mu?
  if (!govde.includes("url.searchParams.set('level'")) {
    throw new Error('fetchInsights dilimi istek kurmuyor — tarama boşa düştü.');
  }
  return govde;
}

describe('Meta insights isteği — atıf', () => {
  it('atıf ayarı AÇIKÇA gönderiliyor', () => {
    // Gönderilmezse dönüşümler hesabın kendi varsayılanıyla geliyor ve iki
    // müşteri arasında sessizce farklı davranıyor.
    expect(insightsGovdesi()).toContain("set('use_unified_attribution_setting', 'true')");
  });

  it('dönüşümün hangi güne yazılacağı AÇIKÇA gönderiliyor', () => {
    // `action_report_time` verilmezse Meta varsayılanı uyguluyor. Varsayılanı
    // yazmak bile bir karar: değiştiğinde bizim rakamımız haber vermeden
    // kayar ve aylık rapor sınırlarında en çok orada görünür.
    expect(insightsGovdesi()).toContain("set('action_report_time', ");
  });

  it('sabit bir atıf penceresi DAYATILMIYOR — Ads Manager ile fark açardı', () => {
    // `action_attribution_windows` ile örneğin 7d_click sabitlemek "daha
    // tutarlı" görünür ama panelin rakamı müşterinin Ads Manager'da
    // gördüğüyle tutmaz. Bilinçli olarak KULLANILMIYOR; geri gelirse bu
    // karar yeniden verilmiş olmalı.
    expect(insightsGovdesi()).not.toContain('action_attribution_windows');
  });

  it('günlük kırılım korunuyor — time_increment olmadan tek toplam satır gelir', () => {
    expect(insightsGovdesi()).toContain("set('time_increment', '1')");
  });
});
