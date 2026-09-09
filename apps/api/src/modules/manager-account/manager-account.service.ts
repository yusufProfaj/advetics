import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import type {
  CreateManagedOrganizationInput,
  CreateManagerAccountInput,
  ManagerAccountTree,
  MoveWorkspaceInput,
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

  /** Kullanıcının üst hesabı ve altındaki şirketler. Yoksa null. */
  async get(ctx: TenantContext): Promise<ManagerAccountTree | null> {
    const uyelik = await this.admin.managerMembership.findUnique({
      where: { userId: ctx.userId },
      select: {
        managerAccount: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
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
        },
      },
    });

    const hesap = uyelik?.managerAccount;
    // Askıya alınmış üst hesap YOK sayılıyor — `TenantContextService` de
    // geçişi kapatıyor, ekranın onu göstermesi ikisinin ayrışması olurdu.
    if (!hesap || hesap.status !== 'active') return null;

    return {
      id: hesap.id,
      name: hesap.name,
      slug: hesap.slug,
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

    const mevcut = await this.admin.managerMembership.findUnique({
      where: { userId: ctx.userId },
      select: { id: true },
    });
    if (mevcut) {
      // Şemada `user_id` tekil; buradaki kontrol kullanıcıya ANLAŞILIR bir
      // cevap vermek için — yoksa hata bir tekillik ihlali olarak çıkardı.
      throw new ConflictException('Bu hesap zaten bir üst hesaba bağlı');
    }

    const evSirketi = await this.admin.organization.findUniqueOrThrow({
      where: { id: ctx.orgId },
      select: { id: true, name: true, managerAccountId: true },
    });
    if (evSirketi.managerAccountId) {
      throw new ConflictException('Bu şirket zaten bir üst hesaba bağlı');
    }

    const slug = await uniqueSlug(input.name, async (aday) =>
      Boolean(await this.admin.managerAccount.findUnique({ where: { slug: aday }, select: { id: true } })),
    );

    const hesapId = await this.admin.$transaction(async (tx) => {
      const hesap = await tx.managerAccount.create({
        data: { name: input.name, slug },
        select: { id: true },
      });
      await tx.organization.update({
        where: { id: evSirketi.id },
        data: { managerAccountId: hesap.id },
      });
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
      after: { name: input.name, slug, homeOrganization: evSirketi.name },
    });

    const agac = await this.get(ctx);
    // `get` null dönemez (az önce yazdık) ama tipi nullable; sessizce boş
    // dönmektense patlamak doğru — boş bir ağaç "kurulmadı" gibi okunurdu.
    if (!agac) throw new BadRequestException('Üst hesap oluşturuldu ama okunamadı');
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

    const uyelik = await this.admin.managerMembership.findUnique({
      where: { userId: ctx.userId },
      select: { managerAccountId: true, managerAccount: { select: { status: true } } },
    });
    if (!uyelik || uyelik.managerAccount.status !== 'active') {
      throw new BadRequestException('Önce bir üst hesap oluşturmalısın');
    }

    const slug = await uniqueSlug(input.name, async (aday) =>
      Boolean(await this.admin.organization.findUnique({ where: { slug: aday }, select: { id: true } })),
    );

    const yeniOrgId = await this.admin.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.name, slug, managerAccountId: uyelik.managerAccountId },
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
      after: { name: input.name, slug, managerAccountId: uyelik.managerAccountId },
    });

    this.logger.log(`Üst hesap altına şirket açıldı: ${input.name} (${yeniOrgId})`);

    const agac = await this.get(ctx);
    if (!agac) throw new BadRequestException('Şirket oluşturuldu ama üst hesap okunamadı');
    return agac;
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

    const uyelik = await this.admin.managerMembership.findUnique({
      where: { userId: ctx.userId },
      select: { managerAccountId: true, managerAccount: { select: { status: true } } },
    });
    if (!uyelik || uyelik.managerAccount.status !== 'active') {
      throw new BadRequestException('Bu hesabın bağlı olduğu bir üst hesap yok');
    }

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
      where: { managerAccountId: uyelik.managerAccountId, status: 'active' },
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
