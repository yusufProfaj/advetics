'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { DEGISTIR_CUMLE_EN_COK, degistirCumlesi, okumaHatasi, pilotUcAdresi } from './hesap';

/**
 * ═══ "DEĞİŞTİR" KUTUSU ═══
 *
 * Sohbet ana yol değil (AJAN-PLANI §2); her belgenin altında tek satırlık
 * bir istek kutusu. Yazmak isteğe bağlı: hiç yazmadan plan baştan sona
 * gidebiliyor. Yapay zekâ cümleyi plana SÜRÜM olarak yazar ve cümledeki
 * sayılar dışında sayı getiremez (sunucu `degisiklikCumleyleUyumluMu`).
 * Sunucu reddederse NEDENİ ekranda: "anlaşılmadı" ile "cümlede olmayan bir
 * sayı yazıldı" farklı işler ve ikisi de kullanıcının cümlesini düzeltmesini
 * istiyor.
 *
 * Cümle istek gidene kadar kutuda kalır, başarıda temizlenir: düşen bir
 * istekte yazdığını kaybetmek, uzun bir cümleyi yeniden yazdırmak olurdu.
 */
export function DegistirKutusu({ planId, surum }: { planId: string; surum: number }) {
  const router = useRouter();
  const [cumle, setCumle] = useState('');
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });

  async function gonder() {
    const g = degistirCumlesi(surum, cumle);
    if (g.tur === 'hata') return setHal({ tur: 'hata', mesaj: g.mesaj });
    setHal({ tur: 'suruyor' });
    try {
      await apiFetch(pilotUcAdresi('/pilot/planlar/:id/degistir', planId), { method: 'POST', body: JSON.stringify(g.govde) });
      setCumle('');
      setHal({ tur: 'bos' });
      router.refresh();
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  return (
    <div className="space-y-1.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gonder();
        }}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-surface py-2 pl-4 pr-2 focus-within:border-brand"
      >
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand/10">
          <span className="h-2 w-2 rotate-45 rounded-[1px] bg-brand" />
        </span>
        <label htmlFor="plan-degistir" className="sr-only">
          Değiştirmek istediğin
        </label>
        <input
          id="plan-degistir"
          value={cumle}
          onChange={(e) => setCumle(e.target.value)}
          maxLength={DEGISTIR_CUMLE_EN_COK}
          placeholder="Değiştirmek istediğini yaz: “Google’a 10.000 TL daha ayır”"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-ink outline-none placeholder:text-ink-muted"
        />
        <Dugme type="submit" ton="ikincil" bekliyor={hal.tur === 'suruyor'}>
          Uygula
        </Dugme>
      </form>
      {hal.tur === 'hata' && (
        <p role="alert" className="px-1 text-sm text-danger-strong">
          {hal.mesaj}
        </p>
      )}
    </div>
  );
}
