import { Prisma } from '@prisma/client';
import type { TxRunner } from '../reklam/yayin-motoru';

/**
 * ═══ PİLOT SÜPÜRMESİ — KUYRUĞA GİREMEYEN ONAY, DÜŞMÜŞ SATIR İŞİ ═══
 *
 * Plan satırı bir NİYET kaydı, kuyruk gerçek: onay ucu kuyruğa ekleyemezse
 * (Redis geçici yok) plan `onaylandi`da, işçi deploy sırasında ölürse satır
 * `taslak`ta kalır ve ekran "kuruluyor" der, hiçbir log olmadan
 * (CLAUDE.md `takilan-parti` dersi). Süpürme bu ikisini yeniden kuyruğa
 * alır; iş kimliği 10 dakikalık dilimden türüyor, yani aynı dilimde ikinci
 * süpürme mükerrer iş açmaz. Düşmüş (son durumdaki) satırlar ASLA
 * kendiliğinden yeniden denenmez: para harcayan karar insanın ("Şimdi kur").
 */
export const SUPURME_BEKLEME_DK = 5;

export async function pilotSupurmesi(d: { tx: TxRunner; planEkle(planId: string, tetik: string): Promise<void> }, simdi = new Date()): Promise<number> {
  const esik = new Date(simdi.getTime() - SUPURME_BEKLEME_DK * 60_000);
  const planlar = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id::text FROM pilot_planlari p
       WHERE (p.durum = 'onaylandi' AND p.updated_at < ${esik})
          OR (p.durum = 'kuruluyor' AND EXISTS (
                SELECT 1 FROM pilot_kurulum_satirlari s
                 WHERE s.plan_id = p.id AND s.durum = 'taslak' AND s.updated_at < ${esik}))
       ORDER BY p.updated_at LIMIT 50`),
  );
  const dilim = `sup${Math.floor(simdi.getTime() / (10 * 60_000))}`;
  for (const p of planlar) await d.planEkle(p.id, dilim);
  return planlar.length;
}
