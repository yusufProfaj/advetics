'use client';

import type { ReactNode } from 'react';
import type { PlanDetayi, PlanDurumu } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Serit } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { DURUM_ETIKETI, yazmaHatasiSinifla, yenidenOkunmali } from './hesap';

/**
 * AdvStrategy bölümlerinin ortak parçaları: durum rozeti, kilit notu, bölüm
 * başlığı ve TEK yazma yolu.
 */

/*
 * Eski planın beş tonu ortak rozetin dört hâline: onaylı yeşil nokta, onay
 * bekleyen kırmızı (dikkat ister), iptal gri KARE (kapandı), gerisi gri.
 */
const ROZET_HALI: Record<(typeof DURUM_ETIKETI)[PlanDurumu]['ton'], DurumHali> = {
  notr: 'taslak',
  uyari: 'hata',
  tamam: 'ok',
  bilgi: 'taslak',
  kapali: 'dur',
};

export function DurumRozeti({ durum }: { durum: PlanDurumu }) {
  const d = DURUM_ETIKETI[durum];
  return <Rozet hal={ROZET_HALI[d.ton]}>{d.metin}</Rozet>;
}

export function BolumBasligi({
  id,
  baslik,
  aciklama,
  eylem,
}: {
  id: string;
  baslik: string;
  aciklama: ReactNode;
  eylem?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-baslik text-lg font-semibold text-ink">
          {baslik}
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">{aciklama}</p>
      </div>
      {eylem}
    </div>
  );
}

/** Salt okunur alanın NEDENİ — gri kutu tek başına "bozuk" diye okunuyor. */
export function KilitNotu({ neden }: { neden: string }) {
  return (
    <Serit ton="bilgi" baslik={neden} />
  );
}

/** Yazma sonucu: üç hâl ayrı. Çakışma, genel hatadan AYRI bir iş (bkz. `hesap.ts`). */
export type YazmaSonucu<T = unknown> =
  | { tur: 'tamam'; veri: T }
  | { tur: 'cakisma'; mesaj: string }
  | { tur: 'hata'; mesaj: string };

/**
 * TEK YAZMA YOLU. Her bölüm buradan yazıyor: başarıda plan yeniden okunuyor
 * (yeni `surum` ve sunucunun kaydettiği hâl); 409'da da yeniden okunuyor ve
 * okunan sürüm gönderilenden farklıysa sonuç `cakisma` (bkz.
 * `yazmaHatasiSinifla`). Bölüm iki durumda da KULLANICININ TASLAĞINA
 * dokunmuyor. Üç bölümde ayrı ayrı yazılsaydı biri yeniden okumayı unuturdu
 * ve ekran eski sürümle bir sonraki kaydı da 409'a düşürürdü.
 */
export async function planaYaz<T = unknown>(
  yol: string,
  yontem: 'POST' | 'PUT' | 'PATCH',
  govde: unknown,
  yenile: () => Promise<PlanDetayi | null>,
  gonderilenSurum: number,
): Promise<YazmaSonucu<T>> {
  try {
    const veri = await apiFetch<T>(yol, { method: yontem, body: JSON.stringify(govde) });
    await yenile();
    return { tur: 'tamam', veri };
  } catch (err) {
    const taze = yenidenOkunmali(err) ? await yenile() : null;
    const s = yazmaHatasiSinifla(err, gonderilenSurum, taze?.plan.surum ?? null);
    return s.cakisma ? { tur: 'cakisma', mesaj: s.mesaj } : { tur: 'hata', mesaj: s.mesaj };
  }
}

/** Tablo kabı: tablo kendi içinde kayar, sayfa yatay kaymaz. */
export function TabloKabi({ children, etiket }: { children: ReactNode; etiket: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" role="region" aria-label={etiket} tabIndex={0}>
      {children}
    </div>
  );
}

export const GIRDI_SINIFI =
  'w-full min-w-0 rounded-alan border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:bg-surface-muted disabled:text-ink-muted';
