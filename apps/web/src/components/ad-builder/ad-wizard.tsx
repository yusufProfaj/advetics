'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  AD_TEXT_FIELDS,
  ASSET_RATIOS,
  CAMPAIGN_GOALS,
  GOAL_META,
  RATIO_META,
  type AdAssetRecord,
  type AdDraftRecord,
  type AssetRatio,
  type CampaignGoal,
  type AdvancedSettings,
  type CampaignMode,
  type LeadFormRecord,
  type PublishCheck,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { advancedDefaultsFor } from '@advetics/shared';
import { AdvancedPanel } from './advanced-panel';
import { CoveragePanel } from './coverage-panel';

/**
 * Reklam oluşturma sihirbazı.
 *
 * TASARIM İLKESİ: her adımda kullanıcıya YALNIZCA kendi işi hakkında bildiği
 * bir şey soruluyor. Hedef, optimizasyon, yerleşim, teklif stratejisi —
 * hiçbiri burada yok ve olmayacak. Bunlar sunucuda `goal-mapping.ts` içinde
 * karara bağlanıyor.
 *
 * ADIMLAR AYRI EKRAN DEĞİL, tek sayfada sıralı bloklar. Sihirbaz adımları
 * arasında ileri-geri gitmek, kullanıcının ne yazdığını unutmasına yol
 * açıyor; tek sayfada her şey görünür kalıyor ve yukarı kaydırıp
 * düzeltilebiliyor.
 */
