'use client';

import { useEffect, useRef } from 'react';
import { dilMi } from '@advetics/shared';
import { useDil } from './saglayici';

/**
 * PROFİL > ÇEREZ (docs/i18n/MIMARI.md §2). Giriş yapmış kişinin dili
 * profilinde; Hesabım'dan BAŞKA cihazda değiştirdiyse bu cihazın çerezi
 * eskidir. Fark görülünce çerez profile eşitlenir ve ekran bir kez yeniden
 * çizilir. Profil bu cihazda giriş anında zaten çerezden yazıldığı için
 * (`dil/profil.ts`) burada fark yalnız başka cihazdaki değişiklikte çıkar.
 * Bozuk profil değeri (`users.locale` eski bir sürümden `tr-TR` gibi)
 * YOK sayılır: çerez kalır, sonsuz yenileme döngüsü olmaz.
 */
export function DilEsitle({ profil }: { profil: string | null | undefined }) {
  const { dil, degistir } = useDil();
  const yapildi = useRef(false);
  useEffect(() => {
    if (yapildi.current || !dilMi(profil) || profil === dil) return;
    yapildi.current = true;
    void degistir(profil);
  }, [profil, dil, degistir]);
  return null;
}
