import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kullanım Koşulları — Advetics',
  description: 'Advetics reklam yönetim platformunun kullanım koşulları.',
  robots: { index: true, follow: true },
};

/**
 * Google OAuth Verification, gizlilik politikasının yanında bir kullanım
 * koşulları adresi de istiyor. Meta App Review'da zorunlu değil ama başvuruyu
 * güçlendiriyor.
 */
export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Kullanım Koşulları</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Son güncelleme: 5 Ağustos 2026</p>

      <Section title="1. Hizmetin tanımı">
        <p>
          Advetics, Meta (Facebook, Instagram) ve Google Ads reklam hesaplarının tek panelden
          yönetilmesini sağlayan bir yazılım hizmetidir. Hizmet; veri birleştirme, raporlama,
          kural tabanlı otomasyon ve toplu kampanya oluşturma işlevleri sunar.
        </p>
      </Section>

      <Section title="2. Hesap ve yetkilendirme">
        <p>
          Hizmeti kullanmak için bir kullanıcı hesabı ve en az bir reklam platformu bağlantısı
          gerekir. Bağlantı, ilgili platformun kendi OAuth izin ekranı üzerinden kurulur.
          Yetkilendirdiğiniz reklam hesaplarına erişim yetkiniz olduğunu beyan etmiş sayılırsınız.
        </p>
        <p>
          Hesap güvenliğinden ve hesabınız üzerinden yapılan işlemlerden siz sorumlusunuz. Yetkisiz
          erişim şüphesinde şifrenizi değiştirin — bu işlem tüm aktif oturumları sonlandırır.
        </p>
      </Section>

      <Section title="3. Otomatik aksiyonlar ve sorumluluk">
        <p>
          Hizmet, sizin tanımladığınız kurallara göre reklam bütçelerini değiştirebilir,
          kampanyaları durdurabilir veya başlatabilir. Bu işlemler{' '}
          <strong>gerçek reklam harcamasını etkiler</strong>.
        </p>
        <p>
          Bu nedenle her kural, yalnızca simülasyon yapan <strong>&quot;kuru çalıştırma&quot;
          (dry run)</strong> modunda oluşturulur. Kuralı canlı moda geçirmek açık bir kullanıcı
          eylemi gerektirir. Toplu oluşturulan kampanyalar varsayılan olarak duraklatılmış taslak
          olarak kaydedilir.
        </p>
        <p>
          Tanımladığınız kuralların sonuçlarından ve oluşan reklam harcamasından siz
          sorumlusunuz. Hizmet, reklam performansı veya yatırım getirisi konusunda hiçbir garanti
          vermez.
        </p>
      </Section>

      <Section title="4. Platform kurallarına uyum">
        <p>
          Hizmeti kullanırken Meta Platform Terms, Meta Advertising Policies ve Google Ads
          Politikaları dâhil olmak üzere ilgili platformların kurallarına uymayı kabul edersiniz.
          Bu kuralların ihlali, ilgili platformun reklam hesabınızı askıya almasına yol açabilir;
          bu durumdan Advetics sorumlu tutulamaz.
        </p>
      </Section>

      <Section title="5. Veri doğruluğu">
        <p>
          Gösterilen metrikler, reklam platformlarının API&apos;lerinden alınan verilere dayanır.
          Bu platformlar, atıf pencereleri nedeniyle geçmiş günlerin verilerini sonradan
          güncelleyebilir. Hizmet, verilerin en son ne zaman güncellendiğini arayüzde gösterir;
          bayat veriyle otomatik aksiyon alınmaz.
        </p>
        <p>
          Faturalandırma ve muhasebe açısından bağlayıcı olan kaynak, reklam platformlarının kendi
          raporlarıdır.
        </p>
      </Section>

      <Section title="6. Hizmet sürekliliği">
        <p>
          Hizmet, üçüncü taraf API&apos;lerine bağımlıdır. Platformların kota sınırları, API sürüm
          değişiklikleri veya kesintileri hizmetin geçici olarak sınırlı çalışmasına yol
          açabilir. Kesintisiz erişim garantisi verilmez.
        </p>
      </Section>

      <Section title="7. Fesih">
        <p>
          Hesabınızı ve bağlantılarınızı dilediğiniz zaman kaldırabilirsiniz. Verilerin silinmesi
          için{' '}
          <a href="/veri-silme" className="underline">
            Veri Silme Talimatları
          </a>{' '}
          sayfasına bakın. Platform kurallarının veya bu koşulların ihlali hâlinde hizmete erişim
          askıya alınabilir.
        </p>
      </Section>

      <Section title="8. Kişisel veriler">
        <p>
          Kişisel verilerin işlenmesine ilişkin esaslar{' '}
          <a href="/gizlilik" className="underline">
            Gizlilik Politikası
          </a>{' '}
          sayfasında açıklanmıştır.
        </p>
      </Section>

      <Section title="9. İletişim">
        <p>
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>
        </p>
      </Section>

      <hr className="my-10 border-[var(--border)]" />

      <h2 className="text-xl font-semibold" id="english">
        Terms of Service (English)
      </h2>

      <Section title="Service">
        <p>
          Advetics is a software service for managing Meta (Facebook, Instagram) and Google Ads
          advertising accounts from a single dashboard, including reporting, rule-based automation
          and bulk campaign creation.
        </p>
      </Section>

      <Section title="Authorisation">
        <p>
          You connect your advertising accounts through each platform&apos;s own OAuth consent
          screen and confirm that you are authorised to manage the accounts you connect. You are
          responsible for the security of your account.
        </p>
      </Section>

      <Section title="Automated actions">
        <p>
          Rules you define can change budgets and pause or resume campaigns, which{' '}
          <strong>affects real advertising spend</strong>. Every rule is therefore created in{' '}
          <strong>dry-run mode</strong> and requires an explicit action to go live. Bulk-created
          campaigns are saved as paused drafts by default. You remain responsible for the outcomes
          of the rules you define and for the resulting spend. No guarantee is made regarding
          advertising performance or return on investment.
        </p>
      </Section>

      <Section title="Data accuracy and availability">
        <p>
          Metrics come from the advertising platforms&apos; APIs and may be revised retroactively
          due to attribution windows. The platforms&apos; own reports are authoritative for
          billing. The service depends on third-party APIs; rate limits, API version changes or
          outages may temporarily limit functionality. Uninterrupted availability is not
          guaranteed.
        </p>
      </Section>

      <Section title="Platform compliance">
        <p>
          You agree to comply with the Meta Platform Terms, Meta Advertising Policies and Google
          Ads Policies. Advetics is not liable for account suspensions resulting from violations of
          those policies.
        </p>
      </Section>

      <Section title="Termination and contact">
        <p>
          You may remove your connections and account at any time — see the{' '}
          <a href="/veri-silme" className="underline">
            Data Deletion Instructions
          </a>
          . Personal data handling is described in our{' '}
          <a href="/gizlilik" className="underline">
            Privacy Policy
          </a>
          . Contact:{' '}
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>
        </p>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--text)]">{children}</div>
    </section>
  );
}
