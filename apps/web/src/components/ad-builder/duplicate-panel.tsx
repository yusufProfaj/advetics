'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  CreativeRecord,
  DraftCampaignRecord,
  DuplicateResult,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Kampanya çoğaltma — eski toplu oluşturucunun yerini alıyor.
 *
 * ESKİSİ BİR TABLOYDU: kullanıcı Excel'de sekiz sütun hazırlıyor, panele
 * yapıştırıyor ve ÜSTELİK Meta ad set kimliğiyle sayfa kimliğini ELLE
 * yazıyordu — ikisi de zaten veritabanımızda duruyorken. Sütun kayması en
 * yaygın hataydı ve yapıştırmadan önce görünmüyordu.
 *
 * YENİSİNİN İDDİASI: kullanıcı yalnızca DEĞİŞENİ yazıyor. Kaynak kampanya
 * zaten doğrulanmış bir ağaç; hesap, sayfa, hedef ve platform uyumu bir kez
 * kontrol edildi ve kopyalar onları taşıyor. Boş bırakılan her alan
 * "kaynaktakiyle aynı" demek.
 */
export function DuplicatePanel({
  campaigns,
  creatives,
}: {
  campaigns: DraftCampaignRecord[];
  creatives: CreativeRecord[];
}) {
  const router = useRouter();

  const [sourceId, setSourceId] = useState(campaigns[0]?.id ?? '');
  const [variants, setVariants] = useState<Varyasyon[]>([bosVaryasyon(1)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<DuplicateResult | null>(null);

  const kaynak = campaigns.find((c) => c.id === sourceId);
  const google = kaynak?.platform === 'google';

  async function olustur(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<DuplicateResult>('/draft-campaigns/duplicate', {
        method: 'POST',
        body: JSON.stringify({
          sourceCampaignId: sourceId,
          variants: variants.map((v) => ({
            name: v.name.trim(),
            // BOŞ ALAN GÖNDERİLMİYOR: sunucu "boş = kaynaktakiyle aynı" diye
            // okuyor ve boş dize göndermek onu "sıfır bütçe" gibi
            // yorumlatabilirdi.
            budget: v.budget.trim() || undefined,
            creativeIds: v.creativeIds.length > 0 ? v.creativeIds : undefined,
            keywords: v.keywords.trim()
              ? v.keywords
                  .split(/[,\n]/)
                  .map((k) => k.trim())
                  .filter(Boolean)
              : undefined,
          })),
        }),
      });
      setSonuc(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Çoğaltılamadı');
    } finally {
      setBusy(false);
    }
  }

  if (campaigns.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
        Çoğaltılacak kampanya yok. Önce Hızlı Reklam ya da Kampanya Kur ekranından bir
        kampanya oluştur.
      </p>
    );
  }

  if (sonuc) {
    return (
      <div className="space-y-3">
        {/* KISMİ BAŞARI: kurulanlar ve düşenler AYRI. Tek bir "başarısız"
            demek, kurulmuş on yedi kampanyayı gizlemek olurdu. */}
        {sonuc.created.length > 0 && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-sm font-semibold text-emerald-900">
              {sonuc.created.length} kampanya oluşturuldu
            </h3>
            <p className="mt-1 text-xs text-emerald-800">
              Hepsi <strong>taslak</strong> — hiçbiri yayınlanmadı. Her birini tek tek
              gözden geçirip yayınlaman gerekiyor.
            </p>
            <ul className="mt-2 space-y-0.5">
              {sonuc.created.map((c) => (
                <li key={c.id} className="text-xs text-emerald-900">
                  · {c.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {sonuc.failed.length > 0 && (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <h3 className="text-sm font-semibold text-rose-900">
              {sonuc.failed.length} varyasyon kurulamadı
            </h3>
            <ul className="mt-2 space-y-1">
              {sonuc.failed.map((f) => (
                <li key={f.name} className="text-xs text-rose-800">
                  · <strong>{f.name}</strong> — {f.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={() => {
            setSonuc(null);
            setVariants([bosVaryasyon(1)]);
          }}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Yeni çoğaltma
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Kaynak kampanya</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Yazmadığın her alan bu kampanyadan geliyor: hesap, sayfa, hedef, kitle, yerleşim.
        </p>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.platform === 'google' ? 'Google' : 'Meta'} · {c.adAccountName}
            </option>
          ))}
        </select>
        {kaynak && (
          <p className="mt-1.5 text-[11px] text-ink-muted">
            Bütçe: {Number(BigInt(kaynak.budgetAmountMicros ?? '0') / 1_000_000n)} ₺/gün ·{' '}
            {kaynak.adGroups[0]?.ads.length ?? 0} reklam
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            Varyasyonlar
            <span className="ml-1.5 font-normal text-ink-muted">{variants.length}</span>
          </h2>
          {/* HER VARYASYON AYRI BİR GÜNLÜK BÜTÇE — toplam yazıyor.
              Yirmi kopya günlük harcamanın yirmi katı demek ve kullanıcı bunu
              tek düğmeyle yapıyor. */}
          <span className="text-[11px] text-ink-muted">
            Toplam günlük: {toplamButce(variants, kaynak)} ₺
          </span>
        </div>

        <ul className="mt-3 space-y-2">
          {variants.map((v, i) => (
            <li key={v.key} className="rounded-lg border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    Ad
                  </span>
                  <input
                    value={v.name}
                    onChange={(e) => guncelle(setVariants, i, { name: e.target.value })}
                    placeholder={`${kaynak?.name ?? 'Kampanya'} — ${i + 1}`}
                    className={input}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    Bütçe (boşsa kaynağınki)
                  </span>
                  <input
                    value={v.budget}
                    onChange={(e) => guncelle(setVariants, i, { budget: e.target.value })}
                    inputMode="decimal"
                    placeholder={String(
                      Number(BigInt(kaynak?.budgetAmountMicros ?? '0') / 1_000_000n),
                    )}
                    className={input}
                  />
                </label>
              </div>

              {/* KREATİF DEĞİŞİKLİĞİ OPSİYONEL: aynı kreatifle farklı bütçe
                  denemek de geçerli bir varyasyon. */}
              <div className="mt-2">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  Kreatif (boşsa kaynağınki)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {creatives.map((c) => {
                    const secili = v.creativeIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          guncelle(setVariants, i, {
                            creativeIds: secili
                              ? v.creativeIds.filter((x) => x !== c.id)
                              : [...v.creativeIds, c.id],
                          })
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                          secili
                            ? 'border-brand bg-brand-soft text-ink'
                            : 'border-line text-ink-muted hover:bg-surface-sunken'
                        }`}
                      >
                        {secili ? '✓ ' : ''}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {google && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    Anahtar kelimeler (boşsa kaynağınki)
                  </span>
                  <input
                    value={v.keywords}
                    onChange={(e) => guncelle(setVariants, i, { keywords: e.target.value })}
                    placeholder="halı yıkama, koltuk yıkama"
                    className={input}
                  />
                </label>
              )}

              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                  className="mt-2 text-[11px] text-rose-700 hover:underline"
                >
                  Bu varyasyonu kaldır
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setVariants((prev) => [...prev, bosVaryasyon(prev.length + 1)])}
          disabled={variants.length >= 20}
          className="mt-2 text-xs font-medium text-brand underline disabled:opacity-40"
        >
          + Varyasyon ekle
        </button>
        {variants.length >= 20 && (
          <p className="mt-1 text-[11px] text-ink-muted">
            Tek seferde en fazla 20 varyasyon — her biri ayrı bir günlük bütçe.
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={olustur}
        disabled={busy || variants.some((v) => !v.name.trim())}
        className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Oluşturuluyor…' : `${variants.length} varyasyonu oluştur`}
      </button>
      {/* TASLAK OLARAK AÇILIYOR ve bu söyleniyor: yirmi kampanyayı tek
          düğmeyle yayına sokmak, geri alması Ads Manager'dan tek tek silmek
          demek olurdu. */}
      <p className="text-[11px] text-ink-muted">
        Varyasyonlar <strong>taslak</strong> olarak oluşur — hiçbiri yayınlanmaz. Her birini
        tek tek gözden geçirip yayınlarsın.
      </p>
    </div>
  );
}

interface Varyasyon {
  key: number;
  name: string;
  budget: string;
  creativeIds: string[];
  keywords: string;
}

function bosVaryasyon(n: number): Varyasyon {
  return { key: Date.now() + n, name: '', budget: '', creativeIds: [], keywords: '' };
}

function guncelle(
  set: React.Dispatch<React.SetStateAction<Varyasyon[]>>,
  index: number,
  patch: Partial<Varyasyon>,
): void {
  set((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
}

/**
 * Toplam günlük harcama.
 *
 * SESSİZ ÇARPAN YOK: on varyasyon, günlük bütçenin on katı demek ve bu sayı
 * hiçbir yerde yazmıyorsa kullanıcı ancak faturayı görünce fark eder.
 */
function toplamButce(variants: Varyasyon[], kaynak: DraftCampaignRecord | undefined): number {
  const varsayilan = Number(BigInt(kaynak?.budgetAmountMicros ?? '0') / 1_000_000n);
  return variants.reduce((toplam, v) => {
    const deger = Number(v.budget.replace(',', '.'));
    return toplam + (Number.isFinite(deger) && deger > 0 ? deger : varsayilan);
  }, 0);
}

const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';