export function AdWizard({
  clientId,
  accounts,
  pages,
  forms,
  existing,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  pages: Array<{ id: string; name: string }>;
  /** Kütüphanedeki anlık formlar — yalnızca gelişmiş modda kullanılıyor. */
  forms: LeadFormRecord[];
  existing?: AdDraftRecord;
}) {
  const router = useRouter();

  const [goal, setGoal] = useState<CampaignGoal | null>(existing?.goal ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [adAccountId, setAdAccountId] = useState(existing?.adAccountId ?? accounts[0]?.id ?? '');
  const [pageId, setPageId] = useState(existing?.socialProfileId ?? pages[0]?.id ?? '');
  const [primaryText, setPrimaryText] = useState(existing?.primaryText ?? '');
  const [headline, setHeadline] = useState(existing?.headline ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [linkUrl, setLinkUrl] = useState(existing?.linkUrl ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(existing?.whatsappNumber ?? '');
  const [dailyBudget, setDailyBudget] = useState(
    existing ? String(BigInt(existing.dailyBudgetMicros) / 1_000_000n) : '200',
  );
  const [durationDays, setDurationDays] = useState(String(existing?.durationDays ?? 7));

  const [mode, setMode] = useState<CampaignMode>(existing?.mode ?? 'simple');
  const [advanced, setAdvanced] = useState<AdvancedSettings | null>(existing?.advanced ?? null);
  const [leadFormId, setLeadFormId] = useState<string | null>(existing?.leadFormId ?? null);

  const [draftId, setDraftId] = useState(existing?.id ?? null);
  const [assets, setAssets] = useState<AdAssetRecord[]>(existing?.assets ?? []);
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(existing?.status === 'published');

  const currency = accounts.find((a) => a.id === adAccountId)?.currency ?? 'TRY';

  function body() {
    return {
      clientId,
      adAccountId,
      socialProfileId: pageId,
      goal,
      name: name.trim(),
      primaryText: primaryText.trim(),
      headline: headline.trim() || undefined,
      description: description.trim() || undefined,
      linkUrl: linkUrl.trim() || undefined,
      whatsappNumber: whatsappNumber.trim() || undefined,
      dailyBudget: dailyBudget.trim(),
      durationDays: Number(durationDays),
      mode,
      advanced: advanced ?? undefined,
      leadFormId: leadFormId ?? undefined,
    };
  }

  /**
   * Gelişmiş moda geçiş — HIZLI MODUN KARARLARIYLA DOLU BAŞLIYOR.
   *
   * Boş bir ekran, kullanıcıyı sıfırdan kurmaya zorlar ve daha önemlisi:
   * bizim onun adına ne seçtiğimizi hiç göstermez. Dolu başlamak hem
   * başlangıç noktası veriyor hem de "biz bunu seçmiştik" diyor.
   */
  function switchMode(next: CampaignMode): void {
    if (next === 'advanced' && !advanced && goal) {
      setAdvanced(advancedDefaultsFor(goal));
    }
    setMode(next);
    setCheck(null);
  }

  /**
   * Taslağı kaydeder ve kimliğini döner.
   *
   * GÖRSEL YÜKLEMEK İÇİN ÖNCE TASLAK GEREKİYOR: dosya bir taslağa bağlanıyor.
   * Bu yüzden kullanıcı görsel bırakmadan önce taslak sessizce kaydediliyor.
   */
  async function ensureDraft(): Promise<string> {
    const payload = body();
    if (draftId) {
      await apiFetch(`/ad-drafts/${draftId}`, { method: 'PUT', body: JSON.stringify(payload) });
      return draftId;
    }
    const created = await apiFetch<AdDraftRecord>('/ad-drafts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setDraftId(created.id);
    return created.id;
  }

  async function upload(file: File): Promise<void> {
    setBusy('upload');
    setError(null);
    try {
      const id = await ensureDraft();
      const form = new FormData();
      form.append('file', file);

      // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch.
      // Content-Type ELLE VERİLMİYOR: tarayıcı boundary'yi kendisi ekliyor
      // ve elle vermek onu bozar.
      const res = await fetch(`${API_URL}/ad-drafts/${id}/assets`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(b?.message ?? 'Görsel yüklenemedi');
      }
      const asset = (await res.json()) as AdAssetRecord;
      setAssets((prev) => [...prev.filter((a) => a.ratio !== asset.ratio), asset]);
      setCheck(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görsel yüklenemedi');
    } finally {
      setBusy(null);
    }
  }

  async function removeAsset(asset: AdAssetRecord): Promise<void> {
    if (!draftId) return;
    setBusy('upload');
    try {
      await apiFetch(`/ad-drafts/${draftId}/assets/${asset.id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setCheck(null);
    } finally {
      setBusy(null);
    }
  }

  async function runCheck(): Promise<void> {
    setBusy('check');
    setError(null);
    try {
      const id = await ensureDraft();
      setCheck(await apiFetch<PublishCheck>(`/ad-drafts/${id}/check`));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kontrol yapılamadı');
    } finally {
      setBusy(null);
    }
  }

  async function publish(): Promise<void> {
    if (!draftId) return;
    setBusy('publish');
    setError(null);
    try {
      await apiFetch(`/ad-drafts/${draftId}/publish`, { method: 'POST' });
      setPublished(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Reklam yayınlanamadı');
    } finally {
      setBusy(null);
    }
  }

  if (published) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-sm font-semibold text-emerald-900">Reklamın yayında</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-emerald-800">
          Meta reklamı onaylayana kadar birkaç saat geçebilir. Onaylandığında yayına girer ve
          harcamaya başlar. Sonuçları <strong>Genel Bakış</strong> ekranından izleyebilirsin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Ne yapmak istiyorsun */}
      <Step no={1} title="Ne yapmak istiyorsun?">
        <div className="grid gap-2 sm:grid-cols-3">
          {CAMPAIGN_GOALS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGoal(g)}
              className={`rounded-xl border p-3 text-left transition ${
                goal === g
                  ? 'border-brand bg-brand-soft'
                  : 'border-line hover:bg-surface-sunken'
              }`}
            >
              <span className="block text-sm font-semibold text-ink">{GOAL_META[g].label}</span>
              <span className="mt-1 block text-xs text-ink-muted">{GOAL_META[g].promise}</span>
              <span className="mt-1.5 block text-[11px] text-ink-muted">
                {GOAL_META[g].hint}
              </span>
            </button>
          ))}
        </div>
      </Step>

      {goal && (
        <>
          {/* 2. Kampanya adı ve hesap */}
          <Step no={2} title="Kampanyaya bir ad ver">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kampanya adı" hint="Yalnızca sen göreceksin, müşteriler görmez.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ağustos — Teklif Kampanyası"
                  className={input}
                />
              </Field>
              <Field label="Reklam hesabı">
                <select
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  className={input}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Hangi sayfa adına yayınlansın">
                <select
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  className={input}
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              {goal === 'website' && (
                <Field label="Web sitesi adresi">
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://siteniz.com/urun"
                    className={input}
                  />
                </Field>
              )}
              {goal === 'whatsapp' && (
                <Field
                  label="WhatsApp numarası (opsiyonel)"
                  hint="Boş bırakırsan sayfaya bağlı numara kullanılır."
                >
                  <input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="905551112233"
                    className={input}
                  />
                </Field>
              )}
            </div>
          </Step>

          {/* 3. Görseller */}
          <Step
            no={3}
            title="Görselleri seç"
            subtitle="Bilgisayarından seç, biz doğru yere yerleştiririz."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {ASSET_RATIOS.map((ratio) => (
                <DropZone
                  key={ratio}
                  ratio={ratio}
                  asset={assets.find((a) => a.ratio === ratio)}
                  draftId={draftId}
                  busy={busy === 'upload'}
                  onPick={upload}
                  onRemove={removeAsset}
                />
              ))}
            </div>
          </Step>

          {/* 4. Metinler */}
          <Step no={4} title="Ne yazalım?">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <TextField
                  label={AD_TEXT_FIELDS.primaryText.label}
                  hint="Reklamın üstünde görünen ana metin."
                  value={primaryText}
                  onChange={setPrimaryText}
                  limit={AD_TEXT_FIELDS.primaryText}
                  rows={4}
                />
                <TextField
                  label={AD_TEXT_FIELDS.headline.label}
                  hint="Görselin altında kalın yazıyla görünür."
                  value={headline}
                  onChange={setHeadline}
                  limit={AD_TEXT_FIELDS.headline}
                />
                <TextField
                  label={AD_TEXT_FIELDS.description.label}
                  hint="Başlığın altında küçük yazı. Boş bırakılabilir."
                  value={description}
                  onChange={setDescription}
                  limit={AD_TEXT_FIELDS.description}
                />
              </div>

              <Preview
                pageName={pages.find((p) => p.id === pageId)?.name ?? 'Sayfan'}
                primaryText={primaryText}
                headline={headline}
                description={description}
                goal={goal}
                asset={assets.find((a) => a.ratio === 'square')}
                draftId={draftId}
              />
            </div>
          </Step>

          {/* 5. Bütçe */}
          <Step no={5} title="Günde ne kadar harcayalım?">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Günlük bütçe (${currency})`}>
                <input
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  inputMode="decimal"
                  className={input}
                />
              </Field>
              <Field
                label="Kaç gün yayında kalsın"
                hint="0 yazarsan süresiz olur ve sen durdurana kadar harcar."
              >
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className={input}
                />
              </Field>
            </div>
          </Step>

          {/* MOD SEÇİCİ.
              Bütçeden SONRA, son kontrolden ÖNCE. Sebebi sıralama değil
              psikoloji: en başta sorulsaydı, reklamcılık bilmeyen kullanıcı
              "gelişmiş" seçeneğini görüp kendini yetersiz hissederdi. Burada
              ise her şey zaten hazır ve gelişmiş mod bir EK, bir ön koşul
              değil. */}
          <Step no={6} title="Ayarlar">
            <div className="flex flex-wrap gap-2">
              {(['simple', 'advanced'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    mode === m ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken'
                  }`}
                >
                  <span className="block text-sm font-medium text-ink">
                    {m === 'simple' ? 'Bizim önerdiğimiz ayarlar' : 'Gelişmiş — ayarları ben seçeyim'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted">
                    {m === 'simple'
                      ? 'Hedef, optimizasyon, kitle ve yerleşimi biz belirleriz.'
                      : 'Hedef, teklif, kitle ve yerleşim üzerinde tam kontrol.'}
                  </span>
                </button>
              ))}
            </div>

            {mode === 'simple' && (
              // HIZLI MODDA NE SEÇTİĞİMİZİ SÖYLÜYORUZ. "Biz hallederiz" demek
              // yeterli değil: kullanıcı neyin kararını devrettiğini bilmeli
              // ve gerekirse geri alabilmeli.
              <p className="mt-3 text-xs text-ink-muted">
                {campaignExplanation(goal)}
              </p>
            )}

            {mode === 'advanced' && advanced && (
              <div className="mt-4">
                <AdvancedPanel
                  value={advanced}
                  onChange={setAdvanced}
                  currency={currency}
                  forms={forms}
                  leadFormId={leadFormId}
                  onLeadFormChange={setLeadFormId}
                />
              </div>
            )}
          </Step>

          {/* 7. Kontrol ve yayın */}
          <Step no={7} title="Son kontrol">
            {check === null ? (
              <button
                type="button"
                onClick={runCheck}
                disabled={busy !== null || !name.trim() || !primaryText.trim()}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
              >
                {busy === 'check' ? 'Kontrol ediliyor…' : 'Kontrol et'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink">
                  {check.summary}
                </p>

                {/* KAPSAMA ENGELLERİN ÜSTÜNDE.
                    Engel metinleri "Yatay yerleşim için uygun görsel yok"
                    diyor; hangi yuvanın boş olduğunu görmeden bu cümle soyut
                    kalıyor. Tablo önce, açıklama sonra. */}
                {check.assetCoverage && <CoveragePanel coverage={check.assetCoverage} />}

                {check.blockers.map((b) => (
                  <p
                    key={b}
                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200"
                  >
                    {b}
                  </p>
                ))}
                {check.warnings.map((w) => (
                  <p
                    key={w}
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-200"
                  >
                    {w}
                  </p>
                ))}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={publish}
                    disabled={!check.ok || busy !== null}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {busy === 'publish' ? 'Yayınlanıyor…' : 'Yayınla'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheck(null)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Düzenlemeye dön
                  </button>
                </div>
              </div>
            )}
          </Step>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Görsel bırakma alanı.
 *
 * ORAN GÖRSEL OLARAK gösteriliyor: "1080×1080" yazmak yerine kutunun kendisi
 * o oranda. Kullanıcı hangi görselin nereye gideceğini bakarak anlıyor.
 */
function DropZone({
  ratio,
  asset,
  draftId,
  busy,
  onPick,
  onRemove,
}: {
  ratio: AssetRatio;
  asset: AdAssetRecord | undefined;
  draftId: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: (asset: AdAssetRecord) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const meta = RATIO_META[ratio];

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink">
          {meta.label}
          {meta.required && <span className="ml-1 text-rose-600">*</span>}
        </span>
        <span className="text-[11px] text-ink-muted">{meta.recommended}</span>
      </div>

      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="relative flex w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-line bg-surface-sunken transition hover:border-brand disabled:opacity-50"
        style={{ aspectRatio: String(meta.aspect) }}
      >
        {asset && draftId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_URL}/ad-drafts/${draftId}/assets/${asset.id}/preview`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="px-2 text-center text-[11px] text-ink-muted">
            {busy ? 'Yükleniyor…' : 'Görsel seç'}
          </span>
        )}
      </button>

      <p className="mt-1 text-[11px] text-ink-muted">{meta.shownAt}</p>

      {asset && (
        <button
          type="button"
          onClick={() => onRemove(asset)}
          className="mt-0.5 text-[11px] text-rose-700 hover:underline"
        >
          Kaldır ({asset.width}×{asset.height})
        </button>
      )}

      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          // Aynı dosyayı tekrar seçebilmek için sıfırlanıyor: input aynı
          // değerde change olayı üretmiyor.
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Karakter sayacı KIRPILMA sınırına göre, teknik sınıra göre değil. */
function TextField({
  label,
  hint,
  value,
  onChange,
  limit,
  rows,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  limit: { soft: number; hard: number };
  rows?: number;
}) {
  const over = value.length > limit.soft;
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {label}
        </span>
        <span className={`text-[11px] ${over ? 'text-amber-700' : 'text-ink-muted'}`}>
          {value.length}/{limit.soft}
        </span>
      </span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, limit.hard))}
          rows={rows}
          className={input}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, limit.hard))}
          className={input}
        />
      )}
      <span className="mt-0.5 block text-[11px] text-ink-muted">
        {over ? `${limit.soft} karakterden sonrası akışta kısaltılır.` : hint}
      </span>
    </label>
  );
}

