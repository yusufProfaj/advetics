import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ETKI_ACIK_DURUMLARI,
  ETKI_DURUMLARI,
  ETKI_SAYFA_BOYUTU,
  ETKI_SON_DURUMLARI,
  OLCULMEYEN_DEGISIKLIKLER,
  metrikDegeri,
  type EtkiAyrintisi,
  type EtkiBosNedeni,
  type EtkiDurumu,
  type EtkiListeSorgusu,
  type EtkiListesi,
  type PencereToplami,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { gunEkle } from './etki-hesap';
import { ETKI_SECIMI, satirdanEtki, type EtkiSatiri, type OlcumKaniti } from './etki-metni';

/**
 * ═══ DEĞİŞİKLİK ETKİSİ — OKUMA (MIMARI § 3) ═══
 *
 * OKUMA-YALNIZ: satırları iş yazıyor, kullanıcının yazdığı hiçbir şey yok.
 * Bütün okumalar `withTenant` (RLS) altında ve TEK workspace kapsamında
 * (İyileştir de tek workspace).
 *
 * KAYNAK DÜŞERSE LİSTE YALAN SÖYLEMİYOR: son hesaplama zamanı ayrı
 * soruluyor; düşerse `hatalar` doluyor ve boş listenin nedeni `null`
 * kalıyor ("keşif koşmadı" mı "değişiklik yok" mu bilinmiyor).
 */
@Injectable()
export class EtkiService {
  private readonly logger = new Logger(EtkiService.name);

  constructor(private readonly prisma: PrismaService) {}

