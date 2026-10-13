import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KURULUM_PLATFORMLARI,
  type KurulumBeyaniIstegi,
  type KurulumBeyani,
  type KurulumPlatformu,
  type SirketKurulumBeyaniIstegi,
  type SirketKurulumYaniti,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { sirketBeyanlariOku, workspaceBeyanlariOku, type SorguCalistirici } from './kurulum-beyan';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Boş gerekçe NULL: "" saklamak son kontrolde `: ""` diye boş tırnak çizerdi. */
const gerekceTemizle = (g: string | undefined): string | null => {
  const t = g?.trim();
  return t ? t : null;
};

/**
 * ═══ KURULUM BEYANLARI + ŞİRKET KURULUMU (docs/kurulum-sihirbazi/MIMARI.md § 5, § 7) ═══
 *
 * Beyan bir KAPSAM kararı: sayaçtan bir parçayı düşürür, "Eksikleri tamamla"
 * ve AdvCampaign yayını ("web sitemiz yok") onu okur. Bu yüzden:
 *
 *   · Yazma ve denetim kaydı AYNI transaction'da. Beyanı yazıp izi
 *     yazamamak, "kim dedi" sorusunu cevapsız bırakan bir kapsam kararı
 *     demekti — son kontrol ekranının bütün sözü bu iz.
 *   · Politikası izin vermeyen yazma SIFIR satır etkiler ve hata vermez
 *     (CLAUDE.md); her yazma RETURNING ile sayılır.
 *   · Geri almak satırı siler. Silinecek satır yoksa (zaten geri alınmış)
 *     sessiz başarı DEĞİL kontrol: satır görünüyor ama silinemiyorsa bu bir
 *     yetki reddi ve öyle söylenir.
 */
