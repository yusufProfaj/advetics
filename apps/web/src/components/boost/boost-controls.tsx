'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BoostRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { useDil, useSozluk } from '@/dil/saglayici';
import { boostSozlugu } from '@/dil/sozlukler/boost';

/**
 * Aday boost'un onay düğmeleri.
 *
 * ONAY PARA TAAHHÜDÜ ve düğme bunu söylüyor: "Onayla" değil, "1.500 ₺ onayla".
 * Tutarı düğmenin dışına yazmak, onay veren kişinin onu okumadan
 * tıklayabileceği anlamına gelirdi ve bu ekranın tek işi o kararı bilinçli
 * kılmak.
 */
export function BoostDecision({
  boost,
  currency,
}: {
  boost: BoostRecord;
  currency: string | null;
}) {
  const router = useRouter();
  const d = useSozluk(boostSozlugu).kontrol;
  const { dil } = useDil();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/boosts/${boost.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ approve }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : d.islemBasarisiz);
    } finally {
      setBusy(false);
    }
  }

  if (boost.status !== 'candidate') return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {/* KART İÇİNDE DOLU KIRMIZI YOK: sayfanın tek birincil düğmesi
            başlıkta. Para taahhüdü koyu düğmeyle ayrışıyor. */}
        <Dugme ton="koyu" boyut="kucuk" onClick={() => decide(true)} disabled={busy}>
          {d.onayla(formatMoney(boost.totalBudgetMicros, currency, { dil }))}
        </Dugme>
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => decide(false)} disabled={busy}>
          {d.reddet}
        </Dugme>
      </div>
      {error && <p className="text-xs text-danger-strong">{error}</p>}
    </div>
  );
}

/*
 * ═══ "ONAYLANANLARI ŞİMDİ OLUŞTUR" KALDIRILDI ═══
 *
 * Düğme `POST /boosts/create-approved` çağırıyordu: müşterinin ONAYLI
 * boost'larını toplu hâlde platformda açıyor. Auto-Boost ekranında bir
 * karşılığı YOKTU — bildirim havuzundan onaylanan kart zaten anında
 * yayınlanıyor (`decide` → `createOneApproved`), yani düğme neredeyse her
 * zaman "0 boost oluşturuldu" diyordu.
 *
 * Kullanıcının tarifi "o da işlevsiz, o da kalksın" oldu. Uç noktanın
 * kendisi DURUYOR: kural motorundan gelen adaylar için hâlâ geçerli bir
 * yol ve zamanlanmış tarama onu kullanıyor.
 */

/** Kuralı şimdi çalıştır — aday üretir, platforma dokunmaz. */
export function RunBoostRuleButton({ ruleId }: { ruleId: string }) {
  const router = useRouter();
  const d = useSozluk(boostSozlugu).kontrol;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch<{
        evaluated: number;
        created: number;
        cappedOut: number;
        notes: string[];
      }>(`/boosts/rules/${ruleId}/run`, { method: 'POST' });
      setResult(
        [
          d.incelendi(res.evaluated),
          d.aday(res.created),
          // TAVANA TAKILANLAR SESSİZ GEÇİLMİYOR: "0 aday" ile "3 aday ama
          // tavan doldu" tamamen farklı işler.
          res.cappedOut > 0 ? d.tavana(res.cappedOut) : null,
          ...res.notes,
        ]
          .filter(Boolean)
          .join(' · '),
      );
      router.refresh();
    } catch (err) {
      /*
       * SEBEP YUTULMUYOR. "Kural çalıştırılamadı" cümlesi kullanıcıyı sebebi
       * kendi kurulumunda aramaya gönderiyordu; sunucu çoğu zaman doğrudan
       * söylüyor (kuyruk kapalı, hesap atanmamış, tavan dolu).
       */
      setResult(
        err instanceof ApiRequestError ? err.message : d.kuralCalistirilamadi,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Dugme ton="ikincil" boyut="kucuk" onClick={run} disabled={busy}>
        {busy ? d.calisiyor : d.simdiCalistir}
      </Dugme>
      {result && <p className="text-[11px] text-ink-muted">{result}</p>}
    </div>
  );
}