  async liste(ctx: TenantContext, sorgu: EtkiListeSorgusu, simdi = new Date()): Promise<EtkiListesi> {
    if (!ctx.clientIds.includes(sorgu.clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    const scoped: TenantContext = { ...ctx, activeClientId: sorgu.clientId };
    const sayilar = Object.fromEntries(ETKI_DURUMLARI.map((d) => [d, 0])) as Record<EtkiDurumu, number>;
    const hatalar: EtkiListesi['hatalar'] = [];
    const uretildi = simdi.toISOString();

    const durumKosulu =
      sorgu.durum === 'acik'
        ? Prisma.sql`AND e.durum = ANY(${[...ETKI_ACIK_DURUMLARI]}::text[])`
        : sorgu.durum === 'kapali'
          ? Prisma.sql`AND e.durum = ANY(${[...ETKI_SON_DURUMLARI]}::text[])`
          : Prisma.empty;
    const kosul = Prisma.sql`e.client_id = ${sorgu.clientId}::uuid ${durumKosulu}
      ${sorgu.varlikId ? Prisma.sql`AND e.varlik_id = ${sorgu.varlikId}::uuid` : Prisma.empty}
      ${sorgu.yol ? Prisma.sql`AND e.yol = ${sorgu.yol}` : Prisma.empty}`;

    let sonuc: { toplam: number; satirlar: EtkiSatiri[]; durumlar: Array<{ durum: EtkiDurumu; n: number }>; hesap: number };
    try {
      sonuc = await this.prisma.withTenant(scoped, async (tx) => {
        const [t] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM degisiklik_etkileri e WHERE ${kosul}`);
        const satirlar = await tx.$queryRaw<EtkiSatiri[]>(Prisma.sql`
          ${ETKI_SECIMI}
          WHERE ${kosul}
          ORDER BY e.degisiklik_zamani DESC, e.id
          LIMIT ${ETKI_SAYFA_BOYUTU}::int OFFSET ${(sorgu.sayfa - 1) * ETKI_SAYFA_BOYUTU}::int`);
        const durumlar = await tx.$queryRaw<Array<{ durum: EtkiDurumu; n: number }>>(Prisma.sql`
          SELECT durum, count(*)::int AS n FROM degisiklik_etkileri
           WHERE client_id = ${sorgu.clientId}::uuid GROUP BY durum`);
        const [h] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM ad_accounts WHERE client_id = ${sorgu.clientId}::uuid`);
        return { toplam: t?.n ?? 0, satirlar, durumlar, hesap: h?.n ?? 0 };
      });
    } catch (e) {
      this.logger.error(`etki: liste okunamadı: ${mesaj(e)}`);
      return {
        etkiler: [],
        toplam: 0,
        sayilar,
        emptyReason: null,
        sonHesaplama: null,
        olculmeyen: OLCULMEYEN_DEGISIKLIKLER,
        hatalar: [{ kaynak: 'etkiler', mesaj: 'Değişiklik etkileri okunamadı.' }],
        uretildi,
      };
    }
    for (const d of sonuc.durumlar) if (d.durum in sayilar) sayilar[d.durum] = Number(d.n);

    let sonHesaplama: string | null = null;
    let hesaplamaOkunamadi = false;
    try {
      sonHesaplama = await this.sonHesaplama(scoped, sorgu.clientId);
    } catch (e) {
      this.logger.error(`etki: son hesaplama okunamadı: ${mesaj(e)}`);
      hesaplamaOkunamadi = true;
      hatalar.push({ kaynak: 'son_hesaplama', mesaj: 'Ölçüm işinin son koşusu okunamadı.' });
    }

    const etkiler = sonuc.satirlar.map(satirdanEtki);
    const workspaceToplami = Object.values(sayilar).reduce((a, b) => a + b, 0);
    return {
      etkiler,
      toplam: sonuc.toplam,
      sayilar,
      emptyReason:
        etkiler.length > 0
          ? null
          : bosNeden({ workspaceToplami, sonHesaplama, hesaplamaOkunamadi, hesapSayisi: sonuc.hesap }),
      sonHesaplama,
      olculmeyen: OLCULMEYEN_DEGISIKLIKLER,
      hatalar,
      uretildi,
    };
  }

  /** Son BAŞARILI keşif + değerlendirme (`sync_jobs` `impact_evaluate`). */
  private async sonHesaplama(ctx: TenantContext, clientId: string): Promise<string | null> {
    const [r] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ t: Date | string | null }>>(Prisma.sql`
        SELECT max(finished_at) AS t FROM sync_jobs
         WHERE client_id = ${clientId}::uuid
           AND job_type = 'impact_evaluate'::"SyncJobType"
           AND status = 'succeeded'::"SyncJobStatus"`),
    );
    return r?.t ? new Date(r.t).toISOString() : null;
  }

  async tek(ctx: TenantContext, id: string): Promise<EtkiAyrintisi> {
    const [r] = await this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) =>
      tx.$queryRaw<EtkiSatiri[]>(Prisma.sql`${ETKI_SECIMI} WHERE e.id = ${id}::uuid`),
    );
    // Görünmeyen satır ile olmayan satır AYNI cevap: başka workspace'in
    // değişikliğinin varlığını sızdırmasın.
    if (!r || !ctx.clientIds.includes(r.client_id)) throw new NotFoundException('Değişiklik bulunamadı');
    const etki = satirdanEtki(r);
    const scoped: TenantContext = { ...ctx, activeClientId: r.client_id };
    let seri: EtkiAyrintisi['seri'] = null;
    try {
      seri = await this.seri(scoped, r);
    } catch (e) {
      // Grafik ek bilgi: düşerse ayrıntı yine dönüyor, grafik yerine panel
      // "grafik çizilemedi" yazıyor (seri null). Hata log'da.
      this.logger.error(`etki: seri okunamadı (${id}): ${mesaj(e)}`);
    }
    return { etki, seri };
  }

  /**
   * Mini grafik: öncesi + sonrası penceresinde günlük hüküm metriği, deney
   * (ölçülen kapsam) ve kontrol grubu. Hüküm metriği yoksa (hacim yetmedi,
   * kontrol yok) çizilecek bir şey yok: `null`, boş grafik değil.
   */
  private async seri(ctx: TenantContext, r: EtkiSatiri): Promise<EtkiAyrintisi['seri']> {
    const olcum = (r.olcum ?? null) as Partial<OlcumKaniti> | null;
    const metrik = r.metrik === 'donusum_basi_maliyet' || r.metrik === 'tiklama_basi_maliyet' ? r.metrik : null;
    if (!olcum?.pencereler || !metrik) return null;
    const bas = olcum.pencereler.once.bas;
    const son = olcum.pencereler.sonra.son;
    const duzey = r.kapsam_seviye === 'account' ? 'campaign' : r.kapsam_seviye;
    const deneyIds = r.kapsam_seviye === 'account' ? null : [r.kapsam_id];
    const kontrolIds = olcum.kontrol?.varliklar ?? [];
    const satirlar = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ gun: string; grup: 'deney' | 'kontrol'; s: string; t: number; d: number }>>(Prisma.sql`
        SELECT i.date::text AS gun,
               CASE WHEN ${deneyIds === null}::boolean OR i.entity_id = ANY(${deneyIds ?? []}::uuid[]) THEN 'deney' ELSE 'kontrol' END AS grup,
               sum(i.spend_micros)::text AS s, sum(i.clicks)::float8 AS t, sum(i.conversions)::float8 AS d
          FROM insights_daily i
         WHERE i.ad_account_id = ${r.ad_account_id}::uuid
           AND i.breakdown_key = ''
           AND i.entity_level = ${duzey}::"EntityLevel"
           AND (${deneyIds === null}::boolean OR i.entity_id = ANY(${[...(deneyIds ?? []), ...kontrolIds]}::uuid[]))
           AND i.date BETWEEN ${bas}::date AND ${son}::date
         GROUP BY 1, 2`),
    );
    const gunler: string[] = [];
    for (let g = bas; g <= son; g = gunEkle(g, 1)) gunler.push(g);
    const harita = new Map(satirlar.map((x) => [`${x.grup}:${x.gun}`, x]));
    const deger = (grup: 'deney' | 'kontrol', gun: string): number | null => {
      const x = harita.get(`${grup}:${gun}`);
      if (!x) return null;
      const t: PencereToplami = { gun: 1, harcama: Number(BigInt(x.s)) / 1_000_000, tiklama: Number(x.t), donusum: Number(x.d) };
      const v = metrikDegeri(metrik, t);
      return v === null ? null : Math.round(v * 100) / 100;
    };
    return {
      gunler,
      deney: gunler.map((g) => deger('deney', g)),
      kontrol: kontrolIds.length > 0 ? gunler.map((g) => deger('kontrol', g)) : gunler.map(() => null),
      degisiklikGunu: r.gun,
    };
  }
}

/**
 * Boş listenin NEDENİ (`emptyReason` deseni). Sıra: süzgeç bir şey elediyse
 * "süzgeç boş"; workspace'te hiç satır yoksa keşif koştu mu. Atanmış hesabı
 * olmayan workspace'te keşif hiç koşmayacak (iş hesap başına); orada "keşif
 * koşmadı" demek, gelmeyecek bir sabahı bekletirdi: "değişiklik yok".
 * Son hesaplama okunamadıysa neden BİLİNMİYOR: `null`, hatalar dolu.
 */
export function bosNeden(g: {
  workspaceToplami: number;
  sonHesaplama: string | null;
  hesaplamaOkunamadi: boolean;
  hesapSayisi: number;
}): EtkiBosNedeni | null {
  if (g.workspaceToplami > 0) return 'suzgec_bos';
  if (g.hesaplamaOkunamadi) return null;
  if (g.hesapSayisi === 0) return 'degisiklik_yok';
  return g.sonHesaplama ? 'degisiklik_yok' : 'kesif_kosmadi';
}

function mesaj(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
