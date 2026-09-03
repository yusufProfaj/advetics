import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { raporSorgusu, sablonAlanlari } from '@advetics/shared';

/**
 * ═══ ŞABLON SEÇİMİ HER ÇIKTIYA GİDİYOR MU ═══
 *
 * KULLANICININ BİLDİRDİĞİ HÂL: *"şablonu değiştirdiğimde pdf
 * oluşturamıyorum"*. Ekranda şablon değişiyor, önizleme değişiyor, indirilen
 * PDF DEĞİŞMİYORDU.
 *
 * SEBEP: aynı raporu isteyen üç yol vardı ve her biri sorgu dizesini ELLE
 * kuruyordu; yalnızca önizleme `sablon` taşıyordu. Hiçbiri hata vermiyor —
 * şablonsuz istek de geçerli bir istek ve sunucu varsayılanı üretiyor. Yani
 * kullanıcı yanlış belgeyi ancak AÇINCA fark ediyor.
 *
 * Testin iki yarısı var ve ikisi de gerekli: birim testi üreticinin DOĞRU
 * olduğunu, kaynak taraması onun KULLANILDIĞINI söylüyor. CLAUDE.md'de kayıtlı
 * mutasyon dersi bu: bir fonksiyon test edilmişti ama çağrıldığı test
 * edilmemişti.
 */

describe('sablonAlanlari', () => {
  const UUID = '11111111-2222-3333-4444-555555555555';

  it('UUID `templateId`ye, ön ayar kodu `sablon`a gidiyor', () => {
    /*
     * API iki alanı AYRI tutuyor ve bu doğru: tek alan olsaydı doğrulama hem
     * UUID'yi hem "google"ı kabul etmek zorunda kalır, bozuk bir UUID de
     * sessizce "bilinmeyen şablon" sayılırdı. Ayrım TEK YERDE yapılıyor.
     */
    expect(sablonAlanlari(UUID)).toEqual({ templateId: UUID });
    expect(sablonAlanlari('google')).toEqual({ sablon: 'google' });
    expect(sablonAlanlari('genel')).toEqual({ sablon: 'genel' });
  });

  it('KRİTİK: TANINMAYAN değer hiçbir alana yazılmıyor', () => {
    /*
     * Adres çubuğuna elle yazılan ya da silinmiş bir şablona işaret eden bir
     * değer sunucuya GİTMEMELİ: `sablon` alanı bir enum ve geçersiz değer
     * bütün isteği 400'e düşürürdü — kullanıcı raporu hiç göremezdi. Boş
     * geçmek sunucuyu varsayılana düşürüyor ve ekran hangi şablonun
     * kullanıldığını zaten yazıyor.
     */
    expect(sablonAlanlari('uydurma')).toEqual({});
    expect(sablonAlanlari('')).toEqual({});
    expect(sablonAlanlari(null)).toEqual({});
    expect(sablonAlanlari(undefined)).toEqual({});
    // UUID'ye BENZEYEN ama olmayan değer de geçmiyor.
    expect(sablonAlanlari('11111111-2222-3333-4444-5555')).toEqual({});
  });

  it('sorgu ÜÇ ZORUNLU alanı her zaman taşıyor', () => {
    const q = raporSorgusu({ clientId: 'c', from: '2026-08-01', to: '2026-08-31', sablon: null });
    expect(q).toEqual({ clientId: 'c', from: '2026-08-01', to: '2026-08-31' });
  });

  it('KRİTİK: seçilen şablon sorguya GİRİYOR', () => {
    const onAyar = raporSorgusu({ clientId: 'c', from: 'a', to: 'b', sablon: 'meta' });
    expect(onAyar.sablon).toBe('meta');
    expect(onAyar.templateId).toBeUndefined();

    const kayitli = raporSorgusu({ clientId: 'c', from: 'a', to: 'b', sablon: UUID });
    expect(kayitli.templateId).toBe(UUID);
    expect(kayitli.sablon).toBeUndefined();
  });
});

