import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ATIF_SECENEKLERI,
  kanonikJson,
  onayKartiUret,
  type AracSonucu,
  type OnayKarti,
  type TaslakAlanlari,
  type TenantContext,
  kullaniciEksigiMi,
} from '@advetics/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { AjansAyariService } from '../ajans-ayari.service';
import { ReklamAiTaslakService } from '../ai-taslak.service';
import { ReklamHazirlikService } from '../hazirlik.service';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { TxRunner } from '../yayin-motoru';
import { metaYazmaAcikMi } from '../yazma-kapisi';
import type { OturumDurumu } from './araclar';

/**
 * ONAY KARTI ve TEK KULLANIMLIK ONAY (TASARIM-PLAN § 1.6, § 4.5; İP-15).
 *
 * Kart sunucuda üretiliyor ve `adv_onay` satırına KANITIYLA yazılıyor:
 * kullanıcının onayladığı şey ekranda okuduğu kart, kart da taslağın belli
 * bir sürümüne bağlı. Onay anında taslak TAZE okunuyor; kart açıldıktan sonra
 * taslak değiştiyse onay reddediliyor ve kart "bayat" oluyor. Model onay
 * aracına sahip değil: onay yalnız kullanıcının tıklamasıyla gelen istek.
 *
 * Gerçek yayın uyum denetçisi bağlanana kadar kapalı (yayinBaslat da 'UYUM'
 * retiyle duruyor); kart bunu SEBEBİYLE söylüyor ve test kipini yalnız
 * izinli kişiye gösteriyor.
 */
export const KART_OMRU_MS = 24 * 60 * 60_000;
export const GERCEK_YAYIN_KAPALI = 'Gerçek yayın, uyum kontrolü bağlanınca açılacak. Taslak hazır ve Meta kontrolünden geçti.';

