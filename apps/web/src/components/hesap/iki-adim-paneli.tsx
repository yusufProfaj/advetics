'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IKI_ADIM_KURTARMA_SAYISI,
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

function hataMetni(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı. Tekrar dene.';
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
      setHata(hataMetni(err));
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
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata('Uygulamadaki 6 haneli kodu yaz.');
    if (parola === '') return setHata('Onaylamak için şifreni yaz.');
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
    if (ikiAdimKodTuru(kod) === null) return setHata('6 haneli kodu ya da bir kurtarma kodunu yaz.');
    void calistir(async () => {
      await apiFetch('/auth/2fa/kapat', { method: 'POST', body: JSON.stringify({ kod }) });
      sifirla();
      setBilgi('İki adımlı doğrulama kapatıldı.');
      router.refresh();
    });
  };

  const yenile = (e: React.FormEvent) => {
    e.preventDefault();
    if (ikiAdimKodTuru(kod) !== 'totp') return setHata('Uygulamadaki 6 haneli kodu yaz.');
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
      baslik="İki adımlı doğrulama"
      /* Yeşil yalnız durum göstergesinde (kılavuz): `Rozet`. */
      eylem={<Rozet hal={durum.acik ? 'ok' : 'hata'}>{durum.acik ? 'Açık' : 'Kapalı'}</Rozet>}
    >
      <div className="grid gap-4">
        <p className="m-0 text-14 text-ink-muted">
          Girişte şifrenin yanında telefonundaki kodu da sorar. Şifren başkasının eline geçse bile hesabına
          giremez.
        </p>

        {bilgi && (
          <Serit ton="bilgi" baslik={bilgi} />
        )}

        {(kurtarmaIleGirdi || azKaldi) && durum.acik && mod.tur === 'bos' && (
          <Serit
            baslik={
              durum.kalanKurtarmaKodu === 0
                ? 'Hiç kurtarma kodun kalmadı. Yeni kodlar oluştur.'
                : `${durum.kalanKurtarmaKodu} kurtarma kodun kaldı. Yeni kodlar oluşturman iyi olur.`
            }
          />
        )}

        {mod.tur === 'bos' && !durum.acik && (
          <div className="grid gap-3">
            {durum.sirketteZorunlu && (
              <Serit baslik="Şirketin bu korumayı zorunlu tutuyor." />
            )}
            <HataKutusu mesaj={hata} />
            <div className="flex justify-end">
              <Dugme ton="koyu" onClick={() => void baslat()} bekliyor={bekliyor}>
                Aç
              </Dugme>
            </div>
          </div>
        )}

        {mod.tur === 'bos' && durum.acik && (
          <div className="grid gap-4">
            <dl className="m-0 grid gap-x-6 gap-y-2 text-14 sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-muted">Açıldığı tarih</dt>
              <dd className="m-0 text-ink">
                {durum.acilis
                  ? new Date(durum.acilis).toLocaleDateString('tr-TR', { dateStyle: 'medium' })
                  : '-'}
              </dd>
              <dt className="text-ink-muted">Kurtarma kodları</dt>
              <dd className="m-0 text-ink">
                {durum.kalanKurtarmaKodu} / {IKI_ADIM_KURTARMA_SAYISI} kullanılmadı
              </dd>
            </dl>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
              {durum.sirketteZorunlu ? (
                <p className="m-0 mr-auto text-12 text-ink-muted">
                  Şirketin zorunlu tuttuğu için kapatılamaz. Telefonunu değiştirdiysen yöneticine sıfırlat.
                </p>
              ) : (
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => sifirla({ tur: 'kapat' })}>
                  Kapat
                </Dugme>
              )}
              <Dugme ton="koyu" boyut="kucuk" onClick={() => sifirla({ tur: 'yenile' })}>
                Yeni kurtarma kodları oluştur
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
                label="Şifren"
                type="password"
                autoComplete="current-password"
                value={parola}
                onChange={setParola}
                disabled={bekliyor}
                ipucu="Güvenliğin için şifreni bir kez daha soruyoruz."
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Dugme ton="ikincil" onClick={() => sifirla()}>
                Vazgeç
              </Dugme>
              <Dugme type="submit" ton="koyu" bekliyor={bekliyor}>
                Aç
              </Dugme>
            </div>
          </form>
        )}

        {(mod.tur === 'kapat' || mod.tur === 'yenile') && (
          <form onSubmit={mod.tur === 'kapat' ? kapat : yenile} className="grid gap-3" noValidate>
            <p className="m-0 text-14 text-ink">
              {mod.tur === 'kapat'
                ? 'Kapatmak için uygulamadaki kodu ya da bir kurtarma kodunu yaz.'
                : 'Yeni kodlar oluşunca eski kurtarma kodların çalışmaz. Onaylamak için uygulamadaki kodu yaz.'}
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
                Vazgeç
              </Dugme>
              <Dugme type="submit" ton={mod.tur === 'kapat' ? 'tehlike' : 'koyu'} bekliyor={bekliyor}>
                {mod.tur === 'kapat' ? 'Kapat' : 'Oluştur'}
              </Dugme>
            </div>
          </form>
        )}

        {mod.tur === 'kodlar' && (
          <KurtarmaKodlari
            kodlar={mod.kodlar}
            devamEtiketi="Tamam"
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
