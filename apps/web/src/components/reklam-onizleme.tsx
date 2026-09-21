'use client';

import { useEffect, useState } from 'react';
import type { AdDetail } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { AdCard } from '@/components/ad-card';

/**
 * ═══ REKLAM ÖNİZLEMESİ — KIRILIM TABLOSUNUN İÇİNDE ═══
 *
 * Hiyerarşinin son basamağı: reklam seti › reklam › ÖNİZLEME. Tabloda
 * reklamın yalnızca ADI ve sayıları duruyordu; "bu reklam neye benziyor"
 * sorusunun cevabı yoktu ve kullanıcı onu görmek için Reklam Keşfi ekranına
 * gidip aynı reklamı yeniden bulmak zorundaydı.
 *
 * ═══ KART YENİDEN YAZILMADI ═══
 *
 * `AdCard` Reklam Keşfi'nde zaten kullanılıyor ve içinde canlıda öğrenilmiş
 * kararlar var: arama reklamının kreatifi METNİDİR, görsel `contain` ile
 * çiziliyor, "görsel yok" üç ayrı hâli ayırıyor, platform önizlemesine
 * bağlantı veriyor. İkinci bir önizleme yazmak bunların hepsini ikinci kez
 * öğrenmek ve doğduğu anda ayrışmaktı.
 *
 * ═══ AÇILDIĞINDA ÇEKİLİYOR ═══
 *
 * Tabloda yirmi beş satır var ve hepsinin kreatifini önden çekmek yirmi beş
 * istek demek. Kullanıcı aynı anda tek bir reklama bakıyor; veri de o an
 * isteniyor.
 */
export function ReklamOnizleme({
  adId,
  from,
  to,
  currency,
}: {
  adId: string;
  from: string;
  to: string;
  currency: string | null;
}) {
  const [reklam, setReklam] = useState<AdDetail | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let birakildi = false;
    setReklam(null);
    setHata(null);

    void apiFetch<AdDetail>(`/ads/${adId}?from=${from}&to=${to}`)
      .then((r) => {
        // AÇIK REKLAM DEĞİŞTİYSE GELEN CEVAP ATILIYOR: iki istek yarışırsa
        // geç gelen eski reklamı yeni satırın altına çizerdi.
        if (!birakildi) setReklam(r);
      })
      /*
       * HATA YUTULMUYOR. `.catch(() => null)` yazmak "yükleniyor" ile
       * "çağrı düştü"yü aynı boş alana çevirirdi ve kullanıcı sebebi kendi
       * kurulumunda arardı — bu depoda adı konmuş yasak.
       */
      .catch((e: unknown) => {
        if (birakildi) return;
        setHata(
          e instanceof ApiRequestError ? e.message : 'Reklam önizlemesi alınamadı.',
        );
      });

    return () => {
      birakildi = true;
    };
  }, [adId, from, to]);

  if (hata) {
    return (
      <p role="alert" className="px-4 py-4 text-xs text-danger">
        {hata}
      </p>
    );
  }

  if (!reklam) {
    return <p className="px-4 py-4 text-xs text-ink-muted">Önizleme yükleniyor…</p>;
  }

  return (
    <div className="px-4 py-3">
      <AdCard ad={reklam} currency={currency} />
    </div>
  );
}
