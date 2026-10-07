import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  degisiklikCumleyleUyumluMu,
  degisiklikUygula,
  KATALOG_SURUMU,
  kurulumOzeti,
  musteriOzeti,
  onayKapisi,
  pilotGecisMumkunMu,
  PILOT_PLAN_GECISLERI,
  planKanonikIcerik,
  planOnerisiSchema,
  planUret,
  planUyumGirdisi,
  uyumDenetle,
  uyumDurumu,
  yayinKipi,
  type DegisiklikIsteGirdisi,
  type KurulumSatiri,
  type KurulumSatirDurumu,
  type OnayKapisiSonucu,
  type OnayRetKodu,
  type Permission,
  type PilotEkranEylemi,
  type PilotHazirlaYaniti,
  type PilotKurulumYaniti,
  type PilotPlanDetayi,
  type PilotPlanDurumu,
  type PilotPlanListesi,
  type PlanDegisikligi,
  type PlanDegistirGirdisi,
  type PlanEylemiGirdisi,
  type PlanHazirlaGirdisi,
  type PlanOnaylaGirdisi,
  type PlanOnerisi,
  type PlanYenidenHazirlaGirdisi,
  type TenantContext,
  type UyumDenetimi,
  type UyumIsaretGirdisi,
  type UyumIsareti,
  type UyumKitleBilgisi,
  type UyumProfili,
  type YayinKipi,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { YAPAY_ZEKA } from '../../yapay-zeka/yapay-zeka.module';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import { planGirdisiOku, yerelGun, type OkumaTx } from './plan-girdisi';
import { cumleyiCevir, gerekceEkle } from './plan-metni';
import { uyumProfiliOku } from './uyum-profili';
import { PilotKurulumKuyrugu } from './kurulum-kuyrugu';
import { planPdf } from './plan-pdf';
import { ajansOrgu, gercekYayinAcikMi } from './gercek-yayin';

/**
 * ═══ PİLOT PLAN SERVİSİ (MIMARI § 3, uçların plan yarısı) ═══
 *
 * SİSTEM DOLDURUR, İNSAN İTİRAZ EDER. "Planı hazırla" girdiyi okur,
 * `planUret` sayıları üretir, yapay zekâ yalnız gerekçe paragrafı yazar.
 * Her değişiklik YENİ SÜRÜM (değişmez tablo) ve her sürüm o anki profil
 * ve katalogla denetlenir.
 *
 * TRANSACTION KURALI: Gemini çağrısı hiçbir zaman `withTenant`in içinde
 * değil (5 sn sınırı; model 10+ sn sürebilir). Okuma bir kısa transaction,
 * model çağrısı arada, yazım ikinci kısa transaction — ve yazımda sürüm
 * YENİDEN kontrol edilir, çünkü arada başka biri yazmış olabilir.
 *
 * ONAY = YAYIN (Ç-6). `onayla` plan satırını kilitler, Aylık Bütçe'yi ve
 * uyumu TAZE okur, `onayKapisi`nı koşar; kabul ederse kurulum işini kuyruğa
 * koyar. Ajansın "hepsini yayına al" düğmesi yok; `onaylandi → kuruluyor`
 * geçişini worker yazar.
 */
const logger = new Logger('PilotPlan');

type Tx = OkumaTx & { $executeRaw(q: Prisma.Sql): Promise<number> };

export const PLAN_LISTE_SINIRI = 100;
const SURUM_MESAJI = 'Plan sen bakarken değişti. Sayfayı yenileyip yeniden dene.';

/** "Müşteriye gönder" bu kapı retleriyle durur; DURUM/SURUM/GEREKCE onaya özgü. */
const GONDER_ENGELI: readonly OnayRetKodu[] = ['BUTCE_YOK', 'BUTCE_ASIMI', 'KURULAMAYAN_SATIR', 'UYUM_ENGEL', 'UYUM_UYARI', 'UYUM_BAYAT'];

interface PlanSatiri {
  id: string;
  org_id: string;
  client_id: string;
  donem: string;
  durum: PilotPlanDurumu;
  surum: number;
  icerik_ozeti: string;
  onaylanan_surum: number | null;
  onaylanan_ozet: string | null;
  onay_rolu: 'musteri' | 'ajans' | null;
  onaylayan_ad: string | null;
  onay_zamani: Date | null;
  musteri_adina_gerekce: string | null;
  yayin_kipi: YayinKipi | null;
  musteri_notu: string | null;
  elle_degisti: boolean;
  toplam_micros: string | null;
  para_birimi: string | null;
  created_at: Date;
  updated_at: Date;
}

/*
 * Plan SELECT'i TEK YERDE: satır tipine alan eklenip burada unutulursa
 * $queryRaw susar ve alan undefined gelir. Onaylayanın adı LEFT JOIN:
 * users politikası dar ve INNER JOIN planı sessizce süzerdi (J-12).
 */
