'use client';

import { useState } from 'react';
import { IKI_ADIM_HANE, type IkiAdimKurulumBilgisi } from '@advetics/shared';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { ikiAdimSozlugu } from '@/dil/sozlukler/iki-adim';

/**
 * ═══ İKİ ADIMLI DOĞRULAMA — ORTAK EKRAN PARÇALARI ═══
 *
 * Giriş ekranı (şirket zorunlu tuttuğu için girişte kurulum) ve Hesabım
 * ekranı AYNI parçaları kullanıyor. İki kopya yazmak, birinde "QR
 * okunmuyorsa anahtarı elle yaz" yolunun bir gün unutulması demekti ve o
 * yol kamerası bozuk telefonla gelen kullanıcının TEK çıkışı.
 *
 * Kullanıcı reklam bilmiyor ve teknik değil: "TOTP", "otpauth", "base32"
 * hiçbir yerde yazmıyor. Uygulama adları örnek olarak veriliyor çünkü
 * "doğrulayıcı uygulama" tek başına bir şey ifade etmiyor.
 */

/**
 * Ekranda gösterilen hata. Platformun (API'nin) kendi cümlesi olduğu gibi.
 * Görünüş ortak şerit (sol kırmızı çizgi, siyah metin): kırmızı zeminli
 * kutu kılavuzda yok ve giriş ekranında da panelde de aynı görünmeli.
 */
export function HataKutusu({ mesaj }: { mesaj: string | null }) {
  if (!mesaj) return null;
  return <Serit ton="hata" baslik={mesaj} />;
}

/**
 * Kod giriş alanı.
 *
 * `autoComplete="one-time-code"`: iOS ve Android klavyesi kodu öneriyor.
 * `inputMode` kurtarma kodunda `text`: kurtarma kodu harf taşıyor ve sayı
 * klavyesi açmak onu yazılamaz yapardı.
 */
export function KodAlani({
  id,
  value,
  onChange,
  kurtarma = false,
  disabled,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  kurtarma?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const d = useSozluk(ikiAdimSozlugu);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-13 font-semibold text-ink">
        {kurtarma ? d.kurtarmaKodu : d.haneliKod(IKI_ADIM_HANE)}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={kurtarma ? 'off' : 'one-time-code'}
        inputMode={kurtarma ? 'text' : 'numeric'}
        maxLength={kurtarma ? 20 : 7}
        placeholder={kurtarma ? 'xxxx-xxxx-xxxx' : '123456'}
        spellCheck={false}
        className="h-12 w-full rounded-alan border border-line-strong bg-surface px-3 font-mono text-18 tracking-widest text-ink outline-none transition-colors focus:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-60"
      />
    </div>
  );
}

/**
 * Kurulumun ilk iki adımı: uygulama ve QR. Üçüncü adım (kodu yazmak)
 * çağıranın formunda, çünkü onayın gittiği uç iki ekranda farklı.
 *
 * QR `<img>` ile: SVG'yi HTML'e gömmek betik çalıştırabilen bir yüzey
 * açardı, `<img>` içindeki SVG çalıştıramaz. Zemin HER ZAMAN beyaz:
 * karanlık temada ters renkli QR'ı birçok uygulama okumuyor.
 */
