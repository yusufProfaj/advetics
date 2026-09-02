import type { ReportData, ReportBreakdownBlock } from '@advetics/shared';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * ═══ KİTLE ÖZETİ — tek bakışta okunan sayfa ═══
 *
 * Kırılım tabloları "hangi kova ne kadar" sorusunu tam cevaplıyor ama beş
 * tablo art arda okunmuyor. Bu sayfa aynı veriyi ORAN olarak veriyor: üstte
 * özet kartları, ortada dört halka (gösterim ve tıklamanın cinsiyete ve yaşa
 * göre dağılımı), altta günlük form eğrisi.
 *
 * TABLOLARIN YERİNE GEÇMİYOR. Grafik oranı, tablo sayıyı gösteriyor; müşteri
 * ikisini de istiyor.
 *
 * GRAFİKLER SAF SVG — kütüphane yok. Deponun kendi deseni bu (`PlatformLogo`
 * elle çizilmiş, PDF `pdf-cizim.ts` ile vektörel): raporun bir kopyası da
 * sunucuda PDF olarak üretiliyor ve orada tarayıcı yok. İki tarafın aynı
 * görünmesi, aynı çizim mantığını paylaşmalarına bağlı.
 */

/**
 * Halka dilimlerinin renkleri.
 *
 * MARKA RENGİ İLK SIRADA, gerisi nötr slate tonları. Referans belgede her
 * dilim ayrı bir canlı renk ama o dil bu belgeye ait değil — panel raporu
 * beyaz zemin ve ince kurallar üzerine kurulu ve marka rengi yalnızca üç
 * yerde kullanılıyor. Yedi canlı renk, bir kez "çok pastel boya çizimi gibi
 * olmuş" denen hâle geri dönmek olurdu.
 */
const DILIM_RENKLERI = [
  'var(--rpt-brand)',
  '#334155',
  '#64748b',
  '#94a3b8',
  '#cbd5e1',
  '#e2e8f0',
  '#f1f5f9',
];

interface Dilim {
  etiket: string;
  deger: number;
}

/**
 * Halka grafiği.
 *
 * `stroke-dasharray` ile çiziliyor: her dilim bir yay ve `stroke-dashoffset`
 * onu doğru yere kaydırıyor. Bir `path` ile kutup koordinatı hesaplamak da
 * mümkündü ama tam daire (%100 tek dilim) orada dejenere bir yay üretiyor ve
 * hiç çizilmiyor — halka o durumda BOŞ görünürdü.
 */
