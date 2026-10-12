import { Prisma } from '@prisma/client';
import {
  TAKIP_ACIGI,
  eslenemeyenPay,
  kampanyaEsle,
  takipAcigi,
  trafikKaynagi,
  type EslemeKampanyasi,
  type EslenemediNedeni,
  type Platform,
  type TakipAcigiSatiri,
  type TakipAcigiYaniti,
} from '@advetics/shared';
import { gunEkle, type TxLike } from '../sinyal/sinyal-hesap';

/**
 * ═══ TAKİP AÇIĞI — TEK HESAP, İKİ TÜKETİCİ ═══
 *
 * Raporlar'daki "Site ve dönüşüm" tablosu (`GET /veri-kaynaklari/takip-acigi`)
 * ve sinyal kontrolü (`takip_acigi`) AYNI fonksiyonu çağırıyor. İkisi ayrı
 * yazılsaydı ekran "uyumlu" derken sinyal "tutmuyor" diye mail atardı
 * (CLAUDE.md "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR").
 *
 * SİTE TARAFI İKİ AYRI SORGU, JOIN YOK: anahtar etkinlik tablosu satırı
 * etkinlik başına çoğaltıyor; oturumla JOIN edip toplamak oturumu etkinlik
 * sayısı kadar katlardı. İkisi kampanya anahtarında JS'te birleşiyor.
 *
 * EŞLEME SORGU ANINDA (esleme.ts): saklanmış eşleme kampanya adı değişince
 * bayatlardı.
 */

export interface SiteKampanyaSatiri {
  kaynakOrtam: string;
  kampanyaAdi: string | null;
  kampanyaKimligi: string | null;
  adsKampanyaKimligi: string | null;
  anahtarEtkinlik: number;
  oturum: number;
}

export interface PlatformKampanyasi extends EslemeKampanyasi {
  adAccountId: string;
  donusum: number;
  tiklama: number;
}

export interface TakipHesabi {
  satirlar: TakipAcigiSatiri[];
  eslenemeyen: { pay: number | null; anahtarEtkinlik: number; nedenler: Partial<Record<EslenemediNedeni, number>> };
}

const anahtar = (s: Pick<SiteKampanyaSatiri, 'kaynakOrtam' | 'kampanyaAdi' | 'kampanyaKimligi' | 'adsKampanyaKimligi'>) =>
  JSON.stringify([s.kaynakOrtam, s.kampanyaAdi, s.kampanyaKimligi, s.adsKampanyaKimligi]);

/** Saf hesap: kampanya başına platform + site, etiket ve eşlenemeyen pay. */
export function takipHesapla(kampanyalar: readonly PlatformKampanyasi[], site: readonly SiteKampanyaSatiri[]): TakipHesabi {
  const toplam = new Map<string, { siteDonusum: number; siteOturum: number }>();
  const nedenler: Partial<Record<EslenemediNedeni, number>> = {};
  const payGirdisi: Array<{ eslendi: boolean; ucretli: boolean; anahtarEtkinlik: number }> = [];
  for (const s of site) {
    const e = kampanyaEsle(
      { sourceMedium: s.kaynakOrtam, kampanyaAdi: s.kampanyaAdi, kampanyaKimligi: s.kampanyaKimligi, googleAdsKampanyaKimligi: s.adsKampanyaKimligi },
      kampanyalar,
    );
    const ucretli = trafikKaynagi(s.kaynakOrtam) !== 'diger';
    payGirdisi.push({ eslendi: e.sonuc !== 'eslenemedi', ucretli, anahtarEtkinlik: s.anahtarEtkinlik });
    if (e.sonuc === 'eslenemedi') {
      // Organik trafiğin nedeni sayılmıyor: payda ücretli trafik (eslenemeyenPay notu).
      if (ucretli && s.anahtarEtkinlik > 0) nedenler[e.neden] = (nedenler[e.neden] ?? 0) + s.anahtarEtkinlik;
      continue;
    }
    const t = toplam.get(e.kampanyaId) ?? { siteDonusum: 0, siteOturum: 0 };
    t.siteDonusum += s.anahtarEtkinlik;
    t.siteOturum += s.oturum;
    toplam.set(e.kampanyaId, t);
  }
  const satirlar: TakipAcigiSatiri[] = [];
  for (const k of kampanyalar) {
    const t = toplam.get(k.id);
    // Ne tıklaması ne site verisi olan kampanya tabloyu şişirmesin.
    if (!t && k.tiklama === 0 && k.donusum === 0) continue;
    const g = { platformDonusum: k.donusum, siteDonusum: t?.siteDonusum ?? 0, platformTiklama: k.tiklama };
    const r = takipAcigi(g);
    satirlar.push({
      platform: k.platform,
      kampanyaId: k.id,
      kampanyaAdi: k.ad,
      ...g,
      siteOturum: t?.siteOturum ?? 0,
      etiket: r.etiket,
      oran: r.oran,
    });
  }
  satirlar.sort((a, b) => b.platformTiklama - a.platformTiklama || a.kampanyaAdi.localeCompare(b.kampanyaAdi, 'tr'));
  const p = eslenemeyenPay(payGirdisi);
  return { satirlar, eslenemeyen: { pay: p.pay, anahtarEtkinlik: p.eslenemeyen, nedenler } };
}

