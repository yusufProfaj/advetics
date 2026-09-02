import { hasPermission, requireSession } from '@/lib/session';
import { Faturalar } from '@/components/report/faturalar';

export const metadata = { title: 'Faturalar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ FATURALAR — TOPLU YÖNETİM ═══
 *
 * Rapor sayfasındaki kutu "bu dönemin faturası" için hızlı yol; burası ise
 * ayın tamamını tek yerden yüklemek ve eksikleri görmek için. İkisi AYNI
 * bileşeni kullanıyor — ayrı yazılsalardı biri PDF doğrulamasını ya da
 * "üzerine yazılıyor" uyarısını kaybederdi.
 */
export default async function FaturalarPage({
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
        <p className="mt-2 text-sm text-ink-muted">Faturalar müşteri bazında tutuluyor.</p>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'report.share');
  const clientName = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Faturalar</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          {clientName} · platform faturaları rapor mailine ayrı ek olarak gider
        </p>
      </header>

      {/*
        NEDEN ELLE YÜKLENİYOR — ekranda yazıyor.
        Kullanıcı "bu neden otomatik değil" diye sormadan cevabı görmeli;
        yoksa her ay yükleme yapan kişi bunu bir eksiklik sanır.
      */}
      <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs text-ink-muted">
        <p className="font-medium text-ink">Faturalar neden otomatik gelmiyor?</p>
        <p className="mt-1">
          Google’ın fatura API’si yalnızca <strong>aylık faturalama</strong> (kredi
          hattı) olan hesaplarda çalışıyor; kartla ödeyen hesaplarda çağrı reddediliyor.
          Meta’da ise fatura PDF’i döndüren bir uç bulunmuyor — yalnızca fatura kaydı
          okunabiliyor. Bu yüzden belge platformdan indirilip buraya yükleniyor.
        </p>
      </div>

      <Faturalar clientId={clientId} canWrite={canWrite} baslikGoster={false} />
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
