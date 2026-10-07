'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReklamTaslakKaydi } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '../ui';

/**
 * Taslak sayfa AÇILIRKEN değil düğmeyle oluşturuluyor: GET ile taslak açmak
 * her yenilemede ve her önizleme taramasında yeni bir boş taslak bırakırdı.
 */
export function YeniTaslakDugmesi({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dugme
        disabled={bekliyor}
        onClick={async () => {
          setBekliyor(true);
          setHata(null);
          try {
            const t = await apiFetch<ReklamTaslakKaydi>('/reklam/taslaklar', {
              method: 'POST',
              body: JSON.stringify({ clientId, yuz: 'acemi' }),
            });
            router.push(`/reklam/yeni?musteri=${clientId}&taslak=${t.id}`);
          } catch (e) {
            setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
            setBekliyor(false);
          }
        }}
      >
        Yeni reklam başlat
      </Dugme>
      {hata && (
        <span role="alert" className="text-sm text-danger-strong">
          Taslak açılamadı: {hata}
        </span>
      )}
    </div>
  );
}
