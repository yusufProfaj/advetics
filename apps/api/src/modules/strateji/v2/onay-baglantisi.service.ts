import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BAGLANTI_HALI_METNI,
  ONAY_BAGLANTISI_DENEME_SINIRI,
  ONAY_BAGLANTISI_EN_UZUN_GUN,
  ONAY_TOKEN_BAYT,
  baglantiHali,
  baglantiKarariSchema,
  onayBaglantisiYolu,
  onayTokenBicimiGecerli,
  type BaglantiBelgesi,
  type BaglantiListesi,
  type OnayBaglantisiOlusturGirdisi,
  type OnayBaglantisiOlusturuldu,
  type OnayBaglantisiOzeti,
  type StratejiDurumu,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaAdminService } from '../../../prisma/prisma-admin.service';
import { AuditService } from '../../audit/audit.service';
import { belgeVerisiKur } from './belge-verisi';
import { yorumlariOku } from './yorumlar';
import { planSecimi, type PlanSatiri, type Sorgucu } from './satirlar';

/**
 * ═══ GİRİŞSİZ ONAY BAĞLANTISI (kullanıcı kararı K-2; YENIDEN-TASARIM.md § 9.3) ═══
 *
 * Kurallar sözleşmede (`paylasim.ts`); burada uygulanışı:
 *
 * - Ham token YALNIZ oluşturma yanıtında. Veritabanında SHA-256; log ve
 *   denetim kaydında YOK.
 * - Biçimsiz token veritabanına SORULMADAN reddedilir.
 * - Bulunamadı / iptal / süresi doldu → AYNI 404 ("Bağlantı geçersiz.").
 * - Karar TEK KULLANIMLIK: koşullu UPDATE (`kullanildi_at IS NULL AND
 *   iptal_at IS NULL AND son_gecerlilik > now() AND surum = planın sürümü`)
 *   + plan UPDATE (`durum = 'onayda' AND surum = $s`) AYNI transaction'da;
 *   ikisinden biri SIFIR satır dönerse transaction geri alınır ve 409.
 *   İki sekmeden aynı anda gelen iki karardan yalnız biri satır döndürür.
 * - IP başına deneme sınırı. BELLEKTE: API pm2'de tek süreç (`ecosystem
 *   .config`: instances 1, fork); süreç yeniden başlarsa sayaç sıfırlanır —
 *   kabul edilen kalıntı (Redis'e taşımak bağımlılık ekler, token 256 bit).
 * - Anonim yol YÖNETİM bağlantısıyla (RLS bağlamı yok; erişim kararı token);
 *   her sorgu plan kimliği VE client_id ile süzülüyor. Panel yönetimi RLS'li.
 */
@Injectable()
export class OnayBaglantisiService {
  private readonly denemeler = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  /** Testin saatini sabitleyebilmesi için. */
  simdi: () => Date = () => new Date();

  // ── Panel (RLS'li) ───────────────────────────────────────────────────

