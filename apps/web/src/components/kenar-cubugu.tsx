import type { NavEntry } from '@/components/nav';
import { NavSection } from '@/components/nav';
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
  return (
    <>
      <div className="flex h-16 items-center gap-2.5 px-4">
        {veri.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={veri.logoUrl} alt="" className="h-8 max-w-[150px] object-contain" />
        ) : (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
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
        {veri.bolumler.map((section) => (
          <NavSection key={section.title} title={section.title} items={section.items} />
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold uppercase">
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