/**
 * KAYNAK TARAMASI — üç çıktı da TEK ÜRETİCİDEN geçiyor mu.
 *
 * Birim testi `raporSorgusu`nun doğru olduğunu söylüyor; bu blok onun
 * KULLANILDIĞINI söylüyor. Elle kurulmuş bir `URLSearchParams`, düzeltilen
 * hatanın aynen geri gelmesi demek ve TypeScript bu konuda hiçbir şey demiyor.
 */
describe('kaynak taraması — tek üretici', () => {
  const GONDER = readFileSync(join(__dirname, 'rapor-gonder.tsx'), 'utf8');
  const SAYFA = readFileSync(
    join(__dirname, '../../app/(dashboard)/raporlar/page.tsx'),
    'utf8',
  );

  /**
   * YORUMLARI ATAR — İDDİA KODA ÇAPALANSIN DİYE.
   *
   * Bu testin ilk hâli tam da CLAUDE.md'de kayıtlı tuzağa düştü ve KIRMIZI
   * VERDİ: "elle kurulmuş sorgu kalmadı" iddiası, o sorguyu ANLATAN yoruma
   * eşleşiyordu. Kod doğruydu, test yanlıştı.
   *
   * Tuzağın asıl tehlikeli yönü ters yönde: bir kuralı anlatan yorum aynı
   * dosyada durduğu için POZİTİF bir `toContain` iddiası, kod silinse bile
   * yorumla eşleşip geçmeye devam eder. Bu yüzden tarama yorumsuz kaynakta
   * yapılıyor.
   */
  const kod = (kaynak: string): string =>
    kaynak.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('tarama BOŞA DÜŞMÜYOR', () => {
    // Dosya adı ya da içerik değişirse iddialar sessizce her zaman doğru
    // olurdu; önce gerçekten baktığımız şeyin orada olduğunu doğruluyoruz.
    expect(kod(GONDER)).toContain('/reports/pdf');
    expect(kod(GONDER)).toContain('/reports/mail-draft');
    expect(kod(GONDER)).toContain('/reports/send');
    expect(kod(SAYFA)).toContain('/reports/preview');
  });

  it('KRİTİK: PDF, mail taslağı ve önizleme `raporSorgusu` kullanıyor', () => {
    expect(kod(GONDER)).toContain('raporSorgusu({ clientId, from, to, sablon })');
    expect(kod(SAYFA)).toContain('raporSorgusu({ clientId, from, to, sablon })');
    // İkisi de iki kez: `RaporGonder` (PDF) ve `MailGonderModal` (taslak).
    expect(kod(GONDER).split('raporSorgusu(').length - 1).toBe(2);
  });

  it('KRİTİK: mail GÖVDESİ de şablonu taşıyor', () => {
    /*
     * Taslağı doğru şablondan çekip gönderirken göndermemek, mailin METNİ ile
     * EKİNDEKİ PDF'in farklı şablondan gelmesi demekti — ve bunu yalnızca
     * alıcı görürdü.
     */
    const GOVDE = kod(GONDER);
    /*
     * ÇAPA TİPE DEĞİL UCA. Önce `apiFetch<{ to: string }>` dizesine
     * çapalıydı ve yanıt tipi çoğullaşınca (`to: string[]`) tarama boşa
     * düştü. Uç adresi bu dosyanın gerçekten koruduğu şey; yanıt tipi ise
     * her değişiklikte kayabilen bir ayrıntı.
     */
    const i = GOVDE.indexOf("'/reports/send'");
    expect(i, 'gönderme çağrısı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(GOVDE.slice(i, GOVDE.indexOf('});', i))).toContain('...sablonAlanlari(sablon)');
  });

  it('KRİTİK: elle kurulmuş `{ clientId, from, to }` sorgusu KALMADI', () => {
    /*
     * Düzeltilen hatanın imzası tam olarak buydu. İddia YORUMA DEĞİL KODA
     * çapalı ve bu satır bunu bizzat öğretti: ilk yazımda test KIRMIZI verdi,
     * çünkü aynı dizeyi ANLATAN yoruma eşleşiyordu — kod zaten düzeltilmişti.
     */
    expect(kod(GONDER)).not.toContain('new URLSearchParams({ clientId, from, to })');
    expect(kod(SAYFA)).not.toContain('new URLSearchParams({ clientId, from, to })');
  });
});
