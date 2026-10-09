'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  METIN_SINIRLARI,
  REHBER_AMACLARI,
  TABAN_NEGATIFLER,
  karakterSayisi,
  reklamGucu,
  type AnahtarKelimeOnerisi,
  type MetinOnerisi,
  type RehberAlanlari,
  type YoutubeVideoListesi,
} from '@advetics/shared';
import { apiFetch, onizlemeAdresi } from '@/lib/api';
import { medyaOlc, medyaYukle } from '@/reklam/medya';
import { AltCubuk, Soru, sil, yaz, type AdimBaglami } from './adim-ortak';
import { IKON, Ikon } from './ikonlar';
import {
  adresGirdisi,
  adresKaydi,
  formSecimi,
  googleGorselUygunMu,
  kelimeDegistir,
  kelimeOnerisiHali,
  kelimeSatirlari,
  metinOnerisiHali,
  oneriHatasi,
  oranSinifi,
  telefonGirdisi,
  tarihGoster,
  telefonKaydi,
  videoListesiHali,
  youtubeKimligi,
  type EkranNo,
  type OneriHali,
  type OranSinifi,
} from './rehber-mantik';
import s from './rehber.module.css';

type Metin = NonNullable<RehberAlanlari['metin']>['deger'];

/** Ekranda gösterilen boş metin: Google'ın asgarisi kadar satır (3 başlık, 2 açıklama). */
function metinKutusu(m: Metin | undefined): Metin {
  const pad = (a: string[], n: number) => (a.length >= n ? a : [...a, ...Array<string>(n - a.length).fill('')]);
  return {
    anaMetin: m?.anaMetin ?? '',
    basliklar: pad(m?.basliklar ?? [], METIN_SINIRLARI.basliklarEnAz),
    aciklamalar: pad(m?.aciklamalar ?? [], METIN_SINIRLARI.aciklamalarEnAz),
  };
}

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
        <Soru baslik="Reklamda ne görünsün?">Önce bir amaç seç; istenen alanlar amaca göre değişiyor.</Soru>
        <AltCubuk git={git} adim={4} />
      </>
    );
  }
  const kurgu = REHBER_AMACLARI[amac].google.kurgu;
  const googleArama = b.acik.google && kurgu === 'ARAMA';
  const googleGorsel = b.acik.google && kurgu === 'TALEP_YARATMA_GORSEL';
  const googleVideo = b.acik.google && kurgu === 'TALEP_YARATMA_VIDEO';
  const gorselGerekli = b.acik.meta || googleGorsel;
  const adresGerekli = ['SITE', 'SATIS', 'VIDEO', 'ERISIM'].includes(amac) || b.acik.google;
  const eksik = (kod: string) => b.kayit.eksikler.find((e) => e.kod === kod) ?? null;

  return (
    <>
      <Soru baslik="Reklamda ne görünsün?">Görselleri ve metni bir kez ver; iki platformun kalıbına biz bölüyoruz.</Soru>
      <div className={s.kart}>
        <div className={s.blok}>
          <div className={s.blokBaslik}>
            {amac === 'FORM' ? 'Form' : amac === 'TELEFON' ? 'Aranacak numara' : amac === 'WHATSAPP' ? 'WhatsApp hattı' : 'Gidecekleri sayfa'}
          </div>
          {amac === 'FORM' && <FormSecici b={b} eksikMetni={eksik('FORM-YOK')?.metin ?? null} gizlilik={eksik('FORM-GIZLILIK')?.metin ?? null} />}
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
            <p className={s.ipucu} style={{ margin: 0 }}>
              Numara sorulmaz: Meta onu Facebook sayfana bağlı WhatsApp Business hattından alır.
            </p>
          )}
          {adresGerekli && (
            <div className={amac === 'FORM' || amac === 'TELEFON' ? s.ustBosluk : undefined}>
              {(amac === 'FORM' || amac === 'TELEFON') && (
                <p className={s.ipucu} style={{ margin: '0 0 6px' }}>
                  Google reklamı bir site adresine bağlanır:
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
            googleVideo={googleVideo}
            video={amac === 'VIDEO'}
            medyaBilgisi={medyaBilgisi}
            medyaBilgisiEkle={medyaBilgisiEkle}
          />
        )}

        <MetinBlogu b={b} kaydet={kaydet} />

        {googleArama && <KelimeBlogu b={b} kaydet={kaydet} />}
      </div>
      <AltCubuk git={git} adim={4} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Medya
// ─────────────────────────────────────────────────────────────────────────────

const ORAN_ADI: Record<OranSinifi, string> = { '1:1': '1:1', '4:5': '4:5', '9:16': '9:16', '1.91:1': '1.91:1', diger: 'farklı oran' };

function MedyaBlogu({
  b,
  gorselGerekli,
  googleGorsel,
  googleVideo,
  video,
  medyaBilgisi,
  medyaBilgisiEkle,
}: {
  b: AdimBaglami;
  gorselGerekli: boolean;
  googleGorsel: boolean;
  googleVideo: boolean;
  video: boolean;
  medyaBilgisi: ReadonlyMap<string, MedyaBilgisi>;
  medyaBilgisiEkle: (id: string, m: MedyaBilgisi) => void;
}) {
  const medya = b.a.medya?.deger ?? [];
  const dosyaRef = useRef<HTMLInputElement>(null);
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
  async function yukle(dosyalar: File[]) {
    let simdiki = [...medya];
    const yeniHatalar: Array<{ ad: string; mesaj: string }> = [];
    for (const d of dosyalar) {
      if (simdiki.length >= EN_COK) {
        yeniHatalar.push({ ad: d.name, mesaj: `En çok ${EN_COK} dosya eklenebilir.` });
        continue;
      }
      setYukleniyor((n) => n + 1);
      try {
        const [olcu, y] = await Promise.all([medyaOlc(d), medyaYukle(b.clientId, d)]);
        medyaBilgisiEkle(y.id, { ad: y.ad, onizleme: onizlemeAdresi(y.onizlemeAdresi), en: olcu.en, boy: olcu.boy });
        simdiki = [...simdiki, { varlikId: y.id, ...(y.kapakId ? { kapakVarlikId: y.kapakId } : {}) }];
        yaz(b, 'medya', simdiki);
        if (y.uyari) yeniHatalar.push({ ad: d.name, mesaj: y.uyari });
      } catch (e) {
        yeniHatalar.push({ ad: d.name, mesaj: e instanceof TypeError ? 'Sunucuya ulaşılamadı.' : e instanceof Error ? e.message : 'Yükleme düştü.' });
      } finally {
        setYukleniyor((n) => n - 1);
      }
    }
    setHatalar(yeniHatalar);
  }

  function varlikDegistir(id: string) {
    if (medya.some((x) => x.varlikId === id)) return yaz(b, 'medya', medya.filter((x) => x.varlikId !== id));
    if (medya.length >= EN_COK) return setHatalar([{ ad: 'Varlık', mesaj: `En çok ${EN_COK} dosya eklenebilir.` }]);
    yaz(b, 'medya', [...medya, { varlikId: id }]);
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
            onClick={() => dosyaRef.current?.click()}
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
            accept="image/jpeg,image/png,video/mp4,video/quicktime"
            hidden
            onChange={(e) => {
              void yukle([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} aria-expanded={varliklarAcik} onClick={() => setVarliklarAcik((v) => !v)}>
            {varliklarAcik ? 'Varlıkları gizle' : "Marka Merkezi'nden seç"}
          </button>
          <div className={s.gizlenir} data-acik={varliklarAcik}>
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
          {medya.length > 0 && (
            <div className={s.dosyalar}>
              {medya.map((x) => {
                const bilgi = medyaBilgisi.get(x.varlikId);
                const oran = bilgi?.en && bilgi.boy ? oranSinifi(bilgi.en, bilgi.boy) : null;
                return (
                  <div key={x.varlikId} className={s.dosya}>
                    {bilgi ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={bilgi.onizleme} alt="" className={`${s.kucuk} ${oran === '9:16' ? s.dikey : ''}`} />
                    ) : (
                      <div className={s.kucuk} />
                    )}
                    <div>
                      <b>{bilgi?.ad ?? 'Varlık'}</b>
                      <small>{bilgi?.en && bilgi.boy ? `${bilgi.en} × ${bilgi.boy} · ${ORAN_ADI[oran!]}` : 'Boyut bilinmiyor'}</small>
                    </div>
                    <div className={s.uygun}>
                      {oran && b.acik.meta && <span className={s.e}>Meta ✓{oran === '9:16' ? ' Hikâye' : ''}</span>}
                      {oran && googleGorsel && (googleGorselUygunMu(oran) ? <span className={s.e}>Google ✓</span> : <span className={s.h}>Google ✕ oran</span>)}
                      <button type="button" className={s.metinDugme} aria-label={`${bilgi?.ad ?? 'Varlığı'} kaldır`} onClick={() => yaz(b, 'medya', medya.filter((y) => y.varlikId !== x.varlikId))}>
                        Kaldır
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {hatalar.map((h, i) => (
            <p key={`${h.ad}-${i}`} className={s.hataMetni} role="alert">
              {h.ad}: {h.mesaj}
            </p>
          ))}
          {fazla && <p className={s.ipucu}>{fazla.metin}</p>}
          {googleGorsel && <p className={s.ipucu}>Google&apos;ın görsel reklamı yatay (1.91:1) bir görsel de istiyor. Eklemezsen yalnız eklediğin oranlarla kurulur.</p>}
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

function FormSecici({ b, eksikMetni, gizlilik }: { b: AdimBaglami; eksikMetni: string | null; gizlilik: string | null }) {
  const durum = formSecimi(b.h.formSablonlari);
  const secili = b.a.formSablonuId?.deger ?? null;
  const sayfa = b.h.sayfalar.find((x) => x.id === b.a.sayfaId?.deger)?.ad ?? null;
  return (
    <>
      {durum.tur === 'okunamadi' && (
        <div className={s.uyari} role="alert">
          <Ikon d={IKON.ucgen} />
          <span>Sayfanın anlık formları okunamadı. Sayfayı yenile; düzelmezse sayfa bağlantısını Marka Merkezi &gt; Bağlantılar&apos;da kontrol et.</span>
        </div>
      )}
      {durum.tur === 'yok' && (
        <div className={s.uyari}>
          <Ikon d={IKON.ucgen} />
          <span>
            {sayfa ? <b>{sayfa}</b> : 'Seçili'} sayfasında kayıtlı anlık form yok. Formu bir kez Meta&apos;da (Reklam Yöneticisi &gt; Anlık formlar)
            oluştur, sonra bu sayfayı yenile; burada seçilebilir olur.
          </span>
        </div>
      )}
      {durum.tur === 'liste' && (
        <div className={s.secim}>
          {durum.formlar.map((f) => (
            <button key={f.id} type="button" aria-pressed={secili === f.id} onClick={() => yaz(b, 'formSablonuId', f.id)}>
              {f.ad}
            </button>
          ))}
        </div>
      )}
      <p className={eksikMetni && durum.tur === 'liste' ? s.hataMetni : s.ipucu}>
        {durum.tur === 'liste' && eksikMetni
          ? eksikMetni
          : `Formlar ${sayfa ? `${sayfa} ` : 'seçtiğin '}Facebook sayfasına gelir (Meta'nın kendi seçtiği sayfa değil).`}
      </p>
      {gizlilik && <p className={s.hataMetni}>{gizlilik}</p>}
    </>
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
   * Liste kanal seçilince bir kez okunur (kanal değişirse yeniden). Dört
   * hâl ayrı: kanal yok / okunuyor / kanalda video yok (sunucunun nedeni) /
   * çağrı düştü (sunucunun mesajı). Bağlantı yapıştırma YEDEK yol: liste
   * okunamasa da kullanıcı ilerleyebilsin.
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

  const yedekKimlik = youtubeKimligi(yedek);
  const listede = hal.tur === 'geldi' && secili ? hal.deger.satirlar.some((v) => v.videoId === secili.videoId) : false;

  return (
    <>
      <div className={s.blokBaslik}>
        YouTube videosu <span className={s.ops}>Google için</span>
      </div>
      {hal.tur === 'istenmedi' && <p className={s.ipucu} style={{ margin: 0 }}>Önce Nerede adımında YouTube kanalını seç; videolar oradan listelenir.</p>}
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
            {hal.deger.satirlar.map((v) => (
              <button
                key={v.videoId}
                type="button"
                aria-pressed={secili?.videoId === v.videoId}
                onClick={() => yaz(b, 'youtubeVideo', { videoId: v.videoId, baslik: v.baslik.slice(0, 200) })}
              >
                {v.baslik || v.videoId}
                {v.yayinTarihi && <small>{tarihGoster(v.yayinTarihi.slice(0, 10))}</small>}
              </button>
            ))}
          </div>
          {hal.deger.dahaFazlaVar && (
            <p className={s.ipucu}>
              Son {hal.deger.toplam} video gösteriliyor; kanalda daha eskileri olabilir. Aradığın yoksa bağlantısını yapıştır.
            </p>
          )}
        </>
      )}
      {secili && (
        <p className={s.ipucu}>
          {!listede && (
            <>
              Seçili video: <b>{secili.baslik || secili.videoId}</b>{' '}
            </>
          )}
          <button type="button" className={s.metinDugme} onClick={() => sil(b, 'youtubeVideo')}>
            Video seçimini kaldır
          </button>
        </p>
      )}
      <button type="button" className={`${s.metinDugme} ${s.ustBosluk}`} aria-expanded={yedekAcik} onClick={() => setYedekAcik((x) => !x)}>
        {yedekAcik ? 'Bağlantı kutusunu gizle' : 'Bağlantı yapıştır'}
      </button>
      <div className={s.gizlenir} data-acik={yedekAcik}>
        <div>
          <div className={s.girdi} style={{ marginTop: 8 }}>
            <input
              value={yedek}
              placeholder="YouTube bağlantısını yapıştır"
              aria-label="YouTube videosu bağlantısı"
              tabIndex={yedekAcik ? 0 : -1}
              onChange={(e) => {
                setYedek(e.target.value);
                const k = youtubeKimligi(e.target.value);
                if (k) yaz(b, 'youtubeVideo', { videoId: k, baslik: '' });
              }}
            />
          </div>
          {yedek.trim() && !yedekKimlik && <p className={s.hataMetni}>Bu bir YouTube video bağlantısı değil.</p>}
          <p className={s.ipucu}>Video bağlı kanalda yayınlanmış olmalı.</p>
        </div>
      </div>
      {eksikMetni && !secili && <p className={s.ipucu}>{eksikMetni}</p>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metin
// ─────────────────────────────────────────────────────────────────────────────

function MetinBlogu({ b, kaydet }: { b: AdimBaglami; kaydet: () => Promise<boolean> }) {
  const m = metinKutusu(b.a.metin?.deger);
  const [oneri, setOneri] = useState<OneriHali<MetinOnerisi>>({ tur: 'istenmedi' });
  const guc = reklamGucu(m);
  const yuzde = { zayif: 30, orta: 60, iyi: 100 }[guc.gucu];
  const oneriKaynakli = b.a.metin?.kaynak === 'ai_onerisi';

  function metinYaz(yeni: Metin) {
    yaz(b, 'metin', yeni);
  }

  /*
   * ÖNERİ DÖRT HÂLLİ ve KENDİLİĞİNDEN YAZILMAZ. Model metni `ai_onerisi`
   * olarak döndürüyor; alanlara ancak kullanıcı "Kullan"a basınca ve
   * `kullanici` kaynağıyla giriyor. Önerinin olduğu gibi yayına gitmesi,
   * kullanıcının okumadığı bir vaadin reklamda çıkması demek.
   */
  async function oner() {
    setOneri({ tur: 'isteniyor' });
    if (!(await kaydet())) return setOneri({ tur: 'dustu', mesaj: 'Taslak kaydedilemedi; öneri kayıtlı alanlardan üretiliyor.' });
    try {
      const r = await apiFetch<MetinOnerisi>(`/reklam/rehberler/${b.kayit.id}/metin-oner`, { method: 'POST', body: '{}' });
      setOneri(metinOnerisiHali(r));
    } catch (e) {
      setOneri(oneriHatasi(e));
    }
  }

  function kullan(o: MetinOnerisi) {
    metinYaz(metinKutusu({ anaMetin: o.anaMetin, basliklar: o.basliklar, aciklamalar: o.aciklamalar }));
    setOneri({ tur: 'istenmedi' });
  }

  return (
    <div className={s.blok}>
      <div className={s.blokBaslik}>
        Metin{' '}
        <button type="button" className={s.metinDugme} style={{ marginLeft: 'auto' }} disabled={oneri.tur === 'isteniyor'} onClick={() => void oner()}>
          {oneri.tur === 'isteniyor' ? '✦ Öneri yazılıyor…' : '✦ Metin öner'}
        </button>
      </div>
      <div className={s.metinler}>
        {oneri.tur === 'geldi' && (
          <div className={s.oneriKart}>
            <b>Önerilen metin</b>
            {oneri.deger.anaMetin && <span>{oneri.deger.anaMetin}</span>}
            {oneri.deger.basliklar.length > 0 && (
              <ul>
                {oneri.deger.basliklar.map((x, i) => (
                  <li key={`b${i}`}>{x}</li>
                ))}
              </ul>
            )}
            {oneri.deger.aciklamalar.length > 0 && (
              <ul>
                {oneri.deger.aciklamalar.map((x, i) => (
                  <li key={`a${i}`}>{x}</li>
                ))}
              </ul>
            )}
            {oneri.deger.notlar.map((n, i) => (
              <span key={`n${i}`} className={s.ops}>
                {n}
              </span>
            ))}
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={s.ikincil} onClick={() => kullan(oneri.deger)}>
                Kullan
              </button>
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
            <span className={s.ops}>
              {METIN_SINIRLARI.basliklarEnAz} ile {METIN_SINIRLARI.basliklarEnCok} arası · Google hepsini dener, Meta ilk {METIN_SINIRLARI.metaBaslikSayisi}&apos;ini
            </span>
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
          {m.basliklar.length < METIN_SINIRLARI.basliklarEnCok && (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => metinYaz({ ...m, basliklar: [...m.basliklar, ''] })}>
              + Başlık ekle
            </button>
          )}
        </div>
        <div className={s.alan}>
          <span className={s.alanEtiket}>
            Açıklama <span className={s.ops}>En az {METIN_SINIRLARI.aciklamalarEnAz}</span>
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
          {m.aciklamalar.length < METIN_SINIRLARI.aciklamalarEnCok && (
            <button type="button" className={s.metinDugme} style={{ alignSelf: 'flex-start' }} onClick={() => metinYaz({ ...m, aciklamalar: [...m.aciklamalar, ''] })}>
              + Açıklama ekle
            </button>
          )}
        </div>
        <div className={s.guc}>
          <span>Reklam gücü</span>
          <div className={s.gucCubuk}>
            <i style={{ width: `${yuzde}%` }} />
          </div>
          <b>{{ zayif: 'Zayıf', orta: 'Orta', iyi: 'İyi' }[guc.gucu]}</b>
          {guc.ipucu && <span className={s.ops}>{guc.ipucu}</span>}
        </div>
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
