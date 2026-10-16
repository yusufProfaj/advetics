'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { useSozluk } from '@/dil/saglayici';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

/**
 * KREATİF GÖRSELİ — YÜKLENMEZSE TAZELE, O DA OLMAZSA SEBEBİNİ YAZ.
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
 *
 * ═══ YEDEK UÇ (2026-10-14) ═══
 *
 * Yer tutucu yetmedi: Meta kreatif adresi birkaç günde öldüğü için Reklam
 * Yöneticisi önizlemelerinin çoğu "görsel alınamadı" diyordu (kullanıcı:
 * *"reklam önizlemelerinde de problem oluyor"*). `yedekYol` verilirse
 * saklanan adres düşünce sunucunun kullanım anında tazeleyen ucuna BİR KEZ
 * gidiliyor (blob, çerezle). Önce saklanan adres: çoğu taze ve platforma
 * gitmek kota harcıyor; uç yalnız kırık görsel başına çağrılıyor.
 * Uç da düşerse SUNUCUNUN CÜMLESİ yazıyor ("Görsel alınamadı: kota
 * engeli…"); "alınamadı" ile "yükleniyor" aynı kutu değil.
 */
export type TazeGorselHali = { tur: 'adres'; src: string } | { tur: 'tazeleniyor' } | { tur: 'blob'; src: string } | { tur: 'hata'; mesaj: string };

/**
 * ORTAK KARAR: saklanan adres → düşerse yedek uç (bir kez) → o da düşerse
 * sunucunun cümlesi. Reklam kartı (`KreatifGorsel`) ve Akıllı Boost kartı
 * aynı hook'u kullanıyor; ikinci bir kopya doğduğu anda biri "bir kez"
 * korumasını ya da geç yanıt korumasını unutur.
 */
export function useTazeGorsel(src: string | null, yedekYol: string | undefined, bosMetin: string) {
  const baslangic = (): TazeGorselHali => (src ? { tur: 'adres', src } : yedekYol ? { tur: 'tazeleniyor' } : { tur: 'hata', mesaj: bosMetin });
  const g = useSozluk(reklamYoneticisiSozlugu).gorsel;
  const [hal, setHal] = useState<TazeGorselHali>(baslangic);
  // Her yeni kaynakta artar; geç gelen eski yanıt yeni kartın üstüne yazılmasın.
  const nesil = useRef(0);

  // Kart başka içeriğe geçtiyse baştan: eski içeriğin blob'u yenisinin yerine çizilmesin.
  // Saklanan adres YOKSA yedek uç hemen çağrılıyor.
  useEffect(() => {
    nesil.current++;
    setHal(baslangic());
    if (!src && yedekYol) void tazele(yedekYol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, yedekYol]);
  useEffect(() => {
    if (hal.tur !== 'blob') return;
    return () => URL.revokeObjectURL(hal.src);
  }, [hal]);

  async function tazele(yol: string) {
    const benim = nesil.current;
    const yaz = (h: TazeGorselHali) => {
      if (nesil.current !== benim) {
        if (h.tur === 'blob') URL.revokeObjectURL(h.src);
        return;
      }
      setHal(h);
    };
    setHal({ tur: 'tazeleniyor' });
    try {
      const r = await fetch(`${API_URL}${yol}`, { credentials: 'include' });
      if (!r.ok) {
        let mesaj = g.http(r.status);
        try {
          const g = (await r.json()) as { message?: string };
          if (g?.message) mesaj = g.message;
        } catch {
          /* gövde JSON değil: durum kodlu cümle kalıyor */
        }
        yaz({ tur: 'hata', mesaj });
        return;
      }
      yaz({ tur: 'blob', src: URL.createObjectURL(await r.blob()) });
    } catch {
      yaz({ tur: 'hata', mesaj: g.sunucuYok });
    }
  }

  function dustu() {
    if (hal.tur === 'adres' && yedekYol) void tazele(yedekYol);
    else setHal({ tur: 'hata', mesaj: hal.tur === 'blob' ? g.cizilemedi : bosMetin });
  }

  return { hal, dustu };
}

export function KreatifGorsel({
  src,
  alt,
  bosMetin,
  yedekYol,
}: {
  /** Saklanan adres; yoksa (senkronda gelmemiş) doğrudan yedek uca gidilir. */
  src: string | null;
  alt: string;
  /** Yüklenemediğinde (yedek yoksa) yazılacak cümle. "görsel yok" ile aynı OLMAMALI. */
  bosMetin: string;
  /** Kullanım anında tazeleyen API yolu (`/ads/:id/gorsel`); saklanan adres düşerse bir kez denenir. */
  yedekYol?: string;
}) {
  const g = useSozluk(reklamYoneticisiSozlugu).gorsel;
  const { hal, dustu } = useTazeGorsel(src, yedekYol, bosMetin);

  if (hal.tur === 'hata' || hal.tur === 'tazeleniyor') {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-ink-muted" aria-busy={hal.tur === 'tazeleniyor'}>
        {hal.tur === 'hata' ? hal.mesaj : g.yenileniyor}
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={hal.src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={dustu}
      className="h-full w-full object-contain"
    />
  );
}
