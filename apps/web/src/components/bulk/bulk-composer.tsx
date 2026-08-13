'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Toplu reklam yapıştırma.
 *
 * TABLO YAPIŞTIRMA, form değil. Ajans reklam metinlerini Excel'de ya da
 * Google Sheets'te hazırlıyor; 60 satırı tek tek forma girmek bu aracın
 * kurtarmayı vaat ettiği işin ta kendisi.
 *
 * Sekmeyle ayrılmış metin (TSV) okunuyor: kopyala-yapıştır varsayılan olarak
 * bunu üretiyor. CSV desteklemiyoruz çünkü reklam metinlerinde virgül çok
 * yaygın ve tırnak kaçışını doğru yapmak kullanıcıya iş çıkarırdı.
 */

const COLUMNS = [
  { key: 'name', label: 'Reklam adı' },
  { key: 'primaryText', label: 'Birincil metin' },
  { key: 'headline', label: 'Başlık' },
  { key: 'description', label: 'Açıklama' },
  { key: 'linkUrl', label: 'Hedef URL' },
  { key: 'callToAction', label: 'Eylem düğmesi' },
  /**
   * ARŞİV ADI ÖNCE, ham referans sonra.
   *
   * Sıra bir tercih bildiriyor: beklenen kullanım arşivden ad yazmak. Ham
   * hash o değeri Ads Manager'dan kopyalamayı gerektiriyor ve bu aracın
   * kurtarmayı vaat ettiği işin bir parçasıydı.
   */
  { key: 'assetName', label: 'Arşiv görseli (adı)' },
  { key: 'mediaRef', label: 'Ham görsel hash / video kimliği' },
] as const;

export function BulkComposer({
  clientId,
  accounts,
  assetNames,
}: {
  clientId: string;
  accounts: Array<{ id: string; name: string }>;
  /** Arşivdeki görsel adları — yapıştırma kutusunun üstünde gösteriliyor. */
  assetNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [adAccountId, setAdAccountId] = useState(accounts[0]?.id ?? '');
  const [adSetId, setAdSetId] = useState('');
  const [pageId, setPageId] = useState('');
  const [paste, setPaste] = useState('');

  const rows = parseTsv(paste);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/bulk', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          clientId,
          adAccountId,
          defaults: { adSetExternalId: adSetId.trim(), pageExternalId: pageId.trim() },
          items: rows,
        }),
      });
      setOpen(false);
      setPaste('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Parti kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
      >
        Yeni parti
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Yeni parti</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Parti adı">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Reklam hesabı">
          <select
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            className={inputCls}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ad set kimliği">
          <input
            value={adSetId}
            onChange={(e) => setAdSetId(e.target.value)}
            placeholder="Meta ad set ID"
            className={inputCls}
          />
          {/* MEVCUT AD SET'E EKLİYORUZ, yenisini açmıyoruz.
              Ajans zaten kurulu bir yapıya varyasyon ekliyor; her partide
              yeni ad set açmak öğrenme aşamasını sıfırlar. */}
          <p className="mt-1 text-[11px] text-ink-muted">
            Reklamlar bu mevcut ad set&apos;in içine eklenecek.
          </p>
        </Field>
        <Field label="Sayfa kimliği">
          <input
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="Facebook Page ID"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="mt-4">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Tabloyu yapıştır
        </label>
        <p className="mt-1 text-[11px] text-ink-muted">
          Excel veya Sheets&apos;ten kopyalayıp yapıştır. Sütun sırası:{' '}
          {COLUMNS.map((c) => c.label).join(' · ')}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          Görsel için <strong>arşiv adı</strong> ya da <strong>ham hash</strong> —
          ikisinden biri. İkisini birden yazarsan hangisinin kullanılacağı belirsiz
          kalır ve satır reddedilir.
        </p>

        {/* ARŞİV ADLARI BURADA. Kullanıcı adı hatırlamak zorunda kalmasın:
            listeyi başka sekmede açıp geri dönmek, bu aracın kurtardığı
            zamanı geri harcamak olurdu. */}
        {assetNames.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-brand">
              Arşivdeki görsel adları ({assetNames.length})
            </summary>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-muted">
              {assetNames.join(' · ')}
            </p>
          </details>
        )}
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={8}
          spellCheck={false}
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-xs outline-none focus:border-brand"
          placeholder={`Varyasyon A\tYaz indirimi başladı\tŞimdi keşfet\t\thttps://site.com\tSHOP_NOW\tyaz-kampanya-1\t`}
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-left text-ink-muted">
                <th className="px-2 py-1.5 font-medium">#</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ÖNİZLEME KAYDETMEDEN ÖNCE. Sütun kayması en yaygın
                  yapıştırma hatası ve tabloyu görmeden fark edilmiyor. */}
              {rows.slice(0, 10).map((r) => (
                <tr key={r.rowNumber} className="border-b border-line/60 last:border-0">
                  <td className="px-2 py-1.5 text-ink-muted">{r.rowNumber}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="max-w-[180px] truncate px-2 py-1.5">
                      {(r as Record<string, unknown>)[c.key] as string}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 10 && (
            <p className="border-t border-line px-2 py-1.5 text-[11px] text-ink-muted">
              …ve {rows.length - 10} satır daha. Toplam {rows.length} reklam.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || rows.length === 0 || !name.trim() || !adSetId.trim() || !pageId.trim()}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : `${rows.length} satırı kaydet ve doğrula`}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
        >
          Vazgeç
        </button>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">
        Kaydetmek platforma hiçbir şey yazmaz — her satır doğrulanır ve sorunlar işaretlenir.
        Yayınlamak ayrı bir adım.
      </p>
    </div>
  );
}

