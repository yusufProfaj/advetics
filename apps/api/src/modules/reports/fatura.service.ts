import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FATURA_MAX_BAYT,
  FATURA_MIME,
  kapsananDonemler,
  type FaturaOzeti,
  type FaturaPlatformu,
  type FaturaYuklemeInput,
  type TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';

/**
 * ═══ PLATFORM FATURALARI ═══
 *
 * Rapor mailine eklenen resmi belgeler. Neden elle yüklendiği
 * `packages/shared/src/schemas/fatura.schema.ts` başında yazılı: iki
 * platformda da API'den PDF almak mümkün değil.
 */
@Injectable()
export class FaturaService {
  private readonly logger = new Logger(FaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly storage: AssetStorageService,
  ) {}

  async listele(ctx: TenantContext, clientId: string): Promise<FaturaOzeti[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT f.id::text, f.client_id::text AS client_id, c.name AS client_name,
               f.platform::text AS platform, f.donem, f.file_name, f.byte_size,
               f.aciklama, u.full_name AS uploaded_by_name, f.uploaded_at
          FROM fatura_belgeleri f
          JOIN clients c ON c.id = f.client_id
          JOIN users u ON u.id = f.uploaded_by_user_id
         WHERE f.client_id = ${clientId}::uuid
         ORDER BY f.donem DESC, f.platform
      `),
    );
    return rows.map(satirdanOzet);
  }

  /**
   * Yükler — AYNI DÖNEM+PLATFORM VARSA DEĞİŞTİRİR.
   *
   * Yanına eklemiyor: iki fatura dursaydı maile hangisinin gireceği belirsiz
   * kalırdı ve müşteriye yanlış belge gitmesi sessiz bir hata olurdu.
   */
  async yukle(
    ctx: TenantContext,
    input: FaturaYuklemeInput,
    dosya: { fileName: string; mimeType: string; bytes: Buffer },
  ): Promise<{ id: string }> {
    /*
     * ═══ DOĞRULAMA GİRİŞ ANINDA ═══
     *
     * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında." Bozuk bir
     * dosyanın kullanıldığı an, müşteriye giden mailin oluşturulduğu an
     * olurdu — yani fark edilmesi en pahalı yer.
     */
    if (dosya.mimeType !== FATURA_MIME) {
      throw new BadRequestException(
        `Yalnızca PDF kabul ediliyor (gelen: ${dosya.mimeType}). ` +
          'Fatura resmi bir belge; ekran görüntüsü yerine platformun indirdiği PDF gerekiyor.',
      );
    }
    if (dosya.bytes.byteLength === 0) {
      throw new BadRequestException('Dosya boş.');
    }
    if (dosya.bytes.byteLength > FATURA_MAX_BAYT) {
      throw new BadRequestException(
        `Dosya çok büyük (${Math.round(dosya.bytes.byteLength / 1024 / 1024)} MB). ` +
          `Üst sınır ${FATURA_MAX_BAYT / 1024 / 1024} MB.`,
      );
    }
    /*
     * İÇERİK GERÇEKTEN PDF Mİ — `content-type`a GÜVENİLMİYOR.
     *
     * Tarayıcı gönderdiği MIME'ı uzantıdan tahmin ediyor; `.pdf` uzantılı
     * bir JPEG "application/pdf" olarak gelebilir. Aynı ders raporun kreatif
     * görsellerinde de yaşandı: biçim GÖVDEDEN (sihirli baytlardan)
     * anlaşılıyor, uzantıdan değil.
     */
    if (dosya.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException(
        'Dosya PDF gibi görünmüyor (içerik başlığı %PDF- değil).',
      );
    }

    /*
     * ESKİ DOSYA ÖNCE OKUNUYOR — upsert'ten SONRA değil.
     *
     * İlk yazışta bu sorgu `RETURNING` içindeydi ve YANLIŞTI: alt sorgu
     * upsert'ten sonra koştuğu için YENİ anahtarı döndürüyordu. Eski dosya
     * diskte yetim kalırdı ve paylaşımlı sunucuda sessiz disk dolması,
     * diğer siteleri de etkileyen bir arıza.
     */
    const scoped = { ...ctx, activeClientId: input.clientId };
    const [mevcut] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        SELECT storage_key FROM fatura_belgeleri
         WHERE client_id = ${input.clientId}::uuid
           AND platform = ${input.platform}::"Platform"
           AND donem = ${input.donem}
      `),
    );

    const storageKey = await this.storage.save({
      orgId: ctx.orgId,
      scope: `faturalar/${input.clientId}`,
      bytes: dosya.bytes,
      mimeType: FATURA_MIME,
    });

    let id: string;
    try {
      const rows = await this.prisma.withTenant(scoped, (tx) =>
        tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO fatura_belgeleri (
            id, org_id, client_id, platform, donem, file_name, storage_key,
            byte_size, aciklama, uploaded_by_user_id, uploaded_at
          ) VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
            ${input.platform}::"Platform", ${input.donem},
            ${dosya.fileName.slice(0, 255)}, ${storageKey},
            ${dosya.bytes.byteLength}, ${input.aciklama ?? null},
            ${ctx.userId}::uuid, now()
          )
          -- AYNI DÖNEM+PLATFORM ÜZERİNE YAZILIYOR. Yanına eklenseydi maile
          -- hangisinin gireceği belirsiz kalırdı.
          ON CONFLICT (client_id, platform, donem) DO UPDATE SET
            file_name = EXCLUDED.file_name,
            storage_key = EXCLUDED.storage_key,
            byte_size = EXCLUDED.byte_size,
            aciklama = EXCLUDED.aciklama,
            uploaded_by_user_id = EXCLUDED.uploaded_by_user_id,
            uploaded_at = now()
          RETURNING id::text
        `),
      );
      const row = rows[0];
      if (!row) throw new BadRequestException('Fatura kaydedilemedi.');
      id = row.id;
    } catch (err) {
      /*
       * KAYIT YAZILAMAZSA YENİ DOSYA SİLİNİYOR. Aksi hâlde her başarısız
       * yükleme diskte yetim bir dosya bırakırdı — varlık arşivinde aynı
       * karar verilmişti.
       */
      await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }

    // Üzerine yazıldıysa ESKİ dosya artık kimsenin işine yaramıyor.
    if (mevcut && mevcut.storage_key !== storageKey) {
      await this.storage.remove(mevcut.storage_key).catch(() => undefined);
    }
    return { id };
  }

  async sil(ctx: TenantContext, id: string, clientId: string): Promise<{ silindi: true }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        DELETE FROM fatura_belgeleri WHERE id = ${id}::uuid RETURNING storage_key
      `),
    );
    // SIFIR SATIR = RLS reddetti ya da satır yok. Sessizce "silindi" demek,
    // kullanıcının sildiğini sanması demek olurdu.
    if (rows.length === 0) throw new NotFoundException('Fatura bulunamadı.');
    await this.storage.remove(rows[0]!.storage_key).catch(() => undefined);
    return { silindi: true };
  }

  /** İndirme — panelde önizleme ve doğrulama için. */
  async bytes(
    ctx: TenantContext,
    id: string,
    clientId: string,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string; file_name: string }>>(Prisma.sql`
        SELECT storage_key, file_name FROM fatura_belgeleri WHERE id = ${id}::uuid
      `),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Fatura bulunamadı.');
    return { buffer: await this.storage.read(row.storage_key), fileName: row.file_name };
  }

  /**
   * ═══ RAPOR ARALIĞINA DÜŞEN FATURALAR — MAİL EKİ ═══
   *
   * WORKER'DAN DA ÇAĞRILIYOR (zamanlanmış rapor), bu yüzden `admin`
   * kullanılıyor: oturum yok ve RLS eşleşemezdi.
   *
   * EKSİK DÖNEM AYRICA DÖNÜYOR. CLAUDE.md: "Sessiz kesme yok." Faturasız
   * giden bir rapor, ajansın o ay yüklemeyi unuttuğunu kimseye söylemezdi;
   * çağıran bu listeyi nota ve panele yazıyor.
   */
  async raporEkleri(
    clientId: string,
    from: string,
    to: string,
  ): Promise<{
    ekler: Array<{ filename: string; content: Buffer; contentType: string }>;
    eksikDonemler: string[];
    bulunan: number;
  }> {
    const donemler = kapsananDonemler(from, to);
    if (donemler.length === 0) return { ekler: [], eksikDonemler: [], bulunan: 0 };

    const rows = await this.admin.$queryRaw<
      Array<{ donem: string; platform: string; file_name: string; storage_key: string }>
    >(Prisma.sql`
      SELECT donem, platform::text AS platform, file_name, storage_key
        FROM fatura_belgeleri
       WHERE client_id = ${clientId}::uuid
         AND donem IN (${Prisma.join(donemler)})
       ORDER BY donem, platform
    `);

    const ekler: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    for (const r of rows) {
      try {
        ekler.push({
          filename: dosyaAdi(r.donem, r.platform as FaturaPlatformu, r.file_name),
          content: await this.storage.read(r.storage_key),
          contentType: FATURA_MIME,
        });
      } catch (err) {
        /*
         * DOSYA OKUNAMAZSA RAPOR YİNE GİDİYOR. Kayıt var ama disk okunamıyor
         * (taşınmış, silinmiş) — bu bir arıza ama raporu tamamen durdurmak,
         * çalışan bir gönderimi ikincil bir sorun yüzünden iptal etmek olurdu.
         * Eksik sayılıyor ve nota giriyor.
         */
        this.logger.error(
          `Fatura dosyası okunamadı (${r.donem}/${r.platform}): ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    /*
     * EKSİK = o dönemde HİÇ fatura yok. Platform başına eksik aramıyoruz:
     * müşterinin yalnızca Meta'da reklamı olabilir ve "Google faturası
     * eksik" demek her ay yanlış bir uyarı üretirdi — okunmaz hâle gelen
     * uyarı, hiç olmayan uyarıdan kötü.
     */
    const dolu = new Set(rows.map((r) => r.donem));
    const eksikDonemler = donemler.filter((d) => !dolu.has(d));

    return { ekler, eksikDonemler, bulunan: ekler.length };
  }
}

function dosyaAdi(donem: string, platform: FaturaPlatformu, orijinal: string): string {
  /*
   * DOSYA ADI YENİDEN KURULUYOR. Platformun indirdiği ad genelde
   * "invoice_1234567890.pdf" gibi anlamsız; müşteri mail ekinde hangi ayın
   * hangi platformu olduğunu görmeli. Orijinal ad kayıtta duruyor.
   */
  void orijinal;
  const etiket = platform === 'google' ? 'GoogleAds' : 'MetaAds';
  return `${etiket}-Fatura-${donem}.pdf`;
}

function satirdanOzet(r: Record<string, unknown>): FaturaOzeti {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    clientName: (r.client_name as string) ?? null,
    platform: r.platform as FaturaPlatformu,
    donem: r.donem as string,
    fileName: r.file_name as string,
    byteSize: Number(r.byte_size),
    aciklama: (r.aciklama as string) ?? null,
    uploadedByName: (r.uploaded_by_name as string) ?? null,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
  };
}
