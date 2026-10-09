'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { GuncellemeDurumu, RefreshResult } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative, isStale } from '@/lib/format';
import { dugmeHali, type DugmeHali } from './guncelleme-hali';

/** İlerleme kaç saniyede bir soruluyor. */
const YOKLAMA_MS = 4000;
/**
 * Bu süreden sonra düğme beklemeyi bırakıyor ama İŞİ bitmiş saymıyor.
 * Büyük bir hesapta yapı taraması dakikalar sürebiliyor; düğmeyi sonsuza
 * kadar "Güncelleniyor" bırakmak, kullanıcının sayfadan hiç ayrılamaması
 * demek olurdu.
 */
const EN_UZUN_BEKLEME_MS = 4 * 60 * 1000;

/**
 * "ŞİMDİ GÜNCELLE" — TAZELİK GÖSTERGESİ VE GÜNCELLEME TEK KONTROLDE.
 *
 * ═══ SARI ŞERİT KALKTI ═══
 * Veri bayatsa Genel Bakış'ın ortasında tam genişlikte sarı bir kutu
 * çıkıyordu ("Veriler 4 sa önce güncellendi. Güncelleme durmuş olabilir").
 * Kullanıcının tarifi: *"görüntü kirliliği"*. Bilgi kaybolmadı, ait olduğu
 * yere taşındı: düğmenin solunda bir nokta ve son güncelleme zamanı. Nokta
 * taze veride yeşil, bayatta turuncu ve hafifçe nabız atıyor; ayrıntılı
 * cümle üzerine gelince (ve ekran okuyucuda) okunuyor. Düğmeye basmak
 * zaten uyarının istediği eylem.
 *
 * ═══ "İŞ KUYRUĞA ALINDI" YERİNE GÜNCELLENİYOR → GÜNCELLENDİ ═══
 * Düğme işleri kuyruğa atıp sayılarını yazıyordu ve bittiklerini hiç
 * söylemiyordu. Artık `refresh`in döndürdüğü kimliklerin durumunu
 * (`/sync/refresh/durum`) birkaç saniyede bir soruyor: beklerken
 * "Güncelleniyor 3/7", bitince "Güncellendi" ve veri o anda yenileniyor.
 * "Güncellendi" YALNIZCA İŞLER GERÇEKTEN BİTİNCE yazıyor — eski hâlin
 * yorumundaki kural aynen geçerli: taze sanılan bayat veri, hiç veri
 * olmamasından kötü. Düşen iş varsa sayısı ve Senkronizasyon bağlantısı
 * görünüyor, "Güncellendi" sessizce yeşil kalmıyor.
 */
