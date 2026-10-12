import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { KAYNAK_SUPURULEN_DURUMLAR, kaynakGunlukPencere } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import type { SyncJobPayload } from '../../queue/queues';
import {
  KaynakEksikVeri,
  KaynakKotaReddi,
  kaynakBugun,
  kaynakGecmis,
  kaynakGunluk,
  kaynakYapi,
  kotaAnahtari,
  type IsSonucu,
  type KaynakIsBagimliliklari,
} from './veri-kaynagi-is';

/**
 * ═══ VERİ KAYNAĞI İŞLERİ — WORKER GİRİŞİ ═══
 *
 * `SyncProcessorService` kaynak işini (`veriKaynagiId` dolu) buraya
 * yönlendiriyor; hesap kota bekçisinden ve hesap döngüsünden GEÇMİYOR.
 *
 * HATA KAYDI BURADA, `recordFailure`da DEĞİL: o fonksiyon Google'ın
 * `rate_limited` hatasında GOOGLE ADS PLATFORM KESİCİSİNİ açıyor (geliştirici
 * token'ının ortak kovası) ve bütün Google Ads hesaplarının işlerini
 * durduruyor. Analytics Data API'nin 429'u mülkün kotası: onu Ads kovasına
 * yazmak, bir müşterinin Looker panosu yüzünden 54 hesabın senkronizasyonunu
 * durdurmak olurdu. Burada 429 YALNIZ bu kaynağın kesicisini açıyor.
 * `veri-kaynagi-is.spec.ts` bunu kilitliyor.
 */
@Injectable()
export class VeriKaynagiIsService {
  private readonly logger = new Logger(VeriKaynagiIsService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly kasa: TokenVaultService,
    private readonly saglayicilar: ProviderRegistry,
    private readonly quota: QuotaGuardService,
    private readonly queue: SyncQueueService,
  ) {}

  private bagimliliklar(): KaynakIsBagimliliklari {
    return {
      db: this.db as unknown as KaynakIsBagimliliklari['db'],
      ga4: async (connectionId) => new Ga4Istemcisi(await this.kasa.getAccessToken(connectionId, this.saglayicilar.get('google'))),
      kota: {
        izin: (anahtar, katman) => this.quota.kaynakIzni(anahtar, katman),
        kaydet: (anahtar, kota) => this.quota.kaynakKotaKaydet(anahtar, kota),
      },
      kuyruk: { enqueue: (p) => this.queue.enqueue(p) },
      simdi: new Date(),
    };
  }

