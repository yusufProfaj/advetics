'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import {
  KURULUM_ADIM_ADI,
  KURULUM_BEYAN_OGESI_ADI,
  type ConnectionSummary,
  type HazirlamaYaniti,
  type IkiAdimDurumu,
  type KurulumAdimSonucu,
  type KurulumTamamlaIstegi,
  type KurulumYaniti,
  type ProviderAvailability,
  type SirketKurulumYaniti,
  type SpecialAdCategory,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { butceAdresi } from '@/lib/butce-adresi';
import { beyanGirdisi, type BeyanOkumasi } from '@/lib/kurulum-beyanlari';
import {
  PANEL_KAPILARI,
  SIHIRBAZ_ADI,
  ayarlarAdresi,
  eksikleriTamamlaKapsami,
  hesaplarAdresi,
  kurulumListesi,
  kurulumSayaci,
  markaMerkeziAdresi,
  sihirbazAdresi,
  sirketKurulumListesi,
  type KurulumListesiDurumu,
  type KurulumListesiGirdisi,
  type KurulumPlatformu,
} from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Girdi } from '@/components/ui/alan';
import { Kart } from '@/components/ui/kart';
import { Serit } from '@/components/ui/hal';
import { AltCubuk, IlerlemeRayi, Soru, type RayParcasi } from '@/components/ui/sihirbaz';
import { IkiAdimSirketAyari } from '@/components/tenancy/iki-adim-sirket-ayari';
import { AdimIcerigi, type AdimYetkileri } from '@/components/marka-merkezi/adim-icerigi';
import type { WorkspaceDetay } from '@/components/marka-merkezi/workspace-bilgileri';
import type { Sonuc } from '@/components/marka-merkezi/kurulum-listesi';
import { tarihYaz } from '@/components/marka-merkezi/beyan-alani';
import { YOKLAMA_ARALIGI_MS, YOKLAMA_SINIRI, yoklamaGerekli } from '@/components/marka-merkezi/hazirlama-mantik';
import { adimOzeti } from '@/components/marka-merkezi/kurulum-listesi-mantik';
import { CallbackBanner } from '@/components/callback-banner';
import { PlatformAdimi } from './platform-adimi';
import { DurumIkonu, Ray, RayBasligi, RayListesi, type RaySatiri } from './sihirbaz-rayi';
import {
  DURUM_IKONU,
  DURUM_METNI,
  SIHIRBAZ_SIRASI,
  SIRKET_ADIMLARI,
  YOKLAMA_METNI,
  YOKLAMA_SINIR_METNI,
  acilisAdimi,
  adimBeyanlari,
  adimIzi,
  adimSirasi,
  bittiMi,
  hukum,
  istekSonucu,
  oncekiAdim,
  otomatikDurumu,
  sonrakiAdim,
  yoklamaKarari,
  type IstekSonucu,
  type SihirbazAdimi,
} from './sihirbaz-akisi';

/**
 * ═══ KURULUM SİHİRBAZI — TAMAMLAMA (`/kurulum?musteri=&adim=`) ═══
 * (docs/kurulum-sihirbazi/MIMARI.md § 3, onaylı taslak ekran 2 ve 3)
 *
 * Kullanıcı: *"bu sihirbazı çalıştırdığımızda şirketin ve workspace'in hiç
 * bi eksiği kalmasın"*. Solda şirketin iki ve workspace'in on adımı, sağda
 * geçerli adım, altta Geri · Otomatik yap · Bunu kullanmıyorum · Sonra
 * yapacağım · Devam. Adımların TANIMI ve DURUMU sözleşmeden
 * (`kurulumListesi`, `sirketKurulumListesi`), içeriği Marka Merkezi ›
 * Kurulum'la AYNI bileşenden (`AdimIcerigi`). Sihirbaz yalnız yürütücü.
 *
 * İLERLEME SAKLANMAZ: hangi adımda olunduğu adreste, adımların hâli uçlarda.
 * Her eylemden sonra sunucu yeniden çizer (`router.refresh`) ve rozetler
 * oradan gelir; istemcide tutulan bir "bitti" listesi, kullanıcı aynı işi
 * Marka Merkezi'nden bitirdiğinde bayatlardı.
 *
 * SESSİZ HATA YOK: düşen her kaynak kendi cümlesiyle (`Sonuc`), okunamayan
 * adım "Okunamadı" (eksik DEĞİL), platform hatası platformun mesajıyla,
 * uzun iş "düştü" değil "sürüyor" (`istekSonucu`).
 */
export interface TamamlamaVerisi {
  kurulum: Sonuc<KurulumYaniti>;
  hazirlama: Sonuc<HazirlamaYaniti>;
  hazirlik: Sonuc<WorkspaceHazirlik>;
  beyanlar: BeyanOkumasi;
  detay: Sonuc<WorkspaceDetay>;
  /** PARAMETRESİZ `/connections` (MIMARI Ç-2: `?clientId=` ajans bağlantısını gizler). */
  baglantilar: Sonuc<ConnectionSummary[]>;
  uygunluk: Sonuc<ProviderAvailability[]>;
  /** Yalnız 2FA ayar bileşeni için (`IkiAdimSirketAyari`); hüküm `sirket`ten. */
  ikiAdim: Sonuc<IkiAdimDurumu>;
  /**
   * `GET /kurulum/sirket` TAM yanıtı: şirket beyanları, 2FA zorunluluğu,
   * şirketin kullandığı platformlar. "Tüm şirketler" görünümünde ya da
   * şirket uyuşmazsa okunamadı (sayfa kuruyor).
   */
  sirket: Sonuc<SirketKurulumYaniti>;
  /** Sihirbazı kullanan kişinin rapor gönderen e-postası — ÜÇ HÂLLİ (Ç-6); `yetkisiz` = satır çizilmez. */
  eposta: boolean | null | 'yetkisiz';
}

export interface TamamlamaYetkileri extends AdimYetkileri {
  /** `baglanti.yetkilendir` */
  baglantiYetkilendir: boolean;
  /** `ikiAdim.sirketZorunlulugu` */
  ikiAdimYonet: boolean;
  /** `sirketKurulum.beyan` */
  sirketBeyan: boolean;
  /** `ekip.yonet` */
  ekipYonet: boolean;
}

