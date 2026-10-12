import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  kanalDurumu,
  webhookDenetle,
  webhookIpucu,
  type BildirimGonderimi,
  type BildirimGonderimleriYaniti,
  type BildirimKanali,
  type BildirimKanallariYaniti,
  type BildirimOlayi,
  type KanalGuncelleGirdisi,
  type KanalOlusturGirdisi,
  type KanalTuru,
  type TeslimDurumu,
  type TenantContext,
} from '@advetics/shared';
import { CryptoService } from '../../crypto/crypto.service';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { govdeKur } from './bildirim-icerik';
import { BildirimTeslimService, GONDERIM_KOLONLARI, gonderimSatirindan, type GonderimSatiri } from './bildirim-teslim.service';
import { EPOSTA_GONDEREN_YOK, epostaGonderenAdresi } from './eposta-gonderen';
import type { TxLike } from './sinyal-hesap';

/**
 * ═══ BİLDİRİM KANALLARI — WORKSPACE AYARI (MIMARI § 3, § 8) ═══
 *
 * ŞİFRELİ ADRES HİÇBİR YANITTA YOK. Liste sorgusunun kolon listesi SABİT
 * (`KANAL_KOLONLARI`) ve `hedef_enc` içermiyor; `hedef_enc`i okuyan TEK yer
 * teslim servisi (BYPASSRLS, gönderim anında çözüyor). Kaynak taraması
 * bunu kilitliyor: şifreli token'ın belleğe alınma dersi
 * (`connections-select.spec.ts`).
 *
 * `org_id` HEDEF MÜŞTERİDEN (`INSERT ... SELECT c.org_id FROM clients`):
 * "tüm şirketler" modunda `ctx.orgId` ev şirketi kalıyor ve kompozit yabancı
 * anahtar patlıyordu (CLAUDE.md).
 */

const KANAL_KOLONLARI = Prisma.sql`
  k.id::text AS id, k.client_id::text AS client_id, k.tur, k.ad, k.hedef_ipucu, k.alicilar, k.olaylar,
  k.etkin, k.dogrulandi, k.created_at, u.full_name AS olusturan,
  t.zaman AS son_zaman, t.durum AS son_durum, t.hata AS son_hata`;

const KANAL_KAYNAGI = Prisma.sql`
  FROM bildirim_kanallari k
  LEFT JOIN users u ON u.id = k.created_by
  LEFT JOIN LATERAL (
    SELECT coalesce(g.gonderildi, g.created_at) AS zaman, g.durum, g.hata
      FROM bildirim_gonderimleri g WHERE g.kanal_id = k.id
     ORDER BY g.created_at DESC LIMIT 1
  ) t ON true`;

interface KanalSatiri {
  id: string;
  client_id: string;
  tur: KanalTuru;
  ad: string;
  hedef_ipucu: string;
  alicilar: string[] | null;
  olaylar: BildirimOlayi[];
  etkin: boolean;
  dogrulandi: Date | string | null;
  created_at: Date | string;
  olusturan: string | null;
  son_zaman: Date | string | null;
  son_durum: TeslimDurumu | null;
  son_hata: string | null;
}

function iso(v: Date | string): string {
  return new Date(v).toISOString();
}

export function kanalSatirindan(r: KanalSatiri): BildirimKanali {
  const sonTeslim = r.son_durum && r.son_zaman ? { zaman: iso(r.son_zaman), durum: r.son_durum, hata: r.son_hata } : null;
  const dogrulandi = r.dogrulandi ? iso(r.dogrulandi) : null;
  return {
    id: r.id,
    clientId: r.client_id,
    tur: r.tur,
    ad: r.ad,
    hedefIpucu: r.hedef_ipucu,
    alicilar: r.alicilar,
    olaylar: r.olaylar,
    etkin: r.etkin,
    dogrulandi,
    sonTeslim,
    durum: kanalDurumu({ etkin: r.etkin, dogrulandi, sonTeslim }),
    olusturan: r.olusturan,
    olusturuldu: iso(r.created_at),
  };
}

/** Alıcıları kırp, küçük harfe indir, tekilleştir (aynı adrese iki mail gitmesin). */
function alicilariDuzle(a: string[]): string[] {
  return [...new Set(a.map((x) => x.trim().toLowerCase()).filter((x) => x !== ''))];
}

