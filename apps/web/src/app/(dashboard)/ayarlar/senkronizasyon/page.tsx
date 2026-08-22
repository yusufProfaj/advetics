import type { SyncStatusResponse } from '@advetics/shared';
import { serverApiFetch, ApiRequestError } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { SenkronDurumu } from '@/components/sync/senkron-durumu';

export const metadata = { title: 'Senkronizasyon Durumu — Advetics' };

/**
 * "BU MÜŞTERİDE VERİ NEDEN YOK" EKRANI.
 *
 * Bu sayfa bir teşhis aracı ve varlık sebebi somut: bir workspace'te Meta
 * verisi hiç gelmiyordu, bağlantı doğruydu, panelde bakılacak tek bir alan
 * yoktu. Altı ayrı arıza (hesap atanmamış / izleme kapalı / bağlantı yeniden
 * yetki istiyor / hesabın platform durumu süpürgeye takılıyor / yapı taraması
 * hiç koşmadı / iş başarılı bitti ama sıfır satır yazdı) AYNI boş grafiğe
 * düşüyordu ve altısının yapılacak işi farklı.
 *
 * Teşhisin tek yolu sunucuya SSH ile girip `sync-cli -- jobs` çalıştırmaktı.
 */
export default async function SenkronizasyonPage() {
  await requireSession();

  /*
   * HATA YUTULMUYOR. `.catch(() => null)` yazmak, bu ekranda özellikle
   * saçma olurdu: burası arızayı GÖSTERMEK için var ve kendi arızasını
   * gizlerse hiçbir işe yaramaz. API'nin kendi mesajı ekrana basılıyor.
   */
  let data: SyncStatusResponse | null = null;
  let hata: string | null = null;
  try {
    data = await serverApiFetch<SyncStatusResponse>('/sync/status');
  } catch (err) {
    hata =
      err instanceof ApiRequestError
        ? `${err.message} (${err.code}, HTTP ${err.status})`
        : err instanceof Error
          ? err.message
          : 'Bilinmeyen hata';
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Senkronizasyon Durumu</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Seçili müşterinin reklam hesapları, veri çekme işlerinin sonucu ve bir
          hesap için veri gelmiyorsa <strong>sebebi</strong>. Kenar çubuğundan
          müşteri değiştirerek her workspace için ayrı ayrı bakabilirsin.
        </p>
      </div>

      {hata !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Durum bilgisi alınamadı.</p>
          <p className="mt-1 text-ink-muted">{hata}</p>
        </div>
      ) : (
        <SenkronDurumu data={data!} />
      )}
    </div>
  );
}
