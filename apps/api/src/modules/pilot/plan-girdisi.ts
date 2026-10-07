import { Prisma } from '@prisma/client';
import {
  ARAMA_HACMI_ESIGI,
  kitleOzelSchema,
  type HuniKatmani,
  type Kaynakli,
  type PlanUretGirdisi,
  type UyumKitleBilgisi,
} from '@advetics/shared';
import { seviyeLiterali } from '../metrics/seviye-literali';
import { oneriPenceresi } from '../strateji/dagilim-oneri';
import { kelimeGrubu } from '../strateji/kelime-tekil';

/**
 * ═══ `planUret` GİRDİSİNİ KURAN OKUYUCU (MIMARI § 6 madde 3) ═══
 *
 * `planUret` saf: ağ, saat, veritabanı görmez. Bu dosya veriyi okuyup
 * girdiye KOYAR ve her şeyi tek bir kısa transaction'da yapar (platform
 * çağrısı yok). Okunamayan her parça `null` olarak gider ve planUret onu
 * nedeniyle boş hücreye çevirir; burada "yaklaşık" bir değer UYDURULMAZ.
 *
 * HAVUZ SATIRLARI GİRMEZ: `client_id = X` açıkça yazılıyor. RLS org
 * yöneticisine havuzu (`client_id IS NULL`) bilerek gösteriyor; süzgeç RLS'e
 * bırakılsaydı ajansın havuzundaki yüzlerce hesap her workspace'in planına
 * girerdi (CLAUDE.md "HAVUZ SATIRLARI MÜŞTERİ-KAPSAMLI SAYIMA GİRMEZ").
 *
 * SEVİYE TEK: kampanya seviyesi (`TOTALS_LEVEL`), strateji modülü ve metrik
 * kartlarıyla aynı. Seviyeler toplanırsa harcama katlanır.
 */
export type OkumaTx = { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> };

const TOPLAM_SEVIYESI = seviyeLiterali('campaign');
const REKLAM_SEVIYESI = seviyeLiterali('ad');

/** Metrik işlerinin türleri: "senkron taze mi" sorusu bunlara sorulur. */
const METRIK_ISLERI = Prisma.sql`'insights_daily'::"SyncJobType", 'insights_backfill'::"SyncJobType", 'initial_backfill'::"SyncJobType"`;

/** Varlık adayı sınırı: plan en iyi 3'ü seçiyor; sıralama için bu kadarı fazlasıyla yeter. Kesilen sayı döner. */
export const VARLIK_ADAY_SINIRI = 200;

export interface PlanGirdisiOkumasi {
  girdi: PlanUretGirdisi;
  /** Uyum denetçisinin kitle bilgisi (yaş/cinsiyet/özel kitle). */
  kitleUyum: Map<string, UyumKitleBilgisi>;
  /** Sessiz kesme yok: okunan ve toplam varlık. */
  varlikSayisi: { okunan: number; toplam: number };
  saatDilimi: string;
}

/** Saat dilimindeki takvim günü, `YYYY-MM-DD`. Date'e çevrilmiyor (kayma). */
export function yerelGun(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(an);
}

function gunEkle(gun: string, fark: number): string {
  const [y, a, g] = gun.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g + fark, 12)).toISOString().slice(0, 10);
}

/**
 * KİTLE KATMANI TÜRETME. Şemada katman yok ve özel kitlenin Meta alt türü
 * (WEBSITE, ENGAGEMENT…) şablonda SAKLANMIYOR: elimizde yalnız `tip`
 * (`ozel`/`benzer`), `mod` ve kitlenin adı var. Kural, kanıtın izin verdiği
 * kadar:
 *   · dahil edilen özel/benzer kitle yok → soğuk (ilgi/konum hedeflemesi),
 *   · dahil edilen yalnız benzer kitle → soğuk (benzer kitle yeni kişi bulur),
 *   · dahil edilen özel kitlenin adı site/ziyaret/sepet/piksel → yeniden pazarlama,
 *   · adı etkileşim/takipçi/izleyen/sayfa/instagram → sıcak,
 *   · özel kitle var ama adından katman okunamıyor → `null`: şablon PLANA
 *     GİRMEZ. Tahmin etmek, site ziyaretçisi kitlesine soğuk kitle bütçesi
 *     ve mesajı vermek olurdu.
 * Alt tür şablona yazıldığında (Veri adımı, Tur 3) ad sezgisi kalkar.
 */
