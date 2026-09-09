'use client';

import { useState } from 'react';
import { requestPasswordResetSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';

/** API yanıtı. `devToken` YALNIZCA geliştirme ortamında dolu gelir. */
interface SifirlamaYaniti {
  ok: boolean;
  devToken?: string;
}

export function SifremiUnuttumFormu() {
  const [email, setEmail] = useState('');
  const [gonderildi, setGonderildi] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [alanHatasi, setAlanHatasi] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setAlanHatasi(undefined);

    const parsed = requestPasswordResetSchema.safeParse({ email });
    if (!parsed.success) {
      setAlanHatasi(parsed.error.issues[0]?.message ?? 'Geçersiz e-posta');
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch<SifirlamaYaniti>('/auth/password/reset-request', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setDevToken(res?.devToken ?? null);
      setGonderildi(true);
    } catch (err) {
      /*
       * HATA YUTULMUYOR. Sunucu SMTP tanımlı değilse bunu EKSİK DEĞİŞKEN
       * ADLARIYLA söylüyor; onu "bir şeyler ters gitti"ye çevirmek, panele
       * bakan kişinin sunucuya girmeden düzeltebileceği bir arızayı
       * teşhis edilemez hâle getirirdi (CLAUDE.md: sessiz hata).
       */
      setHata(
        err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı. API çalışıyor mu?',
      );
    } finally {
      setPending(false);
    }
  }

  if (gonderildi) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink">
          Bu adres kayıtlıysa şifre sıfırlama bağlantısı <strong>{email}</strong> adresine
          gönderildi. Bağlantı 60 dakika geçerli.
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">
          Mail birkaç dakika içinde gelmezse spam klasörünü kontrol et. Yine yoksa yöneticine
          başvur — gönderim hatası sunucu kayıtlarına yazılıyor.
        </p>

        {devToken && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold text-amber-900">
              Geliştirme ortamı — bağlantı mail yerine burada
            </p>
            <a
              href={`/sifre-sifirla?token=${encodeURIComponent(devToken)}`}
              className="mt-1 block break-all text-xs text-amber-900 underline"
            >
              /sifre-sifirla?token={devToken}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={gonder} className="space-y-4" noValidate>
      {hata && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {hata}
        </div>
      )}

      <Alan
        id="email"
        label="E-posta"
        type="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        error={alanHatasi}
        disabled={pending}
        ipucu="Hesabına kayıtlı adresi yaz; sıfırlama bağlantısını oraya gönderiyoruz."
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
      </button>
    </form>
  );
}
