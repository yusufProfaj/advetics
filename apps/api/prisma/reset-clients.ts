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
 * KULLANICILAR AYRI BİR BAYRAKLA SİLİNİYOR (`--purge-users`) ve varsayılan
 * DEĞİL. Müşterileri sıfırlamak ile ajans personelini silmek iki ayrı karar;
 * ikisini tek bayrağa bağlamak, "müşterileri temizleyeyim" diyen birinin
 * ekibini de silmesi demekti.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api db:reset-clients                          (kuru)
 *   pnpm --filter @advetics/api db:reset-clients -- --apply               (müşteriler)
 *   pnpm --filter @advetics/api db:reset-clients -- --apply --purge-users (+ kullanıcılar)
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const APPLY = ARGV.includes('--apply');
const PURGE_USERS = ARGV.includes('--purge-users');

/**
 * SİLİNMEYECEK KULLANICILAR — ajans yöneticileri.
 *
 * Liste KODDA, argümanda değil: komut satırında yazılan bir e-posta yanlış
 * yazılırsa o kullanıcı da silinir ve panele girecek kimse kalmaz. Burada
 * durunca değişmesi bir commit gerektiriyor.
 */
const KORUNAN_EPOSTALAR = [
  'hello@profaj.com',
  'yusuf@profaj.com',
  'ecem@profaj.com',
] as const;

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
    select: { id: true, email: true },
    orderBy: { email: 'asc' },
  });

  const korunacak = users.filter((u) => KORUNAN_EPOSTALAR.includes(u.email as never));
  const silinecekKullanicilar = PURGE_USERS
    ? users.filter((u) => !KORUNAN_EPOSTALAR.includes(u.email as never))
    : [];

  if (!PURGE_USERS) {
    for (const u of users) console.log(`      ${u.email}`);
  } else {
    console.log(`\n  KALACAK (${korunacak.length}):`);
    for (const u of korunacak) console.log(`      ${u.email}`);
    console.log(`\n  SİLİNECEK kullanıcı (${silinecekKullanicilar.length}):`);
    for (const u of silinecekKullanicilar) console.log(`      ${u.email}`);
  }

  /**
   * KORUNAN E-POSTALARIN HİÇBİRİ YOKSA DUR.
   *
   * Bu kontrol yanlış veritabanına bağlanmayı ve e-posta yazım hatasını aynı
   * anda yakalıyor. Olmasaydı: liste hiçbir kullanıcıyla eşleşir, "hepsi
   * silinecek" olur ve uygulandığında panele girebilecek TEK BİR hesap bile
   * kalmazdı — geri dönüşü veritabanına elle SQL yazmak olan bir hâl.
   */
  if (PURGE_USERS && korunacak.length === 0) {
    console.log(`\n  ! DURDURULDU: korunacak e-postaların hiçbiri bu veritabanında yok.`);
    console.log(`    Aranan: ${KORUNAN_EPOSTALAR.join(', ')}`);
    console.log(`    Yanlış veritabanına bağlanmış olabilirsin. Hiçbir şey silinmedi.\n`);
    process.exitCode = 1;
    return;
  }

  /**
   * ERKEN ÇIKIŞ YALNIZCA HER ŞEY TEMİZSE.
   *
   * İlk sürüm "müşteri yoksa çıkış" diyordu ve üretimde tam olarak yanlış
   * anda devreye girdi: müşteriler zaten silinmişti ama 11.222 YETİM metrik
   * satırı duruyordu. Script "silinecek müşteri yok" deyip çıktı ve asıl
   * temizlenmesi gereken şeye hiç dokunmadı.
   *
   * Yetim metrikler müşterisiz kalabiliyor çünkü `insights_daily` bölümlenmiş
   * bir tablo ve cascade oraya ulaşmıyor. Yani "müşteri sayısı" bu script'in
   * yapacak işi olup olmadığını söyleyen doğru ölçüt değil.
   */
  if (before.clients === 0 && before.insights === 0 && silinecekKullanicilar.length === 0) {
    console.log('\n  Zaten temiz — silinecek müşteri, metrik ve kullanıcı yok.\n');
    return;
  }

  if (before.clients === 0) {
    console.log('\n  Müşteri yok, ama YETİM METRİK var — müşterisi silinmiş satırlar.');
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
   * ═══ TASLAK AĞACI EN BAŞTA — TEK `RESTRICT` ENGELİ BURADA ═══
   *
   * `draft_ads.creative_id` → `ad_creatives` bağı `onDelete: Restrict`.
   * Müşteri silinince iki cascade dalı birden işliyor — biri
   * `ad_creatives`'e, diğeri `draft_campaigns`'e — ve Postgres kreatifi
   * silmeye kalkınca ona işaret eden taslak reklam engeli tetikliyor:
   *
   *     Foreign key constraint violated: draft_ads_creative_id_fkey
   *
   * ÜRETİMDE YAŞANDI ve script YARIDA kaldı: metrikler silinmiş, müşteriler
   * duruyordu. Taslak ağacını önce silmek engeli kaldırıyor; `draft_campaigns`
   * silinince `draft_ad_groups` ve `draft_ads` zincirleme gidiyor.
   */
  const draftsDeleted = await prisma.draftCampaign.deleteMany({});
  console.log(`  ${draftsDeleted.count} taslak kampanya silindi (RESTRICT engeli kaldırıldı)`);

  /**
   * MÜŞTERİLER — kampanyalar ve müşteriye bağlı üyelikler zincirleme gidiyor.
   *
   * BAĞLANTILAR VE REKLAM HESAPLARI ARTIK GİTMİYOR ve bu DOĞRU. Bağlantı
   * modeli ajans seviyesine taşındıktan sonra ikisi de organizasyona ait;
   * müşteri silindiğinde `client_id` NULL'a düşüyor (`ON DELETE SET NULL`) ve
   * hesap ajansın HAVUZUNA geri dönüyor. Cascade bıraksaydık bir müşteriyi
   * silmek, ajansın kendi Meta bağlantısını ve 157 hesabın kaydını da
   * götürürdü.
   *
   * Metrikler yine HARİÇ; yukarıda ayrıca siliniyorlar.
   */
  const deleted = await prisma.client.deleteMany({});
  console.log(`  ${deleted.count} müşteri silindi`);

  /**
   * METRİKLER MÜŞTERİLERDEN SONRA — SIRA BİLİNÇLİ OLARAK DEĞİŞTİ.
   *
   * `insights_daily` BÖLÜMLENMİŞ bir tablo ve şemadaki `onDelete: Cascade`
   * veritabanı seviyesinde uygulanmamış: müşteri silinince satırlar olduğu
   * gibi kalıyor (üretimde doğrulandı — 14 müşteri sonrası 11.222 yetim
   * satır). Bu yüzden ayrıca siliniyor.
   *
   * ÖNCE METRİK SİLMEK YANLIŞTI. Öyleydi ve üretimde şu oldu: 4.340 metrik
   * satırı silindi, ardından müşteri silme RESTRICT engeline takıldı ve
   * script düştü. Sonuç: metrik verisi gitti, müşteriler durdu — yani en
   * pahalı yarısı yapıldı, işe yarayan yarısı yapılmadı. Metrik verisi
   * Meta'da 37 aylık sınıra takılıyor ve Google'da yeniden çekmek kota
   * harcıyor; müşteri satırı ise ucuz.
   *
   * RİSKLİ ADIM ÖNCE, PAHALI ADIM SONRA: müşteri silme düşerse metrikler
   * hâlâ yerinde ve tekrar denenebilir.
   */
  const insightsDeleted = await prisma.insightsDaily.deleteMany({});
  console.log(`  ${insightsDeleted.count} metrik satırı silindi (cascade ulaşmıyor)`);

  /**
   * ═══ KULLANICI SİLME — ÖNCE `RESTRICT` ENGELLERİ ÇÖZÜLÜYOR ═══
   *
   * TEK yabancı anahtar `ON DELETE RESTRICT`:
   * `platform_connections.connected_by_user_id`.
   *
   * (`invitations.created_by_id` de RESTRICT'ti ama tablo
   * `20260816090000_drop_invitations` ile düşürüldü — davet akışı
   * kaldırılmıştı.)
   *
   * Yani bağlantıyı kuran kullanıcıyı silmek Postgres tarafından REDDEDİLİR
   * ve script yarıda patlar — müşteriler silinmiş, kullanıcılar durur, ortada
   * yarım bir sıfırlama kalır.
   *
   * SATIRLAR SİLİNMİYOR, DEVREDİLİYOR. Bağlantı ajansa ait ve CANLI: onu
   * silmek 157 hesabın kaydını ve yayındaki boost'ların hesap bağını
   * götürürdü. "Kim bağladı" alanı bir denetim bilgisi ve devredilmesi
   * bilgiyi bulanıklaştırıyor — ama bağlantıyı kaybetmekten iyi. Devir
   * ekranda YAZILIYOR, sessizce yapılmıyor.
   */
  if (silinecekKullanicilar.length > 0) {
    const kalanAdmin = korunacak[0]!;
    const silinecekIdler = silinecekKullanicilar.map((u) => u.id);

    const devredilenBaglanti = await prisma.platformConnection.updateMany({
      where: { connectedByUserId: { in: silinecekIdler } },
      data: { connectedByUserId: kalanAdmin.id },
    });
    if (devredilenBaglanti.count > 0) {
      console.log(
        `  ${devredilenBaglanti.count} platform bağlantısının "kuran kullanıcı" alanı ` +
          `${kalanAdmin.email} üzerine alındı (silinemezdi: ON DELETE RESTRICT)`,
      );
    }

    const silinenKullanici = await prisma.user.deleteMany({
      where: { id: { in: silinecekIdler } },
    });
    console.log(`  ${silinenKullanici.count} kullanıcı silindi`);
  }

  const after = await counts();
  const pooled = await prisma.adAccount.count({ where: { clientId: null } });

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
  console.log(`  reklam hesabı   ${before.adAccounts} → ${after.adAccounts}  (havuza döndü: ${pooled})`);
  console.log(`  kampanya        ${before.campaigns} → ${after.campaigns}`);
  console.log(`  metrik satırı   ${before.insights} → ${after.insights}`);
  console.log(`  bağlantı        ${before.connections} → ${after.connections}  (ajansa ait, silinmiyor)`);
  console.log(`  üyelik          ${before.memberships} → ${after.memberships}`);
  console.log(
    `  kullanıcı       ${before.users} → ${after.users}` +
      (PURGE_USERS ? `  (yalnızca yöneticiler kaldı)` : `  (değişmemeli)`),
  );
  console.log(`\n  ${orgWide} organizasyon geneli üyelik KASITLI olarak duruyor —`);
  console.log(`  onsuz hiç kimse müşteri oluşturamazdı.`);

  /**
   * KALINTI KONTROLÜ — beklenen kalıntı hata sayılmıyor.
   *
   * Bağlantılar ve reklam hesapları AJANSA ait; müşteri silinince kalmaları
   * doğru davranış. Onları da listeye koymak, her sıfırlamada kırmızı bir
   * "ZİNCİRLEME SİLME EKSİK KALDI" uyarısı üretirdi. Bu betik zaten bir kez,
   * organizasyon geneli üyelik yüzünden aynı yanlış alarmı verdi: beklenen bir
   * kalıntıyı hata saymak, gerçek hatanın yanında durduğunda ikisini de
   * güvenilmez yapıyor.
   *
   * BEKLENMEYEN kalıntı hâlâ hata: müşterisi silinmiş bir kampanya ya da
   * metrik satırı gerçekten eksik bir cascade demek.
   */
  const leftovers = [
    ['kampanya', after.campaigns],
    ['metrik satırı', after.insights],
    // Yalnızca MÜŞTERİYE BAĞLI üyelikler sıfırlanmalı.
    ['müşteriye bağlı üyelik', after.memberships - orgWide],
    // Havuza dönmeyen, yani hâlâ silinmiş bir müşteriye işaret eden hesap.
    ['müşterisi kalmış reklam hesabı', after.adAccounts - pooled],
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
  console.log(`  havuzdaki ${pooled} hesabı müşterilere ata.\n`);
}

main()
  .catch((err) => {
    console.error('\n✗ Sıfırlama başarısız:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
