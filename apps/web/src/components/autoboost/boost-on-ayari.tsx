'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BoostOnAyarlariFormu } from './boost-on-ayarlari-formu';
import { Dugme } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';

/**
 * ═══ BOOST ÖN AYARI — AUTO-BOOST'UN İÇİNDEN ═══
 *
 * Ön ayar ekranı zaten yazılıydı ama `/kutuphane/bilgi-bankasi` altında,
 * menünün bambaşka bir bölümünde duruyordu. Kullanıcının tarifi şuydu:
 * "üst tarafta onaylananları boostla butonu yerine boost ön ayarı tarzında
 * bir seçim ekranı yapmamız lazım."
 *
 * Sebep açık: ön ayar, kartın hangi bütçe ve hedeflemeyle yayınlanacağını
 * belirliyor — yani bu sayfadaki her "Onayla ve Boostla" düğmesinin
 * davranışını. Kararın verildiği yerle ayarın yapıldığı yerin iki ayrı
 * menü bölümünde olması, "bu kart neden 100 ₺ harcayacak" sorusunu
 * cevapsız bırakıyordu.
 *
 * MODAL, AYRI SAYFA DEĞİL: kullanıcı onay kuyruğunu görürken ayarı
 * değiştirip aynı ekrana dönüyor. Ayrı sayfaya gitmek, geri geldiğinde
 * kuyruğun başına dönmek demekti.
 *
 * ORTAK `Pencere`: portal, Esc, odak tuzağı ve DOM'da kalma orada. Elle
 * yazılmış katman Esc'te sayfayı TAZELEMİYORDU (yalnız "Kapat" düğmesi
 * tazeliyordu); artık her kapanış aynı `kapat`tan geçiyor.
 */
export function BoostOnAyariDugmesi({
  clientId,
  canWrite,
  etiket = 'Boost ön ayarı',
  ton = 'ikincil',
}: {
  clientId: string;
  canWrite: boolean;
  /** Kart içinde ("Boost ayarla", ön ayarsız YouTube kartı) başka ad ve ton. */
  etiket?: string;
  ton?: 'birincil' | 'ikincil';
}) {
  const [acik, setAcik] = useState(false);
  /*
   * FORM HER AÇILIŞTA YENİDEN KURULUYOR (`key`). Pencere kapalıyken DOM'da
   * kalıyor; form kalıcı olsaydı ikinci açılışta önceki açılışın kaydedilmemiş
   * hâlini gösterirdi. İlk açılıştan önce hiç kurulmuyor: sayfa her
   * yüklendiğinde ön ayar çekilmesin.
   */
  const [acilis, setAcilis] = useState(0);
  const router = useRouter();

  function ac(): void {
    setAcilis((n) => n + 1);
    setAcik(true);
  }

  function kapat(): void {
    setAcik(false);
    /*
     * KAPANINCA SAYFA TAZELENİYOR. Ön ayar değişince kartlardaki
     * "Uygulanacak: 100,00 ₺ / gün · 5 gün" satırı da değişmeli; yenilemeden
     * kullanıcı eski tutarı okumaya devam eder ve onayladığında başka bir
     * rakam harcanır.
     */
    router.refresh();
  }

  return (
    <>
      <Dugme ton={ton} onClick={ac}>
        {etiket}
      </Dugme>

      <Pencere
        acik={acik}
        onKapat={kapat}
        genislik="genis"
        baslik="Boost ön ayarı"
        aciklama="Onayladığın her kart bu ayarlarla yayınlanır. Ayar bu workspace’e kaydediliyor."
      >
        {/* Gövde Pencere'nin içinde kayıyor, başlık sabit: 14 alanlı formda
            "Kaydet" ekran dışında kalıyordu (şablon modalıyla aynı ders). */}
        {acilis > 0 && <BoostOnAyarlariFormu key={acilis} clientId={clientId} canWrite={canWrite} />}
      </Pencere>
    </>
  );
}
