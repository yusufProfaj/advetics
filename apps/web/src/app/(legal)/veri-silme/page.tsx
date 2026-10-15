import type { Metadata } from 'next';

import { sec } from '@advetics/shared';
import { YasalDuzen, yasalMeta } from '@/components/landing/yasal-duzen';
import { veriSilmeEn } from '@/components/yasal/veri-silme.en';
import { veriSilmeTr } from '@/components/yasal/veri-silme.tr';
import { yasalSozlugu } from '@/dil/sozlukler/yasal';
import { dilAl } from '@/dil/sunucu';

/**
 * Sayfa İNCE: metin `components/yasal/veri-silme.{tr,en}.tsx` çiftinde.
 * Türkçe adres (`/veri-silme`) Meta App Review formunda "Data Deletion
 * Instructions URL" olarak kayıtlı ve DEĞİŞMİYOR; `/en/data-deletion`
 * middleware ile buraya yeniden yazılıyor, dil `dilAl()`den.
 */
const YOL = '/veri-silme';

async function icerik() {
  return (await dilAl()) === 'en' ? veriSilmeEn() : veriSilmeTr();
}

export async function generateMetadata(): Promise<Metadata> {
  return yasalMeta(await icerik(), YOL, await dilAl());
}

interface DeletionStatus {
  confirmationCode: string;
  platform: string;
  status: 'received' | 'completed' | 'failed';
  deletedConnections: number;
  requestedAt: string;
  completedAt: string | null;
}

/**
 * Meta'nın veri silme akışı, kullanıcıyı buraya `?talep=<kod>` ile yönlendirir.
 * Meta bu durum sayfasını şart koşuyor: kullanıcı talebinin ne olduğunu
 * görebilmeli.
 */
async function fetchStatus(code: string): Promise<DeletionStatus | null> {
  const base = process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/connections/meta/data-deletion/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as DeletionStatus;
  } catch {
    return null;
  }
}

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ talep?: string }>;
}) {
  const { talep } = await searchParams;
  const status = talep ? await fetchStatus(talep) : null;
  const dil = await dilAl();
  const i = dil === 'en' ? veriSilmeEn() : veriSilmeTr();
  // Talep kutusu belgenin değil sayfanın parçası: Meta kullanıcıyı `?talep=` ile
  // hangi dilde yönlendirirse o dilde okunmalı, tarih de o dilin biçiminde.
  const d = sec(yasalSozlugu, dil).talep;
  const tarih = (t: string) => new Date(t).toLocaleString(d.yerel);

  return (
    <YasalDuzen yol={YOL} baslik={i.baslik} guncelleme={i.guncelleme} ozet={i.ozet} bolumler={i.bolumler}>
      {talep && (
        <div
          className={`mt-5 rounded-xl border p-4 ${
            status?.status === 'completed'
              ? 'border-ok/30 bg-ok-soft/70 text-ok-strong'
              : status?.status === 'failed'
                ? 'border-danger/30 bg-danger-soft/70 text-danger-strong'
                : 'border-warn/30 bg-warn-soft/70 text-warn-strong'
          }`}
        >
          <p className="text-sm font-semibold">{d.baslik}</p>
          {status ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                {d.onayKodu} <code className="text-xs">{status.confirmationCode}</code>
              </p>
              <p>
                {d.durum}{' '}
                <strong>
                  {status.status === 'completed'
                    ? d.tamamlandi
                    : status.status === 'failed'
                      ? d.basarisiz
                      : d.isleniyor}
                </strong>
              </p>
              {status.status === 'completed' && <p>{d.silinenler(status.deletedConnections)}</p>}
              <p className="text-xs opacity-80">
                {d.talepTarihi} {tarih(status.requestedAt)}
                {status.completedAt ? ` · ${d.tamamlanma} ${tarih(status.completedAt)}` : ''}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm">
              {d.bulunamadi}{' '}
              <a href="mailto:hello@profaj.com" className="underline">
                hello@profaj.com
              </a>{' '}
              {d.adreseYaz}
            </p>
          )}
        </div>
      )}
      {i.govde}
    </YasalDuzen>
  );
}
