import { sec, type Dil } from '@advetics/shared';
import { fiyatSozlugu } from '@/dil/sozlukler/fiyat';
import { karsilastirmaSatirlari, paketler, type Hucre } from './fiyat';

/**
 * Paket karşılaştırma tablosu. Sunucu bileşeni: dönem anahtarından
 * etkilenmiyor (özellik ve sınır, fiyat değil). Satırlar `fiyat.ts`ten.
 *
 * "Yok" hücresi yalnız tire değil: ekran okuyucu tireyi okumuyor ve "var"
 * ile "yok" aynı sessizliğe düşerdi.
 */
function HucreIcerigi({ h, dil }: { h: Hucre; dil: Dil }) {
  const t = sec(fiyatSozlugu, dil).tablo;
  if (h === true)
    return (
      <>
        <span aria-hidden="true">✓</span>
        <span className="sr-only">{t.var}</span>
      </>
    );
  if (h === false)
    return (
      <>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{t.yok}</span>
      </>
    );
  return <>{h}</>;
}

export function KarsilastirmaTablosu({ dil }: { dil: Dil }) {
  const t = sec(fiyatSozlugu, dil).tablo;
  const liste = paketler(dil);
  return (
    <div className="tablo-sar">
      <table className="karsilastir">
        <caption className="sr-only">{t.baslik}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{t.ozellik}</span>
            </th>
            {liste.map((p) => (
              <th key={p.kod} scope="col">
                {p.ad}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {karsilastirmaSatirlari(dil).map((s) => (
            <tr key={s.ad}>
              <th scope="row">{s.ad}</th>
              {s.degerler.map((h, i) => (
                <td key={liste[i]!.kod} className={h === false ? 'g' : undefined}>
                  <HucreIcerigi h={h} dil={dil} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
