'use client';

import { useState } from 'react';
import { IKI_ADIM_HANE, type IkiAdimKurulumBilgisi } from '@advetics/shared';

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

/** Ekranda gösterilen hata. Platformun (API'nin) kendi cümlesi olduğu gibi. */
export function HataKutusu({ mesaj }: { mesaj: string | null }) {
  if (!mesaj) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong"
    >
      {mesaj}
    </div>
  );
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
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {kurtarma ? 'Kurtarma kodu' : `${IKI_ADIM_HANE} haneli kod`}
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
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-lg tracking-widest text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
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
    <ol className="space-y-4 text-sm text-ink">
      <li>
        <p className="font-medium">1. Telefonuna bir doğrulama uygulaması kur</p>
        <p className="mt-0.5 text-ink-muted">
          Google Authenticator ya da Microsoft Authenticator olur. İkisi de ücretsiz.
        </p>
      </li>
      <li>
        <p className="font-medium">2. Uygulamada bu kodu tara</p>
        <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bilgi.qrAdresi}
            alt="Doğrulama uygulaması için QR kodu"
            width={176}
            height={176}
            className="h-44 w-44 rounded-lg border border-line bg-white p-1"
          />
          <div className="min-w-0 text-ink-muted">
            <p>Uygulamada “+” ya da “Hesap ekle” seç, sonra “QR kodu tara”.</p>
            <button
              type="button"
              onClick={() => setAnahtarAcik((a) => !a)}
              aria-expanded={anahtarAcik}
              className="mt-2 text-sm font-medium text-brand-strong hover:underline"
            >
              Tarayamıyor musun? Kodu elle yaz
            </button>
            {anahtarAcik && (
              <div className="mt-2 space-y-2">
                <code className="block break-all rounded-lg border border-line bg-surface-muted px-3 py-2 font-mono text-sm text-ink">
                  {bilgi.anahtar}
                </code>
                <button
                  type="button"
                  onClick={() => void kopyala()}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken"
                >
                  {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
                </button>
                {kopyaHatasi && (
                  <p className="text-xs text-danger">Kopyalanamadı. Kodu seçip elle kopyala.</p>
                )}
                <p className="text-xs">Uygulamada “Kurulum anahtarı gir” seçeneğini kullan.</p>
              </div>
            )}
          </div>
        </div>
      </li>
      <li>
        <p className="font-medium">3. Uygulamanın gösterdiği {IKI_ADIM_HANE} haneli kodu aşağıya yaz</p>
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
  const [kaydettim, setKaydettim] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [kopyaHatasi, setKopyaHatasi] = useState(false);
  const metin = `Advetics kurtarma kodları\nHer kod bir kez kullanılır.\n\n${kodlar.join('\n')}\n`;

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
    a.download = 'advetics-kurtarma-kodlari.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-ink">Kurtarma kodlarını sakla</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          Telefonunu kaybedersen bu kodlardan biriyle girersin. Her kod bir kez çalışır. Bu kodları
          bir daha göremezsin.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface-muted p-3 font-mono text-sm text-ink">
        {kodlar.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void kopyala()}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-sunken"
        >
          {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
        </button>
        <button
          type="button"
          onClick={indir}
          className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-sunken"
        >
          Dosya olarak indir
        </button>
      </div>
      {kopyaHatasi && <p className="text-xs text-danger">Kopyalanamadı. Kodları seçip elle kopyala.</p>}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={kaydettim}
          onChange={(e) => setKaydettim(e.target.checked)}
          className="h-4 w-4 rounded border-line"
        />
        Kodları güvenli bir yere kaydettim
      </label>
      <button
        type="button"
        onClick={onDevam}
        disabled={!kaydettim}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {devamEtiketi}
      </button>
    </div>
  );
}
