import { Prisma } from '@prisma/client';
import {
  kurulumGecisiIzinliMi,
  kuruluyorPlanKarari,
  KURULUM_SINIFI,
  takilanSatirKarari,
  TAKILAN_SATIR_HEDEFI,
  TAKILAN_SATIR_MESAJI,
  type KurulumAraDurumu,
  type KurulumSatirDurumu,
} from '@advetics/shared';
import type { TxRunner } from '../reklam/yayin-motoru';
import { planDurumuGuncelle } from './kurulum-isleyici';

/**
 * ═══ PİLOT SÜPÜRMESİ — KUYRUĞA GİREMEYEN ONAY, DÜŞMÜŞ VE TAKILMIŞ SATIR İŞİ ═══
 *
 * Plan satırı bir NİYET kaydı, kuyruk gerçek: onay ucu kuyruğa ekleyemezse
 * (Redis geçici yok) plan `onaylandi`da, işçi deploy sırasında ölürse satır
 * `taslak`ta kalır ve ekran "kuruluyor" der, hiçbir log olmadan
 * (CLAUDE.md `takilan-parti` dersi). Süpürme bunları yeniden kuyruğa
 * alır; iş kimliği 10 dakikalık dilimden türüyor, yani aynı dilimde ikinci
 * süpürme mükerrer iş açmaz. Düşmüş (son durumdaki) satırlar ASLA
 * kendiliğinden yeniden denenmez: para harcayan karar insanın ("Şimdi kur").
 *
 * ARA DURUMDA TAKILAN SATIR (Ajan 4 B-4, 2026-10-08). Önceden süpürme
 * yalnız `taslak`a bakıyordu: `prova`/`kuruluyor`/`geri_okundu_ayni`/
 * `aciliyor`da ölen bir iş planı SONSUZA DEK `kuruluyor`da bırakıyor ve
 * kısmi tekil indeks o ayın yeni planını kilitliyordu. Bugün plan başına
 * TEK karar (`kuruluyorPlanKarari`, ajansın "Kurulumu durdur" ucuyla AYNI):
 *   · `suruyor`        — genç bir ara satır var: canlı iş, dokunma.
 *   · `sayimi_yenile`  — bütün satırlar son durumda ama plan kaymamış.
 *   · `satir_yok`      — işçi satırları açmadan ölmüş: plan işi yeniden.
 *   · `takildi`        — satır başına `takilanSatirKarari`: önce yeniden
 *     kuyruk (`deneme` + 1; işçinin `ara` yolu kaldığı adımdan sürüyor ve
 *     gönderilmiş ama yazılmamış POST görürse `kayit_belirsiz` diyor, yani
 *     yeniden POST yok), hak bitince `TAKILAN_SATIR_HEDEFI` (başarısız son
 *     durum) ve plan sayımla `kismen_kuruldu`ya iner; oradan "Şimdi kur" ve
 *     "Vazgeç" (kapat → kısmi tekil indeks serbest).
 */
export const SUPURME_BEKLEME_DK = 5;
const PLAN_SINIRI = 50;

export interface SupurmeBagimliliklari {
  tx: TxRunner;
  planEkle(planId: string, tetik: string): Promise<void>;
  satirEkle(satirId: string, tetik: string): Promise<void>;
}

