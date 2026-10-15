'use client';

import { useEffect, useState } from 'react';
import { MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { TEMA_ANAHTARI } from '@/lib/tema';
import { useSozluk } from '@/dil/saglayici';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/**
 * ═══ TEMA SEÇİMİ (menü kararı 2026-10-14: kullanıcı kartında "Tema") ═══
 *
 * Panel karanlık temayı yalnız işletim sisteminden alıyordu; açık
 * bilgisayarda koyu panel isteyen (ya da tersi) bir şey yapamıyordu.
 * Üç hâl: Sistem (varsayılan, `data-theme` yok) → Açık → Koyu. Seçim
 * `<html data-theme>` ile uygulanıyor; `globals.css` iki yolu da
 * (`prefers-color-scheme` ve `data-theme`) aynı değerlerle karşılıyor.
 *
 * TARAYICIDA SAKLANIYOR (kişisel kolaylık, paylaşılan bir durum değil).
 * Okuma ve yazma try/catch içinde: gizli pencerede ya da site verisi
 * engelliyken `localStorage` istisna atıyor ve tema seçimi yüzünden menü
 * çökmemeli. İlk boyamadan önce uygulayan betik kök düzende (`TEMA_BETIGI`),
 * yoksa koyu seçen kullanıcı her sayfa açılışında bir kare açık tema görürdü.
 */
export type Tema = 'sistem' | 'acik' | 'koyu';

const SIRADAKI: Record<Tema, Tema> = { sistem: 'acik', acik: 'koyu', koyu: 'sistem' };

function uygula(t: Tema): void {
  const kok = document.documentElement;
  if (t === 'sistem') delete kok.dataset.theme;
  else kok.dataset.theme = t === 'acik' ? 'light' : 'dark';
  try {
    if (t === 'sistem') localStorage.removeItem(TEMA_ANAHTARI);
    else localStorage.setItem(TEMA_ANAHTARI, t);
  } catch {
    // Saklanamadıysa seçim bu sayfa açık kaldıkça geçerli; sessiz değil, ekranda görünüyor.
  }
}

export function TemaOgesi() {
  const [tema, setTema] = useState<Tema>('sistem');
  const d = useSozluk(kabukSozlugu).kullanici;
  const AD: Record<Tema, string> = { sistem: d.temaSistem, acik: d.temaAcik, koyu: d.temaKoyu };
  useEffect(() => {
    const d = document.documentElement.dataset.theme;
    setTema(d === 'light' ? 'acik' : d === 'dark' ? 'koyu' : 'sistem');
  }, []);
  return (
    <MenuOgesi
      ikon={<Ikon ad="tema" />}
      ip={AD[tema]}
      onClick={() => {
        const yeni = SIRADAKI[tema];
        uygula(yeni);
        setTema(yeni);
      }}
    >
      {d.tema}
    </MenuOgesi>
  );
}
