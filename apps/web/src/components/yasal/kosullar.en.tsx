import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';
import { yerelYol } from '@/lib/site-yollari';

/** Çapalar (`id`) Türkçe sürümle AYNI: `/en/terms#fesih` ile `/kosullar#fesih` aynı bölüm. */
const B = {
  hizmet: { id: 'hizmetin-tanimi', baslik: '1. Description of the service' },
  hesap: { id: 'hesap-ve-yetkilendirme', baslik: '2. Account and authorisation' },
  otomatik: { id: 'otomatik-aksiyonlar', baslik: '3. Automated actions and responsibility' },
  uyum: { id: 'platform-kurallari', baslik: '4. Compliance with platform rules' },
  dogruluk: { id: 'veri-dogrulugu', baslik: '5. Data accuracy' },
  sureklilik: { id: 'hizmet-surekliligi', baslik: '6. Continuity of service' },
  fesih: { id: 'fesih', baslik: '7. Termination' },
  kisisel: { id: 'kisisel-veriler', baslik: '8. Personal data' },
  iletisim: { id: 'iletisim', baslik: '9. Contact' },
} satisfies Record<string, YasalBaslik>;

/**
 * Kullanım koşullarının İngilizce ÇEVİRİSİ (Ç13: bağlayıcı olan
 * `kosullar.tr.tsx`). Bölüm bölüm, aynı sırada ve aynı numarayla; özet
 * değil tam metin. Türkçede bir cümle değişirse burada da değişmeli.
 */
export function kosullarEn(): YasalIcerik {
  return {
    baslik: 'Terms of Use',
    aciklama: 'Terms of use of the Advetics advertising management platform.',
    guncelleme: '14 October 2026',
    bolumler: Object.values(B),
    ozet:
      'Automated rules affect real advertising spend; you are responsible for the outcome of the ' +
      "rules you define. For billing, the platforms' own reports are binding.",
    govde: (
      <>
        <YasalBolum b={B.hizmet}>
          <p>
            Advetics is a software service that lets you manage Meta (Facebook, Instagram), Google
            Ads and LinkedIn Ads advertising accounts from a single panel. The service provides data
            consolidation, reporting, rule-based automation and bulk campaign creation.
          </p>
        </YasalBolum>

        <YasalBolum b={B.hesap}>
          <p>
            Using the service requires a user account and at least one advertising platform
            connection. The connection is set up through the relevant platform&apos;s own OAuth
            consent screen. By authorising advertising accounts, you are deemed to declare that you
            are entitled to access them.
          </p>
          <p>
            You are responsible for the security of your account and for the actions taken through
            it. If you suspect unauthorised access, change your password: doing so ends all active
            sessions.
          </p>
        </YasalBolum>

        <YasalBolum b={B.otomatik}>
          <p>
            The service can change advertising budgets and pause or start campaigns according to
            the rules you define. These actions <strong>affect real advertising spend</strong>.
          </p>
          <p>
            For this reason, every rule is created in <strong>&quot;dry run&quot;</strong> mode,
            which only simulates. Switching a rule to live mode requires an explicit user action.
            Campaigns created in bulk are saved as paused drafts by default.
          </p>
          <p>
            You are responsible for the outcomes of the rules you define and for the resulting
            advertising spend. The service gives no guarantee whatsoever regarding advertising
            performance or return on investment.
          </p>
        </YasalBolum>

        <YasalBolum b={B.uyum}>
          <p>
            When using the service, you agree to comply with the rules of the relevant platforms,
            including the Meta Platform Terms, the Meta Advertising Policies and the Google Ads
            Policies. Violating these rules may lead the relevant platform to suspend your
            advertising account; Advetics cannot be held responsible for this.
          </p>
        </YasalBolum>

        <YasalBolum b={B.dogruluk}>
          <p>
            The metrics shown are based on data obtained from the advertising platforms&apos; APIs.
            Because of attribution windows, these platforms may later update data for past days.
            The service shows in the interface when the data was last updated; no automated action
            is taken on stale data.
          </p>
          <p>
            For billing and accounting purposes, the binding source is the advertising
            platforms&apos; own reports.
          </p>
        </YasalBolum>

        <YasalBolum b={B.sureklilik}>
          <p>
            The service depends on third-party APIs. The platforms&apos; quota limits, API version
            changes or outages may temporarily limit how the service works. Uninterrupted access is
            not guaranteed.
          </p>
        </YasalBolum>

        <YasalBolum b={B.fesih}>
          <p>
            You can remove your account and your connections at any time. For the deletion of data,
            see the <a href={yerelYol('/veri-silme', 'en')}>Data Deletion Instructions</a> page.
            Access to the service may be suspended if the platform rules or these terms are
            violated.
          </p>
        </YasalBolum>

        <YasalBolum b={B.kisisel}>
          <p>
            The principles governing the processing of personal data are described on the{' '}
            <a href={yerelYol('/gizlilik', 'en')}>Privacy Policy</a> page.
          </p>
        </YasalBolum>

        <YasalBolum b={B.iletisim}>
          <p>
            <a href="mailto:hello@profaj.com">hello@profaj.com</a>
          </p>
        </YasalBolum>
      </>
    ),
  };
}
