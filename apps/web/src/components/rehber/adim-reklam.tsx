'use client';

import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ACIKLAMA_METNI_SINIRI,
  promosyonSorunu,
  FIYAT_EN_COK,
  FIYAT_METIN_SINIRI,
  FIYAT_TURLERI,
  FIYAT_TURU_ETIKETI,
  PROMOSYON_HEDEF_SINIRI,
  ORAN_ETIKETI,
  METIN_SINIRLARI,
  REHBER_AMACLARI,
  TABAN_NEGATIFLER,
  adresAlani,
  karakterSayisi,
  bannerSetiDestekleniyor,
  oranBul,
  reklamGucu,
  type AnahtarKelimeOnerisi,
  type GorselOrani,
  type MedyaMetni,
  type MetinOnerIstegi,
  type MetinOnerisi,
  type RehberAlanlari,
  type FormOnizlemesi,
  type LeadFormRecord,
  type RehberFormListesi,
  type YoutubeVideoListesi,
  type YoutubeVideoBilgisi,
  youtubeVideoEngeli,
  googleGorselKurgusuMu,
  trTelefonOnerisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { FormBuilder } from '@/components/forms/form-builder';
import { FormOnizleme } from '@/components/forms/form-onizleme';
import { formOlusturmaDurumu, gizlilikOnerisi, kayittanOnizleme, sayfaTaslaklari, yarimFormDurumu, yayinSonrasiSecim, yenidenYayinlanabilir } from '@/lib/form-onizleme';
import { medyaOlc, medyaYukle } from '@/reklam/medya';
import { AltCubuk, Soru, sil, yaz, type AdimBaglami } from './adim-ortak';
import { IKON, Ikon } from './ikonlar';
import { SetKartlari } from './set-kartlari';
import { HEDEF_OLCULER, boyutUret } from './boyut-uret';
import { WhatsappKarsilamaAlani, WhatsappNumarasi } from './meta-dalga3';
import { medyaKabulu } from './meta-dalga3-mantik';
import {
  aciklamaMetniKutulari,
  aciklamaMetniYaz,
  adresGirdisi,
  adresKaydi,
  bosFiyatListesi,
  bosPromosyon,
  bugun,
  paraSimgesi,
  tutarMetni,
  tutarOku,
  formListesiHali,
  hazirOzeti,
  googleGorselRozeti,
  googleGorselIpucu,
  kelimeDegistir,
  kelimeOnerisiHali,
  kelimeSatirlari,
  metinKurali,
  metinKutusu,
  oneriyiSigdir,
  fikirMetinDurumu,
  fikirMetniYaz,
  oneridenFikirMetni,
  ortakMetinBos,
  otomatikMetinHedefleri,
  setOgeleri,
  tekrarEtmeListesi,
  metinOnerisiHali,
  oneriHatasi,
  setGorunumu,
  setSil,
  setTasi,
  setleriSabitle,
  yuvayaEkle,
  yuklemeHedefi,
  telefonGirdisi,
  tarihGoster,
  telefonKaydi,
  videoListesiHali,
  youtubeKimligi,
  youtubeSecimi,
  kapakSec,
  sureGoster,
  uretimPlani,
  type EkranNo,
  type MedyaOgesi,
  type MetinKurali,
  type OneriHali,
} from './rehber-mantik';
import s from './rehber.module.css';

type Metin = NonNullable<RehberAlanlari['metin']>['deger'];

export interface MedyaBilgisi {
  ad: string;
  onizleme: string;
  en: number | null;
  boy: number | null;
}

