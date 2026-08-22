import type { EmailAccountSummary } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { EpostaAyarlari } from '@/components/email/eposta-ayarlari';

export const metadata = { title: 'E-posta Ayarları — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * KENDİ E-POSTA AYARLARIN.
 *
 * Rapor müşteriye danışmanın KENDİ adresinden gidiyor: müşteri "yanıtla"
 * dediğinde ona ulaşmalı ve mail onun imzasını taşımalı. Bu yüzden ayar
 * kullanıcı başına ve HERKES KENDİSİ giriyor — yönetici kimsenin adına
 * kuramıyor, çünkü satır o kişinin uygulama parolasını taşıyor ve onu
 * okuyabilmek o hesabın adına mail gönderebilmek demek.
 */
export default async function EpostaAyarlariSayfasi() {
  const session = await requireSession();

  let hesap: EmailAccountSummary | null = null;
  let hata: string | null = null;
  try {
    hesap = await serverApiFetch<EmailAccountSummary | null>('/me/email-account');
  } catch (err) {
    hata =
      err instanceof ApiRequestError
        ? `${err.message} (${err.code}, HTTP ${err.status})`
        : err instanceof Error
          ? err.message
          : 'Bilinmeyen hata';
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">E-posta Ayarları</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Raporlar <strong>{session.user.email}</strong> adresinden, senin imzanla
          gidecek. Ayarlar yalnızca sana görünür — yöneticiler dâhil kimse bu
          sayfadaki parolayı okuyamaz.
        </p>
      </div>

      {hata !== null ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium">Ayarlar alınamadı.</p>
          <p className="mt-1 text-ink-muted">{hata}</p>
        </div>
      ) : (
        <EpostaAyarlari mevcut={hesap} kullaniciEposta={session.user.email} />
      )}
    </div>
  );
}
