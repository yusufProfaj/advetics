import { PAKETLER, karsilastirmaSatirlari, type Hucre } from './fiyat';

/**
 * Paket karşılaştırma tablosu. Sunucu bileşeni: dönem anahtarından
 * etkilenmiyor (özellik ve sınır, fiyat değil). Satırlar `fiyat.ts`ten.
 *
 * "Yok" hücresi yalnız tire değil: ekran okuyucu tireyi okumuyor ve "var"
 * ile "yok" aynı sessizliğe düşerdi.
 */
function HucreIcerigi({ h }: { h: Hucre }) {
  if (h === true)
    return (
      <>
        <span aria-hidden="true">✓</span>
        <span className="sr-only">Var</span>
      </>
    );
  if (h === false)
    return (
      <>
        <span aria-hidden="true">–</span>
        <span className="sr-only">Yok</span>
      </>
    );
  return <>{h}</>;
}

export function KarsilastirmaTablosu() {
  return (
    <div className="tablo-sar">
      <table className="karsilastir">
        <caption className="sr-only">Paketlerin özellik ve sınır karşılaştırması</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Özellik</span>
            </th>
            {PAKETLER.map((p) => (
              <th key={p.kod} scope="col">
                {p.ad}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {karsilastirmaSatirlari().map((s) => (
            <tr key={s.ad}>
              <th scope="row">{s.ad}</th>
              {s.degerler.map((h, i) => (
                <td key={PAKETLER[i]!.kod} className={h === false ? 'g' : undefined}>
                  <HucreIcerigi h={h} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
