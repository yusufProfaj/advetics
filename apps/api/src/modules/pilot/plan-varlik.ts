import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { satirVarlikIdleri, type PlanOnerisi, type TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetStorageService } from '../../storage/onizleme';
import { planOku, surumOku } from './plan.service';
import type { OkumaTx } from './plan-girdisi';

/**
 * ═══ PLAN KAPSAMLI GÖRSEL ═══ `GET /pilot/planlar/:id/varliklar/:varlikId`
 *
 * Müşteri hesabı (client_viewer) planında reklam metninin hangi görselle
 * yayınlanacağını görmeli; arşivin önizleme ucu `bulk.read` istiyor ve
 * müşteride yok. O izni müşteriye açmak bütün arşivi açmak olurdu. Bu uç
 * yalnız PLANIN gösterdiği görseli verir:
 *   · plan bağlamın workspace'inde (RLS + `planOku`ndaki bağlam listesi),
 *   · varlık o planın GÜNCEL ya da ONAYLANAN sürümünün bir satırında
 *     (görsel listesi ya da metnin bağlı olduğu görsel) geçiyor,
 *   · varlık planın `client_id`sine ait ve GÖRSEL (`kind = 'image'`).
 * Herhangi biri tutmazsa AYNI 404: "var ama göremezsin" ile "yok" ayırt
 * edilemesin (IDOR, J-05). Video verilmez: 200 MB'a kadar bir dosyayı
 * önizleme diye belleğe almak paylaşımlı VPS'te diğer siteleri de yorar ve
 * plan belgesi videoya küçük resim çizmiyor.
 */
const YOK = 'Görsel bulunamadı';

export function planVarlikIdleri(p: Pick<PlanOnerisi, 'satirlar'>): Set<string> {
  const idler = new Set<string>();
  for (const s of p.satirlar) {
    for (const id of satirVarlikIdleri(s)) idler.add(id);
    if (s.metinler?.dolu) for (const m of s.metinler.deger) if (m.varlikId) idler.add(m.varlikId);
  }
  return idler;
}

@Injectable()
export class PilotVarlikService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depo: AssetStorageService,
  ) {}

  async gorsel(ctx: TenantContext, planId: string, varlikId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const v = await this.prisma.withTenant(ctx, async (t) => {
      const tx = t as unknown as OkumaTx & { $executeRaw(q: Prisma.Sql): Promise<number> };
      const p = await planOku(tx, ctx, planId, false).catch((e: unknown) => {
        if (e instanceof NotFoundException) return null;
        throw e;
      });
      if (!p) return null;
      const surumler = [...new Set([p.surum, p.onaylanan_surum].filter((x): x is number => x !== null))];
      let planda = false;
      for (const s of surumler) if (planVarlikIdleri(await surumOku(tx, p.id, s)).has(varlikId)) planda = true;
      if (!planda) return null;
      const [a] = await tx.$queryRaw<Array<{ anahtar: string; tur: string }>>(Prisma.sql`
        SELECT storage_key AS anahtar, mime_type AS tur FROM assets
         WHERE id = ${varlikId}::uuid AND client_id = ${p.client_id}::uuid AND kind = 'image'`);
      return a ?? null;
    });
    if (!v) throw new NotFoundException(YOK);
    // Disk okuması transaction DIŞINDA (büyük dosya bağlantıyı tutmasın).
    return { buffer: await this.depo.read(v.anahtar), mimeType: v.tur };
  }
}
