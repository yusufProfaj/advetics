import Link from 'next/link';
import type { Permission } from '@advetics/shared';
import {
  MM_BOLUMLERI,
  MM_VARLIKLARI,
  mmAdresi,
  type MmBolumKodu,
  type MmVarlikKodu,
} from './bolumler';

export type RozetTonu = 'tamam' | 'eksik' | 'notr';
export type BolumRozetleri = Partial<Record<MmBolumKodu, { metin: string; ton: RozetTonu }>>;

/**
 * Marka bölümünün alt başlıkları — sayfadaki kartlara ÇAPA. Bölüm tek
 * sayfada duruyor ve uzun; alt başlık, kullanıcıya hangi kartın nerede
 * olduğunu menüde söylüyor (taslaktaki "konum haritası").
 */
export const MARKA_ALT_BASLIKLARI = [
  { capa: 'marka-bilgileri', ad: 'Marka bilgileri' },
  { capa: 'bilgi', ad: 'Bilgi bankası' },
  { capa: 'logo', ad: 'Logo' },
] as const;

const ROZET: Record<RozetTonu, string> = {
  tamam: 'bg-ok-soft text-ok-strong',
  eksik: 'bg-warn-soft text-warn-strong',
  notr: 'bg-surface-sunken text-ink-muted',
};

/**
 * ═══ MARKA MERKEZİ'NİN İÇ MENÜSÜ — "NEREDEYİM" HER AN GÖRÜNÜR ═══
 *
 * Seçili bölüm vurgulu ve AÇIK: alt başlıkları altında listeleniyor. Durum
 * rozeti bölümün kendisinden geliyor ("5 bağlı", "2 eksik"); kullanıcı
 * hangi bölümde iş kaldığını bölümü açmadan görüyor.
 *
 * BAĞLANTI, DÜĞME DEĞİL: seçim adreste (`?bolum=`), sayfa sunucuda çiziliyor
 * ve geri tuşu bölümler arasında çalışıyor. Yetkisi olmayan bölüm listede
 * GÖSTERİLMİYOR — gidildiğinde zaten ilk görünür bölüme düşülüyor
 * (`bolumCoz`).
 *
 * Dar ekranda menü yatay kaydırılan bir şeride dönüşüyor; sayfa yatay
 * kaymıyor.
 */
export function IcMenu({
  clientId,
  aktif,
  varlik,
  izinler,
  rozetler,
}: {
  clientId: string;
  aktif: MmBolumKodu;
  varlik: MmVarlikKodu;
  izinler: readonly Permission[];
  rozetler: BolumRozetleri;
}) {
  const gorunen = MM_BOLUMLERI.filter((b) => izinler.includes(b.izin));
  return (
    <nav
      aria-label="Marka Merkezi bölümleri"
      className="-mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:p-2">
        {gorunen.map((b) => {
          const secili = b.kod === aktif;
          const rozet = rozetler[b.kod];
          return (
            <li key={b.kod} className="shrink-0">
              <Link
                href={mmAdresi(clientId, b.kod)}
                aria-current={secili ? 'page' : undefined}
                className={`flex transition-colors items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  secili
                    ? 'bg-brand-soft font-semibold text-brand-strong'
                    : 'font-medium text-ink hover:bg-surface-sunken/70'
                }`}
              >
                <span>{b.ad}</span>
                {rozet && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROZET[rozet.ton]}`}>
                    {rozet.metin}
                  </span>
                )}
              </Link>
              {/* ALT BAŞLIKLAR YALNIZCA SEÇİLİ BÖLÜMDE ve yalnızca geniş ekranda:
                  dar ekranda yatay şeridi ikinci bir satıra bölmek okunmazdı. */}
              {secili && b.kod === 'marka' && (
                <ul className="mb-1 ml-3 mt-0.5 hidden border-l-2 border-line pl-2 lg:block">
                  {MARKA_ALT_BASLIKLARI.map((a) => (
                    <li key={a.capa}>
                      <a
                        href={`#${a.capa}`}
                        className="block rounded-md px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
                      >
                        {a.ad}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {secili && b.kod === 'varliklar' && (
                <ul className="mb-1 ml-3 mt-0.5 hidden border-l-2 border-line pl-2 lg:block">
                  {MM_VARLIKLARI.map((v) => (
                    <li key={v.kod}>
                      <Link
                        href={mmAdresi(clientId, 'varliklar', { varlik: v.kod })}
                        aria-current={v.kod === varlik ? 'page' : undefined}
                        className={`block rounded-md px-2 py-1.5 text-sm ${
                          v.kod === varlik ? 'font-semibold text-brand-strong' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {v.ad}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
