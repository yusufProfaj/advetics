import { Suspense } from 'react';
import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { SifreSifirlaFormu } from '@/components/auth/sifre-sifirla-formu';
import { sozluk } from '@/dil/sunucu';
import { girisSozlugu } from '@/dil/sozlukler/giris';

export async function generateMetadata() {
  return { title: (await sozluk(girisSozlugu)).sifirla.sayfaBasligi };
}

export default async function SifreSifirlaPage() {
  const d = await sozluk(girisSozlugu);
  return (
    <AuthKabuk
      baslik={d.sifirla.baslik}
      aciklama={d.sifirla.aciklama}
      altBaglanti={{ href: '/login', metin: d.girisEkraninaDon }}
    >
      {/* `useSearchParams` Suspense sınırı istiyor — `login/page.tsx` ile aynı desen. */}
      <Suspense fallback={<div className="h-48" />}>
        <SifreSifirlaFormu />
      </Suspense>
    </AuthKabuk>
  );
}
