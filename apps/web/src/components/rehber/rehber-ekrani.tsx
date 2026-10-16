'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  type HazirlamaYaniti,
  REHBER_ACILIS,
  REHBER_ADIMLARI,
  acikPlatformlar,
  type RehberHazirligi,
  type RehberAdimi,
  type RehberKaydi,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Uyari, type AdimBaglami } from './adim-ortak';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { AdimAmac, AdimNerede } from './adim-amac-nerede';
import { AdimKime, type KonumEslemeHali } from './adim-kime';
import { AdimReklam, type MedyaBilgisi } from './adim-reklam';
import { AdimButce } from './adim-butce';
import { AdimKontrol, OnayPenceresi, SonEkran, type ProvaHali } from './adim-kontrol';
import { IKON, Ikon } from './ikonlar';
import { RehberKaydedici, type KayitHali } from './rehber-kaydedici';
import {
  acikSiteKapisiyla,
  adimAdi as adimAdiDil,
  adimAlt,
  adimAltMetni,
  adimBittiMi,
  gunFarki,
  hazirAdimlar,
  hesapBaglami,
  konumEslemeImzasi,
  onDoldurma,
  paraGoster,
  yayinBittiMi,
  otomatikProvaGerekli,
  provaYoklanmaliMi,
  yayinlanabilirMi,
  videoBilgisiKapaktan,
  yerelAlanlar,
  type Degisiklik,
  type EkranNo,
} from './rehber-mantik';
import { StratejidenKutusu } from './stratejiden-kutusu';
import { Kart } from '@/components/ui/kart';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamSozlugu } from '@/dil/sozlukler/reklam';
import { IlerlemeRayi, type RayParcasi } from '@/components/ui/sihirbaz';
import s from './rehber.module.css';

/** Yayın durumu yoklama aralığı: platform başına üç adım, her biri saniyeler sürüyor. */
const YOKLAMA_MS = 2000;

/**
 * ADVCAMPAIGN REHBERİ — onaylı taslağın (`docs/advcampaign/rehber-taslak.html`)
 * kodu. ODAKLI KİP: panelin menü rayı ve üst barı örtülüyor, sol üstte kapat
 * (Google Ads'in oluşturma ekranı gibi). Altı adımın HEPSİ DOM'da duruyor ve
 * görünürlük sınıfla değişiyor (taslakta da öyle): adım değişince yazılan
 * metin, açık arama kutusu ve öneri sonucu kaybolmuyor.
 *
 * VERİ AKIŞI: her alan değişikliği kaydediciye (`RehberKaydedici`), oradan
 * 600 ms sonra `PUT`. Ekran sunucunun son kaydını + yazılmamış değişiklikleri
 * gösteriyor. Eksikler, kararlar ve içerik özeti HEP sunucunun cevabından.
 */
