import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KITLE_CINSIYETLERI,
  kitleIlgiSchema,
  kitleKonumuSchema,
  type KitleIlgi,
  type KitleKonumu,
  type KitleSablonuInput,
  type KitleSablonuListesi,
  type KitleSablonuRecord,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface Satir {
  id: string;
  client_id: string;
  name: string;
  locations: unknown;
  age_min: number;
  age_max: number;
  genders: string;
  interests: unknown;
  updated_at: Date;
}

const logger = new Logger('KitleSablonuService');

/**
 * ═══ KİTLE ŞABLONLARI (Marka Merkezi Bölüm 4) ═══
 *
 * Workspace'e ait adlı hedeflemeler. Hızlı Reklam varsayılan şablonu
 * kendiliğinden uyguluyor ve taslağa KOPYALIYOR (`kitleHedefiSchema`):
 * şablonu sonradan düzenlemek kurulmuş bir taslağın kitlesini değiştirmiyor.
 *
 * org_id MÜŞTERİDEN okunuyor, `ctx.orgId`den değil: "Tüm şirketler"
 * modunda ctx ev şirketini taşıyor ve kardeş şirketin şablonu yanlış
 * org'la yazılırsa o şirketin kendi bağlamında görünmez.
 */
@Injectable()
export class KitleSablonuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext, clientId: string): Promise<KitleSablonuListesi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const satirlar = await tx.$queryRaw<Satir[]>(Prisma.sql`
        SELECT id, client_id, name, locations, age_min, age_max, genders, interests, updated_at
          FROM audience_templates
         WHERE client_id = ${clientId}::uuid
         ORDER BY name
      `);
      const [p] = await tx.$queryRaw<Array<{ id: string | null }>>(Prisma.sql`
        SELECT varsayilan_kitle_id::text AS id FROM client_profiles WHERE client_id = ${clientId}::uuid
      `);
      const varsayilanId = p?.id ?? null;
      return { items: satirlar.map((s) => kayit(s, varsayilanId)), varsayilanId };
    });
  }

  async create(ctx: TenantContext, input: KitleSablonuInput, meta: Meta): Promise<KitleSablonuRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const orgId = await musteriOrg(tx, input.clientId);
      const [s] = await adCakismasi(() =>
        tx.$queryRaw<Satir[]>(Prisma.sql`
          INSERT INTO audience_templates
            (org_id, client_id, name, locations, age_min, age_max, genders, interests,
             created_by_user_id, updated_at)
          VALUES (${orgId}::uuid, ${input.clientId}::uuid, ${input.name},
                  ${JSON.stringify(input.locations)}::jsonb, ${input.ageMin}, ${input.ageMax},
                  ${input.genders}, ${JSON.stringify(input.interests)}::jsonb, ${ctx.userId}::uuid, now())
          RETURNING id, client_id, name, locations, age_min, age_max, genders, interests, updated_at
        `),
      );
      await this.audit.record(tx, ctx, {
        action: 'audience_template.created',
        targetType: 'audience_template',
        targetId: s!.id,
        clientId: input.clientId,
        after: denetim(input),
        ...meta,
      });
      return kayit(s!, null);
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: KitleSablonuInput,
    meta: Meta,
  ): Promise<KitleSablonuRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [once] = await tx.$queryRaw<Satir[]>(Prisma.sql`
        SELECT id, client_id, name, locations, age_min, age_max, genders, interests, updated_at
          FROM audience_templates WHERE id = ${id}::uuid AND client_id = ${input.clientId}::uuid
      `);
      if (!once) throw new NotFoundException('Kitle şablonu bulunamadı.');
      const [s] = await adCakismasi(() =>
        tx.$queryRaw<Satir[]>(Prisma.sql`
          UPDATE audience_templates
             SET name = ${input.name}, locations = ${JSON.stringify(input.locations)}::jsonb,
                 age_min = ${input.ageMin}, age_max = ${input.ageMax}, genders = ${input.genders},
                 interests = ${JSON.stringify(input.interests)}::jsonb, updated_at = now()
           WHERE id = ${id}::uuid
          RETURNING id, client_id, name, locations, age_min, age_max, genders, interests, updated_at
        `),
      );
      await this.audit.record(tx, ctx, {
        action: 'audience_template.updated',
        targetType: 'audience_template',
        targetId: id,
        clientId: input.clientId,
        before: denetim(kayit(once, null)),
        after: denetim(input),
        ...meta,
      });
      return kayit(s!, null);
    });
  }

  async remove(ctx: TenantContext, clientId: string, id: string, meta: Meta): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const silinen = await tx.$queryRaw<Satir[]>(Prisma.sql`
        DELETE FROM audience_templates WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid
        RETURNING id, client_id, name, locations, age_min, age_max, genders, interests, updated_at
      `);
      // SIFIR SATIR = BULUNAMADI, başarı değil. Politikasız ya da yanlış
      // kiracıdaki bir DELETE hata vermeden sıfır satır etkiliyor.
      if (silinen.length === 0) throw new NotFoundException('Kitle şablonu bulunamadı.');
      await this.audit.record(tx, ctx, {
        action: 'audience_template.deleted',
        targetType: 'audience_template',
        targetId: id,
        clientId,
        before: denetim(kayit(silinen[0]!, null)),
        ...meta,
      });
    });
  }

  /**
   * Varsayılan şablonu belirler. Şablon AYNI workspace'in olmak zorunda:
   * yabancı anahtar yalnızca "böyle bir şablon var" diyor, kimin olduğunu
   * söylemiyor (logo kontrolüyle aynı gerekçe, `client-profile.service.ts`).
   */
  async varsayilanYap(
    ctx: TenantContext,
    clientId: string,
    sablonId: string | null,
    meta: Meta,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      if (sablonId) {
        const [s] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM audience_templates WHERE id = ${sablonId}::uuid AND client_id = ${clientId}::uuid
        `);
        if (!s) throw new BadRequestException('Şablon bu workspace’in şablonları arasında yok.');
      }
      const orgId = await musteriOrg(tx, clientId);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO client_profiles (id, org_id, client_id, varsayilan_kitle_id, updated_at)
        VALUES (gen_random_uuid(), ${orgId}::uuid, ${clientId}::uuid, ${sablonId}::uuid, now())
        ON CONFLICT (client_id) DO UPDATE
          SET varsayilan_kitle_id = EXCLUDED.varsayilan_kitle_id, updated_at = now()
      `);
      await this.audit.record(tx, ctx, {
        action: 'audience_template.default_set',
        targetType: 'client_profile',
        targetId: clientId,
        clientId,
        after: { varsayilanKitleId: sablonId },
        ...meta,
      });
    });
  }
}

