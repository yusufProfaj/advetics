import Link from 'next/link';
import type { ReactNode } from 'react';
import { platformListesi } from '@/lib/platform-listesi';
import { AdveticsLogo } from '@/components/advetics-logo';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';

/**
 * Oturum ekranlarının ORTAK KABUĞU — giriş, şifremi unuttum, şifre sıfırlama.
 *
 * Üç sayfanın da aynı markup'ı kendi içinde taşıması, ilk gerekli değişiklikte
 * (logo, başlık, dip not) ikisinin güncellenip birinin unutulması demekti;
 * fark yalnızca o sayfaya düşen kullanıcıya görünür ve kimse bildirmez.
 */
export function AuthKabuk({
  baslik,
  aciklama,
  children,
  altBaglanti,
}: {
  baslik: string;
  aciklama: string;
  children: ReactNode;
  /** Kart altındaki dönüş bağlantısı. Giriş ekranında yok. */
  altBaglanti?: { href: string; metin: string };
}) {
  /*
   * PANELİN DİLİ (BILESENLER): gri zemin, beyaz gölgesiz kart, başlık
   * `SayfaBasligi` (Montserrat, menüdeki başlıklarla aynı boy). Eskiden
   * ortalanmış elle bir `h1` ve gölgeli kart vardı; kullanıcı girişten
   * panele geçince yazı tipinin ve kartın değiştiğini görüyordu.
   * İŞLEYİŞ AYNI: bu kabuk yalnız yerleşim, formlar kendi dosyalarında.
   */
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      <div className="grid w-full max-w-sm gap-6">
        {/* MARKA KENAR ÇUBUĞUYLA AYNI BİLEŞENDEN. Burada elle çizilmiş bir
            "A" kutusu duruyordu ve logo yenilendiğinde unutuldu: kullanıcı
            panelde yeni işareti, girişte eskisini görüyordu. */}
        <div className="flex">
          <AdveticsLogo />
        </div>

        <SayfaBasligi baslik={baslik} aciklama={aciklama} />

        <Kart>{children}</Kart>

        {altBaglanti && (
          <p className="m-0 text-14">
            <Link href={altBaglanti.href} className={KART_BAGLANTISI}>
              {altBaglanti.metin}
            </Link>
          </p>
        )}

        <p className="m-0 text-12 text-ink-muted">Advetics · {platformListesi()} otomasyonu</p>
      </div>
    </main>
  );
}
