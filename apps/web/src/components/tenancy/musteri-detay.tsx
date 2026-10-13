'use client';

import type { ReactNode } from 'react';
import { Pencere } from '@/components/ui/pencere';

/**
 * ═══ MÜŞTERİ DETAY PENCERESİ ═══
 *
 * Müşteri kartı her şeyi birden gösteriyordu: bağlı varlıkların tam listesi,
 * her birinin yanında açılır kutu ve iki eylem, özel reklam kategorisi,
 * havuzdan atama satırı. Üç sütunlu ızgarada her kart yarım ekran kaplıyor ve
 * sekiz müşteri dört ekran kaydırma demek — "hangi müşteride ne var"
 * sorusuna bakışta cevap veren bir liste olmaktan çıkmıştı.
 *
 * Kart artık YALNIZCA sayıları taşıyor (kaç varlık bağlı, kaçı izlemede, ekip
 * kaç kişi); geri kalan her şey bu pencerede.
 *
 * KABUK ORTAK `Pencere` (2026-10-14). Eskiden burada elle bir `fixed`
 * katman ve `document.body`ye portal vardı: pencere bir kartın içinden
 * açılıyor ve üst bardaki `backdrop-blur` onu başlığın kutusuna
 * hapsediyordu. `Pencere` aynı portalı kendisi kuruyor (panel kökü), Esc,
 * odak tuzağı ve DOM'da kalan kapanış geçişini de getiriyor; eski kabukta
 * odak tuzağı yoktu.
 */
export function MusteriDetay({
  acik,
  onKapat,
  baslik,
  altBaslik,
  altEylemler,
  children,
}: {
  acik: boolean;
  onKapat: () => void;
  baslik: string;
  altBaslik: string;
  /** Sağ altta: tek birincil ve "Kapat". */
  altEylemler?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Pencere acik={acik} onKapat={onKapat} baslik={baslik} aciklama={altBaslik} altEylemler={altEylemler} genislik="genis">
      <div className="space-y-5">{children}</div>
    </Pencere>
  );
}

/** Pencere içindeki bölüm başlığı — bölümler tek bir düzende dursun. */
export function DetayBolumu({
  baslik,
  sag,
  children,
}: {
  baslik: string;
  sag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-12 font-semibold text-ink-muted">
          {baslik}
        </h3>
        {sag}
      </div>
      {children}
    </section>
  );
}

/**
 * Etiket–değer satırı.
 *
 * BOŞ ALAN "—" BASIYOR, satırı gizlemiyor. Gizlemek, "bu müşterinin vergi
 * dairesi girilmemiş" ile "bu ekranda vergi dairesi diye bir alan yok"
 * hâllerini aynı boşluğa çeviriyor; oysa ilki doldurulacak bir eksik.
 */
export function DetaySatiri({ etiket, deger }: { etiket: string; deger: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <span className="text-xs text-ink-muted">{etiket}</span>
      <span className={`text-right text-xs ${deger ? 'text-ink' : 'text-ink-muted'}`}>
        {deger || '—'}
      </span>
    </div>
  );
}
