import { Prisma } from '@prisma/client';

/**
 * ═══ 2FA VERİTABANI ADIMLARI — HAM SQL, HER BİRİ TEK DEYİM ═══
 *
 * Ham SQL'in iki sebebi var:
 *
 *   1. YARIŞI VERİTABANINA BIRAKMAK. Tekrar kullanım engeli ve kurtarma
 *      kodunun tek kullanımı "oku, karşılaştır, yaz" olarak yazılsaydı aynı
 *      kodla gelen iki eşzamanlı istek ikisi de "kullanılmamış" görüp ikisi
 *      de geçerdi. Burada koşul UPDATE'in WHERE'inde: yalnızca biri satırı
 *      etkiler, diğeri sıfır satır görür ve reddedilir (`token.service.ts`
 *      rotasyonundaki desenin aynısı).
 *   2. GERÇEK VERİTABANIYLA SINANABİLMEK. PGlite koşum ortamı `user` modelini
 *      taklit etmiyor ve etmemeli; ham SQL orada üretimdeki gibi koşuyor.
 *
 * HER YAZMA ETKİLENEN SATIR SAYISINI DÖNDÜRÜYOR ve çağıran onu kontrol
 * ediyor: sıfır satırlık UPDATE hata vermez (CLAUDE.md, "politikası olmayan
 * UPDATE"), sessizce hiçbir şey yapmaz.
 *
 * Sayı parametreleri `::bigint`/`::int` ile tiplendiriliyor (CLAUDE.md:
 * bağlı sayı parametresi Postgres'e tipsiz gitmez).
 */

export interface SorguCalistirici {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
}

export interface IkiAdimSatiri {
  id: string;
  orgId: string;
  email: string;
  status: string;
  acik: boolean;
  anahtarSifreli: Buffer | null;
  sonAdim: bigint | null;
  kalanKurtarma: number;
  basarisiz: number;
  kilitBitis: Date | null;
  acilis: Date | null;
  sirketteZorunlu: boolean;
}

interface HamSatir {
  id: string;
  org_id: string;
  email: string;
  status: string;
  mfa_enabled: boolean;
  mfa_secret_enc: Uint8Array | null;
  mfa_son_adim: bigint | number | string | null;
  kalan: number | string;
  mfa_basarisiz_deneme: number;
  mfa_kilit_bitis: Date | string | null;
  mfa_acilis: Date | string | null;
  iki_adim_zorunlu: boolean | null;
}

const tarih = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

/**
 * Kullanıcının 2FA durumu. Şirket LEFT JOIN ile: RLS'li bir tabloya INNER
 * JOIN ana satırı sessizce eleyebiliyor (CLAUDE.md) — bu sorgu bugün
 * BYPASSRLS istemciyle koşuyor ama bir gün bağlamlı istemciyle çağrılırsa
 * "kullanıcı yok" demek yerine "zorunlu değil" demeli.
 */
export async function satirOku(db: SorguCalistirici, userId: string): Promise<IkiAdimSatiri | null> {
  const satirlar = await db.$queryRaw<HamSatir[]>(Prisma.sql`
    SELECT u.id, u.org_id, u.email, u.status::text AS status,
           u.mfa_enabled, u.mfa_secret_enc, u.mfa_son_adim,
           cardinality(u.mfa_kurtarma_kodlari)::int AS kalan,
           u.mfa_basarisiz_deneme, u.mfa_kilit_bitis, u.mfa_acilis,
           o.iki_adim_zorunlu
      FROM users u
      LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.id = ${userId}::uuid
  `);
  const s = satirlar[0];
  if (!s) return null;
  return {
    id: s.id,
    orgId: s.org_id,
    email: s.email,
    status: s.status,
    acik: s.mfa_enabled,
    anahtarSifreli: s.mfa_secret_enc === null ? null : Buffer.from(s.mfa_secret_enc),
    sonAdim: s.mfa_son_adim === null ? null : BigInt(String(s.mfa_son_adim)),
    kalanKurtarma: Number(s.kalan),
    basarisiz: Number(s.mfa_basarisiz_deneme),
    kilitBitis: tarih(s.mfa_kilit_bitis),
    acilis: tarih(s.mfa_acilis),
    sirketteZorunlu: s.iki_adim_zorunlu === true,
  };
}

