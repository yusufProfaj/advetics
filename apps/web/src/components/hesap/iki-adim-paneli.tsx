'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IKI_ADIM_KURTARMA_SAYISI,
  bicimKodu,
  ikiAdimKodTuru,
  type IkiAdimDurumu,
  type IkiAdimKurtarmaKodlari,
  type IkiAdimKurulumBilgisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan } from '@/components/auth/alan';
import { HataKutusu, KodAlani, KurtarmaKodlari, QrKurulumu } from './iki-adim-parcalari';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Rozet } from '@/components/ui/rozet';
import { Serit } from '@/components/ui/hal';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ikiAdimSozlugu } from '@/dil/sozlukler/iki-adim';
import { hesabimSozlugu } from '@/dil/sozlukler/ayarlar-hesabim';

function hataMetni(err: unknown, yedek: string): string {
  return err instanceof ApiRequestError ? err.message : yedek;
}

/** Kurtarma kodu bu sayıya inince uyarı: biri kaldığında uyarmak geç. */
const AZ_KOD = 3;

type Mod =
  | { tur: 'bos' }
  | { tur: 'kurulum'; bilgi: IkiAdimKurulumBilgisi }
  | { tur: 'kapat' }
  | { tur: 'yenile' }
  | { tur: 'kodlar'; kodlar: string[] };


/**
 * ═══ HESABIM › İKİ ADIMLI DOĞRULAMA ═══
 *
 * Google hesabının "2 Adımlı Doğrulama" sayfasının mantığı: durum tek
 * cümleyle en üstte, tek birincil eylem (Aç ya da Kapat), ikincil eylem
 * (kurtarma kodları) altta. Her eylem kartın İÇİNDE açılıyor; ayrı sayfa
 * yok — kullanıcı nerede olduğunu kaybetmesin.
 *
 * Kapatma ve kod yenileme GEÇERLİ KOD istiyor: açık kalmış bir tarayıcıya
 * oturan biri korumayı kaldıramamalı.
 */
