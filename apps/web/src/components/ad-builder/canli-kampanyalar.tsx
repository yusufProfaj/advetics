'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CanliKampanyaOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatNumber, formatRelative } from '@/lib/format';

/**
 * ═══ YAYINDA OLAN KAMPANYALAR ═══
 *
 * Kullanıcının bildirdiği eksik: *"sadece adveticsten yayınladığım reklamlar
 * gözüküyor, yayında olan kampanyaları da görebilmem düzenleyebilmem lazım"*.
 *
 * Veri zaten vardı (gecelik yapı taraması `campaigns` tablosunu dolduruyor) ve
 * aksiyon ucu da yazılmıştı (`POST /campaigns/:id/actions`) — ama onu çağıran
 * tek yer AI asistanının onay kartıydı. Eksik olan EKRANDI.
 *
 * TASLAK LİSTESİNDEN AYRI DURUYOR ve bu bilinçli: ikisinin YAPABİLECEKLERİ
 * farklı. Taslak YAYINLANABİLİR, canlı olan DURDURULABİLİR. Tek listede
 * birleştirmek, satır başına hangi düğmenin çıkacağını kullanıcıya tahmin
 * ettirirdi.
 */
export function CanliKampanyalar({
  rows,
  toplam,
  canManage,
}: {
  rows: CanliKampanyaOzeti[];
  toplam: number;
  /** `budget.write` — listeyi görebilen herkes durdurabilmek zorunda değil. */
  canManage: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Yayında olanlar</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Platformdaki kampanyalar. Advetics dışında açılanlar da burada.
          </p>
        </div>
        {/* SESSİZ KESME YOK: kaç tanesi gösteriliyor, toplam kaç. */}
        <span className="text-[11px] text-ink-muted">
          {toplam > rows.length ? `${rows.length} / ${toplam} kampanya` : `${toplam} kampanya`}
        </span>
      </div>

      <ul className="divide-y divide-line/60">
        {rows.map((k) => (
          <Satir key={k.id} kampanya={k} canManage={canManage} />
        ))}
      </ul>
    </section>
  );
}

function Satir({ kampanya, canManage }: { kampanya: CanliKampanyaOzeti; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [butceAcik, setButceAcik] = useState(false);

  /*
   * GOOGLE'DA YAZMA YOK ve düğme bunu ÖNDEN söylüyor.
   *
   * `google.provider.applyAction` açıkça reddediyor: bağlantı ve okuma
   * çalışıyor, eksik olan yazma kodu. Düğmeyi açık bırakıp kullanıcıya
   * platform hatası göstermek, çalıştığını sandığı bir şeyi denetmek olurdu.
   */
  const yazilabilir = kampanya.platform === 'meta';
  const aktif = kampanya.status === 'active';

  async function uygula(govde: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch(`/campaigns/${kampanya.id}/actions`, {
        method: 'POST',
        body: JSON.stringify(govde),
      });
      setButceAcik(false);
      // Sunucu bileşeni tazeleniyor: satırın yeni durumu listeden okunmalı,
      // istemci state'inde tahmin edilmemeli.
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  const m = kampanya.son7Gun;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{kampanya.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {kampanya.platform === 'google' ? 'Google' : 'Meta'}
            {kampanya.adAccountName && ` · ${kampanya.adAccountName}`}
            {kampanya.budgetAmountMicros && (
              <>
                {' · '}
                {formatMoney(kampanya.budgetAmountMicros, kampanya.currency)}
                {kampanya.budgetMode === 'daily' ? '/gün' : ' toplam'}
              </>
            )}
            {' · '}
            {formatRelative(kampanya.syncedAt)} güncellendi
          </p>
        </div>
        <DurumRozeti kampanya={kampanya} />
      </div>

      {/*
        SON 7 GÜN — `null` ile sıfır AYRI.
        "Hiç harcamadı" ile "veri gelmedi" aynı şey değil: birincisinde
        kampanyaya bakılır, ikincisinde senkronizasyona.
      */}
      <p className="mt-1.5 text-[11px] text-ink-muted">
        {m === null ? (
          <span>Son 7 günde veri yok</span>
        ) : (
          <>
            Son 7 gün: <strong className="text-ink">{formatMoney(m.spendMicros, kampanya.currency)}</strong>
            {' · '}
            {formatNumber(m.impressions)} gösterim · {formatNumber(m.clicks)} tıklama
            {m.conversions > 0 && ` · ${formatNumber(m.conversions)} dönüşüm`}
          </>
        )}
      </p>

      {hata && (
        <p role="alert" className="mt-1.5 text-[11px] text-danger">
          {hata}
        </p>
      )}

      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={!yazilabilir || busy}
            onClick={() => void uygula({ type: aktif ? 'pause' : 'resume' })}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '…' : aktif ? 'Duraklat' : 'Sürdür'}
          </button>
          <button
            type="button"
            disabled={!yazilabilir || busy}
            onClick={() => setButceAcik((v) => !v)}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
          >
            Bütçeyi değiştir
          </button>
          {!yazilabilir && (
            // SEBEPSİZ KAPALI DÜĞME YOK: kullanıcı neden basamadığını bilmeli,
            // yoksa olmayan bir arızayı aramaya gider.
            <span className="text-[11px] text-ink-muted">
              Google tarafında değişiklik henüz yazılmadı, Google Ads’ten yapman gerekiyor.
            </span>
          )}
        </div>
      )}

      {butceAcik && yazilabilir && (
        <ButceFormu kampanya={kampanya} busy={busy} onUygula={uygula} />
      )}
    </li>
  );
}

