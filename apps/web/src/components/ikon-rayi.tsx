'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Icon, NavSection, aktifMi, type NavEntry } from '@/components/nav';
import { AdveticsLogo } from '@/components/advetics-logo';
import { LogoutButton } from '@/components/logout-button';
import type { KenarVerisi } from '@/components/kenar-cubugu';
import { kenarBolumleri } from '@/lib/nav-sections';
import {
  AYRILMA_GECIKME_MS,
  KAPALI,
  UZERINE_GECIKME_MS,
  olusturOgeleri,
  panelDurumu,
  rayOgeleri,
} from '@/lib/ikon-rayi';

/** Panel anahtarları: ray bölümleri + iki özel panel. */
const OLUSTUR = '__olustur';
const HESAP = '__hesap';
const AYARLAR = 'Ayarlar';

/**
 * ═══ İKON RAYI (masaüstü kabuğu, 2026-10-09) ═══
 *
 * Google Ads'in kullanım mantığı, Advetics'in görünüşü: dar ray, her bölüm
 * bir ikon karosu + altında adı, çok sayfalı bölüm yanda açılan panel. Karo,
 * satırlar ve renkler bugünkü menünün aynısı (`Icon`, `NavSection`); yeni
 * bir görünüş icat edilmedi. Kararlar `lib/ikon-rayi.ts`te ve test ediliyor.
 *
 * VERİ, TELEFON ÇEKMECESİYLE AYNI: `kenarVerisi` → `kenarBolumleri`.
 * Çekmece (`MobilMenu`) tam listeyi çiziyor, ray aynı listeyi ikonlara
 * indiriyor; biri güncellenip öbürü unutulamıyor.
 *
 * ═══ ANİMASYON NEDEN HER ZAMAN YERİNDE DURAN PANEL ═══
 *
 * Panel açılıp kapanırken DOM'dan çıkmıyor; görünürlüğü `opacity`,
 * `transform` ve `visibility` geçişiyle değişiyor. Bağla/çöz yaklaşımı ya
 * kapanış animasyonunu keser (panel bir kare içinde yok olur) ya da
 * zamanlayıcıyla geç çözmeyi gerektirir ve hızlı aç-kapa'da yarım kalmış
 * bir panel bırakır. `visibility` geçişi geçişin SONUNDA uygulandığı için
 * kapanırken panel tıklanamaz ama görünür kalır, bittiğinde tamamen gizlenir.
 * Kapalıyken `inert`: klavye ve ekran okuyucu içine giremez.
 * Kapanırken içerik boşalmasın diye son açık bölüm `gosterilen`de tutuluyor.
 */
