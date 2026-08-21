'use client';

import { useState } from 'react';

/**
 * KREATİF GÖRSELİ — YÜKLENMEZSE YER TUTUCU.
 *
 * `'use client'` ZORUNLU ve sebebi somut: `onError` bir olay dinleyicisi ve
 * sunucu bileşenine bağlanamıyor. Kart bir süre sunucu bileşeniydi ve
 * `<img>` çıplak duruyordu; hem şemanın hem bileşenin yorumu "yüklenemezse
 * yer tutucu göster, kırık resim ikonu panelin bozuk olduğu izlenimi verir"
 * diyordu ama kod bunu YAPMIYORDU — yorum, yapılanı değil yapılmasını
 * istediğimizi anlatıyordu.
 *
 * Platform CDN adresleri gerçekten ölüyor (şema yorumu: "SÜRESİ
 * DOLABİLİYOR"), yani bu yol istisna değil normal bir hâl.
 */
export function KreatifGorsel({
  src,
  alt,
  bosMetin,
}: {
  src: string;
  alt: string;
  /** Yüklenemediğinde yazılacak cümle. "görsel yok" ile aynı OLMAMALI. */
  bosMetin: string;
}) {
  const [dustu, setDustu] = useState(false);

  if (dustu) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-ink-muted">
        {bosMetin}
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setDustu(true)}
      className="h-full w-full object-contain"
    />
  );
}
