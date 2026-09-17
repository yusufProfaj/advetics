import type { ReactNode } from 'react';
import { bloklaraAyir, type Blok, type SatirIci } from '@/lib/sohbet-metni';

/**
 * ═══ SOHBET BALONU ═══
 *
 * Üç şey birden düzeltiyor ve üçü de kullanıcının bildirdiği hâlden geliyor:
 *
 *   1. KİMİN YAZDIĞI BELLİ. Eski hâlde yalnızca hizalama ve renk fark
 *      ediyordu; ekran görüntüsü alınıp paylaşıldığında ya da uzun bir plan
 *      okunurken kimin konuştuğu kayboluyordu. Artık her balonun üstünde ad
 *      var: kullanıcının kendi adı ve "Advetics".
 *   2. MARKDOWN İŞARETLERİ EKRANDA DEĞİL. Model `**kalın**` ve madde
 *      işaretleri yazıyor; düz metin basmak yıldızlarla dolu bir duvar
 *      üretiyordu.
 *   3. UZUN PLAN OKUNABİLİYOR. Maddeler gerçek liste, başlıklar gerçek
 *      başlık.
 *
 * HTML ÜRETİLMİYOR. Ayrıştırma saf bir fonksiyonda (`bloklaraAyir`) ve
 * çizimi React yapıyor; modelin yazdığı hiçbir dize HTML olarak
 * yorumlanmıyor.
 */
export function SohbetBalonu({
  rol,
  metin,
  yazan,
  zaman,
}: {
  rol: 'user' | 'assistant';
  metin: string;
  /** Balonun üstünde görünen ad. */
  yazan: string;
  /** ISO zaman — balonun altında saat olarak. */
  zaman: string;
}) {
  const kullanici = rol === 'user';

  return (
    <div className={`flex min-w-0 gap-2.5 ${kullanici ? 'flex-row-reverse' : 'flex-row'}`}>
      {/*
        BAŞ HARF ROZETİ — avatar yok.
        Kullanıcının yüklediği bir avatar her zaman yok ve olmayan bir görsel
        için yer tutmak, satırı boş bir kutuyla başlatmak olurdu.
      */}
      <span
        aria-hidden="true"
        className={`mt-5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          kullanici ? 'bg-brand text-white' : 'bg-surface-sunken text-ink'
        }`}
      >
        {basHarfler(yazan)}
      </span>

      <div className={`flex min-w-0 max-w-[85%] flex-col ${kullanici ? 'items-end' : 'items-start'}`}>
        <span className="px-1 text-[11px] font-medium text-ink-muted">
          {yazan}
          <time className="ml-1.5 font-normal" dateTime={zaman}>
            {saat(zaman)}
          </time>
        </span>

        <div
          className={`min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            kullanici
              ? 'rounded-br-md bg-brand text-white'
              : 'rounded-bl-md border border-line bg-surface text-ink'
          }`}
        >
          {/*
            KULLANICININ KENDİ METNİ AYRIŞTIRILMIYOR. Kullanıcı markdown
            yazmıyor; yazdığı yıldızı kalına çevirmek, yazdığından farklı bir
            şey göstermek olurdu. Satır sonları korunuyor.
          */}
          {kullanici ? (
            <p className="whitespace-pre-wrap">{metin}</p>
          ) : (
            <BloklariCiz bloklar={bloklaraAyir(metin)} />
          )}
        </div>
      </div>
    </div>
  );
}

function BloklariCiz({ bloklar }: { bloklar: Blok[] }): ReactNode {
  return (
    <div className="space-y-2">
      {bloklar.map((b, i) => {
        if (b.tip === 'baslik') {
          return (
            <p key={i} className="text-[13px] font-semibold text-ink">
              <Parcalar parcalar={b.parcalar} />
            </p>
          );
        }
        if (b.tip === 'madde') {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1 marker:text-ink-muted">
              {b.ogeler.map((o, j) => (
                <li key={j}>
                  <Parcalar parcalar={o} />
                </li>
              ))}
            </ul>
          );
        }
        if (b.tip === 'sirali') {
          return (
            <ol key={i} className="ml-4 list-decimal space-y-1 marker:text-ink-muted">
              {b.ogeler.map((o, j) => (
                <li key={j}>
                  <Parcalar parcalar={o} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            <Parcalar parcalar={b.parcalar} />
          </p>
        );
      })}
    </div>
  );
}

function Parcalar({ parcalar }: { parcalar: SatirIci[] }): ReactNode {
  return (
    <>
      {parcalar.map((p, i) => {
        if (p.tip === 'kalin') return <strong key={i}>{p.deger}</strong>;
        if (p.tip === 'egik') return <em key={i}>{p.deger}</em>;
        if (p.tip === 'kod') {
          return (
            <code key={i} className="rounded bg-surface-sunken px-1 py-0.5 text-[12px]">
              {p.deger}
            </code>
          );
        }
        return <span key={i}>{p.deger}</span>;
      })}
    </>
  );
}

/** Ad → en fazla iki baş harf. Boş adda tek harf yerine nokta. */
function basHarfler(ad: string): string {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return '·';
  return parcalar
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase('tr-TR'))
    .join('');
}

function saat(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
