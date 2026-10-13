/**
 * ═══ YİNELENEN GOOGLE BAĞLANTILARI — PLAN VE UYGULAMA (SAF, SINANABİLİR) ═══
 *
 * Betik (`yinelenen-baglanti-temizle.ts`) içe aktarılınca veritabanına
 * bağlanıyor; kararlar burada ve bir sorgu çalıştırıcısı alıyor, böylece
 * PGlite ile ÇALIŞTIRILARAK sınanıyor (`yinelenen-baglanti-temizle.spec.ts`).
 *
 * NE OLDU (2026-10-13 üretim): "Ölçüm izinlerini ver" ajansın Google
 * bağlantısını tazelemek yerine kullanıcının o an bulunduğu MÜŞTERİ
 * şirketinde yeni bir bağlantı açtı (üç deneme, üç şirket) ve keşif her
 * birinde ajans havuzunun kopyasını (133–134 hesap) o şirketin havuzuna
 * yazdı. Kod düzeltildi; bu dosya kalan çöpü kaldırıyor.
 *
 * ═══ NEDEN SİLME, NEDEN "AJANS BAĞLANTISINA ÇEVİR" DEĞİL ═══
 *
 * `ad_accounts` tekil anahtarı `(platform, external_id, org_id)`: aynı
 * hesabın ajans şirketinde ZATEN bir satırı var (havuzda ya da bir
 * workspace'e ödünç). Kopyanın bağlantısını ajansa çevirmek, ajansın
 * hesabını MÜŞTERİ şirketinin havuzunda bırakmak olurdu ve havuz kendi
 * şirketine açık (`app.havuz_kapsaminda`): Metropol'ün yöneticisi ajansın
 * 134 hesabını görüp kendi workspace'ine atayabilirdi (CLAUDE.md "HAVUZUN
 * İKİ SAHİBİ VAR"). Kopya satır bilgi taşımıyor; doğru olan kaldırmak.
 *
 * ═══ NEYE DOKUNULMAZ — ve sayısıyla yazılır ═══
 *   · ATANMIŞ satır (`client_id` dolu): biri karar vermiş; raporlanır.
 *   · Bağlantıdan ÖNCE var olan satır: keşif onun bağlantısını kopyaya
 *     geçirmiş olabilir (atanmamış satırda K3 korumuyor); asıl sahibi
 *     bilinmiyor, silmek meşru bir satırı götürür.
 *   · BAĞIMLI verisi olan satır: tablolar elle yazılmadı, KATALOGDAN
 *     okunuyor (yabancı anahtarlar + `ad_account_id` adlı her kolon;
 *     `sync_jobs.ad_account_id`nin yabancı anahtarı yok). Liste elle
 *     yazılsaydı yarın eklenen bir tablo sessizce cascade ile giderdi.
 *   · İzlemesi açık satır.
 *   · Ajans şirketinde KARŞILIĞI olmayan satır: kopya değil, tek kayıt.
 * Bağlantı ancak üzerinde atanmış satır ve başka bağımlı kayıt
 * (`veri_kaynaklari` vb.) kalmıyorsa iptal ediliyor.
 *
 * GOOGLE'DA TOKEN İPTAL EDİLMİYOR ve bu bilinçli: Google'ın iptal ucu
 * kullanıcının bu uygulamaya verdiği BÜTÜN izni kaldırıyor. Kopyayı açan
 * Google kullanıcısı ajansın kişisiyse, panelden "Bağlantıyı kaldır"
 * (`disconnect` → `revokeOnPlatform`) ajansın bağlantısını da öldürür.
 * Betik yalnız kendi kaydımızı kapatıyor.
 */
import { Prisma } from '@prisma/client';

export interface Sorgucu {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
}

interface Bagimli {
  tablo: string;
  kolon: string;
}

export interface SatirPlani {
  /** Silinecek satır kimlikleri. */
  silinecek: string[];
  atlanan: {
    oncedenVardi: string[];
    bagimliVar: Array<{ id: string; tablolar: string[] }>;
    izlemeAcik: string[];
    ajanstaKarsiligiYok: string[];
  };
  /** Atanmış (dokunulmayan) satırlar. */
  atanmis: string[];
}

