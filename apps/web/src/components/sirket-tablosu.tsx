'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { platformKanali } from '@advetics/shared';
import type { MetricsOrganizationRow } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo } from '@/components/platform-logo';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { DeltaRozeti } from '@/components/delta-rozeti';
import { changePercentMicros, formatMoney, formatNumber, microsOf } from '@/lib/format';

/**
 * ═══ ŞİRKET TABLOSU — AJANS GÖRÜNÜMÜ ═══
 *
 * Hiyerarşi AJANS › ŞİRKET › WORKSPACE ve Genel Bakış artık o sırayı
 * izliyor. Ajans kapsamında ekran WORKSPACE listeliyordu: altı şirketin
 * kırk workspace'i tek düz tabloda ve hangisinin hangi şirkete ait olduğu
 * HİÇBİR YERDE yazmıyordu — "Tüm müşteriler"de kampanya listelenirken
 * yaşanan hatanın bir üst katmandaki tekrarı.
 *
 * SATIRA TIKLAYINCA O ŞİRKETE GEÇİLİYOR ve ekran kendiliğinden bir alt
 * katmana iniyor (şirket kapsamında Genel Bakış workspace'leri listeliyor).
 * Bu ekranın işi liste göstermek değil, bir sonraki adıma götürmek.
 *
 * `switch-org` ÇAĞRILIYOR, `switch-client` DEĞİL. Fark görünmez ama
 * belirleyici: şirket değişimi workspace seçimini de SIFIRLIYOR (yeni
 * şirkette o workspace kimliği geçersiz) ve bunu sunucu yapıyor.
 */
export function SirketTablosu({
  rows,
  karsilastir,
}: {
  rows: MetricsOrganizationRow[];
  karsilastir: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function gec(organizationId: string): Promise<void> {
    setGecilen(organizationId);
    setHata(null);
    try {
      await apiFetch('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
      startTransition(() => {
        /*
         * `replace('/dashboard')` — QUERY ŞERİDİ TEMİZLENİYOR.
         * Sayfalar aktif kapsamı `params.* ?? session.*` sırasıyla çözüyor,
         * yani URL parametresi COOKIE'Yİ EZİYOR: temizlenmezse üst bar yeni
         * şirketi yazarken gövde eskisinin verisini gösterir.
         */
        router.replace('/dashboard');
        router.refresh();
      });
    } catch (e) {
      // HATA YUTULMUYOR: geçiş sessizce düşerse kullanıcı tıklıyor, hiçbir
      // şey olmuyor ve sebebi hiçbir ekranda yazmıyor.
      setHata(e instanceof ApiRequestError ? e.message : 'Şirket değiştirilemedi.');
      setGecilen(null);
    }
  }

  const toplamHarcama = rows.reduce((a, r) => a + BigInt(r.spendMicros), 0n);
  const harcayan = rows.filter((r) => r.spendMicros !== '0').length;
  const bekleyenAd = rows.find((r) => r.organizationId === gecilen)?.name ?? null;

  return (
    <section className="rounded-xl border border-line bg-surface">
      {(gecilen !== null || isPending) && (
        <TamEkranYukleniyor mesaj={`${bekleyenAd ?? 'Şirket'} görünümüne geçiliyor…`} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Şirketler</h2>
          {/* SESSİZ KESME YOK: kaç şirket listelendiği ve kaçının bu dönemde
              harcaması olduğu ayrı ayrı yazılı. */}
          <p className="mt-0.5 text-xs text-ink-muted">
            {rows.length} şirket · {harcayan} tanesinin bu dönemde harcaması var
          </p>
        </div>
        <p className="text-xs text-ink-muted">Satıra tıklayınca o şirkete geçilir</p>
      </div>

      {hata && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          {hata}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">
          Üst hesabın altında henüz şirket yok.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Şirket</th>
                <th className="px-3 py-2 font-medium">Platform dağılımı</th>
                <th className="px-3 py-2 text-right font-medium">Harcama</th>
                <th className="px-3 py-2 text-right font-medium">Gösterim</th>
                <th className="px-3 py-2 text-right font-medium">Tıklama</th>
                <th className="px-3 py-2 text-right font-medium">Dönüşüm</th>
                <th className="px-3 py-2 text-right font-medium">CPA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.organizationId}
                  onClick={() => void gec(r.organizationId)}
                  className={`cursor-pointer border-b border-line last:border-0 transition hover:bg-surface-sunken ${
                    gecilen === r.organizationId ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-[10px] font-semibold uppercase text-white">
                        {r.name.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{r.name}</span>
                        {/*
                          BOŞ SATIRIN SEBEBİ YAZILI ve İKİ AYRI HÂL VAR:
                          "hiç workspace yok" (şirket yeni açılmış) ile
                          "workspace var, izlemede hesap yok" (atama
                          yapılmamış) farklı işler gerektiriyor.
                        */}
                        <span className="block truncate text-[11px] text-ink-muted">
                          {r.clientCount === 0
                            ? 'workspace yok'
                            : `${r.clientCount} workspace · ${
                                r.adAccountCount === 0
                                  ? 'izlemede hesap yok'
                                  : `${r.adAccountCount} hesap izlemede`
                              }`}
                        </span>
                      </span>
                    </span>
                  </td>

                  <td className="px-3 py-2.5">
                    {r.byPlatform.length === 0 ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {r.byPlatform.map((p) => (
                          <span key={p.platform} className="flex items-center gap-1.5">
                            <PlatformLogo
                              kind={platformKanali(p.platform)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs text-ink">
                              {r.currency === null
                                ? '—'
                                : formatMoney(p.spendMicros, r.currency, { compact: true })}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right">
                    {/* KARIŞIK PARA BİRİMİNDE TUTAR YOK, UYARI VAR: kur
                        çevrimi olmadan 1 USD + 1 TRY toplamı anlamsız. */}
                    {r.currency === null ? (
                      <span className="text-xs text-warn">
                        karışık ({r.currencies.join(', ')})
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-2">
                        <span className="font-medium text-ink">
                          {formatMoney(r.spendMicros, r.currency)}
                        </span>
                        {karsilastir && (
                          <DeltaRozeti
                            size="xs"
                            change={changePercentMicros(r.spendMicros, r.previous?.spendMicros)}
                          />
                        )}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2.5 text-right text-ink-muted">
                    {formatNumber(r.impressions)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-muted">
                    {formatNumber(r.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-muted">
                    {formatNumber(r.conversions)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-muted">
                    {/* `null` "hesaplanamaz" demek, sıfır DEĞİL: dönüşüm
                        yokken "0,00 ₺" yazmak bedava dönüşüm gelmiş gibi
                        okunurdu. */}
                    {r.cpa === null || r.currency === null
                      ? '—'
                      : formatMoney(microsOf(r.cpa), r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="border-t border-line bg-surface-muted text-sm font-medium">
                <td className="px-4 py-2.5" colSpan={2}>
                  TOPLAM
                </td>
                <td className="px-3 py-2.5 text-right">
                  {new Set(rows.flatMap((r) => r.currencies)).size > 1 ? (
                    <span className="text-xs text-warn">karışık para birimi</span>
                  ) : (
                    formatMoney(
                      toplamHarcama.toString(),
                      rows.find((r) => r.currency !== null)?.currency ?? null,
                    )
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {formatNumber(rows.reduce((a, r) => a + r.impressions, 0))}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {formatNumber(rows.reduce((a, r) => a + r.clicks, 0))}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {formatNumber(rows.reduce((a, r) => a + r.conversions, 0))}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
