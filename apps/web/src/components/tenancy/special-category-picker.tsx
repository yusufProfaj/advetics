'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_META,
  type SpecialAdCategory,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';

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

  /*
   * KATLANIYOR — açıklama metni her kartta AÇIK duruyordu.
   *
   * Beyan bir müşteride ömür boyu bir ya da iki kez değişiyor; buna karşılık
   * dört satırlık uyarı metni ve beş etiket, her müşteri kartının yarısını
   * kaplıyordu. Kapalıyken TEK SATIR ve o satır asıl bilgiyi taşıyor:
   * beyan var mı, varsa hangisi.
   *
   * SEÇİLİ KATEGORİ VARSA VARSAYILAN AÇIK. Kapatmak, düzenlemeye tabi bir
   * beyanı göz önünden kaldırmak olurdu — kartın yarısını yiyen şey açıklama
   * metniydi, beyanın kendisi değil.
   */
  const [acik, setAcik] = useState(secili.length > 0);

  const ozet =
    secili.length === 0
      ? 'beyan yok'
      : secili.map((k) => SPECIAL_AD_CATEGORY_META[k].label).join(', ');

  return (
    <div className="rounded-alan border border-line">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-sunken"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-ink">Özel reklam kategorisi</span>
          <span
            className={`block truncate text-[11px] ${
              secili.length > 0 ? 'text-danger-strong' : 'text-ink-muted'
            }`}
          >
            {ozet}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-ink-muted">{acik ? 'kapat' : 'düzenle'}</span>
      </button>

      {/* Açılır bölüm DOM'da kalıyor (görünürlük sınıfla): kapatıp açmak
          seçilmiş ama kaydedilmemiş kategorileri sıfırlamasın. */}
      <div className={`border-t border-line p-3 ${acik ? '' : 'hidden'}`}>
      <p className="text-[11px] text-ink-muted">
        Konut, istihdam ve kredi reklamları düzenlemeye tabi. Beyan edilmeden yayınlanan
        reklam politika ihlali ve ceza <strong>hesap seviyesinde</strong>: o hesaptaki
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
              aria-pressed={acik}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-12 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                acik
                  ? 'border-brand bg-vurgu text-ink'
                  : 'border-line-strong bg-surface text-ink-muted hover:bg-surface-sunken'
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
        <div className="mt-2">
          <Uyari ton="uyari">
            Bu workspace’in kampanyalarında Meta <strong>yaş ve cinsiyet daraltmasına izin
            vermiyor</strong>; o alanlar gönderilmeyecek. Beyan her kampanyaya otomatik
            ekleniyor.
          </Uyari>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-12 text-danger-strong">
          {error}
        </p>
      )}

      {canManage && degisti && (
        <Dugme ton="koyu" boyut="kucuk" className="mt-2" onClick={kaydet} disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Beyanı kaydet'}
        </Dugme>
      )}
      {kaydedildi && !degisti && (
        <p role="status" className="mt-2 text-12 text-ink">
          Beyan kaydedildi.
        </p>
      )}
      </div>
    </div>
  );
}