const YENIDEN_PAZARLAMA_IPUCU = /(site|web|ziyaret|sepet|piksel|pixel|retarget|yeniden)/i;
const SICAK_IPUCU = /(etkileşim|etkilesim|takipçi|takipci|izleyen|izleyici|sayfa|instagram|facebook|video|engagement)/i;

export function katmanTuret(ozelKitlelerHam: unknown): HuniKatmani | null {
  const dahil = (Array.isArray(ozelKitlelerHam) ? ozelKitlelerHam : [])
    .map((o) => kitleOzelSchema.safeParse(o))
    .filter((r) => r.success)
    .map((r) => r.data!)
    .filter((o) => o.mod === 'dahil');
  const ozel = dahil.filter((o) => o.tip === 'ozel');
  if (ozel.length === 0) return 'soguk';
  if (ozel.some((o) => YENIDEN_PAZARLAMA_IPUCU.test(o.name))) return 'yeniden_pazarlama';
  if (ozel.some((o) => SICAK_IPUCU.test(o.name))) return 'sicak';
  return null;
}

export async function planGirdisiOku(tx: OkumaTx, clientId: string, donem: string, simdi: Date): Promise<PlanGirdisiOkumasi> {
  const zaman = simdi.toISOString();
  const [c] = await tx.$queryRaw<Array<{ tz: string; kategoriler: string[] | null }>>(Prisma.sql`
    SELECT c.timezone AS tz, p.urun_kategorileri AS kategoriler
      FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
     WHERE c.id = ${clientId}::uuid`);
  if (!c) throw new Error(`Workspace bulunamadı: ${clientId}`);
  const tz = c.tz || 'Europe/Istanbul';
  const bugun = yerelGun(simdi, tz);
  const ilk = `${donem}-01`;

  // ── Aylık bütçe: workspace geneli satır (hesaba bağlı bütçe plan toplamı değil).
  const [b] = await tx.$queryRaw<Array<{ id: string; micros: string; birim: string; guncellendi: Date }>>(Prisma.sql`
    SELECT id::text, amount_micros::text AS micros, currency AS birim, updated_at AS guncellendi
      FROM monthly_budgets
     WHERE client_id = ${clientId}::uuid AND ad_account_id IS NULL AND month = ${ilk}::date`);

  const hesaplar = await tx.$queryRaw<Array<{ id: string; platform: 'meta' | 'google'; birim: string }>>(Prisma.sql`
    SELECT id::text, platform::text AS platform, currency AS birim
      FROM ad_accounts
     WHERE client_id = ${clientId}::uuid AND sync_enabled = true
       AND platform IN ('meta'::"Platform", 'google'::"Platform")
     ORDER BY platform, id`);
  const hesapIdleri = hesaplar.map((h) => h.id);

  const ayHarcanan = await ayHarcananOku(tx, clientId, hesapIdleri, donem, bugun, tz, zaman);

  // ── 90 günlük geçmiş (İstanbul takvimiyle dünden geriye; strateji ile aynı pencere).
  const pencere = oneriPenceresi(simdi);
  let gecmis: PlanUretGirdisi['gecmis'] = null;
  if (hesapIdleri.length > 0) {
    const satirlar = await tx.$queryRaw<Array<{ platform: 'meta' | 'google'; harcama: string; sonuc: string; birimler: string[] }>>(Prisma.sql`
      SELECT platform::text AS platform, COALESCE(SUM(spend_micros), 0)::text AS harcama,
             COALESCE(SUM(conversions), 0)::text AS sonuc, array_agg(DISTINCT currency::text) AS birimler
        FROM insights_daily
       WHERE client_id = ${clientId}::uuid AND ad_account_id = ANY(${hesapIdleri}::uuid[])
         AND entity_level = ${TOPLAM_SEVIYESI} AND breakdown_key = ''
         AND date BETWEEN ${pencere.from}::date AND ${pencere.to}::date
       GROUP BY platform`);
    // Metrik satırının birimi hesabınkinden ayrışmışsa geçmiş bilinmiyor:
    // kur çevrimi yok ve iki birimi toplamak anlamsız sayı üretir.
    const birimler = new Set(hesaplar.map((h) => h.birim));
    const karisik = satirlar.some((s) => s.birimler.some((x) => !birimler.has(x))) || birimler.size > 1;
    if (!karisik) {
      gecmis = {
        pencere,
        okundu: zaman,
        platformlar: satirlar.map((s) => ({
          platform: s.platform,
          harcamaMicros: BigInt(s.harcama),
          // Google kesirli dönüşüm döndürüyor (0,75); planUret tam sayı
          // bölüştürüyor ve BigInt kesirli sayıyı REDDEDER. Aşağı yuvarlama
          // tahmini küçültür, hiçbir zaman büyütmez.
          sonuc: Math.floor(Number(s.sonuc)),
        })),
      };
    }
  }

  // ── Marka Merkezi
  const [m] = await tx.$queryRaw<Array<{ id: string; guncellendi: Date; amac: 'form' | 'whatsapp' | 'website' | null; varsayilan: string | null }>>(Prisma.sql`
    SELECT id::text, updated_at AS guncellendi, ana_amac AS amac, varsayilan_kitle_id::text AS varsayilan
      FROM client_profiles WHERE client_id = ${clientId}::uuid`);

  // ── Kitle şablonları
  const kitleSatirlari = await tx.$queryRaw<Array<{ id: string; ad: string; ozel: unknown; yas_min: number; yas_max: number; cinsiyet: string; guncellendi: Date }>>(Prisma.sql`
    SELECT id::text, name AS ad, ozel_kitleler AS ozel, age_min AS yas_min, age_max AS yas_max, genders AS cinsiyet, updated_at AS guncellendi
      FROM audience_templates WHERE client_id = ${clientId}::uuid ORDER BY name, id`);
  const kitleUyum = new Map<string, UyumKitleBilgisi>();
  for (const k of kitleSatirlari) {
    const ozel = Array.isArray(k.ozel) ? k.ozel : [];
    kitleUyum.set(k.id, {
      yasMin: k.yas_min,
      yasMax: k.yas_max,
      cinsiyet: k.cinsiyet,
      ozelKitleVar: ozel.some((o) => (o as { mod?: string })?.mod === 'dahil'),
    });
  }

  // ── Varlıklar + reklam seviyesi performans
  const [vSay] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT count(*)::int AS n FROM assets WHERE client_id = ${clientId}::uuid AND kind IN ('image', 'video')`);
  const varlikSatirlari = await tx.$queryRaw<Array<{ id: string; ad: string; tur: string; yuklendi: Date }>>(Prisma.sql`
    SELECT id::text, name AS ad, kind AS tur, created_at AS yuklendi
      FROM assets WHERE client_id = ${clientId}::uuid AND kind IN ('image', 'video')
     ORDER BY created_at DESC, id LIMIT ${VARLIK_ADAY_SINIRI}`);
  const performans = await varlikPerformansi(tx, clientId, varlikSatirlari.map((v) => v.id), hesapIdleri, pencere, zaman);

  // ── Kelime fikirleri: workspace'in strateji planlarından, kelime başına EN YENİ çekim.
  const kelimeSatirlari = await tx.$queryRaw<Array<{ id: string; kelime: string; grup: string | null; hacim: string | null; cekim: Date }>>(Prisma.sql`
    SELECT DISTINCT ON (lower(kelime)) id::text, kelime, grup, aylik_arama::text AS hacim, cekim_zamani AS cekim
      FROM strateji_kelimeleri WHERE client_id = ${clientId}::uuid
     ORDER BY lower(kelime), cekim_zamani DESC, id`);
  const tohumlar = c.kategoriler ?? [];

  const girdi: PlanUretGirdisi = {
    clientId,
    donem,
    bugun,
    simdi: zaman,
    aylikButce: b ? { id: b.id, micros: BigInt(b.micros), paraBirimi: b.birim, guncellendi: new Date(b.guncellendi).toISOString() } : null,
    ayHarcanan,
    hesaplar: hesaplar.map((h) => ({ id: h.id, platform: h.platform, paraBirimi: h.birim })),
    gecmis,
    marka: m ? { profilId: m.id, guncellendi: new Date(m.guncellendi).toISOString(), anaAmac: m.amac } : null,
    kitleler: kitleSatirlari.map((k) => ({
      id: k.id,
      ad: k.ad,
      katman: katmanTuret(k.ozel),
      varsayilan: m?.varsayilan === k.id,
      guncellendi: new Date(k.guncellendi).toISOString(),
    })),
    varliklar: varlikSatirlari.map((v) => ({
      id: v.id,
      ad: v.ad,
      tur: v.tur === 'video' ? 'video' : 'gorsel',
      yuklendi: new Date(v.yuklendi).toISOString(),
      performans: performans.get(v.id) ?? null,
    })),
    kelimeler: kelimeSatirlari.map((k) => {
      const hacim = k.hacim === null ? null : BigInt(k.hacim);
      return {
        id: k.id,
        kelime: k.kelime,
        grup: k.grup ?? kelimeGrubu(k.kelime, hacim, tohumlar, ARAMA_HACMI_ESIGI),
        aylikArama: hacim === null ? null : Number(hacim),
        cekim: new Date(k.cekim).toISOString(),
      };
    }),
  };
  return { girdi, kitleUyum, varlikSayisi: { okunan: varlikSatirlari.length, toplam: vSay?.n ?? 0 }, saatDilimi: tz };
}

/**
 * AYIN HARCANMIŞ KISMI (S-7). Üç hâl:
 *   · gelecek ay → 0, kaynağı adlı kural (`GELECEK_AY`),
 *   · ayın ilk günü → 0 (dünden geriye ayın içinde gün yok),
 *   · cari ay → hesap seviyesi toplam, AMA her izlenen hesabın metrik işi
 *     dünden bu yana başarıyla koşmuşsa. Biri bile eskiyse `null`: eksik
 *     harcamayı tam sanmak, zaten harcanmış parayı ikinci kez dağıtmak.
 * Eşik (M-3 "Ajan 2 belirler"): son başarılı metrik işi DÜNÜN başından
 * (hesabın saat dilimi) eski ise senkron eski.
 * Bugünün harcaması bilinçli olarak DAHİL DEĞİL (sözleşme: dönemin ilk
 * gününden dünü dahil); plan yarından başlıyor.
 */
async function ayHarcananOku(
  tx: OkumaTx,
  clientId: string,
  hesapIdleri: string[],
  donem: string,
  bugun: string,
  tz: string,
  zaman: string,
): Promise<Kaynakli<bigint> | null> {
  const buAy = bugun.slice(0, 7);
  if (donem > buAy) return { deger: 0n, kaynak: { tur: 'sabit_kural', kimlik: 'GELECEK_AY', zaman, aciklama: 'Gelecek ay: henüz harcama yok' } };
  if (donem < buAy) return null;
  const ilk = `${donem}-01`;
  const dun = gunEkle(bugun, -1);
  if (dun < ilk) return { deger: 0n, kaynak: { tur: 'sabit_kural', kimlik: 'AYIN_ILK_GUNU', zaman, aciklama: 'Ayın ilk günü: dünden geriye harcama yok' } };
  if (hesapIdleri.length === 0) return null;

  const taze = await tx.$queryRaw<Array<{ id: string; son: Date | null }>>(Prisma.sql`
    SELECT a.id::text, (SELECT max(j.finished_at) FROM sync_jobs j
                         WHERE j.ad_account_id = a.id AND j.status = 'succeeded'::"SyncJobStatus"
                           AND j.job_type IN (${METRIK_ISLERI})) AS son
      FROM unnest(${hesapIdleri}::uuid[]) AS a(id)`);
  const esik = await tx.$queryRaw<Array<{ an: Date }>>(Prisma.sql`SELECT (${dun}::date)::timestamp AT TIME ZONE ${tz} AS an`);
  const esikAn = new Date(esik[0]!.an).getTime();
  if (taze.some((t) => !t.son || new Date(t.son).getTime() < esikAn)) return null;

  const [s] = await tx.$queryRaw<Array<{ toplam: string }>>(Prisma.sql`
    SELECT COALESCE(SUM(spend_micros), 0)::text AS toplam FROM insights_daily
     WHERE client_id = ${clientId}::uuid AND ad_account_id = ANY(${hesapIdleri}::uuid[])
       AND entity_level = ${TOPLAM_SEVIYESI} AND breakdown_key = ''
       AND date BETWEEN ${ilk}::date AND ${dun}::date`);
  return {
    deger: BigInt(s?.toplam ?? '0'),
    kaynak: { tur: 'gecmis_veri', kimlik: 'insights_daily', zaman, pencere: { from: ilk, to: dun }, aciklama: 'Bu ay şimdiye kadar harcanan' },
  };
}

/**
 * VARLIK PERFORMANSI — reklam seviyesinden. Bağ: `asset_platform_refs`
 * (varlığın o hesaptaki image_hash'i) ↔ kreatifin ham kaydındaki hash ↔
 * reklam ↔ reklam seviyesi metrik. Advetics dışında yüklenmiş görselin
 * hash kaydı yok ve o varlık "ölçülmemiş" sayılır: yanlış eşleşme kurmaktan
 * iyidir (ölçülmüş kötü varlığı iyi saymak, kanıtı ters çevirmek olurdu).
 */
async function varlikPerformansi(
  tx: OkumaTx,
  clientId: string,
  varlikIdleri: string[],
  hesapIdleri: string[],
  pencere: { from: string; to: string },
  okundu: string,
): Promise<Map<string, NonNullable<PlanUretGirdisi['varliklar'][number]['performans']>>> {
  const sonuc = new Map<string, NonNullable<PlanUretGirdisi['varliklar'][number]['performans']>>();
  if (varlikIdleri.length === 0 || hesapIdleri.length === 0) return sonuc;
  const satirlar = await tx.$queryRaw<Array<{ varlik: string; harcama: string; donusum: string }>>(Prisma.sql`
    WITH esles AS (
      SELECT DISTINCT r.asset_id, a.id AS ad_id
        FROM asset_platform_refs r
        JOIN creatives c ON c.ad_account_id = r.ad_account_id AND c.client_id = ${clientId}::uuid
        JOIN ads a ON a.creative_id = c.id AND a.client_id = ${clientId}::uuid
       WHERE r.asset_id = ANY(${varlikIdleri}::uuid[]) AND r.ad_account_id = ANY(${hesapIdleri}::uuid[])
         AND (c.raw #>> '{object_story_spec,link_data,image_hash}' = r.external_ref
              OR c.raw #>> '{object_story_spec,video_data,image_hash}' = r.external_ref
              OR (jsonb_typeof(c.raw #> '{asset_feed_spec,images}') = 'array'
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.raw #> '{asset_feed_spec,images}') e WHERE e->>'hash' = r.external_ref)))
    )
    SELECT e.asset_id::text AS varlik, COALESCE(SUM(i.spend_micros), 0)::text AS harcama, COALESCE(SUM(i.conversions), 0)::text AS donusum
      FROM esles e
      JOIN insights_daily i ON i.entity_id = e.ad_id AND i.client_id = ${clientId}::uuid
       AND i.entity_level = ${REKLAM_SEVIYESI} AND i.breakdown_key = ''
       AND i.date BETWEEN ${pencere.from}::date AND ${pencere.to}::date
     GROUP BY e.asset_id`);
  for (const s of satirlar) {
    sonuc.set(s.varlik, { harcamaMicros: BigInt(s.harcama), sonuc: Math.floor(Number(s.donusum)), pencere, okundu });
  }
  return sonuc;
}
