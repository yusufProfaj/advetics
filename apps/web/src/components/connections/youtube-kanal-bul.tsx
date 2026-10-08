'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { YoutubeKanalOnerileri, YoutubeKanalOnerisi } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';

/**
 * ═══ YOUTUBE KANALINI BUL ═══
 *
 * Kullanıcının isteği: "şirketin ismini yazsam kanalları gösterse ya da
 * kendisi bulsa, ben bu deyip onaylasam". Adres yapıştırma
 * (`YouTubeKanalEkle`) yedek olarak duruyor.
 *
 * İKİ KİP:
 *   · WORKSPACE İÇİNDE (`clientId` var): pencere açılınca kanıtlı öneriler
 *     (site + Google Ads) kendiliğinden geliyor; "Bu kanal" havuza ekleyip
 *     BU workspace'e atıyor. Atama mevcut uçtan (`social-profiles/:id/client`)
 *     geçiyor: denetim kaydı ve abonelik orada.
 *   · HAVUZ EKRANINDA (`clientId` yok): yalnızca arama; "Havuza ekle".
 *     Workspace seçimi bugünkü gibi ayrı adım.
 *
 * DÖRT HÂL AYRI YAZILIYOR (CLAUDE.md, `.catch(() => setX([]))` yasağı):
 * henüz aranmadı, aranıyor, sonuç yok (+ neden), hata (+ sunucunun cümlesi).
 */
type Durum =
  | { tur: 'bos' }
  | { tur: 'yukleniyor'; ne: 'oneri' | 'arama' }
  | { tur: 'sonuc'; ne: 'oneri' | 'arama'; veri: YoutubeKanalOnerileri }
  | { tur: 'hata'; ne: 'oneri' | 'arama'; mesaj: string };

const KAYNAK_ETIKETI: Record<YoutubeKanalOnerisi['kaynaklar'][number]['tur'], string> = {
  site: 'Sitede',
  google_ads: 'Google Ads',
  arama: 'Arama',
};

