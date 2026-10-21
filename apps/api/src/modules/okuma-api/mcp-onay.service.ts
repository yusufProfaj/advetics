import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MCP_ONAY_SURESI_DK,
  type McpOnayDurumu,
  type McpOnayIslemi,
  type McpOnayListesi,
  type McpOnayOzeti,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AracArgumanHatasi } from './okuma-araclari';

/**
 * ═══ MCP ONAY SATIRLARI (`docs/okuma-api/MCP-YAZMA-MIMARI.md` § 2) ═══
 *
 * Bütün yollar `withTenant` içinde, EV bağlamıyla (anahtarın sahibi). RLS
 * satırı yalnız sahibine gösteriyor; sorgular ayrıca `anahtar_id` ile
 * süzülüyor: aynı kişinin İKİ anahtarı varsa biri öbürünün açtığı onayı
 * uygulayamamalı (dizüstündeki Claude, masaüstündekinin önerisini onaylamaz).
 */
export interface Ev {
  ctx: TenantContext;
  anahtarId: string;
}

/** Uygulanmak üzere ALINMIŞ onay: argümanlar sunucudan, modelden değil. */
export interface AlinanOnay {
  id: string;
  islem: McpOnayIslemi;
  hedef: Record<string, unknown>;
  /** Kullanıcının onayladığı özet; workspace denetim kaydına aynen yazılır. */
  ozet: string[];
}

const LISTE_SINIRI = 50;

interface Satir {
  id: string;
  anahtarId: string;
  islem: string;
  ozet: Prisma.JsonValue;
  durum: string;
  hata: string | null;
  bitis: Date;
  kararAt: Date | null;
  createdAt: Date;
}

export function onayOzetine(s: Satir, simdi: Date = new Date()): McpOnayOzeti {
  const durum = s.durum as McpOnayDurumu;
  return {
    id: s.id,
    anahtarId: s.anahtarId,
    islem: s.islem as McpOnayIslemi,
    ozet: Array.isArray(s.ozet) ? s.ozet.map(String) : [],
    durum: durum === 'bekliyor' && s.bitis.getTime() <= simdi.getTime() ? 'suresi_doldu' : durum,
    hata: s.hata,
    olusturulma: s.createdAt.toISOString(),
    bitis: s.bitis.toISOString(),
    kararZamani: s.kararAt?.toISOString() ?? null,
  };
}

const SECIM = {
  id: true,
  anahtarId: true,
  islem: true,
  ozet: true,
  durum: true,
  hata: true,
  bitis: true,
  kararAt: true,
  createdAt: true,
} satisfies Prisma.McpOnaySelect;

