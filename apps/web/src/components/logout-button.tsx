'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { useSozluk } from '@/dil/saglayici';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/**
 * Kullanıcı menüsündeki "Çıkış yap" (menü kararı 2026-10-14): tehlikeli
 * eylem, menünün EN ALTINDA, ayraçtan sonra ve kırmızı (eski ad kartının
 * yanındaki çıkış ikonunun yerine).
 *
 * İSTEK DÜŞSE BİLE GİRİŞ SAYFASINA GİDİLİYOR: sunucu tarafı iptal başarısız
 * olsa bile ekranda takılı kalmaktansa çerezsiz devam etmek daha iyi. Hata
 * yutulmuyor, konsola yazılıyor.
 */
export function CikisOgesi() {
  const d = useSozluk(kabukSozlugu).kullanici;
  const router = useRouter();
  return (
    <MenuOgesi
      tehlike
      ikon={<Ikon ad="cikis" />}
      onClick={() => {
        void apiFetch('/auth/logout', { method: 'POST' })
          .catch((e: unknown) => {
            // Oturum sunucuda zaten ölmüş olabilir; giriş sayfası yine doğru yer.
            console.warn('Çıkış isteği düştü', e);
          })
          .finally(() => {
            router.replace('/login');
            router.refresh();
          });
      }}
    >
      {d.cikis}
    </MenuOgesi>
  );
}
