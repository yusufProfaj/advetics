import { Prisma } from '@prisma/client';
import {
  ETKI,
  ETKI_ACIK_DURUMLARI,
  DENETIM_IZ_ANAHTARI,
  degisiklikIziSchema,
  degisiklikTuru,
  denetimEylemi,
  etkiGecisi,
  etkiHukmu,
  etkiPencereleri,
  formatMoney,
  karisikMi,
  birlikteOlculenler,
  olcumKapsami,
  onKosulNedeni,
  type DegisiklikSeviyesi,
  type DegisiklikTuru,
  type DegisiklikYolu,
  type EtkiDurumu,
  type EtkiGozlemi,
  type EtkiHukmu,
  type EtkiNedeni,
  type GunAraligi,
  type KapsamSeviyesi,
  type PencereToplami,
  type Platform,
} from '@advetics/shared';

/**
 * ═══ DEĞİŞİKLİK ETKİSİ İŞİ (`impact_evaluate`, docs/etki/MIMARI.md § 5) ═══
 *
 * Hesap başına, günde bir: önce KEŞİF (yeni değişiklikleri satıra çevir),
 * sonra DEĞERLENDİRME (zamanı gelmiş açık satırları ölç). PLATFORM ÇAĞRISI
 * YOK: girdiler audit_logs, rule_action_logs ve insights_daily. Worker'ın
 * BYPASSRLS istemcisiyle koşuyor (`db`; testte PGlite, GERÇEK sorgu).
 *
 * Kararların hepsi shared'daki SAF fonksiyonlarda (`etkiHukmu`,
 * `etkiGecisi`, `karisikMi`, `olcumKapsami`); burada yalnız veritabanından
 * toplamları okuyup onlara veriyoruz. İkinci bir hüküm mantığı yazmak,
 * ekranın gösterdiği cümle ile işin verdiği kararı ayrıştırırdı.
 */

export type TxLike = {
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
};

/** `YYYY-MM-DD` üzerinde gün kaydırma, Date'e çevirmeden (saat dilimi kayması). */
export function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * ÖLÇÜLEN denetim eylemleri (satır açabilenler). Liste AÇIK yazılı ve
 * düzenli ifade değil: bir desen `copy` gibi durum/bütçe değiştirmeyen
 * eylemleri de yakalardı. `resume` ölçülmüyor ama okunuyor: karışıklık
 * onu görmek zorunda (`YAZMA_DENETIM_EYLEMLERI`).
 */
export const OLCULEN_DENETIM_EYLEMLERI = [
  'campaign.pause',
  'campaign.set_budget',
  'ad_group.pause',
  'ad_group.set_budget',
  'ad.pause',
] as const;

/** Kural motorunun ölçülen eylem tipleri (`rule_action_logs.action_type`). */
export const OLCULEN_KURAL_EYLEMLERI = ['pause', 'adjust_budget'] as const;

/** Eski İyileştir uygulamasını denetim satırıyla eşleme penceresi (MIMARI Ç-C2). */
export const ESKI_ESLEME_DAKIKA = 10;

interface HesapSatiri {
  id: string;
  client_id: string | null;
  platform: Platform;
  name: string;
  currency: string;
  timezone: string;
}

/** Keşfin bir değişiklik için topladığı her şey; satır bu nesneden yazılıyor. */
interface Aday {
  kaynak: 'kampanya_eylemi' | 'kural';
  kaynakId: string;
  clientId: string;
  yol: DegisiklikYolu;
  yolRef: string | null;
  kim: string | null;
  tur: DegisiklikTuru;
  seviye: DegisiklikSeviyesi;
  varlikId: string;
  once: Record<string, unknown>;
  sonra: Record<string, unknown>;
  zaman: Date;
  gun: string;
  dogrulandi: boolean;
}

export interface KesifSonucu {
  yeni: number;
  /** Ölçülmeyen eylem (aynı bütçeyi yeniden yazmak, okunamayan tutar). */
  olculmez: number;
  /** Platformda doğrulanmadığı için doğrudan "ölçülemedi" yazılan. */
  dogrulanmadi: number;
  /** Varlığı aynada bulunamayan (silinmiş) değişiklik. */
  varlikYok: number;
}

export interface DegerlendirmeSonucu {
  bakilan: number;
  sonuclandi: number;
  henuz: number;
  olculemedi: Partial<Record<EtkiNedeni, number>>;
}

export interface EtkiIsSonucu {
  rows: number;
  note: string;
  kesif: KesifSonucu;
  degerlendirme: DegerlendirmeSonucu;
}

/** Ön koşul notu: iş hiçbir şey okumadan bittiyse not bununla başlar. */
export const ETKI_ON_KOSUL_NOTU = 'hesaplanmadı:';

/**
 * İşin tamamı. `bugun` HESABIN bugünü (`datesForJob`): değerlendirme
 * "sonraki ölçüm günü bugüne geldi mi" sorusunu hesabın takvimiyle soruyor.
 */
export async function etkiIsi(db: TxLike, adAccountId: string, bugun: string, simdi = new Date()): Promise<EtkiIsSonucu> {
  const bosKesif: KesifSonucu = { yeni: 0, olculmez: 0, dogrulanmadi: 0, varlikYok: 0 };
  const bosDeg: DegerlendirmeSonucu = { bakilan: 0, sonuclandi: 0, henuz: 0, olculemedi: {} };
  const hesap = await hesapOku(db, adAccountId);
  if (!hesap) return { rows: 0, note: `${ETKI_ON_KOSUL_NOTU} reklam hesabı bulunamadı`, kesif: bosKesif, degerlendirme: bosDeg };

  // Atanmamış hesapta KEŞİF YOK (değişikliğin sahibi yok) ama açık satırların
  // değerlendirmesi SÜRÜYOR: hesap havuza dönmüş olabilir ve o satırlar
  // "hesap taşındı" ile kapanmalı, sonsuza kadar "ölçülüyor" kalmamalı.
  const kesif = hesap.client_id ? await kesfet(db, hesap, simdi) : bosKesif;
  const degerlendirme = await degerlendir(db, hesap, bugun, simdi);
  return {
    rows: kesif.yeni + degerlendirme.bakilan,
    note: isNotu(kesif, degerlendirme, hesap.client_id === null),
    kesif,
    degerlendirme,
  };
}

