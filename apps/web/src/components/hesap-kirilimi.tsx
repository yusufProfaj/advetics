'use client';

import Link from 'next/link';
import { PLATFORM_KISA_ADLARI, platformKanali } from '@advetics/shared';
import type { MetricsAccountBreakdown, MetricTotals, Platform } from '@advetics/shared';
import { KaydirmaIpucu } from '@/components/kaydirma-ipucu';
import { PlatformLogo } from '@/components/platform-logo';
import { Delta, Mecra, SiraliBaslik, TabloBasligi, mikroSayi } from '@/components/breakdown-table';
import { baglanti } from '@/lib/baglanti';
import { formatDecimal, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { kirilimSirala, type Siralama } from '@/lib/kirilim-siralama';

/**
 * ═══ MECRA VE HESAP TABLOSU — WORKSPACE'İN İLK İKİ BASAMAĞI ═══
 *
 * Workspace seçilince tablo doğrudan kampanya listeliyordu; kullanıcının
 * istediği önce mecra, sonra o mecranın hesapları, sonra hesabın
 * kampanyaları (`genel-bakis-seviyesi.ts`).
 *
 * SATIR BİR ALT BASAMAĞA GÖTÜRÜYOR ve bağlantı TAŞINAN süzgeçlerle kuruluyor
 * (`baglanti`): tarih aralığı ve sıralama düşmüyor.
 *
 * İZLENMEYEN HESAP LİSTEDE AMA BAĞLANTI DEĞİL. Metrikleri panele girmiyor
 * (`filters()`), yani içine girmek boş bir kampanya listesi gösterirdi ve
 * sıfırları "harcamadı" diye okutmak yanlış olurdu. Satır nedenini yazıyor.
 */
export function HesapKirilimi({
  veri,
  seviye,
  platform,
  tasinan,
  siralama,
}: {
  veri: MetricsAccountBreakdown;
  seviye: 'mecra' | 'hesap';
  /** Seçili mecra — boş hesap listesinin cümlesi için. */
  platform: Platform | null;
  tasinan: Record<string, string | undefined>;
  siralama: Siralama;
}) {
  const satirlar =
    seviye === 'mecra'
      ? kirilimSirala(veri.platforms, siralama).map((p) => ({
          anahtar: `${p.platform}-${p.currency ?? 'karisik'}`,
          ad: PLATFORM_KISA_ADLARI[p.platform],
          platform: p.platform,
          alt: `${p.accountCount} hesap${p.unmonitoredCount > 0 ? ` · ${p.unmonitoredCount} izlenmiyor` : ''}`,
          izleniyor: true,
          hedef: {
            platform: p.platform,
            seviye: 'hesap',
            hesap: undefined,
            kampanya: undefined,
            reklamSeti: undefined,
          } as Record<string, string | undefined>,
          currency: p.currency,
          currencies: p.currencies,
          m: p as MetricTotals & { previous: MetricTotals | null },
        }))
      : kirilimSirala(veri.accounts, siralama).map((a) => ({
          anahtar: a.adAccountId,
          ad: a.name,
          platform: a.platform,
          alt: a.externalId,
          izleniyor: a.syncEnabled,
          hedef: {
            platform: a.platform,
            hesap: a.adAccountId,
            seviye: 'campaign',
            kampanya: undefined,
            reklamSeti: undefined,
          } as Record<string, string | undefined>,
          currency: a.currency,
          currencies: a.currencies,
          m: a as MetricTotals & { previous: MetricTotals | null },
        }));

  /*
   * BOŞ LİSTE NEDENİNİ SÖYLÜYOR. Bu iki uçta tek bir sebep var — atanmış
   * hesap yok — ama mecra seçiliyken cümle o mecrayı anmalı: "hesap yok"
   * demek, workspace'in hiç hesabı yokmuş gibi okunurdu.
   */
  const bosMetni =
    seviye === 'hesap' && platform
      ? `Bu workspace'e atanmış ${PLATFORM_KISA_ADLARI[platform]} hesabı yok.`
      : "Bu workspace'e atanmış reklam hesabı yok.";

  return (
    <section className="rounded-xl border border-line bg-surface">
      <TabloBasligi seviye={seviye} tasinan={tasinan} />

      {satirlar.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">{bosMetni}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-2 font-semibold">{seviye === 'mecra' ? 'Mecra' : 'Hesap'}</th>
                  {/* Mecra basamağında mecra sütunu adın KENDİSİ; tekrar etmek gürültü. */}
                  {seviye === 'hesap' && (
                    <SiraliBaslik etiket="Mecra" anahtar="mecra" aktif={siralama} tasinan={tasinan} className="px-3 py-2" />
                  )}
                  <SiraliBaslik etiket="Harcama" anahtar="harcama" aktif={siralama} tasinan={tasinan} className="px-3 py-2 text-right" />
                  <SiraliBaslik etiket="Gösterim" anahtar="gosterim" aktif={siralama} tasinan={tasinan} className="px-3 py-2 text-right" />
                  <SiraliBaslik etiket="Tık" anahtar="tik" aktif={siralama} tasinan={tasinan} className="px-3 py-2 text-right" />
                  <th className="px-3 py-2 text-right font-semibold">CTR</th>
                  <SiraliBaslik etiket="Dönüşüm" anahtar="donusum" aktif={siralama} tasinan={tasinan} className="px-3 py-2 text-right" />
                  <SiraliBaslik etiket="CPA" anahtar="cpa" aktif={siralama} tasinan={tasinan} className="px-3 py-2 pr-4 text-right" />
                </tr>
              </thead>
              <tbody>
                {satirlar.map((r) => (
                  <tr key={r.anahtar} className="border-b border-line/60 last:border-0">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {seviye === 'mecra' && (
                          <PlatformLogo kind={platformKanali(r.platform)} className="h-4 w-4 shrink-0" />
                        )}
                        {r.izleniyor ? (
                          <Link
                            href={baglanti('/dashboard', tasinan, r.hedef)}
                            className="truncate font-medium text-ink transition hover:text-brand-strong hover:underline"
                            title={`${r.ad} — içine gir`}
                          >
                            {r.ad}
                          </Link>
                        ) : (
                          <span className="truncate font-medium text-ink-muted" title={r.ad}>
                            {r.ad}
                          </span>
                        )}
                        {!r.izleniyor && (
                          <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted ring-1 ring-inset ring-ink-muted/20">
                            İzlenmiyor
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-ink-muted">{r.alt}</p>
                    </td>
                    {seviye === 'hesap' && (
                      <td className="px-3 py-2.5">
                        <Mecra platform={r.platform} />
                      </td>
                    )}
                    {r.izleniyor ? (
                      <Metrikler m={r.m} currency={r.currency} currencies={r.currencies} />
                    ) : (
                      <td colSpan={6} className="px-3 py-2.5 pr-4 text-right text-xs text-ink-muted">
                        Rakamlara dâhil değil; izlemeyi Bağlantılar sayfasından açabilirsin.
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <KaydirmaIpucu />
        </>
      )}

      {/*
        HER HESAP LİSTEDE — kesme yok. Sayı yine yazılıyor: "kaç hesabım
        vardı" sorusunun cevabı satırları saymak olmamalı.
      */}
      {seviye === 'hesap' && veri.accounts.length > 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
          {veri.accounts.length} hesabın tamamı gösteriliyor.
        </p>
      )}
    </section>
  );
}

function Metrikler({
  m,
  currency,
  currencies,
}: {
  m: MetricTotals & { previous: MetricTotals | null };
  currency: string | null;
  currencies: string[];
}) {
  return (
    <>
      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
        {/* KARIŞIK PARA BİRİMİ TOPLANMIYOR: 1 USD + 1 TRY = 2 ne? */}
        {currency === null ? (
          <span className="text-xs font-normal text-warn-strong">Karışık ({currencies.join(', ')})</span>
        ) : (
          formatMoney(m.spendMicros, currency)
        )}
        <Delta simdi={mikroSayi(m.spendMicros)} once={mikroSayi(m.previous?.spendMicros)} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
        {formatNumber(m.impressions)}
        <Delta simdi={m.impressions} once={m.previous?.impressions} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
        {formatNumber(m.clicks)}
        <Delta simdi={m.clicks} once={m.previous?.clicks} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
        {formatPercent(m.ctr)}
        <Delta simdi={m.ctr} once={m.previous?.ctr} />
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
        {formatDecimal(m.conversions, 0)}
        <Delta simdi={m.conversions} once={m.previous?.conversions} />
      </td>
      <td className="px-3 py-2.5 pr-4 text-right tabular-nums text-ink-muted">
        {currency === null
          ? '—'
          : formatMoney(m.cpa === null ? null : String(Math.round(m.cpa * 1_000_000)), currency)}
        {/* CPA'da ARTIŞ KÖTÜ. */}
        <Delta simdi={m.cpa} once={m.previous?.cpa} inverse />
      </td>
    </>
  );
}
