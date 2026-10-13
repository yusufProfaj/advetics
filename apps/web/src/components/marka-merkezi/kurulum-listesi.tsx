'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  KURULUM_ADIM_ADI,
  type HazirlamaSorusu,
  type HazirlamaYaniti,
  type HesapSahibi,
  type KurulumAdimSonucu,
  type KurulumListesiParcasi,
  type KurulumYaniti,
  type SpecialAdCategory,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import {
  KURULUM_PLATFORMLARI,
  PANEL_KAPILARI,
  eksikleriTamamlaKapsami,
  kurulumListesi,
  kurulumSayaci,
  markaMerkeziAdresi,
  type KurulumListesiAdimi,
  type KurulumPlatformu,
} from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { SpecialCategoryPicker } from '@/components/tenancy/special-category-picker';
import { AdimSatiri } from './kurulum-bolumu';
import { ButceDegistir, Soru } from './hazirlama-karti';
import { YOKLAMA_ARALIGI_MS, YOKLAMA_SINIRI, yoklamaGerekli } from './hazirlama-mantik';
import { OlcumBolumu } from './olcum-bolumu';
import { Ga4KaynakDurumu, VarsayilanKitleSecici } from './kurulum-yardimcilari';
import {
  LISTE_DURUMU,
  PARCA_ADI,
  adimOzeti,
  beyanDegistir,
  dugmeNedeni,
  sayacMetni,
} from './kurulum-listesi-mantik';

/**
 * ═══ MARKA MERKEZİ › KURULUM — TEK SIRALI LİSTE, TEK SAYAÇ, TEK DÜĞME ═══
 * (docs/panel-sadelestirme/MIMARI.md § 7)
 *
 * Bir workspace'in "hazır mı" sorusunu üç ayrı liste cevaplıyordu (hazırlık
 * şeridi 7, kurulum 15, hazır workspace kartı 7 + soru) ve üçü de aynı
 * sayfada farklı bir sayı söylüyordu. Artık Google Ads'in kurulum kontrol
 * listesi mantığı: yedi numaralı adım, her biri durumu, kısa sonucu ve tek
 * birincil eylemiyle; satır açılınca parçalar NEDENLERİYLE. Birleştirme
 * sözleşmede (`kurulumListesi`) ve saf; burada yalnız çizim ve istek.
 *
 * ÜÇ UÇ AYRI OKUNUYOR ve biri düşerse diğerleri çiziliyor: düşen kaynağın
 * parçaları "Okunamadı" ve sebebi listenin üstünde, platformun cümlesiyle.
 * Hiçbir kaynak sessizce "eksik" sayılmıyor (`.catch(() => setX([]))` yasağı).
 *
 * "EKSİKLERİ TAMAMLA" ASLA HESAP AÇMAZ (MIMARI Ç-20 ⚠): kapsam sözleşmede
 * (`eksikleriTamamlaKapsami`), gerçek hesap açmak yalnız adımın kendi onay
 * penceresinden.
 */
export type Sonuc<T> = { ok: true; v: T } | { ok: false; hata: string };

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

const KAYNAK_ADI = { kurulum: 'Kurulum adımları', hazirlama: 'Reklam hazırlığı', hazirlik: 'Hazırlık maddeleri' } as const;

const PLATFORM_ADI: Record<KurulumPlatformu, string> = { meta: 'Meta', google: 'Google Ads' };

