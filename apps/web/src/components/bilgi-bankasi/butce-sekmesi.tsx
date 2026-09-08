'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { BudgetRecord } from '@advetics/shared';
import { formatMoney } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';
import { BudgetForm } from '@/components/budget/budget-form';

/**
 * Bütçe sekmesi — VAR OLAN `/butce` özelliğini TEKRARLAMIYOR.
 *
 * "Ay" görünümü `BudgetForm`'un (`/butce` sayfasının kendi bileşeni)
 * ŞEMSİYE (adAccountId null) satırını BİREBİR AYNI bileşenle gömüyor — ikinci
 * bir bütçe formu yazmak, ikisinin bir gün ayrışması demek olurdu. "Yıl"
 * görünümü YENİ BİR VERİ MODELİ DEĞİL: var olan aylık satırların o yılki
 * toplamı, istemci tarafında.
 *
 * GÜNCEL AY HESABI `/butce/page.tsx`teki `selectableMonths()` ile AYNI
 * `Date.UTC` mantığını kullanıyor — biri yerel saatle biri UTC ile
 * hesaplasaydı ayın 1'inde iki ekran farklı "içinde bulunulan ay" gösterirdi.
 */
function guncelAy(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ButceSekmesi({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [gorunum, setGorunum] = useState<'ay' | 'yil'>('ay');
  const [ayKaydi, setAyKaydi] = useState<BudgetRecord | null>(null);
  const [yilKayitlari, setYilKayitlari] = useState<BudgetRecord[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ay = guncelAy();
  const yil = ay.slice(0, 4);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setError(null);

    if (gorunum === 'ay') {
      apiFetch<BudgetRecord[]>(`/budgets?clientId=${clientId}&month=${ay}`)
        .then((rows) => {
          if (!iptal) setAyKaydi(rows.find((r) => r.adAccountId === null) ?? null);
        })
        .catch((err) => {
          if (!iptal) setError(err instanceof ApiRequestError ? err.message : 'Bütçe yüklenemedi');
        })
        .finally(() => {
          if (!iptal) setYukleniyor(false);
        });
    } else {
      // TÜM AYLAR — `month` filtresi VERİLMİYOR. Yeni bir uç nokta gerekmiyor,
      // var olan liste zaten müşterinin tüm bütçe satırlarını dönüyor.
      apiFetch<BudgetRecord[]>(`/budgets?clientId=${clientId}`)
        .then((rows) => {
          if (!iptal) {
            setYilKayitlari(
              rows.filter((r) => r.adAccountId === null && r.month.startsWith(yil)),
            );
          }
        })
        .catch((err) => {
          if (!iptal) setError(err instanceof ApiRequestError ? err.message : 'Bütçe yüklenemedi');
        })
        .finally(() => {
          if (!iptal) setYukleniyor(false);
        });
    }
    return () => {
      iptal = true;
    };
  }, [clientId, gorunum, ay, yil]);

  const yilToplamMicros = (yilKayitlari ?? []).reduce(
    (acc, r) => acc + BigInt(r.amountMicros),
    0n,
  );
  const currency = ayKaydi?.currency ?? yilKayitlari?.[0]?.currency ?? null;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Bütçe</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Şemsiye bütçe hedefi — hesap bazlı detay için{' '}
            <Link href={`/butce?musteri=${clientId}`} className="text-brand underline">
              Aylık Bütçe
            </Link>
            .
          </p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line text-xs">
          <button
            type="button"
            onClick={() => setGorunum('ay')}
            className={`px-2.5 py-1.5 font-medium ${gorunum === 'ay' ? 'bg-brand-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken'}`}
          >
            Ay
          </button>
          <button
            type="button"
            onClick={() => setGorunum('yil')}
            className={`px-2.5 py-1.5 font-medium ${gorunum === 'yil' ? 'bg-brand-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken'}`}
          >
            Yıl
          </button>
        </div>
      </div>

      {yukleniyor ? (
        <div className="flex items-center gap-2 py-8 text-sm text-ink-muted">
          <Halka className="h-4 w-4" /> Yükleniyor…
        </div>
      ) : error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      ) : gorunum === 'ay' ? (
        canWrite ? (
          <BudgetForm
            clientId={clientId}
            adAccountId={null}
            adAccountName={null}
            month={ay}
            existing={ayKaydi}
            currency={currency}
          />
        ) : (
          <p className="text-sm text-ink">
            {ayKaydi ? formatMoney(ayKaydi.amountMicros, ayKaydi.currency) : 'Bu ay için bütçe tanımlanmadı.'}
          </p>
        )
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Ay</th>
                <th className="px-3 py-2 text-right">Bütçe</th>
              </tr>
            </thead>
            <tbody>
              {(yilKayitlari ?? []).length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-xs text-ink-muted">
                    {yil} yılında tanımlı şemsiye bütçe yok.
                  </td>
                </tr>
              ) : (
                (yilKayitlari ?? [])
                  .slice()
                  .sort((a, b) => a.month.localeCompare(b.month))
                  .map((r) => (
                    <tr key={r.month} className="border-t border-line">
                      <td className="px-3 py-2">{r.month}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.amountMicros, r.currency)}</td>
                    </tr>
                  ))
              )}
            </tbody>
            {(yilKayitlari ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="px-3 py-2">{yil} toplam</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(yilToplamMicros.toString(), currency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