export interface BaglantiPlani {
  id: string;
  sirket: string;
  orgId: string;
  kimlik: string;
  kuruldu: string;
  hesaplar: SatirPlani;
  profiller: SatirPlani;
  /** Bağlantıya bakan diğer tablolar (oauth_states hariç): tablo → satır sayısı. */
  digerBagimlilar: Record<string, number>;
  iptal: { yapilacak: true } | { yapilacak: false; sebep: string };
}

export interface Plan {
  baglantilar: BaglantiPlani[];
  /** Bulunamayan ya da güvenlik koşulunu geçmeyen kimlikler ve sebebi. */
  reddedilen: Array<{ id: string; sebep: string }>;
}

const TANIMLAYICI = /^[a-z_][a-z0-9_]*$/;
const kimlikAdi = (ad: string): Prisma.Sql => {
  // Katalogdan geliyor ama SQL'e ham giriyor: biçim dışıysa hiç çalıştırma.
  if (!TANIMLAYICI.test(ad)) throw new Error(`Beklenmeyen tablo/kolon adı: ${ad}`);
  return Prisma.raw(`"${ad}"`);
};

/**
 * Bir tabloya bakan bütün kolonlar: tek kolonlu ya da kompozit yabancı
 * anahtarın `id`ye bakan kolonu + verilen addaki her kolon (FK'sız olanlar).
 */
async function bakanKolonlar(db: Sorgucu, hedefTablo: string, kolonAdi: string, haric: string[]): Promise<Bagimli[]> {
  const rows = await db.$queryRaw<Bagimli[]>(Prisma.sql`
    SELECT DISTINCT cl.relname::text AS tablo, a.attname::text AS kolon
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      CROSS JOIN LATERAL unnest(c.conkey, c.confkey) AS k(yerel, uzak)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.yerel
      JOIN pg_attribute ua ON ua.attrelid = c.confrelid AND ua.attnum = k.uzak
     WHERE c.contype = 'f' AND n.nspname = 'public'
       AND c.confrelid = to_regclass(${'public.' + hedefTablo}::text)
       AND ua.attname = 'id'
    UNION
    SELECT table_name::text, column_name::text
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = ${kolonAdi} AND table_name <> ${hedefTablo}`);
  return rows.filter((r) => !haric.includes(r.tablo));
}

