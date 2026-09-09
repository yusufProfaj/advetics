'use client';

/**
 * Oturum ekranlarının metin alanı.
 *
 * `login-form.tsx` içinde yerel bir bileşendi; şifre sıfırlama ekranı da aynı
 * alana ihtiyaç duyunca kopyalanacaktı. Kopyalanan bir form alanı, hata
 * gösterimi ve `aria-describedby` bağının bir ekranda güncellenip diğerinde
 * kalması demek — farkı yalnızca ekran okuyucu kullanan biri görür.
 */
export function Alan({
  id,
  label,
  type,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  ipucu,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  /** Alanın ALTINDA duran kural metni (örn. şifre politikası). */
  ipucu?: string;
}) {
  const yardimId = error ? `${id}-error` : ipucu ? `${id}-ipucu` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={yardimId}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : ipucu ? (
        <p id={`${id}-ipucu`} className="mt-1 text-xs text-ink-muted">
          {ipucu}
        </p>
      ) : null}
    </div>
  );
}
