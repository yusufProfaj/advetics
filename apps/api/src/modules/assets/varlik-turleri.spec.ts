import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_KINDS } from '@advetics/shared';

/**
 * ═══ VARLIK TÜRÜ İKİ YERDE YAZILI VE İKİSİ AYRIŞABİLİYOR ═══
 *
 * `assets.kind` düz metin bir kolon (`VarChar(12)`), yani Prisma hiçbir şey
 * dayatmıyor. Kabul edilen değerleri `01_constraints.sql` içindeki
 * `assets_kind_chk` tutuyor.
 *
 * Bu oturumda tam olarak bu ayrışma oldu: `'video'` paylaşılan listeye
 * eklendi, yükleme yolu yazıldı, arayüz düğmesi kondu — kısıt ise `('image',
 * 'logo')` kaldı. Testlerin tamamı yeşildi (hiçbiri video SATIRI yazmıyordu)
 * ve arıza ilk video yüklenirken, üretimde görünecekti: PostgreSQL 23514,
 * mesaj yalnızca kısıt adı.
 *
 * Kısıt DEPLOY'da uygulanıyor (`db:rls` → `apply-sql.ts`), migration'ın
 * parçası değil — yani şema değişmeden de ayrışabiliyor.
 */
const SQL = readFileSync(
  join(__dirname, '../../../prisma/sql/01_constraints.sql'),
  'utf8',
);

function kisitListesi(): string[] {
  const m = /assets_kind_chk\s*\n?\s*CHECK \(kind IN \(([^)]*)\)\)/.exec(SQL);
  if (!m) throw new Error('assets_kind_chk bulunamadı — tarama boşa düştü');
  return m[1]!.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
}

describe('varlık türleri', () => {
  it('tarama boşa düşmüyor', () => {
    expect(kisitListesi().length).toBeGreaterThan(1);
  });

  it('KRİTİK: veritabanı kısıtı ile paylaşılan liste AYNI', () => {
    expect([...kisitListesi()].sort()).toEqual([...ASSET_KINDS].sort());
  });

  it('video kabul ediliyor', () => {
    // Bu satır ayrı duruyor çünkü yukarıdaki iddia iki liste birlikte
    // eksilse de geçer.
    expect(kisitListesi()).toContain('video');
  });
});
