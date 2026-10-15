import { ikiDil } from '@advetics/shared';

/** Giriş ekranı, ortak kabuk ve şifre alanı (`components/auth`, `login-form`). */
export const girisSozlugu = ikiDil(
  {
    sayfaBasligi: 'Giriş · Advetics',
    baslik: 'Panele giriş yapın',
    aciklama: (platformlar: string) => `${platformlar} hesaplarınız tek yerde.`,
    kabukAlt: (platformlar: string) => `Advetics · ${platformlar} otomasyonu`,
    eposta: 'E-posta',
    sifre: 'Şifre',
    beniHatirla: 'Beni hatırla',
    sifremiUnuttum: 'Şifremi unuttum',
    hatirlamaNotu: 'Tarayıcıyı kapattığında oturumun kapanacak.',
    girisYapiliyor: 'Giriş yapılıyor…',
    girisYap: 'Giriş yap',
    baglantiYok: 'Bağlantı kurulamadı. API çalışıyor mu?',
    goster: 'Göster',
    gizle: 'Gizle',
  },
  {
    sayfaBasligi: 'Sign in · Advetics',
    baslik: 'Sign in to your panel',
    aciklama: (platformlar) => `Your ${platformlar} accounts in one place.`,
    kabukAlt: (platformlar) => `Advetics · ${platformlar} automation`,
    eposta: 'Email',
    sifre: 'Password',
    beniHatirla: 'Remember me',
    sifremiUnuttum: 'Forgot password',
    hatirlamaNotu: 'You will be signed out when you close the browser.',
    girisYapiliyor: 'Signing in…',
    girisYap: 'Sign in',
    baglantiYok: 'Could not connect. Is the API running?',
    goster: 'Show',
    gizle: 'Hide',
  },
);
