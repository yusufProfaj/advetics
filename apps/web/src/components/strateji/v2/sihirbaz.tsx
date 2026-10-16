'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STRATEJI_ADIM_ETIKETI,
  stratejiEkrani,
  stratejiPanelAdresi,
  stratejiUcYolu,
  olusturmaAdimiMi,
  type Permission,
  type RehberAmacKodu,
  type RehberKonumu,
  type SihirbazKitlesi,
  type StratejiOlusturmaAdimi,
  type StratejiSihirbazGirdileri,
  type StratejiSihirbazi,
} from '@advetics/shared';
import type { StratejiDetayi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { HataDurumu } from '@/components/ui/hal';
import { microsGirdiMetni, okumaHatasi } from '../hesap';
import { AltCubuk, IlerlemeRayi } from '@/components/ui/sihirbaz';
import { butceDurumu, gecerliAdim, oncekiAdim, rayParcalari } from './akis';
import { AdimGonder } from './adim-gonder';
import { AdimInceleme } from './adim-inceleme';
import { AdimPlan, type PlanAdimiTutamagi } from './adim-plan';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiSozlugu } from '@/dil/sozlukler/strateji';
import { stratejiV2Sozlugu } from '@/dil/sozlukler/strateji-v2';
import { menuSatiriEtiketi } from '@/lib/nav-sections';
import { AdimBolge, AdimButce, AdimHedef, AdimKime } from './adimlar-soru';
import { aySayisi } from './hesap';
import { Bildirim, yaz } from './ortak';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };

/**
 * ═══ STRATEJİ OLUŞTUR — YEDİ ADIM, TEK SORU (kullanıcı onaylı taslak) ═══
 *
 * Kullanıcının cümlesi: *"simülasyon gibi yapman lazım tek tek kurmaları
 * gerekiyor"*. Eski sekmeli düzenleyici (strateji / belge / aktarım)
 * kaldırıldı; bu bileşen yedi adımı sırayla gösterir.
 *
 * ADIM ADRESTE (`?adim=`, `stratejiPanelAdresi`, TEK üretici) ve geçiş
 * İSTEMCİDE (`history.pushState`): her adımda sunucu sayfayı yeniden çizseydi
 * hedef ve bütçe girdileri (Meta asgarisi platformdan okunuyor) her "Devam"da
 * yeniden okunurdu. Tarayıcının geri tuşu `popstate` ile adıma döner.
 *
 * HER "DEVAM" KAYDEDER (`PUT …/sihirbaz`, sürümle). Plan BÜTÇE adımında
 * doğar (oluşturma toplam istiyor); o ana kadar hedef seçimi adreste
 * (`?amaclar=`). "Kaydet ve çık" bulunduğu adımı yazar; girişte "Taslağa
 * devam et" oradan açar.
 */
