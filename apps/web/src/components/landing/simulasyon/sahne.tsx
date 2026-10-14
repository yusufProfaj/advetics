'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { sayacDegeri, zamanCizelgesi, type Kare, type Sahne } from './motor';

/**
 * ═══ SAHNE OYNATICI ═══
 *
 * Taslaktaki `sahneKur`ün React karşılığı. Davranış birebir:
 *  · Sahne ekrana girince (%45'i görünür) BAŞTAN oynar, çıkınca durur ve
 *    bekleyen bütün zamanlayıcılar iptal edilir. Ekranda olmayan bir sahne
 *    işlemci yakmıyor ve geri dönen ziyaretçi ortadan değil baştan izliyor.
 *  · Hareket azaltma tercihinde HİÇ oynatılmaz; doğrudan son hâl çizilir.
 *  · Açılıp kapanan öğe DOM'dan çıkmaz, görünürlüğü sınıfla değişir
 *    (CLAUDE.md, "Tasarım"): bileşenler `gor` sınıfını durumdan veriyor.
 *
 * Zamanlama kararı `motor.ts`te saf fonksiyonda; burada yalnız kareler
 * sırayla ekrana konuyor.
 */

const AZ_HAREKET = '(prefers-reduced-motion: reduce)';

function azHareketMi(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(AZ_HAREKET).matches;
}

export interface SahneDurumu<D> {
  d: D;
  kare: Kare<D>;
  /** Hedef bağlayıcı: `ref={s.h('onayla')}`. İmleç bu öğeye gidiyor. */
  h: (ad: string) => (el: HTMLElement | null) => void;
  /** Hedef şu an basılı mı (küçülme efekti için sınıf). */
  basili: (ad: string) => boolean;
  /** Bu alan yazılıyor mu (yanıp sönen yazı imleci). */
  yaziyor: (alan: string) => boolean;
}

interface Ic<D> extends SahneDurumu<D> {
  kok: React.RefObject<HTMLDivElement | null>;
  fareKonum: { x: number; y: number } | null;
  tekrar: () => void;
  az: boolean;
}

export function useSahne<D>(sahne: Sahne<D>): Ic<D> {
  const kareler = useMemo(() => zamanCizelgesi(sahne), [sahne]);
  const ilkKare = kareler[0]!;
  const sonKare = kareler[kareler.length - 1]!;

  const kok = useRef<HTMLDivElement | null>(null);
  const hedefler = useRef(new Map<string, HTMLElement>());
  const zamanlayicilar = useRef<number[]>([]);
  const oynuyor = useRef(false);
  const [kare, setKare] = useState<Kare<D>>(ilkKare);
  const [fareKonum, setFareKonum] = useState<{ x: number; y: number } | null>(null);
  const [az, setAz] = useState(false);

  const durdur = useCallback(() => {
    for (const z of zamanlayicilar.current) window.clearTimeout(z);
    zamanlayicilar.current = [];
  }, []);

  const oynat = useCallback(() => {
    durdur();
    if (azHareketMi()) {
      setKare(sonKare);
      return;
    }
    setFareKonum(null);
    setKare(ilkKare);
    for (const k of kareler) {
      zamanlayicilar.current.push(window.setTimeout(() => setKare(k), k.t));
    }
  }, [durdur, kareler, ilkKare, sonKare]);

  useEffect(() => {
    const el = kok.current;
    if (!el) return;
    if (azHareketMi()) {
      setAz(true);
      setKare(sonKare);
      return;
    }
    const gozcu = new IntersectionObserver(
      ([g]) => {
        if (!g) return;
        if (g.isIntersecting && !oynuyor.current) {
          oynuyor.current = true;
          oynat();
        } else if (!g.isIntersecting) {
          oynuyor.current = false;
          durdur();
        }
      },
      { threshold: 0.45 },
    );
    gozcu.observe(el);
    return () => {
      gozcu.disconnect();
      durdur();
    };
  }, [oynat, durdur, sonKare]);

  // İmlecin konumu hedefin O ANKİ yerinden ölçülüyor: sahne mobilde tek
  // sütuna düşünce hedefler başka yerde; sabit koordinat yanlış yere tıklardı.
  useEffect(() => {
    if (!kare.fare) return;
    const hedef = hedefler.current.get(kare.fare);
    const kap = kok.current;
    if (!hedef || !kap) return;
    const a = kap.getBoundingClientRect();
    const b = hedef.getBoundingClientRect();
    setFareKonum({ x: b.left - a.left + b.width * 0.6, y: b.top - a.top + b.height * 0.55 });
  }, [kare.fare]);

  const h = useCallback(
    (ad: string) => (el: HTMLElement | null) => {
      if (el) hedefler.current.set(ad, el);
      else hedefler.current.delete(ad);
    },
    [],
  );

  return {
    kok,
    d: kare.d,
    kare,
    h,
    basili: (ad) => kare.basili === ad,
    yaziyor: (alan) => kare.yaziyor === alan,
    fareKonum,
    tekrar: oynat,
    az,
  };
}

