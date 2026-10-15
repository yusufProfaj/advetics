'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ikiAdimBekleniyor, loginSchema, type GirisYaniti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';
import { IkiAdimGiris } from '@/components/auth/iki-adim-giris';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { KART_BAGLANTISI } from '@/components/ui/kart';
import { useDil, useSozluk } from '@/dil/saglayici';
import { girisSozlugu } from '@/dil/sozlukler/giris';
import { dilProfileYaz } from '@/dil/profil';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') ?? '/dashboard';
  const { dil } = useDil();
  const d = useSozluk(girisSozlugu);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /*
   * VARSAYILAN İŞARETLİ. Checkbox eklenmeden önce herkes zaten hatırlanıyordu
   * (giriş cookie'si her zaman kalıcı yazılıyordu); işaretsiz açmak, hiçbir
   * şey istememiş bütün kullanıcıları tarayıcı kapanınca çıkışa uğratırdı.
   * `loginSchema.rememberMe` varsayılanı da bu sebeple `true`.
   */
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  /*
   * İKİNCİ ADIM. Parola doğru ama oturum açılmadı: sunucu yalnızca ara
   * çerez yazdı ve hangi adımın beklendiğini söyledi. Bu yanıtı oturum
   * sanıp panele yönlendirmek, kullanıcıyı middleware'in /login'e geri
   * attığı bir döngüye sokardı (erişim çerezi yok).
   */
  const [ikiAdim, setIkiAdim] = useState<'dogrula' | 'kurulum' | null>(null);

  /*
   * DİL DEĞİŞİNCE ESKİ HATALAR SİLİNİR. Hata cümleleri gönderim anındaki
   * dilde durumda saklanıyor; silinmezse TR'ye geçen kişi Türkçe ekranda
   * "Not a valid email address" görüyordu (canlı denetim, D0).
   */
  useEffect(() => {
    setError(null);
    setFieldErrors({});
  }, [dil]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Aynı Zod şeması API tarafında da çalışıyor. Buradaki doğrulama
    // yalnızca kullanıcıya hızlı geri bildirim içindir — güvenlik değil.
    const parsed = loginSchema.safeParse({ email, password, rememberMe });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errs[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setPending(true);
    try {
      const yanit = await apiFetch<GirisYaniti>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      if (ikiAdimBekleniyor(yanit)) {
        setIkiAdim(yanit.ikiAdim);
        return;
      }
      await dilProfileYaz(dil);
      // Cookie'ler API tarafından set edildi; sunucu tarafı oturumu görsün diye
      // tam yenileme yapıyoruz.
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        if (err.fieldErrors) {
          setFieldErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.field, f.message])));
        }
      } else {
        setError(d.baglantiYok);
      }
    } finally {
      setPending(false);
    }
  }

  if (ikiAdim) {
    return (
      <IkiAdimGiris
        amac={ikiAdim}
        sonraki={nextPath}
        onGeri={() => {
          setIkiAdim(null);
          setPassword('');
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {/* SUNUCUNUN KENDİ CÜMLESİ, ortak şeritte (sol kırmızı çizgi). */}
      {error && <Serit ton="hata" baslik={error} />}

      <Alan
        id="email"
        label={d.eposta}
        type="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        disabled={pending}
      />

      <Alan
        id="password"
        label={d.sifre}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        disabled={pending}
      />

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="rememberMe" className="flex cursor-pointer items-center gap-2 text-14 text-ink">
          <input
            id="rememberMe"
            name="rememberMe"
            type="checkbox"
            checked={rememberMe}
            disabled={pending}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand-primary)]"
          />
          {d.beniHatirla}
        </label>

        <Link href="/sifremi-unuttum" className={KART_BAGLANTISI}>
          {d.sifremiUnuttum}
        </Link>
      </div>

      {/*
        İŞARETSİZKEN NE OLACAĞI YAZIYOR. "Beni hatırla" kutusu tek başına
        belirsiz: kullanıcı işareti kaldırınca oturumun ne kadar süreceğini
        bilmiyor ve ortak bilgisayarda tam olarak bu bilgiyi arıyor.
      */}
      {!rememberMe && (
        <p className="m-0 text-12 text-ink-muted">
          {d.hatirlamaNotu}
        </p>
      )}

      {/* EKRANIN TEK BİRİNCİL EYLEMİ: tam genişlik, ortak düğme. */}
      <Dugme type="submit" className="w-full" bekliyor={pending}>
        {pending ? d.girisYapiliyor : d.girisYap}
      </Dugme>
    </form>
  );
}
