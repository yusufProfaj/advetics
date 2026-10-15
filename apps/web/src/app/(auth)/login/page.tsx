import { Suspense } from 'react';
import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { LoginForm } from '@/components/login-form';
import { platformListesi } from '@/lib/platform-listesi';
import { dilAl, sozluk } from '@/dil/sunucu';
import { girisSozlugu } from '@/dil/sozlukler/giris';

export async function generateMetadata() {
  return { title: (await sozluk(girisSozlugu)).sayfaBasligi };
}

export default async function LoginPage() {
  const dil = await dilAl();
  const d = await sozluk(girisSozlugu);
  return (
    <AuthKabuk baslik={d.baslik} aciklama={d.aciklama(platformListesi(dil))}>
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm />
      </Suspense>
    </AuthKabuk>
  );
}