/** Verilen satırlardan hangilerinin hangi tablolarda bağımlısı var. */
async function bagimlilar(db: Sorgucu, kolonlar: Bagimli[], idler: string[]): Promise<Map<string, string[]>> {
  const sonuc = new Map<string, string[]>();
  if (idler.length === 0) return sonuc;
  for (const b of kolonlar) {
    const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT ${kimlikAdi(b.kolon)}::text AS id FROM ${kimlikAdi(b.tablo)}
       WHERE ${kimlikAdi(b.kolon)}::text = ANY(${idler}::text[])`);
    for (const r of rows) sonuc.set(r.id, [...(sonuc.get(r.id) ?? []), `${b.tablo}.${b.kolon}`]);
  }
  return sonuc;
}

async function satirPlani(
  db: Sorgucu,
  tablo: 'ad_accounts' | 'social_profiles',
  baglanti: { id: string; orgId: string; ajansOrgId: string; kuruldu: Date },
): Promise<SatirPlani> {
  const t = kimlikAdi(tablo);
  const ayniTur = tablo === 'ad_accounts' ? Prisma.sql`AND a.platform = s.platform` : Prisma.sql`AND a.profile_type = s.profile_type`;
  /*
   * KARŞILIK = AJANSIN (iptal edilmemiş) BAĞLANTISINDAN gelen aynı hesap,
   * hangi şirkette durursa dursun. Satırın kendi şirketine bakmak yetmezdi:
   * ajansın ATADIĞI hesap org kolonunu müşteri şirketine ödünç taşıyor ve
   * yalnız ajans şirketine bakan bir sorgu onu "karşılığı yok" sayardı.
   */
  const satirlar = await db.$queryRaw<
    Array<{ id: string; client_id: string | null; created_at: Date; sync_enabled: boolean; karsilik: boolean }>
  >(Prisma.sql`
    SELECT s.id::text, s.client_id::text, s.created_at, s.sync_enabled,
           EXISTS (SELECT 1 FROM ${t} a JOIN platform_connections pc ON pc.id = a.connection_id
                    WHERE pc.org_id = ${baglanti.ajansOrgId}::uuid AND pc.revoked_at IS NULL
                      AND a.external_id = s.external_id ${ayniTur}
                      AND a.id <> s.id) AS karsilik
      FROM ${t} s
     WHERE s.connection_id = ${baglanti.id}::uuid
     ORDER BY s.created_at, s.id`);

  const plan: SatirPlani = {
    silinecek: [],
    atlanan: { oncedenVardi: [], bagimliVar: [], izlemeAcik: [], ajanstaKarsiligiYok: [] },
    atanmis: [],
  };
  const havuz = satirlar.filter((s) => {
    if (s.client_id !== null) {
      plan.atanmis.push(s.id);
      return false;
    }
    return true;
  });
  const kolonAdi = tablo === 'ad_accounts' ? 'ad_account_id' : 'social_profile_id';
  const bag = await bagimlilar(db, await bakanKolonlar(db, tablo, kolonAdi, []), havuz.map((s) => s.id));
  for (const s of havuz) {
    if (new Date(s.created_at).getTime() < baglanti.kuruldu.getTime()) plan.atlanan.oncedenVardi.push(s.id);
    else if (bag.has(s.id)) plan.atlanan.bagimliVar.push({ id: s.id, tablolar: bag.get(s.id)! });
    else if (s.sync_enabled) plan.atlanan.izlemeAcik.push(s.id);
    else if (!s.karsilik) plan.atlanan.ajanstaKarsiligiYok.push(s.id);
    else plan.silinecek.push(s.id);
  }
  return plan;
}

export async function temizlikPlani(db: Sorgucu, baglantiIdleri: string[]): Promise<Plan> {
  const plan: Plan = { baglantilar: [], reddedilen: [] };
  const digerKolonlar = await bakanKolonlar(db, 'platform_connections', 'connection_id', ['ad_accounts', 'social_profiles', 'oauth_states']);

  for (const id of baglantiIdleri) {
    const [c] = await db.$queryRaw<
      Array<{ id: string; org_id: string; sirket: string; platform: string; client_id: string | null; revoked: boolean; kimlik: string; kuruldu: Date; ajans_org_id: string | null; kurucu_org_id: string | null }>
    >(Prisma.sql`
      SELECT c.id::text, c.org_id::text, o.name AS sirket, c.platform::text, c.client_id::text,
             (c.revoked_at IS NOT NULL OR c.status = 'revoked') AS revoked, c.external_user_id AS kimlik,
             c.created_at AS kuruldu, m.ajans_org_id::text AS ajans_org_id, u.org_id::text AS kurucu_org_id
        FROM platform_connections c
        JOIN organizations o ON o.id = c.org_id
        LEFT JOIN manager_accounts m ON m.id = o.manager_account_id
        LEFT JOIN users u ON u.id = c.connected_by_user_id
       WHERE c.id::text = ${id}`);
    /*
     * GÜVENLİK KOŞULLARI — betik yalnız tarif edilen kopyaya dokunur. Yanlış
     * bir kimlik verilirse (ajansın kendi bağlantısı dahil) hiçbir şey yapmaz.
     */
    if (!c) plan.reddedilen.push({ id, sebep: 'bağlantı bulunamadı' });
    else if (c.platform !== 'google') plan.reddedilen.push({ id, sebep: `platform ${c.platform}, google değil` });
    else if (c.client_id !== null) plan.reddedilen.push({ id, sebep: 'workspace bağlantısı (client_id dolu), havuz kopyası değil' });
    else if (c.revoked) plan.reddedilen.push({ id, sebep: 'zaten iptal edilmiş' });
    else if (!c.ajans_org_id) plan.reddedilen.push({ id, sebep: 'şirketin ajansı bilinmiyor (üst hesap yok)' });
    else if (c.ajans_org_id === c.org_id) plan.reddedilen.push({ id, sebep: 'bağlantı AJANS şirketinde; kopya değil, asıl bağlantı' });
    /*
     * KOPYAYI AJANSIN KİŞİSİ AÇTI (Ajan 4, 2026-10-13). Müşteri şirketinin
     * KENDİ Google bağlantısı da `client_id` boş bir havuz bağlantısı ve
     * hesapları ajans havuzunda da durabiliyor (ajans MCC'den erişiyor):
     * "karşılığı var" süzgeci onları KOPYA sayar, betik müşterinin kendi
     * havuzunu siler ve bağlantısını kapatırdı. Yanlış kimlik verilmesine
     * karşı tek ayırt edici: kopyaları müşteri şirketine GEÇMİŞ ajans
     * yöneticisi açtı ve ev şirketi ajans.
     */
    else if (c.kurucu_org_id !== c.ajans_org_id)
      plan.reddedilen.push({ id, sebep: 'bağlantıyı ajans dışından biri kurmuş; şirketin KENDİ bağlantısı olabilir' });
    else {
      const b = { id: c.id, orgId: c.org_id, ajansOrgId: c.ajans_org_id, kuruldu: new Date(c.kuruldu) };
      const hesaplar = await satirPlani(db, 'ad_accounts', b);
      const profiller = await satirPlani(db, 'social_profiles', b);
      const digerBagimlilar: Record<string, number> = {};
      for (const k of digerKolonlar) {
        const [r] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM ${kimlikAdi(k.tablo)} WHERE ${kimlikAdi(k.kolon)}::text = ${c.id}`);
        if ((r?.n ?? 0) > 0) digerBagimlilar[`${k.tablo}.${k.kolon}`] = r!.n;
      }
      const kalanAtanmis = hesaplar.atanmis.length + profiller.atanmis.length;
      const iptal: BaglantiPlani['iptal'] =
        kalanAtanmis > 0
          ? { yapilacak: false, sebep: `${kalanAtanmis} atanmış satır bu bağlantıyı kullanıyor` }
          : Object.keys(digerBagimlilar).length > 0
            ? { yapilacak: false, sebep: `bağlantıya bakan kayıt var: ${Object.entries(digerBagimlilar).map(([t, n]) => `${t}=${n}`).join(', ')}` }
            : { yapilacak: true };
      plan.baglantilar.push({
        id: c.id,
        sirket: c.sirket,
        orgId: c.org_id,
        kimlik: c.kimlik,
        kuruldu: new Date(c.kuruldu).toISOString(),
        hesaplar,
        profiller,
        digerBagimlilar,
        iptal,
      });
    }
  }
  return plan;
}

