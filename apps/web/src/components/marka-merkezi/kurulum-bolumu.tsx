'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KURULUM_ADIM_ADI,
  KURULUM_GRUPLARI,
  type DonusumTetigi,
  type HesapSahibi,
  type KurulumAdimSonucu,
  type KurulumAdimi,
  type KurulumIstegi,
  type KurulumSecenekleri,
  type KurulumYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { mmAdresi } from './bolumler';
import {
  AD_ISTEYEN,
  DURUM_GOSTERIMI,
  GRUP_BASLIGI,
  KONTROL_ISTEGI,
  gelistiriciEpostasi,
  izinDonusu,
  otomatikIstek,
  secimIstegi,
  type SecimFormu,
} from './kurulum-mantik';

/**
 * ═══ MARKA MERKEZİ › KURULUM (docs/kurulum/MIMARI.md) ═══
 *
 * Google Ads'in "kurulum kontrol listesi" mantığı: üstte ilerleme ve TEK
 * düğme ("Eksikleri tamamla"), altta üç grup halinde adımlar; her adım
 * durumunu NEDENİYLE ve yapılacak tek işi gösterir. Kararlar sunucuda
 * (`kurulum-durum.ts`); burada yalnız çizim ve istek.
 *
 * DÖRT HÂL AYRI: okunuyor, okunamadı, geldi; bir adımın isteği düşerse o
 * adımın altında platformun mesajı yazar (`.catch(() => setX([]))` yasağı).
 */
type Hal = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: KurulumYaniti };

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

