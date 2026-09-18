'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo } from '@/components/platform-logo';

/**
 * YOUTUBE KANALINI HAVUZA EKLER.
 *
 * ═══ NEDEN YAPIŞTIRMA, NEDEN LİSTE DEĞİL ═══
 *
 * Instagram hesapları kendiliğinden listeleniyor çünkü Meta yetkilendirmesi
 * sayfaları ve onlara bağlı Instagram hesaplarını bize VERİYOR. Google
 * yetkilendirmesi yalnızca Google Ads kapsamı taşıyor; "bu hesabın kanalları"
 * sorusunu sormak ayrı bir YouTube kapsamı ve BÜTÜN Google bağlantısının
 * yeniden yetkilendirilmesi demek. Bu projede yeniden yetkilendirme daha önce
 * canlı bağlantıları kopardı.
 *
 * Yapıştırma aynı sonucu API anahtarıyla veriyor: kanal doğrulanıyor, adı ve
 * görseli okunuyor ve havuza düşüyor. Oradan sonrası Instagram hesabıyla
 * BİREBİR AYNI — aynı havuz kartı, aynı atama penceresi.
 *
 * KANAL DOĞRUDAN BİR WORKSPACE'E EKLENMİYOR. Kanalı ekleyen kişi o an
 * hangi müşteriye ait olduğunu seçmek zorunda kalırdı; seçim yanlışsa kanal
 * yanlış müşteride abone olur ve videoları başka bir markanın paneline
 * düşerdi.
 */
export function YouTubeKanalEkle({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [girdi, setGirdi] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  async function ekle(): Promise<void> {
    if (!girdi.trim()) return;
    setBekliyor(true);
    setHata(null);
    setSonuc(null);
    try {
      const r = await apiFetch<{ title: string; channelId: string }>(
        '/autoboost/youtube/channels',
        {
          method: 'POST',
          // `clientId` GÖNDERİLMİYOR: kanal havuza giriyor, atama ayrı adım.
          body: JSON.stringify({ channelInput: girdi.trim() }),
        },
      );
      setGirdi('');
      setSonuc(`${r.title} havuza eklendi. Aşağıdan bir workspace'e ata.`);
      // Havuz sayacı sunucu tarafında hesaplanıyor; yenilemeden kanal
      // listede görünmez ve kullanıcı ekleme başarısız sanır.
      startTransition(() => router.refresh());
    } catch (err) {
      /*
       * SUNUCUNUN KENDİ CÜMLESİ. "Kanal eklenemedi" demek, kullanıcıyı
       * yapıştırdığı adresi suçlamaya gönderiyor; oysa mesaj çoğu zaman
       * doğrudan söylüyor (Google Ads bağlantısı yok, kanal bulunamadı,
       * API anahtarı tanımsız).
       */
      setHata(err instanceof ApiRequestError ? err.message : 'Kanal eklenemedi.');
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
          <PlatformLogo kind="youtube" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">YouTube kanalı bağla</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
            Kanal adresini ya da @tanıtıcısını yapıştır. Kanal havuza düşer, workspace
            atamasını aşağıdan yaparsın.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          onKeyDown={(e) => {
            // Enter ile eklemek, kısa bir alanda düğmeye uzanmaktan hızlı.
            if (e.key === 'Enter') void ekle();
          }}
          disabled={!canManage || bekliyor}
          placeholder="@kanaladi"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void ekle()}
          disabled={!canManage || bekliyor || girdi.trim() === ''}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
        >
          {bekliyor || isPending ? 'Ekleniyor…' : 'Ekle'}
        </button>
      </div>

      {!canManage && (
        <p className="mt-2 text-[11px] text-ink-muted">Kanal bağlamak yöneticinin işi.</p>
      )}
      {hata && (
        <p role="alert" className="mt-2 text-[11px] text-danger">
          {hata}
        </p>
      )}
      {sonuc && <p className="mt-2 text-[11px] text-ok-strong">{sonuc}</p>}

      {/*
        KANALIN KENDİSİ NEREDE BULUNUR — kullanıcı "kanal kimliği" kavramını
        bilmek zorunda değil ve bilmediğinde yapıştırdığı şey genelde video
        adresi oluyor.
      */}
      <p className="mt-2 text-[11px] text-ink-muted">
        Kanal sayfasını aç, adres çubuğundakini kopyala. Video adresi değil, kanal
        adresi olmalı.
      </p>
    </section>
  );
}
