import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';
import { yerelYol } from '@/lib/site-yollari';

/** Çapalar (`id`) Türkçe sürümle AYNI: `/en/privacy#haklariniz` ile `/gizlilik#haklariniz` aynı bölüm. */
const B = {
  sorumlu: { id: 'veri-sorumlusu', baslik: '1. Data controller' },
  ne: { id: 'advetics-ne-yapar', baslik: '2. What Advetics does' },
  veriler: { id: 'islenen-veriler', baslik: '3. Data processed' },
  amac: { id: 'amac-ve-dayanak', baslik: '4. Purposes of processing and legal basis' },
  aktarim: { id: 'veri-aktarimi', baslik: '5. Data transfers' },
  saklama: { id: 'saklama-sureleri', baslik: '6. Retention periods' },
  guvenlik: { id: 'guvenlik-onlemleri', baslik: '7. Security measures' },
  haklar: { id: 'haklariniz', baslik: '8. Your rights' },
  cerez: { id: 'cerezler', baslik: '9. Cookies' },
  degisiklik: { id: 'degisiklikler', baslik: '10. Changes' },
} satisfies Record<string, YasalBaslik>;

/**
 * Gizlilik politikasının İngilizce ÇEVİRİSİ (Ç13: bağlayıcı olan
 * `gizlilik.tr.tsx`). Eskiden Türkçe sayfanın sonunda kısa bir İngilizce
 * özet vardı; Google ve Meta incelemecileri İngilizce okuyor ve özet tam
 * metinden daha az şey söylüyordu (ör. dil tercihi, LinkedIn aktarımının
 * dayanağı). Burası bölüm bölüm tam çeviri; bir olgu (süre, şifreleme,
 * aktarım) Türkçede değişirse burada da AYNI committe değişmeli.
 */
