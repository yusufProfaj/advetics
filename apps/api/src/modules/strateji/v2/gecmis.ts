import { Prisma } from '@prisma/client';
import { AMAC_OLCUTU, REHBER_AMACLARI, REHBER_AMAC_KODLARI, REHBER_PLATFORMLARI, type GecmisSatiri, type RehberAmacKodu, type RehberPlatformu, type TahminYokNedeni } from '@advetics/shared';
import { bucketsFromRaw } from '../../reports/conversion-buckets';
import { seviyeLiterali } from '../../metrics/seviye-literali';
import type { GecmisSonucu } from './motor';

/**
 * ═══ HESABIN KENDİ GEÇMİŞİ — AMAÇ × PLATFORM, AYLIK ═══
 * (YENIDEN-TASARIM.md § 2.3 kural 6, Ö-4)
 *
 * Tahminin TEK veri kaynağı. Kampanya seviyesi (`insights_daily`,
 * `breakdown_key = ''`): seviyeler toplanırsa harcama katlanır; metrik
 * servisinin kartları da kampanya seviyesini okuyor.
 *
 * KAMPANYA → REHBER AMACI EŞLEMESİ BİR TAHMİN DEĞİL, KISIT. Eşlenemeyen
 * kampanya hiçbir amaca yazılmaz ve harcaması ayrıca söylenir
 * (`eslenemeyenHarcama`): yanlış amaca yazılan harcama sonuç başı maliyeti
 * sessizce bozar ve müşteriye giden belgedeki aralık yanlış olur.
 *
 * ÖLÇÜLMEDİ (Ö-4): bu eşlemenin gerçek hesaplarda harcamanın ne kadarını
 * kapsadığı. Kararlar:
 *   - Meta `OUTCOME_LEADS`: kampanyanın dönemdeki form ve mesaj sayısından
 *     BÜYÜK olanı (Meta amacı formu da WhatsApp'ı da taşıyor). İkisi de
 *     sıfırsa form (amacın varsayılanı).
 *   - Meta `OUTCOME_ENGAGEMENT`: mesaj varsa WhatsApp, yoksa ThruPlay varsa
 *     video, yoksa EŞLENEMEDİ (gönderi etkileşimi rehberde bir amaç değil).
 *   - Google `SEARCH`: yalnız SİTE (tıklama = ziyaret, hangi amaçla kurulmuş
 *     olursa olsun doğru). Google'ın `conversions` kolonu birincil bütün
 *     dönüşümleri sayıyor (ölçülen: `cta_click` bir tıklama, Ege Birlik
 *     2026-10-11) ve form/arama/satış ayrımı yok: Google'da FORM, TELEFON,
 *     SATIŞ eşlenmez — "eslenemedi".
 *   - ERİŞİM: `reach` günler arasında TOPLANAMAZ; "toplanamaz".
 */

/** Rehber amacı → bu amacın SONUCU olarak sayılan metrik. */
export type SonucMetrigi = 'form' | 'mesaj' | 'satin_alma' | 'tiklama' | 'izlenme';

export const AMAC_METRIGI: Record<RehberAmacKodu, SonucMetrigi | null> = {
  FORM: 'form',
  WHATSAPP: 'mesaj',
  SATIS: 'satin_alma',
  SITE: 'tiklama',
  VIDEO: 'izlenme',
  TELEFON: null,
  ERISIM: null,
};

export interface KampanyaToplami {
  harcamaMicros: bigint;
  form: number;
  mesaj: number;
  satin_alma: number;
  tiklama: number;
  izlenme: number;
}