export function QrKurulumu({ bilgi }: { bilgi: IkiAdimKurulumBilgisi }) {
  const d = useSozluk(ikiAdimSozlugu);
  const [anahtarAcik, setAnahtarAcik] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kopyaHatasi, setKopyaHatasi] = useState(false);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(bilgi.anahtar.replace(/\s+/g, ''));
      setKopyalandi(true);
      setKopyaHatasi(false);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      // Pano izni yoksa söyle; anahtar ekranda, elle seçilebiliyor.
      setKopyaHatasi(true);
    }
  }

  return (
    <ol className="m-0 grid list-none gap-4 p-0 text-14 text-ink">
      <li>
        <p className="m-0 font-bold">{d.adim1}</p>
        <p className="m-0 mt-0.5 text-ink-muted">
          {d.adim1Alt}
        </p>
      </li>
      <li>
        <p className="m-0 font-bold">{d.adim2}</p>
        <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bilgi.qrAdresi}
            alt={d.qrAlt}
            width={176}
            height={176}
            className="h-44 w-44 rounded-alan border border-line bg-white p-1"
          />
          <div className="min-w-0 text-ink-muted">
            <p className="m-0">{d.qrNasil}</p>
            <button
              type="button"
              onClick={() => setAnahtarAcik((a) => !a)}
              aria-expanded={anahtarAcik}
              className="mt-2 text-13 font-bold text-ink underline-offset-2 hover:text-brand-strong hover:underline"
            >
              {d.elleYaz}
            </button>
            {/* AÇILIR ÖĞE DOM'DA KALIYOR (`hidden`): kapanınca anahtar silinmiyor, gizleniyor. */}
            <div hidden={!anahtarAcik} className="mt-2">
              <div className="grid gap-2">
                <code className="block break-all rounded-alan border border-line bg-surface-muted px-3 py-2 font-mono text-14 text-ink">
                  {bilgi.anahtar}
                </code>
                <div>
                  <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kopyala()}>
                    {kopyalandi ? d.kopyalandi : d.kopyala}
                  </Dugme>
                </div>
                {kopyaHatasi && (
                  <p className="m-0 text-12 font-semibold text-danger-strong">{d.kopyalanamadiKod}</p>
                )}
                <p className="m-0 text-12">{d.anahtarGir}</p>
              </div>
            </div>
          </div>
        </div>
      </li>
      <li>
        <p className="m-0 font-bold">{d.adim3(IKI_ADIM_HANE)}</p>
      </li>
    </ol>
  );
}

/**
 * Kurtarma kodları — YALNIZCA BİR KEZ gösteriliyor.
 *
 * "Devam" düğmesi kutu işaretlenmeden açılmıyor: kodları görmeden geçen
 * kullanıcı telefonunu kaybettiği gün hesabına giremez ve bunu o gün
 * öğrenir. Dosya indirme tarayıcıda üretiliyor (sunucuya ikinci kez
 * gidilmiyor; kodlar sunucuda zaten yalnızca özet olarak duruyor).
 */
export function KurtarmaKodlari({
  kodlar,
  onDevam,
  devamEtiketi,
}: {
  kodlar: string[];
  onDevam: () => void;
  devamEtiketi: string;
}) {
  const d = useSozluk(ikiAdimSozlugu);
  const [kaydettim, setKaydettim] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kopyaHatasi, setKopyaHatasi] = useState(false);
  const metin = `${d.dosyaBasligi}\n\n${kodlar.join('\n')}\n`;

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      setKopyaHatasi(false);
    } catch {
      setKopyaHatasi(true);
    }
  }

  function indir() {
    const url = URL.createObjectURL(new Blob([metin], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = d.dosyaAdi;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="m-0 font-bold text-ink">{d.sakla}</p>
        <p className="m-0 mt-0.5 text-14 text-ink-muted">
          {d.saklaAlt}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 rounded-alan border border-line bg-surface-muted p-3 font-mono text-14 text-ink">
        {kodlar.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kopyala()}>
          {kopyalandi ? d.kopyalandi : d.kopyala}
        </Dugme>
        <Dugme ton="ikincil" boyut="kucuk" onClick={indir}>
          {d.indir}
        </Dugme>
      </div>
      {kopyaHatasi && (
        <p className="m-0 text-12 font-semibold text-danger-strong">{d.kopyalanamadiKodlar}</p>
      )}
      <label className="flex cursor-pointer items-center gap-2 text-14 text-ink">
        <input
          type="checkbox"
          checked={kaydettim}
          onChange={(e) => setKaydettim(e.target.checked)}
          className="h-4 w-4 accent-[var(--brand-primary)]"
        />
        {d.kaydettim}
      </label>
      {/*
        DEVAM KOYU, KIRMIZI DEĞİL: bu parça hem giriş ekranında hem Hesabım
        kartının içinde çiziliyor ve kart içinde kırmızı dolu düğme yok.
      */}
      <Dugme ton="koyu" className="w-full" onClick={onDevam} disabled={!kaydettim}>
        {devamEtiketi}
      </Dugme>
    </div>
  );
}
