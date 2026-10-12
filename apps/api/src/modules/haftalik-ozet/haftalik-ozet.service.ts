import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OZET_AJANS_IZNI,
  gunEkle,
  isoHaftaAraligi,
  istanbulGunu,
  kisaOzet,
  nihaiAlicilar,
  ozetGonderimAnahtari,
  ozetHaftasi,
  ozetKitleyeGore,
  ozetPanelAdresi,
  ozetPanelYolu,
  type HaftalikOzetOnizleme,
  type OzetKitlesi,
  type OzetOnizlemeSorgusu,
  type PlanSonucu,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { RaporGonderService } from '../reports/rapor-gonder.service';
import { ozetEpostasi } from './ozet-mail';
import { OzetService } from './ozet.service';

/**
 * ═══ HAFTALIK ÖZET — PANEL UÇLARI (MIMARI § 3) ═══
 *
 * İKİ KAPI, İKİ KATMAN: uç `report.read` istiyor (müşteri hesabı da KENDİ
 * özetini görür); `kitle=ajans` AYRICA `rule.read` istiyor ve kontrol
 * BURADA, sayı üretmeden önce. Müşteri yanıtı `ozetKitleyeGore`dan geçmiş
 * özeti taşıyor: ham `veri` (sinyaller, bekleyen işler, öneri) HİÇBİR
 * yanıtta yok — RLS satırı müşteriye açıyor, süzgeç sunumda.
 */
@Injectable()
export class HaftalikOzetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ozet: OzetService,
    private readonly gonderici: RaporGonderService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private kapi(ctx: TenantContext, clientId: string, kitle: OzetKitlesi): void {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    if (kitle === 'ajans' && !ctx.permissions.includes(OZET_AJANS_IZNI)) {
      throw new ForbiddenException('Ajans görünümü için yetkin yok.');
    }
  }

  async onizleme(ctx: TenantContext, sorgu: OzetOnizlemeSorgusu, simdi = new Date()): Promise<HaftalikOzetOnizleme> {
    this.kapi(ctx, sorgu.clientId, sorgu.kitle);
    const hafta = sorgu.hafta ?? ozetHaftasi(simdi);
    const { ozet: ham, kaynak } = await this.ozet.getir(sorgu.clientId, hafta, simdi);
    const kitle = sorgu.kitle;
    const ozet = ozetKitleyeGore(ham, kitle);
    const eposta = ozetEpostasi(ham, kitle, ozetPanelAdresi(this.config.mail.appUrl, sorgu.clientId, hafta));
    return {
      ozet,
      kitle,
      eposta: { konu: eposta.konu, html: eposta.html },
      kisa: kitle === 'ajans' ? kisaOzet(ozet, ozetPanelYolu(sorgu.clientId, hafta)) : null,
      kaynak,
      gonderim: await this.gonderimDurumu(ctx, sorgu.clientId, hafta, kitle),
    };
  }

  /**
   * Bu haftanın özeti nereye gitti / gidecek. Müşteri planının son sonucu
   * yalnız BU özetin gönderim haftasına (özet haftasından sonraki hafta)
   * düşüyorsa bu özete ait sayılıyor; eski bir haftanın "gönderildi"si bu
   * özeti gönderilmiş gibi göstermesin. Kanallar YALNIZ ajans görünümünde.
   */
  private async gonderimDurumu(
    ctx: TenantContext,
    clientId: string,
    hafta: string,
    kitle: OzetKitlesi,
  ): Promise<HaftalikOzetOnizleme['gonderim']> {
    const scoped = { ...ctx, activeClientId: clientId };
    const pazartesi = gunEkle(isoHaftaAraligi(hafta)!.son, 1);
    const pazar = gunEkle(pazartesi, 6);
    const { plan, musteri, kanallar } = await this.prisma.withTenant(scoped, async (tx) => {
      const [plan] = await tx.$queryRaw<
        Array<{ enabled: boolean; to_emails: string[]; last_run_at: Date | null; last_status: string | null; next_run_at: Date }>
      >(Prisma.sql`
        SELECT enabled, to_emails, last_run_at, last_status, next_run_at FROM report_schedules
         WHERE client_id = ${clientId}::uuid AND tur = 'haftalik_ozet'`);
      const [musteri] = await tx.$queryRaw<Array<{ contact_emails: string[] | null }>>(Prisma.sql`
        SELECT contact_emails FROM clients WHERE id = ${clientId}::uuid`);
      const kanallar =
        kitle === 'ajans'
          ? await tx.$queryRaw<Array<{ id: string; ad: string; durum: string | null }>>(Prisma.sql`
              SELECT k.id::text AS id, k.ad, g.durum
                FROM bildirim_kanallari k
                LEFT JOIN bildirim_gonderimleri g ON g.kanal_id = k.id AND g.anahtar = ${ozetGonderimAnahtari(hafta)}
               WHERE k.client_id = ${clientId}::uuid AND 'haftalik_ozet' = ANY(k.olaylar)
               ORDER BY k.created_at, k.id`)
          : [];
      return { plan, musteri, kanallar };
    });
    let durum: PlanSonucu | 'planli' | 'kapali' = 'kapali';
    let zaman: string | null = null;
    if (plan) {
      const sonGun = plan.last_run_at ? istanbulGunu(new Date(plan.last_run_at)) : null;
      if (sonGun && sonGun >= pazartesi && sonGun <= pazar && plan.last_status) {
        durum = plan.last_status as PlanSonucu;
        zaman = new Date(plan.last_run_at!).toISOString();
      } else if (plan.enabled) {
        durum = 'planli';
        zaman = new Date(plan.next_run_at).toISOString();
      }
    }
    return {
      musteri: {
        durum,
        zaman,
        alicilar: nihaiAlicilar({ secilen: plan?.to_emails ?? [], musteriAdresleri: musteri?.contact_emails ?? [] }),
      },
      kanallar: kanallar.map((k) => ({
        kanalId: k.id,
        ad: k.ad,
        durum: (k.durum ?? 'planli') as HaftalikOzetOnizleme['gonderim']['kanallar'][number]['durum'],
      })),
    };
  }

  /**
   * "Kendime gönder": özeti YALNIZ isteyen kullanıcının kendi adresine.
   * "200 döndü" doğrulama değil: kullanıcı maili gelen kutusunda görür ve
   * istemcide nasıl göründüğünü ancak orada anlar.
   */
  async deneme(
    ctx: TenantContext,
    girdi: { clientId: string; kitle: OzetKitlesi },
    simdi = new Date(),
  ): Promise<{ to: string[]; reddedilen: Array<{ adres: string; sebep: string }>; hafta: string }> {
    this.kapi(ctx, girdi.clientId, girdi.kitle);
    const hafta = ozetHaftasi(simdi);
    const { ozet } = await this.ozet.getir(girdi.clientId, hafta, simdi);
    if (ozet.hacim === 'bos') throw new BadRequestException('Bu hafta harcama yok; gönderilecek bir özet yok.');
    const e = ozetEpostasi(ozet, girdi.kitle, ozetPanelAdresi(this.config.mail.appUrl, girdi.clientId, hafta));
    try {
      const r = await this.gonderici.ozetGonder(ctx, {
        clientId: girdi.clientId,
        toEmails: [],
        konu: e.konu,
        html: e.html,
        yalnizKendine: true,
      });
      return { ...r, hafta };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // SMTP'nin kendi cümlesi yukarı taşınıyor ("kimlik doğrulanamadı" ile
      // "alıcı reddedildi" farklı işler).
      throw new BadRequestException(`Mail gönderilemedi: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
