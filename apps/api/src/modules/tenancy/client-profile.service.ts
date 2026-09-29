import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type ClientProfile } from '@prisma/client';
import {
  CAMPAIGN_GOALS,
  sikSayfaSchema,
  type CampaignGoal,
  type ClientProfileRecord,
  type SikSayfa,
  type TenantContext,
  type UpsertClientProfileInput,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Bilgi Bankası — müşterinin genel profili.
 *
 * `BrandingService`in izlediği upsert desenini tekrarlıyor ama org
 * varsayılanına DÜŞMÜYOR: `branding_profiles`ın aksine bu satırın ajans
 * geneli bir hâli yok, `clientId` zorunlu — profil yoksa `null` alanlarla
 * boş bir kayıt anlamına geliyor, org değerine "geri düşme" diye bir kavram
 * gerekmiyor.
 */
@Injectable()
export class ClientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: TenantContext, clientId: string): Promise<ClientProfileRecord> {
    const profile = await this.prisma.withTenant(ctx, (tx) =>
      tx.clientProfile.findUnique({ where: { clientId } }),
    );
    if (profile) return toRecord(profile);

    // KAYIT YOK = BOŞ PROFİL, 404 DEĞİL. Her müşteri profil satırıyla
    // başlamıyor (ilk kez ziyaret edildiğinde yaratılıyor); "henüz
    // doldurulmadı" ile "müşteri bulunamadı" farklı durumlar ve ikincisi
    // burada değil `ClientsService` katmanında zaten kontrol ediliyor.
    return {
      id: '',
      clientId,
      hedefKitle: null,
      markaBilgileri: null,
      bilgiBankasi: null,
      logoAssetId: null,
      markaAdi: null,
      sektor: null,
      urunKategorileri: [],
      sikSayfalar: [],
      anaAmac: null,
      uslup: null,
      vaatler: [],
      updatedAt: '',
    };
  }

  async upsert(
    ctx: TenantContext,
    input: UpsertClientProfileInput,
    meta: Meta,
  ): Promise<ClientProfileRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const client = await tx.client.findUnique({ where: { id: input.clientId } });
      if (!client) throw new NotFoundException('Workspace bulunamadı');

      // LOGO, BU MÜŞTERİNİN VARLIĞI OLMAK ZORUNDA.
      //
      // `logoAssetId` gövdeden geliyor ve tek doğrulaması Zod'un `uuid()`i,
      // yani BİÇİM. Migration'daki yabancı anahtar da yalnızca "böyle bir
      // varlık var" diyor — KİMİN olduğunu söylemiyor. Kontrol olmadan bir
      // kullanıcı kendi müşterisinin profiline BAŞKA bir müşterinin (hatta
      // başka bir organizasyonun) varlık kimliğini yazabiliyor ve INSERT
      // sorunsuz geçiyor.
      //
      // "Zaten `assets` SELECT politikası okumayı engelliyor" YETERLİ DEĞİL:
      // o politika okuma yolunu koruyor, saklanan referansı değil. Satır
      // yanlış kiracıyı gösterdiği anda, logoyu SUNUCU TARAFINDA çözen bir
      // sonraki yol (rapor PDF'i kiracı bağlamı olmayan bir bağlantıyla
      // çiziliyor) bunu sessiz bir sızıntıya çevirir. Yanlış referansı
      // SAKLAMAK zaten hatadır.
      //
      // `null` GEÇERLİ: logoyu kaldırmak meşru bir işlem, kontrol yalnızca
      // bir kimlik verildiğinde çalışıyor.
      if (input.logoAssetId) {
        const sahip = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM assets WHERE id = ${input.logoAssetId}::uuid AND client_id = ${input.clientId}::uuid`,
        );
        if (sahip.length === 0) {
          // Mesaj SEBEBİ söylüyor: "geçersiz kimlik" demek, doğru dosyayı
          // seçtiğini bilen kullanıcıyı olmayan bir arızayı aramaya gönderir.
          throw new BadRequestException(
            'Seçilen logo bu workspace’in görsel arşivinde bulunamadı — logo yalnızca aynı workspace’in varlıklarından seçilebilir.',
          );
        }
      }

      const existing = await tx.clientProfile.findUnique({ where: { clientId: input.clientId } });

      const data = {
        ...(input.hedefKitle !== undefined ? { hedefKitle: input.hedefKitle } : {}),
        ...(input.markaBilgileri !== undefined ? { markaBilgileri: input.markaBilgileri } : {}),
        ...(input.bilgiBankasi !== undefined ? { bilgiBankasi: input.bilgiBankasi } : {}),
        ...(input.logoAssetId !== undefined ? { logoAssetId: input.logoAssetId } : {}),
        // GÖNDERİLMEYEN ALAN DOKUNULMADAN KALIYOR: sekmeler profilin farklı
        // parçalarını ayrı ayrı kaydediyor ve birinin kaydı öbürünü
        // silmemeli. Boş dizi GÖNDERİLİRSE temizliyor — bu kasıtlı.
        ...(input.markaAdi !== undefined ? { markaAdi: input.markaAdi || null } : {}),
        ...(input.sektor !== undefined ? { sektor: input.sektor || null } : {}),
        ...(input.urunKategorileri !== undefined ? { urunKategorileri: input.urunKategorileri } : {}),
        ...(input.sikSayfalar !== undefined
          ? { sikSayfalar: input.sikSayfalar as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.anaAmac !== undefined ? { anaAmac: input.anaAmac } : {}),
        ...(input.uslup !== undefined ? { uslup: input.uslup || null } : {}),
        ...(input.vaatler !== undefined ? { vaatler: input.vaatler } : {}),
      };

      const saved = existing
        ? await tx.clientProfile.update({ where: { id: existing.id }, data })
        : await tx.clientProfile.create({
            data: { orgId: ctx.orgId, clientId: input.clientId, ...data },
          });

      await this.audit.record(tx, ctx, {
        action: 'client_profile.updated',
        targetType: 'client_profile',
        targetId: saved.id,
        clientId: input.clientId,
        // Denetim kaydı kaydın KENDİSİNDEN türüyor: alan listesi elle
        // yazılırsa yeni alan eklendiğinde izden sessizce düşer.
        before: existing ? denetimAlanlari(existing) : null,
        after: denetimAlanlari(saved),
        ...meta,
      });

      return toRecord(saved);
    });
  }
}

const logger = new Logger(ClientProfileService.name);

/** Denetim kaydına giren alanlar: satırın tamamı, kimlik ve zaman damgaları hariç. */
function denetimAlanlari(r: ClientProfile): Prisma.InputJsonObject {
  const { id: _id, orgId: _o, clientId: _c, createdAt: _cr, updatedAt: _u, ...alanlar } = r;
  // Kalan alanların hepsi JSON'a sığıyor (metin, dizi, JSONB); tarih yok.
  return alanlar as Prisma.InputJsonObject;
}

/**
 * JSONB'den sayfa listesi. Veritabanı yalnızca "dizi" olduğunu garanti
 * ediyor (CHECK), öğelerin biçimini değil. Bozuk öğe ATLANIYOR ama SESSİZ
 * DEĞİL: log'a yazılıyor — bozuk bir öğe yüzünden profilin tamamının
 * açılmaması, çözdüğünden büyük bir sorun olurdu.
 */
function sayfalar(clientId: string, ham: Prisma.JsonValue): SikSayfa[] {
  if (!Array.isArray(ham)) return [];
  const iyi: SikSayfa[] = [];
  for (const o of ham) {
    const r = sikSayfaSchema.safeParse(o);
    if (r.success) iyi.push(r.data);
    else logger.warn(`client_profiles(${clientId}).sik_sayfalar: geçersiz öğe atlandı — ${JSON.stringify(o).slice(0, 200)}`);
  }
  return iyi;
}

const amac = (v: string | null): CampaignGoal | null =>
  v !== null && (CAMPAIGN_GOALS as readonly string[]).includes(v) ? (v as CampaignGoal) : null;

function toRecord(row: ClientProfile): ClientProfileRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    hedefKitle: row.hedefKitle,
    markaBilgileri: row.markaBilgileri,
    bilgiBankasi: row.bilgiBankasi,
    logoAssetId: row.logoAssetId,
    markaAdi: row.markaAdi,
    sektor: row.sektor,
    urunKategorileri: row.urunKategorileri,
    sikSayfalar: sayfalar(row.clientId, row.sikSayfalar),
    anaAmac: amac(row.anaAmac),
    uslup: row.uslup,
    vaatler: row.vaatler,
    updatedAt: row.updatedAt.toISOString(),
  };
}
