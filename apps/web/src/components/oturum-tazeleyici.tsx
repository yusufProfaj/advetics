'use client';

import { useEffect } from 'react';
import { API_URL } from '@/lib/api';

/**
 * ═══ OTURUMU AYAKTA TUTAN BİLEŞEN ═══
 *
 * BULUNAN ARIZA: kullanıcı giriş yaptıktan tam 15 dakika sonra panelden
 * atılıyordu. Sebep tek bir eksik çağrıydı:
 *
 *   · `JWT_ACCESS_TTL` varsayılanı `15m` ve access cookie'sinin `maxAge`'i de
 *     ona eşit — yani 15 dakika sonra cookie TARAYICIDAN SİLİNİYOR.
 *   · `middleware.ts` yalnızca cookie'nin VARLIĞINA bakıyor; bulamayınca
 *     doğrudan `/login`'e yönlendiriyor.
 *   · API'de `POST /auth/refresh` VAR, çalışıyor ve 30 günlük refresh
 *     token'ı bekliyordu — ama panelde onu çağıran TEK BİR SATIR YOKTU.
 *
 * Yani 30 günlük oturum altyapısı kuruluydu ve hiç kullanılmıyordu.
 *
 * ─── NEDEN TARAYICIDA, MIDDLEWARE'DE DEĞİL ───
 *
 * Refresh cookie'si `path=/api/auth` ile sınırlı (uzun ömürlü token her
 * istekte taşınmasın diye — doğru bir karar). Next.js middleware panelin
 * kendi yollarında çalışıyor (`/dashboard`, `/ayarlar/...`) ve tarayıcı o
 * yollara refresh cookie'sini GÖNDERMİYOR. Middleware onu okuyamıyor,
 * dolayısıyla yenilemeyi oradan yapmak fiziksel olarak mümkün değil.
 * Sunucu bileşenleri de render sırasında cookie YAZAMIYOR (Next.js kısıtı).
 * Geriye tek yer kalıyor: tarayıcı.
 *
 * ─── NEDEN KİLİT GEREKİYOR ───
 *
 * `token.service.ts` rotasyon uyguluyor VE YENİDEN KULLANIM TESPİTİ yapıyor:
 * iptal edilmiş bir refresh token ikinci kez sunulursa `reuse_detected` ile
 * BÜTÜN AİLE iptal ediliyor. İki sekme aynı anda yenilemeye kalkarsa ikisi de
 * aynı token'ı gönderiyor; ilki döndürüyor, ikincisi artık iptal olmuş
 * token'ı sunuyor ve kullanıcı HER YERDEN atılıyor.
 *
 * Yani naif bir "her sekmede zamanlayıcı" çözümü, düzeltmeye çalıştığı
 * hatanın daha kötüsünü üretirdi. `navigator.locks` origin genelinde gerçek
 * bir mutex veriyor; kilidin İÇİNDE zaman damgası da kontrol ediliyor, çünkü
 * kilidi sırayla alan iki sekmeden ikincisinin yeniden yenilemesi gereksiz.
 */

/** Yenileme aralığı — access TTL 15 dakika, 5 dakika pay bırakıyoruz. */
const ARALIK_MS = 10 * 60 * 1000;

/** Bu süre içinde yenilenmişse tekrar yenilenmiyor (sekmeler arası). */
const ESIK_MS = 5 * 60 * 1000;

const ANAHTAR = 'advetics.oturum.sonYenileme';
const KILIT = 'advetics-oturum-yenileme';

async function yenilemeyiDene(): Promise<void> {
  const govde = async (): Promise<void> => {
    const son = Number(window.localStorage.getItem(ANAHTAR) ?? 0);
    // KİLİDİN İÇİNDE KONTROL: sırayla kilide giren ikinci sekmenin tekrar
    // yenilemesi gereksiz ve rotasyonu boşuna ilerletirdi.
    if (Date.now() - son < ESIK_MS) return;

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) {
      /*
       * SESSİZCE VAZGEÇİLİYOR ve bu bilinçli. Refresh token gerçekten
       * süresi dolmuş ya da iptal edilmiş olabilir; o hâlde kullanıcının
       * yeniden giriş yapması DOĞRU davranış ve bir sonraki gezinme onu
       * zaten `/login`'e götürüyor. Burada uyarı basmak, oturumu biten
       * herkese anlamsız bir hata kutusu göstermek olurdu.
       *
       * Zaman damgası GÜNCELLENMİYOR: başarısız bir denemeyi başarılı
       * saymak, gerçekten yenilenebilecek bir anı atlamak demek.
       */
      return;
    }

    window.localStorage.setItem(ANAHTAR, String(Date.now()));
  };

  // Web Locks desteklenmeyen tarayıcıda zaman damgası tek başına kalıyor:
  // yarış penceresi milisaniyeler ve mevcut davranıştan (15 dakikada kesin
  // çıkış) her hâlükârda iyi.
  if ('locks' in navigator) {
    await navigator.locks.request(KILIT, govde);
  } else {
    await govde();
  }
}

export function OturumTazeleyici() {
  useEffect(() => {
    // AÇILIŞTA HEMEN BİR DENEME: sekme uzun süre kapalı kaldıysa ilk
    // gezinmeden önce token tazelenmiş olmalı.
    void yenilemeyiDene();

    const id = window.setInterval(() => void yenilemeyiDene(), ARALIK_MS);

    /*
     * SEKMEYE GERİ DÖNÜNCE DE YENİLENİYOR. Arka plana atılmış sekmelerde
     * tarayıcılar zamanlayıcıları kısıyor (bazıları dakikada bire kadar);
     * yalnızca `setInterval`'a güvenmek, bir saat sonra sekmeye dönen
     * kullanıcının yine atılması demekti.
     */
    const onGorunur = (): void => {
      if (document.visibilityState === 'visible') void yenilemeyiDene();
    };
    document.addEventListener('visibilitychange', onGorunur);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onGorunur);
    };
  }, []);

  return null;
}