export function IkiAdimPaneli({
  durum,
  kurtarmaIleGirdi,
}: {
  durum: IkiAdimDurumu;
  /** Girişte kurtarma kodu kullanıldı (`?kurtarma=1`). */
  kurtarmaIleGirdi: boolean;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const ortak = useSozluk(ikiAdimSozlugu);
  const d = useSozluk(hesabimSozlugu).ikiAdim;
  const [mod, setMod] = useState<Mod>({ tur: 'bos' });
  const [kod, setKod] = useState('');
  /*
   * PAROLA YALNIZ KURULUM ONAYINDA (Ö-1). Oturum çerezi çalınmışsa saldırgan
   * kendi telefonuyla 2FA kurup hesabı kalıcı ele geçirebilirdi; sunucu bu
   * adımda parolayı yeniden istiyor.
   */
  const [parola, setParola] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);

  function sifirla(yeni: Mod = { tur: 'bos' }) {
    setMod(yeni);
    setKod('');
    setParola('');
    setHata(null);
  }

  async function calistir(fn: () => Promise<void>) {
    setBekliyor(true);
    setHata(null);
    setBilgi(null);
    try {
      await fn();
    } catch (err) {
      setHata(hataMetni(err, ortak.baglantiYok));
    } finally {
      setBekliyor(false);
    }
  }

  const baslat = () =>
    calistir(async () => {
      const b = await apiFetch<IkiAdimKurulumBilgisi>('/auth/2fa/kurulum', { method: 'POST' });
      sifirla({ tur: 'kurulum', bilgi: b });
    });

  const onayla = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata(d.kodYaz);
    if (parola === '') return setHata(d.sifreYaz);
    void calistir(async () => {
      const r = await apiFetch<IkiAdimKurtarmaKodlari>('/auth/2fa/kurulum/onay', {
        method: 'POST',
        body: JSON.stringify({ kod, parola }),
      });
      sifirla({ tur: 'kodlar', kodlar: r.kurtarmaKodlari });
    });
  };

  const kapat = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) === null) return setHata(d.kodYaDaKurtarma);
    void calistir(async () => {
      await apiFetch('/auth/2fa/kapat', { method: 'POST', body: JSON.stringify({ kod }) });
      sifirla();
      setBilgi(d.kapatildi);
      router.refresh();
    });
  };

  const yenile = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata(d.kodYaz);
    void calistir(async () => {
      const r = await apiFetch<IkiAdimKurtarmaKodlari>('/auth/2fa/kurtarma-kodlari', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      sifirla({ tur: 'kodlar', kodlar: r.kurtarmaKodlari });
    });
  };

  const azKaldi = durum.acik && durum.kalanKurtarmaKodu <= AZ_KOD;

  /*
   * KARTIN İÇİNDE KIRMIZI DOLU DÜĞME YOK (BILESENLER § 3.3): sayfanın tek
   * birincil eylemi başlıkta. Kartın eylemleri `koyu` (asıl iş) ve
   * `ikincil`; eskiden burada elle yazılmış bir kırmızı düğme vardı.
   */
  return (
    <Kart
      baslik={ortak.baslik}
      /* Yeşil yalnız durum göstergesinde (kılavuz): `Rozet`. */
      eylem={<Rozet hal={durum.acik ? 'ok' : 'hata'}>{durum.acik ? d.acik : d.kapali}</Rozet>}
    >
      <div className="grid gap-4">
        <p className="m-0 text-14 text-ink-muted">{d.aciklama}</p>

        {bilgi && (
          <Serit ton="bilgi" baslik={bilgi} />
        )}

        {(kurtarmaIleGirdi || azKaldi) && durum.acik && mod.tur === 'bos' && (
          <Serit
            baslik={
              durum.kalanKurtarmaKodu === 0
                ? d.hicKodYok
                : d.kodKaldi(durum.kalanKurtarmaKodu)
            }
          />
        )}

        {mod.tur === 'bos' && !durum.acik && (
          <div className="grid gap-3">
            {durum.sirketteZorunlu && (
              <Serit baslik={d.sirketZorunlu} />
            )}
            <HataKutusu mesaj={hata} />
            <div className="flex justify-end">
              <Dugme ton="koyu" onClick={() => void baslat()} bekliyor={bekliyor}>
                {d.ac}
              </Dugme>
            </div>
          </div>
        )}

        {mod.tur === 'bos' && durum.acik && (
          <div className="grid gap-4">
            <dl className="m-0 grid gap-x-6 gap-y-2 text-14 sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-muted">{d.acildigiTarih}</dt>
              <dd className="m-0 text-ink">
                {durum.acilis
                  ? new Date(durum.acilis).toLocaleDateString(bicimKodu(dil), { dateStyle: 'medium' })
                  : '-'}
              </dd>
              <dt className="text-ink-muted">{d.kurtarmaKodlari}</dt>
              <dd className="m-0 text-ink">
                {d.kullanilmadi(durum.kalanKurtarmaKodu, IKI_ADIM_KURTARMA_SAYISI)}
              </dd>
            </dl>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {durum.sirketteZorunlu ? (
                <p className="m-0 mr-auto text-12 text-ink-muted">{d.kapatilamaz}</p>
              ) : (
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => sifirla({ tur: 'kapat' })}>
                  {d.kapat}
                </Dugme>
              )}
              <Dugme ton="koyu" boyut="kucuk" onClick={() => sifirla({ tur: 'yenile' })}>
                {d.yeniKodlar}
              </Dugme>
            </div>
          </div>
        )}

        {mod.tur === 'kurulum' && (
          <form onSubmit={onayla} className="grid gap-4" noValidate>
            <QrKurulumu bilgi={mod.bilgi} />
            <HataKutusu mesaj={hata} />
            <div className="max-w-xs">
              <KodAlani id="hesapKurulumKod" value={kod} onChange={setKod} disabled={bekliyor} />
            </div>
            <div className="max-w-xs">
              <Alan
                id="hesapKurulumParola"
                label={d.sifren}
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={setParola}
                disabled={bekliyor}
                ipucu={d.sifreIpucu}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Dugme ton="ikincil" onClick={() => sifirla()}>
                {d.vazgec}
              </Dugme>
              <Dugme type="submit" ton="koyu" bekliyor={bekliyor}>
                {d.ac}
              </Dugme>
            </div>
          </form>
        )}

        {(mod.tur === 'kapat' || mod.tur === 'yenile') && (
          <form onSubmit={mod.tur === 'kapat' ? kapat : yenile} className="grid gap-3" noValidate>
            <p className="m-0 text-14 text-ink">
              {mod.tur === 'kapat'
                ? d.kapatAciklama
                : d.yenileAciklama}
            </p>
            <HataKutusu mesaj={hata} />
            <div className="max-w-xs">
              <KodAlani
                id="hesapKod"
                value={kod}
                onChange={setKod}
                kurtarma={mod.tur === 'kapat' && /[a-z]/i.test(kod)}
                disabled={bekliyor}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Dugme ton="ikincil" onClick={() => sifirla()}>
                {d.vazgec}
              </Dugme>
              <Dugme type="submit" ton={mod.tur === 'kapat' ? 'tehlike' : 'koyu'} bekliyor={bekliyor}>
                {mod.tur === 'kapat' ? d.kapat : d.olustur}
              </Dugme>
            </div>
          </form>
        )}

        {mod.tur === 'kodlar' && (
          <KurtarmaKodlari
            kodlar={mod.kodlar}
            devamEtiketi={d.tamam}
            onDevam={() => {
              sifirla();
              router.refresh();
            }}
          />
        )}
      </div>
    </Kart>
  );
}
