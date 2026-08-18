import { hasPermission, requireSession } from '@/lib/session';
import { BilgiBankasi } from '@/components/autoboost/bilgi-bankasi';

export const metadata = { title: 'Bilgi Bankası — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * BİLGİ BANKASI — otomatik boost ön ayarları (Advetics 1.0).
 *
 * KÜTÜPHANE ALTINDA ve bu bilinçli: burada tanımlanan şey bir kampanya değil,
 * kampanyaların BESLENDİĞİ ayar — Görsel Arşivi ve Kreatifler'le aynı raf.
 *
 * Ön ayar olmadan onay kuyruğundaki kart onaylanamıyor; kart o durumda
 * "Bilgi Bankası'ndan tanımla" diyerek buraya yönlendiriyor.
 */
export default async function BilgiBankasiPage({
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
        <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
          Ön ayarlar müşteri başına tanımlanıyor: bütçe, hedefleme ve reklam
          metni her müşteride farklı.
        </p>
      </div>
    );
  }

  /*
   * YAZMA YETKİSİ AYRI KONTROL EDİLİYOR ve düğme ona göre kapanıyor.
   * Sunucu da aynı yetkiyi istiyor (`boost.write`); buradaki kontrol
   * kullanıcıya tıklanınca reddedilecek bir düğme göstermemek için.
   */
  const canWrite = hasPermission(session, 'boost.write');

  return (
    <div className="min-w-0 space-y-4">
      <header className="min-w-0">
        <h1 className="text-base font-semibold text-ink">Bilgi Bankası</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          Yeni bir gönderi ya da video yayınlandığında hangi ayarlarla
          boost'lanacağı burada tanımlanıyor.
        </p>
      </header>

      <BilgiBankasi clientId={clientId} canWrite={canWrite} />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
