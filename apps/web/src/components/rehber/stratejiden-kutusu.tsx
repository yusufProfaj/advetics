'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { belgeyeGirerMi, stratejiPanelAdresi, stratejiUcYolu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import type { RehberinStratejisi } from '@advetics/shared';
import { donemMetni } from '@/components/strateji/v2/hesap';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamSozlugu } from '@/dil/sozlukler/reklam';
import { amacEkranAdi } from './rehber-mantik';

type Hal = { tur: 'yukleniyor' } | { tur: 'yok' } | { tur: 'var'; v: RehberinStratejisi } | { tur: 'hata'; mesaj: string };

/**
 * ═══ "STRATEJİDEN" KUTUSU — rehberin bağlı olduğu strateji kalemi ═══
 *
 * Kreatif yönergesi ve kitle tarifi REHBER ALANI DEĞİL (rehber ilgi alanı
 * ya da kitle şablonu taşımıyor, YENIDEN-TASARIM § 4.2): onaylanan
 * stratejinin "görsel şöyle olsun, şu kişilere anlatıyoruz" cümlesi reklamı
 * kuran kişinin gözü önünde durmazsa onay bir belgede kalır ve reklam başka
 * bir şey söyler. Kutu bu yüzden rehberin üstünde, her adımda görünür.
 *
 * Bağlı kalem yoksa (rehberlerin çoğu) kutu HİÇ çizilmez; bu bir hata değil.
 * Okuma düşerse tek satır hata yazar: sessizce kaybolan kutu, "bu reklamın
 * stratejisi yok" ile "okuyamadım"ı aynı boşluğa çevirirdi.
 *
 * Yapay zekâ önerisi hâlinde kalmış (ajansın "Kullan" demediği) metin
 * gösterilmez: müşteriye gitmemiş bir cümle reklamcıya "onaylı strateji"
 * diye sunulmamalı (`belgeyeGirerMi`).
 */
export function StratejidenKutusu({ rehberId }: { rehberId: string }) {
  const { dil } = useDil();
  const d = useSozluk(reklamSozlugu);
  const [hal, setHal] = useState<Hal>({ tur: 'yukleniyor' });

  useEffect(() => {
    let iptal = false;
    apiFetch<RehberinStratejisi | null | undefined>(stratejiUcYolu('/reklam/rehberler/:id/strateji', { id: rehberId })).then(
      (v) => !iptal && setHal(v ? { tur: 'var', v } : { tur: 'yok' }),
      (e: unknown) => !iptal && setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok }),
    );
    return () => {
      iptal = true;
    };
  }, [rehberId]);

  if (hal.tur === 'yukleniyor' || hal.tur === 'yok') return null;
  if (hal.tur === 'hata') {
    return (
      <p className="m-0 mb-3 text-xs text-brand-strong" role="alert">
        {d.strateji.okunamadi(hal.mesaj)}
      </p>
    );
  }
  const { v } = hal;
  const yon = belgeyeGirerMi(v.kreatifYonergesi) ? v.kreatifYonergesi!.metin : null;
  const kitle = belgeyeGirerMi(v.kitleTarifi) ? v.kitleTarifi!.metin : null;
  return (
    <aside className="mb-4 rounded-xl border border-l-4 border-line border-l-brand bg-surface px-4 py-3 text-sm" aria-label={d.strateji.etiket}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-ink">
          {d.strateji.baslik(donemMetni(v.baslangic, v.bitis, dil), v.sira, amacEkranAdi(v.amac, dil))}
        </b>
        <Link href={stratejiPanelAdresi({ musteri: v.clientId, plan: v.planId, adim: 'rapor' })} className="text-xs font-semibold text-brand-strong underline-offset-2 hover:underline">
          {d.strateji.ac}
        </Link>
      </div>
      {yon && (
        <p className="m-0 mt-1.5 text-ink">
          <span className="font-semibold">{d.strateji.yonerge}</span> {yon}
        </p>
      )}
      {kitle && (
        <p className="m-0 mt-1 text-ink">
          <span className="font-semibold">{d.strateji.kime}</span> {kitle}
        </p>
      )}
      {!yon && !kitle && <p className="m-0 mt-1 text-xs text-ink-muted">{d.strateji.bos}</p>}
      <p className="m-0 mt-1.5 text-[11px] text-ink-muted">{d.strateji.not}</p>
    </aside>
  );
}