/**
 * NOT ZORUNLU: `succeeded + rows = 0` bu projede bir hata türü (CLAUDE.md).
 * Sıfır satırlık koşu da NEDENİ söylüyor: "keşif: 0 yeni" ile "hiç
 * koşmadı" ekranda ayrı görünmeli.
 */
export function isNotu(k: KesifSonucu, d: DegerlendirmeSonucu, atanmamis: boolean): string {
  const kesifParcalari = [
    k.olculmez > 0 ? `${k.olculmez} ölçülmez` : null,
    k.dogrulanmadi > 0 ? `${k.dogrulanmadi} doğrulanmamış` : null,
    k.varlikYok > 0 ? `${k.varlikYok} varlığı bulunamadı` : null,
  ].filter(Boolean);
  const kesif = atanmamis
    ? 'keşif: hesap bir workspace’e atanmamış, atlandı'
    : `keşif: ${k.yeni} yeni${kesifParcalari.length > 0 ? ` (${kesifParcalari.join(', ')})` : ''}`;
  const nedenAdi: Record<string, string> = {
    karisik: 'karışık',
    kontrol_grubu_yok: 'kontrol yok',
    hesap_tasindi: 'hesap taşındı',
    veri_yok: 'veri yok',
    dogrulanmadi: 'doğrulanmadı',
  };
  const olculemedi = Object.entries(d.olculemedi).map(([n, s]) => `${s} ${nedenAdi[n] ?? n}`);
  const degParcalari = [
    `${d.sonuclandi} sonuçlandı`,
    `${d.henuz} henüz`,
    ...olculemedi,
  ];
  return `${kesif} · değerlendirme: ${d.bakilan}${d.bakilan > 0 ? ` (${degParcalari.join(', ')})` : ''}`;
}

async function hesapOku(db: TxLike, adAccountId: string): Promise<HesapSatiri | null> {
  const [h] = await db.$queryRaw<HesapSatiri[]>(Prisma.sql`
    SELECT a.id::text AS id, a.client_id::text AS client_id, a.platform::text AS platform,
           a.name, a.currency, a.timezone
      FROM ad_accounts a
     WHERE a.id = ${adAccountId}::uuid`);
  return h ?? null;
}

