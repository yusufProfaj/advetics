'use client';

import { useEffect, useMemo, useState } from 'react';
import { platformKanali } from '@advetics/shared';
import Link from 'next/link';
import type { Uyari } from '@advetics/shared';
import { useBildirimVerisi } from '@/components/bildirim/bildirim-verisi';
import { PlatformLogo } from '@/components/platform-logo';
import { formatRelative } from '@/lib/format';
import { dugmeSinifi } from '@/components/ui/dugme';
import { useDil, useSozluk } from '@/dil/saglayici';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';

/**
 * ═══ UYARI BANDI ═══
 *
 * Panelde "bir şeyler ters" hâllerinin hepsi ayrı ekranlardaydı ve çoğu
 * yalnızca o ekrana girildiğinde görünüyordu: hesabın platformda kapatılmış
 * olması Platform Bağlantıları'nda, senkronizasyonun düşmesi Senkronizasyon
 * ekranında. Kullanıcı o ekranlara ancak bir sorun olduğunu ZATEN bildiğinde
 * giriyor — yani uyarı, işe yarayacağı anda görünmüyordu.
 *
 * İKİ GÖRÜNÜM, TEK VERİ:
 *   · TÜM MÜŞTERİLER — uyarılar KODA GÖRE toplanıyor: "2 hesapta ödeme
 *     sorunu var". Ajans on iki müşteriye bakıyor ve tek tek satır basmak
 *     bandı okunmaz yapardı.
 *   · TEK MÜŞTERİ — uyarılar tek tek, sayfalı (1/3). Burada hangi hesap
 *     olduğu ve ne yapılacağı asıl bilgi.
 *
 * BANT LAYOUT'TA, sayfa gövdesinde değil: sorun hangi ekranda olursa olsun
 * görünmeli.
 *
 * ═══ BANT ARTIK YALNIZCA ACİL OLANI GÖSTERİYOR ═══
 *
 * Bir süre `/alerts` çıktısının TAMAMINI basıyordu ve "reklamlar
 * yayınlanmıyor — hesap askıya alınmış" ile "yetki 6 gün sonra doluyor"
 * aynı bantta, aynı ağırlıkta duruyordu. Aciliyet ayrımı kaybolunca bant
 * okunmaz hâle geliyor ve GERÇEK olan da o gürültünün içinde kayboluyor.
 *
 * Bugün bant `error` seviyesini taşıyor — "şu anda para ya da veri kaybı
 * var" hâlleri. `warn` (kurulum eksiği, yaklaşan süre) bildirim panelinde;
 * orada dürtmeden duruyor ve bakan görüyor.
 *
 * VERİ BANDIN DEĞİL, `BildirimSaglayici`NIN. `/alerts` ajansın bütün
 * atanmış hesaplarını tarıyor (üretimde 481 hesaplı havuz); bant ile zilin
 * ayrı ayrı çağırması aynı sayfa yüklemesinde o taramayı İKİ KEZ koşturmak
 * olurdu. Ayrıca iki tüketicinin ayrışması — bant "3 sorun", zil "5" —
 * ikisinin de yanlış sanılması demek.
 */
