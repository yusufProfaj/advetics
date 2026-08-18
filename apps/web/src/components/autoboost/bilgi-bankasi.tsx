'use client';

import { useEffect, useState } from 'react';
import type { AssetListResult, AutoBoostPresetRecord } from '@advetics/shared';
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
            savedAudienceId: null,
            // LOKASYON BU EKRANDA SORULMUYOR: boş bırakmak "ülke geneli"
            // demek ve Meta kovaları BİRLEŞİM olarak uyguladığı için karışık
            // bir varsayılan sessizce yanlış kitleye harcatırdı.
            locations: [],
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

      <p className="text-[11px] text-ink-muted">
        Hedefleme <strong>Türkiye geneli</strong>. Lokasyon daraltmak
        istiyorsan gönderiyi elle öne çıkar — Meta lokasyon kovalarını birleşim
        olarak uyguluyor ve karışık bir varsayılan sessizce yanlış kitleye
        harcatır.
      </p>

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