/** Hesabın varlıklarının kimlikleri (metin): denetim kaydının `target_id`si metin. */
function hesabinVarliklari(adAccountId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id::text FROM campaigns c WHERE c.ad_account_id = ${adAccountId}::uuid
    UNION ALL SELECT g.id::text FROM ad_groups g WHERE g.ad_account_id = ${adAccountId}::uuid
    UNION ALL SELECT x.id::text FROM ads x WHERE x.ad_account_id = ${adAccountId}::uuid`;
}

function metin(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return null;
}

function nesne(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ─── BİZİM YAZMALARIMIZ (keşif ve karışıklığın TEK kaynağı) ─────────────────

/**
 * Advetics'in bu hesaba yaptığı HER durum/bütçe yazması: ölçülenler
 * (durdur, bütçe) ve ölçülmeyenler (yeniden başlatma, aynı değeri yeniden
 * yazma, zaten durmuş varlığı durdurma). İki tüketicisi var ve İKİSİ DE
 * BURADAN okuyor:
 *
 * - keşif: ölçülenlerden satır açıyor,
 * - karışıklık ve kontrol grubu: ölçülmeyenler de dahil HEPSİNE bakıyor.
 *
 * Neden tek fonksiyon (Ajan 4, Ö-2): karışıklık bir süre yalnız
 * `degisiklik_etkileri` tablosuna bakıyordu ve satır açmayan bir yeniden
 * başlatmayı HİÇ görmüyordu; aynı setteki ikinci reklamın açılması ölçülen
 * durdurmanın "sonrası"na karışıyor, ekranda yanlış bir "İyileşti" yazıyordu.
 * İkinci bir sorgu yazmak, bir eylem birine eklenip diğerine eklenmediğinde
 * aynı hatayı geri getirirdi.
 */
export const YAZMA_DENETIM_EYLEMLERI = [
  ...OLCULEN_DENETIM_EYLEMLERI,
  'campaign.resume',
  'ad_group.resume',
  'ad.resume',
] as const;
export const YAZMA_KURAL_EYLEMLERI = [...OLCULEN_KURAL_EYLEMLERI, 'resume'] as const;

export interface Yazma {
  kaynak: 'kampanya_eylemi' | 'kural';
  kaynakId: string;
  clientId: string;
  /** Ham eylem: `pause`, `resume`, `set_budget`, `adjust_budget`. */
  eylem: string;
  seviye: DegisiklikSeviyesi;
  varlikId: string;
  once: Record<string, unknown>;
  sonra: Record<string, unknown>;
  zaman: Date;
  /** Hesabın saat diliminde gün. */
  gun: string;
  /** Kural kaynağında kural adı, denetimde uygulayan kişinin adı (kopya). */
  kim: string | null;
  kuralId: string | null;
  /** Varlığın kampanyası: karışıklık "aynı kampanya" sorusunu buna soruyor. */
  kampanyaId: string | null;
}

type YazmaSiniri = { basZaman: Date } | { basGun: string; sonGun: string };

export async function yazmalar(db: TxLike, hesap: HesapSatiri, sinir: YazmaSiniri): Promise<Yazma[]> {
  const denetimZamani =
    'basZaman' in sinir
      ? Prisma.sql`l.created_at >= ${sinir.basZaman}::timestamptz`
      : Prisma.sql`(l.created_at AT TIME ZONE ${hesap.timezone})::date BETWEEN ${sinir.basGun}::date AND ${sinir.sonGun}::date`;
  const kuralZamani =
    'basZaman' in sinir
      ? Prisma.sql`x.created_at >= ${sinir.basZaman}::timestamptz`
      : Prisma.sql`(x.created_at AT TIME ZONE ${hesap.timezone})::date BETWEEN ${sinir.basGun}::date AND ${sinir.sonGun}::date`;

  /*
   * KAYNAK 1 — kampanya eylemi (audit_logs). Kural motorunun denetim
   * satırları BURADA OKUNMUYOR: onların eylemi `rule.<tip>` biçiminde ve
   * hedefleri platform kimliği, yani eylem listesi onları zaten dışarıda
   * bırakıyor. `actor_type <> 'rule'` süzgeci bir SAVUNMA: kural kaynaklı
   * bir satır bir gün kampanya eylemi adıyla ve bizim kimliğimizle yazılırsa
   * kural değişikliği iki kez ölçülürdü (etki-hesap.spec.ts o hâli kurup
   * sınıyor). Kural değişiklikleri aşağıda rule_action_logs'tan.
   */
  const denetim = await db.$queryRaw<
    Array<{ id: string; client_id: string; action: string; target_id: string; before: unknown; after: unknown; zaman: Date; gun: string; kim: string | null; kampanya_id: string | null }>
  >(Prisma.sql`
    SELECT l.id::text AS id, l.client_id::text AS client_id, l.action, l.target_id,
           l.before, l.after, l.created_at AS zaman,
           (l.created_at AT TIME ZONE ${hesap.timezone})::date::text AS gun,
           u.full_name AS kim,
           CASE split_part(l.action, '.', 1)
             WHEN 'campaign' THEN l.target_id
             WHEN 'ad_group' THEN (SELECT g.campaign_id::text FROM ad_groups g WHERE g.id = l.target_id::uuid)
             WHEN 'ad' THEN (SELECT g.campaign_id::text FROM ads x JOIN ad_groups g ON g.id = x.ad_group_id WHERE x.id = l.target_id::uuid)
           END AS kampanya_id
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.actor_id
     WHERE ${denetimZamani}
       AND l.actor_type <> 'rule'::"ActorType"
       AND l.action = ANY(${[...YAZMA_DENETIM_EYLEMLERI]}::text[])
       AND l.client_id IS NOT NULL
       AND l.target_id IN (${hesabinVarliklari(hesap.id)})
     ORDER BY l.created_at, l.id`);

  /* KAYNAK 2 — kural (rule_action_logs, yalnız `applied`). Kural adı KOPYALANIYOR. */
  const kurallar = await db.$queryRaw<
    Array<{ id: string; client_id: string; rule_id: string; kural_adi: string; action_type: string; seviye: string; varlik_id: string; before_state: unknown; after_state: unknown; zaman: Date; gun: string; kampanya_id: string | null }>
  >(Prisma.sql`
    SELECT x.id::text AS id, r.client_id::text AS client_id, r.id::text AS rule_id, r.name AS kural_adi,
           x.action_type, x.entity_level::text AS seviye, x.entity_id::text AS varlik_id,
           x.before_state, x.after_state, x.created_at AS zaman,
           (x.created_at AT TIME ZONE ${hesap.timezone})::date::text AS gun,
           CASE x.entity_level
             WHEN 'campaign'::"EntityLevel" THEN x.entity_id::text
             WHEN 'ad_group'::"EntityLevel" THEN (SELECT g.campaign_id::text FROM ad_groups g WHERE g.id = x.entity_id)
             WHEN 'ad'::"EntityLevel" THEN (SELECT g.campaign_id::text FROM ads a JOIN ad_groups g ON g.id = a.ad_group_id WHERE a.id = x.entity_id)
           END AS kampanya_id
      FROM rule_action_logs x
      JOIN rules r ON r.id = x.rule_id
     WHERE ${kuralZamani}
       AND x.outcome = 'applied'
       AND x.action_type = ANY(${[...YAZMA_KURAL_EYLEMLERI]}::text[])
       AND x.entity_level IN ('campaign'::"EntityLevel", 'ad_group'::"EntityLevel", 'ad'::"EntityLevel")
       AND x.entity_id::text IN (${hesabinVarliklari(hesap.id)})
     ORDER BY x.created_at, x.id`);

  const r: Yazma[] = [];
  for (const l of denetim) {
    const e = denetimEylemi(l.action);
    if (!e) continue;
    r.push({
      kaynak: 'kampanya_eylemi',
      kaynakId: l.id,
      clientId: l.client_id,
      eylem: e.eylem,
      seviye: e.seviye,
      varlikId: l.target_id,
      once: nesne(l.before),
      sonra: nesne(l.after),
      zaman: new Date(l.zaman),
      gun: l.gun,
      kim: l.kim,
      kuralId: null,
      kampanyaId: l.kampanya_id,
    });
  }
  for (const k of kurallar) {
    r.push({
      kaynak: 'kural',
      kaynakId: k.id,
      clientId: k.client_id,
      eylem: k.action_type,
      seviye: k.seviye as DegisiklikSeviyesi,
      varlikId: k.varlik_id,
      once: nesne(k.before_state),
      sonra: nesne(k.after_state),
      zaman: new Date(k.zaman),
      gun: k.gun,
      kim: k.kural_adi,
      kuralId: k.rule_id,
      kampanyaId: k.kampanya_id,
    });
  }
  return r;
}

/** Yazmanın SONRA bütçesi: geri okumalı yol `istenen.amountMicros`, diğerleri `budgetAmountMicros`. */
function sonraButce(y: Pick<Yazma, 'sonra'>): string | null {
  return metin(nesne(y.sonra.istenen).amountMicros) ?? metin(y.sonra.budgetAmountMicros);
}

/**
 * Yazma ölçülebilir bir değişiklik mi; değilse `null`. SAF.
 *
 * ZATEN DURMUŞ VARLIĞI DURDURMAK DEĞİŞİKLİK DEĞİL (Ajan 4, Ö-1): aynı
 * bütçeyi yeniden yazmanın eşi. Ayna "active" gösterirken platformda
 * çoktan durmuş bir varlığa durdur gönderilebiliyor; denetim kaydının
 * `before.status`u bunu söylüyor. Ölçülse değişmemiş bir şeyin "etkisi"
 * ekrana yazılırdı. Önceki durum BİLİNMİYORSA (alan yok) ölçülüyor: eski
 * kayıtların hepsini düşürmek, gerçek durdurmaları sessizce ölçümsüz bırakırdı.
 * Yeniden başlatma hiç ölçülmüyor (OLCULMEYEN_DEGISIKLIKLER, "baslat").
 */
export function yazmaTuru(y: Pick<Yazma, 'eylem' | 'once' | 'sonra'>): DegisiklikTuru | null {
  if (y.eylem === 'pause' && y.once.status === 'paused') return null;
  return degisiklikTuru(y.eylem, metin(y.once.budgetAmountMicros), sonraButce(y));
}

// ─── KEŞİF ───────────────────────────────────────────────────────────────────

/**
 * Son başarılı keşiften (ilk koşuda `ETKI.kesifGeriyeGun` gün) bu yana
 * Advetics'ten yapılmış değişiklikler. Bir gün ÖRTÜŞME bilerek: önceki
 * koşu tam sınırda yazılmış bir kaydı kaçırmış olabilir ve tekrar bakmak
 * bedava (`ON CONFLICT (kaynak, kaynak_id) DO NOTHING`).
 */
export async function kesfet(db: TxLike, hesap: HesapSatiri, simdi: Date): Promise<KesifSonucu> {
  const [son] = await db.$queryRaw<Array<{ t: Date | string | null }>>(Prisma.sql`
    SELECT max(started_at) AS t FROM sync_jobs
     WHERE ad_account_id = ${hesap.id}::uuid
       AND job_type = 'impact_evaluate'::"SyncJobType"
       AND status = 'succeeded'::"SyncJobStatus"`);
  const ilkSinir = new Date(simdi.getTime() - ETKI.kesifGeriyeGun * 86_400_000);
  const sonKosu = son?.t ? new Date(son.t) : null;
  const bas = sonKosu ? new Date(Math.max(sonKosu.getTime() - 86_400_000, ilkSinir.getTime())) : ilkSinir;
  const sonuc: KesifSonucu = { yeni: 0, olculmez: 0, dogrulanmadi: 0, varlikYok: 0 };

  const adaylar: Aday[] = [];
  for (const y of await yazmalar(db, hesap, { basZaman: bas })) {
    // Yeniden başlatma bilinen bir ölçülmeyen kategori ("baslat", ekranda
    // listeli); "ölçülmez" sayacı ölçülebilir türde ama değişmeyen yazma için.
    if (y.eylem === 'resume') continue;
    const tur = yazmaTuru(y);
    if (!tur) {
      sonuc.olculmez++;
      continue;
    }
    const istenen = nesne(y.sonra.istenen);
    let yol: DegisiklikYolu = 'kural';
    let yolRef: string | null = y.kuralId;
    if (y.kaynak === 'kampanya_eylemi') {
      // Anahtar sözleşmeden: yazan (CampaignActionsService.izli) ile okuyan AYNI sabiti kullanıyor.
      const iz = degisiklikIziSchema.safeParse(y.sonra[DENETIM_IZ_ANAHTARI]);
      yol = iz.success ? iz.data.yol : 'bilinmiyor';
      yolRef = iz.success ? iz.data.ref : null;
      if (!iz.success) {
        const eski = await eskiIyilestirEslemesi(db, y.clientId, y.varlikId, y.zaman);
        if (eski) {
          yol = 'iyilestir';
          yolRef = eski;
        }
      }
    }
    adaylar.push({
      kaynak: y.kaynak,
      kaynakId: y.kaynakId,
      clientId: y.clientId,
      yol,
      yolRef,
      kim: y.kim,
      tur,
      seviye: y.seviye,
      varlikId: y.varlikId,
      once: {
        status: y.once.status ?? null,
        budgetMode: y.once.budgetMode ?? null,
        budgetAmountMicros: metin(y.once.budgetAmountMicros),
        paraBirimi: hesap.currency,
      },
      sonra: {
        status: tur === 'durdur' ? 'paused' : (y.once.status ?? null),
        budgetMode: istenen.budgetMode ?? y.sonra.budgetMode ?? y.once.budgetMode ?? null,
        budgetAmountMicros: sonraButce(y),
        dogrulama: typeof y.sonra.dogrulama === 'string' ? y.sonra.dogrulama : null,
      },
      zaman: y.zaman,
      gun: y.gun,
      /*
       * DOĞRULAMA: geri okumalı yol (`uygula`) `dogrulama` yazıyor ve
       * `uyusmadi` ise değişiklik olmamış olabilir. Geri okumasız yol
       * (`applyAction`, kural motoru) platformun döndürdüğü `afterState`i
       * yazıyor; hata fırlatmadan döndüyse yazma kabul edilmiş sayılıyor
       * (MIMARI Ç-C12).
       */
      dogrulandi: y.sonra.dogrulama !== 'uyusmadi',
    });
  }

  for (const a of adaylar) {
    const v = await varlikBilgisi(db, hesap, a.seviye, a.varlikId, a.tur);
    if (!v) {
      sonuc.varlikYok++;
      continue;
    }
    const pencere = etkiPencereleri(a.gun, ETKI.olcumNoktalariGun[0]!);
    // DOĞRULANMAMIŞ değişiklik keşifte kapanıyor: olmamış olabilecek bir
    // değişikliğin etkisini ölçmek uydurma olurdu. Geçiş yine tablodan.
    const gecis = a.dogrulandi ? null : etkiGecisi('bekliyor', ETKI.olcumNoktalariGun[0]!, 'dogrulanmadi', null);
    const durum: EtkiDurumu = gecis ? gecis.durum : 'bekliyor';
    const n = await db.$executeRaw(Prisma.sql`
      INSERT INTO degisiklik_etkileri (
        org_id, client_id, ad_account_id, platform, kaynak, kaynak_id, yol, yol_ref, kim, tur,
        seviye, varlik_id, varlik_adi, ust_adi, kapsam_seviye, kapsam_id, kapsam_adi,
        once_deger, sonra_deger, degisiklik_zamani, degisiklik_gunu, durum, neden, sonraki_olcum, updated_at)
      SELECT c.org_id, c.id, ${hesap.id}::uuid, ${hesap.platform}::"Platform", ${a.kaynak}, ${a.kaynakId},
             ${a.yol}, ${a.yolRef?.slice(0, 200) ?? null}, ${a.kim?.slice(0, 255) ?? null}, ${a.tur},
             ${a.seviye}::"EntityLevel", ${a.varlikId}::uuid, ${v.ad.slice(0, 300)}, ${v.ustAd?.slice(0, 300) ?? null},
             ${v.kapsamSeviye}::"EntityLevel", ${v.kapsamId}::uuid, ${v.kapsamAdi.slice(0, 300)},
             ${JSON.stringify(a.once)}::jsonb, ${JSON.stringify(a.sonra)}::jsonb,
             ${a.zaman}::timestamptz, ${a.gun}::date, ${durum},
             ${gecis ? 'dogrulanmadi' : null}, ${gecis ? null : pencere.hesaplanabilir}::date, now()
        FROM clients c WHERE c.id = ${a.clientId}::uuid
      ON CONFLICT (kaynak, kaynak_id) DO NOTHING`);
    if (n > 0) {
      sonuc.yeni += n;
      if (gecis) sonuc.dogrulanmadi += n;
    }
  }
  return sonuc;
}

/**
 * ESKİ İYİLEŞTİR UYGULAMALARI: `iz` parametresinden önce yazılmış denetim
 * satırları "nereden geldi" bilgisini taşımıyor. Aynı varlığa ±10 dakika
 * içinde verilmiş `uygulandi` kararı varsa İyileştir'den gelmiştir; yoksa
 * "bilinmiyor" kalır, TAHMİN EDİLMEZ. En yakın karar seçiliyor.
 */
async function eskiIyilestirEslemesi(db: TxLike, clientId: string, varlikId: string, zaman: Date): Promise<string | null> {
  const [r] = await db.$queryRaw<Array<{ anahtar: string }>>(Prisma.sql`
    SELECT k.anahtar FROM iyilestir_oneri_karar k
     WHERE k.client_id = ${clientId}::uuid
       AND k.durum = 'uygulandi'
       AND k.eylem->'varlik'->>'id' = ${varlikId}
       AND k.created_at BETWEEN ${zaman}::timestamptz - make_interval(mins => ${ESKI_ESLEME_DAKIKA}::int)
                            AND ${zaman}::timestamptz + make_interval(mins => ${ESKI_ESLEME_DAKIKA}::int)
     ORDER BY abs(extract(epoch FROM k.created_at - ${zaman}::timestamptz)), k.id
     LIMIT 1`);
  return r?.anahtar ?? null;
}

interface VarlikBilgisi {
  ad: string;
  ustAd: string | null;
  kapsamSeviye: KapsamSeviyesi;
  kapsamId: string;
  kapsamAdi: string;
}

/**
 * Varlığın adı, üstünün adı ve ÖLÇÜLEN KAPSAM (`olcumKapsami`): bütçede
 * kendisi, durdurmada üstü. Adlar KOPYALANIYOR; varlık sonradan silinse de
 * satır okunabilsin.
 */
async function varlikBilgisi(
  db: TxLike,
  hesap: HesapSatiri,
  seviye: DegisiklikSeviyesi,
  id: string,
  tur: DegisiklikTuru,
): Promise<VarlikBilgisi | null> {
  const k = olcumKapsami(tur, seviye);
  if (seviye === 'campaign') {
    const [c] = await db.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT name FROM campaigns WHERE id = ${id}::uuid AND ad_account_id = ${hesap.id}::uuid`);
    if (!c) return null;
    if (k.seviye === 'account') return { ad: c.name, ustAd: hesap.name, kapsamSeviye: 'account', kapsamId: hesap.id, kapsamAdi: hesap.name };
    return { ad: c.name, ustAd: hesap.name, kapsamSeviye: 'campaign', kapsamId: id, kapsamAdi: c.name };
  }
  if (seviye === 'ad_group') {
    const [g] = await db.$queryRaw<Array<{ name: string; kampanya_id: string; kampanya_adi: string }>>(Prisma.sql`
      SELECT g.name, c.id::text AS kampanya_id, c.name AS kampanya_adi
        FROM ad_groups g JOIN campaigns c ON c.id = g.campaign_id
       WHERE g.id = ${id}::uuid AND g.ad_account_id = ${hesap.id}::uuid`);
    if (!g) return null;
    if (k.seviye === 'campaign') return { ad: g.name, ustAd: g.kampanya_adi, kapsamSeviye: 'campaign', kapsamId: g.kampanya_id, kapsamAdi: g.kampanya_adi };
    return { ad: g.name, ustAd: g.kampanya_adi, kapsamSeviye: 'ad_group', kapsamId: id, kapsamAdi: g.name };
  }
  const [x] = await db.$queryRaw<Array<{ name: string; set_id: string; set_adi: string }>>(Prisma.sql`
    SELECT x.name, g.id::text AS set_id, g.name AS set_adi
      FROM ads x JOIN ad_groups g ON g.id = x.ad_group_id
     WHERE x.id = ${id}::uuid AND x.ad_account_id = ${hesap.id}::uuid`);
  if (!x) return null;
  return { ad: x.name, ustAd: x.set_adi, kapsamSeviye: 'ad_group', kapsamId: x.set_id, kapsamAdi: x.set_adi };
}