function planSecimi(kosul: Prisma.Sql, kilit: boolean): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id::text, p.org_id::text, p.client_id::text, p.donem, p.durum, p.surum, p.icerik_ozeti,
           p.onaylanan_surum, p.onaylanan_ozet, p.onay_rolu, u.full_name AS onaylayan_ad, p.onay_zamani,
           p.musteri_adina_gerekce, p.yayin_kipi, p.musteri_notu, p.elle_degisti,
           p.toplam_micros::text, p.para_birimi, p.created_at, p.updated_at
      FROM pilot_planlari p
      LEFT JOIN users u ON u.id = p.onaylayan_user_id
     WHERE ${kosul}
     ${kilit ? Prisma.sql`FOR UPDATE OF p` : Prisma.empty}`;
}

/** `client_viewer` müşterinin kendi hesabı; diğer her rol ajans personeli. */
export function pilotRolu(ctx: Pick<TenantContext, 'role'>): 'musteri' | 'ajans' {
  return ctx.role === 'client_viewer' ? 'musteri' : 'ajans';
}

/** Onaylanan şey sürümün SHA-256 özeti; anahtar sırasından bağımsız (`planKanonikIcerik`). */
export function planOzeti(p: PlanOnerisi): string {
  return createHash('sha256').update(planKanonikIcerik(p)).digest('hex');
}

/**
 * Bu kullanıcının bu planda yapabilecekleri — DURUM × ROL × İZİN × KAPI.
 * Panel düğmeleri YALNIZ bundan çizilir; düğmenin görünürlüğü ile sunucunun
 * kabulü ayrışırsa kullanıcı tıklayıp ret alır. Saf; testte doğrudan.
 */
export function yapilabilirEylemler(g: {
  durum: PilotPlanDurumu;
  rol: 'musteri' | 'ajans';
  izinler: readonly Permission[];
  gonderilebilir: boolean;
  isaretBekleyen: boolean;
  onaylanabilir: boolean;
}): PilotEkranEylemi[] {
  const e: PilotEkranEylemi[] = [];
  const yaz = g.izinler.includes('strategy.write');
  const yayin = g.izinler.includes('strategy.publish');
  const gecis = (eylem: keyof typeof PILOT_PLAN_GECISLERI) => pilotGecisMumkunMu(g.durum, eylem, g.rol);
  if (g.rol === 'ajans' && yaz) {
    if (g.durum === 'taslak') e.push('degistir', 'yeniden_hazirla');
    if (g.isaretBekleyen && (g.durum === 'taslak' || g.durum === 'musteride')) e.push('uyum_isaret');
    if (gecis('musteriye_gonder') && g.gonderilebilir) e.push('musteriye_gonder');
    for (const x of ['geri_cek', 'yeniden_dene', 'kapat', 'iptal'] as const) if (gecis(x)) e.push(x);
  }
  if (g.rol === 'musteri' && gecis('degisiklik_iste') && g.izinler.includes('strategy.read')) e.push('degisiklik_iste');
  if (yayin && gecis('onayla') && g.onaylanabilir) e.push('onayla');
  return e;
}

interface KapiOkumasi {
  plan: PlanOnerisi;
  profil: UyumProfili;
  denetim: UyumDenetimi;
  isaretler: UyumIsareti[];
  aylikButceMicros: bigint | null;
  ajansinKendiSirketi: boolean;
  /** TEK KAPI (`gercekYayinAcikMi`): okunamazsa false. */
  gercekYayinAcik: boolean;
}

@Injectable()
export class PilotPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kuyruk: PilotKurulumKuyrugu,
    @Inject(YAPAY_ZEKA) private readonly yz: MetinUretici | null,
  ) {}

  private tx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.withTenant(ctx, (t) => fn(t as unknown as Tx));
  }

  // ── Okuma ────────────────────────────────────────────────────────────

  async listele(ctx: TenantContext, clientId: string): Promise<PilotPlanListesi> {
    erisim(ctx, clientId);
    return this.tx(ctx, async (tx) => {
      const r = await tx.$queryRaw<PlanSatiri[]>(
        Prisma.sql`${planSecimi(Prisma.sql`p.client_id = ${clientId}::uuid`, false)} ORDER BY p.donem DESC, p.created_at DESC LIMIT ${PLAN_LISTE_SINIRI}`,
      );
      const [n] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM pilot_planlari WHERE client_id = ${clientId}::uuid`);
      return {
        planlar: r.map((p) => ({
          id: p.id,
          donem: p.donem,
          durum: p.durum,
          surum: p.surum,
          toplamMicros: p.toplam_micros,
          paraBirimi: p.para_birimi,
          guncellendi: new Date(p.updated_at).toISOString(),
        })),
        gosterilen: r.length,
        toplam: n?.n ?? r.length,
      };
    });
  }

  async detay(ctx: TenantContext, id: string, simdi = new Date()): Promise<PilotPlanDetayi> {
    return this.tx(ctx, (tx) => this.detayKur(tx, ctx, id, simdi));
  }

  private async detayKur(tx: Tx, ctx: TenantContext, id: string, simdi: Date): Promise<PilotPlanDetayi> {
    const p = await planOku(tx, ctx, id, false);
    const k = await kapiOku(tx, p, simdi);
    const rol = pilotRolu(ctx);
    const durumU = uyumDurumu(k.denetim, k.isaretler, p.icerik_ozeti);
    const kapi = kapiKos(p, k, rol, { surum: p.surum, icerikOzeti: p.icerik_ozeti, musteriAdinaGerekce: rol === 'ajans' ? 'x'.repeat(20) : null });
    const gonder = kapiKos({ ...p, durum: 'musteride' }, k, 'musteri', { surum: p.surum, icerikOzeti: p.icerik_ozeti });
    return {
      plan: {
        id: p.id,
        clientId: p.client_id,
        donem: p.donem,
        durum: p.durum,
        surum: p.surum,
        icerikOzeti: p.icerik_ozeti,
        yayinKipi: p.yayin_kipi,
        onay:
          p.onay_rolu && p.onay_zamani
            ? { rol: p.onay_rolu, zaman: new Date(p.onay_zamani).toISOString(), kim: p.onaylayan_ad, gerekce: p.musteri_adina_gerekce }
            : null,
        musteriNotu: p.musteri_notu,
        guncellendi: new Date(p.updated_at).toISOString(),
      },
      icerik: k.plan,
      musteriOzeti: musteriOzeti(k.plan),
      rol,
      yapilabilir: yapilabilirEylemler({
        durum: p.durum,
        rol,
        izinler: ctx.permissions,
        gonderilebilir: gonder.tur === 'kabul' || gonder.retler.every((r) => !GONDER_ENGELI.includes(r.kod)),
        isaretBekleyen: durumU === 'uyari_isaret_bekliyor',
        // Ajansın gerekçesi henüz yazılmadı: kapı GEREKCE dışındaki retlere bakar.
        onaylanabilir: kapi.tur === 'kabul' || kapi.retler.every((r) => r.kod === 'GEREKCE'),
      }),
      // Ajans görünümünde gerekçe yer tutucusuyla koşuldu; ret listesinde
      // GEREKCE çıkmaz, panel gerekçeyi kendi alanında ister.
      onayKapisi: kapi,
      uyum: rol === 'ajans' ? { durum: durumU, bulgular: k.denetim.bulgular, isaretler: k.isaretler } : null,
    };
  }

  // ── Planı hazırla ────────────────────────────────────────────────────

  async hazirla(ctx: TenantContext, g: PlanHazirlaGirdisi, simdi = new Date()): Promise<PilotHazirlaYaniti> {
    ajans(ctx);
    erisim(ctx, g.clientId);
    const okuma = await this.tx(ctx, async (tx) => {
      const acik = await acikPlan(tx, g.clientId, g.donem);
      if (acik) throw new ConflictException(`${g.donem} için açık bir plan zaten var. Yeni plan için önce onu iptal et.`);
      return planGirdisiOku(tx, g.clientId, g.donem, simdi);
    });
    const plan = await gerekceEkle(this.yz, planUret(okuma.girdi), simdi.toISOString());
    try {
      return await this.tx(ctx, async (tx) => {
        // org_id HEDEF MÜŞTERİDEN: "tüm şirketler" modunda ctx.orgId ev şirketi.
        const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`SELECT org_id::text FROM clients WHERE id = ${g.clientId}::uuid`);
        if (!c) throw new NotFoundException('Workspace bulunamadı');
        const ozet = planOzeti(planOnerisiSchema.parse(plan) as PlanOnerisi);
        const [yeni] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti, para_birimi, toplam_micros, aylik_butce_id, created_by)
          VALUES (${c.org_id}::uuid, ${g.clientId}::uuid, ${g.donem}, ${ozet}, ${plan.paraBirimi},
                  ${plan.toplam.dolu ? plan.toplam.deger : null}::bigint, ${okuma.girdi.aylikButce?.id ?? null}::uuid, ${ctx.userId}::uuid)
          RETURNING id::text`);
        await surumYaz(tx, { id: yeni!.id, org_id: c.org_id, client_id: g.clientId }, 1, plan, ozet, 'uretici', null, ctx.userId);
        await denetimYaz(tx, { id: yeni!.id, org_id: c.org_id, client_id: g.clientId }, 1, plan, ozet, okuma.kitleUyum, simdi, okuma.saatDilimi);
        return { id: yeni!.id };
      });
    } catch (e) {
      if (String(e instanceof Error ? e.message : e).includes('pilot_planlari_acik_donem_key')) {
        throw new ConflictException(`${g.donem} için açık bir plan zaten var. Yeni plan için önce onu iptal et.`);
      }
      throw e;
    }
  }

  /**
   * TAZE VERİYLE YENİDEN. Elle değişiklik varsa ve kullanıcı `onay: true`
   * demediyse 409: yeniden üretmek o değişiklikleri SESSİZCE ezerdi (I-05).
   */
  async yenidenHazirla(ctx: TenantContext, id: string, g: PlanYenidenHazirlaGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    ajans(ctx);
    const okuma = await this.tx(ctx, async (tx) => {
      const p = await duzenlemeKapisi(tx, ctx, id, g.surum);
      if (p.elle_degisti && g.onay !== true) {
        throw new ConflictException('Bu planda elle yapılmış değişiklikler var; yeniden hazırlamak onları siler. Onaylıyorsan yeniden dene.');
      }
      return { p, okuma: await planGirdisiOku(tx, p.client_id, p.donem, simdi) };
    });
    const plan = await gerekceEkle(this.yz, planUret(okuma.okuma.girdi), simdi.toISOString());
    return this.tx(ctx, async (tx) => {
      const p = await duzenlemeKapisi(tx, ctx, id, g.surum);
      await yeniSurum(tx, p, plan, 'yeniden_hazirla', null, ctx.userId, false, okuma.okuma.kitleUyum, simdi, okuma.okuma.saatDilimi);
      return this.detayKur(tx, ctx, id, simdi);
    });
  }

  /**
   * "Değiştir" kutusu ve elle düzenleme. Cümle varsa model onu
   * `PlanDegisikligi[]`ye çevirir ve çeviri KULLANICININ CÜMLESİNE karşı
   * doğrulanır: cümlede geçmeyen bir tutar reddedilir.
   */
  async degistir(ctx: TenantContext, id: string, g: PlanDegistirGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    ajans(ctx);
    const once = await this.tx(ctx, async (tx) => {
      const p = await duzenlemeKapisi(tx, ctx, id, g.surum);
      return { plan: await surumOku(tx, p.id, p.surum) };
    });
    let degisiklikler: PlanDegisikligi[];
    if (g.degisiklikler && g.degisiklikler.length > 0) degisiklikler = g.degisiklikler;
    else {
      const c = await cumleyiCevir(this.yz, g.cumle!, once.plan);
      if (c.tur === 'ret') {
        if (!this.yz) throw new ServiceUnavailableException(c.mesaj);
        throw new BadRequestException(c.mesaj);
      }
      degisiklikler = c.degisiklikler;
    }
    if (g.cumle && !degisiklikCumleyleUyumluMu(g.cumle, degisiklikler)) {
      throw new BadRequestException('Değişiklikteki tutar cümlende geçmiyor. Tutarı cümlede yazdığın gibi bırak ya da elle değiştir.');
    }
    const s = degisiklikUygula(once.plan, degisiklikler, {
      tur: 'kullanici',
      kimlik: ctx.userId,
      zaman: simdi.toISOString(),
      aciklama: g.cumle ? `"${g.cumle.slice(0, 120)}"` : 'Elle düzenleme',
    });
    if (s.tur === 'ret') throw new BadRequestException(s.mesaj);
    // Eski paragraf eski sayıları anlatıyor olabilir; degisiklikUygula onu
    // düşürdü. Yenisi en iyi çabayla yazılır; yazılamazsa boş kalır.
    const yeni = await gerekceEkle(this.yz, s.plan, simdi.toISOString());
    return this.tx(ctx, async (tx) => {
      const p = await duzenlemeKapisi(tx, ctx, id, g.surum);
      const ku = await kitleUyumOku(tx, p.client_id);
      await yeniSurum(tx, p, yeni, 'degisiklik', g.cumle ?? null, ctx.userId, true, ku, simdi, await saatDilimi(tx, p.client_id));
      return this.detayKur(tx, ctx, id, simdi);
    });
  }

  /** "Okudum, sorumluluk bende" — yalnız ajans; işaret o anki MESAJA bağlanır. */
  async uyumIsaret(ctx: TenantContext, id: string, g: UyumIsaretGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    ajans(ctx);
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (p.surum !== g.surum) throw new ConflictException(SURUM_MESAJI);
      if (p.durum !== 'taslak' && p.durum !== 'musteride') throw new ConflictException('Bu planda uyum işareti artık verilemez.');
      const k = await kapiOku(tx, p, simdi);
      const b = k.denetim.bulgular.find((x) => x.seviye === 'UYARI' && x.kuralKimligi === g.kuralKimligi && x.mesaj === g.mesaj);
      if (!b) throw new ConflictException('Bu uyarı artık yok ya da metni değişti; sayfayı yenile.');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO pilot_uyum_isaretleri (plan_id, org_id, client_id, surum, kural_kimligi, mesaj, user_id)
        VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${p.surum}, ${b.kuralKimligi}, ${b.mesaj}, ${ctx.userId}::uuid)
        ON CONFLICT (plan_id, surum, kural_kimligi) DO UPDATE SET mesaj = EXCLUDED.mesaj, user_id = EXCLUDED.user_id, zaman = now()`);
      return this.detayKur(tx, ctx, id, simdi);
    });
  }

  // ── Durum makinesi ───────────────────────────────────────────────────

  async eylem(ctx: TenantContext, id: string, g: PlanEylemiGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    ajans(ctx);
    let kuyrugaAl = false;
    await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!pilotGecisMumkunMu(p.durum, g.eylem, 'ajans')) throw new ConflictException(gecisMesaji(p.durum));
      if (p.surum !== g.surum) throw new ConflictException(SURUM_MESAJI);
      const hedef = PILOT_PLAN_GECISLERI[g.eylem].hedef;
      if (g.eylem === 'musteriye_gonder') {
        const k = await kapiOku(tx, p, simdi);
        const r = kapiKos({ ...p, durum: 'musteride' }, k, 'musteri', { surum: p.surum, icerikOzeti: p.icerik_ozeti });
        const engel = r.tur === 'ret' ? r.retler.filter((x) => GONDER_ENGELI.includes(x.kod)) : [];
        if (engel.length > 0) throw new ConflictException({ message: 'Plan müşteriye gönderilemez.', retler: engel.map((x) => ({ kod: x.kod, mesaj: x.ajansMesaji })) });
      }
      if (g.eylem === 'yeniden_dene') {
        // S-6: onay yalnız sürüm VE özet aynı kaldıkça geçerli.
        if (p.onaylanan_ozet !== p.icerik_ozeti || p.onaylanan_surum !== p.surum) {
          throw new ConflictException('Onaylanan plan ile güncel plan aynı değil; yeniden onay gerekir.');
        }
        const k = await kapiOku(tx, p, simdi);
        const d = await denetimKaydet(tx, p, k);
        // Uyum sonradan geçtiyse VE gerçek yayın anahtarı açıksa kip GERÇEĞE
        // güncellenir (onaydan sonra değişen tek alan; trigger yalnız bu yöne
        // izin veriyor) ve denetim kaydı plana bağlanır. Karar onay kapısıyla
        // AYNI fonksiyondan (`yayinKipi`): ikinci bir kural yazılırsa anahtar
        // kapalıyken "Şimdi kur" gerçeğe geçirebilirdi.
        const kip = yayinKipi(uyumDurumu(k.denetim, k.isaretler, p.icerik_ozeti), k.ajansinKendiSirketi, k.gercekYayinAcik);
        if (kip === 'gercek' && p.yayin_kipi !== 'gercek') {
          await tx.$executeRaw(Prisma.sql`UPDATE pilot_planlari SET yayin_kipi = 'gercek', onay_denetim_id = ${d}::uuid WHERE id = ${p.id}::uuid`);
        }
        kuyrugaAl = true;
      }
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE pilot_planlari SET durum = ${hedef}, updated_at = now() WHERE id = ${p.id}::uuid AND durum = ${p.durum}`);
      if (n !== 1) throw new ConflictException(SURUM_MESAJI);
    });
    if (kuyrugaAl) await this.kurulumuKuyrugaAl(id, `yd${simdi.getTime()}`, true);
    return this.detay(ctx, id, simdi);
  }

  /** Müşterinin itirazı: not zorunlu, plan taslağa döner. */
  async degisiklikIste(ctx: TenantContext, id: string, g: DegisiklikIsteGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    if (pilotRolu(ctx) !== 'musteri') throw new ForbiddenException('Değişiklik isteği müşteri hesabından gönderilir.');
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!pilotGecisMumkunMu(p.durum, 'degisiklik_iste', 'musteri')) throw new ConflictException(gecisMesaji(p.durum));
      if (p.surum !== g.surum) throw new ConflictException(SURUM_MESAJI);
      await tx.$executeRaw(Prisma.sql`
        UPDATE pilot_planlari SET durum = ${PILOT_PLAN_GECISLERI.degisiklik_iste.hedef}, musteri_notu = ${g.not}, updated_at = now()
         WHERE id = ${p.id}::uuid`);
      return this.detayKur(tx, ctx, id, simdi);
    });
  }

  /**
   * ONAY = YAYIN. Satır kilitli; bütçe ve uyum TAZE; kapı reddederse rolün
   * dilinde mesajlar döner (müşteriye uyum ayrıntısı gitmez). Kabulde yayın
   * kipi yazılır ve kurulum işi kuyruğa girer.
   */
  async onayla(ctx: TenantContext, id: string, g: PlanOnaylaGirdisi, simdi = new Date()): Promise<PilotPlanDetayi> {
    const rol = pilotRolu(ctx);
    await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      const k = await kapiOku(tx, p, simdi);
      const r = kapiKos(p, k, rol, { surum: g.surum, icerikOzeti: g.icerikOzeti, musteriAdinaGerekce: g.musteriAdinaGerekce ?? null });
      if (r.tur === 'ret') {
        throw new ConflictException({
          message: rol === 'musteri' ? 'Plan şu an onaylanamıyor.' : 'Plan onaylanamaz.',
          retler: r.retler.map((x) => ({ kod: x.kod, mesaj: rol === 'musteri' ? x.musteriMesaji || x.ajansMesaji : x.ajansMesaji })),
        });
      }
      const denetimId = await denetimKaydet(tx, p, k);
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE pilot_planlari
           SET durum = ${PILOT_PLAN_GECISLERI.onayla.hedef}, onaylanan_surum = surum, onaylanan_ozet = icerik_ozeti,
               onay_rolu = ${rol}, onaylayan_user_id = ${ctx.userId}::uuid, onay_zamani = now(),
               musteri_adina_gerekce = ${rol === 'ajans' ? g.musteriAdinaGerekce!.trim() : null},
               yayin_kipi = ${r.kip}, onay_denetim_id = ${denetimId}::uuid, updated_at = now()
         WHERE id = ${p.id}::uuid AND durum = 'musteride' AND surum = ${g.surum}`);
      if (n !== 1) throw new ConflictException(SURUM_MESAJI);
    });
    await this.kurulumuKuyrugaAl(id, 'onay');
    return this.detay(ctx, id, simdi);
  }

  /**
   * Kuyruğa alınamazsa onay GERİ ALINMAZ (onay bir kişinin kararı ve
   * kaydedildi); işçinin süpürmesi `onaylandi`da bekleyen planları birkaç
   * dakika içinde kendisi kuyruğa alıyor (`pilotSupurme`). Sessiz değil:
   * log'da ve plan "onaylandı, kurulum başlamadı" olarak görünür.
   */
  private async kurulumuKuyrugaAl(planId: string, tetik: string, yeniden = false): Promise<void> {
    try {
      await this.kuyruk.planEkle(planId, tetik, yeniden);
    } catch (e) {
      logger.error(`Pilot planı ${planId} kuyruğa alınamadı (${tetik}): ${(e as Error).message}`);
    }
  }

  // ── Kurulum ve PDF ───────────────────────────────────────────────────

  async kurulum(ctx: TenantContext, id: string): Promise<PilotKurulumYaniti> {
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      const satirlar = await tx.$queryRaw<Array<{ satir_anahtari: string; platform: 'meta' | 'google'; ad: string; durum: KurulumSatirDurumu; platform_mesaji: string | null; farklar: KurulumSatiri['farklar']; updated_at: Date }>>(Prisma.sql`
        SELECT satir_anahtari, platform, ad, durum, platform_mesaji, farklar, updated_at
          FROM pilot_kurulum_satirlari WHERE plan_id = ${p.id}::uuid
         ORDER BY onaylanan_surum DESC, satir_anahtari`);
      const rol = pilotRolu(ctx);
      return {
        plan: { id: p.id, donem: p.donem, durum: p.durum, surum: p.surum, yayinKipi: p.yayin_kipi },
        ozet: kurulumOzeti(satirlar),
        satirlar: satirlar.map((s) => ({
          anahtar: s.satir_anahtari,
          platform: s.platform,
          ad: s.ad,
          durum: s.durum,
          platformMesaji: s.platform_mesaji,
          farklar: Array.isArray(s.farklar) ? s.farklar : [],
          guncellendi: new Date(s.updated_at).toISOString(),
        })),
        yapilabilir: yapilabilirEylemler({ durum: p.durum, rol, izinler: ctx.permissions, gonderilebilir: false, isaretBekleyen: false, onaylanabilir: false }).filter(
          (e) => e === 'yeniden_dene' || e === 'kapat',
        ),
      };
    });
  }

  /** Veri transaction içinde, PDF üretimi DIŞINDA (rapor PDF'iyle aynı karar). */
  async pdf(ctx: TenantContext, id: string): Promise<{ bayt: Buffer; dosyaAdi: string }> {
    const veri = await this.tx(ctx, async (tx) => {
      const d = await this.detayKur(tx, ctx, id, new Date());
      const [c] = await tx.$queryRaw<Array<{ name: string; slug: string }>>(Prisma.sql`SELECT name, slug FROM clients WHERE id = ${d.plan.clientId}::uuid`);
      return { d, ad: c?.name ?? '', slug: c?.slug ?? 'workspace' };
    });
    const bayt = await planPdf({ workspace: veri.ad, detay: veri.d });
    const temiz = veri.slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
    return { bayt, dosyaAdi: `plan-${temiz}-${veri.d.plan.donem}-s${veri.d.plan.surum}${veri.d.plan.durum === 'taslak' ? '-taslak' : ''}.pdf` };
  }
}

