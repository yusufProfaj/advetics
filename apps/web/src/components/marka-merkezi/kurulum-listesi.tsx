'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KURULUM_ADIM_ADI,
  kapiNedeni,
  type HazirlamaYaniti,
  type HesapSahibi,
  type KurulumAdimSonucu,
  type KurulumYaniti,
  type SpecialAdCategory,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku, type BeyanOkumasi } from '@/lib/kurulum-beyanlari';
import {
  KURULUM_PLATFORMLARI,
  eksikleriTamamlaKapsami,
  kurulumListesi,
  kurulumSayaci,
  markaMerkeziAdresi,
  sihirbazAdresi,
  type KurulumPlatformu,
} from '@/lib/panel-adresleri';
import { CallbackBanner } from '@/components/callback-banner';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { useDil, useSozluk } from '@/dil/saglayici';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { YOKLAMA_ARALIGI_MS, YOKLAMA_SINIRI, yoklamaGerekli } from './hazirlama-mantik';
import { AdimIcerigi, type AdimIcerigiOzellikleri, type AdimYetkileri } from './adim-icerigi';
import { DurumRozeti } from './kurulum-yardimcilari';
import { KURULUM_EYLEM_YUVASI } from './baslik-yuvasi';
import {
  listeDurumu,
  adimOzeti,
  beyanDegistir,
  dugmeNedeni,
  sayacMetni,
} from './kurulum-listesi-mantik';

/** Beyan ve hesap sahibi seçimlerinin hap görünüşü (`HapSecici` ölçüsü; ortak bileşen `disabled` taşımıyor). */
const HAP =
  'inline-flex h-8 items-center rounded-full border px-3.5 text-12 font-semibold transition-colors motion-reduce:transition-none';

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

const hataMetniDil = (e: unknown, yedek: string) => (e instanceof ApiRequestError ? e.message : yedek);

const PLATFORM_ADI: Record<KurulumPlatformu, string> = { meta: 'Meta', google: 'Google Ads' };

