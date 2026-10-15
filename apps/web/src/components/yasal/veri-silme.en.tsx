import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';

/** Çapalar (`id`) Türkçe sürümle AYNI. Türkçe başlıktaki uzun tire İngilizcede iki nokta: ekran metninde uzun tire yok. */
const B = {
  bir: { id: 'baglantiyi-kaldir', baslik: 'Option 1: Remove the ad account connection' },
  iki: { id: 'platformdan-iptal', baslik: 'Option 2: Revoke access from Meta / Google' },
  uc: { id: 'tum-veriler', baslik: 'Option 3: Request deletion of all data' },
} satisfies Record<string, YasalBaslik>;

/**
 * Veri silme talimatlarının İngilizce ÇEVİRİSİ (Ç13: bağlayıcı olan
 * `veri-silme.tr.tsx`). Meta App Review formuna verilen adres Türkçe
 * sayfa; incelemeci bu sürüme oradaki "English" bağlantısıyla geçiyor.
 * Menü yolu panelin İngilizce adlarıyla yazıldı (docs/i18n SOZLUK:
 * Ayarlar → Settings); panel İngilizceye geçmeden önce ekranda Türkçe
 * adı görebilir, bu bilinen geçiş kalıntısı.
 */
export function veriSilmeEn(): YasalIcerik {
  return {
    baslik: 'Data Deletion Instructions',
    aciklama: 'How to delete your ad account connection and your personal data on Advetics.',
    guncelleme: '14 October 2026',
    bolumler: Object.values(B),
    ozet:
      'When you remove a connection in the panel, its access tokens are deleted immediately. You ' +
      'can request deletion of all your data by email; the request is fulfilled within 30 days at ' +
      'the latest.',
    govde: (
      <>
        <YasalBolum b={B.bir}>
          <p>
            Sign in to the panel, go to <strong>Settings › Platform connections</strong> and click
            the <strong>Remove</strong> button next to the relevant connection.
          </p>
          <p>This immediately:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>irreversibly deletes</strong> the Meta / Google access and refresh tokens
            </li>
            <li>removes all granted permissions (scopes) from the record</li>
            <li>stops all data synchronisation and automation for that account</li>
          </ul>
          <p className="mt-3">
            The advertising performance history is kept because the account owner needs it for
            reporting and accounting. If you want it deleted as well, use option 3.
          </p>
        </YasalBolum>

        <YasalBolum b={B.iki}>
          <p>You can also remove the app&apos;s access directly on the platform:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Meta:</strong> remove Advetics under{' '}
              <a
                href="https://www.facebook.com/settings?tab=business_tools"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook → Settings → Business Integrations
              </a>
              .
            </li>
            <li>
              <strong>Google:</strong> remove Advetics&apos; access under{' '}
              <a
                href="https://myaccount.google.com/permissions"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account → Third-party access
              </a>
              .
            </li>
          </ul>
          <p className="mt-3">
            In that case our tokens become invalid and the connection moves to the{' '}
            <em>reauthorisation required</em> status. We recommend that you also follow option 1 or
            3 so that the stored encrypted token is deleted.
          </p>
        </YasalBolum>

        <YasalBolum b={B.uc}>
          <p>
            To have <strong>all data</strong> belonging to your account and workspace record
            deleted, send a request to{' '}
            <a href="mailto:hello@profaj.com?subject=Data%20Deletion%20Request" className="underline">
              hello@profaj.com
            </a>{' '}
            from your registered email address.
          </p>
          <p className="mt-2">
            After identity verification, the request is fulfilled{' '}
            <strong>within 30 days at the latest</strong> and you are notified in writing. What is
            deleted:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>User account and profile information</li>
            <li>All platform connections and encrypted tokens</li>
            <li>Ad account records, campaign structures and performance history</li>
            <li>Automation rules and reports</li>
          </ul>
          <p className="mt-3">
            <strong>Exception:</strong> audit records of automated actions that change budgets are
            anonymised and kept for a further 2 years because of the accountability obligation.
            These records contain no personal data.
          </p>
        </YasalBolum>
      </>
    ),
  };
}