export function RefreshButton({
  dateFrom,
  dateTo,
  rangeLabel,
  sonGuncelleme,
}: {
  dateFrom: string;
  dateTo: string;
  rangeLabel: string;
  /** Workspace'in son başarılı çekimi (ISO); hiç çekilmediyse `null`. */
  sonGuncelleme: string | null;
}) {
  const router = useRouter();
  const [hal, setHal] = useState<DugmeHali>({ tur: 'bos' });
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * "Güncellendi" birkaç saniye görünüp düğmenin normal hâline dönüyor;
   * yeni zaman damgası o arada `router.refresh` ile geliyor. Düşen iş varsa
   * mesaj KALIYOR: kullanıcı görmeden kaybolan bir uyarı, hiç olmamış gibi.
   */
  useEffect(() => {
    if (hal.tur !== 'guncellendi' || hal.dusen > 0) return;
    const t = setTimeout(() => setHal({ tur: 'bos' }), 6000);
    return () => clearTimeout(t);
  }, [hal]);

  // Sayfadan çıkınca yoklama durmalı: arka planda soran bir sekme, kimse
  // bakmazken API'yi yoruyor.
  useEffect(
    () => () => {
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
    },
    [],
  );

  function yokla(isler: string[], baslangic: number): void {
    zamanlayici.current = setTimeout(async () => {
      try {
        const d = await apiFetch<GuncellemeDurumu>(
          `/sync/refresh/durum?ids=${encodeURIComponent(isler.join(','))}`,
        );
        const yeni = dugmeHali(d, Date.now() - baslangic > EN_UZUN_BEKLEME_MS);
        setHal(yeni);
        if (yeni.tur === 'guncelleniyor') {
          yokla(isler, baslangic);
          return;
        }
        // Bitti (ya da bekleme süresi doldu): ekrandaki rakamları yenile.
        router.refresh();
      } catch (err) {
        /*
         * YOKLAMA DÜŞTÜ ≠ GÜNCELLEME DÜŞTÜ. İşler kuyrukta koşmaya devam
         * ediyor; yalnızca ilerlemeyi göremiyoruz. İkisini aynı kırmızıya
         * çevirmek, kullanıcıyı bir kez daha basmaya (kotayı ikinci kez
         * harcamaya) iterdi.
         */
        setHal({
          tur: 'bilinmiyor',
          mesaj: err instanceof ApiRequestError ? err.message : 'İlerleme okunamadı.',
        });
        router.refresh();
      }
    }, YOKLAMA_MS);
  }

  async function guncelle(): Promise<void> {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    setHal({ tur: 'baslatiliyor' });
    try {
      /*
       * EKRANDA SEÇİLİ ARALIK GÖNDERİLİYOR. Düğme bir süre gövdesiz
       * çağırıyordu ve sunucu yalnızca BUGÜNÜ tazeliyordu: kullanıcı
       * "Son 30 gün" seçip basıyor, hiçbir şey değişmiyordu.
       */
      const res = await apiFetch<RefreshResult>('/sync/refresh', {
        method: 'POST',
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const isler = res.isler ?? [];
      if (isler.length === 0) {
        // Kuyruğa girecek iş yoksa (her şey desteklenmiyor) bekleyecek bir şey de yok.
        setHal({ tur: 'guncellendi', dusen: 0, sonHata: null });
        router.refresh();
        return;
      }
      setHal({ tur: 'guncelleniyor', biten: 0, toplam: isler.length });
      yokla(isler, Date.now());
    } catch (err) {
      setHal({
        tur: 'hata',
        mesaj: err instanceof ApiRequestError ? err.message : 'Güncelleme başlatılamadı.',
      });
    }
  }

  const bayat = isStale(sonGuncelleme);
  const calisiyor = hal.tur === 'baslatiliyor' || hal.tur === 'guncelleniyor';
  const tazelikCumlesi = sonGuncelleme
    ? `Veriler ${formatRelative(sonGuncelleme)} güncellendi.${bayat ? ' Güncelleme durmuş olabilir.' : ''}`
    : 'Veri henüz hiç çekilmedi.';

  return (
    <div className="flex flex-col items-end gap-1">
      {/*
        ONAYLANAN TASLAĞIN DÜZENİ (2026-10-09): tek düğme; simge, eylem ve
        sonda küçük harfle tazelik ("12 dk önce"). Veri bayatsa zaman uyarı
        renginde ve ekran okuyucu tam cümleyi duyuyor; renk tek başına anlam
        taşımıyor, `title` da söylüyor.
      */}
      <div title={calisiyor ? `${rangeLabel} güncelleniyor` : tazelikCumlesi}>
        <button
          type="button"
          onClick={() => void guncelle()}
          disabled={calisiyor}
          aria-live="polite"
          className="group flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-line bg-surface px-3 py-[7px] text-[12.5px] font-medium text-ink shadow-kart transition-colors duration-200 hover:bg-surface-muted disabled:cursor-progress"
        >
          <span className="sr-only">{tazelikCumlesi}</span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform duration-[600ms] ease-[var(--ease-out)] motion-reduce:transition-none ${calisiyor ? 'advetics-donus text-info' : hal.tur === 'guncellendi' && hal.dusen === 0 ? 'text-ok' : 'text-ink-muted group-hover:rotate-180'}`}
          >
            {hal.tur === 'guncellendi' && hal.dusen === 0 ? (
              <path d="M4.5 10.5 8 14l7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path
                d="M15.5 8A6 6 0 0 0 4.7 6.5M4.5 12a6 6 0 0 0 10.8 1.5M15.5 3.5V8H11M4.5 16.5V12H9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          {dugmeMetni(hal)}
          {!calisiyor && (
            <small aria-hidden className={`text-[11.5px] font-normal ${bayat ? 'text-warn-strong' : 'text-ink-muted'}`}>
              {sonGuncelleme ? formatRelative(sonGuncelleme) : 'hiç güncellenmedi'}
            </small>
          )}
        </button>
      </div>

      {hal.tur === 'guncellendi' && hal.dusen > 0 && (
        <span className="max-w-xs text-right text-[11px] text-warn-strong">
          {hal.dusen} iş tamamlanamadı{hal.sonHata ? `: ${hal.sonHata}` : '.'}{' '}
          <Link href="/ayarlar/senkronizasyon" className="underline underline-offset-2">
            Ayrıntı
          </Link>
        </span>
      )}
      {hal.tur === 'uzun' && (
        <span className="max-w-xs text-right text-[11px] text-ink-muted">
          Hâlâ sürüyor. Veriler geldikçe bu ekrana yansır.
        </span>
      )}
      {(hal.tur === 'hata' || hal.tur === 'bilinmiyor') && (
        <span role="alert" className="max-w-xs text-right text-[11px] text-danger-strong">
          {hal.tur === 'bilinmiyor' ? `Güncelleme sürüyor, ilerleme okunamadı: ${hal.mesaj}` : hal.mesaj}
        </span>
      )}
    </div>
  );
}

function dugmeMetni(hal: DugmeHali): string {
  switch (hal.tur) {
    case 'baslatiliyor':
      return 'Güncelleniyor…';
    case 'guncelleniyor':
      return `Güncelleniyor ${hal.biten}/${hal.toplam}`;
    case 'guncellendi':
      return hal.dusen > 0 ? 'Kısmen güncellendi' : 'Güncellendi';
    case 'uzun':
      return 'Güncelle';
    default:
      return 'Güncelle';
  }
}
