'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { BilgiBankasi } from './bilgi-bankasi';

/**
 * ═══ BOOST ÖN AYARI — AUTO-BOOST'UN İÇİNDEN ═══
 *
 * Ön ayar ekranı zaten yazılıydı ama `/kutuphane/bilgi-bankasi` altında,
 * menünün bambaşka bir bölümünde duruyordu. Kullanıcının tarifi şuydu:
 * "üst tarafta onaylananları boostla butonu yerine boost ön ayarı tarzında
 * bir seçim ekranı yapmamız lazım."
 *
 * Sebep açık: ön ayar, kartın hangi bütçe ve hedeflemeyle yayınlanacağını
 * belirliyor — yani bu sayfadaki her "Onayla ve Boostla" düğmesinin
 * davranışını. Kararın verildiği yerle ayarın yapıldığı yerin iki ayrı
 * menü bölümünde olması, "bu kart neden 100 ₺ harcayacak" sorusunu
 * cevapsız bırakıyordu.
 *
 * MODAL, AYRI SAYFA DEĞİL: kullanıcı onay kuyruğunu görürken ayarı
 * değiştirip aynı ekrana dönüyor. Ayrı sayfaya gitmek, geri geldiğinde
 * kuyruğun başına dönmek demekti.
 *
 * PORTAL kullanılıyor — CLAUDE.md: "fixed inset-0 ekranın tamamı demek
 * değil; tam ekran her öğe portal ile document.body altına." Bu tuzağa
 * projede üç kez düşüldü.
 */
export function BoostOnAyariDugmesi({
  clientId,
  canWrite,
}: {
  clientId: string;
  canWrite: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAcik(false);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [acik]);

  function kapat(): void {
    setAcik(false);
    /*
     * KAPANINCA SAYFA TAZELENİYOR. Ön ayar değişince kartlardaki
     * "Uygulanacak: 100,00 ₺ / gün · 5 gün" satırı da değişmeli; yenilemeden
     * kullanıcı eski tutarı okumaya devam eder ve onayladığında başka bir
     * rakam harcanır.
     */
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-muted"
      >
        Boost ön ayarı
      </button>

      {acik &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) kapat();
            }}
          >
            <div className="my-8 flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface p-5 shadow-xl">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Boost ön ayarı</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Onayladığın her kart bu ayarlarla yayınlanır. Ayar bu
                    workspace’e kaydediliyor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={kapat}
                  className="rounded-lg px-2 py-1 text-sm text-ink-muted hover:text-ink"
                >
                  Kapat
                </button>
              </div>

              {/* Gövde kaydırılıyor, başlık sabit — 14 alanlı formda
                  "Kaydet" ekran dışında kalıyordu (şablon modalıyla aynı ders). */}
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <BilgiBankasi clientId={clientId} canWrite={canWrite} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
