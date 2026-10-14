'use client';

import { useEffect, useId, useState } from 'react';
import {
  KURULUM_ADIM_ADI,
  type DonusumTetigi,
  type KurulumAdimSonucu,
  type KurulumAdimi,
  type KurulumIstegi,
  type KurulumSecenekleri,
  type KurulumYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PANEL_KAPILARI } from '@/lib/panel-adresleri';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Girdi, Secim } from '@/components/ui/alan';
import { AramaliSecim } from '@/components/ui/aramali-secim';
import { Uyari } from '@/components/ui/uyari';
import { Serit } from '@/components/ui/hal';
import { HESAP_ADIMLARI } from './kurulum-listesi-mantik';
import { DurumRozeti } from './kurulum-yardimcilari';
import {
  AD_ISTEYEN,
  DEGISIM_SONUCU,
  DURUM_GOSTERIMI,
  KONTROL_ISTEGI,
  gelistiriciEpostasi,
  izinDonusu,
  otomatikIstek,
  secimIstegi,
  type SecimFormu,
} from './kurulum-mantik';

/**
 * ═══ KURULUM ADIMININ SATIRI VE PANELLERİ (docs/kurulum/MIMARI.md) ═══
 *
 * Eskiden bu dosya Kurulum bölümünün TAMAMIYDI: kendi sayacı, kendi "Eksikleri
 * tamamla" düğmesi ve üç grup. 2026-10-13'ten beri tek liste
 * `kurulum-listesi.tsx`te (docs/panel-sadelestirme/MIMARI.md § 7); burada
 * yalnız bir kurulum parçasının satırı (durum, neden, tek eylem) ve seçim /
 * tetik / site kodu panelleri kaldı. Kararlar sunucuda (`kurulum-durum.ts`).
 *
 * İKİ KAPI (MIMARI Ç-20): hesap seçen ve açan adımlar (`HESAP_ADIMLARI`)
 * havuz atamasıyla AYNI kapıyı (`kurulum.hesap`) istiyor; diğerleri
 * `kurulum.yaz`. Tek bayrakla çizmek, `connection.manage` taşımayan birine
 * tıklayınca 403 alacağı bir düğme göstermek demekti.
 *
 * Bir adımın isteği düşerse o adımın altında platformun mesajı yazar
 * (`.catch(() => setX([]))` yasağı).
 */
const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