// ─── DEĞERLENDİRME ───────────────────────────────────────────────────────────

interface AcikSatir {
  id: string;
  client_id: string;
  durum: EtkiDurumu;
  tur: DegisiklikTuru;
  seviye: DegisiklikSeviyesi;
  varlik_id: string;
  kapsam_seviye: KapsamSeviyesi;
  kapsam_id: string;
  kampanya_id: string | null;
  kaynak: 'kampanya_eylemi' | 'kural';
  kaynak_id: string;
  zaman: Date;
  gun: string;
  nokta_gun: number | null;
  sonra_deger: unknown;
}

/**
 * Bir etki satırının KAMPANYASI. Karışıklık ve kontrol grubu "aynı
 * kampanyada başka değişiklik var mı" sorusunu buna soruyor. Hesap
 * seviyesinde kapsamı olan (kampanya durdurma) satırın kampanyası
 * kendisi; hesap kapsamı ayrıca ele alınıyor.
 */
const KAMPANYA_ID = Prisma.sql`
  CASE e.seviye
    WHEN 'campaign'::"EntityLevel" THEN e.varlik_id
    WHEN 'ad_group'::"EntityLevel" THEN (SELECT g.campaign_id FROM ad_groups g WHERE g.id = e.varlik_id)
    WHEN 'ad'::"EntityLevel" THEN (SELECT g.campaign_id FROM ads x JOIN ad_groups g ON g.id = x.ad_group_id WHERE x.id = e.varlik_id)
  END`;

