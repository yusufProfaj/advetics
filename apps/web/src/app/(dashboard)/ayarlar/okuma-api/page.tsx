import { notFound } from 'next/navigation';
import type { OkumaAnahtariOzeti, OkumaAraciTanimi } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { OkumaApiPaneli } from '@/components/okuma-api/okuma-api-paneli';

export const metadata = { title: 'Okuma API · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * OKUMA API — PLATFORM SAHİBİNİN YAPAY ZEKÂ KAPISI.
 *
 * Menü satırı zaten yalnızca platform sahibine görünüyor; adresi bilen
 * başkası için burada `notFound`. Yönlendirme değil 404: ekranın VARLIĞI
 * da platform sahibine ait bir bilgi. Gerçek kapı API'de
 * (`platformSahibiOlmali`); bu kontrol yalnızca boş bir ekranı önlüyor.
 */
export default async function OkumaApiSayfasi() {
  const session = await requireSession();
  if (!session.platformAdmin) notFound();

  /*
   * HATA YUTULMUYOR: "anahtarın yok" ile "liste okunamadı" ayrı hâller.
   * İkisi aynı boş listeye çevrilirse kullanıcı çalışan bir anahtarın
   * yanına gereksiz bir ikincisini üretir.
   */
  let anahtarlar: OkumaAnahtariOzeti[] = [];
  let araclar: OkumaAraciTanimi[] = [];
  let hata: string | null = null;
  try {
    [anahtarlar, araclar] = await Promise.all([
      serverApiFetch<OkumaAnahtariOzeti[]>('/okuma-api/anahtarlar'),
      serverApiFetch<OkumaAraciTanimi[]>('/okuma-api/araclar'),
    ]);
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
        <h1 className="sayfa-baslik">Okuma API</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Advetics verisini Claude, Cursor gibi yapay zekâ araçlarına MCP sunucusu olarak bağla.
          Anahtar yalnızca okur: kampanya açamaz, durduramaz, bütçe değiştiremez. Bu ekranı
          yalnızca <strong>{session.user.email}</strong> görüyor.
        </p>
      </div>

      {hata !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Anahtarlar alınamadı.</p>
          <p className="mt-1 text-ink-muted">{hata}</p>
        </div>
      ) : (
        <OkumaApiPaneli anahtarlar={anahtarlar} araclar={araclar} />
      )}
    </div>
  );
}
