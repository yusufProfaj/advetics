'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  KURULUM_PLATFORMLARI,
  type HazirlamaYaniti,
  type KurulumYaniti,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import {
  KURULUM_LISTESI,
  acilisAdresi,
  kurulumListesi,
  kurulumSayaci,
  sihirbazAdresi,
  type KurulumPlatformu,
  type KurulumSayaci,
  type SirketKurulumAdimi,
} from '@/lib/panel-adresleri';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { adimOzeti, beyanDegistir } from '@/components/marka-merkezi/kurulum-listesi-mantik';
import type { SecimKarti } from './kurulum-akisi';
import { Ray, RayBasligi, RayListesi, type RaySatiri } from './sihirbaz-rayi';
import { BASLANGIC_SAYAC_SINIRI, DURUM_IKONU, baslangicSirasi, bittiMi, type BaslangicSatiri } from './sihirbaz-akisi';

/**
 * ═══ KURULUM SİHİRBAZI — BAŞLANGIÇ (`/kurulum`, onaylı taslak ekran 1) ═══
 *
 * "Ne yapmak istiyorsun?" — var olan bir workspace'i tamamla, yeni workspace
 * aç, (yetkiliyse) yeni şirket / üst hesap. Var olanlar EN ÇOK EKSİĞİ OLAN
 * ÜSTTE ve her satırda sayaç: kullanıcı hangi projenin yarım kaldığını
 * listeyi açmadan görüyor.
 *
 * WORKSPACE'E GEÇMEK AÇIK BİR EYLEM (MIMARI Ç-8): düğme "X'e geç ve tamamla"
 * diyor ve seçimin bütün sekmeleri etkilediğini altında yazıyor. Otomatik
 * geçiş YASAK (B1): başka sekmede A ile çalışan kullanıcının bir sonraki
 * yazması sessizce B'ye giderdi.
 *
 * SAYAÇLAR TEMBEL VE SINIRLI: her sayaç dört uç ve hazırlık okuması imzası
 * değişmiş workspace'te AI hazırlığını başlatıyor. İlk
 * `BASLANGIC_SAYAC_SINIRI` workspace okunur, kalanı "sayılmadı" yazar.
 */
type SayacHali = KurulumSayaci | null | undefined;

interface Okunan {
  sayac: SayacHali;
  hata?: string;
  eksikler?: string[];
  kullanilmayanlar?: KurulumPlatformu[];
}

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

async function sayacOku(id: string): Promise<Okunan> {
  const oku = async <T,>(yol: string): Promise<T | null> => {
    try {
      return await apiFetch<T>(yol);
    } catch {
      /*
       * TEK KAYNAĞIN DÜŞMESİ SAYACI "OKUNAMADI" YAPAR — sessiz "eksik" değil:
       * `kurulumListesi` null kaynağın parçalarını `bilinmiyor` sayıyor ve
       * sayaç onları "okunamadı" diye ayrı yazıyor.
       */
      return null;
    }
  };
  const [k, hz, hk] = await Promise.all([
    oku<KurulumYaniti>(`/clients/${id}/kurulum`),
    oku<HazirlamaYaniti>(`/clients/${id}/hazirlama`),
    oku<WorkspaceHazirlik>(`/clients/${id}/hazirlik`),
  ]);
  if (!k && !hz && !hk) return { sayac: null, hata: 'Kurulum bilgisi okunamadı.' };
  const by = await beyanlariOku(apiFetch, id, k);
  const adimlar = kurulumListesi({
    kurulum: k,
    hazirlama: hz,
    hazirlik: hk,
    kullanilmayanlar: k?.kullanilmayanPlatformlar ?? [],
    beyanlar: beyanGirdisi(by),
  });
  return {
    sayac: kurulumSayaci(adimlar),
    eksikler: adimlar.filter((a) => !bittiMi(a.durum)).map((a) => a.ad),
    kullanilmayanlar: k?.kullanilmayanPlatformlar ?? [],
  };
}

const PLATFORM_ADI: Record<KurulumPlatformu, string> = { meta: 'Meta (Facebook, Instagram)', google: 'Google Ads' };