/** "Bu neden gerekli" — reklam bilmeyen kullanıcının dilinde, tek cümle (MIMARI § 3c). */
const NEDEN: Record<SihirbazAdimi, string> = {
  baglantilar: 'Reklam hesapları, sayfalar ve ölçüm araçları Meta ve Google bağlantısından gelir.',
  guvenlik: 'Şirketin hesaplarına kimlerin, nasıl girdiğine bir kez karar verilir.',
  bilgiler: 'Site adresi ölçümün ve yapay zekânın girdisi; rapor alıcıları olmadan rapor kimseye gitmez.',
  meta: 'Instagram ve Facebook reklamları bu hesaptan yayınlanır; ödeme yöntemi olmadan reklam yayına çıkmaz.',
  sayfa: 'Reklam bir Facebook sayfası ve Instagram hesabı adına görünür.',
  piksel: 'Sitendeki ziyaretleri ve formları Meta’nın görebilmesi için.',
  google: 'Google aramalarında ve YouTube’da reklam bu hesaptan yayınlanır; ödeme yöntemi olmadan reklam yayına çıkmaz.',
  olcum:
    'Reklamdan gelen formları, telefon aramalarını ve WhatsApp mesajlarını sayabilmemiz için. Sayılmayan sonucu Meta ve Google da iyileştiremez.',
  marka: 'Reklam metinleri ve yapay zekâ markanı buradan tanır; bir kez doldurulur, bir daha sorulmaz.',
  varsayilanlar: 'Her reklamda yeniden sorulmasın diye: özel kategori, kime gösterileceği ve günlük bütçe.',
  bildirimler: 'Bir reklam durduğunda ya da bütçe tükendiğinde kime haber gideceği.',
  veri: 'Raporlar ve Genel Bakış bu veriden beslenir; hesap atanmışken veri gelmiyorsa bu bir arıza.',
  son: '',
};

type Islem =
  | { tur: 'bosta' }
  | { tur: 'isleniyor' }
  | { tur: 'yoklama'; neden: Extract<IstekSonucu, { tur: 'yoklama' }>['neden']; iz: string; deneme: number }
  | { tur: 'sinir' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'bitti'; sonuclar: KurulumAdimSonucu[]; hazirlamaYeniden: boolean; iz: string };

