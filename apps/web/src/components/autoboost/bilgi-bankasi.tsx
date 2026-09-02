'use client';

import { useEffect, useState } from 'react';
import type {
  AssetListResult,
  AutoBoostPresetRecord,
  ConnectionSummary,
  GeoLocationOption,
  SavedAudienceList,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * BİLGİ BANKASI — otomatik boost ön ayarları.
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
 */
export function BilgiBankasi({
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
            locations: kitleId
              ? []
              : lokasyonlar.map((l) => ({ key: l.key, type: l.type })),
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

      <OnAyarHedefleme
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
  const [businessName, setBusinessName] = useState(s?.businessName ?? '');
  const [finalUrl, setFinalUrl] = useState(s?.finalUrl ?? '');
  const [headline, setHeadline] = useState(s?.headlines?.[0] ?? '');
  const [longHeadline, setLongHeadline] = useState(s?.longHeadlines?.[0] ?? '');
  const [description, setDescription] = useState(s?.descriptions?.[0] ?? '');
  const [logoAssetId, setLogoAssetId] = useState(s?.logoAssetId ?? '');

  const [gorseller, setGorseller] = useState<AssetListResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<AssetListResult>(`/assets?clientId=${clientId}&kind=image&limit=100`)
      .then(setGorseller)
      .catch(() => setGorseller(null));
  }, [clientId]);

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
          // GOOGLE'DA YALNIZCA GÜNLÜK. Toplam bütçe diye bir kip yok ve
          // seçenek göstermek, seçilemeyen bir seçenek göstermek olurdu.
          budget: { mode: 'daily', amount: amount.replace(',', '.'), durationDays: gun },
          settings: {
            platform: 'google',
            biddingStrategy: 'maximize_clicks',
            bidTargetMicros: null,
            finalUrl,
            businessName,
            logoAssetId,
            headlines: [headline],
            longHeadlines: [longHeadline],
            descriptions: [description],
            locations: [],
            ageRanges: [],
          },
        }),
      });
      setSonuc('Kaydedildi. Yeni videolar bu ayarlarla yayınlanacak.');
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-3">
      <Acik enabled={enabled} setEnabled={setEnabled} />

      <div className="grid gap-2 sm:grid-cols-2">
        <Alan etiket="Günlük bütçe (₺)" ipucu="Google'da toplam bütçe yok.">
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
        etiket="Marka adı"
        ipucu="Google zorunlu kılıyor — reklamda görünür. En fazla 25 karakter."
      >
        <input
          value={businessName}
          maxLength={25}
          onChange={(e) => setBusinessName(e.target.value)}
          className={input}
        />
      </Alan>

      <Alan
        etiket="Logo"
        ipucu="Google zorunlu kılıyor. Kare (1:1) ve en az 144×144 olmalı; Görsel Arşivi'nden seçiliyor."
      >
        <select
          value={logoAssetId}
          onChange={(e) => setLogoAssetId(e.target.value)}
          className={input}
        >
          <option value="">Seç…</option>
          {gorseller?.rows.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.width}×{g.height})
            </option>
          ))}
        </select>
        {gorseller && gorseller.rows.length === 0 && (
          <span className="mt-1 block text-[11px] text-danger">
            Görsel Arşivi'nde hiç görsel yok. Önce bir logo yükle.
          </span>
        )}
      </Alan>

      <Alan
        etiket="Hedef URL"
        ipucu="Videoyu izleyen kişi buraya gidiyor. Google'da 'sadece izletme' seçeneği yok."
      >
        <input
          value={finalUrl}
          onChange={(e) => setFinalUrl(e.target.value)}
          placeholder="https://..."
          className={input}
        />
      </Alan>

      <Alan etiket="Başlık" ipucu="En fazla 30 karakter.">
        <input
          value={headline}
          maxLength={30}
          onChange={(e) => setHeadline(e.target.value)}
          className={input}
        />
      </Alan>

      <Alan etiket="Uzun başlık" ipucu="En fazla 90 karakter.">
        <input
          value={longHeadline}
          maxLength={90}
          onChange={(e) => setLongHeadline(e.target.value)}
          className={input}
        />
      </Alan>

      <Alan etiket="Açıklama" ipucu="En fazla 90 karakter.">
        <input
          value={description}
          maxLength={90}
          onChange={(e) => setDescription(e.target.value)}
          className={input}
        />
      </Alan>

      {/*
        DURAKLATILMIŞ AÇILACAĞI BURADA DA YAZIYOR. Kullanıcı ön ayarı
        kaydederken "yayına girecek" beklentisi kuruyor; kartta söylemek geç
        kalıyor.
      */}
      <p className="rounded-lg border border-line bg-surface-sunken px-2.5 py-2 text-[11px] text-ink-muted">
        YouTube kampanyası <strong>duraklatılmış</strong> oluşturulur. Google
        yazma yolu bu üründe henüz canlıda doğrulanmadı; ilk kampanyaları Google
        Ads'te gözden geçirip elle yayına al.
      </p>

      <Kaydet busy={busy} hata={hata} sonuc={sonuc} canWrite={canWrite} onKaydet={() => void kaydet()} />
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