export function Baslangic({
  sirketAdi,
  sirketAdimlari,
  workspaceler,
  workspaceHatasi,
  aktifClientId,
  kartlar,
  platformYazabilir,
}: {
  sirketAdi: string;
  sirketAdimlari: SirketKurulumAdimi[];
  /** Aktif şirketin workspace'leri (`/clients`); okunamadıysa boş + `workspaceHatasi`. */
  workspaceler: Array<{ id: string; name: string }>;
  workspaceHatasi: string | null;
  aktifClientId: string | null;
  /** Yeni workspace / şirket / üst hesap kartları ve (varsa) açılamama sebepleri. */
  kartlar: SecimKarti[];
  /** `kurulum.yaz` — platform beyanını yazabilir mi. */
  platformYazabilir: boolean;
}) {
  const [secim, setSecim] = useState<'tamamla' | SecimKarti['tur']>(workspaceler.length > 0 ? 'tamamla' : 'workspace');
  const [okunan, setOkunan] = useState<Record<string, Okunan>>({});
  const [seciliWs, setSeciliWs] = useState<string | null>(aktifClientId && workspaceler.some((w) => w.id === aktifClientId) ? aktifClientId : null);
  const [platformlar, setPlatformlar] = useState<Record<string, KurulumPlatformu[]>>({});
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * SAYAÇLAR ÜÇERLİ PARTİLER HÂLİNDE: yüz isteği aynı anda atmak paylaşımlı
   * sunucuda diğer sitelerin de yavaşlaması demek.
   */
  const okunacak = useMemo(() => workspaceler.slice(0, BASLANGIC_SAYAC_SINIRI).map((w) => w.id), [workspaceler]);
  useEffect(() => {
    let iptal = false;
    void (async () => {
      for (let i = 0; i < okunacak.length; i += 3) {
        const parti = okunacak.slice(i, i + 3);
        const sonuc = await Promise.all(parti.map(async (id) => [id, await sayacOku(id).catch((e: unknown) => ({ sayac: null, hata: hataMetni(e) }) as Okunan)] as const));
        if (iptal) return;
        setOkunan((x) => ({ ...x, ...Object.fromEntries(sonuc) }));
      }
    })();
    return () => {
      iptal = true;
    };
  }, [okunacak]);

  const satirlar: BaslangicSatiri[] = baslangicSirasi(
    workspaceler.map((w) => ({ id: w.id, ad: w.name, sayac: okunacak.includes(w.id) ? okunan[w.id]?.sayac : null })),
  );
  useEffect(() => {
    if (seciliWs === null && satirlar[0] && satirlar[0].sayac !== undefined) setSeciliWs(satirlar[0].id);
  }, [satirlar, seciliWs]);

  const secili = workspaceler.find((w) => w.id === seciliWs) ?? null;
  const mevcutKullanilmayan = seciliWs ? (okunan[seciliWs]?.kullanilmayanlar ?? null) : null;
  const yeniKullanilmayan = seciliWs ? (platformlar[seciliWs] ?? mevcutKullanilmayan ?? []) : [];

  async function gecVeTamamla() {
    if (!secili) return;
    setBekliyor(true);
    setHata(null);
    try {
      if (secili.id !== aktifClientId) {
        await apiFetch('/auth/switch-client', { method: 'POST', body: JSON.stringify({ clientId: secili.id }) });
      }
      /*
       * PLATFORM BEYANI GEÇİŞTEN SONRA: kurulum yazmaları aktif workspace
       * istiyor. Değişmediyse hiç yazılmaz (gereksiz denetim kaydı).
       */
      const degisti = mevcutKullanilmayan !== null && [...yeniKullanilmayan].sort().join() !== [...mevcutKullanilmayan].sort().join();
      if (degisti) {
        await apiFetch(`/clients/${secili.id}/kurulum/platformlar`, { method: 'PUT', body: JSON.stringify({ kullanilmayanlar: yeniKullanilmayan }) });
      }
      window.location.assign(sihirbazAdresi(secili.id));
    } catch (e) {
      setHata(hataMetni(e));
      setBekliyor(false);
    }
  }

  // ─── Ray ───
  const sirketSatirlari: RaySatiri[] = sirketAdimlari.map((a) => ({
    kod: a.kod,
    ad: a.ad,
    alt: adimOzeti({ ...a, kod: 'bilgiler', parcalar: a.parcalar.map((p) => ({ ...p, kaynak: 'hazirlik' as const })) }),
    ikon: DURUM_IKONU[a.durum],
    soluk: a.durum === 'kullanilmiyor',
    href: '#',
  }));
  const wsSatirlari: RaySatiri[] = KURULUM_LISTESI.map((a, i) => ({
    kod: a.kod,
    ad: a.ad,
    alt: null,
    ikon: 'no',
    numara: sirketAdimlari.length + i + 1,
    soluk: false,
    href: secili ? sihirbazAdresi(secili.id, a.kod) : '#',
  }));
  const sirketTamam = sirketAdimlari.filter((a) => a.durum === 'tamam').length;
  const sirketSayilan = sirketAdimlari.filter((a) => a.durum !== 'kullanilmiyor' && a.durum !== 'kapsam_disi').length;

  const kart = (tur: 'tamamla' | SecimKarti['tur'], baslik: string, aciklama: string, govde: React.ReactNode, engel: string | null = null) => {
    const acik = secim === tur;
    return (
      <div
        role="radio"
        aria-checked={acik}
        aria-disabled={engel !== null || undefined}
        tabIndex={0}
        onClick={() => setSecim(tur)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSecim(tur);
          }
        }}
        className={`grid cursor-pointer grid-cols-[22px_1fr] gap-3 rounded-xl border bg-surface px-[18px] py-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
          acik ? 'border-brand/45 shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary)_45%,transparent)]' : 'border-line'
        }`}
      >
        <span aria-hidden className={`mt-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 ${acik ? 'border-brand' : 'border-ink-muted'}`}>
          <span className={`h-2 w-2 rounded-full bg-brand transition-opacity duration-150 motion-reduce:transition-none ${acik ? 'opacity-100' : 'opacity-0'}`} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-bold text-ink">{baslik}</h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">{aciklama}</p>
          {engel && <p className="mt-1 text-[13px] text-ink">{engel}</p>}
          {/* AÇILIP KAPANAN İÇERİK DOM'DAN ÇIKMAZ: görünürlük sınıfla (CLAUDE.md). */}
          <div className={acik ? '' : 'hidden'} onClick={(e) => e.stopPropagation()}>
            {govde}
          </div>
        </div>
      </div>
    );
  };

  const yeniKarti = (tur: SecimKarti['tur']) => kartlar.find((k) => k.tur === tur);
  const wsKarti = yeniKarti('workspace');
  const sirketKarti = yeniKarti('sirket');
  const ustKarti = yeniKarti('ust-hesap');

  return (
    <section aria-label="Kurulum sihirbazı başlangıcı" className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="grid min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <Ray
          baslik={<RayBasligi tamam={0} toplam={0} metin="workspace seçilmedi" />}
          ozet={
            <>
              <span className="text-ink-muted">·</span> Adımlar <span className="ml-auto text-xs font-normal text-ink-muted">workspace seçilmedi</span>
            </>
          }
        >
          <RayListesi
            gruplar={[
              { baslik: 'Şirket', alt: sirketAdi, satirlar: sirketSatirlari },
              { baslik: 'Workspace', alt: null, satirlar: wsSatirlari },
            ]}
            son={{ kod: 'son', ad: 'Son kontrol', alt: null, ikon: 'no', numara: '✓', soluk: false, href: secili ? sihirbazAdresi(secili.id, 'son') : '#' }}
            aktif=""
            git={(kod) => {
              if (secili && kod !== 'baglantilar' && kod !== 'guvenlik') window.location.assign(sihirbazAdresi(secili.id, kod));
            }}
          />
        </Ray>

        <div className="flex min-w-0 flex-col px-4 pt-5 lg:px-8 lg:pt-7">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">Kurulum sihirbazı</span>
          <h2 className="mb-1.5 mt-1.5 font-baslik text-xl font-extrabold text-ink lg:text-2xl">Ne yapmak istiyorsun?</h2>
          <p className="mb-4 max-w-[66ch] text-sm text-ink-muted">
            Sihirbaz bir şirketin ve workspace’in reklam vermeye hazır olması için gereken her şeyi sırayla tamamlar. Bitmiş adımları atlar ama gösterir; kalan her işin nedenini yazar.
          </p>

          <div role="radiogroup" aria-label="Sihirbaz türü" className="grid gap-3">
            {workspaceler.length > 0 || workspaceHatasi
              ? kart(
                  'tamamla',
                  'Var olan bir workspace’i tamamla',
                  `${sirketAdi} şirketinin workspace’leri, en çok eksiği olan üstte.`,
                  <>
                    {workspaceHatasi && <p className="mt-2 text-sm text-danger-strong">Workspace listesi okunamadı: {workspaceHatasi}</p>}
                    <ul role="listbox" aria-label="Workspace seç" className="mt-3.5 overflow-hidden rounded-[10px] border border-line">
                      {satirlar.map((s) => {
                        const o = okunan[s.id];
                        const sayilmadi = !okunacak.includes(s.id);
                        const kalan = s.sayac ? s.sayac.toplam - s.sayac.tamam : null;
                        const yuzde = s.sayac ? Math.round((s.sayac.tamam / Math.max(s.sayac.toplam, 1)) * 100) : 0;
                        return (
                          <li
                            key={s.id}
                            role="option"
                            aria-selected={seciliWs === s.id}
                            tabIndex={0}
                            onClick={() => setSeciliWs(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSeciliWs(s.id);
                              }
                            }}
                            className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-t border-line px-3.5 py-3 first:border-t-0 focus-visible:outline-2 focus-visible:outline-brand sm:grid-cols-[minmax(0,1fr)_auto_auto] ${
                              seciliWs === s.id ? 'bg-surface-muted shadow-[inset_3px_0_0_var(--brand-primary)]' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-ink">{s.ad}</div>
                              <div className="truncate text-[12.5px] text-ink-muted">
                                {sayilmadi
                                  ? 'Sayılmadı: ilk ' + BASLANGIC_SAYAC_SINIRI + ' workspace sayılıyor; açınca okunur.'
                                  : s.sayac === undefined
                                    ? 'Okunuyor…'
                                    : s.sayac === null
                                      ? `Okunamadı${o?.hata ? `: ${o.hata}` : ''}`
                                      : s.sayac.bitti
                                        ? 'Hiç eksik yok'
                                        : `Eksik: ${(o?.eksikler ?? []).slice(0, 4).join(', ')}${(o?.eksikler?.length ?? 0) > 4 ? ` ve ${o!.eksikler!.length - 4} adım daha` : ''}`}
                              </div>
                            </div>
                            <div className="hidden h-1 w-[90px] overflow-hidden rounded bg-surface-sunken sm:block" aria-hidden>
                              <span className="block h-full bg-ink" style={{ width: `${yuzde}%` }} />
                            </div>
                            <div className="text-right font-baslik text-[13px] font-bold text-ink">
                              {s.sayac ? `${s.sayac.tamam} / ${s.sayac.toplam}` : '—'}
                              <small className="mt-0.5 block font-sans text-[11.5px] font-normal text-ink-muted">
                                {s.sayac ? (s.sayac.bitti ? 'hazır' : s.sayac.bilinmiyor > 0 && kalan === s.sayac.bilinmiyor ? `${s.sayac.bilinmiyor} okunamadı` : `${kalan} iş kaldı`) : ''}
                              </small>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {/* SESSİZ KESME YOK: kaç workspace'in sayıldığı yazılı. */}
                    {workspaceler.length > BASLANGIC_SAYAC_SINIRI && (
                      <p className="mt-2 text-[12.5px] text-ink-muted">
                        {workspaceler.length} workspace’ten {BASLANGIC_SAYAC_SINIRI} tanesinin sayacı okundu.
                      </p>
                    )}
                    {secili && (
                      <div className="mt-3.5 rounded-[10px] bg-surface-muted px-3.5 py-3 text-[13px]">
                        <b className="mb-2 block text-ink">{secili.name} workspace’inde hangi platformlarda reklam vereceğiz?</b>
                        {KURULUM_PLATFORMLARI.map((p) => {
                          const acik = !yeniKullanilmayan.includes(p);
                          const yeni = beyanDegistir(yeniKullanilmayan, p);
                          return (
                            <label key={p} className="mr-4 inline-flex items-center gap-2 font-semibold text-ink">
                              <input
                                type="checkbox"
                                checked={acik}
                                disabled={!platformYazabilir || mevcutKullanilmayan === null || yeni === null}
                                onChange={() => yeni && setPlatformlar((x) => ({ ...x, [secili.id]: yeni }))}
                                className="h-4 w-4 accent-[var(--text)]"
                              />
                              {PLATFORM_ADI[p]}
                            </label>
                          );
                        })}
                        <p className="mt-2.5 text-[12.5px] text-ink-muted">
                          {mevcutKullanilmayan === null
                            ? 'Bu workspace’in platform beyanı henüz okunmadı.'
                            : 'Kullanmadığın platformun adımları listede soluk kalır ve sayılmaz. Sonradan açabilirsin. İkisi birden kapatılamaz.'}
                        </p>
                      </div>
                    )}
                    {hata && (
                      <p role="alert" className="mt-2 text-sm text-danger-strong">
                        {hata}
                      </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Dugme bekliyor={bekliyor} disabled={!secili} onClick={() => void gecVeTamamla()}>
                        {secili ? (secili.id === aktifClientId ? `${secili.name} workspace’ini tamamla` : `${secili.name} workspace’ine geç ve tamamla`) : 'Bir workspace seç'}
                      </Dugme>
                    </div>
                    {secili && secili.id !== aktifClientId && (
                      <p className="mt-2.5 text-[12.5px] text-ink-muted">Üst çubukta seçili workspace de {secili.name} olur; açık diğer sekmeler de ona geçer.</p>
                    )}
                  </>,
                )
              : null}
            {wsKarti &&
              kart(
                'workspace',
                'Yeni workspace aç',
                `${sirketAdi} şirketine yeni bir proje ekler. Önce adı ve web sitesi, sonra hesaplar; aynı sihirbaz sonuna kadar götürür.`,
                !wsKarti.engel && (
                  <div className="mt-2.5">
                    <Link href={acilisAdresi('workspace')} className={dugmeSinifi('birincil')}>
                      Yeni workspace aç
                    </Link>
                  </div>
                ),
                wsKarti.engel,
              )}
            {sirketKarti &&
              kart(
                'sirket',
                'Yeni şirket aç',
                'Ajansa yeni bir şirket ekler. Ajansın Meta ve Google bağlantısı yeni şirkette de kullanılır; yeniden bağlanmaz.',
                !sirketKarti.engel && (
                  <div className="mt-2.5">
                    <Link href={acilisAdresi('sirket')} className={dugmeSinifi('birincil')}>
                      Yeni şirket aç
                    </Link>
                  </div>
                ),
                sirketKarti.engel,
              )}
            {ustKarti &&
              kart(
                'ust-hesap',
                ustKarti.baslik,
                ustKarti.aciklama,
                !ustKarti.engel && (
                  <div className="mt-2.5">
                    <Link href={acilisAdresi('ust-hesap')} className={dugmeSinifi('birincil')}>
                      Yeni üst hesap aç
                    </Link>
                  </div>
                ),
                ustKarti.engel,
              )}
          </div>

          <div className="sticky bottom-0 -mx-4 mt-6 flex flex-wrap items-center gap-2.5 border-t border-line bg-surface px-4 py-3.5 lg:-mx-8 lg:px-8">
            <span className="text-[12.5px] text-ink-muted">
              Şirket adımları tamam: {sirketTamam} / {sirketSayilan}
            </span>
            <span className="flex-1" />
            <Link href="/dashboard" className={dugmeSinifi('ikincil')}>
              Vazgeç
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
