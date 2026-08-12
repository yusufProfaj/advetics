'use client';

import {
  BID_STRATEGIES,
  BID_STRATEGY_META,
  FB_POSITIONS,
  GENDERS,
  IG_POSITIONS,
  OBJECTIVES,
  type AdvancedSettings,
  type BidStrategy,
  type GenderTarget,
  type LeadFormRecord,
  type Objective,
  type OptimizationGoal,
} from '@advetics/shared';

/**
 * Gelişmiş kampanya ayarları.
 *
 * BU PANEL UZMAN İÇİN ama uzman da her şeyi ezbere bilmiyor. Her seçimin
 * yanında NE İŞE YARADIĞI ve NEYİ FEDA ETTİĞİ yazıyor — Meta'nın kendi
 * arayüzünde olmayan şey bu.
 *
 * UYUMSUZ SEÇİM SEÇİLEMİYOR, sonradan uyarılmıyor. Optimizasyon listesi
 * seçilen hedefe göre daralıyor; uyumsuz kombinasyon Meta tarafından bazen
 * kabul ediliyor ve reklam hiç gösterilmiyor — sonradan uyarmak, kullanıcının
 * o hatayı yapmasına izin vermek demek.
 *
 * Bu dosyadaki listeler `objective-matrix.ts` ile AYNI OLMAK ZORUNDA. Sunucu
 * son söz sahibi; buradaki daraltma yalnızca kullanıcıyı çıkmaza sokmamak
 * için. İkisi ayrışırsa sunucu reddeder ve kullanıcı sebebini anlamaz.
 */

const OBJECTIVE_UI: Record<
  Objective,
  { label: string; purpose: string; goals: readonly OptimizationGoal[] }
