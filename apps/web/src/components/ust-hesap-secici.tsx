'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PAKET_SINIRLARI, type ManagerPaket } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { gecisHedefi } from '@/lib/kapsam-hedefi';
import { Halka, TamEkranYukleniyor } from './yukleniyor';

export interface SecilebilirUstHesap {
  id: string;
  name: string;
  slug: string;
  paket: ManagerPaket;
  sirketSayisi: number;
}

/**
 * ═══ ÜST HESAP SEÇİCİ ═══
 *
 * Üst barda İKİ seçici var ve ikisi ayrı katman:
 *   · SOLDA (bu) ÜST HESAP — hangi danışmanlığın ağacına bakıyoruz.
 *   · SAĞDA `KapsamSecici` — o ağacın içinde hangi şirket/workspace.
 *
 * Uzun süre tek seçici vardı çünkü bir kullanıcının TEK üst hesabı
 * olabiliyordu (`@@unique([userId])`). Advetics'i işleten taraf üst hesabı
 * bir ÜRÜN olarak satmaya başlayınca kilidin şartı karşılandı: birden çok
 * hesap ve aralarında geçiş.
 *
 * ┌─ TEK ELEMANLIYSA HİÇ ÇİZİLMİYOR ──────────────────────────────────────┐
 * │ Geçilecek bir yer yokken açılır kutu, kullanıcıyı olmayan bir         │
 * │ özelliği aramaya gönderir. Kendi ajansını yöneten bir müşteri bu      │
 * │ seçiciyi hiç görmüyor — ekranı bugünküyle birebir aynı.               │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ALTTA SABİT BİR SEKME: "Üst hesap ayarları". Seçici hangi hesaba
 * bakıldığını söylüyor; o hesabı DÜZENLEMEK ayrı bir iş ve listenin içinde
 * bir satır olsaydı "bu da bir hesap mı" diye okunurdu.
 */
export function UstHesapSecici({
  hesaplar,
  aktifId,
  yonetimGorunur,
}: {
  hesaplar: SecilebilirUstHesap[];
  aktifId: string | null;
  /** "Üst hesap ayarları" bağlantısı — `org.write` yoksa basılmıyor. */
  yonetimGorunur: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent) {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, []);

  /*
   * TEK HESAPTA SEÇİCİ YOK — ama hesap varsa adı yine görünmeli mi? Hayır:
   * `KapsamSecici` zaten ajans adını taşıyor ve ikinci bir yerde yazmak
   * aynı bilgiyi iki kez basmak olurdu.
   */
  if (hesaplar.length < 2) return null;

  const aktif = hesaplar.find((h) => h.id === aktifId) ?? null;
  const bekliyor = pending || isPending;

  async function gec(hesap: SecilebilirUstHesap): Promise<void> {
    if (hesap.id === aktifId) {
      // ZATEN BURADAYIZ — istek atılmıyor. Hiçbir şey değiştirmeyen bir tur,
      // kullanıcıya bir bekleme örtüsü ve aynı ekranı göstermek demek.
      setOpen(false);
      return;
    }
    setOpen(false);
    setPending(true);
    setHata(null);
    setGecilen(hesap.name);
    try {
      await apiFetch('/auth/switch-manager', {
        method: 'POST',
        body: JSON.stringify({ managerAccountId: hesap.id }),
      });
      /*
       * TAM SAYFA. Üst hesap değişince şirket ve workspace seçimi de
       * sıfırlanıyor; kenar çubuğu, marka ve bütün sunucu bileşenlerinin
       * verisi başka bir ağaçtan geliyor. İstemci state'i (açık süzgeçler,
       * seçili kimlikler) önceki ağaçtan kalırsa sessizce boş listeler
       * üretiyor.
       *
       * AYNI SAYFADA KALINIYOR: `gecisHedefi` yalnızca eski kapsamın
       * kimliğini taşıyan yol parçalarını kesiyor.
       */
      const hedef = gecisHedefi(pathname, Object.fromEntries(searchParams?.entries() ?? []));
      startTransition(() => window.location.assign(hedef));
    } catch (e) {
      // HATA YUTULMUYOR: sessizce eski hesapta kalmak "tıkladım ama
      // değişmedi" hâli demek (CLAUDE.md).
      setHata(e instanceof ApiRequestError ? e.message : 'Üst hesap değiştirilemedi.');
      setPending(false);
      setGecilen(null);
    }
  }

  return (
    <div ref={kutuRef} className="relative">
      {bekliyor && <TamEkranYukleniyor mesaj={`${gecilen ?? 'Üst hesap'} açılıyor…`} />}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={bekliyor}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-[12rem] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-[11px] font-semibold uppercase text-white">
          {(aktif?.name ?? 'ÜH').slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">
            {aktif?.name ?? 'Üst hesap seç'}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            {aktif ? PAKET_SINIRLARI[aktif.paket].etiket : `${hesaplar.length} üst hesap`}
          </span>
        </span>
        {bekliyor ? (
          <Halka />
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {hata && (
        <p
          role="alert"
          className="absolute left-0 top-full z-30 mt-1 w-max max-w-sm rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700"
        >
          {hata}
        </p>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 flex w-[20rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="max-h-[20rem] overflow-y-auto py-1">
            {hesaplar.map((h) => (
              <button
                key={h.id}
                type="button"
                role="option"
                aria-selected={h.id === aktifId}
                onClick={() => void gec(h)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-muted ${
                  h.id === aktifId ? 'font-semibold text-brand' : 'text-ink'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{h.name}</span>
                  {/*
                    PAKET VE ŞİRKET SAYISI YAZILI: kırk dokuz şirketli bir
                    ajansla tek şirketli bir müşteriyi aynı satırda göstermek,
                    yanlış hesaba girip fark etmemek demekti.
                  */}
                  <span className="block truncate text-[11px] font-normal text-ink-muted">
                    {PAKET_SINIRLARI[h.paket].etiket} · {h.sirketSayisi} şirket
                  </span>
                </span>
                {h.id === aktifId && (
                  <span className="shrink-0 text-[11px] text-ink-muted">seçili</span>
                )}
              </button>
            ))}
          </div>

          {/*
            ALTTA SABİT SEKME — `KapsamSecici`deki "Yönetim paneli" ile aynı
            desen ve aynı gerekçe: bir hesap SEÇMİYOR, yeni bir ekran açıyor.
            Diğer satırlarla aynı görünseydi "bu da bir üst hesap mı" diye
            okunurdu.

            YETKİSİ OLMAYANA GÖSTERİLMİYOR: sayfa `org.write` istiyor ve
            yetkisizi `/dashboard`a yönlendiriyor.
          */}
          {yonetimGorunur && (
            <Link
              href="/ayarlar/ust-hesap"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-line bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
                <path
                  d="M10 3v14M3 10h14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Üst hesap ayarları
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
