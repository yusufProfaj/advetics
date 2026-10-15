import type { ReactNode } from 'react';
import { UiMetni } from './ui-metni';

/**
 * ═══ TABLO (referans "04 · Tablo") ═══
 *
 * Süzgeç çipleri tablonun ÜSTÜNDE (araç çubuğu), ad sütunu bağlantı ve
 * altında gri açıklama, sayılar SAĞA YASLI ve hizalı rakam, TOPLAM satırı ve
 * "1 - 10 / 37" her zaman. Başlık 12 piksel, BÜYÜK HARF YOK: panelde
 * büyük harfli ve harf aralıklı başlıklar Türkçe "İ/ı" ile kırılıyor ve
 * sütun adını okumayı yavaşlatıyordu.
 *
 * SESSİZ KESME YOK (CLAUDE.md §3): satırlar kesiliyorsa `sayfalama` verilir
 * ve kaç satırın gösterildiği ile toplam yazılır.
 *
 * TOPLAM, SÜTUN TANIMINDAN: her sütun kendi toplam hücresini taşıyor. Başlık,
 * gövde ve toplam ayrı ayrı elle eşlenince bir sütun eklenip toplamı
 * unutulduğunda tablo sessizce kayıyordu (CLAUDE.md "TABLO BAŞLIĞI,
 * GÖVDESİ, TOPLAMI VE DİPNOTU TEK LİSTEDEN TÜRETİLİR").
 */
export interface TabloSutunu<T> {
  anahtar: string;
  baslik: ReactNode;
  /** Sayı sütunu: sağa yaslı, hizalı rakam, satır kırmaz. */
  sayi?: boolean;
  hucre: (satir: T) => ReactNode;
  /** Toplam satırındaki hücre; toplanamıyorsa `null` (boş hücre). */
  toplam?: ReactNode | null;
  /** Dar ekranda gizlenebilir ikincil sütun. */
  ikincil?: boolean;
}

export interface Sayfalama {
  /** 1 tabanlı ilk satır. */
  bas: number;
  son: number;
  toplam: number;
  onceki?: () => void;
  sonraki?: () => void;
}

