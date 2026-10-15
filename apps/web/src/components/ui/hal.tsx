import type { ReactNode } from 'react';
import { UiMetni } from './ui-metni';

/**
 * ═══ DÖRT HÂL (referans "06 · Hâller") ═══
 *
 * Yükleniyor, boş (NEDENİYLE), hata (PLATFORMUN MESAJIYLA), sonuç. Panelde
 * on ayrı boş/hata bileşeni vardı ve en sık görülen hâl "hiçbiri"ydi:
 * `.catch(() => setX([]))` dört farklı durumu (henüz aranmadı, aranıyor,
 * sonuç yok, çağrı düştü) AYNI boş beyaz alana çeviriyordu (CLAUDE.md §3
 * "Sessiz hata bu projenin baş belası"). Dört hâl aynı kutu biçiminde:
 * kesikli çizgi, 36 piksellik ikon karosu, kalın başlık, bir cümle, bir
 * eylem. Hata kutusu düz çizgi, kırmızı ton.
 */

/** İskelet satırları: verinin geleceği yerin kabaca şekli. */
export function Yukleniyor({ satir = 3, etiket }: { satir?: number; etiket?: string }) {
  const genislik = ['60%', '100%', '80%', '90%', '70%'];
  return (
    <div
      role="status"
      aria-label={etiket}
      className="grid min-h-[170px] content-start gap-2 rounded-kart border border-dashed border-line-strong p-[22px]"
    >
      {/* Etiket verilmediyse ad ekranın dilinde (`aria-label` yerine görünmez metin). */}
      {etiket === undefined && (
        <span className="sr-only">
          <UiMetni k="yukleniyor" />
        </span>
      )}
      {Array.from({ length: satir }, (_, i) => (
        <span
          key={i}
          className="animate-pulse block h-3 rounded-md bg-surface-sunken"
          style={{ width: genislik[i % genislik.length] }}
        />
      ))}
    </div>
  );
}

function Karo({ children, hata = false }: { children: ReactNode; hata?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-9 w-9 place-items-center rounded-[10px] font-baslik text-14 font-extrabold ${
        hata ? 'bg-danger text-white' : 'bg-surface-sunken text-ink'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Boş liste NEDENİNİ söyler (`emptyReason` deseni): "sayfa atanmamış",
 * "izleme kapalı", "süpürme koşmadı" üçü de boş liste ama yapılacak iş
 * farklı. `neden` ZORUNLU: nedeni olmayan bir boş kutu bu bileşenle
 * yazılamasın.
 */
/*
 * VARSAYILAN İKON BOŞ KUTU, "0" KARAKTERİ DEĞİL. Eski varsayılan "0" idi ve
 * boş durum kutusunda sayı gibi okunuyordu ("0 ne?"; canlı denetim).
 * Çizgi ikon `currentColor`: kılavuz dışı renk taşımıyor.
 */
// MODÜL DÜZEYİNDE JSX DEĞİL, BİLEŞEN: dosyayı yalnız içe aktaran spec'ler
// (panelde React'i kapsamda tutmayan JSX dönüşümü) yükleme anında düşüyordu.
export function BosIkonu() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden className="h-4 w-4" data-bos-ikonu>
      <path d="M3 11h4l1.5 2h3L13 11h4M3 11l2-6h10l2 6v4H3v-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function BosDurum({
  baslik,
  neden,
  eylem,
  ikon = <BosIkonu />,
}: {
  baslik: ReactNode;
  neden: ReactNode;
  /** Yapılacak iş: "Hesap ata", "Süzgeçleri temizle". */
  eylem?: ReactNode;
  ikon?: ReactNode;
}) {
  return (
    <div className="grid min-h-[170px] content-start justify-items-start gap-2 rounded-kart border border-dashed border-line-strong p-[22px]">
      <Karo>{ikon}</Karo>
      <b className="font-baslik text-15 text-ink">{baslik}</b>
      <p className="m-0 text-13 text-ink-muted">{neden}</p>
      {eylem}
    </div>
  );
}

/**
 * Hata: platformun KENDİ mesajı ekranda (`mesaj`). "Beklenmeyen bir hata
 * oluştu" bu projede bir turu tamamen kaybettirdi; Meta'nın "(#4) request
 * limit reached" cümlesi ise sorunu tek bakışta söylüyor.
 */
export function HataDurumu({
  baslik,
  mesaj,
  onTekrar,
  eylem,
}: {
  baslik: ReactNode;
  /** Platformun ya da API'nin döndürdüğü metin, değiştirilmeden. */
  mesaj: ReactNode;
  onTekrar?: () => void;
  eylem?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="grid min-h-[170px] content-start justify-items-start gap-2 rounded-kart border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-vurgu p-[22px]"
    >
      <Karo hata>!</Karo>
      <b className="font-baslik text-15 text-ink">{baslik}</b>
      <p className="m-0 break-words text-13 text-ink-muted">{mesaj}</p>
      {onTekrar && (
        <button
          type="button"
          onClick={onTekrar}
          className="inline-flex h-8 items-center rounded-full border border-line-strong bg-surface px-3.5 text-[12.5px] font-bold text-ink transition-colors hover:bg-surface-sunken"
        >
          <UiMetni k="tekrarDene" />
        </button>
      )}
      {eylem}
    </div>
  );
}

/**
 * ŞERİT (referans "06 · Hâller" altı): beyaz zemin, SOL KIRMIZI ÇİZGİ, kalın
 * başlık + bir cümle, sağda eylemler ("Kapat" hayalet, "Sorunu çöz" koyu).
 * Uyarı ve hata bu biçimde; renk zeminde değil çizgide, metin siyah
 * (kullanıcı kararı 2026-10-14). `ton="bilgi"` çizgiyi griye çeker.
 */
export function Serit({
  baslik,
  children,
  eylemler,
  ton = 'uyari',
}: {
  baslik: ReactNode;
  children?: ReactNode;
  eylemler?: ReactNode;
  ton?: 'uyari' | 'hata' | 'bilgi';
}) {
  return (
    <div
      role={ton === 'hata' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-3 rounded-[12px] border border-l-4 border-line bg-surface px-4 py-3 ${
        ton === 'bilgi' ? 'border-l-ink-soluk' : 'border-l-danger'
      }`}
    >
      <div className="min-w-0 flex-1">
        <b className="block text-14 text-ink">{baslik}</b>
        {children && <span className="text-13 text-ink-muted">{children}</span>}
      </div>
      {eylemler && <div className="flex flex-wrap items-center gap-2">{eylemler}</div>}
    </div>
  );
}
