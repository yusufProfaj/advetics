'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { stratejiPanelAdresi, stratejiUcYolu, type Permission, type StratejiGorunumu } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { okumaHatasi } from '../hesap';
import { AktarimEkrani } from './aktarim';
import { StratejiBelgesi } from './belge';
import { StratejiDuzenleyici } from './duzenleyici';
import { PdfIndir, pdfDosyaAdi } from './gonder';
import { GORUNUM_ETIKETI } from './hesap';
import { PanelOnayKutusu } from './onay-kutusu';
import { Bildirim, Rozet } from './ortak';
import type { AktarimOnizlemesi, Gerceklesen, StratejiDetayi, StratejiGirdileri, StratejiYorumu } from './yanit';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };

/**
 * ═══ ÜÇ GÖRÜNÜM, TEK SAYFA (`?gorunum=`) ═══
 *
 * İzinli görünümlerin HEPSİ monte (`monte`, `monteGorunumler`), yalnız seçili
 * olan görünür: strateji ekranında yazıp belgeye bakmaya giden ajans
 * döndüğünde yazdığını bulmalı. Görünüm değişimi bağlantıyla
 * (`stratejiPanelAdresi`), sunucu sayfayı yeniden çizse de bu bileşen aynı
 * yerde kaldığı için durum korunuyor.
 *
 * MÜŞTERİ HESABINDA `monte = ['belge']`: düzenleyici ve aktarım DOM'a hiç
 * girmez (sözleşme `stratejiGorunumKapisi`, test listesi 14).
 */
export function StratejiGorunumleri({
  clientId,
  ilkDetay,
  gorunum,
  monte,
  izinler,
  girdiler,
  yorumlar,
  onizleme,
  gerceklesen,
}: {
  clientId: string;
  ilkDetay: StratejiDetayi;
  gorunum: StratejiGorunumu;
  monte: readonly StratejiGorunumu[];
  izinler: readonly Permission[];
  girdiler: Okuma<StratejiGirdileri> | null;
  yorumlar: Okuma<StratejiYorumu[]>;
  onizleme: Okuma<AktarimOnizlemesi> | { tur: 'onaysiz' } | null;
  gerceklesen: Okuma<Gerceklesen> | null;
}) {
  const router = useRouter();
  const [detay, setDetay] = useState(ilkDetay);
  const [yenileHatasi, setYenileHatasi] = useState<string | null>(null);
  const [kirli, setKirli] = useState(false);
  useEffect(() => setDetay(ilkDetay), [ilkDetay]);
  const planId = ilkDetay.plan.id;

  /*
   * YENİLE İKİ İŞ: planı hemen okur (sürüm, kalem durumları) ve sunucunun
   * sayfayı yeniden çizmesini ister (yorumlar, önizleme, plan listesindeki
   * rozet). Okuma düşerse ekranda yazar; sessizce eski planla kalmak bir
   * sonraki kaydı 409'a düşürürdü.
   */
  const yenile = useCallback(async (): Promise<StratejiDetayi | null> => {
    try {
      const taze = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: planId }));
      setDetay(taze);
      setYenileHatasi(null);
      router.refresh();
      return taze;
    } catch (e) {
      setYenileHatasi(okumaHatasi(e));
      return null;
    }
  }, [planId, router]);
  const tazeSurum = useCallback(async () => (await yenile())?.plan.surum ?? null, [yenile]);
  const kirliBildir = useCallback((k: boolean) => setKirli(k), []);

  return (
    <div className="min-w-0 space-y-4">
      {monte.length > 1 && (
        <nav aria-label="Strateji görünümleri" className="-mx-1 overflow-x-auto px-1">
          <ul className="m-0 flex list-none gap-1 border-b border-line p-0">
            {monte.map((g) => (
              <li key={g} className="shrink-0">
                <Link
                  href={stratejiPanelAdresi({ musteri: clientId, plan: planId, gorunum: g })}
                  scroll={false}
                  aria-current={g === gorunum ? 'page' : undefined}
                  className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-sm font-semibold transition-colors ${g === gorunum ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
                >
                  {GORUNUM_ETIKETI[g]}
                  {g === 'duzenle' && kirli && <span className="h-1.5 w-1.5 rounded-full bg-brand" role="img" aria-label="kaydedilmemiş değişiklik var" />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {yenileHatasi && (
        <Bildirim hata baslik="Strateji yeniden okunamadı.">
          {yenileHatasi}
        </Bildirim>
      )}

      {monte.includes('duzenle') && (
        <div hidden={gorunum !== 'duzenle'}>
          {girdiler && <StratejiDuzenleyici detay={detay} girdiler={girdiler} izinler={izinler} yenile={yenile} tazeSurum={tazeSurum} kirliBildir={kirliBildir} />}
        </div>
      )}

      {monte.includes('belge') && (
        <div hidden={gorunum !== 'belge'} className="space-y-3">
          <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2">
            {monte.includes('duzenle') && <Rozet>Müşteri hesabı görünümü</Rozet>}
            <span className="text-xs text-ink-muted">Panelde ve PDF'te aynı sıra, aynı içerik.</span>
            {kirli && <span className="text-xs font-semibold text-brand-strong">Kaydedilmemiş değişiklik bu belgede yok.</span>}
            <span className="ml-auto">
              <PdfIndir planId={planId} surum={detay.plan.surum} dosyaAdi={pdfDosyaAdi(detay.plan.baslangic, detay.plan.surum)} />
            </span>
          </div>
          <StratejiBelgesi
            veri={detay}
            gerceklesen={gerceklesen}
            onayYuvasi={
              <PanelOnayKutusu
                planId={planId}
                surum={detay.plan.surum}
                durum={detay.plan.durum}
                izinler={izinler}
                onay={detay.plan.onay}
                yorumlar={yorumlar}
                yenile={() => void yenile()}
                tazeSurum={tazeSurum}
              />
            }
          />
        </div>
      )}

      {monte.includes('aktar') && (
        <div hidden={gorunum !== 'aktar'}>
          <AktarimEkrani
            detay={detay}
            onizleme={onizleme ?? { tur: 'onaysiz' }}
            gerceklesen={gerceklesen}
            izinler={izinler}
            yenile={yenile}
            tazeSurum={tazeSurum}
          />
        </div>
      )}
    </div>
  );
}
