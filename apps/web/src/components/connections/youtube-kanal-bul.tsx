'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { YoutubeKanalOnerileri, YoutubeKanalOnerisi } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { profilAtamaYolu } from '@/lib/havuz';
import { formatNumber } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { useDil, useSozluk } from '@/dil/saglayici';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

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
 *     BU workspace'e atıyor. Atama YOUTUBE UCUNDAN (`profilAtamaYolu`):
 *     sahiplik, hub aboneliği, son videoların kartı ve kanal görselinin
 *     marka logosu olması orada. Bir süre genel uç (`social-profiles/:id/
 *     client`) kullanılıyordu: kanal "bağlandı" görünüyor ama abonelik hiç
 *     kurulmuyor, Akıllı Boost'a tek kart düşmüyordu (2026-10-15).
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

/** Kaynak rozeti. "Google Ads" ürün adı, iki dilde aynı; diğer ikisi sözlükten. */
function kaynakEtiketi(
  tur: YoutubeKanalOnerisi['kaynaklar'][number]['tur'],
  d: (typeof baglantilarSozlugu)['tr']['ytBul'],
): string {
  return tur === 'google_ads' ? 'Google Ads' : d.kaynak[tur];
}

export function YouTubeKanalBul({
  clientId,
  workspaceAdi,
  baglandi,
}: {
  clientId: string | null;
  /** Arama kutusunun ilk değeri ve onay cümlesindeki ad. */
  workspaceAdi: string | null;
  /**
   * Kanal workspace'e bağlanınca. Sihirbaz durumunu istemcide okuyor;
   * `router.refresh()` onu tazelemiyor ve adım "eksik" kalırdı.
   */
  baglandi?: () => void;
}) {
  const router = useRouter();
  const d = useSozluk(baglantilarSozlugu).ytBul;
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
        mesaj: err instanceof ApiRequestError ? err.message : d.onerilerAlinamadi,
      });
    }
  }, [clientId, d]);

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
        mesaj: err instanceof ApiRequestError ? err.message : d.aramaYapilamadi,
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
    const hedef = clientId ? d.onayWorkspace(k.title, workspaceAdi) : d.onayHavuz(k.title);
    if (!window.confirm(hedef)) return;
    setEkleniyor(k.channelId);
    setBildirim(null);
    let profilId = k.mevcut?.socialProfileId ?? null;
    try {
      if (!profilId) {
        const r = await apiFetch<{ socialProfileId: string; title: string }>('/autoboost/youtube/channels', {
          method: 'POST',
          // Havuza ekleniyor ama workspace bağlam olarak gidiyor: sunucu Google
          // bağlantısını o workspace'e atanmış hesaptan buluyor (ajansın
          // bağlantısı başka şirkette durabiliyor). Atama aşağıda ayrı istek.
          body: JSON.stringify({ channelInput: k.channelId, baglamClientId: clientId }),
        });
        profilId = r.socialProfileId;
      }
    } catch (err) {
      setBildirim({ ton: 'hata', metin: err instanceof ApiRequestError ? err.message : d.kanalEklenemedi });
      setEkleniyor(null);
      return;
    }
    if (!clientId) {
      setBildirim({ ton: 'ok', metin: d.havuzaEklendi(k.title) });
      setEkleniyor(null);
      router.refresh();
      return;
    }
    try {
      const r = await apiFetch<{ note: string }>(profilAtamaYolu('youtube_channel', profilId), {
        method: 'PATCH',
        body: JSON.stringify({ clientId }),
      });
      // Sunucunun notu: kaç kart açıldı, logo alındı mı ya da neden alınamadı.
      setBildirim({ ton: 'ok', metin: d.baglandi(k.title, r.note) });
      router.refresh();
      baglandi?.();
      void onerileriGetir();
    } catch (err) {
      setBildirim({
        ton: 'hata',
        metin: d.atanamadi(k.title, err instanceof ApiRequestError ? err.message : d.bilinmeyenHata),
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
          <span className="sr-only">{d.kanalAra}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={d.aramaYer}
            maxLength={80}
            className="h-8 w-full rounded-alan border border-line-strong bg-surface px-2.5 text-13 text-ink placeholder:text-ink-soluk"
          />
        </label>
        <Dugme
          ton="ikincil"
          boyut="kucuk"
          type="submit"
          bekliyor={durum.tur === 'yukleniyor' && durum.ne === 'arama'}
          disabled={q.trim().length < 2 || durum.tur === 'yukleniyor'}
        >
          {d.ara}
        </Dugme>
      </form>
      <p className="text-12 text-ink-muted">
        {clientId ? d.notWorkspace : d.notHavuz}
      </p>

      {bildirim && (
        <p
          /* Şerit dili (BILESENLER § 2): beyaz zemin, sol çizgi; yeşil zemin
             kılavuzda yok, başarı gri çizgiyle, hata kırmızı çizgiyle. */
          className={`m-0 rounded-alan border border-l-4 border-line bg-surface px-3 py-2 text-13 text-ink ${
            bildirim.ton === 'ok' ? 'border-l-ink-soluk' : 'border-l-danger'
          }`}
          aria-live="polite"
        >
          {bildirim.metin}
        </p>
      )}

      {durum.tur === 'yukleniyor' && (
        <p className="text-sm text-ink-muted" aria-live="polite">
          {durum.ne === 'oneri' ? d.taraniyor : d.araniyor}
        </p>
      )}
      {durum.tur === 'hata' && (
        <p role="alert" className="m-0 rounded-alan border border-l-4 border-line border-l-danger bg-surface px-3 py-2 text-13 text-ink">
          {durum.ne === 'oneri' ? d.onerilerAlinamadiOnek : d.aramaYapilamadiOnek}
          {durum.mesaj}
        </p>
      )}
      {durum.tur === 'sonuc' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">
            {durum.ne === 'oneri' ? d.onerilen : d.sonuclar} ({durum.veri.oneriler.length})
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
            <ul className="space-y-0.5 text-12 text-ink-muted">
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
  const { dil } = useDil();
  const d = useSozluk(baglantilarSozlugu).ytBul;
  const engel =
    k.mevcut?.durum === 'baska_workspacete'
      ? d.baskaWorkspacete(k.mevcut.workspaceAdi ?? null)
      : k.mevcut?.durum === 'bu_workspacete'
        ? d.buWorkspacete
        : !workspaceVar && k.mevcut?.durum === 'havuzda'
          ? d.zatenHavuzda
          : null;
  return (
    <li className="flex items-start gap-3 rounded-alan border border-line bg-surface p-2.5">
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
            k.aboneSayisi === null ? d.aboneGizli : d.abone(formatNumber(k.aboneSayisi, dil)),
            k.videoSayisi === null ? null : d.video(formatNumber(k.videoSayisi, dil)),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <ul className="mt-1 space-y-0.5">
          {k.kaynaklar.map((x) => (
            <li key={x.tur + x.aciklama} className="text-12 text-ink-muted">
              <span
                className={`mr-1 rounded px-1 py-px font-medium ${
                  x.tur === 'arama' ? 'bg-surface-sunken text-ink-muted' : 'bg-ink text-surface'
                }`}
              >
                {kaynakEtiketi(x.tur, d)}
              </span>
              {x.aciklama}
            </li>
          ))}
        </ul>
        {engel && <p className="mt-1 text-12 font-medium text-ink-muted">{engel}</p>}
      </div>
      <Dugme ton="koyu" boyut="kucuk" bekliyor={bekliyor} disabled={kapali || engel !== null} onClick={onSec}>
        {workspaceVar ? d.buKanal : d.havuzaEkle}
      </Dugme>
    </li>
  );
}