export function YouTubeKanalBul({
  clientId,
  workspaceAdi,
}: {
  clientId: string | null;
  /** Arama kutusunun ilk değeri ve onay cümlesindeki ad. */
  workspaceAdi: string | null;
}) {
  const router = useRouter();
  const [durum, setDurum] = useState<Durum>({ tur: 'bos' });
  const [q, setQ] = useState(workspaceAdi ?? '');
  const [ekleniyor, setEkleniyor] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<{ ton: 'ok' | 'hata'; metin: string } | null>(null);

  const onerileriGetir = useCallback(async () => {
    if (!clientId) return;
    setDurum({ tur: 'yukleniyor', ne: 'oneri' });
    try {
      const veri = await apiFetch<YoutubeKanalOnerileri>(
        `/autoboost/youtube/kanal-onerileri?clientId=${encodeURIComponent(clientId)}`,
      );
      setDurum({ tur: 'sonuc', ne: 'oneri', veri });
    } catch (err) {
      setDurum({
        tur: 'hata',
        ne: 'oneri',
        mesaj: err instanceof ApiRequestError ? err.message : 'Öneriler alınamadı.',
      });
    }
  }, [clientId]);

  useEffect(() => {
    void onerileriGetir();
  }, [onerileriGetir]);

  async function ara(): Promise<void> {
    const metin = q.trim();
    if (metin.length < 2) return;
    setDurum({ tur: 'yukleniyor', ne: 'arama' });
    setBildirim(null);
    try {
      const parametre = new URLSearchParams({ q: metin, ...(clientId ? { clientId } : {}) });
      const veri = await apiFetch<YoutubeKanalOnerileri>(`/autoboost/youtube/kanal-ara?${parametre}`);
      setDurum({ tur: 'sonuc', ne: 'arama', veri });
    } catch (err) {
      setDurum({
        tur: 'hata',
        ne: 'arama',
        mesaj: err instanceof ApiRequestError ? err.message : 'Arama yapılamadı.',
      });
    }
  }

  /**
   * "BU KANAL" — onay, havuza ekle, (workspace içindeyse) ata.
   *
   * İki istek sırayla ve ikincisi düşerse kanal HAVUZDA kalıyor: bu, kaybolmuş
   * değil görünür bir ara hâl ve bildirim tam olarak bunu söylüyor.
   */
  async function sec(k: YoutubeKanalOnerisi): Promise<void> {
    const hedef = clientId
      ? `"${k.title}" kanalı ${workspaceAdi ? `"${workspaceAdi}"` : 'bu'} workspace'ine bağlansın mı? Yeni videoları Akıllı Boost'a kart olarak düşecek.`
      : `"${k.title}" kanalı havuza eklensin mi?`;
    if (!window.confirm(hedef)) return;
    setEkleniyor(k.channelId);
    setBildirim(null);
    let profilId = k.mevcut?.socialProfileId ?? null;
    try {
      if (!profilId) {
        const r = await apiFetch<{ socialProfileId: string; title: string }>('/autoboost/youtube/channels', {
          method: 'POST',
          body: JSON.stringify({ channelInput: k.channelId }),
        });
        profilId = r.socialProfileId;
      }
    } catch (err) {
      setBildirim({ ton: 'hata', metin: err instanceof ApiRequestError ? err.message : 'Kanal eklenemedi.' });
      setEkleniyor(null);
      return;
    }
    if (!clientId) {
      setBildirim({ ton: 'ok', metin: `${k.title} havuza eklendi. Aşağıdan bir workspace'e ata.` });
      setEkleniyor(null);
      router.refresh();
      return;
    }
    try {
      await apiFetch(`/connections/social-profiles/${profilId}/client`, {
        method: 'PATCH',
        body: JSON.stringify({ clientId }),
      });
      setBildirim({ ton: 'ok', metin: `${k.title} bu workspace'e bağlandı. Yeni videolar Akıllı Boost'a kart olarak düşecek.` });
      router.refresh();
      void onerileriGetir();
    } catch (err) {
      setBildirim({
        ton: 'hata',
        metin: `${k.title} havuza eklendi ama bu workspace'e atanamadı: ${
          err instanceof ApiRequestError ? err.message : 'bilinmeyen hata'
        }. Havuzdan ekleyerek tekrar dene.`,
      });
    } finally {
      setEkleniyor(null);
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ara();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">YouTube’da kanal ara</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma ya da kanal adı"
            maxLength={80}
            className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-sm focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand/30"
          />
        </label>
        <Dugme
          ton="ikincil"
          boyut="kucuk"
          type="submit"
          bekliyor={durum.tur === 'yukleniyor' && durum.ne === 'arama'}
          disabled={q.trim().length < 2 || durum.tur === 'yukleniyor'}
        >
          YouTube’da ara
        </Dugme>
      </form>
      <p className="text-[11px] text-ink-muted">
        {clientId
          ? 'Öneriler workspace sitesinden ve Google Ads geçmişinden gelir. İsimle arama YouTube kotasını kullanır; aynı arama 24 saat önbellekte tutulur.'
          : 'İsimle arama YouTube kotasını kullanır; aynı arama 24 saat önbellekte tutulur.'}
      </p>

      {bildirim && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            bildirim.ton === 'ok' ? 'border-ok/40 bg-ok-soft text-ok-strong' : 'border-danger/40 bg-danger-soft text-danger-strong'
          }`}
          aria-live="polite"
        >
          {bildirim.metin}
        </p>
      )}

      {durum.tur === 'yukleniyor' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {durum.ne === 'oneri' ? 'Site ve Google Ads geçmişi taranıyor…' : 'YouTube aranıyor…'}
        </p>
      )}
      {durum.tur === 'hata' && (
        <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-strong">
          {durum.ne === 'oneri' ? 'Öneriler alınamadı: ' : 'Arama yapılamadı: '}
          {durum.mesaj}
        </p>
      )}
      {durum.tur === 'sonuc' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">
            {durum.ne === 'oneri' ? 'Önerilen kanallar' : 'Arama sonuçları'} ({durum.veri.oneriler.length})
          </p>
          {durum.veri.oneriler.length > 0 && (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto overscroll-contain">
              {durum.veri.oneriler.map((k) => (
                <OneriSatiri
                  key={k.channelId}
                  k={k}
                  workspaceVar={clientId !== null}
                  bekliyor={ekleniyor === k.channelId}
                  kapali={ekleniyor !== null}
                  onSec={() => void sec(k)}
                />
              ))}
            </ul>
          )}
          {/* BOŞ LİSTE NEDENİNİ SÖYLÜYOR: notlar her kaynağın ne olduğunu yazıyor. */}
          {durum.veri.notlar.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-ink-muted">
              {durum.veri.notlar.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function OneriSatiri({
  k,
  workspaceVar,
  bekliyor,
  kapali,
  onSec,
}: {
  k: YoutubeKanalOnerisi;
  workspaceVar: boolean;
  bekliyor: boolean;
  kapali: boolean;
  onSec: () => void;
}) {
  const engel =
    k.mevcut?.durum === 'baska_workspacete'
      ? `${k.mevcut.workspaceAdi ?? 'Başka bir'} workspace'ine bağlı. Önce oradan kaldır.`
      : k.mevcut?.durum === 'bu_workspacete'
        ? 'Bu workspace’e zaten bağlı.'
        : !workspaceVar && k.mevcut?.durum === 'havuzda'
          ? 'Zaten havuzda.'
          : null;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-line bg-surface p-2.5">
      {k.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- YouTube görseli, Next görsel iyileştiricisinden geçmiyor
        <img src={k.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="h-10 w-10 shrink-0 rounded-full bg-surface-sunken" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">
          <a
            href={`https://www.youtube.com/channel/${k.channelId}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {k.title}
          </a>
        </p>
        <p className="text-xs text-ink-muted">
          {[
            k.handle,
            k.aboneSayisi === null ? 'abone sayısı gizli' : `${formatNumber(k.aboneSayisi)} abone`,
            k.videoSayisi === null ? null : `${formatNumber(k.videoSayisi)} video`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <ul className="mt-1 space-y-0.5">
          {k.kaynaklar.map((x) => (
            <li key={x.tur + x.aciklama} className="text-[11px] text-ink-muted">
              <span
                className={`mr-1 rounded px-1 py-px font-medium ${
                  x.tur === 'arama' ? 'bg-surface-sunken text-ink-muted' : 'bg-ok-soft text-ok-strong'
                }`}
              >
                {KAYNAK_ETIKETI[x.tur]}
              </span>
              {x.aciklama}
            </li>
          ))}
        </ul>
        {engel && <p className="mt-1 text-[11px] font-medium text-ink-muted">{engel}</p>}
      </div>
      <Dugme boyut="kucuk" bekliyor={bekliyor} disabled={kapali || engel !== null} onClick={onSec}>
        {workspaceVar ? 'Bu kanal' : 'Havuza ekle'}
      </Dugme>
    </li>
  );
}
