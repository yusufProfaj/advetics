'use client';

import { useEffect, useState } from 'react';
import type { ConnectionSummary, GeoLocationOption, SavedAudienceList } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ ÖN AYAR HEDEFLEMESİ — ŞEHİR VE KAYITLI KİTLE ═══
 *
 * Bu blok uzun süre yoktu ve eksikliği somut: şema `locations` ile
 * `savedAudienceId`i baştan taşıyordu ama form ikisine de SABİT boş değer
 * yazıyordu. Kullanıcının tarifi "şehir seçimi ve reklam hesabındaki özel
 * hedef kitleyi seçebilmem lazım" oldu.
 *
 * REKLAM HESABI BURADA ÇÖZÜLÜYOR ve sebebi Meta'nın kendisi: KAYITLI KİTLE
 * REKLAM HESABI BAŞINA tanımlı. Ön ayar ise müşteri (workspace) bazında.
 * Hangi hesabın kitlelerinin listelendiği EKRANDA YAZIYOR — yazmasaydı,
 * iki hesaplı bir müşteride kullanıcı yanlış hesabın kitlesini seçip
 * yayında "kitle bulunamadı" hatası alırdı.
 */
export function HedeflemeSecici({
  clientId,
  lokasyonlar,
  setLokasyonlar,
  kitleId,
  setKitleId,
}: {
  clientId: string;
  lokasyonlar: GeoLocationOption[];
  setLokasyonlar: (v: GeoLocationOption[]) => void;
  kitleId: string | null;
  setKitleId: (v: string | null) => void;
}) {
  const [hesap, setHesap] = useState<{ id: string; name: string } | null>(null);
  const [hesapHata, setHesapHata] = useState<string | null>(null);
  const [kitleler, setKitleler] = useState<SavedAudienceList | null>(null);
  const [kitleHata, setKitleHata] = useState<string | null>(null);

  const [arama, setArama] = useState('');
  const [sonuc, setSonuc] = useState<GeoLocationOption[]>([]);
  const [aramaDurum, setAramaDurum] = useState<'bos' | 'kisa' | 'araniyor' | 'bitti'>('bos');
  const [aramaHata, setAramaHata] = useState<string | null>(null);

  /* Müşterinin İZLENEN Meta reklam hesabı — kitle ve lokasyon aramasının kaynağı. */
  useEffect(() => {
    void apiFetch<ConnectionSummary[]>('/connections')
      .then((baglantilar) => {
        const bulunan = baglantilar
          .flatMap((b) => b.adAccounts)
          .find((a) => a.platform === 'meta' && a.clientId === clientId && a.syncEnabled);
        setHesap(bulunan ? { id: bulunan.id, name: bulunan.name } : null);
        setHesapHata(null);
      })
      .catch((err: unknown) =>
        setHesapHata(
          err instanceof ApiRequestError ? err.message : 'Reklam hesabı okunamadı.',
        ),
      );
  }, [clientId]);

  /* Kayıtlı kitleler — HATA YUTULMUYOR (bkz. manual-boost'taki aynı ders). */
  useEffect(() => {
    if (!hesap) return;
    setKitleHata(null);
    void apiFetch<SavedAudienceList>(
      `/connections/targeting/saved-audiences?adAccountId=${hesap.id}`,
    )
      .then((k) => setKitleler(k))
      .catch((err: unknown) => {
        setKitleler(null);
        setKitleHata(
          err instanceof ApiRequestError ? err.message : 'Kayıtlı kitleler alınamadı.',
        );
      });
  }, [hesap]);

  /* Şehir araması — 350ms bekleme, en az iki harf. Her tuşa istek Meta kotasını yakar. */
  useEffect(() => {
    setAramaHata(null);
    if (!hesap) return;
    const q = arama.trim();
    if (q.length === 0) {
      setAramaDurum('bos');
      setSonuc([]);
      return;
    }
    if (q.length < 2) {
      setAramaDurum('kisa');
      setSonuc([]);
      return;
    }
    setAramaDurum('araniyor');
    const t = setTimeout(() => {
      void apiFetch<GeoLocationOption[]>(
        `/connections/targeting/locations?adAccountId=${hesap.id}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          setSonuc(r);
          setAramaDurum('bitti');
        })
        .catch((err: unknown) => {
          setSonuc([]);
          setAramaDurum('bitti');
          setAramaHata(
            err instanceof ApiRequestError ? err.message : 'Lokasyon araması düştü.',
          );
        });
    }, 350);
    return () => clearTimeout(t);
  }, [arama, hesap]);

  if (hesapHata !== null) {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[11px] text-danger">
        Reklam hesabı okunamadı — {hesapHata}
      </p>
    );
  }

  if (hesap === null) {
    /*
     * HEDEFLEME KAPALI VE SEBEBİ YAZILI. Boş bir arama kutusu göstermek,
     * yazdıkça hiçbir şey gelmeyen bir alan bırakmak olurdu.
     */
    return (
      <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[11px] text-ink">
        Bu workspace’e izlenen bir Meta reklam hesabı atanmamış. Şehir ve kayıtlı
        kitle seçimi hesap atandıktan sonra açılıyor; şu hâliyle hedefleme{' '}
        <strong>Türkiye geneli</strong> olacak.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <p className="text-xs font-medium text-ink">Hedefleme</p>

      <label className="block">
        <span className="text-[11px] text-ink-muted">
          Kayıtlı kitle — <strong>{hesap.name}</strong> hesabından
        </span>
        <select
          value={kitleId ?? ''}
          onChange={(e) => setKitleId(e.target.value || null)}
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="">Kullanma — aşağıdan şehir seçeyim</option>
          {(kitleler?.items ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.approximateCount !== null ? ` · ~${k.approximateCount} kişi` : ''}
            </option>
          ))}
        </select>
      </label>

      {/* ÜÇ HÂL AYRI: çağrı düştü · kitle yok · kitleler geldi. */}
      {kitleHata !== null && (
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-2 py-1 text-[11px] text-danger">
          Kayıtlı kitleler alınamadı — {kitleHata}
        </p>
      )}
      {kitleHata === null && kitleler && kitleler.items.length === 0 && (
        <p className="text-[11px] text-ink-muted">
          Bu hesapta kayıtlı kitle yok — aşağıdan şehir seçebilirsin.
        </p>
      )}

      {kitleId ? (
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
          Kayıtlı kitle seçili. Şehir, yaş ve cinsiyet <strong>kullanılmıyor</strong> —
          hedeflemeyi kitlenin kendi tanımı belirliyor.
        </p>
      ) : (
        <>
          <label className="block">
            <span className="text-[11px] text-ink-muted">Şehir / bölge ekle</span>
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="İzmir"
              className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          {aramaDurum === 'kisa' && (
            <p className="text-[11px] text-ink-muted">En az iki harf yaz.</p>
          )}
          {aramaDurum === 'araniyor' && (
            <p className="text-[11px] text-ink-muted">Aranıyor…</p>
          )}
          {aramaHata !== null && (
            <p className="rounded-lg border border-danger/40 bg-danger/5 px-2 py-1 text-[11px] text-danger">
              {aramaHata}
            </p>
          )}
          {aramaDurum === 'bitti' && aramaHata === null && sonuc.length === 0 && (
            <p className="text-[11px] text-ink-muted">Sonuç yok.</p>
          )}

          {sonuc.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {sonuc.map((o) => (
                <li key={`${o.type}:${o.key}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!lokasyonlar.some((l) => l.key === o.key && l.type === o.type)) {
                        setLokasyonlar([...lokasyonlar, o]);
                      }
                      setArama('');
                    }}
                    className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-surface-muted"
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {lokasyonlar.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {lokasyonlar.map((l) => (
                <span
                  key={`${l.type}:${l.key}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px]"
                >
                  {l.label}
                  <button
                    type="button"
                    onClick={() =>
                      setLokasyonlar(
                        lokasyonlar.filter((x) => !(x.key === l.key && x.type === l.type)),
                      )
                    }
                    className="text-ink-muted hover:text-danger"
                    aria-label="Kaldır"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-ink-muted">
            {lokasyonlar.length === 0
              ? 'Şehir seçilmezse hedefleme Türkiye geneli olur.'
              : 'Seçilen yerler BİRLEŞİM olarak uygulanıyor; ülke geneli ayrıca gönderilmiyor.'}
          </p>
        </>
      )}
    </div>
  );
}