  /** Tek kaynağın işi. Satırı açar, sonucu yazar; kota reddinde gecikmeli tekrar. */
  async isle(payload: SyncJobPayload): Promise<{ rows: number; note: string }> {
    const syncJobId = BigInt(payload.syncJobId);
    if (!payload.veriKaynagiId) {
      await this.kapat(syncJobId, 'failed', 'missing_source', `${payload.jobType} veri kaynağı olmadan geldi`);
      throw new UnrecoverableError(`${payload.jobType} veri kaynağı olmadan geldi`);
    }
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });
    const b = this.bagimliliklar();
    try {
      let r: IsSonucu;
      if (payload.jobType === 'kaynak_yapi') r = await kaynakYapi(b, payload.veriKaynagiId);
      else if (payload.jobType === 'kaynak_gecmis') r = await kaynakGecmis(b, payload.veriKaynagiId);
      else if (payload.jobType === 'kaynak_gunluk') {
        if (!payload.dateFrom || !payload.dateTo) {
          await this.kapat(syncJobId, 'failed', 'missing_dates', 'kaynak_gunluk tarih aralığı olmadan geldi');
          throw new UnrecoverableError('kaynak_gunluk tarih aralığı olmadan geldi');
        }
        r = await kaynakGunluk(b, payload.veriKaynagiId, { from: payload.dateFrom, to: payload.dateTo }, payload.interactive === true);
      } else {
        await this.kapat(syncJobId, 'failed', 'not_implemented', `${payload.jobType} işleyicisi yok (F3)`);
        throw new UnrecoverableError(`${payload.jobType} işleyicisi yok`);
      }
      await this.db.syncJob.update({
        where: { id: syncJobId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          rowsUpserted: r.rows,
          apiCallsUsed: r.apiCalls,
          // succeeded + rows=0 NOTSUZ KALMAZ (CLAUDE.md): her yol not döndürüyor.
          note: r.note.slice(0, 500),
          errorCode: null,
          errorMessage: null,
        },
      });
      return { rows: r.rows, note: r.note };
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      await this.hataYaz(syncJobId, payload.veriKaynagiId, err);
      throw err;
    }
  }

  private async kapat(id: bigint, status: 'failed', kod: string, mesaj: string): Promise<void> {
    await this.db.syncJob.update({
      where: { id },
      data: { status, finishedAt: new Date(), errorCode: kod.slice(0, 80), errorMessage: mesaj.slice(0, 1000) },
    });
  }

  private async hataYaz(syncJobId: bigint, kaynakId: string, err: unknown): Promise<void> {
    const pe = err instanceof PlatformApiError ? err : undefined;
    const kota = err instanceof KaynakKotaReddi;
    const eksik = err instanceof KaynakEksikVeri;
    if (pe?.kind === 'rate_limited') {
      // YALNIZ BU KAYNAĞIN KESİCİSİ (sınıf yorumu). Google Ads kovasına dokunulmuyor.
      const [k] = await this.db.$queryRaw<Array<{ tur: string; dis_kimlik: string }>>(Prisma.sql`
        SELECT tur, dis_kimlik FROM veri_kaynaklari WHERE id = ${kaynakId}::uuid`);
      if (k) await this.quota.kaynakKesici(kotaAnahtari(k), pe.detail?.retryAfterSeconds ?? 3600).catch(() => undefined);
    }
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: kota || pe?.kind === 'rate_limited' ? 'throttled' : 'failed',
        nextRetryAt: new Date(Date.now() + (kota ? (err as KaynakKotaReddi).retryAfterMs : (pe?.detail?.retryAfterSeconds ?? 300) * 1000)),
        errorCode: (kota ? 'kaynak_kotasi' : eksik ? 'kaynak_eksik_veri' : (pe?.kind ?? 'unknown')).slice(0, 80),
        errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        // Ö-4: KISMİ rapor sebebi notta da (teşhis ekranı notu okuyor); pencere yazılmadı, iş tekrar denenecek.
        ...(eksik ? { note: `pencere YAZILMADI, tekrar denenecek: ${(err as Error).message}`.slice(0, 500) } : {}),
      },
    });
    if (!kota) this.logger.error(`Kaynak işi düştü (${kaynakId}): ${err instanceof Error ? err.message : String(err)}`);
  }

  /**
   * SÜPÜRME: kaynak başına iş. Durum süzgeci `KAYNAK_SUPURULEN_DURUMLAR`
   * (etkin + hata); izin/erişim sorunu olanlar kullanıcının "Şimdi yenile"
   * ya da izin vermesini bekliyor (her gece aynı reddi almak, kotasız ama
   * gürültülü bir kalıcı hata satırı demekti). Kaç tanesi atlandı yazılır.
   */
  async supur(jobType: 'kaynak_yapi' | 'kaynak_gunluk'): Promise<{ rows: number; note: string }> {
    const kaynaklar = await this.db.$queryRaw<Array<{ id: string; client_id: string; durum: string; saat_dilimi: string | null }>>(Prisma.sql`
      SELECT v.id::text AS id, v.client_id::text AS client_id, v.durum, v.saat_dilimi
        FROM veri_kaynaklari v
        JOIN clients c ON c.id = v.client_id AND c.status = 'active'::"ClientStatus"
       WHERE v.tur = 'ga4'`);
    let acilan = 0;
    let atlanan = 0;
    let zatenKuyrukta = 0;
    let bugunCekilmis = 0;
    const simdi = new Date();
    for (const k of kaynaklar) {
      if (!(KAYNAK_SUPURULEN_DURUMLAR as readonly string[]).includes(k.durum)) {
        atlanan++;
        continue;
      }
      let tarih: { from: string; to: string } | null = null;
      if (jobType === 'kaynak_gunluk') {
        tarih = kaynakGunlukPencere('ga4', kaynakBugun(k.saat_dilimi, simdi));
        if (!tarih) continue;
        // Aynı pencere zaten başarıyla çekildiyse (zincir ya da elle) ikinci kez kota yakma.
        const [c] = await this.db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM sync_jobs
           WHERE veri_kaynagi_id = ${k.id}::uuid AND job_type = 'kaynak_gunluk'::"SyncJobType"
             AND status = 'succeeded'::"SyncJobStatus" AND date_from = ${tarih.from}::date
             AND (note IS NULL OR note NOT LIKE 'hesaplanmadı:%')`);
        if ((c?.n ?? 0) > 0) {
          bugunCekilmis++;
          continue;
        }
      }
      const r = await this.queue.enqueue({
        clientId: k.client_id,
        platform: 'google',
        jobType,
        veriKaynagiId: k.id,
        dateFrom: tarih?.from,
        dateTo: tarih?.to,
      });
      if (r.enqueued) acilan++;
      else zatenKuyrukta++;
    }
    const note =
      `${jobType}: ${acilan} kaynak kuyruğa alındı, ${zatenKuyrukta} zaten kuyrukta` +
      (bugunCekilmis ? `, ${bugunCekilmis} kaynağın penceresi bugün çekilmiş` : '') +
      (atlanan ? `, ${atlanan} kaynak durumu yüzünden atlandı (izin/erişim/duraklatıldı/kaldırıldı)` : '');
    this.logger.log(note);
    return { rows: 0, note };
  }
}