export function AdimReklam({
  b,
  git,
  kaydet,
  medyaBilgisi,
  medyaBilgisiEkle,
}: {
  b: AdimBaglami;
  git: (n: EkranNo) => void;
  /** Öneri uçları KAYITLI alanlardan çalışıyor: önce bekleyen değişiklikler yazılır. */
  kaydet: () => Promise<boolean>;
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
  medyaBilgisiEkle: (id: string, m: MedyaBilgisi) => void;
}) {
  const amac = b.a.amac?.deger ?? null;
  if (!amac) {
    return (
      <>
        <Soru adim={4} baslik="Reklamda ne görünsün?">Önce bir amaç seç; istenen alanlar amaca göre değişiyor.</Soru>
        <AltCubuk git={git} adim={4} />
      </>
    );
  }
  const kurgu = REHBER_AMACLARI[amac].google.kurgu;
  const googleArama = b.acik.google && kurgu === 'ARAMA';
  // Görselle kurulan İKİ Google kurgusu var (Talep Yaratma görsel ve Maks.
  // Performans); kural shared'da. Yalnız birini saymak, yalnız Google
  // seçili satış amacında görsel alanını HİÇ göstermiyordu ve sunucu görsel
  // istediği için adım bitirilemiyordu (Ajan 4, Dalga 3 F1).
  const googleGorsel = b.acik.google && googleGorselKurgusuMu(kurgu);
  const googleVideo = b.acik.google && kurgu === 'TALEP_YARATMA_VIDEO';
  const gorselGerekli = b.acik.meta || googleGorsel;
  // Kural shared'da (`adresAlani`): eksik listesi de aynı fonksiyonu okuyor.
  const adresHali = adresAlani(amac, b.acik);
  const adresGerekli = adresHali !== null;
  const eksik = (kod: string) => b.kayit.eksikler.find((e) => e.kod === kod) ?? null;

  return (
    <>
      <Soru adim={4} baslik="Reklamda ne görünsün?">{metinKurali(b.acik, kurgu).soru}</Soru>
      {b.h.hazirlama && (
        <div className={`${s.kart} ${s.hazirOzet}`} aria-label="Hazırlıktan gelen ayarlar">
          {hazirOzeti(b.a, b.acik, b.paraBirimi).map((x) => (
            <div key={x.etiket} className={s.ozetSatir}>
              <span>{x.etiket}</span>
              <b>{x.deger}</b>
              <button type="button" className={s.metinDugme} onClick={() => git(x.adim)}>
                Değiştir
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={s.kart}>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            {amac === 'FORM' ? 'Form' : amac === 'TELEFON' ? 'Aranacak numara' : amac === 'WHATSAPP' ? 'WhatsApp hattı' : 'Gidecekleri sayfa'}
          </div>
          {amac === 'FORM' && <FormSecici b={b} eksikMetni={eksik('FORM-YOK')?.metin ?? null} formUyarisi={(eksik('FORM-GIZLILIK') ?? eksik('FORM-SAYFA') ?? eksik('FORM-BILINMIYOR'))?.metin ?? null} />}
          {amac === 'TELEFON' && (
            <>
              <div className={s.girdi}>
                <span className={s.on}>+90</span>
                <input
                  value={telefonGirdisi(b.a.telefon?.deger)}
                  inputMode="tel"
                  aria-label="Telefon"
                  onChange={(e) => {
                    const t = telefonKaydi(e.target.value);
                    if (t) yaz(b, 'telefon', t);
                    else sil(b, 'telefon');
                  }}
                />
              </div>
              <p className={eksik('TELEFON') ? s.hataMetni : s.ipucu}>
                {eksik('TELEFON')?.metin ?? (b.a.telefon?.kaynak === 'marka_merkezi' ? "Numara Marka Merkezi'nden geldi." : ' ')}
              </p>
            </>
          )}
          {amac === 'WHATSAPP' && (
            <>
              <WhatsappNumarasi b={b} />
              <WhatsappKarsilamaAlani b={b} />
            </>
          )}
          {adresGerekli && (
            <div className={amac === 'FORM' || amac === 'TELEFON' ? s.ustBosluk : undefined}>
              {(amac === 'FORM' || amac === 'TELEFON') && (
                <p className={s.ipucu} style={{ margin: '0 0 6px' }}>
                  Google reklamı bir site adresine bağlanır:
                </p>
              )}
              {adresHali === 'istege_bagli' && (
                <p className={s.ipucu} style={{ margin: '0 0 6px' }}>
                  {/* S3: video izlenmede adres yoksa düğme hiç kurulmuyor (`videoDugmesiVar`). */}
                  {amac === 'VIDEO' ? 'İsteğe bağlı. Boş bırakırsan video düğmesiz yayınlanır.' : 'İsteğe bağlı. Boş bırakırsan düğme Facebook sayfana gider.'}
                </p>
              )}
              <div className={s.girdi}>
                <span className={s.on}>https://</span>
                <input
                  value={adresGirdisi(b.a.hedefAdres?.deger)}
                  aria-label="Site adresi"
                  inputMode="url"
                  onChange={(e) => {
                    const a = adresKaydi(e.target.value);
                    if (a) yaz(b, 'hedefAdres', a);
                    else sil(b, 'hedefAdres');
                  }}
                />
              </div>
              <p className={eksik('SITE-ADRES') ? s.hataMetni : s.ipucu}>
                {eksik('SITE-ADRES')?.metin ?? (b.a.hedefAdres?.kaynak === 'marka_merkezi' ? "Adres Marka Merkezi'nden geldi." : ' ')}
              </p>
            </div>
          )}
        </div>

        {(gorselGerekli || googleVideo) && (
          <MedyaBlogu
            b={b}
            gorselGerekli={gorselGerekli}
            googleGorsel={googleGorsel}
            googleIpucu={googleGorsel ? googleGorselIpucu(kurgu) : null}
            googleVideo={googleVideo}
            video={amac === 'VIDEO'}
            googleArama={googleArama}
            medyaBilgisi={medyaBilgisi}
            medyaBilgisiEkle={medyaBilgisiEkle}
            kaydet={kaydet}
            kural={metinKurali(b.acik, kurgu)}
          />
        )}

        <MetinBlogu b={b} kaydet={kaydet} />

        {googleArama && <KelimeBlogu b={b} kaydet={kaydet} />}

        {googleArama && <EkOgeBlogu b={b} />}
      </div>
      <AltCubuk git={git} adim={4} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Medya
// ─────────────────────────────────────────────────────────────────────────────

/** Ekrandaki oran haritası: yalnız ölçüsü BİLİNEN görseller (bilinmeyen = anahtar yok). */
function oranHaritasi(medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>): Map<string, GorselOrani | null> {
  const m = new Map<string, GorselOrani | null>();
  for (const [id, b] of medyaBilgisi) if (b.en && b.boy) m.set(id, oranBul(b.en, b.boy));
  return m;
}

/** Üretilen dosyanın adındaki boyut (Marka Merkezi listesinde okunur kalsın). */
const ORAN_DOSYA_EKI: Record<GorselOrani, string> = { dikey: '9x16', dik45: '4x5', kare: '1x1', yatay: '191x100' };

function MedyaBlogu({
  b,
  gorselGerekli,
  googleGorsel,
  googleIpucu,
  googleVideo,
  video,
  googleArama,
  medyaBilgisi,
  medyaBilgisiEkle,
  kaydet,
  kural,
}: {
  b: AdimBaglami;
  gorselGerekli: boolean;
  googleGorsel: boolean;
  /** Görselle kurulan Google kurgusunun oran kuralı (`googleGorselIpucu`). */
  googleIpucu: string | null;
  googleVideo: boolean;
  video: boolean;
  googleArama: boolean;
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
  medyaBilgisiEkle: (id: string, m: MedyaBilgisi) => void;
  kaydet: () => Promise<boolean>;
  kural: MetinKurali;
}) {
  const medya = b.a.medya?.deger ?? [];
  const dosyaRef = useRef<HTMLInputElement>(null);
  /*
   * GÖRSELE ÖZEL METİN (Dalga 2). Cevap saniyeler sonra geliyor; o arada
   * kullanıcı başka görsel eklemiş olabilir. Yazım render anındaki listeye
   * değil SON listeye yapılır, yoksa arada eklenen görsel silinirdi.
   */
  const sonMedya = useRef(medya);
  sonMedya.current = medya;
  const sonMetin = useRef(b.a.metin?.deger);
  sonMetin.current = b.a.metin?.deger;
  const [fikirHali, setFikirHali] = useState<Record<string, OneriHali<MetinOnerisi>>>({});

  async function gorseleMetinYaz(sahipId: string, idler: readonly string[], mod: NonNullable<MetinOnerIstegi['mod']>) {
    setFikirHali((h) => ({ ...h, [sahipId]: { tur: 'isteniyor' } }));
    // Sunucu KAYITLI medyayı okuyor: yeni bırakılan görsel önce yazılmalı.
    if (!(await kaydet())) {
      return setFikirHali((h) => ({ ...h, [sahipId]: { tur: 'dustu', mesaj: 'Taslak kaydedilemedi; metin kayıtlı görselden yazılıyor.' } }));
    }
    try {
      const govde: MetinOnerIstegi = { varlikId: sahipId, mod };
      const r = await apiFetch<MetinOnerisi>(`/reklam/rehberler/${b.kayit.id}/metin-oner`, { method: 'POST', body: JSON.stringify(govde) });
      const hal = metinOnerisiHali(r);
      setFikirHali((h) => ({ ...h, [sahipId]: hal }));
      if (hal.tur !== 'geldi') return;
      const fm = oneridenFikirMetni(r, kural);
      const degisiklikler: Parameters<AdimBaglami['degistir']>[0] = [
        { alan: 'medya', deger: fikirMetniYaz(sonMedya.current, idler, sahipId, fm), kaynak: 'kullanici' },
      ];
      // Ortak metin BOŞSA aynı öneriyle dolar (`derleyici`, onay istemez):
      // ortak metin Google'a ve metni olmayan fikirlere gidiyor; boş kalsa
      // kullanıcı görseli bırakıp "metin yok" engeliyle karşılaşırdı.
      if (ortakMetinBos(sonMetin.current)) {
        const sig = oneriyiSigdir(r, kural);
        degisiklikler.push({
          alan: 'metin',
          deger: metinKutusu({ anaMetin: sig.anaMetin, basliklar: sig.basliklar, aciklamalar: sig.aciklamalar, ...(r.gorunenYol.length ? { gorunenYol: r.gorunenYol } : {}) }, kural),
          kaynak: 'derleyici',
        });
      }
      b.degistir(degisiklikler);
    } catch (e) {
      setFikirHali((h) => ({ ...h, [sahipId]: oneriHatasi(e) }));
    }
  }

  /** Eklenen görsellerin fikirleri: metni olmayan her fikre TEK istek, sırayla. */
  async function otomatikMetin(simdiki: readonly MedyaOgesi[], yerelOran: ReadonlyMap<string, GorselOrani | null>, eklenen: ReadonlySet<string>) {
    const amac = b.a.amac?.deger;
    const g = setGorunumu(simdiki, yerelOran, amac ? REHBER_AMACLARI[amac].meta.niyet : 'SITE');
    const fikirler = [...g.setler.map(setOgeleri), ...g.videolar.map((x) => [x])];
    for (const id of otomatikMetinHedefleri(fikirler, eklenen)) {
      const f = fikirler.find((x) => x.some((y) => y.varlikId === id))!;
      await gorseleMetinYaz(id, f.map((x) => x.varlikId), 'yeni');
    }
  }

  function fikirKutusu(ogeler: Array<MedyaOgesi & { oran?: GorselOrani }>) {
    const d = fikirMetinDurumu(ogeler);
    if (!d.sahipId) return null;
    return (
      <FikirMetni
        b={b}
        durum={d}
        hal={fikirHali[d.sahipId]}
        iste={(mod) => void gorseleMetinYaz(d.sahipId!, d.idler, mod)}
        yazMetin={(m) => yaz(b, 'medya', fikirMetniYaz(medya, d.idler, d.sahipId!, m))}
      />
    );
  }
  const [ustunde, setUstunde] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(0);
  const [hatalar, setHatalar] = useState<Array<{ ad: string; mesaj: string }>>([]);
  const [varliklarAcik, setVarliklarAcik] = useState(false);
  const gorseller = b.h.gorseller;
  const EN_COK = 10;

  /*
   * DOĞRULAMA BIRAKILDIĞI ANDA (`medyaYukle` içinde `medyaKontrol`):
   * kullanılamayacak dosya yüklenmeden reddediliyor ve sebebi dosya adıyla
   * listede kalıyor. Sıra korunuyor: dosyalar birer birer yükleniyor ve
   * her biri bitince eklenmiş listenin SONUNA giriyor.
   */
  const oranlar = oranHaritasi(medyaBilgisi);
  /*
   * Boş yuvaya (ya da "Yeni set"e) tıklanınca dosya seçici açılıyor; seçilen
   * dosyanın hangi sete gideceği bu ref'te bekliyor. `undefined` = üstteki
   * bırakma alanı (sırayla dağıt), `null` = yeni set.
   */
  const hedefRef = useRef<number | null | undefined>(undefined);
  const yeniBilgi = useRef(new Map<string, MedyaBilgisi>());

  /**
   * OTOMATİK BOYUT (`uretimPlani`, `boyutUret`): eklenen görselin setindeki
   * eksik boyutlar tarayıcıda üretilip AYNI sete giriyor. Kaynak orijinal
   * dosya (önizleme ucu orijinal baytları veriyor). Hata sessiz değil:
   * üretilemeyen boyut dosya adıyla listede.
   */
  async function eksikBoyutlariUret(
    baslangic: MedyaOgesi[],
    yerelOran: Map<string, GorselOrani | null>,
    olculer: Map<string, { en: number | null; boy: number | null }>,
    eklenen: Set<string>,
  ): Promise<{ medya: MedyaOgesi[]; hatalar: Array<{ ad: string; mesaj: string }> }> {
    const amac = b.a.amac?.deger;
    const niyet = amac ? REHBER_AMACLARI[amac].meta.niyet : 'SITE';
    const hatalar: Array<{ ad: string; mesaj: string }> = [];
    if (!b.acik.meta || video) return { medya: baslangic, hatalar };
    const plan = uretimPlani({ medya: baslangic, oranlar: yerelOran, olculer, eklenen, niyet, enCok: EN_COK });
    let simdiki = baslangic;
    for (const is of plan.isler) {
      const kaynak = medyaBilgisiOku(is.kaynakVarlikId);
      let blob: Blob;
      try {
        if (!kaynak) throw new Error('Kaynak görselin önizlemesi bulunamadı.');
        const r = await fetch(kaynak.onizleme, { credentials: 'include' });
        if (!r.ok) throw new Error(`Kaynak görsel okunamadı (HTTP ${r.status}).`);
        blob = await r.blob();
      } catch (e) {
        hatalar.push({ ad: kaynak?.ad ?? 'Görsel', mesaj: `Eksik boyutlar üretilemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}` });
        continue;
      }
      for (const oran of is.oranlar) {
        setYukleniyor((n) => n + 1);
        try {
          const uretilen = await boyutUret(blob, oran);
          const ad = `${(kaynak?.ad ?? 'gorsel').replace(/\.[a-z0-9]+$/i, '')}-${ORAN_DOSYA_EKI[oran]}-uretildi.jpg`;
          const y = await medyaYukle(b.clientId, new File([uretilen], ad, { type: 'image/jpeg' }));
          const [en, boy] = HEDEF_OLCULER[oran];
          medyaBilgisiEkle(y.id, { ad: y.ad, onizleme: onizlemeAdresi(y.onizlemeAdresi), en, boy });
          yerelOran.set(y.id, oran);
          olculer.set(y.id, { en, boy });
          simdiki = yuvayaEkle(simdiki, yerelOran, { varlikId: y.id, uretildi: true, kaynakVarlikId: is.kaynakVarlikId }, is.setSira);
          yaz(b, 'medya', simdiki);
        } catch (e) {
          hatalar.push({ ad: `${ORAN_ETIKETI[oran]} boyutu`, mesaj: e instanceof Error ? e.message : 'Üretilemedi.' });
        } finally {
          setYukleniyor((n) => n - 1);
        }
      }
    }
    if (plan.sigmayan > 0) hatalar.push({ ad: 'Otomatik boyut', mesaj: `${plan.sigmayan} boyut en çok ${EN_COK} dosya sınırı yüzünden üretilmedi.` });
    return { medya: simdiki, hatalar };
  }

  function medyaBilgisiOku(id: string) {
    return medyaBilgisi.get(id) ?? yeniBilgi.current.get(id);
  }

  async function yukle(dosyalar: File[], hedef: number | null | undefined = undefined) {
    let simdiki = [...medya];
    const yerelOran = new Map(oranlar);
    const olculer = new Map<string, { en: number | null; boy: number | null }>([...medyaBilgisi].map(([k, v]) => [k, { en: v.en, boy: v.boy }]));
    const eklenen = new Set<string>();
    // Hedef set BİR KEZ (`yuklemeHedefi`): aynı anda bırakılan boyutlar aynı sete.
    const sira = yuklemeHedefi(medya, oranlar, hedef);
    const yeniHatalar: Array<{ ad: string; mesaj: string }> = [];
    for (const d of dosyalar) {
      if (simdiki.length >= EN_COK) {
        yeniHatalar.push({ ad: d.name, mesaj: `En çok ${EN_COK} dosya eklenebilir.` });
        continue;
      }
      setYukleniyor((n) => n + 1);
      try {
        // B8: "Videom izlensin"de Meta açıksa süre ve dikeylik GİRİŞTE söylenir.
        const [olcu, y] = await Promise.all([medyaOlc(d), medyaYukle(b.clientId, d, { videoIzlenme: video && b.acik.meta })]);
        const bilgi = { ad: y.ad, onizleme: onizlemeAdresi(y.onizlemeAdresi), en: olcu.en, boy: olcu.boy };
        medyaBilgisiEkle(y.id, bilgi);
        // Kapak adaylarının önizlemesi seçicide gösterilsin (ölçü videonunki).
        for (const a of y.kapakAdaylari ?? []) medyaBilgisiEkle(a.id, { ad: y.ad, onizleme: onizlemeAdresi(a.onizlemeAdresi), en: olcu.en, boy: olcu.boy });
        // Ekleme ile çizim arasında bilgi state'e geçmemiş olabilir; üretim aynı turda okuyor.
        yeniBilgi.current.set(y.id, bilgi);
        olculer.set(y.id, { en: olcu.en, boy: olcu.boy });
        if (!y.kapakId) eklenen.add(y.id);
        const oge = {
          varlikId: y.id,
          ...(y.kapakId ? { kapakVarlikId: y.kapakId } : {}),
          ...(y.kapakAdaylari && y.kapakAdaylari.length > 1 ? { kapakAdaylari: y.kapakAdaylari.map((a) => a.id) } : {}),
          ...(y.oneriKareleri?.length ? { oneriKareleri: y.oneriKareleri } : {}),
          ...(typeof y.sure === 'number' ? { sureSn: Math.round(y.sure * 10) / 10 } : {}),
        };
        if (olcu.en && olcu.boy) yerelOran.set(y.id, oranBul(olcu.en, olcu.boy));
        simdiki = y.kapakId || sira === undefined ? [...simdiki, oge] : yuvayaEkle(simdiki, yerelOran, oge, sira);
        yaz(b, 'medya', simdiki);
        if (y.uyari) yeniHatalar.push({ ad: d.name, mesaj: y.uyari });
      } catch (e) {
        yeniHatalar.push({ ad: d.name, mesaj: e instanceof TypeError ? 'Sunucuya ulaşılamadı.' : e instanceof Error ? e.message : 'Yükleme düştü.' });
      } finally {
        setYukleniyor((n) => n - 1);
      }
    }
    const u = await eksikBoyutlariUret(simdiki, yerelOran, olculer, eklenen);
    setHatalar([...yeniHatalar, ...u.hatalar]);
    // GÖRSEL BIRAKILDIĞI AN METİN (Dalga 2 tetiği): aynı görsel daha önce
    // yazıldıysa sunucu önbellekten döner, yapay zekâya gidilmez.
    await otomatikMetin(u.medya, yerelOran, eklenen);
  }

  function medyaYaz(yeni: readonly (typeof medya)[number][]) {
    if (yeni !== medya) yaz(b, 'medya', yeni);
  }

  function varlikDegistir(id: string) {
    if (medya.some((x) => x.varlikId === id)) return yaz(b, 'medya', medya.filter((x) => x.varlikId !== id));
    if (medya.length >= EN_COK) return setHatalar([{ ad: 'Varlık', mesaj: `En çok ${EN_COK} dosya eklenebilir.` }]);
    const yeni = [...medya, { varlikId: id }];
    yaz(b, 'medya', yeni);
    const olculer = new Map<string, { en: number | null; boy: number | null }>([...medyaBilgisi].map(([k, v]) => [k, { en: v.en, boy: v.boy }]));
    const yerelOran = new Map(oranlar);
    void eksikBoyutlariUret(yeni, yerelOran, olculer, new Set([id])).then(async (u) => {
      if (u.hatalar.length) setHatalar(u.hatalar);
      await otomatikMetin(u.medya, yerelOran, new Set([id]));
    });
  }

  const fazla = b.kayit.eksikler.find((e) => e.kod === 'M-MEDYA-FAZLA');
  const videoEksik = b.kayit.eksikler.find((e) => e.kod === 'G-VIDEO');

  return (
    <div className={s.blok}>
      {gorselGerekli && (
        <>
          <div className={s.blokBaslik}>
            {video ? 'Video' : 'Görseller ve videolar'} <span className={s.ops}>En az 1 · en çok {EN_COK}</span>
          </div>
          <button
            type="button"
            className={s.birak}
            data-ustunde={ustunde}
            onClick={() => {
              hedefRef.current = undefined;
              dosyaRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setUstunde(true);
            }}
            onDragLeave={() => setUstunde(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUstunde(false);
              void yukle([...e.dataTransfer.files]);
            }}
          >
            <span className={s.karo}>
              <Ikon d={IKON.yukle} />
            </span>
            <span>
              <b>{yukleniyor > 0 ? `${yukleniyor} dosya yükleniyor…` : 'Sürükle bırak ya da seç'}</b>
              <span className={s.birakAlt}>Bıraktığın anda kontrol edilir. Marka Merkezi&apos;ndeki varlıklardan da seçebilirsin.</span>
            </span>
          </button>
          <input
            ref={dosyaRef}
            type="file"
            multiple
            accept={medyaKabulu(video)}
            hidden
            onChange={(e) => {
              const hedef = hedefRef.current;
              hedefRef.current = undefined;
              void yukle([...(e.target.files ?? [])], hedef);
              e.target.value = '';
            }}
          />
          {/* Meta VİDEO amacında arşivden seçim YOK: arşiv listesi yalnız
              görselleri taşıyor ve videonun kapağı orada bilinmiyor; kapaksız
              video reklamı derleyici reddeder. Söyleniyor, gizlice kapanmıyor. */}
          {video ? (
            <p className={s.ipucu}>Videoyu buraya yükle. Marka Merkezi&apos;ndeki videolar kapakları bilinmediği için buradan seçilemiyor.</p>
          ) : (
            <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} aria-expanded={varliklarAcik} onClick={() => setVarliklarAcik((v) => !v)}>
              {varliklarAcik ? 'Varlıkları gizle' : "Marka Merkezi'nden seç"}
            </button>
          )}
          <div className={s.gizlenir} data-acik={varliklarAcik && !video}>
            <div>
              {gorseller.satirlar.length === 0 ? (
                <p className={s.ipucu}>Marka Merkezi &gt; Varlıklar&apos;da görsel yok.</p>
              ) : (
                <>
                  <div className={s.varliklar}>
                    {gorseller.satirlar.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={s.varlik}
                        aria-pressed={medya.some((x) => x.varlikId === g.id)}
                        aria-label={g.ad}
                        tabIndex={varliklarAcik ? 0 : -1}
                        onClick={() => varlikDegistir(g.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={onizlemeAdresi(g.onizlemeAdresi)} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                  {gorseller.satirlar.length < gorseller.toplam && (
                    <p className={s.ipucu}>
                      {gorseller.satirlar.length} / {gorseller.toplam} varlık gösteriliyor (en yeniler).
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {(() => {
            const amac = b.a.amac?.deger;
            const niyet = amac ? REHBER_AMACLARI[amac].meta.niyet : 'SITE';
            const setli = b.acik.meta && !video && bannerSetiDestekleniyor(niyet);
            const g = setGorunumu(medya, oranlar, niyet);
            const satir = (x: (typeof medya)[number], hata: string | null) => {
              const bilgi = medyaBilgisi.get(x.varlikId);
              const oran = oranlar.get(x.varlikId) ?? null;
              // Videoda küçük resim SEÇİLİ kapak (B10): aday değişince satır da değişsin.
              const onizleme = (x.kapakVarlikId ? medyaBilgisi.get(x.kapakVarlikId)?.onizleme : undefined) ?? bilgi?.onizleme;
              const sure = sureGoster(x.sureSn);
              return (
                <div key={x.varlikId} className={s.dosya}>
                  {onizleme ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={onizleme} alt="" className={`${s.kucuk} ${oran === 'dikey' ? s.dikey : ''}`} />
                  ) : (
                    <div className={s.kucuk} />
                  )}
                  <div>
                    <b>{bilgi?.ad ?? 'Varlık'}</b>
                    <small className={hata ? s.kapaliYazi : undefined}>
                      {hata ??
                        `${bilgi?.en && bilgi.boy ? `${bilgi.en} × ${bilgi.boy}${oran ? ` · ${ORAN_ETIKETI[oran]}` : ''}` : 'Boyut bilinmiyor'}${sure ? ` · ${sure}` : ''}`}
                    </small>
                  </div>
                  <div className={s.uygun}>
                    {oran && googleGorsel && bilgi?.en && bilgi.boy && (() => {
                      const sorun = googleGorselRozeti(oran, bilgi.en, bilgi.boy);
                      return sorun ? <span className={s.h} title={sorun}>Google ✕</span> : <span className={s.e}>Google ✓</span>;
                    })()}
                    <button type="button" className={s.metinDugme} aria-label={`${bilgi?.ad ?? 'Varlığı'} kaldır`} onClick={() => {
                        const kalan = medya.filter((y) => y.varlikId !== x.varlikId);
                        medyaYaz(setli ? setleriSabitle(kalan, oranlar) : kalan);
                      }}>
                      Kaldır
                    </button>
                  </div>
                </div>
              );
            };
            const sorunlu = [...g.kullanilamaz, ...g.cakisan, ...g.bilinmeyen];
            return (
              <>
                {/* Doğrulama BIRAKILDIĞI ANDA: kullanılamayan görsel set dışında,
                    sebebiyle ve marka kırmızısıyla duruyor; sessizce atılmıyor. */}
                {sorunlu.length > 0 && (
                  <div className={s.dosyalar}>
                    {g.kullanilamaz.map((x) => satir(x, 'Bu boyut kullanılamıyor. 9:16, 4:5, 1:1 ya da 1.91:1 olacak şekilde kırpıp tekrar bırak.'))}
                    {g.cakisan.map((x) => satir(x, 'Aynı sette bu boyuttan bir görsel daha var; ⋯ menüsünden başka sete taşı ya da kaldır.'))}
                    {g.bilinmeyen.map((x) => satir(x, null))}
                  </div>
                )}
                {setli && (g.setler.length > 0 || medya.length === 0) && (
                  <SetKartlari
                    setler={g.setler.length ? g.setler : [{}]}
                    medyaBilgisi={medyaBilgisi}
                    googleArama={googleArama}
                    niyet={niyet}
                    tasi={(id, hedef) => medyaYaz(setTasi(medya, oranlar, id, hedef))}
                    kaldir={(id) => medyaYaz(setleriSabitle(medya.filter((y) => y.varlikId !== id), oranlar))}
                    setiSil={(i) => medyaYaz(setSil(medya, oranlar, i))}
                    yuvayaYukle={(dosyalar, hedef) => {
                      if (dosyalar) return void yukle(dosyalar, hedef);
                      hedefRef.current = hedef;
                      dosyaRef.current?.click();
                    }}
                    setAlti={(st) => fikirKutusu(setOgeleri(st))}
                  />
                )}
                {!setli && g.setler.length > 0 && (
                  <div className={s.dosyalar}>
                    {g.setler.map((st, i) => (
                      <div key={`fikir-${i}`}>
                        {Object.values(st).map((x) => x && satir(x, null))}
                        {fikirKutusu(setOgeleri(st))}
                      </div>
                    ))}
                  </div>
                )}
                {/* Set yalnız "Siteme gelsinler"de ölçüldü (`BANNER_SETI_NIYETLERI`):
                    bu amaçta her görsel ayrı reklam ve bunu ekran söylüyor. */}
                {!setli && b.acik.meta && !video && g.setler.length > 1 && (
                  <p className={s.ipucu}>Bu amaçta her görsel ayrı bir reklamdır; Meta hepsini dener.</p>
                )}
                {g.videolar.length > 0 && (
                  <div className={s.dosyalar}>
                    {g.videolar.map((x) => (
                      <div key={`video-${x.varlikId}`}>
                        {satir(x, null)}
                        <KapakSecici oge={x} medyaBilgisi={medyaBilgisi} sec={(id) => medyaYaz(kapakSec(medya, x.varlikId, id))} />
                        {fikirKutusu([x])}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
          {hatalar.map((h, i) => (
            <p key={`${h.ad}-${i}`} className={s.hataMetni} role="alert">
              {h.ad}: {h.mesaj}
            </p>
          ))}
          {fazla && <p className={s.ipucu}>{fazla.metin}</p>}
          {googleIpucu && <p className={s.ipucu}>{googleIpucu}</p>}
        </>
      )}
      {googleVideo && (
        <div className={gorselGerekli ? s.ustBosluk : undefined}>
          <VideoSecici b={b} eksikMetni={videoEksik?.metin ?? null} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form şablonu (Meta FORM amacı)
// ─────────────────────────────────────────────────────────────────────────────

/** Önizleme penceresinin konusu: Meta'daki form (kimlikle okunur) ya da Advetics taslağı (kaydın kendisi). */
type OnizlemeKonusu = { tur: 'meta'; formId: string; ad: string } | { tur: 'taslak'; kayit: LeadFormRecord };

function FormSecici({ b, eksikMetni, formUyarisi }: { b: AdimBaglami; eksikMetni: string | null; formUyarisi: string | null }) {
  const sayfaId = b.a.sayfaId?.deger ?? null;
  const secili = b.a.formSablonuId?.deger ?? null;
  const sayfa = b.h.sayfalar.find((x) => x.id === sayfaId)?.ad ?? null;
  const [hal, setHal] = useState<OneriHali<RehberFormListesi>>({ tur: 'istenmedi' });
  const [taslaklar, setTaslaklar] = useState<OneriHali<LeadFormRecord[]>>({ tur: 'istenmedi' });
  const [tur, setTur] = useState(0);
  const [onizleme, setOnizleme] = useState<OnizlemeKonusu | null>(null);
  const [olustur, setOlustur] = useState<{ acik: boolean; anahtar: number; kayit: LeadFormRecord | null }>({ acik: false, anahtar: 0, kayit: null });
  const [bildirim, setBildirim] = useState<string | null>(null);
  // Geri okuma uyarılı yayın: form SEÇİLMEDİ, kullanıcının kararı bekleniyor.
  const [bekleyen, setBekleyen] = useState<{ formId: string; ad: string; uyari: string } | null>(null);
  // Advetics'te yayınlanmış formlar: seçicideki kartın geri okuma rozeti
  // (Meta kimliğiyle eşlenir). Meta'da kurulan formun bizde kaydı yok, rozeti de yok.
  const [kayitlar, setKayitlar] = useState<readonly LeadFormRecord[]>([]);
  const geriOkumaUyarisi = (metaId: string) => kayitlar.find((k) => k.externalFormId === metaId)?.readbackWarning ?? null;
  const olusturma = formOlusturmaDurumu({ sayfaId, yayinIzni: b.formYayinIzni });

  /*
   * Liste SEÇİLİ sayfanın Meta'daki yayında formları; sayfa değişince ya da
   * "Listeyi yenile"ye basılınca yeniden okunur (Meta'da yeni form kuran
   * kullanıcı sayfayı yenilemek zorunda kalmasın). Dört hâl ayrı: sayfa yok /
   * okunuyor / boş (sunucunun nedeni) / düştü (Meta'nın mesajı).
   */
  useEffect(() => {
    if (!sayfaId) return setHal({ tur: 'istenmedi' });
    let iptal = false;
    setHal({ tur: 'isteniyor' });
    apiFetch<RehberFormListesi>(`/reklam/rehber/form-sablonlari?clientId=${encodeURIComponent(b.clientId)}&sayfaId=${encodeURIComponent(sayfaId)}`)
      .then((r) => !iptal && setHal(formListesiHali(r)))
      .catch((e: unknown) => !iptal && setHal(oneriHatasi(e)));
    return () => {
      iptal = true;
    };
  }, [sayfaId, b.clientId, tur]);

  /*
   * YARIM KALAN FORMLAR: Advetics'te yazılıp Meta'ya çıkmamış (taslak ya da
   * yayını düşmüş) formlar. Pencere yayın hatasıyla kapatılırsa form burada
   * kalır; kaybolmaz. Okunamazsa sebep yazılır (boş listeye çevrilmez).
   */
  useEffect(() => {
    if (!sayfaId) return setTaslaklar({ tur: 'istenmedi' });
    let iptal = false;
    setTaslaklar({ tur: 'isteniyor' });
    apiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${encodeURIComponent(b.clientId)}`)
      .then((r) => {
        if (iptal) return;
        const t = sayfaTaslaklari(r, sayfaId);
        setKayitlar(r);
        setTaslaklar(t.length ? { tur: 'geldi', deger: t } : { tur: 'bos', neden: 'Yarım kalan form yok.' });
      })
      .catch((e: unknown) => !iptal && setTaslaklar(oneriHatasi(e)));
    return () => {
      iptal = true;
    };
  }, [sayfaId, b.clientId, tur]);

  const oneri = hal.tur === 'geldi' ? gizlilikOnerisi(hal.deger.satirlar) : null;
  const olusturAc = (kayit: LeadFormRecord | null) => {
    setBildirim(null);
    setBekleyen(null);
    setOnizleme(null);
    setOlustur((x) => ({ acik: true, anahtar: x.anahtar + 1, kayit }));
  };
  const yayinlandi = (r: LeadFormRecord) => {
    const k = yayinSonrasiSecim(r);
    if (k.tur === 'sec') {
      yaz(b, 'formSablonuId', k.formId);
      setBildirim(`"${r.name}" Meta'da yayınlandı ve bu reklam için seçildi.`);
      setOlustur((x) => ({ ...x, acik: false }));
    } else if (k.tur === 'uyari') {
      // Pencere AÇIK kalır ve uyarı orada; seçim "Yine de kullan" ile.
      setBekleyen({ formId: k.formId, ad: r.name, uyari: k.uyari });
    } else {
      setBildirim(k.sebep);
    }
    setTur((x) => x + 1);
  };
  const olusturDugmesi = (birincil: boolean) =>
    olusturma.goster ? (
      <Dugme ton={birincil ? 'koyu' : 'ikincil'} ikon="＋" className={s.ustBosluk} onClick={() => olusturAc(null)}>
        Form oluştur
      </Dugme>
    ) : sayfaId ? (
      <p className={s.ipucu}>{olusturma.sebep}</p>
    ) : null;

  return (
    <>
      {hal.tur === 'istenmedi' && <p className={s.ipucu} style={{ margin: 0 }}>Önce Nerede adımında Facebook sayfasını seç; formlar o sayfadan listelenir.</p>}
      {hal.tur === 'isteniyor' && <p className={s.ipucu} style={{ margin: 0 }}>Sayfanın formları Meta&apos;dan okunuyor…</p>}
      {hal.tur === 'dustu' && (
        <div className={s.uyari} role="alert">
          <Ikon d={IKON.ucgen} />
          <span>Formlar Meta&apos;dan okunamadı: {hal.mesaj}</span>
        </div>
      )}
      {hal.tur === 'bos' && (
        <>
          <div className={s.uyari}>
            <Ikon d={IKON.ucgen} />
            <span>
              {sayfa ? <b>{sayfa}</b> : 'Seçili sayfa'}: {hal.neden}
            </span>
          </div>
          {/* Boş listede ASIL EYLEM yeni form: Meta'ya gitmeden burada kurulur. */}
          {olusturDugmesi(true)}
        </>
      )}
      {hal.tur === 'geldi' && (
        <>
          <div className={s.formListesi}>
            {hal.deger.satirlar.map((f) => (
              <div key={f.id} className={s.formSatiri} data-secili={secili === f.id}>
                <button type="button" aria-pressed={secili === f.id} onClick={() => yaz(b, 'formSablonuId', f.id)}>
                  {f.ad}
                  {!f.gizlilikAdresi && <small>gizlilik adresi yok</small>}
                  {geriOkumaUyarisi(f.id) && (
                    <small className={s.hataMetni} title={geriOkumaUyarisi(f.id) ?? undefined}>
                      {geriOkumaUyarisi(f.id)}
                    </small>
                  )}
                </button>
                <button type="button" className={s.metinDugme} onClick={() => setOnizleme({ tur: 'meta', formId: f.id, ad: f.ad })}>
                  Önizle
                </button>
              </div>
            ))}
          </div>
          {hal.deger.kesildi && <p className={s.ipucu}>İlk {hal.deger.toplam} form gösteriliyor.</p>}
          {olusturDugmesi(false)}
        </>
      )}
      {hal.tur === 'dustu' && olusturDugmesi(false)}
      {bildirim && <p className={s.ipucu} role="status">{bildirim}</p>}
      {taslaklar.tur === 'geldi' && (
        <div className={s.ustBosluk}>
          <p className={s.alanEtiket}>Yarım kalan formlar</p>
          <p className={s.ipucu} style={{ marginTop: 2 }}>Advetics&apos;te yazıldı, Meta&apos;da yayınlanmadı. Yayınlanınca seçilebilir.</p>
          <div className={s.formListesi}>
            {taslaklar.deger.map((t) => (
              <div key={t.id} className={s.formSatiri}>
                <span className={s.formTaslakAdi}>
                  {t.name}
                  <small>
                    {yarimFormDurumu(t)}
                  </small>
                </span>
                <button type="button" className={s.metinDugme} onClick={() => setOnizleme({ tur: 'taslak', kayit: t })}>
                  Önizle
                </button>
                {olusturma.goster && yenidenYayinlanabilir(t) && (
                  <button type="button" className={s.metinDugme} onClick={() => olusturAc(t)}>
                    Aç ve yayınla
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {taslaklar.tur === 'dustu' && <p className={s.hataMetni}>Yarım kalan formlar okunamadı: {taslaklar.mesaj}</p>}
      {(hal.tur === 'geldi' || hal.tur === 'bos' || hal.tur === 'dustu') && (
        <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} onClick={() => setTur((x) => x + 1)}>
          Listeyi yenile
        </button>
      )}
      <p className={eksikMetni && hal.tur === 'geldi' ? s.hataMetni : s.ipucu}>
        {hal.tur === 'geldi' && eksikMetni
          ? eksikMetni
          : `Formlar ${sayfa ? `${sayfa} ` : 'seçtiğin '}Facebook sayfasına gelir (Meta'nın kendi seçtiği sayfa değil).`}
      </p>
      {formUyarisi && <p className={s.hataMetni}>{formUyarisi}</p>}

      <FormOnizlemePenceresi
        b={b}
        sayfaId={sayfaId}
        konu={onizleme}
        secili={secili}
        yayinlayabilir={olusturma.goster}
        kapat={() => setOnizleme(null)}
        sec={(id) => {
          yaz(b, 'formSablonuId', id);
          setOnizleme(null);
        }}
        taslagiAc={(t) => olusturAc(t)}
      />
      <FormOlusturPenceresi
        acik={olustur.acik}
        anahtar={olustur.anahtar}
        kayit={olustur.kayit}
        clientId={b.clientId}
        sayfa={sayfaId ? { id: sayfaId, name: sayfa ?? 'Facebook sayfası' } : null}
        oneri={oneri}
        telefon={b.h.iletisim.telefon}
        bekleyen={bekleyen}
        yineDeKullan={() => {
          if (!bekleyen) return;
          yaz(b, 'formSablonuId', bekleyen.formId);
          setBildirim(`"${bekleyen.ad}" Meta'da doğrulanamayan haliyle bu reklam için seçildi.`);
          setBekleyen(null);
          setOlustur((x) => ({ ...x, acik: false }));
        }}
        yayinlandi={yayinlandi}
        kapat={() => {
          setOlustur((x) => ({ ...x, acik: false }));
          // Pencere yayın olmadan kapandıysa kaydedilen taslak "yarım kalan"da görünsün.
          setTur((x) => x + 1);
        }}
      />
    </>
  );
}

/** Pencere açıkken Escape kapatır (`kapat` verildiyse); açılınca odak kapat düğmesine (klavye kullanıcısı içeride başlasın). */
function usePencereKlavyesi(acik: boolean, kapat: (() => void) | null, odak: React.RefObject<HTMLButtonElement | null>) {
  // ODAK YALNIZ AÇILIŞTA: `kapat` her çizimde yeni bir fonksiyon; odağı onunla
  // aynı effect'e koymak, oluşturucuda yazan kullanıcının imlecini her
  // çizimde Kapat düğmesine çalardı.
  useEffect(() => {
    if (acik) odak.current?.focus();
  }, [acik, odak]);
  useEffect(() => {
    if (!acik || !kapat) return;
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kapat();
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, kapat, odak]);
}

/**
 * FORM ÖNİZLEME PENCERESİ. Meta formu her açılışta sunucudan okunur (sunucu
 * 10 dk önbellekliyor); dört hâl ayrı: okunuyor / okundu / okunamadı (Meta'nın
 * mesajı). Taslak kendi kaydından çizilir, platforma gidilmez. Pencere DOM'dan
 * çıkmaz; görünürlük geçişle değişir (panel kuralı).
 */
function FormOnizlemePenceresi({
  b,
  sayfaId,
  konu,
  secili,
  yayinlayabilir,
  kapat,
  sec,
  taslagiAc,
}: {
  b: AdimBaglami;
  sayfaId: string | null;
  konu: OnizlemeKonusu | null;
  secili: string | null;
  yayinlayabilir: boolean;
  kapat: () => void;
  sec: (formId: string) => void;
  taslagiAc: (t: LeadFormRecord) => void;
}) {
  const [hal, setHal] = useState<{ tur: 'isteniyor' } | { tur: 'dustu'; mesaj: string } | { tur: 'geldi'; deger: FormOnizlemesi }>({ tur: 'isteniyor' });
  const acik = konu !== null;

  const metaId = konu?.tur === 'meta' ? konu.formId : null;
  useEffect(() => {
    if (!metaId || !sayfaId) return;
    let iptal = false;
    setHal({ tur: 'isteniyor' });
    apiFetch<FormOnizlemesi>(
      `/reklam/rehber/form-ayrintisi?clientId=${encodeURIComponent(b.clientId)}&sayfaId=${encodeURIComponent(sayfaId)}&formId=${encodeURIComponent(metaId)}`,
    )
      .then((r) => !iptal && setHal({ tur: 'geldi', deger: r }))
      .catch((e: unknown) => !iptal && setHal(oneriHatasi(e)));
    return () => {
      iptal = true;
    };
  }, [metaId, sayfaId, b.clientId]);

  const gorunen: typeof hal = konu?.tur === 'taslak' ? { tur: 'geldi', deger: kayittanOnizleme(konu.kayit) } : hal;
  const ad = konu ? (konu.tur === 'meta' ? konu.ad : konu.kayit.name) : '';

  return (
    <Pencere
      acik={acik}
      onKapat={kapat}
      baslik={`Form önizlemesi: ${ad}`}
      aciklama={konu?.tur === 'taslak' ? 'Advetics taslağı; henüz Meta’da yayında değil.' : 'Meta’daki formun kişiye görünen ekranları, sırayla.'}
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={kapat}>
            Kapat
          </Dugme>
          {konu?.tur === 'meta' && (
            <Dugme disabled={secili === konu.formId} onClick={() => sec(konu.formId)}>
              {secili === konu.formId ? 'Bu form seçili' : 'Bu formu kullan'}
            </Dugme>
          )}
          {konu?.tur === 'taslak' && yayinlayabilir && <Dugme onClick={() => taslagiAc(konu.kayit)}>Aç ve yayınla</Dugme>}
        </>
      }
    >
      <div className={s.kok}>
        {gorunen.tur === 'isteniyor' && <p className={s.ipucu}>Form Meta&apos;dan okunuyor…</p>}
        {gorunen.tur === 'dustu' && (
          <div className={s.uyari} role="alert">
            <Ikon d={IKON.ucgen} />
            <span>{gorunen.mesaj}</span>
          </div>
        )}
        {acik && gorunen.tur === 'geldi' && <FormOnizleme onizleme={gorunen.deger} baslik="Kişinin göreceği ekranlar" />}
      </div>
    </Pencere>
  );
}

/**
 * FORM OLUŞTUR PENCERESİ: rehberden ÇIKMADAN Marka Merkezi'nin oluşturucusu
 * (`FormBuilder`, gömülü kip). İkinci bir oluşturucu YAZILMADI. Sayfa
 * rehberin seçili sayfası; gizlilik adresi önerisi kaynağıyla. Kaydet →
 * "Meta'da yayınla" (var olan akış); yayın düşerse Meta'nın cümlesi
 * oluşturucunun içinde görünür ve form taslak olarak kalır. Her açılış yeni
 * bir oluşturucu (`anahtar`): önceki yarım formun alanları sızmasın.
 */
function FormOlusturPenceresi({
  acik,
  anahtar,
  kayit,
  clientId,
  sayfa,
  oneri,
  telefon,
  bekleyen,
  yineDeKullan,
  yayinlandi,
  kapat,
}: {
  acik: boolean;
  anahtar: number;
  kayit: LeadFormRecord | null;
  clientId: string;
  sayfa: { id: string; name: string } | null;
  oneri: { adres: string; kaynak: string } | null;
  /** Marka Merkezi telefonu (ham); "Bizi ara" önerisi `trTelefonOnerisi` ile. */
  telefon: string | null | undefined;
  /** Geri okuma uyarılı yayın: form seçilmedi, karar bekliyor. */
  bekleyen: { formId: string; ad: string; uyari: string } | null;
  yineDeKullan: () => void;
  yayinlandi: (r: LeadFormRecord) => void;
  kapat: () => void;
}) {
  const kapatRef = useRef<HTMLButtonElement>(null);
  const baslikId = useId();
  // ESCAPE BURADA KAPATMAZ: oluşturucuda kaydedilmemiş alanlar var ve bir
  // sonraki açılış yeni bir oluşturucu kuruyor; yanlışlıkla basılan tuş
  // yazılanı silerdi. Kapatmak yalnız düğmeyle.
  usePencereKlavyesi(acik, null, kapatRef);
  return (
    <div className={`${s.perde} ${acik ? s.acik : ''}`} aria-hidden={!acik}>
      <div className={`${s.pencere} ${s.pencereGenis}`} role="dialog" aria-modal="true" aria-labelledby={baslikId}>
        <h3 id={baslikId}>{kayit ? `Formu yayınla: ${kayit.name}` : 'Yeni anlık form'}</h3>
        <p>Kaydet, sonra Meta&apos;da yayınla. Yayınlanınca bu reklam için otomatik seçilir. Yayınlanan formun içeriği sonradan değiştirilemez.</p>
        <div className={s.pencereGovde}>
          {sayfa && anahtar > 0 && (
            <FormBuilder
              key={anahtar}
              clientId={clientId}
              pages={[sayfa]}
              existing={kayit ?? undefined}
              canPublish
              gomulu={{ varsayilanGizlilik: oneri, onYayinlandi: yayinlandi }}
              telefonOnerisi={trTelefonOnerisi(telefon)}
            />
          )}
        </div>
        {bekleyen && (
          <div className={s.uyari} role="alert">
            <Ikon d={IKON.ucgen} />
            <span>
              <b>&quot;{bekleyen.ad}&quot; yayınlandı ama reklama seçilmedi.</b> {bekleyen.uyari}{' '}
              <button type="button" className={s.metinDugme} onClick={yineDeKullan}>
                Yine de kullan
              </button>
            </span>
          </div>
        )}
        <div className={s.pencereAlt}>
          <button ref={kapatRef} type="button" className={dugmeSinifi('ikincil')} onClick={kapat}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube videosu (Google Talep Yaratma)
// ─────────────────────────────────────────────────────────────────────────────

function VideoSecici({ b, eksikMetni }: { b: AdimBaglami; eksikMetni: string | null }) {
  const kanalId = b.a.youtubeKanaliId?.deger ?? null;
  const secili = b.a.youtubeVideo?.deger ?? null;
  const [hal, setHal] = useState<OneriHali<YoutubeVideoListesi>>({ tur: 'istenmedi' });
  const [yedek, setYedek] = useState('');
  const [yedekAcik, setYedekAcik] = useState(false);
  /*
   * SEÇİM KONTROLÜ (B15) — dört hâl ayrı: okunuyor / engel (gizli ya da
   * yerleştirilemez; seçim YAZILMAZ) / düştü (YouTube okunamadı; seçim
   * "doğrulanmadı" diye yazılır, kullanıcı kilitlenmez, prova söyler) /
   * temiz. Engel ile düşüşü aynı kırmızı cümleye çevirmek kullanıcıyı ya
   * sağlam bir videoyu değiştirmeye ya da gizli videoyla ilerlemeye gönderirdi.
   */
  const [kontrol, setKontrol] = useState<{ tur: 'yok' } | { tur: 'okunuyor'; videoId: string } | { tur: 'engel'; mesaj: string } | { tur: 'dustu'; mesaj: string }>({ tur: 'yok' });

  /*
   * Liste kanal seçilince bir kez okunur (kanal değişirse yeniden). Dört
   * hâl ayrı: kanal yok / okunuyor / kanalda video yok (sunucunun nedeni) /
   * çağrı düştü (sunucunun mesajı). KANAL YOKSA (B16) yalnız bağlantı
   * yapıştırma gösterilir: kanal yalnız listeyi okumak için gerekiyor.
   */
  useEffect(() => {
    if (!kanalId) return setHal({ tur: 'istenmedi' });
    let iptal = false;
    setHal({ tur: 'isteniyor' });
    apiFetch<YoutubeVideoListesi>(
      `/reklam/rehber/youtube-videolari?clientId=${encodeURIComponent(b.clientId)}&kanalId=${encodeURIComponent(kanalId)}`,
    )
      .then((r) => !iptal && setHal(videoListesiHali(r)))
      .catch((e: unknown) => !iptal && setHal(oneriHatasi(e)));
    return () => {
      iptal = true;
    };
  }, [kanalId, b.clientId]);

  /** Videoyu YouTube'dan okuyup yazar; engel varsa yazmaz (giriş anında). */
  async function sec(videoId: string, yedekBaslik: string) {
    setKontrol({ tur: 'okunuyor', videoId });
    try {
      const r = await apiFetch<YoutubeVideoBilgisi>(
        `/reklam/rehber/youtube-video?clientId=${encodeURIComponent(b.clientId)}&videoId=${encodeURIComponent(videoId)}`,
      );
      const x = youtubeSecimi(r);
      if (x.engel || !x.deger) return setKontrol({ tur: 'engel', mesaj: x.engel ?? 'Bu video seçilemiyor.' });
      yaz(b, 'youtubeVideo', x.deger);
      setKontrol({ tur: 'yok' });
    } catch (e) {
      const h = oneriHatasi(e);
      const mesaj = h.mesaj;
      // Bulunamayan video (400) seçilmez; okunamayan (503, kota) doğrulanmadan
      // yazılır: bilinmeyen bir şey yüzünden kullanıcı kilitlenmesin.
      if (e instanceof ApiRequestError && e.status === 400) return setKontrol({ tur: 'engel', mesaj });
      yaz(b, 'youtubeVideo', { videoId, baslik: yedekBaslik.slice(0, 200) });
      setKontrol({ tur: 'dustu', mesaj });
    }
  }

  const yedekKimlik = youtubeKimligi(yedek);
  const listede = hal.tur === 'geldi' && secili ? hal.deger.satirlar.some((v) => v.videoId === secili.videoId) : false;
  const yapistirmaAcik = yedekAcik || !kanalId;
  const sure = sureGoster(secili?.sureSn);

  return (
    <>
      <div className={s.blokBaslik}>
        YouTube videosu <span className={s.ops}>Google için</span>
      </div>
      {!kanalId && <p className={s.ipucu} style={{ margin: 0 }}>YouTube kanalı bağlı değil; videonun bağlantısını yapıştır.</p>}
      {hal.tur === 'isteniyor' && <p className={s.ipucu} style={{ margin: 0 }}>Kanalın videoları okunuyor…</p>}
      {hal.tur === 'bos' && <p className={s.ipucu} style={{ margin: 0 }}>Video bulunamadı: {hal.neden}</p>}
      {hal.tur === 'dustu' && (
        <p className={s.hataMetni} role="alert" style={{ margin: 0 }}>
          Kanalın videoları okunamadı: {hal.mesaj}
        </p>
      )}
      {hal.tur === 'geldi' && (
        <>
          <div className={s.secim}>
            {hal.deger.satirlar.map((v) => {
              const engel = youtubeVideoEngeli(v);
              const vs = sureGoster(v.sureSn);
              return (
                <button
                  key={v.videoId}
                  type="button"
                  aria-pressed={secili?.videoId === v.videoId}
                  disabled={!!engel || kontrol.tur === 'okunuyor'}
                  title={engel ?? undefined}
                  onClick={() => void sec(v.videoId, v.baslik)}
                >
                  {v.baslik || v.videoId}
                  <small>{engel ? 'Reklamda gösterilemez' : [v.yayinTarihi ? tarihGoster(v.yayinTarihi.slice(0, 10)) : null, vs].filter(Boolean).join(' · ')}</small>
                </button>
              );
            })}
          </div>
          {hal.deger.ayrintiHatasi && <p className={s.hataMetni}>{hal.deger.ayrintiHatasi}</p>}
          {hal.deger.dahaFazlaVar && (
            <p className={s.ipucu}>
              Son {hal.deger.toplam} video gösteriliyor; kanalda daha eskileri olabilir. Aradığın yoksa bağlantısını yapıştır.
            </p>
          )}
        </>
      )}
      {kontrol.tur === 'okunuyor' && <p className={s.ipucu}>Video YouTube&apos;da kontrol ediliyor…</p>}
      {kontrol.tur === 'engel' && (
        <p className={s.hataMetni} role="alert">
          {kontrol.mesaj}
        </p>
      )}
      {kontrol.tur === 'dustu' && (
        <p className={s.hataMetni} role="alert">
          Video YouTube&apos;da doğrulanamadı ({kontrol.mesaj}); seçildi, Google provada kontrol edecek.
        </p>
      )}
      {secili && (
        <div className={`${s.dosya} ${s.ustBosluk}`}>
          {secili.kucukResim ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={secili.kucukResim} alt="" className={s.kucuk} />
          ) : (
            <div className={s.kucuk} />
          )}
          <div>
            <b>{secili.baslik || secili.videoId}</b>
            <small>{[listede ? 'Kanalından seçildi' : 'Bağlantıyla seçildi', sure].filter(Boolean).join(' · ')}</small>
          </div>
          <div className={s.uygun}>
            <button type="button" className={s.metinDugme} onClick={() => sil(b, 'youtubeVideo')}>
              Kaldır
            </button>
          </div>
        </div>
      )}
      {kanalId && (
        <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} aria-expanded={yedekAcik} onClick={() => setYedekAcik((x) => !x)}>
          {yedekAcik ? 'Bağlantı kutusunu gizle' : 'Bağlantı yapıştır'}
        </button>
      )}
      <div className={s.gizlenir} data-acik={yapistirmaAcik}>
        <div>
          <div className={s.girdi} style={{ marginTop: 8 }}>
            <input
              value={yedek}
              placeholder="YouTube bağlantısını yapıştır"
              aria-label="YouTube videosu bağlantısı"
              tabIndex={yapistirmaAcik ? 0 : -1}
              onChange={(e) => {
                setYedek(e.target.value);
                const k = youtubeKimligi(e.target.value);
                if (k && k !== secili?.videoId) void sec(k, '');
              }}
            />
          </div>
          {yedek.trim() && !yedekKimlik && <p className={s.hataMetni}>Bu bir YouTube video bağlantısı değil.</p>}
          <p className={s.ipucu}>Video herkese açık ya da liste dışı olmalı; gizli video reklamda gösterilemez.</p>
        </div>
      </div>
      {eksikMetni && !secili && <p className={s.ipucu}>{eksikMetni}</p>}
    </>
  );
}

/**
 * KAPAK SEÇİCİ (B10): tarayıcıda alınan aday kareler (siyahlar atıldı),
 * seçili olan marka çerçevesiyle. Tek aday varsa seçici gösterilmez:
 * seçilecek bir şey yokken boş bir seçim alanı yalnız gürültü. Önizlemesi
 * bilinmeyen aday (sayfa yenilendi, hazırlık listesinde yok) yine seçilebilir
 * ama boş kutu olarak; gizlenseydi kullanıcı adayın varlığını bilmezdi.
 */
function KapakSecici({ oge, medyaBilgisi, sec }: { oge: MedyaOgesi; medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>; sec: (id: string) => void }) {
  const adaylar = oge.kapakAdaylari ?? [];
  if (adaylar.length < 2) return null;
  return (
    <div className={s.ustBosluk}>
      <p className={s.ipucu} style={{ margin: 0 }}>
        Kapak: reklam başlamadan görünen kare. Siyah kareler çıkarıldı.
      </p>
      <div className={s.varliklar} role="group" aria-label="Kapak karesi">
        {adaylar.map((id, i) => {
          const bilgi = medyaBilgisi.get(id);
          return (
            <button key={id} type="button" className={s.varlik} aria-pressed={oge.kapakVarlikId === id} aria-label={`Kapak adayı ${i + 1}`} onClick={() => sec(id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {bilgi && <img src={bilgi.onizleme} alt="" loading="lazy" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Görsele özel metin (Dalga 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bir fikrin (set ya da video) kendi metni. Yapay zekânın yazdığı metin
 * `derleyici` kaynağıyla doğrudan girer ve kart bunu SÖYLER; kullanıcı
 * düzeltince `kullanici` olur. Metni olmayan fikre ortak metin gider.
 * Dört hâl ayrı: istenmedi / yazılıyor / boş (sebebi) / düştü (mesajı).
 */
function FikirMetni({
  b,
  durum,
  hal,
  iste,
  yazMetin,
}: {
  b: AdimBaglami;
  durum: ReturnType<typeof fikirMetinDurumu>;
  hal: OneriHali<MetinOnerisi> | undefined;
  iste: (mod: NonNullable<MetinOnerIstegi['mod']>) => void;
  yazMetin: (m: MedyaMetni | null) => void;
}) {
  const m = durum.metin;
  const yaziliyor = hal?.tur === 'isteniyor';
  const duzelt = (degisen: Partial<MedyaMetni>) => yazMetin({ ...(m ?? { kaynak: 'kullanici' }), ...degisen, kaynak: 'kullanici' });
  const notlar = hal?.tur === 'geldi' ? hal.deger.notlar : [];
  return (
    <div className={s.fikirMetni}>
      <div className={s.fikirMetniUst}>
        <b>Bu görselin metni</b>
        <span className={s.ops}>
          {m ? (m.kaynak === 'derleyici' ? 'Yapay zekâ görsele bakarak yazdı; düzeltebilirsin.' : 'Senin düzenlediğin metin.') : 'Ortak metin kullanılıyor.'}
          {hal?.tur === 'geldi' && hal.deger.onbellekten ? ' Bu görsel için daha önce yazılmıştı.' : ''}
        </span>
      </div>
      {m && (
        <>
          <SayacliGirdi
            etiketGizli="Bu görselin başlığı"
            deger={m.basliklar?.[0] ?? ''}
            sinir={METIN_SINIRLARI.baslik}
            degisti={(v) => duzelt({ basliklar: [v, ...(m.basliklar ?? []).slice(1)] })}
          />
          {b.acik.meta && (
            <SayacliGirdi
              etiketGizli="Bu görselin ana metni"
              deger={m.anaMetin ?? ''}
              sinir={METIN_SINIRLARI.anaMetinOnerilen}
              degisti={(v) => duzelt({ anaMetin: v })}
            />
          )}
        </>
      )}
      <div className={s.fikirDugmeler}>
        <button type="button" className={s.metinDugme} disabled={yaziliyor} onClick={() => iste(m ? 'yeniden_yaz' : 'yeni')}>
          {yaziliyor ? '✦ Yazılıyor…' : m ? '✦ Yeniden yaz' : '✦ Bu görsele metin yaz'}
        </button>
        {m?.kaynak === 'kullanici' && (
          <button type="button" className={s.metinDugme} disabled={yaziliyor} onClick={() => iste('buna_gore')}>
            Buna göre yeniden yaz
          </button>
        )}
        {m && (
          <button type="button" className={s.metinDugme} onClick={() => yazMetin(null)}>
            Ortak metni kullan
          </button>
        )}
      </div>
      {hal?.tur === 'bos' && <p className={s.ipucu}>Metin çıkmadı: {hal.neden}</p>}
      {hal?.tur === 'dustu' && (
        <p className={s.hataMetni} role="alert">
          Bu görsele metin yazılamadı: {hal.mesaj}
        </p>
      )}
      {notlar.map((n, i) => (
        <span key={`n${i}`} className={s.ops}>
          {n}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metin
// ─────────────────────────────────────────────────────────────────────────────

function MetinBlogu({ b, kaydet }: { b: AdimBaglami; kaydet: () => Promise<boolean> }) {
  const amac = b.a.amac?.deger ?? null;
  const kural = metinKurali(b.acik, amac ? REHBER_AMACLARI[amac].google.kurgu : null);
  const m = metinKutusu(b.a.metin?.deger, kural);
  const [oneri, setOneri] = useState<OneriHali<MetinOnerisi>>({ tur: 'istenmedi' });
  const guc = reklamGucu(m);
  const yuzde = { zayif: 30, orta: 60, iyi: 100 }[guc.gucu];
  const oneriKaynakli = b.a.metin?.kaynak === 'ai_onerisi';
  const googleArama = b.acik.google && amac !== null && REHBER_AMACLARI[amac].google.kurgu === 'ARAMA';
  const ortakDolu = !ortakMetinBos(b.a.metin?.deger);

  function metinYaz(yeni: Metin) {
    yaz(b, 'metin', yeni);
  }

  /*
   * ÖNERİ DÖRT HÂLLİ ve KENDİLİĞİNDEN YAZILMAZ. Model metni `ai_onerisi`
   * olarak döndürüyor; alanlara ancak kullanıcı "Kullan"a basınca ve
   * `kullanici` kaynağıyla giriyor. Önerinin olduğu gibi yayına gitmesi,
   * kullanıcının okumadığı bir vaadin reklamda çıkması demek.
   */
  /*
   * ÇAPA YOK (Dalga 2): kullanıcının yazdığı metin isteme YALNIZ "Buna göre
   * yeniden yaz" ile girer. Her öneri bir öncekinin "tekrar etme" listesini
   * taşır; "Kullan"dan sonra da son öneri hatırlanır, yoksa ikinci basış
   * aynı metni getirirdi.
   */
  const sonOneri = useRef<MetinOnerisi | null>(null);
  async function oner(mod: NonNullable<MetinOnerIstegi['mod']>) {
    setOneri({ tur: 'isteniyor' });
    if (!(await kaydet())) return setOneri({ tur: 'dustu', mesaj: 'Taslak kaydedilemedi; öneri kayıtlı alanlardan üretiliyor.' });
    try {
      const govde: MetinOnerIstegi = { mod, tekrarEtme: tekrarEtmeListesi(sonOneri.current) };
      const r = await apiFetch<MetinOnerisi>(`/reklam/rehberler/${b.kayit.id}/metin-oner`, { method: 'POST', body: JSON.stringify(govde) });
      sonOneri.current = r;
      setOneri(metinOnerisiHali(r));
    } catch (e) {
      setOneri(oneriHatasi(e));
    }
  }

  function kullan(o: MetinOnerisi) {
    const sig = oneriyiSigdir(o, kural);
    metinYaz(
      metinKutusu(
        {
          anaMetin: sig.anaMetin,
          basliklar: sig.basliklar,
          aciklamalar: sig.aciklamalar,
          // Görünen yol yalnız Arama'da kullanılıyor; öneri boşsa eskisi kalır.
          ...(googleArama && o.gorunenYol.length ? { gorunenYol: o.gorunenYol } : m.gorunenYol ? { gorunenYol: m.gorunenYol } : {}),
          // Açıklama metni de öyle: öneri yazmadıysa (vaatler gidiyor) eskisi kalır.
          ...(googleArama && o.aciklamaMetinleri.length
            ? { aciklamaMetinleri: o.aciklamaMetinleri }
            : m.aciklamaMetinleri
              ? { aciklamaMetinleri: m.aciklamaMetinleri }
              : {}),
        },
        kural,
      ),
    );
    setOneri({ tur: 'istenmedi' });
  }
  const yol = [m.gorunenYol?.[0] ?? '', m.gorunenYol?.[1] ?? ''];
  function yolYaz(i: number, v: string) {
    const yeni = yol.map((x, j) => (j === i ? v : x));
    // İki parça da boşsa alan YOK: boş yol Google'a gönderilmez.
    const { gorunenYol: _y, ...geri } = m;
    metinYaz(yeni.some((x) => x.trim()) ? { ...geri, gorunenYol: yeni } : geri);
  }

  const oneriSig = oneri.tur === 'geldi' ? oneriyiSigdir(oneri.deger, kural) : null;
  return (
    <div className={s.blok}>
      <div className={s.blokBaslik}>
        Metin{' '}
        <button
          type="button"
          className={s.metinDugme}
          style={{ marginLeft: 'auto' }}
          disabled={oneri.tur === 'isteniyor'}
          onClick={() => void oner(sonOneri.current ? 'yeniden_yaz' : 'yeni')}
        >
          {oneri.tur === 'isteniyor' ? '✦ Öneri yazılıyor…' : sonOneri.current ? '✦ Yeniden yaz' : '✦ Metin öner'}
        </button>
        {ortakDolu && (
          <button type="button" className={s.metinDugme} disabled={oneri.tur === 'isteniyor'} onClick={() => void oner('buna_gore')}>
            Buna göre yeniden yaz
          </button>
        )}
      </div>
      <div className={s.metinler}>
        {oneriSig && (
          <div className={s.oneriKart}>
            <b>Önerilen metin</b>
            {oneriSig.anaMetin && <span>{oneriSig.anaMetin}</span>}
            {oneriSig.basliklar.length > 0 && (
              <ul>
                {oneriSig.basliklar.map((x, i) => (
                  <li key={`b${i}`}>{x}</li>
                ))}
              </ul>
            )}
            {oneriSig.aciklamalar.length > 0 && (
              <ul>
                {oneriSig.aciklamalar.map((x, i) => (
                  <li key={`a${i}`}>{x}</li>
                ))}
              </ul>
            )}
            {googleArama && oneriSig.gorunenYol.length > 0 && <span>Görünen yol: /{oneriSig.gorunenYol.join('/')}</span>}
            {googleArama && oneriSig.aciklamaMetinleri.length > 0 && <span>Açıklama metinleri: {oneriSig.aciklamaMetinleri.join(' · ')}</span>}
            {oneriSig.gorselSayisi > 0 && <span className={s.ops}>{oneriSig.gorselSayisi} görsele bakılarak yazıldı.</span>}
            {oneriSig.disarida > 0 && <span className={s.ops}>Bu reklamda kullanılmayacak {oneriSig.disarida} satır gösterilmedi.</span>}
            {oneriSig.notlar.map((n, i) => (
              <span key={`n${i}`} className={s.ops}>
                {n}
              </span>
            ))}
            <span style={{ display: 'flex', gap: 8 }}>
              <Dugme ton="ikincil" onClick={() => kullan(oneriSig)}>
                Kullan
              </Dugme>
              <button type="button" className={s.metinDugme} onClick={() => setOneri({ tur: 'istenmedi' })}>
                Vazgeç
              </button>
            </span>
          </div>
        )}
        {oneri.tur === 'bos' && <p className={s.ipucu}>Öneri çıkmadı: {oneri.neden}</p>}
        {oneri.tur === 'dustu' && (
          <p className={s.hataMetni} role="alert">
            Metin önerisi alınamadı: {oneri.mesaj}
          </p>
        )}
        {oneriKaynakli && (
          <div className={s.uyari}>
            <Ikon d={IKON.ucgen} />
            <span>
              Bu metin önerildi, henüz senin kararın değil.{' '}
              <button type="button" className={s.metinDugme} onClick={() => metinYaz(m)}>
                Gözden geçirdim, onayla
              </button>
            </span>
          </div>
        )}
        {b.acik.meta && (
          <SayacliGirdi
            etiket="Ana metin"
            not="Meta'da görselin üstünde"
            deger={m.anaMetin}
            sinir={METIN_SINIRLARI.anaMetinOnerilen}
            degisti={(v) => metinYaz({ ...m, anaMetin: v })}
          />
        )}
        <div className={s.alan}>
          <span className={s.alanEtiket}>
            Başlıklar{' '}
            <span className={s.ops}>{kural.baslikNotu}</span>
          </span>
          {m.basliklar.map((x, i) => (
            <SayacliGirdi
              key={`baslik-${i}`}
              etiketGizli={`Başlık ${i + 1}`}
              deger={x}
              sinir={METIN_SINIRLARI.baslik}
              degisti={(v) => metinYaz({ ...m, basliklar: m.basliklar.map((y, j) => (j === i ? v : y)) })}
            />
          ))}
          {m.basliklar.length < kural.baslikEnCok && (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => metinYaz({ ...m, basliklar: [...m.basliklar, ''] })}>
              + Başlık ekle
            </button>
          )}
        </div>
        <div className={s.alan}>
          <span className={s.alanEtiket}>
            Açıklama <span className={s.ops}>{kural.aciklamaNotu}</span>
          </span>
          {m.aciklamalar.map((x, i) => (
            <SayacliGirdi
              key={`aciklama-${i}`}
              etiketGizli={`Açıklama ${i + 1}`}
              deger={x}
              sinir={METIN_SINIRLARI.aciklama}
              degisti={(v) => metinYaz({ ...m, aciklamalar: m.aciklamalar.map((y, j) => (j === i ? v : y)) })}
            />
          ))}
          {m.aciklamalar.length < kural.aciklamaEnCok && (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => metinYaz({ ...m, aciklamalar: [...m.aciklamalar, ''] })}>
              + Açıklama ekle
            </button>
          )}
        </div>
        {googleArama && (
          <div className={s.alan}>
            <span className={s.alanEtiket}>
              Görünen yol <span className={s.ops}>İsteğe bağlı · Google adresin yanında gösterir</span>
            </span>
            {yol.map((x, i) => (
              <SayacliGirdi key={`yol-${i}`} etiketGizli={`Görünen yol ${i + 1}`} deger={x} sinir={METIN_SINIRLARI.gorunenYol} degisti={(v) => yolYaz(i, v)} />
            ))}
          </div>
        )}
        {googleArama && (
          <div className={s.alan}>
            <span className={s.alanEtiket}>
              Açıklama metinleri{' '}
              <span className={s.ops}>İsteğe bağlı · reklamın altında kısa özellikler; boşsa Marka Merkezi vaatleri kullanılır</span>
            </span>
            {aciklamaMetniKutulari(m).map((x, i, hepsi) => (
              <SayacliGirdi
                key={`cagri-${i}`}
                etiketGizli={`Açıklama metni ${i + 1}`}
                deger={x}
                sinir={ACIKLAMA_METNI_SINIRI}
                degisti={(v) => metinYaz(aciklamaMetniYaz(m, hepsi.map((y, j) => (j === i ? v : y))))}
              />
            ))}
          </div>
        )}
        {kural.gucGoster && (
          <div className={s.guc}>
            <span>Reklam gücü</span>
            <div className={s.gucCubuk}>
              <i style={{ width: `${yuzde}%` }} />
            </div>
            <b>{{ zayif: 'Zayıf', orta: 'Orta', iyi: 'İyi' }[guc.gucu]}</b>
            {guc.ipucu && <span className={s.ops}>{guc.ipucu}</span>}
          </div>
        )}
        {b.kayit.eksikler
          .filter((e) => e.alan === 'metin' && e.kod !== 'KAYNAK')
          .map((e, i) => (
            <p key={`${e.kod}-${i}`} className={e.seviye === 'engel' ? s.hataMetni : s.ipucu} style={{ margin: 0 }}>
              {e.metin}
            </p>
          ))}
      </div>
    </div>
  );
}

/**
 * PROMOSYON VE FİYAT (Google Arama öğeleri, g-1.2.0). UYDURULAMAZ: yalnız
 * kullanıcı yazarsa kurulur, boşsa hiçbir şey gönderilmez. Reklam bilmeyen
 * kullanıcıya tek satır açıklama; alan "Ekle" demeden açılmaz.
 */
function EkOgeBlogu({ b }: { b: AdimBaglami }) {
  const p = b.a.googlePromosyon?.deger ?? null;
  const f = b.a.googleFiyatListesi?.deger ?? null;
  const pb = b.paraBirimi;
  const eksik = (kod: string) => b.kayit.eksikler.find((e) => e.kod === kod) ?? null;
  return (
    <div className={s.blok}>
      <div className={s.blokBaslik}>Ek bilgiler (isteğe bağlı)</div>
      <div className={s.metinler}>
        <div className={s.alan}>
          <span className={s.alanEtiket}>
            Kampanyan var mı? <span className={s.ops}>Google indirimi reklamın altında gösterir</span>
          </span>
          {!p ? (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => yaz(b, 'googlePromosyon', bosPromosyon())}>
              + İndirim ekle
            </button>
          ) : (
            <>
              <SayacliGirdi etiketGizli="Kampanya konusu" deger={p.hedef} sinir={PROMOSYON_HEDEF_SINIRI} degisti={(v) => yaz(b, 'googlePromosyon', { ...p, hedef: v })} />
              <div className={s.girdi}>
                <select
                  aria-label="İndirim türü"
                  value={p.indirim.tur}
                  onChange={(e) => yaz(b, 'googlePromosyon', { ...p, indirim: e.target.value === 'yuzde' ? { tur: 'yuzde', yuzde: 10 } : { tur: 'tutar', micros: '0' } })}
                >
                  <option value="yuzde">Yüzde (%)</option>
                  <option value="tutar">Tutar ({paraSimgesi(pb)})</option>
                </select>
                {p.indirim.tur === 'yuzde' ? (
                  <input
                    aria-label="İndirim yüzdesi"
                    inputMode="numeric"
                    value={String(p.indirim.yuzde)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ''));
                      if (n >= 1 && n <= 99) yaz(b, 'googlePromosyon', { ...p, indirim: { tur: 'yuzde', yuzde: n } });
                    }}
                  />
                ) : (
                  <input
                    aria-label="İndirim tutarı"
                    inputMode="decimal"
                    defaultValue={p.indirim.micros === '0' ? '' : tutarMetni(p.indirim.micros)}
                    onBlur={(e) => {
                      const t = tutarOku(e.target.value, pb);
                      yaz(b, 'googlePromosyon', { ...p, indirim: { tur: 'tutar', micros: t.tur === 'tamam' ? t.micros : '0' } });
                    }}
                  />
                )}
              </div>
              <div className={s.girdi}>
                <span className={s.on}>Bitiş</span>
                <input type="date" aria-label="Kampanya bitişi" value={p.bitis ?? ''} onChange={(e) => yaz(b, 'googlePromosyon', { ...p, bitis: e.target.value || null })} />
              </div>
              <div className={s.girdi}>
                <span className={s.on}>Başlangıç</span>
                <input type="date" aria-label="Kampanya başlangıcı" value={p.baslangic ?? ''} onChange={(e) => yaz(b, 'googlePromosyon', { ...p, baslangic: e.target.value || null })} />
              </div>
              {/* ANINDA HATA (Ajan 4, N-1): sunucunun eksik listesiyle AYNI fonksiyon, kayıt beklenmeden. */}
              {(() => {
                const hata = promosyonSorunu(p, bugun(b.saatDilimi)) ?? eksik('G-PROMOSYON')?.metin ?? null;
                return <p className={hata ? s.hataMetni : s.ipucu}>{hata ?? 'Bitiş tarihinden sonra indirim reklamdan kalkar.'}</p>;
              })()}
              <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => sil(b, 'googlePromosyon')}>
                İndirimi kaldır
              </button>
            </>
          )}
        </div>
        <div className={s.alan}>
          <span className={s.alanEtiket}>
            Fiyat listesi <span className={s.ops}>En az 3 kalem; Google fiyatları reklamın altında gösterir</span>
          </span>
          {!f ? (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => yaz(b, 'googleFiyatListesi', bosFiyatListesi())}>
              + Fiyat listesi ekle
            </button>
          ) : (
            <>
              <div className={s.girdi}>
                <select aria-label="Liste türü" value={f.tur} onChange={(e) => yaz(b, 'googleFiyatListesi', { ...f, tur: e.target.value as (typeof FIYAT_TURLERI)[number] })}>
                  {FIYAT_TURLERI.map((t) => (
                    <option key={t} value={t}>
                      {FIYAT_TURU_ETIKETI[t]}
                    </option>
                  ))}
                </select>
              </div>
              {f.kalemler.map((k, i) => {
                const kalem = (y: Partial<typeof k>) => yaz(b, 'googleFiyatListesi', { ...f, kalemler: f.kalemler.map((z, j) => (j === i ? { ...z, ...y } : z)) });
                return (
                  <div key={`fiyat-${i}`} className={s.alan}>
                    <SayacliGirdi etiketGizli={`Kalem ${i + 1} adı`} deger={k.baslik} sinir={FIYAT_METIN_SINIRI} degisti={(v) => kalem({ baslik: v })} />
                    <SayacliGirdi etiketGizli={`Kalem ${i + 1} açıklaması`} deger={k.aciklama} sinir={FIYAT_METIN_SINIRI} degisti={(v) => kalem({ aciklama: v })} />
                    <div className={s.girdi}>
                      <input
                        aria-label={`Kalem ${i + 1} fiyatı`}
                        inputMode="decimal"
                        defaultValue={k.micros === '0' ? '' : tutarMetni(k.micros)}
                        onBlur={(e) => {
                          const t = tutarOku(e.target.value, pb);
                          kalem({ micros: t.tur === 'tamam' ? t.micros : '0' });
                        }}
                      />
                      <span className={s.on}>{paraSimgesi(pb)}</span>
                    </div>
                  </div>
                );
              })}
              {f.kalemler.length < FIYAT_EN_COK && (
                <button
                  type="button"
                  className={s.metinDugme}
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => yaz(b, 'googleFiyatListesi', { ...f, kalemler: [...f.kalemler, { baslik: '', aciklama: '', micros: '0' }] })}
                >
                  + Kalem ekle
                </button>
              )}
              {eksik('G-FIYAT') && <p className={s.hataMetni}>{eksik('G-FIYAT')!.metin}</p>}
              <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => sil(b, 'googleFiyatListesi')}>
                Fiyat listesini kaldır
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SayacliGirdi({
  etiket,
  etiketGizli,
  not,
  deger,
  sinir,
  degisti,
}: {
  etiket?: string;
  etiketGizli?: string;
  not?: string;
  deger: string;
  sinir: number;
  degisti: (v: string) => void;
}) {
  const id = useId();
  const n = karakterSayisi(deger);
  const girdi = (
    <div className={s.girdi}>
      <input id={id} value={deger} aria-label={etiketGizli} onChange={(e) => degisti(e.target.value)} />
      <span className={`${s.sayac} ${n > sinir ? s.asim : ''}`}>
        {n} / {sinir}
      </span>
    </div>
  );
  if (!etiket) return girdi;
  return (
    <div className={s.alan}>
      <label htmlFor={id}>
        {etiket} {not && <span className={s.ops}>{not}</span>}
      </label>
      {girdi}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Anahtar kelime (Google Arama)
// ─────────────────────────────────────────────────────────────────────────────

const sayi = (n: number) => new Intl.NumberFormat('tr-TR').format(n);

function KelimeBlogu({ b, kaydet }: { b: AdimBaglami; kaydet: () => Promise<boolean> }) {
  const secili = b.a.anahtarKelimeler?.deger ?? [];
  const [oneri, setOneri] = useState<OneriHali<AnahtarKelimeOnerisi>>({ tur: 'istenmedi' });
  const [elle, setElle] = useState('');
  const sonuc = oneri.tur === 'geldi' ? oneri.deger : null;
  const satirlar = kelimeSatirlari(secili, sonuc);
  const negatif = `"${TABAN_NEGATIFLER.slice(0, 4).join(', ')}" gibi ${TABAN_NEGATIFLER.length} arama otomatik dışarıda.`;

  async function oner() {
    setOneri({ tur: 'isteniyor' });
    if (!(await kaydet())) return setOneri({ tur: 'dustu', mesaj: 'Taslak kaydedilemedi; öneri kayıtlı site adresinden üretiliyor.' });
    try {
      const r = await apiFetch<AnahtarKelimeOnerisi>(`/reklam/rehberler/${b.kayit.id}/anahtar-kelime-oner`, { method: 'POST', body: '{}' });
      setOneri(kelimeOnerisiHali(r));
    } catch (e) {
      setOneri(oneriHatasi(e));
    }
  }

  function elleEkle() {
    const t = elle.trim();
    if (!t) return;
    if (!secili.some((k) => k.metin.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR'))) {
      yaz(b, 'anahtarKelimeler', [...secili, { metin: t, aylikArama: null }]);
    }
    setElle('');
  }

  return (
    <div className={s.blok}>
      <div className={s.blokBaslik}>
        Google&apos;da hangi aramalarda çıksın?{' '}
        <button type="button" className={s.metinDugme} style={{ marginLeft: 'auto' }} disabled={oneri.tur === 'isteniyor'} onClick={() => void oner()}>
          {oneri.tur === 'isteniyor' ? "✦ Google'a soruluyor…" : '✦ Anahtar kelime öner'}
        </button>
      </div>
      <div className={s.kelimeler}>
        {satirlar.map((k, i) => (
          <button
            key={k.metin}
            type="button"
            className={s.kelime}
            aria-pressed={k.secili}
            onClick={() => yaz(b, 'anahtarKelimeler', kelimeDegistir(secili, k))}
          >
            <span className={s.kutu} />
            <span>{k.metin}</span>
            <small className={s.num}>
              {k.aylikArama === null ? 'hacim ölçülmedi' : `ayda ~${sayi(k.aylikArama)}${i === 0 ? ' arama' : ''}`}
            </small>
          </button>
        ))}
        <div className={s.kelimeAlt}>
          {oneri.tur === 'istenmedi' && satirlar.length === 0 && "Öner'e bas: Google site adresinden ve başlıklardan kelime çıkarır, aylık aramasıyla gösterir. "}
          {oneri.tur === 'isteniyor' && "Google'ın kelime planlayıcısına soruluyor… "}
          {oneri.tur === 'bos' && `Öneri çıkmadı: ${oneri.neden} `}
          {oneri.tur === 'dustu' && <span className={s.hataMetni}>Kelime önerisi alınamadı: {oneri.mesaj} </span>}
          {sonuc && `Gösterilen ${sonuc.satirlar.length} / Google'ın önerdiği ${sayi(sonuc.toplam)}. `}
          Seçili {secili.length} kelime. {negatif}
        </div>
        <div className={s.kelimeEkle}>
          <input
            value={elle}
            placeholder="Kendi kelimeni ekle"
            aria-label="Anahtar kelime ekle"
            maxLength={80}
            onChange={(e) => setElle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                elleEkle();
              }
            }}
          />
          <button type="button" className={s.metinDugme} onClick={elleEkle} disabled={!elle.trim()}>
            Ekle
          </button>
        </div>
      </div>
      {b.kayit.eksikler
        .filter((e) => e.alan === 'anahtarKelimeler')
        .map((e) => (
          <p key={e.kod} className={e.seviye === 'engel' ? s.hataMetni : s.ipucu}>
            {e.metin}
          </p>
        ))}
    </div>
  );
}
