import type { MetricsConversionDetail } from '@advetics/shared';
import { platformKanali, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { PlatformLogo } from '@/components/platform-logo';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * ═══ DÖNÜŞÜM DETAYI ═══
 *
 * "Dönüşüm: 47" tek başına bir şey söylemiyordu: 47'nin kaçı WhatsApp
 * tıklaması, kaçı telefon araması. Kullanıcının bildirdiği eksik birebir
 * buydu.
 *
 * GOOGLE'DA ADLAR KULLANICININ KENDİ ADLARI — `segments.conversion_action_name`
 * ile geliyor. META'DA tekilleştirilmiş kovalar (Form/Mesaj/Satış): Meta'nın
 * insights yanıtı özel dönüşümlerin kullanıcı adını taşımıyor ve ham teknik
 * türleri listelemek hem okunmaz hem MÜKERRER olurdu. Fark gizlenmiyor: her
 * satır mecrasını yazıyor.
 *
 * ODAĞA UYUYOR: kampanyaya inildiğinde o kampanyanın dönüşümleri geliyor.
 */
export function DonusumDetay({
  detay,
  currency,
}: {
  detay: MetricsConversionDetail;
  currency: string | null;
}) {
  const toplam = detay.satirlar.reduce((a, r) => a + r.sayi, 0);
  /*
   * PARA SÜTUNU YALNIZCA DEĞER VARSA. Lead ve mesaj dönüşümlerinin parasal
   * karşılığı yok; baştan sona "—" yazan bir sütun yer kaplıyor, göz
   * taramasını uzatıyor ve hiçbir şey söylemiyor.
   */
  const degerVar = detay.satirlar.some((r) => r.degerMikros !== '0');

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Dönüşüm detayı</h3>
        <span className="text-[11px] text-ink-muted">
          {detay.satirlar.length} eylem · toplam {formatNumber(toplam)}
        </span>
      </header>

      {/*
        DETAY ALINAMADIYSA SÖYLENİYOR — boş listeyle aynı şey değil.
        "Bu dönemde dönüşüm yok" ile "Google detayı vermedi" farklı işler ve
        ikincisinde sebep platformun kendi cümlesiyle yazılı.
      */}
      {detay.hatalar.length > 0 && (
        <div className="border-b border-line px-4 py-2.5">
          {detay.hatalar.map((h) => (
            <p key={h} className="text-[11px] text-warn-strong">
              Dönüşüm detayı alınamadı: {h}
            </p>
          ))}
        </div>
      )}

      {detay.satirlar.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">
          {detay.hatalar.length > 0
            ? 'Detay gelmediği için liste boş.'
            : 'Bu aralıkta kayıtlı dönüşüm yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2 font-semibold">Dönüşüm</th>
                <th className="px-3 py-2 font-semibold">Mecra</th>
                <th className="px-3 py-2 text-right font-semibold">Adet</th>
                {degerVar && <th className="px-4 py-2 text-right font-semibold">Değer</th>}
              </tr>
            </thead>
            <tbody>
              {detay.satirlar.map((r) => (
                <tr
                  key={`${r.platform}-${r.ad}`}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="max-w-[280px] px-4 py-2.5">
                    <span className="block truncate font-medium text-ink" title={r.ad}>
                      {r.ad}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <PlatformLogo
                        kind={platformKanali(r.platform)}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      {PLATFORM_KISA_ADLARI[r.platform]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {formatNumber(r.sayi)}
                  </td>
                  {degerVar && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {r.degerMikros === '0' ? '—' : formatMoney(r.degerMikros, currency)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        META SATIRLARININ NEDEN KOVA OLDUĞU YAZILI.
        Kullanıcı Google'da kendi verdiği adları görüp Meta'da "Form/Mesaj"
        görünce "benim adlarım nerede" diye arar; cevap ekranın kendisinde
        olmalı.
      */}
      {detay.satirlar.some((r) => r.platform === 'meta') && (
        <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
          Meta satırları gruplanmış olarak gelir: platform, insights yanıtında özel
          dönüşümün adını vermiyor.
        </p>
      )}
    </section>
  );
}
