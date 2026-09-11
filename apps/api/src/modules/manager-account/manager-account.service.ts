import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAKET_SINIRLARI, paketAsildiMi } from '@advetics/shared';
import type {
  ManagerPaket,
  CreateManagedOrganizationInput,
  CreateManagerAccountInput,
  DeleteOrganizationInput,
  ManagerAccountTree,
  MoveWorkspaceInput,
  UpdateManagerAccountInput,
  SilmeYaniti,
  SirketSilmeOzeti,
  TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { assertOrgAdmin } from '../../common/guards/permissions.guard';
import { uniqueSlug } from '../../common/utils/slug';
import { workspaceTasi, type WorkspaceTasimaSonucu } from './workspace-tasima';

/**
 * ═══ ÜST HESAP (MCC) ═══
 *
 * Bir danışmanlığın altındaki ŞİRKETLERİ tek girişle yönetmesini sağlıyor.
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 *
 * ┌─ NEDEN `PrismaAdminService` (RLS DIŞI) ────────────────────────────────┐
 * │ Bu servisin yazdığı satırlar, kullanıcının ERİŞEBİLDİĞİ ORGANİZASYON   │
 * │ KÜMESİNİ belirliyor — yani `app.current_org_id()`nin alabileceği       │
 * │ değerleri, yani BÜTÜN RLS'in sınırını. Bir politikanın kendi bekçisini │
 * │ yazması mümkün değil: `manager_accounts` satırını okuyabilmek için     │
 * │ önce ona üye olmak gerekiyor ve üyeliği yazan da aynı politika olurdu. │
 * │ `02_rls.sql` uygulama rolünden bu iki tabloya YAZMAYI GERİ ALIYOR;     │
 * │ yani yanlış yazılmış bir servis metodu bile buraya satır yazamaz.      │
 * │ Yetki kontrolü BU KATMANDA ve açık.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class ManagerAccountService {
  private readonly logger = new Logger(ManagerAccountService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  /**
   * AKTİF ÜST HESAP — bağlamdan, yeniden sorulmadan.
   *
   * Bu metot beş çağrı yerinin kopyaladığı üç satırı tek yere aldı. Önce
   * her biri `managerMembership.findUnique({ userId })` yazıyordu ve o
   * sorgu, bir kullanıcının BİRDEN ÇOK üst hesabı olabildiği andan itibaren
   * yanlış cevap veriyor: hangisi olduğunu söylemiyor.
   *
   * `TenantContextService` çerezi zaten doğrulayıp aktif hesabı seçiyor;
   * ikinci bir çözüm, ikisinin ayrışması demekti.
   */
  private async aktifUstHesap(
    ctx: TenantContext,
  ): Promise<{ id: string; paket: ManagerPaket }> {
    if (ctx.managerAccountId === null) {
      throw new BadRequestException('Önce bir üst hesap oluşturmalısın');
    }
    const hesap = await this.admin.managerAccount.findFirst({
      where: { id: ctx.managerAccountId, status: 'active' },
      select: { id: true, paket: true },
    });
    if (!hesap) throw new BadRequestException('Bu hesabın bağlı olduğu bir üst hesap yok');
    return hesap;
  }

  /** Kullanıcının üst hesabı ve altındaki şirketler. Yoksa null. */
  async get(ctx: TenantContext): Promise<ManagerAccountTree | null> {
    /*
     * AKTİF ÜST HESAP BAĞLAMDAN GELİYOR — YENİDEN SORULMUYOR.
     *
     * Burada `managerMembership`e bakmak, aynı kararı iki yerde tutmak
     * demekti: `TenantContextService` zaten çerezi doğrulayıp aktif hesabı
     * seçiyor. Bir kullanıcının birden çok üst hesabı olabildiği için
     * "üyeliğe bak" artık YANLIŞ CEVAP da veriyor — hangisi olduğunu
     * söylemiyor.
     */
    if (ctx.managerAccountId === null) return null;
    return this.agacOku(ctx.managerAccountId, ctx);
  }

  /**
   * Bir üst hesabın ağacını KİMLİKLE okur.
   *
   * `get()`ten ayrıldı çünkü `create()` de ona muhtaç: platform sahibi yeni
   * bir hesap açtığında `get(ctx)` hâlâ ESKİ (aktif) hesabı döndürüyordu —
   * bağlam o istekte değişmedi. Kullanıcı "oluştur"a basıp aynı ağacı
   * görür ve kurulmadığını sanırdı.
   */
  private async agacOku(
    managerAccountId: string,
    ctx: TenantContext,
  ): Promise<ManagerAccountTree | null> {
    const kayit = await this.admin.managerAccount.findUnique({
      where: { id: managerAccountId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        paket: true,
        organizations: {
          where: { status: 'active' },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            /*
             * ARŞİVLENMİŞLER HARİÇ. Panelde bir şirketin yanında
             * "4 workspace" yazıp içeri girince 2 tane görmek,
             * kullanıcının veri kaybettiğini sanması demek.
             */
            clients: {
              where: { status: { not: 'archived' } },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, status: true },
            },
          },
        },
      },
    });

    const hesap = kayit;
    // Askıya alınmış üst hesap YOK sayılıyor — `TenantContextService` de
    // geçişi kapatıyor, ekranın onu göstermesi ikisinin ayrışması olurdu.
    if (!hesap || hesap.status !== 'active') return null;

    return {
      id: hesap.id,
      name: hesap.name,
      slug: hesap.slug,
      paket: hesap.paket,
      organizations: hesap.organizations.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        workspaces: o.clients,
        isHome: o.id === ctx.orgId,
      })),
    };
  }

  /**
   * Üst hesabı AÇAR ve kullanıcının EV şirketini altına bağlar.
   *
   * Kurulum adımı: üst hesabı açan kişi onun `owner`ı oluyor. Rol
   * `ORG_SCOPED_ROLES` içinden seçilmek zorunda — `TenantContextService`
   * org geneli olmayan bir üst hesap rolünü YOK SAYIYOR (kardeş şirkette
   * hiç üyelik satırı olmadığı için sıfır workspace görürdü) ve bu, sebebi
   * hiçbir ekranda yazmayan bir çıkmaz üretirdi.
   */
  async create(ctx: TenantContext, input: CreateManagerAccountInput): Promise<ManagerAccountTree> {
    assertOrgAdmin(ctx);

    /*
     * ═══ PLATFORM SAHİBİ BİRDEN ÇOK ÜST HESAP KURABİLİYOR ═══
     *
     * Advetics'i işleten taraf üst hesabı bir ÜRÜN olarak satıyor; her
     * müşteri için bir tane açması gerekiyor. Normal bir org yöneticisi ise
     * kendi ajansını kuruyor ve İKİNCİSİNİN anlamı yok: ikinci bir hesap
     * açmak, birinci hesabın altındaki şirketleri görünmez yapardı (aktif
     * hesap tek) ve kullanıcı verisini kaybettiğini sanırdı.
     */
    if (!ctx.platformAdmin) {
      const mevcut = await this.admin.managerMembership.findFirst({
        where: { userId: ctx.userId },
        select: { id: true },
      });
      if (mevcut) {
        throw new ConflictException('Bu hesap zaten bir üst hesaba bağlı');
      }
    }

    /*
     * EV ŞİRKETİ KONTROLÜ DE PLATFORM SAHİBİNDE ATLANIYOR.
     *
     * Bir önceki turda yalnızca BAĞLAMA adımı atlanmıştı; bu kontrol
     * kalmıştı ve platform sahibinin ikinci hesabı hiç açılamazdı: Profaj'ın
     * ev şirketi zaten Profaj'ın üst hesabına bağlı ve "Bu şirket zaten bir
     * üst hesaba bağlı" ile düşerdi. Yol testsizdi; bu turda testi var.
     */
    const evSirketi = ctx.platformAdmin
      ? null
      : await this.admin.organization.findUniqueOrThrow({
          where: { id: ctx.orgId },
          select: { id: true, name: true, managerAccountId: true },
        });
    if (evSirketi?.managerAccountId) {
      throw new ConflictException('Bu şirket zaten bir üst hesaba bağlı');
    }

    const slug = await uniqueSlug(input.name, async (aday) =>
      Boolean(await this.admin.managerAccount.findUnique({ where: { slug: aday }, select: { id: true } })),
    );

    /*
     * ═══ PAKETİ YALNIZCA PLATFORM SAHİBİ SEÇEBİLİYOR ═══
     *
     * Kendi ajansını kuran bir org yöneticisi `baslangic` ile doğuyor.
     * Gönderilen paketi kabul etmek, satılan bir ürünün sınırını satın
     * alanın eline vermek demekti — uca elle istek atan herkes kendini
     * sınırsıza yükseltirdi.
     */
    const paket: ManagerPaket = ctx.platformAdmin ? (input.paket ?? 'baslangic') : 'baslangic';

    const hesapId = await this.admin.$transaction(async (tx) => {
      const hesap = await tx.managerAccount.create({
        data: { name: input.name, slug, paket },
        select: { id: true },
      });
      /*
       * ═══ EV ŞİRKETİ YALNIZCA KENDİ AJANSINI KURANDA BAĞLANIYOR ═══
       *
       * İki farklı iş aynı uçtan geçiyor:
       *   · ORG YÖNETİCİSİ kendi danışmanlığını kuruyor — ev şirketi onun
       *     ilk müşterisi ve altına bağlanıyor. Bugünkü davranış.
       *   · PLATFORM SAHİBİ SATMAK İÇİN hesap açıyor. Ev şirketini (yani
       *     Advetics'in kendi organizasyonunu) müşterinin üst hesabına
       *     bağlamak, Advetics'i o müşterinin portföyüne sokmak olurdu —
       *     ve kırk dokuz şirketli kendi ajansını da oradan koparırdı.
       */
      if (!ctx.platformAdmin && evSirketi) {
        await tx.organization.update({
          where: { id: evSirketi.id },
          data: { managerAccountId: hesap.id },
        });
      }
      /*
       * ÜYELİK HER İKİ HÂLDE DE YAZILIYOR. Platform sahibi zaten her hesaba
       * geçebiliyor ama üyelik, KURUCUNUN kim olduğunu kalıcı kılıyor:
       * platform yetkisi bir gün geri alınsa bile kurduğu hesaba erişimi
       * kalıyor ve o hesap sahipsiz kalmıyor.
       */
      await tx.managerMembership.create({
        data: { managerAccountId: hesap.id, userId: ctx.userId, role: 'owner' },
      });
      return hesap.id;
    });

    /*
     * `recordUnauthenticated` — `record` DEĞİL. `record` bir `withTenant`
     * transaction'ı (RLS'li `tx`) istiyor; bu servis bilerek RLS DIŞINDA
     * çalışıyor (yukarıdaki kutuya bak) ve `audit_logs`a yazan yol da o
     * yüzden admin istemcisini kullanan bu olmak zorunda.
     */
    await this.audit.recordUnauthenticated(ctx.orgId, {
      actorId: ctx.userId,
      action: 'manager_account.create',
      targetType: 'manager_account',
      targetId: hesapId,
      after: {
        name: input.name,
        slug,
        paket,
        // Platform sahibi kurduğunda ev şirketi BAĞLANMIYOR — kayıt bunu
        // açıkça yazıyor, "bağlandı" sanılmasın.
        homeOrganization: evSirketi?.name ?? null,
      },
    });

    /*
     * YENİ HESABIN AĞACI DÖNÜYOR — `get(ctx)` DEĞİL.
     *
     * Bağlam bu istekte hâlâ ESKİ aktif hesabı taşıyor (çerez henüz
     * değişmedi). `get(ctx)` platform sahibine az önce kurduğu değil,
     * içinde bulunduğu hesabı döndürür ve ekran "kurulmadı" gibi görünürdü.
     */
    const agac = await this.agacOku(hesapId, ctx);
    // Az önce yazdık; null dönerse sessizce boş dönmektense patlamak doğru.
    if (!agac) throw new BadRequestException('Üst hesap oluşturuldu ama okunamadı');
    return agac;
  }

  /**
   * Aktif üst hesabı düzenler — ad ve (platform sahibinde) paket.
   *
   * PAKET DEĞİŞİKLİĞİ REDDEDİLİYOR, YOK SAYILMIYOR. `create`teki gibi sessizce
   * düşürmek burada yanlış olurdu: "paketi değiştirdim" diyen bir kullanıcıya
   * 200 dönüp eski paketi bırakmak, önizlemenin yalan söylemesi.
   *
   * PAKET KÜÇÜLTÜLÜRKEN SINIR SINANIYOR: beş şirketli bir hesabı Başlangıç'a
   * (1 şirket) indirmek, mevcut dört şirketi "fazla" bırakırdı ve hiçbir
   * ekran o fazlalığı göstermiyor. Önce şirket kapatılır, sonra paket iner.
   */
  async update(ctx: TenantContext, input: UpdateManagerAccountInput): Promise<ManagerAccountTree> {
    assertOrgAdmin(ctx);
    const ustHesap = await this.aktifUstHesap(ctx);

    if (input.paket !== undefined && !ctx.platformAdmin) {
      throw new BadRequestException('Paketi yalnızca platform sahibi değiştirebilir');
    }
    if (input.paket !== undefined && input.paket !== ustHesap.paket) {
      const sinir = PAKET_SINIRLARI[input.paket].maxSirket;
      const mevcutSirket = await this.admin.organization.count({
        where: { managerAccountId: ustHesap.id, status: 'active' },
      });
      if (sinir !== null && mevcutSirket > sinir) {
        throw new BadRequestException(
          `${PAKET_SINIRLARI[input.paket].etiket} paketi en fazla ${sinir} şirket alıyor; ` +
            `bu hesapta ${mevcutSirket} şirket var. Önce şirket sayısını düşürmek gerekiyor.`,
        );
      }
    }

    const onceki = await this.admin.managerAccount.findUniqueOrThrow({
      where: { id: ustHesap.id },
      select: { name: true, paket: true },
    });
    await this.admin.managerAccount.update({
      where: { id: ustHesap.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.paket !== undefined ? { paket: input.paket } : {}),
      },
    });
    await this.audit.recordUnauthenticated(ctx.orgId, {
      actorId: ctx.userId,
      action: 'manager_account.update',
      targetType: 'manager_account',
      targetId: ustHesap.id,
      before: onceki,
      after: { name: input.name ?? onceki.name, paket: input.paket ?? onceki.paket },
    });

    const agac = await this.agacOku(ustHesap.id, ctx);
    if (!agac) throw new BadRequestException('Üst hesap güncellendi ama okunamadı');
    return agac;
  }

  /**
   * Üst hesabın altına YENİ bir şirket açar (MCC'de "alt hesap ekle").
   *
   * Açan kişi o şirketin `owner`ı oluyor — aksi hâlde şirket açılır ve
   * hiç kimse içine giremezdi. `Membership` satırı ŞART: kullanıcı ev
   * şirketine döndüğünde üst hesap rolü değil bu satır geçerli olacak.
   */
  async createOrganization(
    ctx: TenantContext,
    input: CreateManagedOrganizationInput,
  ): Promise<ManagerAccountTree> {
    assertOrgAdmin(ctx);

    const ustHesap = await this.aktifUstHesap(ctx);

    /*
     * ═══ PAKET KISITI — ŞİRKET SAYISI ═══
     *
     * Kısıt SAYILARI `PAKET_SINIRLARI` içinde, veritabanında değil: aynı
     * sayıyı iki yerde tutmak, birini güncelleyip diğerini unutmak demekti
     * ve fark yalnızca kısıtın yanlış uygulanmasıyla görünürdü.
     *
     * SAYIM ARŞİVLİLERİ DE İÇERİYOR mu? HAYIR — `status: 'active'`.
     * Arşivlenmiş bir şirket ekranda görünmüyor ve kotayı yemesi,
     * kullanıcının "sildim ama hâlâ dolu" demesi demekti.
     */
    const sinir = PAKET_SINIRLARI[ustHesap.paket].maxSirket;
    const mevcutSirket = await this.admin.organization.count({
      where: { managerAccountId: ustHesap.id, status: 'active' },
    });
    if (paketAsildiMi(sinir, mevcutSirket)) {
      throw new BadRequestException(
        `${PAKET_SINIRLARI[ustHesap.paket].etiket} paketi en fazla ${sinir} şirket ` +
          `açmaya izin veriyor (şu an ${mevcutSirket}). Paketi yükseltmek gerekiyor.`,
      );
    }

    const slug = await uniqueSlug(input.name, async (aday) =>
      Boolean(await this.admin.organization.findUnique({ where: { slug: aday }, select: { id: true } })),
    );

    const yeniOrgId = await this.admin.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug, managerAccountId: ustHesap.id },
        select: { id: true },
      });
      /*
       * ÜYELİK `clientId: null` İLE — org geneli. Yeni şirkette henüz hiç
       * workspace yok; workspace'e bağlı bir üyelik yazmak imkânsız ve org
       * geneli olmayan bir satır, şirketi açan kişiyi kendi şirketinden
       * dışarıda bırakırdı.
       */
      await tx.membership.create({
        data: { userId: ctx.userId, orgId: org.id, clientId: null, role: 'owner' },
      });
      return org.id;
    });

    await this.audit.recordUnauthenticated(ctx.orgId, {
      actorId: ctx.userId,
      action: 'manager_account.organization_create',
      targetType: 'organization',
      targetId: yeniOrgId,
      after: { name: input.name, slug, managerAccountId: ustHesap.id },
    });

    this.logger.log(`Üst hesap altına şirket açıldı: ${input.name} (${yeniOrgId})`);

    const agac = await this.get(ctx);
    if (!agac) throw new BadRequestException('Şirket oluşturuldu ama üst hesap okunamadı');
    return agac;
  }

  /**
   * ═══ ŞİRKET SİLME — ÖNCE NE GİDECEĞİ SAYILIYOR ═══
   *
   * `organizations` satırını silmek OTUZ tabloda cascade tetikliyor:
   * workspace'ler, reklam hesapları, KULLANICILAR, kampanyalar ve bütün
   * metrik geçmişi. Geri alma yolu yok — Meta 37 aylık sınıra takılıyor ve
   * Google'da yeniden çekmek kota harcıyor.
   *
   * "Emin misiniz?" diye sorup NE GİDECEĞİNİ söylememek, bu depoda
   * `reset-clients`in yarım kalıp metrik verisini götürmesiyle aynı sınıf
   * hata: pahalı yarısı yapılır, kullanıcı ne kaybettiğini sonra öğrenir.
   *
   * SAYI DEĞİL AD DÖNÜYOR (`workspaceAdlari`): "3 workspace" kimseye ne
   * kaybedeceğini söylemiyor.
   */
  async silmeOzeti(ctx: TenantContext, organizationId: string): Promise<SirketSilmeOzeti> {
    assertOrgAdmin(ctx);
    const org = await this.silinecekSirket(ctx, organizationId);

    const [workspaceler, reklamHesabi, kullanici, metrik] = await Promise.all([
      this.admin.client.findMany({
        where: { orgId: organizationId },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.admin.adAccount.count({ where: { orgId: organizationId } }),
      this.admin.user.count({ where: { orgId: organizationId } }),
      /*
       * METRİK GÜNÜ SAYILIYOR, SATIR DEĞİL. "412.877 satır" kimseye bir şey
       * anlatmıyor; "14 aylık ölçüm" kaybın büyüklüğünü söylüyor.
       */
      this.admin.$queryRaw<Array<{ n: bigint }>>(
        Prisma.sql`SELECT COUNT(DISTINCT date) AS n FROM insights_daily
                    WHERE client_id IN (SELECT id FROM clients WHERE org_id = ${organizationId}::uuid)`,
      ),
    ]);

    const metrikGunu = Number(metrik[0]?.n ?? 0);
    return {
      organizationId,
      name: org.name,
      workspaceAdlari: workspaceler.map((w) => w.name),
      reklamHesabi,
      kullanici,
      metrikGunu,
      /*
       * BOŞ ŞİRKET TEK TIKLA SİLİNİYOR.
       *
       * Yanlışlıkla açılmış bir test kaydı için ad yazdırmak angarya; içinde
       * veri olan bir şirkette aynı kolaylık, kazara yapılan ve geri
       * alınamayan bir silme demek. Eşik "kaybedilecek bir şey var mı".
       */
      adOnayiGerekli:
        workspaceler.length > 0 || reklamHesabi > 0 || kullanici > 0 || metrikGunu > 0,
      engel: await this.silmeEngeli(ctx, organizationId),
    };
  }

  /**
   * Şirketi ve altındaki her şeyi KALICI olarak siler.
   *
   * ┌─ NEDEN ÜÇ KAPI ───────────────────────────────────────────────────────┐
   * │ 1. EV ŞİRKETİ SİLİNEMEZ. `users.org_id` oraya bakıyor; silmek         │
   * │    kullanıcıyı kendi hesabından KİLİTLERDİ ve geri dönüşü yok.        │
   * │ 2. AKTİF ŞİRKET SİLİNEMEZ. Bulunduğu kapsamı silen kullanıcı,         │
   * │    var olmayan bir şirkete bakan bir panelde kalırdı.                 │
   * │ 3. YALNIZCA KENDİ ÜST HESABININ ALTINDAKİLER. Başka bir ajansın       │
   * │    şirketini silmek, RLS'in ifade edemediği bir yazma olurdu —        │
   * │    `PrismaAdminService` kullanıldığı için kontrol BURADA yapılmak     │
   * │    zorunda.                                                            │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * AD ONAYI SUNUCUDA DA SINANIYOR: paneldeki kontrol bir kolaylık, kapı
   * değil. Uca elle istek atmak kolaylığı atlamak olurdu.
   */
  async sil(
    ctx: TenantContext,
    organizationId: string,
    input: DeleteOrganizationInput,
  ): Promise<SilmeYaniti> {
    assertOrgAdmin(ctx);
    const ozet = await this.silmeOzeti(ctx, organizationId);
    if (ozet.engel !== null) throw new BadRequestException(ozet.engel);

    if (ozet.adOnayiGerekli && (input.onayAdi ?? '').trim() !== ozet.name) {
      throw new BadRequestException(
        `Bu şirkette silinecek veri var. Onaylamak için şirket adını birebir yaz: ${ozet.name}`,
      );
    }

    /*
     * DENETİM KAYDI SİLMEDEN ÖNCE YAZILIYOR.
     *
     * Sonra yazmak imkânsız: `audit_logs.org_id` silinen şirkete bakıyor ve
     * o satır cascade ile birlikte giderdi. Kayıt ÇAĞIRANIN şirketine
     * (`ctx.orgId`) yazılıyor — kimin sildiği orada duruyor.
     */
    await this.audit.recordUnauthenticated(ctx.orgId, {
      actorId: ctx.userId,
      action: 'manager_account.organization_delete',
      targetType: 'organization',
      targetId: organizationId,
      before: {
        name: ozet.name,
        workspace: ozet.workspaceAdlari,
        reklamHesabi: ozet.reklamHesabi,
        kullanici: ozet.kullanici,
        metrikGunu: ozet.metrikGunu,
      },
    });

    /*
     * ═══ FK TAŞIMAYAN TABLOLAR ELLE SİLİNİYOR ═══
     *
     * Silmenin geri kalanı cascade ile geliyor ama İKİ tablo `clients`e bir
     * yabancı anahtarla BAĞLI DEĞİL ve `org_id` de taşımıyorlar:
     * `insights_daily` (partition'lı — Prisma partition'lı tabloya FK
     * kuramıyor) ve `api_usage_log`.
     *
     * Bu PGlite ile ÖLÇÜLDÜ, şema yorumundan okunmadı: şirketi silip
     * `insights_daily`i saydığımda satır DURUYORDU. Yetim kalan satırlar
     * hiçbir ekranda görünmüyor (RLS artık var olmayan bir `client_id`yi
     * kimseye açmıyor) ama tabloda kalıyorlar — ve o tablo bu depoda
     * ölçülerek düzeltilen yavaşlığın tam merkezinde.
     *
     * ┌─ TEK TRANSACTION, VE BU BİR GÜVENLİK KARARI ──────────────────────┐
     * │ `reset-clients` bir kez metrikleri silip müşterileri silemeden     │
     * │ düştü: pahalı yarısı yapıldı, işe yarayan yarısı yapılmadı. Burada │
     * │ ikisi AYNI transaction'da — org silme bir `Restrict` engeline      │
     * │ takılırsa metrikler de geri geliyor.                               │
     * └────────────────────────────────────────────────────────────────────┘
     *
     * Kimlikler ÖNCEDEN toplanıyor: org silindikten sonra `clients` de
     * gitmiş oluyor ve o satırları bulmanın yolu kalmıyor.
     */
    const clientIdler = (
      await this.admin.client.findMany({ where: { orgId: organizationId }, select: { id: true } })
    ).map((c) => c.id);

    await this.admin.$transaction(
      async (tx) => {
        if (clientIdler.length > 0) {
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM insights_daily WHERE client_id = ANY(${clientIdler}::uuid[])`,
          );
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM api_usage_log WHERE client_id = ANY(${clientIdler}::uuid[])`,
          );
        }
        await tx.organization.delete({ where: { id: organizationId } });
      },
      // Ondört aylık metrik yüz binlerce satır olabiliyor; varsayılan 5
      // saniye bir şirketi yarım silinmiş bırakmaya yeter.
      { timeout: 120_000, maxWait: 120_000 },
    );
    this.logger.warn(
      `ŞİRKET SİLİNDİ: ${ozet.name} (${organizationId}) — ` +
        `${ozet.workspaceAdlari.length} workspace, ${ozet.reklamHesabi} hesap, ` +
        `${ozet.kullanici} kullanıcı, ${ozet.metrikGunu} günlük metrik.`,
    );
    return { silindi: true, name: ozet.name };
  }

  /** Silinecek şirketi ÜST HESABIN ALTINDAN okur — başkasınınkine dokunulamaz. */
  private async silinecekSirket(
    ctx: TenantContext,
    organizationId: string,
  ): Promise<{ name: string }> {
    const ustHesap = await this.aktifUstHesap(ctx);

    const org = await this.admin.organization.findFirst({
      where: { id: organizationId, managerAccountId: ustHesap.id },
      select: { name: true },
    });
    if (!org) throw new BadRequestException('Bu şirket bulunamadı');
    return org;
  }

  /**
   * Silmeyi imkânsız kılan hâller — sebep METİN olarak dönüyor.
   *
   * ┌─ "ŞU AN BU ŞİRKETTESİN" KAPISI KALDIRILDI ────────────────────────────┐
   * │ Aktif şirketin silinmesini reddediyordu ve bu, özelliği KULLANILAMAZ  │
   * │ yapıyordu: şirketi düzenlemek için ÖNCE ona geçmek gerekiyor          │
   * │ (`/organization` ucu RLS ile aktif şirkete çivili), geçince de silme  │
   * │ reddediliyordu. Kullanıcının gördüğü hâl birebir buydu.               │
   * │                                                                       │
   * │ Kapının gerekçesi gerçekti — silinen şirkette kalmak, var olmayan bir │
   * │ kapsama bakmak demek. Ama çözümü REDDETMEK değil, SİLDİKTEN SONRA     │
   * │ KAPSAMI TAŞIMAK: uç, silme başarılıysa aktif şirket çerezini          │
   * │ kullanıcının ev şirketine çekiyor.                                    │
   * └───────────────────────────────────────────────────────────────────────┘
   *
   * EV ŞİRKETİ KAPISI DURUYOR ve duracak: `users.org_id` oraya bakıyor,
   * silmek giriş hesabını da siler (cascade) ve kullanıcıyı kendi
   * hesabından kilitler — geri dönüşü yok.
   */
  private async silmeEngeli(ctx: TenantContext, organizationId: string): Promise<string | null> {
    /*
     * EV ŞİRKETİ `users.org_id` — `ctx.orgId` DEĞİL.
     *
     * İkincisi ŞU AN bakılan şirket ve üst hesap altında ikisi farklı
     * oluyor.
     */
    const kullanici = await this.admin.user.findUnique({
      where: { id: ctx.userId },
      select: { orgId: true },
    });
    if (kullanici?.orgId === organizationId) {
      return 'Kendi şirketin silinemez — giriş hesabın oraya bağlı.';
    }
    return null;
  }

  /**
   * Silmeden sonra kullanıcının düşeceği şirket — EV ŞİRKETİ.
   *
   * Uç bunu çereze yazıyor. Yazmasaydı çerez silinmiş bir kimliği taşırdı;
   * `TenantContextService` onu izin listesinde bulamayıp SESSİZCE eve
   * düşürürdü — doğru sonuç ama sessiz, ve bu depoda sessiz düşüş bir hata
   * türü: kullanıcı hangi şirkette olduğunu ekrandan okuyamaz.
   */
  async evSirketi(ctx: TenantContext): Promise<string> {
    const kullanici = await this.admin.user.findUnique({
      where: { id: ctx.userId },
      select: { orgId: true },
    });
    if (!kullanici) throw new BadRequestException('Kullanıcı bulunamadı');
    return kullanici.orgId;
  }

  /**
   * VAR OLAN bir workspace'i üst hesabın BAŞKA bir şirketine taşır.
   *
   * ┌─ NEDEN `PrismaAdminService` (RLS DIŞI) ────────────────────────────────┐
   * │ Taşıma iki organizasyona birden dokunuyor: kaynak satırları OKUNUYOR,  │
   * │ hedef `org_id` YAZILIYOR. RLS bunu ifade EDEMEZ — her politika tek bir │
   * │ `app.current_org_id()` biliyor ve UPDATE sonrası yeni satır SELECT     │
   * │ politikasından da geçmek zorunda (bkz. `ad-account-pool-rls.spec.ts`). │
   * │ Yani izolasyonu burada UYGULAMA katmanı korumak zorunda ve kontroller  │
   * │ aşağıda AÇIK: kaynak da hedef de kullanıcının ÜST HESABININ altında    │
   * │ olmak zorunda.                                                          │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * TEK TRANSACTION. Yarım kalmış bir taşıma iki şirketin de verisini
   * sessizce yanlış yapar: workspace yeni şirkette görünür ama bütçesi,
   * kuralları ve raporları eski şirkette kalır — hata yok, log yok.
   */
  async moveWorkspace(
    ctx: TenantContext,
    input: MoveWorkspaceInput,
  ): Promise<ManagerAccountTree & { tasima: WorkspaceTasimaSonucu }> {
    assertOrgAdmin(ctx);

    const ustHesap = await this.aktifUstHesap(ctx);

    const workspace = await this.admin.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, name: true, orgId: true, status: true },
    });
    if (!workspace) throw new BadRequestException('Workspace bulunamadı');

    /*
     * KAYNAK VE HEDEF AYRI AYRI DOĞRULANIYOR. Yalnızca hedefi kontrol etmek,
     * BAŞKA bir ajansın workspace'ini kendi şirketine çekmeye izin verirdi —
     * `clientId` istemciden geliyor ve tek başına hiçbir şey kanıtlamıyor.
     */
    const sirketler = await this.admin.organization.findMany({
      where: { managerAccountId: ustHesap.id, status: 'active' },
      select: { id: true },
    });
    const izinli = new Set(sirketler.map((o) => o.id));

    if (!izinli.has(workspace.orgId)) {
      throw new BadRequestException('Bu workspace üst hesabının altında değil');
    }
    if (!izinli.has(input.organizationId)) {
      throw new BadRequestException('Hedef şirket üst hesabının altında değil');
    }
    if (workspace.orgId === input.organizationId) {
      // Sessizce başarılı dönmek, kullanıcının taşındığını sanması demek.
      throw new BadRequestException('Workspace zaten bu şirkette');
    }

    const tasima = await this.admin.$transaction(
      async (tx) =>
        workspaceTasi(
          { $executeRaw: (sql) => tx.$executeRaw(sql) },
          workspace.id,
          workspace.orgId,
          input.organizationId,
        ),
      /*
       * VARSAYILAN 5 SANİYE YETMEYEBİLİR: 30 tabloda UPDATE ve büyük bir
       * workspace'te `leads` tek başına on binlerce satır. Transaction
       * ölürse taşıma yarıda kalmıyor (geri alınıyor) ama kullanıcı sebebi
       * anlaşılmaz bir hata görürdü.
       */
      { timeout: 60_000, maxWait: 60_000 },
    );

    await this.audit.recordUnauthenticated(input.organizationId, {
      actorId: ctx.userId,
      action: 'manager_account.workspace_moved',
      targetType: 'client',
      targetId: workspace.id,
      before: { organizationId: workspace.orgId },
      after: { organizationId: input.organizationId, tasinan: tasima.tasinan },
    });

    this.logger.log(
      `Workspace taşındı: "${workspace.name}" ${workspace.orgId} → ${input.organizationId} ` +
        `(${tasima.toplam} satır)`,
    );

    const agac = await this.get(ctx);
    if (!agac) throw new BadRequestException('Workspace taşındı ama üst hesap okunamadı');
    return { ...agac, tasima };
  }
}
