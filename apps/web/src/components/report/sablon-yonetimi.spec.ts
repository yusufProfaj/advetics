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

  it('SÜTUN SEÇİMİ yalnızca TABLOSU OLAN bölümlerde', () => {
    /*
     * Kapak, özet ve kapanışta gösterilecek bir sütun listesi yok; oraya
     * seçici koymak boş bir vaat olurdu. (Bu test bir süre "metrik seçimi
     * ekranda YOK" diyordu ve doğruydu: belge sütunlarını sabit setlerden
     * kuruyordu. Belge artık options'tan kuruyor, iddia da değişti.)
     */
    const g = modalGovdesi();
    expect(g).toContain("s === 'meta_campaigns' || s === 'google_campaigns'");
    expect(g).toContain('<SutunSecici');
  });

  it('mevcut ayarlar düzenlemede KORUNUYOR — kaydetmek onları boşaltmamalı', () => {
    const g = modalGovdesi();
    expect(g).toContain('useState<ReportOptions>(sablon?.options ?? {})');
    expect(g).toContain('options: ayarlar');
  });

  it('BOŞ sütun seçimi SAKLANMIYOR — varsayılana dönmeli', () => {
    // Boş diziyi bir seçim olarak yazmak, bir dahaki açılışta boş tablo
    // göstermek olurdu.
    expect(modalGovdesi()).toContain('sutunlar.length === 0 ? {}');
  });

  it("Google'da form/mesaj seçilirse UYARI çıkıyor", () => {
    // Google `actions` dizisi döndürmüyor; o sütunlar raporda her zaman 0
    // görünür ve "hiç form gelmedi" diye okunur.
    expect(KAYNAK).toContain('Google Ads form ve mesaj dökümü');
  });
});
