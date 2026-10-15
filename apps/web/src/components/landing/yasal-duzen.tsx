import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { sec, type Dil } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { yasalSozlugu } from '@/dil/sozlukler/yasal';
import { yerelYol } from '@/lib/site-yollari';
import { siteIcerigi } from './site-icerik';
import { TanitimBasligi, UstBaslik } from './site-parcalari';

/**
 * ═══ YASAL SAYFA DÜZENİ ═══ (onaylı taslak, `.yasal`)
 *
 * Solda yapışkan "Bu sayfada" içindekiler ve "Yasal belgeler" menüsü,
 * sağda makale: üst başlık, başlık, son güncelleme, özet kutusu, bölümler.
 *
 * İÇİNDEKİLER VE BAŞLIKLAR TEK LİSTEDEN. Sayfa bölümlerini bir kez
 * tanımlıyor (`{ id, baslik }`), hem soldaki bağlantı hem `YasalBolum`un
 * başlığı onu okuyor. Ayrı yazılsalardı bir bölümün adı değişince
 * içindekiler eski adı gösterir ya da bağlantı boşa düşerdi.
 *
 * SUNUCU BİLEŞENİ, JAVASCRIPT YOK: Meta App Review ve Google OAuth
 * crawler'ları bu sayfaları okuyor ve metin HTML'de olmalı. Aktif bölümü
 * izleyen bir kaydırma takibi bilerek yazılmadı; bağlantılar düz çapa.
 *
 * İKİ DİL (2026-10-15, docs/i18n/MIMARI.md Ç2/Ç13): Türkçe sayfanın
 * sonundaki kısa İngilizce özet (`#english`) KALKTI; yerine `/en/...`
 * adresinde belgenin TAM çevirisi var. Özet tam metinle ayrışıyordu (çerez
 * özeti `adv_dil`i hiç saymıyordu) ve incelemeci özeti okuyup eksik bir
 * beyan görüyordu. "English" bağlantısı artık karşı dildeki aynı belgeye
 * gidiyor. Bölüm çapaları (`id`) iki dilde AYNI: `/en/privacy#haklariniz`
 * ile `/gizlilik#haklariniz` aynı bölüm.
 */
export interface YasalBaslik {
  id: string;
  baslik: string;
}

/**
 * Bir yasal belgenin bir dildeki içeriği. `components/yasal/<ad>.tr.tsx`
 * ve `<ad>.en.tsx` aynı tipi döndürüyor; sayfa (`app/(legal)/<ad>`) yalnız
 * dili seçip düzene veriyor. Tip ortak olduğu için bir dilde başlık listesi
 * ya da meta açıklaması unutulursa DERLEME kırılıyor.
 */
export interface YasalIcerik {
  baslik: string;
  /** `<meta name="description">`. */
  aciklama: string;
  guncelleme: string;
  ozet: ReactNode;
  bolumler: YasalBaslik[];
  govde: ReactNode;
}

/**
 * Yasal sayfanın üst bilgisi. Dört sayfa da aynı şeyi kuruyor; elle
 * yazılınca biri `canonical`ı unutuyordu (çerez dışındaki üçünde yoktu).
 * `languages` iki dili `hreflang` ile eşliyor (Ç2): arama motoru ve
 * incelemeci İngilizce sürümün aynı belge olduğunu buradan anlıyor.
 * `index: true`: Meta ve Google crawler'ları bu sayfaları okuyabilmeli.
 */
export function yasalMeta(icerik: YasalIcerik, yol: string, dil: Dil): Metadata {
  return {
    title: `${icerik.baslik} · Advetics`,
    description: icerik.aciklama,
    alternates: {
      canonical: yerelYol(yol, dil),
      languages: { tr: yol, en: yerelYol(yol, 'en') },
    },
    robots: { index: true, follow: true },
  };
}

export async function YasalDuzen({
  yol,
  baslik,
  guncelleme,
  ozet,
  bolumler,
  children,
}: {
  /** Sayfanın TÜRKÇE adresi: "Yasal belgeler" menüsünde işaretleniyor, karşı dil bağlantısı ondan üretiliyor. */
  yol: string;
  baslik: string;
  guncelleme: string;
  ozet: ReactNode;
  bolumler: YasalBaslik[];
  children: ReactNode;
}) {
  const dil = await dilAl();
  const d = sec(yasalSozlugu, dil);
  const digerDil = dil === 'en' ? 'tr' : 'en';
  const digerAdres = yerelYol(yol, digerDil);
  const digerBaglanti = (
    <a href={digerAdres} hrefLang={digerDil} lang={digerDil}>
      {d.digerDil}
    </a>
  );

  return (
    <div className="kap yasal">
      <nav aria-label={d.buSayfada}>
        <span className="etiket">{d.buSayfada}</span>
        {bolumler.map((b) => (
          <a key={b.id} href={`#${b.id}`}>
            {b.baslik.replace(/^\d+\.\s*/, '')}
          </a>
        ))}
        {digerBaglanti}
        <div className="belgeler">
          <span className="etiket">{d.yasalBelgeler}</span>
          {siteIcerigi(dil).YASAL_BELGELER.map((y) => (
            <Link
              key={y.href}
              href={yerelYol(y.href, dil)}
              aria-current={y.href === yol ? 'page' : undefined}
            >
              {y.etiket}
            </Link>
          ))}
        </div>
      </nav>
      <article>
        <UstBaslik>{d.ustBaslik}</UstBaslik>
        <TanitimBasligi boy="yasal">{baslik}</TanitimBasligi>
        <p className="tarih">
          {d.sonGuncelleme}: {guncelleme}
          {' · '}
          {digerBaglanti}
        </p>
        {/* Ç13: çeviri bağlayıcı değil; okuyan bunu metnin BAŞINDA görmeli, sonunda değil. */}
        {dil === 'en' && (
          <p className="tarih">
            {d.ceviriNotu}{' '}
            <a href={digerAdres} hrefLang="tr">
              {d.ceviriNotuBaglanti}
            </a>
          </p>
        )}
        <div className="ozet-kutu">
          <b>{d.kisaca}</b> {ozet}
        </div>
        {children}
      </article>
    </div>
  );
}

/** Bir bölüm: başlığı ve çapası içindekilerle AYNI nesneden. */
export function YasalBolum({ b, children }: { b: YasalBaslik; children: ReactNode }) {
  return (
    <section>
      <h2 id={b.id}>{b.baslik}</h2>
      {children}
    </section>
  );
}
