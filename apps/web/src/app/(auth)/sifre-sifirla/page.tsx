import { Suspense } from 'react';
import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { SifreSifirlaFormu } from '@/components/auth/sifre-sifirla-formu';

export const metadata = { title: 'Yeni şifre — Advetics' };

export default function SifreSifirlaPage() {
  return (
    <AuthKabuk
      baslik="Yeni şifre belirle"
      aciklama="Bağlantı bir kez kullanılabilir ve 60 dakika geçerli."
      altBaglanti={{ href: '/login', metin: '← Giriş ekranına dön' }}
    >
      {/* `useSearchParams` Suspense sınırı istiyor — `login/page.tsx` ile aynı desen. */}
      <Suspense fallback={<div className="h-48" />}>
        <SifreSifirlaFormu />
      </Suspense>
    </AuthKabuk>
  );
}