export function UyariBandi({ mcc }: { mcc: boolean }) {
  const { uyarilar: veri, uyariHatasi: hata } = useBildirimVerisi();
  const [gizli, setGizli] = useState<Set<string>>(new Set());
  const [sayfa, setSayfa] = useState(0);
  const d = useSozluk(genelBakisSozlugu).uyari;

  // Oturum boyunca gizlenenler. Kalıcı saklamak, düzelmiş sanılan bir sorunu
  // kalıcı olarak görünmez yapardı; sekme kapanınca uyarı geri geliyor.
  useEffect(() => {
    // Depo engelliyse ya da kayıt bozuksa gizlenen yok sayılır: uyarı
    // GÖRÜNÜR kalır, bant düşmez (yanlış yöne hata: fazla uyarı).
    try {
      const kayit = window.sessionStorage.getItem('advetics.gizliUyarilar');
      if (kayit) setGizli(new Set(JSON.parse(kayit) as string[]));
    } catch {
      setGizli(new Set());
    }
  }, []);

  function gizle(anahtar: string): void {
    const yeni = new Set(gizli).add(anahtar);
    setGizli(yeni);
    try {
      window.sessionStorage.setItem('advetics.gizliUyarilar', JSON.stringify([...yeni]));
    } catch {
      // Bu sayfada gizli kalır; yenilenince geri gelir.
    }
    setSayfa(0);
  }

  const gorunen = useMemo(
    () =>
      (veri?.uyarilar ?? []).filter((u) => u.siddet === 'error' && !gizli.has(anahtarOf(u))),
    [veri, gizli],
  );

  /*
   * TOPLAM DA ACİLLERİ SAYIYOR.
   *
   * `veri.toplam` bütün uyarıları kapsıyor ve bandın "gösterilen 2, toplam
   * 27" demesi, kullanıcıya 25 acil sorun daha varmış gibi okunurdu.
   * Kesilmiş liste uyarısı hâlâ doğru çalışıyor: `LIMIT` sunucuda
   * uygulanıyor ve acil olanlar sıralamada zaten başta.
   */
  const acilToplam = (veri?.uyarilar ?? []).filter((u) => u.siddet === 'error').length;

  if (hata !== null) {
    return (
      <p className="border-b border-line bg-surface-muted px-4 py-1.5 text-[11px] text-ink-muted">
        {d.alinamadi(hata)}
      </p>
    );
  }
  if (veri === null || gorunen.length === 0) return null;

  return mcc ? (
    <ToplananBant uyarilar={gorunen} toplam={acilToplam} onGizle={gizle} />
  ) : (
    <TekTekBant
      uyarilar={gorunen}
      toplam={acilToplam}
      sayfa={Math.min(sayfa, gorunen.length - 1)}
      setSayfa={setSayfa}
      onGizle={gizle}
    />
  );
}

/** Gizleme anahtarı — aynı hesabın aynı sorunu tekrar gösterilmesin. */
function anahtarOf(u: Uyari): string {
  return `${u.kod}:${u.adAccountId ?? u.clientId ?? '-'}`;
}

/**
 * TÜM MÜŞTERİLER görünümü — koda göre toplanmış.
 *
 * Google Ads'in üst bandıyla aynı fikir: "2 hesapta ödeme yöntemlerini
 * güncelleyin". Kaç hesabın etkilendiği sayı olarak yazılıyor; hangileri
 * olduğu tıklayınca açılıyor.
 */
