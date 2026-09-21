import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ GOOGLE DÖNÜŞÜM EYLEMİ SEGMENTİ ═══
 *
 * `metrics.conversions` tek bir sayı ve hangi eylemlerden oluştuğunu
 * söylemiyor. Kullanıcının istediği ayrım (`"whatsapp tıklaması"`, `"site
 * içi telefon araması"`) yalnızca `segments.conversion_action_name` ile
 * geliyor.
 *
 * BU DOSYA TEK BİR ŞEYİ KİLİTLİYOR ve o şey pahalı: SEGMENT AYRI SORGUDA
 * KALMALI. Aynı sorguya eklemek satırı dönüşüm eylemi başına çoğaltıyor ve
 * gösterim/tıklama/HARCAMA her satırda tekrar ediyor — toplam, eylem sayısı
 * kadar katlanırdı. Hiçbir hata düşmez; yalnızca müşteriye yanlış harcama
 * raporlanır.
 *
 * Kaynak taraması: canlı Google Ads çağrısı yapan bir test yok ve olamaz.
 */
const KAYNAK = readFileSync(join(__dirname, 'google.provider.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** `fetchInsights` gövdesi — dilim GERÇEK sınırla çıkarılıyor. */
function insightsGovdesi(): string {
  const bas = KAYNAK.indexOf('async fetchInsights(');
  const son = KAYNAK.indexOf('private async donusumDetaylari(');
  expect(bas, 'fetchInsights bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  expect(son, 'donusumDetaylari bulunamadı — tarama boşa düştü').toBeGreaterThan(bas);
  return KAYNAK.slice(bas, son);
}

/** Segmentli sorgunun gövdesi. */
function detayGovdesi(): string {
  const bas = KAYNAK.indexOf('private async donusumDetaylari(');
  const son = KAYNAK.indexOf('\n  }', KAYNAK.indexOf('return { kayitlar, hata: null };', bas));
  expect(bas).toBeGreaterThan(-1);
  return KAYNAK.slice(bas, son);
}

describe('tarama boşa düşmüyor', () => {
  it('iki gövde de yakalandı', () => {
    expect(insightsGovdesi().length).toBeGreaterThan(500);
    expect(detayGovdesi().length).toBeGreaterThan(300);
  });
});

describe('segment AYRI sorguda', () => {
  it('KRİTİK: ana metrik sorgusu segmenti SEÇMİYOR', () => {
    /*
     * Eklendiği gün harcama, eylem sayısı kadar katlanır ve hiçbir hata
     * düşmez. Bu depoda "sessizce yanlış sayı" en pahalı hata türü.
     */
    const ana = insightsGovdesi();
    expect(ana).toContain('metrics.cost_micros');
    expect(ana).not.toContain('segments.conversion_action_name');
  });

  it('KRİTİK: segmentli sorgu YALNIZCA dönüşüm metriklerini seçiyor', () => {
    /*
     * Simetrik tehlike: segmentli sorguya gösterim/tıklama/harcama eklemek,
     * o satırların bir gün toplamlara karışması demek.
     */
    const detay = detayGovdesi();
    expect(detay).toContain('segments.conversion_action_name');
    expect(detay).toContain('metrics.conversions');
    expect(detay).not.toContain('metrics.impressions');
    expect(detay).not.toContain('metrics.clicks');
    expect(detay).not.toContain('metrics.cost_micros');
  });
});

describe('hata ana çekimi düşürmüyor', () => {
  it('KRİTİK: segmentli sorgu try/catch içinde', () => {
    /*
     * Bu kırılım bir EK. Bir müşteride alan reddedilse bile günlük
     * metrikler gelmeye devam etmeli; aksi hâlde bir yan özellik bütün
     * senkronizasyonu durdururdu.
     */
    const detay = detayGovdesi();
    expect(detay).toContain('try {');
    expect(detay).toContain('} catch (err) {');
    expect(detay).toContain('return { kayitlar, hata: mesaj };');
  });

  it('KRİTİK: hata SESSİZ DEĞİL — ham gövdeye yazılıyor', () => {
    // Okuma katmanı "dönüşüm yok" ile "detay alınamadı"yı ayırt edebilmeli.
    expect(insightsGovdesi()).toContain('conversionActionsError: detaylar.hata');
  });

  it('KRİTİK: sıfır sayılı eylem atlanıyor', () => {
    // Google her tanımlı eylem için satır döndürüyor; hepsini yazmak listeyi
    // o dönemde hiç gerçekleşmemiş eylemlerle doldururdu.
    expect(detayGovdesi()).toContain('if (sayi === 0) continue;');
  });
});
