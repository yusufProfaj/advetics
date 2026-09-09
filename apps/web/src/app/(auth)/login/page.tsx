import { Suspense } from 'react';
import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { LoginForm } from '@/components/login-form';

export const metadata = { title: 'Giriş — Advetics' };

export default function LoginPage() {
  return (
    <AuthKabuk baslik="Panele giriş yapın" aciklama="Meta ve Google Ads hesaplarınız tek yerde.">
      <Suspense fallback={<div className="h-64" />}>
        <LoginForm />
      </Suspense>
    </AuthKabuk>
  );
}