export function IkonRayi({ veri }: { veri: KenarVerisi }) {
  const pathname = usePathname();
  const { bolumler, ayarlar } = kenarBolumleri(veri.bolumler);
  const ogeler = rayOgeleri(bolumler);
  const olustur = olusturOgeleri(bolumler);

  const [durum, gonder] = useReducer(panelDurumu, KAPALI);
  const [gosterilen, setGosterilen] = useState<string | null>(null);
  const [uzerineAcilir, setUzerineAcilir] = useState(false);
  const rayRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const aciciRef = useRef<HTMLButtonElement | null>(null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const temizle = useCallback(() => {
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = null;
  }, []);

  useEffect(() => {
    if (durum.acik) setGosterilen(durum.acik);
  }, [durum.acik]);

  // ÜZERİNE GELMEYLE AÇMA YALNIZ GERÇEK FAREDE. Dokunmatikte bir dokunuş
  // hem "üzerine geldi" hem "tıkladı" olayı üretiyor ve ikisi birden paneli
  // açıp hemen kapatıyordu.
  useEffect(() => {
    const m = window.matchMedia('(hover: hover) and (pointer: fine)');
    const guncelle = () => setUzerineAcilir(m.matches);
    guncelle();
    m.addEventListener('change', guncelle);
    return () => m.removeEventListener('change', guncelle);
  }, []);

  // Sayfa değişince panel kapanır: yeni sayfa panelin arkasında açılmasın.
  useEffect(() => {
    temizle();
    gonder({ tur: 'kapat' });
  }, [pathname, temizle]);

  // Dışarı tıklama ve Esc. Esc odağı paneli açan düğmeye geri verir;
  // vermese klavye kullanıcısı sayfanın başına düşer.
  useEffect(() => {
    if (!durum.acik) return;
    function disari(e: MouseEvent) {
      const t = e.target as Node;
      if (rayRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      temizle();
      gonder({ tur: 'kapat' });
    }
    function tus(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      temizle();
      gonder({ tur: 'kapat' });
      aciciRef.current?.focus();
    }
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, [durum.acik, temizle]);

  useEffect(() => temizle, [temizle]);

  function uzerine(anahtar: string) {
    if (!uzerineAcilir) return;
    temizle();
    // Panel zaten açıksa bölümler arasında gezinmek beklemeden geçer;
    // ilk açılış kısa bir gecikmeyle (geçip giden fare paneli titretmesin).
    if (durum.acik) {
      gonder({ tur: 'uzerine', anahtar });
      return;
    }
    zamanlayici.current = setTimeout(() => gonder({ tur: 'uzerine', anahtar }), UZERINE_GECIKME_MS);
  }

  function ayril() {
    if (!uzerineAcilir) return;
    temizle();
    zamanlayici.current = setTimeout(() => gonder({ tur: 'ayril' }), AYRILMA_GECIKME_MS);
  }

  function tik(anahtar: string, e: React.MouseEvent<HTMLButtonElement>) {
    temizle();
    aciciRef.current = e.currentTarget;
    gonder({ tur: 'tik', anahtar });
  }

  const panelOgeleri = (k: string | null): NavEntry[] => {
    if (k === OLUSTUR) return olustur;
    if (k === AYARLAR) return ayarlar;
    const o = ogeler.find((x) => x.anahtar === k);
    return o && o.tur === 'panel' ? o.ogeler : [];
  };
  const panelBasligi = gosterilen === OLUSTUR ? 'Oluştur' : gosterilen === HESAP ? veri.kullaniciAdi : gosterilen;
  const acik = durum.acik !== null;

  const rayDugmesi = (anahtar: string, etiket: string, ikon: NavEntry['icon'], aktif: boolean) => (
    <button
      key={anahtar}
      type="button"
      onClick={(e) => tik(anahtar, e)}
      onMouseEnter={() => uzerine(anahtar)}
      aria-expanded={durum.acik === anahtar}
      aria-controls="ray-paneli"
      className={raySatiri(aktif, durum.acik === anahtar)}
    >
      <Icon name={ikon} active={aktif} buyuk />
      <span className="max-w-full truncate px-1">{etiket}</span>
    </button>
  );

  return (
    <>
      <aside
        ref={rayRef}
        onMouseLeave={ayril}
        onMouseEnter={() => uzerineAcilir && temizle()}
        aria-label="Ana menü"
        className="sticky top-0 z-30 hidden h-screen w-[88px] shrink-0 flex-col items-center border-r border-line bg-surface/80 backdrop-blur-xl lg:flex"
      >
        <Link href="/dashboard" className="flex h-16 shrink-0 items-center justify-center" aria-label="Genel Bakış">
          {veri.logoUrl ? (
            <img src={veri.logoUrl} alt="" className="h-8 max-w-[64px] object-contain" />
          ) : (
            <AdveticsLogo kompakt />
          )}
        </Link>

        {/* + OLUŞTUR EN ÜSTTE, Google Ads'teki gibi; müşteri hesabında liste boş ve düğme yok. */}
        {olustur.length > 0 && (
          <div className="mb-2 flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={(e) => tik(OLUSTUR, e)}
              onMouseEnter={() => uzerine(OLUSTUR)}
              aria-expanded={durum.acik === OLUSTUR}
              aria-controls="ray-paneli"
              aria-label="Oluştur"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-accent text-white shadow-[0_8px_18px_-8px_var(--brand-primary)] transition-[transform,box-shadow] duration-200 hover:scale-[1.04] hover:shadow-[0_10px_22px_-8px_var(--brand-primary)] active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-5 w-5">
                <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <span className="text-[11px] font-semibold text-ink">Oluştur</span>
          </div>
        )}

        <nav className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 pb-2">
          {ogeler.map((o) => {
            if (o.tur === 'panel') {
              return rayDugmesi(o.anahtar, o.etiket, o.ikon, o.ogeler.some((x) => aktifMi(x, pathname)));
            }
            const aktif = aktifMi(o.oge, pathname);
            return (
              <Link
                key={o.anahtar}
                href={o.oge.href}
                onMouseEnter={() => {
                  // Fareyle açılmış panel doğrudan bağlantıya gelince kapanır;
                  // tıklamayla sabitlenmiş panel kapanmaz (`panelDurumu`).
                  if (uzerineAcilir && durum.acik) {
                    temizle();
                    gonder({ tur: 'ayril' });
                  }
                }}
                aria-current={aktif ? 'page' : undefined}
                title={o.etiket === o.oge.label ? undefined : o.oge.label}
                className={raySatiri(aktif, false)}
              >
                <Icon name={o.ikon} active={aktif} buyuk />
                <span className="max-w-full truncate px-1">{o.etiket}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex w-full flex-col items-center gap-0.5 border-t border-line/70 px-1.5 pb-3 pt-2">
          {ayarlar.length > 0 && rayDugmesi(AYARLAR, 'Ayarlar', 'settings', ayarlar.some((x) => aktifMi(x, pathname)))}
          <button
            type="button"
            onClick={(e) => tik(HESAP, e)}
            aria-expanded={durum.acik === HESAP}
            aria-controls="ray-paneli"
            aria-label={`Hesap: ${veri.kullaniciAdi}`}
            className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-brand-accent/20 text-[11px] font-semibold uppercase text-brand-strong ring-1 ring-brand/15 transition hover:ring-brand/40"
          >
            {veri.kullaniciAdi.slice(0, 2)}
          </button>
        </div>
      </aside>

      {/*
        PANEL RAYIN İÇİNDE DEĞİL, KARDEŞİ: rayın `backdrop-blur`u `fixed`
        konumlu çocukları rayın kutusuna hapseder ve panel yanlış yerde
        çıkar. Üst çubuğun altından başlıyor: kırıntı ve zil görünür kalıyor.
      */}
      <div
        id="ray-paneli"
        ref={panelRef}
        onMouseEnter={() => uzerineAcilir && temizle()}
        onMouseLeave={ayril}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) gonder({ tur: 'kapat' });
        }}
        inert={!acik}
        role="region"
        aria-label={panelBasligi ?? undefined}
        className={`fixed bottom-0 left-[88px] top-16 z-30 hidden w-64 flex-col border-r border-line bg-surface/95 shadow-[8px_0_24px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl transition-[opacity,transform,visibility] duration-150 ease-out motion-reduce:transition-none lg:flex ${
          acik ? 'visible translate-x-0 opacity-100' : 'invisible -translate-x-2 opacity-0'
        }`}
      >
        <p className="px-5 pb-1 pt-5 font-baslik text-sm font-bold text-ink">{panelBasligi}</p>
        {gosterilen === HESAP ? (
          <div className="flex flex-col gap-3 px-5 pt-1">
            <p className="text-[13px] text-ink-muted">{veri.rolEtiketi} · {veri.sirketAdi}</p>
            <LogoutButton />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <NavSection items={panelOgeleri(gosterilen)} />
          </div>
        )}
      </div>
    </>
  );
}

/** Ray satırı: ikon karosu + altında ad. Seçili ya da paneli açık olan vurgulu. */
function raySatiri(aktif: boolean, acik: boolean): string {
  const taban =
    'group flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] leading-tight transition-colors duration-150';
  if (aktif) return `${taban} font-semibold text-brand-strong`;
  if (acik) return `${taban} bg-surface-sunken/70 font-medium text-ink`;
  return `${taban} font-medium text-ink-muted hover:bg-surface-sunken/60 hover:text-ink`;
}
