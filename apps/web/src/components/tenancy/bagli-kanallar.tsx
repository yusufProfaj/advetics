'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CHANNEL_HINTS,
  CHANNEL_LABELS,
  type ChannelGroup,
  type ChannelItem,
  type ChannelKind,
  type ClientChannels,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * BAĞLI KANALLAR — bir workspace'in kanalları, kart düzeninde.
 *
 * "Kanal Ekle" havuzdan seçtiriyor, yeni bir OAuth başlatmıyor: bağlantı
 * ajansa ait ve bir kez kuruluyor (müşterilerin kendi Facebook hesabı yok,
 * her yetkilendirme aynı kimliğe çakışıyor). Bu ekranın işi o havuzdan
 * hangi hesabın bu müşteriye ait olduğunu söylemek.
 *
 * BAŞKA MÜŞTERİLERE ATANMIŞ HESAPLAR BURADA HİÇ GÖRÜNMÜYOR — ne listede ne
 * seçicide. Sunucu zaten yalnızca bu workspace'inkileri ve havuzdakileri
 * döndürüyor.
 */
export function BagliKanallar({ data }: { data: ClientChannels }) {
  return (
    <div className="space-y-4">
      {data.emptyReason ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm font-medium text-ink">Bağlanabilecek kanal yok</p>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-ink-muted">{data.emptyReason}</p>
        </div>
      ) : (
        data.groups.map((g) => <KanalGrubu key={g.kind} clientId={data.clientId} grup={g} />)
      )}
    </div>
  );
}

function KanalGrubu({ clientId, grup }: { clientId: string; grup: ChannelGroup }) {
  const [acik, setAcik] = useState(false);
  const eklenebilir = grup.available.length > 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <KanalRozeti kind={grup.kind} />
          <div>
            <h3 className="text-sm font-semibold text-ink">{CHANNEL_LABELS[grup.kind]}</h3>
            <p className="text-[11px] text-ink-muted">
              {grup.connected.length > 0
                ? `${grup.connected.length} bağlı`
                : 'Bağlı hesap yok'}
            </p>
          </div>
        </div>

        {/* SEÇİLECEK HESAP YOKSA DÜĞME SEBEBİYLE KAPALI — gizlenmiyor.
            Gizlemek, kullanıcının "buraya nasıl ekleniyor" diye aramasına
            yol açardı. */}
        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          disabled={!eklenebilir}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
        >
          {acik ? 'Kapat' : '+ Kanal Ekle'}
        </button>
      </div>

      {!eklenebilir && grup.connected.length === 0 && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {CHANNEL_HINTS[grup.kind]} Havuzda boşta bekleyen hesap yok.
        </p>
      )}

      {grup.connected.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {grup.connected.map((i) => (
            <BagliKart key={i.id} clientId={clientId} kind={grup.kind} item={i} />
          ))}
        </ul>
      )}

      {acik && (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
          <p className="text-[11px] font-medium text-ink">Havuzdan seç</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">{CHANNEL_HINTS[grup.kind]}</p>
          <ul className="mt-2 space-y-1.5">
            {grup.available.map((i) => (
              <SecilebilirSatir key={i.id} clientId={clientId} kind={grup.kind} item={i} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Atama ve kaldırma — ikisi de aynı uçtan, `clientId` null ise kaldırma. */
function useAtama(kind: ChannelKind, itemId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const reklamHesabi = kind === 'meta_ads' || kind === 'google_ads';
  const yol = reklamHesabi
    ? `/connections/ad-accounts/${itemId}/client`
    : `/connections/social-profiles/${itemId}/client`;

  async function ata(clientId: string | null): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch(yol, { method: 'PATCH', body: JSON.stringify({ clientId }) });
      // ATAMA İZLEMEYİ AÇIP GEÇMİŞİ KUYRUĞA ALIYOR; sayfa yenilenince
      // "izleme açık" rozeti görünmeli.
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem başarısız oldu.');
    } finally {
      setBusy(false);
    }
  }

  return { ata, busy, hata };
}

function BagliKart({
  clientId,
  kind,
  item,
}: {
  clientId: string;
  kind: ChannelKind;
  item: ChannelItem;
}) {
  const { ata, busy, hata } = useAtama(kind, item.id);
  void clientId;

  return (
    <li className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{item.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{item.externalId}</p>
        </div>
        <button
          type="button"
          onClick={() => void ata(null)}
          disabled={busy}
          className="shrink-0 text-[11px] font-medium text-danger transition hover:underline disabled:opacity-40"
        >
          {busy ? '…' : 'Kaldır'}
        </button>
      </div>

      {/*
        İZLEME KAPALIYSA YAZILIYOR. Atama izlemeyi açıyor, ama eski
        kayıtlarda kapalı kalmış olabilir ve o durumda HİÇ VERİ GELMİYOR —
        ekranda "bağlı" yazarken. Sessiz kalması, sebebin platformda
        aranmasına yol açardı.
      */}
      {!item.syncEnabled && (
        <p className="mt-1.5 text-[11px] text-warn">
          İzleme kapalı — bu hesaptan veri çekilmiyor. Kaldırıp yeniden ekle.
        </p>
      )}
      {hata && <p className="mt-1.5 text-[11px] text-danger">{hata}</p>}
    </li>
  );
}

function SecilebilirSatir({
  clientId,
  kind,
  item,
}: {
  clientId: string;
  kind: ChannelKind;
  item: ChannelItem;
}) {
  const { ata, busy, hata } = useAtama(kind, item.id);

  return (
    <li>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{item.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{item.externalId}</p>
        </div>
        {/* YÖNETİCİ HESABI LİSTEDE DURUYOR ama seçilemiyor ve SEBEBİ yazılı:
            aradığı hesabı bulamayan kullanıcı senkronizasyonun bozuk
            olduğunu sanıyor. */}
        {item.isManager ? (
          <span className="shrink-0 text-[11px] text-ink-muted">Yönetici (MCC) — atanamaz</span>
        ) : (
          <button
            type="button"
            onClick={() => void ata(clientId)}
            disabled={busy}
            className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-40"
          >
            {busy ? 'Ekleniyor…' : 'Ekle'}
          </button>
        )}
      </div>
      {hata && <p className="mt-1 px-3 text-[11px] text-danger">{hata}</p>}
    </li>
  );
}

/** Kanal rozeti — dış ikon kütüphanesi eklemeden tutarlı bir set. */
function KanalRozeti({ kind }: { kind: ChannelKind }) {
  const renk: Record<ChannelKind, string> = {
    meta_ads: 'bg-sky-50 text-sky-700 ring-sky-200',
    google_ads: 'bg-amber-50 text-amber-700 ring-amber-200',
    facebook: 'bg-blue-50 text-blue-700 ring-blue-200',
    instagram: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    youtube: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  const harf: Record<ChannelKind, string> = {
    meta_ads: 'M',
    google_ads: 'G',
    facebook: 'f',
    instagram: 'ig',
    youtube: '▶',
  };
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ring-1 ${renk[kind]}`}
    >
      {harf[kind]}
    </span>
  );
}
