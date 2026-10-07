import { Prisma } from '@prisma/client';
import { OZEL_KATEGORILER, sektorCoz, type OzelKategori, type UyumProfili } from '@advetics/shared';
import type { OkumaTx } from './plan-girdisi';

/**
 * ═══ UYUM PROFİLİ OKUYUCUSU ═══
 *
 * Denetçi saf; profil buradan gelir ve denetimin İÇİNE O ANKİ DEĞER olarak
 * kopyalanır (pilot_uyum_denetimleri.profil): "o gün neye baktık" sorusu
 * bağlantıyla cevaplanamaz (TASARIM §10.1.1).
 *
 * ÖZEL KATEGORİ ÜÇ HÂLLİ:
 *   · kategori listesi DOLU → beyan (kim yazdıysa bir kişinin cevabı),
 *   · liste boş VE beyan zamanı dolu → "Hayır, hiçbiri",
 *   · liste boş VE beyan zamanı boş → `null` = SORULMADI (GNL-20, OZK-SORU).
 * Tanınmayan bir kategori (eski `CREDIT` dışı) varsa `null`: neyin
 * kısıtlanacağı bilinmeden denetim "geçti" diyemez.
 *
 * ŞEMADA KARŞILIĞI OLMAYAN KANITLAR (KVKK aydınlatma adresi, konut satışını
 * yapan, çerez beyanı) `null` — ilgili kural `bilinmiyor` döner. Veri adımı
 * (Tur 3) bu alanları açınca okuyucu onları burada doldurur.
 */
export async function uyumProfiliOku(tx: OkumaTx, clientId: string): Promise<UyumProfili> {
  const [r] = await tx.$queryRaw<Array<{ kategoriler: string[] | null; beyan: Date | null; sektor: string | null; yasal: string | null }>>(Prisma.sql`
    SELECT c.special_ad_categories AS kategoriler, c.ozel_kategori_beyan_zamani AS beyan,
           p.sektor, p.yasal_uyari AS yasal
      FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
     WHERE c.id = ${clientId}::uuid`);
  if (!r) throw new Error(`Workspace bulunamadı: ${clientId}`);
  return {
    sektorler: sektorCoz(r.sektor),
    sektorMetni: r.sektor?.trim() || null,
    ozelKategoriler: ozelKategoriBeyani(r.kategoriler ?? [], r.beyan !== null),
    yasalUyari: r.yasal?.trim() || null,
    kvkkAydinlatmaAdresi: null,
    konutSatisYapan: null,
    cerezRizasiBeyani: null,
  };
}

export function ozelKategoriBeyani(ham: readonly string[], beyanVar: boolean): OzelKategori[] | null {
  const k: OzelKategori[] = [];
  for (const x of ham) {
    // Meta CREDIT'i 2025-01-14'te FINANCIAL_PRODUCTS_SERVICES ile değiştirdi.
    const c = x === 'CREDIT' ? 'FINANCIAL_PRODUCTS_SERVICES' : x;
    if (!(OZEL_KATEGORILER as readonly string[]).includes(c)) return null;
    if (!k.includes(c as OzelKategori)) k.push(c as OzelKategori);
  }
  if (k.length > 0) return k;
  return beyanVar ? [] : null;
}
