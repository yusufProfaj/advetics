'use client';

import { hedeflemeLokasyonu } from '@advetics/shared';
import { useEffect, useState } from 'react';
import { kitleOzeti } from '@advetics/shared';
import type {
  AutoBoostPresetRecord,
  KitleIlgi,
  KitleOzel,
  KitleSablonuListesi,
  KitleSablonuRecord,
  ConnectionSummary,
  GeoLocationOption,
  SavedAudienceList,
  YoutubeOtomatikOnizleme,
  GoogleYasAraligi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
/*
 * HEDEFLEME SEÇİCİSİ ORTAK BİLEŞENDE.
 * Kart bazında düzenleme penceresi de AYNI seçiciyi kullanıyor; ikinci bir
 * kopya doğduğu anda ayrışır ve iki ekran farklı hedefleme kurardı.
 */
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { GoogleHedefleme, type GoogleKonum } from '@/components/autoboost/google-hedefleme';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { boostSozlugu } from '@/dil/sozlukler/boost';

/**
 * OTOMATİK BOOST ÖN AYARLARI.
 *
 * ═══ BU EKRANIN İŞİ ═══
 *
 * Ön ayar, kart onaylandığında HANGİ AYARLARLA yayınlanacağını söylüyor.
 * Kullanıcının tek tıkla yayınlamasını mümkün kılan şey bu; yoksa her kartta
 * form doldurulurdu ve 1.0'ın vaadi de o değil.
 *
 * İKİ SEKME, ÇÜNKÜ İKİ PLATFORM AYNI DEĞİL. Tek bir birleşik forma sıkıştırmak
 * yarısı her zaman anlamsız olan alanlar üretirdi: Meta'da kayıtlı kitle ve
 * lokasyon var, Google'da marka adı ve logo ZORUNLU. Sekmeler bu farkı
 * saklamıyor, gösteriyor.
 *
 * ESKİDEN "BilgiBankasi" ADINI TAŞIYORDU ve `/kutuphane/bilgi-bankasi`
 * sayfasının kendisiydi — o isim/rota artık müşterinin GENEL profiline ait
 * (bkz. `apps/web/src/app/(dashboard)/kutuphane/bilgi-bankasi/page.tsx`).
 * Bu bileşen yalnızca Akıllı Boost'un onay modalında yaşıyor
 * (`boost-on-ayari.tsx`), boost'a özel ayarlarla sınırlı.
 */
export function BoostOnAyarlariFormu({
  clientId,
  canWrite,
}: {
  clientId: string;
  canWrite: boolean;
}) {
  const d = useSozluk(boostSozlugu).onAyar;
  const [sekme, setSekme] = useState<'meta' | 'google'>('meta');
  const [presets, setPresets] = useState<AutoBoostPresetRecord[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<AutoBoostPresetRecord[]>(`/autoboost/presets?clientId=${clientId}`)
      .then((r) => {
        setPresets(r);
        setHata(null);
      })
      // Hata YUTULMUYOR: "henüz yüklemedim" ile "çağrı düştü" farklı işler.
      .catch((err: unknown) =>
        setHata(err instanceof ApiRequestError ? err.message : d.yuklenemedi),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dil değişince ön ayar yeniden çekilmesin
  }, [clientId]);

  const mevcut = presets?.find((p) => p.platform === sekme) ?? null;

  return (
    // ÇERÇEVESİZ: form `Pencere`nin içinde yaşıyor; ikinci bir kart çerçevesi
    // pencerenin içinde kutu içinde kutu çiziyordu.
    <section className="min-w-0 space-y-4">
      <header className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{d.baslik}</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          {d.aciklama}
        </p>
      </header>

      <div className="flex gap-1 border-b border-line">
        {(['meta', 'google'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setSekme(p)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition ${
              sekme === p
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {p === 'meta' ? 'Instagram' : 'YouTube'}
            {presets?.some((x) => x.platform === p && x.enabled) && (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-brand align-middle" />
            )}
          </button>
        ))}
      </div>

      {hata && <p className="text-xs text-danger">{hata}</p>}
      {!presets && !hata && <p className="text-xs text-ink-muted">{d.yukleniyor}</p>}

      {presets &&
        (sekme === 'meta' ? (
          <MetaForm clientId={clientId} mevcut={mevcut} canWrite={canWrite} />
        ) : (
          <GoogleForm clientId={clientId} mevcut={mevcut} canWrite={canWrite} />
        ))}
    </section>
  );
}

const input =
  'w-full rounded-alan border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';

function Alan({
  etiket,
  ipucu,
  children,
}: {
  etiket: string;
  ipucu?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {etiket}
      </span>
      {children}
      {ipucu && <span className="mt-1 block text-[11px] text-ink-muted">{ipucu}</span>}
    </label>
  );
}

/** Kaydet düğmesi ve durum satırı — iki formda da aynı. */
function Kaydet({
  busy,
  hata,
  sonuc,
  canWrite,
  onKaydet,
}: {
  busy: boolean;
  hata: string | null;
  sonuc: string | null;
  canWrite: boolean;
  onKaydet: () => void;
}) {
  const d = useSozluk(boostSozlugu).onAyar;
  return (
    <div className="space-y-2">
      {hata && <p className="max-w-lg text-xs text-danger">{hata}</p>}
      {sonuc && <p className="max-w-lg text-xs text-ink">{sonuc}</p>}
      <Dugme
        onClick={onKaydet}
        disabled={busy || !canWrite}
        title={canWrite ? undefined : d.yetkiYok}
      >
        {busy ? d.kaydediliyor : d.kaydet}
      </Dugme>
    </div>
  );
}

function MetaForm({
  clientId,
  mevcut,
  canWrite,
}: {
  clientId: string;
  mevcut: AutoBoostPresetRecord | null;
  canWrite: boolean;
}) {
  const s = mevcut?.settings.platform === 'meta' ? mevcut.settings : null;
  const d = useSozluk(boostSozlugu);
  const o = d.onAyar;
  const dz = d.duzenle;

  const [enabled, setEnabled] = useState(mevcut?.enabled ?? true);
  const [mode, setMode] = useState<'daily' | 'lifetime'>(mevcut?.budgetMode ?? 'lifetime');
  const [amount, setAmount] = useState(
    mevcut ? String(Number(mevcut.budgetMicros) / 1_000_000) : '300',
  );
  const [gun, setGun] = useState(mevcut?.durationDays ?? 5);
  const [goal, setGoal] = useState(s?.goal ?? 'engagement');
  const [yasMin, setYasMin] = useState(s?.ageMin ?? 18);
  const [yasMax, setYasMax] = useState(s?.ageMax ?? 65);
  const [cinsiyet, setCinsiyet] = useState(s?.genders ?? 'all');
  /*
   * ŞEHİR VE KAYITLI KİTLE — BU EKRANDA UZUN SÜRE SORULMUYORDU.
   *
   * Şema ikisini de baştan destekliyordu (`locations`, `savedAudienceId`)
   * ama form gövdeye SABİT boş değer yazıyordu; yani alan veritabanında
   * duruyor, kullanıcıya hiç sorulmuyordu — CLAUDE.md'nin "veride duran
   * alan, kullanılmıyorsa yoktur" kalıbı.
   */
  /*
   * KAYITLI AD YÜKLENİYOR. Burada `name: l.key, label: l.key` yazıyordu:
   * form açılınca şehir "2343687" görünüyor ve kaydet'e basılınca
   * `hedeflemeLokasyonu` o anahtarı AD olarak geri yazıyordu, yani saklanan
   * okunabilir ad her kayıtta siliniyordu ve kart da sayı göstermeye
   * başlıyordu. Ad yoksa (eski kayıt) anahtara düşülüyor.
   */
  const [lokasyonlar, setLokasyonlar] = useState<GeoLocationOption[]>(
    (s?.locations ?? []).map((l) => ({
      key: l.key,
      type: l.type,
      name: l.label ?? l.key,
      label: l.label ?? l.key,
      countryCode: null,
    })) as GeoLocationOption[],
  );
  const [kitleId, setKitleId] = useState<string | null>(s?.savedAudienceId ?? null);
  // Marka Merkezi kitle şablonundan kopyalanan alanlar (Bölüm 4).
  const [ilgiler, setIlgiler] = useState<KitleIlgi[]>(s?.interests ?? []);
  const [ozelKitleler, setOzelKitleler] = useState<KitleOzel[]>(s?.ozelKitleler ?? []);
  const [sablonId, setSablonId] = useState<string | null>(s?.kitleSablonuId ?? null);
  const sablonAlaniVar = ilgiler.length > 0 || ozelKitleler.length > 0;

  function sablondanDoldur(k: KitleSablonuRecord): void {
    setLokasyonlar(
      k.locations.map((l) => ({
        key: l.key,
        type: l.type,
        name: l.label,
        label: l.label,
        countryCode: l.countryCode,
      })) as GeoLocationOption[],
    );
    setYasMin(k.ageMin);
    setYasMax(k.ageMax);
    setCinsiyet(k.genders);
    setIlgiler(k.interests);
    setOzelKitleler(k.ozelKitleler);
    setSablonId(k.id);
    // Meta kayıtlı kitlesi şablonun yerini tutuyordu; ikisi birlikte olamaz.
    setKitleId(null);
  }

  function sablonuTemizle(): void {
    setIlgiler([]);
    setOzelKitleler([]);
    setSablonId(null);
  }

  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  async function kaydet(): Promise<void> {
    setBusy(true);
    setHata(null);
    setSonuc(null);
    try {
      await apiFetch('/autoboost/presets', {
        method: 'PUT',
        body: JSON.stringify({
          clientId,
          socialProfileId: null,
          enabled,
          budget: { mode, amount: amount.replace(',', '.'), durationDays: gun },
          settings: {
            platform: 'meta',
            goal,
            savedAudienceId: kitleId,
            /*
             * KAYITLI KİTLE SEÇİLİYSE LOKASYON GÖNDERİLMİYOR.
             *
             * Kitlenin kendi hedeflemesi Meta tarafında çözülüyor
             * (`boost-executor.service.ts`); üstüne lokasyon eklemek iki
             * hedeflemeyi çakıştırmak olurdu ve Meta kovaları BİRLEŞİM
             * olarak uyguluyor — "İzmir + kitle" sessizce kitleden geniş
             * bir kümeye çıkardı.
             */
            /*
             * ORTAK ÜRETİCİ. Burada `{ key, type }` elle yazılıyordu ve kart
             * düzenleme penceresi kendi kopyasını taşıyordu; ikisi de adı
             * düşürüyordu ve ad alanı eklenince yalnızca birine eklemek, iki
             * ekranın aynı ön ayar için farklı kitle anlatması olurdu.
             */
            locations: kitleId ? [] : lokasyonlar.map(hedeflemeLokasyonu),
            ageMin: yasMin,
            ageMax: yasMax,
            genders: cinsiyet,
            /*
             * KAYITLI KİTLE SEÇİLİYSE ŞABLON ALANLARI GİTMİYOR: sunucu ikisini
             * birlikte reddediyor. Kullanıcı bunu kaydetmeden ÖNCE ekranda
             * görüyor (aşağıdaki uyarı), sessizce düşürülmüyor.
             */
            interests: kitleId ? [] : ilgiler,
            ozelKitleler: kitleId ? [] : ozelKitleler,
            kitleSablonuId: kitleId ? null : sablonId,
          },
        }),
      });
      if (kitleId && sablonAlaniVar) sablonuTemizle();
      setSonuc(o.kaydedildiMeta);
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : o.kaydedilemedi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-3">
      <Acik enabled={enabled} setEnabled={setEnabled} />

      <div className="grid gap-2 sm:grid-cols-3">
        <Alan etiket={o.butceKipi}>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'daily' | 'lifetime')}
            className={input}
          >
            <option value="lifetime">{dz.toplam}</option>
            <option value="daily">{dz.gunluk}</option>
          </select>
        </Alan>
        <Alan etiket={o.tutar}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
        </Alan>
        <Alan etiket={o.sureGun}>
          <input
            type="number"
            min={1}
            max={30}
            value={gun}
            onChange={(e) => setGun(Number(e.target.value))}
            className={input}
          />
        </Alan>
      </div>

      <Alan etiket={o.amac} ipucu={o.amacIpucu}>
        <select
          value={goal}
          onChange={(e) => setGoal(e.target.value as typeof goal)}
          className={input}
        >
          <option value="engagement">{o.etkilesim}</option>
          <option value="reach">{o.erisim}</option>
          <option value="profile_visits">{o.profilZiyareti}</option>
        </select>
      </Alan>

      <SablondanDoldur clientId={clientId} sablonId={sablonId} onSec={sablondanDoldur} />

      {sablonAlaniVar && (
        <div className="rounded-md border border-line bg-surface-muted p-2 text-xs">
          {ilgiler.length > 0 && (
            <p className="text-ink">{o.ilgi(ilgiler.map((i) => i.name).join(', '))}</p>
          )}
          {ozelKitleler.map((ok) => (
            <p key={ok.id} className="text-ink">
              {ok.mod === 'dahil' ? o.ozelKitle : o.haric}: {ok.name}
            </p>
          ))}
          {ozelKitleler.length > 0 && (
            <p className="mt-1 text-ink-muted">
              {o.ozelKitleHesap(ozelKitleler[0]!.hesapAdi)}
            </p>
          )}
          {kitleId && (
            <p className="mt-1 text-danger-strong">
              {o.kitleSeciliUyari}
            </p>
          )}
          <button type="button" onClick={sablonuTemizle} className="mt-1 text-ink-muted underline">
            {o.ilgiKaldir}
          </button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Alan etiket={dz.yasAlt}>
          <input
            type="number"
            min={13}
            max={65}
            value={yasMin}
            onChange={(e) => setYasMin(Number(e.target.value))}
            className={input}
          />
        </Alan>
        <Alan etiket={dz.yasUst}>
          <input
            type="number"
            min={13}
            max={65}
            value={yasMax}
            onChange={(e) => setYasMax(Number(e.target.value))}
            className={input}
          />
        </Alan>
        <Alan etiket={dz.cinsiyet}>
          <select
            value={cinsiyet}
            onChange={(e) => setCinsiyet(e.target.value as typeof cinsiyet)}
            className={input}
          >
            <option value="all">{dz.hepsi}</option>
            <option value="female">{dz.kadin}</option>
            <option value="male">{dz.erkek}</option>
          </select>
        </Alan>
      </div>

      <HedeflemeSecici
        clientId={clientId}
        lokasyonlar={lokasyonlar}
        setLokasyonlar={setLokasyonlar}
        kitleId={kitleId}
        setKitleId={setKitleId}
      />

      <Kaydet busy={busy} hata={hata} sonuc={sonuc} canWrite={canWrite} onKaydet={() => void kaydet()} />
    </div>
  );
}

/**
 * MARKA MERKEZİ KİTLE ŞABLONUNDAN DOLDUR.
 *
 * Şablon KOPYALANIYOR: seçmek formu dolduruyor, kullanıcı düzeltip
 * kaydediyor. Şablon sonradan değişirse ön ayar değişmiyor ve bu ekranda
 * yazıyor; her yeni gönderiye para harcayan bir ayarın kitlesi sessizce
 * değişmemeli.
 *
 * DÖRT HÂL AYRI: yükleniyor, çağrı düştü (sunucunun mesajı), şablon yok,
 * liste. Hepsini boş bir seçiciye çevirmek "şablonum neden yok" sorusunu
 * cevapsız bırakırdı.
 */
function SablondanDoldur({
  clientId,
  sablonId,
  onSec,
}: {
  clientId: string;
  sablonId: string | null;
  onSec: (k: KitleSablonuRecord) => void;
}) {
  const d = useSozluk(boostSozlugu).onAyar;
  const [liste, setListe] = useState<KitleSablonuRecord[] | undefined>(undefined);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    setListe(undefined);
    setHata(null);
    // YALNIZ META KİTLESİ: bu form Meta ön ayarı; Google kitlesinin ilgi
    // ve kelimeleri Meta hedeflemesine çevrilemez, seçilseydi yalnız konumu
    // gelir ve kullanıcı kitlenin tamamını uyguladığını sanırdı.
    apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${clientId}&platform=meta`)
      .then((r) => setListe(r.items))
      .catch((err: unknown) =>
        setHata(err instanceof ApiRequestError ? err.message : d.sablonOkunamadi),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dil değişince şablonlar yeniden çekilmesin
  }, [clientId]);

  if (hata) return <p className="text-xs text-danger-strong">{d.sablonOkunamadiMesaj(hata)}</p>;
  if (liste === undefined) return <p className="text-xs text-ink-muted">{d.sablonYukleniyor}</p>;
  if (liste.length === 0) {
    return <p className="text-xs text-ink-muted">{d.sablonYok}</p>;
  }

  const kaynak = sablonId ? liste.find((k) => k.id === sablonId) : undefined;
  return (
    <Alan
      etiket={d.sablondanDoldur}
      ipucu={sablonId && !kaynak ? d.sablonSilinmis : d.sablonKopyalanir}
    >
      <select
        value=""
        onChange={(e) => {
          const k = liste.find((x) => x.id === e.target.value);
          if (k) onSec(k);
        }}
        className={input}
      >
        <option value="">{kaynak ? d.sonDoldurulan(kaynak.name) : d.sablonSec}</option>
        {liste.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name} ({kitleOzeti(k)})
          </option>
        ))}
      </select>
    </Alan>
  );
}

/**
 * YOUTUBE ÖN AYARI — kullanıcı YALNIZCA bütçeyi ve süreyi giriyor.
 *
 * Kullanıcının tarifi: *"youtube ön ayarı çok büyük angarya ... ben sadece
 * bütçe gireceğim"*. Önceki form yedi alan istiyordu: marka adı, logo
 * (Görsel Arşivi'nden elle seçiliyordu), hedef URL, başlık, uzun başlık,
 * açıklama ve bütçe. Metinler SABİTTİ, yani her video aynı başlıkla
 * yayınlanıyordu.
 *
 * Artık marka adı, logo ve adres sistemden, metinler her videonun kendi
 * başlığından geliyor. Form bunları GÖSTERİYOR ve NEREDEN geldiklerini
 * yazıyor: görünmeyen bir otomatik değer, kullanıcının neyin yayınlandığını
 * bilmemesi demek. Değerler yayınla aynı çözümleyiciden
 * (`/autoboost/presets/youtube-otomatik`).
 */
function GoogleForm({
  clientId,
  mevcut,
  canWrite,
}: {
  clientId: string;
  mevcut: AutoBoostPresetRecord | null;
  canWrite: boolean;
}) {
  const s = mevcut?.settings.platform === 'google' ? mevcut.settings : null;
  const o = useSozluk(boostSozlugu).onAyar;
  const dz = useSozluk(boostSozlugu).duzenle;

  const [enabled, setEnabled] = useState(mevcut?.enabled ?? true);
  const [amount, setAmount] = useState(
    mevcut ? String(Number(mevcut.budgetMicros) / 1_000_000) : '100',
  );
  const [gun, setGun] = useState(mevcut?.durationDays ?? 7);
  /*
   * HEDEF KİTLE ÖN AYARDAN OKUNUYOR ve kaydedilince gerçekten gidiyor. Bir
   * süre panel ikisini de HER ZAMAN boş gönderiyordu (şemada alan vardı,
   * yayın yolu okumuyordu) — ekranda olmayan bir ayar ölü alandı.
   */
  const [konumlar, setKonumlar] = useState<GoogleKonum[]>(s?.locations ?? []);
  const [yaslar, setYaslar] = useState<GoogleYasAraligi[]>(s?.ageRanges ?? []);

  /*
   * ESKİ ÖN AYARDA ELLE SEÇİLMİŞ DEĞERLER KORUNUYOR. Kullanıcı bir logoyu
   * ya da adresi bilerek seçmiş olabilir; kaydederken sessizce atmak o
   * seçimi yok saymak olurdu. "Otomatiğe geç" onları açıkça bırakıyor.
   */
  const eskiSecim = Boolean(s?.businessName || s?.logoAssetId || s?.finalUrl);
  const [otomatigeGec, setOtomatigeGec] = useState(false);

  const [otomatik, setOtomatik] = useState<YoutubeOtomatikOnizleme | null>(null);
  const [otomatikHata, setOtomatikHata] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  useEffect(() => {
    setOtomatikHata(null);
    void apiFetch<YoutubeOtomatikOnizleme>(`/autoboost/presets/youtube-otomatik?clientId=${clientId}`)
      .then(setOtomatik)
      // HATA YUTULMUYOR: "otomatik bilgiler okunamadı" ile "eksik yok"
      // aynı boş kutuya dönerse kullanıcı yayının hazır olduğunu sanır.
      .catch((err: unknown) =>
        setOtomatikHata(err instanceof ApiRequestError ? err.message : o.otomatikOkunamadi),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dil değişince yeniden çekilmesin
  }, [clientId, sonuc]);

  async function kaydet(): Promise<void> {
    setBusy(true);
    setHata(null);
    setSonuc(null);
    const koru = eskiSecim && !otomatigeGec;
    try {
      await apiFetch('/autoboost/presets', {
        method: 'PUT',
        body: JSON.stringify({
          clientId,
          socialProfileId: null,
          enabled,
          // GOOGLE'DA YALNIZCA GÜNLÜK. Toplam bütçe diye bir kip yok ve
          // seçenek göstermek, seçilemeyen bir seçenek göstermek olurdu.
          budget: { mode: 'daily', amount: amount.replace(',', '.'), durationDays: gun },
          settings: {
            platform: 'google',
            biddingStrategy: 'maximize_clicks',
            bidTargetMicros: null,
            ...(koru && s?.businessName ? { businessName: s.businessName } : {}),
            ...(koru && s?.logoAssetId ? { logoAssetId: s.logoAssetId } : {}),
            ...(koru && s?.finalUrl ? { finalUrl: s.finalUrl } : {}),
            locations: konumlar,
            ageRanges: yaslar,
          },
        }),
      });
      setSonuc(o.ytKaydedildi);
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : o.kaydedilemedi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Acik enabled={enabled} setEnabled={setEnabled} />

      <div className="grid gap-2 sm:grid-cols-2">
        {/* ASGARİ BÜTÇE GİRİŞTE SÖYLENİYOR: Google 2026-04'ten beri Demand
            Gen'de günde en az 5 USD karşılığı istiyor ve 50 ₺'lik ön ayar
            ilk canlı provada (2026-10-09) tam bununla reddedildi. TL tutarı
            YAZILMIYOR: kura bağlı ve Google'ın kendi rakamı provanın
            ayrıntısında görünüyor; sabit bir TL burada bir gün yalan olur. */}
        <Alan etiket={o.gunlukButce} ipucu={o.gunlukButceIpucu}>
          <input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            className={input}
          />
        </Alan>
        <Alan etiket={o.sureGun}>
          <input
            type="number"
            min={1}
            max={30}
            value={gun}
            onChange={(e) => setGun(Number(e.target.value))}
            className={input}
          />
        </Alan>
      </div>

      <OtomatikBilgiler
        otomatik={otomatik}
        hata={otomatikHata}
        eskiSecim={eskiSecim && !otomatigeGec}
        onOtomatigeGec={() => setOtomatigeGec(true)}
      />

      <GoogleHedefleme
        reklamHesabiId={otomatik?.reklamHesabiId ?? null}
        konumlar={konumlar}
        setKonumlar={setKonumlar}
        yaslar={yaslar}
        setYaslar={setYaslar}
      />

      {/*
        KART ONAYLANINCA YAYINDA — ve yazma yolu canlıda ilk kez çalışıyor.
        Kullanıcı bunu bilerek istedi (2026-09-25); ilk denemenin küçük
        bütçeyle yapılması gerektiği burada söylenmeli.
      */}
      <Serit baslik={o.seritBaslik}>
        {o.seritGovde}
      </Serit>

      <Kaydet busy={busy} hata={hata} sonuc={sonuc} canWrite={canWrite} onKaydet={() => void kaydet()} />
    </div>
  );
}

/**
 * OTOMATİK DOLAN BİLGİLER — her biri KAYNAĞIYLA.
 *
 * Eksik varsa kutu uyarı rengine dönüyor ve ne yapılacağı yazıyor; eksiksiz
 * hâlde kart onaylandığında yayın sorulmadan çıkıyor. Örnek metinler son
 * videodan: kullanıcı reklamın ne diyeceğini yayından ÖNCE görüyor.
 */
function OtomatikBilgiler({
  otomatik,
  hata,
  eskiSecim,
  onOtomatigeGec,
}: {
  otomatik: YoutubeOtomatikOnizleme | null;
  hata: string | null;
  eskiSecim: boolean;
  onOtomatigeGec: () => void;
}) {
  const o = useSozluk(boostSozlugu).onAyar;
  if (hata) {
    return (
      <p role="alert" className="text-xs text-danger">
        {o.otomatikOkunamadiMesaj(hata)}
      </p>
    );
  }
  if (!otomatik) return <p className="text-xs text-ink-muted">{o.otomatikYukleniyor}</p>;

  const eksikVar = otomatik.eksikler.length > 0;
  return (
    <section
      // EKSİK VARSA SOL KIRMIZI ÇİZGİ (şerit dili): zemin rengi kılavuzda yok.
      className={`space-y-3 rounded-kart border px-3 py-3 ${
        eksikVar ? 'border-line border-l-4 border-l-danger bg-surface' : 'border-line bg-surface-sunken'
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {o.otomatikDoldurulanlar}
      </p>

      <div className="flex items-center gap-3">
        {otomatik.logo.onizleme ? (
          // KANAL GÖRSELİ HARİCİ BİR ADRES: Next görsel optimizasyonu
          // yapılandırılmamış bir ana makineyi reddederdi; düz <img> yeterli.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={otomatik.logo.onizleme}
            alt={o.logoAlt}
            className="size-12 shrink-0 rounded-alan border border-line bg-surface object-cover"
          />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-alan border border-dashed border-line text-[10px] text-ink-muted">
            {o.logoYok}
          </span>
        )}
        <dl className="min-w-0 space-y-1 text-xs">
          <Satir
            etiket={o.markaAdi}
            deger={otomatik.marka.deger}
            kaynak={o.markaKaynagi[otomatik.marka.kaynak]}
          />
          <Satir etiket="Logo" deger={null} kaynak={o.logoKaynagi[otomatik.logo.kaynak]} />
          <Satir
            etiket={o.hedefAdres}
            deger={otomatik.url.deger}
            kaynak={o.urlKaynagi[otomatik.url.kaynak]}
          />
        </dl>
      </div>

      {otomatik.ornek ? (
        <div className="rounded-md bg-surface px-2.5 py-2 text-xs">
          <p className="text-[11px] text-ink-muted">
            {o.sonVideodanOrnek} <span className="text-ink">{otomatik.ornek.videoBasligi}</span>
          </p>
          <p className="mt-1 font-semibold text-ink">{otomatik.ornek.baslik}</p>
          <p className="text-ink">{otomatik.ornek.uzunBaslik}</p>
          <p className="text-ink-muted">{otomatik.ornek.aciklama}</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {o.metinlerUretilir}
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-ink-muted">
          {o.videoGelmedi}
        </p>
      )}

      {eksikVar && (
        <ul className="space-y-1">
          {otomatik.eksikler.map((e) => (
            <li key={e} className="text-xs font-medium text-danger-strong">
              {e}
            </li>
          ))}
        </ul>
      )}

      {eskiSecim && (
        <p className="text-[11px] text-ink-muted">
          {o.eskiSecimBas}
          <button
            type="button"
            onClick={onOtomatigeGec}
            className="font-medium text-brand-strong underline-offset-2 hover:underline"
          >
            {o.otomatigeGec}
          </button>
          {o.eskiSecimSon}
        </p>
      )}
    </section>
  );
}

function Satir({ etiket, deger, kaynak }: { etiket: string; deger: string | null; kaynak: string }) {
  return (
    <div className="min-w-0">
      <dt className="inline text-ink-muted">{etiket}: </dt>
      <dd className="inline">
        {deger && <span className="break-all font-medium text-ink">{deger} </span>}
        <span className="text-[11px] text-ink-muted">({kaynak})</span>
      </dd>
    </div>
  );
}

function Acik({
  enabled,
  setEnabled,
}: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const o = useSozluk(boostSozlugu).onAyar;
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="size-4"
      />
      <span className="text-sm text-ink">{o.acik}</span>
      {/* KAPALIYKEN KART ÜRETİLMİYOR — bu, ekranda yazılmazsa "neden kart
          gelmiyor" sorusunu doğuran sessiz bir ayar olurdu. */}
      <span className="text-[11px] text-ink-muted">
        {o.acikNot}
      </span>
    </label>
  );
}
