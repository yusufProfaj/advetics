'use client';

import { Fragment } from 'react';

import Link from 'next/link';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import type { Oneri } from '@advetics/shared';
import { ONERI_TURU_ETIKETI, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { formatRelative } from '@/lib/format';
import { useDil, useSozluk } from '@/dil/saglayici';
import { iyilestirSozlugu } from '@/dil/sozlukler/iyilestir';
import { etkiAdresi, type KartEtkiSatiri } from '@/lib/etki';
import { NOKTA_HALI } from './etki-sekmesi';
import { eylemMetni, kartHali, miniYollar, MINI, seviyeAdi, sonucMetni } from '@/lib/iyilestir';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';
import { DurumNoktasi } from '@/components/ui/rozet';

/**
 * ÖNERİ KARTI (onaylı taslak `docs/marka/sayfa-taslaklari.html` #iyilestir):
 * `Kart` kalıbı; üstte gri etiketler (tür · platform · seviye), başlık, gri
 * yol, KANIT KUTULARI yan yana (ad + "önce → şimdi"), mini grafik, bir
 * paragraf gerekçe; eylemler SAĞ ALTTA (`Kart altEylem`). Kartın hangi
 * hâlde olduğu `kartHali` kararından; burada yalnız çiziliyor.
 *
 * KART İÇİNDE KIRMIZI DOLU DÜĞME YOK (BILESENLER §3): ana eylem TEK `koyu`
 * düğme, yan eylem ikincil, "Yoksay" hayalet. Sayfanın tek birincili
 * başlıktaki "Yeni kural".
 *
 * "YENİ KREATİF" BAĞLANTISI yorgunluk kartlarında: yorgun reklamın çaresi
 * yeni kreatif ve reklam kurmanın tek yolu AdvCampaign (kullanıcı kararı
 * 2026-10-07). Sözleşme "setteki tek reklam" bilgisini ayrı bir alan
 * olarak taşımıyor; o durumda uyarı sunucunun `neden` cümlesinde.
 */

/** Kartın eylem satırındaki kısa durum/kısıt metni: gri, satırın solunda. */
const KISIT = 'mr-auto basis-full text-12 text-ink-muted min-[560px]:basis-auto';

/** Gri etiket hapı (tür · platform · seviye). */
const ETIKET = 'inline-flex h-6 items-center rounded-full bg-surface-sunken px-2.5 text-11 font-bold text-ink-muted';

export function OneriKarti({
  oneri,
  yazabilir,
  gidiyor,
  hata,
  yoksayiliyor,
  onUygula,
  onYoksay,
  etkiSatiri,
}: {
  oneri: Oneri;
  yazabilir: boolean;
  /** Yoksay sonrası çıkış geçişi; kart birazdan listeden düşecek. */
  gidiyor: boolean;
  hata: string | null;
  yoksayiliyor: boolean;
  onUygula: () => void;
  onYoksay: () => void;
  /**
   * Uygulanmış kartın altındaki tek satır (Paket C): "Etki 18 Ekim
   * tarihinde ölçülecek" ya da sonuç. Kararı `kartEtkiSatiri` veriyor;
   * `null` = kart uygulanmamış, satır yok.
   */
  etkiSatiri?: KartEtkiSatiri | null;
}) {
  const { dil } = useDil();
  const d = useSozluk(iyilestirSozlugu).kart;
  const hal = kartHali(oneri, yazabilir);
  const metin = eylemMetni(oneri, dil);
  const yol = oneri.varlik.ustAd ? `${oneri.varlik.ustAd} › ${oneri.varlik.ad}` : oneri.varlik.ad;

  /*
   * EYLEM SATIRI: solda durum ya da kısıt cümlesi, sağda düğmeler (hayalet
   * Yoksay → ikincil yan eylem → koyu ana eylem). Uygulanmış kartta düğme
   * yok, yalnız geri okumanın sonucu.
   */
  const eylemler =
    hal === 'dogrulandi' || hal === 'uyusmadi' ? (
      (() => {
        const t = sonucMetni(oneri.uygulama!, oneri.platform, metin?.sonra ?? null, formatRelative(oneri.uygulama!.zaman, dil), dil);
        return (
          <span className="mr-auto inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <DurumNoktasi hal={t.ton === 'uyari' ? 'hata' : 'ok'} />
            {t.metin}
          </span>
        );
      })()
    ) : hal === 'uygulandi' ? (
      <span className="mr-auto inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
        <DurumNoktasi hal="ok" />
        {d.uygulandiKayitsiz}
      </span>
    ) : (
      <>
        {hal === 'bilgi' && <span className={KISIT}>{oneri.kisit ?? d.yalnizBilgi}</span>}
        {hal === 'yetkisiz' && <span className={KISIT}>{d.yetkisiz}</span>}
        {hata && (
          <span className="mr-auto basis-full text-12 text-danger-strong" role="alert">
            {hata}
          </span>
        )}
        {yazabilir && (
          <Dugme ton="hayalet" boyut="kucuk" onClick={onYoksay} bekliyor={yoksayiliyor}>
            {yoksayiliyor ? d.yoksayiliyor : d.yoksay}
          </Dugme>
        )}
        {oneri.tur === 'kreatif_yorgunlugu' && (
          <Link className={dugmeSinifi('ikincil', 'kucuk')} href={`/reklam?musteri=${encodeURIComponent(oneri.clientId)}`}>
            {d.yeniKreatif}
          </Link>
        )}
        {oneri.tur === 'donusum_optimizasyonu' && (
          // YAZMA YOK (bu tur): kart yalnız bilgi; reklam setini görmek
          // için Reklam Yöneticisi'ne bağlanıyor.
          <Link className={dugmeSinifi('ikincil', 'kucuk')} href={baglanti(REKLAM_YONETICISI, {}, { seviye: 'ad_group' })}>
            {d.reklamYoneticisindeGor}
          </Link>
        )}
        {hal === 'uygulanabilir' && metin && (
          <Dugme ton="koyu" boyut="kucuk" onClick={onUygula}>
            {metin.dugme}
          </Dugme>
        )}
      </>
    );

  return (
    <Kart
      as="article"
      className={`flex flex-col transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
        gidiyor ? 'scale-[0.98] opacity-0' : ''
      }`}
      altEylem={<div className="flex w-full flex-wrap items-center justify-end gap-2">{eylemler}</div>}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={ETIKET}>{ONERI_TURU_ETIKETI[oneri.tur]}</span>
          <span className={ETIKET}>{PLATFORM_KISA_ADLARI[oneri.platform]}</span>
          <span className={ETIKET}>{seviyeAdi(oneri.platform, oneri.varlik.seviye, dil)}</span>
        </div>
        <div>
          <h3 className="font-baslik m-0 text-15 font-bold leading-snug text-ink">{oneri.baslik}</h3>
          {/* Üst varlık yoksa alt satır başlığın adını tekrar ederdi (canlı denetim). */}
          {oneri.varlik.ustAd && <p className="m-0 mt-0.5 text-12 text-ink-muted">{yol}</p>}
        </div>

        {/*
         * KANIT KUTULARI yan yana; dar kartta kendiliğinden alt satıra iner.
         * Sayı Montserrat ve hizalı rakam; "kötü" yön kırmızı, "iyi" yön
         * düz siyah (yeşil yalnız durum noktası).
         *
         * TAŞMA (canlı, 2026-10-16): kutu 104 px'e kadar daralıyor, değer ise
         * `whitespace-nowrap` idi; "213,15 ₺ → 128,97 ₺" komşu kutunun üstüne
         * biniyor, "900,00 ₺ → 1.080,0…" kart dışına taşıyordu. Kutu tabanı
         * 150 px ve değer OKTAN kırılabiliyor: her tutar kendi içinde bütün
         * kalıyor (kırpılmış para tutarı yanlış sayı göstermekle aynı şey),
         * sığmazsa "sonra" alt satıra iniyor.
         */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {oneri.kanitlar.map((k) => (
            <div key={k.etiket} className="grid min-w-0 content-start gap-0.5 rounded-alan border border-line px-3 py-2">
              <span className="text-12 leading-snug text-ink-muted">{k.etiket}</span>
              <b
                className={`font-baslik text-14 font-bold leading-snug tabular-nums ${
                  k.yon === 'kotu' ? 'text-danger-strong' : 'text-ink'
                }`}
              >
                {k.once !== null ? (
                  <>
                    <span className="whitespace-nowrap">{k.once} →</span> <KirilirDeger metin={k.simdi} />
                  </>
                ) : (
                  <KirilirDeger metin={k.simdi} />
                )}
              </b>
            </div>
          ))}
        </div>
        <MiniGrafik oneri={oneri} />

        <p className="m-0 text-13 leading-normal text-ink-muted">{oneri.neden}</p>

        {etkiSatiri && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[12.5px] text-ink">
            <DurumNoktasi hal={NOKTA_HALI[etkiSatiri.nokta]} />
            <span>{etkiSatiri.metin}</span>
            {etkiSatiri.bagli && (
              <Link className={`${KART_BAGLANTISI} ml-auto`} href={etkiAdresi(oneri.clientId)}>
                {d.etkisindeGor}
              </Link>
            )}
          </div>
        )}
      </div>
    </Kart>
  );
}

/**
 * Mini grafik: iki seri, her biri KENDİ ölçeğinde (`miniYollar`). 1. seri
 * kırmızı, 2. seri siyah (`Grafik` bileşeniyle aynı sıra). Çizim animasyonu
 * kalktı: modül sınıfı (`ciz`) gidince karşılığı yok ve kartlar art arda
 * girerken her grafiğin yeniden çizilmesi bilgi taşımıyordu.
 * Seri ADLARI sözleşmeden (`adlar`); taslaktaki "Sıklık/Tıklama oranı"
 * varsayılanı yorgunluk dışındaki kartta yanlış ad yazardı.
 */
function MiniGrafik({ oneri }: { oneri: Oneri }) {
  const yollar = miniYollar(oneri.seri);
  if (!yollar || !oneri.seri) return null;
  return (
    <figure className="m-0 flex flex-wrap items-center gap-3">
      <svg className="h-16 w-[150px] shrink-0" viewBox={`0 0 ${MINI.W} ${MINI.H}`} aria-hidden="true">
        <path d={yollar.b} className="fill-none stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={yollar.a} className="fill-none stroke-ink" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <figcaption className="grid gap-1 text-11 text-ink-muted">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="block h-0.5 w-2.5 rounded-full bg-brand" />
          {oneri.seri.adlar[1]}
        </span>
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="block h-0.5 w-2.5 rounded-full bg-ink" />
          {oneri.seri.adlar[0]}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * "87.176,68 ₺ / 95.000,00 ₺" gibi değeri " / " işaretinden kırılabilir
 * yapar; her tutar kendi içinde bölünmez kalır.
 */
function KirilirDeger({ metin }: { metin: string }) {
  const parcalar = metin.split(' / ');
  return (
    <>
      {parcalar.map((p, i) => (
        <Fragment key={i}>
          {/* Boşluk span'ın DIŞINDA: nowrap içindeki boşlukta satır kırılmaz. */}
          <span className="whitespace-nowrap">{i < parcalar.length - 1 ? `${p} /` : p}</span>
          {i < parcalar.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}