/**
 * Reklam önizlemesi.
 *
 * GERÇEK REKLAM DEĞİL, yaklaşık bir temsil. Meta'nın kendi önizleme uç
 * noktası var ama o yayınlanmış bir kreatif istiyor — yani ancak reklam
 * oluşturulduktan sonra çalışıyor ve burada geç kalıyor.
 */
function Preview({
  pageName,
  primaryText,
  headline,
  description,
  goal,
  asset,
  draftId,
}: {
  pageName: string;
  primaryText: string;
  headline: string;
  description: string;
  goal: CampaignGoal;
  asset: AdAssetRecord | undefined;
  draftId: string | null;
}) {
  const cta =
    goal === 'whatsapp' ? 'WhatsApp’tan Mesaj Gönder' : goal === 'form' ? 'Kaydol' : 'Daha Fazla Bilgi';

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        Önizleme
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center gap-2 p-3">
          <span className="h-8 w-8 shrink-0 rounded-full bg-surface-sunken" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{pageName}</p>
            <p className="text-[10px] text-ink-muted">Sponsorlu</p>
          </div>
        </div>

        <p className="whitespace-pre-wrap px-3 pb-2 text-xs text-ink">
          {primaryText || 'Ana metin burada görünecek.'}
        </p>

        <div className="aspect-square w-full bg-surface-sunken">
          {asset && draftId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${API_URL}/ad-drafts/${draftId}/assets/${asset.id}/preview`}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 bg-surface-sunken p-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">
              {headline || 'Başlık'}
            </p>
            {description && (
              <p className="truncate text-[11px] text-ink-muted">{description}</p>
            )}
          </div>
          <span className="shrink-0 rounded bg-surface px-2 py-1 text-[10px] font-medium text-ink ring-1 ring-line">
            {cta}
          </span>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Yaklaşık görünüm. Gerçek reklam yerleşime göre biraz farklı olabilir.
      </p>
    </div>
  );
}

function Step({
  no,
  title,
  subtitle,
  children,
}: {
  no: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
          {no}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-ink-muted">{hint}</span>}
    </label>
  );
}

const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';

/**
 * Hızlı modda bizim verdiğimiz kararların düz Türkçe özeti.
 *
 * `GOAL_META[goal].promise` kullanıcının ne ELDE EDECEĞİNİ söylüyor; bu ise
 * bizim onun adına NE SEÇTİĞİMİZİ. İkisi farklı sorular ve ikincisi gelişmiş
 * moda geçme kararını verirken gereken bilgi.
 */
function campaignExplanation(goal: CampaignGoal): string {
  const common =
    'Kitle: Türkiye, 18+, daraltma yok. Yerleşim: yüklediğin görsel oranlarına göre. ' +
    'Teklif: en düşük maliyet.';
  switch (goal) {
    case 'form':
      return `Hedef: potansiyel müşteri, form dolduranlara göre optimize. ${common}`;
    case 'whatsapp':
      return `Hedef: potansiyel müşteri, mesaj yazanlara göre optimize. ${common}`;
    case 'website':
      return `Hedef: trafik, sayfayı gerçekten açanlara göre optimize. ${common}`;
  }
}
