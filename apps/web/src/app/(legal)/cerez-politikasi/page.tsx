import type { Metadata } from 'next';

import { CEREZLER, DEPOLAMA } from '@/components/landing/cerez';
import {
  IngilizceBaslik,
  YasalAltBolum,
  YasalBolum,
  YasalDuzen,
  type YasalBaslik,
} from '@/components/landing/yasal-duzen';

export const metadata: Metadata = {
  title: 'Çerez Politikası · Advetics',
  description:
    'Advetics yalnız oturum için zorunlu çerez kullanır; reklam, izleme ya da analitik çerezi yoktur.',
  alternates: { canonical: '/cerez-politikasi' },
  robots: { index: true, follow: true },
};

const B = {
  nedir: { id: 'cerez-nedir', baslik: '1. Çerez nedir' },
  cerezler: { id: 'kullandigimiz-cerezler', baslik: '2. Kullandığımız çerezler' },
  depolama: { id: 'tarayici-depolamasi', baslik: '3. Tarayıcı depolaması' },
  ucuncu: { id: 'ucuncu-taraflar', baslik: '4. Üçüncü taraflar' },
  tercih: { id: 'tercihinizi-degistirme', baslik: '5. Tercihinizi değiştirme' },
  iletisim: { id: 'iletisim', baslik: '6. İletişim' },
} satisfies Record<string, YasalBaslik>;

/**
 * Çerez politikası (onaylı taslağın metni, 2026-10-14). Tablolar
 * `components/landing/cerez.ts`te: süreler taslaktan değil KODDAN ve
 * `cerez.spec.ts` onları API'nin çerez tanımlarıyla karşılaştırıyor.
 */
export default function CerezPolitikasi() {
  return (
    <YasalDuzen
      yol="/cerez-politikasi"
      baslik="Çerez Politikası"
      guncelleme="14 Ekim 2026"
      bolumler={Object.values(B)}
      ozet={
        'Advetics yalnız oturumunuzu açık tutmak ve panelde yaptığınız seçimleri hatırlamak için ' +
        'zorunlu çerez kullanır. Reklam, izleme ya da analitik çerezi yoktur; bu yüzden onayınızı ' +
        'istemeyi gerektiren bir çerez de yoktur.'
      }
    >
      <YasalBolum b={B.nedir}>
        <p>
          Çerez, ziyaret ettiğiniz sitenin tarayıcınıza bıraktığı küçük bir metin dosyasıdır. Site
          sizi bir sonraki istekte tanımak için onu okur.
        </p>
      </YasalBolum>

      <YasalBolum b={B.cerezler}>
        <p>
          Aşağıdaki çerezlerin hepsi <b>zorunludur</b>: olmadan giriş yapamazsınız ya da panel
          seçtiğiniz workspace’i hatırlayamaz. KVKK ve 5809 sayılı Elektronik Haberleşme Kanunu
          uyarınca zorunlu çerezler için açık rıza aranmaz. Çerezlerin hiçbiri giriş
          ekranını kullanmadığınız sürece oluşmaz; tanıtım sitesini gezmek çerez bırakmaz.
        </p>
        <div className="tablo-sar">
        <table>
          <thead>
            <tr>
              <th>Ad</th>
              <th>Amaç</th>
              <th>Süre</th>
              <th>Tür</th>
            </tr>
          </thead>
          <tbody>
            {CEREZLER.map((c) => (
              <tr key={c.ad}>
                <td>
                  <code>{c.ad}</code>
                </td>
                <td>{c.amac}</td>
                <td>{c.sure}</td>
                <td>{c.tur}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p>
          <code>HttpOnly</code> işaretli çerezleri sayfadaki betikler okuyamaz. Diğer üçü yalnız bir
          seçim taşır (hangi workspace, hangi şirket); panel onları okur ve yetkiniz her istekte
          sunucuda yeniden doğrulanır. Hepsi <code>Secure</code> olarak ayarlanır, yani yalnız
          şifreli bağlantıda gönderilir, ve başka sitelerden gelen form isteklerine eklenmez
          (<code>SameSite=Lax</code>).
        </p>
      </YasalBolum>

      <YasalBolum b={B.depolama}>
        <p>
          Site ve panel bazı görünüm tercihlerini tarayıcınızın yerel depolamasında tutar. Bu
          bilgiler sunucumuza gönderilmez ve sizi tanımlamaz:
        </p>
        <div className="tablo-sar">
        <table>
          <thead>
            <tr>
              <th>Anahtar</th>
              <th>Ne tutar</th>
              <th>Süre</th>
            </tr>
          </thead>
          <tbody>
            {DEPOLAMA.map((d) => (
              <tr key={d.ad}>
                <td>
                  <code>{d.ad}</code>
                </td>
                <td>{d.ne}</td>
                <td>{d.sure}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </YasalBolum>

      <YasalBolum b={B.ucuncu}>
        <p>
          Sitede ve panelde üçüncü taraf izleme betiği (Google Analytics, Meta Pixel vb.){' '}
          <b>yoktur</b>. Yazı tipleri sitenin kendi sunucusundan verilir. Meta, Google veya LinkedIn
          hesabınızı bağlarken açılan yetkilendirme sayfaları o platformların kendi çerez
          politikalarına tabidir.
        </p>
      </YasalBolum>

      <YasalBolum b={B.tercih}>
        <p>
          Zorunlu çerezleri tarayıcı ayarlarından silebilirsiniz; bu durumda oturumunuz kapanır.
          İleride isteğe bağlı bir çerez eklenirse bu sayfa güncellenir ve kullanmadan önce
          onayınız istenir. Çerez bildirimini yeniden görmek için sayfanın altındaki{' '}
          <a href="/cerez-politikasi" data-cerez-ac>
            Çerez tercihleri
          </a>{' '}
          bağlantısını kullanabilirsiniz.
        </p>
      </YasalBolum>

      <YasalBolum b={B.iletisim}>
        <p>
          Sorularınız için: <a href="mailto:hello@profaj.com">hello@profaj.com</a> · Veri sorumlusu:
          Profaj.
        </p>
      </YasalBolum>

      <IngilizceBaslik>Cookie Policy (English)</IngilizceBaslik>

      <YasalAltBolum baslik="Summary">
        <p>
          Advetics uses only strictly necessary first-party cookies: the session cookies{' '}
          <code>adv_at</code> and <code>adv_rt</code> (HttpOnly; 15 minutes and 30 days when
          &quot;remember me&quot; is selected, otherwise deleted when the browser closes), the
          two-step sign-in cookie <code>adv_mfa</code> (5 minutes) and the selection cookies{' '}
          <code>adv_client</code>, <code>adv_org</code> (30 days) and <code>adv_mgr</code> (browser
          session). All are Secure and SameSite=Lax. There are no advertising, tracking or
          analytics cookies and no third-party tracking scripts. Display preferences are kept in
          your browser&apos;s local storage and are never sent to our servers. Contact:{' '}
          <a href="mailto:hello@profaj.com">hello@profaj.com</a>.
        </p>
      </YasalAltBolum>
    </YasalDuzen>
  );
}
