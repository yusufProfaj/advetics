import type { Metadata } from 'next';

import {
  IngilizceBaslik,
  YasalAltBolum,
  YasalBolum,
  YasalDuzen,
  type YasalBaslik,
} from '@/components/landing/yasal-duzen';

export const metadata: Metadata = {
  title: 'Kullanım Koşulları · Advetics',
  description: 'Advetics reklam yönetim platformunun kullanım koşulları.',
  robots: { index: true, follow: true },
};

const B = {
  hizmet: { id: 'hizmetin-tanimi', baslik: '1. Hizmetin tanımı' },
  hesap: { id: 'hesap-ve-yetkilendirme', baslik: '2. Hesap ve yetkilendirme' },
  otomatik: { id: 'otomatik-aksiyonlar', baslik: '3. Otomatik aksiyonlar ve sorumluluk' },
  uyum: { id: 'platform-kurallari', baslik: '4. Platform kurallarına uyum' },
  dogruluk: { id: 'veri-dogrulugu', baslik: '5. Veri doğruluğu' },
  sureklilik: { id: 'hizmet-surekliligi', baslik: '6. Hizmet sürekliliği' },
  fesih: { id: 'fesih', baslik: '7. Fesih' },
  kisisel: { id: 'kisisel-veriler', baslik: '8. Kişisel veriler' },
  iletisim: { id: 'iletisim', baslik: '9. İletişim' },
} satisfies Record<string, YasalBaslik>;

/**
 * Google OAuth Verification, gizlilik politikasının yanında bir kullanım
 * koşulları adresi de istiyor. Meta App Review'da zorunlu değil ama başvuruyu
 * güçlendiriyor.
 *
 * 2026-10-14: platform listesine LinkedIn Ads eklendi (gizlilikle aynı
 * düzeltme). Başka cümleye dokunulmadı; "toplu kampanya oluşturma" ve
 * "kuru çalıştırma" ifadelerinin bugünkü ürünle örtüşüp örtüşmediği ayrıca
 * gözden geçirilmeli (devir notunda).
 */
export default function TermsPage() {
  return (
    <YasalDuzen
      yol="/kosullar"
      baslik="Kullanım Koşulları"
      guncelleme="14 Ekim 2026"
      bolumler={Object.values(B)}
      ozet={
        'Otomatik kurallar gerçek reklam harcamasını etkiler; tanımladığınız kuralların sonucundan ' +
        'siz sorumlusunuz. Faturada bağlayıcı olan, platformların kendi raporlarıdır.'
      }
    >
      <YasalBolum b={B.hizmet}>
        <p>
          Advetics, Meta (Facebook, Instagram), Google Ads ve LinkedIn Ads reklam hesaplarının tek
          panelden yönetilmesini sağlayan bir yazılım hizmetidir. Hizmet; veri birleştirme,
          raporlama, kural tabanlı otomasyon ve toplu kampanya oluşturma işlevleri sunar.
        </p>
      </YasalBolum>

      <YasalBolum b={B.hesap}>
        <p>
          Hizmeti kullanmak için bir kullanıcı hesabı ve en az bir reklam platformu bağlantısı
          gerekir. Bağlantı, ilgili platformun kendi OAuth izin ekranı üzerinden kurulur.
          Yetkilendirdiğiniz reklam hesaplarına erişim yetkiniz olduğunu beyan etmiş sayılırsınız.
        </p>
        <p>
          Hesap güvenliğinden ve hesabınız üzerinden yapılan işlemlerden siz sorumlusunuz. Yetkisiz
          erişim şüphesinde şifrenizi değiştirin — bu işlem tüm aktif oturumları sonlandırır.
        </p>
      </YasalBolum>

      <YasalBolum b={B.otomatik}>
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
      </YasalBolum>

      <YasalBolum b={B.uyum}>
        <p>
          Hizmeti kullanırken Meta Platform Terms, Meta Advertising Policies ve Google Ads
          Politikaları dâhil olmak üzere ilgili platformların kurallarına uymayı kabul edersiniz.
          Bu kuralların ihlali, ilgili platformun reklam hesabınızı askıya almasına yol açabilir;
          bu durumdan Advetics sorumlu tutulamaz.
        </p>
      </YasalBolum>

      <YasalBolum b={B.dogruluk}>
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
      </YasalBolum>

      <YasalBolum b={B.sureklilik}>
        <p>
          Hizmet, üçüncü taraf API&apos;lerine bağımlıdır. Platformların kota sınırları, API sürüm
          değişiklikleri veya kesintileri hizmetin geçici olarak sınırlı çalışmasına yol
          açabilir. Kesintisiz erişim garantisi verilmez.
        </p>
      </YasalBolum>

      <YasalBolum b={B.fesih}>
        <p>
          Hesabınızı ve bağlantılarınızı dilediğiniz zaman kaldırabilirsiniz. Verilerin silinmesi
          için <a href="/veri-silme">Veri Silme Talimatları</a> sayfasına bakın. Platform
          kurallarının veya bu koşulların ihlali hâlinde hizmete erişim askıya alınabilir.
        </p>
      </YasalBolum>

      <YasalBolum b={B.kisisel}>
        <p>
          Kişisel verilerin işlenmesine ilişkin esaslar{' '}
          <a href="/gizlilik">Gizlilik Politikası</a> sayfasında açıklanmıştır.
        </p>
      </YasalBolum>

      <YasalBolum b={B.iletisim}>
        <p>
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>
        </p>
      </YasalBolum>

      <IngilizceBaslik>Terms of Service (English)</IngilizceBaslik>

      <YasalAltBolum baslik="Service">
        <p>
          Advetics is a software service for managing Meta (Facebook, Instagram), Google Ads and
          LinkedIn Ads advertising accounts from a single dashboard, including reporting,
          rule-based automation and bulk campaign creation.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Authorisation">
        <p>
          You connect your advertising accounts through each platform&apos;s own OAuth consent
          screen and confirm that you are authorised to manage the accounts you connect. You are
          responsible for the security of your account.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Automated actions">
        <p>
          Rules you define can change budgets and pause or resume campaigns, which{' '}
          <strong>affects real advertising spend</strong>. Every rule is therefore created in{' '}
          <strong>dry-run mode</strong> and requires an explicit action to go live. Bulk-created
          campaigns are saved as paused drafts by default. You remain responsible for the outcomes
          of the rules you define and for the resulting spend. No guarantee is made regarding
          advertising performance or return on investment.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Data accuracy and availability">
        <p>
          Metrics come from the advertising platforms&apos; APIs and may be revised retroactively
          due to attribution windows. The platforms&apos; own reports are authoritative for
          billing. The service depends on third-party APIs; rate limits, API version changes or
          outages may temporarily limit functionality. Uninterrupted availability is not
          guaranteed.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Platform compliance">
        <p>
          You agree to comply with the Meta Platform Terms, Meta Advertising Policies and Google
          Ads Policies. Advetics is not liable for account suspensions resulting from violations of
          those policies.
        </p>
      </YasalAltBolum>

      <YasalAltBolum baslik="Termination and contact">
        <p>
          You may remove your connections and account at any time — see the{' '}
          <a href="/veri-silme">Data Deletion Instructions</a>. Personal data handling is described
          in our <a href="/gizlilik">Privacy Policy</a>. Contact:{' '}
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>
        </p>
      </YasalAltBolum>
    </YasalDuzen>
  );
}
