import Link from 'next/link';
import type { ReactNode } from 'react';
import { platformListesi } from '@/lib/platform-listesi';
import { AdveticsLogo } from '@/components/advetics-logo';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';
import { DilAnahtari } from '@/components/ui/dil-secimi';
import { dilAl } from '@/dil/sunucu';
import { sec } from '@advetics/shared';
import { girisSozlugu } from '@/dil/sozlukler/giris';

/**
 * Oturum ekranlarının ORTAK KABUĞU — giriş, şifremi unuttum, şifre sıfırlama.
 *
 * Üç sayfanın da aynı markup'ı kendi içinde taşıması, ilk gerekli değişiklikte
 * (logo, başlık, dip not) ikisinin güncellenip birinin unutulması demekti;
 * fark yalnızca o sayfaya düşen kullanıcıya görünür ve kimse bildirmez.
 */
export async function AuthKabuk({
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
  const dil = await dilAl();
  const d = sec(girisSozlugu, dil);
  /*
   * PANELİN DİLİ (BILESENLER): gri zemin, beyaz gölgesiz kart, başlık
   * `SayfaBasligi` (Montserrat, menüdeki başlıklarla aynı boy). Eskiden
   * ortalanmış elle bir `h1` ve gölgeli kart vardı; kullanıcı girişten
   * panele geçince yazı tipinin ve kartın değiştiğini görüyordu.
   * İŞLEYİŞ AYNI: bu kabuk yalnız yerleşim, formlar kendi dosyalarında.
   */
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-surface-muted px-4 py-12">
      {/* TR · EN HER ZAMAN GÖRÜNÜR, SORMAZ (kullanıcı kararı Ç1, taslak B). */}
      <DilAnahtari className="absolute right-4 top-4" />
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

        <p className="m-0 text-12 text-ink-muted">{d.kabukAlt(platformListesi(dil))}</p>
      </div>
    </main>
  );
}
