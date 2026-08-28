'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { VARSAYILAN_SABLONLAR, varsayilanSablon } from '@advetics/shared';
import { Halka } from '@/components/yukleniyor';

/**
 * ═══ ŞABLON SEÇİCİ ═══
 *
 * Rapor tek bir biçimde üretiliyordu: Meta ve Google aynı belgede, kitle
 * kırılımı hiç yok. Ajans müşteriye çoğu zaman TEK PLATFORMUN raporunu
 * gönderiyor ve o raporda "kim tıkladı" sorusunun cevabı olması gerekiyor.
 *
 * SEÇİM URL'DE, bileşen durumunda değil. Sayfa sunucu bileşeni ve rapor
 * sunucuda üretiliyor; seçimi istemcide tutmak, seçtikten sonra veriyi
 * ikinci kez istemciden çekmek demekti. URL'de olması aynı zamanda
 * paylaşılabilir kılıyor — "şu raporun Google hâlini aç".
 *
 * DİĞER SÜZGEÇLER KORUNUYOR. Tarih aralığı ayrı parametrelerde ve elle
 * bağlantı kurmak onları düşürüyordu; mevcut arama dizesi kopyalanıp
 * yalnızca `sablon` değiştiriliyor.
 */
export function SablonSecici({ secili }: { secili: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [acik, setAcik] = useState(false);
  const [isPending, startTransition] = useTransition();
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent): void {
      if (!kutuRef.current?.contains(e.target as Node)) setAcik(false);
    }
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, []);

  const aktif = varsayilanSablon(secili);

  function sec(kod: string): void {
    setAcik(false);
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set('sablon', kod);
    /*
     * `replace`, `push` DEĞİL: şablon değiştirmek bir gezinme değil aynı
     * ekranın başka bir görünümü. Geri düğmesi kullanıcıyı bir önceki
     * şablona değil, geldiği sayfaya götürmeli.
     */
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  return (
    <div ref={kutuRef} className="relative">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={acik}
        className="flex min-w-[15rem] items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-ink">
            {aktif.ad}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            Rapor şablonu
          </span>
        </span>
        {isPending ? (
          <Halka className="h-3.5 w-3.5" />
        ) : (
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden>
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {acik && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-[22rem] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {VARSAYILAN_SABLONLAR.map((s) => (
            <button
              key={s.kod}
              type="button"
              role="option"
              aria-selected={s.kod === aktif.kod}
              onClick={() => sec(s.kod)}
              className={`block w-full px-3.5 py-2.5 text-left transition hover:bg-surface-muted ${
                s.kod === aktif.kod ? 'bg-surface-sunken' : ''
              }`}
            >
              <span className="block text-sm font-medium text-ink">{s.ad}</span>
              {/*
                AÇIKLAMA ŞART. "Google Ads Şablonu" tek başına neyin
                değiştiğini söylemiyor; kullanıcı seçip raporun yarısının
                kaybolduğunu görünce bunu bir arıza sanıyor.
              */}
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                {s.aciklama}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
