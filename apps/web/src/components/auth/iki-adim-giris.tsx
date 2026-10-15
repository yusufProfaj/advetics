'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IKI_ADIM_HANE,
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
import { useDil } from '@/dil/saglayici';
import { dilProfileYaz } from '@/dil/profil';
import { useSozluk } from '@/dil/saglayici';
import { ikiAdimSozlugu } from '@/dil/sozlukler/iki-adim';

function hataMetni(err: unknown, baglantiYok: string): string {
  return err instanceof ApiRequestError ? err.message : baglantiYok;
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
  const { dil } = useDil();
  const d = useSozluk(ikiAdimSozlugu);
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
      setHata(kurtarma ? d.kodBicimiKurtarma : d.kodBicimi(IKI_ADIM_HANE));
      return;
    }
    setBekliyor(true);
    try {
      const r = await apiFetch<IkiAdimGirisSonucu>('/auth/2fa/giris', {
        method: 'POST',
        body: JSON.stringify({ kod }),
      });
      await dilProfileYaz(dil);
      // KURTARMA KODUYLA GİRDİYSE Hesabım'a: kalan kod sayısını ve yeni
      // kod üretme yolunu görsün. Panele gitseydi kodların azaldığını
      // ancak sonuncusu bittiğinde öğrenirdi.
      router.replace(r.kurtarmaKoduKullanildi ? ayarlarAdresi('hesabim', { kurtarma: true }) : sonraki);
      router.refresh();
    } catch (err) {
      setHata(hataMetni(err, d.baglantiYok));
      setBekliyor(false);
    }
  }

  return (
    <form onSubmit={gonder} className="grid gap-4" noValidate>
      <div>
        <p className="m-0 font-bold text-ink">{d.baslik}</p>
        <p className="m-0 mt-0.5 text-14 text-ink-muted">
          {kurtarma ? d.kurtarmaYaz : d.uygulamaYaz}
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
        {bekliyor ? d.dogrulaniyor : d.dogrula}
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
          {kurtarma ? d.uygulamaKoduKullan : d.kurtarmaKullan}
        </button>
        <Dugme ton="hayalet" boyut="kucuk" onClick={onGeri}>
          {d.geri}
        </Dugme>
      </div>
    </form>
  );
}

function GiristeKurulum({ sonraki, onGeri }: { sonraki: string; onGeri: () => void }) {
  const { dil } = useDil();
  const d = useSozluk(ikiAdimSozlugu);
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
        if (!iptal) setYuklemeHatasi(hataMetni(err, d.baglantiYok));
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
      await dilProfileYaz(dil);
      setKodlar(r.kurtarmaKodlari);
    } catch (err) {
      setHata(hataMetni(err, d.baglantiYok));
    } finally {
      setBekliyor(false);
    }
  }

  if (kodlar) {
    return (
      <KurtarmaKodlari
        kodlar={kodlar}
        devamEtiketi={d.paneleGec}
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
        <p className="m-0 font-bold text-ink">{d.kurBaslik}</p>
        <p className="m-0 mt-0.5 text-14 text-ink-muted">
          {d.kurAciklama}
        </p>
      </div>

      {yuklemeHatasi ? (
        <>
          <HataKutusu mesaj={yuklemeHatasi} />
          <button type="button" onClick={onGeri} className={`${KART_BAGLANTISI} text-left`}>
            {d.girisEkraninaDon}
          </button>
        </>
      ) : !bilgi ? (
        <p className="m-0 text-14 text-ink-muted" aria-live="polite">
          {d.qrHazirlaniyor}
        </p>
      ) : (
        <form onSubmit={onayla} className="grid gap-4" noValidate>
          <QrKurulumu bilgi={bilgi} />
          <HataKutusu mesaj={hata} />
          <KodAlani id="kurulumKod" value={kod} onChange={setKod} disabled={bekliyor} />
          <Dugme type="submit" className="w-full" bekliyor={bekliyor}>
            {bekliyor ? d.kontrolEdiliyor : d.kurVeDevam}
          </Dugme>
          <div>
            <Dugme ton="hayalet" boyut="kucuk" onClick={onGeri}>
              {d.geri}
            </Dugme>
          </div>
        </form>
      )}
    </div>
  );
}