export async function pilotSupurmesi(d: SupurmeBagimliliklari, simdi = new Date()): Promise<number> {
  const esik = new Date(simdi.getTime() - SUPURME_BEKLEME_DK * 60_000);
  const dilim = `sup${Math.floor(simdi.getTime() / (10 * 60_000))}`;
  let islenen = 0;

  // 1. Kuyruğa giremeyen onay ve işçisi taslakta ölmüş satır (ucuz yol:
  //    taslak platforma hiç gitmemiş satır, plan işi onu yeniden kuyruğa alır).
  const planlar = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id::text FROM pilot_planlari p
       WHERE (p.durum = 'onaylandi' AND p.updated_at < ${esik})
          OR (p.durum = 'kuruluyor' AND EXISTS (
                SELECT 1 FROM pilot_kurulum_satirlari s
                 WHERE s.plan_id = p.id AND s.onaylanan_surum = p.onaylanan_surum
                   AND s.durum = 'taslak' AND s.updated_at < ${esik}))
       ORDER BY p.updated_at LIMIT ${PLAN_SINIRI}`),
  );
  const yeniden = new Set<string>();
  for (const p of planlar) {
    await d.planEkle(p.id, dilim);
    yeniden.add(p.id);
    islenen++;
  }

  // 2. `kuruluyor` planlarının TEK kararı.
  const kuruluyor = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string; onaylanan_surum: number | null; updated_at: Date }>>(Prisma.sql`
      SELECT id::text, onaylanan_surum, updated_at FROM pilot_planlari
       WHERE durum = 'kuruluyor' ORDER BY updated_at LIMIT ${PLAN_SINIRI}`),
  );
  for (const p of kuruluyor) {
    if (yeniden.has(p.id)) continue;
    const satirlar = await d.tx((t) =>
      t.$queryRaw<Array<{ id: string; durum: KurulumSatirDurumu; updated_at: Date; deneme: number }>>(Prisma.sql`
        SELECT id::text, durum, updated_at, deneme FROM pilot_kurulum_satirlari
         WHERE plan_id = ${p.id}::uuid AND onaylanan_surum = ${p.onaylanan_surum}`),
    );
    const karar = kuruluyorPlanKarari({
      planGuncellendi: new Date(p.updated_at).toISOString(),
      satirlar: satirlar.map((s) => ({ durum: s.durum, guncellendi: new Date(s.updated_at).toISOString() })),
      simdi: simdi.toISOString(),
    });
    if (karar.tur === 'suruyor') continue;
    islenen++;
    if (karar.tur === 'sayimi_yenile') {
      await planDurumuGuncelle(d, p.id);
      continue;
    }
    if (karar.tur === 'satir_yok') {
      await d.planEkle(p.id, dilim);
      continue;
    }
    let dusen = 0;
    for (const s of satirlar) {
      const k = takilanSatirKarari({ durum: s.durum, guncellendi: new Date(s.updated_at).toISOString(), supurmeDenemesi: s.deneme }, simdi.toISOString());
      if (k.tur === 'yeniden_kuyruk') {
        // Sayaç ve zaman AYNI yazımda, iyimser kilitle: yeniden kuyruğa giren
        // satır 45 dakikalık yeni bir pencere alır (aksi hâlde bir sonraki
        // süpürme onu, iş daha başlamadan yine "takılmış" sayardı).
        const r = await d.tx((t) =>
          t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE pilot_kurulum_satirlari SET deneme = deneme + 1, updated_at = now()
             WHERE id = ${s.id}::uuid AND durum = ${s.durum} AND deneme = ${s.deneme}
            RETURNING id::text`),
        );
        if (r.length === 1) await d.satirEkle(s.id, dilim);
      } else if (k.tur === 'dusur') {
        if (await satiriDusur(d, s.id, s.durum, k.mesaj)) dusen++;
      }
    }
    if (dusen > 0) await planDurumuGuncelle(d, p.id);
  }
  return islenen;
}

/**
 * Ara durumdaki satırı `TAKILAN_SATIR_HEDEFI`ne çeker; iyimser kilitle
 * (satır bu arada ilerlediyse dokunmaz, `false`). Süpürme ve worker'ın
 * `failed` dinleyicisi AYNI fonksiyonu kullanır: iki ayrı UPDATE yazılsaydı
 * biri `prova`yı `dustu`ya (izinsiz geçiş) çekerdi.
 */
export async function satiriDusur(d: { tx: TxRunner }, satirId: string, durum: KurulumSatirDurumu, mesaj: string): Promise<boolean> {
  if (KURULUM_SINIFI[durum].son) return false;
  const hedef = TAKILAN_SATIR_HEDEFI[durum as KurulumAraDurumu];
  if (!kurulumGecisiIzinliMi(durum, hedef)) throw new Error(`İzinsiz kurulum geçişi: ${durum} → ${hedef}`);
  const r = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE pilot_kurulum_satirlari SET durum = ${hedef}, platform_mesaji = ${mesaj.slice(0, 2000)}, updated_at = now()
       WHERE id = ${satirId}::uuid AND durum = ${durum}
      RETURNING id::text`),
  );
  return r.length === 1;
}

/**
 * Worker'ın `failed` dinleyicisi (NİHAİ düşüş, `attempts: 1`): satır hangi
 * ara durumdaysa süpürmeyi beklemeden başarısız son duruma iner ve plan
 * sayımı yenilenir. Önceden yalnız `taslak` kapatılıyordu; `prova`da ölen
 * bir iş planı kalıcı `kuruluyor`da bırakıyordu (B-4).
 */
export async function takilanSatiriKapat(d: { tx: TxRunner }, satirId: string, sebep: string): Promise<boolean> {
  const [s] = await d.tx((t) =>
    t.$queryRaw<Array<{ plan_id: string; durum: KurulumSatirDurumu }>>(Prisma.sql`
      SELECT plan_id::text, durum FROM pilot_kurulum_satirlari WHERE id = ${satirId}::uuid`),
  );
  if (!s) return false;
  const dustu = await satiriDusur(d, satirId, s.durum, `İş durdu: ${sebep}. ${TAKILAN_SATIR_MESAJI}`);
  if (dustu) await planDurumuGuncelle(d, s.plan_id);
  return dustu;
}
