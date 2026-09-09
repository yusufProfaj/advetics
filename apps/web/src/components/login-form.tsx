'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') ?? '/dashboard';

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
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
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
        setError('Bağlantı kurulamadı. API çalışıyor mu?');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <Alan
        id="email"
        label="E-posta"
        type="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        disabled={pending}
      />

      <Alan
        id="password"
        label="Şifre"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        disabled={pending}
      />

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="rememberMe" className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            id="rememberMe"
            name="rememberMe"
            type="checkbox"
            checked={rememberMe}
            disabled={pending}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-line text-brand focus:ring-2 focus:ring-brand/20"
          />
          Beni hatırla
        </label>

        <Link href="/sifremi-unuttum" className="text-sm text-brand hover:underline">
          Şifremi unuttum
        </Link>
      </div>

      {/*
        İŞARETSİZKEN NE OLACAĞI YAZIYOR. "Beni hatırla" kutusu tek başına
        belirsiz: kullanıcı işareti kaldırınca oturumun ne kadar süreceğini
        bilmiyor ve ortak bilgisayarda tam olarak bu bilgiyi arıyor.
      */}
      {!rememberMe && (
        <p className="text-xs text-ink-muted">
          Tarayıcıyı kapattığında oturumun kapanacak.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </button>
    </form>
  );
}