export function AdimSatiri({
  a,
  v,
  clientId,
  yazabilir,
  hesapYazabilir,
  guncelle,
  izinDonusAdresi,
}: {
  a: KurulumAdimi;
  v: KurulumYaniti;
  clientId: string;
  /** `kurulum.yaz`. */
  yazabilir: boolean;
  /** `kurulum.hesap` — hesap seçen/açan adımlar için (Ç-20). */
  hesapYazabilir: boolean;
  guncelle: (v: KurulumYaniti) => void;
  /**
   * OAuth izin dönüşü. Verilmezse Marka Merkezi › Kurulum (`izinDonusu`).
   * Sihirbaz KENDİ adresini veriyor: yoksa "Ölçüm izinlerini ver"den dönen
   * kullanıcı sihirbazdan çıkıp listeye düşer ve kaldığı adımı arar.
   */
  izinDonusAdresi?: string;
}) {
  const eylemYetkisi = HESAP_ADIMLARI.has(a.kod) ? hesapYazabilir : yazabilir;
  const [acik, setAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const d = DURUM_GOSTERIMI[a.durum];

  async function gonder(istek: KurulumIstegi) {
    setGonderiliyor(true);
    setHata(null);
    setBilgi(null);
    try {
      const r = await apiFetch<KurulumYaniti & { sonuc: KurulumAdimSonucu | null }>(`/clients/${clientId}/kurulum/adim`, { method: 'POST', body: JSON.stringify(istek) });
      guncelle(r);
      if (r.sonuc?.mesaj) setBilgi(r.sonuc.mesaj);
      setAcik(false);
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  }

  async function izinVer(baglantiId: string) {
    setGonderiliyor(true);
    setHata(null);
    try {
      const r = await apiFetch<{ authorizeUrl: string }>(
        `/connections/${baglantiId}/reauthorize?platform=google&kapsam=olcum&donus=${encodeURIComponent(izinDonusAdresi ?? izinDonusu(clientId))}`,
        { method: 'POST' },
      );
      window.location.href = r.authorizeUrl;
    } catch (e) {
      setHata(hataMetni(e));
      setGonderiliyor(false);
    }
  }

  const e = a.eylem;
  const kontrol = KONTROL_ISTEGI[a.kod];
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="mt-0.5 shrink-0">
          <DurumRozeti durum={a.durum} etiket={d.etiket} />
        </span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="font-medium text-ink">
            {KURULUM_ADIM_ADI[a.kod]} <span className="font-normal text-ink-muted">· {a.baslik}</span>
          </p>
          <p className="text-xs text-ink-muted">{a.neden}</p>
          {/* Kapı kapalıysa düğme yerine NEDEN (boş alan değil, MIMARI § 6). */}
          {!eylemYetkisi && e && (
            <p className="text-xs text-ink-muted">{HESAP_ADIMLARI.has(a.kod) ? PANEL_KAPILARI['kurulum.hesap'].neden : PANEL_KAPILARI['kurulum.yaz'].neden}</p>
          )}
        </div>
        {eylemYetkisi && e && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {e.tur === 'dis' && (
              <a href={e.adres} target="_blank" rel="noopener noreferrer" className={dugmeSinifi('ikincil', 'kucuk')}>
                {e.etiket} ↗
              </a>
            )}
            {kontrol && (
              <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} onClick={() => void gonder(kontrol)}>
                Kontrol et
              </Dugme>
            )}
            {e.tur === 'izin' && (
              <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void izinVer(e.baglantiId)}>
                {e.etiket}
              </Dugme>
            )}
            {e.tur === 'otomatik' &&
              (() => {
                const istek = otomatikIstek(a.kod, v.donusumTetigi);
                return istek ? (
                  <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void gonder(istek)}>
                    {e.etiket}
                  </Dugme>
                ) : null;
              })()}
            {(e.tur === 'secim' || e.tur === 'girdi') && (
              <Dugme boyut="kucuk" ton={acik || a.durum === 'tamam' ? 'ikincil' : 'koyu'} onClick={() => setAcik((x) => !x)} aria-expanded={acik}>
                {acik ? 'Vazgeç' : e.etiket}
              </Dugme>
            )}
          </div>
        )}
      </div>
      {hata && (
        <p role="alert" className="mt-2 text-xs text-danger-strong">
          {hata}
        </p>
      )}
      {bilgi && !hata && (
        <p role="status" className="mt-2 text-xs text-ink">
          {bilgi}
        </p>
      )}
      {acik && e?.tur === 'secim' && (
        <SecimPaneli
          kod={a.kod}
          clientId={clientId}
          workspaceAdi={v.workspaceAdi}
          simdiki={a.durum === 'tamam' ? a.baslik : null}
          gonderiliyor={gonderiliyor}
          gonder={(i) => void gonder(i)}
        />
      )}
      {acik && e?.tur === 'girdi' && a.kod === 'gtm_etiket' && <TetikFormu mevcut={v.donusumTetigi} gonderiliyor={gonderiliyor} gonder={(t) => void gonder({ kod: 'gtm_etiket', tetik: t })} />}
      {a.kod === 'site_kodu' && v.siteKodu && a.durum !== 'tamam' && <SiteKodu kod={v.siteKodu} site={v.site} />}
    </li>
  );
}

// Arama kutusunun neyi aradığı; listede olmayan adımda genel ad.
const ARAMA_NESNESI: Partial<Record<KurulumAdimi['kod'], string>> = {
  meta_hesap: 'Reklam hesabı',
  google_hesap: 'Reklam hesabı',
  sayfa: 'Sayfa',
  gtm_konteyner: 'Konteyner',
  ga4_mulk: 'Mülk',
  meta_piksel: 'Piksel',
};
const aramaNesnesi = (kod: KurulumAdimi['kod']) => ARAMA_NESNESI[kod] ?? 'Seçenek';

