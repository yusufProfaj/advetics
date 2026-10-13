import type { ReactNode } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { yazmaHatasiSinifla } from '../hesap';

/**
 * ═══ AdvStrategy v2 ORTAK PARÇALAR — YALNIZ KILAVUZ RENKLERİ ═══
 *
 * Kılavuz (`docs/marka/profaj-kurumsal-kilavuz.jpg`): beyaz, siyah, gri
 * `#302e2d` (panelde `ink`), kırmızı `#ff2400` (panelde `brand`). Yeşil
 * YALNIZ durum noktası (`bg-ok`). Panelin `Uyari` bileşeni bilgi mavisi ve
 * uyarı turuncusu taşıyor; bu modül onu KULLANMIYOR, bildirim kutusu
 * taslaktaki gibi kırmızı sol çizgili (`hesap.spec.ts` renk taraması).
 */

export function Rozet({ children, ton = 'cizgi' }: { children: ReactNode; ton?: 'cizgi' | 'kirmizi' | 'dolu' }) {
  const t =
    ton === 'kirmizi' ? 'border-brand text-brand-strong' : ton === 'dolu' ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted';
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-semibold ${t}`}>{children}</span>;
}

/** Durum noktası. Yeşil yalnız `ok` (yayında, hazır, sayılıyor). */
export function Nokta({ ton, etiket }: { ton: 'ok' | 'uyari' | 'notr'; etiket?: string }) {
  const t = ton === 'ok' ? 'bg-ok' : ton === 'uyari' ? 'bg-brand' : 'bg-ink/30';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${t}`} role={etiket ? 'img' : undefined} aria-label={etiket} aria-hidden={etiket ? undefined : true} />;
}

/** Bildirim: kırmızı sol çizgi. Hata da bu kutuyla, `role="alert"` ile. */
export function Bildirim({ children, baslik, hata = false, eylem }: { children?: ReactNode; baslik?: ReactNode; hata?: boolean; eylem?: ReactNode }) {
  return (
    <div
      role={hata ? 'alert' : 'status'}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-l-4 border-line border-l-brand bg-surface px-4 py-3 text-sm text-ink"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {baslik && <p className={`font-semibold ${hata ? 'text-brand-strong' : ''}`}>{baslik}</p>}
        {children && <div className="break-words text-ink-muted">{children}</div>}
      </div>
      {eylem && <div className="shrink-0">{eylem}</div>}
    </div>
  );
}

export function Kart({ children, className = '', etiket }: { children: ReactNode; className?: string; etiket?: string }) {
  return (
    <section aria-label={etiket} className={`min-w-0 rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </section>
  );
}

export const GIRDI = 'w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:bg-surface-muted disabled:text-ink-muted';

/** Yazma sonucu: üç hâl ayrı (çakışma ≠ hata). */
export type Yazma<T> = { tur: 'tamam'; veri: T } | { tur: 'cakisma'; mesaj: string } | { tur: 'hata'; mesaj: string };

/**
 * TEK YAZMA YOLU. 409'da plan yeniden okunur ve sürüm gönderilenden
 * FARKLIYSA "başkası değiştirdi"; aynıysa sunucunun kendi cümlesi (v1
 * `yazmaHatasiSinifla` gerekçesi: 409 beş ayrı durumda dönüyor).
 */
export async function yaz<T>(
  yol: string,
  yontem: 'POST' | 'PUT' | 'PATCH',
  govde: unknown,
  tazeSurum: () => Promise<number | null>,
  gonderilenSurum: number | null,
): Promise<Yazma<T>> {
  try {
    const veri = await apiFetch<T>(yol, { method: yontem, body: JSON.stringify(govde) });
    return { tur: 'tamam', veri };
  } catch (err) {
    const taze = err instanceof ApiRequestError && err.status === 409 ? await tazeSurum() : null;
    const s = yazmaHatasiSinifla(err, gonderilenSurum, taze);
    return s.cakisma ? { tur: 'cakisma', mesaj: s.mesaj } : { tur: 'hata', mesaj: s.mesaj };
  }
}
