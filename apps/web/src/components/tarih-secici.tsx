'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  KARSILASTIRMA_SECENEKLERI,
  MAX_GUN,
  RANGE_PRESETS,
  gunEkle,
  gunSayisi,
  karsilastirmaPenceresi,
  today,
  type IsoDay,
  type KarsilastirmaKipi,
  type ResolvedRange,
} from '@/lib/date-range';

/**
 * TARİH ARALIĞI SEÇİCİ — Google Ads deseni.
 *
 * Yatay çip şeridinin yerini aldı. Şerit altı sabit pencere gösterebiliyordu;
 * on bir ön ayar + özel aralık + karşılaştırma o biçime sığmıyor.
 *
 * SEÇİM YİNE URL'E YAZILIYOR. Bileşen istemci tarafında ama durumu kendinde
 * TUTMUYOR: "Uygula"ya basınca `router.push` ile adres çubuğuna yazıyor ve
 * sayfa sunucuda yeniden render ediliyor. Bu, paylaşılabilir bağlantıyı ve
 * sunucu tarafı render'ı koruyor — ikisi de `date-range.ts` yorumunda
 * gerekçelendirilmiş kararlar.
 *
 * DİĞER SÜZGEÇLER KORUNUYOR. `useSearchParams` ile mevcut adres okunuyor ve
 * yalnızca tarih anahtarları değiştiriliyor. Sıfırdan bir sorgu dizesi kurmak,
 * hesap/kampanya/arama süzgeçlerini sessizce düşürürdü — bu depoda "aralık
 * bazen kayboluyor" belirtisinin kaynağı tam olarak böyle bir düşürmeydi.
 */
