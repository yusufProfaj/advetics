'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  REHBER_ACILIS,
  REHBER_ADIMLARI,
  REHBER_AMACLARI,
  acikPlatformlar,
  type RehberHazirligi,
  type RehberKaydi,
  type RehberPlatformu,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import type { AdimBaglami } from './adim-ortak';
import { AdimAmac, AdimNerede } from './adim-amac-nerede';
import { AdimKime, type KonumEslemeHali } from './adim-kime';
import { AdimReklam, type MedyaBilgisi } from './adim-reklam';
import { AdimButce } from './adim-butce';
import { AdimKontrol, OnayPenceresi, SonEkran, type ProvaHali } from './adim-kontrol';
import { IKON, Ikon } from './ikonlar';
import { RehberKaydedici, type KayitHali } from './rehber-kaydedici';
import {
  adimBittiMi,
  gunFarki,
  hesapBaglami,
  konumEslemeImzasi,
  onDoldurma,
  paraGoster,
  yayinBittiMi,
  provaYoklanmaliMi,
  yayinlanabilirMi,
  yerelAlanlar,
  type Degisiklik,
  type EkranNo,
} from './rehber-mantik';
import s from './rehber.module.css';

/** Yayın durumu yoklama aralığı: platform başına üç adım, her biri saniyeler sürüyor. */
const YOKLAMA_MS = 2000;

