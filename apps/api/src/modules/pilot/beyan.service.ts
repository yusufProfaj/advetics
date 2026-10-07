import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OZEL_KATEGORILER, sektorCoz, type PilotWorkspaceBeyani, type TenantContext, type WorkspaceBeyaniGirdisi } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { pilotRolu } from './plan.service';
import type { OkumaTx } from './plan-girdisi';
import { ozelKategoriBeyani } from './uyum-profili';

/**
 * ═══ VERİ ADIMI: ÖZEL KATEGORİ + SEKTÖR BEYANI (Ç-2) ═══
 *
 * Workspace başına BİR KEZ sorulur ve her taslağa buradan gider. YASAL
 * BEYAN: yalnız bir kişi yazar (ajans personeli, `client.write`); yapay
 * zekânın hiçbir aracı bu servisi çağırmıyor ve çağıramaz (H-01, B-14).
 *
 * YENİ ALAN DOĞMADI: kategoriler `clients.special_ad_categories`te (eski
 * modüllerin de okuduğu tek yer), beyan izi `clients.ozel_kategori_beyan_*`
 * kolonlarında, sektör `client_profiles.sektor`te (GNL-18 bunu `sektorCoz`
 * ile okuyor). İkinci bir kopya, iki ekranın farklı kategori göstermesi
 * demekti — konut reklamında bu bir hukuk sorunu.
 *
 * BOŞ LİSTE = "HİÇBİRİ" BEYANI; sorulmadı ile aynı şey değil ve fark beyan
 * zamanında. Kategoriler ile beyan zamanı AYNI UPDATE'te yazılıyor: biri
 * yazılıp diğeri düşerse "beyan edildi" görünen bir boş liste kalırdı.
 */
@Injectable()
export class PilotBeyanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async oku(ctx: TenantContext, clientId: string): Promise<PilotWorkspaceBeyani> {
    erisim(ctx, clientId);
    return this.prisma.withTenant(ctx, (tx) => beyanOku(tx as unknown as OkumaTx, ctx, clientId));
  }

  async yaz(ctx: TenantContext, g: WorkspaceBeyaniGirdisi, meta: { ip: string | null; userAgent: string | null; requestId?: string }): Promise<PilotWorkspaceBeyani> {
    erisim(ctx, g.clientId);
    if (pilotRolu(ctx) !== 'ajans' || !ctx.permissions.includes('client.write')) {
      throw new ForbiddenException('Özel kategori ve sektör beyanını ajans yazar.');
    }
    return this.prisma.withTenant(ctx, async (t) => {
      const tx = t as unknown as OkumaTx;
      const once = await beyanOku(tx, ctx, g.clientId);
      const kat = [...g.ozelKategoriler].sort((a, b) => OZEL_KATEGORILER.indexOf(a) - OZEL_KATEGORILER.indexOf(b));
      /*
       * VERİTABANI ESKİ ADI İSTİYOR: `clients_special_categories_chk`
       * (01_constraints.sql) FINANCIAL_PRODUCTS_SERVICES'i değil CREDIT'i
       * kabul ediyor ve bütün okuyucular CREDIT'i yeni ada çeviriyor. CHECK'i
       * burada değiştirmek eski modüllerin yazma yolunu da etkilerdi; yazım
       * eski adla yapılıyor, okuma aynı kalıyor. (Ölçüldü: yeni adla UPDATE
       * CHECK ihlaliyle düşüyordu.)
       */
      const saklanan = kat.map((k) => (k === 'FINANCIAL_PRODUCTS_SERVICES' ? 'CREDIT' : k));
      const c = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        UPDATE clients SET special_ad_categories = ${saklanan}::text[], ozel_kategori_beyan_zamani = now(),
                           ozel_kategori_beyan_eden = ${ctx.userId}::uuid, updated_at = now()
         WHERE id = ${g.clientId}::uuid RETURNING org_id::text`);
      // Sıfır satır = RLS gizledi ya da workspace yok; sessizce "kaydedildi" deme.
      if (c.length !== 1) throw new NotFoundException('Workspace bulunamadı');
      // org_id HEDEF workspace'ten ("tüm şirketler" modunda ctx.orgId ev şirketi).
      const p = await tx.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
        INSERT INTO client_profiles (id, org_id, client_id, sektor, updated_at)
        VALUES (gen_random_uuid(), ${c[0]!.org_id}::uuid, ${g.clientId}::uuid, ${g.sektor}, now())
        ON CONFLICT (client_id) DO UPDATE SET sektor = EXCLUDED.sektor, updated_at = now()
        RETURNING 1 AS ok`);
      if (p.length !== 1) throw new ForbiddenException('Sektör kaydedilemedi.');
      await this.audit.record(t, { ...ctx, orgId: c[0]!.org_id }, {
        action: 'workspace.ozel_kategori_sektor_beyani',
        targetType: 'client',
        targetId: g.clientId,
        clientId: g.clientId,
        before: { ozelKategoriler: once.ozelKategoriler, sektor: once.sektor },
        after: { ozelKategoriler: kat, sektor: g.sektor },
        ...meta,
      });
      return beyanOku(tx, ctx, g.clientId);
    });
  }
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

async function beyanOku(tx: OkumaTx, ctx: TenantContext, clientId: string): Promise<PilotWorkspaceBeyani> {
  // Beyan edenin adı LEFT JOIN: users politikası dar, INNER JOIN satırı süzerdi (J-12).
  const [r] = await tx.$queryRaw<Array<{ kat: string[] | null; zaman: Date | null; kim: string | null; sektor: string | null }>>(Prisma.sql`
    SELECT c.special_ad_categories AS kat, c.ozel_kategori_beyan_zamani AS zaman, u.full_name AS kim, p.sektor
      FROM clients c
      LEFT JOIN users u ON u.id = c.ozel_kategori_beyan_eden
      LEFT JOIN client_profiles p ON p.client_id = c.id
     WHERE c.id = ${clientId}::uuid`);
  if (!r) throw new NotFoundException('Workspace bulunamadı');
  const ham = r.kat ?? [];
  const taninmayan = ham.filter((k) => k !== 'CREDIT' && !(OZEL_KATEGORILER as readonly string[]).includes(k));
  return {
    clientId,
    ozelKategoriler: ozelKategoriBeyani(ham, r.zaman !== null),
    taninmayanKategoriler: taninmayan,
    beyan: r.zaman ? { kim: r.kim, zaman: new Date(r.zaman).toISOString() } : null,
    sektor: r.sektor?.trim() || null,
    sektorEslesmesi: sektorCoz(r.sektor),
    duzenleyebilir: pilotRolu(ctx) === 'ajans' && ctx.permissions.includes('client.write'),
  };
}