// ── Yardımcılar (saf ya da tek transaction içinde) ───────────────────────

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

/** Planı yazan uçlar yalnız ajans; müşteri okur, itiraz eder, onaylar (J-09). */
function ajans(ctx: TenantContext): void {
  if (pilotRolu(ctx) !== 'ajans') throw new ForbiddenException('Bu işlem ajans hesabından yapılır.');
}

function gecisMesaji(durum: PilotPlanDurumu): string {
  return `Plan şu an bu işleme uygun değil (durum: ${durum}). Sayfayı yenile.`;
}

async function planOku(tx: Tx, ctx: TenantContext, id: string, kilit: boolean): Promise<PlanSatiri> {
  const [p] = await tx.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${id}::uuid`, kilit));
  // RLS süzüyor; bağlam listesi ikinci kapı ("tüm şirketler" modunda RLS
  // kardeş şirketleri de gösteriyor, bağlamın listesi kullanıcınınki).
  if (!p || !ctx.clientIds.includes(p.client_id)) throw new NotFoundException('Plan bulunamadı');
  return p;
}

async function duzenlemeKapisi(tx: Tx, ctx: TenantContext, id: string, surum: number): Promise<PlanSatiri> {
  const p = await planOku(tx, ctx, id, true);
  if (p.durum !== 'taslak') throw new ConflictException(p.durum === 'musteride' ? 'Plan müşteride; düzenlemek için önce geri çek.' : 'Bu plan artık düzenlenemez.');
  if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
  return p;
}

async function acikPlan(tx: Tx, clientId: string, donem: string): Promise<string | null> {
  const [r] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id::text FROM pilot_planlari
     WHERE client_id = ${clientId}::uuid AND donem = ${donem} AND durum NOT IN ('kuruldu', 'kapatildi', 'iptal')`);
  return r?.id ?? null;
}