type Tx = Parameters<Parameters<PrismaService['withTenant']>[1]>[0];

async function musteriOrg(tx: Tx, clientId: string): Promise<string> {
  const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
    SELECT org_id::text AS org_id FROM clients WHERE id = ${clientId}::uuid
  `);
  if (!c) throw new NotFoundException('Workspace bulunamadı.');
  return c.org_id;
}

/** Tekil ad çakışması SEBEBİYLE dönüyor; "beklenmeyen hata" demiyor. */
async function adCakismasi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes('audience_templates_client_id_name_key') || m.includes('23505')) {
      throw new BadRequestException('Bu adla bir kitle şablonu zaten var; başka bir ad seç.');
    }
    throw e;
  }
}

function denetim(
  k: Pick<KitleSablonuInput, 'name' | 'locations' | 'ageMin' | 'ageMax' | 'genders' | 'interests'>,
) {
  return {
    name: k.name,
    locations: k.locations,
    ageMin: k.ageMin,
    ageMax: k.ageMax,
    genders: k.genders,
    interests: k.interests,
  };
}

/**
 * Satırdan kayıt. Bozuk konum öğesi ATLANIYOR ama log'a yazılıyor
 * (`client-profile.service.ts#sayfalar` ile aynı gerekçe).
 */
function kayit(s: Satir, varsayilanId: string | null): KitleSablonuRecord {
  const locations: KitleKonumu[] = [];
  for (const o of Array.isArray(s.locations) ? s.locations : []) {
    const r = kitleKonumuSchema.safeParse(o);
    if (r.success) locations.push(r.data);
    else logger.warn(`audience_templates(${s.id}).locations: geçersiz öğe atlandı — ${JSON.stringify(o).slice(0, 200)}`);
  }
  const interests: KitleIlgi[] = [];
  for (const o of Array.isArray(s.interests) ? s.interests : []) {
    const r = kitleIlgiSchema.safeParse(o);
    if (r.success) interests.push(r.data);
    else logger.warn(`audience_templates(${s.id}).interests: geçersiz öğe atlandı — ${JSON.stringify(o).slice(0, 200)}`);
  }
  const genders = (KITLE_CINSIYETLERI as readonly string[]).includes(s.genders)
    ? (s.genders as KitleSablonuRecord['genders'])
    : 'all';
  return {
    id: s.id,
    clientId: s.client_id,
    name: s.name,
    locations,
    ageMin: Number(s.age_min),
    ageMax: Number(s.age_max),
    genders,
    interests,
    varsayilan: varsayilanId === s.id,
    updatedAt: new Date(s.updated_at).toISOString(),
  };
}