/** Kampanyanın amacı (kodlu). `null` = eşlenemedi. SAF; sınanıyor. */
export function kampanyaAmaci(platform: RehberPlatformu, objective: string | null, t: Omit<KampanyaToplami, 'harcamaMicros'>): RehberAmacKodu | null {
  const o = (objective ?? '').toUpperCase();
  if (platform === 'google') {
    if (o === 'SEARCH') return 'SITE';
    if (o === 'DISPLAY') return 'ERISIM';
    return null;
  }
  switch (o) {
    case 'OUTCOME_SALES':
    case 'CONVERSIONS':
    case 'PRODUCT_CATALOG_SALES':
      return 'SATIS';
    case 'OUTCOME_LEADS':
    case 'LEAD_GENERATION':
      return t.mesaj > t.form ? 'WHATSAPP' : 'FORM';
    case 'MESSAGES':
      return 'WHATSAPP';
    case 'OUTCOME_TRAFFIC':
    case 'LINK_CLICKS':
      return 'SITE';
    case 'VIDEO_VIEWS':
      return 'VIDEO';
    case 'OUTCOME_ENGAGEMENT':
      if (t.mesaj > 0) return 'WHATSAPP';
      if (t.izlenme > 0) return 'VIDEO';
      return null;
    // Eski (ODAX öncesi) erişim amacı burada YOK: aynı dize reklam seti
    // optimizasyon hedefi olarak `metrics/donusum-sayilmayan.ts`in tek
    // listesinde ve orada kaynak taramasıyla kilitli. Eski kampanyalar
    // "eşlenemedi"ye düşer ve harcamaları ayrı satırda söylenir.
    case 'OUTCOME_AWARENESS':
    case 'BRAND_AWARENESS':
      return 'ERISIM';
    default:
      return null;
  }
}

/**
 * Amaç × platform sonuç hiç ölçülemiyorsa NEDENİ. Google'da yalnız SİTE
 * eşleniyor (yukarı); ERİŞİM her yerde toplanamaz.
 */
export function olculemezNedeni(amac: RehberAmacKodu, p: RehberPlatformu): TahminYokNedeni | null {
  if (amac === 'ERISIM') return 'toplanamaz';
  if (AMAC_METRIGI[amac] === null) return 'eslenemedi';
  if (p === 'google' && amac !== 'SITE') return 'eslenemedi';
  return null;
}

/** Son ÜÇ TAM ay (bugünün ayı hariç: yarım ay en kötü ayı haksız düşürür). */
export function tahminPenceresi(bugun: string): { baslangic: string; bitis: string } {
  const [y, m] = bugun.split('-').map(Number) as [number, number];
  const bas = new Date(Date.UTC(y, m - 1 - 3, 1));
  const son = new Date(Date.UTC(y, m - 1, 0));
  return { baslangic: bas.toISOString().slice(0, 10), bitis: son.toISOString().slice(0, 10) };
}

type Sorgucu = { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> };

interface HamSatir {
  platform: RehberPlatformu;
  kampanya: string;
  objective: string | null;
  ay: string;
  harcama: string;
  tiklama: string;
  izlenme: string;
  birimler: string[];
  hamlar: unknown[] | null;
}

export interface GecmisOkumasi {
  sonuc: (amac: RehberAmacKodu, p: RehberPlatformu) => GecmisSonucu;
  /** Amaç × platform aylık (motor ve ekran); platformlar toplanmaz. */
  ozet: Array<{ amac: RehberAmacKodu; platform: RehberPlatformu; aylar: Array<{ ay: string; harcamaMicros: string; sonuc: number }> }>;
  /** Belgenin "Bugüne kadar" satırları: amaç × platform dönem toplamı + eşlenemeyen harcama. */
  belgeSatirlari: GecmisSatiri[];
  eslenemeyenHarcama: Record<RehberPlatformu, string>;
  hesapVar: boolean;
}

const SEVIYE = seviyeLiterali('campaign');

/**
 * Workspace'e ATANMIŞ ve İZLENEN Meta/Google hesaplarının kampanya × ay
 * toplamı. Hesap listesi ÖNCEDEN çekilip diziyle veriliyor (alt sorgu RLS
 * yüklemini satır başına değerlendirtip paneldeki yavaşlığın tamamı
 * olmuştu; metrics.service.ts). `campaigns` LEFT JOIN: RLS'li tabloya INNER
 * JOIN ana satırı SESSİZCE süzerdi; görünmeyen kampanya "eşlenemedi" olur
 * ve harcaması söylenir.
 *
 * ÖLÇÜLMEDİ (Ö-5): üretimde süresi. Satır sayısı kampanya × ay (gün değil).
 */
