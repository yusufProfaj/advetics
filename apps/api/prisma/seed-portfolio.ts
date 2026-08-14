/**
 * Müşteri portföyü ve ekip seed'i.
 *
 * TEMEL SEED'DEN AYRI (`seed.ts`). O, boş bir kuruluma organizasyon ve tek bir
 * sahip kullanıcı açıyor ve her ortamda çalışması gerekiyor. Bu ise Profaj'a
 * özgü gerçek müşteri listesi — başka bir kurulumda çalıştırılması anlamsız.
 *
 * PAROLALAR DOSYADA YOK.
 *
 * Ortam değişkeninden okunuyor. Seed dosyası git'te duruyor ve repoya erişimi
 * olan herkes tarafından kalıcı olarak okunabilir; oraya gerçek bir parola
 * yazmak, o parolayı sonsuza kadar sızdırmak demek. Silinse bile git geçmişinde
 * kalır.
 *
 * Kurulan parolalar GEÇİCİ sayılıyor: `mustChangePassword` işaretleniyor.
 *
 * DİKKAT — BU BAYRAK ŞU AN HİÇBİR ŞEY YAPMIYOR. Alan veritabanına yazılıyor
 * ama `apps/api/src` ve `apps/web/src` altında onu OKUYAN tek bir satır yok:
 * kullanıcı uyarı görmüyor, giriş engellenmiyor, parola değiştirmeye
 * zorlanmıyor. Bu yorum önce "kullanıcı panelde uyarı görüyor" diyordu ve
 * yanlıştı — okuyan kişiye var olmayan bir korumaya güvendiriyordu.
 *
 * Yani seed ile kurulan parolalar süresiz geçerli. Zorlama yazılana kadar
 * ilk giriş sonrası parolayı ELLE değiştirmek gerekiyor.
 *
 * Kullanım:
 *   SEED_ADMIN_PASSWORD=… SEED_YUSUF_PASSWORD=… SEED_ECEM_PASSWORD=… \
 *     pnpm --filter @advetics/api db:seed-portfolio
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * ÜÇ SEVİYE YUKARI — depo kökü. `../.env` DEĞİL.
 *
 * Monorepo'da tek bir .env var ve kökte duruyor; API, panel ve bütün prisma
 * script'leri oradan besleniyor. Bu dosya tek başına `apps/api/.env` arıyordu
 * ve orada dosya olmadığı için Prisma "Environment variable not found:
 * DATABASE_URL" diyerek düşüyordu — hata mesajı .env'in yanlış yerde
 * arandığını değil, değişkenin hiç tanımlanmadığını söylüyor ve insanı
 * doğrudan yanlış yere bakmaya gönderiyor.
 *
 * Bu seed bugüne kadar hiç çalıştırılmamıştı; hata da o yüzden ortaya
 * çıkmamıştı. `seed-env-path.spec.ts` artık bütün prisma script'lerini tarayıp
 * aynı yolu kullandıklarını doğruluyor.
 */
loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

// -----------------------------------------------------------------------------
// Portföy tanımı
// -----------------------------------------------------------------------------

interface PortfolioClient {
  name: string;
  /** Meta reklam hesabı kimlikleri — `act_` öneki OLMADAN. */
  meta: string[];
  /**
   * Google müşteri kimlikleri.
   *
   * TİRELİ YAZILIYOR çünkü Google arayüzü böyle gösteriyor ve elle
   * karşılaştırırken hata payı düşüyor. Normalleştirme aşağıda, tek yerde.
   */
  google: string[];
}

/**
 * Profaj'ın gerçek müşteri portföyü.
 *
 * ÇOKLU HESAP NORMAL. Bir müşterinin birden fazla projesi olabiliyor ve her
 * projenin ayrı reklam hesabı var — Özemeksan'ın iki Google hesabı, Maxra'nın
 * iki Meta + iki Google hesabı gibi. Bütçe ve kural katmanları bunu zaten
 * hesap bazında ayrıştırıyor.
 */
