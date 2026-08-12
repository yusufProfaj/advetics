import {
  LEAD_STATUSES,
  type LeadFormRecord,
  type LeadListResult,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { LeadTable } from '@/components/leads/lead-table';

export const metadata = { title: 'Potansiyel Müşteriler — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Potansiyel müşteriler.
 *
 * BU EKRANIN İKİ İŞİ VAR ve ikincisi kolay atlanan:
 *
 *   1. Kayıtları göstermek ve durumlarını ilerletmek.
 *   2. VERİ HATTININ SAĞLIĞINI göstermek. Boş bir liste iki anlama geliyor —
 *      "kimse form doldurmadı" ya da "sistem çalışmıyor" — ve ikisi
 *      birbirinden ayırt edilemezse ajans günlerce bekler.
 *
 * Mutabakat oranı bu ayrımı yapıyor: kayıtlar tarama ile geliyorsa webhook
 * o sayfa için ölmüş demektir ve bu, başka hiçbir yerde görünmeyecek bir arıza.
 */
export default async function LeadsPage({
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

  const status = first(params.durum);
  const search = first(params.ara);
  const formId = first(params.form);

  const query = new URLSearchParams({ clientId, limit: '50', offset: '0' });
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    query.set('status', status);
  }
  if (search) query.set('search', search);
  if (formId) query.set('leadFormId', formId);

  const [result, forms] = await Promise.all([
    serverApiFetch<LeadListResult>(`/leads?${query.toString()}`).catch(() => null),
    serverApiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${clientId}`).catch(() => []),
  ]);

  if (!result) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
        Kayıtlar yüklenemedi.
      </div>
    );
  }

  const canWrite = hasPermission(session, 'lead.write');
  const canExport = hasPermission(session, 'lead.export');
  const total = Object.values(result.byStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Potansiyel Müşteriler</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Anlık formu dolduran kişiler. Yeni kayıtlar birkaç saniye içinde düşer.
          </p>
        </div>
        {canExport && total > 0 && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? ''}/leads/export?${query.toString()}`}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
          >
            CSV indir
          </a>
        )}
      </header>

      {/* VERİ HATTI SAĞLIĞI — liste boşken de görünüyor. */}
      {result.reconciledRatio > 0.3 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">Anlık bildirim gecikmeli çalışıyor olabilir.</p>
          <p className="mt-1 text-xs">
            Kayıtların %{Math.round(result.reconciledRatio * 100)}'i anlık bildirimle değil,
            periyodik taramayla geldi. Kayıtlar kaybolmuyor ama saatler geç düşüyor —
            Meta uygulama ayarlarındaki webhook aboneliğini kontrol et.
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">Henüz kayıt yok</h2>
          {/* BOŞ LİSTE İKİ ANLAMA GELİYOR ve hangisi olduğunu söylemek şart. */}
          <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted">
            Formu dolduran biri olduğunda kaydı burada görürsün. Yayında bir form
            reklamın varsa ve saatlerdir hiç kayıt düşmediyse, Kütüphane &gt; Formlar
            bölümünden formun yayında olduğunu doğrula.
          </p>
        </div>
      ) : (
        <LeadTable
          initial={result}
          clientId={clientId}
          forms={forms}
          activeStatus={status ?? null}
          activeSearch={search ?? ''}
          activeFormId={formId ?? null}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
