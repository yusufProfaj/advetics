'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DILLER, type Dil } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { DIL_ADLARI, DIL_ALT_ADLARI, dilSecimiSozlugu } from '@/dil/sozlukler/dil-secimi';
import { AdveticsLogo } from '@/components/advetics-logo';
import { Dugme } from './dugme';

/**
 * ═══ DİL SEÇİMİ (onaylı taslak `docs/i18n/dil-secimi-taslak.html`) ═══
 *
 * A — İLK ZİYARET EKRANI. Çerezi olmayan herkes bir kez görür (kullanıcı
 * kararı Ç1). Ekranı kaplayan bir katman ama Pencere DEĞİL: kapatma düğmesi
 * ve Escape yok, çünkü "kapat" bir dil seçmek demek ve hangisi olduğunu
 * kişi söylemeli. Ön seçim tarayıcının dilinden (`oneri`).
 *
 * YALNIZ MONTAJDAN SONRA ÇİZİLİR: sunucunun bastığı HTML'de yok. Arama
 * motoru ve Google'ın OAuth doğrulayıcısı sayfanın kendisini görmeli;
 * ilk satırı "Dilinizi seçin" olan bir ana sayfa onlar için boş sayfa.
 *
 * BEYAZ ETİKETLİ YÜZEYDE ÇIKMAZ: `/r/` (müşterinin kendi alan adındaki
 * rapor) ve `/strateji-onay/` (girişsiz müşteri onayı) Advetics'in değil
 * ajansın sayfası; orada Advetics logolu bir dil sorusu markayı bozar.
 */
const SORULMAYAN_ONEKLER = ['/r/', '/strateji-onay/'];

export function DilSecimEkrani({ dilSecildi, oneri }: { dilSecildi: boolean; oneri: Dil }) {
  const yol = usePathname();
  const { degistir } = useDil();
  const [monte, setMonte] = useState(false);
  const [acik, setAcik] = useState(!dilSecildi);
  const [secili, setSecili] = useState<Dil>(oneri);
  const ilkSecenek = useRef<HTMLButtonElement>(null);

  useEffect(() => setMonte(true), []);
  const gorunur = monte && acik && !SORULMAYAN_ONEKLER.some((o) => yol?.startsWith(o));

  useEffect(() => {
    if (!gorunur) return;
    ilkSecenek.current?.focus();
    const eski = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = eski;
    };
  }, [gorunur]);

  // Metinler SEÇİLİ dile göre: kişi English'e dokununca düğme "Continue" olur.
  const d = dilSecimiSozlugu[secili];
  if (!gorunur) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dil-secimi-baslik"
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-surface px-4 pb-10 pt-14 sm:items-center sm:pt-10"
    >
      <div className="grid w-full max-w-[400px] gap-5">
        <div className="flex">
          <AdveticsLogo />
        </div>
        <h2 id="dil-secimi-baslik" className="m-0 font-baslik text-24 font-extrabold leading-tight text-ink">
          Dilinizi seçin
          <span lang="en" className="mt-1 block font-sans text-14 font-semibold text-ink-muted">
            Choose your language
          </span>
        </h2>
        <div role="radiogroup" aria-labelledby="dil-secimi-baslik" className="grid gap-2.5">
          {DILLER.map((dil, i) => {
            const aktif = secili === dil;
            return (
              <button
                key={dil}
                ref={i === 0 ? ilkSecenek : undefined}
                type="button"
                role="radio"
                aria-checked={aktif}
                lang={dil}
                onClick={() => setSecili(dil)}
                className={`flex w-full items-center gap-3.5 rounded-kart border bg-surface p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
                  aktif ? 'border-brand bg-vurgu shadow-[inset_3px_0_0_var(--brand-primary)]' : 'border-line-strong hover:border-ink'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-alan font-baslik text-13 font-extrabold ${
                    aktif ? 'bg-brand text-white' : 'bg-surface-sunken text-ink'
                  }`}
                >
                  {dil.toUpperCase()}
                </span>
                <span className="grid">
                  <b className="font-baslik text-15 text-ink">{DIL_ADLARI[dil]}</b>
                  <small className="text-12 text-ink-muted">{DIL_ALT_ADLARI[dil]}</small>
                </span>
                <span
                  aria-hidden
                  className={`ml-auto h-[18px] w-[18px] shrink-0 rounded-full ${
                    aktif ? 'border-[5px] border-brand' : 'border-2 border-line-strong'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <Dugme
          className="w-full"
          lang={secili}
          onClick={async () => {
            setAcik(false);
            await degistir(secili);
          }}
        >
          {d.devam}
        </Dugme>
        <p lang={secili} className="m-0 text-12 text-ink-muted">
          {d.sonraDegistir}
        </p>
      </div>
    </div>
  );
}

/**
 * B — TR · EN ANAHTARI. Giriş ekranında ve tanıtım sitesinin üst menüsünde
 * HER ZAMAN görünür ama soru sormaz. `profileYaz` yalnız oturum açıkken
 * anlamlı; giriş ekranındaki seçim, giriş BAŞARILI olunca profile yazılıyor
 * (`login-form.tsx`), burada değil: oturumsuz istek 401 alırdı.
 */
export function DilAnahtari({ className = '' }: { className?: string }) {
  const { dil, degistir } = useDil();
  const d = useSozluk(dilSecimiSozlugu);
  return (
    <div role="group" aria-label={d.anahtarEtiketi} className={`inline-flex gap-0.5 rounded-full bg-surface-sunken p-[3px] ${className}`}>
      {DILLER.map((k) => (
        <button
          key={k}
          type="button"
          lang={k}
          aria-pressed={dil === k}
          aria-label={DIL_ADLARI[k]}
          onClick={() => dil !== k && void degistir(k)}
          className={`h-7 rounded-full px-3 text-12 font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none ${
            dil === k ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--border-strong)]' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {k.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
