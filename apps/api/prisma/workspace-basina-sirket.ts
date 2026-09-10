/**
 * ═══ HER WORKSPACE'E KENDİ ŞİRKETİ ═══
 *
 * Hiyerarşi Ajans › Şirket › Workspace olarak kuruldu ama VERİ hâlâ eski
 * düzende: workspace'lerin tamamı ajansın kendi organizasyonunda duruyor.
 * Bu script her workspace için bir şirket açıp workspace'i oraya taşıyor.
 *
 * ┌─ NEDEN PANELDEN DEĞİL ────────────────────────────────────────────────┐
 * │ Panelde "şirket aç" ve "workspace taşı" ayrı ayrı VAR. Kırk workspace  │
 * │ için seksen tıklama, her biri tam sayfa yüklemesi ve arada yarım kalan │
 * │ bir taşımanın iki şirketin verisini birden yanlış yapması riski.       │
 * │ Bir kerelik toplu işin yeri script.                                   │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ═══ VARSAYILAN KURU ÇALIŞMA ═══
 *
 * `--apply` olmadan TEK SATIR yazılmıyor. Bu iş 30 tabloda `org_id`
 * güncelliyor ve geri alma yolu yok (workspace'i geri taşımak mümkün ama
 * silinen şirketleri geri getirmek değil). `reset-clients.ts` ile aynı kural.
 *
 * ═══ HANGİ WORKSPACE TAŞINIR ═══
 *
 *   · AJANSIN KENDİ şirketindeki (ev şirketi) HER workspace — sayısı kaç
 *     olursa olsun. Ajans organizasyonu bir kabuk olmalı; içinde müşteri
 *     verisi tutması bu ayrımın var olma sebebine aykırı.
 *   · Başka bir şirkette BİRDEN ÇOK workspace varsa hepsi — o şirket de
 *     kabuk kalıyor. Hangisinin kalacağına script karar veremez ve
 *     "birincisi kalsın" demek keyfî bir seçim olurdu.
 *
 * TEK WORKSPACE'İ OLAN (ev olmayan) ŞİRKET DOKUNULMADAN KALIYOR: zaten
 * istenen düzende ve ona yeni bir şirket açmak, aynı şeyin ikinci kopyasını
 * üretmek olurdu. Script bu yüzden TEKRAR ÇALIŞTIRILABİLİR — ikinci koşumda
 * yapacak iş bulamaz.
 *
 * ═══ KULLANICILAR DA TAŞINIYOR — VE BU KRİTİK ═══
 *
 * `users.org_id` bir workspace'e değil ORGANİZASYONA bağlı, o yüzden
 * `workspaceTasi` onu taşımıyor (doğru: panelden yapılan tek bir taşımada
 * kullanıcıyı taşımak yanlış olurdu).
 *
 * Ama bu toplu işte taşımamak KİLİTLENME üretiyor ve yol şu:
 * `TenantContextService` aktif şirketi `users.org_id`den çözüyor, üyelikleri
 * o şirkete süzüyor ve hiçbiri kalmazsa "Bu şirkete erişim yetkiniz tanımlı
 * değil" ile 401 atıyor. Yani workspace'i taşıyıp müşterinin KENDİ giriş
 * hesabını ajansta bırakmak, o hesabı GİRİŞTE kilitliyor — üyeliği artık
 * başka bir şirkette ve üst hesabı olmadığı için oraya geçemiyor.
 *
 * Taşınan kullanıcı: `org_id`si kaynak şirket olan, ÜST HESAP ÜYELİĞİ
 * BULUNMAYAN ve BÜTÜN üyelikleri bu workspace'e bağlı olan kullanıcı.
 * Bir üyeliği bile başka yere bakıyorsa taşınmıyor — ve taşınmadığı için
 * erişimini kaybedecekse RAPORDA UYARI olarak yazılıyor.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api db:workspace-sirketleri              (kuru)
 *   pnpm --filter @advetics/api db:workspace-sirketleri -- --apply   (uygula)
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';
import { workspaceTasi } from '../src/modules/manager-account/workspace-tasima';
import { isOrgScopedRole } from '@advetics/shared';
import { uniqueSlug } from '../src/common/utils/slug';
/*
 * KARARLAR AYRI DOSYADA — ÇÜNKÜ BU DOSYA İMPORT EDİLİNCE ÇALIŞIYOR.
 *
 * Script en altta `main()` çağırıyor ve modül seviyesinde bir
 * `PrismaClient` kuruyor; testten import etmek, testin veritabanına
 * bağlanıp taşımayı BAŞLATMASI demekti. Kararlar saf ve ayrı olunca
 * çalıştırılarak sınanabiliyorlar.
 */