/**
 * Sekmeyle ayrılmış metni satırlara çevirir.
 *
 * BOŞ SATIRLAR ATLANIYOR ama satır numarası KORUNUYOR: kullanıcının
 * elektronik tablosundaki satır numarasıyla bizim numaramız eşleşmezse,
 * "3. satırda hata" mesajı yanlış satırı gösterir.
 */
function parseTsv(text: string): Array<Record<string, string | number>> {
  const out: Array<Record<string, string | number>> = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const cells = line.split('\t');
    const row: Record<string, string | number> = { rowNumber: i + 1 };
    COLUMNS.forEach((c, idx) => {
      const v = (cells[idx] ?? '').trim();
      if (v) row[c.key] = v;
    });
    // Adsız satır anlamsız; muhtemelen başlık satırı ya da artık.
    if (!row.name) continue;
    out.push(row);
  }
  return out;
}

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Yayınlama düğmesi — ONAY İSTİYOR.
 *
 * 60 reklam oluşturmak geri alınması zor: silinmeleri gerekirse Ads
 * Manager'dan tek tek. Onay metni kaç reklamın açılacağını söylüyor.
 */
export function PublishButton({
  batchId,
  readyCount,
  invalidCount,
}: {
  batchId: string;
  readyCount: number;
  invalidCount: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ published: number; failed: number; skipped: number }>(
        `/bulk/${batchId}/publish`,
        { method: 'POST' },
      );
      setResult(
        [
          `${res.published} reklam oluşturuldu (duraklatılmış)`,
          res.failed > 0 ? `${res.failed} başarısız` : null,
          res.skipped > 0 ? `${res.skipped} geçersiz satır atlandı` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      setConfirming(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Yayınlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  if (readyCount === 0) return null;

  return (
    <div className="space-y-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
        >
          {readyCount} reklamı yayınla
        </button>
      ) : (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="font-semibold">
            Meta&apos;da {readyCount} reklam oluşturulacak.
          </p>
          <p className="mt-1">
            Reklamlar <strong>duraklatılmış</strong> açılır — Ads Manager&apos;dan gözden
            geçirip başlatabilirsin. Geri almak, oluşan reklamları tek tek silmek demek.
            {invalidCount > 0 && ` ${invalidCount} geçersiz satır atlanacak.`}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={publish}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Yayınlanıyor…' : 'Anladım, yayınla'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-900"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
      {result && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink">{result}</p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