const PORTFOLIO: PortfolioClient[] = [
  { name: 'Sabancı İnşaat', meta: ['966706145588095'], google: ['172-466-7356'] },
  { name: 'Mirnas Bahçeşehir', meta: ['1162592277944506'], google: ['623-659-0656'] },
  { name: 'Ege Birlik Yapı', meta: ['1602474151544739'], google: ['169-512-9827'] },
  { name: 'Fenbay İnşaat', meta: ['1440875763569185'], google: ['202-019-3566'] },
  {
    name: 'Özemeksan İnşaat',
    meta: ['349600382288370'],
    google: ['742-791-9792', '210-666-8491'],
  },
  { name: 'Mia Yapı', meta: ['163829292468614'], google: ['535-021-3746'] },
  { name: 'Mia Interior', meta: ['1867450843718358'], google: ['708-032-9143'] },
  { name: 'Çiftçi Grup', meta: ['1451760409788859'], google: ['325-662-2131'] },
  {
    name: 'Maxra Govana + Bridal',
    meta: ['820888420038679', '347988120977279'],
    google: ['920-179-8507', '168-583-2401'],
  },
  { name: 'Klimar MHI', meta: ['1587938228838375'], google: ['582-235-4473'] },
  { name: 'Metropol Hastanesi', meta: ['546573854496462'], google: ['577-617-7029'] },
  { name: 'Metropol Karşıyaka', meta: ['863684482642190'], google: ['475-798-9527'] },
];

interface SeedUser {
  email: string;
  fullName: string;
  passwordEnv: string;
  /** `null` = organizasyon geneli (Master Admin). */
  role: 'owner' | 'manager';
  /** Portföy — yalnızca `manager` için. Master Admin zaten hepsini görüyor. */
  clients: string[] | null;
}

const USERS: SeedUser[] = [
  {
    email: 'hello@profaj.com',
    fullName: 'Profaj Yönetim',
    passwordEnv: 'SEED_ADMIN_PASSWORD',
    /**
     * MASTER ADMIN = `owner`.
     *
     * Yeni bir rol TANIMLANMADI. Mevcut matriste `owner` zaten "her şey +
     * faturalama + organizasyon silme" demek ve org geneli erişim
     * `client_id IS NULL` üyelikle sağlanıyor. İkinci bir "master admin" rolü
     * eklemek, iki yetki listesini senkron tutma yükü getirirdi ve ikisi
     * zamanla ayrışırdı.
     */
    role: 'owner',
    clients: null,
  },
  {
    email: 'yusuf@profaj.com',
    fullName: 'Yusuf Algan',
    passwordEnv: 'SEED_YUSUF_PASSWORD',
    role: 'manager',
    // Tüm portföy — spec'te bu 12 müşteri Yusuf Bey'e atanıyor.
    clients: PORTFOLIO.map((c) => c.name),
  },
  {
    email: 'ecem@profaj.com',
    fullName: 'Ecem',
    passwordEnv: 'SEED_ECEM_PASSWORD',
    role: 'manager',
    /**
     * BOŞ PORTFÖY ve bu bilinçli.
     *
     * Spec Ecem'e müşteri atamıyor. Boş bırakmak, izolasyonun gerçekten
     * çalıştığını doğrulamanın en iyi yolu: giriş yapıyor, hiçbir müşteri
     * görmüyor. Emin olmadığımız bir atamayı varsaymak, birinin görmemesi
     * gereken veriyi görmesi demek olurdu.
     */
    clients: [],
  },
];

// -----------------------------------------------------------------------------

