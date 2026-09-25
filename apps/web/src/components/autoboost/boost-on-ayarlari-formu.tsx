'use client';

import { hedeflemeLokasyonu } from '@advetics/shared';
import { useEffect, useState } from 'react';
import type {
  AutoBoostPresetRecord,
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
        setHata(err instanceof ApiRequestError ? err.message : 'Ön ayarlar yüklenemedi.'),
      );
  }, [clientId]);

  const mevcut = presets?.find((p) => p.platform === sekme) ?? null;

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-4">
      <header className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">Otomatik boost ön ayarları</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Kart onaylandığında bu ayarlarla yayınlanır. Ön ayar yoksa kart
          onaylanamaz.
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
      {!presets && !hata && <p className="text-xs text-ink-muted">Yükleniyor…</p>}

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
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand';

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
  return (
    <div className="space-y-2">
      {hata && <p className="max-w-lg text-xs text-danger">{hata}</p>}
      {sonuc && <p className="max-w-lg text-xs text-ink">{sonuc}</p>}
      <button
        type="button"
        onClick={onKaydet}
        disabled={busy || !canWrite}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        title={canWrite ? undefined : 'Ön ayar yazma yetkin yok'}
      >
        {busy ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
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
  const [lokasyonlar, setLokasyonlar] = useState<GeoLocationOption[]>(
    (s?.locations ?? []).map((l) => ({
      key: l.key,
      type: l.type,
      name: l.key,
      label: l.key,
      countryCode: null,
    })) as GeoLocationOption[],
  );
  const [kitleId, setKitleId] = useState<string | null>(s?.savedAudienceId ?? null);

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
          },
        }),
      });
      setSonuc('Kaydedildi. Yeni Instagram gönderileri bu ayarlarla yayınlanacak.');
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-3">
      <Acik enabled={enabled} setEnabled={setEnabled} />

      <div className="grid gap-2 sm:grid-cols-3">
        <Alan etiket="Bütçe kipi">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'daily' | 'lifetime')}
            className={input}
          >
            <option value="lifetime">Toplam</option>
            <option value="daily">Günlük</option>
          </select>
        </Alan>
        <Alan etiket="Tutar (₺)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
        </Alan>
        <Alan etiket="Süre (gün)">
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

      <Alan
        etiket="Amaç"
        ipucu="Etkileşim: beğeni ve yorum. Erişim: en çok kişiye ulaşmak."
      >
        <select
          value={goal}
          onChange={(e) => setGoal(e.target.value as typeof goal)}
          className={input}
        >
          <option value="engagement">Etkileşim</option>
          <option value="reach">Erişim</option>
          <option value="profile_visits">Profil ziyareti</option>
        </select>
      </Alan>

      <div className="grid gap-2 sm:grid-cols-3">
        <Alan etiket="Yaş (alt)">
          <input
            type="number"
            min={13}
            max={65}
            value={yasMin}
            onChange={(e) => setYasMin(Number(e.target.value))}
            className={input}
          />
        </Alan>
        <Alan etiket="Yaş (üst)">
          <input
            type="number"
            min={13}
            max={65}
            value={yasMax}
            onChange={(e) => setYasMax(Number(e.target.value))}
            className={input}
          />
        </Alan>
        <Alan etiket="Cinsiyet">
          <select
            value={cinsiyet}
            onChange={(e) => setCinsiyet(e.target.value as typeof cinsiyet)}
            className={input}
          >
            <option value="all">Hepsi</option>
            <option value="female">Kadın</option>
            <option value="male">Erkek</option>
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
        setOtomatikHata(err instanceof ApiRequestError ? err.message : 'Otomatik bilgiler okunamadı.'),
      );
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
      setSonuc('Kaydedildi. Yeni videolar bu bütçe ve hedef kitleyle, kendi başlıklarıyla yayınlanacak.');
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Acik enabled={enabled} setEnabled={setEnabled} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Alan etiket="Günlük bütçe (₺)" ipucu="Google'da toplam bütçe yok.">
          <input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            className={input}
          />
        </Alan>
        <Alan etiket="Süre (gün)">
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
      <p className="rounded-lg bg-warn-soft px-2.5 py-2 text-[11px] text-warn-strong ring-1 ring-inset ring-warn/30">
        Kart onaylandığında kampanya <strong>yayına girer</strong> ve süre bitince
        durur. YouTube yayını ilk kez canlıda deneniyor: ilk denemeyi küçük bir
        bütçeyle yap. Erken durdurmak şimdilik Google Ads&apos;ten.
      </p>

      <Kaydet busy={busy} hata={hata} sonuc={sonuc} canWrite={canWrite} onKaydet={() => void kaydet()} />
    </div>
  );
}

