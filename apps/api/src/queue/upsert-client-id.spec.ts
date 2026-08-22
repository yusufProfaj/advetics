import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HER UPSERT `client_id`'Yİ DE GÜNCELLEMEK ZORUNDA.
 *
 * `client_id` denormalize ve kaynağı TEK: hesabın o anki müşterisi. Upsert
 * `ad_account_id`'yi güncelleyip `client_id`'yi atladığında ortaya çıkan satır
 * yarım oluyor — hesabı doğru, müşterisi eski. O satır yeni müşterinin
 * hiçbir sorgusuna düşmüyor ve eski müşterinin raporunda görünmeye devam
 * ediyor.
 *
 * Bu eksiklik "yeniden senkronize et" tavsiyesini de işe yaramaz kılıyordu:
 * veri tazeleniyor, sahibi tazelenmiyordu. Atama yolundaki toplu taşıma
 * (`hesap-verisi-tasima.ts`) asıl düzeltme; bu tarama İKİNCİ savunma hattı ve
 * ileride eklenecek upsert'ler için bağlayıcı.
 */
const DOSYALAR = [
  'structure-sync.service.ts',
  'insights-sync.service.ts',
  'keyword-sync.service.ts',
  'search-term-sync.service.ts',
] as const;

/** `--` yorum satırlarını atar: iddia YORUMA değil KODA çapalanmalı. */
function yorumsuz(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && !l.trim().startsWith('*'))
    .join('\n');
}

/**
 * Bir dosyadaki her `ON CONFLICT … DO UPDATE SET` bloğunun gövdesi.
 *
 * SATIRIN KENDİSİ `ON CONFLICT` İLE BAŞLAMALI. İlk yazımda `indexOf` ile
 * arıyordum ve dosya başındaki *"`INSERT … ON CONFLICT … RETURNING`
 * kullanıyoruz"* açıklaması da eşleşiyordu: yedi upsert on tane sayıldı.
 * Yorumdan blok üretmek, gerçekte olmayan bir bloğu doğrulamak demek.
 */
function upsertBloklari(kaynak: string): string[] {
  const satirlar = kaynak.split('\n');
  const bloklar: string[] = [];
  for (const [i, satir] of satirlar.entries()) {
    const t = satir.trim();
    if (!t.startsWith('ON CONFLICT') || !t.includes('DO UPDATE SET')) continue;
    // Blok, `RETURNING`e ya da şablonun kapanışına kadar.
    const gövde: string[] = [];
    for (const sonraki of satirlar.slice(i + 1)) {
      const u = sonraki.trim();
      if (u.startsWith('RETURNING') || u.startsWith('`')) break;
      gövde.push(sonraki);
    }
    bloklar.push(gövde.join('\n'));
  }
  return bloklar;
}

describe('upsert client_id yayılımı', () => {
  it('TARAMA BOŞA DÜŞMÜYOR: yedi upsert bloğu gerçekten bulundu', () => {
    /*
     * Bu iddia olmadan tarama SESSİZCE DEĞERSİZLEŞİR: bir gün `ON CONFLICT`
     * ifadesi yeniden yazılırsa dilim boşalır, döngü hiç dönmez ve "yasak
     * durum yok" iddiası her zaman doğru olur.
     */
    const toplam = DOSYALAR.reduce(
      (n, d) => n + upsertBloklari(readFileSync(join(__dirname, d), 'utf8')).length,
      0,
    );
    expect(toplam).toBe(7);
  });

  for (const dosya of DOSYALAR) {
    it(`${dosya}: her upsert client_id'yi de yazıyor`, () => {
      const bloklar = upsertBloklari(readFileSync(join(__dirname, dosya), 'utf8'));
      expect(bloklar.length, `${dosya} içinde upsert bulunamadı — tarama boşa düştü`).toBeGreaterThan(0);
      for (const [i, blok] of bloklar.entries()) {
        expect(yorumsuz(blok), `${dosya} #${i + 1} client_id'yi güncellemiyor`).toContain(
          'client_id = EXCLUDED.client_id',
        );
      }
    });
  }
});
