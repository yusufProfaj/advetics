'use client';

import { useState } from 'react';

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
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
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
        className={`w-full rounded-lg border border-line bg-surface py-2 pl-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60 ${
          sifreAlani ? 'pr-16' : 'pr-3'
        }`}
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
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-muted transition hover:text-ink disabled:opacity-60"
        >
          {gorunur ? 'Gizle' : 'Göster'}
        </button>
      )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : ipucu ? (
        <p id={`${id}-ipucu`} className="mt-1 text-xs text-ink-muted">
          {ipucu}
        </p>
      ) : null}
    </div>
  );
}