function Halka({ dilimler, baslik }: { dilimler: Dilim[]; baslik: string }) {
  const toplam = dilimler.reduce((a, d) => a + d.deger, 0);

  // TOPLAM SIFIRSA GRAFİK YOK, SEBEBİ VAR. Boş bir halka "veri sıfır" ile
  // "veri gelmedi" arasında ayrım yapmıyor.
  if (toplam <= 0) {
    return (
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {baslik}
        </p>
        <p className="rounded-lg border border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
          Veri yok
        </p>
      </div>
    );
  }

  const R = 38;
  const CEVRE = 2 * Math.PI * R;
  let birikim = 0;

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {baslik}
      </p>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden>
          {dilimler.map((d, i) => {
            const pay = d.deger / toplam;
            const uzunluk = pay * CEVRE;
            const offset = -birikim * CEVRE;
            birikim += pay;
            return (
              <circle
                key={d.etiket}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={DILIM_RENKLERI[i % DILIM_RENKLERI.length]}
                strokeWidth="16"
                strokeDasharray={`${uzunluk} ${CEVRE - uzunluk}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>

        {/*
          LEJANT YÜZDEYİ DE TAŞIYOR. Yalnızca renk ve etiket vermek, iki
          yakın dilimin hangisinin büyük olduğunu göze bırakıyor — halka
          grafiğin bilinen zayıflığı ve sayıyı yazmak onu kapatıyor.
        */}
        <ul className="min-w-0 flex-1 space-y-0.5 text-[11px]">
          {dilimler.map((d, i) => (
            <li key={d.etiket} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: DILIM_RENKLERI[i % DILIM_RENKLERI.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-600">{d.etiket}</span>
              <span className="shrink-0 tabular-nums text-slate-500">
                %{((d.deger / toplam) * 100).toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Bir kırılım bloğunu halka dilimlerine çevirir.
 *
 * EN BÜYÜK ALTI, kalanı "Diğer". Yirmi dilimli bir halka okunmuyor ve
 * kalanı ATMAK toplamı bozardı — yüzdeler %100'e tamamlanmazdı.
 */
function dilimler(
  blok: ReportBreakdownBlock | undefined,
  alan: 'impressions' | 'clicks',
  etiketle: (v: string) => string,
): Dilim[] {
  if (!blok) return [];
  const sirali = [...blok.rows]
    .map((r) => ({ etiket: etiketle(r.value), deger: r[alan] }))
    .filter((d) => d.deger > 0)
    .sort((a, b) => b.deger - a.deger);

  if (sirali.length <= 6) return sirali;
  const ilk = sirali.slice(0, 6);
  const kalan = sirali.slice(6).reduce((a, d) => a + d.deger, 0);
  return kalan > 0 ? [...ilk, { etiket: `Diğer (${sirali.length - 6})`, deger: kalan }] : ilk;
}

/** Özet kartı — referans belgedeki üst şerit. */
function Kart({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="rpt-card rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiket}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{deger}</p>
    </div>
  );
}

/**
 * Günlük form eğrisi.
 *
 * REFERANSTA HER NOKTANIN SAYISI YAZILI ve burada yazılmıyor: referans
 * 31 günlük bir seride sayıları üst üste bindiriyor. Onun yerine ilk, son ve
 * EN YÜKSEK gün etiketleniyor — eğrinin okunmasını sağlayan üç nokta bunlar.
 */
function FormEgrisi({ data }: { data: ReportData }) {
  const noktalar = data.daily.map((d) => d.conversionCounts.form);
  if (noktalar.length < 2) return null;

  /*
   * TEPE DEĞER ve ÖLÇEK TAVANI AYRI İKİ SAYI — tek sayı kullanmak PDF
   * tarafında raporun tamamını düşürdü (HTTP 500, `NaN`).
   *
   * Taban 1 yalnızca sıfıra bölmeyi engellemek için. Tepe noktasını ararken
   * kullanılamaz: seri tamamen sıfırsa — form dönüşümü olmayan bir müşteride
   * gayet normal — 1 dizide bulunmaz, `indexOf` -1 döner ve `noktalar[-1]`
   * `undefined` olur. Burada bu, SVG'ye `NaN` yazmak ve noktanın SESSİZCE
   * kaybolması demek; PDF'te aynı hata belgenin tamamını kaybettiriyordu.
   *
   * Aynı hesabın iki gösterimi aynı tuzağa ayrı ayrı düşmüştü; ikisi de
   * burada ve `pdf-cizim.ts`te aynı şekilde düzeltildi.
   */
  const tepeDeger = Math.max(...noktalar);
  const enYuksek = Math.max(tepeDeger, 1);
  const G = 560;
  const Y = 90;
  const x = (i: number): number => (i / (noktalar.length - 1)) * G;
  const y = (v: number): number => Y - (v / enYuksek) * (Y - 12);

  const cizgi = noktalar.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const zirveIndex = noktalar.indexOf(tepeDeger);

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Günlük Form
      </p>
      <svg viewBox={`0 0 ${G} ${Y + 16}`} className="h-28 w-full" aria-hidden>
        {/* Taban çizgisi — eğrinin nereye oturduğu görünsün. */}
        <line x1="0" y1={Y} x2={G} y2={Y} stroke="#e2e8f0" strokeWidth="1" />
        <path d={cizgi} fill="none" stroke="var(--rpt-brand)" strokeWidth="2" strokeLinejoin="round" />
        {[0, zirveIndex, noktalar.length - 1].map((i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(noktalar[i]!)} r="3" fill="var(--rpt-brand)" />
            <text
              x={Math.min(G - 14, Math.max(10, x(i)))}
              y={Math.max(10, y(noktalar[i]!) - 7)}
              textAnchor="middle"
              fontSize="10"
              fill="#64748b"
            >
              {noktalar[i]}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{data.daily[0]?.date}</span>
        <span>{data.daily[data.daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export function KitleOzetiIcerik({
  data,
  yasEtiketi,
  cinsiyetEtiketi,
}: {
  data: ReportData;
  yasEtiketi: (v: string) => string;
  cinsiyetEtiketi: (v: string) => string;
}) {
  const yas = data.breakdowns.find((b) => b.dimension === 'age');
  const cinsiyet = data.breakdowns.find((b) => b.dimension === 'gender');

  /*
   * ÖZET KARTLARI TOPLAM BLOĞUNDAN, kırılımlardan DEĞİL.
   *
   * Kırılım toplamı ana rakamı tutmayabiliyor: Meta "unknown" kovası
   * taşıyor ve bazı gösterimler hiçbir kovaya düşmüyor. Kartları kırılımdan
   * türetmek, aynı sayfada özet kartıyla tablonun farklı sayı göstermesi
   * demekti.
   */
  const ozet = data.total ?? data.platforms[0] ?? null;

  return (
    <>
      {ozet && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kart etiket="Gösterim" deger={formatNumber(ozet.impressions)} />
          <Kart etiket="Harcama" deger={formatMoney(ozet.spendMicros, data.currency)} />
          <Kart
            etiket="Tıkl. Oranı"
            // `null` "hesaplanamaz" demek, sıfır DEĞİL — gösterim yoksa oran
            // yoktur ve "%0,00" yazmak reklamın hiç tıklanmadığını söylerdi.
            deger={ozet.ctr === null ? '—' : `%${ozet.ctr.toFixed(2)}`}
          />
          <Kart etiket="Form" deger={formatNumber(ozet.conversionCounts.form)} />
          <Kart etiket="Mesaj" deger={formatNumber(ozet.conversionCounts.message)} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Halka baslik="Gösterim / Cinsiyet" dilimler={dilimler(cinsiyet, 'impressions', cinsiyetEtiketi)} />
        <Halka baslik="Tıklama / Cinsiyet" dilimler={dilimler(cinsiyet, 'clicks', cinsiyetEtiketi)} />
        <Halka baslik="Gösterim / Yaş" dilimler={dilimler(yas, 'impressions', yasEtiketi)} />
        <Halka baslik="Tıklama / Yaş" dilimler={dilimler(yas, 'clicks', yasEtiketi)} />
      </div>

      <FormEgrisi data={data} />
    </>
  );
}
