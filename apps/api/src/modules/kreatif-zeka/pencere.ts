import { Prisma } from '@prisma/client';
import { PENCERE_GUN, type Platform } from '@advetics/shared';
import type { TxLike } from './sayac';

/**
 * ═══ PENCERE: SON 90 GÜNDE HARCAMASI OLAN KREATİFLER ═══
 *
 * İş (hangi kreatif etiketlenecek) ve ekran (puan, kova, farklar) AYNI
 * sorguyu okuyor. İki sorgu olsaydı iş bir kreatifi etiketler, ekran onu
 * başka bir pencereyle sayar ve "312 kreatiften 288'i etiketli" cümlesi
 * kendi kendisiyle çelişirdi (CLAUDE.md "AYNI SÜZGECİ İKİ YERDE YAZMA").
 *
 * KAYNAK REKLAM SEVİYESİ: `insights_daily` `entity_level = 'ad'`. Kreatif
 * bir reklamdan çok reklamda kullanılabiliyor (Meta N-12); metrikler
 * kreatif başına TOPLANIYOR, ad/kampanya/amaç en çok harcayan reklamdan.
 *
 * PARA RAPOR BİRİMİNDE: `spend_micros_reporting` varsa o, yoksa reklam
 * hesabı zaten rapor biriminde ise `spend_micros`. İkisi de değilse o gün
 * ÇEVRİLEMİYOR ve kreatif `kurEksik` işaretleniyor; eşik onun için
 * "bilinmiyor" sayılıyor. 1 USD'yi 1 TL diye toplamak eşiği ve sırayı
 * sessizce bozardı.
 *
 * SORGU `client_id = ...` İLE TEK WORKSPACE: İyileştir tek workspace
 * ekranı. Hesap kimliği verilirse (iş) yalnız o hesabın reklamları.
 */

export interface PencereSatiri {
  creativeId: string;
  platform: Platform;
  adAccountId: string;
  /** En çok harcayan reklam (ad, kampanya, amaç ondan). */
  adId: string;
  adAdi: string;
  kampanyaAdi: string | null;
  objective: string | null;
  gosterim: number;
  tiklama: number;
  donusum: number;
  harcamaMicros: bigint;
  kurEksik: boolean;
}

