'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * ═══ YÖNETİM PANELİ — TÜM WORKSPACE'LER TEK PENCEREDE ═══
 *
 * Müşteri seçici bir açılır liste ve on beş müşteriden sonra kaydırmadan
 * okunmuyor; ayrıca yalnızca ADI gösteriyor. "Hangi müşteriye geçeyim"
 * sorusunun cevabı çoğu zaman addan değil DURUMDAN geliyor: kaç reklam
 * hesabı var, kaçı izlemede, ekip kaç kişi.
 *
 * Bu pencere o bilgiyi taşıyor ve aramayla birlikte veriyor. Seçim yapıldığı
 * anda kapanıp o müşterinin görünümüne geçiyor.
 *
 * VERİ AÇILDIĞINDA ÇEKİLİYOR, önden değil: pencere çoğu oturumda hiç
 * açılmıyor ve `/clients` her müşterinin hesap listesini taşıyor. Kapalı bir
 * pencere için her sayfa yüklemesinde o isteği yapmak, panelin ilk ekranını
 * yavaşlatırdı.
 */
interface WorkspaceOzeti {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { adAccounts: number; memberships: number };
  adAccounts: Array<{ syncEnabled: boolean }>;
}

export function YonetimPaneli({
  acik,
  onKapat,
  onSec,
  activeClientId,
}: {
  acik: boolean;
  onKapat: () => void;
  onSec: (clientId: string | null) => void;
  activeClientId: string | null;
}) {
  const [veri, setVeri] = useState<WorkspaceOzeti[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState('');

  useEffect(() => {
    if (!acik || veri !== null) return;
    let iptal = false;
    apiFetch<WorkspaceOzeti[]>('/clients')
      .then((r) => {
        if (!iptal) setVeri(r);
      })
      .catch(() => {
        /*
         * HATA YUTULMUYOR. `.catch(() => setVeri([]))` yazmak "henüz
         * yüklenmedi", "hiç müşteri yok" ve "çağrı düştü" hâllerini AYNI boş
         * pencereye çevirirdi — bu projede tekrar eden hata deseni.
         */
        if (!iptal) setHata('Müşteri listesi alınamadı.');
      });
    return () => {
      iptal = true;
    };
  }, [acik, veri]);

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onKapat();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [acik, onKapat]);

  const suzulmus = useMemo(() => {
    if (!veri) return [];
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return veri;
    // Ad VE slug'da aranıyor: kullanıcı bazen adresteki kısa adı hatırlıyor.
    return veri.filter(
      (w) =>
        w.name.toLocaleLowerCase('tr').includes(q) ||
        w.slug.toLocaleLowerCase('tr').includes(q),
    );
  }, [veri, arama]);

  if (!acik) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Yönetim paneli"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onKapat();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-xl">
        <div className="border-b border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Yönetim paneli</h2>
              <p className="text-xs text-ink-muted">
                Tüm workspace&apos;ler — birini seçince o müşterinin verisine geçilir.
              </p>
            </div>
            <button
              type="button"
              onClick={onKapat}
              className="rounded-lg px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            >
              Kapat
            </button>
          </div>

          <input
            autoFocus
            type="search"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Müşteri adı ya da kısa adıyla ara…"
            className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {hata && (
            <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
              {hata}
            </p>
          )}

          {!hata && veri === null && (
            // "Yükleniyor" ile "sonuç yok" ayrı: ikisini aynı boş alana
            // çevirmek kullanıcıyı bekleyip beklememesi gerektiği konusunda
            // kör bırakıyor.
            <p className="py-8 text-center text-sm text-ink-muted">Yükleniyor…</p>
          )}

          {veri !== null && (
            <>
              {/* SESSİZ KESME YOK: kaç sonuç gösterildiği ve toplam yazılı. */}
              <p className="mb-3 text-[11px] text-ink-muted">
                {suzulmus.length} / {veri.length} workspace
              </p>

              {suzulmus.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  “{arama}” ile eşleşen workspace yok.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {suzulmus.map((w) => {
                    const izlemede = w.adAccounts.filter((a) => a.syncEnabled).length;
                    const secili = w.id === activeClientId;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onSec(w.id)}
                        className={`rounded-xl border p-3 text-left transition ${
                          secili
                            ? 'border-brand bg-brand-soft'
                            : 'border-line hover:border-brand/40 hover:bg-surface-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-[11px] font-semibold uppercase text-white">
                            {w.name.slice(0, 2)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {w.name}
                            </span>
                            <span className="block truncate text-[11px] text-ink-muted">
                              {w.slug}
                            </span>
                          </span>
                          {w.status === 'paused' && (
                            <span className="shrink-0 text-[10px] font-medium text-warn">
                              Duraklatıldı
                            </span>
                          )}
                        </div>

                        {/*
                          HESAP SAYISI VE İZLENEN SAYISI BİRLİKTE.
                          "2 hesap" tek başına, ikisi de kapalıysa yanıltıcı:
                          veri gelmiyor ama ekranda bir şeyler varmış gibi
                          duruyor.
                        */}
                        <p className="mt-2 text-[11px] text-ink-muted">
                          <strong className="text-ink">{w._count.adAccounts}</strong> reklam hesabı
                          <span className="text-ink-muted"> · {izlemede} izlemede</span>
                          <span className="text-line"> | </span>
                          <strong className="text-ink">{w._count.memberships}</strong> kişi
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
