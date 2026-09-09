import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { SifremiUnuttumFormu } from '@/components/auth/sifremi-unuttum-formu';

export const metadata = { title: 'Şifremi unuttum — Advetics' };

export default function SifremiUnuttumPage() {
  return (
    <AuthKabuk
      baslik="Şifreni sıfırla"
      aciklama="E-posta adresine bir sıfırlama bağlantısı gönderelim."
      altBaglanti={{ href: '/login', metin: '← Giriş ekranına dön' }}
    >
      <SifremiUnuttumFormu />
    </AuthKabuk>
  );
}
