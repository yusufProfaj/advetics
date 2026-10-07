import { z } from 'zod';

/**
 * ═══ PİLOT UÇ GÖVDELERİ (Ajan 2 eki, 2026-10-07) ═══
 *
 * Sözleşme uçların yolunu ve iznini (`PILOT_UCLARI`) taşıyordu, gövdeleri
 * değil. Panel (Ajan 3) gövdeleri aşağıdaki biçimde gönderiyor; şemalar
 * burada ki sunucu ile panel aynı tanımı okusun. Hepsi `.strict()`:
 * bilinmeyen alan sessizce atılmaz, reddedilir (kabul listesi H-06).
 */
const surum = z.number().int().positive();
const donem = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem YYYY-MM olmalı');

export const planHazirlaSchema = z.object({ clientId: z.string().uuid(), donem }).strict();
export type PlanHazirlaGirdisi = z.infer<typeof planHazirlaSchema>;

/** Elle değişiklik varsa `onay: true` olmadan yeniden hazırlanmaz (I-05). */
export const planYenidenHazirlaSchema = z.object({ surum, onay: z.boolean().optional() }).strict();
export type PlanYenidenHazirlaGirdisi = z.infer<typeof planYenidenHazirlaSchema>;

export const PILOT_EYLEM_UCU_EYLEMLERI = ['musteriye_gonder', 'geri_cek', 'yeniden_dene', 'kapat', 'iptal'] as const;
export const planEylemiSchema = z.object({ eylem: z.enum(PILOT_EYLEM_UCU_EYLEMLERI), surum }).strict();
export type PlanEylemiGirdisi = z.infer<typeof planEylemiSchema>;

export const degisiklikIsteSchema = z.object({ surum, not: z.string().trim().min(1, 'Not zorunlu').max(1000) }).strict();
export type DegisiklikIsteGirdisi = z.infer<typeof degisiklikIsteSchema>;

export const uyumIsaretSchema = z
  .object({ surum, kuralKimligi: z.string().regex(/^[A-Z]{3}-(\d{2}|[A-Z]{3})$/), mesaj: z.string().min(1).max(600) })
  .strict();
export type UyumIsaretGirdisi = z.infer<typeof uyumIsaretSchema>;

export const planOnaylaSchema = z
  .object({
    surum,
    icerikOzeti: z.string().regex(/^[0-9a-f]{64}$/),
    /** Yalnız ajans rolünde; sunucu `onayKapisi` ile en az uzunluğu da sınar. */
    musteriAdinaGerekce: z.string().max(1000).optional(),
  })
  .strict();
export type PlanOnaylaGirdisi = z.infer<typeof planOnaylaSchema>;
