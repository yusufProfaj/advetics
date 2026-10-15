import { YasalBolum, type YasalBaslik, type YasalIcerik } from '@/components/landing/yasal-duzen';

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
 * Kullanım koşulları, TÜRKÇE ve BAĞLAYICI metin (İngilizcesi `kosullar.en.tsx`,
 * yalnız çeviri; docs/i18n/MIMARI.md Ç13). Google OAuth Verification,
 * gizlilik politikasının yanında bir kullanım koşulları adresi de istiyor.
 * Meta App Review'da zorunlu değil ama başvuruyu güçlendiriyor.
 *
 * 2026-10-14: platform listesine LinkedIn Ads eklendi (gizlilikle aynı
 * düzeltme). Başka cümleye dokunulmadı; "toplu kampanya oluşturma" ve
 * "kuru çalıştırma" ifadelerinin bugünkü ürünle örtüşüp örtüşmediği ayrıca
 * gözden geçirilmeli (devir notunda). Bir cümle değişirse `.en.tsx`teki
 * karşılığı AYNI committe değişmeli: iki dil ayrı söz verirse incelemeci
 * hangisini okuduğuna göre farklı bir ürün görür.
 */
export function kosullarTr(): YasalIcerik {
  return {
    baslik: 'Kullanım Koşulları',
    aciklama:
      'Advetics reklam yönetim platformunun kullanım koşulları.',
    guncelleme: '14 Ekim 2026',
    bolumler: Object.values(B),
    ozet:
      'Otomatik kurallar gerçek reklam harcamasını etkiler; tanımladığınız kuralların sonucundan ' +
      'siz sorumlusunuz. Faturada bağlayıcı olan, platformların kendi raporlarıdır.',
    govde: (
      <>
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
      </>
    ),
  };
}