import {
  kullanicilariAyir,
  sirketBosaltilsinMi,
  type KullaniciGirdisi,
} from './workspace-sirket-karari';

loadEnv({ path: resolve(__dirname, '../../../.env') });

/*
 * `DIRECT_DATABASE_URL` — havuzlanmış bağlantı DEĞİL. Taşıma uzun
 * transaction'lar açıyor ve havuz üzerinden koşan bir istemci, oturum
 * değişkenlerini başka bir bağlantıda bulabiliyor.
 */
const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const APPLY = ARGV.includes('--apply');

interface Plan {
  clientId: string;
  clientAdi: string;
  kaynakOrgId: string;
  kaynakOrgAdi: string;
  yeniSirketAdi: string;
  yeniSlug: string;
  /** Bu workspace ile birlikte taşınacak kullanıcılar. */
  tasinanKullanicilar: Array<{ id: string; email: string; rol: string }>;
}

interface Uyari {
  metin: string;
}

async function main(): Promise<void> {
  console.log(APPLY ? '⚠  UYGULAMA MODU — veri yazılacak\n' : 'KURU ÇALIŞMA — hiçbir şey yazılmayacak (--apply ile uygula)\n');

  /*
   * ÜST HESAP ŞART. Şirketler ancak bir üst hesabın altında açılabiliyor
   * (`organizations.manager_account_id`) ve panelin şirket seçicisi de o
   * bağı okuyor. Üst hesap yokken açılan bir şirket hiçbir yerde
   * görünmezdi.
   */
  const hesap = await prisma.managerAccount.findFirst({
    where: { status: 'active' },
    select: { id: true, name: true },
  });
  if (!hesap) {
    console.error(
      'Aktif bir üst hesap yok. Önce panelden Sistem Yönetimi › Şirketler ekranında üst hesabı kur.',
    );
    process.exitCode = 1;
    return;
  }

  /*
   * EV ŞİRKETİ = üst hesabın SAHİBİNİN organizasyonu.
   *
   * Şemada "ajansın kendi şirketi" diye bir kolon yok; bağ üyelik üzerinden
   * kuruluyor (`manager_memberships.role = 'owner'` → o kullanıcının
   * `users.org_id`si). Tahmin etmek yerine buradan okumak, yanlış şirketi
   * boşaltma riskini ortadan kaldırıyor.
   */
  const sahip = await prisma.managerMembership.findFirst({
    where: { managerAccountId: hesap.id, role: 'owner' },
    select: { userId: true, user: { select: { orgId: true, email: true } } },
  });
  if (!sahip) {
    console.error('Üst hesabın sahibi bulunamadı — ev şirketi belirlenemiyor.');
    process.exitCode = 1;
    return;
  }
  const evOrgId = sahip.user.orgId;

  const sirketler = await prisma.organization.findMany({
    where: { managerAccountId: hesap.id, status: 'active' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      clients: {
        where: { status: { not: 'archived' } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      },
    },
  });

  console.log(`Üst hesap: ${hesap.name}`);
  console.log(`Ev şirketi: ${sirketler.find((o) => o.id === evOrgId)?.name ?? evOrgId} (${sahip.user.email})`);
  console.log(`Şirket sayısı: ${sirketler.length}\n`);

  /*
   * Üst hesabın üyeleri — yeni şirketlerde onlara org geneli üyelik açılıyor.
   *
   * ROL ORG GENELİ OLMAK ZORUNDA. `memberships` üzerindeki CHECK kısıtı
   * `client_id IS NOT NULL OR role <> 'client_viewer'` diyor: org geneli bir
   * `client_viewer` satırı yazmak veritabanı tarafından reddedilir ve o
   * workspace'in TAMAMI geri alınırdı. Süzgeç `isOrgScopedRole`tan okunuyor,
   * rol adları buraya KOPYALANMIYOR — kural genişlediğinde bu kod
   * kendiliğinden doğru kalsın.
   */
  const ustHesapUyeleri = (
    await prisma.managerMembership.findMany({
      where: { managerAccountId: hesap.id },
      select: { userId: true, role: true },
    })
  ).filter((u) => isOrgScopedRole(u.role));

  const planlar: Plan[] = [];
  const uyarilar: Uyari[] = [];
  /* Slug çakışması kuru çalışmada da görünsün diye plan içinde biriktiriliyor. */
  const alinanSluglar = new Set<string>();

  for (const org of sirketler) {
    if (!sirketBosaltilsinMi(org.id === evOrgId, org.clients.length)) continue;

    for (const client of org.clients) {
      const slug = await uniqueSlug(client.name, async (aday) => {
        if (alinanSluglar.has(aday)) return true;
        return Boolean(
          await prisma.organization.findUnique({ where: { slug: aday }, select: { id: true } }),
        );
      });
      alinanSluglar.add(slug);

      const { tasinacak, kalanRiskli } = kullanicilariAyir(
        await workspaceKullanicilari(org.id, client.id),
        client.id,
      );
      for (const k of kalanRiskli) {
        uyarilar.push({
          metin:
            `${k.email}: üyelikleri birden çok workspace'e dağılmış, taşınmıyor. ` +
            `Bu workspace taşındıktan sonra GİRİŞ YAPAMAYABİLİR — yetkilerini elden düzenle.`,
        });
      }

      planlar.push({
        clientId: client.id,
        clientAdi: client.name,
        kaynakOrgId: org.id,
        kaynakOrgAdi: org.name,
        yeniSirketAdi: client.name,
        yeniSlug: slug,
        tasinanKullanicilar: tasinacak,
      });
    }
  }

  if (planlar.length === 0) {
    console.log('Taşınacak workspace yok — her workspace zaten kendi şirketinde.');
    return;
  }

  console.log(`PLAN — ${planlar.length} workspace, ${planlar.length} yeni şirket:\n`);
  for (const p of planlar) {
    const k =
      p.tasinanKullanicilar.length === 0
        ? 'kullanıcı taşınmıyor'
        : `${p.tasinanKullanicilar.length} kullanıcı: ${p.tasinanKullanicilar
            .map((u) => `${u.email} (${u.rol})`)
            .join(', ')}`;
    console.log(`  · "${p.clientAdi}"  ${p.kaynakOrgAdi} → yeni şirket "${p.yeniSirketAdi}" [${p.yeniSlug}]`);
    console.log(`      ${k}`);
  }

  if (uyarilar.length > 0) {
    console.log(`\n⚠  ${uyarilar.length} UYARI:`);
    for (const u of uyarilar) console.log(`  · ${u.metin}`);
  }

  if (!APPLY) {
    console.log('\nKuru çalışma bitti. Uygulamak için: -- --apply');
    return;
  }

  console.log('\nUygulanıyor…\n');
  let basarili = 0;
  const hatalar: string[] = [];

  for (const p of planlar) {
    try {
      /*
       * WORKSPACE BAŞINA TEK TRANSACTION.
       *
       * Hepsini tek transaction'a koymak, kırkıncıda düşen bir taşımanın
       * otuz dokuz başarılıyı da geri alması demekti. Workspace başına
       * bölmek, kısmi başarıyı MÜMKÜN ama GÖRÜNÜR yapıyor: her satırın
       * sonucu ayrı yazılıyor ve script tekrar çalıştırılabilir.
       */
      await prisma.$transaction(
        async (tx) => {
          const yeniOrg = await tx.organization.create({
            data: {
              name: p.yeniSirketAdi,
              slug: p.yeniSlug,
              managerAccountId: hesap.id,
            },
            select: { id: true },
          });

          /*
           * ÜST HESAP ÜYELERİNE ORG GENELİ ÜYELİK.
           *
           * `TenantContextService` üst hesap rolünden sentetik bir üyelik
           * türetebiliyor, yani teknik olarak şart değil. Yine de yazılıyor:
           * "Ekip & Yetkiler" ekranı gerçek `memberships` satırlarını
           * listeliyor ve satır yoksa yeni şirket "kimsenin erişimi yok"
           * görünür — doğru olmayan ve kullanıcıyı yetki eklemeye iten bir
           * cümle.
           */
          for (const uye of ustHesapUyeleri) {
            await tx.membership.create({
              data: {
                userId: uye.userId,
                orgId: yeniOrg.id,
                clientId: null,
                role: uye.role,
              },
            });
          }

          const sonuc = await workspaceTasi(
            { $executeRaw: (sql: Prisma.Sql) => tx.$executeRaw(sql) },
            p.clientId,
            p.kaynakOrgId,
            yeniOrg.id,
          );

          /*
           * KULLANICILAR TAŞIMADAN SONRA. Önce taşımak, `memberships`
           * satırları hâlâ eski org'dayken kullanıcıyı yeni org'a atmak
           * olurdu — arada bir an için kullanıcı hiçbir yere bakmıyor.
           * Aynı transaction içinde olduğu için dışarıdan görünmüyor ama
           * sıra yine de doğru olan.
           */
          if (p.tasinanKullanicilar.length > 0) {
            await tx.user.updateMany({
              where: { id: { in: p.tasinanKullanicilar.map((u) => u.id) } },
              data: { orgId: yeniOrg.id },
            });
          }

          await tx.auditLog.create({
            data: {
              orgId: yeniOrg.id,
              clientId: p.clientId,
              actorType: 'system',
              actorId: sahip.userId,
              actorLabel: 'workspace-basina-sirket',
              action: 'manager_account.workspace_moved',
              targetType: 'client',
              targetId: p.clientId,
              before: { organizationId: p.kaynakOrgId },
              after: {
                organizationId: yeniOrg.id,
                tasinan: sonuc.tasinan,
                kullanicilar: p.tasinanKullanicilar.map((u) => u.email),
              },
            },
          });

          console.log(
            `  ✓ "${p.clientAdi}" → "${p.yeniSirketAdi}" (${sonuc.toplam} satır, ` +
              `${p.tasinanKullanicilar.length} kullanıcı)`,
          );
        },
        /*
         * VARSAYILAN 5 SANİYE YETMİYOR: 30 tabloda UPDATE ve büyük bir
         * workspace'te `leads` tek başına on binlerce satır.
         */
        { timeout: 120_000, maxWait: 120_000 },
      );
      basarili += 1;
    } catch (e) {
      /*
       * BİR HATA DÖNGÜYÜ KESMİYOR. Kesseydi listenin kuyruğu hiç denenmemiş
       * olur ve kullanıcı "otuz tanesi olmadı" görüp tekrar denerken ilk
       * onda çakışma yerdi. Script tekrar çalıştırılabilir olduğu için
       * kalanları ikinci koşumda tamamlamak güvenli.
       */
      const mesaj = e instanceof Error ? e.message : String(e);
      hatalar.push(`"${p.clientAdi}": ${mesaj}`);
      console.error(`  ✗ "${p.clientAdi}": ${mesaj}`);
    }
  }

  console.log(`\n${basarili}/${planlar.length} workspace taşındı.`);
  if (hatalar.length > 0) {
    console.log(`${hatalar.length} tanesi başarısız — script tekrar çalıştırılabilir.`);
    process.exitCode = 1;
  }
}

/** Kaynak şirketteki, bu workspace'e üyeliği olan kullanıcılar. */
async function workspaceKullanicilari(
  kaynakOrgId: string,
  clientId: string,
): Promise<KullaniciGirdisi[]> {
  return prisma.user.findMany({
    where: {
      orgId: kaynakOrgId,
      memberships: { some: { clientId } },
    },
    select: {
      id: true,
      email: true,
      memberships: { select: { clientId: true, role: true } },
      /*
       * `@@unique([userId])` olduğu için pratikte tek satır ama ilişki
       * ÇOKLU tanımlı (`managerMemberships`); tekil sanıp okumak
       * derlenmiyor.
       */
      managerMemberships: { select: { id: true } },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