/** Saklanan sürüm ŞEMAYLA okunur: kaynaksız hücre ya da bozuk JSON burada patlar, ekranda değil. */
export async function surumOku(tx: OkumaTx, planId: string, surum: number): Promise<PlanOnerisi> {
  const [s] = await tx.$queryRaw<Array<{ icerik: unknown }>>(Prisma.sql`
    SELECT icerik FROM pilot_plan_surumleri WHERE plan_id = ${planId}::uuid AND surum = ${surum}`);
  if (!s) throw new NotFoundException('Plan sürümü bulunamadı');
  return planOnerisiSchema.parse(s.icerik) as PlanOnerisi;
}

async function surumYaz(
  tx: Tx,
  p: { id: string; org_id: string; client_id: string },
  surum: number,
  plan: PlanOnerisi,
  ozet: string,
  kaynak: 'uretici' | 'degisiklik' | 'yeniden_hazirla',
  cumle: string | null,
  yazan: string,
): Promise<void> {
  const icerik = planOnerisiSchema.parse(plan);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak, cumle, yazan)
    VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${surum}, ${JSON.stringify(icerik)}::jsonb, ${ozet},
            ${kaynak}, ${cumle}, ${yazan}::uuid)`);
}

async function yeniSurum(
  tx: Tx,
  p: PlanSatiri,
  plan: PlanOnerisi,
  kaynak: 'degisiklik' | 'yeniden_hazirla',
  cumle: string | null,
  yazan: string,
  elle: boolean,
  kitleUyum: Map<string, UyumKitleBilgisi>,
  simdi: Date,
  tz: string,
): Promise<void> {
  const ozet = planOzeti(plan);
  const surum = p.surum + 1;
  await surumYaz(tx, p, surum, plan, ozet, kaynak, cumle, yazan);
  const n = await tx.$executeRaw(Prisma.sql`
    UPDATE pilot_planlari
       SET surum = ${surum}, icerik_ozeti = ${ozet}, para_birimi = ${plan.paraBirimi},
           toplam_micros = ${plan.toplam.dolu ? plan.toplam.deger : null}::bigint,
           elle_degisti = ${elle}, updated_at = now()
     WHERE id = ${p.id}::uuid AND surum = ${p.surum}`);
  if (n !== 1) throw new ConflictException(SURUM_MESAJI);
  await denetimYaz(tx, p, surum, plan, ozet, kitleUyum, simdi, tz);
}

async function saatDilimi(tx: OkumaTx, clientId: string): Promise<string> {
  const [c] = await tx.$queryRaw<Array<{ tz: string }>>(Prisma.sql`SELECT timezone AS tz FROM clients WHERE id = ${clientId}::uuid`);
  return c?.tz || 'Europe/Istanbul';
}

export async function kitleUyumOku(tx: OkumaTx, clientId: string): Promise<Map<string, UyumKitleBilgisi>> {
  const r = await tx.$queryRaw<Array<{ id: string; yas_min: number; yas_max: number; cinsiyet: string; ozel: unknown }>>(Prisma.sql`
    SELECT id::text, age_min AS yas_min, age_max AS yas_max, genders AS cinsiyet, ozel_kitleler AS ozel
      FROM audience_templates WHERE client_id = ${clientId}::uuid`);
  return new Map(
    r.map((k) => [
      k.id,
      { yasMin: k.yas_min, yasMax: k.yas_max, cinsiyet: k.cinsiyet, ozelKitleVar: (Array.isArray(k.ozel) ? k.ozel : []).some((o) => (o as { mod?: string })?.mod === 'dahil') },
    ]),
  );
}

/** Sürümün denetimini o anki profil ve katalogla yazar (değişmez rapor). */
async function denetimYaz(
  tx: Tx,
  p: { id: string; org_id: string; client_id: string },
  surum: number,
  plan: PlanOnerisi,
  ozet: string,
  kitleUyum: Map<string, UyumKitleBilgisi>,
  simdi: Date,
  tz: string,
): Promise<string> {
  const profil = await uyumProfiliOku(tx, p.client_id);
  const d = uyumDenetle(planUyumGirdisi(plan, ozet, yerelGun(simdi, tz), kitleUyum), profil, KATALOG_SURUMU, simdi.toISOString());
  return denetimSatiri(tx, p, surum, d, profil);
}

async function denetimSatiri(tx: Tx, p: { id: string; org_id: string; client_id: string }, surum: number, d: UyumDenetimi, profil: UyumProfili): Promise<string> {
  const [r] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO pilot_uyum_denetimleri (plan_id, org_id, client_id, surum, icerik_ozeti, katalog_surumu, an, bulgular, profil)
    VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${surum}, ${d.icerikOzeti}, ${d.katalogSurumu}, 'plan',
            ${JSON.stringify(d.bulgular)}::jsonb, ${JSON.stringify(profil)}::jsonb)
    RETURNING id::text`);
  return r!.id;
}

