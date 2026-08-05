import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Veri Silme Talimatları — Advetics',
  description:
    'Advetics üzerindeki reklam hesabı bağlantınızı ve kişisel verilerinizi nasıl sileceğiniz.',
  robots: { index: true, follow: true },
};

/**
 * Meta, veri işleyen uygulamalardan bir "Data Deletion Instructions URL" veya
 * geri arama uç noktası istiyor. Bu sayfa o gereksinimi karşılar ve App Review
 * formunda bu adres verilir.
 */
export default function DataDeletionPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Veri Silme Talimatları</h1>
      <p className="mt-1 text-sm text-ink-muted">Son güncelleme: 5 Ağustos 2026</p>

      <Section title="Seçenek 1 — Reklam hesabı bağlantısını kaldır">
        <p>
          Panele giriş yapın, <strong>Ayarlar → Platform Bağlantıları</strong> sayfasına gidin ve
          ilgili bağlantının yanındaki <strong>Kaldır</strong> düğmesine basın.
        </p>
        <p>Bu işlem anında şunları yapar:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Meta / Google erişim ve yenileme jetonlarını{' '}
            <strong>geri döndürülemez biçimde siler</strong>
          </li>
          <li>Verilen tüm yetkileri (scope) kayıttan düşer</li>
          <li>O hesaba ait tüm veri senkronizasyonunu ve otomasyonu durdurur</li>
        </ul>
        <p className="mt-3">
          Reklam performans geçmişi, hesap sahibinin raporlama ve muhasebe ihtiyacı nedeniyle
          korunur. Bunun da silinmesini istiyorsanız 3. seçeneği kullanın.
        </p>
      </Section>

      <Section title="Seçenek 2 — Meta / Google tarafından erişimi iptal et">
        <p>Uygulamanın erişimini doğrudan platform üzerinden de kaldırabilirsiniz:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Meta:</strong>{' '}
            <a
              href="https://www.facebook.com/settings?tab=business_tools"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook → Ayarlar → İş Araçları
            </a>{' '}
            bölümünden Advetics&apos;i kaldırın.
          </li>
          <li>
            <strong>Google:</strong>{' '}
            <a
              href="https://myaccount.google.com/permissions"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Hesabı → Üçüncü taraf erişimi
            </a>{' '}
            bölümünden Advetics erişimini kaldırın.
          </li>
        </ul>
        <p className="mt-3">
          Bu durumda jetonlarımız geçersiz hâle gelir ve bağlantı{' '}
          <em>yeniden yetkilendirme gerekli</em> durumuna geçer. Saklanan şifreli jetonun
          silinmesi için 1. veya 3. seçeneği de uygulamanızı öneririz.
        </p>
      </Section>

      <Section title="Seçenek 3 — Tüm verilerin silinmesini talep et">
        <p>
          Hesabınıza ve müşteri kaydınıza ait <strong>tüm verilerin</strong> silinmesi için{' '}
          <a href="mailto:hello@profaj.com?subject=Veri%20Silme%20Talebi" className="underline">
            hello@profaj.com
          </a>{' '}
          adresine, kayıtlı e-posta adresinizden talep gönderin.
        </p>
        <p className="mt-2">
          Kimlik doğrulamasının ardından talep <strong>en geç 30 gün içinde</strong> yerine
          getirilir ve size yazılı olarak bildirilir. Silinenler:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Kullanıcı hesabı ve profil bilgileri</li>
          <li>Tüm platform bağlantıları ve şifreli jetonlar</li>
          <li>Reklam hesabı kayıtları, kampanya yapıları ve performans geçmişi</li>
          <li>Otomasyon kuralları ve raporlar</li>
        </ul>
        <p className="mt-3">
          <strong>İstisna:</strong> Bütçe değiştiren otomatik aksiyonlara ait denetim kayıtları,
          hesap verebilirlik yükümlülüğü nedeniyle kimliksizleştirilerek 2 yıl daha saklanır. Bu
          kayıtlarda kişisel veri bulunmaz.
        </p>
      </Section>

      <hr className="my-10 border-line" />

      <h2 className="text-xl font-semibold" id="english">
        Data Deletion Instructions (English)
      </h2>

      <Section title="Option 1 — Remove the connection in the app">
        <p>
          Sign in and go to <strong>Settings → Platform Connections</strong>, then click{' '}
          <strong>Remove</strong> next to the connection. This immediately and irreversibly deletes
          the stored Meta / Google access and refresh tokens, clears all granted scopes, and stops
          all data synchronisation and automation for that account.
        </p>
      </Section>

      <Section title="Option 2 — Revoke access from the platform">
        <p>
          Remove Advetics from{' '}
          <a
            href="https://www.facebook.com/settings?tab=business_tools"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook Settings → Business Integrations
          </a>{' '}
          or{' '}
          <a
            href="https://myaccount.google.com/permissions"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Account → Third-party access
          </a>
          .
        </p>
      </Section>

      <Section title="Option 3 — Request full deletion">
        <p>
          Email{' '}
          <a href="mailto:hello@profaj.com?subject=Data%20Deletion%20Request" className="underline">
            hello@profaj.com
          </a>{' '}
          from your registered address. After identity verification we delete your account,
          connections, encrypted tokens, ad account records, campaign structures, performance
          history, automation rules and reports within <strong>30 days</strong> and confirm in
          writing.
        </p>
        <p className="mt-2">
          <strong>Exception:</strong> anonymised audit records of automated budget changes are
          retained for a further 2 years for accountability. They contain no personal data.
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}
