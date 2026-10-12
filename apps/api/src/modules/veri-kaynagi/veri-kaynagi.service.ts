import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KAYNAK_TANIMI,
  KAYNAK_TURLERI,
  TAKIP_ACIGI,
  disKimlikDenetle,
  eksikKaynakIzni,
  kampanyaEsle,
  kaynakGunlukPencere,
  trafikKaynagi,
  type Ga4TrafikYaniti,
  type HesapSahibi,
  type KaynakBaglaIstegi,
  type KaynakDonemSorgusu,
  type KaynakDurumu,
  type KaynakSecenekleriYaniti,
  type KaynakTuru,
  type Platform,
  type TakipAcigiYaniti,
  type TenantContext,
  type VeriKaynagiOzeti,
  type VeriKaynaklariYaniti,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { baglantiSec, type SecilebilirBaglanti } from '../connections/baglanti-sec';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import { SyncQueueService } from '../../queue/sync-queue.service';
import type { TxLike } from '../sinyal/sinyal-hesap';
import { kaynakBugun } from './veri-kaynagi-is';
import { etkinGa4Kaynagi, platformKampanyalari, takipAcigiYaniti } from './takip-hesap';

const logger = new Logger('VeriKaynagiService');

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * LİSTE SEÇİMİ — `kimlik_enc` YOK. Şifreli mağaza kimliği hiçbir liste
 * sorgusunda seçilmiyor; yanıta sızmasının yolu belleğe hiç girmemesi
 * (CLAUDE.md "PRISMA include İLİŞKİNİN BÜTÜN KOLONLARINI ÇEKİYOR"). Ham SQL
 * kullanıldığı için sabit bir kolon listesi; `veri-kaynagi-kayit.spec.ts`
 * kaynakta `kimlik_enc`in yalnız migration ve yazma yolunda geçtiğini
 * kilitliyor.
 */
const KAYNAK_LISTE_SECIMI = Prisma.sql`
  v.id::text AS id, v.client_id::text AS client_id, v.org_id::text AS org_id, v.tur, v.dis_kimlik, v.ad,
  v.connection_id::text AS connection_id, v.kimlik_ipucu, v.saat_dilimi, v.para_birimi, v.durum, v.son_hata,
  v.yapi, v.yapi_zamani, v.son_basarili_cekim`;

interface KaynakSatiri {
  id: string;
  client_id: string;
  org_id: string;
  tur: KaynakTuru;
  dis_kimlik: string;
  ad: string;
  connection_id: string | null;
  kimlik_ipucu: string | null;
  saat_dilimi: string | null;
  para_birimi: string | null;
  durum: KaynakDurumu;
  son_hata: string | null;
  yapi: Record<string, unknown> | null;
  yapi_zamani: Date | string | null;
  son_basarili_cekim: Date | string | null;
}

