import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import {
  ETKI_ACIK_DURUMLARI,
  ROLE_PERMISSIONS,
  YORUM_DURUMLARI,
  donusumKiyasi,
  isoHaftaAraligi,
  istanbulGunu,
  kisaOneri,
  oncekiHafta,
  sinyalEylemTuru,
  type BekleyenIs,
  type HaftalikOzet,
  type OzetBolumu,
  type OzetSinyali,
  type Platform,
  type SinyalKodu,
  type SinyalSeviyesi,
  type TenantContext,
} from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import { YAPAY_ZEKA } from '../../yapay-zeka/yapay-zeka.module';
import { ETKI_SECIMI, satirdanEtki, type EtkiSatiri } from '../etki/etki-metni';
import { GenelBakisService } from '../genel-bakis/genel-bakis.service';
// YALNIZ SINIF REFERANSI (ModuleRef anahtarı); modül içe alınmıyor, aşağıdaki not.
import { IyilestirService } from '../iyilestir/iyilestir.service';
import { sinyalBasligi, gunMetni } from '../sinyal/sinyal-metni';
import { kes, sayisalBolumler, type GunlukKampanyaSatiri, type OzetAraliklari } from './ozet-uret';
import { yorumYaz } from './ozet-yorum';

/** İyileştir servisinin bu modülün kullandığı yüzü (ModuleRef ile çözülüyor). */
interface IyilestirOkuyucu {
  liste(ctx: TenantContext, clientId: string): Promise<{ oneriler: Array<{ durum: string }>; toplam: number }>;
}

interface IstemciSatiri {
  id: string;
  org_id: string;
  name: string;
  reporting_currency: string;
}

interface KampanyaGunSatiri {
  varlik_id: string;
  ad: string | null;
  hesap_id: string;
  hesap_adi: string | null;
  platform: Platform;
  gun: string;
  para: string;
  s: string;
  sr: string | null;
  g: number;
  t: number;
  d: number;
}

/**
 * ═══ HAFTALIK ÖZET — ÜRET, SAKLA, OKU (MIMARI § 5) ═══
 *
 * `getir` iki tüketicinin TEK kapısı: müşteri planı (report_schedules
 * süpürmesi) ve ajans kanalı (Paket A süpürmesi) ve panel önizlemesi.
 * Kayıt varsa onu döndürüyor; yoksa üretip saklıyor. Satır DEĞİŞMEZ
 * (Ç-B11): pazartesi gönderilen ile perşembe açılan önizleme aynı.
 *
 * ÜRETİM KULLANICIDAN BAĞIMSIZ — BYPASSRLS İSTEMCİSİYLE ve AÇIK
 * `client_id` süzgeciyle okunuyor. Önizlemeyi ilk açan bir MÜŞTERİ hesabı
 * olabilir: onun bağlamıyla üretmek, RLS'in ona göstermediği bölümleri
 * (ajans görünümünün kaynakları) eksik bırakıp O EKSİK hâli saklardı ve
 * pazartesi ajans kanalına giden özet de eksik giderdi. Kimin ne göreceğine
 * üretim değil SUNUM karar veriyor (`ozetKitleyeGore`); erişim kontrolü
 * çağıranda (uç: `ctx.clientIds` + izin).
 *
 * HER KAYNAK AYRI `try`: biri düşerse `hatalar`a yazılıyor, diğerleri
 * geliyor (sessiz düşüş yok). Yapay zekâ çağrısı hiçbir transaction'ın
 * İÇİNDE değil (CLAUDE.md 5 sn sınırı).
 */
@Injectable()
export class OzetService {
  private readonly logger = new Logger(OzetService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Optional() @Inject(YAPAY_ZEKA) private readonly yz: MetinUretici | null,
    private readonly genelBakis: GenelBakisService,
    @Optional() private readonly moduleRef: ModuleRef | null,
  ) {}

  /** Testte İyileştir okuyucusu doğrudan verilebilsin. */
  iyilestir: IyilestirOkuyucu | null = null;

