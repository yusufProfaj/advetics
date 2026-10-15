import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';

const B = {
  bir: { id: 'baglantiyi-kaldir', baslik: 'Seçenek 1 — Reklam hesabı bağlantısını kaldır' },
  iki: { id: 'platformdan-iptal', baslik: 'Seçenek 2 — Meta / Google tarafından erişimi iptal et' },
  uc: { id: 'tum-veriler', baslik: 'Seçenek 3 — Tüm verilerin silinmesini talep et' },
} satisfies Record<string, YasalBaslik>;

/**
 * Veri silme talimatları, TÜRKÇE ve BAĞLAYICI metin (İngilizcesi
 * `veri-silme.en.tsx`). Meta, veri işleyen uygulamalardan bir "Data Deletion
 * Instructions URL" veya geri arama uç noktası istiyor; bu sayfa o
 * gereksinimi karşılar ve App Review formunda bu adres verilir. Talep durumu
 * kutusu (`?talep=`) belge değil, sayfanın kendisinde (`app/(legal)/veri-silme`).
 */
export function veriSilmeTr(): YasalIcerik {
  return {
    baslik: 'Veri Silme Talimatları',
    aciklama:
      'Advetics üzerindeki reklam hesabı bağlantınızı ve kişisel verilerinizi nasıl sileceğiniz.',
    guncelleme: '14 Ekim 2026',
    bolumler: Object.values(B),
    ozet:
      'Bağlantıyı panelden kaldırdığınızda erişim jetonları anında silinir. Bütün verilerinizin ' +
      'silinmesini e-postayla isteyebilirsiniz; talep en geç 30 günde yerine getirilir.',
    govde: (
      <>
        <YasalBolum b={B.bir}>
          <p>
            Panele giriş yapın, <strong>Ayarlar › Platform bağlantıları</strong> sayfasına gidin ve
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
        </YasalBolum>

        <YasalBolum b={B.iki}>
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
        </YasalBolum>

        <YasalBolum b={B.uc}>
          <p>
            Hesabınıza ve workspace kaydınıza ait <strong>tüm verilerin</strong> silinmesi için{' '}
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
        </YasalBolum>
      </>
    ),
  };
}
