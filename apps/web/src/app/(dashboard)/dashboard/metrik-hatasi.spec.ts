import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ "METRİKLER ALINAMADI" TEK BAŞINA BİR ŞEY SÖYLEMİYOR ═══
 *
 * Özet çağrısı `.catch(() => null)` ile susturuluyordu ve ekranda tek bir
 * cümle kalıyordu: "Metrikler alınamadı. API çalışıyor mu?" Kullanıcı ajans
 * görünümünde bu ekranı gördü, şirket görünümünde görmedi ve SEBEBİ HİÇBİR
 * YERDE YAZMIYORDU — teşhis için sunucu loguna bakmak gerekiyordu.
 *
 * CLAUDE.md'de adı konmuş yasak: "`.catch(() => setX([]))` YASAK. Arayüzde
 * hatayı yutmak, dört farklı hâli AYNI boş alana çeviriyor."
 */
const KAYNAK = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('sayfa kaynağı okundu', () => {
    expect(KAYNAK).toContain('/metrics/summary');
  });
});

describe('KRİTİK: özet hatası ekranda yazıyor', () => {
  it('sebep YAKALANIYOR — sessizce null’a düşmüyor', () => {
    expect(KAYNAK).toContain('ozetHatasi = hataMetni(e)');
    // Eski hâl: `.catch(() => null)`. Geri gelirse sebep yine kaybolur.
    expect(KAYNAK).not.toContain('`/metrics/summary?${base}`).catch(() => null)');
  });

  it('sebep EKRANA basılıyor', () => {
    // Yakalayıp göstermemek, yakalamamakla aynı şey.
    expect(KAYNAK).toContain('{ozetHatasi && <span className="ml-1">{ozetHatasi}</span>}');
  });

  it('platformun KENDİ cümlesi kullanılıyor', () => {
    expect(KAYNAK).toContain('e instanceof ApiRequestError ? e.message');
  });
});

describe('AJANS KAPSAMINDA sorgu süresi', () => {
  const METRIK = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'modules', 'metrics', 'metrics.service.ts'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('BOŞA DÜŞME BEKÇİSİ: servis kaynağı okundu', () => {
    expect(METRIK).toContain('async summary(');
  });

  it('KRİTİK: okuma transaction’ı VARSAYILAN 5 saniyeyle sınırlı değil', () => {
    /*
     * Ajans kapsamında bu uçlar elli workspace'in verisini tarıyor —
     * şirket kapsamındakinin elli katı. Varsayılan sınır Prisma'nın 5
     * saniyesi ve transaction ölünce ekranda yalnızca "Metrikler alınamadı"
     * kalıyor.
     *
     * BU BİR YAMA: süre uzatmak sorguyu hızlandırmıyor, ölmesini
     * engelliyor. Kök çözüm sorgunun kendisinde ve ölçüm istiyor.
     */
    expect(METRIK).toContain('const OKUMA_SURESI_MS = 20_000');
    /*
     * HER OKUMA YOLU — SABİT BİR SAYI DEĞİL.
     *
     * İddia bir süre "altı tane olmalı" diyordu ve yeni bir okuma ucu
     * eklendiğinde KIRMIZI verdi: doğru davranan koda "yanlış" dedi ve
     * düzeltmesi sayıyı artırmaktı. Sayıyı artırmak da kuralı korumuyor —
     * yedinci ucu timeout'suz yazan biri testi yine geçerdi.
     *
     * Kural aslında şu: `withTenant` açan her yol süreyi geçirmek zorunda.
     * İddia artık onu ölçüyor.
     */
    const acilan = METRIK.split('withTenant(').length - 1;
    expect(acilan).toBeGreaterThan(5);
    expect(METRIK.split('timeoutMs: OKUMA_SURESI_MS').length - 1).toBe(acilan);
  });
});