function SecimPaneli({
  kod,
  clientId,
  workspaceAdi,
  simdiki,
  gonderiliyor,
  gonder,
}: {
  kod: KurulumAdimi['kod'];
  clientId: string;
  workspaceAdi: string;
  /** Tamamlanmış adım değiştiriliyorsa şu anki seçim (`a.baslik`); değilse null. */
  simdiki: string | null;
  gonderiliyor: boolean;
  gonder: (i: KurulumIstegi) => void;
}) {
  const [s, setS] = useState<{ tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; v: KurulumSecenekleri }>({ tur: 'yukleniyor' });
  const [mevcut, setMevcut] = useState('');
  const [ust, setUst] = useState('');
  const [ad, setAd] = useState(workspaceAdi);
  const [musteriNo, setMusteriNo] = useState('');
  const [yeniOnay, setYeniOnay] = useState(false);
  const onayBaslik = useId();
  const onayDugmesi = useId();

  // Onay açılınca odak onay düğmesine: klavyeyle gelen kişi ne onayladığını okusun.
  useEffect(() => {
    if (yeniOnay) document.getElementById(onayDugmesi)?.focus();
  }, [yeniOnay, onayDugmesi]);

  useEffect(() => {
    let iptal = false;
    apiFetch<KurulumSecenekleri>(`/clients/${clientId}/kurulum/secenekler?kod=${kod}`).then(
      (v) => {
        if (iptal) return;
        setS({ tur: 'geldi', v });
        setUst(v.ustler[0]?.deger ?? '');
      },
      (e: unknown) => !iptal && setS({ tur: 'hata', mesaj: hataMetni(e) }),
    );
    return () => {
      iptal = true;
    };
  }, [clientId, kod]);

  if (s.tur === 'yukleniyor') return <p className="mt-3 text-xs text-ink-muted">Seçenekler platformdan okunuyor…</p>;
  if (s.tur === 'hata') {
    return (
      <div className="mt-3">
        <Serit ton="hata" baslik="Seçenekler alınamadı">
          {s.mesaj}
        </Serit>
      </div>
    );
  }
  const v = s.v;
  const istek = (f: SecimFormu) => {
    const i = secimIstegi(kod, f);
    if (i) gonder(i);
  };
  const yeniEtiket = kod === 'meta_piksel' ? 'Yeni piksel aç' : kod === 'gtm_konteyner' ? 'Yeni konteyner aç' : kod === 'ga4_mulk' ? 'Yeni mülk aç' : 'Yeni hesap aç';
  const pikselYeni = kod === 'meta_piksel';

  return (
    <div className="mt-3 grid gap-3 rounded-alan border border-line p-3 md:grid-cols-2">
      {simdiki && (
        <div className="md:col-span-2">
          <Serit ton="uyari" baslik={`Şu an: ${simdiki}`}>
            {DEGISIM_SONUCU[kod] ?? 'Yeni seçim eskisinin yerine geçer.'}
          </Serit>
        </div>
      )}
      {v.not && <p className="text-xs text-ink-muted md:col-span-2">{v.not}</p>}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink">Mevcut olanı kullan</p>
        {v.mevcut.length === 0 ? (
          <p className="text-xs text-ink-muted">Seçilebilecek bir şey yok.</p>
        ) : (
          <>
            {/*
              ARAMALI: ajansın tek kimliği yüzlerce mülk/hesap/sayfa görüyor ve
              düz açılır listede doğru satır bulunamıyordu. Yazılan metin adın,
              notun ya da kimliğin İÇİNDE geçiyorsa satır listede.
            */}
            <AramaliSecim secenekler={v.mevcut} deger={mevcut} onDegis={setMevcut} etiket={`Mevcut ${aramaNesnesi(kod).toLocaleLowerCase('tr')} ara`} yerTutucu={`${aramaNesnesi(kod)} adı, hesabı ya da numarasıyla ara`} />
            <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} disabled={!mevcut} onClick={() => istek({ tur: 'mevcut', deger: mevcut })}>
              Bunu kullan
            </Dugme>
          </>
        )}
      </div>
      {kod !== 'sayfa' && (pikselYeni || v.ustler.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">{yeniEtiket}</p>
          {!pikselYeni && (
            <Secim value={ust} onChange={(e) => setUst(e.target.value)} aria-label="Nerede açılsın">
              {v.ustler.map((o) => (
                <option key={o.deger} value={o.deger}>
                  {o.etiket}
                </option>
              ))}
            </Secim>
          )}
          {AD_ISTEYEN.has(kod) && <Girdi value={ad} onChange={(e) => setAd(e.target.value)} maxLength={100} aria-label="Hesap adı" placeholder="Proje adı" />}
          {/*
            GERÇEK HESAP AÇAN DÜĞME ONAYSIZ ÇALIŞMAZ (MIMARI Ç-20 ⚠). Bir kez
            açılan reklam hesabı platformda kalıyor, para birimi ve saat
            dilimi sonradan değişmiyor; yanlış tık geri alınamıyor. Onay satır
            İÇİNDE ve DOM'dan çıkmıyor (görünürlük sınıfla değişiyor).
          */}
          <div className={yeniOnay ? 'hidden' : ''}>
            <Dugme
              boyut="kucuk"
              ton="ikincil"
              bekliyor={gonderiliyor}
              disabled={(!pikselYeni && !ust) || (AD_ISTEYEN.has(kod) && ad.trim().length < 2)}
              onClick={() => (AD_ISTEYEN.has(kod) ? setYeniOnay(true) : istek({ tur: 'yeni', ust, ad }))}
            >
              {yeniEtiket}
            </Dugme>
          </div>
          {AD_ISTEYEN.has(kod) && (
            <div
              role="alertdialog"
              aria-labelledby={onayBaslik}
              className={`space-y-2 rounded-alan border border-brand/40 p-3 transition-opacity duration-200 motion-reduce:transition-none ${yeniOnay ? 'opacity-100' : 'pointer-events-none hidden opacity-0'}`}
            >
              <p id={onayBaslik} className="text-xs font-semibold text-ink">
                “{ad.trim()}” adıyla gerçek bir reklam hesabı açılsın mı?
              </p>
              <p className="text-[11px] text-ink-muted">
                Hesap platformda kalır ve silinemez. Para birimi TRY, saat dilimi İstanbul; ikisi de sonradan değiştirilemez. Ödeme yöntemini şirket ekler.
              </p>
              <div className="flex flex-wrap gap-2">
                <Dugme id={onayDugmesi} ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} onClick={() => istek({ tur: 'yeni', ust, ad })}>
                  Hesabı aç
                </Dugme>
                <Dugme boyut="kucuk" ton="ikincil" disabled={gonderiliyor} onClick={() => setYeniOnay(false)}>
                  Vazgeç
                </Dugme>
              </div>
            </div>
          )}
          {AD_ISTEYEN.has(kod) && !yeniOnay && <p className="text-[11px] text-ink-muted">Gerçek bir reklam hesabı açılır; açmadan önce onay istenir.</p>}
        </div>
      )}
      {kod === 'google_hesap' && v.ustler.length > 0 && (
        <div className="space-y-2 md:col-span-2">
          <p className="text-xs font-semibold text-ink">Şirketin mevcut Google Ads hesabına bağlantı daveti</p>
          <div className="flex flex-wrap gap-2">
            <Girdi className="max-w-48" value={musteriNo} onChange={(e) => setMusteriNo(e.target.value)} placeholder="123-456-7890" aria-label="Google Ads hesap numarası" />
            <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} disabled={!/^\d{3}-?\d{3}-?\d{4}$/.test(musteriNo.trim()) || !ust} onClick={() => istek({ tur: 'davet', ust, musteriNo: musteriNo.trim() })}>
              Davet gönder
            </Dugme>
          </div>
          <p className="text-[11px] text-ink-muted">Şirket Google Ads › Yönetici hesaplar’dan daveti kabul eder; sonra hesap burada seçilebilir.</p>
        </div>
      )}
    </div>
  );
}

