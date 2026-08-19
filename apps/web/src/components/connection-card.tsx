'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionSummary } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo, adAccountKanali } from '@/components/platform-logo';
import { AccountPicker, type PickerClient } from './account-picker';
import { SocialProfileList } from './social-profile-list';

const PLATFORM_LABEL: Record<string, string> = {
  meta: 'Meta',
  google: 'Google Ads',
};

/**
 * Kart başlığı.
 *
 * PLATFORM ADI İKİ KEZ YAZILMIYOR. Google'ın etiketi "Google Ads" ile
 * başlıyor ve başlık "Google Ads · Google Ads" oluyordu; Meta'da etiket
 * işletme adı olduğu için orada birleştirme doğru.
 *
 * BAŞLIKTA HESAP SAYISI YOK. Etiket (`accountLabel`) yalnızca yetkilendirme
 * anında yazılıyor, yani donmuş bir anlık görüntü — sayıyı oraya koymak,
 * "Hesapları yenile" sonrası gerçekle ayrışan bir rakam bırakmak demek.
 * Kaç hesap olduğunu hemen aşağıdaki seçici canlı veriden söylüyor.
 */
function headline(c: ConnectionSummary): string {
  const platform = PLATFORM_LABEL[c.platform] ?? c.platform;
  const label = c.accountLabel?.trim();
  if (!label) return platform;
  return label === platform || label.startsWith(`${platform} `)
    ? label
    : `${platform} · ${label}`;
}

const STATUS: Record<
  ConnectionSummary['status'],
  { label: string; cls: string; dot: string }
> = {
  active: { label: 'Aktif', cls: 'text-emerald-700', dot: 'bg-emerald-500' },
  needs_reauth: { label: 'Yeniden yetkilendirme gerekli', cls: 'text-amber-700', dot: 'bg-amber-500' },
  error: { label: 'Hata', cls: 'text-red-700', dot: 'bg-red-500' },
  revoked: { label: 'Kaldırıldı', cls: 'text-ink-muted', dot: 'bg-slate-400' },
};

