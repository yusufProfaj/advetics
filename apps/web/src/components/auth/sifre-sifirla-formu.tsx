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

export function SifreSifirlaFormu() {
  const router = useRouter();
  const token = useSearchParams()?.get('token') ?? '';

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
          Bu sayfaya sıfırlama bağlantısıyla gelinmesi gerekiyor; adreste bir token yok.
        </p>
        <p className="m-0 text-14 text-ink-muted">
          Bağlantıyı mailden kopyaladıysan tamamını yapıştırdığından emin ol; bazı mail
          istemcileri uzun adresleri satır sonunda kırıyor.
        </p>
        <Link href="/sifremi-unuttum" className={KART_BAGLANTISI}>
          Yeni bir sıfırlama bağlantısı iste
        </Link>
      </div>
    );
  }

  if (bitti) {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-14 leading-relaxed text-ink">
          Şifren değiştirildi. Güvenlik için <strong>tüm oturumların kapatıldı</strong>; yeni
          şifrenle tekrar giriş yapman gerekiyor.
        </p>
        <Link href="/login" className={`${dugmeSinifi('birincil')} w-full`}>
          Giriş yap
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
      setAlanHatalari({ sifre: parsed.error.issues[0]?.message ?? 'Geçersiz şifre' });
      return;
    }
    if (sifre !== tekrar) {
      setAlanHatalari({ tekrar: 'Şifreler eşleşmiyor' });
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
        err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı. API çalışıyor mu?',
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
        label="Yeni şifre"
        type="password"
        autoComplete="new-password"
        value={sifre}
        onChange={setSifre}
        error={alanHatalari.sifre}
        disabled={pending}
        ipucu="En az 12 karakter, en az bir harf ve bir rakam."
      />

      <Alan
        id="tekrar"
        label="Yeni şifre (tekrar)"
        type="password"
        autoComplete="new-password"
        value={tekrar}
        onChange={setTekrar}
        error={alanHatalari.tekrar}
        disabled={pending}
      />

      <Dugme type="submit" className="w-full" bekliyor={pending}>
        {pending ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
      </Dugme>
    </form>
  );
}
