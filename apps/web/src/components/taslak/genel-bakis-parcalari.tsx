'use client';

import Link from 'next/link';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import type { MetricsBreakdownRow, MetricsTimeseriesPoint, Platform } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDayShort, formatMoney, formatNumber, microsOf } from '@/lib/format';
import { degisimHali, yuzdeMetni } from '@/lib/degisim';
import { useDil, useSozluk } from '@/dil/saglayici';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import s from './taslak.module.css';

/*
 * ═══ GENEL BAKIŞ: ONAYLANAN TASLAĞIN ETKİLEŞİMLİ PARÇALARI ═══
 *
 * Görünüş `taslak.module.css`ten, taslağın birebir CSS'i. Buradaki her
 * etkileşim taslakta da vardı: metrik kutusuna tıklayınca grafikte çizmek,
 * uyarı şeridinde ‹ › ile gezmek, kampanya kartında düzey değiştirmek.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Bildirim şeridi
// ─────────────────────────────────────────────────────────────────────────────

export interface Bildirim {
  icerik: ReactNode;
  eylem?: { etiket: string; href: string };
}

/**
 * Uyarılar TEK şeritte, ‹ › ile sırayla (Google Ads'in bildirim şeridi).
 * Hiç uyarı yoksa şerit çizilmiyor: boş çerçeve okunacak bir şey varmış
 * gibi görünür. Metin değişirken kısa bir solma: bir karede değişen metin
 * gözden kaçıyor.
 */