> = {
  OUTCOME_LEADS: {
    label: 'Potansiyel müşteri',
    purpose: 'İletişim bilgisi toplamak — form, WhatsApp ya da mesaj.',
    goals: ['LEAD_GENERATION', 'QUALITY_LEAD', 'CONVERSATIONS', 'OFFSITE_CONVERSIONS', 'LINK_CLICKS'],
  },
  OUTCOME_TRAFFIC: {
    label: 'Trafik',
    purpose: 'İnsanları web sitene göndermek.',
    goals: ['LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'REACH', 'IMPRESSIONS'],
  },
  OUTCOME_ENGAGEMENT: {
    label: 'Etkileşim',
    purpose: 'Gönderiye tepki, yorum, paylaşım ya da video izlenmesi.',
    goals: ['POST_ENGAGEMENT', 'THRUPLAY', 'REACH', 'IMPRESSIONS', 'CONVERSATIONS'],
  },
  OUTCOME_AWARENESS: {
    label: 'Bilinirlik',
    purpose: 'Mümkün olduğunca çok kişiye ulaşmak.',
    goals: ['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT', 'THRUPLAY'],
  },
  OUTCOME_SALES: {
    label: 'Satış',
    purpose: 'Sitende satın alma ya da tanımlı bir dönüşüm.',
    goals: ['OFFSITE_CONVERSIONS', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS'],
  },
};

const GOAL_LABELS: Record<OptimizationGoal, string> = {
  LEAD_GENERATION: 'Form dolduranlar',
  QUALITY_LEAD: 'Nitelikli form dolduranlar',
  CONVERSATIONS: 'Mesaj yazanlar',
  OFFSITE_CONVERSIONS: 'Sitende dönüşüm yapanlar',
  LANDING_PAGE_VIEWS: 'Sayfayı gerçekten açanlar',
  LINK_CLICKS: 'Tıklayanlar',
  POST_ENGAGEMENT: 'Gönderiyle etkileşenler',
  THRUPLAY: 'Videoyu izleyenler',
  REACH: 'Ulaşılan kişi sayısı',
  IMPRESSIONS: 'Gösterim sayısı',
  AD_RECALL_LIFT: 'Reklamı hatırlayanlar',
};

const POSITION_LABELS: Record<string, string> = {
  feed: 'Akış',
  story: 'Hikâyeler',
  facebook_reels: 'Facebook Reels',
  video_feeds: 'Video akışı',
  right_hand_column: 'Sağ sütun',
  marketplace: 'Marketplace',
  search: 'Arama',
  stream: 'Akış',
  reels: 'Reels',
  explore: 'Keşfet',
};

const GENDER_LABELS: Record<GenderTarget, string> = {
  all: 'Hepsi',
  male: 'Erkek',
  female: 'Kadın',
};

export function AdvancedPanel({
  value,
  onChange,
  currency,
  forms,
  leadFormId,
  onLeadFormChange,
}: {
  value: AdvancedSettings;
  onChange: (next: AdvancedSettings) => void;
  currency: string;
  forms: LeadFormRecord[];
  leadFormId: string | null;
  onLeadFormChange: (id: string | null) => void;
}) {
  const ui = OBJECTIVE_UI[value.objective];
  const capped =
    value.bidStrategy === 'COST_CAP' || value.bidStrategy === 'LOWEST_COST_WITH_BID_CAP';
  const needsForm =
    (value.optimizationGoal === 'LEAD_GENERATION' ||
      value.optimizationGoal === 'QUALITY_LEAD') &&
    value.destinationType === 'ON_AD';
  const needsPixel = value.optimizationGoal === 'OFFSITE_CONVERSIONS';

  function set(patch: Partial<AdvancedSettings>): void {
    onChange({ ...value, ...patch });
  }

  /**
   * Hedef değişince optimizasyon SIFIRLANIYOR.
   *
   * Eski optimizasyon yeni hedefle uyumsuz kalabilir ve o kombinasyon
   * Meta'da bazen kabul edilip hiç dağıtım yapmıyor. Kullanıcının bunu fark
   * etmesini beklemek yerine, yeni hedefin ilk geçerli optimizasyonuna
   * düşüyoruz.
   */
  function setObjective(o: Objective): void {
    const next = OBJECTIVE_UI[o];
    const keep = next.goals.includes(value.optimizationGoal)
      ? value.optimizationGoal
      : next.goals[0]!;
    set({
      objective: o,
      optimizationGoal: keep,
      // Faturalama da sıfırlanıyor: çoğu optimizasyon yalnızca IMPRESSIONS
      // kabul ediyor ve kalan bir LINK_CLICKS değeri sunucuda engellenirdi.
      billingEvent: 'IMPRESSIONS',
    });
  }

  return (
    <div className="space-y-4">
      {/* --- Hedef --- */}
      <Block title="Kampanya hedefi" hint="Meta'nın neyi optimize edeceğini bu belirliyor.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OBJECTIVES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setObjective(o)}
              className={`rounded-lg border p-2.5 text-left transition ${
                value.objective === o
                  ? 'border-brand bg-brand-soft'
                  : 'border-line hover:bg-surface-sunken'
              }`}
            >
              <span className="block text-sm font-medium text-ink">
                {OBJECTIVE_UI[o].label}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-muted">
                {OBJECTIVE_UI[o].purpose}
              </span>
            </button>
          ))}
        </div>
      </Block>

      {/* --- Optimizasyon --- */}
      <Block
        title="Neyi optimize edelim"
        hint="Meta bu sonucu en ucuza getirmeye çalışır. Yanlış seçim, doğru sayıyı yanlış kişilerde arar."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {/* LİSTE HEDEFE GÖRE DARALIYOR — uyumsuz seçenek hiç görünmüyor. */}
          {ui.goals.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => set({ optimizationGoal: g, billingEvent: 'IMPRESSIONS' })}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                value.optimizationGoal === g
                  ? 'border-brand bg-brand-soft text-ink'
                  : 'border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {GOAL_LABELS[g]}
            </button>
          ))}
        </div>

        {needsForm && (
          <div className="mt-3">
            <Field label="Hangi form">
              <select
                value={leadFormId ?? ''}
                onChange={(e) => onLeadFormChange(e.target.value || null)}
                className={inputCls}
              >
                <option value="">— seç —</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id} disabled={f.status !== 'published'}>
                    {f.name}
                    {f.status !== 'published' && ' (yayınlanmamış)'}
                  </option>
                ))}
              </select>
            </Field>
            {/* YAYINLANMAMIŞ FORM SEÇİLEMİYOR ve sebebi yazıyor: Meta'da var
                olmayan bir forma referans veren kreatif reddediliyor. */}
            <p className="mt-1 text-[11px] text-ink-muted">
              Yalnızca Meta'da yayınlanmış formlar kullanılabilir.{' '}
              {forms.length === 0 && 'Henüz form yok — Kütüphane > Formlar bölümünden oluştur.'}
            </p>
          </div>
        )}

        {needsPixel && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Piksel kimliği" hint="Pikselsiz dönüşüm optimizasyonu hiç öğrenmez.">
              <input
                value={value.pixelId ?? ''}
                onChange={(e) => set({ pixelId: e.target.value || undefined })}
                className={inputCls}
                placeholder="1234567890"
              />
            </Field>
            <Field label="Dönüşüm olayı">
              <input
                value={value.conversionEvent ?? ''}
                onChange={(e) => set({ conversionEvent: e.target.value || undefined })}
                className={inputCls}
                placeholder="PURCHASE"
              />
            </Field>
          </div>
        )}
      </Block>

      {/* --- Bütçe ve teklif --- */}
      <Block title="Bütçe ve teklif">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Bütçe tipi"
            hint={
              value.budgetMode === 'lifetime'
                ? 'Toplam bütçede bitiş tarihi zorunlu — Meta bütçeyi süreye böler.'
                : 'Her gün bu kadar harcanır.'
            }
          >
            <select
              value={value.budgetMode}
              onChange={(e) => set({ budgetMode: e.target.value as 'daily' | 'lifetime' })}
              className={inputCls}
            >
              <option value="daily">Günlük bütçe</option>
              <option value="lifetime">Toplam bütçe</option>
            </select>
          </Field>

          <Field label="Teklif stratejisi">
            <select
              value={value.bidStrategy}
              onChange={(e) => set({ bidStrategy: e.target.value as BidStrategy })}
              className={inputCls}
            >
              {BID_STRATEGIES.map((b) => (
                <option key={b} value={b}>
                  {BID_STRATEGY_META[b].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="mt-1.5 text-[11px] text-ink-muted">
          {BID_STRATEGY_META[value.bidStrategy].description}
        </p>
        {/* HER STRATEJİNİN BEDELİ YAZIYOR — özellikle tavanlı olanların. */}
        {BID_STRATEGY_META[value.bidStrategy].risk && (
          <p className="mt-1 text-[11px] text-amber-700">
            {BID_STRATEGY_META[value.bidStrategy].risk}
          </p>
        )}

        {capped && (
          <div className="mt-3 max-w-xs">
            <Field label={`Tavan (${currency})`}>
              <input
                value={value.bidAmount ?? ''}
                onChange={(e) => set({ bidAmount: e.target.value || undefined })}
                inputMode="decimal"
                className={inputCls}
                placeholder="25"
              />
            </Field>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Başlangıç" hint="Boşsa hemen başlar.">
            <input
              type="datetime-local"
              value={value.startAt ?? ''}
              onChange={(e) => set({ startAt: e.target.value || undefined })}
              className={inputCls}
            />
          </Field>
          <Field
            label="Bitiş"
            hint={
              value.budgetMode === 'lifetime'
                ? 'Toplam bütçede zorunlu.'
                : 'Boşsa sen durdurana kadar devam eder.'
            }
          >
            <input
              type="datetime-local"
              value={value.endAt ?? ''}
              onChange={(e) => set({ endAt: e.target.value || undefined })}
              className={inputCls}
            />
          </Field>
        </div>
        {/* SAAT DİLİMİ REKLAM HESABININ. Kullanıcının saatiyle karışması,
            kampanyanın beklenenden saatler önce/sonra başlaması demek. */}
        <p className="mt-1 text-[11px] text-ink-muted">
          Saatler reklam hesabının saat dilimine göre uygulanır, senin
          bilgisayarının saatine göre değil.
        </p>
      </Block>

      {/* --- Hedefleme --- */}
      <Block
        title="Kitle"
        hint="Meta 2023'ten beri geniş kitlede daha iyi sonuç veriyor. Daraltma genelde maliyeti yükseltiyor."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Yaş (alt)">
            <input
              type="number"
              min={18}
              max={65}
              value={value.targeting.ageMin}
              onChange={(e) =>
                set({ targeting: { ...value.targeting, ageMin: Number(e.target.value) } })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Yaş (üst)" hint="65 = 65 ve üzeri.">
            <input
              type="number"
              min={18}
              max={65}
              value={value.targeting.ageMax}
              onChange={(e) =>
                set({ targeting: { ...value.targeting, ageMax: Number(e.target.value) } })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Cinsiyet">
            <select
              value={value.targeting.genders}
              onChange={(e) =>
                set({
                  targeting: { ...value.targeting, genders: e.target.value as GenderTarget },
                })
              }
              className={inputCls}
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <Field
            label="Ülkeler"
            hint="İki harfli kodlar, virgülle: TR, DE. Boş bırakılamaz — ülkesiz hedefleme dünya geneli demek."
          >
            <input
              value={value.targeting.countries.join(', ')}
              onChange={(e) =>
                set({
                  targeting: {
                    ...value.targeting,
                    countries: e.target.value
                      .split(',')
                      .map((c) => c.trim().toUpperCase())
                      .filter((c) => c.length === 2),
                  },
                })
              }
              className={inputCls}
            />
          </Field>
        </div>
      </Block>

      {/* --- Yerleşim --- */}
      <Block title="Yerleşim">
        <div className="flex gap-2">
          {(['auto', 'manual'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set({ placement: { ...value.placement, mode: m } })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                value.placement.mode === m
                  ? 'border-brand bg-brand-soft text-ink'
                  : 'border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {m === 'auto' ? 'Otomatik' : 'Elle seç'}
            </button>
          ))}
        </div>

        {value.placement.mode === 'auto' ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            Meta en ucuz envanteri kendi bulur. Çoğu durumda elle seçmekten daha ucuza
            sonuç verir.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <PositionGroup
              title="Facebook"
              options={FB_POSITIONS}
              selected={value.placement.facebookPositions}
              onToggle={(p) =>
                set({
                  placement: {
                    ...value.placement,
                    facebookPositions: toggle(value.placement.facebookPositions, p),
                  },
                })
              }
            />
            <PositionGroup
              title="Instagram"
              options={IG_POSITIONS}
              selected={value.placement.instagramPositions}
              onToggle={(p) =>
                set({
                  placement: {
                    ...value.placement,
                    instagramPositions: toggle(value.placement.instagramPositions, p),
                  },
                })
              }
            />
          </div>
        )}
      </Block>
    </div>
  );
}

function toggle<T extends string>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function PositionGroup<T extends string>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: readonly T[];
  selected: T[];
  onToggle: (p: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onToggle(p)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              selected.includes(p)
                ? 'border-brand bg-brand-soft text-ink'
                : 'border-line text-ink-muted hover:bg-surface-sunken'
            }`}
          >
            {selected.includes(p) ? '✓ ' : ''}
            {POSITION_LABELS[p] ?? p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 mb-2.5 text-xs text-ink-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-2.5'}>{children}</div>
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

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';
