'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { platformKisaAdi, type CanliKampanyaOzeti } from '@advetics/shared';
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
  baslik = 'Yayında olanlar',
  aciklama = 'Platformdaki kampanyalar. Advetics dışında açılanlar da burada.',
}: {
  rows: CanliKampanyaOzeti[];
  toplam: number;
  /** `budget.write` — listeyi görebilen herkes durdurabilmek zorunda değil. */
  canManage: boolean;
  baslik?: string;
  aciklama?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{baslik}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{aciklama}</p>
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
  const [kopyaAcik, setKopyaAcik] = useState(false);
  const [kopyaNotu, setKopyaNotu] = useState<string | null>(null);

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
      const sonuc = await apiFetch<{ after?: Record<string, unknown> }>(
        `/campaigns/${kampanya.id}/actions`,
        { method: 'POST', body: JSON.stringify(govde) },
      );
      /*
       * KOPYA OLUŞTU AMA LİSTEDE HENÜZ YOK.
       *
       * Kampanya platformda var; bizim tablomuza onu yapı taraması yazıyor
       * ve o kuyruğa yeni alındı. Bunu söylemezsek kullanıcı kopyanın
       * oluşmadığını sanıp ikinci kez basar — para harcayan mükerrerlik.
       */
      if (govde.type === 'copy') {
        const not = sonuc.after?.senkronNotu;
        setKopyaNotu(
          typeof not === 'string'
            ? `Kopya oluştu (duraklatılmış). ${not}`
            : 'Kopya duraklatılmış olarak oluşturuldu. Listeye birkaç dakika içinde düşecek.',
        );
        setKopyaAcik(false);
      }
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
            {/*
              ETİKET ORTAK SÖZLÜKTEN. İki yollu bir platform dallanması
              (google ise şu, değilse Meta) LinkedIn kampanyasını "Meta" diye
              etiketlerdi ve yanlış rozet, eksik rozetten kötü: kullanıcı
              sorgulamıyor. `linkedin-kayit.spec.ts` bu deseni depo genelinde
              tarıyor ve ilk yazımda BU SATIRI yakaladı.

              Yorumun kendisi de kod gibi yazılamıyor: tarama yorumları
              ayıklamıyor ve deseni anlatan bir yorum, düzeltilmiş kodu
              suçlu gösteriyor. Açıklama kelimeyle yapılıyor.
            */}
            {platformKisaAdi(kampanya.platform)}
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
          <button
            type="button"
            disabled={!yazilabilir || busy}
            onClick={() => setKopyaAcik((v) => !v)}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
          >
            Çoğalt
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

      {kopyaNotu && (
        <p role="status" className="mt-2 rounded-lg border border-ok/40 bg-ok/5 px-2.5 py-1.5 text-[11px] text-ink">
          {kopyaNotu}
        </p>
      )}

      {butceAcik && yazilabilir && (
        <ButceFormu kampanya={kampanya} busy={busy} onUygula={uygula} />
      )}

      {kopyaAcik && yazilabilir && (
        <KopyaFormu kampanya={kampanya} busy={busy} onUygula={uygula} />
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
 * ═══ ÇOĞALT — KOPYAYI PLATFORM ÇIKARIYOR ═══
 *
 * Kampanyayı kendi modelimizde kopyalamıyoruz. Hedefleme Meta'nın ham
 * biçiminde duruyor ve bizim taslak şemamız bambaşka bir model; çeviri,
 * kaynağıyla AYNI sanılan ama FARKLI hedefleyen bir kampanya üretme riski
 * taşıyor. Meta'nın kendi kopyalama ucu (`/copies`) reklam setlerini ve
 * reklamları aslına sadık kopyalıyor.
 *
 * KOPYA DURAKLATILMIŞ AÇILIYOR ve bu ekranda YAZILI: kullanıcı bütçeyi
 * gözden geçirip kendisi başlatıyor. Sessizce yayına giren bir kopya, iki
 * katı harcama demek.
 */
function KopyaFormu({
  kampanya,
  busy,
  onUygula,
}: {
  kampanya: CanliKampanyaOzeti;
  busy: boolean;
  onUygula: (govde: Record<string, unknown>) => Promise<void>;
}) {
  const [ad, setAd] = useState(`${kampanya.name} — kopya`);
  const [derin, setDerin] = useState(true);

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-muted p-3">
      <label className="block text-xs text-ink-muted">
        Kopyanın adı
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          maxLength={200}
          className="mt-1 w-full max-w-md rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
      </label>

      <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={derin}
          onChange={(e) => setDerin(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--brand-primary)]"
        />
        {/*
          SINIR BELGEDEN: eşzamanlı çağrıda en fazla 3 alt reklam
          kopyalanıyor. Kullanıcı bunu önden bilmeli, yoksa eksik kopyayı
          hata sanır.
        */}
        Reklam setleri ve reklamlar da kopyalansın (3 reklama kadar)
      </label>

      <p className="mt-2 text-[11px] text-ink-muted">
        Kopya <strong className="text-ink">duraklatılmış</strong> oluşuyor. Bütçesini gözden
        geçirip kendin başlatman gerekiyor.
      </p>

      <button
        type="button"
        disabled={busy || ad.trim().length === 0}
        onClick={() => void onUygula({ type: 'copy', name: ad.trim(), deepCopy: derin })}
        className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'Kopyalanıyor…' : 'Kopyala'}
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
