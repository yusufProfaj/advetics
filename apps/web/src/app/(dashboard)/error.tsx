'use client';

import { useEffect } from 'react';

/**
 * PANEL HATA SINIRI.
 *
 * Bu dosya yoktu: bir sunucu bileşeninde yakalanmamış hata BÜTÜN paneli
 * Next'in genel hata ekranına düşürüyordu — menü, üst bar, her şey gidiyor
 * ve kullanıcıya ne olduğunu söyleyen hiçbir şey kalmıyordu.
 *
 * SINIR `(dashboard)` SEVİYESİNDE: layout ayakta kalıyor, yalnızca içerik
 * alanı hata gösteriyor. Kullanıcı menüden başka bir yere gidebiliyor —
 * tek çıkışın sayfayı yenilemek olduğu bir ekran, bu üründe zaten yaşanan
 * "panel dondu" hissini büyütürdü.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Tarayıcı konsoluna yazılıyor: sunucu tarafı zaten kendi log'unu
    // tutuyor ama kullanıcıdan gelen bir raporda `digest` tek eşleşme
    // noktası oluyor.
    console.error('Panel hatası:', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-line bg-surface p-8 text-center">
      <h2 className="text-base font-semibold text-ink">Bu ekran yüklenemedi</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Sunucudan veri alınırken bir hata oluştu. Menüden başka bir ekrana
        geçebilir ya da tekrar deneyebilirsin.
      </p>

      {/* HATA KİMLİĞİ GÖSTERİLİYOR: kullanıcı "çalışmıyor" derken elinde
          sunucu log'uyla eşleşen bir anahtar olsun. Mesajın kendisi
          gösterilmiyor — sunucu hataları tablo ve kolon adı sızdırabiliyor. */}
      {error.digest && (
        <p className="mt-3 text-[11px] text-ink-muted">
          Hata kimliği: <code>{error.digest}</code>
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition"
      >
        Tekrar dene
      </button>
    </div>
  );
}