export async function gecmisOku(tx: Sorgucu, clientId: string, paraBirimi: string, pencere: { baslangic: string; bitis: string }): Promise<GecmisOkumasi> {
  const hesaplar = await tx.$queryRaw<Array<{ id: string; currency: string; platform: RehberPlatformu }>>(Prisma.sql`
    SELECT id::text, currency, platform::text AS platform FROM ad_accounts
     WHERE client_id = ${clientId}::uuid AND sync_enabled = true
       AND platform IN ('meta'::"Platform", 'google'::"Platform")`);
  const idler = hesaplar.map((h) => h.id);
  const satirlar = idler.length
    ? await tx.$queryRaw<HamSatir[]>(Prisma.sql`
        SELECT i.platform::text AS platform, i.entity_id::text AS kampanya, c.objective,
               to_char(i.date, 'YYYY-MM') AS ay,
               COALESCE(SUM(i.spend_micros), 0)::text AS harcama,
               COALESCE(SUM(i.clicks), 0)::text AS tiklama,
               COALESCE(SUM(i.video_views), 0)::text AS izlenme,
               array_agg(DISTINCT i.currency::text) AS birimler,
               jsonb_agg(i.raw_metrics) FILTER (WHERE i.platform = 'meta'::"Platform") AS hamlar
          FROM insights_daily i
          LEFT JOIN campaigns c ON c.id = i.entity_id AND c.client_id = i.client_id
         WHERE i.client_id = ${clientId}::uuid
           AND i.ad_account_id = ANY(${idler}::uuid[])
           AND i.entity_level = ${SEVIYE}
           AND i.breakdown_key = ''
           AND i.date BETWEEN ${pencere.baslangic}::date AND ${pencere.bitis}::date
         GROUP BY i.platform, i.entity_id, c.objective, to_char(i.date, 'YYYY-MM')`)
    : [];
  return gecmisDerle(hesaplar, satirlar, paraBirimi, pencere);
}

