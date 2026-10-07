'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { KURULUM_DURUM_METNI, ayAdi, eylemIstegi, okumaHatasi, planAdresi, type KurulumTonu } from './hesap';
import type { PilotKurulumYaniti } from '@advetics/shared';

/**
 * ═══ KURULUM KARTI (Pilot açılışı) ═══
 *
 * Onaylı planın satırları. Ajansın "Hepsini yayına al" düğmesi YOK (Ç-6):
 * kurulumu müşterinin onayı başlatır. Tek ajans düğmesi "Şimdi kur"
 * (`yeniden_dene`, S-6): kısmen kurulmuş ya da uyum sonradan bağlanmış bir
 * planı müşteriye yeniden sormadan kurar. Görünürlüğü sunucunun
 * `yapilabilir` listesinden.
 *
 * DÜŞEN SATIR PLATFORMUN KENDİ MESAJIYLA. "Beklenmeyen bir hata" bu
 * projede bir turu kaybettirdi (CLAUDE.md `PlatformApiError`).
 */
const TON_SINIFI: Record<KurulumTonu, string> = {
  tamam: 'bg-ok-soft text-ok-strong',
  bekliyor: 'bg-surface-sunken text-ink-muted',
  dikkat: 'bg-warn-soft text-warn-strong',
  hata: 'bg-danger-soft text-danger-strong',
};

export function KurulumKarti({ clientId, k }: { clientId: string; k: PilotKurulumYaniti }) {
  const router = useRouter();
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  const kurabilir = k.yapilabilir.includes('yeniden_dene');
  const ay = ayAdi(k.plan.donem);
  const baslik =
    k.ozet.suruyor > 0
      ? `${ay} planı kuruluyor: ${k.ozet.basarili + k.ozet.basarisiz} / ${k.ozet.toplam}`
      : k.ozet.basarisiz > 0
        ? `${ay} planının ${k.ozet.basarisiz} kampanyası kurulmadı`
        : `${ay} planının ${k.ozet.basarili} kampanyası kuruldu`;

  async function kur() {
    setHal({ tur: 'suruyor' });
    try {
      // Plan sayfasıyla AYNI gövde (`eylemIstegi`): iki yerden iki farklı
      // gövde kurulsaydı biri sunucuda reddedilir, ekran başka şey söylerdi.
      const { yol, govde } = eylemIstegi(k.plan.id, 'yeniden_dene', k.plan.surum);
      await apiFetch(yol, { method: 'POST', body: JSON.stringify(govde) });
      setHal({ tur: 'bos' });
      router.refresh();
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">Kurulum</p>
          <h3 className="mt-1 font-baslik text-base font-bold text-ink">{baslik}</h3>
          {k.plan.yayinKipi === 'test' && <p className="mt-1 text-sm text-warn-strong">Test kipinde kuruldu, açılmadı.</p>}
          {k.plan.yayinKipi === 'kapali' && <p className="mt-1 text-sm text-warn-strong">Uyum kontrolü bağlı değil; platforma bir şey yazılmadı.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={planAdresi(clientId, { plan: k.plan.id })} className={dugmeSinifi('ikincil')}>
            Planı gör
          </Link>
          {kurabilir && (
            <Dugme onClick={() => void kur()} bekliyor={hal.tur === 'suruyor'}>
              Şimdi kur
            </Dugme>
          )}
        </div>
      </div>
      {k.satirlar.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {k.satirlar.map((s) => {
            const d = KURULUM_DURUM_METNI[s.durum];
            return (
              <li key={s.anahtar} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{s.ad}</p>
                  <p className="text-xs text-ink-muted">{s.platform === 'meta' ? 'Meta' : 'Google'}</p>
                  {s.platformMesaji && <p className="mt-1 text-xs text-danger-strong">Platform: {s.platformMesaji}</p>}
                  {s.farklar.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                      {s.farklar.map((f) => (
                        <li key={f.alan}>
                          {f.alan}: plan {f.beklenen}, platform {f.okunan}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TON_SINIFI[d.ton]}`}>{d.metin}</span>
              </li>
            );
          })}
        </ul>
      )}
      {hal.tur === 'hata' && (
        <p role="alert" className="mt-3 text-sm text-danger-strong">
          {hal.mesaj}
        </p>
      )}
    </article>
  );
}
