import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AsistanMesaji, AsistanOturumu, AsistanParcasi, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../prisma/prisma.service';
import type { GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import { YAPAY_ZEKA } from '../../../yapay-zeka/yapay-zeka.module';
import { BudgetsService } from '../../budgets/budgets.service';
import { MetricsService } from '../../metrics/metrics.service';
import type { TxRunner } from '../../reklam/yayin-motoru';
import { IyilestirService } from '../iyilestir.service';
import type { AsistanOrtami } from './araclar';
import { AsistanDongusu, type AsistanOlayi, type ModelAdimi } from './dongu';

/**
 * AI ASİSTAN — Nest kabuğu. Kararlar `dongu.ts` (tur) ve `araclar.ts`
 * (araçlar) içinde; burası gerçek bağımlılıkları bağlıyor.
 *
 * OKUMA YOLU PANELİNKİ: `MetricsService` (Okuma API'nin araçlarıyla aynı
 * metotlar), `BudgetsService.pacing`, `IyilestirService.liste`. Yeni SQL
 * yok; RLS ve hesap süzgeci panelle birebir aynı.
 */
@Injectable()
export class AsistanService {
  /** Testte sahte model koyulabilsin diye alan. */
  model: ModelAdimi | null;
  private readonly modelAdi: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly budgets: BudgetsService,
    private readonly iyilestir: IyilestirService,
    @Inject(YAPAY_ZEKA) yz: GeminiIstemcisi | null,
    @Optional() @Inject(CONFIG) config?: AppConfig,
  ) {
    // Düşünme düzeyi AÇIKÇA: varsayılana bırakmak, varsayılan değişince
    // davranışın haber vermeden kayması demek (CLAUDE.md).
    this.model = yz
      ? ({ sistem, araclar, mesajlar, enCokCikti, metinParcasi }) =>
          yz.akis({ sistem, araclar, mesajlar, enCokCikti, dusunme: 'medium' }, metinParcasi)
      : null;
    this.modelAdi = config?.yapayZeka.model ?? 'test';
  }

  private tx(ctx: TenantContext): TxRunner {
    return (fn) => this.prisma.withTenant(ctx, (t) => fn(t as never));
  }

  async oturumAc(ctx: TenantContext, clientId: string): Promise<AsistanOturumu & { asistanBagli: boolean }> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    const scoped = { ...ctx, activeClientId: clientId };
    const [o] = await this.tx(scoped)((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO iyilestir_asistan_oturum (org_id, client_id, user_id)
        SELECT org_id, id, ${ctx.userId}::uuid FROM clients WHERE id = ${clientId}::uuid
        RETURNING id::text`),
    );
    if (!o) throw new NotFoundException('Workspace bulunamadı');
    // Ekran "anahtar yok" hâlini tahmin etmesin, sunucudan öğrensin.
    return { id: o.id, clientId, mesajlar: [], asistanBagli: this.model !== null };
  }

  async oturumOku(ctx: TenantContext, id: string): Promise<AsistanOturumu & { asistanBagli: boolean }> {
    return this.tx(ctx)(async (t) => {
      const [o] = await t.$queryRaw<Array<{ id: string; client_id: string }>>(Prisma.sql`
        SELECT id::text, client_id::text FROM iyilestir_asistan_oturum WHERE id = ${id}::uuid`);
      // RLS süzüyor; bağlam listesi ikinci kapı ("tüm şirketler" modunda RLS
      // kardeş şirketleri de gösteriyor).
      if (!o || !ctx.clientIds.includes(o.client_id)) throw new NotFoundException('Oturum bulunamadı');
      const satirlar = await t.$queryRaw<Array<{ id: string; rol: 'kullanici' | 'asistan'; parcalar: AsistanParcasi[]; created_at: Date }>>(Prisma.sql`
        SELECT id::text, rol, parcalar, created_at FROM iyilestir_asistan_mesaj
         WHERE oturum_id = ${id}::uuid ORDER BY created_at, (rol = 'asistan')`);
      const mesajlar: AsistanMesaji[] = satirlar.map((s) => ({
        id: s.id,
        rol: s.rol,
        parcalar: s.parcalar,
        zaman: new Date(s.created_at).toISOString(),
      }));
      return { id: o.id, clientId: o.client_id, mesajlar, asistanBagli: this.model !== null };
    });
  }

  tur(ctx: TenantContext, oturumId: string, metin: string): AsyncGenerator<AsistanOlayi> {
    const dongu = new AsistanDongusu({
      tx: this.tx(ctx),
      model: this.model,
      ortam: (c, clientId) => this.ortam(c, clientId),
    });
    return dongu.tur(ctx, oturumId, metin);
  }

  private ortam(ctx: TenantContext, clientId: string): AsistanOrtami {
    return {
      ctx,
      clientId,
      bugun: new Date().toISOString().slice(0, 10),
      metrics: this.metrics,
      pacing: (c, q) => this.budgets.pacing(c, q),
      oneriler: (c, id) => this.iyilestir.liste(c, id),
      advcampaignOturumu: (c, id, istem) => this.advcampaignOturumu(c, id, istem),
    };
  }

  /**
   * AdvCampaign'e devir: AdvStrategy aktarımının deseni (`strateji.service.ts`
   * `aktar`). Oturum `hazir_istem` ile açılıyor ve MESAJ OLARAK YAZILMIYOR:
   * kullanıcı göndere basana kadar yalnız bir öneri; reklam kurma kararı
   * asistanın değil kullanıcının.
   */
  private async advcampaignOturumu(ctx: TenantContext, clientId: string, istem: string): Promise<string> {
    const baslik = `AI Asistan: ${istem}`.replace(/\s+/g, ' ').slice(0, 120);
    const [o] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, hazir_istem)
        SELECT org_id, id, ${ctx.userId}::uuid, ${baslik}, ${this.modelAdi}, ${istem.slice(0, 4000)}
          FROM clients WHERE id = ${clientId}::uuid
        RETURNING id::text`),
    );
    if (!o) throw new NotFoundException('Workspace bulunamadı');
    return o.id;
  }
}