export interface UygulamaSonucu {
  silinenHesap: number;
  silinenProfil: number;
  iptalEdilen: number;
}

/**
 * Planı uygular. ÇAĞIRAN TEK TRANSACTION AÇMALI ve plan O TRANSACTION
 * İÇİNDE yeniden kurulmalı (betik böyle yapıyor): kuru çalışma ile uygulama
 * arasında biri bir satırı atamış olabilir. Silme koşulu yine de satırın
 * hâlâ atanmamış ve aynı bağlantıda olduğunu SQL'de tekrar istiyor.
 */
export async function temizlikUygula(db: Sorgucu, plan: Plan): Promise<UygulamaSonucu> {
  const sonuc: UygulamaSonucu = { silinenHesap: 0, silinenProfil: 0, iptalEdilen: 0 };
  for (const b of plan.baglantilar) {
    if (b.profiller.silinecek.length > 0) {
      sonuc.silinenProfil += await db.$executeRaw(Prisma.sql`
        DELETE FROM social_profiles
         WHERE id::text = ANY(${b.profiller.silinecek}::text[])
           AND connection_id = ${b.id}::uuid AND client_id IS NULL`);
    }
    if (b.hesaplar.silinecek.length > 0) {
      sonuc.silinenHesap += await db.$executeRaw(Prisma.sql`
        DELETE FROM ad_accounts
         WHERE id::text = ANY(${b.hesaplar.silinecek}::text[])
           AND connection_id = ${b.id}::uuid AND client_id IS NULL AND sync_enabled = false`);
    }
    if (b.iptal.yapilacak) {
      // Panelin "Bağlantıyı kaldır"ı ile aynı son durum, Google çağrısı HARİÇ.
      sonuc.iptalEdilen += await db.$executeRaw(Prisma.sql`
        UPDATE platform_connections
           SET status = 'revoked', revoked_at = now(), access_token_enc = ''::bytea,
               refresh_token_enc = NULL, token_expires_at = NULL, authorization_expires_at = NULL,
               granted_scopes = '{}', updated_at = now()
         WHERE id = ${b.id}::uuid AND revoked_at IS NULL`);
      await db.$executeRaw(Prisma.sql`
        UPDATE ad_accounts SET sync_enabled = false, updated_at = now() WHERE connection_id = ${b.id}::uuid`);
    }
  }
  return sonuc;
}

