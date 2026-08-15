/**
 * Müşteri ve veri sıfırlama — TEMİZ BAŞLANGIÇ.
 *
 * NEDEN VAR: müşteri başına bağlantı modelinde her yeni bağlantı, erişilebilen
 * TÜM hesapları o müşteriye yazıyor. Dört müşteriye bağlanınca veritabanında
 * 1.134 reklam hesabı birikti ve aynı hesap dört ayrı müşteride mükerrer
 * duruyor; Çiftçi Grup'un hesabı Ege Birlik Yapı'nın altında görünüyor.
 * Tek tek düzeltmek yerine sıfırdan başlamak daha az hatalı.
 *
 * PANELDEN YAPILAMAZ. `DELETE /clients/:id` uç noktası ARŞİVLİYOR, silmiyor —
 * ve bu doğru bir varsayılan: gündelik kullanımda müşteriyi kalıcı silmek
 * geçmiş harcama verisini de götürür. Kalıcı silme bilinçli bir ops işi
 * olduğu için burada, ayrı bir script olarak duruyor.
 *
 * NE SİLİNİR: müşteriler ve onlara zincirleme bağlı her şey — platform
 * bağlantıları, reklam hesapları, kampanyalar, metrikler, bütçeler, kurallar,
 * formlar, potansiyel müşteriler, görseller, ÜYELİKLER.
 *
 * NE KALIR: kullanıcılar, organizasyon, marka profili, denetim kaydı.
 * Kullanıcılar kalır ama hiçbir müşteriye yetkileri kalmaz — müşteriler
 * yeniden oluşturulduğunda yetkiler de yeniden verilecek.
 *
 * VARSAYILAN KURU ÇALIŞMA. `--apply` olmadan tek satır silinmiyor. Geri
 * dönüşü olmayan bir işlemin yanlışlıkla çalışması, bu projede kabul
 * edilebilecek en pahalı hata.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api db:reset-clients            (ne silineceğini yazar)
 *   pnpm --filter @advetics/api db:reset-clients -- --apply (siler)
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const APPLY = ARGV.includes('--apply');

async function counts() {
  const [clients, connections, adAccounts, campaigns, insights, memberships, users] =
    await Promise.all([
      prisma.client.count(),
      prisma.platformConnection.count(),
      prisma.adAccount.count(),
      prisma.campaign.count(),
      prisma.insightsDaily.count(),
      prisma.membership.count(),
      prisma.user.count(),
    ]);
  return { clients, connections, adAccounts, campaigns, insights, memberships, users };
}

async function main(): Promise<void> {
  const before = await counts();

  console.log('\nMüşteri ve veri sıfırlama');
  console.log('─'.repeat(60));
  console.log(`  müşteri              ${before.clients}`);
  console.log(`  platform bağlantısı  ${before.connections}`);
  console.log(`  reklam hesabı        ${before.adAccounts}`);
  console.log(`  kampanya             ${before.campaigns}`);
  console.log(`  metrik satırı        ${before.insights}`);
  console.log(`  üyelik               ${before.memberships}`);
  console.log(`\n  KALACAK kullanıcı    ${before.users}`);

  // Kullanıcı adlarını yazıyoruz: "kullanıcılar kalacak" cümlesine güvenmek
  // yerine KİMLERİN kalacağını görmek, yanlış veritabanına bağlanıldığını da
  // ortaya çıkarır.
  const users = await prisma.user.findMany({
    select: { email: true },
    orderBy: { email: 'asc' },
  });
  for (const u of users) console.log(`      ${u.email}`);

  if (before.clients === 0) {
    console.log('\n  Silinecek müşteri yok.\n');
    return;
  }

  if (!APPLY) {
    console.log(`\n  KURU ÇALIŞMA — hiçbir şey silinmedi.`);
    console.log(`\n  ÖNCE YEDEK AL. Silinen metrik verisi Meta'da 37 aylık`);
    console.log(`  sınıra takılıyor ve Google'da yeniden çekmek kota harcıyor.`);
    console.log(`\n  Silmek için:`);
    console.log(`      pnpm --filter @advetics/api db:reset-clients -- --apply\n`);
    return;
  }

  console.log('\n  Siliniyor…');

  /**
   * TEK SİLME, GERİSİ ZİNCİRLEME.
   *
   * `clients` satırını silmek yeterli: şemadaki `onDelete: Cascade`
   * ilişkileri bağlantıları, hesapları, kampanyaları, metrikleri ve
   * üyelikleri de düşürüyor. Tabloları elle sırayla silmek, bir tanesini
   * atlayınca yetim satır bırakırdı — ve yetim satır, bir sonraki kurulumda
   * "bu hesap zaten var" diye kendini gösterir.
   */
  /**
   * METRİKLER AYRI SİLİNİYOR — cascade onlara ULAŞMIYOR.
   *
   * `insights_daily` BÖLÜMLENMİŞ (partitioned) bir tablo ve şemadaki
   * `onDelete: Cascade` veritabanı seviyesinde uygulanmamış. Üretimde
   * doğrulandı: 14 müşteri silindikten sonra 11.222 metrik satırı olduğu gibi
   * kaldı ve artık var olmayan müşterilere işaret ediyordu.
   *
   * ÖNCE metrikler, SONRA müşteriler. Ters sırada da çalışırdı ama müşteriler
   * gittikten sonra "hangi satırlar yetim" sorusu ancak `NOT EXISTS` ile
   * cevaplanabilirdi; burada zaten hepsi silineceği için sıra sadece niyeti
   * okunur kılıyor.
   */
  const insightsDeleted = await prisma.insightsDaily.deleteMany({});
  console.log(`  ${insightsDeleted.count} metrik satırı silindi (cascade ulaşmıyor)`);

  const deleted = await prisma.client.deleteMany({});

  const after = await counts();

  /**
   * ORGANİZASYON GENELİ ÜYELİK KALIR ve bu DOĞRU.
   *
   * `client_id = null` olan üyelik (org yöneticisi) hiçbir müşteriye bağlı
   * değil, dolayısıyla zincirleme silinmiyor. Silinseydi hello@profaj.com
   * hiçbir yetkisi olmadan kalırdı: panele girer ama müşteri bile
   * oluşturamazdı — yani sıfırlamadan sonra sistemi kimse toparlayamazdı.
   *
   * İlk sürümde kontrol bunu hesaba katmıyordu ve üretimde YANLIŞ ALARM
   * verdi. Beklenen bir kalıntıyı hata saymak, gerçek hatanın yanında
   * durduğunda ikisini de güvenilmez yapıyor.
   */
  const orgWide = await prisma.membership.count({ where: { clientId: null } });

  console.log(`\nÖzet`);
  console.log('─'.repeat(60));
  console.log(`  ${deleted.count} müşteri silindi`);
  console.log(`  reklam hesabı   ${before.adAccounts} → ${after.adAccounts}`);
  console.log(`  kampanya        ${before.campaigns} → ${after.campaigns}`);
  console.log(`  metrik satırı   ${before.insights} → ${after.insights}`);
  console.log(`  bağlantı        ${before.connections} → ${after.connections}`);
  console.log(`  üyelik          ${before.memberships} → ${after.memberships}`);
  console.log(`  kullanıcı       ${before.users} → ${after.users}  (değişmemeli)`);
  console.log(`\n  ${orgWide} organizasyon geneli üyelik KASITLI olarak duruyor —`);
  console.log(`  onsuz hiç kimse müşteri oluşturamazdı.`);

  // Zincirleme silmenin gerçekten çalıştığını DOĞRULUYORUZ. Bir tablo geride
  // kalırsa sessizce kalırdı ve ancak yeni kurulumda tuhaf bir hata olarak
  // ortaya çıkardı.
  const leftovers = [
    ['reklam hesabı', after.adAccounts],
    ['kampanya', after.campaigns],
    ['metrik satırı', after.insights],
    ['bağlantı', after.connections],
    // Yalnızca MÜŞTERİYE BAĞLI üyelikler sıfırlanmalı.
    ['müşteriye bağlı üyelik', after.memberships - orgWide],
  ].filter(([, n]) => (n as number) > 0);

  if (leftovers.length > 0) {
    console.log(`\n  ! ZİNCİRLEME SİLME EKSİK KALDI:`);
    for (const [label, n] of leftovers) console.log(`      ${label}: ${n} satır duruyor`);
    console.log(`    Bu satırların müşterisi yok demektir — şemada eksik bir`);
    console.log(`    cascade olabilir. Devam etmeden önce bakılmalı.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Temiz. Sıradaki adım: panelden müşteri oluştur, sonra`);
  console.log(`  Platform Bağlantıları'ndan hesapları bağla.\n`);
}

main()
  .catch((err) => {
    console.error('\n✗ Sıfırlama başarısız:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
