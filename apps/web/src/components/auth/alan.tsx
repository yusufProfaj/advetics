'use client';

import { useState } from 'react';
import { useSozluk } from '@/dil/saglayici';
import { girisSozlugu } from '@/dil/sozlukler/giris';

/**
 * Oturum ekranlarının metin alanı.
 *
 * `login-form.tsx` içinde yerel bir bileşendi; şifre sıfırlama ekranı da aynı
 * alana ihtiyaç duyunca kopyalanacaktı. Kopyalanan bir form alanı, hata
 * gösterimi ve `aria-describedby` bağının bir ekranda güncellenip diğerinde
 * kalması demek — farkı yalnızca ekran okuyucu kullanan biri görür.
 */
export function Alan({
  id,
  label,
  type,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  ipucu,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  /** Alanın ALTINDA duran kural metni (örn. şifre politikası). */
  ipucu?: string;
}) {
  const yardimId = error ? `${id}-error` : ipucu ? `${id}-ipucu` : undefined;
  const [gorunur, setGorunur] = useState(false);
  const d = useSozluk(girisSozlugu);

  /*
   * ═══ ŞİFREYİ GÖSTER — HER ŞİFRE ALANINDA, İSTEĞE BAĞLI DEĞİL ═══
   *
   * Bir prop'a bağlamak, üç oturum ekranından birinde unutulması demekti ve
   * en çok gereken yer giriş değil ŞİFRE BELİRLEME ekranı: orada yazdığını
   * doğrulayamayan kullanıcı, kaydettiği şifreyi bir sonraki girişte
   * öğreniyor.
   *
   * Bu panelde ayrıca somut bir sebep var: davet akışı YOK, şifreyi yönetici
   * belirleyip kullanıcıya elden iletiyor (`members.service.ts`). Elle
   * yazılan on iki karakterlik bir şifreyi göremeden girmek, "şifre yanlış"
   * döngüsünün en sık sebebi.
   *
   * VARSAYILAN GİZLİ ve öyle kalıyor — açmak kullanıcının kararı. Durum
   * alanın İÇİNDE: iki şifre alanı olan bir ekranda (yeni şifre + tekrar)
   * tek bir ortak bayrak, birini açınca diğerini de açardı.
   */
  const sifreAlani = type === 'password';
  const etkinTip = sifreAlani && gorunur ? 'text' : type;

  return (
    /*
     * GÖRÜNÜŞ ORTAK FORM ALANIYLA AYNI (`ui/alan.tsx`, referans "05 · Form"):
     * etiket 13 kalın, alan 40 yüksek ve 8 yarıçap, hata kırmızı kenar.
     * Bileşen ayrı kalıyor çünkü "Göster/Gizle" ve kendi `aria` bağı burada;
     * yalnız sınıflar ortak kalıba eşlendi.
     */
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-13 font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
      <input
        id={id}
        name={id}
        type={etkinTip}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={yardimId}
        className={`h-10 w-full rounded-alan border bg-surface pl-3 text-14 text-ink outline-none transition-colors focus:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-60 ${
          error ? 'border-danger' : 'border-line-strong'
        } ${sifreAlani ? 'pr-16' : 'pr-3'}`}
      />
      {sifreAlani && (
        /*
         * `type="button"` ŞART: varsayılan `submit` ve bu düğme bir formun
         * içinde duruyor — göstermeye basmak formu GÖNDERİRDİ.
         *
         * Metin, ikon DEĞİL: göz ikonunun "şu an gizli" mi "tıklayınca
         * gizlenir" mi anlattığı kullanıcıya göre değişiyor ve bu ekranda
         * yanlış tahmin şifreyi omuz üstünden okunur bırakıyor.
         */
        <button
          type="button"
          onClick={() => setGorunur((g) => !g)}
          disabled={disabled}
          aria-pressed={gorunur}
          aria-controls={id}
          className="absolute inset-y-0 right-0 px-3 text-12 font-bold text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          {gorunur ? d.gizle : d.goster}
        </button>
      )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="m-0 text-12 text-danger-strong">
          {error}
        </p>
      ) : ipucu ? (
        <p id={`${id}-ipucu`} className="m-0 text-12 text-ink-muted">
          {ipucu}
        </p>
      ) : null}
    </div>
  );
}