export function gizlilikEn(): YasalIcerik {
  return {
    baslik: 'Privacy Policy',
    aciklama:
      'How the Advetics advertising management platform processes, retains and deletes personal data.',
    guncelleme: '14 October 2026',
    bolumler: Object.values(B),
    ozet:
      'Advetics processes only the data needed to provide the service. No personal data of end ' +
      'users is pulled from the advertising platforms; data is not sold and not shared for ' +
      'advertising purposes.',
    govde: (
      <>
        <YasalBolum b={B.sorumlu}>
          <p>
            This platform (<strong>Advetics</strong>) is operated by Profaj. For questions about
            the processing of personal data: <a href="mailto:hello@profaj.com">hello@profaj.com</a>
          </p>
        </YasalBolum>

        <YasalBolum b={B.ne}>
          <p>
            Advetics is a software service that lets advertising agencies and businesses manage
            their <strong>Meta (Facebook, Instagram)</strong>, <strong>Google Ads</strong> and{' '}
            <strong>LinkedIn Ads</strong> advertising accounts from a single panel. YouTube
            channels are connected under the Google connection. It pulls advertising performance
            data from these platforms, reports on it and takes automated actions according to rules
            defined by the user.
          </p>
          <p>
            No advertising network other than these platforms is supported, and no data is sent to
            any third-party advertising platform.
          </p>
        </YasalBolum>

        <YasalBolum b={B.veriler}>
          <h3>3.1 Data about panel users</h3>
          <ul>
            <li>Full name, email address, language preference, profile photo link</li>
            <li>
              Password: <strong>never stored in plain text</strong>, only hashed irreversibly with
              argon2id
            </li>
            <li>Session information: hashes of access and refresh tokens, last sign-in time</li>
            <li>
              Security and audit records: IP address, browser information, type and time of the
              action performed
            </li>
          </ul>

          <h3>3.2 Data obtained from connected advertising platforms</h3>
          <p>
            When a user connects a Meta, Google or LinkedIn account with their own explicit
            consent, the following data is processed:
          </p>
          <ul>
            <li>
              <strong>Access tokens</strong> (access/refresh tokens): stored encrypted on the server
              with <strong>AES-256-GCM</strong> and never displayed in any interface or API response
            </li>
            <li>The list of permissions granted (scopes) and the platform user ID</li>
            <li>Ad account information: account ID, name, currency, time zone, status</li>
            <li>
              Campaign, ad set and ad structures and their performance metrics (impressions, clicks,
              spend, conversions and conversion value)
            </li>
            <li>
              Facebook Page and Instagram business account IDs, names, usernames and organic post
              engagement metrics (for the Auto-Boost feature)
            </li>
          </ul>
          <p>
            <strong>Data not processed:</strong> personal data of end users, customers or ad viewers
            (name, email, phone, address) is not pulled from the advertising platforms and is not
            stored. Only aggregate performance metrics are processed.
          </p>
        </YasalBolum>

        <YasalBolum b={B.amac}>
          <ul>
            <li>
              <strong>Providing the service</strong>: consolidating and reporting advertising data
              and running automation rules. Legal basis: performance of a contract.
            </li>
            <li>
              <strong>Access to advertising platforms</strong>: the user&apos;s explicit consent
              (the approval given on the OAuth consent screen). Consent can be withdrawn at any
              time.
            </li>
            <li>
              <strong>Security and audit</strong>: detecting unauthorised access and keeping actions
              that change budgets traceable. Legal basis: legitimate interest and legal obligation.
            </li>
          </ul>
          <p>
            Data is <strong>never sold under any circumstances</strong>, is not shared with third
            parties for advertising purposes and is not used for profiling or marketing.
          </p>
        </YasalBolum>

        <YasalBolum b={B.aktarim}>
          <p>
            To the extent strictly necessary to provide the service, data is exchanged with the
            following parties:
          </p>
          <ul>
            <li>
              <strong>Meta Platforms, Inc.</strong>: reading advertising data and applying the
              actions defined by the user through the Marketing API
            </li>
            <li>
              <strong>Google LLC</strong>: for the same purposes through the Google Ads API
            </li>
            <li>
              <strong>LinkedIn Corporation</strong>: reading and reporting advertising data through
              the LinkedIn Marketing API
            </li>
            <li>
              <strong>Hosting provider (Hostinger)</strong>: server infrastructure, located in the
              European Union (Frankfurt, Germany)
            </li>
          </ul>
          <p>
            Meta, Google and LinkedIn are companies based in the United States. This transfer is
            based on the explicit consent the user gives to access their own advertising accounts
            and is limited to the relevant API calls only.
          </p>
        </YasalBolum>

        <YasalBolum b={B.saklama}>
          <ul>
            <li>
              <strong>Access tokens</strong>: for as long as the connection is active. When the
              connection is removed, the tokens are <strong>deleted immediately and irreversibly</strong>.
            </li>
            <li>
              <strong>Advertising performance data</strong>: for as long as the account relationship
              continues; at most 37 months (the data retention limit of the advertising platforms).
            </li>
            <li>
              <strong>User account</strong>: until the account is deleted.
            </li>
            <li>
              <strong>Audit records</strong>: 2 years. These records are kept for the
              accountability of automated actions that change budgets and cannot be modified.
            </li>
            <li>
              <strong>Session tokens</strong>: at most 30 days; revoked when you sign out.
            </li>
          </ul>
        </YasalBolum>

        <YasalBolum b={B.guvenlik}>
          <ul>
            <li>All traffic is encrypted with TLS (HTTPS).</li>
            <li>
              OAuth tokens are encrypted at the application layer with AES-256-GCM; the encryption
              keys are kept separate from the database and are versioned so they can be rotated.
            </li>
            <li>
              Passwords are hashed with argon2id. All active sessions are ended when a password is
              changed.
            </li>
            <li>
              <strong>Row Level Security</strong> is enforced at the database level: one
              workspace&apos;s data is not visible to another customer even if there is an error in
              the application layer.
            </li>
            <li>
              The database and application servers are closed to the internet; access is local
              only.
            </li>
          </ul>
        </YasalBolum>

        <YasalBolum b={B.haklar}>
          <p>
            Under Article 11 of KVKK (Law No. 6698 on the Protection of Personal Data) and the GDPR,
            you have the right to access your data, to request its correction, to request its
            deletion, to object to its processing and to receive your data in a portable format.
          </p>
          <p>
            You can send your requests to <a href="mailto:hello@profaj.com">hello@profaj.com</a>.
            Requests are answered within 30 days at the latest.
          </p>
          <p>
            To delete your advertising account connection and the related data, see the{' '}
            <a href={yerelYol('/veri-silme', 'en')}>Data Deletion Instructions</a> page.
          </p>
        </YasalBolum>

        <YasalBolum b={B.cerez}>
          <p>
            Only cookies strictly necessary to keep your session running are used (
            <code>adv_at</code>, <code>adv_rt</code>, <code>adv_client</code> and a few cookies that
            hold the selections you make in the panel). The purpose and duration of each are set out
            on the <a href={yerelYol('/cerez-politikasi', 'en')}>Cookie Policy</a> page.
          </p>
          <p>
            <strong>No advertising, tracking or analytics cookies are used.</strong> There are no
            third-party tracking scripts.
          </p>
        </YasalBolum>

        <YasalBolum b={B.degisiklik}>
          <p>
            This policy may be updated. For significant changes, registered users are notified by
            email and the update date on this page is changed.
          </p>
        </YasalBolum>
      </>
    ),
  };
}