/**
 * BÜTÇE DEĞİŞİKLİĞİ — eski değer, yeni değer ve ÖĞRENME EVRESİ uyarısı.
 *
 * Bu düğme para harcıyor ve etkisi tutarla sınırlı değil: bütçe değişikliği
 * reklam setini öğrenme evresine geri atıyor, yani performans geçici olarak
 * DÜŞÜYOR. Söylemezsek kullanıcı "iyileştirdim" sanıp tersini yapar.
 */
function ButceFormu({
  kampanya,
  busy,
  onUygula,
}: {
  kampanya: CanliKampanyaOzeti;
  busy: boolean;
  onUygula: (govde: Record<string, unknown>) => Promise<void>;
}) {
  const mevcut = kampanya.budgetAmountMicros
    ? (Number(BigInt(kampanya.budgetAmountMicros) / 10_000n) / 100).toString()
    : '';
  const [deger, setDeger] = useState(mevcut);

  const sayi = Number(deger.replace(',', '.'));
  const gecerli = Number.isFinite(sayi) && sayi > 0;
  const yeniMicros = gecerli ? BigInt(Math.round(sayi * 1_000_000)).toString() : null;

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-muted p-3">
      <label className="block text-xs text-ink-muted">
        {kampanya.budgetMode === 'lifetime' ? 'Toplam bütçe' : 'Günlük bütçe'}
        <input
          value={deger}
          onChange={(e) => setDeger(e.target.value)}
          inputMode="decimal"
          className="mt-1 w-40 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
      </label>

      <p className="mt-2 text-[11px] text-ink">
        {formatMoney(kampanya.budgetAmountMicros ?? '0', kampanya.currency)}
        {' → '}
        <strong>{yeniMicros ? formatMoney(yeniMicros, kampanya.currency) : '—'}</strong>
      </p>
      <p className="mt-1 text-[11px] text-ink-muted">
        Bütçe değişikliği reklam setini öğrenme evresine geri atıyor; performans birkaç
        gün dalgalanabilir.
      </p>

      <button
        type="button"
        disabled={!gecerli || busy}
        onClick={() =>
          void onUygula({
            type: 'set_budget',
            amountMicros: yeniMicros,
            budgetMode: kampanya.budgetMode,
          })
        }
        className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'Uygulanıyor…' : 'Uygula'}
      </button>
    </div>
  );
}

/**
 * DURUM İKİ PARÇA: kampanyanın kendi durumu ve PLATFORMUN uyguladığı durum.
 *
 * İkisi ayrışabiliyor — kampanya `active` görünürken reklam seti duraklatılmış
 * ya da hesap kapatılmış olabiliyor ve o hâlde hiç gösterim almıyor. Tek
 * rozete indirgemek, para harcamayan bir kampanyayı "yayında" göstermek olurdu.
 */
function DurumRozeti({ kampanya }: { kampanya: CanliKampanyaOzeti }) {
  const etiket = DURUM_ETIKETI[kampanya.status] ?? kampanya.status;
  const ayrisik =
    kampanya.effectiveStatus !== null &&
    kampanya.effectiveStatus.toLowerCase() !== kampanya.status.toLowerCase();

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
          kampanya.status === 'active'
            ? 'bg-ok-soft text-ok-strong ring-ok/30'
            : 'bg-surface-sunken text-ink-muted ring-line'
        }`}
      >
        {etiket}
      </span>
      {ayrisik && (
        <span className="text-[10px] text-warn-strong">
          platformda: {kampanya.effectiveStatus}
        </span>
      )}
    </span>
  );
}

const DURUM_ETIKETI: Record<string, string> = {
  active: 'yayında',
  paused: 'duraklatıldı',
  ended: 'bitti',
  deleted: 'silindi',
  pending_review: 'incelemede',
  unknown: 'bilinmiyor',
};
