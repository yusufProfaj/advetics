import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SpecialAdCategory, TenantContext } from '@advetics/shared';
import type { AuditService } from '../audit/audit.service';

/** `withTenant`in verdiği işlem — yalnız ham sorgu kullanılıyor. */
type Islem = { $queryRaw: Prisma.TransactionClient['$queryRaw'] };

/**
 * Beyanı kim verdi: hazırlama kartındaki soru mu, açılış sihirbazı mı.
 * Denetim kaydında duruyor; konut beyanının NEREDEN geldiği politika
 * soruşturmasında ilk sorulan şey.
 */
export type KategoriBeyanKaynagi = 'hazirlama' | 'kurulum';

/**
 * ═══ ÖZEL REKLAM KATEGORİSİ BEYANI — TEK YAZMA YOLU ═══
 *
 * Beyan üç şeyi BİRLİKTE yazar: `clients.special_ad_categories` (rehber ve
 * bütün reklamlar oradan okuyor), `client.updated` denetim kaydı ve
 * hazırlamanın "kategori cevaplandı" bayrağı. Üçü aynı işlemde: biri
 * yazılıp diğeri yazılmazsa ya reklam kategorisiz açılır (bayrak var,
 * beyan yok) ya da soru bir kez daha sorulur (beyan var, bayrak yok).
 *
 * NEDEN AYRI DOSYA (MIMARI Ç-10): açılış sihirbazı kategoriyi soruyordu ama
 * bayrağı basmıyordu. Seçim yapıldıysa hazırlama boş olmayan listeden
 * "cevaplanmış" çıkarabiliyordu; "Hiçbiri" seçildiyse liste boş ve boş
 * liste "sorulmadı" ile "hiçbiri" arasında ayırt edilemiyor, yani soru
 * Kurulum'da bir kez daha soruluyordu. Sihirbaz `TenancyModule`de,
 * hazırlama servisi o modülü içe alıyor; servisi oraya enjekte etmek modül
 * döngüsü kurardı. İkinci bir yazma yolu yazmak yerine hazırlamanın kendi
 * yolu buraya çıkarıldı ve İKİSİ de bunu çağırıyor.
 *
 * Bayrak satırı YOKSA da yazılıyor (sihirbazda hazırlık henüz hiç
 * koşmamıştır): `durum` varsayılanı 'bekliyor', imza boş — okuma onu satır
 * yokmuş gibi ele alıp işi başlatıyor ve iş bayrağı ÖNCEKİ satırdan
 * devralıyor (`calistir`).
 */
export async function kategoriBeyaniYaz(
  t: Islem,
  audit: Pick<AuditService, 'record'>,
  ctx: TenantContext,
  clientId: string,
  kategoriler: readonly SpecialAdCategory[],
  kaynak: KategoriBeyanKaynagi,
): Promise<void> {
  const [once] = await t.$queryRaw<Array<{ kategoriler: string[] }>>(
    Prisma.sql`SELECT special_ad_categories AS kategoriler FROM clients WHERE id = ${clientId}::uuid`,
  );
  // Politikası izin vermeyen UPDATE hata vermez, SIFIR satır etkiler:
  // beyan yazılmadan "cevaplandı" basılırsa reklam kategorisiz açılır.
  const yazilan = await t.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`UPDATE clients SET special_ad_categories = ${[...kategoriler]}::text[] WHERE id = ${clientId}::uuid RETURNING id`,
  );
  if (yazilan.length !== 1 || !once) {
    throw new ForbiddenException('Reklam kategorisi kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
  }
  await audit.record(t as never, ctx, {
    action: 'client.updated',
    targetType: 'client',
    targetId: clientId,
    clientId,
    before: { specialAdCategories: once.kategoriler },
    after: { specialAdCategories: [...kategoriler], kaynak },
  });
  const bayrak = await t.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`
    INSERT INTO workspace_hazirlama (client_id, org_id, kategori_cevaplandi, updated_at)
    SELECT c.id, c.org_id, true, now() FROM clients c WHERE c.id = ${clientId}::uuid
    ON CONFLICT (client_id) DO UPDATE SET kategori_cevaplandi = true, updated_at = now()
    RETURNING client_id`);
  if (bayrak.length !== 1) {
    throw new ForbiddenException('Reklam kategorisi kaydedilemedi: hazırlık kaydı yazılamadı.');
  }
}