interface GoogleBaglami {
  orgId: string;
  baglanti: SecilebilirBaglanti | null;
  kurulumMulkId: string | null;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

/**
 * ═══ VERİ KAYNAKLARI — PANEL UÇLARI (F1 GA4) ═══
 *
 * docs/veri-kaynagi/MIMARI.md § 3. Uçlar ve izinler `KAYNAK_UCLARI`
 * (controller). Platform çağrısı yapan uçlar (`secenekler`, `bagla`ın
 * doğrulaması) çağrıyı TRANSACTION DIŞINDA yapıyor (withTenant 5 sn).
 */
@Injectable()
export class VeriKaynagiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly queue: SyncQueueService,
    private readonly audit: AuditService,
  ) {}

  private erisim(ctx: TenantContext, clientId: string): void {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok.');
  }

  /**
   * HANGİ GOOGLE BAĞLANTISI — kurulum rehberinin kuralıyla AYNI
   * (`baglantiSec`, MIMARI Ç-3). Rehberin kurduğu mülk, başka bir kimlikle
   * okunmaya çalışılıp "erişim yok" demesin.
   */
  private async googleBaglami(t: TxLike, clientId: string): Promise<GoogleBaglami> {
    const [c] = await t.$queryRaw<Array<{ org_id: string; ajans: string | null }>>(Prisma.sql`
      SELECT org_id::text, app.ajans_org_id()::text AS ajans FROM clients WHERE id = ${clientId}::uuid`);
    if (!c) throw new ForbiddenException('Workspace bulunamadı.');
    const [hesap] = await t.$queryRaw<Array<{ connection_id: string }>>(Prisma.sql`
      SELECT connection_id::text FROM ad_accounts
       WHERE client_id = ${clientId}::uuid AND platform = 'google'::"Platform"
       ORDER BY name, id LIMIT 1`);
    const baglantilar = await t.$queryRaw<Array<{ id: string; client_id: string | null; org_id: string; granted_scopes: string[] }>>(Prisma.sql`
      SELECT id::text, client_id::text, org_id::text, granted_scopes
        FROM platform_connections
       WHERE revoked_at IS NULL AND status = 'active' AND platform = 'google'::"Platform"
         AND (client_id = ${clientId}::uuid OR client_id IS NULL)
       ORDER BY created_at`);
    const [k] = await t.$queryRaw<Array<{ hesap_sahibi: string | null; ga4_mulk_id: string | null }>>(Prisma.sql`
      SELECT hesap_sahibi, ga4_mulk_id FROM workspace_kurulum WHERE client_id = ${clientId}::uuid`);
    const baglanti = baglantiSec(
      {
        meta: null,
        google: hesap ? { connectionId: hesap.connection_id } : null,
        baglantilar: baglantilar.map((b) => ({ id: b.id, platform: 'google' as const, clientId: b.client_id, orgId: b.org_id, scopes: b.granted_scopes })),
        sahip: (k?.hesap_sahibi as HesapSahibi | null) ?? null,
        orgId: c.org_id,
        ajansOrgId: c.ajans,
      },
      'google',
    );
    return { orgId: c.org_id, baglanti, kurulumMulkId: k?.ga4_mulk_id ?? null };
  }

  private ozet(k: KaynakSatiri, g: GoogleBaglami | null): VeriKaynagiOzeti {
    const izinEksik = g?.baglanti && eksikKaynakIzni(k.tur, g.baglanti.scopes) ? g.baglanti.id : null;
    const etkinlikler = Array.isArray(k.yapi?.anahtarEtkinlikler) ? (k.yapi!.anahtarEtkinlikler as string[]) : null;
    return {
      id: k.id,
      clientId: k.client_id,
      tur: k.tur,
      disKimlik: k.dis_kimlik,
      ad: k.ad,
      durum: k.durum,
      sonHata: k.son_hata,
      sonBasariliCekim: iso(k.son_basarili_cekim),
      saatDilimi: k.saat_dilimi,
      paraBirimi: k.para_birimi,
      kimlikIpucu: k.kimlik_ipucu,
      kurulumUyusmazligi: k.tur === 'ga4' && g?.kurulumMulkId && g.kurulumMulkId !== k.dis_kimlik ? { kurulumMulkId: g.kurulumMulkId } : null,
      anahtarEtkinlikler: etkinlikler,
      izinBaglantiId: izinEksik,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Okuma
  // ───────────────────────────────────────────────────────────────────────

  async liste(ctx: TenantContext, clientId: string): Promise<VeriKaynaklariYaniti> {
    this.erisim(ctx, clientId);
    const { satirlar, g } = await this.prisma.withTenant(ctx, async (t) => {
      const g = await this.googleBaglami(t as unknown as TxLike, clientId);
      const satirlar = await t.$queryRaw<KaynakSatiri[]>(Prisma.sql`
        SELECT ${KAYNAK_LISTE_SECIMI} FROM veri_kaynaklari v
         WHERE v.client_id = ${clientId}::uuid AND v.durum <> 'kaldirildi'
         ORDER BY v.created_at`);
      return { satirlar, g };
    });
    const kaynaklar = satirlar.map((k) => this.ozet(k, g));
    const bagli = new Set(kaynaklar.map((k) => k.tur));
    const baglanabilir = KAYNAK_TURLERI.filter((t) => !bagli.has(t)).map((tur) => {
      const tanim = KAYNAK_TANIMI[tur];
      // YAPILMAMIŞ DALGA "Yakında" DEĞİL, NEDENİ YAZAR (MIMARI § 3.4).
      if (tanim.paket !== 'F1') {
        return { tur, engel: `${tanim.ad} bağlantısı sonraki aşamada açılacak; okuma kodu henüz yok.`, izinBaglantiId: null };
      }
      if (!g.baglanti) return { tur, engel: 'Google bağlantısı yok. Önce Google hesabını bağla.', izinBaglantiId: null };
      if (eksikKaynakIzni(tur, g.baglanti.scopes)) {
        return { tur, engel: 'Google bağlantısında Analytics okuma izni yok. İzin verildiğinde Google Ads bağlantısı kopmaz.', izinBaglantiId: g.baglanti.id };
      }
      return { tur, engel: null, izinBaglantiId: null };
    });
    return { kaynaklar, baglanabilir };
  }

  /** Seçilebilir GA4 mülkleri. Platforma gidiyor: transaction DIŞINDA. */
  async secenekler(ctx: TenantContext, clientId: string): Promise<KaynakSecenekleriYaniti> {
    this.erisim(ctx, clientId);
    const g = await this.prisma.withTenant(ctx, (t) => this.googleBaglami(t as unknown as TxLike, clientId));
    const token = await this.googleTokeni(g);
    let hesaplar: Awaited<ReturnType<Ga4Istemcisi['hesaplar']>>;
    try {
      hesaplar = await new Ga4Istemcisi(token).hesaplar();
    } catch (e) {
      throw this.platformHatasi(e, 'Analytics mülk listesi alınamadı');
    }
    const bagli = await this.bagliMulkler(g.orgId);
    return {
      tur: 'ga4',
      kurulumMulkId: g.kurulumMulkId,
      secenekler: hesaplar.flatMap((h) =>
        h.mulkler.map((m) => {
          const b = bagli.get(m.mulkId);
          return { disKimlik: m.mulkId, ad: m.ad, grup: h.ad, bagliWorkspace: b && b.clientId !== clientId ? b.ad : null };
        }),
      ),
    };
  }

  /**
   * Şirketteki bağlı mülkler ve workspace adları. ADMIN istemcisiyle ve
   * YALNIZ AYNI ŞİRKET: kullanıcı başka workspace'i göremese bile "bu mülk
   * X'e bağlı" cevabı verilebilmeli (MIMARI Ç-4); tekil indeks RLS'e tabi
   * değil, cevapsız bir 23505 "zaten var ama göremiyorum" bilmecesi olurdu.
   */
  private async bagliMulkler(orgId: string): Promise<Map<string, { clientId: string; ad: string; durum: string }>> {
    const r = await this.admin.$queryRaw<Array<{ dis_kimlik: string; client_id: string; ad: string; durum: string }>>(Prisma.sql`
      SELECT v.dis_kimlik, v.client_id::text AS client_id, c.name AS ad, v.durum
        FROM veri_kaynaklari v JOIN clients c ON c.id = v.client_id
       WHERE v.org_id = ${orgId}::uuid AND v.tur = 'ga4'`);
    return new Map(r.map((x) => [x.dis_kimlik, { clientId: x.client_id, ad: x.ad, durum: x.durum }]));
  }

  private async googleTokeni(g: GoogleBaglami): Promise<string> {
    if (!g.baglanti) throw new BadRequestException('Google bağlantısı yok. Önce Bağlantılar’dan Google hesabını bağla.');
    if (eksikKaynakIzni('ga4', g.baglanti.scopes)) {
      throw new BadRequestException('Google bağlantısında Analytics okuma izni yok. Önce "İzni ver".');
    }
    return this.kasa.getAccessToken(g.baglanti.id, this.saglayicilar.get('google'));
  }

  /** Platformun cümlesi AYNEN ekrana (CLAUDE.md "Beklenmeyen bir hata oluştu" dersi). */
  private platformHatasi(e: unknown, onEk: string): Error {
    if (e instanceof PlatformApiError) {
      if (e.kind === 'permission_denied') return new BadRequestException(`${onEk}: bu Google hesabının erişimi yok. Google’ın cevabı: ${e.message}`);
      return new BadRequestException(`${onEk}. Google’ın cevabı: ${e.message}`);
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Bağla / kaldır / yenile / duraklat
  // ───────────────────────────────────────────────────────────────────────

  async bagla(ctx: TenantContext, dto: KaynakBaglaIstegi, meta: Meta): Promise<VeriKaynagiOzeti> {
    this.erisim(ctx, dto.clientId);
    if (dto.tur !== 'ga4') throw new BadRequestException(`${KAYNAK_TANIMI[dto.tur].ad} bu aşamada bağlanamıyor (okuma kodu sonraki aşamada).`);
    // GİRİŞ ANINDA DENETİM: biçim yanlışsa platforma hiç gidilmez.
    const d = disKimlikDenetle(dto.tur, dto.disKimlik);
    if (!d.gecerli) throw new BadRequestException(d.neden);
    const g = await this.prisma.withTenant(ctx, (t) => this.googleBaglami(t as unknown as TxLike, dto.clientId));
    const token = await this.googleTokeni(g);
    // DOĞRULAMA BIRAKINCA: mülk bu Google kimliğiyle okunamıyorsa şimdi söyle,
    // gece işinde "erişim yok" diye değil.
    let ayar: Awaited<ReturnType<Ga4Istemcisi['mulkAyari']>>;
    try {
      ayar = await new Ga4Istemcisi(token).mulkAyari(d.deger);
    } catch (e) {
      throw this.platformHatasi(e, 'Analytics mülkü okunamadı');
    }
    const id = await this.kaydet(ctx, dto.clientId, g, { mulkId: d.deger, ad: ayar.ad, saatDilimi: ayar.saatDilimi, paraBirimi: ayar.paraBirimi }, ctx.userId, meta);
    return this.tekOzet(ctx, id);
  }

  /**
   * Kayıt + kuyruk. Aynı workspace'te kaldırılmış satır CANLANIR (ikinci
   * satır = çift sayım). Başka workspace'te ETKİN satır → 409 ve o
   * workspace'in adı. Başka workspace'te KALDIRILMIŞ satır buraya TAŞINIR
   * (aynı şirket içinde, verisiyle): mülk artık bu workspace'in sitesi.
   */
  private async kaydet(
    ctx: TenantContext,
    clientId: string,
    g: GoogleBaglami,
    m: { mulkId: string; ad: string; saatDilimi: string | null; paraBirimi: string | null },
    createdBy: string | null,
    meta: Meta,
  ): Promise<string> {
    const mevcut = (await this.bagliMulkler(g.orgId)).get(m.mulkId);
    if (mevcut && mevcut.clientId !== clientId && mevcut.durum !== 'kaldirildi') {
      throw new ConflictException(`Bu Analytics mülkü "${mevcut.ad}" workspace’ine bağlı. Bir mülk yalnız bir workspace’te okunur (ajans toplamında iki kez sayılmasın).`);
    }
    const id = await this.prisma.withTenant(ctx, async (t) => {
      const [baska] = await t.$queryRaw<Array<{ dis_kimlik: string }>>(Prisma.sql`
        SELECT dis_kimlik FROM veri_kaynaklari
         WHERE client_id = ${clientId}::uuid AND tur = 'ga4' AND durum <> 'kaldirildi' AND dis_kimlik <> ${m.mulkId}`);
      if (baska) {
        throw new ConflictException(`Bu workspace’e zaten ${baska.dis_kimlik} numaralı Analytics mülkü bağlı. Önce onu kaldır.`);
      }
      if (mevcut && mevcut.clientId !== clientId) {
        // Taşıma admin istemcisiyle aşağıda; burada yalnız erişim denetimi yapıldı.
        return null;
      }
      const [r] = await t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO veri_kaynaklari (org_id, client_id, tur, dis_kimlik, ad, connection_id, saat_dilimi, para_birimi, durum, created_by)
        SELECT c.org_id, c.id, 'ga4', ${m.mulkId}, ${m.ad.slice(0, 200)}, ${g.baglanti!.id}::uuid, ${m.saatDilimi}, ${m.paraBirimi}, 'etkin', ${createdBy}::uuid
          FROM clients c WHERE c.id = ${clientId}::uuid
        ON CONFLICT (org_id, tur, dis_kimlik) DO UPDATE SET
          durum = 'etkin', son_hata = NULL, ad = EXCLUDED.ad, connection_id = EXCLUDED.connection_id,
          saat_dilimi = coalesce(EXCLUDED.saat_dilimi, veri_kaynaklari.saat_dilimi),
          para_birimi = coalesce(EXCLUDED.para_birimi, veri_kaynaklari.para_birimi), updated_at = now()
        WHERE veri_kaynaklari.client_id = EXCLUDED.client_id
        RETURNING id::text`);
      if (!r) throw new ForbiddenException('Veri kaynağı kaydedilemedi: bu workspace’i değiştirme yetkin yok.');
      await this.audit.record(t as never, ctx, {
        action: 'veri_kaynagi.bagla',
        targetType: 'veri_kaynagi',
        targetId: r.id,
        clientId,
        after: { tur: 'ga4', disKimlik: m.mulkId, otomatik: createdBy === null },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
      return r.id;
    });
    const kaynakId = id ?? (await this.tasi(ctx, clientId, g, m, meta));
    await this.queue.enqueue({ clientId, platform: 'google', jobType: 'kaynak_yapi', veriKaynagiId: kaynakId, interactive: true });
    return kaynakId;
  }

  /**
   * Başka workspace'te KALDIRILMIŞ mülkü buraya taşı. ADMIN: eski
   * workspace'i bu kullanıcı göremeyebilir ve politikadan geçmeyen UPDATE
   * SIFIR satır etkiler (CLAUDE.md "POLİTİKASI OLMAYAN UPDATE"). Yetki
   * yukarıda (hedef workspace erişimi + `connection.manage`) ve kapsam aynı
   * şirket; denormalize `client_id` veri satırlarında da güncelleniyor
   * (CLAUDE.md "DENORMALİZE SAHİPLİK KOLONU").
   */
  private async tasi(ctx: TenantContext, clientId: string, g: GoogleBaglami, m: { mulkId: string; ad: string; saatDilimi: string | null; paraBirimi: string | null }, meta: Meta): Promise<string> {
    return this.admin.$transaction(async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ id: string; eski: string }>>(Prisma.sql`
        UPDATE veri_kaynaklari v SET client_id = ${clientId}::uuid, durum = 'etkin', son_hata = NULL,
               connection_id = ${g.baglanti!.id}::uuid, ad = ${m.ad.slice(0, 200)}, updated_at = now()
          FROM (SELECT id, client_id AS eski FROM veri_kaynaklari WHERE org_id = ${g.orgId}::uuid AND tur = 'ga4' AND dis_kimlik = ${m.mulkId} AND durum = 'kaldirildi') o
         WHERE v.id = o.id
        RETURNING v.id::text AS id, o.eski::text AS eski`);
      if (!r) throw new ConflictException('Mülk taşınamadı: durumu değişmiş, sayfayı yenile.');
      await tx.$executeRaw(Prisma.sql`UPDATE ga4_gunluk SET client_id = ${clientId}::uuid WHERE veri_kaynagi_id = ${r.id}::uuid`);
      await tx.$executeRaw(Prisma.sql`UPDATE ga4_anahtar_etkinlik_gunluk SET client_id = ${clientId}::uuid WHERE veri_kaynagi_id = ${r.id}::uuid`);
      await tx.auditLog.create({
        data: {
          // HEDEF workspace'in şirketi, `ctx`ten değil ("tüm şirketler" modunda
          // ctx.orgId ev şirketi kalıyor, CLAUDE.md).
          orgId: g.orgId,
          actorId: ctx.userId,
          actorType: 'user',
          action: 'veri_kaynagi.tasi',
          targetType: 'veri_kaynagi',
          targetId: r.id,
          clientId,
          before: { clientId: r.eski },
          after: { clientId, disKimlik: m.mulkId },
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
      return r.id;
    });
  }

  private async tekOzet(ctx: TenantContext, id: string): Promise<VeriKaynagiOzeti> {
    return this.prisma.withTenant(ctx, async (t) => {
      const [k] = await t.$queryRaw<KaynakSatiri[]>(Prisma.sql`SELECT ${KAYNAK_LISTE_SECIMI} FROM veri_kaynaklari v WHERE v.id = ${id}::uuid`);
      if (!k) throw new NotFoundException('Veri kaynağı bulunamadı.');
      const g = await this.googleBaglami(t as unknown as TxLike, k.client_id);
      return this.ozet(k, g);
    });
  }

  private async satir(ctx: TenantContext, id: string): Promise<KaynakSatiri> {
    const [k] = await this.prisma.withTenant(ctx, (t) =>
      t.$queryRaw<KaynakSatiri[]>(Prisma.sql`SELECT ${KAYNAK_LISTE_SECIMI} FROM veri_kaynaklari v WHERE v.id = ${id}::uuid`),
    );
    if (!k) throw new NotFoundException('Veri kaynağı bulunamadı.');
    this.erisim(ctx, k.client_id);
    return k;
  }

  /** Kaldır: satır SİLİNMEZ (geçmiş veri raporda kalır). Politikası geçmeyen UPDATE sıfır satır → 404. */
  async kaldir(ctx: TenantContext, id: string, meta: Meta): Promise<{ id: string; durum: KaynakDurumu }> {
    const k = await this.satir(ctx, id);
    await this.prisma.withTenant(ctx, async (t) => {
      const r = await t.$queryRaw<unknown[]>(Prisma.sql`
        UPDATE veri_kaynaklari SET durum = 'kaldirildi', updated_at = now() WHERE id = ${id}::uuid RETURNING id`);
      if (r.length !== 1) throw new ForbiddenException('Veri kaynağı kaldırılamadı: bu workspace’i değiştirme yetkin yok.');
      await this.audit.record(t as never, ctx, {
        action: 'veri_kaynagi.kaldir',
        targetType: 'veri_kaynagi',
        targetId: id,
        clientId: k.client_id,
        before: { durum: k.durum },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    });
    return { id, durum: 'kaldirildi' };
  }

  /**
   * ŞİMDİ YENİLE: yapı ve günlük pencere birlikte kuyruğa. Günlük iş yapıdan
   * önce koşarsa ön koşul yüzünden çağrısız biter ve yapı bitince zincirle
   * yeniden girer (öncelik bariyer değil). İzin/erişim sorunu olan kaynak
   * da buradan kurtuluyor: yapı başarılı olursa durum `etkin`e döner.
   */
  async yenile(ctx: TenantContext, id: string): Promise<{ syncJobIds: string[] }> {
    const k = await this.satir(ctx, id);
    if (k.durum === 'kaldirildi') throw new ConflictException('Kaldırılmış kaynak yenilenemez; yeniden bağla.');
    if (k.durum === 'duraklatildi') throw new ConflictException('Kaynak duraklatılmış; önce sürdür.');
    const ids: string[] = [];
    const y = await this.queue.enqueue({ clientId: k.client_id, platform: 'google', jobType: 'kaynak_yapi', veriKaynagiId: id, interactive: true });
    if (y.syncJobId) ids.push(y.syncJobId);
    const p = kaynakGunlukPencere(k.tur, kaynakBugun(k.saat_dilimi, new Date()));
    if (p) {
      const r = await this.queue.enqueue({
        clientId: k.client_id,
        platform: 'google',
        jobType: 'kaynak_gunluk',
        veriKaynagiId: id,
        dateFrom: p.from,
        dateTo: p.to,
        interactive: true,
      });
      if (r.syncJobId) ids.push(r.syncJobId);
    }
    return { syncJobIds: ids };
  }

  /** Duraklat / sürdür. Duraklatılmış kaynak süpürmeye girmez, veri kalır. */
  async duraklat(ctx: TenantContext, id: string, meta: Meta): Promise<VeriKaynagiOzeti> {
    const k = await this.satir(ctx, id);
    if (k.durum === 'kaldirildi') throw new ConflictException('Kaldırılmış kaynak duraklatılamaz.');
    const yeni: KaynakDurumu = k.durum === 'duraklatildi' ? 'etkin' : 'duraklatildi';
    await this.prisma.withTenant(ctx, async (t) => {
      const r = await t.$queryRaw<unknown[]>(Prisma.sql`
        UPDATE veri_kaynaklari SET durum = ${yeni}, updated_at = now() WHERE id = ${id}::uuid AND durum = ${k.durum} RETURNING id`);
      if (r.length !== 1) throw new ConflictException('Kaynağın durumu değişmiş; sayfayı yenile.');
      await this.audit.record(t as never, ctx, {
        action: yeni === 'duraklatildi' ? 'veri_kaynagi.duraklat' : 'veri_kaynagi.surdur',
        targetType: 'veri_kaynagi',
        targetId: id,
        clientId: k.client_id,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      });
    });
    return this.tekOzet(ctx, id);
  }

  /**
   * KURULUM REHBERİ MÜLKÜ KURUNCA OTOMATİK BAĞLAMA (MIMARI Ç-5). Salt okuma
   * ve geri alınabilir (kartta "Kaldır"). Workspace'te zaten bir GA4 kaynağı
   * varsa DOKUNULMAZ: farklıysa kartta `kurulumUyusmazligi` yazar, sessizce
   * biri seçilmez. Hata rehber adımını DÜŞÜRMEZ: kurulum başarılı, yalnız
   * okuma bağlanamadı ve sebebi döndürülüyor.
   */
  async kurulumdanBagla(ctx: TenantContext, clientId: string, mulkId: string): Promise<string | null> {
    try {
      const g = await this.prisma.withTenant(ctx, (t) => this.googleBaglami(t as unknown as TxLike, clientId));
      const [var_] = await this.prisma.withTenant(ctx, (t) =>
        t.$queryRaw<Array<{ dis_kimlik: string }>>(Prisma.sql`
          SELECT dis_kimlik FROM veri_kaynaklari WHERE client_id = ${clientId}::uuid AND tur = 'ga4' AND durum <> 'kaldirildi'`),
      );
      if (var_) return var_.dis_kimlik === mulkId ? null : `Okunan Analytics mülkü (${var_.dis_kimlik}) kurulumdakinden farklı; Bağlantılar’da seç.`;
      if (!g.baglanti || eksikKaynakIzni('ga4', g.baglanti.scopes)) return 'Analytics okuması bağlanmadı: Google bağlantısında okuma izni yok.';
      await this.kaydet(ctx, clientId, g, { mulkId, ad: mulkId, saatDilimi: null, paraBirimi: null }, null, {});
      return 'Analytics okuması bağlandı.';
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      logger.warn(`Kurulum mülkü veri kaynağına bağlanamadı (${clientId}): ${m}`);
      return `Analytics okuması bağlanamadı: ${m}`;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Rapor okuma
  // ───────────────────────────────────────────────────────────────────────

  private async ga4Kaynagi(t: TxLike, clientId: string): Promise<KaynakSatiri | null> {
    // TEK SÜZGEÇ (Ö-1): takip açığı, rapor ve sinyaller aynı fonksiyonla buluyor.
    return etkinGa4Kaynagi<KaynakSatiri>(t, clientId, KAYNAK_LISTE_SECIMI);
  }

  /** Boş listenin NEDENİ (emptyReason deseni): dördü farklı iş. */
  private bosNedeni(k: KaynakSatiri | null): Ga4TrafikYaniti['emptyReason'] {
    if (!k) return 'kaynak_yok';
    if (k.son_basarili_cekim === null) return k.durum === 'izin_eksik' || k.durum === 'erisim_yok' ? 'izin_eksik' : 'cekim_kosmadi';
    return null;
  }

  async trafik(ctx: TenantContext, q: KaynakDonemSorgusu): Promise<Ga4TrafikYaniti> {
    this.erisim(ctx, q.clientId);
    const SINIR = 500;
    return this.prisma.withTenant(ctx, async (tx) => {
      const t = tx as unknown as TxLike;
      const k = await this.ga4Kaynagi(t, q.clientId);
      const bos: Ga4TrafikYaniti = {
        donem: { from: q.from, to: q.to },
        emptyReason: this.bosNedeni(k),
        paraBirimi: k?.para_birimi ?? null,
        satirlar: [],
        gosterilen: 0,
        toplamSatir: 0,
        toplam: { oturum: 0, ucretliOturum: 0, anahtarEtkinlik: 0 },
      };
      if (!k || bos.emptyReason) return bos;
      const satirlar = await t.$queryRaw<
        Array<{ ko: string; ad: string | null; kim: string | null; ads: string | null; o: number; eo: number; ae: number; gelir: string }>
      >(Prisma.sql`
        SELECT kaynak_ortam AS ko, kampanya_adi AS ad, kampanya_kimligi AS kim, ads_kampanya_kimligi AS ads,
               sum(oturum)::float8 AS o, sum(etkilesimli_oturum)::float8 AS eo, sum(anahtar_etkinlik)::float8 AS ae,
               sum(gelir_mikro)::text AS gelir
          FROM ga4_gunluk
         WHERE client_id = ${q.clientId}::uuid AND veri_kaynagi_id = ${k.id}::uuid
           AND gun BETWEEN ${q.from}::date AND ${q.to}::date
         GROUP BY 1, 2, 3, 4
         ORDER BY o DESC, ko`);
      if (satirlar.length === 0) return { ...bos, emptyReason: 'veri_yok' };
      const kampanyalar = await platformKampanyalari(t, q.clientId, q.from, q.to);
      const adlar = new Map(kampanyalar.map((c) => [c.id, c.ad]));
      let oturum = 0;
      let ucretliOturum = 0;
      let anahtarEtkinlik = 0;
      const hepsi = satirlar.map((r) => {
        const tk = trafikKaynagi(r.ko);
        oturum += Number(r.o);
        anahtarEtkinlik += Number(r.ae);
        if (tk !== 'diger') ucretliOturum += Number(r.o);
        const e = kampanyaEsle({ sourceMedium: r.ko, kampanyaAdi: r.ad, kampanyaKimligi: r.kim, googleAdsKampanyaKimligi: r.ads }, kampanyalar);
        return {
          kaynakOrtam: r.ko,
          trafikKaynagi: tk,
          kampanyaAdi: r.ad,
          oturum: Number(r.o),
          etkilesimliOturum: Number(r.eo),
          anahtarEtkinlik: Number(r.ae),
          gelirMikro: r.gelir,
          esleme:
            e.sonuc === 'eslenemedi'
              ? { sonuc: 'eslenemedi' as const, neden: e.neden }
              : { sonuc: e.sonuc, kampanyaId: e.kampanyaId, kampanyaAdi: adlar.get(e.kampanyaId) ?? '', platform: e.platform as Platform },
        };
      });
      return {
        ...bos,
        satirlar: hepsi.slice(0, SINIR),
        gosterilen: Math.min(SINIR, hepsi.length),
        toplamSatir: hepsi.length,
        toplam: { oturum, ucretliOturum, anahtarEtkinlik },
      };
    });
  }

  async takipAcigi(ctx: TenantContext, q: KaynakDonemSorgusu): Promise<TakipAcigiYaniti> {
    this.erisim(ctx, q.clientId);
    // Hesap TEK yerde (takip-hesap.ts#takipAcigiYaniti): rapor belgesi de aynı fonksiyonu çağırıyor.
    return this.prisma.withTenant(ctx, (tx) => takipAcigiYaniti(tx as unknown as TxLike, q, new Date()));
  }
}
