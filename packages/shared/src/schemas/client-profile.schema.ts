import { z } from 'zod';

/**
 * Bilgi Bankası — müşterinin genel profili.
 *
 * `branding.schema.ts`teki (varsa) marka profiliyle KARIŞTIRILMASIN — o
 * ajansın beyaz etiket rapor markalaşması. Bu, müşterinin KENDİ profili.
 */
export const upsertClientProfileSchema = z.object({
  clientId: z.string().uuid(),
  hedefKitle: z.string().trim().max(2000).nullable().optional(),
  markaBilgileri: z.string().trim().max(2000).nullable().optional(),
  /**
   * "Bilgi Bankası" sekmesi.
   *
   * `clients.notes` DEĞİL: o alan ajans içi ("ekip içi") ve `client.read`
   * yetkisiyle MÜŞTERİNİN KENDİ hesabına da açık. Bilgi Bankası müşteri
   * profilinin parçası olduğu için burada duruyor — aynı sekme iki farklı
   * gizlilik seviyesine yazamaz.
   */
  bilgiBankasi: z.string().trim().max(2000).nullable().optional(),
  /**
   * Yalnızca BİÇİM doğrulaması. Varlığın HANGİ MÜŞTERİYE ait olduğu burada
   * bilinemiyor (`clientId` ayrı bir alan ve Zod alanlar arası kiracılık
   * bilgisi taşımıyor) — o kontrol `ClientProfileService.upsert` içinde,
   * veritabanına karşı yapılıyor. Buraya "uuid" yazıp doğrulanmış saymak,
   * başka bir müşterinin varlık kimliğini kabul etmek olurdu.
   */
  logoAssetId: z.string().uuid().nullable().optional(),
});

export type UpsertClientProfileInput = z.infer<typeof upsertClientProfileSchema>;

export interface ClientProfileRecord {
  id: string;
  clientId: string;
  hedefKitle: string | null;
  markaBilgileri: string | null;
  bilgiBankasi: string | null;
  logoAssetId: string | null;
  updatedAt: string;
}
