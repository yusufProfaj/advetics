'use client';

import { useState } from 'react';
import { platformKisaAdi, type KreatifPerformansi } from '@advetics/shared';
import { formatNumber } from '@/lib/format';

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
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {liste.map((k) => (
        <Kart key={k.id} kreatif={k} />
      ))}
    </ul>
  );
}

function Kart({ kreatif }: { kreatif: KreatifPerformansi }) {
  const [gorselDustu, setGorselDustu] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);

  const metin = [kreatif.headline, kreatif.primaryText, kreatif.description]
    .filter((p): p is string => Boolean(p))
    .join('\n\n');

  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
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
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-ink">
            {platformKisaAdi(kreatif.platform)}
          </span>
          <span>
            <strong className="text-ink">%{kreatif.ctr.toFixed(2)}</strong> tıklama oranı
          </span>
          <span>{formatNumber(kreatif.impressions)} gösterim</span>
        </div>

        {kreatif.headline && (
          <p className="line-clamp-2 text-sm font-medium text-ink">{kreatif.headline}</p>
        )}
        {kreatif.primaryText && (
          <p className="line-clamp-3 text-xs text-ink-muted">{kreatif.primaryText}</p>
        )}

        <p className="mt-auto pt-1.5 text-[11px] text-ink-muted">
          {kreatif.adCount} reklamda kullanıldı · son gösterim {kreatif.sonGun}
        </p>

        {/*
          METNİ KOPYALA — görseli değil.
          Görseli kütüphaneye almak, platformun imzalı adresinden indirmeyi
          gerektiriyor ve o ayrı bir adım. Metin ise zaten bizde ve asıl
          değerli olan o: kullanıcı çalışan bir metni yeni kreatife
          yapıştırıp görselini kendi seçiyor.
        */}
        <button
          type="button"
          disabled={metin.length === 0}
          onClick={() => {
            void navigator.clipboard
              .writeText(metin)
              .then(() => setKopyalandi(true))
              .catch(() => setKopyalandi(false));
          }}
          className="mt-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
        >
          {kopyalandi ? 'Kopyalandı' : 'Metni kopyala'}
        </button>
      </div>
    </li>
  );
}