export function Tamamlama({
  clientId,
  workspaceAdi,
  sirketAdi,
  veri,
  ilkAdim,
  yetki,
  aktifDegil,
  ajansAdresi,
  ustBant,
}: {
  clientId: string;
  workspaceAdi: string;
  sirketAdi: string;
  veri: TamamlamaVerisi;
  ilkAdim: SihirbazAdimi | null;
  yetki: TamamlamaYetkileri;
  /** Oturumda seçili workspace bu değil (seçim yok): yazmalar reddedilir. */
  aktifDegil: boolean;
  ajansAdresi: string;
  /** Workspace'e geçiş bandı (seçim yokken). */
  ustBant?: ReactNode;
}) {
  const router = useRouter();
  const [yenileniyor, startTransition] = useTransition();
  const tazele = useCallback(() => startTransition(() => router.refresh()), [router]);

  // Sunucunun son çizimi + eylem yanıtlarının anlık kopyası (yanıt gelince
  // rozet beklemeden değişsin; sunucu yeniden çizince yerel kopya ezilir).
  const [kurulum, setKurulum] = useState(veri.kurulum);
  const [hazirlama, setHazirlama] = useState(veri.hazirlama);
  useEffect(() => setKurulum(veri.kurulum), [veri.kurulum]);
  useEffect(() => setHazirlama(veri.hazirlama), [veri.hazirlama]);

  const kullanilmayanlar: KurulumPlatformu[] = kurulum.ok ? kurulum.v.kullanilmayanPlatformlar : [];
  const girdi: KurulumListesiGirdisi = useMemo(
    () => ({
      kurulum: kurulum.ok ? kurulum.v : null,
      hazirlama: hazirlama.ok ? hazirlama.v : null,
      hazirlik: veri.hazirlik.ok ? veri.hazirlik.v : null,
      kullanilmayanlar,
      beyanlar: beyanGirdisi(veri.beyanlar),
    }),
    [kurulum, hazirlama, veri.hazirlik, veri.beyanlar, kullanilmayanlar],
  );
  const adimlar = useMemo(() => kurulumListesi(girdi), [girdi]);
  const sirketAdimlari = useMemo(
    () =>
      sirketKurulumListesi({
        baglantilar: veri.baglantilar.ok ? veri.baglantilar.v : null,
        uygunluk: veri.uygunluk.ok ? veri.uygunluk.v : null,
        /*
         * ŞİRKETİN KULLANDIĞI PLATFORMLAR — SUNUCUDAN, sözleşmenin kuralıyla
         * ("en az bir workspace kullanıyorsa"; `SirketKurulumYaniti`). Bir süre
         * BU workspace'in beyanından türetiliyordu: Google'ı kullanmayan bir
         * workspace'te şirketin Google bağlantısı "kullanılmıyor" diye düşüyor,
         * aynı şirket başka workspace'in sihirbazında "eksik" diyordu — tek
         * şirkete iki hüküm. Okunamazsa `null` (bilinmiyor), tahmin yok.
         */
        kullanilanPlatformlar: veri.sirket.ok ? veri.sirket.v.kullanilanPlatformlar : null,
        ikiAdimZorunlu: veri.sirket.ok ? veri.sirket.v.ikiAdimZorunlu : null,
        beyanlar: veri.sirket.ok ? veri.sirket.v.beyanlar : null,
      }),
    [veri.baglantilar, veri.uygunluk, veri.sirket],
  );
  const wsSayac = kurulumSayaci(adimlar);
  const sSayac = kurulumSayaci(sirketAdimlari);
  const durumlar = useMemo(() => {
    const m: Partial<Record<SihirbazAdimi, KurulumListesiDurumu>> = {};
    for (const a of sirketAdimlari) m[a.kod] = a.durum;
    for (const a of adimlar) m[a.kod] = a.durum;
    return m;
  }, [adimlar, sirketAdimlari]);

  const [aktif, setAktif] = useState<SihirbazAdimi>(() => ilkAdim ?? acilisAdimi(durumlar));
  const baslikRef = useRef<HTMLDivElement>(null);
  const ilkCizim = useRef(true);
  const [islem, setIslem] = useState<Islem>({ tur: 'bosta' });

  /*
   * ADIM ADRESTE (yenileme aynı adıma döner), sunucuya gidilmeden:
   * `router.replace` bütün uçları yeniden okurdu. Odak başlığa: ekran
   * okuyucu kullanıcısı içeriğin değiştiğini ancak böyle öğrenir.
   */
  const git = useCallback(
    (kod: string) => {
      const hedef = SIHIRBAZ_SIRASI.find((k) => k === kod);
      if (!hedef) return;
      setAktif(hedef);
      setIslem({ tur: 'bosta' });
      window.history.replaceState(null, '', sihirbazAdresi(clientId, hedef));
    },
    [clientId],
  );
  useEffect(() => {
    if (ilkCizim.current) {
      ilkCizim.current = false;
      return;
    }
    baslikRef.current?.focus();
  }, [aktif]);

  /*
   * DIŞ SAYFADAN DÖNÜŞ (ödeme, Tag Manager, OAuth başka sekmede): sekmeye
   * dönünce durum YENİDEN OKUNUR. Okunmasaydı kullanıcı kartı ekleyip döner,
   * ekran hâlâ "ödeme yöntemi yok" derdi.
   */
  useEffect(() => {
    const gorunur = () => {
      if (document.visibilityState === 'visible') tazele();
    };
    document.addEventListener('visibilitychange', gorunur);
    return () => document.removeEventListener('visibilitychange', gorunur);
  }, [tazele]);

  /* HAZIRLAMA ARKA PLANDA: yoklanır, sınırda durur ve bunu söyler (liste ile aynı kural). */
  const hazirlamaYoklama = useRef(0);
  const [hazirlamaSinir, setHazirlamaSinir] = useState(false);
  const calisiyor = hazirlama.ok && yoklamaGerekli(hazirlama.v.durum);
  useEffect(() => {
    if (!calisiyor) {
      hazirlamaYoklama.current = 0;
      return;
    }
    if (hazirlamaYoklama.current >= YOKLAMA_SINIRI) {
      setHazirlamaSinir(true);
      return;
    }
    const z = window.setTimeout(() => {
      hazirlamaYoklama.current += 1;
      tazele();
    }, YOKLAMA_ARALIGI_MS);
    return () => window.clearTimeout(z);
  }, [calisiyor, hazirlama, tazele]);

  const aktifAdim = adimlar.find((a) => a.kod === aktif);
  const aktifSirket = sirketAdimlari.find((a) => a.kod === aktif);
  const mevcutIz = adimIzi(aktifAdim ?? aktifSirket);

  /*
   * İŞLEM YOKLAMASI: 409 / ağ / ters vekil zaman aşımı "düştü" değil
   * "sürüyor" (`istekSonucu`). Adımın görünen hâli değişene ya da sınır
   * dolana kadar sunucu yeniden çizilir (`yoklamaKarari`).
   */
  useEffect(() => {
    if (islem.tur !== 'yoklama') return;
    const karar = yoklamaKarari(islem.iz, mevcutIz, islem.deneme);
    if (karar === 'bitti') {
      setIslem({ tur: 'bitti', sonuclar: [], hazirlamaYeniden: false, iz: mevcutIz });
      return;
    }
    if (karar === 'sinir') {
      setIslem({ tur: 'sinir' });
      return;
    }
    const z = window.setTimeout(() => {
      setIslem((x) => (x.tur === 'yoklama' ? { ...x, deneme: x.deneme + 1 } : x));
      tazele();
    }, YOKLAMA_ARALIGI_MS);
    return () => window.clearTimeout(z);
  }, [islem, mevcutIz, tazele]);

  const sirketAdimiMi = SIRKET_ADIMLARI.has(aktif);
  const kapsam = !sirketAdimiMi && aktif !== 'son' && aktifAdim ? eksikleriTamamlaKapsami(girdi, aktifAdim.kod) : null;
  const oto = kapsam
    ? otomatikDurumu(kapsam, { yazabilir: yetki.yazabilir, aktifDegil })
    : { acik: false, neden: 'Şirket adımlarını sistem kendisi yapamaz: bağlantı ve güvenlik kararı senin.' };

  async function otomatikYap() {
    if (!kapsam || !aktifAdim) return;
    const iz = adimIzi(aktifAdim);
    setIslem({ tur: 'isleniyor' });
    try {
      let sonuclar: KurulumAdimSonucu[] = [];
      if (kapsam.kurulumAdimlari.length > 0) {
        /*
         * `kodlar` SÜZGECİ: adım başına "Otomatik yap" YALNIZ bu adımın
         * parçalarını yapar (`kurulumTamamlaSchema`, sunucu süzgeci Ajan 2).
         * Gövde sözleşmenin tipinden kuruluyor: alan adı elle yazılsaydı ve
         * bir gün ayrışsaydı sunucu gövdeyi yok sayıp `OTOMATIK_SIRA`nın
         * TAMAMINI yapardı — ölçüm adımında "Otomatik yap"a basan kullanıcı
         * sayfa atamasını ve Google Ads dönüşümlerini de tetiklerdi. İstenen
         * ama otomatik olmayan kod sunucudan `atlandi` + nedeniyle döner.
         */
        const govde: KurulumTamamlaIstegi = { kodlar: [...kapsam.kurulumAdimlari] };
        const r = await apiFetch<KurulumYaniti & { sonuclar: KurulumAdimSonucu[] }>(`/clients/${clientId}/kurulum/tamamla`, {
          method: 'POST',
          body: JSON.stringify(govde),
        });
        sonuclar = r.sonuclar ?? [];
        setKurulum({ ok: true, v: r });
      }
      if (kapsam.hazirlamaYeniden) {
        setHazirlama({ ok: true, v: await apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`, { method: 'POST' }) });
        hazirlamaYoklama.current = 0;
        setHazirlamaSinir(false);
      }
      setIslem({ tur: 'bitti', sonuclar, hazirlamaYeniden: kapsam.hazirlamaYeniden, iz });
      tazele();
    } catch (e) {
      const s = istekSonucu(e);
      setIslem(s.tur === 'yoklama' ? { tur: 'yoklama', neden: s.neden, iz, deneme: 0 } : { tur: 'hata', mesaj: s.mesaj });
    }
  }

  // ─── Ray ───
  const href = (kod: string) => sihirbazAdresi(clientId, kod);
  const sirketSatirlari: RaySatiri[] = sirketAdimlari.map((a) => ({
    kod: a.kod,
    ad: a.ad,
    alt: adimOzeti({ ...a, kod: 'bilgiler', parcalar: a.parcalar.map((p) => ({ ...p, kaynak: 'hazirlik' as const })) }),
    ikon: DURUM_IKONU[a.durum],
    soluk: a.durum === 'kullanilmiyor' || a.durum === 'kapsam_disi',
    href: href(a.kod),
  }));
  const wsSatirlari: RaySatiri[] = adimlar.map((a) => ({
    kod: a.kod,
    ad: a.ad,
    alt: a.durum === 'kullanilmiyor' ? 'Kullanılmıyor' : a.durum === 'kapsam_disi' && a.parcalar.length === 0 ? 'Kapsam dışı' : adimOzeti(a),
    ikon: DURUM_IKONU[a.durum],
    soluk: a.durum === 'kullanilmiyor' || (a.durum === 'kapsam_disi' && a.parcalar.length === 0),
    href: href(a.kod),
  }));
  const h = hukum(sSayac, wsSayac);
  const sonSatir: RaySatiri = { kod: 'son', ad: 'Son kontrol', alt: h.baslik, ikon: aktif === 'son' ? 'simdi' : 'no', numara: '✓', soluk: false, href: href('son') };
  const toplamTamam = sSayac.tamam + wsSayac.tamam;
  const toplam = sSayac.toplam + wsSayac.toplam;
  const { sira, toplam: adimToplami } = adimSirasi(aktif);
  const aktifAd = aktif === 'son' ? 'Son kontrol' : (aktifAdim?.ad ?? aktifSirket?.ad ?? '');
  const aktifDurum = durumlar[aktif];

  /*
   * ÜST RAY (ortak `IlerlemeRayi`): sol listeyle AYNI sıra ve AYNI hüküm.
   * Sol liste tıklanabilir ayrıntı (adım adım durum, kısa sonuç), üst ray
   * bir bakışta "neredeyim, kaç adım kaldı". Bitmiş sayılan adım siyah;
   * sıra dışı bitirilen adım da siyah görünür, çünkü kurulum sırayla
   * yapılmak zorunda değil.
   */
  const rayParcalari: RayParcasi[] = SIHIRBAZ_SIRASI.map((kod) => ({
    anahtar: kod,
    etiket: kod === 'son' ? 'Son kontrol' : (adimlar.find((a) => a.kod === kod)?.ad ?? sirketAdimlari.find((a) => a.kod === kod)?.ad ?? kod),
    hal: kod === aktif ? 'simdi' : (kod === 'son' ? h.tamam : bittiMi(durumlar[kod])) ? 'bitti' : 'sirada',
  }));

  const rayIcerigi = (
    <RayListesi
      gruplar={[
        { baslik: 'Şirket', alt: sirketAdi, satirlar: sirketSatirlari },
        { baslik: 'Workspace', alt: workspaceAdi, satirlar: wsSatirlari },
      ]}
      son={sonSatir}
      aktif={aktif}
      git={git}
    />
  );

  return (
    <div className="space-y-4">
      {ustBant}
      {/*
        `overflow-clip`, `overflow-hidden` DEĞİL: hidden bir kaydırma kabı
        kuruyor ve alt çubuğun `sticky`si kutuya yapışıyordu; uzun bir adımda
        "Devam" sayfanın dibinde kalıyordu.
      */}
      <section aria-label={SIHIRBAZ_ADI} className="overflow-clip rounded-kart border border-line bg-surface">
        <div className="grid min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <Ray
            baslik={<RayBasligi tamam={toplamTamam} toplam={toplam} />}
            ozet={
              <>
                <DurumIkonu tur={aktif === 'son' ? (h.tamam ? 'tamam' : 'simdi') : aktifDurum ? DURUM_IKONU[aktifDurum] : 'no'} />
                <span className="min-w-0 truncate">{aktif === 'son' ? 'Son kontrol' : `Adım ${sira} / ${adimToplami} · ${aktifAd}`}</span>
                <span className="ml-auto shrink-0 whitespace-nowrap font-baslik text-13 font-bold">
                  {toplamTamam} / {toplam}
                </span>
              </>
            }
          >
            {rayIcerigi}
          </Ray>

          <div className="flex min-w-0 flex-col px-5 pt-5 lg:px-8 lg:pt-6">
            <div className="mb-6">
              <IlerlemeRayi parcalar={rayParcalari} etiket="Kurulum ilerlemesi" />
            </div>
            {aktif === 'son' ? (
              <SonKontrol
                clientId={clientId}
                workspaceAdi={workspaceAdi}
                sirketAdi={sirketAdi}
                sirketAdimlari={sirketAdimlari}
                adimlar={adimlar}
                sirketSayac={sSayac}
                wsSayac={wsSayac}
                eposta={veri.eposta}
                platformBeyani={kurulum.ok ? kurulum.v.platformBeyani : undefined}
                git={git}
                baslikRef={baslikRef}
              />
            ) : (
              <>
                {/* ODAK KABI: `Soru` başlığı ref taşımıyor; ekran okuyucu içeriğin değiştiğini buradan öğrenir. */}
                <div ref={baslikRef} tabIndex={-1} className="focus-visible:outline-none">
                  <Soru ust={`${sira} / ${adimToplami} · ${sirketAdimiMi ? 'Şirket' : 'Workspace'}`} soru={aktifAd} aciklama={NEDEN[aktif]} />
                </div>

                <Haplar parcalar={(aktifAdim ?? aktifSirket)?.parcalar ?? []} />

                {/*
                  OAUTH DÖNÜŞÜNÜN SONUCU (`?connection=…`): "Ölçüm izinlerini ver"
                  Google'dan bu adıma dönüyor. Bant yalnız S1'de (PlatformAdimi
                  kendi bandını çiziyor) vardı; ölçüm adımında izin reddedilince
                  ya da düşünce ekran aynı düğmeyi gösterip HİÇBİR ŞEY söylemiyordu.
                */}
                {aktif !== 'baglantilar' && <CallbackBanner />}

                {/* KAYNAK OKUNAMADIYSA SÖYLENİYOR: rozet "Okunamadı" diyor, sebebi burada. */}
                <Dusenler veri={veri} sirket={sirketAdimiMi} tazele={tazele} />

                {calisiyor && !sirketAdimiMi && (
                  <p className="mb-3 text-12 text-ink-muted">
                    {hazirlamaSinir ? 'Hazırlık beklenenden uzun sürüyor. Sayfayı yenileyerek durumu tekrar okuyabilirsin.' : 'Site, marka bilgileri ve piksel arka planda okunuyor; sayfadan ayrılabilirsin.'}
                  </p>
                )}

                {aktif === 'baglantilar' && (
                  <SirketBaglantilari
                    clientId={clientId}
                    veri={veri}
                    parcalar={aktifSirket?.parcalar ?? []}
                    yonetebilir={yetki.baglantiYetkilendir}
                    tazele={tazele}
                    yenileniyor={yenileniyor}
                  />
                )}
                {aktif === 'guvenlik' && <SirketGuvenligi veri={veri} parcalar={aktifSirket?.parcalar ?? []} yetki={yetki} tazele={tazele} />}
                {aktifAdim && (
                  <AdimIcerigi
                    a={aktifAdim}
                    clientId={clientId}
                    workspaceAdi={workspaceAdi}
                    kurulum={kurulum.ok ? kurulum.v : null}
                    sorular={hazirlama.ok ? hazirlama.v.sorular : []}
                    hazirlamaVar={hazirlama.ok && hazirlama.v.sonCalisma !== null}
                    kategoriler={veri.detay.ok ? ((veri.detay.v.specialAdCategories ?? []) as SpecialAdCategory[]) : null}
                    detay={veri.detay.ok ? veri.detay.v : null}
                    beyanlar={beyanGirdisi(veri.beyanlar)}
                    kullanilmayanlar={kullanilmayanlar}
                    yetki={yetki}
                    ajansAdresi={ajansAdresi}
                    kurulumGuncelle={(v) => {
                      setKurulum({ ok: true, v });
                      tazele();
                    }}
                    hazirlamaGuncelle={(v) => {
                      setHazirlama({ ok: true, v });
                      tazele();
                    }}
                    tazele={tazele}
                    kip="sihirbaz"
                    izinDonusu={sihirbazAdresi(clientId, aktifAdim.kod)}
                  />
                )}

                <IslemDurumu islem={islem} />

                {/*
                  ALT ÇUBUK (ortak `AltCubuk`): Geri solda, "Otomatik yap" kapalıysa
                  NEDENİ ortada, ikincil eylemler ve Devam sağda. KAYBOLAN DÜĞME
                  "NEREYE GİTTİ" SORUSU DOĞURUR: "Otomatik yap" pasif kalır, sebebi
                  notta yazar.
                */}
                <AltCubuk
                  geri={oncekiAdim(aktif) !== null ? { onClick: () => oncekiAdim(aktif) && git(oncekiAdim(aktif)!) } : null}
                  not={oto.neden}
                  ek={
                    <>
                      <Dugme
                        ton="ikincil"
                        bekliyor={islem.tur === 'isleniyor' || islem.tur === 'yoklama'}
                        disabled={!oto.acik || islem.tur === 'isleniyor' || islem.tur === 'yoklama'}
                        title={oto.neden ?? undefined}
                        onClick={() => void otomatikYap()}
                      >
                        Otomatik yap
                      </Dugme>
                      {!sirketAdimiMi && aktifAdim && adimBeyanlari(aktifAdim.kod).length > 0 && (
                        <Dugme
                          ton="hayalet"
                          onClick={() => {
                            const el = document.getElementById(`beyan-${aktifAdim.kod}`);
                            el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
                            el?.querySelector<HTMLElement>('button')?.focus();
                          }}
                        >
                          Bunu kullanmıyorum
                        </Dugme>
                      )}
                      {!bittiMi(aktifDurum) && (
                        <Dugme ton="hayalet" onClick={() => git(sonrakiAdim(aktif, durumlar))}>
                          Sonra yapacağım
                        </Dugme>
                      )}
                    </>
                  }
                  devam={{ etiket: 'Devam →', onClick: () => git(sonrakiAdim(aktif, durumlar)) }}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Adım özeti hapları: "5 hazır · 1 sorun · 1 senin işin · 1 sırada". */
function Haplar({ parcalar }: { parcalar: ReadonlyArray<{ durum: KurulumListesiDurumu }> }) {
  const say = new Map<KurulumListesiDurumu, number>();
  for (const p of parcalar) say.set(p.durum, (say.get(p.durum) ?? 0) + 1);
  if (say.size === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {[...say.entries()].map(([d, n]) => (
        // ROZET ÖLÇÜSÜNDE AMA SİHİRBAZIN İKONUYLA: `Rozet` dört hâl taşıyor ve
        // "tamam" onda yeşil; sihirbazın yedi durumu ve yeşilsiz dili (sol
        // rayla aynı ikonlar) burada da kalsın diye ikon yerel.
        <span key={d} className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong px-2.5 text-12 font-bold text-ink">
          <DurumIkonu tur={DURUM_IKONU[d]} kucuk />
          {n} {DURUM_METNI[d].toLocaleLowerCase('tr')}
        </span>
      ))}
    </div>
  );
}

/** Düşen kaynaklar — her biri kendi cümlesiyle; "Yeniden dene" sunucuyu yeniden çizer. */
function Dusenler({ veri, sirket, tazele }: { veri: TamamlamaVerisi; sirket: boolean; tazele: () => void }) {
  const liste: Array<[string, Sonuc<unknown> | BeyanOkumasi]> = sirket
    ? [
        ['Platform bağlantıları', veri.baglantilar],
        ['Platform ayarları', veri.uygunluk],
        ['İki adımlı doğrulama ayarı', veri.ikiAdim],
        ['Şirket kurulumu', veri.sirket],
      ]
    : [
        ['Kurulum adımları', veri.kurulum],
        ['Reklam hazırlığı', veri.hazirlama],
        ['Hazırlık maddeleri', veri.hazirlik],
        ['Kurulum beyanları', veri.beyanlar],
        ['Workspace bilgileri', veri.detay],
      ];
  const dusen = liste.filter(([, s]) => !s.ok) as Array<[string, { ok: false; hata: string }]>;
  if (dusen.length === 0) return null;
  return (
    <div className="mb-4">
      <Serit
        ton="uyari"
        baslik="Bazı bilgiler okunamadı; ilgili parçalar “Okunamadı” diyor."
        eylemler={
          <Dugme ton="ikincil" boyut="kucuk" onClick={tazele}>
            Yeniden dene
          </Dugme>
        }
      >
        {dusen.map(([ad, s]) => (
          <span key={ad} className="mt-0.5 block">
            <b className="text-ink">{ad}:</b> {s.hata}
          </span>
        ))}
      </Serit>
    </div>
  );
}

/** "Otomatik yap"ın sonucu — dört hâl ayrı yazılıyor (sürüyor / bekleniyor / sınır / platform hatası). */
function IslemDurumu({ islem }: { islem: Islem }) {
  if (islem.tur === 'bosta') return null;
  if (islem.tur === 'isleniyor') {
    return (
      <p role="status" className="mt-3 inline-flex items-center gap-2 text-12 text-ink-muted">
        <DurumIkonu tur="yap" kucuk />
        Yapılıyor… genelde 30 saniye sürer. Yarıda kesilmez: yarım bir konteyner bırakırdı.
      </p>
    );
  }
  if (islem.tur === 'yoklama') {
    return (
      <p role="status" className="mt-3 inline-flex items-center gap-2 text-12 text-ink-muted">
        <DurumIkonu tur="yap" kucuk />
        {YOKLAMA_METNI[islem.neden]}
      </p>
    );
  }
  if (islem.tur === 'sinir') {
    return (
      <p role="status" className="mt-3 text-12 text-ink">
        {YOKLAMA_SINIR_METNI}
      </p>
    );
  }
  if (islem.tur === 'hata') {
    return (
      <div className="mt-3">
        <Serit ton="hata" baslik="Platformun mesajı">
          {islem.mesaj}
        </Serit>
      </div>
    );
  }
  return (
    <div role="status" className="mt-3 space-y-1 border-t border-line pt-3 text-14">
      {islem.sonuclar.length === 0 && !islem.hazirlamaYeniden && <p className="text-ink-muted">İşlem bitti; adımın son hâli yukarıda.</p>}
      <ul className="space-y-1">
        {islem.sonuclar.map((s) => (
          <li key={s.kod} className={s.durum === 'hata' ? 'text-danger-strong' : s.durum === 'atlandi' ? 'text-ink-muted' : 'text-ink'}>
            <b>{KURULUM_ADIM_ADI[s.kod]}:</b> {s.durum === 'yapildi' ? '' : s.durum === 'atlandi' ? 'atlandı, ' : 'hata, '}
            {s.mesaj}
          </li>
        ))}
        {islem.hazirlamaYeniden && <li className="text-ink">Reklam hazırlığı yeniden başlatıldı; arka planda sürüyor.</li>}
      </ul>
    </div>
  );
}

/**
 * S1 · PLATFORM BAĞLANTILARI. İçerik açılışla AYNI bileşen (`PlatformAdimi`,
 * Ç-2 kuralıyla); üstünde sözleşmenin hükmü (`sirketKurulumListesi`):
 * ajansın bağlantısı görünüyorsa TAMAM ve "Bağla" yok.
 */
function SirketBaglantilari({
  clientId,
  veri,
  parcalar,
  yonetebilir,
  tazele,
  yenileniyor,
}: {
  clientId: string;
  veri: TamamlamaVerisi;
  parcalar: ReadonlyArray<{ kod: string; durum: KurulumListesiDurumu; baslik: string | null; neden: string }>;
  yonetebilir: boolean;
  tazele: () => void;
  yenileniyor: boolean;
}) {
  const [hata, setHata] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <ParcaKutusu parcalar={parcalar} adlar={{ meta: 'Meta', google: 'Google Ads' }} />
      {hata && (
        <Serit ton="hata" baslik="Bağlantı işlemi tamamlanamadı">
          {hata}
        </Serit>
      )}
      <PlatformAdimi
        redirectTo={sihirbazAdresi(clientId, 'baglantilar')}
        uygunluk={veri.uygunluk.ok ? veri.uygunluk.v : []}
        baglantilar={veri.baglantilar.ok ? veri.baglantilar.v : []}
        yonetebilir={yonetebilir}
        yuklemeHatasi={!veri.baglantilar.ok ? veri.baglantilar.hata : !veri.uygunluk.ok ? veri.uygunluk.hata : null}
        onHata={setHata}
        onYenile={tazele}
        yenileniyor={yenileniyor}
      />
      <p className="text-12 text-ink-muted">LinkedIn gösterilir ama sayılmaz: kurulum adımları Meta ve Google için.</p>
    </div>
  );
}

/** S2 · EKİP VE GÜVENLİK. 2FA ayarı Ekip ekranındakinin AYNISI (`IkiAdimSirketAyari`); beyan burada. */
function SirketGuvenligi({
  veri,
  parcalar,
  yetki,
  tazele,
}: {
  veri: TamamlamaVerisi;
  parcalar: ReadonlyArray<{ kod: string; durum: KurulumListesiDurumu; baslik: string | null; neden: string; beyan?: { gerekce: string | null; beyanEden: { ad: string } | null; tarih: string } }>;
  yetki: TamamlamaYetkileri;
  tazele: () => void;
}) {
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gerekce, setGerekce] = useState('');
  const beyan = parcalar.find((p) => p.kod === 'iki_adim')?.beyan ?? null;
  const zorunlu = veri.sirket.ok ? veri.sirket.v.ikiAdimZorunlu : null;

  async function beyanYaz(kapsamDisi: boolean) {
    setBekliyor(true);
    setHata(null);
    try {
      await apiFetch('/kurulum/sirket/beyan', {
        method: 'PUT',
        body: JSON.stringify({ oge: 'iki_adim', kapsamDisi, ...(kapsamDisi && gerekce.trim() ? { gerekce: gerekce.trim() } : {}) }),
      });
      setGerekce('');
      tazele();
    } catch (e) {
      const s = istekSonucu(e);
      setHata(s.tur === 'mesaj' ? s.mesaj : 'Sunucu yanıt vermedi; sayfayı yenileyip tekrar bak.');
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="space-y-4">
      <ParcaKutusu parcalar={parcalar} adlar={{ iki_adim: 'İki adımlı doğrulama' }} />
      {veri.ikiAdim.ok && veri.ikiAdim.v.secilenSirket ? (
        yetki.ikiAdimYonet ? (
          <IkiAdimSirketAyari durum={veri.ikiAdim.v} />
        ) : (
          <p className="text-12 text-ink-muted">{PANEL_KAPILARI['ikiAdim.sirketZorunlulugu'].neden}</p>
        )
      ) : (
        veri.ikiAdim.ok && <p className="text-12 text-ink-muted">“Tüm şirketler” görünümünde şirket ayarı okunmuyor; üstten bir şirket seç.</p>
      )}
      {/*
        YÖNETİCİNİN BEYANI YETERLİ (kullanıcı kararı, 2026-10-13): zorunluluk
        müşteri şirketinin girişini kilitleyebilir; önemli olan kararın
        bilinçli verilmiş ve yazılı olması.
      */}
      {zorunlu === false && (
        <div className="rounded-kart border border-dashed border-line-strong px-4 py-3 text-12">
          <p className="font-semibold text-ink">Zorunlu tutmuyorsanız</p>
          {beyan ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink">
              <span className="min-w-0 flex-1">
                <b>{KURULUM_BEYAN_OGESI_ADI.iki_adim}.</b>{' '}
                <span className="text-ink-muted">
                  {beyan.beyanEden ? `${beyan.beyanEden.ad}, ` : ''}
                  {tarihYaz(beyan.tarih)}
                  {beyan.gerekce ? `: “${beyan.gerekce}”` : ''}
                </span>
              </span>
              {yetki.sirketBeyan && (
                <Dugme boyut="kucuk" ton="sade" bekliyor={bekliyor} onClick={() => void beyanYaz(false)}>
                  Geri al
                </Dugme>
              )}
            </p>
          ) : yetki.sirketBeyan ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Girdi
                value={gerekce}
                onChange={(e) => setGerekce(e.target.value)}
                maxLength={300}
                placeholder="Gerekçe (isteğe bağlı)"
                aria-label="Gerekçe"
                className="h-8 min-w-0 flex-1 text-13"
              />
              {/* KUTU İÇİ: dolu kırmızı değil, ekranın tek birincili alt çubukta. */}
              <Dugme ton="ikincil" boyut="kucuk" bekliyor={bekliyor} disabled={!veri.sirket.ok} onClick={() => void beyanYaz(true)}>
                {KURULUM_BEYAN_OGESI_ADI.iki_adim}
              </Dugme>
            </div>
          ) : (
            <p className="mt-1 text-ink-muted">{PANEL_KAPILARI['sirketKurulum.beyan'].neden}</p>
          )}
          {hata && (
            <p role="alert" className="mt-1 text-danger-strong">
              {hata}
            </p>
          )}
        </div>
      )}
      {/* EKİP SAYILMAZ (tek kişilik şirket meşru); evi Ayarlar › Ekip. */}
      <p className="text-12 text-ink-muted">
        Kişi eklemek ve yetki vermek sayaca girmez:{' '}
        {yetki.ekipYonet ? (
          <Link href={ayarlarAdresi('ekip', { capa: 'kisiler' })} className="font-semibold text-ink underline-offset-2 hover:underline">
            Ayarlar › Ekip ve güvenlik
          </Link>
        ) : (
          PANEL_KAPILARI['ekip.yonet'].neden
        )}
      </p>
    </div>
  );
}

/** Şirket adımlarının parça satırları (taslak `.parcalar`): ikon, ad, sonuç, NEDEN, durum metni. */
function ParcaKutusu({
  parcalar,
  adlar,
}: {
  parcalar: ReadonlyArray<{ kod: string; durum: KurulumListesiDurumu; baslik: string | null; neden: string }>;
  adlar: Record<string, string>;
}) {
  if (parcalar.length === 0) return <p className="text-14 text-ink-muted">Bu şirkette sayılacak platform yok: workspace iki platformu da kullanmadığını söylemiş.</p>;
  return (
    <ul className="rounded-kart border border-line bg-surface">
      {parcalar.map((p) => (
        <li key={p.kod} className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-3 border-t border-line px-4 py-3.5 first:border-t-0 sm:grid-cols-[22px_minmax(0,1fr)_auto]">
          <DurumIkonu tur={DURUM_IKONU[p.durum]} />
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {adlar[p.kod] ?? p.kod}
              {p.baslik && <span className="font-normal text-ink-muted"> · {p.baslik}</span>}
            </p>
            <p className="mt-1 text-13 text-ink">{p.neden}</p>
          </div>
          <span className={`col-start-2 whitespace-nowrap text-12 font-semibold sm:col-start-auto ${p.durum === 'hata' ? 'text-brand-strong' : 'text-ink-muted'}`}>{DURUM_METNI[p.durum]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * SON KONTROL (taslak ekran 3). Üstte TEK hüküm; altında iki tablo (şirket,
 * workspace), her adım bir satır: tamamsa kısa sonuç, kapsam dışıysa KİM ve
 * NE ZAMAN dediği + "Geri al" (o adıma götürür, beyan orada), kalan işse
 * NEDENİ + "Oraya git". Sayaca girmeyenler AYRI kutuda ve bunu başlığında
 * söylüyor.
 */
function SonKontrol({
  clientId,
  workspaceAdi,
  sirketAdi,
  sirketAdimlari,
  adimlar,
  sirketSayac,
  wsSayac,
  eposta,
  platformBeyani,
  git,
  baslikRef,
}: {
  clientId: string;
  workspaceAdi: string;
  sirketAdi: string;
  sirketAdimlari: ReturnType<typeof sirketKurulumListesi>;
  adimlar: ReturnType<typeof kurulumListesi>;
  sirketSayac: ReturnType<typeof kurulumSayaci>;
  wsSayac: ReturnType<typeof kurulumSayaci>;
  eposta: TamamlamaVerisi['eposta'];
  /** Platform beyanının izi; `undefined` = kurulum okunamadı. */
  platformBeyani: KurulumYaniti['platformBeyani'] | undefined;
  git: (kod: string) => void;
  baslikRef: React.RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const h = hukum(sirketSayac, wsSayac);
  const ilkEksik = acilisAdimi(Object.fromEntries([...sirketAdimlari, ...adimlar].map((a) => [a.kod, a.durum])));
  const sayacMetni = (s: typeof wsSayac) =>
    [`${s.tamam} / ${s.toplam}`, s.kapsamDisi > 0 ? `${s.kapsamDisi} kapsam dışı` : null, s.bilinmiyor > 0 ? `${s.bilinmiyor} okunamadı` : null].filter(Boolean).join(' · ');
  const kullanilmayan = adimlar.filter((a) => a.durum === 'kullanilmiyor').length;

  const satir = (a: { kod: string; ad: string; durum: KurulumListesiDurumu; parcalar: ReadonlyArray<{ durum: KurulumListesiDurumu; baslik: string | null; neden: string; beyan?: { oge: string; gerekce: string | null; beyanEden: { ad: string } | null; tarih: string } }>; beyan?: { oge: string; gerekce: string | null; beyanEden: { ad: string } | null; tarih: string } }) => {
    const beyanlar = [a.beyan, ...a.parcalar.map((p) => p.beyan)].filter((b): b is NonNullable<typeof b> => !!b);
    const tamam = a.durum === 'tamam';
    const disarida = a.durum === 'kullanilmiyor' || a.durum === 'kapsam_disi';
    const kalan = a.parcalar.find((p) => !['tamam', 'kapsam_disi'].includes(p.durum));
    return (
      <li key={a.kod} className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-13 first:border-t-0 md:grid-cols-[22px_minmax(140px,220px)_minmax(0,1fr)_auto]">
        <DurumIkonu tur={DURUM_IKONU[a.durum]} />
        <span className="font-semibold text-ink">{a.ad}</span>
        <span className="col-start-2 text-ink-muted md:col-start-auto">
          {a.durum === 'kullanilmiyor' ? (
            <>
              <b className="text-ink">Kullanılmıyor.</b> Bu workspace’te bu platformda reklam verilmeyeceği söylendi.
              {/*
                KİM, NE ZAMAN (MIMARI § 2c). İz yoksa UYDURULMAZ: beyan iz
                kolonlarından önce verildiyse tarih yok, ad okunamıyorsa ad yok.
              */}
              {platformBeyani && (
                <span className="block text-12">
                  {platformBeyani.beyanEden ? `${platformBeyani.beyanEden.ad}, ` : ''}
                  {platformBeyani.tarih ? tarihYaz(platformBeyani.tarih) : 'tarih kaydı yok'}
                </span>
              )}
            </>
          ) : beyanlar.length > 0 ? (
            <>
              {tamam || disarida ? '' : `${kalan?.neden ?? ''} `}
              {beyanlar.map((b) => (
                <span key={b.oge} className="block text-12">
                  <b className="text-ink">{KURULUM_BEYAN_OGESI_ADI[b.oge as keyof typeof KURULUM_BEYAN_OGESI_ADI] ?? b.oge}.</b> {b.beyanEden ? `${b.beyanEden.ad}, ` : ''}
                  {tarihYaz(b.tarih)}
                  {b.gerekce ? `: “${b.gerekce}”` : ''}
                </span>
              ))}
            </>
          ) : tamam ? (
            [...new Set(a.parcalar.map((p) => p.baslik).filter(Boolean))].join(' · ') || 'Tamam.'
          ) : (
            (kalan?.neden ?? 'Bitmedi.')
          )}
        </span>
        <span className={`col-start-2 md:col-start-auto ${!(disarida || beyanlar.length > 0) && tamam ? 'max-md:hidden' : ''}`}>
          {(disarida || beyanlar.length > 0) && (
            <Dugme ton="hayalet" boyut="kucuk" onClick={() => git(a.kod)}>
              Geri al
            </Dugme>
          )}
          {!tamam && !disarida && (
            <Dugme ton="hayalet" boyut="kucuk" onClick={() => git(a.kod)}>
              Oraya git
            </Dugme>
          )}
        </span>
      </li>
    );
  };

  return (
    <>
      {/* HÜKÜM: solda tek bakışta ikon (tamam siyah tik, eksik kırmızı ünlem), sağda sihirbaz sorusu dilinde başlık. */}
      <div className="flex items-start gap-4">
        <span className={`mt-6 grid h-12 w-12 shrink-0 place-items-center rounded-full ${h.tamam ? 'bg-ink text-surface' : 'border-2 border-brand text-brand-strong'}`} aria-hidden>
          {h.tamam ? (
            <svg viewBox="0 0 12 12" className="h-6 w-6">
              <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="font-baslik text-18 font-extrabold">!</span>
          )}
        </span>
        <div ref={baslikRef} tabIndex={-1} className="min-w-0 focus-visible:outline-none">
          <Soru
            ust="Son kontrol"
            soru={h.baslik}
            aciklama={
              <>
                {h.tamam ? `${workspaceAdi} reklam vermeye hazır. ` : ''}
                {h.alt}
                {kullanilmayan > 0 ? ` ${kullanilmayan} adım bilerek kullanılmıyor.` : ''}
              </>
            }
          />
        </div>
      </div>

      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">Şirket · {sirketAdi}</h3>
        <span className="text-12 tabular-nums text-ink-muted">{sayacMetni(sirketSayac)}</span>
      </div>
      <ul className="rounded-kart border border-line bg-surface">{sirketAdimlari.map(satir)}</ul>

      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">Workspace · {workspaceAdi}</h3>
        <span className="text-12 tabular-nums text-ink-muted">
          {sayacMetni(wsSayac)}
          {kullanilmayan > 0 ? ` · ${kullanilmayan} kullanılmıyor` : ''}
        </span>
      </div>
      <ul className="rounded-kart border border-line bg-surface">{adimlar.map(satir)}</ul>

      <Kart baslik="Sayaca girmeyenler" className="mt-5">
        <ul className="m-0 list-disc space-y-1 pl-[18px] text-13 text-ink-muted">
          {eposta !== 'yetkisiz' && (
            <li>
              {eposta === true
                ? 'Senin rapor gönderen e-postan doğrulanmış. (Yalnız kendi hesabını görebiliyoruz.)'
                : eposta === false
                  ? 'Senin rapor gönderen e-postan yok ya da doğrulanmamış; raporlar senin adınla gidemez. '
                  : 'Senin rapor gönderen e-postanın durumu okunamadı. '}
              {eposta !== true && (
                <Link href={ayarlarAdresi('hesabim', { capa: 'e-posta' })} className="font-semibold text-ink underline-offset-2 hover:underline">
                  Ayarlar › Hesabım › E-posta
                </Link>
              )}
            </li>
          )}
          <li>
            Aylık bütçe her ay yeniden planlanır.{' '}
            <Link href={butceAdresi(clientId)} className="font-semibold text-ink underline-offset-2 hover:underline">
              Planla › Aylık Bütçe
            </Link>
          </li>
          <li>
            Müşteri hesabı (panel girişi) isteğe bağlı.{' '}
            <Link href={ayarlarAdresi('ekip', { workspace: clientId, capa: 'kisiler' })} className="font-semibold text-ink underline-offset-2 hover:underline">
              Ayarlar › Ekip ve güvenlik
            </Link>
          </li>
          <li>
            Ek hesaplar, LinkedIn ve YouTube kanalları.{' '}
            <Link href={hesaplarAdresi(clientId)} className="font-semibold text-ink underline-offset-2 hover:underline">
              Marka Merkezi › Kurulum
            </Link>
          </li>
        </ul>
      </Kart>

      {/*
        ALT ÇUBUK: geri "Marka Merkezi'ne dön", birincil sağda TEK: hazırsa
        ilk reklam, değilse kalan ilk iş. Adresler eski bağlantılarla aynı
        üreticilerden (`markaMerkeziAdresi`, `baglanti`).
      */}
      <AltCubuk
        geri={{ etiket: 'Marka Merkezi’ne dön', onClick: () => router.push(markaMerkeziAdresi('kurulum', clientId)) }}
        devam={
          h.tamam
            ? { etiket: 'İlk reklamı kur', onClick: () => router.push(baglanti('/reklam', { musteri: clientId })) }
            : { etiket: 'Kalan ilk işe git', onClick: () => git(ilkEksik) }
        }
      />
    </>
  );
}
