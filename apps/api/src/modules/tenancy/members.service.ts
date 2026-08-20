import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import {
  isOrgScopedRole,
  type CreateMemberInput,
  type CreateMembershipInput,
  type Permission,
  type TenantContext,
  type UpdateMembershipInput,
  type UpdateMemberInfoInput,
} from '@advetics/shared';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../../common/utils/password-hash';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}


@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ekip listesi — YALNIZCA AJANS İÇİ.
   *
   * RLS `users` tablosunda org yöneticisi olmayanlara yalnızca kendi satırını
   * gösterir — bu endpoint bir client_viewer tarafından çağrılırsa tek satır
   * döner, hata değil. Bu davranış kasıtlıdır.
   *
   * MÜŞTERİ HESAPLARI BU LİSTEDE YOK. Ekran adı "Ekip & Yetkiler" ve işi
   * ajans personelini yönetmek; müşteri markası için açılan giriş hesapları
   * oraya ait değil. Bir süre ikisi AYNI DÜZ LİSTEDE duruyordu: rol dışında
   * hiçbir ayrım yoktu ve üstteki sayaç ikisini tek bir "N kullanıcı" olarak
   * topluyordu — yani ajansın kaç çalışanı olduğu ekrandan okunamıyordu.
   *
   * SÜZGEÇ SORGUDA, ARAYÜZDE DEĞİL. Arayüzde süzmek, uç noktayı doğrudan
   * çağıran birine listeyi açık bırakırdı; bu ekranın verisi kimin hangi
   * müşteride hangi yetkiye sahip olduğu ve tam olarak saklanması gereken
   * şey o.
   *
   * `some` KULLANILIYOR, `every` DEĞİL VE FARK ÖNEMLİ: bir kişi bir
   * müşteride client_viewer, başka bir yerde manager olabilir (ajans
   * çalışanının kendi test hesabı bunun tipik örneği). O kişi ajans
   * personelidir ve listede KALMALI. `every` yazmak onu gizlerdi.
   */
  async listMembers(ctx: TenantContext, clientId?: string | null) {
    /*
     * İKİ LİSTE, İKİ AYRI SORU.
     *
     * `clientId` YOKSA soru "ajansın ekibi kim" — müşteri hesapları dışarıda.
     * `clientId` VARSA soru "bu workspace'e kim erişiyor" ve cevap müşterinin
     * KENDİ giriş hesaplarını da içermek zorunda: o ekranın bütün amacı zaten
     * onları yönetmek. Ajans listesinden dışlanmaları, ajans ekibi sayılmamak
     * içindi; kendi workspace'lerinde gizlenmeleri onları yönetilemez yapardı.
     */
    /*
     * PARAMETRESİZ DAL `some` DEĞİL `OR` KULLANIYOR — ve sebebi üretimde
     * görüldü.
     *
     * Önceki hâl `{ memberships: { some: { role: { not: 'client_viewer' } } } }`
     * idi. `some` EN AZ BİR üyelik istiyor; hiç üyeliği olmayan kullanıcı o
     * koşula hiç uymuyor ve listeden TAMAMEN düşüyordu. Ajans personeli önce
     * açılıp yetkisi sonra verildiği için bu hâl istisna değil normal:
     * yusuf@ ve ecem@ hesapları panelde HİÇ görünmüyordu ve arayüzde
     * düzeltmeye çalışmak işe yaramadı, çünkü satır API'den zaten gelmiyordu.
     *
     * Doğru kural: bir kullanıcı ancak ÜYELİĞİ VARSA ve ÜYELİKLERİNİN HEPSİ
     * `client_viewer` ise ajans listesinden düşer. Üyeliği olmayan düşmez.
     */
    const where = clientId
      ? { memberships: { some: { clientId } } }
      : {
          OR: [
            { memberships: { none: {} } },
            { memberships: { some: { role: { not: 'client_viewer' as const } } } },
          ],
        };

    return this.prisma.withTenant(ctx, (tx) =>
      tx.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          memberships: {
            select: {
              id: true,
              role: true,
              clientId: true,
              permissions: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      }),
    );
  }

  /**
   * Ekibe kullanıcı ekler — DAVET DEĞİL, doğrudan oluşturma.
   *
   * Davet akışı kaldırıldı: üretimde token üretilip hash'leniyor ve düz metni
   * ATILIYORDU (yalnızca geliştirme ortamında loglanıyordu), e-posta
   * altyapısı da olmadığı için kimse daveti kabul edemiyordu. Kullanılamayan
   * bir akış, çalışıyor sanıldığı sürece gerçek bir arızadan daha pahalı.
   *
   * İKİ YOL VAR ve hangisinin işlediği YANITTA DÖNÜYOR:
   *
   *   · Kullanıcı yoksa  → oluşturulur, parola yöneticinin verdiği olur.
   *   · Kullanıcı VARSA  → yalnızca yeni yetki eklenir, PAROLASINA
   *     DOKUNULMAZ. Aksi hâlde bir yöneticinin "ekip" ekranından yaptığı
   *     masum bir işlem, mevcut bir kullanıcının parolasını sessizce
   *     sıfırlardı — üstelik o kullanıcı bunu ancak giriş yapamayınca
   *     öğrenirdi.
   *
   * `created` bayrağı arayüzün doğru cümleyi kurabilmesi için: "kullanıcı
   * oluşturuldu" ile "mevcut kullanıcıya yetki eklendi" farklı şeyler ve
   * ikincisinde yöneticinin yazdığı parola KULLANILMADI.
   */
  async createMember(ctx: TenantContext, input: CreateMemberInput, meta: Meta) {
    // Şema zaten kısıtlıyor; burada ikinci kez doğruluyoruz çünkü bu kural
    // bir yetki yükseltme kapısı — org geneli erişim yalnızca owner/admin.
    if (input.clientId === null && !isOrgScopedRole(input.role)) {
      throw new BadRequestException(
        'Organizasyon geneli erişim yalnızca owner ve admin rollerine verilebilir',
      );
    }

    // Hash'i transaction DIŞINDA hesaplıyoruz: argon2 kasıtlı olarak yavaş
    // (19 MiB, 2 tur) ve o süre boyunca bir veritabanı transaction'ını açık
    // tutmak, bağlantı havuzunu yükün en yoğun anında meşgul eder.
    const passwordHash = await hashPassword(input.password);

    return this.prisma.withTenant(ctx, async (tx) => {
      if (input.clientId) {
        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new NotFoundException('Müşteri bulunamadı');
      }

      const existing = await tx.user.findFirst({
        where: { email: input.email },
        select: { id: true, memberships: { select: { clientId: true } } },
      });

      if (existing?.memberships.some((m) => m.clientId === input.clientId)) {
        throw new ConflictException('Bu kullanıcının zaten bu kapsamda erişimi var');
      }

      const user =
        existing ??
        (await tx.user.create({
          data: {
            orgId: ctx.orgId,
            email: input.email,
            passwordHash,
            fullName: input.fullName,
            status: 'active',
            // Şemada duruyor ama HENÜZ OKUYAN YOK — ilk girişte parola
            // değiştirme zorlanmıyor. Yine de yazıyoruz ki zorlama eklendiği
            // gün geçmiş kullanıcılar da kapsansın.
            mustChangePassword: true,
          },
          select: { id: true, memberships: { select: { clientId: true } } },
        }));

      await tx.membership.create({
        data: {
          userId: user.id,
          orgId: ctx.orgId,
          clientId: input.clientId,
          role: input.role as Role,
        },
      });

      await this.audit.record(tx, ctx, {
        action: existing ? 'membership.granted' : 'user.created',
        targetType: 'user',
        targetId: user.id,
        clientId: input.clientId,
        after: { email: input.email, role: input.role, clientId: input.clientId },
        ...meta,
      });

      return {
        id: user.id,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        clientId: input.clientId,
        /** false => kullanıcı zaten vardı; yazılan parola KULLANILMADI. */
        created: existing === null,
      };
    });
  }

  /**
   * KULLANICI BİLGİSİNİ GÜNCELLER — ad, e-posta, parola.
   *
   * NEDEN VAR: kullanıcı oluşturulduktan sonra bilgisi hiçbir yerden
   * düzenlenemiyordu. Yalnızca rol değiştirilebiliyordu (`updateMembership`);
   * yanlış yazılmış bir e-posta ya da unutulmuş bir parola için tek çare
   * kullanıcıyı silip yeniden açmaktı — ve bu, o kullanıcının bütün müşteri
   * yetkilerini de götürüyordu.
   *
   * ROL BURADA DEĞİŞTİRİLMİYOR ve bu bilinçli: bir kişi BİR müşteride
   * yönetici, başkasında görüntüleyici olabiliyor. Rolü kullanıcıya bağlamak
   * o kuralı sessizce bozardı; yetki `memberships` üzerinde kalıyor.
   *
   * RLS SINIRI YETERLİ: `users` politikası org yöneticisi olmayana yalnızca
   * kendi satırını gösteriyor, dolayısıyla başka bir organizasyonun
   * kullanıcısı bu sorguya hiç düşmüyor.
   */
  async updateMemberInfo(
    ctx: TenantContext,
    userId: string,
    input: UpdateMemberInfoInput,
    meta: Meta,
  ) {
    return this.prisma.withTenant({ ...ctx, activeClientId: null }, async (tx) => {
      const before = await tx.user.findFirst({
        where: { id: userId },
        select: { id: true, email: true, fullName: true },
      });
      if (!before) throw new NotFoundException('Kullanıcı bulunamadı');

      /*
       * E-POSTA TEKİLLİĞİ ÖNCEDEN KONTROL EDİLİYOR. Veritabanı kısıtı zaten
       * engelliyor ama oradan dönen hata ham bir `P2002` ve panelde
       * "Bu kayıt zaten mevcut" oluyor — hangi alanın çakıştığını söylemiyor.
       */
      if (input.email && input.email !== before.email) {
        const cakisan = await tx.user.findFirst({
          where: { email: input.email, id: { not: userId } },
          select: { id: true },
        });
        if (cakisan) {
          throw new ConflictException('Bu e-posta başka bir kullanıcıda kayıtlı');
        }
      }

      const veri: Record<string, unknown> = {};
      if (input.fullName !== undefined) veri.fullName = input.fullName;
      if (input.email !== undefined) veri.email = input.email;
      if (input.password !== undefined) {
        veri.passwordHash = await hashPassword(input.password);
        /*
         * PAROLA DEĞİŞİNCE OTURUMLAR DÜŞMÜYOR — ve bu bir eksik.
         * `refresh_tokens` satırları geçerli kalıyor, yani parolası
         * değiştirilen biri açık oturumunda çalışmaya devam ediyor. Doğrusu
         * o kullanıcının refresh token'larını iptal etmek; bugün öyle bir yol
         * yok ve uydurmak yerine yazılı bırakılıyor.
         */
      }

      const after = await tx.user.update({
        where: { id: userId },
        data: veri,
        select: { id: true, email: true, fullName: true },
      });

      await this.audit.record(tx, ctx, {
        action: 'user.updated',
        targetType: 'user',
        targetId: userId,
        // PAROLA DENETİM KAYDINA YAZILMIYOR, yalnızca DEĞİŞTİĞİ yazılıyor.
        before: { email: before.email, fullName: before.fullName },
        after: {
          email: after.email,
          fullName: after.fullName,
          passwordChanged: input.password !== undefined,
        },
        ...meta,
      });

      return after;
    });
  }

  /**
   * MEVCUT kullanıcıya yeni bir müşteri yetkisi verir.
   *
   * `createMember`den farkı parola: orada yeni kullanıcı doğuyor ve parola
   * zorunlu, burada kullanıcı zaten var ve parolasına DOKUNULMUYOR. İkisini
   * tek uç noktada toplamak, arayüzü var olan birine yetki verirken boşa
   * parola uydurmaya zorluyordu.
   *
   * Kullanıcının varlığını RLS üzerinden doğruluyoruz: `users` politikası org
   * yöneticisine kendi organizasyonundaki herkesi gösteriyor, başka
   * organizasyondakini göstermiyor. Yani buradaki "bulunamadı", "başka org'un
   * kullanıcısı" ile aynı cevabı veriyor ve bu kasıtlı — 403 dönmek o
   * kullanıcının var olduğunu sızdırırdı.
   */
  async addMembership(ctx: TenantContext, input: CreateMembershipInput, meta: Meta) {
    if (input.clientId === null && !isOrgScopedRole(input.role)) {
      throw new BadRequestException(
        'Organizasyon geneli erişim yalnızca owner ve admin rollerine verilebilir',
      );
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, memberships: { select: { clientId: true } } },
      });
      if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

      if (input.clientId) {
        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new NotFoundException('Müşteri bulunamadı');
      }

      if (user.memberships.some((m) => m.clientId === input.clientId)) {
        throw new ConflictException('Bu kullanıcının zaten bu kapsamda erişimi var');
      }

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          orgId: ctx.orgId,
          clientId: input.clientId,
          role: input.role as Role,
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'membership.granted',
        targetType: 'user',
        targetId: user.id,
        clientId: input.clientId,
        after: { email: user.email, role: input.role, clientId: input.clientId },
        ...meta,
      });

      return membership;
    });
  }

  async updateMembership(
    ctx: TenantContext,
    membershipId: string,
    input: UpdateMembershipInput,
    meta: Meta,
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!before) throw new NotFoundException('Yetki kaydı bulunamadı');

      if (before.clientId === null && !isOrgScopedRole(input.role)) {
        throw new BadRequestException(
          'Organizasyon geneli bir yetki, müşteri düzeyi bir role çevrilemez',
        );
      }

      await this.assertNotLastOwner(tx, before.id, before.role, input.role as Role);

      const after = await tx.membership.update({
        where: { id: membershipId },
        data: {
          role: input.role as Role,
          ...(input.permissions !== undefined
            ? { permissions: input.permissions ?? undefined }
            : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'membership.updated',
        targetType: 'membership',
        targetId: membershipId,
        clientId: before.clientId,
        before: { role: before.role, permissions: before.permissions },
        after: { role: after.role, permissions: after.permissions },
        ...meta,
      });

      return after;
    });
  }

  async removeMembership(ctx: TenantContext, membershipId: string, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const membership = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!membership) throw new NotFoundException('Yetki kaydı bulunamadı');

      if (membership.userId === ctx.userId) {
        throw new BadRequestException('Kendi erişiminizi kaldıramazsınız');
      }

      await this.assertNotLastOwner(tx, membership.id, membership.role, null);

      await tx.membership.delete({ where: { id: membershipId } });

      await this.audit.record(tx, ctx, {
        action: 'membership.removed',
        targetType: 'membership',
        targetId: membershipId,
        clientId: membership.clientId,
        before: { userId: membership.userId, role: membership.role },
        ...meta,
      });

      return { ok: true };
    });
  }

  /**
   * Son owner'ın rolünün düşürülmesini veya silinmesini engeller.
   *
   * Bu kontrol olmadan bir organizasyon kendini kilitleyebilir: owner yetkisi
   * olan hiç kimse kalmadığında kimse yeni owner atayamaz. Kurtarma yolu
   * yalnızca veritabanına doğrudan müdahaledir.
   */
  private async assertNotLastOwner(
    tx: TenantClient,
    membershipId: string,
    currentRole: Role,
    nextRole: Role | null,
  ): Promise<void> {
    if (currentRole !== Role.owner) return;
    if (nextRole === Role.owner) return;

    const remainingOwners = await tx.membership.count({
      where: { role: Role.owner, id: { not: membershipId } },
    });

    if (remainingOwners === 0) {
      throw new BadRequestException(
        'Organizasyonda en az bir owner kalmalı. Önce başka bir kullanıcıyı owner yapın.',
      );
    }
  }
}

export type { Permission };
