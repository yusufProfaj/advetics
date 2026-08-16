import Link from 'next/link';
import type { AssetListResult, DraftGroupRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { SimpleAdBuilder } from '@/components/ad-builder/simple-builder';
import { DraftGroupList } from '@/components/ad-builder/draft-group-list';

export const metadata = { title: 'Hızlı Reklam — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Basit yüzey — "Google akıllı kampanya" karşılığı.
 *
 * HEDEF KULLANICI REKLAMCILIK BİLMİYOR. Ekranda hedef, optimizasyon, yerleşim,
 * teklif stratejisi ya da PLATFORM SEÇİMİ geçmiyor. Hepsi sunucuda karara
 * bağlanıyor (`goal-mapping.ts`, `buildDraftTree`).
 *
 * PLATFORM BİR SORU DEĞİL, SONUÇ. Kullanıcı Meta'nın ne, Google'ın ne yaptığını
 * bilmiyor; ona "hangi platform" diye sormak, cevabını bilmediği bir soruyu
 * sormak olurdu. Hedefi soruyoruz, platformu kartın altında SÖYLÜYORUZ.
 */
export default async function SimpleAdPage({
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

  const [connections, library, groups] = await Promise.all([
    serverApiFetch<
      Array<{
        adAccounts: Array<{ id: string; name: string; currency: string; platform: string }>;
        socialProfiles: Array<{ id: string; name: string; profileType: string }>;
      }>
    >(`/connections?clientId=${clientId}`).catch(() => []),
    serverApiFetch<AssetListResult>(
      `/assets?clientId=${clientId}&kind=image&limit=60&offset=0`,
    ).catch(() => null),
    serverApiFetch<DraftGroupRecord[]>(`/draft-campaigns?clientId=${clientId}`).catch(() => []),
  ]);

  const accounts = connections.flatMap((c) => c.adAccounts ?? []);
  // REKLAM SAYFA ADINA YAYINLANIYOR ve Instagram hesabı tek başına bunu
  // yapamıyor — Meta reklamı her zaman bir Facebook sayfasına bağlıyor.
  const pages = connections
    .flatMap((c) => c.socialProfiles ?? [])
    .filter((p) => p.profileType === 'facebook_page');

  const metaAccounts = accounts.filter((a) => a.platform === 'meta');

  if (metaAccounts.length === 0 || pages.length === 0) {
    return <Missing hasAccounts={metaAccounts.length > 0} hasPages={pages.length > 0} />;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-xl font-semibold text-ink">Hızlı Reklam</h1>
        {/* HANGİ MÜŞTERİ İÇİN ÇALIŞILDIĞI YAZIYOR.
            Eski sihirbazda yazmıyordu ve reklam hesabı sessizce listenin ilk
            elemanına düşüyordu; 12 müşteri arasında gezinen bir ajans için
            yanlış hesaba yayın en pahalı sessiz hata. */}
        <p className="mt-0.5 text-sm text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> için reklam
          oluşturuyorsun. Ne istediğini söyle, gerisini biz hallederiz.
        </p>
        </div>
        {/* UZMAN YÜZEYİNE GEÇİŞ. İki yüzey aynı ağaca yazıyor; geçiş
            kullanıcının bir şey kaybetmesine yol açmıyor, yalnızca aynı işi
            başka bir soru setiyle yapıyor. */}
        <Link
          href={`/reklam-olustur/uzman?musteri=${clientId}`}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Kampanya Kur (uzman)
        </Link>
      </header>

      {canWrite ? (
        <SimpleAdBuilder
          clientId={clientId}
          accounts={metaAccounts}
          pages={pages}
          libraryAssets={library?.rows ?? []}
          libraryTotal={library?.total ?? 0}
        />
      ) : (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Reklam oluşturmak için yetkin yok.
        </div>
      )}

      {groups.length > 0 && <DraftGroupList groups={groups} />}
    </div>
  );
}

/**
 * Eksik ön koşul ekranı.
 *
 * NE EKSİK olduğunu tek tek söylüyor. "Bağlantı kurmalısın" demek yetmez:
 * kullanıcının hangisini kurduğunu ve hangisinin kaldığını görmesi gerekiyor.
 */
function Missing({ hasAccounts, hasPages }: { hasAccounts: boolean; hasPages: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h1 className="text-sm font-semibold text-ink">Reklam vermek için iki şey gerekiyor</h1>
      <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left text-sm">
        <li className={hasAccounts ? 'text-ink-muted line-through' : 'text-ink'}>
          {hasAccounts ? '✓' : '○'} Bir Meta reklam hesabı
        </li>
        <li className={hasPages ? 'text-ink-muted line-through' : 'text-ink'}>
          {hasPages ? '✓' : '○'} Bir Facebook sayfası
        </li>
      </ul>
      <p className="mx-auto mt-3 max-w-md text-xs text-ink-muted">
        Reklam her zaman bir Facebook sayfası adına yayınlanır. Instagram hesabı tek başına
        yeterli değil.
      </p>
      <Link
        href="/ayarlar/baglantilar"
        className="mt-4 inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
      >
        Platform bağlantılarına git
      </Link>
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
