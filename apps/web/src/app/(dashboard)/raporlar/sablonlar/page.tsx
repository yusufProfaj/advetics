import type { ReportTemplateSummary } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { SablonYonetimi } from '@/components/report/sablon-yonetimi';

export const metadata = { title: 'Rapor Şablonları — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * RAPOR ŞABLONLARI.
 *
 * Şablon tablosu, sırayı süren `sections` dizisi ve belgeyi ondan render eden
 * zincir baştan beri vardı; eksik olan yalnızca bu ekrandı. Şablon şimdiye
 * kadar YALNIZCA paylaşım linki üretilirken sessizce oluşuyor, kullanıcı onu
 * bir daha hiç göremiyordu.
 */
export default async function SablonlarPage() {
  const session = await requireSession();

  /*
   * HATA YUTULMUYOR. `.catch(() => [])` "henüz yok", "yetki yok" ve "API
   * düştü" hâllerini aynı boş listeye çevirirdi — bu ekranda özellikle
   * yanıltıcı, çünkü boş liste burada NORMAL bir durum.
   */
  let sablonlar: ReportTemplateSummary[] = [];
  let hata: string | null = null;
  try {
    sablonlar = await serverApiFetch<ReportTemplateSummary[]>('/reports/templates');
  } catch (err) {
    hata =
      err instanceof ApiRequestError
        ? `${err.message} (${err.code}, HTTP ${err.status})`
        : err instanceof Error
          ? err.message
          : 'Bilinmeyen hata';
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Rapor Şablonları</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Raporda hangi bölümlerin, hangi sırayla görüneceğini burada
          belirliyorsun. Müşteriye özel bir şablon varsa o kullanılıyor; yoksa
          organizasyon varsayılanı.
        </p>
      </div>

      {hata !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Şablonlar alınamadı.</p>
          <p className="mt-1 text-ink-muted">{hata}</p>
        </div>
      ) : (
        <SablonYonetimi
          sablonlar={sablonlar}
          musteriler={session.availableClients.map((c) => ({ id: c.id, name: c.name }))}
          isOrgAdmin={session.isOrgAdmin}
        />
      )}
    </div>
  );
}