export function KurulumListesi({
  clientId,
  ilk,
  kategoriler,
  detay,
  yetki,
  ajansAdresi,
  workspaceAdi,
  aktifDegil,
}: {
  clientId: string;
  ilk: {
    kurulum: Sonuc<KurulumYaniti>;
    hazirlama: Sonuc<HazirlamaYaniti>;
    hazirlik: Sonuc<WorkspaceHazirlik>;
    /** Kurulum beyanları (`lib/kurulum-beyanlari.ts`); okunamadıysa beyanlı parçalar "Okunamadı". */
    beyanlar: BeyanOkumasi;
  };
  /** Workspace'in kayıtlı özel reklam kategorileri (`GET /clients/:id`); okunamadıysa null. */
  kategoriler: SpecialAdCategory[] | null;
  /** `GET /clients/:id` — "Workspace bilgileri" adımının formu; okunamadıysa null. */
  detay: AdimIcerigiOzellikleri['detay'];
  /** Adım eylemlerinin kapıları (`PANEL_KAPILARI`, sunucuda hesaplandı). */
  yetki: AdimYetkileri;
  ajansAdresi: string;
  workspaceAdi: string;
  /** Oturumda seçili workspace bu değil: kurulum yazmaları sunucuda reddedilir. */
  aktifDegil: boolean;
}) {
  const { yazabilir, hesapYazabilir } = yetki;
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const hataMetni = useCallback((e: unknown) => hataMetniDil(e, d.sunucuyaUlasilamadi), [d]);
  const kaynakAdi = { kurulum: d.kaynakKurulum, hazirlama: d.kaynakHazirlama, hazirlik: d.kaynakHazirlik, beyanlar: d.kaynakBeyanlar } as const;
  const router = useRouter();
  const [kurulum, setKurulum] = useState(ilk.kurulum);
  const [hazirlama, setHazirlama] = useState(ilk.hazirlama);
  const [hazirlik, setHazirlik] = useState(ilk.hazirlik);
  const [beyanlar, setBeyanlar] = useState(ilk.beyanlar);
  // Sunucu yeniden çizdiğinde (router.refresh) taze veri yerel kopyayı ezer.
  useEffect(() => setKurulum(ilk.kurulum), [ilk.kurulum]);
  useEffect(() => setHazirlama(ilk.hazirlama), [ilk.hazirlama]);
  useEffect(() => setHazirlik(ilk.hazirlik), [ilk.hazirlik]);
  useEffect(() => setBeyanlar(ilk.beyanlar), [ilk.beyanlar]);

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
      beyanlar: beyanGirdisi(beyanlar),
    }),
    [kurulum, hazirlama, hazirlik, kullanilmayanlar, beyanlar],
  );
  const adimlar = useMemo(() => kurulumListesi(girdi), [girdi]);
  const sayac = kurulumSayaci(adimlar);
  const kapsam = eksikleriTamamlaKapsami(girdi);
  const kapaliNeden = dugmeNedeni(kapsam, yazabilir, dil);

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
    const by = await beyanlariOku(apiFetch, clientId, dil);
    setKurulum(k);
    setHazirlama(hz);
    setHazirlik(hk);
    setBeyanlar(by);
    router.refresh();
  }, [clientId, router, hataMetni, dil]);

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

  const dusenler = (['kurulum', 'hazirlama', 'hazirlik', 'beyanlar'] as const).flatMap((k) => {
    const s = { kurulum, hazirlama, hazirlik, beyanlar }[k];
    return s.ok ? [] : [{ k, hata: s.hata }];
  });
  /*
   * BAŞLIK EYLEMLERİ (onaylı taslak `#marka`): sayfanın TEK birincil düğmesi
   * başlığın sağında. Yazabilen için birincil "Eksikleri tamamla" (taslak);
   * sihirbaz ikincil giriş. Yazamayan kişide tek düğme sihirbaz ve birincil:
   * sihirbaz her adımda kimin yapacağını söylüyor.
   *
   * SİHİRBAZ AYNI LİSTENİN ADIM ADIM GÖRÜNÜMÜ (MIMARI § 3a): sayaç
   * bitmemişse giriş, bitmişse YOK — bitmiş kurulumu "tamamla" demek boş bir
   * ekran açtırırdı.
   *
   * Yuva `undefined` = henüz aranmadı (sunucu çizimi), `null` = sayfada yok.
   * Aranmadan önce hiçbir yerde çizilmiyor; aksi hâlde düğme önce kartta
   * görünüp sonra başlığa ZIPLARDI.
   */
  const [yuva, setYuva] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => setYuva(document.getElementById(KURULUM_EYLEM_YUVASI)), []);
  const eylemler = (
    <>
      {!sayac.bitti && (
        <Link href={sihirbazAdresi(clientId)} className={dugmeSinifi(yazabilir ? 'ikincil' : 'birincil')}>
          {d.sihirbazlaTamamla}
        </Link>
      )}
      {yazabilir && (
        <Dugme ton="birincil" bekliyor={tamamlaniyor || calisiyor} disabled={!kapsam.yapacakVar} onClick={() => void eksikleriTamamla()}>
          {d.eksikleriTamamla}
        </Dugme>
      )}
    </>
  );

  const hesapAdimiAcik = adimlar.some((a) => (a.kod === 'meta' || a.kod === 'google') && a.durum !== 'tamam' && a.durum !== 'kullanilmiyor');
  const yuzde = Math.round((sayac.tamam / Math.max(sayac.toplam, 1)) * 100);

  return (
    <div className="space-y-4">
      {/* OAuth dönüşünün sonucu ("Ölçüm izinlerini ver" buraya dönüyor). Bant
          olmadan dönüş sessiz bir 302'ydi ve düğme aynı kalınca kullanıcı
          neyin olmadığını bilmiyordu. */}
      <CallbackBanner />
      <section aria-label={d.kurulumOzeti} className="rounded-kart border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-baslik text-base font-semibold text-ink">{sayacMetni(sayac, dil)}</p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-label={d.ilerlemeEtiketi}
              aria-valuemin={0}
              aria-valuemax={sayac.toplam}
              aria-valuenow={sayac.tamam}
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${yuzde}%` }} />
            </div>
          </div>
          {/* Başlık yuvası yoksa (başka bir sayfada çizilirse) düğmeler burada kalır. */}
          {yuva === null && eylemler}
        </div>
        {yuva && createPortal(eylemler, yuva)}
        {kapaliNeden && <p className="mt-2 text-xs text-ink-muted">{kapaliNeden}</p>}
        {yazabilir && kapsam.yapacakVar && (
          <p className="mt-2 text-xs text-ink-muted">{d.tamamlaAciklama}</p>
        )}
        {aktifDegil && yazabilir && (
          <p className="mt-2 text-xs text-warn-strong">{d.aktifDegil}</p>
        )}
        {calisiyor && (
          <p className="mt-2 text-xs text-ink-muted">{d.okunuyorAciklama}</p>
        )}
        {yoklamaBitti && calisiyor && (
          <p className="mt-2 text-xs text-warn-strong">{d.yoklamaBitti}</p>
        )}

        {dusenler.length > 0 && (
          <div className="mt-3">
            <Uyari ton="uyari" baslik={d.okunamayanBaslik}>
              <ul className="mt-1 space-y-0.5">
                {dusenler.map((x) => (
                  <li key={x.k}>
                    <b>{kaynakAdi[x.k]}:</b> {x.hata}
                  </li>
                ))}
              </ul>
              <Dugme ton="ikincil" boyut="kucuk" className="mt-2" onClick={() => void tazele()}>
                {d.yenidenDene}
              </Dugme>
            </Uyari>
          </div>
        )}

        {sonuc && 'hata' in sonuc && (
          <div className="mt-3">
            <Uyari ton="tehlike" baslik={d.tamamlanamadi}>
              {sonuc.hata}
            </Uyari>
          </div>
        )}
        {sonuc && 'sonuclar' in sonuc && (
          <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
            <ul className="space-y-1">
              {sonuc.sonuclar.length === 0 && !sonuc.hazirlamaYeniden && <li className="text-ink-muted">{d.eksikKalmadi}</li>}
              {sonuc.sonuclar.map((s) => (
                <li key={s.kod} className={s.durum === 'hata' ? 'text-danger-strong' : s.durum === 'atlandi' ? 'text-ink-muted' : 'text-ink'}>
                  <b>{KURULUM_ADIM_ADI[s.kod]}:</b> {s.durum === 'yapildi' ? '' : s.durum === 'atlandi' ? d.sonucAtlandi : d.sonucHata}
                  {s.mesaj}
                </li>
              ))}
              {sonuc.hazirlamaYeniden && <li className="text-ink">{d.hazirlikYenidenBasladi}</li>}
            </ul>
          </div>
        )}
        {/* DÜĞMENİN YAPAMADIĞI: "neden hâlâ eksik" sorusunun cevabı, nedeniyle. */}
        {kapsam.kullaniciyaKalan.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink">{d.sizeKalan}</p>
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
          <span className="text-ink-muted">{d.kullanmadigimPlatform}</span>
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
                className={`${HAP} disabled:cursor-not-allowed disabled:opacity-50 ${
                  kapali ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
                }`}
              >
                {PLATFORM_ADI[p]}
                {kapali ? d.kullanilmiyorEki : ''}
              </button>
            ) : (
              kapali && (
                <span key={p} className="rounded-full bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink">
                  {PLATFORM_ADI[p]}
                  {d.kullanilmiyorEki}
                </span>
              )
            );
          })}
          {kullanilmayanlar.length === 0 && !yazabilir && <span className="text-xs text-ink-muted">{d.beyanYok}</span>}
          <span className="basis-full text-xs text-ink-muted">
            {kullanilmayanlar.length > 0
              ? d.beyanAciklamaVar
              : d.beyanAciklamaYok}
          </span>
          {beyanHatasi && (
            <span role="alert" className="basis-full text-xs text-danger-strong">
              {beyanHatasi}
            </span>
          )}
        </div>

        {hesapAdimiAcik && kurulum.ok && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <span className="text-ink-muted">{d.hesapSahibiSoru}</span>
            {hesapYazabilir ? (
              (
                [
                  ['ajans', d.sahipAjans],
                  ['sirket', d.sahipSirket],
                ] as const
              ).map(([d, e]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={kurulum.v.hesapSahibi === d}
                  onClick={() => void sahipSec(d)}
                  className={`${HAP} ${
                    kurulum.v.hesapSahibi === d ? 'border-brand bg-vurgu text-ink' : 'border-line-strong bg-surface text-ink hover:bg-surface-sunken'
                  }`}
                >
                  {e}
                </button>
              ))
            ) : (
              <span className="text-xs text-ink-muted">{kapiNedeni('kurulum.hesap', dil)}</span>
            )}
          </div>
        )}
      </section>

      <ol className="divide-y divide-line rounded-kart border border-line bg-surface">
        {adimlar.map((a, i) => (
          <AdimSatirlari
            key={a.kod}
            sira={i + 1}
            ilkAcik={adimlar.findIndex((x) => x.durum !== 'tamam' && x.durum !== 'kullanilmiyor' && x.durum !== 'kapsam_disi') === i}
            icerik={{
              a,
              clientId,
              workspaceAdi,
              kurulum: kurulum.ok ? kurulum.v : null,
              sorular: hazirlama.ok ? hazirlama.v.sorular : [],
              hazirlamaVar: hazirlama.ok && hazirlama.v.sonCalisma !== null,
              kategoriler,
              detay,
              beyanlar: beyanGirdisi(beyanlar),
              kullanilmayanlar,
              yetki,
              ajansAdresi,
              kurulumGuncelle,
              hazirlamaGuncelle,
              tazele: () => void tazele(),
              kip: 'liste',
            }}
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
function AdimSatirlari({ sira, ilkAcik, icerik }: { sira: number; ilkAcik: boolean; icerik: AdimIcerigiOzellikleri }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const { a, clientId } = icerik;
  const [acik, setAcik] = useState(ilkAcik);
  // İçerik İLK açılışta monte edilir ve sonra DOM'da kalır: ölçüm tablosu
  // siteyi tarıyor; her Kurulum açılışında yedi adımın hepsini okumak boşa iş.
  const [monte, setMonte] = useState(ilkAcik);
  const panelId = useId();
  const dg = listeDurumu(a.durum, dil);
  // Kullanılmayan ve kapsam dışı adım da AÇILIYOR: içinde "Geri al" var.

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
            a.durum === 'tamam' ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink'
          }`}
        >
          {a.durum === 'tamam' ? '✓' : sira}
        </span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {a.ad}
            <DurumRozeti durum={a.durum} etiket={dg.etiket} />
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{adimOzeti(a, dil)}</p>
        </div>
        {a.kod === 'marka' ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Dugme ton="hayalet" boyut="kucuk" aria-expanded={acik} aria-controls={panelId} onClick={ac}>
              {acik ? d.kapat : d.ayrinti}
            </Dugme>
            <Link href={markaMerkeziAdresi('marka', clientId)} className={dugmeSinifi('ikincil', 'kucuk')}>
              {d.markayaGit}
            </Link>
          </div>
        ) : (
          (
            /* Satır başına KOYU, kırmızı değil: yedi adımda yedi kırmızı düğme
               sayfanın tek birincil eylemini ("Sihirbazla tamamla") boğuyordu. */
            <Dugme
              ton={a.durum === 'tamam' || acik ? 'ikincil' : 'koyu'}
              boyut="kucuk"
              aria-expanded={acik}
              aria-controls={panelId}
              onClick={ac}
            >
              {acik ? d.kapat : a.durum === 'tamam' ? d.ayrinti : d.tamamla}
            </Dugme>
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
              <AdimIcerigi {...icerik} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

