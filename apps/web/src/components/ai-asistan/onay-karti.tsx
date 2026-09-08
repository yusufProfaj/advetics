'use client';

import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * CANLI MUTASYON ONAY KARTI — platforma giden tek insan kapısı.
 *
 * Asistan bütçe/durum değişikliği önerdiğinde platforma HİÇ dokunulmuyor;
 * sunucu `pending_confirmation` dönüyor ve gerçek çağrı ancak bu kart
 * tıklanınca yapılıyor. Kartın tıklandığı uç, panelin manuel yolunun
 * çağırdığı `CampaignActionsService.applyAction` ile BİREBİR aynı kod.
 *
 * DÜĞME TIKLANDIKTAN SONRA KİLİTLENİYOR (`busy` + `sonuc`): asıl kilit
 * sunucuda ve veritabanı birincil anahtarında, ama kullanıcıya iki kez
 * tıklanabilir görünen bir düğme göstermek onu "acaba gitti mi" sorusuna
 * bırakırdı.
 *
 * "ŞİMDİ DEĞİL" YALNIZCA EKRANDAN GİZLİYOR ve bu bilinçli: sunucuda bir
 * iptal yolu YOK, çünkü onaylanmamış bir teklif zaten zararsız — platforma
 * hiçbir şey yazılmadı. Sayfa yenilenince kart geri geliyor ve bu DOĞRU:
 * teklif hâlâ açık. Sahte bir "iptal edildi" göstermek, olmayan bir işlemi
 * yapılmış gibi anlatmak olurdu.
 */
export function OnayKarti({
  conversationId,
  confirmationId,
  summary,
  onKapat,
}: {
  conversationId: string;
  confirmationId: string;
  summary: string;
  /** Kart ekrandan kalkarken çağrılıyor (onaylandı ya da ertelendi). */
  onKapat: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sonuc, setSonuc] = useState<{ ok: boolean; mesaj: string } | null>(null);

  async function onayla(): Promise<void> {
    setBusy(true);
    try {
      const res = await apiFetch<
        { status: 'success' } | { status: 'failed' | 'partial'; reason: string }
      >(`/ai-assistant/conversations/${conversationId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ confirmationId }),
      });

      /*
       * `status: 'success'` GÖRMEDEN BAŞARI YAZILMIYOR.
       * Uç 200 dönse bile gövde `failed` olabiliyor (platform reddi, çift
       * tıklama, kota) — "200 döndü doğrulama değil" ilkesinin arayüzdeki
       * karşılığı. Ret sebebi platformun kendi cümlesiyle gösteriliyor.
       */
      if (res.status === 'success') {
        setSonuc({ ok: true, mesaj: 'Uygulandı.' });
      } else {
        setSonuc({ ok: false, mesaj: res.reason });
      }
    } catch (err) {
      setSonuc({
        ok: false,
        mesaj: err instanceof ApiRequestError ? err.message : 'Onay gönderilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[82%] self-start rounded-xl border border-brand bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Onayın gerekiyor</p>
      <p className="mt-1 text-sm text-ink">{summary}</p>

      {sonuc === null ? (
        <>
          <p className="mt-1 text-[11px] text-ink-muted">
            Onaylayana kadar platformda hiçbir şey değişmiyor.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onayla}
              disabled={busy}
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Uygulanıyor…' : 'Onayla'}
            </button>
            <button
              type="button"
              onClick={onKapat}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-surface-sunken disabled:opacity-40"
            >
              Şimdi değil
            </button>
            {busy && <Halka className="h-4 w-4" />}
          </div>
        </>
      ) : (
        <div className="mt-2">
          {sonuc.ok ? (
            <p className="text-sm text-emerald-700">{sonuc.mesaj}</p>
          ) : (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
              {sonuc.mesaj}
            </p>
          )}
          <button
            type="button"
            onClick={onKapat}
            className="mt-2 text-xs text-ink-muted underline hover:text-ink"
          >
            Kartı kapat
          </button>
        </div>
      )}
    </div>
  );
}
