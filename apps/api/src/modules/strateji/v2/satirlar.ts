import { Prisma } from '@prisma/client';
import {
  AMAC_ASAMASI,
  REHBER_PLATFORMLARI,
  belgeyeGirerMi,
  kaynakliMetinSchema,
  kalemDurumu,
  kalemMetniSchema,
  rehberKonumuSchema,
  stratejiSihirbazDurumuSchema,
  type StratejiSihirbazi,
  type KalemMetni,
  type KalemTahmini,
  type KaynakliMetin,
  type PlanDurumu,
  type RehberAmacKodu,
  type RehberDurumu,
  type RehberKonumu,
  type RehberPlatformu,
  type StratejiBolumKodu,
  type StratejiDurumu,
  type StratejiKalemi,
  type StratejiKalemiGirdisi,
  type StratejiOnayRolu,
  type StratejiListeSatiri,
  type StratejiOlcumSatiri,
  type StratejiPlani,
  type StratejiRiski,
  type YayinDurumu,
} from '@advetics/shared';
import { z } from 'zod';

/**
 * ═══ v2 SATIRLARI — TEK SEÇİM, TEK ÇEVİRİ ═══
 *
 * Plan ve kalem SELECT'leri TEK YERDE: satır tipine alan eklenip SELECT'e
 * eklenmezse `$queryRaw<T>` susar ve alan `undefined` gelir (CLAUDE.md).
 * Panel, girişsiz onay sayfası ve PDF AYNI çeviriden geçer: üç ayrı
 * çeviri, müşterinin bağlantıda gördüğü belge ile PDF'in ayrışması demekti.
 *
 * `Sorgucu` bilerek gevşek: panel yolu RLS'li `tx`, girişsiz onay yolu
 * yönetim bağlantısı. İkincisinde RLS yok; bu yüzden her sorgu PLAN
 * KİMLİĞİ ve CLIENT_ID ile açıkça süzülüyor (token tek planı açıyor).
 */
export type Sorgucu = { $queryRaw<T = unknown>(q: Prisma.Sql): Promise<T> };

export interface PlanSatiri {
  id: string;
  org_id: string;
  client_id: string;
  bicim: number;
  donem: string;
  durum: StratejiDurumu | PlanDurumu;
  surum: number;
  baslangic: string | null;
  bitis: string | null;
  toplam_butce_micros: string;
  para_birimi: string;
  onaylayan_user_id: string | null;
  kullanici_adi: string | null;
  onaylayan_ad: string | null;
  onaylayan_eposta: string | null;
  onay_rolu: StratejiOnayRolu | null;
  onay_zamani: Date | null;
  onaylanan_surum: number | null;
  notu: string | null;
  bolumler: unknown;
  riskler: unknown;
  olcum_ozeti: unknown;
  olusturan_adi: string | null;
  workspace_adi: string | null;
  hazirlayan: string | null;
  son_oneri: unknown;
  oneri_imzasi: string | null;
  revizyon_notu: string | null;
  sihirbaz: unknown;
  kalem_sayisi: number;
  created_at: Date;
  updated_at: Date;
}

/*
 * Kullanıcı adı LEFT JOIN: `users` politikası dar ve kardeş şirkete geçen
 * ajans yöneticisi KENDİ satırını bile göremiyor; INNER JOIN planı SESSİZCE
 * süzerdi (rapor planı dersi, rapor-listeleri-rls.spec.ts).
 */
