'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ikiAdimKodTuru,
  type IkiAdimGirisSonucu,
  type IkiAdimKurtarmaKodlari,
  type IkiAdimKurulumBilgisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { ayarlarAdresi } from '@/lib/panel-adresleri';
import { HataKutusu, KodAlani, KurtarmaKodlari, QrKurulumu } from '@/components/hesap/iki-adim-parcalari';
import { Dugme } from '@/components/ui/dugme';
import { KART_BAGLANTISI } from '@/components/ui/kart';

function hataMetni(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Bağlantı kurulamadı. Tekrar dene.';
}

/**
 * ═══ GİRİŞİN İKİNCİ ADIMI ═══
 *
 * Parola doğru girildi; tarayıcıda yalnızca beş dakikalık ara çerez var
 * (httpOnly, bu bileşen onu görmüyor). Oturum çerezi ancak buradaki uç
 * başarılı olunca yazılıyor.
 *
 *   · `dogrula` — 2FA açık: kodu sor. Kurtarma koduna geçiş bir bağlantı:
 *     telefonu kaybolmuş kullanıcının tek yolu bu ve gizli olmamalı.
 *   · `kurulum` — şirket zorunlu tuttu, kullanıcı kurmamış: QR'ı göster,
 *     kodla onayla, kurtarma kodlarını göster, sonra panele geç.
 *
 * "Geri" ara çerezi silmiyor (silmek için sunucuya gitmek gerekirdi);
 * beş dakikada kendiliğinden ölüyor ve yeniden girişte üzerine yazılıyor.
 */
export function IkiAdimGiris({
  amac,
  sonraki,
  onGeri,
}: {
  amac: 'dogrula' | 'kurulum';
  sonraki: string;
  onGeri: () => void;
}) {
  return amac === 'dogrula' ? (
    <KodDogrula sonraki={sonraki} onGeri={onGeri} />
  ) : (
    <GiristeKurulum sonraki={sonraki} onGeri={onGeri} />
  );
}

