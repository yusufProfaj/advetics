import type { ReactNode } from 'react';

/**
 * ═══ TEK SAYFA BAŞLIĞI ═══
 *
 * Sayfa başlıkları dört ayrı boyda çiziliyordu (`text-base`, `text-lg`,
 * `text-xl`, `text-2xl`) ve açıklama satırı kimi sayfada `text-sm`, kimi
 * sayfada `text-xs` idi. Menüde bir ekrandan ötekine geçen kullanıcı
 * başlığın zıpladığını görüyor ve "aynı ürünün içinde miyim" hissini
 * kaybediyordu.
 *
 * EYLEMLER BAŞLIĞIN SAĞINDA, dar ekranda altına iniyor. Sayfanın asıl
 * düğmesi her ekranda aynı yerde olmalı; kullanıcı onu aramamalı.
 */
export function SayfaBasligi({
  baslik,
  aciklama,
  ust,
  eylemler,
}: {
  baslik: string;
  /** Tek satırlık bağlam: kapsam, tarih aralığı, ne işe yaradığı. */
  aciklama?: ReactNode;
  /** Başlığın üstünde duran küçük satır (örneğin hiyerarşi yolu). */
  ust?: ReactNode;
  eylemler?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        {ust && <div className="mb-1.5">{ust}</div>}
        <h1 className="text-xl font-semibold tracking-tight text-ink [text-wrap:balance]">
          {baslik}
        </h1>
        {aciklama && (
          <div className="mt-1 max-w-3xl text-sm text-ink-muted [text-wrap:pretty]">
            {aciklama}
          </div>
        )}
      </div>
      {eylemler && <div className="flex flex-wrap items-center gap-2">{eylemler}</div>}
    </header>
  );
}
