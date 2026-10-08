import { z } from 'zod';
import {
  METRIC_LEVELS,
  PLATFORMS,
  accountBreakdownQuerySchema,
  breakdownQuerySchema,
  bugunUtc,
  clientBreakdownQuerySchema,
  gunEkle,
  metricsQuerySchema,
  type OkumaAraciTanimi,
  type TenantContext,
} from '@advetics/shared';
import type { MetricsService } from '../metrics/metrics.service';
import type { ResolvedIdentity } from '../auth/tenant-context.service';

/**
 * ═══ OKUMA ARAÇLARI — MCP'NİN VE REST'İN TEK LİSTESİ ═══
 *
 * Her araç BİR KEZ tanımlanıyor: adı, açıklaması, JSON şeması (yapay
 * zekâya giden), Zod şeması (gelen argümanı süzen) ve çalıştırıcısı. MCP
 * (`tools/list`, `tools/call`), REST (`/okuma/araclar/:ad`) ve paneldeki
 * araç listesi bu diziden okuyor; ayrı yazılsaydı bir araç MCP'de görünüp
 * REST'te bulunamazdı.
 *
 * HİÇBİR ARAÇ YAZMIYOR. Hepsi panelin zaten kullandığı OKUMA servislerini
 * (`MetricsService`) çağırıyor; yeni SQL yok, yani RLS ve hesap süzgeci
 * panelle BİREBİR aynı. Araç eklerken bu kural korunmalı: buraya yazan
 * bir servis girerse "okuma anahtarı" adı yalan söylemeye başlar.
 *
 * SAF DOSYA: Nest'e bağlı değil, ortamı (`AracOrtami`) parametre alıyor.
 * Kapsam doğrulaması ve argüman süzgeci veritabanısız sınanabiliyor.
 */

/** Aracın dış dünyadan aldığı ortam — servis bunu kuruyor, test sahtesini veriyor. */
export interface AracOrtami {
  /** Kapsamı istenen seçimle çözer (`TenantContextService.resolve`). */
  coz(secim: { ustHesapId: string | null; sirketId: string | null; workspaceId: string | null }): Promise<ResolvedIdentity>;
  metrics: Pick<
    MetricsService,
    'summary' | 'timeseries' | 'breakdown' | 'byClient' | 'byAccount' | 'byOrganization' | 'coverage' | 'conversionDetail'
  >;
}

export interface OkumaAraci extends OkumaAraciTanimi {
  /** MCP `inputSchema` — JSON Schema. */
  girdi: Record<string, unknown>;
  calistir(args: unknown, ortam: AracOrtami): Promise<unknown>;
}

/** Kullanıcıya anlatılabilir argüman hatası — MCP'de `isError`, REST'te 400. */
export class AracArgumanHatasi extends Error {}

// ─── Ortak argümanlar ────────────────────────────────────────────────────

const uuid = z.string().uuid('UUID biçiminde olmalı');
const gun = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD biçiminde olmalı');

const kapsamAlanlari = {
  ust_hesap_id: uuid.optional(),
  sirket_id: z.union([z.literal('all'), uuid]).optional(),
  workspace_id: uuid.optional(),
};
const tarihAlanlari = {
  baslangic: gun.optional(),
  bitis: gun.optional(),
  karsilastirma_baslangic: gun.optional(),
  karsilastirma_bitis: gun.optional(),
};
const suzgecAlanlari = {
  platform: z.enum(PLATFORMS).optional(),
  reklam_hesabi_id: uuid.optional(),
  kampanya_id: uuid.optional(),
  reklam_grubu_id: uuid.optional(),
};

