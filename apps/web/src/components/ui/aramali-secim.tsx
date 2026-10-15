'use client';

import { useSozluk } from '@/dil/saglayici';
import { uiSozlugu } from '@/dil/sozlukler/ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { gosterilenKimlik, secenekSuz, vurguParcalari, type AranabilirSecenek } from '@/lib/secenek-arama';
import { Girdi } from './alan';

/**
 * ═══ ARAMALI SEÇİCİ (Kurulum › mevcut hesap / mülk / sayfa / piksel) ═══
 *
 * Düz `<select>` yüzlerce satırda işe yaramıyordu: Analytics mülkleri
 * ajansın erişebildiği bütün müşterilerden geliyor ve doğru mülkü bulmak
 * için listeyi gözle taramak gerekiyordu. Arama kutusu + eşleşenlerin
 * listesi; kural `lib/secenek-arama.ts`te (metnin İÇİNDE geçen, Türkçe
 * katlamalı, kimlikte tire yok sayılır).
 *
 * SESSİZ KESME YOK: kaç satırın gösterildiği ve toplamın kaç olduğu her
 * zaman yazıyor; eşleşme yoksa aranan metin cümlenin içinde.
 *
 * Erişilebilirlik: combobox + listbox deseni. Odak hep kutuda kalıyor, ok
 * tuşları etkin satırı `aria-activedescendant` ile taşıyor, Enter seçiyor.
 * Satırlar `<button>` değil `role="option"`: listede yüzlerce sekme durağı
 * olsaydı klavyeyle kutudan "Bunu kullan"a ulaşmak yüzlerce Tab demekti.
 */
export function AramaliSecim({
  secenekler,
  deger,
  onDegis,
  etiket,
  yerTutucu,
}: {
  secenekler: readonly AranabilirSecenek[];
  /** Seçili satırın `deger`i; seçim yoksa ''. */
  deger: string;
  onDegis: (deger: string) => void;
  /** Ekran okuyucu etiketi (görünür başlık çağıranda). */
  etiket: string;
  yerTutucu?: string;
}) {
  const [arama, setArama] = useState('');
  const d = useSozluk(uiSozlugu);
  const [etkin, setEtkin] = useState(0);
  const liste = useId();
  const listeRef = useRef<HTMLUListElement>(null);
  const gorunen = useMemo(() => secenekSuz(secenekler, arama), [secenekler, arama]);
  const secili = secenekler.find((s) => s.deger === deger) ?? null;

  // Arama değişince etkin satır başa döner; eski konum yeni listede başka satırdır.
  useEffect(() => setEtkin(0), [arama]);
  useEffect(() => {
    listeRef.current?.querySelector(`[data-sira="${etkin}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [etkin]);

  const satirId = (i: number) => `${liste}-${i}`;

  function tus(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setEtkin((i) => Math.min(i + 1, gorunen.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setEtkin((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Form gönderimini durdur: Enter bu kutuda yalnız satır seçer.
      e.preventDefault();
      const s = gorunen[etkin];
      if (s) onDegis(s.deger);
    }
  }

  return (
    <div className="grid gap-1.5">
      <Girdi
        type="search"
        role="combobox"
        aria-label={etiket}
        aria-controls={liste}
        aria-expanded
        aria-autocomplete="list"
        aria-activedescendant={gorunen.length ? satirId(etkin) : undefined}
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        onKeyDown={tus}
        placeholder={yerTutucu ?? d.aramaYerTutucu}
        autoComplete="off"
      />
      <p className="m-0 text-12 text-ink-muted" aria-live="polite">
        {arama.trim() ? d.sonucSayisi(gorunen.length, secenekler.length) : d.secenekSayisi(secenekler.length)}
        {secili && (
          <>
            {' · '}Seçili: <b className="text-ink">{secili.etiket}</b>
          </>
        )}
      </p>
      {gorunen.length === 0 ? (
        <p className="m-0 rounded-alan border border-line px-3 py-2 text-12 text-ink-muted">{d.secenekYok(arama.trim())}</p>
      ) : (
        <ul
          ref={listeRef}
          id={liste}
          role="listbox"
          aria-label={etiket}
          className="m-0 max-h-64 list-none overflow-y-auto rounded-alan border border-line p-1"
        >
          {gorunen.map((s, i) => {
            const v = vurguParcalari(s.etiket, arama);
            const sec = s.deger === deger;
            const kimlik = gosterilenKimlik(s.deger);
            return (
              <li
                key={s.deger}
                id={satirId(i)}
                data-sira={i}
                role="option"
                aria-selected={sec}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setEtkin(i)}
                onClick={() => onDegis(s.deger)}
                className={`flex cursor-pointer items-start gap-2 rounded-alan px-2.5 py-2 text-13 ${
                  i === etkin ? 'bg-surface-sunken' : ''
                } ${sec ? 'font-semibold' : ''}`}
              >
                <span aria-hidden className={`mt-0.5 w-3 shrink-0 text-brand-strong ${sec ? '' : 'invisible'}`}>
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block break-words text-ink">
                    {v ? (
                      <>
                        {v.once}
                        <mark className="bg-transparent font-bold text-ink underline decoration-brand decoration-2 underline-offset-2">{v.eslesen}</mark>
                        {v.sonra}
                      </>
                    ) : (
                      s.etiket
                    )}
                  </span>
                  {(s.not || kimlik) && (
                    <span className="block break-words text-12 font-normal text-ink-muted">
                      {[s.not, kimlik].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
