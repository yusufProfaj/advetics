import type { Metadata } from 'next';

import { DENEME_GUN, PAKETLER, YILLIK_INDIRIM_YUZDE, paketBul, usd } from '@/components/landing/fiyat';
import { FiyatPaketleri } from '@/components/landing/fiyat-paketleri';
import { KarsilastirmaTablosu } from '@/components/landing/fiyat-tablosu';
import { KapanisBandi, SikSorulanlar, TanitimBasligi, UstBaslik } from '@/components/landing/site-parcalari';

/**
 * Fiyatlandırma (onaylı taslak, kullanıcı kararı 2026-10-14).
 *
 * Rakamların tamamı `fiyat.ts`ten; bu sayfada elle yazılmış tutar yok.
 * Sıra: başlık ve not (dolar, TL, KDV), dönem anahtarı, üç paket kartı
 * (ajans kartında workspace kaydırıcısı ve kırılım), karşılaştırma
 * tablosu, fiyat soruları.
 *
 * ÜYE OLMA VE ÖDEME YOK: "14 gün ücretsiz dene" ve "Teklif al" e-posta açıyor,
 * paketin adı konu satırında (`iletisim.ts`).
 */
const KUCUK = paketBul('kucuk-isletme');

export const metadata: Metadata = {
  title: 'Fiyatlandırma | Advetics',
  description:
    `Advetics üç paket: ${PAKETLER.map((p) => p.ad).join(', ')}. ${usd(KUCUK.aylikSent)}/ay'dan başlar, ` +
    `yıllık ödemede %${YILLIK_INDIRIM_YUZDE} indirim, ${DENEME_GUN} gün ücretsiz deneme. ` +
    'Reklam bütçeniz doğrudan platformlara ödenir.',
  alternates: { canonical: '/fiyatlandirma' },
};

export default function FiyatlandirmaSayfasi() {
  return (
    <>
      <section className="bolum">
        <div className="kap ortali">
          <FiyatGirisi ust="Fiyatlandırma" />
        </div>
        <div className="kap">
          <FiyatPaketleri />
          <KarsilastirmaTablosu />
        </div>
      </section>

      <section className="bolum gri">
        <div className="kap sss">
          <h2 className="t-h2">Fiyat soruları</h2>
          <SikSorulanlar />
        </div>
      </section>

      <KapanisBandi />
    </>
  );
}

/** Üst başlık sayfa sekmesindeki ve menüdeki adla aynı (`site-icerik.spec.ts`). */
function FiyatGirisi({ ust }: { ust: string }) {
  return (
    <>
      <UstBaslik>{ust}</UstBaslik>
      <TanitimBasligi boy="orta">Büyüklüğünüze göre üç paket.</TanitimBasligi>
      <p className="alt">Fiyatlar ABD doları cinsindendir, ödeme günün kuruyla TL alınır. KDV hariç.</p>
    </>
  );
}
