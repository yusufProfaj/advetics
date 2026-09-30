import type { NavEntry } from '@/components/nav';
import { NavSection, AyarlarSatiri } from '@/components/nav';
import { kenarBolumleri } from '@/lib/nav-sections';
import { LogoutButton } from '@/components/logout-button';

export interface KenarVerisi {
  bolumler: Array<{ title?: string; items: NavEntry[] }>;
  sirketAdi: string;
  logoUrl: string | null;
  kullaniciAdi: string;
  rolEtiketi: string;
}

/**
 * Kenar çubuğunun İÇERİĞİ.
 *
 * AYRI DOSYADA ÇÜNKÜ İKİ YERDE ÇİZİLİYOR: masaüstünde sabit sütun,
 * mobilde çekmece. Markup iki yere kopyalansaydı biri güncellenmediğinde
 * telefondaki menü masaüstündekinden farklı olurdu ve bunu yalnızca telefonla
 * giren kullanıcı görürdü.
 *
 * `'use client'` YOK: burada istemciye özel bir şey yapmıyor. `NavSection`
 * zaten istemci bileşeni ve çekmeceden çağrıldığında bu dosya da istemci
 * paketine giriyor; layout'tan çağrıldığında sunucuda kalıyor.
 */
export function KenarIcerigi({ veri, onGezinme }: { veri: KenarVerisi; onGezinme?: () => void }) {
  const { bolumler, ayarlar } = kenarBolumleri(veri.bolumler);
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        {veri.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={veri.logoUrl} alt="" className="h-8 max-w-[150px] object-contain" />
        ) : (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-sm font-bold text-white shadow-[0_6px_16px_-6px_var(--brand-primary),inset_0_1px_0_rgb(255_255_255/0.25)]">
              {veri.sirketAdi.slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight">
              {veri.sirketAdi}
            </span>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" onClick={onGezinme}>
        {/*
          MENÜ YETKİYE GÖRE SÜZÜLÜYOR ve bölüm boş kalırsa başlığı da
          basılmıyor. Liste bir süre filtresizdi: müşteri hesabı ajansın iç
          ekranlarını menüde görüyordu. Arka uç zaten reddediyordu, yani veri
          sızmıyordu; ama o ekranların VARLIĞI sızıyordu.

          `onGezinme` ÇEKMECE İÇİN: bir bağlantıya basınca çekmece kapanmalı,
          yoksa yeni sayfa menünün arkasında açılıyor. Masaüstünde
          geçilmiyor ve hiçbir şey değişmiyor.
        */}
        {/* İlk bölüm başlıksız ve `key={undefined}` React'te uyarı üretiyordu. */}
        {bolumler.map((section, i) => (
          <NavSection key={section.title ?? `bolum-${i}`} title={section.title} items={section.items} />
        ))}
      </nav>

      {/*
        AYARLAR EN ALTTA, TEK SATIR. Yedi ayar ekranı menünün yarısını
        kaplıyordu; içerideki sekmeler aynı yetki listesinden çiziliyor.
      */}
      {ayarlar.length > 0 && (
        <div className="px-3 pt-2" onClick={onGezinme}>
          <AyarlarSatiri sayfalar={ayarlar} />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-surface-muted/70 px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-brand-accent/20 text-[11px] font-semibold uppercase text-brand-strong ring-1 ring-brand/15">
            {veri.kullaniciAdi.slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-tight">
              {veri.kullaniciAdi}
            </span>
            <span className="block truncate text-[11px] leading-tight text-ink-muted">
              {veri.rolEtiketi}
            </span>
          </span>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