  /**
   * Yeni bağlantı: plan `onayda` ve ekranın sürümü güncel olmalı. Planın açık
   * bağlantıları AYNI transaction'da iptal edilir (iletilmiş eski bir maildeki
   * bağlantı ikinci bir karar yazamasın); kısmi tekil indeks yarışta ikinciyi
   * reddeder.
   */
  async olustur(ctx: TenantContext, planId: string, girdi: OnayBaglantisiOlusturGirdisi): Promise<OnayBaglantisiOlusturuldu> {
    const sureGun = Math.min(ONAY_BAGLANTISI_EN_UZUN_GUN, Math.max(1, girdi.sureGun ?? 14));
    const token = randomBytes(ONAY_TOKEN_BAYT).toString('base64url');
    const hash = tokenOzeti(token);
    const simdi = this.simdi();
    const son = new Date(simdi.getTime() + sureGun * 86_400_000);
    const baglanti = await this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, planId);
      if (p.durum !== 'onayda') throw new ConflictException('Onay bağlantısı yalnız onay bekleyen stratejiye oluşturulur.');
      if (p.surum !== girdi.surum) throw new ConflictException('Strateji siz bakarken değişti. Sayfayı yenileyip yeniden deneyin.');
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_onay_baglantilari SET iptal_at = now()
         WHERE plan_id = ${p.id}::uuid AND iptal_at IS NULL AND kullanildi_at IS NULL RETURNING id`);
      const [b] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO strateji_onay_baglantilari (plan_id, org_id, client_id, surum, token_hash, olusturan_id, created_at, son_gecerlilik)
        VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${p.surum}::int, ${hash}, ${ctx.userId}::uuid,
                ${simdi.toISOString()}::timestamptz, ${son.toISOString()}::timestamptz)
        RETURNING id::text`);
      // Denetim kaydında token YOK; yalnız bağlantı kimliği ve sürüm.
      await this.audit.record(tx as never, ctx, { action: 'strateji.onay_baglantisi', targetType: 'strateji_plani', targetId: p.id, clientId: p.client_id, after: { baglantiId: b!.id, surum: p.surum, sureGun } });
      return (await ozetler(tx, p.id, p.client_id)).find((x) => x.id === b!.id)!;
    });
    return { baglanti, yol: onayBaglantisiYolu(token) };
  }

  async listele(ctx: TenantContext, planId: string): Promise<BaglantiListesi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, planId);
      return { baglantilar: await ozetler(tx, p.id, p.client_id) };
    });
  }

  async iptal(ctx: TenantContext, baglantiId: string): Promise<OnayBaglantisiOzeti> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [o] = await tx.$queryRaw<Array<{ plan_id: string; client_id: string }>>(Prisma.sql`
        SELECT plan_id::text, client_id::text FROM strateji_onay_baglantilari WHERE id = ${baglantiId}::uuid`);
      if (!o || !ctx.clientIds.includes(o.client_id)) throw new NotFoundException('Bağlantı bulunamadı');
      // RLS'li UPDATE hata vermeden SIFIR satır etkileyebilir: say.
      const r = await tx.$queryRaw<unknown[]>(Prisma.sql`
        UPDATE strateji_onay_baglantilari SET iptal_at = now()
         WHERE id = ${baglantiId}::uuid AND iptal_at IS NULL AND kullanildi_at IS NULL RETURNING id`);
      if (r.length !== 1) throw new ConflictException('Bağlantı zaten kullanılmış ya da iptal edilmiş.');
      await this.audit.record(tx as never, ctx, { action: 'strateji.onay_baglantisi_iptal', targetType: 'strateji_plani', targetId: o.plan_id, clientId: o.client_id, after: { baglantiId } });
      return (await ozetler(tx, o.plan_id, o.client_id)).find((x) => x.id === baglantiId)!;
    });
  }

  // ── Oturumsuz ────────────────────────────────────────────────────────

  /** IP başına pencere; aşılırsa 429. Okuma ve karar AYNI sayaçta. */
  denemeSay(ip: string | null): void {
    const anahtar = ip ?? 'bilinmiyor';
    const simdi = this.simdi().getTime();
    const pencere = ONAY_BAGLANTISI_DENEME_SINIRI.pencereDk * 60_000;
    const liste = (this.denemeler.get(anahtar) ?? []).filter((t) => simdi - t < pencere);
    if (liste.length >= ONAY_BAGLANTISI_DENEME_SINIRI.istek) {
      this.denemeler.set(anahtar, liste);
      throw new HttpException('Çok fazla deneme. Biraz sonra yeniden deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }
    liste.push(simdi);
    this.denemeler.set(anahtar, liste);
    // Bellek sınırsız büyümesin: eski IP'ler ara ara temizlenir.
    if (this.denemeler.size > 10_000) {
      for (const [k, v] of this.denemeler) if (v.every((t) => simdi - t >= pencere)) this.denemeler.delete(k);
    }
  }

  async belge(token: string, ip: string | null): Promise<BaglantiBelgesi> {
    this.denemeSay(ip);
    if (!onayTokenBicimiGecerli(token)) throw gecersiz();
    const simdi = this.simdi();
    const s = await baglantiOku(this.admin, tokenOzeti(token));
    if (!s) throw gecersiz();
    const h = baglantiHali(halGirdisi(s), { durum: s.plan_durum as StratejiDurumu, surum: s.plan_surum }, simdi);
    // Geçersiz / iptal / süresi dolmuş AYIRT EDİLMEZ (var olanı tahmin ettirmez).
    if (h.hal === 'iptal' || h.hal === 'suresi_doldu') throw gecersiz();
    if (!h.okunabilir) return { hal: h.hal, okunabilir: false, karar: false, belge: null, yorumlar: [] };
    const [p] = await this.admin.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${s.plan_id}::uuid AND p.client_id = ${s.client_id}::uuid`, false));
    if (!p) throw gecersiz();
    const belge = await belgeVerisiKur(this.admin as unknown as Sorgucu, p, simdi);
    const yorumlar = (await yorumlariOku(this.admin as unknown as Sorgucu, p)).yorumlar;
    return { hal: h.hal, okunabilir: true, karar: h.karar, belge, yorumlar };
  }

  /**
   * KARAR — tek kullanımlık. Sıra: deneme sınırı → biçim → gövde → hâl
   * (iptal/süre/sürüm) → koşullu tüketim → koşullu plan yazımı → yorum.
   * Tüketim ya da plan yazımı sıfır satır dönerse transaction geri alınır.
   */
  async karar(token: string, govde: unknown, meta: { ip: string | null; userAgent: string | null }): Promise<BaglantiBelgesi> {
    this.denemeSay(meta.ip);
    if (!onayTokenBicimiGecerli(token)) throw gecersiz();
    const parsed = baglantiKarariSchema.safeParse(govde);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' '));
    const k = parsed.data;
    const hash = tokenOzeti(token);
    const simdi = this.simdi();
    const kayit = await this.admin.$transaction(async (t) => {
      const tx = t as unknown as Sorgucu;
      const s = await baglantiOku(tx, hash, true);
      if (!s) throw gecersiz();
      const h = baglantiHali(halGirdisi(s), { durum: s.plan_durum as StratejiDurumu, surum: s.plan_surum }, simdi);
      if (h.hal === 'iptal' || h.hal === 'suresi_doldu') throw gecersiz();
      if (!h.karar) throw new ConflictException(BAGLANTI_HALI_METNI[h.hal]);
      // Ekranın gördüğü sürüm bağlantınınkiyle aynı olmalı (eski sekme).
      if (k.surum !== s.surum) throw new ConflictException(BAGLANTI_HALI_METNI.surum_degisti);
      const tuketilen = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE strateji_onay_baglantilari b
           SET kullanildi_at = now(), karar = ${k.karar}, karar_ad = ${k.ad}, karar_eposta = ${k.eposta}
         WHERE b.token_hash = ${hash} AND b.kullanildi_at IS NULL AND b.iptal_at IS NULL
           AND b.son_gecerlilik > ${simdi.toISOString()}::timestamptz
           AND b.surum = (SELECT p.surum FROM strateji_planlari p WHERE p.id = b.plan_id)
        RETURNING b.id::text`);
      if (tuketilen.length !== 1) throw new ConflictException(BAGLANTI_HALI_METNI.kullanildi);
      const plan = k.karar === 'onayla'
        ? await tx.$queryRaw<unknown[]>(Prisma.sql`
            UPDATE strateji_planlari
               SET durum = 'onaylandi', onay_rolu = 'baglanti', onaylayan_user_id = NULL, onaylayan_ad = ${k.ad},
                   onaylayan_eposta = ${k.eposta}, onay_zamani = now(), onaylanan_surum = surum, updated_at = now()
             WHERE id = ${s.plan_id}::uuid AND client_id = ${s.client_id}::uuid AND durum = 'onayda' AND surum = ${s.surum}::int
            RETURNING id`)
        : await tx.$queryRaw<unknown[]>(Prisma.sql`
            UPDATE strateji_planlari SET durum = 'revizyon', revizyon_notu = ${k.yorum ?? ''}, updated_at = now()
             WHERE id = ${s.plan_id}::uuid AND client_id = ${s.client_id}::uuid AND durum = 'onayda' AND surum = ${s.surum}::int
            RETURNING id`);
      if (plan.length !== 1) throw new ConflictException(BAGLANTI_HALI_METNI.karar_beklemiyor);
      const metin = k.karar === 'onayla' ? (k.yorum?.trim() ? `Onaylandı. ${k.yorum.trim()}` : 'Onaylandı.') : k.yorum!;
      await tx.$queryRaw(Prisma.sql`
        INSERT INTO strateji_yorumlari (plan_id, org_id, client_id, surum, user_id, rol, tur, metin, yazan_ad)
        VALUES (${s.plan_id}::uuid, ${s.org_id}::uuid, ${s.client_id}::uuid, ${s.surum}::int, NULL, 'baglanti',
                ${k.karar === 'onayla' ? 'onay' : 'revizyon'}, ${metin}, ${k.ad})
        RETURNING id`);
      return s;
    });
    // IP ve tarayıcı YALNIZ denetim kaydına (belgeye değil). Token yok.
    await this.audit.recordUnauthenticated(kayit.org_id, {
      action: k.karar === 'onayla' ? 'strateji.baglanti_onay' : 'strateji.baglanti_revizyon',
      targetType: 'strateji_plani',
      targetId: kayit.plan_id,
      clientId: kayit.client_id,
      actorLabel: `onay bağlantısı: ${k.ad} <${k.eposta}>`,
      after: { karar: k.karar, ad: k.ad, eposta: k.eposta, surum: kayit.surum, baglantiId: kayit.id },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.belgeAlt(kayit);
  }

  /** Karardan sonraki görünüm (deneme sayılmaz: aynı istek). */
  private async belgeAlt(s: BaglantiSatiri): Promise<BaglantiBelgesi> {
    const yeni = await baglantiOku(this.admin, s.token_hash);
    const h = baglantiHali(halGirdisi(yeni!), { durum: yeni!.plan_durum as StratejiDurumu, surum: yeni!.plan_surum }, this.simdi());
    const [p] = await this.admin.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${s.plan_id}::uuid AND p.client_id = ${s.client_id}::uuid`, false));
    const belge = p ? await belgeVerisiKur(this.admin as unknown as Sorgucu, p, this.simdi()) : null;
    return { hal: h.hal, okunabilir: h.okunabilir, karar: h.karar, belge, yorumlar: [] };
  }
}

// ── Yardımcılar ───────────────────────────────────────────────────────

export function tokenOzeti(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function gecersiz(): NotFoundException {
  return new NotFoundException(BAGLANTI_HALI_METNI.iptal);
}

interface BaglantiSatiri {
  id: string;
  plan_id: string;
  org_id: string;
  client_id: string;
  surum: number;
  token_hash: string;
  son_gecerlilik: Date;
  iptal_at: Date | null;
  kullanildi_at: Date | null;
  plan_durum: string;
  plan_surum: number;
}

async function baglantiOku(t: Sorgucu, hash: string, kilit = false): Promise<BaglantiSatiri | null> {
  const [s] = await t.$queryRaw<BaglantiSatiri[]>(Prisma.sql`
    SELECT b.id::text, b.plan_id::text, b.org_id::text, b.client_id::text, b.surum, b.token_hash, b.son_gecerlilik,
           b.iptal_at, b.kullanildi_at, p.durum AS plan_durum, p.surum AS plan_surum
      FROM strateji_onay_baglantilari b
      JOIN strateji_planlari p ON p.id = b.plan_id AND p.client_id = b.client_id
     WHERE b.token_hash = ${hash} AND p.bicim = 2
     ${kilit ? Prisma.sql`FOR UPDATE OF b, p` : Prisma.empty}`);
  return s ?? null;
}

function halGirdisi(s: BaglantiSatiri) {
  return {
    surum: s.surum,
    sonGecerlilik: new Date(s.son_gecerlilik).toISOString(),
    iptalZamani: s.iptal_at ? new Date(s.iptal_at).toISOString() : null,
    kullanildiZamani: s.kullanildi_at ? new Date(s.kullanildi_at).toISOString() : null,
  };
}

async function planOku(tx: Sorgucu, ctx: TenantContext, planId: string): Promise<PlanSatiri> {
  const [p] = await tx.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${planId}::uuid`, true));
  if (!p || !ctx.clientIds.includes(p.client_id) || p.bicim !== 2) throw new NotFoundException('Strateji bulunamadı');
  return p;
}

