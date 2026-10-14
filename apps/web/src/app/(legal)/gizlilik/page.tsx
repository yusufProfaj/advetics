import type { Metadata } from 'next';

import {
  IngilizceBaslik,
  YasalAltBolum,
  YasalBolum,
  YasalDuzen,
  type YasalBaslik,
} from '@/components/landing/yasal-duzen';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası · Advetics',
  description:
    'Advetics reklam yönetim platformunun kişisel veri işleme, saklama ve silme esasları.',
  // Meta ve Google crawler'larının indeksleyebilmesi için açık.
  robots: { index: true, follow: true },
};

const UPDATED = '14 Ekim 2026';

/** Bölümler: içindekiler ve başlıklar bu listeden (`yasal-duzen.tsx`). */
const B = {
  sorumlu: { id: 'veri-sorumlusu', baslik: '1. Veri sorumlusu' },
  ne: { id: 'advetics-ne-yapar', baslik: '2. Advetics ne yapar' },
  veriler: { id: 'islenen-veriler', baslik: '3. İşlenen veriler' },
  amac: { id: 'amac-ve-dayanak', baslik: '4. İşleme amaçları ve hukuki dayanak' },
  aktarim: { id: 'veri-aktarimi', baslik: '5. Veri aktarımı' },
  saklama: { id: 'saklama-sureleri', baslik: '6. Saklama süreleri' },
  guvenlik: { id: 'guvenlik-onlemleri', baslik: '7. Güvenlik önlemleri' },
  haklar: { id: 'haklariniz', baslik: '8. Haklarınız' },
  cerez: { id: 'cerezler', baslik: '9. Çerezler' },
  degisiklik: { id: 'degisiklikler', baslik: '10. Değişiklikler' },
} satisfies Record<string, YasalBaslik>;

/*
 * Bu metin sistemin GERÇEKTEN ne topladığını anlatıyor — kolon kolon
 * koddan çıkarıldı. Yeni bir veri alanı eklendiğinde burası da
 * güncellenmeli; aksi halde beyan ile gerçek ayrışır.
 *
 * 2026-10-14: platform listesi düzeltildi. Metin "yalnız Meta ve Google
 * Ads" diyordu; LinkedIn Ads 2026-09-07'den beri bağlanıyor (okuma ve
 * raporlama) ve YouTube kanalları Google bağlantısının altında. Beyanın
 * eksik platformu sayması, o platforma giden aktarımı gizlemek demekti.
 */
