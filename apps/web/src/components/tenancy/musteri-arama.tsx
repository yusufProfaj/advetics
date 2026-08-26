'use client';

import { useMemo, useState, type ReactNode } from 'react';

/**
 * ═══ MÜŞTERİ ARAMA — LİSTE SÜZGECİ ═══
 *
 * Müşteriler ekranı üç sütunlu bir kart ızgarası ve her kart uzun: hesaplar,
 * kanallar, ekip, özel reklam kategorisi. Sekiz müşteride bile aranan kart
 * ekranın dışında kalıyor ve kullanıcı kaydırarak arıyor.
 *
 * SÜZGEÇ İSTEMCİDE. Sunucuya `?q=` ile gitmek her tuş vuruşunda bir tur
 * demekti; liste zaten sayfa yüklenirken tamamen geliyor ve elli müşteride
 * bile süzmek gözle görülmez.
 *
 * KART İÇERİĞİ SUNUCUDAN GELİYOR (`icerik` bir React elemanı). Kartların
 * kendisini istemciye taşımak, içlerindeki sunucu tarafı veri çözümlerini de
 * taşımak olurdu; burada yalnızca HANGİ kartın görüneceğine karar veriliyor.
 */
export interface AranabilirKart {
  id: string;
  ad: string;
  slug: string;
  icerik: ReactNode;
}

export function MusteriArama({ kartlar }: { kartlar: AranabilirKart[] }) {
  const [arama, setArama] = useState('');

  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return kartlar;
    /*
     * TÜRKÇE KÜÇÜLTME AÇIKÇA VERİLİYOR. Varsayılan `toLowerCase()` "İ"yi
     * "i̇" (i + birleşen nokta) yapıyor ve "İkon" araması "ikon" ile
     * eşleşmiyor — Türkçe adlarda sessiz ve şaşırtıcı bir boş sonuç.
     */
    return kartlar.filter(
      (k) =>
        k.ad.toLocaleLowerCase('tr').includes(q) || k.slug.toLocaleLowerCase('tr').includes(q),
    );
  }, [kartlar, arama]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Müşteri adı ya da kısa adıyla ara…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm focus:border-brand focus:outline-none"
        />
        {/*
          SESSİZ KESME YOK: kaç kartın gösterildiği ve toplamın kaç olduğu
          yazılı. Süzülmüş bir liste, süzgeç görünmüyorsa "müşterilerin bir
          kısmı kaybolmuş" gibi okunuyor.
        */}
        {arama.trim() !== '' && (
          <span className="text-xs text-ink-muted">
            {suzulmus.length} / {kartlar.length} müşteri
          </span>
        )}
      </div>

      {suzulmus.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-ink-muted">
            “{arama}” ile eşleşen müşteri yok.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {suzulmus.map((k) => (
            <li key={k.id}>{k.icerik}</li>
          ))}
        </ul>
      )}
    </>
  );
}
