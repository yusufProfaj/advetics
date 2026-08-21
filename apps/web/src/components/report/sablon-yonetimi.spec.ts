import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ŞABLON YÖNETİM EKRANI.
 *
 * Kaynak taraması, çünkü buradaki riskler render kararları ve hepsi
 * "sessizce yanlış davranan arayüz" türünden — birim testiyle yakalamak için
 * bütün ağacı kurmak gerekirdi, ayrışma ise tek satırlık.
 */
const KAYNAK = readFileSync(join(__dirname, 'sablon-yonetimi.tsx'), 'utf8');

function modalGovdesi(): string {
  const bas = KAYNAK.indexOf('function SablonModal(');
  if (bas === -1) {
    throw new Error('SablonModal bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas);
  if (!g.includes('/reports/templates')) {
    throw new Error('SablonModal dilimi kaydetmiyor — tarama boşa düştü.');
  }
  return g;
}

describe('şablon yönetimi', () => {
  it('KRİTİK: silme onayı KAÇ LİNKİN gideceğini söylüyor', () => {
    // Şablonu silmek ona bağlı bütün paylaşım linklerini de siliyor;
    // müşteriye gönderilmiş bir rapor haber vermeden 404 olur.
    const g = modalGovdesi();
    expect(g).toContain('sablon.shareCount > 0');
    expect(g).toContain('paylaşım linki');
  });

  it('KRİTİK: silme İKİ ADIMLI — tek tıkla silinmiyor', () => {
    const g = modalGovdesi();
    expect(g).toContain('silOnay ? sil() : setSilOnay(true)');
  });

  it('BOŞ bölüm listesi kaydedilemiyor', () => {
    // Boş bir rapor, müşteriye gönderilecek bir belge değil.
    expect(modalGovdesi()).toContain('secili.length === 0');
  });

  it('org varsayılanı seçeneği YÖNETİCİ DEĞİLKEN kapalı ve sebebi yazılı', () => {
    /*
     * RLS bunu zaten uyguluyor ama SESSİZCE: politika 0 satır döndürür ve
     * ekran "kaydedildi" derdi.
     */
    const g = modalGovdesi();
    expect(g).toContain('disabled={!isOrgAdmin}');
    expect(g).toContain('yalnızca yönetici');
  });

  it('sunucunun KENDİ mesajı ekranda — "bir hata oluştu" değil', () => {
    const g = modalGovdesi();
    expect(g).toContain('err instanceof ApiRequestError ? err.message');
  });

  it('METRİK SEÇİMİ EKRANDA YOK — belge henüz sütunlarını options’tan kurmuyor', () => {
    /*
     * `options` sunucuda saklanıyor ve rapora ulaşıyor, ama
     * `report-document.tsx` sütunlarını hâlâ sabit setlerden kuruyor.
     * Çalışmayan bir seçim kutusu koymak, olmayan bir özellik vaat etmek
     * olurdu — bu oturumda tam da bu hatayı iki kez düzelttim.
     *
     * Belge desteklendiğinde bu test DÜŞECEK ve o zaman kaldırılacak.
     */
    expect(KAYNAK).not.toContain('METRIC_LABELS');
    expect(KAYNAK).not.toContain('METRIC_KEYS');
  });

  it('mevcut options düzenlemede KORUNUYOR — ekranda görünmese de kaybolmamalı', () => {
    // Ekran metrikleri göstermiyor; gövdeye koymasaydık PATCH onları
    // sessizce boşaltırdı.
    expect(modalGovdesi()).toContain('options: sablon?.options ?? {}');
  });
});
