import Link from 'next/link';
import type { CreativeRecord, DraftGroupRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { DuplicatePanel } from '@/components/ad-builder/duplicate-panel';

export const metadata = { title: 'Toplu Oluştur — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Toplu oluşturma — ARTIK BİR TABLO DEĞİL.
 *
 * ESKİSİ ŞUNU İSTİYORDU: Excel'de sekiz sütun hazırla, panele yapıştır,
 * üstelik Meta ad set kimliğiyle Facebook sayfa kimliğini ELLE yaz — ikisi de
 * zaten veritabanımızda duruyorken. Sütun kayması en yaygın hataydı ve
 * yapıştırmadan önce görünmüyordu.
 *
 * YENİSİ: çalışan bir kampanyayı seç, ondan N varyasyon üret. Ajansın
 * gerçekte yaptığı iş bu — sıfırdan altmış farklı reklam değil, aynı yapının
 * farklı bütçe/kreatif/kelime denemeleri. Kaynak zaten doğrulanmış bir ağaç,
 * yani hesap-sayfa-platform uyumu bir kez kontrol edildi.
 */
export default async function BulkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  const client = session.availableClients.find((c) => c.id === clientId);

  const [groups, creatives] = await Promise.all([
    serverApiFetch<DraftGroupRecord[]>(`/draft-campaigns?clientId=${clientId}`).catch(() => []),
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`).catch(() => []),
  ]);

  /**
   * KAYNAK OLARAK YAYINLANMIŞLAR DA GEÇERLİ.
   *
   * "Geçen ayki kampanyayı bu ay tekrar ver" ajansın en sık işi ve o kampanya
   * yayınlanmış olanı. Yalnızca taslakları listelemek, aracın en değerli
   * kullanımını kapatırdı.
   */
  const campaigns = groups.flatMap((g) => g.campaigns);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Toplu Oluştur</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> · bir kampanyadan
            varyasyonlar üret. Yazmadığın her alan kaynaktan gelir.
          </p>
        </div>
        <Link
          href={`/reklam-olustur/uzman?musteri=${clientId}`}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Sıfırdan kampanya kur
        </Link>
      </header>

      {canWrite ? (
        <DuplicatePanel campaigns={campaigns} creatives={creatives} />
      ) : (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Toplu oluşturmak için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
