import Link from 'next/link';
import {
  FORM_TYPE_META,
  LEAD_FORM_STATUS_LABELS,
  type LeadFormRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { FormBuilder } from '@/components/forms/form-builder';

export const metadata = { title: 'Formlar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Formlar kütüphanesi.
 *
 * BU EKRANIN TAŞIDIĞI TEK ZOR FİKİR: yayınlanmış form değiştirilemiyor.
 *
 * Meta'nın kuralı ve hukuki bir sebebi var — kullanıcı belirli bir onay
 * metnini kabul ederek veri verdi. Arayüzün işi bunu kullanıcı "Düzenle"ye
 * basmadan ÖNCE söylemek; sonradan söylemek, istemediği bir şeyi yapmış
 * olması demek.
 */
export default async function FormsPage({
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
  const canPublish = hasPermission(session, 'bulk.publish');

  const [connections, forms] = await Promise.all([
    serverApiFetch<
      Array<{ socialProfiles: Array<{ id: string; name: string; profileType: string }> }>
    >(`/connections?clientId=${clientId}`).catch(() => []),
    serverApiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${clientId}`).catch(() => []),
  ]);

  // FORM SAYFAYA AİT. Meta'da `leadgen_forms` sayfanın altında yaşıyor;
  // Instagram hesabı tek başına form barındıramıyor.
  const pages = connections
    .flatMap((c) => c.socialProfiles ?? [])
    .filter((p) => p.profileType === 'facebook_page');

  const editId = first(params.form);
  const editing = editId ? forms.find((f) => f.id === editId) : undefined;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Formlar</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Reklama tıklayan kişi siteye gitmeden, Facebook ya da Instagram'ın içinde
          bilgilerini bırakıyor.
        </p>
      </header>

      {pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">Önce bir Facebook sayfası gerekiyor</h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted">
            Anlık form sayfaya ait — reklam hesabına değil. Instagram hesabı tek başına
            yeterli değil.
          </p>
          <Link
            href="/ayarlar/baglantilar"
            className="mt-4 inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
          >
            Platform bağlantılarına git
          </Link>
        </div>
      ) : canWrite ? (
        <FormBuilder
          key={editing?.id ?? 'new'}
          clientId={clientId}
          pages={pages}
          existing={editing}
          canPublish={canPublish}
        />
      ) : (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Form oluşturmak için yetkin yok.
        </div>
      )}

      {forms.length > 0 && (
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Formların
          </h2>
          <ul>
            {forms.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {f.name}
                    {/* SÜRÜM ROZETİ yalnızca 1'den büyükse. Her formun yanında
                        "v1" yazmak, sürümlemeyi kullanıcının düşünmesi gereken
                        bir şeymiş gibi gösterirdi. */}
                    {f.version > 1 && (
                      <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
                        {f.version}. sürüm
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {f.socialProfileName} · {FORM_TYPE_META[f.formType].label} ·{' '}
                    {LEAD_FORM_STATUS_LABELS[f.status]} · {f.prefillQuestions.length} soru ·{' '}
                    {formatRelative(f.createdAt)}
                    {f.error && <span className="text-rose-700"> · {f.error}</span>}
                  </p>
                </div>
                {canWrite && (
                  <Link
                    href={`/kutuphane/formlar?form=${f.id}`}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    {f.status === 'published' ? 'Görüntüle' : 'Düzenle'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
