'use client';

import Link from 'next/link';
import { ayarlarAdresi } from '@/lib/panel-adresleri';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IkiAdimDurumu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';

/**
 * ═══ ŞİRKETTE İKİ ADIMLI DOĞRULAMA ZORUNLULUĞU (yönetici) ═══
 *
 * Ayarın etkisi ekranda AÇIKÇA yazıyor çünkü görünmeyen bir etkisi var:
 * açılınca 2FA'sı olmayan herkes en geç 15 dakika içinde oturumdan düşüyor
 * (oturum yenilemesi reddediliyor) ve yeniden girişte kurulum zorunlu.
 * Bunu bilmeyen yönetici "ekip neden çıkış yaptı" diye arıza arar.
 *
 * Yönetici kendi 2FA'sı kapalıyken açamıyor (sunucu reddediyor); düğme yine
 * görünüyor ve sunucunun cümlesi ekrana geliyor, Hesabım'a bağlantıyla.
 */
export function IkiAdimSirketAyari({ durum }: { durum: IkiAdimDurumu }) {
  const router = useRouter();
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const sirket = durum.secilenSirket;
  if (!sirket) return null;

  async function degistir(zorunlu: boolean) {
    if (
      zorunlu &&
      !window.confirm(
        `${sirket!.ad} için zorunlu olsun mu? Kurmamış kişiler 15 dakika içinde oturumdan çıkar ve yeniden girişte kurmaları istenir.`,
      )
    ) {
      return;
    }
    setBekliyor(true);
    setHata(null);
    try {
      await apiFetch('/auth/2fa/sirket', { method: 'PATCH', body: JSON.stringify({ zorunlu }) });
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <Kart>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">İki adımlı doğrulama</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {sirket.zorunlu
              ? `${sirket.ad} şirketinin kullanıcıları girişte telefon kodu kullanıyor.`
              : `${sirket.ad} şirketinde isteğe bağlı. Zorunlu yaparsan kurmamış kişiler bir sonraki girişte kurar.`}
          </p>
          {/*
            KAPSAM AÇIKÇA YAZIYOR (Ö-2). Zorunluluk kullanıcının EV şirketinden
            okunuyor (2FA.md K-4): bu şirkete başka şirketten erişen ajans
            personeli bu ayara değil kendi şirketininkine tabi. Yazmasaydı
            yönetici "zorunlu yaptım" deyip ajans personelini de korunuyor
            sanırdı.
          */}
          <p className="mt-1 text-xs text-ink-muted">
            Zorunluluk yalnız bu şirketin kendi kullanıcılarına uygulanır. Başka şirketten erişen
            ajans personeli kendi şirketinin ayarına tabidir.
          </p>
        </div>
        {sirket.degistirebilir && (
          <Dugme
            ton={sirket.zorunlu ? 'ikincil' : 'koyu'}
            boyut="kucuk"
            disabled={bekliyor}
            onClick={() => void degistir(!sirket.zorunlu)}
          >
            {bekliyor ? 'Kaydediliyor…' : sirket.zorunlu ? 'Zorunluluğu kaldır' : 'Zorunlu yap'}
          </Dugme>
        )}
      </div>
      {hata && (
        <p role="alert" className="mt-3 text-sm text-danger-strong">
          {hata}{' '}
          {!durum.acik && (
            <Link href={ayarlarAdresi('hesabim', { capa: 'guvenlik' })} className="font-medium text-brand-strong hover:underline">
              Hesabım
            </Link>
          )}
        </p>
      )}
    </Kart>
  );
}
