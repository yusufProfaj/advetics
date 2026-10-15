import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';

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
 * Gizlilik politikası, TÜRKÇE ve BAĞLAYICI metin (İngilizcesi
 * `gizlilik.en.tsx`, yalnız çeviri; docs/i18n/MIMARI.md Ç13).
 *
 * Bu metin sistemin GERÇEKTEN ne topladığını anlatıyor — kolon kolon
 * koddan çıkarıldı. Yeni bir veri alanı eklendiğinde burası da (ve
 * İngilizcesi de) güncellenmeli; aksi halde beyan ile gerçek ayrışır.
 *
 * 2026-10-14: platform listesi düzeltildi. Metin "yalnız Meta ve Google
 * Ads" diyordu; LinkedIn Ads 2026-09-07'den beri bağlanıyor (okuma ve
 * raporlama) ve YouTube kanalları Google bağlantısının altında. Beyanın
 * eksik platformu sayması, o platforma giden aktarımı gizlemek demekti.
 */
export function gizlilikTr(): YasalIcerik {
  return {
    baslik: 'Gizlilik Politikası',
    aciklama:
      'Advetics reklam yönetim platformunun kişisel veri işleme, saklama ve silme esasları.',
    guncelleme: '14 Ekim 2026',
    bolumler: Object.values(B),
    ozet:
      'Advetics yalnız hizmeti sunmak için gereken veriyi işler. Reklam platformlarından son ' +
      'kullanıcıların kişisel verisi çekilmez; veriler satılmaz ve reklam amacıyla paylaşılmaz.',
    govde: (
      <>
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
      </>
    ),
  };
}