const JS_KAPSAM = {
  ust_hesap_id: {
    type: 'string',
    description: 'Üst hesap (ajans) kimliği. Verilmezse platform sahibinin varsayılan üst hesabı. Liste: `kapsam` aracı.',
  },
  sirket_id: {
    type: 'string',
    description: 'Şirket kimliği ya da bütün şirketler için "all". Verilmezse varsayılan şirket.',
  },
  workspace_id: {
    type: 'string',
    description: 'Workspace kimliği. Workspace başka şirketteyse sirket_id de verilmeli.',
  },
} as const;
const JS_TARIH = {
  baslangic: { type: 'string', description: 'YYYY-MM-DD. Verilmezse bitişten 29 gün önce.' },
  bitis: { type: 'string', description: 'YYYY-MM-DD. Verilmezse dün (UTC). Aralık en çok 400 gün.' },
  karsilastirma_baslangic: { type: 'string', description: 'Karşılaştırma dönemi başı (YYYY-MM-DD), isteğe bağlı.' },
  karsilastirma_bitis: { type: 'string', description: 'Karşılaştırma dönemi sonu (YYYY-MM-DD), isteğe bağlı.' },
} as const;
const JS_SUZGEC = {
  platform: { type: 'string', enum: [...PLATFORMS], description: 'Tek platforma süz.' },
  reklam_hesabi_id: { type: 'string', description: 'Advetics reklam hesabı kimliği (UUID; platformun kendi kimliği DEĞİL).' },
  kampanya_id: { type: 'string', description: 'Advetics kampanya kimliği (UUID). Odak: o kampanyanın içi.' },
  reklam_grubu_id: { type: 'string', description: 'Advetics reklam grubu / ad set kimliği (UUID).' },
} as const;

function nesne(ozellikler: Record<string, unknown>, zorunlu: string[] = []): Record<string, unknown> {
  return { type: 'object', properties: ozellikler, required: zorunlu, additionalProperties: false };
}

/**
 * Argümanı süz. `.strict()` KASITLI: yapay zekâ `start_date` gibi tanımadığımız
 * bir alan gönderdiğinde onu SESSİZCE yok saymak, "son 30 gün" verisini
 * istenen dönem gibi döndürmek demekti. Bilinmeyen alan hata ve hata
 * mesajı alanın adını söylüyor, model kendini düzeltebiliyor.
 */
function suz<T extends z.ZodRawShape>(sema: T, args: unknown): z.infer<z.ZodObject<T>> {
  const sonuc = z.object(sema).strict().safeParse(args ?? {});
  if (!sonuc.success) {
    throw new AracArgumanHatasi(
      sonuc.error.issues
        .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; '),
    );
  }
  return sonuc.data;
}

/** Shared metrik şemasından geçir — panelle aynı kurallar (400 gün, sıra, takvim). */
function sorgu<S extends z.ZodTypeAny>(sema: S, deger: unknown): z.infer<S> {
  const sonuc = sema.safeParse(deger);
  if (!sonuc.success) {
    throw new AracArgumanHatasi(sonuc.error.issues.map((i) => i.message).join('; '));
  }
  return sonuc.data as z.infer<S>;
}

/** Varsayılan dönem: dün ve öncesi 30 gün. Bugün eksik veri taşıyor (gün kapanmadı). */
export function donem(a: { baslangic?: string; bitis?: string }): { from: string; to: string } {
  const to = a.bitis ?? gunEkle(bugunUtc(), -1);
  const from = a.baslangic ?? gunEkle(to, -29);
  return { from, to };
}

/**
 * ═══ KAPSAM SESSİZCE DÜŞMÜYOR ═══
 *
 * `TenantContextService.resolve` tarayıcı için yazıldı ve geçersiz bir
 * seçimi SESSİZCE varsayılana düşürüyor (bayat çerez kullanıcıyı
 * kilitlemesin diye — orada doğru). Bir API'de aynı davranış, yanlış
 * yazılmış bir workspace kimliğiyle sorulan soruya BAŞKA bir kapsamın
 * verisiyle cevap vermek olurdu: yapay zekâ "3A Makina'nın harcaması"
 * diye ajansın toplamını okurdu. Burada istenen ile çözülen karşılaştırılıyor
 * ve tutmuyorsa hata.
 */
export function kapsamDogrula(
  istek: { ust_hesap_id?: string; sirket_id?: string; workspace_id?: string },
  ctx: TenantContext,
): void {
  if (istek.ust_hesap_id && ctx.managerAccountId !== istek.ust_hesap_id) {
    throw new AracArgumanHatasi(
      `ust_hesap_id=${istek.ust_hesap_id} erişilebilir bir üst hesap değil. Liste için \`kapsam\` aracını çağır.`,
    );
  }
  if (istek.sirket_id === 'all' && !ctx.tumSirketler) {
    throw new AracArgumanHatasi(
      '"Tüm şirketler" görünümü bu üst hesapta açılamadı (üst hesap yok ya da yetki yok).',
    );
  }
  if (istek.sirket_id && istek.sirket_id !== 'all' && (ctx.tumSirketler || ctx.orgId !== istek.sirket_id)) {
    throw new AracArgumanHatasi(
      `sirket_id=${istek.sirket_id} bu üst hesapta erişilebilir bir şirket değil. Doğru ust_hesap_id ile \`kapsam\` aracını çağır.`,
    );
  }
  if (istek.workspace_id && ctx.activeClientId !== istek.workspace_id) {
    throw new AracArgumanHatasi(
      `workspace_id=${istek.workspace_id} seçilemedi. Workspace başka bir şirketteyse sirket_id (ve gerekirse ust_hesap_id) ver; liste için \`kapsam\` aracını şirket kimliğiyle çağır.`,
    );
  }
}

