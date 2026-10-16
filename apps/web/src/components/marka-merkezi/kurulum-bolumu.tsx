'use client';

import { useEffect, useId, useState } from 'react';
import {
  KURULUM_ADIM_ADI,
  kapiNedeni,
  type DonusumTetigi,
  type KurulumAdimSonucu,
  type KurulumAdimi,
  type KurulumIstegi,
  type KurulumSecenekleri,
  type KurulumYaniti,
  FORM_DINLEYICI_EKLENTILERI,
  formOlculuyor,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Girdi, Secim } from '@/components/ui/alan';
import { AramaliSecim } from '@/components/ui/aramali-secim';
import { Uyari } from '@/components/ui/uyari';
import { Serit } from '@/components/ui/hal';
import { HESAP_ADIMLARI } from './kurulum-listesi-mantik';
import { DurumRozeti } from './kurulum-yardimcilari';
import {
  AD_ISTEYEN,
  degisimSonucu,
  durumGosterimi,
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
const hataMetniDil = (e: unknown, yedek: string) => (e instanceof ApiRequestError ? e.message : yedek);

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
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const hataMetni = (e: unknown) => hataMetniDil(e, d.sunucuyaUlasilamadi);
  const eylemYetkisi = HESAP_ADIMLARI.has(a.kod) ? hesapYazabilir : yazabilir;
  const [acik, setAcik] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const dg = durumGosterimi(a.durum, dil);

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
          <DurumRozeti durum={a.durum} etiket={dg.etiket} />
        </span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="font-medium text-ink">
            {KURULUM_ADIM_ADI[a.kod]} <span className="font-normal text-ink-muted">· {a.baslik}</span>
          </p>
          <p className="text-xs text-ink-muted">{a.neden}</p>
          {/* Kapı kapalıysa düğme yerine NEDEN (boş alan değil, MIMARI § 6). */}
          {!eylemYetkisi && e && (
            <p className="text-xs text-ink-muted">{kapiNedeni(HESAP_ADIMLARI.has(a.kod) ? 'kurulum.hesap' : 'kurulum.yaz', dil)}</p>
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
                {d.kontrolEt}
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
                {acik ? d.vazgec : e.etiket}
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
function aramaNesnesi(kod: KurulumAdimi['kod'], d: { aramaReklamHesabi: string; aramaSayfa: string; aramaKonteyner: string; aramaMulk: string; aramaPiksel: string; aramaSecenek: string }): string {
  switch (kod) {
    case 'meta_hesap':
    case 'google_hesap':
      return d.aramaReklamHesabi;
    case 'sayfa':
      return d.aramaSayfa;
    case 'gtm_konteyner':
      return d.aramaKonteyner;
    case 'ga4_mulk':
      return d.aramaMulk;
    case 'meta_piksel':
      return d.aramaPiksel;
    default:
      return d.aramaSecenek;
  }
}

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
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const hataMetni = (e: unknown) => hataMetniDil(e, d.sunucuyaUlasilamadi);
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

  if (s.tur === 'yukleniyor') return <p className="mt-3 text-xs text-ink-muted">{d.seceneklerOkunuyor}</p>;
  if (s.tur === 'hata') {
    return (
      <div className="mt-3">
        <Serit ton="hata" baslik={d.seceneklerAlinamadi}>
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
  const yeniEtiket = kod === 'meta_piksel' ? d.yeniPiksel : kod === 'gtm_konteyner' ? d.yeniKonteyner : kod === 'ga4_mulk' ? d.yeniMulk : d.yeniHesap;
  const pikselYeni = kod === 'meta_piksel';

  return (
    <div className="mt-3 grid gap-3 rounded-alan border border-line p-3 md:grid-cols-2">
      {simdiki && (
        <div className="md:col-span-2">
          <Serit ton="uyari" baslik={d.suAn(simdiki)}>
            {degisimSonucu(kod, dil) ?? d.degisimGenel}
          </Serit>
        </div>
      )}
      {v.not && <p className="text-xs text-ink-muted md:col-span-2">{v.not}</p>}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink">{d.mevcutuKullan}</p>
        {v.mevcut.length === 0 ? (
          <p className="text-xs text-ink-muted">{d.secilecekYok}</p>
        ) : (
          <>
            {/*
              ARAMALI: ajansın tek kimliği yüzlerce mülk/hesap/sayfa görüyor ve
              düz açılır listede doğru satır bulunamıyordu. Yazılan metin adın,
              notun ya da kimliğin İÇİNDE geçiyorsa satır listede.
            */}
            <AramaliSecim secenekler={v.mevcut} deger={mevcut} onDegis={setMevcut} etiket={d.mevcutAra(aramaNesnesi(kod, d).toLocaleLowerCase(dil === 'en' ? 'en-US' : 'tr'))} yerTutucu={d.aramaYerTutucu(aramaNesnesi(kod, d))} />
            <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} disabled={!mevcut} onClick={() => istek({ tur: 'mevcut', deger: mevcut })}>
              {d.bunuKullan}
            </Dugme>
          </>
        )}
      </div>
      {kod !== 'sayfa' && (pikselYeni || v.ustler.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">{yeniEtiket}</p>
          {!pikselYeni && (
            <Secim value={ust} onChange={(e) => setUst(e.target.value)} aria-label={d.neredeAcilsin}>
              {v.ustler.map((o) => (
                <option key={o.deger} value={o.deger}>
                  {o.etiket}
                </option>
              ))}
            </Secim>
          )}
          {AD_ISTEYEN.has(kod) && <Girdi value={ad} onChange={(e) => setAd(e.target.value)} maxLength={100} aria-label={d.hesapAdi} placeholder={d.projeAdi} />}
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
                {d.hesapAcilsinMi(ad.trim())}
              </p>
              <p className="text-[11px] text-ink-muted">{d.hesapAcUyari}</p>
              <div className="flex flex-wrap gap-2">
                <Dugme id={onayDugmesi} ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} onClick={() => istek({ tur: 'yeni', ust, ad })}>
                  {d.hesabiAc}
                </Dugme>
                <Dugme boyut="kucuk" ton="ikincil" disabled={gonderiliyor} onClick={() => setYeniOnay(false)}>
                  {d.vazgec}
                </Dugme>
              </div>
            </div>
          )}
          {AD_ISTEYEN.has(kod) && !yeniOnay && <p className="text-[11px] text-ink-muted">{d.gercekHesapNotu}</p>}
        </div>
      )}
      {kod === 'google_hesap' && v.ustler.length > 0 && (
        <div className="space-y-2 md:col-span-2">
          <p className="text-xs font-semibold text-ink">{d.davetBaslik}</p>
          <div className="flex flex-wrap gap-2">
            <Girdi className="max-w-48" value={musteriNo} onChange={(e) => setMusteriNo(e.target.value)} placeholder="123-456-7890" aria-label={d.googleHesapNo} />
            <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} disabled={!/^\d{3}-?\d{3}-?\d{4}$/.test(musteriNo.trim()) || !ust} onClick={() => istek({ tur: 'davet', ust, musteriNo: musteriNo.trim() })}>
              {d.davetGonder}
            </Dugme>
          </div>
          <p className="text-[11px] text-ink-muted">{d.davetAciklama}</p>
        </div>
      )}
    </div>
  );
}