/** `YYYY-MM-DD` üzerinde gün kaydırma, Date'e çevirmeden. */
export function gunKaydir(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function pencereKreatifleri(
  tx: TxLike,
  g: { clientId: string; paraBirimi: string; bugun: string; adAccountId?: string },
): Promise<PencereSatiri[]> {
  const bas = gunKaydir(g.bugun, -PENCERE_GUN);
  const son = gunKaydir(g.bugun, -1);
  const satirlar = await tx.$queryRaw<
    Array<{
      creative_id: string;
      platform: Platform;
      ad_account_id: string;
      ad_id: string;
      ad_adi: string;
      kampanya_adi: string | null;
      objective: string | null;
      g: string;
      t: string;
      d: string;
      h: string;
      kur_eksik: boolean;
    }>
  >(Prisma.sql`
    SELECT a.creative_id::text AS creative_id, a.platform::text AS platform, a.ad_account_id::text AS ad_account_id,
           a.id::text AS ad_id, a.name AS ad_adi, c.name AS kampanya_adi, c.objective,
           sum(i.impressions)::text AS g, sum(i.clicks)::text AS t, sum(i.conversions)::text AS d,
           coalesce(sum(coalesce(i.spend_micros_reporting,
                    CASE WHEN i.currency = ${g.paraBirimi} THEN i.spend_micros END)), 0)::text AS h,
           bool_or(i.spend_micros_reporting IS NULL AND i.currency <> ${g.paraBirimi} AND i.spend_micros > 0) AS kur_eksik
      FROM insights_daily i
      JOIN ads a ON a.id = i.entity_id
      LEFT JOIN ad_groups ag ON ag.id = a.ad_group_id
      LEFT JOIN campaigns c ON c.id = ag.campaign_id
     WHERE i.client_id = ${g.clientId}::uuid
       AND i.entity_level = 'ad'::"EntityLevel"
       AND i.breakdown_key = ''
       AND i.date BETWEEN ${bas}::date AND ${son}::date
       AND a.creative_id IS NOT NULL
       ${g.adAccountId ? Prisma.sql`AND i.ad_account_id = ${g.adAccountId}::uuid` : Prisma.empty}
     GROUP BY a.creative_id, a.platform, a.ad_account_id, a.id, a.name, c.name, c.objective
    HAVING sum(i.spend_micros) > 0`);

  /*
   * KREATİF BAŞINA TOPLAM, en çok harcayan reklamın künyesiyle. Sıra eşitlikte
   * reklam kimliğine göre: aynı harcamalı iki reklamda künye her istekte
   * aynı olmalı, yoksa kart başlığı yenilemede değişir.
   */
  const kreatif = new Map<string, PencereSatiri & { _enCok: bigint }>();
  for (const r of satirlar) {
    const h = BigInt(r.h);
    const var_ = kreatif.get(r.creative_id);
    const olcu = { gosterim: Number(r.g), tiklama: Number(r.t), donusum: Number(r.d) };
    if (!var_) {
      kreatif.set(r.creative_id, {
        creativeId: r.creative_id,
        platform: r.platform,
        adAccountId: r.ad_account_id,
        adId: r.ad_id,
        adAdi: r.ad_adi,
        kampanyaAdi: r.kampanya_adi,
        objective: r.objective,
        ...olcu,
        harcamaMicros: h,
        kurEksik: r.kur_eksik,
        _enCok: h,
      });
      continue;
    }
    var_.gosterim += olcu.gosterim;
    var_.tiklama += olcu.tiklama;
    var_.donusum += olcu.donusum;
    var_.harcamaMicros += h;
    var_.kurEksik ||= r.kur_eksik;
    if (h > var_._enCok || (h === var_._enCok && r.ad_id < var_.adId)) {
      Object.assign(var_, { adId: r.ad_id, adAdi: r.ad_adi, kampanyaAdi: r.kampanya_adi, objective: r.objective, adAccountId: r.ad_account_id, _enCok: h });
    }
  }
  return [...kreatif.values()]
    .map(({ _enCok: _, ...s }) => s)
    .sort((a, b) => (b.harcamaMicros > a.harcamaMicros ? 1 : b.harcamaMicros < a.harcamaMicros ? -1 : a.creativeId.localeCompare(b.creativeId)));
}

/**
 * İLK GÖSTERİM GÜNÜ — pencereyle SINIRLI DEĞİL. "Yeni" kreatif ilk
 * gösterimi son 14 günde olan; pencere başındaki bir günü "ilk" saymak
 * 90 günlük kreatifi yeni gösterirdi.
 */
export async function ilkGosterimler(tx: TxLike, clientId: string, creativeIds: string[]): Promise<Map<string, string>> {
  if (creativeIds.length === 0) return new Map();
  const r = await tx.$queryRaw<Array<{ creative_id: string; gun: string }>>(Prisma.sql`
    SELECT a.creative_id::text AS creative_id, min(i.date)::text AS gun
      FROM insights_daily i
      JOIN ads a ON a.id = i.entity_id
     WHERE i.client_id = ${clientId}::uuid
       AND i.entity_level = 'ad'::"EntityLevel"
       AND i.breakdown_key = ''
       AND i.impressions > 0
       AND a.creative_id = ANY(${creativeIds}::uuid[])
     GROUP BY a.creative_id`);
  return new Map(r.map((x) => [x.creative_id, x.gun]));
}

/**
 * 1 birim rapor parası kaç TL (`harcamaEsigiMicros` girdisi). TL'de sorulmuyor.
 * Kur yoksa `null`: eşik "bilinmiyor" ve kreatif "veri yetersiz · kur
 * bilinmiyor" der (MIMARI Ç-8); 1.000 USD'yi eşik saymak onu 40 kat büyütürdü.
 */
export async function tryKuru(tx: TxLike, paraBirimi: string): Promise<number | null> {
  if (paraBirimi === 'TRY') return null;
  const [r] = await tx.$queryRaw<Array<{ kur: string | null }>>(Prisma.sql`
    SELECT coalesce(
      (SELECT rate FROM fx_rates WHERE base_currency = ${paraBirimi} AND quote_currency = 'TRY' ORDER BY date DESC LIMIT 1),
      (SELECT 1 / NULLIF(rate, 0) FROM fx_rates WHERE base_currency = 'TRY' AND quote_currency = ${paraBirimi} ORDER BY date DESC LIMIT 1)
    )::text AS kur`);
  const kur = r?.kur ? Number(r.kur) : NaN;
  return Number.isFinite(kur) && kur > 0 ? kur : null;
}
