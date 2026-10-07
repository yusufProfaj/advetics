'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { donemEtiketi, donemSecenekleri, okumaHatasi, pilotUcAdresi, planAdresi } from './hesap';
import type { PilotHazirlaYaniti } from '@advetics/shared';

/**
 * ═══ "PLANI HAZIRLA" — İSTENMEDİ HÂLİ ═══
 *
 * Plan yoksa ekran boş bir liste değil, TEK DÜĞME gösterir: tıklama hedefinin
 * (plan → gönder → onay = 3) birinci adımı. Dönem önceden seçili
 * (`donemSecenekleri`: ayın 20'sinden sonra gelecek ay); seçmek ek tıklama
 * değil, yalnız varsayılan yanlışsa gerekiyor.
 *
 * Bütçe, süre, kitle SORULMAZ (Ç-1): hepsi Aylık Bütçe, geçmiş veri ve
 * Marka Merkezi'nden gelir ve plan belgesinde kaynağıyla yazılır.
 */
export function PlanHazirla({ clientId, bugun, yazabilir, kompakt = false }: { clientId: string; bugun: string; yazabilir: boolean; kompakt?: boolean }) {
  const router = useRouter();
  const secenek = donemSecenekleri(bugun);
  const [donem, setDonem] = useState(secenek.varsayilan);
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });

  if (!yazabilir) {
    return (
      <section className="mx-auto w-full max-w-[56rem] rounded-xl border border-line bg-surface p-6">
        <h2 className="font-baslik text-lg font-bold text-ink">Henüz plan yok.</h2>
        <p className="mt-1 text-sm text-ink-muted">Ajansın planı hazırlayınca burada görürsün.</p>
      </section>
    );
  }

  async function hazirla() {
    setHal({ tur: 'suruyor' });
    try {
      const c = await apiFetch<PilotHazirlaYaniti>(pilotUcAdresi('/pilot/planlar/hazirla'), { method: 'POST', body: JSON.stringify({ clientId, donem }) });
      router.push(planAdresi(clientId, { plan: c.id }));
      router.refresh();
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  return (
    <section className={`mx-auto w-full max-w-[56rem] rounded-xl border border-line bg-surface ${kompakt ? 'p-4' : 'p-6'}`}>
      {!kompakt && (
        <>
          <h2 className="font-baslik text-xl font-bold text-ink">{donemEtiketi(donem)} planını hazırlayayım</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted [text-wrap:pretty]">
            Aylık Bütçe, son 90 günün sonuçları ve Marka Merkezi’nden hazırlarım. Her rakamın yanında nereden geldiği yazar; sen yalnız itiraz edersin.
          </p>
        </>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${kompakt ? '' : 'mt-4'}`}>
        <div role="group" aria-label="Dönem" className="flex flex-wrap gap-1.5">
          {[secenek.buAy, secenek.gelecekAy].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={donem === d}
              onClick={() => setDonem(d)}
              className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                donem === d ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-surface-muted'
              }`}
            >
              {donemEtiketi(d)}
            </button>
          ))}
        </div>
        <Dugme onClick={() => void hazirla()} bekliyor={hal.tur === 'suruyor'}>
          Planı hazırla
        </Dugme>
      </div>
      {hal.tur === 'suruyor' && <p className="mt-2 text-xs text-ink-muted">Veriler okunuyor ve plan yazılıyor.</p>}
      {hal.tur === 'hata' && (
        <p role="alert" className="mt-2 text-sm text-danger-strong">
          {hal.mesaj}
        </p>
      )}
    </section>
  );
}