  /**
   * Haftanın özeti: kayıtlıysa kayıt, değilse üretilip saklanmış hâli.
   * Tamamlanmamış (bu ya da gelecek) hafta REDDEDİLİYOR: yarım haftayı tam
   * haftayla kıyaslamak her seferinde "düştü" der.
   */
  async getir(clientId: string, hafta: string, simdi = new Date()): Promise<{ ozet: HaftalikOzet; kaynak: 'kayitli' | 'yeni' }> {
    const aralik = isoHaftaAraligi(hafta);
    if (!aralik) throw new BadRequestException(`Geçersiz hafta: ${hafta}`);
    if (aralik.son >= istanbulGunu(simdi)) {
      throw new BadRequestException('Bu hafta henüz bitmedi; özet hafta tamamlanınca üretilir.');
    }

    const kayitli = await this.oku(clientId, hafta);
    if (kayitli) return { ozet: kayitli, kaynak: 'kayitli' };

    const istemci = await this.istemci(clientId);
    const { ozet, model } = await this.uret(istemci, hafta, simdi);
    /*
     * ON CONFLICT DO NOTHING + YENİDEN OKU: önizleme ile süpürme aynı anda
     * üretirse ikincisi kendi sonucunu ATIYOR ve birincinin satırını
     * döndürüyor. Kendi sonucunu döndürseydi ekranda ve mailde iki farklı
     * özet (iki farklı yorum) görünürdü.
     */
    const yazilan = await this.admin.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO haftalik_ozetler (org_id, client_id, hafta, veri, yorum_durumu, model, uretildi)
      VALUES (${istemci.org_id}::uuid, ${clientId}::uuid, ${hafta}, ${JSON.stringify(ozet)}::jsonb,
              ${ozet.yorum.durum}, ${model}, ${ozet.uretildi}::timestamptz)
      ON CONFLICT (client_id, hafta) DO NOTHING
      RETURNING id::text AS id`);
    if (yazilan.length > 0) return { ozet, kaynak: 'yeni' };
    const kazanan = await this.oku(clientId, hafta);
    if (!kazanan) throw new Error('Haftalık özet yazılamadı ve okunamadı.');
    return { ozet: kazanan, kaynak: 'kayitli' };
  }

  private async oku(clientId: string, hafta: string): Promise<HaftalikOzet | null> {
    const [r] = await this.admin.$queryRaw<Array<{ veri: HaftalikOzet }>>(Prisma.sql`
      SELECT veri FROM haftalik_ozetler WHERE client_id = ${clientId}::uuid AND hafta = ${hafta}`);
    return r ? r.veri : null;
  }

  private async istemci(clientId: string): Promise<IstemciSatiri> {
    const [c] = await this.admin.$queryRaw<IstemciSatiri[]>(Prisma.sql`
      SELECT id::text AS id, org_id::text AS org_id, name, reporting_currency FROM clients WHERE id = ${clientId}::uuid`);
    if (!c) throw new NotFoundException('Workspace bulunamadı.');
    return c;
  }

  /** Üretim. SAKLAMAZ; `getir` saklıyor. */
  async uret(istemci: IstemciSatiri, hafta: string, simdi: Date): Promise<{ ozet: HaftalikOzet; model: string | null }> {
    const bu = isoHaftaAraligi(hafta)!;
    const onceki = isoHaftaAraligi(oncekiHafta(hafta)!)!;
    const kiyas = donusumKiyasi(hafta, istanbulGunu(simdi));
    const a: OzetAraliklari = { bu, onceki, donusum: kiyas };
    const hatalar: HaftalikOzet['hatalar'] = [];
    const hata = (kaynak: OzetBolumu, mesaj: string, e?: unknown) => {
      if (e) this.logger.error(`haftalık özet (${istemci.id} ${hafta}) ${kaynak}: ${e instanceof Error ? e.message : String(e)}`);
      hatalar.push({ kaynak, mesaj });
    };
    const paraBirimi = istemci.reporting_currency;

    // ── Sayılar ──
    let satirlar: GunlukKampanyaSatiri[] = [];
    try {
      satirlar = await this.kampanyaGunleri(istemci.id, a, paraBirimi, hata);
    } catch (e) {
      hata('sonuc', 'Haftanın metrikleri okunamadı.', e);
    }
    const sayisal = sayisalBolumler(satirlar, a, paraBirimi);

    // ── Yaptıklarımız ve etkiler (Paket C) ──
    let yaptiklarimiz: HaftalikOzet['yaptiklarimiz'] = { satirlar: [], toplam: 0 };
    try {
      const r = await this.admin.$queryRaw<EtkiSatiri[]>(Prisma.sql`
        ${ETKI_SECIMI}
        WHERE e.client_id = ${istemci.id}::uuid
          AND e.degisiklik_gunu BETWEEN ${bu.bas}::date AND ${bu.son}::date
        ORDER BY e.degisiklik_zamani, e.id`);
      yaptiklarimiz = kes(
        r.map(satirdanEtki).map((e) => ({
          etkiId: e.id,
          tur: e.tur,
          metin: e.degisiklikMetni,
          varlikAdi: e.varlik.ad,
          yol: e.yol,
          gun: e.gun,
        })),
      );
    } catch (e) {
      hata('yaptiklarimiz', 'Bu haftanın değişiklikleri okunamadı.', e);
    }

    let etkiler: HaftalikOzet['etkiler'] = { satirlar: [], toplam: 0, olcumde: 0 };
    try {
      /*
       * "Bu hafta ölçülen" = hükmü BU HAFTA verilmiş (sonuclandi) etki.
       * Hüküm anı ayrı bir kolonda değil; kapalı satırı yalnız iş günceller
       * ve son güncelleme kapanış anı (YAKLAŞIM, Ajan 5 ölçecek). Hafta
       * sınırı İstanbul gününe göre.
       */
      const r = await this.admin.$queryRaw<EtkiSatiri[]>(Prisma.sql`
        ${ETKI_SECIMI}
        WHERE e.client_id = ${istemci.id}::uuid
          AND e.durum = 'sonuclandi'
          AND e.updated_at >= ((${bu.bas}::date)::timestamp AT TIME ZONE 'Europe/Istanbul')
          AND e.updated_at < (((${bu.son}::date) + 1)::timestamp AT TIME ZONE 'Europe/Istanbul')
        ORDER BY e.updated_at, e.id`);
      const [n] = await this.admin.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM degisiklik_etkileri
         WHERE client_id = ${istemci.id}::uuid AND durum = ANY(${[...ETKI_ACIK_DURUMLARI]}::text[])`);
      const k = kes(
        r.map(satirdanEtki).map((e) => ({
          etkiId: e.id,
          varlikAdi: e.varlik.ad,
          ne: `${e.degisiklikMetni}, ${gunMetni(e.gun)}`,
          sonuc: e.sonuc ?? 'belirsiz',
          cumle: e.cumle,
        })),
      );
      etkiler = { ...k, olcumde: Number(n?.n ?? 0) };
    } catch (e) {
      hata('etkiler', 'Ölçülen etkiler okunamadı.', e);
    }

    // ── Ajans bölümleri (Paket A, Genel Bakış, İyileştir) ──
    let sinyaller: HaftalikOzet['sinyaller'] = null;
    let tumSinyaller: Array<OzetSinyali & { uygulanabilir: boolean }> = [];
    const sessiz = this.config.sinyal.sessizKosum;
    try {
      tumSinyaller = await this.sinyaller(istemci.id);
      /*
       * SESSİZ KOŞUM: sinyaller kanala gitmiyor (Paket A Ç-14). Ajans
       * özeti kanala gittiği için satırlar BOŞ saklanıyor ve neden yazıyor;
       * sayıyı göstermek de kanala sinyal sızdırmak olurdu.
       */
      sinyaller = sessiz
        ? { satirlar: [], toplam: 0, sessizKosum: true }
        : { ...kes(tumSinyaller.map(({ uygulanabilir: _u, ...s }) => s)), sessizKosum: false };
    } catch (e) {
      hata('sinyaller', 'Açık sinyaller okunamadı.', e);
    }

    let isler: BekleyenIs[] = [];
    let acikOneri = 0;
    try {
      const y = await this.genelBakis.bekleyenler(this.sentetikBaglam(istemci), { clientId: istemci.id }, simdi);
      isler = y.isler;
      for (const h of y.hatalar) hata('bekleyen_isler', h.mesaj);
    } catch (e) {
      hata('bekleyen_isler', 'Bekleyen işler okunamadı.', e);
    }
    try {
      const iy = this.iyilestirOkuyucu();
      if (!iy) throw new Error('İyileştir servisi bu süreçte yok');
      const l = await iy.liste(this.sentetikBaglam(istemci), istemci.id);
      acikOneri = l.oneriler.filter((o) => o.durum === 'acik').length;
    } catch (e) {
      hata('bekleyen_isler', "İyileştir önerileri okunamadı.", e);
    }
    const bekleyenIsler = { isler, acikOneri };
    const oneri = kisaOneri({ sinyaller: sessiz ? [] : tumSinyaller, acikOneri, bekleyenIsler: isler });

    const ozet: HaftalikOzet = {
      clientId: istemci.id,
      clientAdi: istemci.name,
      hafta,
      aralik: bu,
      oncekiAralik: onceki,
      paraBirimi,
      ...sayisal,
      donusumKiyasi: kiyas,
      yaptiklarimiz,
      etkiler,
      sinyaller,
      bekleyenIsler,
      oneri,
      yorum: { durum: 'atlandi', metin: null, not: null },
      hatalar,
      uretildi: simdi.toISOString(),
    };

    // Yorum EN SON ve yalnız ortak bölümlerden (`yorumGirdisi`).
    const y = await yorumYaz(ozet, this.yz ?? null);
    if (!YORUM_DURUMLARI.includes(y.durum)) throw new Error(`Bilinmeyen yorum durumu: ${y.durum}`);
    ozet.yorum = { durum: y.durum, metin: y.metin, not: y.not };
    if (y.durum === 'reddedildi' || y.durum === 'hata') {
      this.logger.warn(`haftalık özet (${istemci.id} ${hafta}) yorum ${y.durum}: ${y.not ?? '-'}`);
    }
    return { ozet, model: y.model };
  }

  /**
   * Kampanya × gün, RAPORLAMA para biriminde (Ç-B9). `spend_micros_reporting`
   * doluysa o; boşsa ve hesabın para birimi raporlama birimiyle AYNIYSA
   * ham harcama (çeviri gerekmiyor). Farklı birimde ve çevrilmemiş hesap
   * TOPLAMA GİRMİYOR ve adıyla `hatalar`a yazılıyor: 1 USD + 1 TRY'yi
   * toplamak sessizce yanlış sayı üretirdi.
   */
  private async kampanyaGunleri(
    clientId: string,
    a: OzetAraliklari,
    paraBirimi: string,
    hata: (kaynak: OzetBolumu, mesaj: string) => void,
  ): Promise<GunlukKampanyaSatiri[]> {
    const r = await this.admin.$queryRaw<KampanyaGunSatiri[]>(Prisma.sql`
      SELECT i.entity_id::text AS varlik_id, c.name AS ad, i.ad_account_id::text AS hesap_id, a.name AS hesap_adi,
             i.platform::text AS platform, i.date::text AS gun, i.currency AS para,
             i.spend_micros::text AS s, i.spend_micros_reporting::text AS sr,
             i.impressions::int AS g, i.clicks::int AS t, i.conversions::float8 AS d
        FROM insights_daily i
        LEFT JOIN campaigns c ON c.id = i.entity_id
        LEFT JOIN ad_accounts a ON a.id = i.ad_account_id
       WHERE i.client_id = ${clientId}::uuid
         AND i.entity_level = 'campaign'::"EntityLevel"
         AND i.breakdown_key = ''
         AND i.date BETWEEN ${a.onceki.bas}::date AND ${a.bu.son}::date`);
    const cevrilemeyen = new Map<string, string>();
    const sonuc: GunlukKampanyaSatiri[] = [];
    for (const x of r) {
      let mikros: bigint;
      if (x.sr !== null) mikros = BigInt(x.sr);
      else if (x.para === paraBirimi) mikros = BigInt(x.s);
      else {
        cevrilemeyen.set(x.hesap_id, `${x.hesap_adi ?? x.hesap_id} (${x.para})`);
        continue;
      }
      sonuc.push({
        varlikId: x.varlik_id,
        ad: x.ad ?? 'Adsız kampanya',
        hesapAdi: x.hesap_adi ?? '',
        platform: x.platform,
        gun: x.gun,
        harcama: Number(mikros) / 1_000_000,
        gosterim: Number(x.g),
        tiklama: Number(x.t),
        donusum: Number(x.d),
      });
    }
    if (cevrilemeyen.size > 0) {
      hata('sonuc', `${[...cevrilemeyen.values()].join(', ')} ${paraBirimi} birimine çevrilemedi ve toplama girmedi.`);
    }
    return sonuc;
  }

  private async sinyaller(clientId: string): Promise<Array<OzetSinyali & { uygulanabilir: boolean }>> {
    const r = await this.admin.$queryRaw<
      Array<{
        id: string;
        tur: 'anomali' | 'saglik';
        kod: SinyalKodu;
        yon: 'artis' | 'dusus' | null;
        seviye: SinyalSeviyesi;
        gun: string;
        gozlenen: number | null;
        beklenen_orta: number | null;
        beklenen_alt: number | null;
        beklenen_ust: number | null;
        nokta: number | null;
        para_birimi: string;
        kanit: Record<string, unknown>;
        varlik_adi: string;
        onem: 'yuksek' | 'orta';
      }>
    >(Prisma.sql`
      SELECT id::text AS id, tur, kod, yon, seviye::text AS seviye, gun::text AS gun,
             gozlenen::float8 AS gozlenen, beklenen_orta::float8 AS beklenen_orta,
             beklenen_alt::float8 AS beklenen_alt, beklenen_ust::float8 AS beklenen_ust,
             nokta::int AS nokta, para_birimi, kanit, varlik_adi, onem
        FROM sinyaller
       WHERE client_id = ${clientId}::uuid AND durum = 'acik'
       ORDER BY (onem = 'yuksek') DESC, son_acilma DESC, id`);
    return r.map((s) => ({
      sinyalId: s.id,
      tur: s.tur,
      kod: s.kod,
      baslik: sinyalBasligi({
        tur: s.tur,
        kod: s.kod,
        yon: s.yon,
        gun: s.gun,
        gozlenen: s.gozlenen === null ? null : Number(s.gozlenen),
        orta: s.beklenen_orta === null ? null : Number(s.beklenen_orta),
        alt: s.beklenen_alt === null ? null : Number(s.beklenen_alt),
        ust: s.beklenen_ust === null ? null : Number(s.beklenen_ust),
        nokta: s.nokta,
        paraBirimi: s.para_birimi,
        kanit: s.kanit ?? {},
      }),
      varlikAdi: s.varlik_adi,
      onem: s.onem,
      uygulanabilir: sinyalEylemTuru(s.kod, s.yon, s.seviye) === 'durdur',
    }));
  }

  /**
   * Genel Bakış ve İyileştir RLS altında okuyor ve bağlam istiyor. Özet
   * kullanıcıdan bağımsız üretildiği için SENTETİK, SALT OKUMA bir bağlam:
   * tek workspace, o workspace'in şirketi, yönetici yetkileri (sessiz koşumda
   * sinyal sayısı yalnız yöneticiye; özet onu zaten ayrıca süzüyor). Bu
   * bağlamla HİÇBİR yazma yapılmıyor.
   */
  private sentetikBaglam(c: IstemciSatiri): TenantContext {
    return {
      userId: '00000000-0000-0000-0000-000000000000',
      orgId: c.org_id,
      clientIds: [c.id],
      activeClientId: c.id,
      managerAccountId: null,
      platformAdmin: false,
      tumSirketler: false,
      role: 'admin',
      isOrgAdmin: true,
      permissions: [...ROLE_PERMISSIONS.admin],
    } as TenantContext;
  }

  /**
   * İyileştir servisi MODÜL OLARAK İÇE ALINMIYOR: bütçe ve kampanya eylemi
   * modüllerini çekiyor ve bu modül QueueModule'ün altında (rapor planı ve
   * Paket A teslimi bizi içe alıyor) — içe almak döngüsel kayıt kurardı ve
   * Nest kaydı AÇILIŞTA patlar. Çalışma anında AppModule'de kayıtlı
   * örnekten çözülüyor; yoksa (test) `hatalar`a yazılıyor, sessiz sıfır yok.
   */
  private iyilestirOkuyucu(): IyilestirOkuyucu | null {
    if (this.iyilestir) return this.iyilestir;
    if (!this.moduleRef) return null;
    try {
      this.iyilestir = this.moduleRef.get(IyilestirService, { strict: false });
      return this.iyilestir;
    } catch {
      return null;
    }
  }
}