export function TarihSecici({
  aralik,
  enEskiGun,
}: {
  aralik: ResolvedRange;
  /** `/metrics/coverage`ten gelen en eski veri günü. "Tüm zamanlar" buna dayanıyor. */
  enEskiGun: IsoDay | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);

  // Taslak durum: panel açıkken yapılan seçimler Uygula'ya kadar URL'e
  // yazılmıyor. İptal, açılıştaki hâle döndürüyor.
  const [taslakKey, setTaslakKey] = useState(aralik.key);
  const [taslakFrom, setTaslakFrom] = useState(aralik.from);
  const [taslakTo, setTaslakTo] = useState(aralik.to);
  const [taslakKars, setTaslakKars] = useState<KarsilastirmaKipi>(aralik.karsilastirma);
  const [takvimAy, setTakvimAy] = useState(aralik.from.slice(0, 7));

  function sifirla() {
    setTaslakKey(aralik.key);
    setTaslakFrom(aralik.from);
    setTaslakTo(aralik.to);
    setTaslakKars(aralik.karsilastirma);
    setTakvimAy(aralik.from.slice(0, 7));
  }

  // DIŞARI TIKLAMA + ESCAPE. `client-switcher` dışarı tıklamayı, modal deseni
  // Escape'i çözüyordu; ikisi de gerekli — açık bir panel klavyeyle
  // kapatılamıyorsa fare kullanmayan kullanıcı sıkışıyor.
  useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) {
        setAcik(false);
        sifirla();
      }
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAcik(false);
        sifirla();
      }
    };
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', tus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, aralik]);

  const taslakGun = gunSayisi(taslakFrom, taslakTo);
  const taslakKarsPencere = karsilastirmaPenceresi(taslakFrom, taslakTo, taslakKars);
  const asiyor = taslakGun > MAX_GUN;

  function onAyarSec(key: string) {
    const on = RANGE_PRESETS.find((p) => p.key === key);
    if (!on) return;
    const { from, to } = on.pencere(today(), enEskiGun);
    setTaslakKey(key);
    setTaslakFrom(from);
    setTaslakTo(to);
    setTakvimAy(from.slice(0, 7));
  }

  /** Takvimden gün seçimi: ilk tık başlangıç, ikinci tık bitiş. */
  const [ikinciTik, setIkinciTik] = useState(false);
  function gunSec(gun: IsoDay) {
    setTaslakKey('ozel');
    if (!ikinciTik) {
      setTaslakFrom(gun);
      setTaslakTo(gun);
      setIkinciTik(true);
    } else {
      if (gun < taslakFrom) {
        setTaslakTo(taslakFrom);
        setTaslakFrom(gun);
      } else {
        setTaslakTo(gun);
      }
      setIkinciTik(false);
    }
  }

  function uygula() {
    const p = new URLSearchParams(searchParams.toString());
    p.set('aralik', taslakKey);
    if (taslakKey === 'ozel') {
      p.set('baslangic', taslakFrom);
      p.set('bitis', taslakTo);
    } else {
      p.delete('baslangic');
      p.delete('bitis');
    }
    if (taslakKars === 'yok') p.delete('karsilastir');
    else p.set('karsilastir', taslakKars);
    // Sayfalama sıfırlanıyor: yeni aralıkta 7. sayfa büyük ihtimalle yok.
    p.delete('sayfa');
    setAcik(false);
    setIkinciTik(false);
    router.push(`${pathname}?${p}`);
  }

  return (
    <div ref={kutuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!acik) sifirla();
          setAcik((v) => !v);
        }}
        aria-expanded={acik}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm transition hover:bg-surface-muted"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-ink-muted" aria-hidden>
          <path
            d="M4 5.5h12v11H4zM4 8.5h12M7.5 3v3M12.5 3v3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="font-medium">{aralik.label}</span>
        <span className="text-xs text-ink-muted">
          {gunAdi(aralik.from)} – {gunAdi(aralik.to)}
        </span>
        {aralik.karsilastirma !== 'yok' && (
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
            karşılaştırmalı
          </span>
        )}
      </button>

      {acik && (
        <div
          role="dialog"
          aria-label="Tarih aralığı"
          className="absolute right-0 top-full z-30 mt-1.5 flex w-[min(46rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg sm:flex-row"
        >
          {/* Ön ayarlar */}
          <ul className="max-h-80 shrink-0 overflow-y-auto border-b border-line py-1 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
            {RANGE_PRESETS.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => onAyarSec(p.key)}
                  className={`w-full px-4 py-2 text-left text-sm transition hover:bg-surface-muted ${
                    taslakKey === p.key ? 'bg-brand-soft font-medium text-brand' : ''
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setTaslakKey('ozel')}
                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-surface-muted ${
                  taslakKey === 'ozel' ? 'bg-brand-soft font-medium text-brand' : ''
                }`}
              >
                Özel
              </button>
            </li>
          </ul>

          <div className="min-w-0 flex-1 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <GunAlani label="Başlangıç" value={taslakFrom} onChange={(v) => { setTaslakKey('ozel'); setTaslakFrom(v); }} />
              <span className="pb-2 text-ink-muted">—</span>
              <GunAlani label="Bitiş" value={taslakTo} onChange={(v) => { setTaslakKey('ozel'); setTaslakTo(v); }} />
            </div>

            <Takvim
              ay={takvimAy}
              from={taslakFrom}
              to={taslakTo}
              onAyDegis={setTakvimAy}
              onGunSec={gunSec}
            />

            {/*
              SESSİZ KESME YOK. 400 gün sunucunun sınırı; aşan bir aralık
              kırpılıyor ve bu KULLANICIYA SÖYLENİYOR. Söylenmezse "tüm
              zamanlar" diye bakıp eksik veriye bakar.
            */}
            {asiyor && (
              <p className="mt-2 rounded border border-warn/40 bg-warn/5 px-2.5 py-1.5 text-[11px] leading-snug">
                Seçilen aralık {taslakGun} gün. Sunucu en fazla {MAX_GUN} gün tarıyor —
                uygulandığında <strong>{gunAdi(gunEkle(taslakTo, -(MAX_GUN - 1)))}</strong>{' '}
                tarihinden başlatılacak.
              </p>
            )}

            <div className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Karşılaştır</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={taslakKars !== 'yok'}
                  onClick={() => setTaslakKars((k) => (k === 'yok' ? 'onceki_donem' : 'yok'))}
                  className={`relative h-5 w-9 rounded-full transition ${
                    taslakKars !== 'yok' ? 'bg-brand' : 'bg-surface-sunken'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition ${
                      taslakKars !== 'yok' ? 'left-[1.125rem]' : 'left-0.5'
                    }`}
                  />
                </button>
                {taslakKars !== 'yok' &&
                  KARSILASTIRMA_SECENEKLERI.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setTaslakKars(s.key)}
                      className={`rounded-md px-2 py-1 text-xs transition ${
                        taslakKars === s.key
                          ? 'bg-brand-soft font-medium text-brand'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
              </div>
              {taslakKarsPencere && (
                // HANGİ DÖNEMLE karşılaştırıldığı yazılı. "%12 arttı" tek
                // başına "neye göre" sorusunu cevaplamıyor.
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {gunAdi(taslakKarsPencere.from)} – {gunAdi(taslakKarsPencere.to)} ile
                  karşılaştırılacak.
                </p>
              )}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAcik(false);
                  sifirla();
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition hover:text-ink"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={uygula}
                className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GunAlani({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-[11px] text-ink-muted">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
      />
    </label>
  );
}

/**
 * TEK AYLIK IZGARA — elle çizilmiş.
 *
 * Depoda takvim bileşeni ve tarih kütüphanesi (date-fns/dayjs) YOK; biri için
 * bağımlılık eklemek yerine ızgara burada üretiliyor. Tarih matematiği
 * `Date.UTC` üzerinden: tarayıcının yerel saatiyle hesaplamak, gece yarısına
 * yakın saatlerde bir günlük kayma üretiyor ve bu kayma hiçbir hata vermiyor.
 */
function Takvim({
  ay,
  from,
  to,
  onAyDegis,
  onGunSec,
}: {
  ay: string;
  from: IsoDay;
  to: IsoDay;
  onAyDegis: (ay: string) => void;
  onGunSec: (gun: IsoDay) => void;
}) {
  const gunler = useMemo(() => ayIzgarasi(ay), [ay]);
  const bugun = today();

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onAyDegis(ayKaydir(ay, -1))}
          aria-label="Önceki ay"
          className="rounded px-2 py-1 text-ink-muted transition hover:text-ink"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{ayAdi(ay)}</span>
        <button
          type="button"
          onClick={() => onAyDegis(ayKaydir(ay, 1))}
          aria-label="Sonraki ay"
          className="rounded px-2 py-1 text-ink-muted transition hover:text-ink"
        >
          ›
        </button>
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center text-[11px] text-ink-muted">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((g) => (
          <span key={g} className="py-1">
            {g}
          </span>
        ))}
        {gunler.map((g, i) =>
          g === null ? (
            <span key={`bos-${i}`} />
          ) : (
            <button
              key={g}
              type="button"
              onClick={() => onGunSec(g)}
              // GELECEK GÜNLER KAPALI: veri yok, seçilmesi yalnızca boş bir
              // grafik üretir.
              disabled={g > bugun}
              className={`rounded py-1 transition disabled:opacity-30 ${
                g === from || g === to
                  ? 'bg-brand font-medium text-white'
                  : g > from && g < to
                    ? 'bg-brand-soft text-brand'
                    : 'text-ink hover:bg-surface-muted'
              }`}
            >
              {Number(g.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** `YYYY-MM` ayının günleri, başına pazartesi hizası için boşluk konarak. */
function ayIzgarasi(ay: string): Array<IsoDay | null> {
  const ilk = `${ay}-01`;
  const d = new Date(`${ilk}T00:00:00Z`);
  const gunNo = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const out: Array<IsoDay | null> = Array.from({ length: gunNo - 1 }, () => null);
  let g = ilk;
  while (g.slice(0, 7) === ay) {
    out.push(g);
    g = gunEkle(g, 1);
  }
  return out;
}

function ayKaydir(ay: string, n: number): string {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function ayAdi(ay: string): string {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  return `${AY_ADLARI[m - 1]} ${y}`;
}

function gunAdi(gun: IsoDay): string {
  const [y, m, d] = gun.split('-');
  return `${Number(d)} ${AY_ADLARI[Number(m) - 1]!.slice(0, 3)} ${y}`;
}
