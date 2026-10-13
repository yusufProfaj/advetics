import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KURULUM_BEYAN_OGELERI, type KurulumBeyanOgesi, type KurulumBeyani } from '@advetics/shared';

/**
 * ═══ KURULUM BEYANLARI — OKUMA (docs/kurulum-sihirbazi/MIMARI.md § 5) ═══
 *
 * Beyanı OKUYAN TEK sorgu burada. Kurulum ucu (`tamamla`'nın "site yok"
 * süzgeci), beyan uçları ve AdvCampaign yayın kapısı aynı fonksiyonu
 * çağırıyor: üç yerde ayrı SQL yazmak, biri `client_id` süzgecini unutunca
 * başka workspace'in "web sitemiz yok" beyanının bu workspace'in yayınını
 * kapatması demekti.
 *
 * Fonksiyonlar bir SORGU ÇALIŞTIRICI alıyor (transaction değil sınıf): çağıran
 * kendi `withTenant` bağlamını kurar, RLS orada uygulanır.
 */

const logger = new Logger('KurulumBeyan');

export interface SorguCalistirici {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
}

interface BeyanSatiri {
  oge: string;
  client_id: string | null;
  gerekce: string | null;
  beyan_eden: string | null;
  /** `users.full_name` — LEFT JOIN; RLS göstermezse NULL. */
  ad: string | null;
  created_at: Date | string;
}

const OGELER: ReadonlySet<string> = new Set(KURULUM_BEYAN_OGELERI);

/**
 * Satır → yanıt. TANINMAYAN ÖĞE ATILIYOR AMA LOGLANIYOR: veritabanının CHECK'i
 * bunu engelliyor, yani buraya düşen bir satır shared listesinden bir öğenin
 * ÇIKARILDIĞI (ve migration'ın unutulduğu) anlamına gelir. Ekrana "bilinmeyen
 * beyan" çizmek yerine atmak, ama iz bırakmak.
 */
export function beyanCevir(r: BeyanSatiri): KurulumBeyani | null {
  if (!OGELER.has(r.oge)) {
    logger.warn(`Tanınmayan kurulum beyanı atlandı: ${r.oge}`);
    return null;
  }
  const tarih = r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString();
  return {
    oge: r.oge as KurulumBeyanOgesi,
    clientId: r.client_id,
    gerekce: r.gerekce,
    /*
     * AD OKUNAMIYORSA beyanEden NULL (sözleşme: "silinmiş ya da RLS yüzünden
     * okunamıyor"). Kimliği tek başına göstermek ekranda bir UUID demek.
     */
    beyanEden: r.beyan_eden && r.ad ? { id: r.beyan_eden, ad: r.ad } : null,
    tarih,
  };
}

/*
 * LEFT JOIN users — INNER DEĞİL. users politikası dar (yönetici ya da kendisi);
 * INNER JOIN beyanın KENDİSİNİ süzerdi ve kapsam dışı bir öğe sessizce
 * "eksik"e dönerdi (CLAUDE.md "RLS'li bir tabloya yapılan INNER JOIN ana
 * satırı sessizce süzüyor"). Sıra sabit: öğe adı, sonra zaman.
 */
const SECIM = Prisma.sql`
  SELECT b.oge, b.client_id::text AS client_id, b.gerekce, b.beyan_eden::text AS beyan_eden,
         u.full_name AS ad, b.created_at
    FROM kurulum_beyanlari b
    LEFT JOIN users u ON u.id = b.beyan_eden`;

function cevir(satirlar: BeyanSatiri[]): KurulumBeyani[] {
  return satirlar.map(beyanCevir).filter((b): b is KurulumBeyani => b !== null);
}

/** Workspace düzeyi beyanlar. */
export async function workspaceBeyanlariOku(t: SorguCalistirici, clientId: string): Promise<KurulumBeyani[]> {
  const satirlar = await t.$queryRaw<BeyanSatiri[]>(Prisma.sql`${SECIM}
   WHERE b.client_id = ${clientId}::uuid
   ORDER BY b.oge, b.created_at`);
  return cevir(satirlar);
}

/** Şirket düzeyi beyanlar (`client_id IS NULL`). */
export async function sirketBeyanlariOku(t: SorguCalistirici, orgId: string): Promise<KurulumBeyani[]> {
  const satirlar = await t.$queryRaw<BeyanSatiri[]>(Prisma.sql`${SECIM}
   WHERE b.client_id IS NULL AND b.org_id = ${orgId}::uuid
   ORDER BY b.oge, b.created_at`);
  return cevir(satirlar);
}

/**
 * "Web sitemiz yok" beyanı var mı — yalnız o öğeye bakan ucuz sorgu (yayın
 * kapısı ve `tamamla`). ÜÇ HÂLİ ÇAĞIRAN kuruyor: bu fonksiyon fırlatırsa
 * "okunamadı" (`null`), `false` değil.
 */
export async function siteYokBeyaniVarMi(t: SorguCalistirici, clientId: string): Promise<boolean> {
  const r = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT count(*)::int AS n FROM kurulum_beyanlari
     WHERE client_id = ${clientId}::uuid AND oge = 'site_yok'`);
  return (r[0]?.n ?? 0) > 0;
}
