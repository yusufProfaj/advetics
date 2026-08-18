'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AutoBoostQueueItemRecord, AutoBoostQueueList } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatRelative } from '@/lib/format';

/**
 * BİLDİRİM HAVUZU — Advetics 1.0'ın taşıdığı vaat.
 *
 * Yeni gönderi/video yayınlanır → kart düşer → tek tıkla yayına girer.
 *
 * ═══ EKRANIN TAŞIDIĞI TEK MESAJ ═══
 *
 * Bu düğme PARA HARCIYOR ve ne kadar harcayacağı düğmenin ÜSTÜNDE yazıyor.
 * Kart onaylanamıyorsa SEBEBİ satırda — "onaylanamıyor" demek, kullanıcıyı
 * sebebi kendi kurulumunda aramaya iter ve bu ekranda daha önce tam olarak o
 * oldu.
 */
export function BildirimHavuzu({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [liste, setListe] = useState<AutoBoostQueueList | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<AutoBoostQueueList>(`/autoboost/queue?clientId=${clientId}`)
      .then((r) => {
        setListe(r);
        setHata(null);
      })
      /*
       * HATA YUTULMUYOR. `.catch(() => setListe(null))` yazmak "henüz
       * yüklemedim" ile "çağrı düştü"yü aynı boş alana çevirirdi — lokasyon
       * aramasında tam olarak bu yüzden sebep teşhis edilemedi.
       */
      .catch((err: unknown) =>
        setHata(
          err instanceof ApiRequestError
            ? err.message
            : 'Bildirim havuzu yüklenemedi. Sayfayı yenilemeyi dene.',
        ),
      );
  }, [clientId]);

  if (hata) {
    return (
      <div className="rounded-xl border border-danger/40 bg-surface p-4">
        <p className="text-sm font-semibold text-danger">Bildirim havuzu açılamadı</p>
        <p className="mt-1 text-xs text-ink-muted">{hata}</p>
      </div>
    );
  }

  if (!liste) {
    return <p className="text-xs text-ink-muted">Bildirim havuzu yükleniyor…</p>;
  }

  const bekleyen = liste.items.filter((i) => i.status === 'pending');

  return (
    <section className="min-w-0 space-y-3">
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Bildirim Havuzu
          {bekleyen.length > 0 && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
              {bekleyen.length}
            </span>
          )}
        </h2>
        {/*
          SAYAÇ KOŞULSUZ — "sessiz kesme yok". Kaç kayıt gösterildiği ve
          toplamın kaç olduğu her zaman yazılı.
        */}
        <p className="text-[11px] text-ink-muted">
          {liste.items.length} kart gösteriliyor
          {liste.total > liste.items.length && ` · toplam ${liste.total}, en yeniler`}
        </p>
      </header>

      {liste.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-ink">Onay bekleyen içerik yok</p>
          <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">{liste.emptyReason}</p>
        </div>
      )}

      <ul className="space-y-2">
        {liste.items.map((k) => (
          <li key={k.id}>
            <Kart kayit={k} onDegisti={() => router.refresh()} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const PLATFORM_ETIKETI: Record<string, string> = {
  meta: 'Instagram',
  google: 'YouTube',
};

function Kart({
  kayit,
  onDegisti,
}: {
  kayit: AutoBoostQueueItemRecord;
  onDegisti: () => void;
}) {
  const [gorselDustu, setGorselDustu] = useState(false);
  const onaylanabilir = kayit.status === 'pending' && kayit.blockedReason === null;

  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-line bg-surface p-3">
      {/*
        DÜZ `img` — Next/Image DEĞİL. Küçük resimler Meta ve YouTube CDN'inden
        geliyor ve uzak alan adı yapılandırması gerektiriyordu; elle boost
        ekranında aynı karar verildi ve görseller ancak öyle göründü.
        `referrerPolicy` şart: Meta CDN referrer'lı isteği reddediyor.
      */}
      {kayit.thumbnailUrl && !gorselDustu ? (
        <img
          src={kayit.thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setGorselDustu(true)}
          className="h-16 w-16 shrink-0 rounded-lg bg-surface-sunken object-cover"
        />
      ) : (
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-surface-sunken text-[10px] text-ink-muted">
          görsel yok
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
            {PLATFORM_ETIKETI[kayit.platform] ?? kayit.platform}
          </span>
          {kayit.status !== 'pending' && (
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-muted">
              {DURUM_ETIKETI[kayit.status] ?? kayit.status}
            </span>
          )}
          {kayit.publishedAt && (
            <span className="text-[11px] text-ink-muted">
              {formatRelative(kayit.publishedAt)}
            </span>
          )}
          {kayit.permalink && (
            <a
              href={kayit.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-brand hover:underline"
            >
              İçeriği aç
            </a>
          )}
        </div>

        {/* `line-clamp` — `truncate` DEĞİL: nowrap, formun min-content
            genişliğini şişirip sayfayı yatay taşırıyordu. */}
        <p className="mt-1 line-clamp-2 text-sm text-ink">
          {kayit.title || 'Başlıksız içerik'}
        </p>

        {kayit.preset && (
          <p className="mt-1 text-[11px] text-ink-muted">
            Uygulanacak: <strong>{formatMoney(kayit.preset.budgetMicros, 'TRY')}</strong>
            {kayit.preset.budgetMode === 'daily' ? ' / gün' : ' toplam'} ·{' '}
            {kayit.preset.durationDays} gün
          </p>
        )}

        {/* ENGEL SEBEBİ SATIRDA. Düğmeyi kapatıp sebebini söylememek,
            kullanıcıya "çalışmıyor" göstermek olurdu. */}
        {kayit.blockedReason && (
          <p className="mt-1 text-[11px] text-danger">{kayit.blockedReason}</p>
        )}

        {kayit.error && (
          <p className="mt-1 text-[11px] text-danger">{kayit.error}</p>
        )}
      </div>

      <div className="shrink-0 self-center">
        <OnayDugmesi kayit={kayit} etkin={onaylanabilir} onDegisti={onDegisti} />
      </div>
    </article>
  );
}

const DURUM_ETIKETI: Record<string, string> = {
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  launching: 'Yayına alınıyor',
  launched: 'Yayında',
  failed: 'Başarısız',
};

/**
 * "Onayla ve Boostla".
 *
 * ═══ BU DÜĞME PARA HARCIYOR ═══
 *
 * Ara onay adımı YOK — kararı kullanıcı zaten bu ekranda veriyor ve ikinci
 * kez sormak istenen akışı bozardı. Ama harcanacak tutar düğmenin ÜSTÜNDE
 * yazıyor (kartın ön ayar satırı) ve engel varsa düğme açılmıyor.
 *
 * INSTAGRAM AÇIK, YOUTUBE KAPALI ve sebebi ekranda: Google Demand Gen reklamı
 * marka adı ve logo görseli ZORUNLU kılıyor (v24'ten beri), ikisi de ön ayarda
 * henüz yok. Kapalı bırakıp sebebini söylemek, tıklandığında anlaşılmaz bir
 * Google hatası veren bir düğmeden iyi.
 */
function OnayDugmesi({
  kayit,
  etkin,
  onDegisti,
}: {
  kayit: AutoBoostQueueItemRecord;
  etkin: boolean;
  onDegisti: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  if (kayit.status !== 'pending') return null;

  const youtube = kayit.platform === 'google';
  const acik = etkin && !youtube && !busy;

  async function karar(approve: boolean): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<{ status: string; message: string }>(
        `/autoboost/queue/${kayit.id}/decision`,
        { method: 'POST', body: JSON.stringify({ approve }) },
      );
      /*
       * BAŞARISIZ YAYIN DA BİR SONUÇ. Sunucu `failed` dönebiliyor ve mesajı
       * platformun kendi cümlesini taşıyor; onu göstermeden yenilemek,
       * kullanıcıya "bir şey oldu ama ne bilmiyorum" bırakırdı.
       */
      if (r.status === 'failed') setHata(r.message);
      onDegisti();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[12rem] text-right">
      <button
        type="button"
        onClick={() => void karar(true)}
        disabled={!acik}
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted"
      >
        {busy ? 'Yayınlanıyor…' : 'Onayla ve Boostla'}
      </button>

      {acik && (
        <button
          type="button"
          onClick={() => void karar(false)}
          className="mt-1 block w-full rounded-lg border border-line px-3 py-1 text-[11px] font-medium text-ink-muted hover:bg-surface-sunken"
        >
          Reddet
        </button>
      )}

      {youtube && (
        <p className="mt-1 text-[10px] text-ink-muted">
          YouTube yayını henüz açık değil: Google marka adı ve logo zorunlu
          kılıyor, ikisi de ön ayarda yok.
        </p>
      )}

      {hata && <p className="mt-1 text-[10px] text-danger">{hata}</p>}
    </div>
  );
}