/** TOTP adımını tüketir. 1 = kabul, 0 = bu adım (ya da daha yenisi) zaten kullanılmış. */
export function adimiTuket(db: SorguCalistirici, userId: string, adim: bigint): Promise<number> {
  const a = adim.toString();
  return db.$executeRaw(Prisma.sql`
    UPDATE users SET mfa_son_adim = ${a}::bigint
     WHERE id = ${userId}::uuid
       AND mfa_enabled
       AND (mfa_son_adim IS NULL OR mfa_son_adim < ${a}::bigint)
  `);
}

/** Kurtarma kodunu harcar. 1 = kabul, 0 = böyle bir kod yok ya da zaten kullanıldı. */
export function kurtarmaKodunuTuket(db: SorguCalistirici, userId: string, ozet: string): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE users SET mfa_kurtarma_kodlari = array_remove(mfa_kurtarma_kodlari, ${ozet}::text)
     WHERE id = ${userId}::uuid
       AND mfa_enabled
       AND ${ozet}::text = ANY (mfa_kurtarma_kodlari)
  `);
}

/**
 * ═══ DENEME HAKKI AYIRMA — DOĞRULAMADAN ÖNCE, TEK DEYİMDE ═══
 *
 * Önce kilit OKUNUP sayaç doğrulamadan SONRA ayrı deyimle artırılıyordu.
 * Aynı anda gelen yirmi isteğin hepsi okumada "kilit yok" gördü ve on altısı
 * değerlendirildi; doğru kod kilide rağmen geçti (Ajan 4, B-1). Kilit "beş
 * tahmin / pencere" değil "saldırganın bant genişliği / pencere" olmuştu.
 *
 * Şimdi her deneme kod kontrol edilmeden ÖNCE bu deyimle bir hak ayırıyor.
 * Satır kilidi deyimleri sıraya diziyor: kilit süresince WHERE hiçbir satır
 * vermiyor (0 satır = kilitli), eşiğe ulaşan deneme kilidi AYNI deyimde
 * yazıyor ve ardından gelen hiçbir istek araya giremiyor. Başarı sayacı
 * sıfırlıyor (`sayaciSifirla`), yani sayaç "art arda hatalı" anlamını
 * koruyor.
 *
 * Kilit süresi `totp.ts#kilitSuresiMs` ile AYNI formül (her eşikte ikiye
 * katlanır, en çok 24 saat); `iki-adim.spec.ts` ikisini karşılaştırıyor.
 * Bitiş `GREATEST` ile yazılıyor: daha uzun bir kilidi kısaltmak hiçbir
 * yolda mümkün olmamalı. Zaman uygulamanın saatinden geliyor (`simdi`):
 * kilidin okunduğu ve yazıldığı saat aynı olmak zorunda.
 *
 * `mfaAcikSart` YALNIZCA kurulum onayındaki parola denetiminde kapalı:
 * orada 2FA henüz açık değil ama aynı sayaç parola tahminini sınırlıyor.
 */
export async function hakAyir(
  db: SorguCalistirici,
  userId: string,
  simdi: Date,
  ayar: { azami: number; ilkKilitDk: number; mfaAcikSart: boolean },
): Promise<{ n: number; kilitBitis: Date | null } | null> {
  const r = await db.$queryRaw<Array<{ n: number; k: Date | string | null }>>(Prisma.sql`
    UPDATE users
       SET mfa_basarisiz_deneme = mfa_basarisiz_deneme + 1,
           mfa_kilit_bitis = CASE
             WHEN (mfa_basarisiz_deneme + 1) % ${ayar.azami}::int = 0
             THEN GREATEST(
                    COALESCE(mfa_kilit_bitis, ${simdi}::timestamptz),
                    ${simdi}::timestamptz + interval '1 minute' * LEAST(
                      ${ayar.ilkKilitDk}::int * power(2, ((mfa_basarisiz_deneme + 1) / ${ayar.azami}::int) - 1),
                      1440))
             ELSE mfa_kilit_bitis
           END
     WHERE id = ${userId}::uuid
       AND (mfa_enabled OR NOT ${ayar.mfaAcikSart}::boolean)
       AND (mfa_kilit_bitis IS NULL OR mfa_kilit_bitis <= ${simdi}::timestamptz)
    RETURNING mfa_basarisiz_deneme AS n, mfa_kilit_bitis AS k
  `);
  const s = r[0];
  if (!s) return null;
  return { n: Number(s.n), kilitBitis: s.k === null ? null : new Date(s.k) };
}