/** Kuru çalışmanın ve uygulamanın ortak raporu — önce sayılar. */
export function planMetni(plan: Plan): string {
  const satir: string[] = [];
  const blok = (ad: string, p: SatirPlani) => {
    const havuz = p.silinecek.length + p.atlanan.oncedenVardi.length + p.atlanan.bagimliVar.length + p.atlanan.izlemeAcik.length + p.atlanan.ajanstaKarsiligiYok.length;
    satir.push(`  ${ad} — havuz (client_id boş): ${havuz}`);
    satir.push(`    silinecek (kopya, bağımlısı yok, ajansta karşılığı var): ${p.silinecek.length}`);
    satir.push(`    atlanan · bağlantıdan önce vardı: ${p.atlanan.oncedenVardi.length}`);
    satir.push(`    atlanan · bağımlı veri var: ${p.atlanan.bagimliVar.length}`);
    for (const x of p.atlanan.bagimliVar.slice(0, 10)) satir.push(`      ${x.id} → ${x.tablolar.join(', ')}`);
    if (p.atlanan.bagimliVar.length > 10) satir.push(`      … ${p.atlanan.bagimliVar.length - 10} satır daha (toplam ${p.atlanan.bagimliVar.length})`);
    satir.push(`    atlanan · izleme açık: ${p.atlanan.izlemeAcik.length}`);
    satir.push(`    atlanan · ajans şirketinde karşılığı yok: ${p.atlanan.ajanstaKarsiligiYok.length}`);
    satir.push(`  ${ad} — ATANMIŞ (dokunulmayacak): ${p.atanmis.length}`);
    for (const id of p.atanmis.slice(0, 10)) satir.push(`      ${id}`);
  };
  for (const b of plan.baglantilar) {
    satir.push(`Bağlantı ${b.id} · ${b.sirket} · kimlik ${b.kimlik} · kuruldu ${b.kuruldu}`);
    blok('reklam hesabı', b.hesaplar);
    blok('sosyal profil', b.profiller);
    const diger = Object.entries(b.digerBagimlilar);
    satir.push(`  bağlantıya bakan diğer kayıt: ${diger.length ? diger.map(([t, n]) => `${t}=${n}`).join(', ') : 'yok'}`);
    satir.push(`  bağlantı: ${b.iptal.yapilacak ? 'İPTAL EDİLECEK (revoked, token silinir, Google çağrısı YOK)' : `iptal ATLANIYOR — ${b.iptal.sebep}`}`);
    satir.push('');
  }
  for (const r of plan.reddedilen) satir.push(`REDDEDİLDİ ${r.id}: ${r.sebep}`);
  const toplam = (f: (b: BaglantiPlani) => number) => plan.baglantilar.reduce((s, b) => s + f(b), 0);
  satir.push(
    `TOPLAM: silinecek reklam hesabı ${toplam((b) => b.hesaplar.silinecek.length)}, ` +
      `silinecek sosyal profil ${toplam((b) => b.profiller.silinecek.length)}, ` +
      `iptal edilecek bağlantı ${plan.baglantilar.filter((b) => b.iptal.yapilacak).length} / ${plan.baglantilar.length}, ` +
      `dokunulmayan atanmış satır ${toplam((b) => b.hesaplar.atanmis.length + b.profiller.atanmis.length)}, ` +
      `reddedilen kimlik ${plan.reddedilen.length}`,
  );
  return satir.join('\n');
}