/** Hesabın workspace'ini değiştiren denetim eylemleri (connections.service.ts). */
export const HESAP_TASIMA_EYLEMLERI = ['ad_account.assigned', 'ad_account.unassigned', 'ad_account.unassigned_by_client'] as const;

/**
 * HESAP, ÖLÇÜM PENCERESİ İÇİNDE Mİ TAŞINDI? (Ajan 4, N-1)
 *
 * Bugünkü sahibin satırın sahibinden farklı olması tek başına yetmiyor:
 * hesap pencere KAPANDIKTAN SONRA taşındıysa pencerenin bütün günleri eski
 * workspace'in döneminde ve ölçüm geçerli. Taşıma günü değişiklikten
 * sonraki İLK atama/kaldırma denetim kaydından (hesabın saat diliminde)
 * okunuyor; o gün pencerenin sonundan SONRAYSA taşınmamış sayılıyor.
 *
 * TAŞIMA KAYDI BULUNAMAZSA bugünkü davranış: "taşındı". Kayıt yoksa
 * taşımanın ne zaman olduğu bilinmiyor; yeni sahibin günlerini eski
 * sahibin değişikliğine yazma ihtimali, ölçümü kaybetmekten pahalı.
 */
async function hesapTasindiMi(db: TxLike, hesap: HesapSatiri, s: Pick<AcikSatir, 'client_id' | 'zaman'>, pencereSonu: string): Promise<boolean> {
  if (hesap.client_id === s.client_id) return false;
  const [t] = await db.$queryRaw<Array<{ gun: string }>>(Prisma.sql`
    SELECT (l.created_at AT TIME ZONE ${hesap.timezone})::date::text AS gun
      FROM audit_logs l
     WHERE l.target_id = ${hesap.id}
       AND l.action = ANY(${[...HESAP_TASIMA_EYLEMLERI]}::text[])
       AND l.created_at > ${s.zaman}::timestamptz
     ORDER BY l.created_at
     LIMIT 1`);
  if (!t) return true;
  return t.gun <= pencereSonu;
}

