'use client';

import { useEffect, useRef, useState } from 'react';
import { Dugme } from '@/components/ui/dugme';
import { useSozluk } from '@/dil/saglayici';
import { varliklarSozlugu } from '@/dil/sozlukler/varliklar';

/**
 * ═══ VARLIKLAR'IN BİRİNCİL EYLEMİ — YERİ SABİT, METNİ BÖLÜME GÖRE ═══
 * (taslak `#varlik`, kullanıcı kararı 2026-10-14)
 *
 * "Görsel yükle · Yeni kreatif · Yeni form · Yeni kitle" dört bölümde dört
 * AYRI yerdeydi (yükleme kutusunun içinde, listenin üstünde, başlığın
 * yanında). Artık her bölümde başlığın SAĞINDA, aynı kırmızı düğme; metni
 * seçili bölümden.
 *
 * NEDEN OLAY (CustomEvent): başlık sunucu bileşeninde, işi yapacak durum
 * ise bölümün istemci bileşeninde (dosya seçicisi, kreatif düzenleyicisi,
 * form oluşturucu, kitle paneli). Durumu sayfaya taşımak dört bileşenin
 * iç durumunu dışarı açmak demekti. Olay EŞZAMANLI yayılıyor, yani dosya
 * seçicisi aynı kullanıcı dokunuşunun içinde açılabiliyor (tarayıcı
 * `input.click()`i yalnız kullanıcı eylemi sırasında kabul ediyor).
 *
 * SESSİZ KALMIYOR: dinleyici olayı `preventDefault` ile "aldım" diye
 * işaretliyor. Kimse almadıysa (bölüm yüklenemedi, liste hata verdi) düğme
 * hiçbir şey yapmayan bir düğme olmuyor; yanında nedeni yazıyor.
 */
export type VarlikBolumu = 'gorseller' | 'kreatifler' | 'formlar' | 'kitleler';

const OLAY = 'advetics:varlik-yeni';

export function VarlikBirincilEylem({
  bolum,
  etiket,
  kapaliNedeni,
}: {
  bolum: VarlikBolumu;
  etiket: string;
  /** Yazma yetkisi yoksa: düğme kapalı, neden `title`da ve ekran okuyucuda. */
  kapaliNedeni?: string | null;
}) {
  const d = useSozluk(varliklarSozlugu);
  const [alinmadi, setAlinmadi] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {alinmadi && (
        <span role="status" className="text-12 text-danger-strong">
          {d.birincilEylem.yuklenemedi}
        </span>
      )}
      <Dugme
        ikon="＋"
        disabled={Boolean(kapaliNedeni)}
        title={kapaliNedeni ?? undefined}
        onClick={() => {
          const olay = new CustomEvent<VarlikBolumu>(OLAY, { detail: bolum, cancelable: true });
          // dispatchEvent `false` dönerse biri `preventDefault` çağırdı = aldı.
          setAlinmadi(window.dispatchEvent(olay));
        }}
      >
        {etiket}
      </Dugme>
      {kapaliNedeni && <span className="sr-only">{kapaliNedeni}</span>}
    </span>
  );
}

/**
 * Bölüm bileşeninin dinleyicisi: başlıktaki düğmeye basılınca `yap` çağrılır.
 * `yap` her çizimde yeni olabilir; ref ile tutuluyor ki dinleyici her
 * çizimde sökülüp takılmasın.
 */
export function useVarlikYeni(bolum: VarlikBolumu, yap: () => void, etkin = true): void {
  const ref = useRef(yap);
  ref.current = yap;
  useEffect(() => {
    if (!etkin) return;
    function dinle(e: Event) {
      if ((e as CustomEvent<VarlikBolumu>).detail !== bolum) return;
      e.preventDefault();
      ref.current();
    }
    window.addEventListener(OLAY, dinle);
    return () => window.removeEventListener(OLAY, dinle);
  }, [bolum, etkin]);
}
