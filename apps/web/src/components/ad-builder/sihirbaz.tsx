'use client';

import { useEffect, useRef } from 'react';

/**
 * ═══ KURULUM SİHİRBAZI KABUĞU ═══
 *
 * Kullanıcının isteği: "reklam oluştur kısmı tasarım açısından çok kötü
 * gözüküyor, o tarafı sanki bir kurulum sihirbazıymış gibi aşama aşama
 * ilerlememiz gerekiyor".
 *
 * Eski ekran BEŞ BLOĞU ALT ALTA basıyordu: kullanıcı en üstten en alta kadar
 * kaydırıyor, hangi alanın zorunlu hangisinin isteğe bağlı olduğunu
 * göremiyor ve "hazır mıyım" sorusunu ancak en alttaki düğmenin kapalı
 * olmasından anlıyordu.
 *
 * ═══ UYULAN KURALLAR ═══
 *
 * · İLERLEME GÖRÜNÜR (WCAG/Material "Progress Indicators"): kaçıncı adımda
 *   olduğu ve toplam kaç adım olduğu her zaman yazılı.
 * · GERİ TAHMİN EDİLEBİLİR: tamamlanmış adımlara tıklanabiliyor, ileri
 *   atlanamıyor — atlanan bir adım, eksik alanı en sonda öğrenmek demek.
 * · ODAK ADIM DEĞİŞİNCE TAŞINIYOR: ekran okuyucu kullanıcısı yeni adımın
 *   başlığından devam ediyor; taşınmazsa odak sayfanın başında kalıyor ve
 *   kullanıcı neyin değiştiğini duymuyor.
 * · SABİT ALT ÇUBUK ODAĞI KAPATMIYOR (WCAG 2.2 "Focus Not Obscured"):
 *   içerik alanı çubuk yüksekliği kadar alt boşluk taşıyor.
 * · İLERLEYEMEME SEBEBİ YAZILI: kapalı bir düğme tek başına "bozuk" olarak
 *   okunuyor.
 * · HAREKET AZALTILMIŞSA GEÇİŞ YOK (`motion-reduce`).
 */
export interface SihirbazAdimi {
  /** Rayda görünen kısa ad. */
  ad: string;
  /** Panel başlığı — odak buraya taşınıyor. */
  baslik: string;
  altBaslik?: string;
  /** Bu adım tamamlandı mı — ray ve "Devam" düğmesi buna bakıyor. */
  tamam: boolean;
  /** Tamamlanmadıysa NEDEN: kapalı düğmenin yanında yazıyor. */
  eksik?: string;
  icerik: React.ReactNode;
}

export function Sihirbaz({
  adimlar,
  aktif,
  onAktif,
  sonAdimDugmesi,
}: {
  adimlar: SihirbazAdimi[];
  aktif: number;
  onAktif: (i: number) => void;
  /** Son adımda "Devam" yerine çizilen eylem (yayınla/hazırla). */
  sonAdimDugmesi: React.ReactNode;
}) {
  const baslikRef = useRef<HTMLHeadingElement>(null);
  const adim = adimlar[aktif];

  useEffect(() => {
    /*
     * ODAK YENİ ADIMIN BAŞLIĞINA.
     *
     * `preventScroll` YOK ve bu kasıtlı: adım değişince sayfanın başına
     * dönmek doğru davranış — kullanıcı yeni adımın en üstünden başlamalı.
     */
    baslikRef.current?.focus();
  }, [aktif]);

  if (!adim) return null;

  const sonAdim = aktif === adimlar.length - 1;
  const ilerleyebilir = adim.tamam;

  return (
    <div className="rounded-2xl border border-line bg-surface">
      {/* ═══ RAY ═══ */}
      <nav
        aria-label="Kurulum adımları"
        className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2.5 sm:px-4"
      >
        {adimlar.map((a, i) => {
          const tamamlandi = i < aktif && a.tamam;
          const secili = i === aktif;
          /*
           * İLERİ ATLANAMIYOR. Atlanan adım, eksik alanı en sonda öğrenmek
           * demek; geri dönmek ise serbest çünkü kullanıcı yazdığını
           * düzeltebilmeli.
           */
          const gidilebilir = i <= aktif || adimlar.slice(0, i).every((x) => x.tamam);
          return (
            <button
              key={a.ad}
              type="button"
              onClick={() => gidilebilir && onAktif(i)}
              disabled={!gidilebilir}
              aria-current={secili ? 'step' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                secili
                  ? 'bg-brand text-white'
                  : gidilebilir
                    ? 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                    : 'cursor-not-allowed text-ink-muted/50'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-4.5 w-4.5 place-items-center rounded-full text-[10px] font-semibold ${
                  secili
                    ? 'bg-white/25 text-white'
                    : tamamlandi
                      ? 'bg-ok/15 text-ok-strong'
                      : 'bg-surface-sunken text-ink-muted'
                }`}
              >
                {/* TAMAMLANMIŞ ADIM RENKLE DEĞİL İŞARETLE de anlatılıyor:
                    renk tek başına bilgi taşımamalı. */}
                {tamamlandi ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap">{a.ad}</span>
            </button>
          );
        })}
      </nav>

      {/* ═══ PANEL ═══ */}
      <div className="px-4 py-5 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Adım {aktif + 1} / {adimlar.length}
        </p>
        <h2
          ref={baslikRef}
          tabIndex={-1}
          className="mt-1 text-lg font-semibold text-ink focus-visible:outline-none"
        >
          {adim.baslik}
        </h2>
        {adim.altBaslik && <p className="mt-1 text-sm text-ink-muted">{adim.altBaslik}</p>}

        <div className="mt-5 motion-safe:animate-[fadeIn_150ms_ease-out]">{adim.icerik}</div>
      </div>

      {/* ═══ EYLEM ÇUBUĞU ═══
          Sayfa akışında duruyor, `fixed` DEĞİL: sabit bir çubuk odaklanan
          alanı kapatabiliyor (WCAG 2.2) ve bu ekranda içerik zaten
          adım adım kısaldı, yani sabitlemeye gerek yok. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onAktif(aktif - 1)}
          disabled={aktif === 0}
          className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
        >
          Geri
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {/* KAPALI DÜĞMENİN SEBEBİ YAZILI: tek başına kapalı bir düğme
              "bozuk" olarak okunuyor ve kullanıcı tıklamayı deniyor. */}
          {!ilerleyebilir && adim.eksik && (
            <span className="text-xs text-warn-strong">{adim.eksik}</span>
          )}
          {sonAdim ? (
            sonAdimDugmesi
          ) : (
            <button
              type="button"
              onClick={() => onAktif(aktif + 1)}
              disabled={!ilerleyebilir}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-40"
            >
              Devam
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
