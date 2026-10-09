import { z } from 'zod';
import {
  ASISTAN_ARACLARI,
  METRIC_LEVELS,
  PLATFORMS,
  breakdownQuerySchema,
  metricsQuerySchema,
  type AsistanAraci,
  type ClientPacing,
  type MetricsBreakdownRow,
  type MetricsConversionDetail,
  type MetricsSummary,
  type MetricsTimeseries,
  type Oneri,
  type OneriListesi,
  type TenantContext,
} from '@advetics/shared';
import type { GeminiAraci } from '../../../yapay-zeka/gemini';
import { gunEkle } from '../oneri-hesap';

/**
 * ═══ AI ASİSTAN ARAÇLARI — HEPSİ OKUR, BİRİ ÖNERİR, HİÇBİRİ YAZMAZ ═══
 *
 * Liste sözleşmeden (`ASISTAN_ARACLARI`); burada yalnız her aracın modele
 * giden şeması ve çalıştırıcısı var. Araç tanımları `Record<AsistanAraci,…>`
 * olduğu için sözleşmeye eklenen bir araç burada derlemeyi kırar, burada
 * eklenen fazladan bir araç ise tip hatası verir.
 *
 * YAZMA YOK: `uygula_karti` bir öneriyi KART olarak döndürür; uygulama
 * kullanıcının karttaki düğmesiyle, öneri uygulamasıyla AYNI uçtan
 * (`POST /iyilestir/oneriler/:anahtar/uygula`) yapılır. `advcampaign_devret`
 * reklam kurmaz ve 2026-10-10'dan beri HİÇBİR ŞEY YAZMAZ: AdvCampaign
 * sohbeti kaldırıldı (rehber), araç yalnız "/reklam adresinde rehberi aç"
 * yönlendirmesi döndürür. `asistan-araclari.spec.ts` bu dosyanın yazan
 * bir servise (`CampaignActionsService`, `applyAction`, `uygula(`) hiç
 * dokunmadığını kaynak taramasıyla kilitliyor.
 */

/** Okuma araçlarının servis yüzü — servis bunu kuruyor, test sahtesini veriyor. */
export interface AsistanOrtami {
  /** Oturumun workspace'ine daraltılmış bağlam (`activeClientId` = oturumun müşterisi). */
  ctx: TenantContext;
  clientId: string;
  bugun: string;
  metrics: {
    summary(ctx: TenantContext, q: z.infer<typeof metricsQuerySchema>): Promise<MetricsSummary>;
    timeseries(ctx: TenantContext, q: z.infer<typeof metricsQuerySchema>): Promise<MetricsTimeseries>;
    breakdown(ctx: TenantContext, q: z.infer<typeof breakdownQuerySchema>): Promise<MetricsBreakdownRow[]>;
    conversionDetail(ctx: TenantContext, q: z.infer<typeof metricsQuerySchema>): Promise<MetricsConversionDetail>;
  };
  pacing(ctx: TenantContext, q: { clientId: string; month?: string }): Promise<ClientPacing>;
  oneriler(ctx: TenantContext, clientId: string): Promise<OneriListesi>;
}

/** Modele dönen sonuç; ekrana giden iz `ozet` alanında. */
export type AracSonucu =
  | { hal: 'tamam'; veri: unknown; ozet: string; kart?: Oneri }
  | { hal: 'hata' | 'reddedildi'; neden: string; ozet: string };

export class AracArgumanHatasi extends Error {}

const gun = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD olmalı');
const metrikArg = {
  baslangic: gun.optional(),
  bitis: gun.optional(),
  platform: z.enum(PLATFORMS).optional(),
  kampanya_id: z.string().uuid().optional(),
  reklam_grubu_id: z.string().uuid().optional(),
};
const JS_METRIK = {
  baslangic: { type: 'string', description: 'YYYY-MM-DD. Verilmezse bitişten 29 gün önce.' },
  bitis: { type: 'string', description: 'YYYY-MM-DD. Verilmezse dün.' },
  platform: { type: 'string', enum: [...PLATFORMS], description: 'Tek platforma süz.' },
  kampanya_id: { type: 'string', description: 'Advetics kampanya kimliği (UUID); kampanyanın içine odaklanır.' },
  reklam_grubu_id: { type: 'string', description: 'Advetics reklam grubu / reklam seti kimliği (UUID).' },
} as const;

function nesne(ozellikler: Record<string, unknown>, zorunlu: string[] = []): Record<string, unknown> {
  return { type: 'object', properties: ozellikler, required: zorunlu };
}

/** `.strict()`: tanınmayan alanı sessizce yok saymak, istenmeyen dönemin verisini döndürmek olurdu. */
function suz<T extends z.ZodRawShape>(sema: T, args: unknown): z.infer<z.ZodObject<T>> {
  const r = z.object(sema).strict().safeParse(args ?? {});
  if (!r.success) {
    throw new AracArgumanHatasi(r.error.issues.map((i) => `${i.path.join('.') || 'girdi'}: ${i.message}`).join('; '));
  }
  return r.data;
}