export function KurulumBolumu({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });
  const [tamamlaniyor, setTamamlaniyor] = useState(false);
  const [tamamlaSonucu, setTamamlaSonucu] = useState<{ sonuclar: KurulumAdimSonucu[] } | { hata: string } | null>(null);

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<KurulumYaniti>(`/clients/${clientId}/kurulum`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  useEffect(() => {
    void oku();
  }, [oku]);

  const guncelle = useCallback((v: KurulumYaniti) => setHal({ tur: 'geldi', veri: v }), []);

  async function tamamla() {
    setTamamlaniyor(true);
    setTamamlaSonucu(null);
    try {
      const r = await apiFetch<KurulumYaniti & { sonuclar: KurulumAdimSonucu[] }>(`/clients/${clientId}/kurulum/tamamla`, { method: 'POST' });
      guncelle(r);
      setTamamlaSonucu({ sonuclar: r.sonuclar });
    } catch (e) {
      setTamamlaSonucu({ hata: hataMetni(e) });
    } finally {
      setTamamlaniyor(false);
    }
  }

  async function sahipSec(deger: HesapSahibi) {
    try {
      guncelle(await apiFetch<KurulumYaniti>(`/clients/${clientId}/kurulum/adim`, { method: 'POST', body: JSON.stringify({ kod: 'hesap_sahibi', deger }) }));
    } catch (e) {
      setTamamlaSonucu({ hata: hataMetni(e) });
    }
  }

  if (hal.tur === 'okunuyor') return <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">Kurulum durumu okunuyor…</p>;
  if (hal.tur === 'hata')
    return (
      <Uyari ton="tehlike" baslik="Kurulum durumu alınamadı.">
        {hal.mesaj}{' '}
        <button type="button" className="font-semibold underline" onClick={() => void oku()}>
          Yeniden dene
        </button>
      </Uyari>
    );

  const v = hal.veri;
  const yuzde = Math.round((v.ozet.tamam / Math.max(v.ozet.toplam, 1)) * 100);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-baslik text-base font-semibold text-ink">
              {v.ozet.tamam}/{v.ozet.toplam} adım tamam
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={v.ozet.toplam} aria-valuenow={v.ozet.tamam}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${yuzde}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {v.ozet.otomatikYapilabilir > 0 ? `${v.ozet.otomatikYapilabilir} adımı sistem kendisi tamamlayabilir. ` : ''}
              {v.ozet.kullanicida > 0 ? `${v.ozet.kullanicida} adım sizin işiniz (ödeme, site kodu, test).` : ''}
            </p>
          </div>
          {yazabilir && (
            <Dugme bekliyor={tamamlaniyor} disabled={v.ozet.otomatikYapilabilir === 0} onClick={() => void tamamla()}>
              Eksikleri tamamla
            </Dugme>
          )}
        </div>
        {yazabilir && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <span className="text-ink-muted">Yeni hesaplar kimin adına açılsın?</span>
            {(
              [
                ['ajans', 'Ajansın hesapları altında'],
                ['sirket', 'Şirketin kendi hesaplarında'],
              ] as const
            ).map(([d, e]) => (
              <button
                key={d}
                type="button"
                aria-pressed={v.hesapSahibi === d}
                onClick={() => void sahipSec(d)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${v.hesapSahibi === d ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:border-ink-muted'}`}
              >
                {e}
              </button>
            ))}
            {v.hesapSahibi === 'sirket' && (
              <span className="basis-full text-xs text-ink-muted">
                Şirket kendi Meta ve Google hesabını <a className="font-semibold text-brand-strong hover:underline" href={mmAdresi(clientId, 'baglantilar')}>Bağlantılar</a>’dan bağlar; hesaplar onun adına açılır.
              </span>
            )}
          </div>
        )}
        {tamamlaSonucu && 'hata' in tamamlaSonucu && (
          <div className="mt-3">
            <Uyari ton="tehlike" baslik="İşlem yapılamadı.">{tamamlaSonucu.hata}</Uyari>
          </div>
        )}
        {tamamlaSonucu && 'sonuclar' in tamamlaSonucu && (
          <ul className="mt-3 space-y-1 text-sm">
            {tamamlaSonucu.sonuclar.length === 0 && <li className="text-ink-muted">Sistemin kendi yapabileceği eksik kalmadı.</li>}
            {tamamlaSonucu.sonuclar.map((s) => (
              <li key={s.kod} className={s.durum === 'hata' ? 'text-danger-strong' : s.durum === 'atlandi' ? 'text-ink-muted' : 'text-ink'}>
                <b>{KURULUM_ADIM_ADI[s.kod]}:</b> {s.durum === 'yapildi' ? '' : s.durum === 'atlandi' ? 'atlandı, ' : 'hata, '}
                {s.mesaj}
              </li>
            ))}
          </ul>
        )}
      </section>

      {KURULUM_GRUPLARI.map((g) => (
        <section key={g} className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-5 py-3">
            <h3 className="font-baslik text-sm font-semibold text-ink">{GRUP_BASLIGI[g].baslik}</h3>
            <p className="text-xs text-ink-muted">{GRUP_BASLIGI[g].aciklama}</p>
          </div>
          <ul className="divide-y divide-line">
            {v.adimlar
              .filter((a) => a.grup === g)
              .map((a) => (
                <AdimSatiri key={a.kod} a={a} v={v} clientId={clientId} yazabilir={yazabilir} guncelle={guncelle} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AdimSatiri({
  a,
  v,
  clientId,
  yazabilir,
  guncelle,
}: {
  a: KurulumAdimi;
  v: KurulumYaniti;
  clientId: string;
  yazabilir: boolean;
  guncelle: (v: KurulumYaniti) => void;
}) {
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
        `/connections/${baglantiId}/reauthorize?platform=google&kapsam=olcum&donus=${encodeURIComponent(izinDonusu(clientId))}`,
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
    <li className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.sinif}`}>{d.etiket}</span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="font-medium text-ink">
            {KURULUM_ADIM_ADI[a.kod]} <span className="font-normal text-ink-muted">· {a.baslik}</span>
          </p>
          <p className="text-xs text-ink-muted">{a.neden}</p>
          {a.kod === 'marka' && a.durum !== 'tamam' && (
            <a className="text-xs font-semibold text-brand-strong hover:underline" href={mmAdresi(clientId, 'baglantilar')}>
              Hazırlık kartını aç
            </a>
          )}
        </div>
        {yazabilir && e && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {e.tur === 'dis' && (
              <a href={e.adres} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink-muted">
                {e.etiket} ↗
              </a>
            )}
            {kontrol && (
              <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} onClick={() => void gonder(kontrol)}>
                Kontrol et
              </Dugme>
            )}
            {e.tur === 'izin' && (
              <Dugme boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void izinVer(e.baglantiId)}>
                {e.etiket}
              </Dugme>
            )}
            {e.tur === 'otomatik' &&
              (() => {
                const istek = otomatikIstek(a.kod, v.donusumTetigi);
                return istek ? (
                  <Dugme boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void gonder(istek)}>
                    {e.etiket}
                  </Dugme>
                ) : null;
              })()}
            {(e.tur === 'secim' || e.tur === 'girdi') && (
              <Dugme boyut="kucuk" ton={acik ? 'ikincil' : 'birincil'} onClick={() => setAcik((x) => !x)} aria-expanded={acik}>
                {acik ? 'Vazgeç' : e.etiket}
              </Dugme>
            )}
          </div>
        )}
      </div>
      {hata && <p className="mt-2 text-xs text-danger-strong">{hata}</p>}
      {bilgi && !hata && <p className="mt-2 text-xs text-ok-strong">{bilgi}</p>}
      {acik && e?.tur === 'secim' && <SecimPaneli kod={a.kod} clientId={clientId} workspaceAdi={v.workspaceAdi} gonderiliyor={gonderiliyor} gonder={(i) => void gonder(i)} />}
      {acik && e?.tur === 'girdi' && a.kod === 'gtm_etiket' && <TetikFormu mevcut={v.donusumTetigi} gonderiliyor={gonderiliyor} gonder={(t) => void gonder({ kod: 'gtm_etiket', tetik: t })} />}
      {a.kod === 'site_kodu' && v.siteKodu && a.durum !== 'tamam' && <SiteKodu kod={v.siteKodu} site={v.site} />}
    </li>
  );
}

function SecimPaneli({
  kod,
  clientId,
  workspaceAdi,
  gonderiliyor,
  gonder,
}: {
  kod: KurulumAdimi['kod'];
  clientId: string;
  workspaceAdi: string;
  gonderiliyor: boolean;
  gonder: (i: KurulumIstegi) => void;
}) {
  const [s, setS] = useState<{ tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; v: KurulumSecenekleri }>({ tur: 'yukleniyor' });
  const [mevcut, setMevcut] = useState('');
  const [ust, setUst] = useState('');
  const [ad, setAd] = useState(workspaceAdi);
  const [musteriNo, setMusteriNo] = useState('');

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
  if (s.tur === 'hata') return <p className="mt-3 text-xs text-danger-strong">Seçenekler alınamadı: {s.mesaj}</p>;
  const v = s.v;
  const girdi = 'w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm';
  const istek = (f: SecimFormu) => {
    const i = secimIstegi(kod, f);
    if (i) gonder(i);
  };
  const yeniEtiket = kod === 'meta_piksel' ? 'Yeni piksel aç' : kod === 'gtm_konteyner' ? 'Yeni konteyner aç' : kod === 'ga4_mulk' ? 'Yeni mülk aç' : 'Yeni hesap aç';
  const pikselYeni = kod === 'meta_piksel';

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-line p-3 md:grid-cols-2">
      {v.not && <p className="text-xs text-ink-muted md:col-span-2">{v.not}</p>}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink">Mevcut olanı kullan</p>
        {v.mevcut.length === 0 ? (
          <p className="text-xs text-ink-muted">Seçilebilecek bir şey yok.</p>
        ) : (
          <>
            <select className={girdi} value={mevcut} onChange={(e) => setMevcut(e.target.value)} aria-label="Mevcut seçenekler">
              <option value="">Seç ({v.mevcut.length})</option>
              {v.mevcut.map((o) => (
                <option key={o.deger} value={o.deger}>
                  {o.etiket}
                  {o.not ? ` · ${o.not}` : ''}
                </option>
              ))}
            </select>
            <Dugme boyut="kucuk" bekliyor={gonderiliyor} disabled={!mevcut} onClick={() => istek({ tur: 'mevcut', deger: mevcut })}>
              Bunu kullan
            </Dugme>
          </>
        )}
      </div>
      {kod !== 'sayfa' && (pikselYeni || v.ustler.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">{yeniEtiket}</p>
          {!pikselYeni && (
            <select className={girdi} value={ust} onChange={(e) => setUst(e.target.value)} aria-label="Nerede açılsın">
              {v.ustler.map((o) => (
                <option key={o.deger} value={o.deger}>
                  {o.etiket}
                </option>
              ))}
            </select>
          )}
          {AD_ISTEYEN.has(kod) && <input className={girdi} value={ad} onChange={(e) => setAd(e.target.value)} maxLength={100} aria-label="Hesap adı" placeholder="Proje adı" />}
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} disabled={(!pikselYeni && !ust) || (AD_ISTEYEN.has(kod) && ad.trim().length < 2)} onClick={() => istek({ tur: 'yeni', ust, ad })}>
            {yeniEtiket}
          </Dugme>
          {AD_ISTEYEN.has(kod) && <p className="text-[11px] text-ink-muted">Gerçek bir reklam hesabı açılır (TRY, İstanbul saati; sonradan değiştirilemez). Ödeme yöntemini şirket ekler.</p>}
        </div>
      )}
      {kod === 'google_hesap' && v.ustler.length > 0 && (
        <div className="space-y-2 md:col-span-2">
          <p className="text-xs font-semibold text-ink">Şirketin mevcut Google Ads hesabına bağlantı daveti</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${girdi} max-w-48`} value={musteriNo} onChange={(e) => setMusteriNo(e.target.value)} placeholder="123-456-7890" aria-label="Google Ads hesap numarası" />
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
    <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={formVar} onChange={(e) => setFormVar(e.target.checked)} className="mt-1" />
        <span>
          <span className="block text-sm text-ink">Form gönderilince teşekkür sayfası açılıyor</span>
          <span className="block text-xs text-ink-muted">Form dönüşümü bu sayfanın açılmasıyla sayılır. Teşekkür sayfası yoksa form dönüşümü kurulmaz.</span>
        </span>
      </label>
      {formVar && (
        <input
          className="w-full max-w-md rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
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
    <div className="mt-3 space-y-3 rounded-lg border border-line p-3">
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
          <pre className="max-h-40 overflow-auto rounded-lg bg-surface-sunken p-2 text-[11px] leading-relaxed text-ink">{metin}</pre>
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
