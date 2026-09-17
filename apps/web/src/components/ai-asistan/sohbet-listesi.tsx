'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SOHBET_SINIRI, type AiAssistantConversationSummary } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ AYNI ANDA ÜÇ SOHBET ═══
 *
 * Sohbet bugüne kadar YALNIZCA adres çubuğunda yaşıyordu: sayfayı kapatan ya
 * da workspace değiştiren kullanıcı ona bir daha ulaşamıyordu. Kayıt
 * veritabanındaydı — eksik olan listeydi.
 *
 * SINIR ÜÇ VE SUNUCUDA. Buradaki düğme yalnızca ONU YANSITIYOR: sınırı
 * arayüzde tutmak, ucun doğrudan çağrılmasıyla aşılabilmesi demekti.
 * Dördüncüyü açmak için silmek gerektiği EKRANDA yazıyor; sebepsiz kapalı
 * bir düğme kullanıcıyı olmayan bir arızayı aramaya gönderir.
 */
export function SohbetListesi({
  sohbetler,
  aktifId,
  clientId,
  platform,
}: {
  sohbetler: AiAssistantConversationSummary[];
  aktifId: string | null;
  clientId: string;
  platform: string;
}) {
  const doluMu = sohbetler.length >= SOHBET_SINIRI;

  return (
    <aside className="min-w-0 space-y-2 lg:w-64 lg:shrink-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Sohbetler
        </h2>
        <span className="text-[11px] text-ink-muted">
          {sohbetler.length} / {SOHBET_SINIRI}
        </span>
      </div>

      <ul className="space-y-1.5">
        {sohbetler.map((s) => (
          <Satir
            key={s.id}
            sohbet={s}
            aktif={s.id === aktifId}
            clientId={clientId}
            platform={platform}
          />
        ))}
      </ul>

      {doluMu ? (
        /*
          SEBEP YAZILI. "Yeni sohbet" düğmesini sessizce kaldırmak ya da
          kapatmak, kullanıcıya özelliğin bozulduğunu düşündürürdü.
        */
        <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[11px] text-ink-muted">
          En fazla {SOHBET_SINIRI} sohbet tutabilirsin. Yeni bir tane başlatmak için
          yukarıdan birini sil.
        </p>
      ) : (
        <Link
          href={baglanti('/reklam-olustur/ai-asistan', {}, { musteri: clientId, platform })}
          className="block rounded-lg border border-line bg-surface px-3 py-2 text-center text-xs font-medium text-ink transition hover:border-brand hover:text-brand-strong"
        >
          Yeni sohbet
        </Link>
      )}
    </aside>
  );
}

function Satir({
  sohbet,
  aktif,
  clientId,
  platform,
}: {
  sohbet: AiAssistantConversationSummary;
  aktif: boolean;
  clientId: string;
  platform: string;
}) {
  const router = useRouter();
  const [onay, setOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function sil(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch(`/ai-assistant/conversations/${sohbet.id}`, { method: 'DELETE' });
      /*
       * SİLİNEN SOHBET AÇIKSA LİSTEYE DÖNÜLÜYOR. Aynı adreste kalmak,
       * artık var olmayan bir sohbeti yüklemeye çalışmak ve kullanıcıya
       * "önceki sohbet yüklenemedi" hatası göstermek demekti.
       */
      if (aktif) {
        router.replace(
          baglanti('/reklam-olustur/ai-asistan', {}, { musteri: clientId, platform }),
        );
      }
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Sohbet silinemedi.');
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-lg border px-2.5 py-2 transition ${
        aktif ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-ink-muted'
      }`}
    >
      <Link
        href={baglanti(
          '/reklam-olustur/ai-asistan',
          {},
          { musteri: clientId, platform, sohbet: sohbet.id },
        )}
        className="block min-w-0"
      >
        <p className={`truncate text-xs font-medium ${aktif ? 'text-brand-strong' : 'text-ink'}`}>
          {/* BAŞLIK İLK MESAJDAN TÜRÜYOR; boşsa tarih bile olmayan bir satır
              göstermek yerine açık bir yer tutucu. */}
          {sohbet.title?.trim() || 'Başlıksız sohbet'}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-muted">
          {sohbet.messageCount} mesaj · {zamanMetni(sohbet.updatedAt)}
        </p>
      </Link>

      {hata && <p className="mt-1 text-[10px] text-danger">{hata}</p>}

      {/*
        SİLME İKİ ADIMDA. Sohbet geçmişi geri alınamıyor ve yanlışlıkla
        tıklanan bir çöp kutusu, kullanıcının yazdığı planı kaybetmesi
        demek.
      */}
      {onay ? (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void sil()}
            disabled={busy}
            className="text-[10px] font-semibold text-danger hover:underline disabled:opacity-40"
          >
            {busy ? 'Siliniyor…' : 'Evet, sil'}
          </button>
          <button
            type="button"
            onClick={() => setOnay(false)}
            disabled={busy}
            className="text-[10px] text-ink-muted hover:underline"
          >
            Vazgeç
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOnay(true)}
          className="mt-1.5 text-[10px] text-ink-muted transition hover:text-danger"
        >
          Sil
        </button>
      )}
    </li>
  );
}

/** "3 sa önce" / "dün" gibi kısa bir zaman. */
function zamanMetni(iso: string): string {
  const fark = Date.now() - new Date(iso).getTime();
  const dakika = Math.round(fark / 60_000);
  if (dakika < 1) return 'az önce';
  if (dakika < 60) return `${dakika} dk önce`;
  const saat = Math.round(dakika / 60);
  if (saat < 24) return `${saat} sa önce`;
  const gun = Math.round(saat / 24);
  return gun === 1 ? 'dün' : `${gun} gün önce`;
}