/** Kıyasın son günü: GA4 işlenmesini bitirmeden kıyas yok (son `isleniyorGun` gün + bugün dışarıda). */
export function kiyasBitisi(to: string, bugun: string): string {
  const sinir = gunEkle(bugun, -(TAKIP_ACIGI.isleniyorGun + 1));
  return to < sinir ? to : sinir;
}

// ─── Veritabanı okuyucuları (worker'da admin, panelde withTenant) ──────────

/** Site tarafı: iki ayrı toplama, kampanya anahtarında birleşir. */
export async function siteSatirlari(db: TxLike, clientId: string, from: string, to: string): Promise<SiteKampanyaSatiri[]> {
  const etkinlik = await db.$queryRaw<Array<{ ko: string; ad: string | null; kim: string | null; ads: string | null; n: number }>>(Prisma.sql`
    SELECT kaynak_ortam AS ko, kampanya_adi AS ad, kampanya_kimligi AS kim, ads_kampanya_kimligi AS ads,
           sum(anahtar_etkinlik)::float8 AS n
      FROM ga4_anahtar_etkinlik_gunluk
     WHERE client_id = ${clientId}::uuid AND gun BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2, 3, 4`);
  const oturum = await db.$queryRaw<Array<{ ko: string; ad: string | null; kim: string | null; ads: string | null; n: number }>>(Prisma.sql`
    SELECT kaynak_ortam AS ko, kampanya_adi AS ad, kampanya_kimligi AS kim, ads_kampanya_kimligi AS ads,
           sum(oturum)::float8 AS n
      FROM ga4_gunluk
     WHERE client_id = ${clientId}::uuid AND gun BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2, 3, 4`);
  const m = new Map<string, SiteKampanyaSatiri>();
  const al = (r: { ko: string; ad: string | null; kim: string | null; ads: string | null }) => {
    const s = { kaynakOrtam: r.ko, kampanyaAdi: r.ad, kampanyaKimligi: r.kim, adsKampanyaKimligi: r.ads };
    const k = anahtar(s);
    let v = m.get(k);
    if (!v) {
      v = { ...s, anahtarEtkinlik: 0, oturum: 0 };
      m.set(k, v);
    }
    return v;
  };
  for (const r of etkinlik) al(r).anahtarEtkinlik += Number(r.n);
  for (const r of oturum) al(r).oturum += Number(r.n);
  return [...m.values()];
}

/**
 * Platform tarafı: kampanya seviyesi dönüşüm + tıklama. Eşleme adayları
 * workspace'in BÜTÜN kampanyaları (yalnız metriği olanlar değil): utm
 * kimliği bir kampanyaya eşitse o kampanya dönemde harcamasa da bulunmalı.
 * `adAccountId` verilirse yalnız o hesap (sinyal hesap başına koşuyor).
 */
export async function platformKampanyalari(
  db: TxLike,
  clientId: string,
  from: string,
  to: string,
  adAccountId?: string,
): Promise<PlatformKampanyasi[]> {
  const hesapSuzgeci = adAccountId ? Prisma.sql`AND c.ad_account_id = ${adAccountId}::uuid` : Prisma.empty;
  const satirlar = await db.$queryRaw<
    Array<{ id: string; ad_account_id: string; platform: Platform; external_id: string; name: string; d: number | null; t: number | null }>
  >(Prisma.sql`
    SELECT c.id::text AS id, c.ad_account_id::text AS ad_account_id, c.platform::text AS platform, c.external_id, c.name,
           m.d, m.t
      FROM campaigns c
      LEFT JOIN (
        SELECT entity_id, sum(conversions)::float8 AS d, sum(clicks)::float8 AS t
          FROM insights_daily
         WHERE client_id = ${clientId}::uuid AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
           AND date BETWEEN ${from}::date AND ${to}::date
         GROUP BY entity_id
      ) m ON m.entity_id = c.id
     WHERE c.client_id = ${clientId}::uuid ${hesapSuzgeci}`);
  return satirlar.map((r) => ({
    id: r.id,
    adAccountId: r.ad_account_id,
    platform: r.platform,
    externalId: r.external_id,
    ad: r.name,
    donusum: Number(r.d ?? 0),
    tiklama: Number(r.t ?? 0),
  }));
}

// ─── Yanıt: panel ucu VE rapor belgesi (tek üretici) ───────────────────────

interface Ga4KaynakSatiri {
  id: string;
  durum: string;
  saat_dilimi: string | null;
  para_birimi: string | null;
  yapi: Record<string, unknown> | null;
  son_basarili_cekim: Date | string | null;
}

