import { cerezler, depolama } from '@/components/landing/cerez';
import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';
import { yerelYol } from '@/lib/site-yollari';

/** Çapalar (`id`) Türkçe sürümle AYNI. */
const B = {
  nedir: { id: 'cerez-nedir', baslik: '1. What is a cookie' },
  cerezler: { id: 'kullandigimiz-cerezler', baslik: '2. Cookies we use' },
  depolama: { id: 'tarayici-depolamasi', baslik: '3. Browser storage' },
  ucuncu: { id: 'ucuncu-taraflar', baslik: '4. Third parties' },
  tercih: { id: 'tercihinizi-degistirme', baslik: '5. Changing your preference' },
  iletisim: { id: 'iletisim', baslik: '6. Contact' },
} satisfies Record<string, YasalBaslik>;

/**
 * Çerez politikasının İngilizce ÇEVİRİSİ (Ç13: bağlayıcı olan
 * `cerez-politikasi.tr.tsx`). Tablolar `cerez.ts`teki İngilizce listelerden;
 * `cerez.spec.ts` onları Türkçe listeyle (ad, sıra, süre) karşılaştırıyor.
 * Eski kısa İngilizce özet `adv_dil` çerezini hiç saymıyordu: elle yazılmış
 * özet listeden okunmadığı için çerez eklenince eskidi.
 */
export function cerezPolitikasiEn(): YasalIcerik {
  return {
    baslik: 'Cookie Policy',
    aciklama:
      'Advetics uses only cookies strictly necessary for the session; there are no advertising, tracking or analytics cookies.',
    guncelleme: '14 October 2026',
    bolumler: Object.values(B),
    ozet:
      'Advetics uses strictly necessary cookies only to keep you signed in and to remember the ' +
      'selections you make in the panel. There are no advertising, tracking or analytics cookies, ' +
      'so there is no cookie that would require asking for your consent.',
    govde: (
      <>
        <YasalBolum b={B.nedir}>
          <p>
            A cookie is a small text file that a website you visit leaves in your browser. The site
            reads it to recognise you on the next request.
          </p>
        </YasalBolum>

        <YasalBolum b={B.cerezler}>
          <p>
            All of the cookies below are <b>strictly necessary</b>: without them you cannot sign in,
            or the panel cannot remember the workspace you selected. Under KVKK (Law No. 6698 on the
            Protection of Personal Data) and Electronic Communications Law No. 5809, explicit
            consent is not required for strictly necessary cookies. None of these cookies is created
            unless you use the sign-in screen; browsing the marketing site leaves no cookies.
          </p>
          <div className="tablo-sar">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {cerezler('en').map((c) => (
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
            Cookies marked <code>HttpOnly</code> cannot be read by scripts on the page. The other
            four carry only a selection (which workspace, which company, which language); the panel reads them and
            your permissions are verified again on the server on every request. All of them are set
            as <code>Secure</code>, meaning they are sent only over an encrypted connection, and
            they are not attached to form requests coming from other sites (
            <code>SameSite=Lax</code>).
          </p>
        </YasalBolum>

        <YasalBolum b={B.depolama}>
          <p>
            The site and the panel keep some display preferences in your browser&apos;s local
            storage. This information is not sent to our servers and does not identify you:
          </p>
          <div className="tablo-sar">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>What it holds</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {depolama('en').map((d) => (
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
            There are <b>no</b> third-party tracking scripts (Google Analytics, Meta Pixel, etc.) on
            the site or in the panel. Fonts are served from the site&apos;s own server. The
            authorisation pages that open when you connect your Meta, Google or LinkedIn account are
            subject to those platforms&apos; own cookie policies.
          </p>
        </YasalBolum>

        <YasalBolum b={B.tercih}>
          <p>
            You can delete strictly necessary cookies in your browser settings; if you do, you will
            be signed out. If an optional cookie is added in the future, this page will be updated
            and your consent will be asked before it is used. To see the cookie notice again, use
            the{' '}
            <a href={yerelYol('/cerez-politikasi', 'en')} data-cerez-ac>
              Cookie preferences
            </a>{' '}
            link at the bottom of the page.
          </p>
        </YasalBolum>

        <YasalBolum b={B.iletisim}>
          <p>
            For questions: <a href="mailto:hello@profaj.com">hello@profaj.com</a> · Data controller:
            Profaj.
          </p>
        </YasalBolum>
      </>
    ),
  };
}