export async function degerlendir(db: TxLike, hesap: HesapSatiri, bugun: string, simdi: Date): Promise<DegerlendirmeSonucu> {
  const sonuc: DegerlendirmeSonucu = { bakilan: 0, sonuclandi: 0, henuz: 0, olculemedi: {} };
  /*
   * YALNIZ AÇIK VE ZAMANI GELMİŞ SATIRLAR. Durum süzgeci kalkarsa kapanmış
   * satır `etkiGecisi`te patlar (tasarım gereği); tarih süzgeci kalkarsa
   * dönüşümler olgunlaşmadan ölçülür ve "henüz belli değil" erken yazılır.
   */
  const satirlar = await db.$queryRaw<AcikSatir[]>(Prisma.sql`
    SELECT e.id::text AS id, e.client_id::text AS client_id, e.durum, e.tur, e.seviye::text AS seviye,
           e.varlik_id::text AS varlik_id, e.kapsam_seviye::text AS kapsam_seviye, e.kapsam_id::text AS kapsam_id,
           (${KAMPANYA_ID})::text AS kampanya_id, e.kaynak, e.kaynak_id, e.degisiklik_zamani AS zaman,
           e.degisiklik_gunu::text AS gun, e.nokta_gun::int AS nokta_gun, e.sonra_deger
      FROM degisiklik_etkileri e
     WHERE e.ad_account_id = ${hesap.id}::uuid
       AND e.durum = ANY(${[...ETKI_ACIK_DURUMLARI]}::text[])
       AND e.sonraki_olcum <= ${bugun}::date
     ORDER BY e.degisiklik_zamani, e.id`);

  for (const s of satirlar) {
    const noktaGun = ETKI.olcumNoktalariGun.find((n) => s.nokta_gun === null || n > s.nokta_gun) ?? ETKI.olcumNoktalariGun[ETKI.olcumNoktalariGun.length - 1]!;
    const sonNokta = noktaGun === ETKI.olcumNoktalariGun[ETKI.olcumNoktalariGun.length - 1];
    const p = etkiPencereleri(s.gun, noktaGun);

    // ── Ön koşullar (hüküm hesaplanmadan, ucuzdan pahalıya) ──
    const dogrulandi = nesne(s.sonra_deger).dogrulama !== 'uyusmadi';
    const hesapTasindi = await hesapTasindiMi(db, hesap, s, p.sonra.son);
    const kapsamToplami = await toplamlar(db, hesap.id, s.kapsam_seviye, s.kapsam_seviye === 'account' ? null : [s.kapsam_id], p);
    // Penceredeki BÜTÜN yazmalarımız (ölçülmeyenler dahil), kendisi hariç: karışıklık ve kontrol AYNI listeden.
    const penceredekiler = (await yazmalar(db, hesap, { basGun: p.plasebo.bas, sonGun: p.sonra.son })).filter(
      (y) => !(y.kaynak === s.kaynak && y.kaynakId === s.kaynak_id),
    );
    const digerleri = digerDegisiklikler(s, penceredekiler);
    const bu = { gun: s.gun, tur: s.tur };
    const onKosul = onKosulNedeni({
      dogrulandi,
      hesapTasindi,
      veriYok: kapsamToplami.sonraSatir === 0,
      // Ölçülmeyen yazmanın türü yok (null): hiçbir türle "aynı gün aynı tür" istisnasına girmiyor, karıştırıyor.
      karisik: karisikMi(bu, digerleri as Array<{ gun: string; tur: DegisiklikTuru }>, noktaGun),
    });
    // Birlikte ölçülen = aynı gün aynı ÖLÇÜLEN tür; ölçülmeyen yazma (tur null) kardeş sayılmaz.
    const birlikte = birlikteOlculenler(
      bu,
      digerleri.filter((d): d is { gun: string; tur: DegisiklikTuru } => d.tur !== null),
    );

    let hukum: EtkiHukmu | null = null;
    let kontrolIds: string[] = [];
    let kontrolToplami: Toplamlar | null = null;
    let gozlem: EtkiGozlemi | null = null;
    if (!onKosul) {
      const kapsam = olcumKapsami(s.tur, s.seviye);
      if (kapsam.kontrol) {
        const disari = [...new Set(penceredekiler.map((y) => y.kampanyaId).filter((k): k is string => k !== null))];
        kontrolIds = await kontrolGrubu(db, hesap.id, s, p, kapsam.kontroldenCikar === 'ayni_kampanyanin_setleri', disari);
        kontrolToplami = kontrolIds.length > 0 ? await toplamlar(db, hesap.id, s.kapsam_seviye, kontrolIds, p) : null;
      }
      hukum = etkiHukmu({
        deney: { plasebo: kapsamToplami.plasebo, once: kapsamToplami.once, sonra: kapsamToplami.sonra },
        kontrol: kontrolToplami ? { plasebo: kontrolToplami.plasebo, once: kontrolToplami.once, sonra: kontrolToplami.sonra } : null,
        sonNokta,
      });
      if (hukum.neden === 'kontrol_grubu_yok' && s.tur === 'durdur') {
        // GÖZLEM: hüküm değil olgu. Durdurulan varlığın KENDİSİ, öncesi/sonrası.
        const kendi = await toplamlar(db, hesap.id, s.seviye, [s.varlik_id], p);
        gozlem = gozlemUret(kendi, hesap.currency);
      }
    }
    const gecis = etkiGecisi(s.durum, noktaGun, onKosul, hukum);
    const neden: EtkiNedeni | null = onKosul ?? hukum?.neden ?? null;
    const sonraki = gecis.sonrakiNoktaGun === null ? null : etkiPencereleri(s.gun, gecis.sonrakiNoktaGun).hesaplanabilir;
    const olcum = onKosul
      ? { pencereler: p, onKosul }
      : {
          pencereler: p,
          paraBirimi: hesap.currency,
          deney: { plasebo: kapsamToplami.plasebo, once: kapsamToplami.once, sonra: kapsamToplami.sonra },
          kontrol: kontrolToplami
            ? { plasebo: kontrolToplami.plasebo, once: kontrolToplami.once, sonra: kontrolToplami.sonra, varliklar: kontrolIds, sayi: kontrolIds.length }
            : null,
          esik: hukum?.esik ?? null,
          plasebo: hukum?.plasebo ?? null,
        };

    /*
     * DURUM KOŞULU UPDATE'İN İÇİNDE: aynı satır iki işte birden
     * değerlendirilirse (elle tetik + süpürme) ikincisi sıfır satır etkiler,
     * aynı noktayı iki kez işlemez.
     */
    const n = await db.$executeRaw(Prisma.sql`
      UPDATE degisiklik_etkileri SET
        durum = ${gecis.durum}, sonuc = ${gecis.sonuc}, neden = ${neden},
        metrik = ${hukum?.metrik ?? null}, etki_orani = ${hukum?.etki ?? null}::numeric,
        nokta_gun = ${noktaGun}::smallint, sonraki_olcum = ${sonraki}::date,
        birlikte_olculen = ${birlikte}::smallint,
        olcum = ${JSON.stringify(olcum)}::jsonb, gozlem = ${gozlem ? JSON.stringify(gozlem) : null}::jsonb,
        updated_at = ${simdi}::timestamptz
      WHERE id = ${s.id}::uuid AND durum = ${s.durum}`);
    if (n === 0) continue;
    sonuc.bakilan++;
    if (gecis.durum === 'sonuclandi') sonuc.sonuclandi++;
    else if (gecis.durum === 'olcumde') sonuc.henuz++;
    else if (neden) sonuc.olculemedi[neden] = (sonuc.olculemedi[neden] ?? 0) + 1;
  }
  return sonuc;
}

