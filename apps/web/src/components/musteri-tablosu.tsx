'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MetricsClientRow } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo } from '@/components/platform-logo';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { DeltaRozeti } from '@/components/delta-rozeti';
import { changePercentMicros, formatMoney, formatNumber, microsOf } from '@/lib/format';

/**
 * ═══ MÜŞTERİ TABLOSU — MCC GÖRÜNÜMÜ ═══
 *
 * "Tüm müşteriler" seçiliyken panel KAMPANYA listeliyordu: on iki müşterinin
 * kampanyaları tek bir tabloda ve hangi satırın kime ait olduğu hiçbir yerde
 * yazmıyordu. Ajans o ekranda "hangi müşteri ne harcıyor" sorusunu soruyor ve
 * cevap yoktu.
 *
 * SATIRA TIKLAYINCA O WORKSPACE'E GEÇİLİYOR. Bu ekranın asıl işi bir liste
 * göstermek değil, bir sonraki adıma götürmek: "şu müşteride bir gariplik
 * var → onun paneline geç".
 *
 * `?musteri=` ŞERİDİ TEMİZLENİYOR. Sayfalar aktif müşteriyi
 * `params.musteri ?? session.activeClientId` sırasıyla çözüyor, yani URL
 * parametresi COOKIE'Yİ EZİYOR: temizlenmezse üst bar yeni müşteriyi yazarken
 * gövde eskisinin verisini gösterir. Üst bardaki seçicide aynı düzeltme var.
 */
export function MusteriTablosu({
  rows,
  karsilastir,
}: {
  rows: MetricsClientRow[];
  karsilastir: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function gec(clientId: string): Promise<void> {
    setGecilen(clientId);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      startTransition(() => {
        router.replace('/dashboard');
        router.refresh();
      });
    } catch (e) {
      /*
       * HATA YUTULMUYOR. Geçiş sessizce başarısız olursa kullanıcı tıklıyor,
       * hiçbir şey olmuyor ve sebebi hiçbir yerde yazmıyor — panelde defalarca
       * yaşanan hâl.
       */
      setHata(
        e instanceof ApiRequestError ? e.message : 'Workspace değiştirilemedi.',
      );
      setGecilen(null);
    }
  }

  const toplamHarcama = rows.reduce((a, r) => a + BigInt(r.spendMicros), 0n);
  const harcayan = rows.filter((r) => r.spendMicros !== '0').length;

  const bekleyenAd = rows.find((r) => r.clientId === gecilen)?.name ?? null;

  return (
    <section className="rounded-xl border border-line bg-surface">
      {/*
        SATIRA TIKLAMAK SAYFANIN TAMAMINI DEĞİŞTİRİYOR ve bu sırada ekran
        hâlâ bütün müşterilerin tablosunu gösteriyor. Örtü olmadan kullanıcı
        ikinci bir satıra tıklayabiliyor ve hangi geçişin kazandığı belirsiz
        kalıyor.
      */}
      {(gecilen !== null || isPending) && (
        <TamEkranYukleniyor mesaj={`${bekleyenAd ?? 'Workspace'} görünümüne geçiliyor…`} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Müşteriler</h2>
          {/*
            SESSİZ KESME YOK: kaç müşteri listelendiği ve kaçının harcaması
            olduğu yazılı. "12 müşteri" ile "12 müşterinin 4'ü harcıyor"
            arasındaki fark, bu ekranda sorulan sorunun kendisi.
          */}
          <p className="mt-0.5 text-xs text-ink-muted">
            {rows.length} müşteri · {harcayan} tanesinin bu dönemde harcaması var
          </p>
        </div>
        <p className="text-xs text-ink-muted">Satıra tıklayınca o workspace’e geçilir</p>
      </div>

      {hata && (
        <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
          {hata}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">
          Henüz müşteri açılmamış.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Müşteri</th>
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
                  key={r.clientId}
                  onClick={() => void gec(r.clientId)}
                  className={`cursor-pointer border-b border-line last:border-0 transition hover:bg-surface-sunken ${
                    gecilen === r.clientId ? 'opacity-50' : ''
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
                          BOŞ SATIRIN SEBEBİ YAZILI. "Hesap atanmamış" ile
                          "hesabı var ama harcamamış" aynı boş satır olarak
                          görünüyordu ve ikisinin yapılacak işi farklı.
                        */}
                        <span className="block truncate text-[11px] text-ink-muted">
                          {r.adAccountCount === 0
                            ? 'izlemede hesap yok'
                            : `${r.adAccountCount} hesap izlemede`}
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
                              kind={p.platform === 'google' ? 'google_ads' : 'meta_ads'}
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
                    {/*
                      KARIŞIK PARA BİRİMİNDE TUTAR YOK, UYARI VAR. 1 USD +
                      1 TRY = 2 ne? Kur çevrimi yok; toplamı yine de basmak
                      ekranda anlamı olmayan bir sayı göstermek olurdu.
                    */}
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
                    {/* `null` "hesaplanamaz" demek, sıfır demek DEĞİL: dönüşüm
                        yokken "0,00 ₺" yazmak kampanyanın bedava dönüşüm
                        getirdiğini söylerdi. */}
                    {r.cpa === null || r.currency === null
                      ? '—'
                      : formatMoney(microsOf(r.cpa), r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>

            {/*
              TOPLAM SATIRI YALNIZCA TEK PARA BİRİMİ VARSA. Karışık birimlerde
              bir toplam basmak, üst kartlardaki uyarıyla çelişen bir sayı
              göstermek olurdu.
            */}
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