/**
 * ═══ ÖN AYAR HEDEFLEMESİ — ŞEHİR VE KAYITLI KİTLE ═══
 *
 * Bu blok uzun süre yoktu ve eksikliği somut: şema `locations` ile
 * `savedAudienceId`i baştan taşıyordu ama form ikisine de SABİT boş değer
 * yazıyordu. Kullanıcının tarifi "şehir seçimi ve reklam hesabındaki özel
 * hedef kitleyi seçebilmem lazım" oldu.
 *
 * REKLAM HESABI BURADA ÇÖZÜLÜYOR ve sebebi Meta'nın kendisi: KAYITLI KİTLE
 * REKLAM HESABI BAŞINA tanımlı. Ön ayar ise müşteri (workspace) bazında.
 * Hangi hesabın kitlelerinin listelendiği EKRANDA YAZIYOR — yazmasaydı,
 * iki hesaplı bir müşteride kullanıcı yanlış hesabın kitlesini seçip
 * yayında "kitle bulunamadı" hatası alırdı.
 */
function OnAyarHedefleme({
  clientId,
  lokasyonlar,
  setLokasyonlar,
  kitleId,
  setKitleId,
}: {
  clientId: string;
  lokasyonlar: GeoLocationOption[];
  setLokasyonlar: (v: GeoLocationOption[]) => void;
  kitleId: string | null;
  setKitleId: (v: string | null) => void;
}) {
  const [hesap, setHesap] = useState<{ id: string; name: string } | null>(null);
  const [hesapHata, setHesapHata] = useState<string | null>(null);
  const [kitleler, setKitleler] = useState<SavedAudienceList | null>(null);
  const [kitleHata, setKitleHata] = useState<string | null>(null);

  const [arama, setArama] = useState('');
  const [sonuc, setSonuc] = useState<GeoLocationOption[]>([]);
  const [aramaDurum, setAramaDurum] = useState<'bos' | 'kisa' | 'araniyor' | 'bitti'>('bos');
  const [aramaHata, setAramaHata] = useState<string | null>(null);

  /* Müşterinin İZLENEN Meta reklam hesabı — kitle ve lokasyon aramasının kaynağı. */
  useEffect(() => {
    void apiFetch<ConnectionSummary[]>('/connections')
      .then((baglantilar) => {
        const bulunan = baglantilar
          .flatMap((b) => b.adAccounts)
          .find((a) => a.platform === 'meta' && a.clientId === clientId && a.syncEnabled);
        setHesap(bulunan ? { id: bulunan.id, name: bulunan.name } : null);
        setHesapHata(null);
      })
      .catch((err: unknown) =>
        setHesapHata(
          err instanceof ApiRequestError ? err.message : 'Reklam hesabı okunamadı.',
        ),
      );
  }, [clientId]);

  /* Kayıtlı kitleler — HATA YUTULMUYOR (bkz. manual-boost'taki aynı ders). */
  useEffect(() => {
    if (!hesap) return;
    setKitleHata(null);
    void apiFetch<SavedAudienceList>(
      `/connections/targeting/saved-audiences?adAccountId=${hesap.id}`,
    )
      .then((k) => setKitleler(k))
      .catch((err: unknown) => {
        setKitleler(null);
        setKitleHata(
          err instanceof ApiRequestError ? err.message : 'Kayıtlı kitleler alınamadı.',
        );
      });
  }, [hesap]);

  /* Şehir araması — 350ms bekleme, en az iki harf. Her tuşa istek Meta kotasını yakar. */
  useEffect(() => {
    setAramaHata(null);
    if (!hesap) return;
    const q = arama.trim();
    if (q.length === 0) {
      setAramaDurum('bos');
      setSonuc([]);
      return;
    }
    if (q.length < 2) {
      setAramaDurum('kisa');
      setSonuc([]);
      return;
    }
    setAramaDurum('araniyor');
    const t = setTimeout(() => {
      void apiFetch<GeoLocationOption[]>(
        `/connections/targeting/locations?adAccountId=${hesap.id}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          setSonuc(r);
          setAramaDurum('bitti');
        })
        .catch((err: unknown) => {
          setSonuc([]);
          setAramaDurum('bitti');
          setAramaHata(
            err instanceof ApiRequestError ? err.message : 'Lokasyon araması düştü.',
          );
        });
    }, 350);
    return () => clearTimeout(t);
  }, [arama, hesap]);

  if (hesapHata !== null) {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
        Reklam hesabı okunamadı — {hesapHata}
      </p>
    );
  }

  if (hesap === null) {
    /*
     * HEDEFLEME KAPALI VE SEBEBİ YAZILI. Boş bir arama kutusu göstermek,
     * yazdıkça hiçbir şey gelmeyen bir alan bırakmak olurdu.
     */
    return (
      <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[11px] text-ink">
        Bu müşteriye izlenen bir Meta reklam hesabı atanmamış. Şehir ve kayıtlı
        kitle seçimi hesap atandıktan sonra açılıyor; şu hâliyle hedefleme{' '}
        <strong>Türkiye geneli</strong> olacak.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <p className="text-xs font-medium text-ink">Hedefleme</p>

      <label className="block">
        <span className="text-[11px] text-ink-muted">
          Kayıtlı kitle — <strong>{hesap.name}</strong> hesabından
        </span>
        <select
          value={kitleId ?? ''}
          onChange={(e) => setKitleId(e.target.value || null)}
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="">Kullanma — aşağıdan şehir seçeyim</option>
          {(kitleler?.items ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.approximateCount !== null ? ` · ~${k.approximateCount} kişi` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* ÜÇ HÂL AYRI: çağrı düştü · kitle yok · kitleler geldi. */}
      {kitleHata !== null && (
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-2 py-1 text-[11px] text-danger">
          Kayıtlı kitleler alınamadı — {kitleHata}
        </p>
      )}
      {kitleHata === null && kitleler && kitleler.items.length === 0 && (
        <p className="text-[11px] text-ink-muted">
          Bu hesapta kayıtlı kitle yok — aşağıdan şehir seçebilirsin.
        </p>
      )}

      {kitleId ? (
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
          Kayıtlı kitle seçili. Şehir, yaş ve cinsiyet <strong>kullanılmıyor</strong> —
          hedeflemeyi kitlenin kendi tanımı belirliyor.
        </p>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] text-ink-muted">Şehir / bölge ekle</span>
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="İzmir"
              className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          {aramaDurum === 'kisa' && (
            <p className="text-[11px] text-ink-muted">En az iki harf yaz.</p>
          )}
          {aramaDurum === 'araniyor' && (
            <p className="text-[11px] text-ink-muted">Aranıyor…</p>
          )}
          {aramaHata !== null && (
            <p className="rounded-lg border border-danger/40 bg-danger/5 px-2 py-1 text-[11px] text-danger">
              {aramaHata}
            </p>
          )}
          {aramaDurum === 'bitti' && aramaHata === null && sonuc.length === 0 && (
            <p className="text-[11px] text-ink-muted">Sonuç yok.</p>
          )}

          {sonuc.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {sonuc.map((o) => (
                <li key={`${o.type}:${o.key}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!lokasyonlar.some((l) => l.key === o.key && l.type === o.type)) {
                        setLokasyonlar([...lokasyonlar, o]);
                      }
                      setArama('');
                    }}
                    className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-surface-muted"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lokasyonlar.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lokasyonlar.map((l) => (
                <span
                  key={`${l.type}:${l.key}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px]"
                >
                  {l.label}
                  <button
                    type="button"
                    onClick={() =>
                      setLokasyonlar(
                        lokasyonlar.filter((x) => !(x.key === l.key && x.type === l.type)),
                      )
                    }
                    className="text-ink-muted hover:text-danger"
                    aria-label="Kaldır"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-ink-muted">
            {lokasyonlar.length === 0
              ? 'Şehir seçilmezse hedefleme Türkiye geneli olur.'
              : 'Seçilen yerler BİRLEŞİM olarak uygulanıyor; ülke geneli ayrıca gönderilmiyor.'}
          </p>
        </>
      )}
    </div>
  );
}