@Injectable()
export class AdvOnayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hazirlik: ReklamHazirlikService,
    private readonly taslak: ReklamTaslakService,
    private readonly yayin: ReklamYayinService,
    private readonly ajans: AjansAyariService,
    private readonly aiTaslak: ReklamAiTaslakService,
  ) {}

  private tx(ctx: TenantContext): TxRunner {
    return (fn) => this.prisma.withTenant(ctx, (t) => fn(t as never));
  }

  /** Sohbetin `onay_karti_goster` aracı. */
  async kartGoster(ctx: TenantContext, o: OturumDurumu): Promise<AracSonucu> {
    if (!o.taslakId) return { hal: 'reddedildi', neden: 'Önce taslak kurulmalı.' };
    const kart = await this.kartUret(ctx, o.taslakId);
    if (kart.tur === 'ret') return { hal: 'reddedildi', neden: kart.neden };
    const ozet = createHash('sha256').update(kanonikJson(kart.kart)).digest('hex');
    const [s] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO adv_onay (org_id, client_id, oturum_id, taslak_id, taslak_surum_no, kart, kart_ozeti)
        SELECT org_id, client_id, ${o.id}::uuid, id, ${kart.kart.surumNo}, ${JSON.stringify(kart.kart)}::jsonb, ${ozet}
          FROM reklam_taslagi WHERE id = ${o.taslakId}::uuid
        RETURNING id::text`),
    );
    if (!s) return { hal: 'dustu', platformMesaji: 'Onay kartı kaydedilemedi.' };
    return { hal: 'tamam', veri: { onayId: s.id, ...kart.kart } };
  }

  private async kartUret(ctx: TenantContext, taslakId: string): Promise<{ tur: 'kart'; kart: OnayKarti } | { tur: 'ret'; neden: string }> {
    const t = await this.taslak.oku(ctx, taslakId);
    const [h, prova, atif, kapi, testKipi] = await Promise.all([
      this.hazirlik.oku(ctx, t.clientId),
      this.yayin.provaOku(ctx, taslakId),
      this.ajans.atifOku(ctx),
      metaYazmaAcikMi(this.tx(ctx), t.clientId),
      this.testKipiIzni(ctx, t.clientId),
    ]);
    const a = t.alanlar as TaslakAlanlari;
    const hesap = h.hesaplar.find((x) => x.id === a.reklamHesabiId?.deger) ?? null;
    const sayfa = h.sayfalar.find((x) => x.id === a.sayfaId?.deger) ?? null;
    return {
      tur: 'kart',
      kart: onayKartiUret({
        alanlar: a,
        surumNo: t.aktifSurumNo,
        kalanEksikler: t.eksikler.filter(kullaniciEksigiMi).map((e) => e.metin),
        prova: prova.durum,
        hesap: hesap ? { ad: hesap.ad, paraBirimi: hesap.paraBirimi } : null,
        sayfaAdi: sayfa?.ad ?? null,
        atifEtiketi: ATIF_SECENEKLERI.find((s) => s.kod === atif.standart)?.baslik ?? null,
        kapilar: {
          metaYazma: kapi.acik ? { acik: true } : { acik: false, sebep: `Meta’ya yazma durduruldu: ${kapi.sebep}` },
          yayinYetkisi: ctx.permissions.includes('bulk.publish'),
          gercekYayin: { acik: false, sebep: GERCEK_YAYIN_KAPALI },
          testKipi,
        },
      }),
    };
  }

  /** Test kipi: ajans yöneticisi ve ajansın kendi şirketi (yayinBaslat ile aynı kural). */
  private async testKipiIzni(ctx: TenantContext, clientId: string): Promise<boolean> {
    if (!ctx.isOrgAdmin) return false;
    const [o] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ ajans_mi: boolean }>>(Prisma.sql`
        SELECT (ma.ajans_org_id IS NULL OR ma.ajans_org_id = o.id) AS ajans_mi
          FROM clients c JOIN organizations o ON o.id = c.org_id
          LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
         WHERE c.id = ${clientId}::uuid`),
    );
    return !!o?.ajans_mi;
  }

  async oku(ctx: TenantContext, onayId: string): Promise<{ id: string; durum: string; kart: OnayKarti; yayinId: string | null }> {
    const [s] = await this.tx(ctx)((t) =>
      t.$queryRaw<Array<{ id: string; durum: string; kart: OnayKarti; yayin_id: string | null; created_at: Date; client_id: string }>>(Prisma.sql`
        SELECT id::text, durum, kart, yayin_id::text, created_at, client_id::text FROM adv_onay WHERE id = ${onayId}::uuid`),
    );
    if (!s || !ctx.clientIds.includes(s.client_id)) throw new NotFoundException('Onay kartı bulunamadı');
    const durum = s.durum === 'gosterildi' && Date.now() - new Date(s.created_at).getTime() > KART_OMRU_MS ? 'suresi_doldu' : s.durum;
    return { id: s.id, durum, kart: s.kart, yayinId: s.yayin_id };
  }

  /**
   * Kullanıcının tıklaması. Sıra: kart hâlâ geçerli mi (durum, ömür, sürüm)
   * → düğme bu kartta var mıydı → öneriler kullanıcı kararına çevrilir →
   * yayın başlatılır → onay kapanır. Herhangi bir adım düşerse kart
   * "bayat" olur: aynı kartla ikinci deneme yapılamaz, yenisi açılır.
   */
  async onayla(ctx: TenantContext, onayId: string, mod: 'yayinla' | 'test_kipi'): Promise<{ yayinId: string }> {
    const tx = this.tx(ctx);
    const [s] = await tx((t) =>
      t.$queryRaw<Array<{ id: string; durum: string; kart: OnayKarti; taslak_id: string; taslak_surum_no: number; created_at: Date; client_id: string; aktif: number }>>(Prisma.sql`
        SELECT o.id::text, o.durum, o.kart, o.taslak_id::text, o.taslak_surum_no, o.created_at, o.client_id::text, t.aktif_surum_no AS aktif
          FROM adv_onay o JOIN reklam_taslagi t ON t.id = o.taslak_id WHERE o.id = ${onayId}::uuid`),
    );
    if (!s || !ctx.clientIds.includes(s.client_id)) throw new NotFoundException('Onay kartı bulunamadı');
    if (s.durum === 'onaylandi') throw new ConflictException('Bu kart zaten onaylandı.');
    if (s.durum !== 'gosterildi') throw new ConflictException('Bu kart artık geçerli değil; yeni kart iste.');
    const bayat = async (sebep: string): Promise<never> => {
      await tx((t) => t.$queryRaw(Prisma.sql`UPDATE adv_onay SET durum = 'bayat' WHERE id = ${onayId}::uuid AND durum = 'gosterildi' RETURNING id`));
      throw new ConflictException(sebep);
    };
    if (Date.now() - new Date(s.created_at).getTime() > KART_OMRU_MS) {
      await tx((t) => t.$queryRaw(Prisma.sql`UPDATE adv_onay SET durum = 'suresi_doldu' WHERE id = ${onayId}::uuid AND durum = 'gosterildi' RETURNING id`));
      throw new ConflictException('Kartın süresi doldu; yeni kart iste.');
    }
    if (s.aktif !== s.taslak_surum_no) await bayat('Kart açıldıktan sonra taslak değişti; yeni kart iste.');
    // Düğme bu kartta yoksa (yetki, kapı) istek doğrudan atılmış demektir.
    if (!s.kart.dugmeler.some((d) => d.tur === mod)) throw new ForbiddenException(s.kart.dugmeYokSebebi ?? 'Bu kartta bu eylem yok.');
    if (mod === 'yayinla' && !ctx.permissions.includes('bulk.publish')) throw new ForbiddenException('Yayın yetkin yok.');

    // Asistanın önerileri, kullanıcı kartı onaylayınca KULLANICI kararı olur.
    const t0 = await this.taslak.oku(ctx, s.taslak_id);
    const t = await this.aiTaslak.onayla(ctx, s.taslak_id, t0.icerikOzeti ?? '');
    const r = await this.yayin.baslat(ctx, { taslakId: s.taslak_id, surumNo: t.aktifSurumNo, icerikOzeti: t.icerikOzeti ?? '', testKipi: mod === 'test_kipi', kaynak: 'ai_kart' });
    if (r.tur === 'ret') return bayat(`Yayın başlamadı: ${r.retler.map((x) => x.mesaj).join(' ')}`);
    const k = await tx((x) =>
      x.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE adv_onay SET durum = 'onaylandi', onaylayan_id = ${ctx.userId}::uuid, onay_at = now(), yayin_id = ${r.yayinId}::uuid
         WHERE id = ${onayId}::uuid AND durum = 'gosterildi' RETURNING id::text`),
    );
    // Yayın başladı ama onay kapanmadıysa (eşzamanlı ikinci tık) yayın kaydı
    // yine tek: yayinBaslat aynı taslağa ikinci açık yayını zaten reddediyor.
    if (k.length === 0) throw new ConflictException('Kart başka bir istekle kapandı; yayın durumunu kontrol et.');
    return { yayinId: r.yayinId };
  }
}
