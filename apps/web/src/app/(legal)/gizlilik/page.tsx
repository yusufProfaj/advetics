import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası — Advetics',
  description:
    'Advetics reklam yönetim platformunun kişisel veri işleme, saklama ve silme esasları.',
  // Meta ve Google crawler'larının indeksleyebilmesi için açık.
  robots: { index: true, follow: true },
};

const UPDATED = '5 Ağustos 2026';

export default function PrivacyPage() {
  return (
    <>
      {/*
        Bu metin sistemin GERÇEKTEN ne topladığını anlatıyor — kolon kolon
        koddan çıkarıldı. Yeni bir veri alanı eklendiğinde burası da
        güncellenmeli; aksi halde beyan ile gerçek ayrışır.
      */}
      <h1 className="text-2xl font-semibold">Gizlilik Politikası</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Son güncelleme: {UPDATED}
      </p>

      <Section title="1. Veri sorumlusu">
        <p>
          Bu platform (<strong>Advetics</strong>), Profaj tarafından işletilmektedir. Kişisel
          verilerin işlenmesine ilişkin sorularınız için:{' '}
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>
        </p>
      </Section>

      <Section title="2. Advetics ne yapar">
        <p>
          Advetics, reklam ajanslarının ve işletmelerin <strong>Meta (Facebook, Instagram)</strong>{' '}
          ve <strong>Google Ads</strong> reklam hesaplarını tek panelden yönetmesini sağlayan bir
          yazılım hizmetidir. Reklam performans verilerini bu platformlardan çeker, raporlar ve
          kullanıcının tanımladığı kurallara göre otomatik aksiyonlar alır.
        </p>
        <p>
          Bu platformlar dışında hiçbir reklam ağı desteklenmez ve hiçbir üçüncü taraf reklam
          platformuna veri gönderilmez.
        </p>
      </Section>

      <Section title="3. İşlenen veriler">
        <h3 className="mt-4 text-sm font-semibold">3.1 Panel kullanıcılarına ait veriler</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Ad soyad, e-posta adresi, dil tercihi, profil fotoğrafı bağlantısı</li>
          <li>
            Şifre — <strong>düz metin olarak saklanmaz</strong>, yalnızca argon2id ile geri
            döndürülemez biçimde özetlenir
          </li>
          <li>Oturum bilgileri: erişim ve yenileme jetonlarının özetleri, son giriş zamanı</li>
          <li>
            Güvenlik ve denetim kayıtları: IP adresi, tarayıcı bilgisi, yapılan işlemin türü ve
            zamanı
          </li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold">
          3.2 Bağlanan reklam platformlarından alınan veriler
        </h3>
        <p className="mt-2">
          Kullanıcı, Meta veya Google hesabını kendi açık onayıyla bağladığında aşağıdaki veriler
          işlenir:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Erişim jetonları</strong> (access/refresh token) — sunucu tarafında{' '}
            <strong>AES-256-GCM</strong> ile şifrelenerek saklanır, hiçbir arayüzde veya API
            yanıtında görüntülenmez
          </li>
          <li>Verilen yetkilerin (scope) listesi ve platform kullanıcı kimliği</li>
          <li>
            Reklam hesabı bilgileri: hesap kimliği, adı, para birimi, zaman dilimi, durumu
          </li>
          <li>
            Kampanya, reklam seti ve reklam yapıları ile bunlara ait performans metrikleri
            (gösterim, tıklama, harcama, dönüşüm ve dönüşüm değeri)
          </li>
          <li>
            Facebook sayfası ve Instagram işletme hesabı kimlikleri, adları, kullanıcı adları ve
            organik gönderi etkileşim metrikleri (Auto-Boost özelliği için)
          </li>
        </ul>
        <p className="mt-3">
          <strong>İşlenmeyen veriler:</strong> Reklam platformlarından son kullanıcıların,
          müşterilerin veya reklam izleyicilerinin kişisel verileri (isim, e-posta, telefon,
          adres) çekilmez ve saklanmaz. Yalnızca toplu (agrege) performans metrikleri işlenir.
        </p>
      </Section>

      <Section title="4. İşleme amaçları ve hukuki dayanak">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Hizmetin sunulması</strong> — reklam verilerinin birleştirilmesi,
            raporlanması ve otomasyon kurallarının çalıştırılması. Dayanak: sözleşmenin ifası.
          </li>
          <li>
            <strong>Reklam platformlarına erişim</strong> — kullanıcının açık rızası (OAuth izin
            ekranında verilen onay). Rıza her zaman geri alınabilir.
          </li>
          <li>
            <strong>Güvenlik ve denetim</strong> — yetkisiz erişimin tespiti, bütçe değiştiren
            işlemlerin izlenebilirliği. Dayanak: meşru menfaat ve hukuki yükümlülük.
          </li>
        </ul>
        <p className="mt-3">
          Veriler <strong>hiçbir koşulda satılmaz</strong>, reklam amacıyla üçüncü taraflarla
          paylaşılmaz ve profilleme/pazarlama amacıyla kullanılmaz.
        </p>
      </Section>

      <Section title="5. Veri aktarımı">
        <p>
          Veriler, hizmetin sunulması için zorunlu olduğu ölçüde aşağıdaki taraflarla iletişime
          girer:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Meta Platforms, Inc.</strong> — Marketing API üzerinden reklam verisi okuma ve
            kullanıcının tanımladığı aksiyonların uygulanması
          </li>
          <li>
            <strong>Google LLC</strong> — Google Ads API üzerinden aynı amaçlarla
          </li>
          <li>
            <strong>Barındırma sağlayıcısı (Hostinger)</strong> — sunucu altyapısı, Avrupa Birliği
            (Frankfurt, Almanya) lokasyonu
          </li>
        </ul>
        <p className="mt-3">
          Meta ve Google, ABD merkezli şirketlerdir. Bu aktarım, kullanıcının kendi reklam
          hesaplarına erişim için verdiği açık rızaya dayanır ve yalnızca ilgili API çağrılarıyla
          sınırlıdır.
        </p>
      </Section>

      <Section title="6. Saklama süreleri">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Erişim jetonları</strong> — bağlantı aktif olduğu sürece. Bağlantı
            kaldırıldığında jetonlar <strong>derhal geri döndürülemez biçimde silinir</strong>.
          </li>
          <li>
            <strong>Reklam performans verileri</strong> — hesap ilişkisi sürdüğü sürece; en fazla
            37 ay (reklam platformlarının veri saklama sınırı).
          </li>
          <li>
            <strong>Kullanıcı hesabı</strong> — hesap silinene kadar.
          </li>
          <li>
            <strong>Denetim kayıtları</strong> — 2 yıl. Bu kayıtlar, bütçe değiştiren otomatik
            aksiyonların hesap verebilirliği için tutulur ve değiştirilemez.
          </li>
          <li>
            <strong>Oturum jetonları</strong> — en fazla 30 gün; çıkış yapıldığında iptal edilir.
          </li>
        </ul>
      </Section>

      <Section title="7. Güvenlik önlemleri">
        <ul className="list-disc space-y-1 pl-5">
          <li>Tüm trafik TLS (HTTPS) ile şifrelenir.</li>
          <li>
            OAuth jetonları uygulama katmanında AES-256-GCM ile şifrelenir; şifreleme anahtarları
            veritabanından ayrı tutulur ve sürümlenerek döndürülebilir.
          </li>
          <li>
            Şifreler argon2id ile özetlenir. Şifre değişiminde tüm aktif oturumlar sonlandırılır.
          </li>
          <li>
            Veritabanı düzeyinde <strong>satır güvenliği (Row Level Security)</strong> uygulanır:
            bir müşterinin verisi, uygulama katmanındaki bir hata durumunda bile başka bir
            müşteriye görünmez.
          </li>
          <li>Veritabanı ve uygulama sunucuları internete kapalıdır; erişim yalnızca yereldir.</li>
        </ul>
      </Section>

      <Section title="8. Haklarınız">
        <p>
          KVKK m.11 ve GDPR kapsamında; verilerinize erişme, düzeltilmesini isteme, silinmesini
          isteme, işlemeye itiraz etme ve verilerinizi taşınabilir biçimde alma haklarına
          sahipsiniz.
        </p>
        <p className="mt-2">
          Taleplerinizi{' '}
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>{' '}
          adresine iletebilirsiniz. Başvurular en geç 30 gün içinde yanıtlanır.
        </p>
        <p className="mt-2">
          Reklam hesabı bağlantınızı ve ilgili verileri silmek için{' '}
          <a href="/veri-silme" className="underline">
            Veri Silme Talimatları
          </a>{' '}
          sayfasına bakabilirsiniz.
        </p>
      </Section>

      <Section title="9. Çerezler">
        <p>
          Yalnızca oturumun sürdürülmesi için zorunlu çerezler kullanılır (
          <code className="text-xs">adv_at</code>, <code className="text-xs">adv_rt</code>,{' '}
          <code className="text-xs">adv_client</code>). Bunlar <code className="text-xs">
            httpOnly
          </code>{' '}
          ve <code className="text-xs">Secure</code> olarak ayarlanır.
        </p>
        <p className="mt-2">
          <strong>Reklam, izleme veya analitik çerezi kullanılmaz.</strong> Üçüncü taraf izleme
          betiği bulunmaz.
        </p>
      </Section>

      <Section title="10. Değişiklikler">
        <p>
          Bu politika güncellenebilir. Önemli değişikliklerde kayıtlı kullanıcılara e-posta ile
          bildirim yapılır ve bu sayfadaki güncelleme tarihi değiştirilir.
        </p>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/* Meta App Review ve Google OAuth Verification incelemecileri
          çoğunlukla İngilizce çalışıyor. Ayrı bir sayfa yerine aynı URL'de
          İngilizce özet vermek, "policy not accessible/understandable"
          gerekçesiyle reddedilme riskini düşürüyor. */}
      <hr className="my-10 border-[var(--border)]" />

      <h2 className="text-xl font-semibold" id="english">
        Privacy Policy (English)
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Last updated: 5 August 2026</p>

      <Section title="Who we are">
        <p>
          Advetics is a software service operated by Profaj that lets advertising agencies and
          businesses manage their <strong>Meta (Facebook, Instagram)</strong> and{' '}
          <strong>Google Ads</strong> advertising accounts from a single dashboard. Contact:{' '}
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>
        </p>
      </Section>

      <Section title="Data we process">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Account data:</strong> name, email, language preference. Passwords are stored
            only as argon2id hashes.
          </li>
          <li>
            <strong>OAuth tokens</strong> for Meta and Google, encrypted at rest with AES-256-GCM.
            Tokens are never exposed in any interface or API response.
          </li>
          <li>
            <strong>Advertising data:</strong> ad account metadata, campaign / ad set / ad
            structures, and aggregate performance metrics (impressions, clicks, spend,
            conversions, conversion value).
          </li>
          <li>
            <strong>Meta pages and Instagram business accounts:</strong> identifiers, names, and
            organic post engagement metrics, used for the optional auto-boost feature.
          </li>
          <li>
            <strong>Security logs:</strong> IP address, user agent, and an immutable audit trail of
            actions that change advertising budgets.
          </li>
        </ul>
        <p className="mt-3">
          <strong>We do not collect</strong> personal data about end users, customers, or ad
          audiences from the advertising platforms. Only aggregate performance metrics are
          processed.
        </p>
      </Section>

      <Section title="Purpose and legal basis">
        <p>
          Data is processed solely to provide the service: consolidating advertising data,
          producing reports, and executing automation rules that the user defines. Access to Meta
          and Google is based on the user&apos;s explicit consent granted through the platform&apos;s
          own OAuth consent screen, and that consent can be withdrawn at any time.
        </p>
        <p className="mt-2">
          We <strong>never sell data</strong>, never share it with third parties for advertising,
          and never use it for profiling or marketing.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          OAuth tokens are irreversibly deleted the moment a connection is removed. Advertising
          metrics are retained for at most 37 months. Audit logs are retained for 2 years for
          accountability of automated budget changes. See our{' '}
          <a href="/veri-silme" className="underline">
            Data Deletion Instructions
          </a>
          .
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under GDPR and Turkish KVKK you may request access, correction, deletion, restriction,
          objection, and portability of your personal data. Write to{' '}
          <a href="mailto:hello@profaj.com" className="underline">
            hello@profaj.com
          </a>
          ; we respond within 30 days.
        </p>
      </Section>

      <Section title="Data location">
        <p>
          Data is hosted on servers located in the European Union (Frankfurt, Germany). API calls
          are made to Meta Platforms, Inc. and Google LLC in the United States strictly to access
          the user&apos;s own advertising accounts.
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