async function baglam(
  a: { ust_hesap_id?: string; sirket_id?: string; workspace_id?: string },
  ortam: AracOrtami,
): Promise<ResolvedIdentity> {
  const kimlik = await ortam.coz({
    ustHesapId: a.ust_hesap_id ?? null,
    sirketId: a.sirket_id ?? null,
    workspaceId: a.workspace_id ?? null,
  });
  kapsamDogrula(a, kimlik.context);
  return kimlik;
}

/** Yanıtın başına konan kapsam özeti: model hangi kapsamın verisini okuduğunu GÖRMELİ. */
function kapsamOzeti(k: ResolvedIdentity): Record<string, unknown> {
  const ctx = k.context;
  const sirket = k.managerAccount?.organizations.find((o) => o.id === ctx.orgId);
  const ws = k.availableClients.find((c) => c.id === ctx.activeClientId);
  return {
    ust_hesap: k.managerAccount ? { id: k.managerAccount.id, ad: k.managerAccount.name } : null,
    sirket: ctx.tumSirketler ? 'all' : { id: ctx.orgId, ad: sirket?.name ?? null },
    workspace: ctx.activeClientId ? { id: ctx.activeClientId, ad: ws?.name ?? null } : null,
  };
}

const PARA_NOTU =
  'Para alanları *Micros ile biter: 1.000.000 micros = 1 para birimi (string olarak gelir). Para birimi `currency` alanında; farklı para birimleri toplanmaz.';

function metrikSorgusu(a: z.infer<z.ZodObject<typeof tarihAlanlari & typeof suzgecAlanlari>>) {
  return {
    ...donem(a),
    platform: a.platform,
    adAccountId: a.reklam_hesabi_id,
    campaignId: a.kampanya_id,
    adGroupId: a.reklam_grubu_id,
    compareFrom: a.karsilastirma_baslangic,
    compareTo: a.karsilastirma_bitis,
  };
}

const metrikSemasi = { ...kapsamAlanlari, ...tarihAlanlari, ...suzgecAlanlari };
const JS_METRIK = { ...JS_KAPSAM, ...JS_TARIH, ...JS_SUZGEC };

// ─── Araçlar ─────────────────────────────────────────────────────────────