export function Tablo<T>({
  sutunlar,
  satirlar,
  satirAnahtari,
  aracCubugu,
  toplamEtiketi,
  sayfalama,
  bos,
  onSatir,
  etiket,
}: {
  sutunlar: Array<TabloSutunu<T>>;
  satirlar: T[];
  satirAnahtari: (satir: T) => string;
  /** `AracCubugu` (süzgeç çipleri + sağda küçük düğmeler). */
  aracCubugu?: ReactNode;
  /** Toplam satırının ilk hücresi: "Toplam · 3 kampanya". Verilmezse toplam satırı yok. */
  toplamEtiketi?: ReactNode;
  sayfalama?: Sayfalama;
  /** Satır yokken tablonun yerine çizilen hâl (`BosDurum`, nedeniyle). */
  bos?: ReactNode;
  onSatir?: (satir: T) => void;
  /** Ekran okuyucu için tablo adı. */
  etiket?: string;
}) {
  const hucreSinifi = (s: TabloSutunu<T>) =>
    `${s.sayi ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'} ${s.ikincil ? 'max-sm:hidden' : ''}`;
  return (
    <div className="min-w-0">
      {aracCubugu}
      {satirlar.length === 0 && bos ? (
        <div className="p-4">{bos}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]" aria-label={etiket}>
            <thead>
              <tr>
                {sutunlar.map((s) => (
                  <th
                    key={s.anahtar}
                    scope="col"
                    className={`whitespace-nowrap border-b border-line px-4 py-2.5 text-12 font-semibold normal-case tracking-normal text-ink-muted ${hucreSinifi(s)}`}
                  >
                    {s.baslik}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir) => (
                <tr
                  key={satirAnahtari(satir)}
                  className={`hover:bg-surface-muted ${onSatir ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand' : ''}`}
                  /*
                   * SATIR TIKLAMASI KLAVYEYLE DE (Ajan 4 denetimi): `onSatir`
                   * yalnız fareyle çalışıyordu (Ekip tablosu satırı yan paneli
                   * açıyor). Satır odaklanabilir, Enter/Boşluk açar. Hücredeki
                   * bir düğmeden, bağlantıdan ya da (portal olsa bile React
                   * ağacından kabaran) ⋯ menü öğesinden gelen olay satırı
                   * AYRICA tetiklemez: menüde "Sil"e basmak paneli açmamalı.
                   */
                  tabIndex={onSatir ? 0 : undefined}
                  onClick={onSatir ? (e) => satirOlayi(e.target, e.currentTarget) && onSatir(satir) : undefined}
                  onKeyDown={
                    onSatir
                      ? (e) => {
                          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                          e.preventDefault();
                          onSatir(satir);
                        }
                      : undefined
                  }
                >
                  {sutunlar.map((s) => (
                    <td key={s.anahtar} className={`border-b border-line px-4 py-3 ${hucreSinifi(s)}`}>
                      {s.hucre(satir)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {toplamEtiketi !== undefined && (
              <tfoot>
                <tr className="bg-surface-muted font-bold">
                  {sutunlar.map((s, i) => (
                    <td key={s.anahtar} className={`border-b border-line px-4 py-3 ${hucreSinifi(s)}`}>
                      {i === 0 ? toplamEtiketi : (s.toplam ?? null)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {sayfalama && <SayfalamaCubugu {...sayfalama} />}
    </div>
  );
}

/** Olay satırın kendisinden mi (yoksa hücredeki etkileşimli bir öğeden mi) geldi. */
export function satirOlayi(hedef: EventTarget, satir: Element): boolean {
  if (!(hedef instanceof Element) || !satir.contains(hedef)) return false;
  const etkilesimli = hedef.closest('a, button, input, select, textarea, label, [role="menuitem"]');
  return etkilesimli === null || !satir.contains(etkilesimli);
}

/** "1 - 10 / 37  ‹ ›" — Google Ads'in sayfalama satırı. */
export function SayfalamaCubugu({ bas, son, toplam, onceki, sonraki }: Sayfalama) {
  const ok =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center justify-end gap-4 px-4 py-2.5 text-[12.5px] text-ink-muted">
      <span className="tabular-nums">
        {toplam === 0 ? '0' : `${bas} - ${son}`} / {toplam}
      </span>
      {(onceki || sonraki) && (
        <span className="flex items-center gap-1">
          <button type="button" className={ok} onClick={onceki} disabled={!onceki}>
            <span aria-hidden>‹</span>
            <span className="sr-only">
              <UiMetni k="oncekiSayfa" />
            </span>
          </button>
          <button type="button" className={ok} onClick={sonraki} disabled={!sonraki}>
            <span aria-hidden>›</span>
            <span className="sr-only">
              <UiMetni k="sonrakiSayfa" />
            </span>
          </button>
        </span>
      )}
    </div>
  );
}

/** Tablonun üstündeki süzgeç satırı: solda çipler, sağda küçük düğmeler. */
export function AracCubugu({ children, sag }: { children?: ReactNode; sag?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      {children}
      {sag && (
        <>
          <span className="flex-1" />
          {sag}
        </>
      )}
    </div>
  );
}

/** Uygulanmış süzgeç çipi: "Platform: Meta ✕". */
export function Cip({ children, onKaldir }: { children: ReactNode; onKaldir?: () => void }) {
  return (
    <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-surface-sunken px-3 text-[12.5px] font-semibold text-ink">
      {children}
      {onKaldir && (
        <button
          type="button"
          onClick={onKaldir}
          className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
        >
          <span aria-hidden>✕</span>
          <span className="sr-only">
            <UiMetni k="suzgeciKaldir" />
          </span>
        </button>
      )}
    </span>
  );
}

/** "+ Süzgeç" — kesikli kenarlı çip düğmesi. */
export function CipEkle({ children = <UiMetni k="suzgecEkle" />, onClick }: { children?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Ad hücresi: bağlantı/başlık ve altında gri açıklama ("Meta · Form doldursunlar"). */
export function AdHucresi({ ad, alt }: { ad: ReactNode; alt?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block font-semibold text-ink [&_a:hover]:text-brand-strong [&_a:hover]:underline [&_a]:text-ink [&_a]:no-underline">
        {ad}
      </span>
      {alt && <small className="block text-12 text-ink-muted">{alt}</small>}
    </span>
  );
}
