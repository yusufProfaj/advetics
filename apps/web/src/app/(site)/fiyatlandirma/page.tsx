import type { Metadata } from 'next';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { menuEtiketi } from '@/components/landing/site-icerik';
import { DENEME_GUN, YILLIK_INDIRIM_YUZDE, paketBul, paketler, usd } from '@/components/landing/fiyat';
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


export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).fiyat;
  return {
    title: `${menuEtiketi(dil, '/fiyatlandirma')} | Advetics`,
    description: d.metaAciklama(
      paketler(dil).map((p) => p.ad).join(', '),
      usd(paketBul('kucuk-isletme').aylikSent),
      YILLIK_INDIRIM_YUZDE,
      DENEME_GUN,
    ),
    alternates: dilBaglantilari('/fiyatlandirma', dil),
  };
}

export default async function FiyatlandirmaSayfasi() {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).fiyat;
  return (
    <>
      <section className="bolum">
        <div className="kap ortali">
          <UstBaslik>{menuEtiketi(dil, '/fiyatlandirma')}</UstBaslik>
          <TanitimBasligi boy="orta">{d.baslik}</TanitimBasligi>
          <p className="alt">{d.alt}</p>
        </div>
        <div className="kap">
          <FiyatPaketleri />
          <KarsilastirmaTablosu dil={dil} />
        </div>
      </section>

      <section className="bolum gri">
        <div className="kap sss">
          <h2 className="t-h2">{d.sorular}</h2>
          <SikSorulanlar />
        </div>
      </section>

      <KapanisBandi />
    </>
  );
}
