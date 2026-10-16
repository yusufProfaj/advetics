'use client';

import { useState } from 'react';
import { platformKisaAdi, type KreatifPerformansi } from '@advetics/shared';
import { formatNumber, formatPercent } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { useDil, useSozluk } from '@/dil/saglayici';
import { varliklarSozlugu } from '@/dil/sozlukler/varliklar';

/**
 * ═══ GEÇMİŞTE İŞE YARAYANLAR ═══
 *
 * Hedef kullanıcı reklamcılık bilmiyor ve en sık "ne yazayım" diye takılıyor.
 * Cevap zaten veritabanında duruyordu: aynı müşterinin YAYINA GİRMİŞ
 * reklamları ve gerçek performansları. Hiçbir ekran onu göstermiyordu.
 *
 * SIRALAMA CTR'YE GÖRE ve eşiğin altındaki kreatifler listeye HİÇ girmiyor —
 * üç gösterim almış bir reklamın %33 CTR'si bir performans değil gürültü.
 * Elenen sayısı yine de yazılıyor: sessiz kesme yok.
 */
export function IsleyenKreatifler({ liste }: { liste: KreatifPerformansi[] }) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {liste.map((k) => (
        <Kart key={k.id} kreatif={k} />
      ))}
    </ul>
  );
}

function Kart({ kreatif }: { kreatif: KreatifPerformansi }) {
  const d = useSozluk(varliklarSozlugu).isleyen;
  const { dil } = useDil();
  const [gorselDustu, setGorselDustu] = useState(false);
  /*
   * ÜÇ HÂL: kopyalanmadı, kopyalandı, KOPYALANAMADI. Pano izni reddedilince
   * (http, iframe, tarayıcı ayarı) düğme eskiden hiçbir şey söylemiyordu ve
   * kullanıcı boş panoyu yeni kreatife yapıştırıyordu.
   */
  const [kopya, setKopya] = useState<'yok' | 'tamam' | 'olmadi'>('yok');

  const metin = [kreatif.headline, kreatif.primaryText, kreatif.description]
    .filter((p): p is string => Boolean(p))
    .join('\n\n');

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-alan border border-line bg-surface">
      {/*
        GÖRSEL DÜŞEBİLİR ve bu normal: platformun CDN adresi İMZALI ve süresi
        doluyor (CLAUDE.md). Kırık bir görsel kutusu göstermek yerine metne
        yer açıyoruz — bu kartın asıl değeri zaten metin.
      */}
      {kreatif.thumbnailUrl && !gorselDustu && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={kreatif.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setGorselDustu(true)}
          className="h-32 w-full bg-surface-sunken object-cover"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-2 text-12 text-ink-muted">
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-semibold text-ink">
            {platformKisaAdi(kreatif.platform)}
          </span>
          <span>
            {/* `toFixed` ondalığı NOKTAYLA yazıyordu ("%22.78"); panelin geri
                kalanı Türkçe virgül kullanıyor ("%9,41"). Ortak biçimleyici. */}
            <strong className="text-ink">{formatPercent(kreatif.ctr, 2, dil)}</strong> {d.tiklamaOrani}
          </span>
          <span>{formatNumber(kreatif.impressions, dil)} {d.gosterim}</span>
        </div>

        {kreatif.headline && (
          <p className="m-0 line-clamp-2 text-13 font-bold text-ink">{kreatif.headline}</p>
        )}
        {kreatif.primaryText && (
          <p className="m-0 line-clamp-3 text-12 text-ink-muted">{kreatif.primaryText}</p>
        )}

        <p className="m-0 mt-auto pt-1.5 text-12 text-ink-muted">
          {d.reklamdaKullanildi(kreatif.adCount)} · {d.sonGosterim} {kreatif.sonGun}
        </p>

        {/*
          METNİ KOPYALA — görseli değil.
          Görseli kütüphaneye almak, platformun imzalı adresinden indirmeyi
          gerektiriyor ve o ayrı bir adım. Metin ise zaten bizde ve asıl
          değerli olan o: kullanıcı çalışan bir metni yeni kreatife
          yapıştırıp görselini kendi seçiyor.
        */}
        <Dugme
          ton="ikincil"
          boyut="kucuk"
          disabled={metin.length === 0}
          onClick={() => {
            void navigator.clipboard
              .writeText(metin)
              .then(() => setKopya('tamam'))
              .catch(() => setKopya('olmadi'));
          }}
          className="mt-1.5 self-end"
        >
          {kopya === 'tamam' ? d.kopyalandi : kopya === 'olmadi' ? d.kopyalanamadi : d.metniKopyala}
        </Dugme>
      </div>
    </li>
  );
}