/** Görünürlük sınıfı: `belir` her zaman, `gor` durum doğruysa. */
export function belir(gor: boolean, ek = ''): string {
  return `belir${gor ? ' gor' : ''}${ek ? ` ${ek}` : ''}`;
}

/**
 * Sahnenin çerçevesi: kök kutu, imleç ve "Tekrar oynat". Bildirim kartları
 * sahneye özgü olduğu için çocuklarda.
 */
export function SahneCercevesi<D>({
  s,
  children,
  imlec = true,
  etiket,
}: {
  s: Ic<D>;
  children: ReactNode;
  imlec?: boolean;
  /** Ekran okuyucu için sahnenin ne gösterdiği (canlandırma okunmuyor). */
  etiket: string;
}) {
  const konum: CSSProperties = s.fareKonum
    ? { left: s.fareKonum.x, top: s.fareKonum.y }
    : { left: '70%', top: '90%' };
  return (
    <div ref={s.kok} className="sahne">
      {/* Canlandırma ekran okuyucuya okunmuyor; yerine ne gösterdiği tek cümleyle. */}
      <div className="sahne-ic" role="img" aria-label={etiket}>
        {children}
      </div>
      {imlec && (
        <div className={`imlec-fare${s.kare.fare ? ' gor' : ''}`} style={konum} aria-hidden="true">
          {/* Tık halkası her tıklamada YENİDEN başlasın diye anahtarı tık sayısı. */}
          {s.kare.tikNo > 0 && <span key={s.kare.tikNo} className="tik-halkasi" />}
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M4 2l16 9-7 2-3 7z" fill="#000000" stroke="#ffffff" strokeWidth="1.5" />
          </svg>
        </div>
      )}
      {!s.az && (
        <button type="button" className="tekrar" onClick={s.tekrar}>
          <span aria-hidden="true">↻</span> Tekrar oynat
        </button>
      )}
    </div>
  );
}

/**
 * Tırmanan sayaç. `calis` false iken başlangıcı, true olunca 1,3 sn'de
 * hedefe çıkar. Hareket azaltmada doğrudan hedef.
 */
export function Sayac({
  calis,
  hedef,
  baslangic = 0,
  sure = 1300,
  yuvarla = 1,
  son = '',
}: {
  calis: boolean;
  hedef: number;
  baslangic?: number;
  sure?: number;
  /** Değer bu adıma yuvarlanır (bütçe kaydırıcısı binlik atlar). */
  yuvarla?: number;
  son?: string;
}) {
  const [deger, setDeger] = useState(calis ? hedef : baslangic);
  useEffect(() => {
    if (!calis) {
      setDeger(baslangic);
      return;
    }
    if (azHareketMi()) {
      setDeger(hedef);
      return;
    }
    let iptal = false;
    const t0 = performance.now();
    const adim = (n: number) => {
      if (iptal) return;
      const p = (n - t0) / sure;
      setDeger(sayacDegeri(baslangic, hedef, p));
      if (p < 1) requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
    return () => {
      iptal = true;
    };
  }, [calis, hedef, baslangic, sure]);
  const g = Math.round(deger / yuvarla) * yuvarla;
  return (
    <>
      {g.toLocaleString('tr-TR')}
      {son}
    </>
  );
}
