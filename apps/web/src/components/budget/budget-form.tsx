'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BudgetRecord, Dil } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { butceSozlugu } from '@/dil/sozlukler/butce';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Alan, FormIzgarasi, Girdi } from '@/components/ui/alan';
import { Dugme, type DugmeBoyutu, type DugmeTonu } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { YanPanel } from '@/components/ui/pencere';

/**
 * Bütçe tanımlama / güncelleme.
 *
 * TUTAR KULLANICI BİRİMİNDE giriliyor ve micros çevrimi SUNUCUDA yapılıyor.
 * Burada çevirmek, ondalık ayırıcı hatasını (Türkçe arayüzde "45.000,50")
 * ve kayan nokta kaymasını istemciye dağıtmak olurdu.
 *
 * Alan `type="text"`, `type="number"` DEĞİL: sayı girdisi Türkçe klavyede
 * virgülü sessizce yutuyor ve "1500,75" tarayıcıya göre "1500" ya da geçersiz
 * oluyor. Doğrulama sunucuda, biçim serbest.
 *
 * YAN PANELDE (onaylı taslak `#butce`): satırda yalnız "Düzenle" ya da
 * "Bütçe tanımla" düğmesi, form sağdan açılıyor. Eski form satırın İÇİNDE
 * açılıyor ve tabloyu bölüp aşağıdaki satırları itiyordu; hangi hesabın
 * bütçesini düzenlediğin kayboluyordu.
 */
export function BudgetForm({
  clientId,
  adAccountId,
  adAccountName,
  month,
  existing,
  currency,
  tetik,
}: {
  /**
   * TETİK GÖRÜNÜŞÜ. Satırda küçük ikincil ("Düzenle"); Aylık Bütçe başlığında
   * birincil "Bütçeyi düzenle" (onaylı taslak `#butce`). Form ve kayıt yolu
   * TEK: iki ayrı form yazmak, ikisinin bir gün farklı alan göndermesi demek.
   */
  tetik?: { ton: DugmeTonu; boyut: DugmeBoyutu; metin: string };
  clientId: string;
  adAccountId: string | null;
  adAccountName: string | null;
  month: string;
  existing: BudgetRecord | null;
  currency: string | null;
}) {
  const router = useRouter();
  const d = useSozluk(butceSozlugu).form;
  const { dil } = useDil();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(existing ? microsToInput(existing.amountMicros) : '');
  const [dailyCap, setDailyCap] = useState(
    existing?.dailyCapMicros ? microsToInput(existing.dailyCapMicros) : '',
  );
  const [alertPct, setAlertPct] = useState(String(existing?.alertThresholdPct ?? 80));
  const [autoPause, setAutoPause] = useState(
    existing?.autoPauseAtPct === null || existing?.autoPauseAtPct === undefined
      ? ''
      : String(existing.autoPauseAtPct),
  );
  const [note, setNote] = useState(existing?.note ?? '');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          adAccountId,
          month,
          amount: amount.trim(),
          ...(dailyCap.trim() ? { dailyCap: dailyCap.trim() } : {}),
          alertThresholdPct: Number(alertPct),
          ...(autoPause.trim() ? { autoPauseAtPct: Number(autoPause) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      setOpen(false);
      // Pacing sunucuda hesaplanıyor; sayfayı tazelemek tek doğru yol.
      // İstemcide yeniden hesaplamak, iki ayrı pacing tanımı demek olurdu.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : d.kaydedilemedi,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/budgets/${existing.id}`, { method: 'DELETE' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : d.silinemedi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dugme ton={tetik?.ton ?? 'ikincil'} boyut={tetik?.boyut ?? 'kucuk'} onClick={() => setOpen(true)}>
        {tetik?.metin ?? (existing ? d.duzenle : d.tanimla)}
      </Dugme>

      <YanPanel
        acik={open}
        onKapat={() => !busy && setOpen(false)}
        baslik={existing ? d.butceyiDuzenle : d.tanimla}
        altEylemler={
          <>
            {existing && (
              <Dugme ton="tehlike" onClick={remove} disabled={busy} className="mr-auto">
                {d.butceyiSil}
              </Dugme>
            )}
            <Dugme ton="ikincil" onClick={() => setOpen(false)} disabled={busy}>
              {d.vazgec}
            </Dugme>
            <Dugme onClick={save} bekliyor={busy} disabled={!amount.trim()}>
              {d.kaydet}
            </Dugme>
          </>
        }
      >
        <p className="m-0 text-13 font-semibold text-ink">
          {adAccountName ?? d.workspaceGeneli} · {monthLabel(month, dil)}
        </p>
        {adAccountId === null && (
          <p className="m-0 text-12 text-ink-muted">
            {d.semsiye}
          </p>
        )}

        <Alan etiket={d.aylikButce(currency)}>
          {(id) => (
            <Girdi
              id={id}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="45000"
              className="font-baslik tabular-nums"
            />
          )}
        </Alan>

        <Alan etiket={d.gunlukLimit}>
          {(id) => (
            <Girdi
              id={id}
              type="text"
              inputMode="decimal"
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              placeholder={d.limitYok}
              className="font-baslik tabular-nums"
            />
          )}
        </Alan>

        <FormIzgarasi>
          <Alan etiket={d.uyariEsigi}>
            {(id) => (
              <Girdi id={id} type="number" min={1} max={200} value={alertPct} onChange={(e) => setAlertPct(e.target.value)} />
            )}
          </Alan>
          <Alan etiket={d.otoDurdurma}>
            {(id) => (
              <Girdi
                id={id}
                type="number"
                min={1}
                max={200}
                value={autoPause}
                onChange={(e) => setAutoPause(e.target.value)}
                placeholder={d.kapali}
              />
            )}
          </Alan>
        </FormIzgarasi>
        {/* Alan kaydediliyor ama HENÜZ UYGULANMIYOR. Kullanıcının açık
            bıraktığı bir korumanın çalıştığını sanması, hiç olmamasından
            kötü: o yüzden burada yazıyor. Kural motoru (`budget_spent_ratio`
            koşulu) bu alanı OKUMUYOR; kullanıcıyı çalışan yola yönlendir. */}
        <p className="m-0 text-12 text-ink-muted">
          {d.otoDurdurmaNotu}
        </p>

        <Alan etiket={d.not}>
          {(id) => <Girdi id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
        </Alan>

        {error && (
          <Serit ton="hata" baslik={d.seritBaslik}>
            {error}
          </Serit>
        )}
      </YanPanel>
    </>
  );
}

/**
 * Micros → düzenlenebilir metin.
 *
 * Kuruş sıfırsa gösterilmiyor: "45000" yazan kullanıcı formu yeniden açtığında
 * "45000,00" görmek istemiyor. Kuruş varsa korunuyor.
 */
function microsToInput(micros: string): string {
  const value = BigInt(micros);
  const whole = value / 1_000_000n;
  const cents = (value % 1_000_000n) / 10_000n;
  return cents === 0n ? whole.toString() : `${whole},${cents.toString().padStart(2, '0')}`;
}

function monthLabel(month: string, dil: Dil): string {
  const [y, m] = [month.slice(0, 4), month.slice(5, 7)];
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString(dil === 'en' ? 'en-US' : 'tr-TR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
