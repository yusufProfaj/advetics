import type {
  AssetListResult,
  CreativeRecord,
  KreatifPerformansListesi,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { CreativeLibrary } from '@/components/ad-builder/creative-library';
import { IsleyenKreatifler } from '@/components/ad-builder/isleyen-kreatifler';

export const metadata = { title: 'Kreatifler · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Kreatif kütüphanesi.
 *
 * NEDEN KÜTÜPHANEDE, "Oluştur" altında değil: kreatif bir kampanyaya ait
 * değil, MÜŞTERİYE ait. Aynı metin ve görsel on kampanyada kullanılabiliyor
 * ve "geçen ayki reklamı tekrarla" ancak böyle mümkün. Formlar ve Görsel
 * Arşivi de aynı sebeple burada.
 */
export default async function CreativesPage({
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
        <h1 className="text-sm font-semibold text-ink">Önce bir workspace seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');
  const client = session.availableClients.find((c) => c.id === clientId);

  /*
   * HATA YUTULMUYOR. Üçü de `.catch(() => …)` ile alınıyordu ve liste
   * okunamadığında ekran "kreatif yok" diyordu — kullanıcı kütüphanesinin
   * boşaldığını sanır.
   */
  const [kreatifSonuc, arsivSonuc, performansSonuc] = await Promise.allSettled([
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`),
    serverApiFetch<AssetListResult>(`/assets?clientId=${clientId}&kind=image&limit=60&offset=0`),
    /*
     * GEÇMİŞTE İŞE YARAYANLAR — platformdan senkronize edilmiş, YAYINA
     * GİRMİŞ kreatiflerin performansı. Kütüphanedeki (hiç yayınlanmamış
     * olabilen) kayıtlardan ayrı bir soruya cevap veriyor.
     */
    serverApiFetch<KreatifPerformansListesi>(`/creatives/performans?clientId=${clientId}&gun=90`),
  ]);

  const creatives = kreatifSonuc.status === 'fulfilled' ? kreatifSonuc.value : [];
  const library = arsivSonuc.status === 'fulfilled' ? arsivSonuc.value : null;
  const performans = performansSonuc.status === 'fulfilled' ? performansSonuc.value : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Kreatifler</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · metin havuzu ve
          görseller. Her platform kendi paketini bu havuzdan kuruyor.
        </p>
      </header>

      {/*
        ÖNCE GEÇMİŞ, SONRA KÜTÜPHANE. Kullanıcı bu ekrana "yeni bir şey
        yazacağım" diye geliyor ve neyin işe yaradığını görmeden yazmak,
        elindeki en iyi bilgiyi kullanmamak demek.
      */}
      {performans !== null && performans.rows.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Geçmişte işe yarayanlar</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Son {performans.gun} günde yayınlanmış reklamların gerçek performansı.
                Tıklama oranına göre sıralı.
              </p>
            </div>
            {/* SESSİZ KESME YOK: yeterli gösterim almadığı için sıralanmayan
                kreatifler sayılıyor. */}
            {performans.yetersiz > 0 && (
              <span className="text-[11px] text-ink-muted">
                {performans.yetersiz} kreatif yeterli gösterim almamış, listede yok
              </span>
            )}
          </div>
          <IsleyenKreatifler liste={performans.rows} />
        </section>
      )}

      {canWrite ? (
        <CreativeLibrary
          clientId={clientId}
          creatives={creatives}
          libraryAssets={library?.rows ?? []}
        />
      ) : (
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
          Kreatif düzenlemek için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
