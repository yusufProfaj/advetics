'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/**
 * ═══ FORM ALANI (referans "05 · Form") ═══
 *
 * Panelde dokuz `Alan` ve üç `Field` kopyası vardı; etiketin boyu, ipucunun
 * yeri ve hata metninin rengi her birinde farklıydı ve üçünde hata hiç
 * gösterilmiyordu. Tek kalıp: etiket (13, kalın) → alan (40 yüksek, 8
 * yarıçap) → altında ipucu YA DA hata. Hata varsa ipucunun yerini alır ve
 * alanın kenarı kırmızı olur.
 *
 * DOĞRULAMA GİRİŞ ANINDA (CLAUDE.md §3): hata metni kullanıcı alandan
 * çıkarken gelir, "Kaydet"e bastığında değil. Bu bileşen yalnız gösterir;
 * zamanlama çağıranın.
 *
 * ERİŞİLEBİLİRLİK: ipucu ve hata `aria-describedby` ile alana bağlı,
 * hatalı alan `aria-invalid`. `Alan` kimliği kendisi üretir ve çocuğa
 * `id` olarak geçmesi için `cocuk(id, aciklamaId)` biçimini de kabul eder.
 */
export function Alan({
  etiket,
  ipucu,
  hata,
  id: verilenId,
  children,
}: {
  etiket: ReactNode;
  ipucu?: ReactNode;
  hata?: ReactNode;
  id?: string;
  children: ReactNode | ((id: string, aciklamaId: string | undefined, hatali: boolean) => ReactNode);
}) {
  const uretilen = useId();
  const id = verilenId ?? uretilen;
  const aciklamaId = hata || ipucu ? `${id}-aciklama` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-13 font-semibold text-ink">
        {etiket}
      </label>
      {typeof children === 'function' ? children(id, aciklamaId, Boolean(hata)) : children}
      {hata ? (
        <small id={aciklamaId} role="alert" className="text-12 text-danger-strong">
          {hata}
        </small>
      ) : (
        ipucu && (
          <small id={aciklamaId} className="text-12 text-ink-muted">
            {ipucu}
          </small>
        )
      )}
    </div>
  );
}

const GIRDI =
  'h-10 w-full rounded-alan border bg-surface px-3 text-14 text-ink placeholder:text-ink-soluk disabled:cursor-not-allowed disabled:opacity-50';

function kenar(hatali?: boolean) {
  return hatali ? 'border-danger' : 'border-line-strong';
}

export const Girdi = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { hatali?: boolean }>(
  function Girdi({ hatali, className = '', ...kalan }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={hatali || undefined}
        className={`${GIRDI} ${kenar(hatali)} ${className}`}
        {...kalan}
      />
    );
  },
);

export const Secim = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { hatali?: boolean }>(
  function Secim({ hatali, className = '', children, ...kalan }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={hatali || undefined}
        className={`${GIRDI} ${kenar(hatali)} pr-8 ${className}`}
        {...kalan}
      >
        {children}
      </select>
    );
  },
);

export const MetinAlani = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { hatali?: boolean }
>(function MetinAlani({ hatali, className = '', ...kalan }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={hatali || undefined}
      className={`min-h-24 w-full rounded-alan border bg-surface px-3 py-2.5 text-14 text-ink placeholder:text-ink-soluk ${kenar(hatali)} ${className}`}
      {...kalan}
    />
  );
});

/** İki sütunlu form ızgarası; telefonda tek sütun. */
export function FormIzgarasi({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
