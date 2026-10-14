'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Ekrana girince bir kez `gor` sınıfı ekleyen sıralı liste ("Nasıl
 * çalışır" kartlarının altındaki kırmızı çizgi). Kartlar sunucuda çiziliyor
 * ve buraya `children` olarak geliyor; istemciye yalnız bu sarmalayıcı
 * iniyor. JavaScript yoksa çizgi dolmuyor, içerik yine okunuyor.
 *
 * Bir kez dolup öyle kalıyor: her kaydırmada sıfırlanan bir çizgi, okuyanın
 * gözünü metinden alıyor.
 */
export function Gorunurlukte({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLOListElement | null>(null);
  const [gor, setGor] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const gozcu = new IntersectionObserver(
      ([g]) => {
        if (g?.isIntersecting) {
          setGor(true);
          gozcu.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    gozcu.observe(el);
    return () => gozcu.disconnect();
  }, []);
  return (
    <ol ref={ref} className={`${className}${gor ? ' gor' : ''}`}>
      {children}
    </ol>
  );
}
