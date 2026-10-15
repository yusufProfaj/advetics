'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuBasligi, MenuOgesi } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { dugmeSinifi } from '@/components/ui/dugme';
import type { OlusturSecenegi } from '@/lib/olustur-menusu';
import { useSozluk } from '@/dil/saglayici';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/**
 * ═══ KABUĞUN AÇILIR MENÜLERİ (menü kararı 2026-10-14) ═══
 *
 * Kenar çubuğu sunucuda da çizilebiliyor (`kenar-cubugu.tsx` `'use client'`
 * taşımıyor); durum tutan parçalar burada. Üçü de `AcilirMenu`dan geçiyor:
 * aynı görünüş, aynı klavye davranışı (Esc, ok tuşları), DOM'da kalan panel.
 */

/**
 * "+ OLUŞTUR": seçicinin altında TEK kırmızı hap. Sayfanın kendi birincil
 * eylemi başlığın sağında kalıyor; bu düğme her sayfada aynı yerde ve
 * oluşturma yollarının hepsine tek kapı. Liste boşsa (müşteri hesabı ya da
 * hiçbir yazma izni yok) düğme HİÇ çizilmiyor: açılıp boş görünen bir menü
 * "burada bir şey vardı" izlenimi bırakırdı.
 */
export function OlusturMenusu({ secenekler, onGezinme }: { secenekler: OlusturSecenegi[]; onGezinme?: () => void }) {
  const d = useSozluk(kabukSozlugu).olustur;
  if (secenekler.length === 0) return null;
  return (
    <AcilirMenu
      etiket={d.etiket}
      genislik="w-[280px]"
      sinif="w-full"
      tetik={({ acik: _acik, ...o }) => (
        <button
          type="button"
          {...o}
          className={`${dugmeSinifi('birincil', 'orta')} w-full`}
        >
          <Ikon ad="arti" />
          {d.etiket}
        </button>
      )}
    >
      <MenuBasligi>{d.baslik}</MenuBasligi>
      {secenekler.map((s) => (
        <div key={s.href + s.ad} className="contents">
          {s.ayracOnce && <MenuAyraci />}
          <MenuOgesi ikon={<Ikon ad={s.ikon} />} aciklama={s.aciklama} href={s.href} onClick={onGezinme}>
            {s.ad}
          </MenuOgesi>
        </div>
      ))}
    </AcilirMenu>
  );
}

/**
 * Sol alttaki KULLANICI KARTI ve menüsü: Hesabım, iki adımlı giriş, tema,
 * çıkış. Öğeler çağırandan geliyor (adresler sunucuda kuruluyor).
 */
export function KullaniciMenusu({ ad, rol, children }: { ad: string; rol: string; children: ReactNode }) {
  const d = useSozluk(kabukSozlugu).kullanici;
  return (
    <AcilirMenu
      etiket={d.menu}
      yon="yukari"
      genislik="w-[240px]"
      sinif="w-full"
      tetik={({ acik: _acik, ...o }) => (
        <button
          type="button"
          {...o}
          className="grid w-full grid-cols-[32px_minmax(0,1fr)_16px] items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors hover:bg-surface-sunken aria-expanded:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-sunken text-12 font-bold uppercase text-ink">
            {ad.slice(0, 2)}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-13 font-semibold text-ink">{ad}</b>
            <small className="block truncate text-[11.5px] text-ink-muted">{rol}</small>
          </span>
          <span className="text-ink-soluk">
            <Ikon ad="nokta3" className="h-4 w-4" />
          </span>
        </button>
      )}
    >
      <MenuBasligi>{ad}</MenuBasligi>
      {children}
    </AcilirMenu>
  );
}

/**
 * Üst çubuğun "Verileri yenile" ikonu: sunucu bileşenlerini yeniden çeker
 * (`router.refresh`). Sürerken ikon döner ve düğme kilitli; tıklamanın bir şey
 * yaptığı görünmezse kullanıcı art arda basar.
 */
export function YenileIkonu() {
  const router = useRouter();
  const [bekliyor, baslat] = useTransition();
  const d = useSozluk(kabukSozlugu).kullanici;
  return (
    <button
      type="button"
      aria-label={d.verileriYenile}
      title={d.verileriYenile}
      disabled={bekliyor}
      aria-busy={bekliyor || undefined}
      onClick={() => baslat(() => router.refresh())}
      className={`${IKON_TETIK} max-sm:hidden disabled:cursor-progress`}
    >
      <span className={bekliyor ? 'advetics-donus inline-flex' : 'inline-flex'}>
        <Ikon ad="yenile" />
      </span>
    </button>
  );
}