export function StratejiSihirbazi({
  clientId,
  ilkDetay,
  ilkAdim,
  ilkAmaclar,
  girdiler,
  izinler,
}: {
  clientId: string;
  ilkDetay: StratejiDetayi | null;
  ilkAdim: StratejiOlusturmaAdimi;
  ilkAmaclar: RehberAmacKodu[];
  girdiler: Okuma<StratejiSihirbazGirdileri> | null;
  izinler: readonly Permission[];
}) {
  const router = useRouter();
  const ds = useSozluk(stratejiSozlugu);
  const d = useSozluk(stratejiV2Sozlugu).sihirbaz;
  const { dil } = useDil();
  const g0 = girdiler?.tur === 'veri' ? girdiler.v : null;
  /*
   * PARA BİRİMİ SEÇİMİ. Workspace'in hesabı yoksa ya da hesaplar farklı
   * birimdeyse sunucu birimi çözemiyor; kullanıcı seçiyor ve seçim plan
   * oluşturma isteğinde (`paraBirimi`) gidiyor. Bütçe hesabı ve gösterim
   * SEÇİLEN birimle yapılıyor: `g` bu yüzden girdilerin seçimle güncellenmiş
   * hâli, ekranın geri kalanı farkı bilmiyor.
   */
  const [paraSecimi, setParaSecimi] = useState<string | null>(null);
  const paraCozulmedi = !!g0?.paraBirimiHatasi && !ilkDetay;
  const g = g0 && paraCozulmedi && paraSecimi ? { ...g0, paraBirimi: paraSecimi } : g0;
  const [detay, setDetay] = useState<StratejiDetayi | null>(ilkDetay);
  const s0 = ilkDetay?.sihirbaz ?? null;
  const [adim, setAdim] = useState<StratejiOlusturmaAdimi>(() => gecerliAdim(ilkAdim, s0?.adim ?? (ilkDetay ? 'plan' : null), !!ilkDetay));
  const [amaclar, setAmaclar] = useState<RehberAmacKodu[]>(s0?.amaclar ?? ilkAmaclar);
  const [sure, setSure] = useState(() => (ilkDetay ? aySayisi(ilkDetay.plan.baslangic, ilkDetay.plan.bitis) : 3));
  const [butceMetni, setButceMetni] = useState(() => (ilkDetay ? microsGirdiMetni(ilkDetay.plan.toplamButceMicros, ilkDetay.plan.paraBirimi) : ''));
  const baslangicAyi = ilkDetay ? ilkDetay.plan.baslangic.slice(0, 7) : (g?.baslangicAyi ?? '');
  const [konumlar, setKonumlar] = useState<RehberKonumu[]>(() => (s0 && s0.konumlar.length > 0 ? s0.konumlar : (g?.konumOnerisi.konumlar ?? [])));
  const [kitle, setKitle] = useState<SihirbazKitlesi | null>(s0?.kitle ?? null);
  const [kayit, setKayit] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  const [incelemeBitti, setIncelemeBitti] = useState(false);
  const planTutamagi = useRef<PlanAdimiTutamagi>(null);
  const planId = detay?.plan.id ?? null;

  const durum = (a: StratejiOlusturmaAdimi): StratejiSihirbazi => ({
    adim: a,
    amaclar,
    konumlar,
    kitle,
    incelenen: detay?.sihirbaz?.incelenen ?? null,
    notlar: detay?.sihirbaz?.notlar ?? [],
  });

  // ── Adres: tek üretici, istemci geçişi, geri tuşu ──
  const adresYaz = useCallback(
    (a: StratejiOlusturmaAdimi, pid: string | null, sec: readonly RehberAmacKodu[], degistir = false) => {
      const url = stratejiPanelAdresi({ musteri: clientId, plan: pid, adim: a, amaclar: pid ? null : sec });
      if (degistir) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    },
    [clientId],
  );
  const git = (a: StratejiOlusturmaAdimi, pid: string | null = planId) => {
    setKayit({ tur: 'bos' });
    setAdim(a);
    adresYaz(a, pid, amaclar);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const geriTusu = () => {
      const e = stratejiEkrani(new URLSearchParams(window.location.search).get('adim'));
      if (e && olusturmaAdimiMi(e)) setAdim(gecerliAdim(e, detay?.sihirbaz?.adim ?? null, !!detay));
      else router.refresh();
    };
    window.addEventListener('popstate', geriTusu);
    return () => window.removeEventListener('popstate', geriTusu);
  }, [detay, router]);

  const tazeSurum = useCallback(async () => {
    if (!planId) return null;
    try {
      const d = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: planId }));
      setDetay(d);
      return d.plan.surum;
    } catch {
      return null;
    }
  }, [planId]);
  const yenile = useCallback(async () => {
    if (!planId) return null;
    try {
      const d = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: planId }));
      setDetay(d);
      return d;
    } catch (e) {
      setKayit({ tur: 'hata', mesaj: d.yenidenOkunamadi(okumaHatasi(e, dil)) });
      return null;
    }
  }, [planId]);

  const butce = g
    ? butceDurumu({
        metin: butceMetni,
        sureAy: sure,
        baslangicAyi,
        amaclar,
        girdiler: g,
        kayitli: detay ? { toplamMicros: detay.plan.toplamButceMicros, baslangic: detay.plan.baslangic, bitis: detay.plan.bitis, kalemSayisi: detay.kalemler.length } : null,
      })
    : null;

  /** Sihirbaz durumunu yazar ve sonraki adıma geçer. Bütçe adımında dönem ve toplam da gider. */
  async function kaydet(sonraki: StratejiOlusturmaAdimi | null, d0: StratejiDetayi | null = detay): Promise<StratejiDetayi | null> {
    setKayit({ tur: 'suruyor' });
    // ── Plan yok: bütçe adımında doğar ──
    if (!d0) {
      if (!butce || butce.tutar.tur !== 'tamam') {
        setKayit({ tur: 'hata', mesaj: d.butceYaz });
        return null;
      }
      try {
        const yeni = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar'), {
          method: 'POST',
          body: JSON.stringify({ clientId, baslangicAyi, sureAy: sure, toplamButce: butceMetni, ...(paraCozulmedi && paraSecimi ? { paraBirimi: paraSecimi } : {}), sihirbaz: { ...durum(sonraki ?? 'butce'), incelenen: null, notlar: [] } }),
        });
        setDetay(yeni);
        setKayit({ tur: 'bos' });
        if (sonraki) git(sonraki, yeni.plan.id);
        else adresYaz('butce', yeni.plan.id, amaclar, true);
        return yeni;
      } catch (e) {
        setKayit({ tur: 'hata', mesaj: okumaHatasi(e, dil) });
        return null;
      }
    }
    const butceAdimi = adim === 'butce' && butce?.tutar.tur === 'tamam' && butce.ilerler;
    const r = await yaz<StratejiDetayi>(
      stratejiUcYolu('/strateji/v2/planlar/:id/sihirbaz', { id: d0.plan.id }),
      'PUT',
      {
        surum: d0.plan.surum,
        sihirbaz: { ...durum(sonraki ?? adim), incelenen: d0.sihirbaz?.incelenen ?? null, notlar: d0.sihirbaz?.notlar ?? [] },
        ...(butceAdimi ? { donem: { baslangicAyi, sureAy: sure }, toplamButce: butceMetni } : {}),
      },
      tazeSurum,
      d0.plan.surum,
      dil,
    );
    if (r.tur !== 'tamam') {
      setKayit({ tur: 'hata', mesaj: r.mesaj });
      return null;
    }
    setDetay(r.veri);
    setKayit({ tur: 'bos' });
    if (sonraki) git(sonraki, r.veri.plan.id);
    return r.veri;
  }

  async function kaydetVeCik() {
    // Plan doğmadan (hedef, bütçe) kaydedilecek taslak yok: bütçe geçerliyse plan açılır, değilse yalnız çıkılır.
    if (detay || (adim === 'butce' && butce?.ilerler)) {
      const d = await kaydet(null);
      if (!d) return;
    }
    router.push(stratejiPanelAdresi({ musteri: clientId, adim: 'giris' }));
  }

  if (!g && (adim === 'hedef' || adim === 'butce' || adim === 'bolge')) {
    return (
      <HataDurumu baslik={d.girdilerOkunamadi} mesaj={girdiler?.tur === 'hata' ? girdiler.mesaj : d.girdilerYuklenmedi} />
    );
  }

  // ── Adımın "Devam"ı: koşul ve neden ──
  const geri = () => {
    const o = oncekiAdim(adim);
    if (o) git(o);
    else router.push(stratejiPanelAdresi({ musteri: clientId, adim: 'giris' }));
  };
  let devam: { etiket: string; kapali: boolean; not: string; onClick: () => void };
  switch (adim) {
    case 'hedef':
      devam = { etiket: d.devam, kapali: amaclar.length === 0, not: amaclar.length ? d.hedefSecildi(amaclar.length) : d.enAzBirHedef, onClick: () => (detay ? void kaydet('butce') : git('butce', null)) };
      break;
    case 'butce': {
      const paraEksik = paraCozulmedi && !paraSecimi;
      const ok = !!butce && butce.ilerler && !paraEksik;
      devam = {
        etiket: d.devam,
        kapali: !ok,
        not: paraEksik ? ds.devamParaBirimi : !butce || butce.tutar.tur !== 'tamam' ? d.butceYazKisa : !butce.ilerler ? d.butceYetmiyor : '',
        onClick: () => void kaydet('bolge'),
      };
      break;
    }
    case 'bolge':
      devam = { etiket: d.devam, kapali: konumlar.length === 0, not: konumlar.length ? d.bolgeSayisi(konumlar.length) : d.enAzBirBolge, onClick: () => void kaydet('kime') };
      break;
    case 'kime':
      devam = { etiket: d.planiHazirla, kapali: !kitle?.onaylandi, not: kitle?.onaylandi ? '' : d.tarifiOnayla, onClick: () => void kaydet('inceleme') };
      break;
    case 'inceleme':
      devam = { etiket: d.planiGor, kapali: !incelemeBitti, not: incelemeBitti ? '' : d.incelemeSuruyor, onClick: () => void kaydet('plan') };
      break;
    case 'plan':
      devam = {
        etiket: d.planiOnayla,
        kapali: !detay || detay.kalemler.length === 0,
        not: detay ? d.kampanyaSayisi(detay.kalemler.length) : '',
        onClick: () =>
          void (async () => {
            setKayit({ tur: 'suruyor' });
            const d = await planTutamagi.current?.onayla();
            if (!d) return setKayit({ tur: 'bos' });
            await kaydet('gonder', d);
          })(),
      };
      break;
    case 'gonder':
      devam = { etiket: d.raporuOnizle, kapali: !planId, not: '', onClick: () => planId && router.push(stratejiPanelAdresi({ musteri: clientId, plan: planId, adim: 'rapor' })) };
      break;
  }

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
          <Link href={stratejiPanelAdresi({ musteri: clientId, adim: 'giris' })} className="text-ink-muted no-underline hover:text-ink">
            {menuSatiriEtiketi('/strateji', dil)}
          </Link>{' '}
          › {d.stratejiOlustur} › <b className="font-semibold text-ink">{STRATEJI_ADIM_ETIKETI[adim]}</b>
        </span>
        <Dugme ton="hayalet" boyut="kucuk" onClick={() => void kaydetVeCik()} bekliyor={kayit.tur === 'suruyor'} title={detay ? undefined : d.taslakButceSonra}>
          {detay || adim === 'butce' ? d.kaydetVeCik : d.cik}
        </Dugme>
      </div>
      <IlerlemeRayi etiket={d.adimlar} parcalar={rayParcalari(adim).map((p) => ({ anahtar: p.adim, etiket: p.etiket, hal: p.hal }))} />

      <div key={adim} className="bolum-gecis mt-7">
        {adim === 'hedef' && g && <AdimHedef girdiler={g} secili={amaclar} degistir={setAmaclar} clientId={clientId} />}
        {adim === 'butce' && g && butce && <AdimButce girdiler={g} sure={sure} setSure={setSure} metin={butceMetni} setMetin={setButceMetni} durum={butce} paraSecimi={paraCozulmedi ? { secili: paraSecimi, sec: setParaSecimi } : null} />}
        {adim === 'bolge' && g && <AdimBolge girdiler={g} konumlar={konumlar} degistir={setKonumlar} />}
        {adim === 'kime' && planId && <AdimKime planId={planId} kitle={kitle} degistir={setKitle} />}
        {adim === 'inceleme' && detay && <AdimInceleme detay={detay} durum={durum('inceleme')} guncelle={setDetay} tazeSurum={tazeSurum} bittiBildir={setIncelemeBitti} />}
        {adim === 'plan' && detay && <AdimPlan detay={detay} guncelle={setDetay} yenile={yenile} tazeSurum={tazeSurum} girdiler={g} tutamak={planTutamagi} />}
        {adim === 'gonder' && detay && <AdimGonder detay={detay} guncelle={setDetay} tazeSurum={tazeSurum} izinler={izinler} ajansYoneticisi={g?.ajansYoneticisi ?? false} clientId={clientId} />}
        {!detay && adim !== 'hedef' && adim !== 'butce' && <Bildirim baslik={d.taslakGerekli}>{d.hedefButceBasla}</Bildirim>}
      </div>

      {kayit.tur === 'hata' && (
        <div className="mt-5">
          <Bildirim hata baslik={d.kaydedilemedi}>
            {kayit.mesaj}
          </Bildirim>
        </div>
      )}

      <AltCubuk geri={{ onClick: geri }} not={devam.not} devam={{ etiket: devam.etiket, onClick: devam.onClick, kapali: devam.kapali, bekliyor: kayit.tur === 'suruyor' }} />
    </div>
  );
}