const KAYIT_METNI: Record<KayitHali['tur'], string> = {
  kaydedildi: 'Taslak kaydedildi',
  bekliyor: 'Kaydediliyor…',
  kaydediliyor: 'Kaydediliyor…',
  hata: 'Kaydedilemedi',
  catisma: 'Başka bir sekmede değişti',
};

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
}: {
  ilkKayit: RehberKaydi;
  hazirlik: RehberHazirligi;
  sirketAdi: string;
  workspaceAdi: string;
}) {
  const router = useRouter();
  const [kaydedici] = useState(
    () =>
      new RehberKaydedici(ilkKayit, (govde) =>
        apiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}`, { method: 'PUT', body: JSON.stringify(govde) }),
      ),
  );
  const durum = useSyncExternalStore(kaydedici.abone, kaydedici.durum, kaydedici.durum);
  const kayit = durum.kayit;
  const a = useMemo(() => yerelAlanlar(kayit.alanlar, durum.bekleyen), [kayit.alanlar, durum.bekleyen]);
  const acik = acikPlatformlar(a, hazirlik.ajansYoneticisi);
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

  const degistir = useCallback((d: Degisiklik[]) => kaydedici.degistir(d), [kaydedici]);
  const b: AdimBaglami = { a, kayit, h: hazirlik, acik, degistir, paraBirimi, saatDilimi, clientId: kayit.clientId };

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
      setEsleme({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
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
      return setProva((p) => ({ ...p, suruyor: false, hata: 'Prova yapılamadı: taslak kaydedilemedi, prova kayıtlı içerikle yapılıyor.' }));
    }
    try {
      const sonuc = await apiFetch<RehberProvaSonucu>(`/reklam/rehberler/${encodeURIComponent(kayit.id)}/prova`, { method: 'POST', body: '{}' });
      setProva({ sonuc, suruyor: false, hata: null });
    } catch (e) {
      setProva((p) => ({ ...p, suruyor: false, hata: `Prova yapılamadı: ${e instanceof ApiRequestError ? e.message : 'sunucuya ulaşılamadı.'}` }));
    }
  }

  async function yayinla() {
    setYayinHatasi(null);
    setYayinGonderiliyor(true);
    if (!(await kaydedici.simdi())) {
      setYayinGonderiliyor(false);
      return setYayinHatasi('Taslak kaydedilemedi; yayın kayıtlı içerikle yapılıyor.');
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
          ? 'Reklam onaydan sonra değişti. Pencereyi kapatıp yeniden prova et.'
          : e instanceof ApiRequestError
            ? e.message
            : 'Sunucuya ulaşılamadı.',
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
        if (!iptal) setYayinHatasi(`Yayın durumu okunamadı: ${e instanceof ApiRequestError ? e.message : 'sunucuya ulaşılamadı'}. Birkaç saniye sonra yeniden deniyoruz.`);
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
      .catch((e: unknown) => !iptal && setProva((p) => ({ ...p, hata: `Son prova okunamadı: ${e instanceof ApiRequestError ? e.message : 'sunucuya ulaşılamadı'}` })));
    return () => {
      iptal = true;
    };
  }, [ilkKayit.id]);

  // Kuyruktaki prova bitene kadar 3 sn'de bir son provayı oku. Düşen okuma
  // yoklamayı durdurmaz ama sebebi yazar (sessiz "hiçbir şey olmuyor" yok).
  const yokla = provaYoklanmaliMi(prova.sonuc, kayit.icerikOzeti);
  useEffect(() => {
    if (!yokla) return;
    const z = setInterval(() => {
      apiFetch<RehberProvaSonucu | null>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}/prova`)
        .then((sonuc) => setProva((p) => ({ ...p, sonuc: sonuc ?? null, hata: null })))
        .catch((e: unknown) => setProva((p) => ({ ...p, hata: `Prova durumu okunamadı: ${e instanceof ApiRequestError ? e.message : 'sunucuya ulaşılamadı'}` })));
    }, 3000);
    return () => clearInterval(z);
  }, [yokla, ilkKayit.id]);

  // Yayınlanmış bir rehber yeniden açıldıysa son ekranın verisi.
  useEffect(() => {
    if (ilkKayit.durum !== 'yayinda') return;
    apiFetch<RehberYayinDurumu>(`/reklam/rehberler/${encodeURIComponent(ilkKayit.id)}/yayin`)
      .then(setYayin)
      .catch((e: unknown) => setYayinHatasi(e instanceof ApiRequestError ? e.message : 'Yayın durumu okunamadı.'));
  }, [ilkKayit.durum, ilkKayit.id]);

  async function kapat() {
    await kaydedici.simdi();
    router.push(listeAdresi);
  }

  async function yeniReklam() {
    setYeniHata(null);
    try {
      const yeni = await apiFetch<RehberKaydi>('/reklam/rehberler', { method: 'POST', body: JSON.stringify({ clientId: kayit.clientId }) });
      router.push(baglanti('/reklam', { musteri: kayit.clientId, rehber: yeni.id }));
    } catch (e) {
      setYeniHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    }
  }

  const amac = a.amac?.deger ?? null;
  const denemePlatformlari = amac ? (['meta', 'google'] as const).filter((p) => acik[p] && REHBER_ACILIS[amac][p] === 'deneme') : [];
  const yayinlanabilir = kayit.durum === 'taslak' && yayinlanabilirMi(kayit.eksikler, acik, prova.sonuc, kayit.icerikOzeti) && durum.bekleyen.length === 0;
  const mobilAdim = Math.min(ekran, 6);
  const butce = a.butce?.deger;
  const takvim = a.takvim?.deger;

  const icerik = (
    <div className={`${s.kok} ${s.odakli}`} ref={kabukRef}>
      <div className={s.kabuk}>
        <header className={s.ustCubuk}>
          <Link className={s.kapat} href={listeAdresi} aria-label="Rehberi kapat" title="Kapat (taslak kayıtlı kalır)" onClick={(e) => {
            e.preventDefault();
            void kapat();
          }}>
            <Ikon d={IKON.kapat} boyut={18} />
          </Link>
          <h1>AdvCampaign</h1>
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
                Tekrar dene
              </button>
            )}
            {durum.hal.tur === 'catisma' && (
              <button type="button" className={s.metinDugme} onClick={() => window.location.reload()}>
                Yenile
              </button>
            )}
          </div>
        </header>

        <main className={s.govde}>
          <nav className={s.ray} aria-label="Adımlar">
            {REHBER_ADIMLARI.map((x, i) => {
              const bitti = adimBittiMi(kayit.eksikler, x.no, ekran);
              return (
                <div key={x.no} style={{ display: 'contents' }}>
                  {i > 0 && <span className={s.cizgi} />}
                  <button
                    type="button"
                    className={`${s.adim} ${bitti ? s.bitti : ''}`}
                    aria-current={x.no === ekran ? 'step' : undefined}
                    onClick={() => git(x.no)}
                  >
                    <span className={s.no}>{bitti ? '✓' : x.no}</span>
                    <span>
                      {x.ad}
                      <span className={s.alt}>{x.alt}</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </nav>

          <section className={s.orta}>
            <div className={s.mobilIlerleme} aria-hidden>
              <div className={s.ust}>
                <span>
                  Adım <b>{mobilAdim}</b> / 6
                </span>
                <b>{REHBER_ADIMLARI[mobilAdim - 1]!.ad}</b>
              </div>
              <div className={s.cubuk}>
                <i style={{ width: `${(mobilAdim / 6) * 100}%` }} />
              </div>
            </div>
            <div className={`${s.ekran} ${ekran === 1 ? s.acik : ''}`}>
              <AdimAmac b={b} git={git} />
            </div>
            <div className={`${s.ekran} ${ekran === 2 ? s.acik : ''}`}>
              <AdimNerede b={b} git={git} />
            </div>
            <div className={`${s.ekran} ${ekran === 3 ? s.acik : ''}`}>
              <AdimKime b={b} git={git} esleme={esleme} yenidenEsle={() => void konumEsle()} />
            </div>
            <div className={`${s.ekran} ${ekran === 4 ? s.acik : ''}`}>
              <AdimReklam b={b} git={git} kaydet={() => kaydedici.simdi()} medyaBilgisi={medyaBilgisi} medyaBilgisiEkle={medyaBilgisiEkle} />
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
                medyaBilgisi={medyaBilgisi}
              />
            </div>
            <div className={`${s.ekran} ${ekran === 7 ? s.acik : ''}`}>
              <SonEkran b={b} yayin={yayin} yeniReklam={() => void yeniReklam()} yeniHata={yeniHata} />
            </div>
          </section>

          <aside className={s.ozet}>
            <div className={`${s.kart} ${s.ozetKart}`}>
              <h3>Özet</h3>
              <div className={s.ozetSatir}>
                <span>Amaç</span>
                <b>{amac ? REHBER_AMACLARI[amac].ekranAdi : 'Seçilmedi'}</b>
              </div>
              <div className={s.ozetSatir}>
                <span>Nerede</span>
                <b>{[acik.meta && 'Meta', acik.google && 'Google'].filter(Boolean).join(' + ') || 'Seçilmedi'}</b>
              </div>
              <div className={s.ozetSatir}>
                <span>Konum</span>
                <b>{(a.konumlar?.deger ?? []).map((k) => k.etiket).join(', ') || 'Seçilmedi'}</b>
              </div>
              <div className={s.ozetSatir}>
                <span>Bütçe</span>
                <b className={s.num}>{butce ? `${paraGoster(butce.micros, paraBirimi)}${butce.tip === 'gunluk' ? ' / gün' : ' toplam'}` : 'Girilmedi'}</b>
              </div>
              <div className={s.ozetSatir}>
                <span>Süre</span>
                <b>{takvim ? (takvim.bitis ? `${gunFarki(takvim.baslangic, takvim.bitis)} gün` : 'Bitiş yok') : 'Seçilmedi'}</b>
              </div>
            </div>
            {/* Son ekranda "yayından önce" listesinin işi bitti; durması "hâlâ eksik var mı" sorusu doğurur. */}
            {ekran !== 7 && (
              <div className={`${s.kart} ${s.ozetKart}`}>
                <h3>Yayından önce</h3>
                <YayindanOnce kayit={kayit} acik={acik} prova={prova} git={git} />
              </div>
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
}: {
  kayit: RehberKaydi;
  acik: Record<RehberPlatformu, boolean>;
  prova: ProvaHali;
  git: (n: EkranNo) => void;
}) {
  const provaGecti = yayinlanabilirMi([], acik, prova.sonuc, kayit.icerikOzeti);
  const adimAdi = (n: number) => REHBER_ADIMLARI[n - 1]!.ad;
  const hazirAdimlar = REHBER_ADIMLARI.filter((x) => x.no < 6 && !kayit.eksikler.some((e) => e.adim === x.no));
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
      {hazirAdimlar.map((x) => (
        <li key={`hazir-${x.no}`} className={s.tamam}>
          <button type="button" onClick={() => git(x.no)}>
            <i />
            {x.ad} hazır
            <small>{x.ad}</small>
          </button>
        </li>
      ))}
      <li className={provaGecti ? s.tamam : undefined}>
        <button type="button" onClick={() => git(6)}>
          <i />
          {provaGecti ? 'Prova geçti' : 'Prova yapılmadı'}
          <small>{adimAdi(6)}</small>
        </button>
      </li>
    </ul>
  );
}
