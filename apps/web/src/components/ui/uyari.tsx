import type { ReactNode } from 'react';

/**
 * ═══ TEK UYARI KUTUSU ═══
 *
 * Panelde dört ayrı `Notice` kopyası vardı (Genel Bakış, Bütçe, Kurallar,
 * Akıllı Boost, Reklam Keşfi) ve hepsi farklıydı: birinde `role` vardı,
 * birinde tehlike tonu yoktu. Hata kutusu ekran okuyucuya hiç
 * duyurulmuyordu.
 *
 * ROL TONDAN TÜRÜYOR, çağıran seçmiyor: tehlike `alert` (hemen duyurulur),
 * diğerleri `status` (sırası gelince). Çağırana bırakmak, bir gün bir hata
 * kutusunun sessiz kalması demekti.
 */
export type UyariTonu = 'bilgi' | 'uyari' | 'tehlike' | 'basari';

const TON: Record<UyariTonu, string> = {
  bilgi: 'border-info/25 bg-info-soft text-info-strong',
  uyari: 'border-warn/30 bg-warn-soft text-warn-strong',
  tehlike: 'border-danger/30 bg-danger-soft text-danger-strong',
  basari: 'border-ok/25 bg-ok-soft text-ok-strong',
};

export function Uyari({
  ton = 'bilgi',
  baslik,
  children,
  eylem,
}: {
  ton?: UyariTonu;
  baslik?: ReactNode;
  children?: ReactNode;
  /** Kutunun sağında duran tek eylem — "ne yapmalıyım" sorusunun cevabı. */
  eylem?: ReactNode;
}) {
  return (
    <div
      role={ton === 'tehlike' ? 'alert' : 'status'}
      className={`flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-sm ${TON[ton]}`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {baslik && <p className="font-semibold">{baslik}</p>}
        {children && <div className="break-words">{children}</div>}
      </div>
      {eylem && <div className="shrink-0">{eylem}</div>}
    </div>
  );
}
