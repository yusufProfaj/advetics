import { z } from 'zod';
import type { DagilimSatiri } from './dagilim';
import type { KelimeErisimDurumu, KelimeSatiri } from './kelime';
import type { MatrisSatiri } from './matris';
import { PLAN_EYLEMLERI, type PlanEylemi, type PlanOzeti } from './plan';

/**
 * ═══ YANIT ŞEKİLLERİ — Ajan 2 ile Ajan 3 arasındaki tek köprü ═══
 *
 * Panel bu tipleri `serverApiFetch<T>` ile okuyor ve o dönüşüm DENETİMSİZ
 * (CLAUDE.md): sunucu bir alanı atlarsa TypeScript susar, alan `undefined`
 * gelir. Bu yüzden şekil tek yerde ve servis dönüş tipini buradan alır.
 */

/** `GET /strateji/planlar` — dönem azalan. Sessiz kesme yok: toplam da döner. */
export interface PlanListesi {
  planlar: PlanOzeti[];
  toplam: number;
}

/** `GET /strateji/planlar/:id` */
export interface PlanDetayi {
  plan: PlanOzeti;
  dagilim: DagilimSatiri[];
  matris: MatrisSatiri[];
  kelimeler: {
    erisim: KelimeErisimDurumu;
    /** Seçili olanlar önce, sonra hacim azalan. */
    satirlar: KelimeSatiri[];
    gosterilen: number;
    toplam: number;
    /** Kuyrukta bekleyen ya da koşan bir arama var mı; panel yoklamayı buna bağlar. */
    aramaSuruyor: boolean;
    /** Son aramanın platform hatası (varsa); panel olduğu gibi gösterir. */
    sonHata: string | null;
  };
  /** Bu kullanıcının bu planda yapabileceği eylemler (durum × yetki). Düğmeler BUNDAN çizilir. */
  yapilabilir: PlanEylemi[];
}

/**
 * `POST /strateji/planlar/:id/eylem` gövdesi. `onayla` BURADA YOK: kendi
 * ucunda ve kendi izninde (`strategy.approve`); yazma izni onaylatmamalı.
 *
 * `surum` ZORUNLU: ekranın gördüğü sürüm. Başka biri arada planı değiştirdiyse
 * sunucu 409 döner; yoksa kullanıcı görmediği bir planı onaya gönderirdi.
 */
export const planEylemSchema = z.object({
  eylem: z.enum(PLAN_EYLEMLERI).refine((e) => e !== 'onayla', 'Onay kendi ucundan yapılır'),
  surum: z.number().int().positive(),
});
export type PlanEylemGirdisi = z.infer<typeof planEylemSchema>;

/** `POST /strateji/planlar/:id/onayla` gövdesi — aynı sürüm koruması. */
export const planOnaySchema = z.object({ surum: z.number().int().positive() });

/** `PATCH /strateji/planlar/:id/kelimeler` — seçim ve grup adı, toplu. */
export const kelimeGuncelleSchema = z.object({
  satirlar: z
    .array(
      z.object({
        id: z.string().uuid(),
        secili: z.boolean().optional(),
        grup: z.string().trim().max(80).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
  surum: z.number().int().positive(),
});
export type KelimeGuncelleGirdisi = z.infer<typeof kelimeGuncelleSchema>;
