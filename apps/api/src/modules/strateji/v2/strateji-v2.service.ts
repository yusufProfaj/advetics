import { createHash, randomUUID } from 'node:crypto';
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
  AI_METIN_BOLUMLERI,
  AMAC_ASAMASI,
  REHBER_AMACLARI,
  REHBER_PLATFORMLARI,
  STRATEJI_GECISLERI,
  YORUM_ZORUNLU_EYLEMLER,
  butceBol,
  imzaTemizle,
  kalemAktarimEngeli,
  kalemTarihHatasi,
  kalemTahmini,
  kalemdenRehberAlanlari,
  paraOndaligi,
  stratejiDonemi,
  stratejiDuzenlenebilirMi,
  stratejiGecisMumkunMu,
  stratejiPanelAdresi,
  stratejiRiskleri,
  stratejiYapilabilir,
  tutarAyristir,
  tutarGoster,
  KALEM_AKTARIM_ENGEL_METNI,
  type AktarimOnizlemesi,
  type BolumlerGovdesi,
  type Gerceklesen,
  type GonderGovdesi,
  type GonderimSonucu,
  type KalemAktarimKarari,
  type KalemMetinOnerisi,
  type KalemTahmini,
  type KaynakliMetin,
  type KelimeAraGirdisi,
  type KelimeGuncelleGirdisi,
  type KelimeSatiri,
  type MetinOnerIstegi,
  type PlanDetayi,
  type RehberAlanAdi,
  type RehberHazirligi,
  type RehberinStratejisi,
  type RehberPlatformu,
  type StratejiAktarGirdisi,
  type StratejiAktarimSonucu,
  type StratejiBolumKodu,
  type StratejiDetayi,
  type StratejiDurumu,
  type StratejiEylemGirdisi,
  type StratejiGirdileri,
  type StratejiKalemi,
  type StratejiKalemiGirdisi,
  type StratejiKalemleriKaydetGirdisi,
  type StratejiListesi,
  type StratejiOlusturGirdisi,
  type StratejiOnayRolu,
  type StratejiOnerisi,
  type StratejiRevizyonGirdisi,
  type StratejiRiski,
  type StratejiYorumlari,
  type StratejiYorumu,
  type TenantContext,
  type YorumGovdesi,
  AMAC_OLCUTU,
  OLCUM_TURU_ADLARI,
  REHBER_AMAC_KODLARI,
  type KitleOnerGirdisi,
  type StratejiIncelemeParcasi,
  type StratejiIncelemeSatiri,
  type StratejiKitleOnerisi,
  type StratejiSihirbazGirdileri,
  type StratejiSihirbazKaydetGirdisi,
  type StratejiSihirbazOlusturGirdisi,
} from '@advetics/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import { YAPAY_ZEKA } from '../../../yapay-zeka/yapay-zeka.module';
import type { GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import { AuditService } from '../../audit/audit.service';
import { OlcumService } from '../../olcum/olcum.service';
import { RaporGonderService } from '../../reports/rapor-gonder.service';
import { ReklamHazirlikService } from '../../reklam/hazirlik.service';
import { RehberService, rehberSatiriEkle } from '../../reklam/rehber/rehber.service';
import { ajansYoneticisiMi } from '../../reklam/ajans-yoneticisi';
import { siteYokBeyaniVarMi } from '../../kurulum/kurulum-beyan';
import { kelimeHesabi } from '../kelime-isleyici';
import { StratejiKelimeKuyrugu } from '../kelime-kuyrugu';
import { KELIME_ARAMA_ZAMAN_ASIMI_DK, KUYRUK_HATASI } from '../strateji.service';
import { gecmisOku, gerceklesenOku, tahminPenceresi, type GecmisOkumasi } from './gecmis';
import {
  belgeGecmisi,
  enGucluKelimeGrubu,
  girdileriDerle,
  isletmeSatirlari,
  istanbulBugun,
  kullanilmayanPlatformlar,
  markaKonumlari,
  markaOku,
  olcumHaritasi,
  olcumOzeti,
  ozelKategoriVar,
  siteTaramasiOku,
  videoVarMi,
  ANA_AMAC_REHBER,
} from './girdiler';
import { amacOlcumTuru, amacPlatformlari, gunlukAsgari, secimliMotor, stratejiMotoru, type OnerilenKalem } from './motor';
import { kitleTarifiUret, stratejiMetinleri, type OneriBolumMetni, type StratejiAiGirdisi } from './strateji-ai';
import { stratejiDosyaAdi, stratejiPdf } from './strateji-pdf';
import {
  KALEM_SUTUNLARI,
  belgeOku,
  kalemGirdisi,
  kalemSatirlari,
  listeSatiri,
  olcumOzetiOku,
  planKur,
  planSecimi,
  sihirbazOku,
  tahminOku,
  type PlanSatiri,
  type Sorgucu,
} from './satirlar';
import { OnayBaglantisiService } from './onay-baglantisi.service';
import { belgeVerisiKur } from './belge-verisi';
import { yorumEkle, yorumlariOku } from './yorumlar';

/**
 * ═══ ADVSTRATEGY v2 SERVİSİ ═══ (docs/advstrategy/YENIDEN-TASARIM.md)
 *
 * TİP TANIMLAMIYOR: gövde ve yanıtlar `packages/shared/src/strateji/v2/`.
 *
 * YAZMA KAPILARI (v1 ile aynı sıra): (1) plan düzenlenebilir mi (`taslak` ya
 * da `revizyon`), (2) gövdenin `surum`u satırdakiyle aynı mı (değilse 409),
 * (3) yazım + `surum + 1` AYNI transaction'da, satır `FOR UPDATE` kilitli.
 * Revizyondaki ilk kayıt durumu `taslak`a çeker: müşterinin itiraz ettiği
 * belge ile düzeltilmiş belge aynı sürüm olmamalı.
 *
 * PLATFORM ÇAĞRISI TRANSACTION DIŞINDA: öneri (ölçüm + asgari okuması +
 * yapay zekâ) ve PDF/mail kısa transaction'ların ARASINDA. `withTenant`
 * 5 saniyede ölüyor ve platform turu 12 saniyeyi bulmuştu (CLAUDE.md).
 */

export const PLAN_LISTE_SINIRI = 100;
const SURUM_MESAJI = 'Strateji siz bakarken değişti. Sayfayı yenileyip yeniden deneyin.';
const V1_MESAJI = 'Bu eski biçimde bir aylık medya planı; yalnız okunur ve eski görünümden açılır.';

type Tx = Parameters<Parameters<PrismaService['withTenant']>[1]>[0];

/** `client_viewer` müşterinin kendi giriş hesabı; diğer her rol ajans personeli. */
export function v2Rol(ctx: Pick<TenantContext, 'role'>): Extract<StratejiOnayRolu, 'musteri' | 'ajans'> {
  return ctx.role === 'client_viewer' ? 'musteri' : 'ajans';
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

/** Plan satırı (RLS'li). v1 planı yalnız `v1Olur` ile döner; aksi 409. */
async function planOku(tx: Sorgucu, ctx: TenantContext, id: string, kilit: boolean, v1Olur = false): Promise<PlanSatiri> {
  const [p] = await tx.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${id}::uuid`, kilit));
  // RLS zaten süzüyor; bağlam listesi ikinci kapı ("tüm şirketler" modunda
  // RLS kardeş şirketleri de gösteriyor, bağlamın listesi kullanıcınınki).
  if (!p || !ctx.clientIds.includes(p.client_id)) throw new NotFoundException('Strateji bulunamadı');
  if (p.bicim !== 2 && !v1Olur) throw new ConflictException(V1_MESAJI);
  return p;
}

async function yazmaKapisi(tx: Sorgucu, ctx: TenantContext, id: string, surum: number): Promise<PlanSatiri> {
  const p = await planOku(tx, ctx, id, true);
  if (!stratejiDuzenlenebilirMi(p.durum as StratejiDurumu)) {
    throw new ConflictException(p.durum === 'onayda' ? 'Strateji onayda; düzenlemek için önce geri çekin.' : 'Bu strateji artık düzenlenemez.');
  }
  if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
  return p;
}

/** Yazımın sonu: sürüm artar, revizyondaki plan taslağa döner. */
async function surumArttir(tx: Sorgucu, id: string): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    UPDATE strateji_planlari
       SET surum = surum + 1, updated_at = now(),
           durum = CASE WHEN durum = 'revizyon' THEN 'taslak' ELSE durum END
     WHERE id = ${id}::uuid RETURNING id`);
}

/** Postgres BIGINT üst sınırı. `tutarAyristir` üst sınır koymuyor; aşan tutar INSERT'te anlamsız 22003 verirdi. */
const BIGINT_EN_BUYUK = 9_223_372_036_854_775_807n;

function tutarCoz(girdi: string, paraBirimi: string, alan: string): bigint {
  const t = tutarAyristir(girdi, paraBirimi);
  if (t.tur === 'hata') throw new BadRequestException(`${alan}: ${t.mesaj}`);
  if (t.micros > BIGINT_EN_BUYUK) throw new BadRequestException(`${alan}: tutar çok büyük.`);
  return t.micros;
}

/** Bölüm metnini kaynağıyla damgalar (kim + zaman sunucudan). */
function damgala(m: { metin: string; kaynak: 'ai' | 'ajans' }, ctx: TenantContext, zaman: string): KaynakliMetin {
  return { metin: m.metin, kaynak: m.kaynak, kim: m.kaynak === 'ajans' ? ctx.userId : null, zaman };
}

/** Yapay zekâ önerisini kalem alanına çevirir; üretilemediyse `null` + neden listeye. */
function oneriMetni(m: OneriBolumMetni, zaman: string): KaynakliMetin | null {
  return m.metin === null ? null : { metin: m.metin, kaynak: 'ai', kim: null, zaman };
}

interface GirdiOkumasi {
  marka: Awaited<ReturnType<typeof markaOku>>;
  siteTaramasi: Awaited<ReturnType<typeof siteTaramasiOku>>;
  siteYok: boolean | null;
  kullanilmayan: RehberPlatformu[];
  gecmis: GecmisOkumasi;
  pencere: { baslangic: string; bitis: string };
  video: boolean;
  kelimeGrubu: string | null;
  kelimeGruplari: Array<{ grup: string; kelime: number }>;
}

@Injectable()
export class StratejiV2Service {
  private readonly logger = new Logger('StratejiV2');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rehber: RehberService,
    private readonly hazirlikSvc: ReklamHazirlikService,
    private readonly olcum: OlcumService,
    private readonly gonderici: RaporGonderService,
    private readonly audit: AuditService,
    private readonly kuyruk: StratejiKelimeKuyrugu,
    private readonly baglantilar: OnayBaglantisiService,
    @Inject(CONFIG) private readonly config: AppConfig,
    // Anahtar yoksa `null` (YapayZekaModule, global): öneri metinsiz döner,
    // nedeni yazılır. `@Optional` YOK: kayıt eksikse açılışta patlasın.
    @Inject(YAPAY_ZEKA) private readonly yz: GeminiIstemcisi | null,
  ) {}

  /** Testin saatini sabitleyebilmesi için; üretimde gerçek saat. */
  simdi: () => Date = () => new Date();

  private tx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.withTenant(ctx, fn);
  }

  // ── Liste ve okuma ───────────────────────────────────────────────────

  async listele(ctx: TenantContext, clientId: string): Promise<StratejiListesi> {
    erisim(ctx, clientId);
    return this.tx(ctx, async (tx) => {
      const satirlar = await tx.$queryRaw<PlanSatiri[]>(Prisma.sql`
        ${planSecimi(Prisma.sql`p.client_id = ${clientId}::uuid`, false)}
        ORDER BY COALESCE(p.baslangic, to_date(p.donem || '-01', 'YYYY-MM-DD')) DESC, p.created_at DESC
        LIMIT ${PLAN_LISTE_SINIRI}::int`);
      const [n] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT count(*)::int AS n FROM strateji_planlari WHERE client_id = ${clientId}::uuid`);
      return { planlar: satirlar.map(listeSatiri), toplam: n?.n ?? satirlar.length };
    });
  }

  async detay(ctx: TenantContext, id: string): Promise<StratejiDetayi> {
    return this.tx(ctx, async (tx) => this.detayKur(tx, ctx, await planOku(tx, ctx, id, false)));
  }

  /** Detay — panel. Müşteri hesabında ajans notları ve "Kullan" denmemiş yapay zekâ metni çıkar. */
  private async detayKur(tx: Sorgucu, ctx: TenantContext, p: PlanSatiri): Promise<StratejiDetayi> {
    const musteri = ctx.role === 'client_viewer';
    const belge = await belgeOku(tx, p, musteri);
    const bugun = istanbulBugun(this.simdi());
    const pencere = tahminPenceresi(bugun);
    const gecmis = await gecmisOku(tx, p.client_id, p.para_birimi, pencere);
    const marka = await markaOku(tx, p.client_id);
    const site = await siteTaramasiOku(tx, p.client_id);
    return {
      plan: planKur(p),
      ...belge,
      isletme: isletmeSatirlari(marka, site),
      gecmis: belgeGecmisi(gecmis, pencere),
      olcum: olcumOzetiOku(p.olcum_ozeti),
      yapilabilir: stratejiYapilabilir(p.durum as StratejiDurumu, ctx.permissions),
      kelimeler: musteri ? bosKelimeler() : await kelimeleriOku(tx, p),
      sihirbaz: musteri ? null : sihirbazOku(p.sihirbaz),
    };
  }

  // ── Oluştur ──────────────────────────────────────────────────────────

  /**
   * YENİ PLANLAR v2 (`bicim = 2`). v1 oluşturma ucu kapalı (strateji.service).
   * Workspace başına TEK AÇIK strateji (kısmi tekil indeks); onaylı
   * stratejilerin dönemleri ÇAKIŞAMAZ (servis kontrolü: indeksle ifade
   * edilemiyor).
   */
  async olustur(ctx: TenantContext, girdi: StratejiOlusturGirdisi | StratejiSihirbazOlusturGirdisi): Promise<StratejiDetayi> {
    const sihirbaz = 'sihirbaz' in girdi && girdi.sihirbaz ? JSON.stringify(girdi.sihirbaz) : null;
    erisim(ctx, girdi.clientId);
    const donem = stratejiDonemi(girdi.baslangicAyi, girdi.sureAy);
    try {
      return await this.tx(ctx, async (tx) => {
        // org_id HEDEF workspace'ten ("tüm şirketler" modunda ctx.orgId ev şirketi).
        const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`SELECT org_id::text FROM clients WHERE id = ${girdi.clientId}::uuid`);
        if (!c) throw new NotFoundException('Workspace bulunamadı');
        const paraBirimi = girdi.paraBirimi ?? (await workspaceParaBirimi(tx, girdi.clientId));
        try {
          paraOndaligi(paraBirimi);
        } catch {
          throw new BadRequestException('Para birimi kodu geçersiz');
        }
        const toplam = tutarCoz(girdi.toplamButce, paraBirimi, 'Toplam bütçe');
        const [acik] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM strateji_planlari
           WHERE client_id = ${girdi.clientId}::uuid AND bicim = 2 AND durum IN ('taslak', 'onayda', 'revizyon')`);
        if ((acik?.n ?? 0) > 0) throw new ConflictException(ACIK_PLAN_MESAJI);
        const [cakisan] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM strateji_planlari
           WHERE client_id = ${girdi.clientId}::uuid AND bicim = 2 AND durum = 'onaylandi'
             AND baslangic <= ${donem.bitis}::date AND bitis >= ${donem.baslangic}::date`);
        if ((cakisan?.n ?? 0) > 0) throw new ConflictException('Bu dönemle çakışan onaylı bir strateji var; önce onu kapatın.');
        const [yeni] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO strateji_planlari (org_id, client_id, bicim, donem, baslangic, bitis, toplam_butce_micros, para_birimi, created_by, sihirbaz)
          VALUES (${c.org_id}::uuid, ${girdi.clientId}::uuid, 2, ${girdi.baslangicAyi}, ${donem.baslangic}::date, ${donem.bitis}::date,
                  ${toplam}::bigint, ${paraBirimi}, ${ctx.userId}::uuid, ${sihirbaz}::jsonb)
          RETURNING id::text`);
        return this.detayKur(tx, ctx, await planOku(tx, ctx, yeni!.id, false));
      });
    } catch (e) {
      if (String(e instanceof Error ? e.message : e).includes('strateji_planlari_acik_v2_key')) throw new ConflictException(ACIK_PLAN_MESAJI);
      throw e;
    }
  }

  // ── Girdiler ve öneri ────────────────────────────────────────────────

  private async girdiOku(ctx: TenantContext, p: PlanSatiri): Promise<GirdiOkumasi> {
    const bugun = istanbulBugun(this.simdi());
    const pencere = tahminPenceresi(bugun);
    return this.tx(ctx, async (tx) => {
      // TRANSACTION İÇİNDE `catch` YOK (Ajan 4): Postgres düşen sorgudan sonra
      // transaction'ı iptal ediyor; yutulan hata bir sonraki sorguda "current
      // transaction is aborted" olarak patlıyor ve asıl sebep hiçbir yerde
      // yazmıyordu. Okunamayan beyan isteği düşürür, sebebiyle.
      const siteYok: boolean | null = await siteYokBeyaniVarMi(tx, p.client_id);
      const gruplar = await tx.$queryRaw<Array<{ grup: string; kelime: number }>>(Prisma.sql`
        SELECT grup, count(*)::int AS kelime FROM strateji_kelimeleri
         WHERE plan_id = ${p.id}::uuid AND secili AND grup IS NOT NULL GROUP BY grup ORDER BY 2 DESC, 1`);
      return {
        marka: await markaOku(tx, p.client_id),
        siteTaramasi: await siteTaramasiOku(tx, p.client_id),
        siteYok,
        kullanilmayan: await kullanilmayanPlatformlar(tx, p.client_id),
        gecmis: await gecmisOku(tx, p.client_id, p.para_birimi, pencere),
        pencere,
        video: await videoVarMi(tx, p.client_id),
        kelimeGrubu: await enGucluKelimeGrubu(tx, p.id),
        kelimeGruplari: gruplar,
      };
    });
  }

  /** Ölçüm — 10 dk önbellekli platform okuması; düşerse `null` (uyarı üretmez, nedeni yazılır). */
  private async olcumOku(ctx: TenantContext, clientId: string) {
    try {
      return await this.olcum.durum(ctx, clientId, false);
    } catch (e) {
      this.logger.warn(`Ölçüm okunamadı (${clientId}): ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  /**
   * Hazırlık: `platformOku` iken rehberin KENDİ hazırlığı (Meta asgarisi
   * Graph'tan); düşerse ya da istenmezse platform çağrısız okuma (asgari
   * bilinmiyor, kontrol koşmaz, ekran söyler).
   */
  private async hazirlikOku(ctx: TenantContext, clientId: string, platformOku: boolean): Promise<RehberHazirligi> {
    if (platformOku) {
      try {
        return await this.rehber.hazirlik(ctx, clientId);
      } catch (e) {
        this.logger.warn(`Rehber hazırlığı platformdan okunamadı (${clientId}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.hazirlikSvc.rehberOku(ctx, clientId, null);
  }

  async girdiler(ctx: TenantContext, id: string): Promise<StratejiGirdileri> {
    const p = await this.tx(ctx, (tx) => planOku(tx, ctx, id, false));
    const g = await this.girdiOku(ctx, p);
    const [olcum, hazirlik] = await Promise.all([this.olcumOku(ctx, p.client_id), this.hazirlikOku(ctx, p.client_id, false)]);
    return girdileriDerle({ clientId: p.client_id, marka: g.marka, siteTaramasi: g.siteTaramasi, siteYok: g.siteYok, kullanilmayan: g.kullanilmayan, olcum, hazirlik, gecmis: g.gecmis, pencere: g.pencere, kelimeGruplari: g.kelimeGruplari });
  }

  /**
   * "Strateji öner": motor + yapay zekâ metni. YAZMAZ (kalemler kaydedilmez);
   * yalnız öneriyi ve imzasını plan satırına not eder ki aynı girdiyle ikinci
   * çağrı yapay zekâya gitmesin. Aynı imzada önbellek KALEMLERİ DE döndürür:
   * motor deterministik, imza girdinin tamamını taşıyor.
   */
  async oner(ctx: TenantContext, id: string): Promise<StratejiOnerisi> {
    const p = await this.tx(ctx, async (tx) => {
      const x = await planOku(tx, ctx, id, false);
      if (!stratejiDuzenlenebilirMi(x.durum as StratejiDurumu)) throw new ConflictException('Yalnız taslak ya da revizyondaki stratejiye öneri alınır.');
      return x;
    });
    const g = await this.girdiOku(ctx, p);
    const [olcum, hazirlik] = await Promise.all([this.olcumOku(ctx, p.client_id), this.hazirlikOku(ctx, p.client_id, true)]);
    const harita = olcumHaritasi(olcum).harita;
    const anaAmac = g.marka?.ana_amac ? (ANA_AMAC_REHBER[g.marka.ana_amac] ?? null) : null;
    const hesap = { meta: hazirlik.hesaplar.length > 0, google: hazirlik.googleHesaplari.length > 0 };
    const asgari = {
      meta: hazirlik.asgariGunluk.meta === null ? null : BigInt(hazirlik.asgariGunluk.meta),
      googleTalepYaratma: hazirlik.asgariGunluk.googleTalepYaratma === null ? null : BigInt(hazirlik.asgariGunluk.googleTalepYaratma),
    };
    const bugun = istanbulBugun(this.simdi());
    // ADIM ADIM AKIŞ: kullanıcının seçtiği hedefler (sırasıyla), bölgesi ve
    // ONAYLADIĞI kitle tarifi. Sihirbaz durumu yoksa (eski plan) motor
    // amacı kendisi seçer; ikisi aynı `kalemKur`dan geçiyor.
    const sihirbaz = sihirbazOku(p.sihirbaz);
    const secilen = sihirbaz && sihirbaz.amaclar.length > 0 ? sihirbaz.amaclar : null;
    const kitle = sihirbaz?.kitle?.onaylandi ? sihirbaz.kitle.metin : null;
    const motorGirdisi = {
      konumKaynagi: sihirbaz && sihirbaz.konumlar.length > 0 ? ('ajans' as const) : ('marka' as const),
      toplamMicros: BigInt(p.toplam_butce_micros),
      paraBirimi: p.para_birimi,
      donem: { baslangic: p.baslangic!, bitis: p.bitis! },
      bugun,
      anaAmac,
      siteYok: g.siteYok,
      kullanilmayan: new Set(g.kullanilmayan),
      hesap,
      ajansYoneticisi: hazirlik.ajansYoneticisi,
      olcum: harita,
      asgari,
      gecmis: g.gecmis.sonuc,
      videoVarligiVar: g.video,
      adresKonumuVar: !!hazirlik.iletisim.adresKonumu,
      konumlar: sihirbaz && sihirbaz.konumlar.length > 0 ? sihirbaz.konumlar : markaKonumlari(hazirlik),
      kelimeGrubu: g.kelimeGrubu,
    };
    const motor = secilen ? secimliMotor(motorGirdisi, secilen) : stratejiMotoru(motorGirdisi);
    const aiGirdisi = aiGirdisiKur(g, motor.kalemler.map((k) => k.amac), kitle);
    // İMZA: motorun çıktısı + yapay zekânın girdisi. Aynıysa öneri saklanandan.
    const imza = createHash('sha256').update(JSON.stringify({ motor: motor.kalemler, ai: aiGirdisi, notlar: motor.notlar })).digest('hex');
    const onceki = p.oneri_imzasi === imza ? (p.son_oneri as StratejiOnerisi | null) : null;
    if (onceki && Array.isArray(onceki.kalemler)) return { ...onceki, onbellekten: true };

    const metinler = await stratejiMetinleri(this.yz, aiGirdisi);
    const zaman = this.simdi().toISOString();
    const uretilemeyen: StratejiOnerisi['uretilemeyen'] = [];
    const bolumler: StratejiOnerisi['bolumler'] = {};
    for (const b of AI_METIN_BOLUMLERI) {
      const m = metinler.bolumler[b];
      if (b === 'kitle' && kitle) continue;
      if (m.metin === null) uretilemeyen.push({ bolum: b, neden: m.aciklama });
      else bolumler[b] = { metin: m.metin, kaynak: 'ai', kim: null, zaman };
    }
    if (kitle) bolumler.kitle = { metin: kitle, kaynak: 'ajans', kim: ctx.userId, zaman };
    const kalemler: StratejiKalemi[] = motor.kalemler.map((k, i) => {
      const mt = metinler.kalemMetinleri[i];
      const ky = mt ? oneriMetni(mt.kreatifYonergesi, zaman) : null;
      // Onaylanan tarif kalemin tarifi olur (ajans "Bu tarif doğru" dedi);
      // yapay zekâya ikinci kez yazdırmak onaylanmamış bir cümleyi araya sokardı.
      const kt = kitle ? { metin: kitle, kaynak: 'ajans' as const, kim: ctx.userId, zaman } : mt ? oneriMetni(mt.kitleTarifi, zaman) : null;
      if (mt?.kreatifYonergesi.metin === null) uretilemeyen.push({ bolum: 'kampanyalar', neden: `Kampanya ${i + 1} kreatif yönergesi: ${mt.kreatifYonergesi.aciklama}` });
      return oneriKalemi(k, i + 1, ky, kt);
    });
    const notlar = [...motor.notlar, ...motor.kalemler.flatMap((k, i) => k.gerekceler.map((x) => `Kampanya ${i + 1}: ${x}`))];
    const riskler = riskHesapla(kalemler, { harita, hesap, asgari, ozelKategori: ozelKategoriVar({ marka: g.marka, hazirlik }), paraBirimi: p.para_birimi });
    const oneri: StratejiOnerisi = { kalemler, bolumler, uretilemeyen, notlar, riskler, onbellekten: false };
    await this.tx(ctx, (tx) =>
      tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET son_oneri = ${JSON.stringify(oneri)}::jsonb, oneri_imzasi = ${imza}
         WHERE id = ${p.id}::uuid RETURNING id`),
    );
    return oneri;
  }

  // ── Adım adım akış (sihirbaz) ────────────────────────────────────────

  /**
   * Hedef ve bütçe adımlarının girdileri — PLAN DOĞMADAN. Plan bütçe
   * adımında açılıyor (oluşturma toplam istiyor), ama hedef kartlarının
   * kapalı/açık hâli ve bütçenin asgari kontrolü ondan önce lazım.
   *
   * Kapılar MOTORUN kendisinden (`amacPlatformlari`): kart açık görünüp
   * motorun plana almaması "seçtim, planda yok" hâlini üretirdi. Meta
   * asgarisi platformdan okunur (rehberin hazırlığı); okunamazsa `null` ve
   * nedeni `okumaHatalari`nda: bütçe adımı "kontrol edilemedi" der.
   */
  async sihirbazGirdileri(ctx: TenantContext, clientId: string): Promise<StratejiSihirbazGirdileri> {
    erisim(ctx, clientId);
    const yerel = await this.tx(ctx, async (tx) => ({
      siteYok: await siteYokBeyaniVarMi(tx, clientId),
      kullanilmayan: await kullanilmayanPlatformlar(tx, clientId),
      para: await paraBirimiDurumu(tx, clientId),
    }));
    const [olcum, hazirlik] = await Promise.all([this.olcumOku(ctx, clientId), this.hazirlikOku(ctx, clientId, true)]);
    const harita = olcumHaritasi(olcum);
    const kapi = {
      ajansYoneticisi: hazirlik.ajansYoneticisi,
      kullanilmayan: new Set(yerel.kullanilmayan),
      hesap: { meta: hazirlik.hesaplar.length > 0, google: hazirlik.googleHesaplari.length > 0 },
      siteYok: yerel.siteYok,
      olcum: harita.harita,
    };
    const okumaHatalari = [...harita.hatalar];
    if (kapi.hesap.meta && hazirlik.asgariGunluk.meta === null) okumaHatalari.push('Meta’nın bu hesaptaki günlük asgari bütçesi okunamadı; Meta için bütçe kontrolü yapılamadı.');
    const konumlar = markaKonumlari(hazirlik);
    return {
      amaclar: REHBER_AMAC_KODLARI.map((amac) => {
        const { acik, dusen } = amacPlatformlari(amac, kapi);
        return { amac, acik: acik.length > 0, platformlar: acik, sebepler: dusen };
      }),
      asgariGunluk: hazirlik.asgariGunluk,
      paraBirimi: yerel.para.para ?? 'TRY',
      paraBirimiHatasi: yerel.para.hata,
      konumOnerisi: { konumlar, kaynak: konumlar.length > 0 ? 'marka' : 'yok', adres: hazirlik.iletisim.adres ?? null },
      konumHesabi: hazirlik.hesaplar[0]?.id ?? null,
      ozelKategori: ozelKategoriVar({ marka: await this.tx(ctx, (tx) => markaOku(tx, clientId)), hazirlik }),
      ajansYoneticisi: hazirlik.ajansYoneticisi,
      baslangicAyi: gelecekAy(istanbulBugun(this.simdi())),
      okumaHatalari,
    };
  }

  /**
   * "Devam" — sihirbaz durumunu yazar (sürüm, 409). Bütçe adımında dönem ve
   * toplam da değişebilir; değişirse KAYITLI KAMPANYALAR SİLİNİR ve İnceleme
   * planı yeniden kurar. Eski bütçeye göre kurulmuş kalemleri bırakmak,
   * toplamı aşan ya da dönem dışına taşan bir planı sessizce taşımak olurdu.
   * Ekran bunu Devam'dan ÖNCE söylüyor. Taslak/revizyon plan hiç onaylanmadığı
   * için aktarılmış kalem taşıyamaz (aktarım yalnız onaylı planda).
   *
   * Onaylanan kitle tarifi ("Bu tarif doğru, kullan") belgenin "Kitle ve
   * bölge" metni olur, kaynak `ajans` + kim + zaman: onay kutusu "Kullan"ın
   * kendisi.
   */
  async sihirbazKaydet(ctx: TenantContext, id: string, girdi: StratejiSihirbazKaydetGirdisi): Promise<StratejiDetayi> {
    return this.tx(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      const donem = girdi.donem ? stratejiDonemi(girdi.donem.baslangicAyi, girdi.donem.sureAy) : { baslangic: p.baslangic!, bitis: p.bitis! };
      const toplam = girdi.toplamButce !== undefined ? tutarCoz(girdi.toplamButce, p.para_birimi, 'Toplam bütçe') : BigInt(p.toplam_butce_micros);
      if (toplam <= 0n) throw new BadRequestException('Toplam bütçe sıfırdan büyük olmalı.');
      const degisti = donem.baslangic !== p.baslangic || donem.bitis !== p.bitis || toplam !== BigInt(p.toplam_butce_micros);
      if (degisti) {
        const [cakisan] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM strateji_planlari
           WHERE client_id = ${p.client_id}::uuid AND bicim = 2 AND durum = 'onaylandi' AND id <> ${p.id}::uuid
             AND baslangic <= ${donem.bitis}::date AND bitis >= ${donem.baslangic}::date`);
        if ((cakisan?.n ?? 0) > 0) throw new ConflictException('Bu dönemle çakışan onaylı bir strateji var; önce onu kapatın.');
        await tx.$queryRaw(Prisma.sql`DELETE FROM strateji_kalemleri WHERE plan_id = ${p.id}::uuid AND rehber_id IS NULL RETURNING id`);
        await tx.$queryRaw(Prisma.sql`
          UPDATE strateji_planlari SET baslangic = ${donem.baslangic}::date, bitis = ${donem.bitis}::date,
                 donem = ${donem.baslangic.slice(0, 7)}, toplam_butce_micros = ${toplam}::bigint, riskler = '[]'::jsonb
           WHERE id = ${p.id}::uuid RETURNING id`);
      }
      const s = { ...girdi.sihirbaz, incelenen: degisti ? null : girdi.sihirbaz.incelenen };
      await tx.$queryRaw(Prisma.sql`UPDATE strateji_planlari SET sihirbaz = ${JSON.stringify(s)}::jsonb WHERE id = ${p.id}::uuid RETURNING id`);
      if (s.kitle?.onaylandi) {
        const mevcut = (p.bolumler && typeof p.bolumler === 'object' ? { ...(p.bolumler as Record<string, unknown>) } : {}) as Record<string, KaynakliMetin | undefined>;
        if (mevcut.kitle?.metin !== s.kitle.metin || mevcut.kitle?.kaynak !== 'ajans') {
          mevcut.kitle = damgala({ metin: s.kitle.metin, kaynak: 'ajans' }, ctx, this.simdi().toISOString());
          await tx.$queryRaw(Prisma.sql`UPDATE strateji_planlari SET bolumler = ${JSON.stringify(mevcut)}::jsonb WHERE id = ${p.id}::uuid RETURNING id`);
        }
      }
      await surumArttir(tx, p.id);
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /** "Kime anlatıyoruz" önerisi. YAZMAZ: tarif kullanıcı onaylayınca `sihirbazKaydet` ile yazılır. */
  async kitleOner(ctx: TenantContext, id: string, girdi: KitleOnerGirdisi): Promise<StratejiKitleOnerisi> {
    const p = await this.tx(ctx, async (tx) => {
      const x = await planOku(tx, ctx, id, false);
      if (!stratejiDuzenlenebilirMi(x.durum as StratejiDurumu)) throw new ConflictException('Yalnız taslak ya da revizyondaki stratejiye öneri alınır.');
      return x;
    });
    const g = await this.girdiOku(ctx, p);
    const amaclar = sihirbazOku(p.sihirbaz)?.amaclar ?? [];
    return kitleTarifiUret(this.yz, aiGirdisiKur(g, amaclar, null), girdi.yeniden ? (girdi.onceki ?? null) : null);
  }

  /**
   * İnceleme adımının TEK satırı. Her parça gerçek bir okuma ve alt metni
   * okunan veriden (sayılar hesabın kendi verisi; uydurma yok). Okunamayan
   * parça `bilinmiyor` ve okumanın mesajıyla döner; panel satırda yazar.
   */
  async inceleme(ctx: TenantContext, id: string, parca: StratejiIncelemeParcasi): Promise<StratejiIncelemeSatiri> {
    const p = await this.tx(ctx, (tx) => planOku(tx, ctx, id, false));
    const amaclar = sihirbazOku(p.sihirbaz)?.amaclar ?? [];
    if (parca === 'olcum') {
      const olcum = await this.olcumOku(ctx, p.client_id);
      const h = olcumHaritasi(olcum);
      if (!olcum) return { parca, durum: 'bilinmiyor', ozet: h.hatalar[0] ?? 'Ölçüm durumu okunamadı.', uyari: true };
      const satirlar: string[] = [];
      let eksik = false;
      for (const amac of amaclar) {
        const tur = amacOlcumTuru(amac);
        if (!tur) continue;
        const hucre = h.harita[tur];
        const metin = REHBER_PLATFORMLARI.map((pl) => {
          const v = hucre?.[pl];
          if (v === false) eksik = true;
          return `${pl === 'meta' ? 'Meta' : 'Google'} ${v === true ? 'sayıyor' : v === false ? 'saymıyor' : 'bilinmiyor'}`;
        }).join(', ');
        satirlar.push(`${OLCUM_TURU_ADLARI[tur].ad}: ${metin}`);
      }
      if (satirlar.length === 0) return { parca, durum: 'hazir', ozet: 'Seçilen hedefler ölçüm gerektirmiyor (ziyaret, izlenme, erişim platformda sayılır).', uyari: false };
      return { parca, durum: eksik ? 'eksik' : 'hazir', ozet: satirlar.join(' · '), uyari: eksik };
    }
    return this.tx(ctx, async (tx) => {
      if (parca === 'marka') {
        const m = await markaOku(tx, p.client_id);
        if (!m?.profil_var) return { parca, durum: 'bos', ozet: 'Marka profili kurulmamış; metinler genel yazılır.', uyari: true };
        const bos = [!m.sektor && 'sektör', !(m.urunler ?? []).length && 'ürünler', !(m.vaatler ?? []).length && 'vaatler', !m.hedef_kitle && 'hedef kitle'].filter((x): x is string => !!x);
        const ozet = [m.sektor, (m.urunler ?? []).slice(0, 3).join(', ') || null, (m.vaatler ?? [])[0] ?? null].filter(Boolean).join(' · ');
        return { parca, durum: bos.length ? 'eksik' : 'hazir', ozet: [ozet || null, bos.length ? `Boş: ${bos.join(', ')}` : null].filter(Boolean).join(' · '), uyari: bos.length > 0 };
      }
      if (parca === 'site') {
        const siteYok = await siteYokBeyaniVarMi(tx, p.client_id);
        if (siteYok) return { parca, durum: 'hazir', ozet: '"Web sitemiz yok" dendi; siteye yönlendiren hedefler plana alınmaz.', uyari: false };
        const m = await markaOku(tx, p.client_id);
        const t = await siteTaramasiOku(tx, p.client_id);
        if (!m?.website) return { parca, durum: 'eksik', ozet: 'Site adresi girilmedi.', uyari: true };
        return { parca, durum: 'hazir', ozet: [alanAdi(m.website), t ? `Tarama: ${t.baslik}` : 'Site henüz taranmadı'].join(' · '), uyari: false };
      }
      if (parca === 'meta' || parca === 'google') {
        const pencere = tahminPenceresi(istanbulBugun(this.simdi()));
        const g = await gecmisOku(tx, p.client_id, p.para_birimi, pencere);
        const belge = belgeGecmisi(g, pencere);
        const satirlar = belge.satirlar.filter((s) => s.platform === parca);
        if (!g.hesapVar) return { parca, durum: 'bos', ozet: 'İzlenen reklam hesabı yok; beklenen sonuç gösterilmez.', uyari: false };
        if (satirlar.length === 0) return { parca, durum: 'bos', ozet: `Son ${belge.gun} günde bu platformda harcama yok; tahmin yapılmaz.`, uyari: false };
        const enBuyuk = [...satirlar].sort((a, b) => (BigInt(b.harcamaMicros) > BigInt(a.harcamaMicros) ? 1 : -1)).slice(0, 2);
        const ozet = enBuyuk
          .map((s) => `${s.etiket}: ${tutarGoster(BigInt(s.harcamaMicros), p.para_birimi)}${s.sonuc !== null ? `, ${Math.round(s.sonuc).toLocaleString('tr-TR')} ${s.birim}` : ''}`)
          .join(' · ');
        return { parca, durum: 'hazir', ozet: `Son ${belge.gun} gün · ${ozet}${satirlar.length > enBuyuk.length ? ` · ${satirlar.length - enBuyuk.length} satır daha` : ''}`, uyari: false };
      }
      // kelime
      const k = await kelimeleriOku(tx, p);
      const aramaGerekir = amaclar.some((a) => REHBER_AMACLARI[a].google.kurgu === 'ARAMA');
      const secili = k.satirlar.filter((s) => s.secili);
      if (secili.length > 0) {
        const hacim = secili.reduce((t, s) => t + (s.aylikArama ?? 0), 0);
        return { parca, durum: 'hazir', ozet: `${secili.length} kelime seçili · ayda yaklaşık ${hacim.toLocaleString('tr-TR')} arama`, uyari: false };
      }
      if (!aramaGerekir) return { parca, durum: 'hazir', ozet: 'Seçilen hedeflerde Google Arama kampanyası yok; kelime gerekmez.', uyari: false };
      return { parca, durum: 'bos', ozet: 'Henüz kelime aranmadı; Plan adımında Google Arama kampanyasının içinden aranır.', uyari: true };
    });
  }

  // ── Kalemler ve bölümler ─────────────────────────────────────────────

  /**
   * Kalemler TEK SEFERDE. Kimlik KORUNUR (upsert): planda olan kimlik
   * güncellenir, olmayan YENİ kalem olur (öneriden gelen geçici kimlik dahil),
   * listede olmayan silinir. Tahmin, kaynak ve riskler SUNUCUDA hesaplanır
   * (istemci yazamaz); ölçüm ve asgari transaction DIŞINDA okunur.
   */
  async kalemleriKaydet(ctx: TenantContext, id: string, girdi: StratejiKalemleriKaydetGirdisi): Promise<StratejiDetayi> {
    const p0 = await this.tx(ctx, (tx) => yazmaKapisi(tx, ctx, id, girdi.surum));
    // Platform okumaları ÖNDE (transaction dışı): asgari ve ölçüm risk için.
    const [olcum, hazirlik] = await Promise.all([this.olcumOku(ctx, p0.client_id), this.hazirlikOku(ctx, p0.client_id, false)]);
    const g = await this.girdiOku(ctx, p0);
    const sonuc = await this.tx(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      const donem = { baslangic: p.baslangic!, bitis: p.bitis! };
      const mevcut = await kalemSatirlari(tx, p.id, p.client_id);
      const mevcutIdler = new Set(mevcut.map((k) => k.id));
      const kalemler = girdi.kalemler.map((k, i) => {
        const tarih = kalemTarihHatasi(k, donem);
        if (tarih) throw new BadRequestException(`Kampanya ${i + 1}: ${tarih}`);
        return { ...k, butceMicros: tutarCoz(k.butce, p.para_birimi, `Kampanya ${i + 1} bütçesi`) };
      });
      const toplam = kalemler.reduce((t, k) => t + k.butceMicros, 0n);
      if (toplam > BigInt(p.toplam_butce_micros)) {
        throw new BadRequestException(`Kampanyaların toplamı stratejinin bütçesini ${tutarGoster(toplam - BigInt(p.toplam_butce_micros), p.para_birimi)} aşıyor.`);
      }
      // AYNI WORKSPACE (RLS'e ek): "tüm şirketler" modunda RLS kardeş şirketin görselini de gösterir.
      const varliklar = [...new Set(kalemler.flatMap((k) => k.varlikIdleri))];
      if (varliklar.length) {
        const [r] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM assets WHERE id = ANY(${varliklar}::uuid[]) AND client_id = ${p.client_id}::uuid`);
        if ((r?.n ?? 0) !== varliklar.length) throw new BadRequestException('Seçilen görsellerden biri bu workspace’e ait değil ya da silinmiş.');
      }
      const zaman = this.simdi().toISOString();
      const yeniIdler = new Set(kalemler.map((k) => k.id).filter((x): x is string => !!x));
      const silinecek = mevcut.filter((k) => !yeniIdler.has(k.id)).map((k) => k.id);
      if (silinecek.length) {
        await tx.$queryRaw(Prisma.sql`DELETE FROM strateji_kalemleri WHERE plan_id = ${p.id}::uuid AND id = ANY(${silinecek}::uuid[]) RETURNING id`);
      }
      const eskiKaynak = new Map(mevcut.map((k) => [k.id, k]));
      for (const [i, k] of kalemler.entries()) {
        const tahmin = kalemTahminleri(k, p.para_birimi, g.gecmis);
        const eski = k.id ? eskiKaynak.get(k.id) : undefined;
        const kaynaklar = kaynakBirlestir(eski?.kaynaklar, eski ? kalemGirdisi(eski) : null, k);
        const metin = (m: { metin: string; kaynak: 'ai' | 'ajans' } | null) => (m ? JSON.stringify(damgala(m, ctx, zaman)) : null);
        const degerler = Prisma.sql`
          ${i + 1}::smallint, ${k.amac}, ${k.meta}, ${k.google}, ${k.metaPayi}::smallint, ${k.butceMicros}::bigint,
          ${k.baslangic}::date, ${k.bitis}::date, ${JSON.stringify(k.konumlar)}::jsonb, ${k.yasMin}::smallint, ${k.yasMax}::smallint,
          ${k.metin ? JSON.stringify(k.metin) : null}::jsonb, ${metin(k.kreatifYonergesi)}::jsonb, ${metin(k.kitleTarifi)}::jsonb,
          ${k.kelimeGrubu}, ${k.varlikIdleri}::uuid[], ${JSON.stringify(tahmin)}::jsonb, ${JSON.stringify(kaynaklar)}::jsonb, ${k.not ?? null}`;
        if (k.id && mevcutIdler.has(k.id)) {
          await tx.$queryRaw(Prisma.sql`
            UPDATE strateji_kalemleri SET
              (sira, amac, meta_acik, google_acik, meta_payi, butce_micros, baslangic, bitis, konumlar, yas_min, yas_max,
               metin, kreatif_yonergesi, kitle_tarifi, kelime_grubu, varlik_idleri, tahmin, kaynaklar, notu)
              = (${degerler}), updated_at = now()
             WHERE id = ${k.id}::uuid AND plan_id = ${p.id}::uuid RETURNING id`);
        } else {
          await tx.$queryRaw(Prisma.sql`
            INSERT INTO strateji_kalemleri
              (id, plan_id, org_id, client_id, sira, amac, meta_acik, google_acik, meta_payi, butce_micros, baslangic, bitis, konumlar,
               yas_min, yas_max, metin, kreatif_yonergesi, kitle_tarifi, kelime_grubu, varlik_idleri, tahmin, kaynaklar, notu)
            VALUES (${k.id ?? randomUUID()}::uuid, ${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${degerler})
            RETURNING id`);
        }
      }
      const yeniKalemler = (await belgeOku(tx, p, false)).kalemler;
      const riskler = riskHesapla(yeniKalemler, {
        harita: olcumHaritasi(olcum).harita,
        hesap: { meta: hazirlik.hesaplar.length > 0, google: hazirlik.googleHesaplari.length > 0 },
        asgari: {
          meta: hazirlik.asgariGunluk.meta === null ? null : BigInt(hazirlik.asgariGunluk.meta),
          googleTalepYaratma: hazirlik.asgariGunluk.googleTalepYaratma === null ? null : BigInt(hazirlik.asgariGunluk.googleTalepYaratma),
        },
        ozelKategori: ozelKategoriVar({ marka: g.marka, hazirlik }),
        paraBirimi: p.para_birimi,
      });
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET riskler = ${JSON.stringify(riskler)}::jsonb, olcum_ozeti = ${JSON.stringify(olcumOzeti(olcum))}::jsonb
         WHERE id = ${p.id}::uuid RETURNING id`);
      await surumArttir(tx, p.id);
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
    return sonuc;
  }

  async bolumleriKaydet(ctx: TenantContext, id: string, girdi: BolumlerGovdesi): Promise<StratejiDetayi> {
    return this.tx(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      const zaman = this.simdi().toISOString();
      const mevcut = (p.bolumler && typeof p.bolumler === 'object' ? { ...(p.bolumler as Record<string, unknown>) } : {}) as Record<string, unknown>;
      for (const [kod, m] of Object.entries(girdi.bolumler) as Array<[StratejiBolumKodu, { metin: string; kaynak: 'ai' | 'ajans' } | null]>) {
        if (m === null) delete mevcut[kod];
        else mevcut[kod] = damgala(m, ctx, zaman);
      }
      await tx.$queryRaw(Prisma.sql`UPDATE strateji_planlari SET bolumler = ${JSON.stringify(mevcut)}::jsonb WHERE id = ${p.id}::uuid RETURNING id`);
      await surumArttir(tx, p.id);
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /**
   * Kalemin reklam metni — REHBERİN metin motoru (`metinOnerAlanlardan`),
   * ikinci bir motor değil. Kalem rehber alanlarına çevrilip verilir. YAZMAZ.
   */
  async kalemMetinOner(ctx: TenantContext, id: string, kalemId: string, istek: MetinOnerIstegi = {}): Promise<KalemMetinOnerisi> {
    const { p, k } = await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      const k = (await kalemSatirlari(tx, p.id, p.client_id)).find((x) => x.id === kalemId);
      if (!k) throw new NotFoundException('Kampanya bu stratejide yok');
      return { p, k };
    });
    const g = kalemGirdisi(k);
    const alanlar = kalemdenRehberAlanlari(
      g,
      { tur: 'aktarilabilir', platformlar: { meta: g.meta, google: g.google }, dusenler: [] },
      { kim: ctx.userId, zaman: this.simdi().toISOString(), bugun: istanbulBugun(this.simdi()), kelimeler: [] },
    ).alanlar;
    const r = await this.rehber.metinOnerAlanlardan(ctx, { id: `strateji-kalem:${k.id}`, client_id: p.client_id, org_id: p.org_id }, alanlar, istek);
    return { anaMetin: r.anaMetin, basliklar: r.basliklar, aciklamalar: r.aciklamalar, kaynak: 'ai', notlar: r.notlar };
  }

  // ── Kelimeler (v1 ile aynı tablo ve kuyruk) ──────────────────────────

  async kelimeAra(ctx: TenantContext, id: string, girdi: KelimeAraGirdisi): Promise<StratejiDetayi> {
    const tohumlar = [...new Set(girdi.tohumlar.map((t) => t.trim()).filter(Boolean))];
    const aramaId = randomUUID();
    await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!stratejiDuzenlenebilirMi(p.durum as StratejiDurumu)) throw new ConflictException('Bu strateji artık düzenlenemez.');
      const [a] = await tx.$queryRaw<Array<{ kelime_arama: string; kelime_arama_zamani: Date | null }>>(Prisma.sql`
        SELECT kelime_arama, kelime_arama_zamani FROM strateji_planlari WHERE id = ${p.id}::uuid`);
      const suruyor = (a?.kelime_arama === 'kuyrukta' || a?.kelime_arama === 'calisiyor') && Date.now() - new Date(a.kelime_arama_zamani ?? 0).getTime() < KELIME_ARAMA_ZAMAN_ASIMI_DK * 60_000;
      if (suruyor) throw new ConflictException('Bu stratejide bir kelime araması zaten sürüyor.');
      // Ön koşul PLATFORM ÇAĞRISINDAN ÖNCE (sıfır çağrıyla ret).
      if (!(await kelimeHesabi(tx, p.client_id))) {
        throw new BadRequestException('Bu workspace’e atanmış Google Ads hesabı yok. Kelime araması için önce bir Google Ads hesabı atayın.');
      }
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET kelime_arama = 'kuyrukta', kelime_arama_zamani = now(), kelime_son_hata = NULL, kelime_arama_id = ${aramaId}::uuid
         WHERE id = ${p.id}::uuid RETURNING id`);
    });
    try {
      await this.kuyruk.ekle({ planId: id, aramaId, tohumlar });
    } catch (e) {
      this.logger.error(`Kelime araması kuyruğa alınamadı (plan ${id}): ${e instanceof Error ? e.message : String(e)}`);
      await this.tx(ctx, (tx) =>
        tx.$queryRaw(Prisma.sql`
          UPDATE strateji_planlari SET kelime_arama = 'hata', kelime_son_hata = ${KUYRUK_HATASI}
           WHERE id = ${id}::uuid AND kelime_arama_id = ${aramaId}::uuid RETURNING id`),
      );
      throw new ServiceUnavailableException('Kelime araması şu an başlatılamadı. Biraz sonra yeniden deneyin.');
    }
    return this.detay(ctx, id);
  }

  async kelimeGuncelle(ctx: TenantContext, id: string, girdi: KelimeGuncelleGirdisi): Promise<StratejiDetayi> {
    const idler = girdi.satirlar.map((s) => s.id);
    if (new Set(idler).size !== idler.length) throw new BadRequestException('Aynı kelime iki kez gönderildi.');
    return this.tx(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      let n = 0;
      for (const s of girdi.satirlar) {
        const grupVar = s.grup !== undefined;
        const r = await tx.$queryRaw<unknown[]>(Prisma.sql`
          UPDATE strateji_kelimeleri
             SET secili = COALESCE(${s.secili ?? null}::boolean, secili),
                 grup = CASE WHEN ${grupVar}::boolean THEN ${s.grup ?? null} ELSE grup END,
                 grup_elle = CASE WHEN ${grupVar}::boolean THEN ${s.grup != null}::boolean ELSE grup_elle END
           WHERE id = ${s.id}::uuid AND plan_id = ${p.id}::uuid RETURNING id`);
        n += r.length;
      }
      // Sayı tutmuyorsa bir kimlik bu planda değil: sessizce atlamak seçimi yutardı.
      if (n !== girdi.satirlar.length) throw new BadRequestException('Gönderilen kelimelerden biri bu stratejide yok; sayfayı yenileyin.');
      await surumArttir(tx, p.id);
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  // ── Durum makinesi ───────────────────────────────────────────────────

  async eylem(ctx: TenantContext, id: string, girdi: StratejiEylemGirdisi): Promise<StratejiDetayi> {
    if (girdi.eylem === 'onaya_gonder') return this.onayaGonder(ctx, id, girdi.surum);
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!stratejiGecisMumkunMu(p.durum as StratejiDurumu, girdi.eylem)) throw new ConflictException(gecisMesaji(p.durum as StratejiDurumu));
      if (p.surum !== girdi.surum) throw new ConflictException(SURUM_MESAJI);
      // `geri_cek` sürümü ARTIRIR: düzenlemeye dönen belge yeni bir belge;
      // eski sürüme gönderilmiş onay bağlantısı ona karar yazamaz.
      const artis = girdi.eylem === 'geri_cek' ? 1 : 0;
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET durum = ${STRATEJI_GECISLERI[girdi.eylem].hedef}, surum = surum + ${artis}::int, updated_at = now()
         WHERE id = ${p.id}::uuid RETURNING id`);
      if (girdi.eylem === 'iptal' || girdi.eylem === 'geri_cek') {
        // Açık onay bağlantısı ölü: iptal edilmiş/geri çekilmiş belgeye karar yazılmasın.
        await tx.$queryRaw(Prisma.sql`
          UPDATE strateji_onay_baglantilari SET iptal_at = now()
           WHERE plan_id = ${p.id}::uuid AND iptal_at IS NULL AND kullanildi_at IS NULL RETURNING id`);
      }
      await this.audit.record(tx as never, ctx, { action: `strateji.${girdi.eylem}`, targetType: 'strateji_plani', targetId: p.id, clientId: p.client_id });
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /**
   * ═══ STRATEJİ SİLME (kullanıcı kararı 2026-10-14: "Hepsi") ═══
   *
   * Eski karar "plan silinmez, iptal edilir" idi; gerekçe müşterinin neye
   * onay verdiğinin izi. Kullanıcı her stratejinin silinebilmesini istedi.
   * İz bu yüzden SİLMEDEN ÖNCE denetim kaydına yazılıyor: dönem, durum,
   * sürüm, onaylanan sürüm, onaylayan ve zamanı, toplam bütçe, kurulmuş
   * kampanya sayısı. Satır gidince geri getirilemez; kayıt "ne vardı"
   * sorusunu cevaplar.
   *
   * Alt tablolar (kalem, matris, dağılım, kelime, yorum, onay bağlantısı)
   * `ON DELETE CASCADE`; stratejiden kurulmuş rehber/oturum bağı
   * `SET NULL` ile kopuyor ve kurulmuş kampanyalara DOKUNULMUYOR. Eski
   * biçimdeki planlar (v1) da silinebiliyor (`v1Olur`).
   *
   * RETURNING ile satır sayılıyor: DELETE politikası tutmazsa silme hata
   * vermeden sıfır satır etkiler ve ekran "silindi" der (CLAUDE.md).
   */
  async sil(ctx: TenantContext, id: string): Promise<{ id: string }> {
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true, true);
      const [kurulan] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM strateji_kalemleri
         WHERE plan_id = ${p.id}::uuid AND client_id = ${p.client_id}::uuid AND rehber_id IS NOT NULL`);
      await this.audit.record(tx as never, ctx, {
        action: 'strateji.sil',
        targetType: 'strateji_plani',
        targetId: p.id,
        clientId: p.client_id,
        before: {
          bicim: p.bicim,
          donem: p.donem,
          baslangic: p.baslangic,
          bitis: p.bitis,
          durum: p.durum,
          surum: p.surum,
          onaylananSurum: p.onaylanan_surum,
          onaylayan: p.onaylayan_ad ?? p.onaylayan_eposta ?? p.onaylayan_user_id,
          onayZamani: p.onay_zamani ? new Date(p.onay_zamani).toISOString() : null,
          toplamButceMicros: p.toplam_butce_micros,
          paraBirimi: p.para_birimi,
          kurulanKampanya: kurulan?.n ?? 0,
        },
      });
      const r = await tx.$queryRaw<unknown[]>(Prisma.sql`
        DELETE FROM strateji_planlari WHERE id = ${p.id}::uuid AND client_id = ${p.client_id}::uuid RETURNING id`);
      if (r.length !== 1) throw new ForbiddenException('Strateji silinemedi: bu workspace’i değiştirme yetkin yok.');
      return { id: p.id };
    });
  }

  /**
   * Onaya gönderim: kalem yoksa ve bir kalemin amacı bu kullanıcıya açık
   * değilse ya da hiçbir platformu kurulamıyorsa (site yok) RET. Riskler ve
   * ölçüm bu anda tazelenir: müşterinin onaylayacağı belge BU hâl.
   */
  private async onayaGonder(ctx: TenantContext, id: string, surum: number): Promise<StratejiDetayi> {
    const p0 = await this.tx(ctx, (tx) => planOku(tx, ctx, id, false));
    const [olcum, hazirlik] = await Promise.all([this.olcumOku(ctx, p0.client_id), this.hazirlikOku(ctx, p0.client_id, false)]);
    const g = await this.girdiOku(ctx, p0);
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!stratejiGecisMumkunMu(p.durum as StratejiDurumu, 'onaya_gonder')) throw new ConflictException(gecisMesaji(p.durum as StratejiDurumu));
      if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
      const kalemler = (await kalemSatirlari(tx, p.id, p.client_id)).map(kalemGirdisi);
      if (kalemler.length === 0) throw new BadRequestException('Stratejide kampanya yok; onaya gönderilemez.');
      const ajansYon = await ajansYoneticisiMi(tx, ctx);
      const sorunlar: string[] = [];
      kalemler.forEach((k, i) => {
        const karar = kalemAktarimEngeli(k, {
          // Onay sorusunu sormadan kapıları denemek için "onaylı" varsayılıyor.
          plan: { durum: 'onaylandi', surum: 1, onaylananSurum: 1 },
          ajansYoneticisi: ajansYon,
          siteYok: g.siteYok,
          mevcutVarliklar: new Set(k.varlikIdleri),
          rehberId: null,
          bugun: '0000-01-01',
        });
        if (karar.tur === 'engel') sorunlar.push(`Kampanya ${i + 1}: ${KALEM_AKTARIM_ENGEL_METNI[karar.engel]}`);
      });
      if (sorunlar.length) throw new BadRequestException(sorunlar.join(' '));
      const riskler = riskHesapla((await belgeOku(tx, p, false)).kalemler, {
        harita: olcumHaritasi(olcum).harita,
        hesap: { meta: hazirlik.hesaplar.length > 0, google: hazirlik.googleHesaplari.length > 0 },
        asgari: {
          meta: hazirlik.asgariGunluk.meta === null ? null : BigInt(hazirlik.asgariGunluk.meta),
          googleTalepYaratma: hazirlik.asgariGunluk.googleTalepYaratma === null ? null : BigInt(hazirlik.asgariGunluk.googleTalepYaratma),
        },
        ozelKategori: ozelKategoriVar({ marka: g.marka, hazirlik }),
        paraBirimi: p.para_birimi,
      });
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET durum = 'onayda', riskler = ${JSON.stringify(riskler)}::jsonb,
               olcum_ozeti = ${JSON.stringify(olcumOzeti(olcum))}::jsonb, updated_at = now()
         WHERE id = ${p.id}::uuid RETURNING id`);
      await this.audit.record(tx as never, ctx, { action: 'strateji.onaya_gonder', targetType: 'strateji_plani', targetId: p.id, clientId: p.client_id });
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /** Panel içi onay (`strategy.approve`). Rol kayıtlı: müşteri hesabı ≠ ajans "müşteri adına". */
  async onayla(ctx: TenantContext, id: string, surum: number): Promise<StratejiDetayi> {
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!stratejiGecisMumkunMu(p.durum as StratejiDurumu, 'onayla')) throw new ConflictException(gecisMesaji(p.durum as StratejiDurumu));
      if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
      const rol = v2Rol(ctx);
      // "MÜŞTERİ ADINA ONAYLA" YALNIZ AJANS YÖNETİCİSİ (taslak, 2026-10-13):
      // onay müşterinin imzası yerine geçiyor ve AdvCampaign'e kurulumun
      // kapısını açıyor. Panel kartı yalnız yöneticiye gösteriyor; sunucu
      // da reddediyor (gizli düğme tek savunma olamaz). Kural rehberin
      // `deneme` kapısıyla AYNI fonksiyon (`ajansYoneticisiMi`).
      if (rol === 'ajans' && !(await ajansYoneticisiMi(tx, ctx))) {
        throw new ForbiddenException('Müşteri adına onayı yalnız ajans yöneticisi verebilir; stratejiyi müşteriye gönderin.');
      }
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET durum = 'onaylandi', onaylayan_user_id = ${ctx.userId}::uuid, onay_rolu = ${rol}, onay_zamani = now(),
               onaylanan_surum = surum, onaylayan_ad = NULL, onaylayan_eposta = NULL, updated_at = now()
         WHERE id = ${p.id}::uuid RETURNING id`);
      await yorumEkle(tx, p, { surum: p.surum, userId: ctx.userId, rol, tur: 'onay', metin: 'Onaylandı.', yazanAd: null, kalemId: null });
      await this.audit.record(tx as never, ctx, { action: 'strateji.onayla', targetType: 'strateji_plani', targetId: p.id, clientId: p.client_id, after: { rol, surum: p.surum } });
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /** Revizyon iste — yorum ZORUNLU (neden yazmadan revizyon ajansı tahmine bırakır). */
  async revizyon(ctx: TenantContext, id: string, girdi: StratejiRevizyonGirdisi): Promise<StratejiDetayi> {
    if (YORUM_ZORUNLU_EYLEMLER.includes('revizyon_iste') && !girdi.yorum.trim()) throw new BadRequestException('Ne değişmesi gerektiğini yazın.');
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!stratejiGecisMumkunMu(p.durum as StratejiDurumu, 'revizyon_iste')) throw new ConflictException(gecisMesaji(p.durum as StratejiDurumu));
      if (p.surum !== girdi.surum) throw new ConflictException(SURUM_MESAJI);
      // Başka bir planın kalemi bu plana not olarak yazılamaz (yorumYaz ile aynı kapı).
      if (girdi.kalemId && !(await kalemSatirlari(tx, p.id, p.client_id)).some((k) => k.id === girdi.kalemId)) {
        throw new BadRequestException('Kampanya bu stratejide yok');
      }
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_planlari SET durum = 'revizyon', revizyon_notu = ${girdi.yorum}, updated_at = now()
         WHERE id = ${p.id}::uuid RETURNING id`);
      await tx.$queryRaw(Prisma.sql`
        UPDATE strateji_onay_baglantilari SET iptal_at = now()
         WHERE plan_id = ${p.id}::uuid AND iptal_at IS NULL AND kullanildi_at IS NULL RETURNING id`);
      await yorumEkle(tx, p, { surum: p.surum, userId: ctx.userId, rol: v2Rol(ctx), tur: 'revizyon', metin: girdi.yorum, yazanAd: null, kalemId: girdi.kalemId ?? null });
      await this.audit.record(tx as never, ctx, { action: 'strateji.revizyon_iste', targetType: 'strateji_plani', targetId: p.id, clientId: p.client_id });
      return this.detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  // ── Yorumlar ─────────────────────────────────────────────────────────

  async yorumlar(ctx: TenantContext, id: string): Promise<StratejiYorumlari> {
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      return yorumlariOku(tx, p);
    });
  }

  /** Yorum: `approve` (müşteri) ya da `write` (ajans) izni; uç yalnız `read` istiyor. */
  async yorumYaz(ctx: TenantContext, id: string, girdi: YorumGovdesi): Promise<StratejiYorumlari> {
    if (!ctx.permissions.includes('strategy.approve') && !ctx.permissions.includes('strategy.write')) {
      throw new ForbiddenException('Yorum yazma yetkin yok');
    }
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (p.durum === 'iptal' || p.durum === 'kapandi') throw new ConflictException('Kapanmış stratejiye yorum yazılmaz.');
      if (girdi.kalemId) {
        const var_ = (await kalemSatirlari(tx, p.id, p.client_id)).some((k) => k.id === girdi.kalemId);
        if (!var_) throw new BadRequestException('Kampanya bu stratejide yok');
      }
      await yorumEkle(tx, p, { surum: girdi.surum, userId: ctx.userId, rol: v2Rol(ctx), tur: 'yorum', metin: girdi.metin, yazanAd: null, kalemId: girdi.kalemId ?? null });
      return yorumlariOku(tx, p);
    });
  }

  // ── Aktarım (kalem → rehber taslağı, § 4) ───────────────────────────

  private async aktarimBaglami(tx: Sorgucu, ctx: TenantContext, p: PlanSatiri) {
    // `catch` YOK: bu okuma aktarımın transaction'ında (bkz. `girdiOku`).
    const siteYok: boolean | null = await siteYokBeyaniVarMi(tx, p.client_id);
    return { ajansYoneticisi: await ajansYoneticisiMi(tx, ctx), siteYok, bugun: istanbulBugun(this.simdi()) };
  }

  async aktarimOnizleme(ctx: TenantContext, id: string): Promise<AktarimOnizlemesi> {
    const p0 = await this.tx(ctx, (tx) => planOku(tx, ctx, id, false));
    const hazirlik = await this.hazirlikOku(ctx, p0.client_id, false);
    return this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      const b = await this.aktarimBaglami(tx, ctx, p);
      const satirlar = await kalemSatirlari(tx, p.id, p.client_id);
      const mevcut = await mevcutVarliklar(tx, p.client_id, satirlar.flatMap((k) => k.varlik_idleri ?? []));
      return {
        kalemler: satirlar.map((k) => {
          const g = kalemGirdisi(k);
          const karar = kalemAktarimEngeli(g, { plan: planDurumu(p), ...b, mevcutVarliklar: mevcut, rehberId: k.rehber_id });
          const t = tamamlanacaklar(g, karar, hazirlik);
          return { kalemId: k.id, karar, rehberdeTamamlanacak: t.alanlar, notlar: t.notlar, rehberId: k.rehber_id };
        }),
      };
    });
  }

  /**
   * AKTAR — kalem başına KISA transaction: kalem `FOR UPDATE` kilitlenir,
   * kapı (`kalemAktarimEngeli`) koşar, rehber satırı rehberin KENDİ yazımıyla
   * (`rehberSatiriEkle`) açılır ve kalemin `rehber_id`si `WHERE rehber_id IS
   * NULL ... RETURNING` ile yazılır. Sıfır satır = yarışta başka istek
   * aktardı: transaction GERİ ALINIR (açılan rehber de), kalem "zaten
   * aktarıldı" sayılır. İkinci rehber açılmaz, arşivlenecek bir şey kalmaz.
   * Platform çağrısı YOK; Google konum eşlemesi rehber ekranında hesap
   * seçilince koşar (rehberin kendi akışı).
   */
  async aktar(ctx: TenantContext, id: string, girdi: StratejiAktarGirdisi): Promise<StratejiAktarimSonucu> {
    // AdvCampaign'in kendi kapısı: reklam kurma izni (uç yalnız strategy.write istiyor).
    if (!ctx.permissions.includes('bulk.write')) throw new ForbiddenException('AdvCampaign’de reklam kurma yetkin yok');
    const kalemIdleri = await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      if (p.surum !== girdi.surum) throw new ConflictException(SURUM_MESAJI);
      if (p.durum !== 'onaylandi' || p.onaylanan_surum !== p.surum) throw new BadRequestException(KALEM_AKTARIM_ENGEL_METNI.onaysiz);
      const tum = (await kalemSatirlari(tx, p.id, p.client_id)).map((k) => k.id);
      const istenen = girdi.kalemIdleri ?? tum;
      const yabanci = istenen.filter((k) => !tum.includes(k));
      if (yabanci.length) throw new BadRequestException('Seçilen kampanyalardan biri bu stratejide yok.');
      return istenen;
    });
    const sonuc: StratejiAktarimSonucu = { kalemler: [] };
    for (const kalemId of kalemIdleri) sonuc.kalemler.push(await this.kalemAktar(ctx, id, kalemId));
    const acilan = sonuc.kalemler.filter((k) => k.tur === 'acildi').length;
    const gercekEngel = sonuc.kalemler.filter((k) => k.tur === 'engel' && k.engel !== 'zaten_aktarildi');
    // BOŞ AKTARIM "AKTARILDI" SAYILMAZ (v1 kuralı): hiçbir kalem açılmadıysa ve
    // gerçek bir engel varsa 400 + nedenler. Hepsi zaten aktarılmışsa
    // tekrarlanan istek (idempotent) — 200 ve rehber kimlikleri.
    if (acilan === 0 && gercekEngel.length > 0) {
      throw new BadRequestException(gercekEngel.map((k) => (k.tur === 'engel' ? KALEM_AKTARIM_ENGEL_METNI[k.engel] : '')).join(' '));
    }
    return sonuc;
  }

  private async kalemAktar(ctx: TenantContext, planId: string, kalemId: string): Promise<StratejiAktarimSonucu['kalemler'][number]> {
    const ZATEN = Symbol('zaten');
    try {
      return await this.tx(ctx, async (tx) => {
        const p = await planOku(tx, ctx, planId, false);
        const [k] = await tx.$queryRaw<Array<Awaited<ReturnType<typeof kalemSatirlari>>[number]>>(Prisma.sql`
          SELECT ${KALEM_SUTUNLARI} FROM strateji_kalemleri k
           WHERE k.id = ${kalemId}::uuid AND k.plan_id = ${p.id}::uuid FOR UPDATE`);
        if (!k) throw new NotFoundException('Kampanya bu stratejide yok');
        const b = await this.aktarimBaglami(tx, ctx, p);
        const g = kalemGirdisi(k);
        const mevcut = await mevcutVarliklar(tx, p.client_id, g.varlikIdleri);
        const karar = kalemAktarimEngeli(g, { plan: planDurumu(p), ...b, mevcutVarliklar: mevcut, rehberId: k.rehber_id });
        if (karar.tur === 'engel') return { kalemId, tur: 'engel' as const, engel: karar.engel, notlar: [], rehberId: k.rehber_id };
        const kelimeler = g.kelimeGrubu
          ? await tx.$queryRaw<Array<{ metin: string; aylikArama: number | null }>>(Prisma.sql`
              SELECT kelime AS metin, aylik_arama::int AS "aylikArama" FROM strateji_kelimeleri
               WHERE plan_id = ${p.id}::uuid AND secili AND grup = ${g.kelimeGrubu}
               ORDER BY aylik_arama DESC NULLS LAST, kelime`)
          : [];
        const uretim = kalemdenRehberAlanlari(g, karar, { kim: ctx.userId, zaman: this.simdi().toISOString(), bugun: b.bugun, kelimeler });
        const { id: rehberId } = await rehberSatiriEkle(tx, ctx, p.client_id, uretim.alanlar);
        const yazilan = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE strateji_kalemleri SET rehber_id = ${rehberId}::uuid, aktaran_id = ${ctx.userId}::uuid, aktarim_zamani = now(), updated_at = now()
           WHERE id = ${kalemId}::uuid AND rehber_id IS NULL RETURNING id::text`);
        if (yazilan.length !== 1) throw ZATEN;
        await this.audit.record(tx as never, ctx, {
          action: 'strateji.aktarildi',
          targetType: 'strateji_kalemi',
          targetId: kalemId,
          clientId: p.client_id,
          after: { rehberId, notlar: uretim.notlar },
        });
        return { kalemId, tur: 'acildi' as const, rehberId, notlar: uretim.notlar };
      });
    } catch (e) {
      if (e === ZATEN) return { kalemId, tur: 'engel', engel: 'zaten_aktarildi', notlar: [], rehberId: null };
      throw e;
    }
  }

  // ── Gerçekleşen (§ 4.4) ──────────────────────────────────────────────

  async gerceklesen(ctx: TenantContext, id: string): Promise<Gerceklesen> {
    return this.tx(ctx, (tx) => gerceklesenKur(tx, this.simdi(), id, async () => planOku(tx, ctx, id, false)));
  }

  // ── PDF ve gönderim ──────────────────────────────────────────────────

  /**
   * PDF — SÜRÜM ZORUNLU: ekrandaki sürüm değiştiyse 409; eski sürümün PDF'i
   * sessizce yeni belge diye inmez. Veri transaction İÇİNDE, PDF DIŞINDA
   * üretiliyor (üretim saniyeler sürebilir; `withTenant` 5 sn). Müşteriye
   * giden belge görünümüyle (ajans notu ve onaylanmamış yapay zekâ metni yok).
   */
  async pdf(ctx: TenantContext, id: string, surum: number): Promise<{ bayt: Buffer; dosyaAdi: string }> {
    const veri = await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
      const [c] = await tx.$queryRaw<Array<{ slug: string }>>(Prisma.sql`SELECT slug FROM clients WHERE id = ${p.client_id}::uuid`);
      const belge = await belgeVerisiKur(tx, p, this.simdi());
      const durum = p.durum as StratejiDurumu;
      const gerc = durum === 'onaylandi' || durum === 'kapandi' ? await gerceklesenKur(tx, this.simdi(), p.id, async () => p) : null;
      return { p, belge, gerc, slug: c?.slug ?? 'workspace' };
    });
    const r = await stratejiPdf({ belge: veri.belge, gerceklesen: veri.gerc });
    if (r.yedegeDusen.length) this.logger.warn(`Strateji PDF ${id}: ${r.yedegeDusen.length} dizge yedek yazı tipiyle çizildi.`);
    await this.tx(ctx, (tx) => this.audit.record(tx as never, ctx, { action: 'strateji.pdf', targetType: 'strateji_plani', targetId: id, clientId: veri.p.client_id, after: { surum } }));
    return { bayt: r.bayt, dosyaAdi: stratejiDosyaAdi(veri.slug, veri.p.baslangic ?? veri.p.donem, veri.p.surum, veri.p.durum as StratejiDurumu) };
  }

  /**
   * Müşteriye gönder: PDF eki + (onaydaysa) girişsiz onay bağlantısı. Rapor
   * gönderim ÇEKİRDEĞİ (`RaporGonderService.ozetGonder`): imza, doğrulanmamış
   * kimlik reddi, kısmi ret aynı yerden. Bağlantının KÖKÜ `mail.appUrl`
   * (beyaz etiket alan adında `/strateji-onay` açılmıyor; panel middleware'i).
   */
  async gonder(ctx: TenantContext, id: string, girdi: GonderGovdesi, meta: { ip?: string | null; userAgent?: string | null }): Promise<GonderimSonucu> {
    if (!ctx.permissions.includes('report.share')) throw new ForbiddenException('Stratejiyi müşteriye gönderme yetkin yok');
    const g = { alicilar: [], onayBaglantisi: true, ...girdi };
    const { p, workspace } = await this.tx(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      if (p.surum !== g.surum) throw new ConflictException(SURUM_MESAJI);
      return { p, workspace: p.workspace_adi ?? '' };
    });
    if (g.onayBaglantisi && p.durum !== 'onayda') throw new BadRequestException('Onay bağlantısı yalnız onay bekleyen stratejiye eklenir; önce onaya gönderin ya da bağlantısız gönderin.');
    // SIRA (Ajan 4): PDF bağlantıdan ÖNCE. Yeni bağlantı açık olanı İPTAL
    // ediyor; PDF üretimi düşerse (yazı tipi, veri) müşterinin elindeki
    // çalışan bağlantı, hiç gönderilmeyen bir bağlantı uğruna ölmüş olurdu.
    const { bayt, dosyaAdi } = await this.pdf(ctx, id, g.surum);
    let baglanti: GonderimSonucu['baglanti'] = null;
    let yol: string | null = null;
    if (g.onayBaglantisi) {
      const b = await this.baglantilar.olustur(ctx, id, { surum: g.surum, sureGun: g.sureGun ?? 14 });
      baglanti = b.baglanti;
      yol = b.yol;
    }
    const kok = this.config.mail.appUrl.replace(/\/+$/, '');
    const panel = `${kok}${stratejiPanelAdresi({ musteri: p.client_id, plan: p.id, adim: 'rapor' })}`;
    const varsayilan = [
      `<p>Merhaba,</p>`,
      `<p>${kacis(workspace)} için hazırladığımız dijital reklam stratejisi ektedir.</p>`,
      yol ? `<p>Panele girmeden okuyup onaylamak ya da değişiklik istemek için: <a href="${kok}${yol}">${kok}${yol}</a></p>` : '',
      `<p>Panelden görmek için: <a href="${panel}">${panel}</a></p>`,
    ].join('');
    const govde = g.html ? `${imzaTemizle(g.html).html}${yol ? `<p><a href="${kok}${yol}">Stratejiyi onaylayın ya da revizyon isteyin</a></p>` : ''}` : varsayilan;
    const r = await this.gonderici.ozetGonder(ctx, {
      clientId: p.client_id,
      toEmails: g.alicilar,
      konu: g.konu ?? `Dijital reklam stratejisi · ${workspace}`,
      html: govde,
      yalnizKendine: false,
      ekler: [{ filename: dosyaAdi, content: bayt, contentType: 'application/pdf' }],
    });
    await this.tx(ctx, (tx) =>
      this.audit.record(tx as never, ctx, {
        action: 'strateji.gonderildi',
        targetType: 'strateji_plani',
        targetId: id,
        clientId: p.client_id,
        after: { to: r.to, reddedilen: r.reddedilen, surum: g.surum, baglantiId: baglanti?.id ?? null },
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      }),
    );
    return { kabul: r.to, ret: r.reddedilen, baglanti };
  }

  // ── Rehberin "Stratejiden" kutusu ────────────────────────────────────

  async rehberStratejisi(ctx: TenantContext, rehberId: string): Promise<RehberinStratejisi | null> {
    return this.tx(ctx, async (tx) => {
      const [r] = await tx.$queryRaw<Array<{ plan_id: string; client_id: string; baslangic: string; bitis: string; sira: number; amac: StratejiKalemi['amac']; kreatif_yonergesi: unknown; kitle_tarifi: unknown }>>(Prisma.sql`
        SELECT k.plan_id::text, k.client_id::text, to_char(p.baslangic, 'YYYY-MM-DD') AS baslangic, to_char(p.bitis, 'YYYY-MM-DD') AS bitis,
               k.sira::int AS sira, k.amac, k.kreatif_yonergesi, k.kitle_tarifi
          FROM strateji_kalemleri k JOIN strateji_planlari p ON p.id = k.plan_id AND p.client_id = k.client_id
         WHERE k.rehber_id = ${rehberId}::uuid`);
      if (!r || !ctx.clientIds.includes(r.client_id)) return null;
      const metin = (h: unknown): KaynakliMetin | null => {
        const m = h as KaynakliMetin | null;
        // Yalnız belgeye giren hâl: "Kullan" denmemiş yapay zekâ önerisi kutuda yok.
        return m && typeof m.metin === 'string' && m.kaynak !== 'ai' ? m : null;
      };
      return { planId: r.plan_id, clientId: r.client_id, baslangic: r.baslangic, bitis: r.bitis, sira: r.sira, amac: r.amac, kreatifYonergesi: metin(r.kreatif_yonergesi), kitleTarifi: metin(r.kitle_tarifi) };
    });
  }

}

// ── Yardımcılar ───────────────────────────────────────────────────────

const ACIK_PLAN_MESAJI = 'Bu workspace’te açık bir strateji zaten var. Yeni strateji için önce onu onaylatın ya da iptal edin.';

function gecisMesaji(durum: StratejiDurumu): string {
  const ad: Record<StratejiDurumu, string> = {
    taslak: 'Taslaktaki',
    onayda: 'Onaydaki',
    revizyon: 'Revizyondaki',
    onaylandi: 'Onaylanmış',
    kapandi: 'Kapanmış',
    iptal: 'İptal edilmiş',
  };
  return `${ad[durum] ?? 'Bu'} strateji için bu işlem yapılamaz.`;
}

function kacis(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function planDurumu(p: PlanSatiri) {
  return { durum: p.durum as StratejiDurumu, surum: p.surum, onaylananSurum: p.onaylanan_surum };
}

function bosKelimeler(): PlanDetayi['kelimeler'] {
  return { erisim: 'olculmedi', satirlar: [], gosterilen: 0, toplam: 0, aramaSuruyor: false, sonHata: null };
}

async function kelimeleriOku(tx: Sorgucu, p: PlanSatiri): Promise<PlanDetayi['kelimeler']> {
  const [d] = await tx.$queryRaw<Array<{ kelime_erisim: PlanDetayi['kelimeler']['erisim'] | null; kelime_arama: string; kelime_arama_zamani: Date | null; kelime_son_hata: string | null; kelime_toplam: number | null }>>(Prisma.sql`
    SELECT kelime_erisim, kelime_arama, kelime_arama_zamani, kelime_son_hata, kelime_toplam FROM strateji_planlari WHERE id = ${p.id}::uuid`);
  const kr = await tx.$queryRaw<Array<{ id: string; kelime: string; aylik_arama: string | null; rekabet: KelimeSatiri['rekabet']; teklif_alt_micros: string | null; teklif_ust_micros: string | null; varyantlar: string[]; grup: string | null; grup_elle: boolean; secili: boolean; cekim_zamani: Date }>>(Prisma.sql`
    SELECT id::text, kelime, aylik_arama::text, rekabet, teklif_alt_micros::text, teklif_ust_micros::text,
           varyantlar, grup, grup_elle, secili, cekim_zamani
      FROM strateji_kelimeleri WHERE plan_id = ${p.id}::uuid
     ORDER BY secili DESC, aylik_arama DESC NULLS LAST, kelime`);
  const satirlar: KelimeSatiri[] = kr.map((k) => ({
    id: k.id,
    kelime: k.kelime,
    aylikArama: k.aylik_arama === null ? null : Number(k.aylik_arama),
    rekabet: k.rekabet,
    teklifAltMicros: k.teklif_alt_micros,
    teklifUstMicros: k.teklif_ust_micros,
    varyantlar: k.varyantlar ?? [],
    grup: k.grup,
    grupElle: k.grup_elle,
    secili: k.secili,
    cekimZamani: new Date(k.cekim_zamani).toISOString(),
  }));
  const suruyor =
    (d?.kelime_arama === 'kuyrukta' || d?.kelime_arama === 'calisiyor') && Date.now() - new Date(d.kelime_arama_zamani ?? 0).getTime() < KELIME_ARAMA_ZAMAN_ASIMI_DK * 60_000;
  const takildi = !suruyor && (d?.kelime_arama === 'kuyrukta' || d?.kelime_arama === 'calisiyor');
  return {
    erisim: d?.kelime_erisim ?? 'var',
    satirlar,
    gosterilen: satirlar.length,
    toplam: Math.max(d?.kelime_toplam ?? 0, satirlar.length),
    aramaSuruyor: suruyor,
    sonHata: d?.kelime_arama === 'hata' ? d.kelime_son_hata : takildi ? `Arama ${KELIME_ARAMA_ZAMAN_ASIMI_DK} dakikadır yanıt vermedi. Yeniden deneyin.` : null,
  };
}

/**
 * Workspace'in para birimi ya da çözülememesinin NEDENİ. Fırlatmıyor: sihirbazın
 * girdileri bunu ekranda söylüyor, plan oluşturma (`workspaceParaBirimi`) aynı
 * cümleyle reddediyor. Transaction içinde `catch` gerekmiyor.
 */
async function paraBirimiDurumu(tx: Sorgucu, clientId: string): Promise<{ para: string | null; hata: string | null }> {
  const birimler = await tx.$queryRaw<Array<{ currency: string }>>(Prisma.sql`
    SELECT DISTINCT currency FROM ad_accounts
     WHERE client_id = ${clientId}::uuid AND platform IN ('meta'::"Platform", 'google'::"Platform") ORDER BY currency`);
  if (birimler.length === 0) return { para: null, hata: 'Bu workspace’e atanmış Meta ya da Google hesabı yok. Para birimini seçin.' };
  // Kur çevrimi yok: 1 USD + 1 TRY toplanamaz. Tahmin etmek yerine sor.
  if (birimler.length > 1) return { para: null, hata: `Workspace hesapları farklı para birimleri kullanıyor (${birimler.map((b) => b.currency).join(', ')}). Para birimini seçin.` };
  return { para: birimler[0]!.currency, hata: null };
}

async function workspaceParaBirimi(tx: Sorgucu, clientId: string): Promise<string> {
  const d = await paraBirimiDurumu(tx, clientId);
  if (d.para === null) throw new BadRequestException(d.hata ?? 'Para birimi çözülemedi.');
  return d.para;
}

/** İstanbul takvimiyle bugünden bir sonraki ay, `YYYY-MM` (Date'e çevrilmez). */
export function gelecekAy(bugun: string): string {
  const y = Number(bugun.slice(0, 4));
  const m = Number(bugun.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function alanAdi(adres: string): string {
  try {
    return new URL(adres.startsWith('http') ? adres : `https://${adres}`).hostname;
  } catch {
    return adres;
  }
}

/**
 * Yapay zekânın girdisi — öneri ve kitle tarifi AYNI kurucudan. Onaylanan
 * kitle tarifi varsa işletmenin kendi tarifinin yerine geçer: bölüm metinleri
 * ajansın onayladığı kişiye göre yazılsın.
 */
function aiGirdisiKur(g: GirdiOkumasi, amaclar: readonly StratejiKalemi['amac'][], kitle: string | null): StratejiAiGirdisi {
  return {
    marka: {
      ad: g.marka?.marka_adi ?? g.marka?.ad ?? null,
      sektor: g.marka?.sektor ?? null,
      urunler: g.marka?.urunler ?? [],
      vaatler: g.marka?.vaatler ?? [],
      hedefKitle: kitle ?? g.marka?.hedef_kitle ?? null,
      bilgi: g.marka?.bilgi ?? null,
      uslup: g.marka?.uslup ?? null,
    },
    site: { adres: g.marka?.website ?? null, tarama: g.siteTaramasi?.baslik ?? null },
    kalemler: amaclar.map((amac) => ({ amac })),
    gecmisAmaclari: [...new Set(g.gecmis.ozet.map((x) => x.amac))],
  };
}

/** Kalemin platform başına tahmini — motorla AYNI fonksiyon (`kalemTahmini`), platform payıyla. */
function kalemTahminleri(k: StratejiKalemiGirdisi & { butceMicros: bigint }, paraBirimi: string, gecmis: GecmisOkumasi): Record<RehberPlatformu, KalemTahmini> {
  const bol = butceBol(k.butceMicros, { meta: k.meta, google: k.google }, k.metaPayi ?? 50, paraBirimi);
  const out = {} as Record<RehberPlatformu, KalemTahmini>;
  for (const p of REHBER_PLATFORMLARI) {
    if (!(p === 'meta' ? k.meta : k.google)) {
      out[p] = { tur: 'yok', neden: 'platform_kapali' };
      continue;
    }
    const s = gecmis.sonuc(k.amac, p);
    out[p] = s.tur === 'yok' ? { tur: 'yok', neden: s.neden } : kalemTahmini(k.amac, bol[p], s.aylar);
  }
  return out;
}

/**
 * Kaynak rozeti SUNUCUNUN beyanı: değişmeyen alan eski kaynağını korur,
 * değişen alan `ajans` olur. İstemci "Marka Merkezi'nden" diye yazamaz.
 */
function kaynakBirlestir(eskiHam: unknown, eski: StratejiKalemiGirdisi | null, yeni: StratejiKalemiGirdisi): StratejiKalemi['kaynaklar'] {
  const e = (eskiHam && typeof eskiHam === 'object' ? eskiHam : {}) as StratejiKalemi['kaynaklar'];
  if (!eski) return { amac: 'ajans', platformlar: 'ajans', butce: 'ajans', takvim: 'ajans', konumlar: 'ajans', ...(yeni.metaPayi !== null ? { metaPayi: 'ajans' } : {}), ...(yeni.yasMin !== null ? { yas: 'ajans' } : {}) };
  const ayni = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const k = (ad: keyof StratejiKalemi['kaynaklar'], degisti: boolean) => (degisti ? 'ajans' : (e[ad] ?? 'ajans'));
  return {
    amac: k('amac', eski.amac !== yeni.amac),
    platformlar: k('platformlar', eski.meta !== yeni.meta || eski.google !== yeni.google),
    butce: k('butce', false),
    takvim: k('takvim', eski.baslangic !== yeni.baslangic || eski.bitis !== yeni.bitis),
    konumlar: k('konumlar', !ayni(eski.konumlar, yeni.konumlar)),
    ...(yeni.metaPayi !== null ? { metaPayi: k('metaPayi', eski.metaPayi !== yeni.metaPayi) } : {}),
    ...(yeni.yasMin !== null ? { yas: k('yas', eski.yasMin !== yeni.yasMin || eski.yasMax !== yeni.yasMax) } : {}),
  };
}

/** Öneri kalemi → yanıt şekli (kimlik GEÇİCİ; panel `PUT …/kalemler`e olduğu gibi gönderebilir). */
function oneriKalemi(k: OnerilenKalem, sira: number, ky: KaynakliMetin | null, kt: KaynakliMetin | null): StratejiKalemi {
  return {
    id: randomUUID(),
    sira,
    amac: k.amac,
    asama: AMAC_ASAMASI[k.amac],
    meta: k.meta,
    google: k.google,
    metaPayi: k.metaPayi,
    butceMicros: k.butceMicros,
    baslangic: k.baslangic,
    bitis: k.bitis,
    konumlar: k.konumlar,
    yasMin: k.yasMin,
    yasMax: k.yasMax,
    kelimeGrubu: k.kelimeGrubu,
    varliklar: [],
    metin: null,
    kreatifYonergesi: ky,
    kitleTarifi: kt,
    tahmin: k.tahmin,
    kaynaklar: k.kaynaklar,
    durum: { tur: 'aktarilmadi' },
    not: null,
  };
}

/** Riskler — sözleşmenin TEK fonksiyonu (`stratejiRiskleri`); bağlam burada kuruluyor. */
function riskHesapla(
  kalemler: StratejiKalemi[],
  b: { harita: ReturnType<typeof olcumHaritasi>['harita']; hesap: Record<RehberPlatformu, boolean>; asgari: { meta: bigint | null; googleTalepYaratma: bigint | null }; ozelKategori: boolean; paraBirimi: string },
): StratejiRiski[] {
  const pay = (k: StratejiKalemi) => butceBol(BigInt(k.butceMicros), { meta: k.meta, google: k.google }, k.metaPayi ?? 50, b.paraBirimi);
  const gun = (k: StratejiKalemi) => Math.round((Date.parse(k.bitis) - Date.parse(k.baslangic)) / 86_400_000) + 1;
  return stratejiRiskleri(
    kalemler.map((k) => ({ amac: k.amac, meta: k.meta, google: k.google })),
    {
      olcum: b.harita,
      hesap: b.hesap,
      ozelKategori: b.ozelKategori,
      asgariAlti: (sira, p) => {
        const k = kalemler[sira - 1];
        if (!k) return null;
        const a = gunlukAsgari(k.amac, p, b.asgari);
        if (a === null) return null;
        return pay(k)[p] / BigInt(gun(k)) < a;
      },
      haftalikSonuc: (sira, p) => {
        const k = kalemler[sira - 1];
        const t = k?.tahmin[p];
        if (!k || !t || t.tur !== 'aralik') return null;
        return Math.round((t.altSonuc * 7) / gun(k));
      },
      hicTahminYok: kalemler.every((k) => k.tahmin.meta.tur === 'yok' && k.tahmin.google.tur === 'yok'),
    },
  );
}

async function mevcutVarliklar(tx: Sorgucu, clientId: string, idler: string[]): Promise<Set<string>> {
  if (idler.length === 0) return new Set();
  const r = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text FROM assets WHERE client_id = ${clientId}::uuid AND id = ANY(${[...new Set(idler)]}::uuid[])`);
  return new Set(r.map((x) => x.id));
}

/**
 * Rehberde kullanıcının TAMAMLAYACAĞI alanlar. Workspace'te tek seçeneği
 * olan hesap/sayfa rehber açılınca KENDİLİĞİNDEN dolar (panelin `onDoldurma`
 * kuralı: yalnız tek seçenek, "listenin ilki" değil) — onlar `notlar`a.
 * ÖLÇÜLDÜ (Ajan 2, 2026-10-13): `rehber.service.ts#olustur` alanları sunucuda
 * doldurmuyor; doldurma panelin açılış etkisinde (`rehber-ekrani.tsx`) ve
 * yalnız BOŞ alana yazıyor, yani aktarımın yazdığı bütçe/tarih/konum ezilmiyor.
 */
function tamamlanacaklar(k: StratejiKalemiGirdisi, karar: KalemAktarimKarari, h: RehberHazirligi): { alanlar: RehberAlanAdi[]; notlar: string[] } {
  const alanlar: RehberAlanAdi[] = [];
  const notlar: string[] = [];
  if (karar.tur !== 'aktarilabilir') return { alanlar, notlar };
  const tek = (ad: RehberAlanAdi, liste: readonly unknown[], etiket: string) => {
    if (liste.length === 1) notlar.push(`${etiket} rehber açılınca kendiliğinden seçilir (tek seçenek).`);
    else alanlar.push(ad);
  };
  if (karar.platformlar.meta) {
    tek('metaHesabiId', h.hesaplar, 'Meta reklam hesabı');
    tek('sayfaId', h.sayfalar, 'Facebook sayfası');
    if (h.instagramHesaplari.length > 1) alanlar.push('instagramId');
  }
  if (karar.platformlar.google) {
    tek('googleHesabiId', h.googleHesaplari, 'Google Ads hesabı');
    if (k.amac === 'VIDEO') alanlar.push('youtubeKanaliId', 'youtubeVideo');
  }
  if (k.amac === 'SITE' || k.amac === 'SATIS' || (karar.platformlar.google && REHBER_AMACLARI[k.amac].google.kurgu !== null)) {
    if (h.iletisim.siteAdresi) notlar.push('Hedef adres Marka Merkezi’nden gelir.');
    else alanlar.push('hedefAdres');
  }
  if (k.amac === 'TELEFON') {
    if (h.iletisim.telefon) notlar.push('Telefon Marka Merkezi’nden gelir.');
    else alanlar.push('telefon');
  }
  if (k.amac === 'WHATSAPP') alanlar.push('whatsappNumarasi');
  if (k.amac === 'FORM' && karar.platformlar.meta) alanlar.push('formSablonuId');
  if (k.amac === 'SATIS' && karar.platformlar.meta) {
    if (h.hazirlama?.pikselId) notlar.push('Piksel hazırlıktan gelir.');
    else alanlar.push('pikselId');
  }
  if (k.varlikIdleri.length === 0) alanlar.push('medya');
  if (!k.metin || k.metin.kaynak === 'ai') alanlar.push('metin');
  return { alanlar: [...new Set(alanlar)], notlar };
}

/** Gerçekleşen — kalem × platform, AYRI sorgular, toplanmaz. Plan okuyucusu çağıranın (RLS ya da admin). */
async function gerceklesenKur(tx: Sorgucu, simdi: Date, _id: string, planOkuyucu: () => Promise<PlanSatiri>): Promise<Gerceklesen> {
  const p = await planOkuyucu();
  const satirlar = await kalemSatirlari(tx, p.id, p.client_id);
  const dun = (() => {
    const d = new Date(Date.parse(istanbulBugun(simdi)) - 86_400_000);
    return d.toISOString().slice(0, 10);
  })();
  const rehberler = satirlar.filter((k) => k.rehber_id).map((k) => k.rehber_id!) as string[];
  const rehberAlan = rehberler.length
    ? await tx.$queryRaw<Array<{ id: string; alanlar: unknown }>>(Prisma.sql`SELECT id::text, alanlar FROM reklam_rehberi WHERE id = ANY(${rehberler}::uuid[]) AND client_id = ${p.client_id}::uuid`)
    : [];
  const kalemler: Gerceklesen['kalemler'] = [];
  for (const k of satirlar) {
    const g = kalemGirdisi(k);
    const plan = butceBol(g.butceMicros, { meta: g.meta, google: g.google }, g.metaPayi ?? 50, p.para_birimi);
    const tahmin = tahminOku(k.tahmin);
    const platformlar: Gerceklesen['kalemler'][number]['platformlar'] = {};
    const kurulan = kurulanButce(rehberAlan.find((r) => r.id === k.rehber_id)?.alanlar, p.para_birimi);
    for (const pl of REHBER_PLATFORMLARI) {
      if (!(pl === 'meta' ? g.meta : g.google)) continue;
      if (!k.rehber_id) continue;
      const bitis = g.bitis < dun ? g.bitis : dun;
      const r = bitis < g.baslangic ? { harcamaMicros: 0n, sonuc: 0, kampanyaSayisi: 0 } : await gerceklesenOku(tx, { clientId: p.client_id, rehberId: k.rehber_id, platform: pl, amac: g.amac, baslangic: g.baslangic, bitis });
      const sonuc = pl === 'google' && g.amac !== 'SITE' && g.amac !== 'VIDEO' ? null : r.sonuc;
      platformlar[pl] = {
        harcananMicros: r.harcamaMicros.toString(),
        sonuc,
        kurulanButceMicros: kurulan ? kurulan[pl].toString() : null,
        planMicros: plan[pl].toString(),
        sonucNedeni: sonuc === null ? (g.amac === 'ERISIM' ? 'Erişim günlerden toplanamıyor.' : 'Bu sonuç bu platformda ayrı sayılmıyor.') : r.kampanyaSayisi === 0 ? 'Rehber henüz yayına alınmadı.' : null,
        tahmin: tahmin[pl],
      };
    }
    kalemler.push({ kalemId: k.id, platformlar });
  }
  return { kalemler, guncellendi: satirlar.length ? dun : null };
}

/** Rehberde KURULAN toplam bütçenin platform payı; günlük bütçe ya da okunamayan alan `null` (karşılaştırılamaz). */
function kurulanButce(alanlar: unknown, paraBirimi: string): Record<RehberPlatformu, bigint> | null {
  const a = alanlar as { butce?: { deger?: { tip?: string; micros?: string } }; platformlar?: { deger?: { meta?: boolean; google?: boolean } }; metaPayiYuzde?: { deger?: number } } | null;
  const b = a?.butce?.deger;
  const pl = a?.platformlar?.deger;
  if (!b || b.tip !== 'toplam' || !b.micros || !pl || (!pl.meta && !pl.google)) return null;
  try {
    const r = butceBol(BigInt(b.micros), { meta: !!pl.meta, google: !!pl.google }, a?.metaPayiYuzde?.deger ?? 50, paraBirimi);
    return { meta: r.meta, google: r.google };
  } catch {
    return null;
  }
}