export function sayaciSifirla(db: SorguCalistirici, userId: string): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE users SET mfa_basarisiz_deneme = 0, mfa_kilit_bitis = NULL WHERE id = ${userId}::uuid
  `);
}

/** Parola özeti — kurulum onayında parolayı yeniden sormak için (Ö-1). */
export async function parolaOzetiOku(db: SorguCalistirici, userId: string): Promise<string | null> {
  const r = await db.$queryRaw<Array<{ h: string | null }>>(Prisma.sql`
    SELECT password_hash AS h FROM users WHERE id = ${userId}::uuid
  `);
  return r[0]?.h ?? null;
}

/** Kurulum anahtarını yazar. 0 = 2FA zaten açık (açıkken anahtar EZİLMEZ). */
export function kurulumAnahtariYaz(db: SorguCalistirici, userId: string, sifreli: Buffer): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE users SET mfa_secret_enc = ${sifreli}
     WHERE id = ${userId}::uuid AND NOT mfa_enabled
  `);
}

/**
 * Kurulumu onaylar.
 *
 * `mfa_secret_enc = okunan` KOŞULU ŞART: iki sekmede kurulum başlatan
 * kullanıcı A'nın QR'ını okutup kodu girerken B sekmesi anahtarı
 * değiştirmiş olabilir. Koşul olmasaydı doğrulanmamış bir anahtar açılır ve
 * kullanıcı bir sonraki girişte kendini kilitlerdi.
 */
export function kurulumuOnayla(
  db: SorguCalistirici,
  userId: string,
  okunanAnahtar: Buffer,
  ozetler: string[],
  adim: bigint,
  simdi: Date,
): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE users
       SET mfa_enabled = true,
           mfa_kurtarma_kodlari = ${ozetler}::text[],
           mfa_son_adim = ${adim.toString()}::bigint,
           mfa_acilis = ${simdi}::timestamptz,
           mfa_basarisiz_deneme = 0,
           mfa_kilit_bitis = NULL
     WHERE id = ${userId}::uuid
       AND NOT mfa_enabled
       AND mfa_secret_enc = ${okunanAnahtar}
  `);
}

export function kurtarmaKodlariniYaz(db: SorguCalistirici, userId: string, ozetler: string[]): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    UPDATE users SET mfa_kurtarma_kodlari = ${ozetler}::text[]
     WHERE id = ${userId}::uuid AND mfa_enabled
  `);
}

/**
 * 2FA'yı tamamen kaldırır (kullanıcının kendisi ya da yönetici sıfırlaması).
 *
 * `RETURNING id` ile SATIR döndürüyor: yönetici yolu bunu bağlamlı (RLS)
 * istemciyle çağırıyor ve görünmeyen bir kullanıcıda sıfır satır,
 * "sıfırlandı" değil "bulunamadı" demek.
 */
export async function ikiAdimiKaldir(db: SorguCalistirici, userId: string): Promise<number> {
  const r = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE users
       SET mfa_enabled = false,
           mfa_secret_enc = NULL,
           mfa_kurtarma_kodlari = ARRAY[]::text[],
           mfa_son_adim = NULL,
           mfa_acilis = NULL,
           mfa_basarisiz_deneme = 0,
           mfa_kilit_bitis = NULL
     WHERE id = ${userId}::uuid
    RETURNING id
  `);
  return r.length;
}

/** Şirket zorunluluğu. RLS altında çağrılıyor: politika yalnızca o şirketin yöneticisine izin veriyor. */
export async function sirketZorunluYaz(db: SorguCalistirici, orgId: string, zorunlu: boolean): Promise<number> {
  const r = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE organizations SET iki_adim_zorunlu = ${zorunlu}, updated_at = now()
     WHERE id = ${orgId}::uuid
    RETURNING id
  `);
  return r.length;
}

export async function sirketOku(
  db: SorguCalistirici,
  orgId: string,
): Promise<{ ad: string; zorunlu: boolean } | null> {
  const r = await db.$queryRaw<Array<{ ad: string; z: boolean }>>(Prisma.sql`
    SELECT name AS ad, iki_adim_zorunlu AS z FROM organizations WHERE id = ${orgId}::uuid
  `);
  const s = r[0];
  return s ? { ad: s.ad, zorunlu: s.z === true } : null;
}
