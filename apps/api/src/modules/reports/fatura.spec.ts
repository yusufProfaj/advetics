import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { donemMetni, kapsananDonemler } from '@advetics/shared';

/**
 * ═══ FATURA DÖNEMİ EŞLEŞTİRMESİ ═══
 *
 * Yanlış olduğunda HİÇBİR HATA DÜŞMÜYOR: müşteriye ya YANLIŞ AYIN faturası
 * gidiyor ya da hiç gitmiyor. İkisi de sessiz ve ikisini de ancak müşteri
 * fark ediyor.
 */
describe('kapsananDonemler', () => {
  it('tek ay içindeki aralık O AYI veriyor', () => {
    expect(kapsananDonemler('2026-08-01', '2026-08-31')).toEqual(['2026-08']);
  });

  it('KRİTİK: AYIN BİR KISMINI kapsayan rapor da o ayı sayıyor', () => {
    /*
     * Fatura ayın TAMAMINA ait. Yalnızca tam ayları saymak, "1–15 Ağustos"
     * raporunda faturayı sessizce düşürürdü — oysa müşterinin eline geçmesi
     * gereken belge o.
     */
    expect(kapsananDonemler('2026-08-01', '2026-08-15')).toEqual(['2026-08']);
    expect(kapsananDonemler('2026-08-20', '2026-08-22')).toEqual(['2026-08']);
  });

  it('KRİTİK: iki aya yayılan rapor İKİ dönem veriyor', () => {
    // Tek dönem dönseydi ikinci ayın faturası sessizce eksik kalırdı.
    expect(kapsananDonemler('2026-07-25', '2026-08-05')).toEqual(['2026-07', '2026-08']);
  });

  it('KRİTİK: yıl sınırını geçiyor', () => {
    expect(kapsananDonemler('2026-12-20', '2027-01-10')).toEqual(['2026-12', '2027-01']);
  });

  it('90 günlük aralık ardışık dönemleri ATLAMADAN veriyor', () => {
    /*
     * Aradaki bir ayı atlamak, o ayın faturasının hiç aranmaması demek —
     * ve eksik olduğu bile bildirilmez, çünkü dönem listede yok.
     */
    const d = kapsananDonemler('2026-06-04', '2026-09-02');
    expect(d).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('ters aralık BOŞ dönüyor — uydurma dönem yok', () => {
    expect(kapsananDonemler('2026-09-01', '2026-08-01')).toEqual([]);
  });

  it('aynı gün tek dönem', () => {
    expect(kapsananDonemler('2026-08-15', '2026-08-15')).toEqual(['2026-08']);
  });

  it('sonsuz döngüye girmiyor — uzun aralıkta bile sonlanıyor', () => {
    // Üst sınır bir güvenlik ağı; bozuk bir girdi işi kilitlemesin.
    expect(kapsananDonemler('2020-01-01', '2030-01-01').length).toBeLessThanOrEqual(24);
  });
});

describe('donemMetni', () => {
  it('okunur Türkçe ay veriyor', () => {
    expect(donemMetni('2026-08')).toBe('Ağustos 2026');
    expect(donemMetni('2027-01')).toBe('Ocak 2027');
    expect(donemMetni('2026-12')).toBe('Aralık 2026');
  });
});

/**
 * ═══ KAYNAK TARAMASI: FATURA MAİLE GERÇEKTEN EKLENİYOR MU ═══
 *
 * `raporEkleri()` doğru çalışsa bile ÇAĞRILMAZSA hiçbir birim testi bunu
 * yakalamaz — CLAUDE.md'deki "bir fonksiyon test edilmişti ama ÇAĞRILDIĞI
 * test edilmemişti" tuzağı. Bu projede tam olarak o yüzden Bildirim Havuzu
 * aylarca boş kaldı.
 *
 * İKİ YOL DA taranıyor: elle gönderim ve planlı gönderim. Yalnızca birine
 * eklemek, planlı raporların faturasız gitmesi demekti ve fark yalnızca
 * müşteride görünürdü.
 */
describe('kaynak taraması — fatura maile ekleniyor', () => {
  const KAYNAK = readFileSync(join(__dirname, 'rapor-gonder.service.ts'), 'utf8');

  function dilim(bas: string, son: string): string {
    const i = KAYNAK.indexOf(bas);
    if (i === -1) throw new Error(`"${bas}" bulunamadı — tarama boşa düştü, testi güncelle.`);
    const j = KAYNAK.indexOf(son, i);
    if (j === -1) throw new Error(`"${son}" bulunamadı — tarama boşa düştü.`);
    return KAYNAK.slice(i, j);
  }

  it('ELLE gönderim faturaları ekliyor', () => {
    const g = dilim('async gonder(', 'async zamanlanmisGonder(');
    expect(g).toContain('this.faturalar.raporEkleri(');
    expect(g).toContain('ekler.push(...fatura.ekler)');
  });

  it('KRİTİK: PLANLI gönderim de faturaları ekliyor', () => {
    const g = dilim('async zamanlanmisGonder(', 'private async musteriEpostalari(');
    expect(g).toContain('this.faturalar.raporEkleri(');
    expect(g).toContain('ekler.push(...fatura.ekler)');
  });

  it('KRİTİK: eksik dönem SESSİZ kalmıyor — planlı gönderim onu taşıyor', () => {
    /*
     * Kullanıcının kararı "uyar ama gönder" idi. Uyarı taşınmazsa karar
     * yalnızca yarısı uygulanmış olur: rapor gider, eksiklik kaybolur.
     */
    const g = dilim('async zamanlanmisGonder(', 'private async musteriEpostalari(');
    expect(g).toContain('faturasizDonemler');
  });

  it('eksik dönem denetim kaydına yazılıyor', () => {
    const g = dilim('async gonder(', 'async zamanlanmisGonder(');
    expect(g).toContain('faturasizDonemler');
  });
});