@Injectable()
export class BildirimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly crypto: CryptoService,
    private readonly teslim: BildirimTeslimService,
  ) {}

  private kapsam(ctx: TenantContext, clientId: string): TenantContext {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    return { ...ctx, activeClientId: clientId };
  }

  async liste(ctx: TenantContext, clientId: string): Promise<BildirimKanallariYaniti> {
    const scoped = this.kapsam(ctx, clientId);
    const { satirlar, orgId } = await this.prisma.withTenant(scoped, async (tx) => {
      const satirlar = await tx.$queryRaw<KanalSatiri[]>(Prisma.sql`
        SELECT ${KANAL_KOLONLARI} ${KANAL_KAYNAGI}
         WHERE k.client_id = ${clientId}::uuid ORDER BY k.created_at`);
      const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        SELECT org_id::text AS org_id FROM clients WHERE id = ${clientId}::uuid`);
      return { satirlar, orgId: c?.org_id ?? null };
    });
    // Gönderen kimliği RLS'te yalnız sahibine görünüyor: BYPASSRLS ile ve
    // YALNIZ adres OKUNUYOR (parola belleğe bile girmiyor, N-g).
    const adres = orgId ? await epostaGonderenAdresi(this.admin as unknown as TxLike, orgId) : null;
    const kanallar = satirlar.map(kanalSatirindan);
    return {
      kanallar,
      toplam: kanallar.length,
      emptyReason: kanallar.length === 0 ? 'kanal_yok' : null,
      epostaGonderen: adres ? { tanimli: true, adres } : { tanimli: false, neden: EPOSTA_GONDEREN_YOK },
    };
  }

  private async tekKanal(ctx: TenantContext, id: string): Promise<BildirimKanali> {
    const [r] = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) =>
      tx.$queryRaw<KanalSatiri[]>(Prisma.sql`SELECT ${KANAL_KOLONLARI} ${KANAL_KAYNAGI} WHERE k.id = ${id}::uuid`),
    );
    if (!r || !ctx.clientIds.includes(r.client_id)) throw new NotFoundException('Kanal bulunamadı');
    return kanalSatirindan(r);
  }

  async olustur(ctx: TenantContext, dto: KanalOlusturGirdisi): Promise<BildirimKanali> {
    const scoped = this.kapsam(ctx, dto.clientId);
    let hedefEnc: Buffer | null = null;
    let ipucu: string;
    let alicilar: string[] | null = null;
    if (dto.tur === 'eposta') {
      alicilar = alicilariDuzle(dto.alicilar);
      ipucu = `${alicilar.length} alıcı`;
    } else {
      // Şema zaten denetledi; burada NORMALLEŞTİRİLMİŞ adres alınıyor.
      const d = webhookDenetle(dto.tur, dto.adres);
      if (!d.gecerli) throw new BadRequestException(d.neden);
      hedefEnc = this.crypto.encrypt(d.adres);
      ipucu = webhookIpucu(d.adres);
    }
    const [y] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_enc, hedef_ipucu, alicilar, olaylar, created_by)
        SELECT c.org_id, c.id, ${dto.tur}, ${dto.ad}, ${hedefEnc}::bytea, ${ipucu.slice(0, 120)},
               ${alicilar}::text[], ${dto.olaylar}::text[], ${ctx.userId}::uuid
          FROM clients c WHERE c.id = ${dto.clientId}::uuid
        RETURNING id::text AS id`),
    );
    if (!y) throw new NotFoundException('Workspace bulunamadı');
    return this.tekKanal(ctx, y.id);
  }

  /**
   * Tür DEĞİŞMEZ. Adres ya da alıcı değişince `dogrulandi` SIFIRLANIYOR:
   * eski "geldi" cevabı yeni hedef için bir şey kanıtlamıyor.
   */
  async guncelle(ctx: TenantContext, id: string, dto: KanalGuncelleGirdisi): Promise<BildirimKanali> {
    const k = await this.tekKanal(ctx, id);
    const scoped = this.kapsam(ctx, k.clientId);
    let hedefEnc: Buffer | null = null;
    let ipucu: string | null = null;
    let alicilar: string[] | null = null;
    if (dto.adres !== undefined) {
      if (k.tur === 'eposta') throw new BadRequestException('E-posta kanalının adresi yok; alıcıları değiştir.');
      const d = webhookDenetle(k.tur, dto.adres);
      if (!d.gecerli) throw new BadRequestException(d.neden);
      hedefEnc = this.crypto.encrypt(d.adres);
      ipucu = webhookIpucu(d.adres);
    }
    if (dto.alicilar !== undefined) {
      if (k.tur !== 'eposta') throw new BadRequestException('Alıcı listesi yalnız e-posta kanalında var.');
      alicilar = alicilariDuzle(dto.alicilar);
      ipucu = `${alicilar.length} alıcı`;
    }
    const hedefDegisti = hedefEnc !== null || alicilar !== null;
    await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE bildirim_kanallari SET
          ad = coalesce(${dto.ad ?? null}::text, ad),
          olaylar = coalesce(${dto.olaylar ?? null}::text[], olaylar),
          etkin = coalesce(${dto.etkin ?? null}::boolean, etkin),
          hedef_enc = coalesce(${hedefEnc}::bytea, hedef_enc),
          alicilar = coalesce(${alicilar}::text[], alicilar),
          hedef_ipucu = coalesce(${ipucu}::text, hedef_ipucu),
          dogrulandi = CASE WHEN ${hedefDegisti}::boolean THEN NULL ELSE dogrulandi END,
          updated_at = now()
         WHERE id = ${id}::uuid`),
    );
    return this.tekKanal(ctx, id);
  }

  /**
   * Siler. Bekleyen gönderimler ÖNCE `vazgecildi` ile kapatılıyor: kanal
   * gidince `kanal_id` NULL oluyor ve satır "bekliyor"da sonsuza kadar
   * açık görünürdü. Geçmiş (gönderilmişler) kalıyor.
   */
  async sil(ctx: TenantContext, id: string): Promise<{ id: string; silindi: true; iptalEdilenGonderim: number }> {
    const k = await this.tekKanal(ctx, id);
    const scoped = this.kapsam(ctx, k.clientId);
    return this.prisma.withTenant(scoped, async (tx) => {
      const iptal = await tx.$executeRaw(Prisma.sql`
        UPDATE bildirim_gonderimleri SET durum = 'vazgecildi', hata = 'Kanal silindi; gönderilmedi.'
         WHERE kanal_id = ${id}::uuid AND durum IN ('bekliyor', 'basarisiz')`);
      const n = await tx.$executeRaw(Prisma.sql`DELETE FROM bildirim_kanallari WHERE id = ${id}::uuid`);
      if (n === 0) throw new ConflictException('Kanal silinemedi; listeyi yenile.');
      return { id, silindi: true as const, iptalEdilenGonderim: iptal };
    });
  }

  /**
   * DENEME MESAJI. Satır RLS altında (kanalı gören ekleyebilir) yazılıyor,
   * gönderim TRANSACTION DIŞINDA teslim servisinden: platform çağrısı
   * transaction içinde olamaz (CLAUDE.md). Sonuç platformun cümlesiyle döner.
   */
  async dene(ctx: TenantContext, id: string): Promise<BildirimGonderimi> {
    const k = await this.tekKanal(ctx, id);
    const scoped = this.kapsam(ctx, k.clientId);
    const govde = govdeKur({
      baslik: `Deneme mesajı: ${k.ad}`,
      konu: `Advetics · Deneme mesajı`,
      satirlar: [{ etiket: 'Advetics', metin: 'Bu kanal Advetics bildirimleri için kuruldu. Bu mesajı görüyorsanız kanal çalışıyor.' }],
      fazlaBirimi: 'satır',
      baglanti: null,
    });
    const [y] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde, durum)
        SELECT k.org_id, k.client_id, k.id, 'deneme', ${`deneme:${randomUUID()}`}, 'Deneme mesajı',
               ${JSON.stringify(govde)}::jsonb, 'bekliyor'
          FROM bildirim_kanallari k WHERE k.id = ${id}::uuid
        RETURNING id::text AS id`),
    );
    if (!y) throw new NotFoundException('Kanal bulunamadı');
    const sonuc = await this.teslim.gonder(y.id);
    if (!sonuc) throw new ConflictException('Deneme mesajı başka bir işlem tarafından gönderiliyor.');
    return { ...sonuc, kanalAdi: k.ad };
  }

  async dogrula(ctx: TenantContext, id: string, geldi: boolean): Promise<BildirimKanali> {
    const k = await this.tekKanal(ctx, id);
    const scoped = this.kapsam(ctx, k.clientId);
    await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE bildirim_kanallari SET dogrulandi = CASE WHEN ${geldi}::boolean THEN now() ELSE NULL END, updated_at = now()
         WHERE id = ${id}::uuid`),
    );
    return this.tekKanal(ctx, id);
  }

  /** Son gönderimler (en çok 50; `toplam` kesmeden önceki sayı). */
  async gonderimler(ctx: TenantContext, clientId: string): Promise<BildirimGonderimleriYaniti> {
    const scoped = this.kapsam(ctx, clientId);
    return this.prisma.withTenant(scoped, async (tx) => {
      const [t] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM bildirim_gonderimleri WHERE client_id = ${clientId}::uuid`);
      const satirlar = await tx.$queryRaw<GonderimSatiri[]>(Prisma.sql`
        SELECT ${GONDERIM_KOLONLARI}, k.ad AS kanal_adi
          FROM bildirim_gonderimleri g
          LEFT JOIN bildirim_kanallari k ON k.id = g.kanal_id
         WHERE g.client_id = ${clientId}::uuid
         ORDER BY g.created_at DESC
         LIMIT 50`);
      return { gonderimler: satirlar.map(gonderimSatirindan), toplam: t?.n ?? 0 };
    });
  }
}