/** Kaynağın saat diliminde bugün (kaynak bilinmiyorsa İstanbul). */
function bugunDilimde(saatDilimi: string | null, simdi: Date): string {
  const bicim = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
  try {
    return bicim(saatDilimi ?? 'Europe/Istanbul');
  } catch {
    return bicim('Europe/Istanbul');
  }
}

/**
 * `TakipAcigiYaniti` — Raporlar ekranının ucu (`GET /veri-kaynaklari/takip-acigi`)
 * ve rapor belgesinin "Site ve Dönüşüm" bölümü (reports.service) BURADAN.
 * İki ayrı yazılsaydı ekran ile müşteriye giden PDF farklı sayı gösterirdi
 * (CLAUDE.md "AYNI BELGEYİ İSTEYEN HER YOL AYNI SORGUYU KURMALI").
 * `t` çağıranın kapsamı: panelde withTenant (RLS), raporda rapor transaction'ı.
 */
export async function takipAcigiYaniti(t: TxLike, q: { clientId: string; from: string; to: string }, simdi: Date): Promise<TakipAcigiYaniti> {
  const [k] = await t.$queryRaw<Ga4KaynakSatiri[]>(Prisma.sql`
    SELECT id::text AS id, durum, saat_dilimi, para_birimi, yapi, son_basarili_cekim
      FROM veri_kaynaklari
     WHERE client_id = ${q.clientId}::uuid AND tur = 'ga4' AND durum <> 'kaldirildi'
     ORDER BY created_at LIMIT 1`);
  const kiyasBitis = kiyasBitisi(q.to, bugunDilimde(k?.saat_dilimi ?? null, simdi));
  const emptyReason: TakipAcigiYaniti['emptyReason'] = !k
    ? 'kaynak_yok'
    : k.son_basarili_cekim === null
      ? k.durum === 'izin_eksik' || k.durum === 'erisim_yok'
        ? 'izin_eksik'
        : 'cekim_kosmadi'
      : null;
  const bos: TakipAcigiYaniti = {
    donem: { from: q.from, to: q.to },
    kiyasBitis,
    emptyReason,
    satirlar: [],
    toplamSatir: 0,
    eslenemeyen: { pay: null, anahtarEtkinlik: 0, nedenler: {} },
    uyarilar: [],
    kalite: { digerSatiri: false, esiklendi: false, ornekleme: false },
  };
  if (!k || emptyReason) return bos;
  if (kiyasBitis < q.from) {
    return { ...bos, emptyReason: 'veri_yok', uyarilar: [`Seçilen dönem Analytics’te hâlâ işleniyor; son ${TAKIP_ACIGI.isleniyorGun} gün ve bugün kıyasa girmez.`] };
  }
  const site = await siteSatirlari(t, q.clientId, q.from, kiyasBitis);
  if (site.length === 0) return { ...bos, emptyReason: 'veri_yok' };
  const kampanyalar = await platformKampanyalari(t, q.clientId, q.from, kiyasBitis);
  const h = takipHesapla(kampanyalar, site);

  const uyarilar: string[] = [];
  if (kiyasBitis < q.to) uyarilar.push(`${kiyasBitis} sonrası kıyasa girmedi (Analytics verisi işleniyor).`);
  const hesaplar = await t.$queryRaw<Array<{ timezone: string; currency: string }>>(Prisma.sql`
    SELECT DISTINCT timezone, currency FROM ad_accounts WHERE client_id = ${q.clientId}::uuid AND sync_enabled`);
  const farkliDilim = [...new Set(hesaplar.map((a) => a.timezone).filter((z) => k.saat_dilimi && z !== k.saat_dilimi))];
  if (farkliDilim.length > 0) {
    uyarilar.push(`Reklam hesabının saat dilimi (${farkliDilim.join(', ')}) Analytics mülkününkinden (${k.saat_dilimi}) farklı: günlük kıyas kayabilir, dönem toplamı geçerli.`);
  }
  const farkliPara = [...new Set(hesaplar.map((a) => a.currency).filter((c) => k.para_birimi && c !== k.para_birimi))];
  if (farkliPara.length > 0) {
    uyarilar.push(`Para birimleri farklı (${k.para_birimi} / ${farkliPara.join(', ')}): gelir kıyası yapılmaz, kur tahmini kullanılmaz.`);
  }
  const sk = (k.yapi?.sonKalite ?? {}) as { digerSatiri?: boolean; esiklendi?: boolean; ornekleme?: number | null };
  return {
    ...bos,
    satirlar: h.satirlar,
    toplamSatir: h.satirlar.length,
    eslenemeyen: h.eslenemeyen,
    uyarilar,
    kalite: {
      digerSatiri: sk.digerSatiri === true || site.some((s) => s.kampanyaAdi?.trim() === '(other)'),
      esiklendi: sk.esiklendi === true,
      ornekleme: typeof sk.ornekleme === 'number',
    },
  };
}
