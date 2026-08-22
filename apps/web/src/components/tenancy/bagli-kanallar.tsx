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
import { atamaBildirimi, type AtamaYaniti } from '@/lib/atama-bildirimi';
import { PlatformLogo } from '@/components/platform-logo';

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
    <div>
      {data.emptyReason ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm font-medium text-ink">Bağlanabilecek kanal yok</p>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-ink-muted">{data.emptyReason}</p>
        </div>
      ) : (
        /*
          KANALLAR YAN YANA DİKEY KARTLARDA — alt alta geniş şeritlerde DEĞİL.
          Şerit düzeninde her kart ekranın tamamını kaplıyor ama içindeki
          hesap satırı üçte birinde bitiyordu: sağda kalıcı bir ölü alan ve
          beş kanalı görmek için sürekli kaydırma. Kart daralınca içerik
          genişliğine oturuyor ve beş kanal tek ekranda görünüyor.

          `items-start`: kanalların hesap sayısı farklı ve ızgaranın hepsini
          en uzun karta uzatması, boş kart alanı üretirdi.
        */
        <ul className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.groups.map((g) => (
            <li key={g.kind}>
              <KanalGrubu clientId={data.clientId} grup={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KanalGrubu({ clientId, grup }: { clientId: string; grup: ChannelGroup }) {
  const [acik, setAcik] = useState(false);
  const eklenebilir = grup.available.length > 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      {/* BAŞLIK SARMIYOR: dar kartta "+ Kanal Ekle" alt satıra düşüp
          başlığın altında yalnız kalıyordu. Düğme küçüldü ve kırpılmayan
          tek satırda kalıyor. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {/* LOGO BEYAZ ZEMİNDE: markaların kendi renkleri var ve renkli
              bir rozetin üstünde ikisi çakışıyordu. */}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
            <PlatformLogo kind={grup.kind} className="h-5 w-5" />
          </span>
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
          className="shrink-0 whitespace-nowrap rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
        >
          {acik ? 'Kapat' : '+ Kanal Ekle'}
        </button>
      </div>

      {!eklenebilir && grup.connected.length === 0 && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {CHANNEL_HINTS[grup.kind]} Havuzda boşta bekleyen hesap yok.
        </p>
      )}

      {/* KART DARALDI, HESAPLAR ALT ALTA. Kanal kartları yan yana dizildiği
          için kart içinde ikinci bir kolon açmak adları kırpardı. */}
      {grup.connected.length > 0 && (
        <ul className="mt-3 space-y-2">
          {grup.connected.map((i) => (
            <BagliKart key={i.id} clientId={clientId} kind={grup.kind} item={i} />
          ))}
        </ul>
      )}

      {acik && (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
          <p className="text-[11px] font-medium text-ink">Havuzdan seç</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">{CHANNEL_HINTS[grup.kind]}</p>
          {/* SEÇİCİ DE ALT ALTA ve YÜKSEKLİĞİ SINIRLI: havuzda onlarca hesap
              olabiliyor ve sınırsız liste, kartı sayfa boyunca uzatıp
              yanındaki kanalları ekrandan atıyordu. */}
          <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
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
  const [bildirim, setBildirim] = useState<string | null>(null);

  const reklamHesabi = kind === 'meta_ads' || kind === 'google_ads';
  const yol = reklamHesabi
    ? `/connections/ad-accounts/${itemId}/client`
    : `/connections/social-profiles/${itemId}/client`;

  async function ata(clientId: string | null): Promise<void> {
    setBusy(true);
    setHata(null);
    setBildirim(null);
    try {
      const res = await apiFetch<AtamaYaniti>(yol, {
        method: 'PATCH',
        body: JSON.stringify({ clientId }),
      });
      /*
       * TAŞINAN VE KALAN SAYILARI EKRANA YAZILIYOR.
       *
       * Hesap el değiştirince kampanyaları, kreatifleri ve geçmiş metrikleri
       * de yeni müşteriye geçiyor; bütçe, kural ve taslak ise BİLEREK eskide
       * kalıyor. İkisi de bir müşterinin raporundaki rakamı değiştiriyor ve
       * sessiz kalması "veri mi kayboldu" sorusunu üretiyor.
       *
       * `router.refresh()` bildirimi silmiyor: bileşen aynı kalıyor, yalnızca
       * sunucu verisi tazeleniyor.
       */
      setBildirim(atamaBildirimi(res ?? {}, clientId !== null));
      // ATAMA İZLEMEYİ AÇIP GEÇMİŞİ KUYRUĞA ALIYOR; sayfa yenilenince
      // "izleme açık" rozeti görünmeli.
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem başarısız oldu.');
    } finally {
      setBusy(false);
    }
  }

  return { ata, busy, hata, bildirim };
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
  const { ata, busy, hata, bildirim } = useAtama(kind, item.id);
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
      {bildirim && <p className="mt-1.5 text-[11px] text-ink-muted">{bildirim}</p>}
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
  const { ata, busy, hata, bildirim } = useAtama(kind, item.id);

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
      {bildirim && <p className="mt-1 px-3 text-[11px] text-ink-muted">{bildirim}</p>}
    </li>
  );
}