export function KurulumListesi({
  clientId,
  ilk,
  kategoriler,
  yazabilir,
  hesapYazabilir,
  aktifDegil,
}: {
  clientId: string;
  ilk: { kurulum: Sonuc<KurulumYaniti>; hazirlama: Sonuc<HazirlamaYaniti>; hazirlik: Sonuc<WorkspaceHazirlik> };
  /** Workspace'in kayıtlı özel reklam kategorileri (`GET /clients/:id`); okunamadıysa null. */
  kategoriler: SpecialAdCategory[] | null;
  /** `kurulum.yaz`. */
  yazabilir: boolean;
  /** `kurulum.hesap` (Ç-20). */
  hesapYazabilir: boolean;
  /** Oturumda seçili workspace bu değil: kurulum yazmaları sunucuda reddedilir. */
  aktifDegil: boolean;
}) {
  const router = useRouter();
  const [kurulum, setKurulum] = useState(ilk.kurulum);
  const [hazirlama, setHazirlama] = useState(ilk.hazirlama);
  const [hazirlik, setHazirlik] = useState(ilk.hazirlik);
  // Sunucu yeniden çizdiğinde (router.refresh) taze veri yerel kopyayı ezer.
  useEffect(() => setKurulum(ilk.kurulum), [ilk.kurulum]);
  useEffect(() => setHazirlama(ilk.hazirlama), [ilk.hazirlama]);
  useEffect(() => setHazirlik(ilk.hazirlik), [ilk.hazirlik]);

  const [tamamlaniyor, setTamamlaniyor] = useState(false);
  const [sonuc, setSonuc] = useState<{ sonuclar: KurulumAdimSonucu[]; hazirlamaYeniden: boolean } | { hata: string } | null>(null);
  const [beyanHatasi, setBeyanHatasi] = useState<string | null>(null);
  const [beyanBekliyor, setBeyanBekliyor] = useState<KurulumPlatformu | null>(null);

  const kullanilmayanlar = kurulum.ok ? kurulum.v.kullanilmayanPlatformlar : [];
  const girdi = useMemo(
    () => ({
      kurulum: kurulum.ok ? kurulum.v : null,
      hazirlama: hazirlama.ok ? hazirlama.v : null,
      hazirlik: hazirlik.ok ? hazirlik.v : null,
      kullanilmayanlar,
    }),
    [kurulum, hazirlama, hazirlik, kullanilmayanlar],
  );
  const adimlar = useMemo(() => kurulumListesi(girdi), [girdi]);
  const sayac = kurulumSayaci(adimlar);
  const kapsam = eksikleriTamamlaKapsami(girdi);
  const kapaliNeden = dugmeNedeni(kapsam, yazabilir);

  /** Üç kaynağı yeniden okur; her biri kendi hatasıyla. Sonra sunucu rozetini tazeler. */
  const tazele = useCallback(async () => {
    const oku = async <T,>(yol: string): Promise<Sonuc<T>> => {
      try {
        return { ok: true, v: await apiFetch<T>(yol) };
      } catch (e) {
        return { ok: false, hata: hataMetni(e) };
      }
    };
    const [k, hz, hk] = await Promise.all([
      oku<KurulumYaniti>(`/clients/${clientId}/kurulum`),
      oku<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`),
      oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`),
    ]);
    setKurulum(k);
    setHazirlama(hz);
    setHazirlik(hk);
    router.refresh();
  }, [clientId, router]);

  /*
   * HAZIRLAMA ARKA PLANDA ÇALIŞIRKEN YOKLANIR, sınırda durur ve bunu söyler
   * (`hazirlama-mantik.ts`). Takılan bir iş sonsuza kadar istek atmasın.
   */
  const yoklama = useRef(0);
  const [yoklamaBitti, setYoklamaBitti] = useState(false);
  const calisiyor = hazirlama.ok && yoklamaGerekli(hazirlama.v.durum);
  useEffect(() => {
    if (!calisiyor) {
      yoklama.current = 0;
      return;
    }
    if (yoklama.current >= YOKLAMA_SINIRI) {
      setYoklamaBitti(true);
      return;
    }
    const z = window.setTimeout(() => {
      yoklama.current += 1;
      void tazele();
    }, YOKLAMA_ARALIGI_MS);
    return () => window.clearTimeout(z);
  }, [calisiyor, hazirlama, tazele]);

  async function eksikleriTamamla() {
    setTamamlaniyor(true);
    setSonuc(null);
    try {
      let sonuclar: KurulumAdimSonucu[] = [];
      if (kapsam.kurulumAdimlari.length > 0) {
        const r = await apiFetch<KurulumYaniti & { sonuclar: KurulumAdimSonucu[] }>(`/clients/${clientId}/kurulum/tamamla`, { method: 'POST' });
        sonuclar = r.sonuclar;
        setKurulum({ ok: true, v: r });
      }
      if (kapsam.hazirlamaYeniden) {
        setHazirlama({ ok: true, v: await apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`, { method: 'POST' }) });
        yoklama.current = 0;
        setYoklamaBitti(false);
      }
      setSonuc({ sonuclar, hazirlamaYeniden: kapsam.hazirlamaYeniden });
      await tazele();
    } catch (e) {
      setSonuc({ hata: hataMetni(e) });
    } finally {
      setTamamlaniyor(false);
    }
  }

  async function beyan(platform: KurulumPlatformu) {
    const yeni = beyanDegistir(kullanilmayanlar, platform);
    if (!yeni) return;
    setBeyanBekliyor(platform);
    setBeyanHatasi(null);
    try {
      setKurulum({
        ok: true,
        v: await apiFetch<KurulumYaniti>(`/clients/${clientId}/kurulum/platformlar`, {
          method: 'PUT',
          body: JSON.stringify({ kullanilmayanlar: yeni }),
        }),
      });
      router.refresh();
    } catch (e) {
      setBeyanHatasi(hataMetni(e));
    } finally {
      setBeyanBekliyor(null);
    }
  }

  async function sahipSec(deger: HesapSahibi) {
    setBeyanHatasi(null);
    try {
      setKurulum({
        ok: true,
        v: await apiFetch<KurulumYaniti>(`/clients/${clientId}/kurulum/adim`, { method: 'POST', body: JSON.stringify({ kod: 'hesap_sahibi', deger }) }),
      });
    } catch (e) {
      setBeyanHatasi(hataMetni(e));
    }
  }

  const kurulumGuncelle = useCallback(
    (v: KurulumYaniti) => {
      setKurulum({ ok: true, v });
      router.refresh();
    },
    [router],
  );
  const hazirlamaGuncelle = useCallback(
    (v: HazirlamaYaniti) => {
      setHazirlama({ ok: true, v });
      router.refresh();
    },
    [router],
  );

  const dusenler = (['kurulum', 'hazirlama', 'hazirlik'] as const).flatMap((k) => {
    const s = { kurulum, hazirlama, hazirlik }[k];
    return s.ok ? [] : [{ k, hata: s.hata }];
  });
  const hesapAdimiAcik = adimlar.some((a) => (a.kod === 'meta' || a.kod === 'google') && a.durum !== 'tamam' && a.durum !== 'kullanilmiyor');
  const yuzde = Math.round((sayac.tamam / Math.max(sayac.toplam, 1)) * 100);

  return (
    <div className="space-y-4">
      <section aria-label="Kurulum özeti" className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-baslik text-base font-semibold text-ink">{sayacMetni(sayac)}</p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-label="Tamamlanan kurulum adımları"
              aria-valuemin={0}
              aria-valuemax={sayac.toplam}
              aria-valuenow={sayac.tamam}
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${yuzde}%` }} />
            </div>
          </div>
          {yazabilir && (
            <Dugme bekliyor={tamamlaniyor || calisiyor} disabled={!kapsam.yapacakVar} onClick={() => void eksikleriTamamla()}>
              Eksikleri tamamla
            </Dugme>
          )}
        </div>
        {kapaliNeden && <p className="mt-2 text-xs text-ink-muted">{kapaliNeden}</p>}
        {yazabilir && kapsam.yapacakVar && (
          <p className="mt-2 text-xs text-ink-muted">Hesap açmaz, ödeme eklemez, site kodunu yerleştirmez; bunlar aşağıda adımında yazıyor.</p>
        )}
        {aktifDegil && yazabilir && (
          <p className="mt-2 text-xs text-warn-strong">Kurulumu değiştirmek için önce yukarıdaki “Bu workspace’e geç” düğmesine bas.</p>
        )}
        {calisiyor && (
          <p className="mt-2 text-xs text-ink-muted">Site, marka bilgileri ve piksel okunuyor. Sayfadan ayrılabilirsin, iş arka planda sürer.</p>
        )}
        {yoklamaBitti && calisiyor && (
          <p className="mt-2 text-xs text-warn-strong">Hazırlık beklenenden uzun sürüyor. Sayfayı yenileyerek durumu tekrar okuyabilirsin.</p>
        )}

        {dusenler.length > 0 && (
          <div className="mt-3">
            <Uyari ton="uyari" baslik="Bazı bilgiler okunamadı; ilgili adımlar “Okunamadı” diyor.">
              <ul className="mt-1 space-y-0.5">
                {dusenler.map((d) => (
                  <li key={d.k}>
                    <b>{KAYNAK_ADI[d.k]}:</b> {d.hata}
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-1 font-semibold underline" onClick={() => void tazele()}>
                Yeniden dene
              </button>
            </Uyari>
          </div>
        )}

        {sonuc && 'hata' in sonuc && (
          <div className="mt-3">
            <Uyari ton="tehlike" baslik="Eksikler tamamlanamadı.">
              {sonuc.hata}
            </Uyari>
          </div>
        )}
        {sonuc && 'sonuclar' in sonuc && (
          <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
            <ul className="space-y-1">
              {sonuc.sonuclar.length === 0 && !sonuc.hazirlamaYeniden && <li className="text-ink-muted">Sistemin kendi yapabileceği eksik kalmadı.</li>}
              {sonuc.sonuclar.map((s) => (
                <li key={s.kod} className={s.durum === 'hata' ? 'text-danger-strong' : s.durum === 'atlandi' ? 'text-ink-muted' : 'text-ink'}>
                  <b>{KURULUM_ADIM_ADI[s.kod]}:</b> {s.durum === 'yapildi' ? '' : s.durum === 'atlandi' ? 'atlandı, ' : 'hata, '}
                  {s.mesaj}
                </li>
              ))}
              {sonuc.hazirlamaYeniden && <li className="text-ink">Reklam hazırlığı yeniden başlatıldı.</li>}
            </ul>
          </div>
        )}
        {/* DÜĞMENİN YAPAMADIĞI: "neden hâlâ eksik" sorusunun cevabı, nedeniyle. */}
        {kapsam.kullaniciyaKalan.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink">Size kalan</p>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {kapsam.kullaniciyaKalan.map((k) => (
                <li key={k.adim}>
                  <a href={`#${k.adim}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                    {adimlar.find((a) => a.kod === k.adim)?.ad}
                  </a>
                  : {k.neden}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
          <span className="text-ink-muted">Kullanmadığım platform:</span>
          {KURULUM_PLATFORMLARI.map((p) => {
            const kapali = kullanilmayanlar.includes(p);
            const olmaz = beyanDegistir(kullanilmayanlar, p) === null;
            return yazabilir ? (
              <button
                key={p}
                type="button"
                aria-pressed={kapali}
                disabled={olmaz || beyanBekliyor !== null || !kurulum.ok}
                onClick={() => void beyan(p)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                  kapali ? 'border-ink bg-ink text-surface' : 'border-line text-ink hover:border-ink-muted'
                }`}
              >
                {PLATFORM_ADI[p]}
                {kapali ? ' kullanılmıyor' : ''}
              </button>
            ) : (
              kapali && (
                <span key={p} className="rounded-lg bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink">
                  {PLATFORM_ADI[p]} kullanılmıyor
                </span>
              )
            );
          })}
          {kullanilmayanlar.length === 0 && !yazabilir && <span className="text-xs text-ink-muted">Beyan yok; iki platform da sayılıyor.</span>}
          <span className="basis-full text-xs text-ink-muted">
            {kullanilmayanlar.length > 0
              ? 'Kullanılmayan platformun adımları sayılmaz ve “Eksikleri tamamla” onlara dokunmaz. Hesap ve veri silinmez.'
              : 'Bu workspace bir platformda hiç reklam vermeyecekse işaretle; o platformun adımları sayaçtan düşer. İkisi birden kapatılamaz.'}
          </span>
          {beyanHatasi && (
            <span role="alert" className="basis-full text-xs text-danger-strong">
              {beyanHatasi}
            </span>
          )}
        </div>

        {hesapAdimiAcik && kurulum.ok && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <span className="text-ink-muted">Yeni hesaplar kimin adına açılsın?</span>
            {hesapYazabilir ? (
              (
                [
                  ['ajans', 'Ajansın hesapları altında'],
                  ['sirket', 'Şirketin kendi hesaplarında'],
                ] as const
              ).map(([d, e]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={kurulum.v.hesapSahibi === d}
                  onClick={() => void sahipSec(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                    kurulum.v.hesapSahibi === d ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:border-ink-muted'
                  }`}
                >
                  {e}
                </button>
              ))
            ) : (
              <span className="text-xs text-ink-muted">{PANEL_KAPILARI['kurulum.hesap'].neden}</span>
            )}
          </div>
        )}
      </section>

      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {adimlar.map((a, i) => (
          <AdimSatirlari
            key={a.kod}
            sira={i + 1}
            a={a}
            clientId={clientId}
            kurulum={kurulum.ok ? kurulum.v : null}
            sorular={hazirlama.ok ? hazirlama.v.sorular : []}
            hazirlamaVar={hazirlama.ok && hazirlama.v.sonCalisma !== null}
            kategoriler={kategoriler}
            yazabilir={yazabilir}
            hesapYazabilir={hesapYazabilir}
            kurulumGuncelle={kurulumGuncelle}
            hazirlamaGuncelle={hazirlamaGuncelle}
            ilkAcik={adimlar.findIndex((x) => x.durum !== 'tamam' && x.durum !== 'kullanilmiyor') === i}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * BİR ADIM — numara, ad, durum, kısa sonuç ve tek birincil eylem. Açılan
 * panel DOM'DAN ÇIKMIYOR: görünürlük satır yüksekliğinin geçişiyle değişiyor
 * (`grid-rows`), kapalıyken `inert` (klavye içeriğe düşmesin). Hareket
 * `prefers-reduced-motion` altında kapalı.
 *
 * ÇAPA: `id` adım kodu (`MARKA_MERKEZI_CAPALARI.kurulum`). Dışarıdan
 * `#olcum` ile gelen bağlantı o satırı AÇARAK getiriyor; kapalı bir satıra
 * kaydırmak kullanıcıyı aradığı içeriğin önüne bırakırdı.
 */
function AdimSatirlari({
  sira,
  a,
  clientId,
  kurulum,
  sorular,
  hazirlamaVar,
  kategoriler,
  yazabilir,
  hesapYazabilir,
  kurulumGuncelle,
  hazirlamaGuncelle,
  ilkAcik,
}: {
  sira: number;
  a: KurulumListesiAdimi;
  clientId: string;
  kurulum: KurulumYaniti | null;
  sorular: HazirlamaSorusu[];
  hazirlamaVar: boolean;
  kategoriler: SpecialAdCategory[] | null;
  yazabilir: boolean;
  hesapYazabilir: boolean;
  kurulumGuncelle: (v: KurulumYaniti) => void;
  hazirlamaGuncelle: (v: HazirlamaYaniti) => void;
  ilkAcik: boolean;
}) {
  const [acik, setAcik] = useState(ilkAcik);
  // İçerik İLK açılışta monte edilir ve sonra DOM'da kalır: ölçüm tablosu
  // siteyi tarıyor; her Kurulum açılışında yedi adımın hepsini okumak boşa iş.
  const [monte, setMonte] = useState(ilkAcik);
  const panelId = useId();
  const d = LISTE_DURUMU[a.durum];
  const kullanilmiyor = a.durum === 'kullanilmiyor';

  useEffect(() => {
    const capaya = () => {
      if (window.location.hash === `#${a.kod}`) {
        setAcik(true);
        setMonte(true);
      }
    };
    capaya();
    window.addEventListener('hashchange', capaya);
    return () => window.removeEventListener('hashchange', capaya);
  }, [a.kod]);

  function ac() {
    setMonte(true);
    setAcik((x) => !x);
  }

  return (
    <li id={a.kod} className="scroll-mt-24">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            a.durum === 'tamam' ? 'bg-ok-soft text-ok-strong' : 'bg-surface-sunken text-ink'
          }`}
        >
          {a.durum === 'tamam' ? '✓' : sira}
        </span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {a.ad}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.sinif}`}>{d.etiket}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{adimOzeti(a)}</p>
        </div>
        {a.kod === 'marka' ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={acik}
              aria-controls={panelId}
              onClick={ac}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
            >
              {acik ? 'Kapat' : 'Ayrıntı'}
            </button>
            <Link href={markaMerkeziAdresi('marka', clientId)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink-muted">
              Marka’ya git
            </Link>
          </div>
        ) : (
          !kullanilmiyor && (
            <button
              type="button"
              aria-expanded={acik}
              aria-controls={panelId}
              onClick={ac}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                a.durum === 'tamam' || acik ? 'border border-line text-ink hover:border-ink-muted' : 'bg-brand text-white hover:bg-brand-strong'
              }`}
            >
              {acik ? 'Kapat' : a.durum === 'tamam' ? 'Ayrıntı' : 'Tamamla'}
            </button>
          )
        )}
      </div>

      <div
        id={panelId}
        inert={!acik}
        aria-hidden={!acik}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          {monte && (
            <div className="space-y-3 border-t border-line bg-surface-muted/40 px-4 py-3">
              <ParcaPaneli
                a={a}
                clientId={clientId}
                kurulum={kurulum}
                sorular={sorular}
                hazirlamaVar={hazirlamaVar}
                kategoriler={kategoriler}
                yazabilir={yazabilir}
                hesapYazabilir={hesapYazabilir}
                kurulumGuncelle={kurulumGuncelle}
                hazirlamaGuncelle={hazirlamaGuncelle}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Kurulum kaynaklı olmayan parçanın satırı: durum ve NEDEN. */
function ParcaSatiri({ p }: { p: KurulumListesiParcasi }) {
  const d = LISTE_DURUMU[p.durum];
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.sinif}`}>{d.etiket}</span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="font-medium text-ink">
          {PARCA_ADI[p.kod] ?? p.kod}
          {p.baslik && <span className="font-normal text-ink-muted"> · {p.baslik}</span>}
        </p>
        <p className="text-xs text-ink-muted">{p.neden}</p>
      </div>
    </li>
  );
}

function ParcaPaneli({
  a,
  clientId,
  kurulum,
  sorular,
  hazirlamaVar,
  kategoriler,
  yazabilir,
  hesapYazabilir,
  kurulumGuncelle,
  hazirlamaGuncelle,
}: {
  a: KurulumListesiAdimi;
  clientId: string;
  kurulum: KurulumYaniti | null;
  sorular: HazirlamaSorusu[];
  hazirlamaVar: boolean;
  kategoriler: SpecialAdCategory[] | null;
  yazabilir: boolean;
  hesapYazabilir: boolean;
  kurulumGuncelle: (v: KurulumYaniti) => void;
  hazirlamaGuncelle: (v: HazirlamaYaniti) => void;
}) {
  const soru = (kod: HazirlamaSorusu['kod']) => sorular.find((q) => q.kod === kod) ?? null;
  return (
    <>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {a.parcalar.map((p) => {
          const k = p.kaynak === 'kurulum' ? kurulum?.adimlar.find((x) => x.kod === p.kod) : undefined;
          return k && kurulum ? (
            <AdimSatiri
              key={`${p.kaynak}-${p.kod}`}
              a={k}
              v={kurulum}
              clientId={clientId}
              yazabilir={yazabilir}
              hesapYazabilir={hesapYazabilir}
              guncelle={kurulumGuncelle}
            />
          ) : (
            <ParcaSatiri key={`${p.kaynak}-${p.kod}`} p={p} />
          );
        })}
      </ul>

      {a.kod === 'piksel' && soru('piksel') && (
        <SoruAlani yazabilir={yazabilir} clientId={clientId} soru={soru('piksel')!} guncelle={hazirlamaGuncelle} />
      )}

      {a.kod === 'olcum' && (
        <div className="space-y-3">
          <Ga4KaynakDurumu clientId={clientId} />
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Neyi ölçüyoruz</p>
            <OlcumBolumu clientId={clientId} yazabilir={yazabilir} />
          </div>
        </div>
      )}

      {a.kod === 'marka' && (
        <p className="flex flex-wrap gap-3 text-xs">
          <Link href={markaMerkeziAdresi('marka', clientId, 'marka-bilgileri')} className="font-semibold text-ink underline-offset-2 hover:underline">
            Marka bilgilerini doldur
          </Link>
          <Link href={markaMerkeziAdresi('marka', clientId, 'logo')} className="font-semibold text-ink underline-offset-2 hover:underline">
            Logo yükle
          </Link>
        </p>
      )}

      {a.kod === 'varsayilanlar' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink">Özel reklam kategorisi</p>
            {/*
              İLK BEYAN hazırlama sorusuyla (beyan + "cevaplandı" bayrağı +
              denetim kaydı birlikte). Beyan verildikten sonra DEĞİŞTİRMEK
              workspace kaydından (`PATCH /clients/:id`): hazırlama ucu bekleyen
              soru yokken cevabı bilerek reddediyor (Ajan 4, Ö6).
            */}
            {soru('kategori') ? (
              <SoruAlani yazabilir={yazabilir} clientId={clientId} soru={soru('kategori')!} guncelle={hazirlamaGuncelle} />
            ) : kategoriler === null ? (
              <p className="text-xs text-danger-strong">Kayıtlı kategori okunamadı; sayfayı yenile.</p>
            ) : (
              <SpecialCategoryPicker clientId={clientId} value={kategoriler} canManage={yazabilir} />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink">Varsayılan konum ve kitle</p>
            {soru('konum') ? (
              <SoruAlani yazabilir={yazabilir} clientId={clientId} soru={soru('konum')!} guncelle={hazirlamaGuncelle} />
            ) : (
              <VarsayilanKitleSecici clientId={clientId} yazabilir={yazabilir} />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink">Varsayılan günlük bütçe</p>
            {!hazirlamaVar ? (
              <p className="text-xs text-ink-muted">Reklam hazırlığı henüz koşmadı; bir reklam hesabı atanınca başlar, bütçe ondan sonra belirlenir.</p>
            ) : yazabilir ? (
              <ButceDegistir clientId={clientId} guncelle={hazirlamaGuncelle} />
            ) : (
              <p className="text-xs text-ink-muted">{PANEL_KAPILARI['kurulum.yaz'].neden}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SoruAlani({
  yazabilir,
  clientId,
  soru,
  guncelle,
}: {
  yazabilir: boolean;
  clientId: string;
  soru: HazirlamaSorusu;
  guncelle: (v: HazirlamaYaniti) => void;
}) {
  if (!yazabilir) {
    return (
      <p className="text-xs text-ink-muted">
        {soru.soru} Cevabı workspace’i düzenleme yetkisi olan kişi verecek.
      </p>
    );
  }
  return <Soru clientId={clientId} soru={soru} guncelle={guncelle} />;
}
