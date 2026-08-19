'use client';

import { useState } from 'react';
import type { Platform, ProviderAvailability } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

const LABELS: Record<Platform, string> = {
  meta: 'Meta (Facebook / Instagram)',
  google: 'Google Ads',
};

/**
 * HEDEF WORKSPACE ÜST BARDAN GELİYOR — burada ikinci bir seçici YOK.
 *
 * Aktif workspace zaten üst bardaki değiştiricide seçili ve panelin her
 * yerinde geçerli olan bağlam o. Buraya ikinci bir müşteri seçici koymak, bu
 * turda kaldırılan hatanın aynısını üretirdi: iki denetim, iki cevap.
 *
 * WORKSPACE SEÇİLİ DEĞİLKEN BAĞLANILAMIYOR. Eskiden bağlantı ajans havuzuna
 * kuruluyordu ve keşfedilen hesaplar tek tek müşterilere atanıyordu; artık
 * bağlantı doğrudan bir workspace'e kuruluyor ve hesaplar oraya yazılıyor.
 * Hedefi belirsiz bırakıp havuza düşürmek, kullanıcının hangi müşteriye
 * bağladığını bilmemesi demekti — bu ekranın geçmişteki tam olarak bu hatası
 * 157 hesabın yanlış yere düşmesiyle sonuçlanmıştı.
 */
export function ConnectButtons({
  availability,
  activeClientId,
  activeClientName,
}: {
  availability: ProviderAvailability[];
  activeClientId: string | null;
  activeClientName: string | null;
}) {
  const [pending, setPending] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(platform: Platform) {
    setError(null);
    setPending(platform);
    try {
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
        '/connections/authorize',
        {
          method: 'POST',
          body: JSON.stringify({
            platform,
            redirectTo: '/ayarlar/baglantilar',
            clientId: activeClientId,
          }),
        },
      );
      // Yönlendirmeyi tarayıcı yapmalı: fetch üzerinden gelen bir 302,
      // platformun izin ekranını görünmez kılar.
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Bağlantı başlatılamadı');
      setPending(null);
    }
  }

  const workspaceYok = activeClientId === null;

  return (
    <div className="mt-4 space-y-3">
      {/* HEDEF YAZILI. "Bağlan" düğmesinin hangi workspace'e bağlayacağı
          ekranda görünmeden tıklanmamalı — geri alması pahalı bir işlem. */}
      {workspaceYok ? (
        <div className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5">
          <p className="text-sm font-semibold text-ink">Önce bir workspace seç</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Bağlantı ve keşfedilen bütün reklam hesapları seçtiğin workspace’e
            yazılıyor. Üst bardaki değiştiriciden müşteriyi seç, sonra bağlan.
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Bağlantı <span className="font-semibold text-ink">{activeClientName}</span>{' '}
          workspace’ine kurulacak; keşfedilen reklam hesapları ve sayfalar
          doğrudan ona yazılacak.
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {availability.map((a) => (
          <div key={a.platform} className="rounded-lg border border-line p-4">
            <p className="text-sm font-medium">{LABELS[a.platform]}</p>

            {a.configured ? (
              <button
                type="button"
                onClick={() => void connect(a.platform)}
                disabled={pending !== null || workspaceYok}
                className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === a.platform ? 'Yönlendiriliyor…' : 'Bağlan'}
              </button>
            ) : (
              <div className="mt-3">
                <button
                  type="button"
                  disabled
                  title={`Eksik yapılandırma: ${a.missingConfig.join(', ')}`}
                  className="w-full cursor-not-allowed rounded-lg border border-line px-3 py-2 text-sm text-ink-muted opacity-60"
                >
                  Yapılandırılmadı
                </button>
                <p className="mt-2 text-xs text-ink-muted">
                  Eksik: {a.missingConfig.join(', ')}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
