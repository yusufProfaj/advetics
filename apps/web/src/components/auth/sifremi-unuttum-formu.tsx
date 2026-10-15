'use client';

import { useState } from 'react';
import { requestPasswordResetSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { girisSozlugu } from '@/dil/sozlukler/giris';

/** API yanıtı. `devToken` YALNIZCA geliştirme ortamında dolu gelir. */
interface SifirlamaYaniti {
  ok: boolean;
  devToken?: string;
}

export function SifremiUnuttumFormu() {
  const g = useSozluk(girisSozlugu);
  const d = g.unuttum;
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
      setAlanHatasi(parsed.error.issues[0]?.message ?? d.gecersizEposta);
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
        err instanceof ApiRequestError ? err.message : g.baglantiYok,
      );
    } finally {
      setPending(false);
    }
  }

  if (gonderildi) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-14 leading-relaxed text-ink">
          {d.gonderildiOnce}
          <strong>{email}</strong>
          {d.gonderildiSonra}
        </p>
        <p className="m-0 text-12 leading-relaxed text-ink-muted">
          {d.spam}
        </p>

        {devToken && (
          <Serit baslik={d.gelistirme}>
            <a
              href={`/sifre-sifirla?token=${encodeURIComponent(devToken)}`}
              className="mt-1 block break-all text-12 font-semibold text-ink underline"
            >
              /sifre-sifirla?token={devToken}
            </a>
          </Serit>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={gonder} className="grid gap-4" noValidate>
      {hata && <Serit ton="hata" baslik={hata} />}

      <Alan
        id="email"
        label={g.eposta}
        type="email"
        autoComplete="username"
        value={email}
        onChange={setEmail}
        error={alanHatasi}
        disabled={pending}
        ipucu={d.ipucu}
      />

      <Dugme type="submit" className="w-full" bekliyor={pending}>
        {pending ? d.gonderiliyor : d.gonder}
      </Dugme>
    </form>
  );
}