export function RehberEkrani({
  ilkKayit,
  hazirlik,
  sirketAdi,
  workspaceAdi,
  formYayinIzni,
  siteYok,
}: {
  ilkKayit: RehberKaydi;
  hazirlik: RehberHazirligi;
  sirketAdi: string;
  workspaceAdi: string;
  formYayinIzni: boolean;
  /** "Web sitemiz yok" beyanı; `null` = okunamadı (kapatmaz). */
  siteYok: boolean | null;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const d = useSozluk(reklamSozlugu);
  const KAYIT_METNI: Record<KayitHali['tur'], string> = d.ekran.kayit;
  const [kaydedici] = useState(
    () =>
      new RehberKaydedici(
        ilkKayit,
        (govde) => apiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}`, { method: 'PUT', body: JSON.stringify(govde) }),
        { dil },
      ),
  );
  const durum = useSyncExternalStore(kaydedici.abone, kaydedici.durum, kaydedici.durum);
  const kayit = durum.kayit;
  const a = useMemo(() => yerelAlanlar(kayit.alanlar, durum.bekleyen), [kayit.alanlar, durum.bekleyen]);
  // SİTE KAPISI: "web sitemiz yok"ta site isteyen platform açık sayılmaz (`acikSiteKapisiyla`).
  const acik = acikSiteKapisiyla(acikPlatformlar(a, hazirlik.ajansYoneticisi), a.amac?.deger ?? null, siteYok);
  const { paraBirimi, saatDilimi } = hesapBaglami(a, hazirlik);
  const listeAdresi = baglanti('/reklam', { musteri: kayit.clientId });

  const [ekran, setEkran] = useState<EkranNo>(ilkKayit.durum === 'yayinda' ? 7 : 1);
  const [prova, setProva] = useState<ProvaHali>({ sonuc: null, suruyor: false, hata: null });
  const [onayAcik, setOnayAcik] = useState(false);
  const [yayin, setYayin] = useState<RehberYayinDurumu | null>(null);
  const [yayinGonderiliyor, setYayinGonderiliyor] = useState(false);
  const [yayinHatasi, setYayinHatasi] = useState<string | null>(null);
  const [esleme, setEsleme] = useState<KonumEslemeHali>({ tur: 'yok' });
  const [yeniHata, setYeniHata] = useState<string | null>(null);
  const kabukRef = useRef<HTMLDivElement>(null);

  const [medyaBilgisi, setMedyaBilgisi] = useState<Map<string, MedyaBilgisi>>(
    () =>
      new Map(
        hazirlik.gorseller.satirlar.map((g) => [g.id, { ad: g.ad, onizleme: onizlemeAdresi(g.onizlemeAdresi), en: g.genislik, boy: g.yukseklik }]),
      ),
  );
  const medyaBilgisiEkle = useCallback((id: string, m: MedyaBilgisi) => setMedyaBilgisi((x) => new Map(x).set(id, m)), []);
  const medyaGorunumu = useMemo(() => videoBilgisiKapaktan(medyaBilgisi, a.medya?.deger ?? []), [medyaBilgisi, a.medya]);

  const degistir = useCallback((d: Degisiklik[]) => kaydedici.degistir(d), [kaydedici]);
  const b: AdimBaglami = { a, kayit, h: hazirlik, acik, degistir, paraBirimi, saatDilimi, clientId: kayit.clientId, formYayinIzni, siteYok };

  /*
   * PORTAL: odaklı kip `position: fixed` bir katman. Sayfa şablonunun giriş
   * animasyonu (`.sayfa-gecis`, transform) sürerken fixed öğe o kutuya
   * hapsoluyor; katman bu yüzden `.panel`in doğrudan çocuğu olarak çiziliyor
   * (marka değişkenleri `.panel`de, `body`ye taşımak onları kaybettirirdi).
   * Sunucu çiziminde ve ilk karede yerinde, sonra portala geçiyor; durum
   * bu bileşende olduğu için geçişte hiçbir şey kaybolmuyor.
   */
  const [hedef, setHedef] = useState<Element | null>(null);
  useEffect(() => setHedef(document.querySelector('.panel') ?? document.body), []);

  // Açılışta bir kez: boş alanları workspace'in tek seçeneğinden ve Marka
  // Merkezi'nden doldur (karar saf fonksiyonda, `onDoldurma`).
  useEffect(() => {
    kaydedici.degistir(onDoldurma(ilkKayit.alanlar, hazirlik));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * HAZIRLIK HİÇ KOŞMADIYSA BURADAN BAŞLAT. Tetik hazırlığın OKUNMASINDA
   * (sunucu imzaya bakıyor) ve okuma yalnız Marka Merkezi'ndeydi: hesabı
   * Şirketler ekranından atayıp doğrudan buraya gelen kullanıcının hazırlığı
   * hiç başlamıyordu. Okuma bir kez yapılır; sonucu bu açılışta kullanılmaz
   * (iş dakikalar sürebilir), kullanıcıya nerede izleyeceği söylenir.
   * Çağrı düşerse sebebi ekranda yazar, yutulmaz.
   */
  const [hazirlamaTetik, setHazirlamaTetik] = useState<{ tur: 'yok' } | { tur: 'basladi' } | { tur: 'hata'; mesaj: string }>({ tur: 'yok' });
  useEffect(() => {
    if (hazirlik.hazirlama !== null) return;
    apiFetch<HazirlamaYaniti>(`/clients/${encodeURIComponent(kayit.clientId)}/hazirlama`).then(
      // Hesap atanmamışsa iş başlamaz (`bekliyor`); "hazırlanıyor" demek yalan olurdu.
      (y) => setHazirlamaTetik(y.durum === 'calisiyor' ? { tur: 'basladi' } : { tur: 'yok' }),
      (e: unknown) => setHazirlamaTetik({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sayfadan ayrılırken bekleyen değişiklik varsa tarayıcı sorsun.
  useEffect(() => {
    const uyar = (e: BeforeUnloadEvent) => {
      if (kaydedici.durum().bekleyen.length > 0) e.preventDefault();
    };
    window.addEventListener('beforeunload', uyar);
    return () => window.removeEventListener('beforeunload', uyar);
  }, [kaydedici]);

  /*
   * GOOGLE KONUM EŞLEMESİ: Meta'nın konum anahtarı Google'da geçmiyor;
   * karşılığı sunucuda bulunuyor (`konum-esle`). Eşlenmemiş konum varsa ve
   * kayıt yazılmışsa bir kez istenir; aynı konum kümesi için tekrar
   * istenmez (imza), aksi hâlde eşlenemeyen bir konum sonsuz istek üretirdi.
   */
  const denenenEsleme = useRef(new Set<string>());
  const konumEsle = useCallback(async () => {
    if (!(await kaydedici.simdi())) return;
    setEsleme({ tur: 'esleniyor' });
    try {
      const yeni = await apiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(kayit.id)}/konum-esle`, { method: 'POST', body: '{}' });
      kaydedici.disaridan(yeni);
      setEsleme({ tur: 'yok' });
    } catch (e) {
      setEsleme({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok });
    }
  }, [kaydedici, kayit.id]);
  const eslemeImzasi = durum.hal.tur === 'kaydedildi' ? konumEslemeImzasi(kayit.alanlar, acik.google, denenenEsleme.current) : null;
  useEffect(() => {
    if (!eslemeImzasi) return;
    denenenEsleme.current.add(eslemeImzasi);
    void konumEsle();
  }, [eslemeImzasi, konumEsle]);

  const git = useCallback((n: EkranNo) => {
    setEkran(n);
    const azalt = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (kabukRef.current ?? window).scrollTo({ top: 0, behavior: azalt ? 'auto' : 'smooth' });
  }, []);

  async function provaEt() {
    setProva((p) => ({ ...p, suruyor: true, hata: null }));
    if (!(await kaydedici.simdi())) {
      return setProva((p) => ({ ...p, suruyor: false, hata: d.ekran.provaKaydedilemedi }));
    }
    try {
      const sonuc = await apiFetch<RehberProvaSonucu>(`/reklam/rehberler/${encodeURIComponent(kayit.id)}/prova`, { method: 'POST', body: '{}' });
      setProva({ sonuc, suruyor: false, hata: null });
    } catch (e) {
      setProva((p) => ({ ...p, suruyor: false, hata: d.ekran.provaYapilamadi(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYokSonra) }));
    }
  }

  async function yayinla() {
    setYayinHatasi(null);
    setYayinGonderiliyor(true);
    if (!(await kaydedici.simdi())) {
      setYayinGonderiliyor(false);
      return setYayinHatasi(d.ekran.yayinKaydedilemedi);
    }
    try {
      // Onay penceresinde gördüğü içeriğin özeti: arada değiştiyse sunucu 409 döner.
      const r = await apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(kayit.id)}/yayinla`, {
        method: 'POST',
        body: JSON.stringify({ icerikOzeti: kaydedici.durum().kayit.icerikOzeti }),
      });
      setYayin(r);
    } catch (e) {
      setYayinHatasi(
        e instanceof ApiRequestError && e.status === 409
          ? d.ekran.onaydanSonraDegisti
          : e instanceof ApiRequestError
            ? e.message
            : d.ortak.sunucuYok,
      );
    } finally {
      setYayinGonderiliyor(false);
    }
  }

  // Yayın sürerken GERÇEK durumu yokla; her platform son durumdaysa son ekrana geç.
  const yayinBitti = yayin !== null && yayinBittiMi(yayin.platformlar, yayin.uyum?.tur === 'durdu');
  useEffect(() => {
    if (!yayin) return;
    if (yayinBitti) {
      if (yayin.uyum?.tur === 'durdu') return; // Pencerede bulgular görünsün; kullanıcı kapatır.
      const z = setTimeout(() => {
        setOnayAcik(false);
        git(7);
      }, 600);
      return () => clearTimeout(z);
    }
    let iptal = false;
    const z = setTimeout(async () => {
      try {
        const r = await apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(kayit.id)}/yayin`);
        if (!iptal) setYayin(r);
      } catch (e) {
        if (!iptal) setYayinHatasi(d.ekran.yayinOkunamadiYeniden(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYokKisa));
        if (!iptal) setYayin((y) => (y ? { ...y } : y)); // yeniden yokla
      }
    }, YOKLAMA_MS);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [yayin, yayinBitti, kayit.id, git]);

  /*
   * SON PROVA SUNUCUDAN: sayfa yenilenince prova kaybolmasın. Bayatsa
   * (içerik değişmişse) `provaGosterimi` onu zaten "yeniden prova et" diye
   * gösteriyor. Okunamazsa sessizce "henüz yapılmadı" DEĞİL, sebebi yazılır.
   */
  useEffect(() => {
    let iptal = false;
    apiFetch<RehberProvaSonucu | null>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}/prova`)
      .then((sonuc) => !iptal && setProva((p) => (p.sonuc || p.suruyor ? p : { ...p, sonuc: sonuc ?? null })))
      .catch((e: unknown) => !iptal && setProva((p) => ({ ...p, hata: d.ekran.sonProvaOkunamadi(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYokKisa) })));
    return () => {
      iptal = true;
    };
  }, [ilkKayit.id]);

  // OTOMATİK PROVA (`otomatikProvaGerekli`): aynı içerik için bir kez.
  const otoProva = useRef<string | null>(null);
  const provaGerekli = otomatikProvaGerekli({
    ekran,
    durum: kayit.durum,
    bekleyen: durum.bekleyen.length,
    eksikler: kayit.eksikler,
    acik,
    prova,
    icerikOzeti: kayit.icerikOzeti,
  });
  useEffect(() => {
    if (!provaGerekli || otoProva.current === kayit.icerikOzeti) return;
    otoProva.current = kayit.icerikOzeti;
    void provaEt();
    // `provaEt` her çizimde yeni; bağımlılık içerik kimliği ve karar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provaGerekli, kayit.icerikOzeti]);

  // Kuyruktaki prova bitene kadar 3 sn'de bir son provayı oku. Düşen okuma
  // yoklamayı durdurmaz ama sebebi yazar (sessiz "hiçbir şey olmuyor" yok).
  const yokla = provaYoklanmaliMi(prova.sonuc, kayit.icerikOzeti);
  useEffect(() => {
    if (!yokla) return;
    const z = setInterval(() => {
      apiFetch<RehberProvaSonucu | null>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}/prova`)
        .then((sonuc) => setProva((p) => ({ ...p, sonuc: sonuc ?? null, hata: null })))
        .catch((e: unknown) => setProva((p) => ({ ...p, hata: d.ekran.provaDurumuOkunamadi(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYokKisa) })));
    }, 3000);
    return () => clearInterval(z);
  }, [yokla, ilkKayit.id]);

  // Yayınlanmış bir rehber yeniden açıldıysa son ekranın verisi.
  useEffect(() => {
    if (ilkKayit.durum !== 'yayinda') return;
    apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}/yayin`)
      .then(setYayin)
      .catch((e: unknown) => setYayinHatasi(e instanceof ApiRequestError ? e.message : d.ekran.yayinOkunamadi));
  }, [ilkKayit.durum, ilkKayit.id]);

  async function kapat() {
    await kaydedici.simdi();
    router.push(listeAdresi);
  }

  async function yeniReklam(kopya = false) {
    setYeniHata(null);
    try {
      const govde = kopya ? { clientId: kayit.clientId, kaynakRehberId: kayit.id } : { clientId: kayit.clientId };
      const yeni = await apiFetch<RehberKaydi>('/reklam/rehberler', { method: 'POST', body: JSON.stringify(govde) });
      router.push(baglanti('/reklam', { musteri: kayit.clientId, rehber: yeni.id }));
    } catch (e) {
      setYeniHata(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok);
    }
  }

  const amac = a.amac?.deger ?? null;
  const denemePlatformlari = amac ? (['meta', 'google'] as const).filter((p) => acik[p] && REHBER_ACILIS[amac][p] === 'deneme') : [];
  const yayinlanabilir = kayit.durum === 'taslak' && yayinlanabilirMi(kayit.eksikler, acik, prova.sonuc, kayit.icerikOzeti) && durum.bekleyen.length === 0;
  const butce = a.butce?.deger;
  const takvim = a.takvim?.deger;

  /*
   * İLERLEME RAYI ORTAK (`ui/sihirbaz` `IlerlemeRayi`, simülasyon dili):
   * biten adım siyah, şimdiki kırmızı. Sol adım listesi kalktı; adımlar
   * arası geçiş sağdaki Özet kartında (her satır kendi adımını açıyor) ve
   * "Yayından önce" listesinde. Kısa akışın atladığı adımlar da oradan
   * açılıyor (`amactanSonraki`).
   */
  const rayParcalari: RayParcasi[] = REHBER_ADIMLARI.map((x) => ({
    anahtar: String(x.no),
    etiket: adimAdiDil(x.no, dil),
    hal: x.no === ekran ? 'simdi' : adimBittiMi(kayit.eksikler, x.no, ekran, amac !== null) ? 'bitti' : 'sirada',
  }));
  const ozetDegeri: Record<number, string> = {
    3: (a.konumlar?.deger ?? []).map((k) => k.etiket).join(', ') || d.ekran.secilmedi,
    5: butce
      ? `${paraGoster(butce.micros, paraBirimi)}${butce.tip === 'gunluk' ? d.ekran.gunluk : d.ekran.toplam} · ${
          takvim ? (takvim.bitis ? d.ortak.gunSayisi(gunFarki(takvim.baslangic, takvim.bitis)) : d.ekran.bitisYok) : d.ekran.sureSecilmedi
        }`
      : d.ekran.girilmedi,
  };

  const icerik = (
    <div className={`${s.kok} ${s.odakli}`} ref={kabukRef}>
      <div className={s.kabuk}>
        <header className={s.ustCubuk}>
          <Link className={s.kapat} href={listeAdresi} aria-label={d.ekran.kapatEtiket} title={d.ekran.kapatBaslik} onClick={(e) => {
            e.preventDefault();
            void kapat();
          }}>
            <Ikon d={IKON.kapat} boyut={18} />
          </Link>
          <b className={s.ustBaslik}>AdvCampaign</b>
          <div className={s.kirinti}>
            {sirketAdi} › <b>{workspaceAdi}</b>
          </div>
          <div className={s.kayit} data-hal={durum.hal.tur} role="status">
            <i />
            <span>
              {KAYIT_METNI[durum.hal.tur]}
              {durum.hal.tur === 'hata' && `: ${durum.hal.mesaj} `}
            </span>
            {durum.hal.tur === 'hata' && (
              <button type="button" className={s.metinDugme} onClick={() => kaydedici.tekrarDene()}>
                {d.ekran.tekrarDene}
              </button>
            )}
            {durum.hal.tur === 'catisma' && (
              <button type="button" className={s.metinDugme} onClick={() => window.location.reload()}>
                {d.ekran.yenile}
              </button>
            )}
          </div>
        </header>

        <main className={s.govde}>
          <div className={s.rayAlani}>
            <IlerlemeRayi parcalar={rayParcalari} etiket={d.ekran.rayEtiket} />
          </div>

          <section className={s.orta}>
            {/* Onaylı stratejiden açılan rehberde kreatif yönergesi ve kitle tarifi her adımda görünür. */}
            <StratejidenKutusu rehberId={kayit.id} />
            <div className={`${s.ekran} ${ekran === 1 ? s.acik : ''}`}>
              {hazirlamaTetik.tur !== 'yok' && (
                <Uyari>
                  {hazirlamaTetik.tur === 'basladi' ? (
                    <>
                      {d.ekran.hazirlamaBasladi} <Link href={markaMerkeziAdresi('kurulum', kayit.clientId)}>{d.ekran.kurulumuGor}</Link>
                    </>
                  ) : (
                    <>{d.ekran.hazirlamaHata(hazirlamaTetik.mesaj)}</>
                  )}
                </Uyari>
              )}
              <AdimAmac b={b} git={git} />
            </div>
            <div className={`${s.ekran} ${ekran === 2 ? s.acik : ''}`}>
              <AdimNerede b={b} git={git} />
            </div>
            <div className={`${s.ekran} ${ekran === 3 ? s.acik : ''}`}>
              <AdimKime b={b} git={git} esleme={esleme} yenidenEsle={() => void konumEsle()} />
            </div>
            <div className={`${s.ekran} ${ekran === 4 ? s.acik : ''}`}>
              <AdimReklam b={b} git={git} kaydet={() => kaydedici.simdi()} medyaBilgisi={medyaGorunumu} medyaBilgisiEkle={medyaBilgisiEkle} />
            </div>
            <div className={`${s.ekran} ${ekran === 5 ? s.acik : ''}`}>
              <AdimButce b={b} git={git} />
            </div>
            <div className={`${s.ekran} ${ekran === 6 ? s.acik : ''}`}>
              <AdimKontrol
                b={b}
                git={git}
                prova={prova}
                provaEt={() => void provaEt()}
                yayinlanabilir={yayinlanabilir}
                onayAc={() => {
                  setYayinHatasi(null);
                  setOnayAcik(true);
                }}
                medyaBilgisi={medyaGorunumu}
              />
            </div>
            <div className={`${s.ekran} ${ekran === 7 ? s.acik : ''}`}>
              <SonEkran b={b} yayin={yayin} yeniReklam={() => void yeniReklam()} yenidenKur={() => void yeniReklam(true)} yeniHata={yeniHata} rehberId={kayit.id} yayinGuncelle={setYayin} />
            </div>
          </section>

          <aside className={s.ozet}>
            {/*
              ÖZET = ADIM LİSTESİ: her satır kendi adımını açar (sol rayın
              tıklama işi buraya geçti). Değer amaç ve platformda rayın eski
              alt metniyle aynı üreticiden (`adimAltMetni`).
            */}
            <Kart as="div" baslik={d.ekran.ozet} dolgu={false}>
              <ul className={s.ozetListe}>
                {REHBER_ADIMLARI.map((x) => {
                  const bitti = adimBittiMi(kayit.eksikler, x.no, ekran, amac !== null);
                  return (
                    <li key={x.no}>
                      <button type="button" className={s.ozetSatir} aria-current={x.no === ekran ? 'step' : undefined} onClick={() => git(x.no)}>
                        <span className={s.ozetNo} data-bitti={bitti || undefined}>
                          {bitti ? '✓' : x.no}
                        </span>
                        <span>{adimAdiDil(x.no, dil)}</span>
                        <b className={x.no === 5 ? s.num : undefined}>{ozetDegeri[x.no] ?? adimAltMetni(x.no, adimAlt(x.no, dil), amac, acik, dil)}</b>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Kart>
            {/* Son ekranda "yayından önce" listesinin işi bitti; durması "hâlâ eksik var mı" sorusu doğurur. */}
            {ekran !== 7 && (
              <Kart as="div" baslik={d.ekran.yayindanOnce} dolgu={false}>
                <YayindanOnce kayit={kayit} acik={acik} prova={prova} git={git} amacSecili={amac !== null} />
              </Kart>
            )}
          </aside>
        </main>
      </div>

      <OnayPenceresi
        acik={onayAcik}
        b={b}
        yayin={yayin}
        gonderiliyor={yayinGonderiliyor}
        hata={yayinHatasi}
        denemePlatformlari={denemePlatformlari}
        onayla={() => void yayinla()}
        kapat={() => setOnayAcik(false)}
      />
    </div>
  );

  return hedef ? createPortal(icerik, hedef) : icerik;
}

/**
 * Sağdaki liste: SUNUCUNUN eksikleri (engel dolu nokta, uyarı boş nokta),
 * eksiği kalmamış adımlar "hazır" ve prova satırı. Prova eksik listesinde
 * yok (sözleşme: alanlardan türemiyor), o yüzden burada ayrıca.
 */
function YayindanOnce({
  kayit,
  acik,
  prova,
  git,
  amacSecili,
}: {
  kayit: RehberKaydi;
  acik: Record<RehberPlatformu, boolean>;
  prova: ProvaHali;
  git: (n: EkranNo) => void;
  amacSecili: boolean;
}) {
  const { dil } = useDil();
  const d = useSozluk(reklamSozlugu);
  const provaGecti = yayinlanabilirMi([], acik, prova.sonuc, kayit.icerikOzeti);
  const adimAdi = (n: number) => adimAdiDil(n as RehberAdimi, dil);
  const hazir = hazirAdimlar(kayit.eksikler, amacSecili).map((n) => REHBER_ADIMLARI[n - 1]!);
  return (
    <ul className={s.eksikler}>
      {kayit.eksikler.map((e, i) => (
        <li key={`${e.kod}-${i}`} className={e.seviye === 'uyari' ? s.hafif : undefined}>
          <button type="button" onClick={() => git(e.adim)}>
            <i />
            {e.metin}
            <small>{adimAdi(e.adim)}</small>
          </button>
        </li>
      ))}
      {hazir.map((x) => (
        <li key={`hazir-${x.no}`} className={s.tamam}>
          <button type="button" onClick={() => git(x.no)}>
            <i />
            {d.ekran.hazir(adimAdi(x.no))}
            <small>{adimAdi(x.no)}</small>
          </button>
        </li>
      ))}
      <li className={provaGecti ? s.tamam : undefined}>
        <button type="button" onClick={() => git(6)}>
          <i />
          {provaGecti ? d.ekran.provaGecti : d.ekran.provaYapilmadi}
          <small>{adimAdi(6)}</small>
        </button>
      </li>
    </ul>
  );
}
