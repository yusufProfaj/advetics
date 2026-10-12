import type { IkiAdimDurumu } from '@advetics/shared';
import { ROL_ETIKETI, SAHIP_ETIKETI } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { IkiAdimPaneli } from '@/components/hesap/iki-adim-paneli';

export const metadata = { title: 'Hesabım · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ HESABIM — KİŞİNİN KENDİ AYARLARI ═══
 *
 * NEDEN AYARLAR'IN SEKMESİ DEĞİL: Ayarlar yönetim yetkisine bağlı ve
 * workspace kullanıcısına (client_viewer) hiç görünmüyor (`nav-sections.ts`).
 * İki adımlı doğrulama ise HERKESİN kendi hesabı için; Ayarlar'a koymak en
 * çok korunması gereken hesapların bir kısmını dışarıda bırakırdı. Kapı
 * kenar çubuğunun altındaki ad kartı (Google'ın sağ üstteki profil
 * menüsünün karşılığı); menüye ayrı satır eklenmedi, çünkü müşteri hesabının
 * dört ekranlık menüsü kullanıcı kararı.
 */
export default async function HesabimSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  /*
   * HATA YUTULMUYOR: "2FA kapalı" ile "durum okunamadı" aynı ekran olamaz.
   * İlki kullanıcıyı "Aç"a, ikincisi beklemeye yönlendiriyor; birleştirmek
   * açık bir 2FA'yı kapalı gösterip ikinci kurulumu denetirdi.
   */
  let durum: IkiAdimDurumu | null = null;
  let hata: string | null = null;
  try {
    durum = await serverApiFetch<IkiAdimDurumu>('/auth/2fa');
  } catch (err) {
    hata = err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı';
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="sayfa-baslik">Hesabım</h1>
        <p className="mt-0.5 text-sm text-ink-muted">Giriş bilgilerin ve hesabının güvenliği.</p>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-muted">Ad</dt>
          <dd className="text-ink">{session.user.fullName}</dd>
          <dt className="text-ink-muted">E-posta</dt>
          <dd className="break-all text-ink">{session.user.email}</dd>
          <dt className="text-ink-muted">Rol</dt>
          <dd className="text-ink">{session.platformAdmin ? SAHIP_ETIKETI : ROL_ETIKETI[session.rol]}</dd>
        </dl>
      </section>

      {durum ? (
        <IkiAdimPaneli durum={durum} kurtarmaIleGirdi={params.kurtarma === '1'} />
      ) : (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <p className="font-medium text-danger-strong">Güvenlik ayarların okunamadı.</p>
          <p className="mt-1 text-ink-muted">{hata}</p>
        </div>
      )}
    </div>
  );
}
