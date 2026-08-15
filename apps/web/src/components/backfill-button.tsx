'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface BackfillResult {
  applied: boolean;
  accountCount: number;
  /** Yapı taraması olmayan, dolayısıyla metriği çekilemeyecek hesap sayısı. */
  noStructure: number;
  dateFrom: string;
  dateTo: string;
  queued: number;
  skipped: number;
}

/**
 * "Geçmiş veriyi çek" — geriye dönük metrik senkronizasyonu.
 *
 * NEDEN "Şimdi güncelle"DEN AYRI: o düğme yalnızca BUGÜNÜ çekiyor ve maliyeti
 * hesap başına bir çağrı. Geriye dönük çekim ise gün sayısı × hesap sayısı
 * kadar veri demek; ikisini aynı düğmeye bağlamak, her tıkta kotayı geri
 * alınamaz biçimde harcamak olurdu. Google tarafında günlük kota bittiğinde
 * senkronizasyon ertesi güne kalıyor.
 *
 * İKİ ADIMLI ve bu bilinçli. Önce sunucuya "ne olurdu" diye soruyoruz
 * (`apply: false` hiçbir şey yapmıyor), kaç hesap ve hangi tarih aralığı
 * olduğunu EKRANDA gösteriyoruz, onay gelince uyguluyoruz. Sunucudaki
 * `sync-cli`ın kuru çalışma deseni bu ve sebebi somut: kapsamsız çalıştırılan
 * ilk sürüm 27 hesaplık bir portföy için 288 hesap saymıştı.
 */
const PRESETS = [7, 30, 90, 180] as const;

export function BackfillButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number>(90);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackfillResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(apply: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<BackfillResult>('/sync/backfill', {
        method: 'POST',
        body: JSON.stringify({ days, apply }),
      });

      if (!apply) {
        setPreview(res);
        setMessage(null);
        return;
      }

      setPreview(null);
      setOpen(false);
      // "Çekildi" DEMİYORUZ — iş kuyruğa girdi, worker çalıştıracak. 90 günlük
      // bir tarama dakikalar sürüyor ve "tamamlandı" demek, kullanıcının eksik
      // veriye tam sanıp bakması demek olurdu.
      const parts = [`${res.queued} iş kuyruğa alındı`, `${res.dateFrom} → ${res.dateTo}`];
      if (res.skipped > 0) parts.push(`${res.skipped} iş zaten kuyruktaydı`);
      setMessage(parts.join(' · '));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geçmiş veri çekilemedi.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMessage(null);
            void call(false);
          }}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Geçmiş veriyi çek
        </button>
        {message && <span className="text-[11px] text-ink-muted">{message}</span>}
      </div>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-line bg-surface p-3 text-left">
      <p className="text-xs font-semibold text-ink">Geçmiş veriyi çek</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            onClick={() => {
              setDays(d);
              setPreview(null);
            }}
            className={`rounded-lg border px-2 py-1 text-[11px] transition ${
              days === d
                ? 'border-brand bg-brand text-white'
                : 'border-line text-ink hover:bg-surface-muted'
            } disabled:opacity-50`}
          >
            {d} gün
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void call(false)}
        disabled={busy}
        className="mt-2 text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
      >
        {busy && !preview ? 'Hesaplanıyor…' : 'Ne olacağını göster'}
      </button>

      {preview && (
        <div className="mt-2 rounded-lg bg-surface-muted px-2.5 py-2 text-[11px] text-ink">
          <p>
            <strong>{preview.accountCount} hesap</strong> · {preview.dateFrom} → {preview.dateTo}
          </p>
          {/*
            YAPI TARAMASI OLMAYAN HESAP SESSİZ KALMAMALI. Metrik satırı, ait
            olduğu kampanya satırı olmadan yazılamıyor; bu hesaplar atlanacak
            ve kullanıcı "çektim ama veri yok" diye arayacaktı.
          */}
          {preview.noStructure > 0 && (
            <p className="mt-1 text-amber-700">
              {preview.noStructure} hesapta yapı taraması yok — onların metriği
              çekilmeyecek. Önce &quot;Şimdi güncelle&quot; ile yapıyı çek.
            </p>
          )}
          {preview.accountCount === 0 && (
            <p className="mt-1 text-amber-700">Çekilecek hesap yok.</p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void call(true)}
          disabled={busy || !preview || preview.accountCount === 0}
          className="rounded-lg bg-brand px-3 py-1 text-[11px] font-semibold text-white transition disabled:opacity-40"
        >
          {busy && preview ? 'Başlatılıyor…' : 'Çek'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
            setError(null);
          }}
          disabled={busy}
          className="text-[11px] text-ink-muted hover:underline disabled:opacity-50"
        >
          Vazgeç
        </button>
      </div>

      <p className="mt-2 text-[10px] text-ink-muted">
        Aralık dünde biter; bugünü &quot;Şimdi güncelle&quot; çekiyor. İş kuyruğa
        giriyor, veri birkaç dakika içinde gelmeye başlar.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