interface Toplamlar {
  plasebo: PencereToplami;
  once: PencereToplami;
  sonra: PencereToplami;
  /** Sonrası penceresindeki satır sayısı: 0 = veri hiç gelmedi (`veri_yok`). */
  sonraSatir: number;
}

function gunSayisi(a: GunAraligi): number {
  return Math.round((Date.parse(`${a.son}T00:00:00Z`) - Date.parse(`${a.bas}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Üç pencerenin toplamı TEK sorguda. Hesap kapsamında (`ids = null`)
 * kampanya satırlarının toplamı: hesap seviyesi satır her platformda
 * yazılmıyor (sinyal işi aynı geri düşüşü yapıyor) ve kampanya toplamı
 * kontrolsüz bir gözlem için yeterli.
 *
 * KIRILIMSIZ SATIRLAR (`breakdown_key = ''`): kırılım satırlarını da
 * toplamak aynı harcamayı yaş/cinsiyet sayısı kadar sayardı.
 */
async function toplamlar(
  db: TxLike,
  adAccountId: string,
  seviye: KapsamSeviyesi | DegisiklikSeviyesi,
  ids: string[] | null,
  p: { plasebo: GunAraligi; once: GunAraligi; sonra: GunAraligi },
): Promise<Toplamlar> {
  const duzey = seviye === 'account' ? 'campaign' : seviye;
  const varlik = ids === null ? Prisma.empty : Prisma.sql`AND i.entity_id = ANY(${ids}::uuid[])`;
  const [r] = await db.$queryRaw<
    Array<{ ps: string; pt: number; pd: number; os: string; ot: number; od: number; ss: string; st: number; sd: number; sn: number }>
  >(Prisma.sql`
    SELECT
      coalesce(sum(i.spend_micros) FILTER (WHERE i.date BETWEEN ${p.plasebo.bas}::date AND ${p.plasebo.son}::date), 0)::text AS ps,
      coalesce(sum(i.clicks) FILTER (WHERE i.date BETWEEN ${p.plasebo.bas}::date AND ${p.plasebo.son}::date), 0)::float8 AS pt,
      coalesce(sum(i.conversions) FILTER (WHERE i.date BETWEEN ${p.plasebo.bas}::date AND ${p.plasebo.son}::date), 0)::float8 AS pd,
      coalesce(sum(i.spend_micros) FILTER (WHERE i.date BETWEEN ${p.once.bas}::date AND ${p.once.son}::date), 0)::text AS os,
      coalesce(sum(i.clicks) FILTER (WHERE i.date BETWEEN ${p.once.bas}::date AND ${p.once.son}::date), 0)::float8 AS ot,
      coalesce(sum(i.conversions) FILTER (WHERE i.date BETWEEN ${p.once.bas}::date AND ${p.once.son}::date), 0)::float8 AS od,
      coalesce(sum(i.spend_micros) FILTER (WHERE i.date BETWEEN ${p.sonra.bas}::date AND ${p.sonra.son}::date), 0)::text AS ss,
      coalesce(sum(i.clicks) FILTER (WHERE i.date BETWEEN ${p.sonra.bas}::date AND ${p.sonra.son}::date), 0)::float8 AS st,
      coalesce(sum(i.conversions) FILTER (WHERE i.date BETWEEN ${p.sonra.bas}::date AND ${p.sonra.son}::date), 0)::float8 AS sd,
      count(*) FILTER (WHERE i.date BETWEEN ${p.sonra.bas}::date AND ${p.sonra.son}::date)::int AS sn
      FROM insights_daily i
     WHERE i.ad_account_id = ${adAccountId}::uuid
       AND i.breakdown_key = ''
       AND i.entity_level = ${duzey}::"EntityLevel"
       ${varlik}
       AND i.date BETWEEN ${p.plasebo.bas}::date AND ${p.sonra.son}::date`);
  const para = (m: string | undefined) => Number(BigInt(m ?? '0')) / 1_000_000;
  return {
    plasebo: { gun: gunSayisi(p.plasebo), harcama: para(r?.ps), tiklama: Number(r?.pt ?? 0), donusum: Number(r?.pd ?? 0) },
    once: { gun: gunSayisi(p.once), harcama: para(r?.os), tiklama: Number(r?.ot ?? 0), donusum: Number(r?.od ?? 0) },
    sonra: { gun: gunSayisi(p.sonra), harcama: para(r?.ss), tiklama: Number(r?.st ?? 0), donusum: Number(r?.sd ?? 0) },
    sonraSatir: Number(r?.sn ?? 0),
  };
}

/**
 * Aynı hesapta, pencere içinde (plasebo başından bu noktanın sonuna) AYNI
 * KAPSAMA dokunan diğer değişikliklerimiz. "Aynı kapsam" = aynı kampanya:
 * bir reklam setinin bütçesi ile aynı kampanyadaki reklamın durdurulması
 * birbirinin ölçümünü bozuyor (CBO'da bütçe kardeşlere akıyor). Hesap
 * kapsamında (kampanya durdurma) hesabın HER değişikliği.
 */
function digerDegisiklikler(s: AcikSatir, penceredekiler: readonly Yazma[]): Array<{ gun: string; tur: DegisiklikTuru | null }> {
  /*
   * DOĞRULANMAMIŞ ve ÖLÇÜLMEYEN yazmalar da SAYILIYOR: geri okuma uyuşmadı
   * diye değişikliğin OLMADIĞI bilinmiyor, yeniden başlatma ise ölçülmese
   * de aynı kampanyanın harcamasını değiştiriyor. Karışık demek, yanlış bir
   * sayı göstermekten ucuz.
   */
  return penceredekiler
    .filter((y) => s.kapsam_seviye === 'account' || (y.kampanyaId !== null && y.kampanyaId === s.kampanya_id))
    .map((y) => ({ gun: y.gun, tur: y.eylem === 'resume' ? null : yazmaTuru(y) }));
}

/**
 * KONTROL GRUBU: aynı hesap, kapsamla AYNI seviye, pencerede bizim
 * değişikliğimizin dokunduğu bir kampanyada OLMAYAN ve iki pencerede de
 * harcaması olan varlıklar.
 *
 * - Kapsamın kendisi çıkıyor (deney kendisiyle kıyaslanmaz).
 * - `ayniKampanyaCikar`: reklam seti kapsamında aynı kampanyanın setleri
 *   çıkıyor. Meta'da kampanya bütçesi (CBO) bir seti durdurunca bütçeyi
 *   KARDEŞ setlere aktarıyor; onları kontrole koymak etkiyi yarıya indirir
 *   ve hiçbir hata vermez (MIMARI Ç-C5).
 * - Pencerede başka değişikliğimizin dokunduğu kampanyalar (ve setleri)
 *   çıkıyor: onların kendi değişikliği kontrolü kirletir.
 */
async function kontrolGrubu(
  db: TxLike,
  adAccountId: string,
  s: AcikSatir,
  p: { plasebo: GunAraligi; once: GunAraligi; sonra: GunAraligi },
  ayniKampanyaCikar: boolean,
  /** Pencerede başka bir yazmamızın dokunduğu kampanyalar (`yazmalar`, kendisi hariç). */
  disari: string[],
): Promise<string[]> {
  const seviye = s.kapsam_seviye === 'ad_group' ? 'ad_group' : 'campaign';
  const kampanyaKolonu = seviye === 'ad_group' ? Prisma.sql`g.campaign_id` : Prisma.sql`a.entity_id`;
  const setJoin = seviye === 'ad_group' ? Prisma.sql`JOIN ad_groups g ON g.id = a.entity_id` : Prisma.empty;
  const kardesler =
    ayniKampanyaCikar && seviye === 'ad_group' && s.kampanya_id
      ? Prisma.sql`AND g.campaign_id <> ${s.kampanya_id}::uuid`
      : Prisma.empty;
  const r = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH aday AS (
      SELECT i.entity_id,
             sum(i.spend_micros) FILTER (WHERE i.date BETWEEN ${p.once.bas}::date AND ${p.once.son}::date) AS once_s,
             sum(i.spend_micros) FILTER (WHERE i.date BETWEEN ${p.sonra.bas}::date AND ${p.sonra.son}::date) AS sonra_s
        FROM insights_daily i
       WHERE i.ad_account_id = ${adAccountId}::uuid
         AND i.breakdown_key = ''
         AND i.entity_level = ${seviye}::"EntityLevel"
         AND i.date BETWEEN ${p.once.bas}::date AND ${p.sonra.son}::date
       GROUP BY i.entity_id
    )
    SELECT a.entity_id::text AS id
      FROM aday a
      ${setJoin}
     WHERE a.entity_id <> ${s.kapsam_id}::uuid
       AND coalesce(a.once_s, 0) > 0 AND coalesce(a.sonra_s, 0) > 0
       AND NOT (${kampanyaKolonu} = ANY(${disari}::uuid[]))
       ${kardesler}
     ORDER BY a.entity_id`);
  return r.map((x) => x.id);
}

/** Kontrolsüz durdurmanın gözlemi: günlük ortalama harcama ve dönüşüm, öncesi/sonrası. */
function gozlemUret(t: Toplamlar, currency: string): EtkiGozlemi {
  const gunluk = (harcama: number, gun: number) => formatMoney(String(Math.round((harcama / Math.max(gun, 1)) * 1_000_000)), currency, { decimals: 0 });
  const bir = (x: number) => Math.round(x * 10) / 10;
  return {
    onceGunlukHarcama: gunluk(t.once.harcama, t.once.gun),
    sonraGunlukHarcama: gunluk(t.sonra.harcama, t.sonra.gun),
    onceGunlukDonusum: bir(t.once.donusum / Math.max(t.once.gun, 1)),
    sonraGunlukDonusum: bir(t.sonra.donusum / Math.max(t.sonra.gun, 1)),
  };
}