@Injectable()
export class KurulumBeyanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * BAĞLAM BU WORKSPACE'E DARALTILIYOR (hazırlık servisiyle aynı gerekçe):
   * sihirbaz workspace'i adresten alıyor ve üst barda BAŞKA bir workspace
   * seçili olabilir; o hâlde RLS beyanı gizler ve kapsam dışı bir öğe
   * "eksik" görünürdü. Daraltma genişletme değil: `clientIds` doğrulandı.
   */
  async workspaceBeyanlari(ctx: TenantContext, clientId: string): Promise<KurulumBeyani[]> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
    return this.prisma.withTenant({ ...ctx, activeClientId: clientId }, (t) => workspaceBeyanlariOku(t as unknown as SorguCalistirici, clientId));
  }

  /**
   * YAZMA YALNIZ O WORKSPACE SEÇİLİYKEN — kurulum yazmalarıyla aynı kural
   * (`kurulum.service.ts#erisim`): seçim yokken yetki en geniş rolden
   * hesaplanıyor ve B'de yalnız izleyici olan biri B'nin kapsamını
   * daraltabilirdi.
   */
  async workspaceBeyanYaz(ctx: TenantContext, clientId: string, dto: KurulumBeyaniIstegi, meta: Meta): Promise<KurulumBeyani[]> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
    if (ctx.activeClientId !== clientId) throw new ConflictException('Değişiklik için önce üstten bu workspace’i seç.');
    if (!ctx.permissions.includes('client.write')) throw new ForbiddenException('Kurulum kapsamını değiştirme yetkin yok.');
    const gerekce = gerekceTemizle(dto.gerekce);
    return this.prisma.withTenant(ctx, async (t) => {
      const db = t as unknown as SorguCalistirici;
      if (dto.kapsamDisi) {
        /*
         * YENİDEN BEYAN ÜZERİNE YAZAR: gerekçe, beyan eden ve zaman tazelenir.
         * İkinci bir satır açılmaz (kısmi tekil indeks); org_id müşteriden
         * okunuyor — `ctx.orgId` "tüm şirketler" modunda ev şirketi kalıyor
         * ve kompozit anahtarı ihlal ederdi (CLAUDE.md, `musteriOrgId`).
         */
        const yazilan = await db.$queryRaw<unknown[]>(Prisma.sql`
          INSERT INTO kurulum_beyanlari (org_id, client_id, oge, gerekce, beyan_eden)
          SELECT c.org_id, c.id, ${dto.oge}, ${gerekce}, ${ctx.userId}::uuid FROM clients c WHERE c.id = ${clientId}::uuid
          ON CONFLICT (client_id, oge) WHERE client_id IS NOT NULL
          DO UPDATE SET gerekce = EXCLUDED.gerekce, beyan_eden = EXCLUDED.beyan_eden, created_at = now()
          RETURNING id`);
        if (yazilan.length !== 1) throw new ForbiddenException('Beyan kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
      } else {
        const silinen = await db.$queryRaw<unknown[]>(Prisma.sql`
          DELETE FROM kurulum_beyanlari WHERE client_id = ${clientId}::uuid AND oge = ${dto.oge} RETURNING id`);
        if (silinen.length === 0) {
          const kalan = await db.$queryRaw<unknown[]>(Prisma.sql`
            SELECT id FROM kurulum_beyanlari WHERE client_id = ${clientId}::uuid AND oge = ${dto.oge}`);
          if (kalan.length > 0) throw new ForbiddenException('Beyan geri alınamadı: bu workspace’i değiştirme yetkin yok.');
        }
      }
      await this.audit.record(t as never, ctx, {
        action: dto.kapsamDisi ? 'kurulum.beyan' : 'kurulum.beyan_geri_alindi',
        targetType: 'client',
        targetId: clientId,
        clientId,
        after: { oge: dto.oge, kapsamDisi: dto.kapsamDisi, gerekce } as Prisma.InputJsonValue,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return workspaceBeyanlariOku(db, clientId);
    });
  }

  /**
   * ŞİRKET KURULUMU OKUMASI (`GET /kurulum/sirket`).
   *
   * SEÇİM KATMANI BU OKUMA İÇİN KAPATILIYOR (`activeClientId: null`): soru
   * "şirketin bütün workspace'leri hangi platformu kullanıyor" ve üst barda
   * seçili tek workspace'e daralmış bir bağlam yalnız onu gösterirdi —
   * öbür workspace'lerin Google'ı kullandığı bilinmez, şirketin Google
   * bağlantısı "kullanılmıyor" diye düşerdi. Genişletme `ctx.clientIds`in
   * DIŞINA çıkmıyor (RLS'in yetki katmanı aynen geçerli).
   *
   * "TÜM ŞİRKETLER" MODUNDA da şirket `ctx.orgId`: workspace listesi ona
   * süzülüyor, yoksa kardeş şirketlerin workspace'leri bu şirketin
   * platform kullanımına karışırdı.
   */
  async sirketDurumu(ctx: TenantContext): Promise<SirketKurulumYaniti> {
    return this.prisma.withTenant({ ...ctx, activeClientId: null }, async (t) => {
      const db = t as unknown as SorguCalistirici;
      const [org] = await db.$queryRaw<Array<{ ad: string; z: boolean | null }>>(Prisma.sql`
        SELECT name AS ad, iki_adim_zorunlu AS z FROM organizations WHERE id = ${ctx.orgId}::uuid`);
      const workspaceler = await db.$queryRaw<Array<{ id: string; ad: string; k: string[] | null }>>(Prisma.sql`
        SELECT c.id::text AS id, c.name AS ad, k.kullanilmayan_platformlar AS k
          FROM clients c
          LEFT JOIN workspace_kurulum k ON k.client_id = c.id
         WHERE c.org_id = ${ctx.orgId}::uuid AND c.status <> 'archived'
         ORDER BY c.name, c.id`);
      const beyanlar = await sirketBeyanlariOku(db, ctx.orgId);
      const liste = workspaceler.map((w) => ({
        id: w.id,
        ad: w.ad,
        kullanilmayanPlatformlar: KURULUM_PLATFORMLARI.filter((p) => (w.k ?? []).includes(p)),
      }));
      /*
       * HİÇ WORKSPACE YOKSA İKİ PLATFORM DA SAYILIR: beyan yok = hepsi
       * sayılır (sözleşmenin genel kuralı). Boş liste döndürmek yeni
       * şirkette bağlantı adımını "kullanılmıyor" diye gizlerdi — tam da
       * ilk yapılması gereken iş.
       */
      const kullanilanPlatformlar: KurulumPlatformu[] =
        liste.length === 0 ? [...KURULUM_PLATFORMLARI] : KURULUM_PLATFORMLARI.filter((p) => liste.some((w) => !w.kullanilmayanPlatformlar.includes(p)));
      return {
        orgId: ctx.orgId,
        sirketAdi: org?.ad ?? '',
        // Satır görünmüyorsa "zorunlu değil" DEĞİL, bilinmiyor.
        ikiAdimZorunlu: org ? org.z === true : null,
        beyanlar,
        workspaceler: liste,
        kullanilanPlatformlar,
      };
    });
  }

  /**
   * ŞİRKET BEYANI — yalnız O şirketin yöneticisi (kapı `sirketKurulum.beyan`).
   * RLS de aynı kuralı taşıyor (`org_id = current_org_id() AND is_org_admin()`),
   * servis kontrolü kullanıcıya Türkçe sebep vermek için.
   */
  async sirketBeyanYaz(ctx: TenantContext, dto: SirketKurulumBeyaniIstegi, meta: Meta): Promise<SirketKurulumYaniti> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Şirketin güvenlik kararını yönetici verir.');
    const gerekce = gerekceTemizle(dto.gerekce);
    await this.prisma.withTenant(ctx, async (t) => {
      const db = t as unknown as SorguCalistirici;
      if (dto.kapsamDisi) {
        const yazilan = await db.$queryRaw<unknown[]>(Prisma.sql`
          INSERT INTO kurulum_beyanlari (org_id, client_id, oge, gerekce, beyan_eden)
          VALUES (${ctx.orgId}::uuid, NULL, ${dto.oge}, ${gerekce}, ${ctx.userId}::uuid)
          ON CONFLICT (org_id, oge) WHERE client_id IS NULL
          DO UPDATE SET gerekce = EXCLUDED.gerekce, beyan_eden = EXCLUDED.beyan_eden, created_at = now()
          RETURNING id`);
        if (yazilan.length !== 1) throw new ForbiddenException('Beyan kaydedilemedi: şirketin kararını yönetici verir.');
      } else {
        const silinen = await db.$queryRaw<unknown[]>(Prisma.sql`
          DELETE FROM kurulum_beyanlari WHERE client_id IS NULL AND org_id = ${ctx.orgId}::uuid AND oge = ${dto.oge} RETURNING id`);
        if (silinen.length === 0) {
          const kalan = await db.$queryRaw<unknown[]>(Prisma.sql`
            SELECT id FROM kurulum_beyanlari WHERE client_id IS NULL AND org_id = ${ctx.orgId}::uuid AND oge = ${dto.oge}`);
          if (kalan.length > 0) throw new ForbiddenException('Beyan geri alınamadı: şirketin kararını yönetici verir.');
        }
      }
      await this.audit.record(t as never, ctx, {
        action: dto.kapsamDisi ? 'kurulum.sirket_beyan' : 'kurulum.sirket_beyan_geri_alindi',
        targetType: 'organization',
        targetId: ctx.orgId,
        after: { oge: dto.oge, kapsamDisi: dto.kapsamDisi, gerekce } as Prisma.InputJsonValue,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    });
    return this.sirketDurumu(ctx);
  }
}
