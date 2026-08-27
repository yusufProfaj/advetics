import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateClientInput,
  TenantContext,
  UpdateClientInput,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { uniqueSlug } from '../../common/utils/slug';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Müşteri (client) yönetimi.
 *
 * Dikkat: hiçbir sorguda `orgId` filtresi YAZILMIYOR. Bu bilinçlidir —
 * RLS zaten kullanıcının organizasyonu dışındaki satırları görünmez kılar.
 * Uygulama katmanına ikinci bir filtre yazmak, iki filtrenin zamanla
 * ayrışması riskini doğurur; tek doğruluk kaynağı politikalardır.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Müşteri listesi — AKTİF MÜŞTERİ SEÇİMİ UYGULANMADAN.
   *
   * `activeClientId: null` ile çağrılıyor ve bu şart. Aktif müşteri seçimi
   * RLS'te `can_access_client` üzerinden veriyi seçili müşteriye daraltıyor;
   * aşağıdaki `_count.adAccounts` da reklam hesaplarını saydığı için o
   * daraltmaya takılıyordu. Sonuç: Çiftçi Grup seçiliyken diğer 11 müşteri
   * "0 hesap" görünüyor ve ekran "bağlı reklam hesabı yok — bu müşteride hiç
   * veri görünmeyecek" diye UYARIYORDU. Hesaplar yerli yerindeydi.
   *
   * Bu ekranın tanımı gereği kapsamı TÜM müşteriler: "hangi müşteride ne var"
   * sorusuna cevap veriyor. Seçili müşteriye daraltmak, sorunun kendisini
   * ortadan kaldırırdı.
   *
   * YETKİ KATMANI DOKUNULMAMIŞ durumda: `clientIds` ve `isOrgAdmin` aynen
   * geçiyor, yani portföy yöneticisi yine yalnızca kendi müşterilerini
   * görüyor. Kaldırılan tek şey SEÇİM daraltması.
   */
  async list(ctx: TenantContext) {
    return this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) =>
      tx.client.findMany({
        where: { status: { not: 'archived' } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          reportingCurrency: true,
          status: true,
          createdAt: true,
          /**
           * ÖZEL REKLAM KATEGORİLERİ LİSTEDE DÖNÜYOR.
           *
           * Beyanın müşteri kartında görünmesi gerekiyor: kampanya kurarken
           * değil, müşteri tanımlanırken verilen bir karar ve unutulduğunda
           * ceza hesap seviyesinde.
           */
          specialAdCategories: true,
          /*
           * İLETİŞİM VE FİRMA ALANLARI LİSTEDE DÖNÜYOR.
           *
           * Müşteri kartı küçüldü ve detay bir pencerede açılıyor; o pencere
           * bu alanları gösteriyor. Tek müşteri için ikinci bir uç açmak,
           * pencere her açıldığında bir tur daha demekti.
           *
           * Yük önemsiz: hepsi kısa VARCHAR ve müşteri sayısı onlarca.
           * `connections` listesindeki tuzağın (şifreli token ve JSONB
           * kolonlarını `include` ile çekmek) tersi bir durum — burada
           * çekilen şey gerçekten ekranda kullanılıyor.
           */
          contactName: true,
          contactEmail: true,
          contactPhone: true,
          website: true,
          address: true,
          taxOffice: true,
          taxNumber: true,
          iban: true,
          notes: true,
          /**
           * Reklam hesabı ve ekip sayıları listede GÖRÜNMEK ZORUNDA.
           *
           * Müşteriler ekranının tek işi "hangi müşteride ne var" sorusuna
           * cevap vermek. Sayılar olmadan liste yalnızca isimlerden ibaret
           * kalıyor ve hesabı olmayan bir müşteri — yani hiç veri gelmeyecek
           * bir müşteri — hesabı olandan ayırt edilemiyor.
           *
           * `syncEnabled` hesap başına dönüyor: ATANMIŞ olmak ile İZLENİYOR
           * olmak farklı. Portföy seed'i 27 hesabı bağladı ama hiçbirini
           * açmamıştı ve panel "veri yok" gösteriyordu; ekranda ayrı
           * görünseydi sebep bir bakışta anlaşılırdı.
           */
          _count: { select: { adAccounts: true, memberships: true } },
          /**
           * HESAPLARIN KENDİSİ DE DÖNÜYOR, yalnızca sayısı değil.
           *
           * Sayı "bu müşteride bir şey var mı" sorusuna cevap veriyor ama
           * "HANGİSİ var" sorusuna vermiyor — ve havuz modelinde asıl sorulan
           * bu. Ajansın 157 hesabı tek havuzda duruyor; bir müşterinin hangi
           * hesapları aldığını görmek için tek yol Platform Bağlantıları
           * ekranında 157 satır arasında aramaktı.
           *
           * Satır sayısı sorun değil: atanmış hesaplar müşteri başına birkaç
           * tane (portföyde en fazla dört). Havuzun tamamı BURADAN dönmüyor.
           */
          adAccounts: {
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              platform: true,
              externalId: true,
              syncEnabled: true,
            },
          },
          socialProfiles: {
            orderBy: { name: 'asc' },
            /**
             * `syncEnabled` ŞART — unutulduğu için ekran sessizce yalan
             * söylüyordu.
             *
             * Alan gönderilmeyince tarayıcıda `undefined` oluyor: rozet hep
             * "gönderiler çekilmiyor" kalıyor, düğme hep "izlemeye al" yazıyor
             * ve tıklamadan sonra ekran birebir aynı görünüyor. Kullanıcı için
             * bu "düğme çalışmıyor" demek — oysa istek gidiyor, veritabanı
             * güncelleniyor, yalnızca ekran haberi almıyor.
             *
             * Panel tarafındaki tip bu alanı ZORUNLU sayıyor ama derleyici
             * yakalayamıyor: yanıt `serverApiFetch<ClientRow[]>` ile
             * denetlenmeden dönüştürülüyor. Bu yüzden aşağıdaki test alanın
             * varlığını kilitliyor.
             */
            select: {
              id: true,
              name: true,
              profileType: true,
              syncEnabled: true,
              /**
               * `linkedAdAccountId` DE ŞART — `syncEnabled` ile aynı hikâye.
               *
               * Boost bu hesaptan faturalanıyor ve alan gönderilmezse ekran
               * hangi sayfanın eşleştirilmiş olduğunu gösteremiyor: kullanıcı
               * eşleştirdiği hesabı göremediği için tekrar tekrar seçiyor.
               */
              linkedAdAccountId: true,
            },
          },
        },
      }),
    );
  }

  async findById(ctx: TenantContext, id: string) {
    const client = await this.prisma.withTenant(ctx, (tx) =>
      tx.client.findUnique({
        where: { id },
        include: {
          branding: true,
          _count: { select: { memberships: true } },
        },
      }),
    );
    // RLS erişim yoksa satırı yok sayar; "bulunamadı" ile "yetkin yok" aynı
    // cevabı verir. Bu kasıtlıdır — 403 dönmek, kaydın var olduğunu sızdırır.
    if (!client) throw new NotFoundException('Müşteri bulunamadı');
    return client;
  }

  async create(ctx: TenantContext, input: CreateClientInput, meta: Meta) {
    /*
     * KİMLİK ÖNDEN ÜRETİLİYOR — ve sebebi RLS.
     *
     * Prisma her INSERT'i `RETURNING` ile yapıyor ve Postgres `RETURNING`
     * satırını tablonun SELECT POLİTİKASINDAN DA geçiriyor. `adv_clients_
     * select` "org yöneticisi ya da erişim listendeki müşteri" diyor; yeni
     * açılan müşterinin kimliği ise o listede olamaz — liste oturum
     * kurulurken hesaplandı. Sonuç: org yöneticisi olmayan bir kullanıcı
     * (reklam yöneticisi) müşteriyi AÇABİLİYOR ama çağrı
     * "new row violates row-level security policy" ile düşüyor. INSERT'in
     * kendisi geçiyor — düşen yalnızca RETURNING; PGlite'ta ölçüldü
     * (`rol-havuz-rls.spec.ts`).
     *
     * Politikayı gevşetmek yanlış olurdu: "kimse görmediği satırı
     * oluşturamaz" kuralı yerinde. Doğrusu kapsamı BU TRANSACTION için ve
     * YALNIZCA az sonra yazılacak kimlikle genişletmek. Kimlik henüz hiçbir
     * satıra ait değil, dolayısıyla başka hiçbir satırı açmıyor.
     */
    const clientId = randomUUID();

    return this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_client_ids', ${[...ctx.clientIds, clientId].join(',')}, true)
      `;

      const slug = await uniqueSlug(input.slug ?? input.name, async (candidate) => {
        const found = await tx.client.findFirst({
          where: { orgId: ctx.orgId, slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });

      const client = await tx.client.create({
        data: {
          id: clientId,
          orgId: ctx.orgId,
          name: input.name,
          slug,
          timezone: input.timezone,
          reportingCurrency: input.reportingCurrency,
          specialAdCategories: input.specialAdCategories,
          // İLETİŞİM VE FATURA BİLGİSİ — hepsi opsiyonel, boş dizge şemada
          // `null`'a çevriliyor ("girilmedi" ile "boş girildi" ayrımı).
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          website: input.website,
          address: input.address,
          taxOffice: input.taxOffice,
          taxNumber: input.taxNumber,
          iban: input.iban,
          notes: input.notes,
        },
      });

      // Müşteriye özel marka profili baştan oluşturulur; boş bırakılan alanlar
      // organizasyon varsayılanından devralınır (bkz. BrandingService.resolve).
      await tx.brandingProfile.create({
        data: { orgId: ctx.orgId, clientId: client.id, emailFromName: input.name },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.created',
        targetType: 'client',
        targetId: client.id,
        clientId: client.id,
        after: { name: client.name, slug: client.slug, timezone: client.timezone },
        ...meta,
      });

      return client;
    });
  }

  async update(ctx: TenantContext, id: string, input: UpdateClientInput, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Müşteri bulunamadı');

      const after = await tx.client.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.reportingCurrency !== undefined
            ? { reportingCurrency: input.reportingCurrency }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === 'archived' ? { archivedAt: new Date() } : {}),
          /**
           * ÖZEL KATEGORİ DEĞİŞİKLİĞİ DENETİM KAYDINA DA GİRİYOR (aşağıda,
           * `client.updated`). Bir müşterinin konut beyanının ne zaman ve kim
           * tarafından kaldırıldığı, politika ihlali soruşturmasında
           * sorulacak ilk şey.
           */
          ...(input.specialAdCategories !== undefined
            ? { specialAdCategories: input.specialAdCategories }
            : {}),
          /*
           * ═══ İLETİŞİM ALANLARI SESSİZCE DÜŞÜYORDU ═══
           *
           * Şema (`updateClientSchema`) bunları KABUL EDİYOR, `GET
           * /clients/:id` DÖNDÜRÜYOR — ama `update()` hiçbirini yazmıyordu.
           * Yani panelden gönderilen iletişim bilgisi 200 dönüp kayboluyor,
           * kullanıcı kaydettiğini sanıyordu. Alanların tek giriş noktası
           * "Yeni müşteri" sihirbazıydı; müşteri açıldıktan sonra iletişim
           * bilgisi HİÇ düzenlenemiyordu.
           *
           * `contact_email` rapor gönderiminin okuyacağı alan — bu boşluk
           * kapanmadan mail gönderimi kurulamıyordu.
           *
           * `null` GEÇERLİ BİR DEĞER: alanı temizlemek de bir düzenleme.
           * Bu yüzden `!== undefined` kontrolü, `??` değil.
           */
          ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
          ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
          ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.taxOffice !== undefined ? { taxOffice: input.taxOffice } : {}),
          ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber } : {}),
          ...(input.iban !== undefined ? { iban: input.iban } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.updated',
        targetType: 'client',
        targetId: id,
        clientId: id,
        before: {
          name: before.name,
          timezone: before.timezone,
          reportingCurrency: before.reportingCurrency,
          status: before.status,
        },
        after: {
          name: after.name,
          timezone: after.timezone,
          reportingCurrency: after.reportingCurrency,
          status: after.status,
        },
        ...meta,
      });

      return after;
    });
  }

  /**
   * Arşivleme — silme DEĞİL.
   *
   * Bir müşteriyi gerçekten silmek, ona bağlı tüm reklam verisini, kural
   * geçmişini ve denetim kaydını da götürür. Ajans ürününde bu veri
   * sözleşmesel olarak saklanmak zorundadır. Kalıcı silme ayrı ve bilinçli
   * bir işlemdir (Modül 1.5: veri saklama politikası).
   */
  async archive(ctx: TenantContext, id: string, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Müşteri bulunamadı');

      const archived = await tx.client.update({
        where: { id },
        data: { status: 'archived', archivedAt: new Date() },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.archived',
        targetType: 'client',
        targetId: id,
        clientId: id,
        before: { status: before.status },
        after: { status: archived.status },
        ...meta,
      });

      return archived;
    });
  }
}