function KodDogrula({ sonraki, onGeri }: { sonraki: string; onGeri: () => void }) {
  const router = useRouter();
  const [kurtarma, setKurtarma] = useState(false);
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    // BİÇİM GİRİŞTE SINANIYOR: bozuk biçim sunucuya gitmiyor ve deneme
    // hakkı yemiyor (sunucu da aynı kuralla reddediyor, sayaç artmıyor).
    const tur = ikiAdimKodTuru(kod);
    if (tur === null || (kurtarma && tur !== 'kurtarma') || (!kurtarma && tur !== 'totp')) {
      setHata(kurtarma ? 'Kurtarma kodu xxxx-xxxx-xxxx biçiminde olmalı.' : '6 haneli kodu yaz.');
      return;
    }
    setBekliyor(true);
    try {
      const r = await apiFetch<IkiAdimGirisSonucu>('/auth/2fa/giris', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      // KURTARMA KODUYLA GİRDİYSE Hesabım'a: kalan kod sayısını ve yeni
      // kod üretme yolunu görsün. Panele gitseydi kodların azaldığını
      // ancak sonuncusu bittiğinde öğrenirdi.
      router.replace(r.kurtarmaKoduKullanildi ? ayarlarAdresi('hesabim', { kurtarma: true }) : sonraki);
      router.refresh();
    } catch (err) {
      setHata(hataMetni(err));
      setBekliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4" noValidate>
      <div>
        <p className="m-0 font-bold text-ink">İki adımlı doğrulama</p>
        <p className="m-0 mt-0.5 text-14 text-ink-muted">
          {kurtarma
            ? 'Kaydettiğin kurtarma kodlarından birini yaz.'
            : 'Telefonundaki doğrulama uygulamasını aç ve gösterdiği kodu yaz.'}
        </p>
      </div>
      <HataKutusu mesaj={hata} />
      <KodAlani
        id="ikiAdimKod"
        value={kod}
        onChange={setKod}
        kurtarma={kurtarma}
        disabled={bekliyor}
        autoFocus
      />
      <Dugme type="submit" className="w-full" bekliyor={bekliyor}>
        {bekliyor ? 'Doğrulanıyor…' : 'Doğrula'}
      </Dugme>
      <div className="flex items-center justify-between gap-3 text-14">
        <button
          type="button"
          onClick={() => {
            setKurtarma((k) => !k);
            setKod('');
            setHata(null);
          }}
          className={`${KART_BAGLANTISI} text-left`}
        >
          {kurtarma ? 'Uygulamadaki kodu kullan' : 'Telefonun yanında değil mi? Kurtarma kodu kullan'}
        </button>
        <Dugme ton="hayalet" boyut="kucuk" onClick={onGeri}>
          Geri
        </Dugme>
      </div>
    </form>
  );
}

function GiristeKurulum({ sonraki, onGeri }: { sonraki: string; onGeri: () => void }) {
  const router = useRouter();
  /*
   * DÖRT HÂL AYRI: yükleniyor, yüklenemedi, QR hazır, kodlar gösteriliyor.
   * Yükleme hatası boş bir QR alanına çevrilmiyor (CLAUDE.md, sessiz hata):
   * ara çerezin süresi dolduysa bu, kullanıcının yapacağı işi değiştiriyor.
   */
  const [bilgi, setBilgi] = useState<IkiAdimKurulumBilgisi | null>(null);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [kod, setKod] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [kodlar, setKodlar] = useState<string[] | null>(null);

  useEffect(() => {
    let iptal = false;
    apiFetch<IkiAdimKurulumBilgisi>('/auth/2fa/giris/kurulum', { method: 'POST' })
      .then((b) => {
        if (!iptal) setBilgi(b);
      })
      .catch((err: unknown) => {
        if (!iptal) setYuklemeHatasi(hataMetni(err));
      });
    return () => {
      iptal = true;
    };
  }, []);

  async function onayla(e: React.FormEvent) {
    e.preventDefault();
    setHata(null);
    if (ikiAdimKodTuru(kod) !== 'totp') {
      setHata('Uygulamadaki 6 haneli kodu yaz.');
      return;
    }
    setBekliyor(true);
    try {
      const r = await apiFetch<IkiAdimKurtarmaKodlari>('/auth/2fa/giris/kurulum/onay', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      setKodlar(r.kurtarmaKodlari);
    } catch (err) {
      setHata(hataMetni(err));
    } finally {
      setBekliyor(false);
    }
  }

  if (kodlar) {
    return (
      <KurtarmaKodlari
        kodlar={kodlar}
        devamEtiketi="Panele geç"
        onDevam={() => {
          router.replace(sonraki);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="m-0 font-bold text-ink">İki adımlı doğrulamayı kur</p>
        <p className="m-0 mt-0.5 text-14 text-ink-muted">
          Şirketin bu korumayı zorunlu tutuyor. Bir kez kurarsın, sonraki girişlerde telefonundaki
          kodu yazarsın.
        </p>
      </div>

      {yuklemeHatasi ? (
        <>
          <HataKutusu mesaj={yuklemeHatasi} />
          <button type="button" onClick={onGeri} className={`${KART_BAGLANTISI} text-left`}>
            Giriş ekranına dön
          </button>
        </>
      ) : !bilgi ? (
        <p className="m-0 text-14 text-ink-muted" aria-live="polite">
          QR kodu hazırlanıyor…
        </p>
      ) : (
        <form onSubmit={onayla} className="grid gap-4" noValidate>
          <QrKurulumu bilgi={bilgi} />
          <HataKutusu mesaj={hata} />
          <KodAlani id="kurulumKod" value={kod} onChange={setKod} disabled={bekliyor} />
          <Dugme type="submit" className="w-full" bekliyor={bekliyor}>
            {bekliyor ? 'Kontrol ediliyor…' : 'Kur ve devam et'}
          </Dugme>
          <div>
            <Dugme ton="hayalet" boyut="kucuk" onClick={onGeri}>
              Geri
            </Dugme>
          </div>
        </form>
      )}
    </div>
  );
}