function sorgu<S extends z.ZodTypeAny>(sema: S, deger: unknown): z.infer<S> {
  const r = sema.safeParse(deger);
  if (!r.success) throw new AracArgumanHatasi(r.error.issues.map((i) => i.message).join('; '));
  return r.data as z.infer<S>;
}

function metrikSorgusu(a: { baslangic?: string; bitis?: string; platform?: string; kampanya_id?: string; reklam_grubu_id?: string }, bugun: string) {
  const to = a.bitis ?? gunEkle(bugun, -1);
  const from = a.baslangic ?? gunEkle(to, -29);
  return { from, to, platform: a.platform, campaignId: a.kampanya_id, adGroupId: a.reklam_grubu_id };
}

const PARA = 'Para alanları *Micros ile biter: 1.000.000 micros = 1 para birimi.';

interface AracTanimi {
  aciklama: string;
  girdi: Record<string, unknown>;
  calistir(args: unknown, o: AsistanOrtami): Promise<AracSonucu>;
}

export const ASISTAN_ARAC_TANIMLARI: Record<AsistanAraci, AracTanimi> = {
  metrik_ozeti: {
    aciklama: `Workspace'in dönem toplamları (harcama, gösterim, tıklama, dönüşüm, değer) ve önceki eşit dönem. ${PARA}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, o) {
      const q = sorgu(metricsQuerySchema, metrikSorgusu(suz(metrikArg, args), o.bugun));
      return { hal: 'tamam', veri: await o.metrics.summary(o.ctx, q), ozet: `Dönem özeti okundu (${q.from} / ${q.to})` };
    },
  },
  gunluk_seri: {
    aciklama: `Gün gün metrikler; trend, ani düşüş ve yükseliş için. ${PARA}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, o) {
      const q = sorgu(metricsQuerySchema, metrikSorgusu(suz(metrikArg, args), o.bugun));
      return { hal: 'tamam', veri: await o.metrics.timeseries(o.ctx, q), ozet: `Günlük seri okundu (${q.from} / ${q.to})` };
    },
  },
  varlik_kirilimi: {
    aciklama: `Kampanya, reklam grubu ya da reklam bazında satırlar, harcamaya göre sıralı. ${PARA}`,
    girdi: nesne({
      ...JS_METRIK,
      seviye: { type: 'string', enum: [...METRIC_LEVELS], description: 'Varsayılan campaign.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Varsayılan 20.' },
    }),
    async calistir(args, o) {
      const a = suz({ ...metrikArg, seviye: z.enum(METRIC_LEVELS).optional(), limit: z.number().int().min(1).max(50).optional() }, args);
      const q = sorgu(breakdownQuerySchema, { ...metrikSorgusu(a, o.bugun), level: a.seviye, limit: a.limit ?? 20 });
      const satirlar = await o.metrics.breakdown(o.ctx, q);
      return {
        hal: 'tamam',
        // Sessiz kesme yok: dolu sayfa "hepsi bu" gibi okunmasın.
        veri: { seviye: q.level, satir_sayisi: satirlar.length, kesilmis_olabilir: satirlar.length >= q.limit, satirlar },
        ozet: 'Reklam kırılımı okundu',
      };
    },
  },
  donusum_detayi: {
    aciklama: `Dönüşümlerin hangi eylemden geldiği. "hatalar" doluysa bazı hesaplarda detay alınamamıştır; bu "dönüşüm yok" demek değildir. ${PARA}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, o) {
      const q = sorgu(metricsQuerySchema, metrikSorgusu(suz(metrikArg, args), o.bugun));
      return { hal: 'tamam', veri: await o.metrics.conversionDetail(o.ctx, q), ozet: 'Dönüşüm detayı okundu' };
    },
  },
  butce_temposu: {
    aciklama: `Aylık bütçe temposu: hesap ve workspace bütçesi, harcanan, ay sonu tahmini. ${PARA}`,
    girdi: nesne({ ay: { type: 'string', description: 'YYYY-MM. Verilmezse bu ay.' } }),
    async calistir(args, o) {
      const a = suz({ ay: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM olmalı').optional() }, args);
      return { hal: 'tamam', veri: await o.pacing(o.ctx, { clientId: o.clientId, month: a.ay }), ozet: 'Bütçe temposu okundu' };
    },
  },
  oneriler: {
    aciklama:
      'Sistemin bu hafta bulduğu iyileştirme önerileri (kreatif yorgunluğu, bütçe). Her önerinin anahtarı uygula_karti için kullanılır. "hatalar" doluysa bazı kaynaklar okunamamıştır; bu "öneri yok" demek değildir.',
    girdi: nesne({}),
    async calistir(args, o) {
      suz({}, args);
      const l = await o.oneriler(o.ctx, o.clientId);
      return {
        hal: 'tamam',
        veri: {
          toplam: l.toplam,
          hatalar: l.hatalar,
          oneriler: l.oneriler.map((x) => ({
            anahtar: x.anahtar,
            tur: x.tur,
            platform: x.platform,
            durum: x.durum,
            baslik: x.baslik,
            neden: x.neden,
            varlik: x.varlik,
            uygulanabilir: x.eylem !== null && x.durum === 'acik',
            kisit: x.kisit,
            kanitlar: x.kanitlar,
          })),
        },
        ozet: `Öneriler okundu (${l.oneriler.length})`,
      };
    },
  },
  uygula_karti: {
    aciklama:
      'Bir öneriyi kullanıcıya ONAY KARTI olarak gösterir. HİÇBİR ŞEY UYGULAMAZ: uygulamayı kullanıcı karttaki düğmeyle yapar. Anahtar oneriler aracından gelir.',
    girdi: nesne({ anahtar: { type: 'string', description: 'Önerinin anahtarı (oneriler aracından).' } }, ['anahtar']),
    async calistir(args, o) {
      const a = suz({ anahtar: z.string().min(1).max(200) }, args);
      const l = await o.oneriler(o.ctx, o.clientId);
      const x = l.oneriler.find((y) => y.anahtar === a.anahtar);
      if (!x) return { hal: 'reddedildi', neden: 'Bu anahtarla güncel bir öneri yok; önce oneriler aracını çağır.', ozet: 'Öneri bulunamadı' };
      if (x.durum !== 'acik') return { hal: 'reddedildi', neden: `Bu öneri için karar zaten verildi (${x.durum}).`, ozet: 'Öneri kapanmış' };
      if (!x.eylem) return { hal: 'reddedildi', neden: x.kisit ?? 'Bu öneri yalnız bilgi; uygulanamaz.', ozet: 'Öneri uygulanamaz' };
      return { hal: 'tamam', veri: { gosterildi: true, anahtar: x.anahtar }, kart: x, ozet: 'Onay kartı hazırlandı' };
    },
  },
  advcampaign_devret: {
    /*
     * YÖNLENDİRME, OTURUM DEĞİL. Araç sözleşmede duruyor (`ASISTAN_ARACLARI`,
     * shared) ama AdvCampaign sohbeti kaldırıldı: açılan bir `adv_oturum`
     * satırını artık hiçbir ekran okumuyor ve kullanıcı "hazırlandı" denen
     * şeyi hiçbir yerde bulamazdı. Reklam rehberden, tıklayarak kuruluyor.
     */
    aciklama:
      'Kullanıcı yeni reklam / kampanya kurmak isterse çağır. Reklam KURMAZ ve hiçbir şey kaydetmez: kullanıcıyı AdvCampaign rehberine (/reklam) yönlendirir. istem: kullanıcının isteğinin kısa özeti.',
    girdi: nesne({ istem: { type: 'string', description: 'Kullanıcının isteğinin kısa özeti (en çok 1500 karakter).' } }, ['istem']),
    async calistir(args, o) {
      suz({ istem: z.string().trim().min(10).max(1500) }, args);
      if (!o.ctx.permissions?.includes('bulk.write')) {
        return { hal: 'reddedildi', neden: 'Bu kullanıcının reklam kurma yetkisi yok (AdvCampaign).', ozet: 'Devir yetkisi yok' };
      }
      return {
        hal: 'tamam',
        veri: { adres: '/reklam', yapilacak: 'Kullanıcı AdvCampaign rehberini /reklam adresinden açıp "Yeni reklam" ile adım adım kurar.' },
        ozet: 'AdvCampaign rehberine yönlendirildi',
      };
    },
  },
};

export function geminiAraclari(): GeminiAraci[] {
  return ASISTAN_ARACLARI.map((ad) => ({
    name: ad,
    description: ASISTAN_ARAC_TANIMLARI[ad].aciklama,
    parametersJsonSchema: ASISTAN_ARAC_TANIMLARI[ad].girdi,
  }));
}

/** Araç adını doğrular ve çalıştırır; argüman hatası modele kendi cümlesiyle döner. */
export async function aracCalistir(ad: string, args: unknown, o: AsistanOrtami): Promise<AracSonucu> {
  if (!(ASISTAN_ARACLARI as readonly string[]).includes(ad)) {
    return { hal: 'reddedildi', neden: `Böyle bir araç yok: ${ad}`, ozet: 'Bilinmeyen araç' };
  }
  try {
    return await ASISTAN_ARAC_TANIMLARI[ad as AsistanAraci].calistir(args, o);
  } catch (e) {
    if (e instanceof AracArgumanHatasi) return { hal: 'hata', neden: `Argüman hatası: ${e.message}`, ozet: 'Araç argümanı reddedildi' };
    return { hal: 'hata', neden: e instanceof Error ? e.message : String(e), ozet: 'Araç çalışmadı' };
  }
}