/** SAF: ham satırlardan amaç × platform × ay. Ayrı ki sorgusuz sınansın. */
export function gecmisDerle(
  hesaplar: ReadonlyArray<{ currency: string; platform: RehberPlatformu }>,
  satirlar: readonly HamSatir[],
  paraBirimi: string,
  pencere: { baslangic: string; bitis: string },
): GecmisOkumasi {
  // Kur çevrimi yok: plan TRY, hesap USD ise USD geçmişini TRY bütçeye
  // bölmek uydurma olurdu. Platform başına.
  const karisik: Record<RehberPlatformu, boolean> = { meta: false, google: false };
  const hesapVar: Record<RehberPlatformu, boolean> = { meta: false, google: false };
  for (const h of hesaplar) {
    hesapVar[h.platform] = true;
    if (h.currency !== paraBirimi) karisik[h.platform] = true;
  }
  for (const s of satirlar) if (s.birimler.some((b) => b !== paraBirimi)) karisik[s.platform] = true;

  // Kampanya başına dönem toplamı → kampanyanın amacı (dönemin tamamına bakılarak).
  const kampanyaToplami = new Map<string, Omit<KampanyaToplami, 'harcamaMicros'>>();
  const ayToplami = new Map<string, KampanyaToplami & { platform: RehberPlatformu; kampanya: string; objective: string | null; ay: string }>();
  for (const s of satirlar) {
    const kova = (s.hamlar ?? []).reduce<{ form: number; mesaj: number; satin_alma: number }>(
      (t, h) => {
        const b = bucketsFromRaw(h);
        return { form: t.form + (b.form ?? 0), mesaj: t.mesaj + (b.message ?? 0), satin_alma: t.satin_alma + (b.purchase ?? 0) };
      },
      { form: 0, mesaj: 0, satin_alma: 0 },
    );
    const satir = { ...kova, tiklama: Number(s.tiklama), izlenme: Number(s.izlenme), harcamaMicros: BigInt(s.harcama) };
    ayToplami.set(`${s.platform}|${s.kampanya}|${s.ay}`, { ...satir, platform: s.platform, kampanya: s.kampanya, objective: s.objective, ay: s.ay });
    const k = kampanyaToplami.get(s.kampanya) ?? { form: 0, mesaj: 0, satin_alma: 0, tiklama: 0, izlenme: 0 };
    kampanyaToplami.set(s.kampanya, {
      form: k.form + satir.form,
      mesaj: k.mesaj + satir.mesaj,
      satin_alma: k.satin_alma + satir.satin_alma,
      tiklama: k.tiklama + satir.tiklama,
      izlenme: k.izlenme + satir.izlenme,
    });
  }

  const aylar = ayListesi(pencere);
  const kova = new Map<string, Map<string, { harcamaMicros: bigint; sonuc: number }>>();
  const eslenemeyen: Record<RehberPlatformu, bigint> = { meta: 0n, google: 0n };
  const olculemeyen = new Map<string, bigint>();
  for (const r of ayToplami.values()) {
    const amac = kampanyaAmaci(r.platform, r.objective, kampanyaToplami.get(r.kampanya)!);
    if (amac === null) {
      eslenemeyen[r.platform] += r.harcamaMicros;
      continue;
    }
    const metrik = AMAC_METRIGI[amac];
    if (metrik === null) {
      // Sonucu ölçülemeyen amaç (erişim): harcaması belgede görünür, sonucu yok.
      const k = `${amac}|${r.platform}`;
      olculemeyen.set(k, (olculemeyen.get(k) ?? 0n) + r.harcamaMicros);
      continue;
    }
    const anahtar = `${amac}|${r.platform}`;
    const m = kova.get(anahtar) ?? new Map();
    const o = m.get(r.ay) ?? { harcamaMicros: 0n, sonuc: 0 };
    m.set(r.ay, { harcamaMicros: o.harcamaMicros + r.harcamaMicros, sonuc: o.sonuc + r[metrik] });
    kova.set(anahtar, m);
  }

  const sonuc = (amac: RehberAmacKodu, p: RehberPlatformu): GecmisSonucu => {
    const olculemez = olculemezNedeni(amac, p);
    if (olculemez) return { tur: 'yok', neden: olculemez };
    if (karisik[p]) return { tur: 'yok', neden: 'karisik_birim' };
    const m = kova.get(`${amac}|${p}`);
    if (!m || m.size === 0) return { tur: 'yok', neden: 'gecmis_yok' };
    // Ay sırası takvimden: veri olmayan ay SIFIR satırı olarak girer ve
    // `kalemTahmini` onu süzer (sıfır sonuçlu ay aralığa girmez).
    return { tur: 'aylar', aylar: aylar.map((ay) => m.get(ay) ?? { harcamaMicros: 0n, sonuc: 0 }) };
  };

  const ozet: GecmisOkumasi['ozet'] = [];
  const belgeSatirlari: GecmisSatiri[] = [];
  for (const amac of REHBER_AMAC_KODLARI) {
    for (const p of REHBER_PLATFORMLARI) {
      const m = kova.get(`${amac}|${p}`);
      if (!m || !hesapVar[p]) continue;
      ozet.push({ amac, platform: p, aylar: aylar.map((ay) => ({ ay, harcamaMicros: (m.get(ay)?.harcamaMicros ?? 0n).toString(), sonuc: m.get(ay)?.sonuc ?? 0 })) });
    }
  }
  // Belge satırları: AYNI platformun ayları toplanır (dönem toplamı), iki
  // platform ASLA aynı satırda değil ve "toplam" satırı yok.
  for (const p of REHBER_PLATFORMLARI) {
    for (const amac of REHBER_AMAC_KODLARI) {
      const m = kova.get(`${amac}|${p}`);
      if (m) {
        let h = 0n;
        let n = 0;
        for (const v of m.values()) {
          h += v.harcamaMicros;
          n += v.sonuc;
        }
        if (h > 0n) belgeSatirlari.push({ platform: p, amac, etiket: REHBER_AMACLARI[amac].ekranAdi, harcamaMicros: h.toString(), sonuc: karisik[p] ? null : Math.round(n * 100) / 100, birim: AMAC_OLCUTU[amac].birim });
      }
      const o = olculemeyen.get(`${amac}|${p}`);
      if (o && o > 0n) belgeSatirlari.push({ platform: p, amac, etiket: REHBER_AMACLARI[amac].ekranAdi, harcamaMicros: o.toString(), sonuc: null, birim: AMAC_OLCUTU[amac].birim });
    }
    if (eslenemeyen[p] > 0n) belgeSatirlari.push({ platform: p, amac: null, etiket: 'Amacı eşlenemeyen kampanyalar', harcamaMicros: eslenemeyen[p].toString(), sonuc: null, birim: '' });
  }
  return {
    sonuc,
    ozet,
    belgeSatirlari,
    eslenemeyenHarcama: { meta: eslenemeyen.meta.toString(), google: eslenemeyen.google.toString() },
    hesapVar: hesaplar.length > 0,
  };
}