/** `172-466-7356` → `1724667356`. Google kimlikleri veritabanında tiresiz. */
function normalizeGoogleId(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Meta hesap kimliğinin veritabanında bulunabileceği İKİ biçim.
 *
 * `ad_accounts.external_id` Meta'da `act_` ÖNEKİYLE saklanıyor: keşif
 * `/me/adaccounts` yanıtındaki `id` alanını olduğu gibi yazıyor ve Meta orayı
 * `act_966706145588095` diye dolduruyor (meta.provider.ts, `listAdAccounts`).
 *
 * Bu seed ise kimlikleri ÖNEKSİZ tutuyor — Meta arayüzü ve Business Manager
 * onları öyle gösteriyor, elle karşılaştırırken hata payı düşük. İkisi
 * eşleşmiyordu: 13 Meta hesabının 13'ü de "VERİTABANINDA YOK" dönüyordu,
 * oysa hepsi oradaydı ve panelde çalışıyordu. 14 Google hesabının 14'ü
 * bulunduğu için sorun "bağlantı kurulmamış" gibi de görünmüyordu.
 *
 * İKİ BİÇİMİ DE ARIYORUZ, tek birini "doğru" ilan etmiyoruz. `act_X` ile `X`
 * aynı hesap, aralarında belirsizlik yok; hangi biçimin yazıldığını tahmin
 * etmek yerine ikisini de kabul etmek, eski satırlara ve ileride keşif
 * tarafında yapılacak bir normalleştirmeye karşı da dayanıklı.
 *
 * Bu tuzak bu projede DÖRDÜNCÜ kez çıkıyor (bkz. CLAUDE.md "tekrar eden
 * teknik tuzaklar"). Mevcut kaynak taraması testi yalnızca meta.provider.ts'yi
 * taradığı için buraya ulaşmıyordu; `seed-portfolio-meta-id.spec.ts` bu
 * dosyayı da kilitliyor.
 */
/*
 * EXPORT EDİLMİYOR ve bu bilinçli. Bu modülün en altında `main()` doğrudan
 * çağrılıyor; dosyayı bir testten import etmek SEED'İ ÇALIŞTIRIR — üstelik
 * gerçek veritabanında. Bu yüzden davranış import ile değil, kaynak
 * taramasıyla kilitleniyor (`seed-portfolio-meta-id.spec.ts`).
 */
function metaIdCandidates(raw: string): string[] {
  const bare = raw.startsWith('act_') ? raw.slice('act_'.length) : raw;
  return [bare, `act_${bare}`];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function main(): Promise<void> {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) {
    throw new Error(
      'Organizasyon bulunamadı. Önce temel seed çalışmalı:\n' +
        '  pnpm --filter @advetics/api db:seed',
    );
  }
  console.log(`\nOrganizasyon: ${org.name}\n`);

  // ---------------------------------------------------------------------------
  // Müşteriler
  // ---------------------------------------------------------------------------
  console.log('Müşteriler');
  console.log('─'.repeat(60));

  const clientId = new Map<string, string>();
  for (const entry of PORTFOLIO) {
    const slug = slugify(entry.name);
    const client = await prisma.client.upsert({
      where: { orgId_slug: { orgId: org.id, slug } },
      update: { name: entry.name },
      create: {
        orgId: org.id,
        name: entry.name,
        slug,
        status: 'active',
        timezone: 'Europe/Istanbul',
        reportingCurrency: 'TRY',
      },
    });
    clientId.set(entry.name, client.id);
    console.log(`  ✓ ${entry.name}`);
  }

  // ---------------------------------------------------------------------------
  // Reklam hesabı eşlemesi
  // ---------------------------------------------------------------------------
  console.log('\nReklam hesabı eşlemesi');
  console.log('─'.repeat(60));

  /**
   * HESAP OLUŞTURULMUYOR, YALNIZCA BAĞLANIYOR.
   *
   * `ad_accounts` satırları OAuth keşfinden geliyor ve bir `connection_id`
   * taşıyor. Seed ile uydurma bir satır açmak, bağlantısı olmayan bir hesap
   * yaratmak demek: senkronizasyon onu her turda deneyip başarısız olurdu ve
   * panelde var olmayan bir hesap görünürdü.
   *
   * Bulunamayan hesaplar RAPORLANIYOR. Sessizce atlamak, "12 müşteri kuruldu"
   * deyip yarısının hesapsız olduğunu gizlemek olurdu.
   */
  let linked = 0;
  const missing: string[] = [];

  for (const entry of PORTFOLIO) {
    const targetClientId = clientId.get(entry.name)!;
    const wanted: Array<{ platform: 'meta' | 'google'; externalIds: string[]; shown: string }> = [
      ...entry.meta.map((id) => ({
        platform: 'meta' as const,
        externalIds: metaIdCandidates(id),
        shown: id,
      })),
      ...entry.google.map((id) => ({
        platform: 'google' as const,
        externalIds: [normalizeGoogleId(id)],
        shown: id,
      })),
    ];

    for (const w of wanted) {
      const account = await prisma.adAccount.findFirst({
        where: { platform: w.platform, externalId: { in: w.externalIds } },
        select: { id: true, name: true, clientId: true },
      });

      if (!account) {
        missing.push(`${entry.name} · ${w.platform} ${w.shown}`);
        continue;
      }

      if (account.clientId === targetClientId) {
        console.log(`  = ${entry.name} · ${w.platform} ${w.shown} (zaten bağlı)`);
        continue;
      }

      await prisma.adAccount.update({
        where: { id: account.id },
        data: { clientId: targetClientId },
      });
      linked++;
      console.log(`  → ${entry.name} · ${w.platform} ${w.shown} — ${account.name}`);
    }
  }

  if (missing.length > 0) {
    console.log(`\n  ! ${missing.length} hesap VERİTABANINDA YOK:`);
    for (const m of missing) console.log(`      ${m}`);
    console.log(
      '\n    Sebebi genelde şu: o platform bağlantısı henüz kurulmamış ya da\n' +
        '    hesap listesi yenilenmemiş. Panelden Platform Bağlantıları →\n' +
        '    "Hesapları yenile" çalıştırıp bu seed\'i tekrar koş.\n',
    );
  }

  // ---------------------------------------------------------------------------
  // Kullanıcılar ve yetkiler
  // ---------------------------------------------------------------------------
  console.log('\nKullanıcılar');
  console.log('─'.repeat(60));

  for (const u of USERS) {
    const password = process.env[u.passwordEnv];
    if (!password || password.length < 12) {
      throw new Error(
        `${u.passwordEnv} tanımlı değil ya da 12 karakterden kısa.\n` +
          `  ${u.email} için parola ortam değişkeninden okunuyor — seed dosyasında parola SAKLANMIYOR.`,
      );
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: u.email.toLowerCase() } },
      update: {
        passwordHash,
        fullName: u.fullName,
        status: 'active',
        // Parola her seed çalıştırmasında yeniden kuruluyor ve yine geçici.
        mustChangePassword: true,
      },
      create: {
        orgId: org.id,
        email: u.email.toLowerCase(),
        fullName: u.fullName,
        passwordHash,
        status: 'active',
        mustChangePassword: true,
      },
    });

    /**
     * ÜYELİKLER ÖNCE SİLİNİYOR.
     *
     * Portföy değiştiğinde eski atamalar kalırsa kullanıcı artık kendisine ait
     * olmayan müşterileri görmeye devam eder — ve bu sessiz bir yetki
     * sızıntısı olur. Seed portföyün TAM hâlini temsil ediyor.
     */
    await prisma.membership.deleteMany({ where: { userId: user.id } });

    if (u.clients === null) {
      // ORG GENELİ ÜYELİK: `client_id = NULL`. Veritabanı kısıtı bunu yalnızca
      // owner/admin için kabul ediyor (memberships_org_scope_role_chk).
      await prisma.membership.create({
        data: { orgId: org.id, userId: user.id, clientId: null, role: u.role },
      });
      console.log(`  ✓ ${u.email} — ${u.role} · TÜM müşteriler`);
    } else {
      for (const name of u.clients) {
        const cid = clientId.get(name);
        if (!cid) continue;
        await prisma.membership.create({
          data: { orgId: org.id, userId: user.id, clientId: cid, role: u.role },
        });
      }
      console.log(
        `  ✓ ${u.email} — ${u.role} · ${u.clients.length} müşteri` +
          (u.clients.length === 0 ? ' (portföy boş)' : ''),
      );
    }
  }

  console.log('\nÖzet');
  console.log('─'.repeat(60));
  console.log(`  ${PORTFOLIO.length} müşteri · ${linked} hesap bağlandı · ${missing.length} eksik`);
  console.log('  Tüm parolalar GEÇİCİ — kullanıcılar ilk girişte değiştirmeli.\n');
}

main()
  .catch((err) => {
    console.error('\n✗ Seed başarısız:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