function TetikFormu({ mevcut, gonderiliyor, gonder }: { mevcut: DonusumTetigi | null; gonderiliyor: boolean; gonder: (t: DonusumTetigi) => void }) {
  const [formVar, setFormVar] = useState(mevcut ? mevcut.formYolu !== null : true);
  const [yol, setYol] = useState(mevcut?.formYolu ?? '');
  const [telefon, setTelefon] = useState(mevcut?.telefon ?? true);
  const [whatsapp, setWhatsapp] = useState(mevcut?.whatsapp ?? true);
  const yolGecerli = /^(https?:\/\/[^/]+)?\/[^\s]+$/.test(yol.trim()) && !/^(https?:\/\/[^/]+)?\/?$/.test(yol.trim());
  return (
    <div className="mt-3 space-y-3 rounded-alan border border-line p-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={formVar} onChange={(e) => setFormVar(e.target.checked)} className="mt-1" />
        <span>
          <span className="block text-sm text-ink">Form gönderilince teşekkür sayfası açılıyor</span>
          <span className="block text-xs text-ink-muted">Form dönüşümü bu sayfanın açılmasıyla sayılır. Teşekkür sayfası yoksa form dönüşümü kurulmaz.</span>
        </span>
      </label>
      {formVar && (
        <Girdi
          className="max-w-md"
          value={yol}
          onChange={(e) => setYol(e.target.value)}
          placeholder="/tesekkurler ya da sayfanın tam adresi"
          aria-label="Teşekkür sayfası"
        />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={telefon} onChange={(e) => setTelefon(e.target.checked)} /> Telefon numarasına tıklama dönüşüm sayılsın
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> WhatsApp bağlantısına tıklama dönüşüm sayılsın
      </label>
      <Dugme
        ton="koyu"
        boyut="kucuk"
        bekliyor={gonderiliyor}
        disabled={(formVar && !yolGecerli) || (!formVar && !telefon && !whatsapp)}
        onClick={() => gonder({ formYolu: formVar ? yol.trim() : null, telefon, whatsapp })}
      >
        Kaydet, etiketleri yaz ve yayınla
      </Dugme>
    </div>
  );
}

function SiteKodu({ kod, site }: { kod: NonNullable<KurulumYaniti['siteKodu']>; site: string | null }) {
  const [kopyalandi, setKopyalandi] = useState<string | null>(null);
  const [kopyaHatasi, setKopyaHatasi] = useState<string | null>(null);
  const kopyala = (ad: string, metin: string) =>
    navigator.clipboard.writeText(metin).then(
      () => {
        setKopyaHatasi(null);
        setKopyalandi(ad);
      },
      () => setKopyaHatasi('Tarayıcı panoya yazmaya izin vermedi; kodu seçip kopyala.'),
    );
  return (
    <div className="mt-3 space-y-3 rounded-alan border border-line p-3">
      {(
        [
          ['head', '1. Her sayfanın <head> bölümüne', kod.head],
          ['body', '2. <body> etiketinin hemen ardına', kod.body],
        ] as const
      ).map(([ad, baslik, metin]) => (
        <div key={ad} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{baslik}</p>
            <button type="button" className="text-xs font-semibold text-brand-strong hover:underline" onClick={() => void kopyala(ad, metin)}>
              {kopyalandi === ad ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-alan bg-surface-sunken p-2 text-[11px] leading-relaxed text-ink">{metin}</pre>
        </div>
      ))}
      {kopyaHatasi && <p className="text-xs text-danger-strong">{kopyaHatasi}</p>}
      <a href={gelistiriciEpostasi(site, kod.gtmKimligi, kod.head, kod.body)} className="inline-block text-xs font-semibold text-brand-strong hover:underline">
        Geliştiriciye e-postayla gönder
      </a>
      <p className="text-[11px] text-ink-muted">WordPress’te "Site Kit by Google" ya da "GTM4WP" eklentisine yalnız {kod.gtmKimligi} yazmak yeterli.</p>
    </div>
  );
}
