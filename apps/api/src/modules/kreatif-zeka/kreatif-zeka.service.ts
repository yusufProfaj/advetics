import { createHash } from 'node:crypto';
import {
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AMAC_GRUBU_ADI,
  ETIKET_SINIRI,
  GORU_AYARI,
  GORU_MIME,
  ICERIK_DURUMLARI,
  ISTATISTIK,
  KREATIF_SAYFA_BOYUTU,
  PENCERE_GUN,
  bekciKarari,
  briefCevabiSchema,
  briefIstemi,
  briefMetniDenetle,
  goruBicimi,
  gorselAdresleri,
  harcamaEsigiMicros,
  type AmacGrubu,
  type BekciRetNedeni,
  type BriefBosNedeni,
  type BriefBulgusu,
  type BriefCevabi,
  type EtiketlemeOzeti,
  type EtiketlenemezNedeni,
  type GeciciNeden,
  type GoruEtiketleri,
  type IcerikDurumu,
  type KesinEtiketler,
  type KreatifBosNedeni,
  type KreatifBrief,
  type KreatifBriefIstegi,
  type KreatifSatiri,
  type KreatifZekaSorgusu,
  type KreatifZekaYaniti,
  type Platform,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { YAPAY_ZEKA } from '../../yapay-zeka/yapay-zeka.module';
import { metinIsteOlcumlu, type GeminiIstemcisi } from '../../yapay-zeka/gemini';
import { oneriAnahtari, isoHafta, pencereler, yorgunlukOnerisi } from '../iyilestir/oneri-hesap';
import { KreatifAdresiService } from '../reports/kreatif-adresi.service';
import { goruIcinIndir } from '../reports/kreatif-gorseli';
import { analiz, type IcerikBilgisi, type KumeAnalizi } from './analiz';
import { BRIEF_SISTEM_ISTEMI, briefIstemMetni, briefJsonSemasi } from './istemler';
import { GUNCEL_SEMA } from './kaynak';
import { ilkGosterimler, pencereKreatifleri, tryKuru, type PencereSatiri } from './pencere';
import { briefAyir, istanbulGunu, sayacDurumu, sayacSonuc, type TxLike } from './sayac';

/** Görsel ucunun toplam süresi: kullanıcı bir kart açıyor, beklememeli. */
const GORSEL_BUTCESI_MS = 8_000;

/** `POST /kreatif-zeka/etiketle` yanıtı (sözleşmede tipi yok; panel aynı alanları okuyor). */
export interface EtiketleYaniti {
  kuyruga: number;
  zatenKuyrukta: number;
  izlenmeyen: number;
  /** LinkedIn: kreatif görseli okunmuyor (Ç-13); "izlenmiyor"dan AYRI sayılıyor. */
  desteklenmeyen: number;
  bekci: BekciRetNedeni | null;
  mesaj: string;
}

interface Temel {
  orgId: string;
  paraBirimi: string;
  hesapSayisi: number;
  pencere: PencereSatiri[];
  ilk: Map<string, string>;
  icerik: Map<string, IcerikBilgisi & { gercekDurum: IcerikDurumu | null }>;
  kur: number | null;
  sayac: Awaited<ReturnType<typeof sayacDurumu>>;
  sonIs: EtiketlemeOzeti['sonIs'];
  hesapIsleri: EtiketlemeOzeti['hesapIsleri'];
}

/**
 * ═══ KREATİF ZEKÂSI — API (MIMARI § 3) ═══
 *
 * OKUMA PLATFORMA ÇIKMIYOR: liste veritabanından (`withTenant`, RLS) ve
 * görsel ADRESİ yanıtta yok. Görsel ayrı uçtan, KULLANIM ANINDA tazelenip
 * akıtılıyor (CLAUDE.md "kreatif görsel adresi imzalı ve ölüyor").
 *
 * PARA HARCAYAN İKİ YOL: brief (Gemini) ve elle etiketleme (kuyruk; Gemini
 * işte). İkisi de `rule.write`; brief ayırması ÇAĞRIDAN ÖNCE ve tek deyimle.
 * Platform ve Gemini çağrıları transaction DIŞINDA.
 */
@Injectable()
export class KreatifZekaService {
  private readonly logger = new Logger(KreatifZekaService.name);
  private readonly modelAdi: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly adres: KreatifAdresiService,
    private readonly queue: SyncQueueService,
    @Inject(YAPAY_ZEKA) private readonly gemini: GeminiIstemcisi | null,
    @Optional() @Inject(CONFIG) config?: AppConfig,
  ) {
    this.modelAdi = (gemini?.model ?? config?.yapayZeka.model ?? 'gemini').slice(0, 40);
  }

  private kapsam(ctx: TenantContext, clientId: string): TenantContext {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    return { ...ctx, activeClientId: clientId };
  }

  // ── Okuma ─────────────────────────────────────────────────────────────

  private async temel(ctx: TenantContext, clientId: string, bugun: string): Promise<Temel> {
    return this.prisma.withTenant(ctx, async (txAsil) => {
      const tx = txAsil as unknown as TxLike;
      const [c] = await tx.$queryRaw<Array<{ org_id: string; para: string; hesap: number }>>(Prisma.sql`
        SELECT org_id::text, reporting_currency AS para,
               (SELECT count(*)::int FROM ad_accounts WHERE client_id = ${clientId}::uuid) AS hesap
          FROM clients WHERE id = ${clientId}::uuid`);
      if (!c) throw new NotFoundException('Workspace bulunamadı');
      const pencere = await pencereKreatifleri(tx, { clientId, paraBirimi: c.para, bugun });
      const ids = pencere.map((p) => p.creativeId);
      const ilk = await ilkGosterimler(tx, clientId, ids);
      const satirlar = ids.length
        ? await tx.$queryRaw<
            Array<{ creative_id: string; durum: IcerikDurumu; neden: string | null; kismi: string | null; bicim: string; en_boy: string | null; icerik_ozeti: string | null; etiketler: GoruEtiketleri | null }>
          >(Prisma.sql`
            SELECT k.creative_id::text, k.durum, k.neden, k.kismi, k.bicim, k.en_boy, k.icerik_ozeti, e.etiketler
              FROM kreatif_icerikleri k
              LEFT JOIN kreatif_etiketleri e
                ON e.client_id = k.client_id AND e.icerik_ozeti = k.icerik_ozeti AND e.sema_surumu = ${GUNCEL_SEMA}::int
             WHERE k.client_id = ${clientId}::uuid AND k.creative_id = ANY(${ids}::uuid[])`)
        : [];
      const icerik = new Map<string, IcerikBilgisi & { gercekDurum: IcerikDurumu | null }>();
      for (const r of satirlar) {
        /*
         * ETİKET YALNIZ GÜNCEL ŞEMADAN ve EN-BOY BİLİNİYORSA tam: en-boy
         * görselin başlığından okunamadıysa "kare" varsaymak karşılaştırmayı
         * sessizce bir gruba yığardı; o kreatif bu ekranda etiketsiz görünür.
         */
        const tam =
          r.durum === 'etiketlendi' && r.etiketler && r.en_boy
            ? { ...r.etiketler, bicim: r.bicim as KesinEtiketler['bicim'], en_boy: r.en_boy as KesinEtiketler['en_boy'] }
            : null;
        icerik.set(r.creative_id, {
          durum: r.durum,
          gercekDurum: r.durum,
          neden: r.neden as EtiketlenemezNedeni | GeciciNeden | null,
          etiketler: tam,
          kismi: (r.kismi as IcerikBilgisi['kismi']) ?? null,
          icerikOzeti: r.icerik_ozeti,
        });
      }
      const kur = await tryKuru(tx, c.para);
      const sayac = await sayacDurumu(tx, clientId, bugun);
      const [is] = await tx.$queryRaw<Array<{ durum: string; zaman: Date | null; olusma: Date; not: string | null }>>(Prisma.sql`
        SELECT status::text AS durum, finished_at AS zaman, created_at AS olusma, coalesce(note, error_message) AS not
          FROM sync_jobs
         WHERE client_id = ${clientId}::uuid AND job_type = 'creative_tags'::"SyncJobType"
         ORDER BY created_at DESC LIMIT 1`);
      /*
       * HESAP BAŞINA son iş: LinkedIn dışındaki atanmış her hesap, işi hiç
       * olmasa da (durum null = "hiç koşmadı"). Tek "son iş" bir hesabın
       * arızasını ötekinin başarısının arkasına gizlerdi.
       */
      const hesapIsleri = await tx.$queryRaw<Array<{ id: string; ad: string; durum: string | null; zaman: Date | null; not: string | null }>>(Prisma.sql`
        SELECT a.id::text AS id, a.name AS ad, j.durum, j.zaman, j.not
          FROM ad_accounts a
          LEFT JOIN LATERAL (
            SELECT status::text AS durum, coalesce(finished_at, created_at) AS zaman, coalesce(note, error_message) AS not
              FROM sync_jobs
             WHERE client_id = ${clientId}::uuid AND ad_account_id = a.id AND job_type = 'creative_tags'::"SyncJobType"
             ORDER BY created_at DESC LIMIT 1
          ) j ON true
         WHERE a.client_id = ${clientId}::uuid AND a.platform <> 'linkedin'::"Platform"
         ORDER BY a.name, a.id`);
      return {
        hesapIsleri: hesapIsleri.map((x) => ({
          adAccountId: x.id,
          hesapAdi: x.ad,
          durum: x.durum,
          zaman: x.zaman ? new Date(x.zaman).toISOString() : null,
          not: x.not,
        })),
        orgId: c.org_id,
        paraBirimi: c.para,
        hesapSayisi: c.hesap,
        pencere,
        ilk,
        icerik,
        kur,
        sayac,
        sonIs: is ? { durum: is.durum, zaman: new Date(is.zaman ?? is.olusma).toISOString(), not: is.not } : null,
      };
    });
  }

  /**
   * Açık `kreatif_yorgunlugu` önerisi olan reklamlar (MIMARI Ç-10).
   *
   * YORGUNLUK BURADA HESAPLANMIYOR, İyileştir'in ÜRETİCİSİ ÇAĞRILIYOR
   * (`yorgunlukOnerisi`): ikinci bir yorgunluk tanımı doğduğu anda iki
   * ekran aynı reklam için farklı şey söylerdi. Karar verilmiş (uygulanmış
   * ya da yok sayılmış) öneri "açık" değil.
   */
  private async yorgunReklamlar(ctx: TenantContext, clientId: string, adIdler: string[], bugun: string): Promise<Set<string>> {
    if (adIdler.length === 0) return new Set();
    const p = pencereler(bugun);
    return this.prisma.withTenant(ctx, async (txAsil) => {
      const tx = txAsil as unknown as TxLike;
      const satirlar = await tx.$queryRaw<Array<{ id: string; gunler: Array<{ d: string; i: number; c: number; r: number; s: string }> }>>(Prisma.sql`
        SELECT ad.id::text AS id,
               json_agg(json_build_object('d', i.date::text, 'i', i.impressions, 'c', i.clicks, 'r', i.reach, 's', i.spend_micros::text) ORDER BY i.date) AS gunler
          FROM ads ad
          JOIN insights_daily i ON i.entity_id = ad.id AND i.entity_level = 'ad'::"EntityLevel" AND i.breakdown_key = ''
           AND i.client_id = ${clientId}::uuid AND i.date BETWEEN ${p.gecenBas}::date AND ${p.buSon}::date
         WHERE ad.id = ANY(${adIdler}::uuid[]) AND ad.platform = 'meta'::"Platform"
           AND ad.status = 'active'::"EntityStatus" AND ad.deleted_at IS NULL
         GROUP BY ad.id`);
      const adaylar = new Map<string, string>();
      for (const r of satirlar) {
        const o = yorgunlukOnerisi(
          {
            clientId,
            clientAdi: '',
            adId: r.id,
            adAdi: '',
            setAdi: null,
            platform: 'meta',
            paraBirimi: '',
            setteYayindaki: 2,
            gunler: r.gunler.map((g) => ({ gun: g.d, gosterim: g.i, tiklama: g.c, erisim: g.r, harcamaMikros: BigInt(g.s) })),
          },
          bugun,
        );
        if (o) adaylar.set(oneriAnahtari('kreatif_yorgunlugu', 'ad', r.id, isoHafta(bugun)), r.id);
      }
      if (adaylar.size === 0) return new Set<string>();
      const kararli = await tx.$queryRaw<Array<{ anahtar: string }>>(Prisma.sql`
        SELECT anahtar FROM iyilestir_oneri_karar WHERE client_id = ${clientId}::uuid AND anahtar = ANY(${[...adaylar.keys()]}::text[])`);
      for (const k of kararli) adaylar.delete(k.anahtar);
      return new Set(adaylar.values());
    });
  }

  private async hesapla(ctx: TenantContext, clientId: string, bugun: string, hatalar: KreatifZekaYaniti['hatalar']) {
    const t = await this.temel(ctx, clientId, bugun);
    const esik = harcamaEsigiMicros(t.paraBirimi, t.kur);
    // Kova yalnız yenilere; yorgunluk sorusu da yalnız onların reklamları için.
    let yorgun = new Set<string>();
    const yeniReklamlar = t.pencere.filter((p) => (t.ilk.get(p.creativeId) ?? '') >= gunEksi(bugun, 14)).map((p) => p.adId);
    try {
      yorgun = await this.yorgunReklamlar(ctx, clientId, yeniReklamlar, bugun);
    } catch (e) {
      this.logger.error(`kreatif-zeka: yorgunluk okunamadı: ${mesaj(e)}`);
      hatalar.push({ kaynak: 'yorgunluk', mesaj: 'Kreatif yorgunluğu önerileri okunamadı; kova cümleleri öneriye bağlanmadı.' });
    }
    const a = analiz({
      pencere: t.pencere,
      ilkGosterim: t.ilk,
      icerik: t.icerik,
      esikMicros: esik,
      paraBirimi: t.paraBirimi,
      yorgunReklamlar: yorgun,
      bugun,
    });
    return { t, a };
  }

  async oku(ctx: TenantContext, sorgu: KreatifZekaSorgusu, simdi = new Date()): Promise<KreatifZekaYaniti> {
    const scoped = this.kapsam(ctx, sorgu.clientId);
    const bugun = istanbulGunu(simdi);
    const hatalar: KreatifZekaYaniti['hatalar'] = [];
    const bos = { iyi_gidiyor: 0, dikkat: 0, veri_yetersiz: 0 };

    let h: Awaited<ReturnType<KreatifZekaService['hesapla']>>;
    try {
      h = await this.hesapla(scoped, sorgu.clientId, bugun, hatalar);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      /*
       * OKUNAMADI ≠ BOŞ. Boş liste "kreatif yok" demek; düşen bir sorgu
       * kullanıcıyı sebebi kendi reklam hesabında aratırdı. Sebep `hatalar`da
       * ve `emptyReason` null ("bilmiyoruz").
       */
      this.logger.error(`kreatif-zeka: okunamadı: ${mesaj(e)}`);
      throw new HttpException('Kreatifler okunamadı. Birazdan tekrar dene.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const { t, a } = h;

    const secili = (sorgu.kume ? a.kumeler.find((k) => k.ozet.anahtar === sorgu.kume) : undefined) ?? a.kumeler[0] ?? null;
    const tumSatirlar = secili?.satirlar ?? [];
    const gorunen = tumSatirlar
      .filter((s) => (sorgu.gorunum === 'yeni' ? s.yeni : true))
      .filter((s) => (sorgu.kova ? s.kova?.kova === sorgu.kova : true))
      .sort(satirSirasi);
    const bas = (sorgu.sayfa - 1) * KREATIF_SAYFA_BOYUTU;

    const kovaSayilari = { ...bos };
    for (const s of tumSatirlar) if (s.kova) kovaSayilari[s.kova.kova]++;

    let brief: KreatifBrief | null = null;
    if (secili) {
      try {
        brief = await this.sonBrief(scoped, sorgu.clientId, secili.ozet.anahtar);
      } catch (e) {
        this.logger.error(`kreatif-zeka: brief okunamadı: ${mesaj(e)}`);
        hatalar.push({ kaynak: 'brief', mesaj: 'Son brief okunamadı.' });
      }
    }

    return {
      kumeler: a.kumeler.map((k) => k.ozet),
      kume: secili?.ozet.anahtar ?? null,
      satirlar: gorunen.slice(bas, bas + KREATIF_SAYFA_BOYUTU),
      toplam: gorunen.length,
      kovaSayilari,
      farklar: secili?.farklar ?? [],
      etiketleme: etiketlemeOzeti(t, a.kumeler),
      emptyReason: gorunen.length > 0 ? null : bosNedeni(t, a.kumeler.length, tumSatirlar.length),
      brief,
      briefBosNedeni: secili && !brief ? briefBosNedeni(secili, t.sayac.briefBugun) : null,
      paraBirimi: t.paraBirimi,
      hatalar,
      pencereGun: PENCERE_GUN,
      uretildi: simdi.toISOString(),
    };
  }

  private async sonBrief(ctx: TenantContext, clientId: string, kume: string): Promise<KreatifBrief | null> {
    const [r] = await this.prisma.withTenant(ctx, (tx) =>
      (tx as unknown as TxLike).$queryRaw<Array<BriefSatiri>>(Prisma.sql`
        ${BRIEF_SECIMI}
         WHERE b.client_id = ${clientId}::uuid AND b.kume_anahtari = ${kume}
         ORDER BY b.created_at DESC LIMIT 1`),
    );
    return r ? satirdanBrief(r) : null;
  }

  // ── Görsel (kullanım anında tazelenir) ──────────────────────────────────

  async gorsel(ctx: TenantContext, creativeId: string): Promise<{ bytes: Uint8Array; mime: string }> {
    const [k] = await this.prisma.withTenant(ctx, (tx) =>
      (tx as unknown as TxLike).$queryRaw<
        Array<{ external_id: string; asset_urls: unknown; hesap_id: string; client_id: string | null; platform: Platform; hesap_ext: string; connection_id: string; manager_external_id: string | null }>
      >(Prisma.sql`
        SELECT c.external_id, c.asset_urls, a.id::text AS hesap_id, a.client_id::text AS client_id, a.platform::text AS platform,
               a.external_id AS hesap_ext, a.connection_id::text AS connection_id, a.manager_external_id
          FROM creatives c JOIN ad_accounts a ON a.id = c.ad_account_id
         WHERE c.id = ${creativeId}::uuid`),
    );
    if (!k || !k.client_id || !ctx.clientIds.includes(k.client_id)) throw new NotFoundException('Kreatif bulunamadı');

    let url: string | null;
    if (k.platform === 'meta') {
      /*
       * PLATFORM ÇAĞRISI TRANSACTION DIŞINDA (yukarıdaki okuma bitti) ve
       * rapordakiyle AYNI çekirdekten: önbellek, `report_creative` kotası
       * (%50, yapı taramasını kilitleyemez), süre bütçesi.
       */
      const r = await this.adres.hesapAdresleri(
        { id: k.hesap_id, clientId: k.client_id, platform: k.platform, externalId: k.hesap_ext, connectionId: k.connection_id, managerExternalId: k.manager_external_id },
        [k.external_id],
        { katman: 'report_creative', bitis: Date.now() + GORSEL_BUTCESI_MS, etiket: 'kreatif_zeka_gorsel' },
      );
      const a = r?.adresler.get(k.external_id);
      if (!a || 'hata' in a) throw new BadGatewayException(`Görsel alınamadı: ${a && 'hata' in a ? a.hata : 'platform adres döndürmedi'}`);
      url = a.url;
    } else {
      url = gorselAdresleri(k.asset_urls)[0] ?? null;
      if (!url) throw new BadGatewayException('Görsel alınamadı: platform bu reklam için görsel adresi vermiyor');
    }
    const ind = await goruIcinIndir(url, {
      maxBayt: GORU_AYARI.maxBayt,
      zamanAsimiMs: GORU_AYARI.indirmeZamanAsimiMs,
      bicimAnla: goruBicimi,
      bicimHatasi: 'desteklenmeyen biçim (yalnızca JPEG/PNG/WebP)',
    });
    if (!ind.ok) throw new BadGatewayException(`Görsel alınamadı: ${ind.sebep}`);
    return { bytes: ind.bytes, mime: GORU_MIME[ind.tur] };
  }

  // ── Elle etiketleme ─────────────────────────────────────────────────────

  async etiketle(ctx: TenantContext, clientId: string, simdi = new Date()): Promise<EtiketleYaniti> {
    const scoped = this.kapsam(ctx, clientId);
    const gun = istanbulGunu(simdi);
    const { hesaplar, durum } = await this.prisma.withTenant(scoped, async (txAsil) => {
      const tx = txAsil as unknown as TxLike;
      const hesaplar = await tx.$queryRaw<Array<{ id: string; platform: Platform; sync_enabled: boolean }>>(Prisma.sql`
        SELECT id::text, platform::text AS platform, sync_enabled FROM ad_accounts WHERE client_id = ${clientId}::uuid`);
      return { hesaplar, durum: await sayacDurumu(tx, clientId, gun) };
    });
    let kuyruga = 0;
    let zatenKuyrukta = 0;
    let izlenmeyen = 0;
    let desteklenmeyen = 0;
    for (const h of hesaplar) {
      // LINKEDIN "İZLENMİYOR" DEĞİL, "DESTEKLENMİYOR" (Ajan 4 N): izlenen bir
      // LinkedIn hesabını "izlenmiyor" diye saymak kullanıcıyı izlemeyi
      // açmaya gönderirdi; açsa da kreatif görseli okunmuyor (Ç-13).
      if (h.platform === 'linkedin') {
        desteklenmeyen++;
        continue;
      }
      // İZLENMEYEN HESAP KUYRUĞA GİRMİYOR: metriği gelmeyen hesapta seçilecek
      // kreatif yok ve iş boşuna koşar. Sayısı cümlede söyleniyor.
      if (!h.sync_enabled) {
        izlenmeyen++;
        continue;
      }
      const r = await this.queue.enqueue({ clientId, platform: h.platform, jobType: 'creative_tags', adAccountId: h.id });
      if (r.enqueued) kuyruga++;
      else zatenKuyrukta++;
    }
    const karar = bekciKarari(durum);
    const bekci = karar.izin ? null : karar.neden;
    const parcalar = [
      kuyruga > 0 ? `${kuyruga} hesap için inceleme başlatıldı` : null,
      zatenKuyrukta > 0 ? `${zatenKuyrukta} hesapta inceleme zaten sırada` : null,
      izlenmeyen > 0 ? `${izlenmeyen} hesap izlenmiyor, atlandı` : null,
      desteklenmeyen > 0 ? `${desteklenmeyen} LinkedIn hesabında kreatif incelemesi desteklenmiyor` : null,
      bekci ? `${BEKCI_CUMLESI[bekci]}; kalanlar sınır açılınca incelenir` : null,
    ].filter((x): x is string => x !== null);
    return {
      kuyruga,
      zatenKuyrukta,
      izlenmeyen,
      desteklenmeyen,
      bekci,
      mesaj: parcalar.length ? `${parcalar.join('. ')}.` : 'Bu workspace’e atanmış reklam hesabı yok.',
    };
  }

  // ── Brief ───────────────────────────────────────────────────────────────

  async brief(ctx: TenantContext, istek: KreatifBriefIstegi, simdi = new Date()): Promise<KreatifBrief> {
    const scoped = this.kapsam(ctx, istek.clientId);
    const bugun = istanbulGunu(simdi);
    const { t, a } = await this.hesapla(scoped, istek.clientId, bugun, []);
    const kume = a.kumeler.find((k) => k.ozet.anahtar === istek.kume);
    if (!kume) throw new NotFoundException('Bu karşılaştırma kümesinde son 90 günde kreatif yok.');
    /*
     * BELİRGİN FARK YOKSA GEMİNİ'YE İSTEK GİTMİYOR: "renk fark etmiyor" diye
     * bir tavsiye "henüz bilmiyoruz"u tavsiyeye çevirirdi ve para harcardı.
     */
    if (kume.bulgular.length === 0) {
      const neden = briefBosNedeni(kume, 0) ?? 'anlamli_fark_yok';
      throw new UnprocessableEntityException(BRIEF_BOS_CUMLESI[neden]);
    }
    const girdiOzeti = createHash('sha256')
      .update(JSON.stringify(kume.bulgular.map((b) => [b.alan, b.deger, b.karsi])))
      .digest('hex');

    const onceki = await this.prisma.withTenant(scoped, (tx) =>
      (tx as unknown as TxLike).$queryRaw<Array<BriefSatiri>>(Prisma.sql`
        ${BRIEF_SECIMI}
         WHERE b.client_id = ${istek.clientId}::uuid AND b.kume_anahtari = ${istek.kume} AND b.girdi_ozeti = ${girdiOzeti}`),
    );
    // AYNI BULGULAR İKİNCİ KEZ GEMİNİ'YE GİTMİYOR ve sayaçtan düşmüyor.
    if (onceki[0]) return satirdanBrief(onceki[0]);

    if (!this.gemini) throw new ServiceUnavailableException('Yapay zekâ bağlı değil; brief hazırlanamıyor.');

    // AYIRMA ÇAĞRIDAN ÖNCE, tek deyim (yarış).
    const ayrildi = await this.prisma.withTenant(scoped, (tx) =>
      briefAyir(tx as unknown as TxLike, { orgId: t.orgId, clientId: istek.clientId, gun: bugun }),
    );
    if (!ayrildi) throw new HttpException(BRIEF_BOS_CUMLESI.gunluk_sinir, HttpStatus.TOO_MANY_REQUESTS);

    const amac = istek.kume.split(':')[1] as AmacGrubu;
    let cevap: BriefCevabi | null = null;
    let sebep = '';
    let girdiToken = 0;
    let ciktiToken = 0;
    for (let deneme = 0; deneme < 2 && !cevap; deneme++) {
      let r;
      try {
        r = await metinIsteOlcumlu(this.gemini, {
          sistem: BRIEF_SISTEM_ISTEMI,
          metin: briefIstemMetni(amac, kume.bulgular),
          enCokCikti: 1200,
          jsonSemasi: briefJsonSemasi(kume.bulgular.map((b) => b.alan)),
          dusunme: 'low',
        });
      } catch (e) {
        sebep = mesaj(e);
        break;
      }
      girdiToken += r.girdiToken;
      ciktiToken += r.ciktiToken;
      if (r.sonuc.tur !== 'tamam') {
        sebep = r.sonuc.mesaj;
        if (r.sonuc.tur === 'ret') break;
        continue;
      }
      cevap = briefDogrula(r.sonuc.metin, kume.bulgular, (s) => (sebep = s));
    }
    await this.prisma
      .withTenant(scoped, (tx) =>
        sayacSonuc(tx as unknown as TxLike, { orgId: t.orgId, clientId: istek.clientId, gun: bugun, basarili: cevap ? 1 : 0, hata: cevap ? 0 : 1, girdiToken, ciktiToken }),
      )
      .catch((e: unknown) => this.logger.error(`kreatif-zeka: brief sayacı yazılamadı: ${mesaj(e)}`));
    if (!cevap) throw new UnprocessableEntityException(`Brief üretilemedi: ${sebep || 'bilinmeyen sebep'}`);

    const satir = await this.prisma.withTenant(scoped, async (txAsil) => {
      const tx = txAsil as unknown as TxLike;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO kreatif_briefleri (org_id, client_id, kume_anahtari, girdi_ozeti, bulgular, cevap, model, girdi_token, cikti_token, olusturan_user_id)
        VALUES (${t.orgId}::uuid, ${istek.clientId}::uuid, ${istek.kume}, ${girdiOzeti}, ${bigintliJson(kume.bulgular)}::jsonb,
                ${JSON.stringify(cevap)}::jsonb, ${(this.gemini?.model ?? this.modelAdi).slice(0, 60)}, ${girdiToken}::int, ${ciktiToken}::int,
                ${ctx.userId}::uuid)
        ON CONFLICT (client_id, kume_anahtari, girdi_ozeti) DO NOTHING`);
      const [r] = await tx.$queryRaw<Array<BriefSatiri>>(Prisma.sql`
        ${BRIEF_SECIMI}
         WHERE b.client_id = ${istek.clientId}::uuid AND b.kume_anahtari = ${istek.kume} AND b.girdi_ozeti = ${girdiOzeti}`);
      return r;
    });
    if (!satir) throw new HttpException('Brief kaydedildi ama okunamadı.', HttpStatus.INTERNAL_SERVER_ERROR);
    return satirdanBrief(satir);
  }

  /**
   * Brief ile AdvCampaign oturumu (AdvStrategy ve İyileştir asistanıyla aynı
   * yol: `adv_oturum.hazir_istem`). `org_id` WORKSPACE'İN satırından
   * (`musteriOrgId` kuralı): "tüm şirketler" modunda `ctx.orgId` ev şirketi
   * kalıyor ve kompozit anahtar düşerdi.
   */
  async advcampaign(ctx: TenantContext, briefId: string): Promise<{ oturumId: string; clientId: string }> {
    return this.prisma.withTenant(ctx, async (txAsil) => {
      const tx = txAsil as unknown as TxLike;
      const [b] = await tx.$queryRaw<Array<BriefSatiri & { client_id: string; org_id: string }>>(Prisma.sql`
        ${BRIEF_SECIMI} WHERE b.id = ${briefId}::uuid`);
      if (!b || !ctx.clientIds.includes(b.client_id)) throw new NotFoundException('Brief bulunamadı');
      const brief = satirdanBrief(b);
      const [platform, amac] = b.kume_anahtari.split(':') as [string, AmacGrubu];
      const kumeAdi = `${platform === 'meta' ? 'Meta' : 'Google'} · ${AMAC_GRUBU_ADI[amac] ?? amac}`;
      const [o] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, hazir_istem)
        VALUES (${b.org_id}::uuid, ${b.client_id}::uuid, ${ctx.userId}::uuid, ${`Kreatif brief · ${kumeAdi}`.slice(0, 120)},
                ${this.modelAdi}, ${briefIstemi(brief, kumeAdi)})
        RETURNING id::text`);
      return { oturumId: o!.id, clientId: b.client_id };
    });
  }
}

// ─── Yardımcılar (saf) ─────────────────────────────────────────────────────

/**
 * Bulgular `GrupOzeti.harcamaMicros` (bigint) taşıyor ve `JSON.stringify`
 * bigint'te PATLIYOR. API süreci `main.ts`te `BigInt.prototype.toJSON`
 * yamasıyla yaşıyor ama servis buna yaslanmıyor: yama olmayan bir süreçte
 * (test, betik, worker) brief yazımı "Do not know how to serialize a
 * BigInt" ile düşerdi (bu testte yakalandı). Micros metin olarak saklanıyor.
 */
export function bigintliJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function gunEksi(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Puana göre (puansızlar sonda), sonra harcamaya göre; eşitlikte kimlik (kararlı sıra). */
export function satirSirasi(a: KreatifSatiri, b: KreatifSatiri): number {
  const pa = a.puan.puan;
  const pb = b.puan.puan;
  if (pa !== pb) return pa === null ? 1 : pb === null ? -1 : pb - pa;
  const ha = BigInt(a.harcamaMicros);
  const hb = BigInt(b.harcamaMicros);
  if (ha !== hb) return hb > ha ? 1 : -1;
  return a.creativeId.localeCompare(b.creativeId);
}

const BEKCI_CUMLESI: Record<BekciRetNedeni, string> = {
  workspace_gunluk: `bugünkü sınır doldu (${ETIKET_SINIRI.workspaceGunluk} kreatif)`,
  workspace_aylik: `bu ayın sınırı doldu (${ETIKET_SINIRI.workspaceAylik} kreatif)`,
  kuresel_gunluk: 'ürün genelindeki günlük sınır doldu',
};

export const BRIEF_BOS_CUMLESI: Record<BriefBosNedeni, string> = {
  etiket_yok: 'Bu kümede henüz incelenmiş kreatif yok; brief için önce kreatiflerin incelenmesi gerekiyor.',
  kume_kucuk: `Karşılaştırma için yeterli kreatif yok (en az ${ISTATISTIK.enAzKreatif * 2} incelenmiş ve yeterli harcamalı kreatif gerekiyor).`,
  anlamli_fark_yok: 'Bu kümede hiçbir özellik ötekinden belirgin biçimde iyi değil; brief için en az bir belirgin fark gerekiyor.',
  gunluk_sinir: `Bugünkü brief sınırı doldu (${ETIKET_SINIRI.briefGunluk}); yarın yeniden dene.`,
};

export function briefBosNedeni(k: KumeAnalizi, briefBugun: number): BriefBosNedeni | null {
  if (k.etiketli === 0) return 'etiket_yok';
  if (k.karsilastirilabilir < ISTATISTIK.enAzKreatif * 2) return 'kume_kucuk';
  if (k.bulgular.length === 0) return 'anlamli_fark_yok';
  if (briefBugun >= ETIKET_SINIRI.briefGunluk) return 'gunluk_sinir';
  return null;
}

/**
 * Cevap doğrulama: JSON → şema (`briefCevabiSchema`) → denetim
 * (`briefMetniDenetle`: rakam yasak, talimatlar bulgularla birebir).
 * Geçmeyen cevap YAZILMIYOR; sebep çağırana.
 */
export function briefDogrula(metin: string, bulgular: readonly BriefBulgusu[], sebepYaz: (s: string) => void): BriefCevabi | null {
  let ham: unknown;
  try {
    ham = JSON.parse(metin);
  } catch {
    sebepYaz('yapay zekâ cevabı JSON değil');
    return null;
  }
  const r = briefCevabiSchema.safeParse(ham);
  if (!r.success) {
    const ilk = r.error.issues[0];
    sebepYaz(`yapay zekâ cevabı şema dışı: ${ilk?.path.join('.') || 'kök'} ${ilk?.message ?? ''}`.trim());
    return null;
  }
  const d = briefMetniDenetle(r.data, bulgular);
  if (!d.ok) {
    sebepYaz(d.sebep);
    return null;
  }
  return r.data;
}

interface BriefSatiri {
  id: string;
  client_id: string;
  org_id: string;
  kume_anahtari: string;
  girdi_ozeti: string;
  bulgular: BriefBulgusu[];
  cevap: BriefCevabi;
  model: string;
  created_at: Date | string;
}

const BRIEF_SECIMI = Prisma.sql`
  SELECT b.id::text, b.client_id::text, b.org_id::text, b.kume_anahtari, b.girdi_ozeti, b.bulgular, b.cevap, b.model, b.created_at
    FROM kreatif_briefleri b`;

function satirdanBrief(r: BriefSatiri): KreatifBrief {
  return {
    id: r.id,
    kumeAnahtari: r.kume_anahtari,
    girdiOzeti: r.girdi_ozeti,
    bulgular: r.bulgular,
    cevap: r.cevap,
    model: r.model,
    uretildi: new Date(r.created_at).toISOString(),
  };
}

/**
 * Etiketleme özeti BÜTÜN workspace'ten (küme süzgeci yok): "312 kreatiften
 * 288'i etiketli" cümlesi kümeye göre değişseydi kullanıcı hangi sayının
 * doğru olduğunu bilemezdi. Satırı henüz açılmamış (iş koşmadı) küme
 * kreatifi `bekliyor` sayılıyor: kümede olup sayılmayan bir kreatif sessiz
 * kesme olurdu.
 */
function etiketlemeOzeti(t: Temel, kumeler: KumeAnalizi[]): EtiketlemeOzeti {
  const sayilar = Object.fromEntries(ICERIK_DURUMLARI.map((d) => [d, 0])) as Record<IcerikDurumu, number>;
  const etiketlenemez: EtiketlemeOzeti['etiketlenemez'] = {};
  const bekleyenNedenleri: EtiketlemeOzeti['bekleyenNedenleri'] = {};
  const kumedekiler = new Set(kumeler.flatMap((k) => k.satirlar.map((s) => s.creativeId)));
  let toplam = 0;
  for (const p of t.pencere) {
    const ic = t.icerik.get(p.creativeId);
    if (!ic && !kumedekiler.has(p.creativeId)) continue;
    toplam++;
    const durum = ic?.gercekDurum ?? 'bekliyor';
    sayilar[durum]++;
    if (durum === 'etiketlenemez' && ic?.neden) {
      const n = ic.neden as EtiketlenemezNedeni;
      etiketlenemez[n] = (etiketlenemez[n] ?? 0) + 1;
    }
    if (durum === 'bekliyor' && ic?.neden) {
      const n = ic.neden as GeciciNeden;
      bekleyenNedenleri[n] = (bekleyenNedenleri[n] ?? 0) + 1;
    }
  }
  const karar = bekciKarari(t.sayac);
  return {
    toplam,
    sayilar,
    etiketlenemez,
    bekleyenNedenleri,
    bugunKullanilan: t.sayac.workspaceBugun,
    gunlukSinir: ETIKET_SINIRI.workspaceGunluk,
    buAyKullanilan: t.sayac.workspaceBuAy,
    aylikSinir: ETIKET_SINIRI.workspaceAylik,
    bekci: karar.izin ? null : karar.neden,
    sonIs: t.sonIs,
    hesapIsleri: t.hesapIsleri,
  };
}

/** Boş listenin NEDENİ (dört hâl ayrı; "bilinmiyor" ayrıca hata olarak dönüyor). */
export function bosNedeni(t: Pick<Temel, 'hesapSayisi' | 'pencere' | 'icerik'>, kumeSayisi: number, kumeSatiri: number): KreatifBosNedeni {
  if (t.hesapSayisi === 0) return 'hesap_yok';
  if (t.pencere.length === 0) return 'kreatif_yok';
  if (kumeSayisi === 0) {
    const yalnizMetin = t.pencere.every((p) => {
      const n = t.icerik.get(p.creativeId)?.neden;
      return n === 'metin_reklami' || n === 'platform_disi' || (p.platform === 'google' && (p.objective ?? '').toUpperCase() === 'SEARCH');
    });
    return yalnizMetin ? 'yalniz_metin' : 'kreatif_yok';
  }
  // Küme var ama içi süzgeçle boşaldı (yeni kreatif yok, kova boş, sayfa dışı).
  return kumeSatiri === 0 ? 'kreatif_yok' : 'suzgec_bos';
}