const MARKA_KAYNAGI: Record<YoutubeOtomatikOnizleme['marka']['kaynak'], string> = {
  'on-ayar': 'Ön ayarda seçilmiş',
  workspace: 'Workspace adı',
  kanal: 'YouTube kanal adı',
  kisaltildi: 'Workspace adı, 25 karaktere kısaltıldı',
  yok: 'Bulunamadı',
};

const LOGO_KAYNAGI: Record<YoutubeOtomatikOnizleme['logo']['kaynak'], string> = {
  'on-ayar': 'Ön ayarda seçilmiş',
  'profil-logosu': 'Bilgi Bankası logosu',
  kanal: 'YouTube kanal görseli (ilk yayında arşive eklenir)',
  yok: 'Bulunamadı',
};

const URL_KAYNAGI: Record<YoutubeOtomatikOnizleme['url']['kaynak'], string> = {
  'on-ayar': 'Ön ayarda seçilmiş',
  workspace: 'Workspace web sitesi',
  yok: 'Bulunamadı',
};

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
  if (hata) {
    return (
      <p role="alert" className="text-xs text-danger">
        Otomatik bilgiler okunamadı: {hata}
      </p>
    );
  }
  if (!otomatik) return <p className="text-xs text-ink-muted">Otomatik bilgiler yükleniyor…</p>;

  const eksikVar = otomatik.eksikler.length > 0;
  return (
    <section
      className={`space-y-3 rounded-lg border px-3 py-3 ${
        eksikVar ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface-sunken'
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        Otomatik doldurulanlar
      </p>

      <div className="flex items-center gap-3">
        {otomatik.logo.onizleme ? (
          // KANAL GÖRSELİ HARİCİ BİR ADRES: Next görsel optimizasyonu
          // yapılandırılmamış bir ana makineyi reddederdi; düz <img> yeterli.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={otomatik.logo.onizleme}
            alt="Reklam logosu"
            className="size-12 shrink-0 rounded-lg border border-line bg-surface object-cover"
          />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-line text-[10px] text-ink-muted">
            logo yok
          </span>
        )}
        <dl className="min-w-0 space-y-1 text-xs">
          <Satir
            etiket="Marka adı"
            deger={otomatik.marka.deger}
            kaynak={MARKA_KAYNAGI[otomatik.marka.kaynak]}
          />
          <Satir etiket="Logo" deger={null} kaynak={LOGO_KAYNAGI[otomatik.logo.kaynak]} />
          <Satir
            etiket="Hedef adres"
            deger={otomatik.url.deger}
            kaynak={URL_KAYNAGI[otomatik.url.kaynak]}
          />
        </dl>
      </div>

      {otomatik.ornek ? (
        <div className="rounded-md bg-surface px-2.5 py-2 text-xs">
          <p className="text-[11px] text-ink-muted">
            Son videodan örnek: <span className="text-ink">{otomatik.ornek.videoBasligi}</span>
          </p>
          <p className="mt-1 font-semibold text-ink">{otomatik.ornek.baslik}</p>
          <p className="text-ink">{otomatik.ornek.uzunBaslik}</p>
          <p className="text-ink-muted">{otomatik.ornek.aciklama}</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Metinler her videonun kendi başlığından üretilir; açıklama yayın anında
            videonun açıklamasından alınır.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-ink-muted">
          Henüz video gelmedi. Metinler her videonun kendi başlığından üretilecek.
        </p>
      )}

      {eksikVar && (
        <ul className="space-y-1">
          {otomatik.eksikler.map((e) => (
            <li key={e} className="text-xs font-medium text-warn-strong">
              {e}
            </li>
          ))}
        </ul>
      )}

      {eskiSecim && (
        <p className="text-[11px] text-ink-muted">
          Bu ön ayarda daha önce elle seçilmiş değerler var.{' '}
          <button
            type="button"
            onClick={onOtomatigeGec}
            className="font-medium text-brand-strong underline-offset-2 hover:underline"
          >
            Otomatiğe geç
          </button>{' '}
          (kaydedince uygulanır)
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
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="size-4"
      />
      <span className="text-sm text-ink">Otomatik boost açık</span>
      {/* KAPALIYKEN KART ÜRETİLMİYOR — bu, ekranda yazılmazsa "neden kart
          gelmiyor" sorusunu doğuran sessiz bir ayar olurdu. */}
      <span className="text-[11px] text-ink-muted">
        (kapalıyken yeni içerik için kart oluşmaz)
      </span>
    </label>
  );
}