export function planSecimi(kosul: Prisma.Sql, kilit: boolean): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id::text, p.org_id::text, p.client_id::text, p.bicim::int AS bicim, p.donem, p.durum, p.surum,
           to_char(p.baslangic, 'YYYY-MM-DD') AS baslangic, to_char(p.bitis, 'YYYY-MM-DD') AS bitis,
           p.toplam_butce_micros::text, p.para_birimi, p.onaylayan_user_id::text,
           u.full_name AS kullanici_adi, p.onaylayan_ad, p.onaylayan_eposta,
           p.onay_rolu, p.onay_zamani, p.onaylanan_surum, p.notu, p.bolumler, p.riskler, p.olcum_ozeti,
           ou.full_name AS olusturan_adi, c.name AS workspace_adi,
           COALESCE(ao.name, o.name) AS hazirlayan,
           p.son_oneri, p.oneri_imzasi, p.revizyon_notu, p.sihirbaz,
           (CASE WHEN p.bicim = 2
                 THEN (SELECT count(*) FROM strateji_kalemleri k WHERE k.plan_id = p.id)
                 ELSE (SELECT count(*) FROM strateji_matrisi m WHERE m.plan_id = p.id) END)::int AS kalem_sayisi,
           p.created_at, p.updated_at
      FROM strateji_planlari p
      LEFT JOIN users u ON u.id = p.onaylayan_user_id
      LEFT JOIN users ou ON ou.id = p.created_by
      LEFT JOIN clients c ON c.id = p.client_id
      -- "Hazırlayan": şirket bir üst hesabın altındaysa AJANS şirketinin adı,
      -- değilse planın şirketi. LEFT JOIN: görünmeyen satır planı süzmesin.
      LEFT JOIN organizations o ON o.id = p.org_id
      LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
      LEFT JOIN organizations ao ON ao.id = ma.ajans_org_id
     WHERE ${kosul}
     ${kilit ? Prisma.sql`FOR UPDATE OF p` : Prisma.empty}`;
}

export function listeSatiri(p: PlanSatiri): StratejiListeSatiri {
  const v2 = p.bicim === 2;
  return {
    id: p.id,
    bicim: v2 ? 2 : 1,
    durum: p.durum,
    baslangic: v2 ? p.baslangic : null,
    bitis: v2 ? p.bitis : null,
    donem: v2 ? null : p.donem,
    toplamButceMicros: p.toplam_butce_micros,
    paraBirimi: p.para_birimi,
    surum: p.surum,
    guncellendi: new Date(p.updated_at).toISOString(),
    kalemSayisi: p.kalem_sayisi,
  };
}

/** Yalnız v2 satırı (çağıran `bicim`i denetlemiş olmalı). */
export function planKur(p: PlanSatiri): StratejiPlani {
  return {
    id: p.id,
    clientId: p.client_id,
    bicim: 2,
    durum: p.durum as StratejiDurumu,
    surum: p.surum,
    onaylananSurum: p.onaylanan_surum,
    baslangic: p.baslangic ?? `${p.donem}-01`,
    bitis: p.bitis ?? `${p.donem}-01`,
    toplamButceMicros: p.toplam_butce_micros,
    paraBirimi: p.para_birimi,
    guncellendi: new Date(p.updated_at).toISOString(),
    guncelleyen: p.olusturan_adi,
    workspaceAdi: p.workspace_adi ?? '',
    hazirlayan: p.hazirlayan,
    /*
     * Onay izi `onay_rolu` + `onay_zamani` ile var. Bağlantıyla onayda ad ve
     * e-posta kişinin BEYANI (kendi kolonları); panel onayında kullanıcının
     * adı. Kullanıcı sonradan silinmişse ad `null` ama onay kaybolmaz.
     */
    onay:
      p.onay_rolu && p.onay_zamani && p.onaylanan_surum !== null
        ? {
            rol: p.onay_rolu,
            zaman: new Date(p.onay_zamani).toISOString(),
            kim: p.onay_rolu === 'baglanti' ? null : p.kullanici_adi,
            ad: p.onay_rolu === 'baglanti' ? p.onaylayan_ad : null,
            eposta: p.onay_rolu === 'baglanti' ? p.onaylayan_eposta : null,
            surum: p.onaylanan_surum,
          }
        : null,
    revizyonNotu: p.revizyon_notu,
  };
}

export function olcumOzetiOku(ham: unknown): StratejiOlcumSatiri[] {
  return Array.isArray(ham) ? (ham as StratejiOlcumSatiri[]) : [];
}

/**
 * Sihirbaz durumu. Kolonu yalnız `stratejiSihirbazDurumuSchema`dan geçen
 * gövde yazıyor; okurken de aynı şemadan geçer. Geçmeyen (elle bozulmuş)
 * satır `null`: ekran planı kayıtlı kalemleriyle açar ve sihirbaz baştan
 * başlar; yarım bir durumu "doğru" sayıp yanlış adıma götürmek daha kötü.
 */
export function sihirbazOku(ham: unknown): StratejiSihirbazi | null {
  if (ham === null || ham === undefined) return null;
  const r = stratejiSihirbazDurumuSchema.safeParse(ham);
  return r.success ? r.data : null;
}

// ─── Bölümler ───────────────────────────────────────────────────────────

/**
 * Kayıtlı bölüm metinleri. Her bölüm AYRI doğrulanır; şemadan geçmeyen bölüm
 * atlanır, diğerleri gelir.
 *
 * `z.record(z.string(), kaynakliMetinSchema)` KULLANILMIYOR (2026-10-13,
 * adım adım akış testinde bulundu): bu dosyanın `zod`u ile shared'ın
 * derlenmiş `zod`u testte AYRI iki kopya (vite ESM ↔ dist CJS) ve `z.record`
 * ikinci argümanın kendi `ZodType`ı olup olmadığına `instanceof` ile bakıyor.
 * Bakamayınca İLK argümanı değer şeması sanıyor: her bölüm "string bekleniyor"
 * diye düşüyor ve fonksiyon SESSİZCE `{}` dönüyordu. Testte belgenin bütün
 * metinleri boş görünüyordu ve hiçbir test bölüm okumasını sınamıyordu.
 * Shared şemasını doğrudan çağırmak iki kopyadan bağımsız.
 */
export function bolumleriOku(ham: unknown, musteriGorunumu: boolean): Partial<Record<StratejiBolumKodu, KaynakliMetin>> {
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) return {};
  const out: Partial<Record<StratejiBolumKodu, KaynakliMetin>> = {};
  for (const [k, ham_] of Object.entries(ham as Record<string, unknown>)) {
    const r = kaynakliMetinSchema.safeParse(ham_);
    if (!r.success) continue;
    // Yapay zekânın "Kullan" denmemiş önerisi MÜŞTERİYE GİTMEZ (§ 2.1).
    if (musteriGorunumu && !belgeyeGirerMi(r.data)) continue;
    out[k as StratejiBolumKodu] = r.data;
  }
  return out;
}

export function riskleriOku(ham: unknown): StratejiRiski[] {
  return Array.isArray(ham) ? (ham as StratejiRiski[]) : [];
}

// ─── Kalemler ───────────────────────────────────────────────────────────

export interface KalemSatiri {
  id: string;
  sira: number;
  amac: RehberAmacKodu;
  meta_acik: boolean;
  google_acik: boolean;
  meta_payi: number | null;
  butce_micros: string;
  baslangic: string;
  bitis: string;
  konumlar: unknown;
  yas_min: number | null;
  yas_max: number | null;
  metin: unknown;
  kreatif_yonergesi: unknown;
  kitle_tarifi: unknown;
  kelime_grubu: string | null;
  varlik_idleri: string[];
  tahmin: unknown;
  kaynaklar: unknown;
  rehber_id: string | null;
  notu: string | null;
}

export const KALEM_SUTUNLARI = Prisma.sql`k.id::text, k.sira::int AS sira, k.amac, k.meta_acik, k.google_acik, k.meta_payi::int AS meta_payi,
  k.butce_micros::text, to_char(k.baslangic, 'YYYY-MM-DD') AS baslangic, to_char(k.bitis, 'YYYY-MM-DD') AS bitis,
  k.konumlar, k.yas_min::int AS yas_min, k.yas_max::int AS yas_max, k.metin, k.kreatif_yonergesi, k.kitle_tarifi,
  k.kelime_grubu, k.varlik_idleri::text[] AS varlik_idleri, k.tahmin, k.kaynaklar, k.rehber_id::text, k.notu`;

export async function kalemSatirlari(t: Sorgucu, planId: string, clientId: string): Promise<KalemSatiri[]> {
  return t.$queryRaw<KalemSatiri[]>(Prisma.sql`
    SELECT ${KALEM_SUTUNLARI} FROM strateji_kalemleri k
     WHERE k.plan_id = ${planId}::uuid AND k.client_id = ${clientId}::uuid
     ORDER BY k.sira`);
}

const konumlarSchema = z.array(rehberKonumuSchema);
const istemciMetni = z.object({ metin: z.string(), kaynak: z.enum(['ai', 'ajans']) }).passthrough();

/** Kalem satırını panelin GİRDİ biçimine çevirir (aktarım kapısı ve kayıt aynı biçimi okur). */
export function kalemGirdisi(k: KalemSatiri): StratejiKalemiGirdisi & { butceMicros: bigint } {
  const metin = kalemMetniSchema.safeParse(k.metin);
  const ky = istemciMetni.safeParse(k.kreatif_yonergesi);
  const kt = istemciMetni.safeParse(k.kitle_tarifi);
  return {
    id: k.id,
    amac: k.amac,
    meta: k.meta_acik,
    google: k.google_acik,
    metaPayi: k.meta_payi,
    butce: '0',
    butceMicros: BigInt(k.butce_micros),
    baslangic: k.baslangic,
    bitis: k.bitis,
    konumlar: konumlarSchema.safeParse(k.konumlar).success ? (k.konumlar as RehberKonumu[]) : [],
    yasMin: k.yas_min,
    yasMax: k.yas_max,
    kelimeGrubu: k.kelime_grubu,
    varlikIdleri: k.varlik_idleri ?? [],
    metin: metin.success ? metin.data : null,
    kreatifYonergesi: ky.success ? { metin: ky.data.metin, kaynak: ky.data.kaynak } : null,
    kitleTarifi: kt.success ? { metin: kt.data.metin, kaynak: kt.data.kaynak } : null,
    not: k.notu,
  };
}

export interface RehberDurumSatiri {
  id: string;
  durum: RehberDurumu;
  yayinlar: Array<{ platform: RehberPlatformu; durum: YayinDurumu | null }>;
}

/**
 * Kalemlerin rehber durumları — SABİT sayıda sorgu (kalem başına değil).
 * Taslak başına SON yayın, rehber listesiyle AYNI öncelik: süren kayıt
 * önce, sonra en yenisi (`RehberService.listele`).
 */
export async function rehberDurumlari(t: Sorgucu, clientId: string, rehberIdleri: string[]): Promise<Map<string, RehberDurumSatiri>> {
  const harita = new Map<string, RehberDurumSatiri>();
  if (rehberIdleri.length === 0) return harita;
  const rehberler = await t.$queryRaw<Array<{ id: string; durum: RehberDurumu; meta_taslak_id: string | null; google_taslak_id: string | null }>>(Prisma.sql`
    SELECT id::text, durum, meta_taslak_id::text, google_taslak_id::text FROM reklam_rehberi
     WHERE id = ANY(${rehberIdleri}::uuid[]) AND client_id = ${clientId}::uuid`);
  const taslaklar = rehberler.flatMap((r) => [r.meta_taslak_id, r.google_taslak_id]).filter((x): x is string => !!x);
  const yayinlar = taslaklar.length
    ? await t.$queryRaw<Array<{ taslak_id: string; durum: YayinDurumu }>>(Prisma.sql`
        SELECT DISTINCT ON (y.taslak_id) y.taslak_id::text, y.durum FROM yayin y
         WHERE y.taslak_id = ANY(${taslaklar}::uuid[]) AND y.client_id = ${clientId}::uuid
         ORDER BY y.taslak_id, (y.sonlandi_at IS NULL) DESC, y.created_at DESC`)
    : [];
  for (const r of rehberler) {
    const oku = (tid: string | null) => (tid ? (yayinlar.find((y) => y.taslak_id === tid)?.durum ?? null) : null);
    harita.set(r.id, {
      id: r.id,
      durum: r.durum,
      yayinlar: (
        [
          ['meta', r.meta_taslak_id],
          ['google', r.google_taslak_id],
        ] as Array<[RehberPlatformu, string | null]>
      )
        .filter(([, tid]) => !!tid)
        .map(([platform, tid]) => ({ platform, durum: oku(tid) })),
    });
  }
  return harita;
}

/**
 * Kalem satırı → yanıt. `musteriGorunumu`: ajans iç notu ve "Kullan"
 * denmemiş yapay zekâ metinleri çıkar (müşteri hesabı, onay bağlantısı, PDF).
 */
export function kalemYaniti(
  k: KalemSatiri,
  o: {
    varliklar: Map<string, string>;
    rehber: RehberDurumSatiri | null;
    musteriGorunumu: boolean;
  },
): StratejiKalemi {
  const g = kalemGirdisi(k);
  const tahmin = tahminOku(k.tahmin);
  const metinKaynakli = (ham: unknown): KaynakliMetin | null => {
    const r = kaynakliMetinSchema.safeParse(ham);
    if (!r.success) return null;
    if (o.musteriGorunumu && !belgeyeGirerMi(r.data)) return null;
    return r.data;
  };
  const metin: KalemMetni | null = g.metin && o.musteriGorunumu && g.metin.kaynak === 'ai' ? null : g.metin;
  const acik = REHBER_PLATFORMLARI.filter((p) => (p === 'meta' ? k.meta_acik : k.google_acik));
  return {
    id: k.id,
    sira: k.sira,
    amac: k.amac,
    asama: AMAC_ASAMASI[k.amac],
    meta: k.meta_acik,
    google: k.google_acik,
    metaPayi: k.meta_payi,
    butceMicros: k.butce_micros,
    baslangic: k.baslangic,
    bitis: k.bitis,
    konumlar: g.konumlar,
    yasMin: k.yas_min,
    yasMax: k.yas_max,
    kelimeGrubu: k.kelime_grubu,
    varliklar: g.varlikIdleri.map((id) => {
      const ad = o.varliklar.get(id) ?? null;
      // Silinmiş varlığın önizlemesi yok; adres verilirse ekranda kırık görsel olurdu.
      return { id, ad, kucukResimAdresi: ad === null ? null : `/assets/${id}/preview`, silinmis: ad === null };
    }),
    metin,
    kreatifYonergesi: metinKaynakli(k.kreatif_yonergesi),
    kitleTarifi: metinKaynakli(k.kitle_tarifi),
    tahmin,
    kaynaklar: (k.kaynaklar && typeof k.kaynaklar === 'object' ? k.kaynaklar : {}) as StratejiKalemi['kaynaklar'],
    durum: kalemDurumu(o.rehber, acik),
    not: o.musteriGorunumu ? null : k.notu,
  };
}

/** Kayıtlı tahmin; eksik platform "kapalı" sayılır (boş hücre yok). */
export function tahminOku(ham: unknown): Record<RehberPlatformu, KalemTahmini> {
  const h = (ham && typeof ham === 'object' ? ham : {}) as Partial<Record<RehberPlatformu, KalemTahmini>>;
  return {
    meta: h.meta ?? { tur: 'yok', neden: 'platform_kapali' },
    google: h.google ?? { tur: 'yok', neden: 'platform_kapali' },
  };
}

export async function varlikAdlari(t: Sorgucu, clientId: string, idler: string[]): Promise<Map<string, string>> {
  if (idler.length === 0) return new Map();
  const r = await t.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT id::text, name FROM assets WHERE id = ANY(${idler}::uuid[]) AND client_id = ${clientId}::uuid`);
  return new Map(r.map((v) => [v.id, v.name]));
}

/** Plan + kalemler + bölümler — panel, bağlantı ve PDF'in ORTAK okuması. */
export async function belgeOku(
  t: Sorgucu,
  p: PlanSatiri,
  musteriGorunumu: boolean,
): Promise<{ kalemler: StratejiKalemi[]; bolumler: Partial<Record<StratejiBolumKodu, KaynakliMetin>>; riskler: StratejiRiski[] }> {
  const satirlar = await kalemSatirlari(t, p.id, p.client_id);
  const varliklar = await varlikAdlari(t, p.client_id, [...new Set(satirlar.flatMap((k) => k.varlik_idleri ?? []))]);
  const rehberler = await rehberDurumlari(t, p.client_id, satirlar.map((k) => k.rehber_id).filter((x): x is string => !!x));
  return {
    kalemler: satirlar.map((k) => kalemYaniti(k, { varliklar, rehber: k.rehber_id ? (rehberler.get(k.rehber_id) ?? null) : null, musteriGorunumu })),
    bolumler: bolumleriOku(p.bolumler, musteriGorunumu),
    riskler: riskleriOku(p.riskler),
  };
}
