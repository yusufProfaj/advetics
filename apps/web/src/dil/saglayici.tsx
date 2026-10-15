'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DIL_CEREZI,
  DIL_CEREZI_SURESI_SN,
  sec,
  zodHataDiliniAyarla,
  type Dil,
  type IkiDil,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';

type DilBaglami = {
  dil: Dil;
  /** Seçimi çereze yazar, oturum varsa profile de yazar ve ekranı yeniden çizer. */
  degistir: (yeni: Dil, secenek?: { profileYaz?: boolean }) => Promise<void>;
};

const Baglam = createContext<DilBaglami | null>(null);

/** Tarayıcıda çerez yazımı. `Secure` yalnız https'te: yerelde http ile çerez hiç yazılmazdı. */
export function dilCereziYaz(dil: Dil): void {
  const guvenli = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${DIL_CEREZI}=${dil}; Path=/; Max-Age=${DIL_CEREZI_SURESI_SN}; SameSite=Lax${guvenli}`;
}

/**
 * KÖK SAĞLAYICI. Değer sunucunun okuduğu çerezden gelir (`dilDurumu`), yani
 * ilk boyamada sunucu ile istemci AYNI dili çizer. Değiştirince sayfa
 * `router.refresh()` ile yeniden çiziliyor: sunucu bileşenleri de yeni dili
 * görmeli, yalnız istemci durumunu çevirmek ekranı yarı yarıya iki dilde
 * bırakırdı.
 */
export function DilSaglayici({ dil: ilk, children }: { dil: Dil; children: ReactNode }) {
  const router = useRouter();
  const [dil, setDil] = useState<Dil>(ilk);

  // Sunucu başka bir dil çizdiyse (başka sekmede değişti, Hesabım'dan geldi) ona uy.
  useEffect(() => setDil(ilk), [ilk]);

  // Zod mesajları istemci doğrulamasında (giriş formu) da dile uysun.
  useEffect(() => {
    zodHataDiliniAyarla(dil);
    document.documentElement.lang = dil;
  }, [dil]);

  const degistir = useCallback<DilBaglami['degistir']>(
    async (yeni, secenek) => {
      dilCereziYaz(yeni);
      setDil(yeni);
      if (secenek?.profileYaz) {
        // HATA YUTULMUYOR: profil yazılamazsa çağıran gösterir; çerez yine de
        // yazıldı, yani bu cihazda seçim geçerli.
        await apiFetch('/auth/locale', { method: 'PATCH', body: JSON.stringify({ locale: yeni }) });
      }
      router.refresh();
    },
    [router],
  );

  return <Baglam.Provider value={{ dil, degistir }}>{children}</Baglam.Provider>;
}

export function useDil(): DilBaglami {
  const b = useContext(Baglam);
  // Sağlayıcı kök yerleşimde; yoksa bu bir kurulum hatası ve SESSİZCE
  // Türkçe'ye düşmek onu gizlerdi.
  if (!b) throw new Error('useDil: DilSaglayici bulunamadı (app/layout.tsx)');
  return b;
}

/** `const d = useSozluk(girisSozlugu)` — istemci bileşeni için. */
export function useSozluk<T>(s: IkiDil<T>): T {
  return sec(s, useDil().dil);
}
