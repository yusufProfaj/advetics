import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Reklam modülünün KENDİ görsel parçaları.
 *
 * Modül bilerek panelin `components/ui` katmanını kullanmıyor (kullanıcı
 * kararı, 2026-10-07: "tamamen ayrı modül"). Sebep: eski Reklam Oluştur,
 * Hızlı Reklam ve ad-builder Aşama 7'de silinecek; yeni modül onların
 * herhangi bir parçasına bağlıysa silme işi "bu neyi kırar" sorusuyla başlar.
 * Ortak kalanlar yalnızca oturum, workspace seçimi, API istemcisi ve
 * `globals.css` renk belirteçleri (tema; ayrı tutulursa açık/koyu ayrışır).
 *
 * Dosya küçük kalmalı: bu katman bir tasarım sistemi değil, modülün ihtiyacı.
 */

export type DugmeTonu = 'birincil' | 'ikincil' | 'sade';

export function dugmeSinifi(ton: DugmeTonu = 'birincil', kucuk = false): string {
  const tonlar: Record<DugmeTonu, string> = {
    birincil: 'bg-brand text-white hover:brightness-95',
    ikincil: 'border border-line bg-surface text-ink hover:bg-surface-muted',
    sade: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
  };
  return [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold',
    'transition-[background-color,color,filter] duration-200',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:cursor-not-allowed disabled:opacity-50',
    kucuk ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
    tonlar[ton],
  ].join(' ');
}

export function Dugme({
  ton = 'birincil',
  kucuk = false,
  className,
  type = 'button',
  ...kalan
}: ButtonHTMLAttributes<HTMLButtonElement> & { ton?: DugmeTonu; kucuk?: boolean }) {
  return <button type={type} className={`${dugmeSinifi(ton, kucuk)} ${className ?? ''}`} {...kalan} />;
}

export type KutuTonu = 'bilgi' | 'uyari' | 'tehlike' | 'iyi';

/**
 * Bilgi/uyarı kutusu. Tehlike `role="alert"`; diğerleri `status` — ekran
 * okuyucu her uyarıyı alarm gibi okursa gerçek alarm kaybolur.
 */
export function Kutu({
  ton = 'bilgi',
  baslik,
  children,
  eylem,
}: {
  ton?: KutuTonu;
  baslik?: ReactNode;
  children?: ReactNode;
  eylem?: ReactNode;
}) {
  const renk: Record<KutuTonu, string> = {
    bilgi: 'border-line bg-surface',
    uyari: 'border-warn/30 bg-warn-soft text-warn-strong',
    tehlike: 'border-danger/30 bg-danger-soft text-danger-strong',
    iyi: 'border-ok/30 bg-ok-soft text-ok-strong',
  };
  return (
    <div
      role={ton === 'tehlike' ? 'alert' : 'status'}
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm ${renk[ton]}`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {baslik && <p className="font-semibold">{baslik}</p>}
        {children && <div className="break-words opacity-90">{children}</div>}
      </div>
      {eylem && <div className="shrink-0">{eylem}</div>}
    </div>
  );
}

export function Baslik({ baslik, aciklama, ust }: { baslik: string; aciklama?: ReactNode; ust?: ReactNode }) {
  return (
    <header className="space-y-0.5">
      {ust && <div className="mb-1.5">{ust}</div>}
      <h1 className="sayfa-baslik">{baslik}</h1>
      {aciklama && <p className="text-sm text-ink-muted">{aciklama}</p>}
    </header>
  );
}
