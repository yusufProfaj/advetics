import { AuthKabuk } from '@/components/auth/auth-kabuk';
import { SifremiUnuttumFormu } from '@/components/auth/sifremi-unuttum-formu';
import { sozluk } from '@/dil/sunucu';
import { girisSozlugu } from '@/dil/sozlukler/giris';

export async function generateMetadata() {
  return { title: (await sozluk(girisSozlugu)).unuttum.sayfaBasligi };
}

export default async function SifremiUnuttumPage() {
  const d = await sozluk(girisSozlugu);
  return (
    <AuthKabuk
      baslik={d.unuttum.baslik}
      aciklama={d.unuttum.aciklama}
      altBaglanti={{ href: '/login', metin: d.girisEkraninaDon }}
    >
      <SifremiUnuttumFormu />
    </AuthKabuk>
  );
}