export const OKUMA_ARACLARI: readonly OkumaAraci[] = [
  {
    ad: 'kapsam',
    baslik: 'Erişilebilir kapsam',
    aciklama:
      'İLK BUNU ÇAĞIR. Erişilebilir üst hesapları, seçili üst hesabın şirketlerini ve seçili şirketin workspace\'lerini kimlikleriyle listeler. Diğer araçların ust_hesap_id / sirket_id / workspace_id değerleri buradan gelir.',
    girdi: nesne({ ust_hesap_id: JS_KAPSAM.ust_hesap_id, sirket_id: JS_KAPSAM.sirket_id }),
    async calistir(args, ortam) {
      const a = suz({ ust_hesap_id: kapsamAlanlari.ust_hesap_id, sirket_id: kapsamAlanlari.sirket_id }, args);
      const k = await baglam(a, ortam);
      return {
        secili: kapsamOzeti(k),
        ust_hesaplar: k.secilebilirUstHesaplar.map((h) => ({ id: h.id, ad: h.name, paket: h.paket, sirket_sayisi: h.sirketSayisi })),
        sirketler: k.managerAccount
          ? k.managerAccount.organizations.map((o) => ({ id: o.id, ad: o.name }))
          : k.erisilebilirSirketler.map((o) => ({ id: o.id, ad: o.name })),
        /*
         * "Tüm şirketler" modunda workspace seçilemiyor (mod bir genel
         * bakış); listeyi yine de veriyoruz ama not düşüyoruz, yoksa model
         * buradaki kimliği sirket_id='all' ile birlikte gönderip hata alırdı.
         */
        workspaceler: k.availableClients.map((c) => ({ id: c.id, ad: c.name, durum: c.status })),
        not: k.context.tumSirketler
          ? 'Tüm şirketler modundasın: workspace verisi için workspace_id ile birlikte o workspace\'in sirket_id değerini ver.'
          : undefined,
      };
    },
  },
  {
    ad: 'sirket_kirilimi',
    baslik: 'Şirketlere göre performans',
    aciklama: `Üst hesabın BÜTÜN şirketlerinin dönem performansı, şirket başına bir satır (harcama, gösterim, tıklama, dönüşüm, önceki dönem). Ajans geneli tablo. ${PARA_NOTU}`,
    girdi: nesne({
      ust_hesap_id: JS_KAPSAM.ust_hesap_id,
      ...JS_TARIH,
      platform: JS_SUZGEC.platform,
    }),
    async calistir(args, ortam) {
      const a = suz({ ust_hesap_id: kapsamAlanlari.ust_hesap_id, ...tarihAlanlari, platform: suzgecAlanlari.platform }, args);
      const k = await baglam({ ...a, sirket_id: 'all' }, ortam);
      const q = sorgu(clientBreakdownQuerySchema, {
        ...donem(a),
        platform: a.platform,
        compareFrom: a.karsilastirma_baslangic,
        compareTo: a.karsilastirma_bitis,
      });
      return { kapsam: kapsamOzeti(k), donem: q, satirlar: await ortam.metrics.byOrganization(k.context, q) };
    },
  },
  {
    ad: 'workspace_kirilimi',
    baslik: "Workspace'lere göre performans",
    aciklama: `Seçili şirketin (ya da sirket_id="all" ile bütün şirketlerin) workspace'leri, workspace başına bir satır. ${PARA_NOTU}`,
    girdi: nesne({
      ust_hesap_id: JS_KAPSAM.ust_hesap_id,
      sirket_id: JS_KAPSAM.sirket_id,
      ...JS_TARIH,
      platform: JS_SUZGEC.platform,
    }),
    async calistir(args, ortam) {
      const a = suz(
        { ust_hesap_id: kapsamAlanlari.ust_hesap_id, sirket_id: kapsamAlanlari.sirket_id, ...tarihAlanlari, platform: suzgecAlanlari.platform },
        args,
      );
      const k = await baglam(a, ortam);
      const q = sorgu(clientBreakdownQuerySchema, {
        ...donem(a),
        platform: a.platform,
        compareFrom: a.karsilastirma_baslangic,
        compareTo: a.karsilastirma_bitis,
      });
      return { kapsam: kapsamOzeti(k), donem: q, satirlar: await ortam.metrics.byClient(k.context, q) };
    },
  },
  {
    ad: 'hesap_kirilimi',
    baslik: 'Reklam hesaplarına göre performans',
    aciklama: `Bir workspace'in reklam hesapları (Meta, Google, LinkedIn), hesap başına bir satır ve izleme durumu. workspace_id zorunlu. ${PARA_NOTU}`,
    girdi: nesne(
      { ...JS_KAPSAM, ...JS_TARIH, platform: JS_SUZGEC.platform },
      ['workspace_id'],
    ),
    async calistir(args, ortam) {
      const a = suz(
        { ...kapsamAlanlari, workspace_id: uuid, ...tarihAlanlari, platform: suzgecAlanlari.platform },
        args,
      );
      const k = await baglam(a, ortam);
      const q = sorgu(accountBreakdownQuerySchema, {
        ...donem(a),
        platform: a.platform,
        compareFrom: a.karsilastirma_baslangic,
        compareTo: a.karsilastirma_bitis,
      });
      return { kapsam: kapsamOzeti(k), donem: q, veri: await ortam.metrics.byAccount(k.context, q) };
    },
  },
  {
    ad: 'metrik_ozeti',
    baslik: 'Dönem özeti',
    aciklama: `Seçili kapsamın toplamları: harcama, gösterim, erişim, tıklama, dönüşüm, dönüşüm değeri ve önceki eşit dönem. Panelin Genel Bakış kartları. ${PARA_NOTU}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, ortam) {
      const a = suz(metrikSemasi, args);
      const k = await baglam(a, ortam);
      const q = sorgu(metricsQuerySchema, metrikSorgusu(a));
      return { kapsam: kapsamOzeti(k), veri: await ortam.metrics.summary(k.context, q) };
    },
  },
  {
    ad: 'gunluk_seri',
    baslik: 'Günlük seri',
    aciklama: `Seçili kapsamın gün gün metrikleri (trend, ani düşüş/yükseliş analizi için). ${PARA_NOTU}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, ortam) {
      const a = suz(metrikSemasi, args);
      const k = await baglam(a, ortam);
      const q = sorgu(metricsQuerySchema, metrikSorgusu(a));
      return { kapsam: kapsamOzeti(k), veri: await ortam.metrics.timeseries(k.context, q) };
    },
  },
  {
    ad: 'varlik_kirilimi',
    baslik: 'Kampanya / reklam grubu / reklam kırılımı',
    aciklama: `Seçili kapsamda seviye bazında satırlar (seviye: account, campaign, ad_group, ad), harcamaya göre sıralı, en çok "limit" satır. kampanya_id / reklam_grubu_id ile bir kampanyanın içine inilir. ${PARA_NOTU}`,
    girdi: nesne({
      ...JS_METRIK,
      seviye: { type: 'string', enum: [...METRIC_LEVELS], description: 'Varsayılan campaign.' },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Varsayılan 50.' },
    }),
    async calistir(args, ortam) {
      const a = suz(
        { ...metrikSemasi, seviye: z.enum(METRIC_LEVELS).optional(), limit: z.coerce.number().int().min(1).max(200).optional() },
        args,
      );
      const k = await baglam(a, ortam);
      const q = sorgu(breakdownQuerySchema, { ...metrikSorgusu(a), level: a.seviye, limit: a.limit });
      const satirlar = await ortam.metrics.breakdown(k.context, q);
      /*
       * SESSİZ KESME YOK: limit'e dayanan liste "hepsi bu" gibi okunur.
       * Toplam sayıyı servis vermiyor; dolu sayfa görünce açıkça söylüyoruz.
       */
      return {
        kapsam: kapsamOzeti(k),
        donem: { from: q.from, to: q.to },
        seviye: q.level,
        satir_sayisi: satirlar.length,
        kesilmis_olabilir: satirlar.length >= q.limit,
        satirlar,
      };
    },
  },
  {
    ad: 'donusum_detayi',
    baslik: 'Dönüşüm eylemleri',
    aciklama: `Dönüşümlerin hangi eylemden (satın alma, form, arama…) geldiği, eylem başına sayı ve değer. "hatalar" doluysa bazı hesaplarda detay alınamamıştır; bu "dönüşüm yok" demek değildir. ${PARA_NOTU}`,
    girdi: nesne(JS_METRIK),
    async calistir(args, ortam) {
      const a = suz(metrikSemasi, args);
      const k = await baglam(a, ortam);
      const q = sorgu(metricsQuerySchema, metrikSorgusu(a));
      return { kapsam: kapsamOzeti(k), veri: await ortam.metrics.conversionDetail(k.context, q) };
    },
  },
  {
    ad: 'veri_kapsami',
    baslik: 'Veri aralığı',
    aciklama: 'Seçili kapsamda verinin bulunduğu ilk ve son gün. Boş bir sonuç görünce önce bunu çağır: dönem verinin dışında olabilir.',
    girdi: nesne({ ...JS_KAPSAM, platform: JS_SUZGEC.platform, reklam_hesabi_id: JS_SUZGEC.reklam_hesabi_id }),
    async calistir(args, ortam) {
      const a = suz(
        { ...kapsamAlanlari, platform: suzgecAlanlari.platform, reklam_hesabi_id: suzgecAlanlari.reklam_hesabi_id },
        args,
      );
      const k = await baglam(a, ortam);
      const q = sorgu(metricsQuerySchema, { ...donem({}), platform: a.platform, adAccountId: a.reklam_hesabi_id });
      return { kapsam: kapsamOzeti(k), veri: await ortam.metrics.coverage(k.context, q) };
    },
  },
];

export function araciBul(ad: string): OkumaAraci | undefined {
  return OKUMA_ARACLARI.find((a) => a.ad === ad);
}

/** Panel ve belge için: çalıştırıcısız, şemasız tanım. */
export function aracTanimlari(): OkumaAraciTanimi[] {
  return OKUMA_ARACLARI.map(({ ad, baslik, aciklama }) => ({ ad, baslik, aciklama }));
}