async function ozetler(tx: Sorgucu, planId: string, clientId: string): Promise<OnayBaglantisiOzeti[]> {
  const r = await tx.$queryRaw<Array<{ id: string; plan_id: string; surum: number; olusturan_id: string | null; olusturan_ad: string | null; created_at: Date; son_gecerlilik: Date; iptal_at: Date | null; kullanildi_at: Date | null; karar: 'onayla' | 'revizyon_iste' | null; karar_ad: string | null; karar_eposta: string | null }>>(Prisma.sql`
    SELECT b.id::text, b.plan_id::text, b.surum, b.olusturan_id::text, u.full_name AS olusturan_ad, b.created_at, b.son_gecerlilik,
           b.iptal_at, b.kullanildi_at, b.karar, b.karar_ad, b.karar_eposta
      FROM strateji_onay_baglantilari b LEFT JOIN users u ON u.id = b.olusturan_id
     WHERE b.plan_id = ${planId}::uuid AND b.client_id = ${clientId}::uuid
     ORDER BY b.created_at DESC`);
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return r.map((b) => ({
    id: b.id,
    planId: b.plan_id,
    surum: b.surum,
    olusturan: { id: b.olusturan_id ?? '', ad: b.olusturan_ad },
    olusturuldu: new Date(b.created_at).toISOString(),
    sonGecerlilik: new Date(b.son_gecerlilik).toISOString(),
    iptalZamani: iso(b.iptal_at),
    kullanildiZamani: iso(b.kullanildi_at),
    karar: b.karar && b.karar_ad && b.karar_eposta ? { tur: b.karar, ad: b.karar_ad, eposta: b.karar_eposta } : null,
  }));
}
