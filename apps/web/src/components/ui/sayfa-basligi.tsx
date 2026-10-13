import type { ReactNode } from 'react';

/**
 * ═══ TEK SAYFA BAŞLIĞI ═══
 *
 * Sayfa başlıkları dört ayrı boyda çiziliyordu (`text-base`, `text-lg`,
 * `text-xl`, `text-2xl`) ve açıklama satırı kimi sayfada `text-sm`, kimi
 * sayfada `text-xs` idi. Menüde bir ekrandan ötekine geçen kullanıcı
 * başlığın zıpladığını görüyor ve "aynı ürünün içinde miyim" hissini
 * kaybediyordu.
 *
 * İSKELET REFERANSTAN ("01 · Sayfa başlığı"): kırmızı küçük harfli üst
 * başlık (menü bölümünün adı: Planla, Yönet…), menüdeki adın AYNISI olan
 * başlık, tek cümle açıklama. Sağda en çok bir birincil ve iki ikincil
 * düğme; dar ekranda alta iniyor. Süzgeç satırı başlığın altında.
 *
 * EYLEMLER BAŞLIĞIN SAĞINDA. Sayfanın asıl düğmesi her ekranda aynı yerde
 * olmalı; kullanıcı onu aramamalı.
 */
export function SayfaBasligi({
  baslik,
  aciklama,
  bolum,
  ust,
  eylemler,
  suzgecler,
}: {
  /** Menüdeki adın AYNISI (`nav-sections.spec.ts` bunu kilitliyor). */
  baslik: string;
  /** Tek satırlık bağlam: kapsam, tarih aralığı, ne işe yaradığı. */
  aciklama?: ReactNode;
  /** Kırmızı küçük harfli üst başlık: menü bölümünün adı ("Yönet"). */
  bolum?: string;
  /** Başlığın üstünde duran serbest satır (örneğin hiyerarşi yolu). */
  ust?: ReactNode;
  /** Sağ: en çok bir birincil (`Dugme`) ve iki ikincil düğme. */
  eylemler?: ReactNode;
  /** Başlığın altındaki süzgeç satırı (tarih, hesap, platform). */
  suzgecler?: ReactNode;
}) {
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        {/*
          EN AZ GENİŞLİK: `flex-1 min-w-0` tek başına başlığı sıfıra kadar
          daraltabiliyordu; telefonda eylem düğmeleri alta inmek yerine
          başlığın yanında kalıyor ve açıklama kelime kelime alt alta
          diziliyordu.
        */}
        <div className="min-w-[min(100%,18rem)] flex-1">
          {ust && <div className="mb-1.5">{ust}</div>}
          {bolum && (
            <span className="block text-12 font-bold uppercase leading-none tracking-[0.08em] text-brand-strong">
              {bolum}
            </span>
          )}
          <h1 className={`sayfa-baslik ${bolum ? 'mt-1.5' : ''}`}>{baslik}</h1>
          {aciklama && (
            <div className="mt-1 max-w-[62ch] text-14 leading-relaxed text-ink-muted [text-wrap:pretty]">
              {aciklama}
            </div>
          )}
        </div>
        {eylemler && <div className="flex flex-wrap items-center gap-2">{eylemler}</div>}
      </div>
      {suzgecler && <div className="flex flex-wrap items-center gap-2">{suzgecler}</div>}
    </header>
  );
}

/**
 * ═══ SAYFA İSKELETİ: başlık + içerik, İKİ genişlik ═══
 *
 * Panelde yedi farklı sayfa genişliği vardı (`max-w-3xl` … `max-w-7xl`,
 * bazı sayfalar sınırsız). Gezinirken içerik sağa sola kayıyordu. İki değer
 * kaldı: `genis` (panel düzeninin 1400 sınırı, tablo ve özet ekranları) ve
 * `dar` (`max-w-4xl`, form, ayar ve sihirbaz). Yatay dolgu düzende; burada
 * TEKRARLANMIYOR (iki kat dolgu sayfayı diğerlerinden farklı hizalıyordu).
 */
export function SayfaIskeleti({
  genislik = 'genis',
  children,
  ...baslik
}: Parameters<typeof SayfaBasligi>[0] & {
  genislik?: 'genis' | 'dar';
  children: ReactNode;
}) {
  return (
    <div className={`grid w-full gap-6 ${genislik === 'dar' ? 'mx-auto max-w-4xl' : ''}`}>
      <SayfaBasligi {...baslik} />
      {children}
    </div>
  );
}