export function ConnectionCard({
  connection,
  clients,
  canManage,
  compact = false,
}: {
  connection: ConnectionSummary;
  clients: PickerClient[];
  /** Org yöneticisi mi — bağlantıyı ve hesap atamalarını değiştirebilir. */
  canManage: boolean;
  /**
   * HESAP LİSTESİNİ GİZLER — kart yalnızca BAĞLANTININ DURUMUNU gösterir.
   *
   * Bağlantı ekranında hesaplar artık havuz kartlarından ve arama kutulu
   * pop-up'tan atanıyor; aynı listeyi burada ikinci kez basmak ekranı
   * metrelerce uzatıyordu (284 hesap). Kartın burada kalmasının sebebi başka:
   * token süresi, eksik izinler ve "yeniden yetkilendir" düğmesi yalnızca
   * burada var.
   *
   * VARSAYILAN KAPALI: bayrağı almayan bir çağıran eski davranışı görüyor.
   */
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = STATUS[connection.status];

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  }

  async function reauthorize() {
    const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
      `/connections/${connection.id}/reauthorize?platform=${connection.platform}`,
      { method: 'POST' },
    );
    window.location.href = authorizeUrl;
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              {/* BAĞLANTININ PLATFORMU ROZETTE: kart artık hesap listesi
                  taşımıyor (havuz kartlarına taşındı) ve başlık metni tek
                  başına hangi platform olduğunu ayırt etmenin tek yoluydu. */}
              <PlatformLogo
                kind={adAccountKanali(connection.platform)}
                className="h-4 w-4 shrink-0"
              />
              {headline(connection)}
            </h3>
          </div>
          <p className={`mt-1 text-xs ${status.cls}`}>
            {status.label}
            {connection.lastErrorCode ? ` (kod ${connection.lastErrorCode})` : ''}
            {connection.lastVerifiedAt
              ? ` · son doğrulama ${new Date(connection.lastVerifiedAt).toLocaleString('tr-TR')}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run('verify', () => apiFetch(`/connections/${connection.id}/verify`, { method: 'POST' }))}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition hover:bg-surface-muted disabled:opacity-50"
          >
            {busy === 'verify' ? '…' : 'Doğrula'}
          </button>
          <button
            type="button"
            onClick={() => void run('refresh', () => apiFetch(`/connections/${connection.id}/refresh-accounts`, { method: 'POST' }))}
            disabled={busy !== null || isPending}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition hover:bg-surface-muted disabled:opacity-50"
          >
            {busy === 'refresh' ? '…' : 'Hesapları yenile'}
          </button>
          {/* Yeniden yetkilendirme ve kaldırma ORG YÖNETİCİSİ işi: ajans
              geneli bir bağlantı bütün müşterileri besliyor. API de öyle
              diyor — düğmeyi herkese göstermek, tıklayınca 403 almak demekti. */}
          {canManage &&
            (connection.status === 'needs_reauth' ||
              connection.missingScopes.length > 0 ||
              connection.missingOptionalScopes.length > 0) && (
            <button
              type="button"
              onClick={() => void run('reauth', reauthorize)}
              disabled={busy !== null || isPending}
              className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'reauth' ? '…' : 'Yeniden yetkilendir'}
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => {
                // UYARI METNİ ARTIK BÜTÜN MÜŞTERİLERİ SÖYLÜYOR. Bağlantı
                // ajansa ait; kaldırmak tek bir müşterinin değil, o bağlantıya
                // bağlı HER hesabın senkronizasyonunu durduruyor.
                if (
                  !confirm(
                    'Bu bağlantı ajansa ait ve altındaki TÜM müşterilerin hesaplarını besliyor. ' +
                      'Kaldırılırsa hepsinin senkronizasyonu durur. Geçmiş veriler korunur. Devam?',
                  )
                ) {
                  return;
                }
                void run('disconnect', () => apiFetch(`/connections/${connection.id}/disconnect`, { method: 'POST' }));
              }}
              disabled={busy !== null || isPending}
              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'disconnect' ? '…' : 'Kaldır'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Çekirdek izin eksiği = bağlantı iş görmez → uyarı */}
      {connection.missingScopes.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
          <strong>Eksik çekirdek izinler:</strong> {connection.missingScopes.join(', ')}
          <p className="mt-1 text-xs">
            Bu izinler olmadan senkronizasyon ve otomasyon çalışmaz.
          </p>
        </div>
      )}

      {/* Özellik izin eksiği = bağlantı çalışır, özellik kapalı → bilgi.
          Meta App Review izinleri tek tek onayladığı için aşamalı başvuru
          normaldir; bunu hata gibi göstermek kullanıcıyı yanıltır. */}
      {connection.missingOptionalScopes.length > 0 && connection.missingScopes.length === 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
          <strong>Auto-Boost için ek izin bekliyor</strong>
          <p className="mt-1 text-xs text-ink-muted">
            Bağlantı çalışıyor. Eksik: {connection.missingOptionalScopes.join(', ')} — bu izinler
            Meta App Review&apos;dan onaylandıktan sonra &quot;Yeniden yetkilendir&quot; ile
            eklenebilir.
          </p>
        </div>
      )}

      {/* Reklam hesapları — AYRI BİLEŞENDE.
          Google Basic Access'ten sonra tek bağlantı 129 hesap getirdi ve düz
          liste hem aramayı hem "neyi izliyorum" sorusunu imkânsız kıldı. */}
      {!compact && (
        <AccountPicker
          accounts={connection.adAccounts}
          clients={clients}
          canManage={canManage}
        />
      )}

      {/* Sosyal profiller — yalnızca Meta. Reklam hesaplarıyla AYNI havuz
          modeli: sayfa da ajansa ait ve müşteriye atanıyor. */}
      {!compact && connection.socialProfiles.length > 0 && (
        <SocialProfileList
          profiles={connection.socialProfiles}
          clients={clients}
          canManage={canManage}
        />
      )}

      {/* SAYILAR YİNE YAZILI: liste gizlense de "bu bağlantı ne getirdi"
          sorusu cevapsız kalmamalı. */}
      {compact && (
        <p className="mt-3 text-[11px] text-ink-muted">
          {connection.adAccounts.length} reklam hesabı ·{' '}
          {connection.socialProfiles.length} sayfa/kanal keşfedildi. Atama havuz
          kartlarından yapılıyor.
        </p>
      )}
    </section>
  );
}
