'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DIL_CEREZI,
  DIL_CEREZI_SURESI_SN,
  sec,
  zodHataDiliniAyarla,
  type Dil,
  type IkiDil,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { dilDegisinceYol } from '@/lib/site-yollari';

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
 * TAM yükleniyor (`degistir` içindeki yorum): yalnız istemci durumunu
 * çevirmek ekranı yarı yarıya iki dilde bırakırdı ve canlıda bıraktı.
 */
export function DilSaglayici({ dil: ilk, children }: { dil: Dil; children: ReactNode }) {
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
      /*
       * ÖNCE PROFİL, SONRA ÇEREZ, SONRA TAM YÜKLEME — istemci durumu ARA
       * ADIMDA DEĞİŞMİYOR. Canlıda (2026-10-16) önce `setDil(yeni)` yapılıyordu:
       * istemci parçaları hemen yeni dile dönüyor, sunucu parçaları (menü,
       * başlık) eski dilde kalıyor ve `DilEsitle` o arada eski profili görüp
       * dili GERİ ÇEVİRİYORDU. Telefonda Hesabım'da English seçen kişi
       * sayfayı Türkçe ve seçiciyi "Türkçe" gördü. Profil yazılamazsa HATA
       * FIRLATILIYOR ve hiçbir şey değişmiyor (çağıran gösterir); yarım
       * değişmiş bir ekran bırakılmıyor.
       */
      if (secenek?.profileYaz) {
        await apiFetch('/auth/locale', { method: 'PATCH', body: JSON.stringify({ locale: yeni }) });
      }
      dilCereziYaz(yeni);
      // SİTE SAYFASINDA KARŞI DİLDEKİ ADRESE GİT: `/gizlilik`te English
      // seçen kişi `/en/privacy`ye. Yalnız yenilemek Türkçe adreste kalmak,
      // middleware'in onu bir sonraki tıklamada yönlendirmesini beklemek ve
      // paylaştığı bağlantının yanlış dilde açılması demekti.
      //
      // TAM SAYFA YÜKLEMESİ, `router.replace` DEĞİL: istemci tarafı geçişte
      // Next ortak yerleşimi (üst menü, alt bilgi) YENİDEN ÇİZMİYOR; `/`dan
      // `/en`e geçen kişi İngilizce sayfayı Türkçe menüyle görüyordu
      // (yerelde gözle, D1). Aynı adreste de TAM YÜKLEME: `router.refresh()`
      // sunucu parçalarını gecikmeli çiziyordu ve ara durum iki dilliydi.
      const hedef = dilDegisinceYol(location.pathname, yeni);
      if (hedef !== location.pathname) location.assign(hedef + location.search + location.hash);
      else location.reload();
    },
    [],
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
