'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BulkRefreshEstimate,
  BulkRefreshProgress,
  BulkRefreshStarted,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Nokta } from '@/components/yukleniyor';

/**
 * ═══ TÜM VERİLERİ GÜNCELLE ═══
 *
 * Seçilen workspace'lerin son N yılının bütün verisi tek tuşla.
 *
 * İKİ ADIM: önce ne olacağı SÖYLENİYOR, sonra uygulanıyor. Kota geri
 * alınamaz biçimde harcanıyor ve iki yıllık bir tazeleme yüzlerce platform
 * çağrısı demek — kullanıcı sayıyı görmeden basmamalı. `sync-cli` ve
 * `backfill` ucunun deseni bu.
 *
 * İLERLEME YOKLANARAK OKUNUYOR. Sunucudan itmek (SSE/WebSocket) daha zarif
 * olurdu ama paylaşımlı VPS'te açık bağlantı başına bir süreç kaynağı demek
 * ve bu ekran saatlerce açık kalabiliyor. Beş saniyelik yoklama, saatler
 * süren bir iş için fazlasıyla sık.
 */
export function TopluTazeleme({
  workspaceler,
}: {
  workspaceler: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [yil, setYil] = useState(2);
  const [kirilimlar, setKirilimlar] = useState(false);
  const [tahmin, setTahmin] = useState<BulkRefreshEstimate | null>(null);
  const [parti, setParti] = useState<string | null>(null);
  const [ilerleme, setIlerleme] = useState<BulkRefreshProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * PARTİ KİMLİĞİ SAKLANIYOR. Sayfa yenilenirse ilerleme kaybolmamalı —
   * kullanıcı saatler süren bir işlemi başlatıp sekmeyi kapatabilir ve geri
   * döndüğünde "başlamış mıydı" sorusunu sormamalı.
   */
  useEffect(() => {
    const kayit = localStorage.getItem('advetics.topluTazeleme');
    if (kayit) setParti(kayit);
  }, []);

  const yokla = useCallback(async (id: string) => {
    try {
      setIlerleme(await apiFetch<BulkRefreshProgress>(`/sync/bulk-refresh/${id}`));
    } catch (e) {
      /*
       * YOKLAMA HATASI YUTULMUYOR ama çubuğu da SİLMİYOR: geçici bir ağ
       * hatası, saatlerdir izlenen bir ilerlemeyi ekrandan kaldırmamalı.
       */
      setHata(e instanceof ApiRequestError ? e.message : 'İlerleme okunamadı.');
    }
  }, []);

  useEffect(() => {
    if (!parti) return;
    void yokla(parti);
    const t = setInterval(() => void yokla(parti), 5000);
    return () => clearInterval(t);
  }, [parti, yokla]);

  // Bittiğinde yoklama duruyor ve sayfa tazeleniyor: yeni veri ekranlara
  // yansısın.
  useEffect(() => {
    if (ilerleme?.bitti) router.refresh();
  }, [ilerleme?.bitti, router]);

  const hepsiSecili = secili.size === workspaceler.length && workspaceler.length > 0;

  async function tahminAl(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      setTahmin(
        await apiFetch<BulkRefreshEstimate>('/sync/bulk-refresh', {
          method: 'POST',
          body: JSON.stringify({
            clientIds: [...secili],
            years: yil,
            breakdowns: kirilimlar,
            apply: false,
          }),
        }),
      );
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Tahmin alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function baslat(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<BulkRefreshStarted>('/sync/bulk-refresh', {
        method: 'POST',
        body: JSON.stringify({
          clientIds: [...secili],
          years: yil,
          breakdowns: kirilimlar,
          apply: true,
        }),
      });
      localStorage.setItem('advetics.topluTazeleme', r.batchId);
      setParti(r.batchId);
      setTahmin(null);
      setAcik(false);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Tazeleme başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Tüm verileri güncelle</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Seçtiğin workspace’lerin geçmiş verisini tek seferde çeker: kampanya yapısı ve
            günlük metrikler. Saatler sürebilir ve platform kotası harcar.
          </p>
        </div>
        {!parti && (
          <button
            type="button"
            onClick={() => setAcik((v) => !v)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken"
          >
            {acik ? 'Kapat' : 'Workspace seç'}
          </button>
        )}
      </div>

      {hata && (
        <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {hata}
        </p>
      )}

      {/* ── İLERLEME ── */}
      {parti && ilerleme && (
        <div className="mt-4 rounded-lg border border-line bg-surface-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/*
              AŞAMA METNİ YÜZDENİN YANINDA. Yüzde tek başına "neyin %40'ı"
              sorusunu cevaplamıyor ve kullanıcı saatlerce bir sayıya bakıyor.
            */}
            <span className="font-medium text-ink">{ilerleme.asama}</span>
            <span className="text-ink-muted">
              {ilerleme.tamamlanan + ilerleme.dusen} / {ilerleme.toplam} iş
              {ilerleme.kalanSaniye !== null && ` · tahmini ${sureMetni(ilerleme.kalanSaniye)}`}
              {/*
                TAHMİN YOKKEN "hesaplanıyor" YAZILIYOR, boş bırakılmıyor.
                Boş alan "tahmin yok" ile "tahmin sıfır" arasında ayrım
                yapmıyor ve kullanıcı ikincisini bekliyor.
              */}
              {ilerleme.kalanSaniye === null && !ilerleme.bitti && ' · süre hesaplanıyor'}
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
              style={{ width: `${ilerleme.yuzde}%` }}
              role="progressbar"
              aria-valuenow={ilerleme.yuzde}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>
              %{ilerleme.yuzde} · {ilerleme.dateFrom} — {ilerleme.dateTo} ·{' '}
              {ilerleme.clientCount} workspace
            </span>
            <span className="flex items-center gap-3">
              {/*
                DÜŞEN İŞ AYRICA YAZILIYOR. Çubuk %100'e ulaştığında hepsinin
                başarılı olduğu anlamına gelmiyor — düşenler de "bitmiş"
                sayılıyor, yoksa çubuk kalıcı olarak takılırdı.
              */}
              {ilerleme.dusen > 0 && (
                <span className="text-danger">{ilerleme.dusen} iş düştü</span>
              )}
              {ilerleme.atlanan > 0 && (
                <span>{ilerleme.atlanan} iş zaten kuyruktaydı</span>
              )}
              {ilerleme.bitti ? (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('advetics.topluTazeleme');
                    setParti(null);
                    setIlerleme(null);
                  }}
                  className="font-medium text-brand-strong hover:underline"
                >
                  Kapat
                </button>
              ) : (
                <Nokta />
              )}
            </span>
          </div>

          {ilerleme.dusen > 0 && (
            <p className="mt-2 text-[11px] text-ink-muted">
              Düşen işlerin sebebi Senkronizasyon ekranında iş bazında yazılı.
            </p>
          )}
        </div>
      )}

      {/* ── SEÇİM ── */}
      {acik && !parti && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-muted">
              {secili.size} / {workspaceler.length} workspace seçildi
            </span>
            <button
              type="button"
              onClick={() =>
                setSecili(hepsiSecili ? new Set() : new Set(workspaceler.map((w) => w.id)))
              }
              className="text-[11px] font-medium text-brand-strong hover:underline"
            >
              {hepsiSecili ? 'Seçimi kaldır' : 'Hepsini seç'}
            </button>
          </div>

          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
            {workspaceler.map((w) => (
              <li key={w.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-surface-sunken">
                  <input
                    type="checkbox"
                    checked={secili.has(w.id)}
                    onChange={() => {
                      const y = new Set(secili);
                      if (y.has(w.id)) y.delete(w.id);
                      else y.add(w.id);
                      setSecili(y);
                      setTahmin(null);
                    }}
                    className="h-3.5 w-3.5 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{w.name}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs">
              <span className="text-ink-muted">Geriye</span>
              <select
                value={yil}
                onChange={(e) => {
                  setYil(Number(e.target.value));
                  setTahmin(null);
                }}
                className="ml-2 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
              >
                <option value={1}>1 yıl</option>
                <option value={2}>2 yıl</option>
                <option value={3}>3 yıl</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={kirilimlar}
                onChange={(e) => {
                  setKirilimlar(e.target.checked);
                  setTahmin(null);
                }}
                className="h-3.5 w-3.5 accent-[var(--brand-primary)]"
              />
              {/*
                KIRILIM VARSAYILAN KAPALI ve maliyeti YAZILI. Pencere başına
                beş ek platform çağrısı demek; sessizce açık gelmesi kotayı
                iki katına çıkarırdı.
              */}
              Kitle kırılımları da çekilsin (yaş, cinsiyet, şehir…) — kotayı ~2× artırır
            </label>
          </div>

          {/*
            TAHMİN ÖNCE. Kota geri alınamaz biçimde harcanıyor; kullanıcı kaç
            iş açılacağını görmeden başlatmamalı.
          */}
          {tahmin === null ? (
            <button
              type="button"
              onClick={() => void tahminAl()}
              disabled={busy || secili.size === 0}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
            >
              {busy ? <>Hesaplanıyor <Nokta className="ml-1" /></> : 'Ne kadar sürecek?'}
            </button>
          ) : (
            <div className="rounded-lg border border-warn/30 bg-warn/5 p-3">
              <p className="text-xs text-ink">
                <strong>{tahmin.accountCount} reklam hesabı</strong> için{' '}
                <strong>{tahmin.jobCount} iş</strong> açılacak —{' '}
                {tahmin.dateFrom} ile {tahmin.dateTo} arası, {tahmin.windowCount} pencere.
              </p>
              {/*
                YAPI TARAMASI OLMAYAN HESAP SAYISI YAZILI ama iş ATLANMIYOR:
                yapı işi planın ilk adımı ve aynı turda koşuyor.
              */}
              {tahmin.noStructure > 0 && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  {tahmin.noStructure} hesabın yapı taraması hiç koşmamış — önce o
                  çekilecek, metrikler ondan sonra yazılabiliyor.
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-muted">
                Bu işlem platform kotası harcıyor ve geri alınamıyor. Kotaya takılan işler
                düşmüyor, bekliyor.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void baslat()}
                  disabled={busy || tahmin.accountCount === 0}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? <>Başlatılıyor <Nokta className="ml-1" /></> : 'Başlat'}
                </button>
                <button
                  type="button"
                  onClick={() => setTahmin(null)}
                  disabled={busy}
                  className="text-xs text-ink-muted hover:underline"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Saniyeyi okunur süreye çevirir.
 *
 * "8400 saniye" hiçbir şey söylemiyor; "2 sa 20 dk" kullanıcının bekleyip
 * beklemeyeceğine karar vermesini sağlıyor.
 */
function sureMetni(saniye: number): string {
  if (saniye < 60) return 'bir dakikadan az';
  const dk = Math.round(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  const kalan = dk % 60;
  return kalan === 0 ? `${sa} sa` : `${sa} sa ${kalan} dk`;
}