export default function PrivacyPage() {
  return (
    <YasalDuzen
      yol="/gizlilik"
      baslik="Gizlilik Politikası"
      guncelleme={UPDATED}
      bolumler={Object.values(B)}
      ozet={
        'Advetics yalnız hizmeti sunmak için gereken veriyi işler. Reklam platformlarından son ' +
        'kullanıcıların kişisel verisi çekilmez; veriler satılmaz ve reklam amacıyla paylaşılmaz.'
      }
    >
      <YasalBolum b={B.sorumlu}>
        <p>
          Bu platform (<strong>Advetics</strong>), Profaj tarafından işletilmektedir. Kişisel
          verilerin işlenmesine ilişkin sorularınız için:{' '}
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>
        </p>
      </YasalBolum>

      <YasalBolum b={B.ne}>
        <p>
          Advetics, reklam ajanslarının ve işletmelerin <strong>Meta (Facebook, Instagram)</strong>,{' '}
          <strong>Google Ads</strong> ve <strong>LinkedIn Ads</strong> reklam hesaplarını tek panelden
          yönetmesini sağlayan bir yazılım hizmetidir. YouTube kanalları Google bağlantısının
          altında bağlanır. Reklam performans verilerini bu platformlardan çeker, raporlar ve
          kullanıcının tanımladığı kurallara göre otomatik aksiyonlar alır.
        </p>
        <p>
          Bu platformlar dışında hiçbir reklam ağı desteklenmez ve hiçbir üçüncü taraf reklam
          platformuna veri gönderilmez.
        </p>
      </YasalBolum>

      <YasalBolum b={B.veriler}>
        <h3>3.1 Panel kullanıcılarına ait veriler</h3>
        <ul>
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

        <h3>3.2 Bağlanan reklam platformlarından alınan veriler</h3>
        <p>
          Kullanıcı, Meta, Google veya LinkedIn hesabını kendi açık onayıyla bağladığında aşağıdaki
          veriler işlenir:
        </p>
        <ul>
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
        <p>
          <strong>İşlenmeyen veriler:</strong> Reklam platformlarından son kullanıcıların,
          müşterilerin veya reklam izleyicilerinin kişisel verileri (isim, e-posta, telefon,
          adres) çekilmez ve saklanmaz. Yalnızca toplu (agrege) performans metrikleri işlenir.
        </p>
      </YasalBolum>

      <YasalBolum b={B.amac}>
        <ul>
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
        <p>
          Veriler <strong>hiçbir koşulda satılmaz</strong>, reklam amacıyla üçüncü taraflarla
          paylaşılmaz ve profilleme/pazarlama amacıyla kullanılmaz.
        </p>
      </YasalBolum>

      <YasalBolum b={B.aktarim}>
        <p>
          Veriler, hizmetin sunulması için zorunlu olduğu ölçüde aşağıdaki taraflarla iletişime
          girer:
        </p>
        <ul>
          <li>
            <strong>Meta Platforms, Inc.</strong> — Marketing API üzerinden reklam verisi okuma ve
            kullanıcının tanımladığı aksiyonların uygulanması
          </li>
          <li>
            <strong>Google LLC</strong> — Google Ads API üzerinden aynı amaçlarla
          </li>
          <li>
            <strong>LinkedIn Corporation</strong> — LinkedIn Marketing API üzerinden reklam
            verisinin okunması ve raporlanması
          </li>
          <li>
            <strong>Barındırma sağlayıcısı (Hostinger)</strong> — sunucu altyapısı, Avrupa Birliği
            (Frankfurt, Almanya) lokasyonu
          </li>
        </ul>
        <p>
          Meta, Google ve LinkedIn, ABD merkezli şirketlerdir. Bu aktarım, kullanıcının kendi reklam
          hesaplarına erişim için verdiği açık rızaya dayanır ve yalnızca ilgili API çağrılarıyla
          sınırlıdır.
        </p>
      </YasalBolum>

      <YasalBolum b={B.saklama}>
        <ul>
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
      </YasalBolum>

      <YasalBolum b={B.guvenlik}>
        <ul>
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
            bir workspace’in verisi, uygulama katmanındaki bir hata durumunda bile başka bir
            müşteriye görünmez.
          </li>
          <li>Veritabanı ve uygulama sunucuları internete kapalıdır; erişim yalnızca yereldir.</li>
        </ul>
      </YasalBolum>

      <YasalBolum b={B.haklar}>
        <p>
          KVKK m.11 ve GDPR kapsamında; verilerinize erişme, düzeltilmesini isteme, silinmesini
          isteme, işlemeye itiraz etme ve verilerinizi taşınabilir biçimde alma haklarına
          sahipsiniz.
        </p>
        <p>
          Taleplerinizi <a href="mailto:hello@profaj.com">hello@profaj.com</a> adresine
          iletebilirsiniz. Başvurular en geç 30 gün içinde yanıtlanır.
        </p>
        <p>
          Reklam hesabı bağlantınızı ve ilgili verileri silmek için{' '}
          <a href="/veri-silme">Veri Silme Talimatları</a> sayfasına bakabilirsiniz.
        </p>
      </YasalBolum>

      <YasalBolum b={B.cerez}>
        <p>
          Yalnızca oturumun sürdürülmesi için zorunlu çerezler kullanılır (<code>adv_at</code>,{' '}
          <code>adv_rt</code>, <code>adv_client</code> ve panelde yaptığınız seçimleri tutan
          birkaç çerez). Her birinin amacı ve süresi{' '}
          <a href="/cerez-politikasi">Çerez Politikası</a> sayfasında yazılıdır.
        </p>
        <p>
          <strong>Reklam, izleme veya analitik çerezi kullanılmaz.</strong> Üçüncü taraf izleme
          betiği bulunmaz.
        </p>
      </YasalBolum>

      <YasalBolum b={B.degisiklik}>
        <p>
          Bu politika güncellenebilir. Önemli değişikliklerde kayıtlı kullanıcılara e-posta ile
          bildirim yapılır ve bu sayfadaki güncelleme tarihi değiştirilir.
        </p>
      </YasalBolum>

      {/* Meta App Review ve Google OAuth Verification incelemecileri
          çoğunlukla İngilizce çalışıyor. Ayrı bir sayfa yerine aynı URL'de
          İngilizce özet vermek, "policy not accessible/understandable"
          gerekçesiyle reddedilme riskini düşürüyor. */}
      <IngilizceBaslik>Privacy Policy (English)</IngilizceBaslik>
      <p className="tarih">Last updated: 14 October 2026</p>

      <YasalAltBolum baslik="Who we are">
        <p>
          Advetics is a software service operated by Profaj that lets advertising agencies and
          businesses manage their <strong>Meta (Facebook, Instagram)</strong>,{' '}
          <strong>Google Ads</strong> and <strong>LinkedIn Ads</strong> advertising accounts from a
          single dashboard. YouTube channels are connected through the Google connection. Contact:{' '}
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Data we process">
        <ul>
          <li>
            <strong>Account data:</strong> name, email, language preference. Passwords are stored
            only as argon2id hashes.
          </li>
          <li>
            <strong>OAuth tokens</strong> for Meta, Google and LinkedIn, encrypted at rest with
            AES-256-GCM. Tokens are never exposed in any interface or API response.
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
        <p>
          <strong>We do not collect</strong> personal data about end users, customers, or ad
          audiences from the advertising platforms. Only aggregate performance metrics are
          processed.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Purpose and legal basis">
        <p>
          Data is processed solely to provide the service: consolidating advertising data,
          producing reports, and executing automation rules that the user defines. Access to Meta,
          Google and LinkedIn is based on the user&apos;s explicit consent granted through the
          platform&apos;s own OAuth consent screen, and that consent can be withdrawn at any time.
        </p>
        <p>
          We <strong>never sell data</strong>, never share it with third parties for advertising,
          and never use it for profiling or marketing.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Retention and deletion">
        <p>
          OAuth tokens are irreversibly deleted the moment a connection is removed. Advertising
          metrics are retained for at most 37 months. Audit logs are retained for 2 years for
          accountability of automated budget changes. See our{' '}
          <a href="/veri-silme">Data Deletion Instructions</a>.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Your rights">
        <p>
          Under GDPR and Turkish KVKK you may request access, correction, deletion, restriction,
          objection, and portability of your personal data. Write to{' '}
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>; we respond within 30 days.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Data location">
        <p>
          Data is hosted on servers located in the European Union (Frankfurt, Germany). API calls
          are made to Meta Platforms, Inc., Google LLC and LinkedIn Corporation in the United
          States strictly to access the user&apos;s own advertising accounts.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Cookies">
        <p>
          Only strictly necessary session cookies are used; there are no advertising, tracking or
          analytics cookies. See the <a href="/cerez-politikasi">Cookie Policy</a>.
        </p>
      </YasalAltBolum>
    </YasalDuzen>
  );
}