function ayListesi(p: { baslangic: string; bitis: string }): string[] {
  const out: string[] = [];
  let [y, m] = p.baslangic.split('-').map(Number) as [number, number];
  const son = p.bitis.slice(0, 7);
  for (;;) {
    const ay = `${y}-${String(m).padStart(2, '0')}`;
    out.push(ay);
    if (ay >= son || out.length > 24) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ─── Gerçekleşen (geri bağ, § 4.4) ──────────────────────────────────────

export interface GerceklesenKampanyaToplami {
  harcamaMicros: bigint;
  /** Kalemin ölçütüyle; ölçülemiyorsa `null`. */
  sonuc: number | null;
  kampanyaSayisi: number;
}

/**
 * Kalemin rehberinin YAYIN nesnelerinden kampanya dış kimlikleri.
 * Meta: `yayin_nesnesi.meta_id` (kampanya kimliği). Google: aynı kolon
 * `customers/<müşteri>/campaigns/<kimlik>` kaynak adı taşıyor (google-yayin.ts);
 * `campaigns.external_id` yalnız son parça.
 */
export function kampanyaDisKimligi(platform: RehberPlatformu, metaId: string): string | null {
  if (platform === 'meta') return /^\d+$/.test(metaId) ? metaId : null;
  const m = /^customers\/\d+\/campaigns\/(\d+)$/.exec(metaId);
  return m ? m[1]! : null;
}

/**
 * Bir kalemin bir platformdaki gerçekleşeni: rehber → çocuk taslak → yayın →
 * kampanya nesnesi → `campaigns` → `insights_daily` (kampanya seviyesi,
 * KALEMİN tarih aralığında). Platformlar AYRI çağrılır ve toplanmaz.
 */
export async function gerceklesenOku(
  tx: Sorgucu,
  o: { clientId: string; rehberId: string; platform: RehberPlatformu; amac: RehberAmacKodu; baslangic: string; bitis: string },
): Promise<GerceklesenKampanyaToplami> {
  const kolon = o.platform === 'meta' ? Prisma.sql`r.meta_taslak_id` : Prisma.sql`r.google_taslak_id`;
  const nesneler = await tx.$queryRaw<Array<{ meta_id: string }>>(Prisma.sql`
    SELECT DISTINCT n.meta_id
      FROM reklam_rehberi r
      JOIN yayin y ON y.taslak_id = ${kolon} AND y.client_id = r.client_id
      JOIN yayin_nesnesi n ON n.yayin_id = y.id AND n.tur = 'kampanya' AND n.meta_id IS NOT NULL
     WHERE r.id = ${o.rehberId}::uuid AND r.client_id = ${o.clientId}::uuid`);
  const disKimlikler = [...new Set(nesneler.map((n) => kampanyaDisKimligi(o.platform, n.meta_id)).filter((x): x is string => x !== null))];
  if (disKimlikler.length === 0) return { harcamaMicros: 0n, sonuc: AMAC_METRIGI[o.amac] === null ? null : 0, kampanyaSayisi: 0 };
  const platformLit = o.platform === 'meta' ? Prisma.sql`'meta'::"Platform"` : Prisma.sql`'google'::"Platform"`;
  const satirlar = await tx.$queryRaw<Array<{ harcama: string; tiklama: string; izlenme: string; hamlar: unknown[] | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(i.spend_micros), 0)::text AS harcama,
           COALESCE(SUM(i.clicks), 0)::text AS tiklama,
           COALESCE(SUM(i.video_views), 0)::text AS izlenme,
           jsonb_agg(i.raw_metrics) FILTER (WHERE i.raw_metrics IS NOT NULL) AS hamlar
      FROM campaigns c
      JOIN insights_daily i ON i.entity_id = c.id AND i.client_id = c.client_id
     WHERE c.client_id = ${o.clientId}::uuid AND c.platform = ${platformLit}
       AND c.external_id = ANY(${disKimlikler}::text[])
       AND i.entity_level = ${SEVIYE} AND i.breakdown_key = ''
       AND i.date BETWEEN ${o.baslangic}::date AND ${o.bitis}::date`);
  const s = satirlar[0];
  const metrik = AMAC_METRIGI[o.amac];
  let sonuc: number | null = null;
  if (metrik === 'tiklama') sonuc = Number(s?.tiklama ?? 0);
  else if (metrik === 'izlenme') sonuc = Number(s?.izlenme ?? 0);
  else if (metrik !== null && o.platform === 'meta') {
    const anahtar = metrik === 'form' ? 'form' : metrik === 'mesaj' ? 'message' : 'purchase';
    sonuc = (s?.hamlar ?? []).reduce<number>((t, h) => t + (bucketsFromRaw(h)[anahtar] ?? 0), 0);
  }
  return { harcamaMicros: BigInt(s?.harcama ?? '0'), sonuc: sonuc === null ? null : Math.round(sonuc * 100) / 100, kampanyaSayisi: disKimlikler.length };
}
