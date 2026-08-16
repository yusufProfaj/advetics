'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_META,
  type SpecialAdCategory,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Özel reklam kategorisi beyanı — MÜŞTERİ KARTINDA.
 *
 * NEDEN BURADA VE KAMPANYA EKRANINDA DEĞİL: bir emlak firması her
 * kampanyasında emlakçı. Kampanya başına sormak, bir gün unutulacağı anlamına
 * gelir ve o gün pahalı — beyan edilmeden yayınlanan reklam politika ihlali ve
 * CEZASI HESAP SEVİYESİNDE, yani ajansın o hesaptaki bütün kampanyalarını
 * riske atıyor.
 *
 * VARSAYILAN BOŞ ve çoğu müşteride doğru cevap bu. Ekran bunu "eksik bir şey"
 * gibi göstermiyor; yalnızca kategoriye giren müşterilerde işaretleniyor.
 */
export function SpecialCategoryPicker({
  clientId,
  value,
  canManage,
}: {
  clientId: string;
  value: SpecialAdCategory[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [secili, setSecili] = useState<SpecialAdCategory[]>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  const degisti =
    secili.length !== value.length || secili.some((k) => !value.includes(k));

  async function kaydet(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify({ specialAdCategories: secili }),
      });
      setKaydedildi(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs font-semibold text-ink">Özel reklam kategorisi</p>
      <p className="mt-0.5 text-[11px] text-ink-muted">
        Konut, istihdam ve kredi reklamları düzenlemeye tabi. Beyan edilmeden yayınlanan
        reklam politika ihlali ve ceza <strong>hesap seviyesinde</strong> — o hesaptaki
        bütün kampanyaları etkiliyor.
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SPECIAL_AD_CATEGORIES.map((k) => {
          const acik = secili.includes(k);
          return (
            <button
              key={k}
              type="button"
              disabled={!canManage || busy}
              onClick={() => {
                setKaydedildi(false);
                setSecili((prev) =>
                  prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                );
              }}
              title={SPECIAL_AD_CATEGORY_META[k].hint}
              className={`rounded-lg border px-2 py-1 text-[11px] transition disabled:opacity-50 ${
                acik
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {acik ? '✓ ' : ''}
              {SPECIAL_AD_CATEGORY_META[k].label}
            </button>
          );
        })}
      </div>

      {/* KATEGORİ SEÇİLİYSE SONUCU YAZIYOR. Kullanıcı bir kutucuğa
          tıkladığında hedeflemesinin daralacağını bilmeli — yayın anında
          öğrenmek, kurduğu kitlenin uygulanmadığını fark etmek demek. */}
      {secili.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
          Bu müşterinin kampanyalarında Meta <strong>yaş ve cinsiyet daraltmasına izin
          vermiyor</strong>; o alanlar gönderilmeyecek. Beyan her kampanyaya otomatik
          ekleniyor.
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-rose-700">{error}</p>}

      {canManage && degisti && (
        <button
          type="button"
          onClick={kaydet}
          disabled={busy}
          className="mt-2 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : 'Beyanı kaydet'}
        </button>
      )}
      {kaydedildi && !degisti && (
        <p className="mt-2 text-[11px] text-emerald-700">Beyan kaydedildi.</p>
      )}
    </div>
  );
}