/*
 * FORM ÖLÇÜMÜ TEŞEKKÜR SAYFASINA BAĞLI DEĞİL (2026-10-15). Kutu bir süre
 * "teşekkür sayfası açılıyor" diyordu ve sayfa yoksa form hiç ölçülmüyordu:
 * Elementor gibi sayfayı değiştirmeyen formlarda dönüşüm kaybı. Artık form
 * dinleyiciyle ölçülüyor; teşekkür sayfası yalnız yönlendiren ya da listede
 * olmayan formlar için ek yol.
 */
function TetikFormu({ mevcut, gonderiliyor, gonder }: { mevcut: DonusumTetigi | null; gonderiliyor: boolean; gonder: (t: DonusumTetigi) => void }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const [formVar, setFormVar] = useState(mevcut ? formOlculuyor(mevcut) : true);
  const [yol, setYol] = useState(mevcut?.formYolu ?? '');
  const [telefon, setTelefon] = useState(mevcut?.telefon ?? true);
  const [whatsapp, setWhatsapp] = useState(mevcut?.whatsapp ?? true);
  const yolBos = yol.trim() === '';
  const yolGecerli = /^(https?:\/\/[^/]+)?\/[^\s]+$/.test(yol.trim()) && !/^(https?:\/\/[^/]+)?\/?$/.test(yol.trim());
  return (
    <div className="mt-3 space-y-3 rounded-alan border border-line p-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={formVar} onChange={(e) => setFormVar(e.target.checked)} className="mt-1" />
        <span>
          <span className="block text-sm text-ink">{d.formGonderimi}</span>
          <span className="block text-xs text-ink-muted">
            {d.formDinleyiciAciklama(FORM_DINLEYICI_EKLENTILERI.join(', '))}
          </span>
        </span>
      </label>
      {formVar && (
        <div className="ml-6 space-y-1">
          <Girdi
            className="max-w-md"
            value={yol}
            onChange={(e) => setYol(e.target.value)}
            placeholder={d.tesekkurSayfasi}
            aria-label={d.tesekkurSayfasiEtiket}
          />
          <p className="text-xs text-ink-muted">{d.tesekkurAciklama}</p>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={telefon} onChange={(e) => setTelefon(e.target.checked)} /> {d.telefonDonusum}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> {d.whatsappDonusum}
      </label>
      <Dugme
        ton="koyu"
        boyut="kucuk"
        bekliyor={gonderiliyor}
        disabled={(formVar && !yolBos && !yolGecerli) || (!formVar && !telefon && !whatsapp)}
        onClick={() => gonder({ form: formVar, formYolu: formVar && !yolBos ? yol.trim() : null, telefon, whatsapp })}
      >
        {d.kaydetYayinla}
      </Dugme>
    </div>
  );
}

function SiteKodu({ kod, site }: { kod: NonNullable<KurulumYaniti['siteKodu']>; site: string | null }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const [kopyalandi, setKopyalandi] = useState<string | null>(null);
  const [kopyaHatasi, setKopyaHatasi] = useState<string | null>(null);
  const kopyala = (ad: string, metin: string) =>
    navigator.clipboard.writeText(metin).then(
      () => {
        setKopyaHatasi(null);
        setKopyalandi(ad);
      },
      () => setKopyaHatasi(d.kopyaYasak),
    );
  return (
    <div className="mt-3 space-y-3 rounded-alan border border-line p-3">
      {(
        [
          ['head', d.headBaslik, kod.head],
          ['body', d.bodyBaslik, kod.body],
        ] as const
      ).map(([ad, baslik, metin]) => (
        <div key={ad} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{baslik}</p>
            <button type="button" className="text-xs font-semibold text-brand-strong hover:underline" onClick={() => void kopyala(ad, metin)}>
              {kopyalandi === ad ? d.kopyalandi : d.kopyala}
            </button>
          </div>
          <pre className="max-h-40 overflow-auto rounded-alan bg-surface-sunken p-2 text-[11px] leading-relaxed text-ink">{metin}</pre>
        </div>
      ))}
      {kopyaHatasi && <p className="text-xs text-danger-strong">{kopyaHatasi}</p>}
      <a href={gelistiriciEpostasi(site, kod.gtmKimligi, kod.head, kod.body, dil)} className="inline-block text-xs font-semibold text-brand-strong hover:underline">
        {d.gelistiriciyeGonder}
      </a>
      <p className="text-[11px] text-ink-muted">{d.wordpressNotu(kod.gtmKimligi)}</p>
    </div>
  );
}