@Injectable()
export class McpOnayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ac(ev: Ev, islem: McpOnayIslemi, hedef: Record<string, unknown>, ozet: string[]): Promise<McpOnayOzeti> {
    return this.prisma.withTenant(ev.ctx, async (tx) => {
      const s = await tx.mcpOnay.create({
        data: {
          anahtarId: ev.anahtarId,
          userId: ev.ctx.userId,
          islem,
          hedef: hedef as Prisma.InputJsonValue,
          ozet,
          bitis: new Date(Date.now() + MCP_ONAY_SURESI_DK * 60_000),
        },
        select: SECIM,
      });
      await this.audit.record(tx, ev.ctx, {
        action: 'mcp.onay_ac',
        targetType: 'mcp_onay',
        targetId: s.id,
        clientId: null,
        after: { islem, hedef, ozet, anahtarId: ev.anahtarId } as Prisma.InputJsonValue,
      });
      return onayOzetine(s);
    });
  }

  /**
   * ONAYI AL — tek seferde. `UPDATE … WHERE durum = 'bekliyor' AND bitis >
   * now() RETURNING`: iki eşzamanlı `onayla` (istemcinin yeniden denemesi)
   * aynı satırı ikinci kez alamaz, yani aynı yayın iki kez kurulmaz. Önce
   * okuyup sonra yazmak (SELECT → UPDATE) bu yarışı açık bırakırdı.
   *
   * Alınamazsa NEDENİ söyleniyor: yok / başka anahtarın / süresi dolmuş /
   * zaten uygulandı / vazgeçildi. Dördünün de modelin yapacağı iş farklı.
   */
  async al(ev: Ev, kod: string): Promise<AlinanOnay> {
    if (!/^[0-9a-f-]{36}$/i.test(kod)) throw new AracArgumanHatasi('onay_kodu bir UUID olmalı (aracın döndürdüğü onay_kodu).');
    return this.prisma.withTenant(ev.ctx, async (tx) => {
      const alinan = await tx.$queryRaw<Array<{ id: string; islem: McpOnayIslemi; hedef: Record<string, unknown>; ozet: unknown }>>(Prisma.sql`
        UPDATE mcp_onaylari SET durum = 'uygulaniyor', karar_at = now()
         WHERE id = ${kod}::uuid AND user_id = ${ev.ctx.userId}::uuid AND anahtar_id = ${ev.anahtarId}::uuid
           AND durum = 'bekliyor' AND bitis > now()
        RETURNING id::text, islem, hedef, ozet`);
      const h = alinan[0];
      const a = h ? { id: h.id, islem: h.islem, hedef: h.hedef, ozet: Array.isArray(h.ozet) ? h.ozet.map(String) : [] } : undefined;
      if (a) {
        await this.audit.record(tx, ev.ctx, {
          action: 'mcp.onayla',
          targetType: 'mcp_onay',
          targetId: a.id,
          clientId: null,
          after: { islem: a.islem, anahtarId: ev.anahtarId },
        });
        return a;
      }
      const s = await tx.mcpOnay.findFirst({ where: { id: kod }, select: { anahtarId: true, durum: true, bitis: true } });
      if (!s) throw new AracArgumanHatasi('Onay bulunamadı. Kodu aracın son cevabından aynen kopyala.');
      if (s.anahtarId !== ev.anahtarId) throw new AracArgumanHatasi('Bu onay başka bir anahtarla açılmış; bu bağlantıdan onaylanamaz.');
      if (s.durum === 'bekliyor') throw new AracArgumanHatasi(`Onayın süresi dolmuş (${MCP_ONAY_SURESI_DK} dk). İşlemi aynı araçla yeniden başlat; özet güncel değerle yeniden çıkar.`);
      if (s.durum === 'vazgecildi') throw new AracArgumanHatasi('Bu onaydan vazgeçilmiş. Gerekirse işlemi yeniden başlat.');
      throw new AracArgumanHatasi(`Bu onay zaten işlendi (durum: ${s.durum}). İkinci kez uygulanmaz; sonucu \`onaylar\` aracında gör.`);
    });
  }

  /** Sonucu yaz. `uygulaniyor` dışındaki satıra dokunmaz (geç gelen ikinci sonuç ilkini ezmesin). */
  async bitir(ev: Ev, id: string, durum: 'uygulandi' | 'basarisiz', sonuc: unknown, hata: string | null): Promise<void> {
    await this.prisma.withTenant(ev.ctx, async (tx) => {
      const { count } = await tx.mcpOnay.updateMany({
        where: { id, userId: ev.ctx.userId, durum: 'uygulaniyor' },
        data: { durum, sonuc: (sonuc ?? Prisma.JsonNull) as Prisma.InputJsonValue, hata },
      });
      await this.audit.record(tx, ev.ctx, {
        action: durum === 'uygulandi' ? 'mcp.uygulandi' : 'mcp.basarisiz',
        targetType: 'mcp_onay',
        targetId: id,
        clientId: null,
        after: { hata, yazildi: count > 0 },
      });
    });
  }

  /**
   * WORKSPACE DENETİM KAYDI. Onay satırının kendi kayıtları (`mcp.onay_ac`,
   * `mcp.onayla`, `mcp.uygulandi`) anahtar sahibinin EV bağlamında ve
   * `client_id` boş: workspace'in Denetim ekranında görünmüyorlardı. Görev
   * "her işlemde kayıt (kim, ne zaman, hangi hesap, tutar)": özet satırları
   * hesabı ve tutarı zaten taşıyor; bu kayıt onları WORKSPACE bağlamında
   * (`ws`, `McpYazmaService.workspace` çözdü) ve o workspace'e bağlı yazıyor.
   */
  async isKaydi(
    ws: TenantContext,
    action: 'mcp.islem_onerildi' | 'mcp.islem_uygulandi' | 'mcp.islem_basarisiz',
    onayId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.withTenant(ws, (tx) =>
      this.audit.record(tx, ws, {
        action,
        targetType: 'mcp_onay',
        targetId: onayId,
        clientId: ws.activeClientId,
        after: { ...after, kanal: 'mcp' } as Prisma.InputJsonValue,
      }),
    );
  }

  async vazgec(ev: Ev, kod: string): Promise<McpOnayOzeti> {
    if (!/^[0-9a-f-]{36}$/i.test(kod)) throw new AracArgumanHatasi('onay_kodu bir UUID olmalı.');
    return this.prisma.withTenant(ev.ctx, async (tx) => {
      const { count } = await tx.mcpOnay.updateMany({
        where: { id: kod, userId: ev.ctx.userId, anahtarId: ev.anahtarId, durum: 'bekliyor' },
        data: { durum: 'vazgecildi', kararAt: new Date() },
      });
      const s = await tx.mcpOnay.findFirst({ where: { id: kod, anahtarId: ev.anahtarId }, select: SECIM });
      if (!s) throw new AracArgumanHatasi('Onay bulunamadı.');
      if (count === 0 && s.durum !== 'vazgecildi') {
        throw new AracArgumanHatasi(`Bu onay artık beklemiyor (durum: ${s.durum}); vazgeçilemez.`);
      }
      return onayOzetine(s);
    });
  }

  /** Son satırlar + toplam (sessiz kesme yok). `anahtarId` verilirse yalnız o anahtarın. */
  async listele(ctx: TenantContext, anahtarId?: string): Promise<McpOnayListesi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const where = { userId: ctx.userId, ...(anahtarId ? { anahtarId } : {}) };
      // Sırayla: etkileşimli transaction'da paralel sorgu tek bağlantıda sıraya giriyor zaten.
      const satirlar = await tx.mcpOnay.findMany({ where, orderBy: { createdAt: 'desc' }, take: LISTE_SINIRI, select: SECIM });
      const toplam = await tx.mcpOnay.count({ where });
      const simdi = new Date();
      return { satirlar: satirlar.map((s) => onayOzetine(s, simdi)), toplam };
    });
  }
}
