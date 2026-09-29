import Link from 'next/link';
import type { Permission } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { VARLIKLAR } from './varliklar';

/**
 * Marka Merkezi → Varlıklar. Kartlar ekranların kendisine gidiyor ve
 * workspace seçimi taşınıyor: `?musteri=` düşerse ekran "workspace seç"
 * diye açılır ve kullanıcı az önce seçtiğini tekrar seçer.
 *
 * YETKİSİ OLMAYAN KART ÇİZİLMİYOR; hiçbiri yoksa bölüm SEBEBİYLE duruyor —
 * boş bir bölüm "varlık yok" ile "göremiyorsun"u aynı boşluğa çevirirdi.
 */
export function VarliklarBolumu({
  clientId,
  izinler,
}: {
  clientId: string;
  izinler: readonly Permission[];
}) {
  const gorunen = VARLIKLAR.filter((v) => izinler.includes(v.izin));

  return (
    <section id="varliklar" aria-labelledby="varliklar-baslik" className="scroll-mt-24">
      <div className="mb-3">
        <h2 id="varliklar-baslik" className="text-base font-semibold text-ink">
          Varlıklar
        </h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Reklamlarda kullanılan görseller, kreatifler ve formlar.
        </p>
      </div>
      {gorunen.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-ink-muted">
          Varlık ekranlarını görme yetkin yok. Yöneticine sor.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {gorunen.map((v) => (
            <li key={v.href}>
              <Link
                href={baglanti(v.href, { musteri: clientId })}
                className="block h-full rounded-xl border border-line bg-surface p-4 transition hover:border-brand hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <span className="block text-sm font-semibold text-ink">{v.ad}</span>
                <span className="mt-1 block text-xs text-ink-muted">{v.aciklama}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
