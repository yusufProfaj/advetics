'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { passwordSchema } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { KART_BAGLANTISI } from '@/components/ui/kart';
import { useSozluk } from '@/dil/saglayici';
import { girisSozlugu } from '@/dil/sozlukler/giris';

export function SifreSifirlaFormu() {
  const router = useRouter();
  const token = useSearchParams()?.get('token') ?? '';

  const g = useSozluk(girisSozlugu);
  const d = g.sifirla;
  const [sifre, setSifre] = useState('');
  const [tekrar, setTekrar] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [alanHatalari, setAlanHatalari] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [bitti, setBitti] = useState(false);

  /*
   * TOKEN YOKSA FORM HİÇ GÖSTERİLMİYOR.
   *
   * Boş token'la form çizmek, kullanıcının yeni şifresini yazıp
   * "Sıfırlama bağlantısı geçersiz" duvarına çarpması demek — emeği harcanmış
   * ve sebebi ekranda değil. Belirsizlik BAŞTA söyleniyor.
   */
  if (!token) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-14 leading-relaxed text-ink">
          {d.tokenYok}
        </p>
        <p className="m-0 text-14 text-ink-muted">
          {d.kopyala}
        </p>
        <Link href="/sifremi-unuttum" className={KART_BAGLANTISI}>
          {d.yeniIste}
        </Link>
      </div>
    );
  }

  if (bitti) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-14 leading-relaxed text-ink">
          {d.bittiOnce}
          <strong>{d.bittiVurgu}</strong>
          {d.bittiSonra}
        </p>
        <Link href="/login" className={`${dugmeSinifi('birincil')} w-full`}>
          {d.girisYap}
        </Link>
      </div>
    );
  }

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    setAlanHatalari({});

    const parsed = passwordSchema.safeParse(sifre);
    if (!parsed.success) {
      // Şemanın mesajı sabit Türkçe (shared, D4'te dile geçecek); ekranda kuralın
      // tamamı dilin cümlesiyle yazılıyor, ipucu da aynı cümle.
      setAlanHatalari({ sifre: d.kural });
      return;
    }
    if (sifre !== tekrar) {
      setAlanHatalari({ tekrar: d.eslesmiyor });
      return;
    }

    setPending(true);
    try {
      await apiFetch('/auth/password/reset-confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password: sifre }),
      });
      setBitti(true);
      // Sunucu tarafı oturumu artık yok; RSC önbelleği eski hâli tutmasın.
      router.refresh();
    } catch (err) {
      setHata(
        err instanceof ApiRequestError ? err.message : g.baglantiYok,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4" noValidate>
      {hata && <Serit ton="hata" baslik={hata} />}

      <Alan
        id="sifre"
        label={d.yeniSifre}
        type="password"
        autoComplete="new-password"
        value={sifre}
        onChange={setSifre}
        error={alanHatalari.sifre}
        disabled={pending}
        ipucu={d.kural}
      />

      <Alan
        id="tekrar"
        label={d.tekrar}
        type="password"
        autoComplete="new-password"
        value={tekrar}
        onChange={setTekrar}
        error={alanHatalari.tekrar}
        disabled={pending}
      />

      <Dugme type="submit" className="w-full" bekliyor={pending}>
        {pending ? d.kaydediliyor : d.degistir}
      </Dugme>
    </form>
  );
}
