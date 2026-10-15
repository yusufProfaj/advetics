import type { ReactNode } from 'react';

/**
 * ═══ TEK UYARI KUTUSU ═══
 *
 * Panelde dört ayrı `Notice` kopyası vardı (Genel Bakış, Bütçe, Kurallar,
 * Akıllı Boost, Reklam Keşfi) ve hepsi farklıydı: birinde `role` vardı,
 * birinde tehlike tonu yoktu. Hata kutusu ekran okuyucuya hiç
 * duyurulmuyordu.
 *
 * ROL TONDAN TÜRÜYOR, çağıran seçmiyor: tehlike `alert` (hemen duyurulur),
 * diğerleri `status` (sırası gelince). Çağırana bırakmak, bir gün bir hata
 * kutusunun sessiz kalması demekti.
 */
export type UyariTonu = 'bilgi' | 'uyari' | 'tehlike' | 'basari';

/*
 * ═══ RENK İKONDA, ZEMİNDE DEĞİL (2026-09-30) ═══
 *
 * Bilgi, uyarı ve başarı kutuları tam genişlikte RENKLİ ZEMİNLE çiziliyordu
 * ve bir sayfada iki-üç tane olunca ekranın en çok bağıran şeyi onlar
 * oluyordu; kullanıcının tarifi *"sarı uyarılar görüntü kirliliği"*. Zemin
 * kart yüzeyi, metin normal metin rengi.
 *
 * ═══ YALNIZ KILAVUZ RENKLERİ (kullanıcı kararı 2026-10-14) ═══
 *
 * Kutu artık referansın ŞERİDİ (`Serit`, `ui/hal.tsx`): beyaz zemin, SOL
 * ÇİZGİ, metin siyah. Uyarı ve tehlike = KIRMIZI çizgi + kırmızı ikon
 * (turuncu uyarı ve #dc2626 dolu tehlike kutusu kalktı); bilgi ve başarı =
 * GRİ çizgi + gri ikon (mavi bilgi kalktı; yeşil yalnız durum noktası).
 * Tehlike yine `alert` rolüyle hemen duyuruluyor ve ikonu DOLU: bir işlemin
 * düştüğünü söyleyen kutu ötekilerden ayırt edilmeli, ama zemini boyamadan.
 */
const IKON: Record<UyariTonu, { kap: string; yol: string }> = {
  bilgi: { kap: 'bg-surface-sunken text-ink', yol: 'M10 9v5M10 6.5v.01' },
  uyari: { kap: 'bg-vurgu text-danger-strong', yol: 'M10 6.5v4.5M10 13.5v.01' },
  tehlike: { kap: 'bg-danger text-white', yol: 'M10 6.5v4.5M10 13.5v.01' },
  basari: { kap: 'bg-surface-sunken text-ink', yol: 'M6.5 10.5 9 13l4.5-5.5' },
};

/** Tonun küçük ikon dairesi — uyarı listeleri de aynısını kullanıyor. */
export function UyariIkonu({ ton }: { ton: UyariTonu }) {
  const i = IKON[ton];
  return (
    <span aria-hidden className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${i.kap}`}>
      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
        <path d={i.yol} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Uyari({
  ton = 'bilgi',
  baslik,
  children,
  eylem,
}: {
  ton?: UyariTonu;
  baslik?: ReactNode;
  children?: ReactNode;
  /** Kutunun sağında duran tek eylem — "ne yapmalıyım" sorusunun cevabı. */
  eylem?: ReactNode;
}) {
  const kirmizi = ton === 'tehlike' || ton === 'uyari';
  return (
    <div
      role={ton === 'tehlike' ? 'alert' : 'status'}
      className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[12px] border border-l-4 border-line bg-surface px-4 py-3 text-sm text-ink ${
        kirmizi ? 'border-l-danger' : 'border-l-ink-soluk'
      }`}
    >
      <UyariIkonu ton={ton} />
      {/*
        METNİN TABANI 16 rem. `flex-1` (tabanı 0) metni düğmenin yanında
        istediği kadar daraltıyordu: telefonda "bu workspace'e geç" uyarısı
        150 px'lik sütunda 12 satır oldu ve sarma hiç tetiklenmedi (canlı
        denetim). Taban sığmazsa düğme alt satıra iniyor.
      */}
      <div className="min-w-0 flex-[1_1_16rem] space-y-0.5">
        {baslik && <p className="font-semibold">{baslik}</p>}
        {children && <div className={`break-words ${baslik ? 'text-ink-muted' : ''}`}>{children}</div>}
      </div>
      {eylem && <div className="shrink-0">{eylem}</div>}
    </div>
  );
}

/**
 * Birden çok UYARI SATIRI tek kutuda (Genel Bakış, Raporlar). Aynı sakin
 * dil: kart yüzeyi, satır başında uyarı ikonu. Boş liste hiçbir şey çizmiyor.
 */
export function UyariListesi({ satirlar }: { satirlar: Array<ReactNode | null | false> }) {
  const dolu = satirlar.filter((x): x is Exclude<ReactNode, null | false | undefined> => x !== null && x !== false && x !== undefined);
  if (dolu.length === 0) return null;
  return (
    <div role="status" className="rounded-[12px] border border-l-4 border-line border-l-danger bg-surface text-sm text-ink">
      <ul className="divide-y divide-line">
        {dolu.map((satir, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-2.5">
            <UyariIkonu ton="uyari" />
            <span className="min-w-0 flex-1 text-ink-muted [&_strong]:text-ink">{satir}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