async function denetimKaydet(tx: Tx, p: PlanSatiri, k: KapiOkumasi): Promise<string> {
  return denetimSatiri(tx, p, p.surum, k.denetim, k.profil);
}

/**
 * Onay kapısının TAZE girdisi: sürüm içeriği, profil, katalogla yeni
 * denetim (kaydedilmez; onayda ve "Şimdi kur"da kaydedilir), bu sürümün
 * işaretleri, o ayın Aylık Bütçe'si ve "ajansın kendi şirketi mi".
 */
async function kapiOku(tx: Tx, p: PlanSatiri, simdi: Date): Promise<KapiOkumasi> {
  const plan = await surumOku(tx, p.id, p.surum);
  const profil = await uyumProfiliOku(tx, p.client_id);
  const tz = await saatDilimi(tx, p.client_id);
  const kitleUyum = await kitleUyumOku(tx, p.client_id);
  const denetim = uyumDenetle(planUyumGirdisi(plan, p.icerik_ozeti, yerelGun(simdi, tz), kitleUyum), profil, KATALOG_SURUMU, simdi.toISOString());
  const isaretler = (
    await tx.$queryRaw<Array<{ kural: string; mesaj: string; user_id: string | null; zaman: Date }>>(Prisma.sql`
      SELECT kural_kimligi AS kural, mesaj, user_id::text, zaman FROM pilot_uyum_isaretleri
       WHERE plan_id = ${p.id}::uuid AND surum = ${p.surum} ORDER BY kural_kimligi`)
  ).map((i) => ({ kuralKimligi: i.kural, mesaj: i.mesaj, userId: i.user_id ?? '', zaman: new Date(i.zaman).toISOString() }));
  const [b] = await tx.$queryRaw<Array<{ micros: string }>>(Prisma.sql`
    SELECT amount_micros::text AS micros FROM monthly_budgets
     WHERE client_id = ${p.client_id}::uuid AND ad_account_id IS NULL AND month = ${`${p.donem}-01`}::date`);
  // "Ajansın kendi şirketi" anahtarla AYNI tanımdan (`ajansOrgu`): ajansı
  // belirsiz şirket ajans SAYILMAZ, yani test kipi müşteri hesabına düşmez.
  const ajansinKendiSirketi = (await ajansOrgu(tx, p.org_id).catch(() => null)) === p.org_id;
  const gy = await gercekYayinAcikMi(tx, p.org_id);
  return { plan, profil, denetim, isaretler, aylikButceMicros: b ? BigInt(b.micros) : null, ajansinKendiSirketi, gercekYayinAcik: gy.acik };
}

function kapiKos(
  p: Pick<PlanSatiri, 'durum' | 'surum' | 'icerik_ozeti'>,
  k: KapiOkumasi,
  rol: 'musteri' | 'ajans',
  istek: { surum: number; icerikOzeti: string; musteriAdinaGerekce?: string | null },
): OnayKapisiSonucu {
  return onayKapisi({
    durum: p.durum,
    surum: p.surum,
    icerikOzeti: p.icerik_ozeti,
    istek,
    rol,
    plan: k.plan,
    aylikButceMicros: k.aylikButceMicros,
    uyum: uyumDurumu(k.denetim, k.isaretler, p.icerik_ozeti),
    ajansinKendiSirketi: k.ajansinKendiSirketi,
    gercekYayinAcik: k.gercekYayinAcik,
  });
}