export function BildirimSeridi({ bildirimler }: { bildirimler: Bildirim[] }) {
  const [i, setI] = useState(0);
  const [gorunur, setGorunur] = useState(true);
  const d = useSozluk(genelBakisSozlugu).bildirim;
  if (bildirimler.length === 0) return null;
  const b = bildirimler[Math.min(i, bildirimler.length - 1)]!;

  function git(yon: 1 | -1) {
    setGorunur(false);
    window.setTimeout(() => {
      setI((x) => (x + yon + bildirimler.length) % bildirimler.length);
      setGorunur(true);
    }, 140);
  }

  return (
    <div className={s.bildirim} role="status">
      <span className={s.bildirimIkon} aria-hidden>
        !
      </span>
      <span className={s.bildirimMetin} style={{ opacity: gorunur ? 1 : 0 }}>
        {b.icerik}
      </span>
      {b.eylem && (
        <Link className={s.cozum} href={b.eylem.href}>
          {b.eylem.etiket} →
        </Link>
      )}
      {bildirimler.length > 1 && (
        <span className={s.sira}>
          <button type="button" aria-label={d.onceki} onClick={() => git(-1)}>
            ‹
          </button>
          <span className={s.num}>
            {i + 1} / {bildirimler.length}
          </span>
          <button type="button" aria-label={d.sonraki} onClick={() => git(1)}>
            ›
          </button>
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Performans kartı
// ─────────────────────────────────────────────────────────────────────────────

export type MetrikAnahtari = 'harcama' | 'donusum' | 'dbm' | 'roas' | 'erisim';

export interface PerformansMetrigi {
  anahtar: MetrikAnahtari;
  ad: string;
  deger: string;
  /** Önceki döneme göre % değişim; karşılaştırma kapalıysa `null`. */
  degisim: number | null;
  /** Düşüşü iyi olan metrik (maliyet). */
  ters?: boolean;
  /** Kutunun altındaki ek bilgi (ör. erişimin günlük ortalama olduğu). */
  ipucu?: string;
}

export interface IkincilMetrik {
  ad: string;
  deger: string;
  degisim: number | null;
  ters?: boolean;
}

/**
 * Değişim satırı: "↑ %12 önceki döneme göre"; yön ile iyi/kötü AYRI şeyler.
 * İyi/kötü kararı `degisimHali`nde (Reklam Yöneticisi de onu kullanıyor).
 */
function Degisim({ d, ters, uzun }: { d: number | null; ters?: boolean; uzun?: boolean }) {
  const { dil } = useDil();
  const metin = useSozluk(genelBakisSozlugu).degisim;
  const h = degisimHali(d, ters, dil);
  if (!h) return null;
  const sinif = h.iyi === null ? '' : h.iyi ? s.iyi : s.kotu;
  if (uzun) {
    return (
      <div className={`${s.metrikFark} ${sinif}`} title={h.etiket}>
        {h.metin}
        {metin.oncekiyeGore}
        <span className="sr-only">, {h.etiket}</span>
      </div>
    );
  }
  return (
    <em className={sinif} title={h.etiket}>
      {h.metin}
      <span className="sr-only">, {h.etiket}</span>
    </em>
  );
}

/** Günlük seriden bir metriğin değerleri; seri yoksa (`erisim`) `null`. */
function gunlukDeger(p: MetricsTimeseriesPoint, k: MetrikAnahtari): number | null {
  const harcama = Number(BigInt(p.spendMicros) / 1000n) / 1000;
  switch (k) {
    case 'harcama':
      return harcama;
    case 'donusum':
      return p.conversions;
    case 'dbm':
      return p.conversions > 0 ? harcama / p.conversions : null;
    case 'roas':
      return harcama > 0 ? Number(BigInt(p.conversionValueMicros) / 1000n) / 1000 / harcama : null;
    case 'erisim':
      return null;
  }
}

/**
 * PERFORMANS: dört kutu + günlük çizgi grafik + ikincil şerit, TEK kart.
 *
 * Kutuya tıklayınca o metrik grafikte çiziliyor; en çok İKİ seri (Google
 * Ads'teki gibi), birincisi kırmızı, ikincisi gri. Erişimin günlük serisi
 * yok (platform dönem toplamı veriyor): kutusu seçilemiyor ve nedenini
 * söylüyor; seçilebilir görünüp boş grafik çizmek yanıltırdı.
 *
 * Seriler AYRI ölçekte (harcama TL, dönüşüm adet): aynı eksende biri düz
 * çizgiye ezilirdi. Sağdaki etiketler hangi çizginin hangisi olduğunu
 * söylüyor. Önceki dönem yalnız ilk seride, kesikli: iki kesikli çizgi
 * daha grafiği okunmaz yapıyordu.
 */
export function PerformansKarti({
  metrikler,
  ikincil,
  noktalar,
  onceki,
  tekGun,
  seriHatasi,
}: {
  metrikler: PerformansMetrigi[];
  ikincil: IkincilMetrik[];
  noktalar: MetricsTimeseriesPoint[];
  onceki: MetricsTimeseriesPoint[] | null;
  tekGun: boolean;
  seriHatasi: boolean;
}) {
  const [secili, setSecili] = useState<MetrikAnahtari[]>(['harcama', 'donusum']);
  const { dil } = useDil();
  const d = useSozluk(genelBakisSozlugu).performans;

  function sec(k: MetrikAnahtari) {
    if (k === 'erisim') return;
    setSecili((x) => {
      if (x.includes(k)) return x.length > 1 ? x.filter((y) => y !== k) : x;
      const y = [...x, k];
      return y.length > 2 ? y.slice(1) : y;
    });
  }

  const efsane = secili.map((k) => metrikler.find((m) => m.anahtar === k)?.ad ?? k);

  return (
    <section aria-labelledby="performans-baslik" className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2 id="performans-baslik">{d.baslik}</h2>
        <span className={s.ipucu}>{d.ipucu}</span>
      </div>
      <div className={s.metrikler}>
        {metrikler.map((m) => {
          const sira = secili.indexOf(m.anahtar);
          const secilemez = m.anahtar === 'erisim';
          return (
            <button
              key={m.anahtar}
              type="button"
              className={s.metrik}
              data-seri={sira >= 0 ? sira + 1 : undefined}
              aria-pressed={sira >= 0}
              aria-disabled={secilemez || undefined}
              title={secilemez ? d.erisimCizilemez : undefined}
              style={secilemez ? { cursor: 'default' } : undefined}
              onClick={() => sec(m.anahtar)}
            >
              <div className={s.metrikAd}>
                <i />
                {m.ad}
              </div>
              <div className={`${s.metrikDeger} ${s.num}`}>{m.deger}</div>
              <Degisim d={m.degisim} ters={m.ters} uzun />
              {m.ipucu && <div className={s.metrikFark}>{m.ipucu}</div>}
            </button>
          );
        })}
      </div>

      {tekGun ? (
        <p className={s.bosMetin}>{d.tekGun}</p>
      ) : seriHatasi ? (
        <p role="alert" className={s.hataMetin}>
          {d.seriHatasi}
        </p>
      ) : noktalar.length === 0 ? (
        /*
         * "Hiç reklam koşmamış hesap" ile "önceki dönemde koşup bu dönemde
         * tamamen durmuş hesap" aynı boş kutu olmamalı: ikincisi acil ve
         * karşılaştırmanın göstermesi gereken şeyin ta kendisi.
         */
        <p className={s.bosMetin}>
          {onceki !== null && onceki.length > 0
            ? d.oncekindeVardi
            : d.veriYok}
        </p>
      ) : (
        <>
          <Grafik
            noktalar={noktalar}
            onceki={onceki}
            secili={secili}
            adlar={efsane}
            etiket={d.grafikEtiketi(efsane.join(d.ve))}
            gunAdi={(iso) => formatDayShort(iso, dil)}
          />
          <div className={s.efsane}>
            {efsane.map((ad, i) => (
              <span key={ad}>
                <i style={{ background: i ? 'var(--t-seri2)' : 'var(--t-brand)' }} />
                {ad}
              </span>
            ))}
            {onceki && onceki.length > 0 && (
              <span>
                <i style={{ background: 'var(--t-brand)', opacity: 0.45 }} />
                {d.oncekiDonem(efsane[0] ?? '')}
              </span>
            )}
          </div>
        </>
      )}

      <div className={s.ikincil}>
        {ikincil.map((m) => (
          <div key={m.ad}>
            <small title={m.ad}>{m.ad}</small>
            <b className={s.num}>{m.deger}</b>
            <Degisim d={m.degisim} ters={m.ters} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Çizgi grafik. Çizgi soldan sağa ÇİZİLEREK geliyor (stroke-dashoffset);
 * seçim değişince yalnız değişen seri yeniden çiziliyor (anahtar seriye
 * bağlı). Hareket azaltılmışsa çizgi doğrudan görünür.
 */
function Grafik({
  noktalar,
  onceki,
  secili,
  adlar,
  etiket,
  gunAdi,
}: {
  noktalar: MetricsTimeseriesPoint[];
  onceki: MetricsTimeseriesPoint[] | null;
  secili: MetrikAnahtari[];
  adlar: string[];
  /** Ekran okuyucu etiketi ("Günlük Harcama ve Dönüşüm"), sözlükten. */
  etiket: string;
  /** Eksen günü ("5 Eki" / "Oct 5"), ekranın dilinde. */
  gunAdi: (iso: string) => string;
}) {
  const W = 760;
  const H = 230;
  const SOL = 8;
  const SAG = 70;
  const UST = 8;
  const ALT = 24;
  const n = noktalar.length;
  const x = (i: number) => SOL + ((W - SOL - SAG) * i) / Math.max(1, n - 1);

  const seriler = secili.map((k) => {
    const v = noktalar.map((p) => gunlukDeger(p, k));
    const vo = onceki ? onceki.slice(0, n).map((p) => gunlukDeger(p, k)) : [];
    const sayilar = [...v, ...vo].filter((a): a is number => a !== null);
    const enCok = Math.max(1e-9, ...sayilar) * 1.1;
    const y = (a: number) => UST + (H - UST - ALT) * (1 - a / enCok);
    const yol = (dizi: Array<number | null>) => {
      let d = '';
      let kalem = false;
      dizi.forEach((a, i) => {
        if (a === null) {
          kalem = false;
          return;
        }
        d += `${kalem ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`;
        kalem = true;
      });
      return d;
    };
    const ana = yol(v);
    const ilk = v.findIndex((a) => a !== null);
    const son = v.length - 1 - [...v].reverse().findIndex((a) => a !== null);
    const alan =
      ilk >= 0 ? `${ana}L${x(son).toFixed(1)},${H - ALT}L${x(ilk).toFixed(1)},${H - ALT}Z` : '';
    return { k, ana, onceki: vo.length ? yol(vo) : '', alan };
  });

  const etiketSayisi = Math.min(5, n);
  const etiketler = Array.from({ length: etiketSayisi }, (_, i) =>
    Math.round((i * (n - 1)) / Math.max(1, etiketSayisi - 1)),
  );

  return (
    <div className={s.grafik}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={etiket}>
        <defs>
          <linearGradient id="gb-alan" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--brand-primary)" stopOpacity="0.1" />
            <stop offset="1" stopColor="var(--brand-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const yy = UST + ((H - UST - ALT) * i) / 3;
          return <line key={i} className={s.izgaraCizgi} x1={SOL} x2={W - SAG} y1={yy} y2={yy} />;
        })}
        {etiketler.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {gunAdi(noktalar[i]!.date)}
          </text>
        ))}
        {seriler.map((sr, si) => {
          const renk = si ? 'var(--t-seri2)' : 'var(--brand-primary)';
          return (
            <g key={sr.k}>
              {si === 0 && sr.alan && <path d={sr.alan} fill="url(#gb-alan)" />}
              {si === 0 && sr.onceki && <path className={`${s.seri} ${s.onceki}`} d={sr.onceki} stroke={renk} />}
              <CizilenYol key={`${sr.k}-${sr.ana.length}`} d={sr.ana} renk={renk} />
              <text x={W - SAG + 8} y={si ? UST + 26 : UST + 10} style={{ fontWeight: 700, fill: renk }}>
                {adlar[si]?.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CizilenYol({ d, renk }: { d: string; renk: string }) {
  const ref = useRef<SVGPathElement>(null);
  useEffect(() => {
    const p = ref.current;
    if (!p || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L}`;
    p.style.strokeDashoffset = `${L}`;
    p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset .9s cubic-bezier(.16,1,.3,1)';
    p.style.strokeDashoffset = '0';
    const bitti = () => {
      p.style.strokeDasharray = 'none';
    };
    p.addEventListener('transitionend', bitti, { once: true });
    return () => p.removeEventListener('transitionend', bitti);
  }, [d]);
  return <path ref={ref} className={s.seri} d={d} stroke={renk} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mecra dağılımı (halka)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Harcamanın mecralara dağılımı. RENKLER YALNIZ MARKADAN (kılavuz: kırmızı,
 * gri, siyah): platformların kendi renkleri (Meta mavisi, Google'ın dört
 * rengi) bilerek kullanılmıyor. Ayrım tonla ve yanındaki adla.
 * Halka saat 12'den başlayıp dolarak çiziliyor.
 */
const MECRA_RENGI: Record<Platform, string> = {
  meta: 'var(--brand-primary)',
  google: 'var(--t-seri2)',
  linkedin: 'color-mix(in srgb, var(--brand-primary) 40%, var(--surface-sunken))',
};

export function MecraDagilimi({
  dilimler,
  paraBirimi,
}: {
  dilimler: Array<{ platform: Platform; spendMicros: string }>;
  paraBirimi: string | null;
}) {
  const toplam = dilimler.reduce((a, d) => a + BigInt(d.spendMicros), 0n);
  const [cizildi, setCizildi] = useState(false);
  const { dil } = useDil();
  const m = useSozluk(genelBakisSozlugu).mecra;
  useEffect(() => {
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setCizildi(true)));
    return () => cancelAnimationFrame(t);
  }, []);

  const R = 52;
  const C = 2 * Math.PI * R;
  let baslangic = 0;
  const parcalar = dilimler
    .filter((d) => BigInt(d.spendMicros) > 0n)
    .map((d) => {
      const pay = toplam === 0n ? 0 : Number((BigInt(d.spendMicros) * 10000n) / toplam) / 10000;
      const p = { ...d, pay, baslangic };
      baslangic += pay;
      return p;
    });

  return (
    <section aria-labelledby="mecra-baslik" className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2 id="mecra-baslik">{m.baslik}</h2>
      </div>
      {parcalar.length === 0 ? (
        <p className={s.bosMetin}>{m.harcamaYok}</p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px' }}>
          <svg viewBox="0 0 140 140" width="132" height="132" role="img" aria-label={m.halka} style={{ flex: 'none' }}>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth="16" />
            {parcalar.map((p) => (
              <circle
                key={p.platform}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={MECRA_RENGI[p.platform]}
                strokeWidth="16"
                strokeDasharray={`${cizildi ? Math.max(0, p.pay * C - 2) : 0} ${C}`}
                strokeDashoffset={-p.baslangic * C}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dasharray .9s cubic-bezier(.16,1,.3,1)' }}
              />
            ))}
            <text x="70" y="66" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-muted)' }}>
              {m.toplam}
            </text>
            <text x="70" y="84" textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--text)' }}>
              {paraBirimi ? formatMoney(toplam.toString(), paraBirimi, { compact: true, dil }) : '—'}
            </text>
          </svg>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, flex: 1 }}>
            {parcalar.map((p) => (
              <li key={p.platform} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: MECRA_RENGI[p.platform], flex: 'none' }} />
                <span style={{ fontWeight: 600 }}>{PLATFORM_KISA_ADLARI[p.platform]}</span>
                <span className={s.num} style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                  {yuzdeMetni(p.pay * 100, dil)}
                </span>
                <b className={s.num} style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {paraBirimi ? formatMoney(p.spendMicros, paraBirimi, { compact: true, dil }) : '—'}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
      {paraBirimi === null && (
        <div className={s.kartAlt}>
          <span>{m.karisik}</span>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Özet listesi (şirketler / workspace'ler / hesaplar)
// ─────────────────────────────────────────────────────────────────────────────

export interface OzetSatiri {
  id: string;
  ad: string;
  alt: string;
  /** Şirket ve workspace satırında baş harf karosu; hesapta durum noktası. */
  gosterge: 'karo' | 'yayinda' | 'durdu';
  spendMicros: string;
  pay: number;
  donusum: number;
  dbmMicros: string | null;
  paraBirimi: string | null;
  /** Satıra tıklayınca ne olur. */
  eylem: { tur: 'org'; id: string } | { tur: 'client'; id: string } | { tur: 'link'; href: string } | null;
}

/**
 * İlk beş satır + tam listeye kapı. ŞİRKET ve WORKSPACE satırına tıklamak
 * kapsamı değiştiriyor (`switch-org` / `switch-client`) ve kullanıcı AYNI
 * sayfada kalıyor; hesap satırı Reklam Yöneticisi'nde o hesabın
 * kampanyalarına iniyor. Kesme söyleniyor ("5 / 48").
 */
export function OzetListeKarti({
  baslik,
  sutunAdi,
  satirlar,
  tumuHref,
  sayac,
  altNot,
}: {
  baslik: string;
  sutunAdi: string;
  satirlar: OzetSatiri[];
  tumuHref: string;
  /**
   * "5 / 48 şirket": SUNUCUDA kuruluyor (sayı ve çoğul eki dile bağlı;
   * sunucu bileşeninden istemciye fonksiyon geçmiyor). Kesme yine
   * söyleniyor, yalnız cümle tek yerde.
   */
  sayac: string;
  altNot?: string;
}) {
  const router = useRouter();
  const yol = usePathname() ?? '/dashboard';
  const { dil } = useDil();
  const g = useSozluk(genelBakisSozlugu);
  const o = g.ozet;
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  // Katman istek + yenileme boyunca; ikisi bitince kalkıyor (bkz. Reklam Yöneticisi tablosu).
  const [isPending, startTransition] = useTransition();
  const [yenileniyor, setYenileniyor] = useState<string | null>(null);
  useEffect(() => {
    if (!isPending) setYenileniyor(null);
  }, [isPending]);
  // Yeni kapsamın satırları geldiyse geçiş bitmiştir: geçiş durumu hiç
  // değişmeden (anında yenileme) tamamlansa bile katman kalmasın.
  useEffect(() => {
    setYenileniyor(null);
  }, [satirlar]);

  async function tikla(r: OzetSatiri) {
    if (!r.eylem) return;
    if (r.eylem.tur === 'link') return router.push(r.eylem.href);
    setBekleyen(r.ad);
    setHata(null);
    try {
      await apiFetch(r.eylem.tur === 'org' ? '/auth/switch-org' : '/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify(r.eylem.tur === 'org' ? { organizationId: r.eylem.id } : { clientId: r.eylem.id }),
      });
      // Adres temizleniyor: URL süzgeci oturumu ezer ve gövde eski kapsamı gösterirdi.
      setYenileniyor(r.ad);
      setBekleyen(null);
      startTransition(() => {
        router.replace(yol);
        router.refresh();
      });
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : o.gecilemedi);
      setBekleyen(null);
    }
  }

  return (
    <section className={`${s.kart} ${s.gir}`}>
      {(bekleyen ?? yenileniyor) && (
        <TamEkranYukleniyor mesaj={o.geciliyor(bekleyen ?? yenileniyor ?? '')} />
      )}
      <div className={s.kartUst}>
        <h2>{baslik}</h2>
        <span className={s.ipucu}>{o.harcamayaGore}</span>
        <Link className={s.sagBag} href={tumuHref}>
          {o.reklamYoneticisindeAc}
        </Link>
      </div>
      {hata && (
        <p role="alert" className={s.hataMetin}>
          {hata}
        </p>
      )}
      {satirlar.length === 0 ? (
        <p className={s.bosMetin}>{o.satirYok}</p>
      ) : (
        <div className={s.tabloSar}>
          <table className={s.tablo} style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>{sutunAdi}</th>
                <th>{g.metrik.harcama}</th>
                <th>{g.metrik.pay}</th>
                <th>{g.metrik.donusum}</th>
                <th>{g.metrik.dbm}</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((r) => (
                <tr
                  key={r.id}
                  className={r.eylem ? s.tiklanir : undefined}
                  onClick={() => void tikla(r)}
                >
                  <td style={{ maxWidth: 0, width: '40%' }}>
                    <div className={s.adHucre}>
                      {r.gosterge === 'karo' ? (
                        <span className={s.karo}>{basHarfler(r.ad)}</span>
                      ) : (
                        <span
                          className={`${s.nokta} ${r.gosterge === 'durdu' ? s.noktaDurdu : ''}`}
                          title={r.gosterge === 'yayinda' ? o.izleniyor : o.izlenmiyor}
                        />
                      )}
                      <span style={{ minWidth: 0 }}>
                        {r.eylem ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void tikla(r);
                            }}
                            title={r.ad}
                            style={{ fontWeight: 600, textAlign: 'left', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                          >
                            {r.ad}
                          </button>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{r.ad}</span>
                        )}
                        <small>{r.alt}</small>
                      </span>
                    </div>
                  </td>
                  <td className={s.num}>{r.paraBirimi ? formatMoney(r.spendMicros, r.paraBirimi, { dil }) : o.karisik}</td>
                  <td>
                    <span className={s.pay}>
                      <span className={s.payIz}>
                        <i style={{ width: `${Math.min(100, r.pay)}%` }} />
                      </span>
                      <span className={s.num}>{yuzdeMetni(r.pay, dil)}</span>
                    </span>
                  </td>
                  <td className={s.num}>{formatNumber(r.donusum, dil)}</td>
                  <td className={s.num}>{r.dbmMicros && r.paraBirimi ? formatMoney(r.dbmMicros, r.paraBirimi, { dil }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={s.kartAlt}>
        <span>
          {sayac}
          {altNot ? ` · ${altNot}` : ''}
        </span>
        <Link href={tumuHref}>{o.tumuOk}</Link>
      </div>
    </section>
  );
}

export function basHarfler(ad: string): string {
  return ad
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toLocaleUpperCase('tr-TR'))
    .slice(0, 2)
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// En çok harcayanlar (kampanya / reklam seti / reklam)
// ─────────────────────────────────────────────────────────────────────────────

/** Düzeyler ve sırası; adları sözlükte (`enCok.duzeyler`), anahtar kümesi buradan. */
type KampanyaDuzeyi = 'campaign' | 'ad_group' | 'ad';
const DUZEYLER: KampanyaDuzeyi[] = ['campaign', 'ad_group', 'ad'];
/** Kart kaç satır gösteriyor; pay ise GELEN bütün satırların toplamından. */
export const OZET_SATIR_SAYISI = 5;

/**
 * Düzey değiştirmek SAYFAYI YENİLEMİYOR: reklam seti ve reklam listesi ilk
 * seçildiğinde çekiliyor ve saklanıyor. Dört hâl ayrı (yükleniyor, hata,
 * boş, dolu); hata sunucunun cümlesiyle.
 */
export function EnCokHarcayanlarKarti({
  ilk,
  sorgu,
  sinir,
  paraBirimi,
  reklamYoneticisi,
  tasinanSorgu,
}: {
  ilk: MetricsBreakdownRow[] | null;
  /** from/to/platform/compare — breakdown ucunun ortak sorgusu. */
  sorgu: string;
  sinir: number;
  paraBirimi: string | null;
  reklamYoneticisi: string;
  /** Reklam Yöneticisi bağlantılarına eklenen tarih/platform süzgeci. */
  tasinanSorgu: string;
}) {
  const [duzey, setDuzey] = useState<KampanyaDuzeyi>('campaign');
  const { dil } = useDil();
  const g = useSozluk(genelBakisSozlugu);
  const e = g.enCok;
  const [veri, setVeri] = useState<Partial<Record<KampanyaDuzeyi, MetricsBreakdownRow[]>>>(
    ilk ? { campaign: ilk } : {},
  );
  const [hata, setHata] = useState<Partial<Record<KampanyaDuzeyi, string>>>(
    ilk ? {} : { campaign: e.kampanyaListesiAlinamadi },
  );

  useEffect(() => {
    if (veri[duzey] || hata[duzey]) return;
    let iptal = false;
    apiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${sorgu}&level=${duzey}&limit=${sinir}`).then(
      (r) => !iptal && setVeri((v) => ({ ...v, [duzey]: r })),
      (err: unknown) =>
        !iptal &&
        setHata((h) => ({ ...h, [duzey]: err instanceof ApiRequestError ? err.message : e.listeAlinamadi })),
    );
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `e` metin; dil değişince sayfa zaten yeniden çiziliyor
  }, [duzey, veri, hata, sorgu, sinir]);

  const satirlar = veri[duzey];
  const ad = e.duzeyler[duzey];
  const gosterilen = (satirlar ?? []).slice(0, OZET_SATIR_SAYISI);

  const satirAdresi = (r: MetricsBreakdownRow) => {
    const q = new URLSearchParams(tasinanSorgu);
    if (duzey === 'campaign') {
      q.set('seviye', 'ad_group');
      q.set('kampanya', r.entityId);
    } else if (duzey === 'ad_group') {
      q.set('seviye', 'ad');
      q.set('reklamSeti', r.entityId);
    } else {
      q.set('seviye', 'ad');
    }
    return `${reklamYoneticisi}?${q}`;
  };
  const tumuAdresi = (() => {
    const q = new URLSearchParams(tasinanSorgu);
    q.set('seviye', duzey);
    return `${reklamYoneticisi}?${q}`;
  })();

  return (
    <section className={`${s.kart} ${s.gir}`}>
      <div className={s.kartUst}>
        <h2>{ad.baslik}</h2>
        {/* ORTAK BÖLÜMLÜ SEÇİCİ: aynı listenin üç görünümü (kampanya, set, reklam). */}
        <span style={{ marginLeft: 8 }}>
          <BolumluSecici
            etiket={e.duzey}
            secili={duzey}
            onSec={setDuzey}
            secenekler={DUZEYLER.map((d) => ({ deger: d, etiket: e.duzeyler[d].tab }))}
          />
        </span>
        <Link className={s.sagBag} href={tumuAdresi}>
          {g.ozet.tumuOk}
        </Link>
      </div>

      {hata[duzey] ? (
        <p role="alert" className={s.hataMetin}>
          {hata[duzey]}
        </p>
      ) : !satirlar ? (
        <p className={s.bosMetin} aria-busy="true">
          {e.yukleniyor}
        </p>
      ) : gosterilen.length === 0 ? (
        <p className={s.bosMetin}>{ad.bos}</p>
      ) : (
        <div className={s.tabloSar}>
          <table className={s.tablo} style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>{ad.tab}</th>
                <th>{g.metrik.mecra}</th>
                <th>{g.metrik.harcama}</th>
                <th>{g.metrik.donusum}</th>
                <th>{g.metrik.dbm}</th>
              </tr>
            </thead>
            <tbody key={duzey} className={s.yenilenen}>
              {gosterilen.map((r) => {
                const birim = paraBirimi ?? r.currency;
                return (
                  <tr key={r.entityId}>
                    <td style={{ maxWidth: 0, width: '42%' }}>
                      <div className={s.adHucre}>
                        <span
                          className={`${s.nokta} ${r.status === 'active' ? '' : s.noktaDurdu}`}
                          title={r.status === 'active' ? e.yayinda : e.yayindaDegil}
                        />
                        <span style={{ minWidth: 0 }}>
                          <Link
                            href={satirAdresi(r)}
                            title={r.name}
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {r.name}
                          </Link>
                          {r.parentName && <small>{r.parentName}</small>}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={s.etiket}>{PLATFORM_KISA_ADLARI[r.platform]}</span>
                    </td>
                    <td className={s.num}>{formatMoney(r.spendMicros, birim, { dil })}</td>
                    <td className={s.num}>{formatNumber(r.conversions, dil)}</td>
                    <td className={s.num}>
                      {r.cpa === null ? '—' : formatMoney(microsOf(r.cpa), birim, { dil })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {satirlar && satirlar.length > 0 && (
        <div className={s.kartAlt}>
          <span>
            {satirlar.length >= sinir
              ? ad.kesik(gosterilen.length, satirlar.length)
              : ad.sayac(gosterilen.length, satirlar.length)}
          </span>
          <Link href={tumuAdresi}>{e.reklamYoneticisi}</Link>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bekleyen işler açılır kısmı
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kalan işler kartın İÇİNDE kayarak açılıyor (kart büyümüyor). Satırlar
 * DOM'da kalıyor, kapalıyken `inert`; geçiş `grid-template-rows`.
 */
export function IslerKap({
  ilkSayisi,
  gelen,
  toplam,
  kalan,
}: {
  ilkSayisi: number;
  /** Sunucunun döndürdüğü iş sayısı (üst sınırlı). */
  gelen: number;
  /** Gerçek toplam; sunucu sınıra ulaştıysa `gelen`den büyük. */
  toplam: number;
  kalan: ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const d = useSozluk(genelBakisSozlugu).isler;
  if (gelen <= ilkSayisi) return null;
  // TEK SAYAÇ: "3 / 50" ve altında ayrıca "50 / 69" iki ayrı satırdı ve
  // hangisinin neyi saydığı anlaşılmıyordu (canlı denetim, 2026-10-09).
  // Gerçek toplam her zaman paydada; sunucu sınırı açıkken de söyleniyor.
  const sayac = acik
    ? gelen < toplam
      ? d.acikSayac(gelen, toplam)
      : d.tumSayac(toplam)
    : d.kapaliSayac(ilkSayisi, toplam);
  return (
    <>
      <div className={`${s.kap} ${acik ? s.kapAcik : ''}`}>
        <div inert={!acik}>
          <div className={s.kaydir}>{kalan}</div>
        </div>
      </div>
      <div className={s.kartAlt}>
        <span className={s.num}>{sayac}</span>
        <button type="button" aria-expanded={acik} onClick={() => setAcik((v) => !v)}>
          {acik ? d.dahaAz : gelen < toplam ? d.isleriGoster(gelen) : d.tumunuGoster(toplam)}
        </button>
      </div>
    </>
  );
}