function ToplananBant({
  uyarilar,
  toplam,
  onGizle,
}: {
  uyarilar: Uyari[];
  toplam: number;
  onGizle: (anahtar: string) => void;
}) {
  const [acik, setAcik] = useState<string | null>(null);
  const d = useSozluk(genelBakisSozlugu).uyari;

  const gruplar = useMemo(() => {
    const m = new Map<string, Uyari[]>();
    for (const u of uyarilar) {
      const g = m.get(u.kod) ?? [];
      g.push(u);
      m.set(u.kod, g);
    }
    return [...m.entries()];
  }, [uyarilar]);

  return (
    <div className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        {gruplar.map(([kod, grup]) => {
          const ilk = grup[0]!;
          const hata = ilk.siddet === 'error';
          return (
            <button
              key={kod}
              type="button"
              onClick={() => setAcik(acik === kod ? null : kod)}
              /*
                YALNIZ KILAVUZ RENKLERİ (2026-10-14): hata da uyarı da
                kırmızı SOL ÇİZGİ, metin siyah. Ayrımı ikon (⚠ / !) taşıyor;
                turuncu "uyarı" tonu kılavuzda yok.
              */
              className="flex items-center gap-2 rounded-lg border border-l-4 border-line border-l-danger bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-sunken"
            >
              <span aria-hidden>{hata ? '⚠' : '!'}</span>
              {/*
                SAYIYLA BİRLİKTE: "ödeme sorunu var" kaç hesabı etkilediğini
                söylemiyor ve ajans hangi ölçekte bir sorunla karşı karşıya
                olduğunu bilemiyordu.
              */}
              <span>
                <strong>{grup.length}</strong> {d.hesapta(grup.length)} {d.kisa[ilk.kod]}
              </span>
              <span className="text-[10px] opacity-70">{acik === kod ? d.gizle : d.goruntule}</span>
            </button>
          );
        })}

        {/* SESSİZ KESME YOK: liste kesilmişse toplam yazılı. */}
        {toplam > uyarilar.length && (
          <span className="text-[11px] text-ink-muted">
            {d.gosterilen(uyarilar.length, toplam)}
          </span>
        )}
      </div>

      {acik !== null && (
        <ul className="divide-y divide-line border-t border-line">
          {gruplar
            .find(([k]) => k === acik)?.[1]
            .map((u) => (
              <li key={anahtarOf(u)} className="flex flex-wrap items-center gap-2 px-4 py-2">
                {u.platform && (
                  <PlatformLogo
                    kind={platformKanali(u.platform)}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                )}
                <span className="min-w-0 flex-1 text-xs">
                  <strong className="text-ink">{u.clientName ?? d.ajans}</strong>
                  {u.adAccountName && (
                    <span className="text-ink-muted"> · {u.adAccountName}</span>
                  )}
                  <span className="block text-[11px] text-ink-muted">{u.detay}</span>
                </span>
                <Eylem uyari={u} onGizle={onGizle} />
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * TEK MÜŞTERİ görünümü — sayfalı.
 *
 * Referans Google Ads'in müşteri içi bandı: tek satır, sol/sağ ok ve "1/3".
 * Üç uyarıyı alt alta basmak, bandı sayfanın üçte birine çıkarıyordu.
 */
function TekTekBant({
  uyarilar,
  toplam,
  sayfa,
  setSayfa,
  onGizle,
}: {
  uyarilar: Uyari[];
  toplam: number;
  sayfa: number;
  setSayfa: (n: number) => void;
  onGizle: (anahtar: string) => void;
}) {
  const u = uyarilar[sayfa]!;
  const hata = u.siddet === 'error';
  const g = useSozluk(genelBakisSozlugu);

  return (
    /* Referans şerit: beyaz zemin, sol kırmızı çizgi, metin siyah (2026-10-14). */
    <div className="flex flex-wrap items-center gap-3 border-b border-l-4 border-line border-l-danger bg-surface px-4 py-2.5">
      {uyarilar.length > 1 && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
          <button
            type="button"
            onClick={() => setSayfa((sayfa - 1 + uyarilar.length) % uyarilar.length)}
            className="rounded px-1.5 py-0.5 transition hover:bg-surface-sunken"
            aria-label={g.bildirim.onceki}
          >
            ‹
          </button>
          {sayfa + 1}/{uyarilar.length}
          <button
            type="button"
            onClick={() => setSayfa((sayfa + 1) % uyarilar.length)}
            className="rounded px-1.5 py-0.5 transition hover:bg-surface-sunken"
            aria-label={g.bildirim.sonraki}
          >
            ›
          </button>
        </span>
      )}

      <span aria-hidden className="shrink-0 text-danger-strong">
        {hata ? '⚠' : '!'}
      </span>

      <span className="min-w-0 flex-1 text-sm">
        <strong className="text-ink">{u.baslik}</strong>
        {u.adAccountName && (
          <span className="text-ink-muted"> — {u.adAccountName}</span>
        )}
        <span className="block text-xs text-ink-muted">{u.detay}</span>
      </span>

      <Eylem uyari={u} onGizle={onGizle} />

      {/* SESSİZ KESME YOK. */}
      {toplam > uyarilar.length && (
        <span className="text-[11px] text-ink-muted">{g.uyari.toplam(toplam)}</span>
      )}
    </div>
  );
}

/**
 * Eylem düğmeleri ve bayatlık.
 *
 * "SORUNU ÇÖZ" YALNIZCA PANELDEN ÇÖZÜLEBİLENLERDE. Ödeme sorununda bir çöz
 * düğmesi göstermek, tıklayınca hiçbir şey yapmayan bir düğme demekti.
 */
function Eylem({ uyari, onGizle }: { uyari: Uyari; onGizle: (anahtar: string) => void }) {
  const { dil } = useDil();
  const d = useSozluk(genelBakisSozlugu).uyari;
  return (
    <span className="flex shrink-0 items-center gap-2">
      {/*
        VERİNİN OKUNMA ANI YAZILI. Hesabın platformdaki durumu yalnızca hesap
        listesi tazelenirken güncelleniyor ve haftalarca eski kalabiliyor.
        Tarihi göstermeyen bir uyarı, düzeltilmiş bir sorunu haftalarca
        ekranda tutar ve kullanıcı bütün uyarılara güvenmeyi bırakır.
      */}
      {uyari.veriZamani && (
        <span className="text-[10px] text-ink-muted" title={d.okunmaAni}>
          {formatRelative(uyari.veriZamani, dil)}
        </span>
      )}
      {uyari.eylem && (
        <Link
          href={uyari.eylem.href}
          className={dugmeSinifi('koyu', 'kucuk')}
        >
          {uyari.eylem.etiket}
        </Link>
      )}
      <button
        type="button"
        onClick={() => onGizle(anahtarOf(uyari))}
        className="rounded px-1.5 py-1 text-[11px] text-ink-muted transition hover:text-ink"
      >
        {d.gizle}
      </button>
    </span>
  );
}
