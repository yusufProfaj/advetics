import type { Metadata } from 'next';
import type { ReportData } from '@advetics/shared';
import { API_URL } from '@/lib/api';
import { ReportDocument } from '@/components/report/report-document';
import { PrintButton } from '@/components/report/print-button';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';

/**
 * Müşteriye gönderilen rapor — OTURUM GEREKTİRMEZ.
 *
 * `/r` yolu middleware'in genel erişim listesinde. Erişim kontrolü URL'deki
 * token: sunucu onu hash'leyip tek satır çekiyor.
 *
 * `force-dynamic`: paylaşım linki görüntüleme sayacını artırıyor ve rapor
 * verisi geri düzeltmeyle değişebiliyor. Önbelleğe almak müşteriye bayat sayı
 * göstermek olurdu.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rapor',
  // Rapor müşteri verisi içeriyor: arama motorlarına girmemesi gerekiyor.
  // Link "gizli" ama gizlilik dizine eklenmemekle desteklenmeli.
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * Raporu doğrudan API'den çekiyor.
 *
 * `serverApiFetch` kullanılmıyor: o yardımcı oturum cookie'sini iletiyor ve
 * burada oturum YOK. Kimliksiz bir istek göndermek doğru davranış — token
 * yolun kendisinde.
 */
async function fetchReport(token: string): Promise<ReportData | { error: 'gone' | 'notfound' }> {
  const res = await fetch(`${API_URL}/reports/shared/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return { error: 'notfound' };
  if (res.status === 410) return { error: 'gone' };
  if (!res.ok) return { error: 'notfound' };
  return (await res.json()) as ReportData;
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchReport(token);

  if ('error' in result) {
    /*
     * ORTAK SAYFA BAŞLIĞI (`SayfaBasligi`), elle `h1` değil: müşterinin
     * gördüğü tek panel ekranı bu ve yazı tipi panelle aynı olmalı. İki
     * hâl ayrı cümle: "süresi doldu" yeni bağlantı istemeye, "bulunamadı"
     * adresi kontrol etmeye gönderiyor.
     */
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-md">
          <SayfaBasligi
            baslik={result.error === 'gone' ? 'Bu raporun süresi doldu' : 'Rapor bulunamadı'}
            aciklama={
              result.error === 'gone'
                ? 'Ajansınızdan yeni bir bağlantı isteyebilirsiniz.'
                : 'Bağlantı hatalı olabilir ya da iptal edilmiş olabilir.'
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-muted py-8 print:bg-white print:py-0">
      {/* Yazdırma çubuğu basılan çıktıda görünmüyor (`rpt-noprint`). */}
      <div className="rpt-noprint mx-auto mb-4 flex max-w-[880px] items-center justify-between gap-4 px-8">
        <p className="m-0 text-12 text-ink-muted">
          {result.client.name} · {result.from} - {result.to}
        </p>
        <PrintButton />
      </div>
      {/* GÖLGE YOK (kart kalıbı): belge çizgiyle ayrılıyor; baskıda çizgi de yok. */}
      <div className="mx-auto max-w-[880px] border border-line print:max-w-none print:border-0">
        <ReportDocument data={result} />
      </div>
    </main>
  );
}
