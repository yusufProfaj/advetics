import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { isOrgAdminRole } from '@advetics/shared';
import type {
  TenantContext,
  UstHesapUyesi,
  UstHesapUyesiEkleInput,
  UstHesapUyesiEklemeYaniti,
  UstHesapUyesiGuncelleInput,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../../common/utils/password-hash';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * ═══ ÜST HESAP EKİBİ — hesabı KİM yönetiyor ═══
 *
 * Bir üst hesap kurulduğunda tek üyesi kurucusuydu ve ikinci bir kişi
 * eklemenin yolu yoktu: ne uç ne ekran. Satılan bir hesabın sahibine
 * "hesabın hazır" demek, içine girebilen tek kişi platform sahibiyken
 * anlamsızdı. Kullanıcının cümlesi: *"o üst hesaba bir yetki atamamız
 * lazım (kişi hesabı eklememiz lazım ki yönetebilsin)"*.
 *
 * ┌─ NEDEN `PrismaAdminService` ────────────────────────────────────────────┐
 * │ `manager-account.service.ts` ile aynı gerekçe: bu tablonun satırları   │
 * │ kullanıcının ERİŞEBİLDİĞİ ORGANİZASYON KÜMESİNİ belirliyor ve         │
 * │ `02_rls.sql` uygulama rolünden yazmayı geri alıyor. Yetki kontrolü     │
 * │ burada ve AÇIK: `assertYonetici`.                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ `ctx.isOrgAdmin` YETMİYOR ─────────────────────────────────────────────┐
 * │ O bayrak TEK BİR ŞİRKETİN yöneticisinde de açık. Onu üst hesap         │
 * │ ekibine kişi ekleyebilir saymak, şirket yöneticisinin kendini bütün    │
 * │ şirketlerin yöneticisi yapabilmesi demek — tek istekle yetki yükseltme.│
 * │ Kapı ÜST HESAP ÜYELİĞİNİN ROLÜNE bakıyor (ya da platform sahibi).      │
 * └────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class UstHesapEkibiService {
  constructor(
    private readonly admin: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  private async assertYonetici(ctx: TenantContext): Promise<string> {
    if (ctx.managerAccountId === null) {
      throw new BadRequestException('Önce bir üst hesap oluşturmalısın');
    }
    if (ctx.platformAdmin) return ctx.managerAccountId;

    const uyelik = await this.admin.managerMembership.findFirst({
      where: { userId: ctx.userId, managerAccountId: ctx.managerAccountId },
      select: { role: true },
    });
    if (!uyelik || !isOrgAdminRole(uyelik.role)) {
      throw new ForbiddenException('Üst hesap ekibini yalnızca üst hesabın Yöneticisi değiştirebilir');
    }
    return ctx.managerAccountId;
  }

  /**
   * Üst hesabın ekibi.
   *
   * OKUMA İÇİN YÖNETİCİ ŞART DEĞİL: üst hesabın herhangi bir üyesi
   * listeyi görebiliyor — RLS politikası da aynı şeyi söylüyor
   * (`adv_manager_memberships_select`: "kullanıcı kendi üst hesabındaki
   * HERKESİ görüyor"). Üye olmayan (ve platform sahibi de olmayan) biri
   * boş liste değil 403 alıyor: "kimse yok" ile "göremiyorsun" farklı.
   */
  async liste(ctx: TenantContext): Promise<UstHesapUyesi[]> {
    if (ctx.managerAccountId === null) return [];
    if (!ctx.platformAdmin) {
      const uye = await this.admin.managerMembership.findFirst({
        where: { userId: ctx.userId, managerAccountId: ctx.managerAccountId },
        select: { id: true },
      });
      if (!uye) throw new ForbiddenException('Bu üst hesabın üyesi değilsin');
    }

    const satirlar = await this.admin.managerMembership.findMany({
      where: { managerAccountId: ctx.managerAccountId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        user: {
          select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true },
        },
      },
    });
    return satirlar.map((s) => this.satir(s, ctx));
  }

  /**
   * Üst hesaba kişi ekler — YOKSA OLUŞTURUR, VARSA YALNIZCA ÜYELİK VERİR.
   *
   * `members.service.ts#createMember` ile aynı kural ve aynı sebep: var
   * olan kullanıcının parolasına dokunulmuyor; "ekle" düğmesinden yapılan
   * masum bir işlem çalışan bir hesabın parolasını sessizce sıfırlamamalı.
   * Hangi yolun işlediği yanıtta (`created`) yazıyor.
   *
   * YENİ KULLANICININ EV ŞİRKETİ üst hesabın İLK şirketi (en eski). Ev
   * şirketi `TenantContextService`in varsayılan üst hesabı seçtiği yer
   * (`user.organization.managerAccountId`): başka bir şirkete yazılsaydı
   * kişi girişte yanlış hesapta uyanırdı. Üst hesap hiçbir zaman şirketsiz
   * olamıyor (`ilk-sirket.ts`), yani bu seçim her zaman bir sonuç veriyor.
   *
   * VAR OLAN KULLANICI BU ÜST HESABA AİT OLMAK ZORUNDA: ev şirketi başka bir
   * üst hesabın altındaysa "bulunamadı" — 403 dönmek o kullanıcının var
   * olduğunu sızdırırdı. İki üst hesabı bir kişiyle bağlamak platform
   * sahibinin işi ve o da bu uçtan değil, karşı hesapta yeni kullanıcı
   * açarak yapıyor; aynı e-postayı iki kiracıda paylaşmak `users.email`
   * tekilliğine çarpıyor ve bu bilinçli.
   */
  async ekle(
    ctx: TenantContext,
    input: UstHesapUyesiEkleInput,
    meta: Meta,
  ): Promise<UstHesapUyesiEklemeYaniti> {
    const managerAccountId = await this.assertYonetici(ctx);

    const mevcut = await this.admin.user.findFirst({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        organization: { select: { managerAccountId: true } },
        managerMemberships: { where: { managerAccountId }, select: { id: true, role: true } },
      },
    });

    if (mevcut) {
      if (mevcut.organization.managerAccountId !== managerAccountId) {
        throw new NotFoundException('Kullanıcı bulunamadı');
      }
      if (mevcut.managerMemberships.length > 0) {
        throw new ConflictException(
          'Bu kullanıcı zaten üst hesap ekibinde — rolünü listeden değiştirebilirsin',
        );
      }
      const uyelik = await this.admin.managerMembership.create({
        data: { managerAccountId, userId: mevcut.id, role: input.role as Role },
        select: { id: true, role: true },
      });
      await this.kaydet(ctx, 'manager_membership.granted', mevcut.id, {
        email: mevcut.email,
        role: input.role,
        created: false,
      }, meta);
      return {
        uyelik: this.satir({ ...uyelik, user: mevcut }, ctx),
        created: false,
      };
    }

    /*
     * YENİ KULLANICI — ad ve parola ZORUNLU ve eksikse AÇIKÇA söyleniyor.
     * Şema ikisini isteğe bağlı tutuyor çünkü var olan kullanıcıda ikisi
     * de anlamsız; ama yeni kullanıcıyı adsız ya da parolasız açmak,
     * giriş yapamayan bir hesap üretir.
     */
    if (!input.fullName || !input.password) {
      throw new BadRequestException(
        'Bu e-postayla kayıtlı kullanıcı yok; yeni kullanıcı için ad soyad ve parola gerekiyor',
      );
    }

    const evSirketi = await this.admin.organization.findFirst({
      where: { managerAccountId, status: 'active' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!evSirketi) {
      // `ilk-sirket.ts` bunu imkânsız kılıyor; yine de sessizce başka bir
      // yere yazmak yerine açıkça duruyoruz.
      throw new BadRequestException('Üst hesabın altında şirket yok — önce şirket açılmalı');
    }

    // Hash transaction DIŞINDA: argon2 kasıtlı yavaş (bkz. members.service).
    const passwordHash = await hashPassword(input.password);

    const sonuc = await this.admin.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId: evSirketi.id,
          email: input.email,
          passwordHash,
          fullName: input.fullName!,
          status: 'active',
          mustChangePassword: true,
        },
        select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true },
      });
      const uyelik = await tx.managerMembership.create({
        data: { managerAccountId, userId: user.id, role: input.role as Role },
        select: { id: true, role: true },
      });
      return { user, uyelik };
    });

    await this.kaydet(ctx, 'manager_membership.user_created', sonuc.user.id, {
      email: input.email,
      role: input.role,
      created: true,
    }, meta);

    return {
      uyelik: this.satir({ ...sonuc.uyelik, user: sonuc.user }, ctx),
      created: true,
    };
  }

  async rolDegistir(
    ctx: TenantContext,
    uyelikId: string,
    input: UstHesapUyesiGuncelleInput,
    meta: Meta,
  ): Promise<UstHesapUyesi> {
    const managerAccountId = await this.assertYonetici(ctx);
    const once = await this.uyelik(managerAccountId, uyelikId);

    if (once.user.id === ctx.userId) {
      // Tek yöneticinin kendini düşürmesi panelden geri alınamayan kilit.
      throw new BadRequestException('Kendi üst hesap yetkinizi değiştiremezsiniz');
    }
    await this.assertSonYoneticiDegil(managerAccountId, uyelikId, once.role, input.role as Role);

    const sonra = await this.admin.managerMembership.update({
      where: { id: uyelikId },
      data: { role: input.role as Role },
      select: { id: true, role: true },
    });
    await this.kaydet(ctx, 'manager_membership.updated', once.user.id, {
      email: once.user.email,
      before: once.role,
      after: sonra.role,
    }, meta);
    return this.satir({ ...sonra, user: once.user }, ctx);
  }

  async kaldir(ctx: TenantContext, uyelikId: string, meta: Meta): Promise<{ ok: true }> {
    const managerAccountId = await this.assertYonetici(ctx);
    const once = await this.uyelik(managerAccountId, uyelikId);

    if (once.user.id === ctx.userId) {
      throw new BadRequestException('Kendi erişiminizi kaldıramazsınız');
    }
    await this.assertSonYoneticiDegil(managerAccountId, uyelikId, once.role, null);

    await this.admin.managerMembership.delete({ where: { id: uyelikId } });
    await this.kaydet(ctx, 'manager_membership.removed', once.user.id, {
      email: once.user.email,
      role: once.role,
    }, meta);
    return { ok: true };
  }

  /** Üyelik AKTİF üst hesaba ait olmak zorunda — başka hesabın kimliği "bulunamadı". */
  private async uyelik(managerAccountId: string, uyelikId: string) {
    const u = await this.admin.managerMembership.findFirst({
      where: { id: uyelikId, managerAccountId },
      select: {
        id: true,
        role: true,
        user: {
          select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true },
        },
      },
    });
    if (!u) throw new NotFoundException('Üst hesap üyeliği bulunamadı');
    return u;
  }

  /**
   * Üst hesapta EN AZ BİR Yönetici kalmalı.
   *
   * Platform sahibi her hesaba girebiliyor, yani teknik olarak kilitlenme
   * yok — ama müşterinin hesabını yalnızca Advetics'in açabildiği bir hâle
   * düşürmek, satılan ürünün sahipsiz kalması demek. Ret, sebebi söylüyor.
   */
  private async assertSonYoneticiDegil(
    managerAccountId: string,
    uyelikId: string,
    mevcutRol: Role,
    yeniRol: Role | null,
  ): Promise<void> {
    if (!isOrgAdminRole(mevcutRol)) return;
    if (yeniRol !== null && isOrgAdminRole(yeniRol)) return;
    const kalan = await this.admin.managerMembership.count({
      where: { managerAccountId, role: Role.admin, id: { not: uyelikId } },
    });
    if (kalan === 0) {
      throw new BadRequestException(
        'Üst hesapta en az bir Yönetici kalmalı. Önce başka bir kişiyi Yönetici yapın.',
      );
    }
  }

  private satir(
    s: {
      id: string;
      role: Role;
      user: {
        id: string;
        email: string;
        fullName: string;
        status: string;
        lastLoginAt: Date | null;
      };
    },
    ctx: TenantContext,
  ): UstHesapUyesi {
    return {
      id: s.id,
      userId: s.user.id,
      email: s.user.email,
      fullName: s.user.fullName,
      status: s.user.status,
      lastLoginAt: s.user.lastLoginAt?.toISOString() ?? null,
      role: s.role,
      kendisi: s.user.id === ctx.userId,
    };
  }

  /*
   * Denetim kaydı AKTİF şirkete yazılıyor (`recordUnauthenticated` —
   * `record` RLS'li bir `tx` istiyor, bu servis bilerek RLS dışında).
   * Parola denetim kaydına YAZILMIYOR.
   */
  private async kaydet(
    ctx: TenantContext,
    action: string,
    targetId: string,
    after: Prisma.InputJsonValue,
    meta: Meta,
  ): Promise<void> {
    await this.audit.recordUnauthenticated(ctx.orgId, {
      actorId: ctx.userId,
      action,
      targetType: 'manager_membership',
      targetId,
      after,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      requestId: meta.requestId ?? null,
    });
  }
}
