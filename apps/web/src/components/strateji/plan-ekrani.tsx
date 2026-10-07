'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlanDetayi, PlanEylemi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { AramaBolumu } from './arama-bolumu';
import { ButceBolumu } from './butce-bolumu';
import { MatrisBolumu } from './matris-bolumu';
import {
  STRATEJI_BOLUMLERI,
  YOKLAMA_MS,
  aktarimOzeti,
  donemEtiketi,
  duzenlemeKilidi,
  eylemDugmeleri,
  eylemIstegi,
  okumaHatasi,
  onayMetni,
  stratejiAdresi,
  ucAdresi,
  zamanMetni,
  type StratejiBolumu,
} from './hesap';
import { DurumRozeti, planaYaz } from './ortak';

const EYLEM_SONUCU: Record<PlanEylemi, string> = {
  onaya_gonder: 'Plan onaya gönderildi.',
  geri_cek: 'Plan onaydan geri çekildi; yeniden düzenlenebilir.',
  onayla: 'Plan onaylandı.',
  aktar: 'Plan AdvCampaign’e aktarıldı.',
  iptal: 'Plan iptal edildi.',
};

/**
 * ═══ SEÇİLİ PLAN — DURUM, EYLEMLER, İÇ MENÜ ═══
 *
 * Üç bölüm AYNI ANDA monte, yalnız seçili olan görünür. Bölüm değişince
 * diğerinin kaydedilmemiş taslağı kaybolmamalı: Bütçe'de yazıp Matris'e
 * bakmaya giden kullanıcı döndüğünde yazdığını bulmalı. Kaydedilmemiş
 * bölüm sekmede işaretli.
 *
 * Plan yeniden okunduğunda (`yenile`) bölümler kendi taslaklarını korur;
 * yalnız kirli olmayanlar sunucudaki hâle döner.
 */
export function PlanEkrani({
  clientId,
  ilkDetay,
  bolum,
  yazabilir,
}: {
  clientId: string;
  ilkDetay: PlanDetayi;
  bolum: StratejiBolumu;
  yazabilir: boolean;
}) {
  const router = useRouter();
  const [detay, setDetay] = useState(ilkDetay);
  const [yenileHatasi, setYenileHatasi] = useState<string | null>(null);
  const [kirli, setKirli] = useState<Record<StratejiBolumu, boolean>>({ butce: false, arama: false, matris: false });
  const [eylemSuruyor, setEylemSuruyor] = useState<PlanEylemi | null>(null);
  const [eylemMesaji, setEylemMesaji] = useState<{ ton: 'basari' | 'uyari' | 'tehlike'; metin: string } | null>(null);
  const [iptalOnayi, setIptalOnayi] = useState(false);
  const planId = ilkDetay.plan.id;

  // Sunucu sayfayı yeniden çizdiğinde (bölüm değişimi, router.refresh) taze veri gelir.
  useEffect(() => setDetay(ilkDetay), [ilkDetay]);

  const yenile = useCallback(async (): Promise<PlanDetayi | null> => {
    try {
      const taze = await apiFetch<PlanDetayi>(ucAdresi('/strateji/planlar/:id', planId));
      setDetay(taze);
      setYenileHatasi(null);
      return taze;
    } catch (err) {
      setYenileHatasi(okumaHatasi(err));
      return null;
    }
  }, [planId]);

  /*
   * YOKLAMA: yalnız arama sürerken, kısa aralıkla; bileşen kalkınca
   * (sayfadan çıkınca, başka plana geçince) zamanlayıcı temizleniyor.
   * Okuma düşerse yoklama DURUYOR ve bu ekranda yazıyor: sessizce
   * denemeye devam etmek de, sessizce durmak da "arama sürüyor" yazısını
   * sonsuza kadar ekranda bırakırdı.
   */
  useEffect(() => {
    if (!detay.kelimeler.aramaSuruyor || yenileHatasi) return;
    const t = window.setTimeout(() => void yenile(), YOKLAMA_MS);
    return () => window.clearTimeout(t);
  }, [detay, yenile, yenileHatasi]);

  const kirliButce = useCallback((k: boolean) => setKirli((o) => (o.butce === k ? o : { ...o, butce: k })), []);
  const kirliArama = useCallback((k: boolean) => setKirli((o) => (o.arama === k ? o : { ...o, arama: k })), []);
  const kirliMatris = useCallback((k: boolean) => setKirli((o) => (o.matris === k ? o : { ...o, matris: k })), []);
  const kaydedilmemis = kirli.butce || kirli.arama || kirli.matris;

  const { plan } = detay;
  const kilit = duzenlemeKilidi(plan.durum, yazabilir);
  const dugmeler = useMemo(() => eylemDugmeleri(detay.yapilabilir), [detay.yapilabilir]);
  const onay = onayMetni(plan.onaylayan);

  async function eylemYap(eylem: PlanEylemi) {
    const { yol, govde } = eylemIstegi(plan.id, eylem, plan.surum);
    setEylemSuruyor(eylem);
    setEylemMesaji(null);
    const r = await planaYaz(yol, 'POST', govde, yenile, plan.surum);
    setEylemSuruyor(null);
    setIptalOnayi(false);
    if (r.tur === 'tamam') {
      setEylemMesaji({ ton: 'basari', metin: EYLEM_SONUCU[eylem] });
      // Plan listesindeki durum rozeti de değişti; sunucu sayfayı yeniden çizsin.
      router.refresh();
    } else {
      setEylemMesaji({ ton: r.tur === 'cakisma' ? 'uyari' : 'tehlike', metin: r.mesaj });
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-baslik text-xl font-semibold text-ink">{donemEtiketi(plan.donem)} medya planı</h2>
              <DurumRozeti durum={plan.durum} />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Toplam <strong className="tabular-nums text-ink">{formatMoney(plan.toplamButceMicros, plan.paraBirimi)}</strong> · Sürüm{' '}
              {plan.surum} · Son değişiklik {zamanMetni(plan.guncellendi)}
            </p>
            {onay && <p className="mt-1 text-sm font-medium text-ok-strong">{onay}</p>}
            {plan.not && <p className="mt-1 text-sm text-ink">{plan.not}</p>}
          </div>

          {dugmeler.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {dugmeler.map((d) =>
                d.eylem === 'iptal' && !iptalOnayi ? (
                  <Dugme key={d.eylem} ton="sade" onClick={() => setIptalOnayi(true)} disabled={eylemSuruyor !== null}>
                    {d.etiket}
                  </Dugme>
                ) : (
                  <Dugme
                    key={d.eylem}
                    ton={d.ton}
                    onClick={() => void eylemYap(d.eylem)}
                    bekliyor={eylemSuruyor === d.eylem}
                    // Kaydedilmemiş taslakla onaya göndermek, onaylanan planın
                    // ekranda görünenden FARKLI olması demek.
                    disabled={(eylemSuruyor !== null && eylemSuruyor !== d.eylem) || (d.eylem === 'onaya_gonder' && kaydedilmemis)}
                  >
                    {d.eylem === 'iptal' ? 'Evet, planı iptal et' : d.etiket}
                  </Dugme>
                ),
              )}
              {iptalOnayi && (
                <Dugme ton="sade" onClick={() => setIptalOnayi(false)}>
                  Vazgeç
                </Dugme>
              )}
            </div>
          )}
        </div>

        {iptalOnayi && (
          <p className="text-sm text-danger-strong">İptal edilen plan geri açılamaz. Bu ay için yeni plan oluşturulabilir.</p>
        )}
        {kaydedilmemis && dugmeler.some((d) => d.eylem === 'onaya_gonder') && (
          <p className="text-sm text-warn-strong">Kaydedilmemiş değişiklik var. Onaya göndermeden önce kaydet.</p>
        )}
        {eylemMesaji && <Uyari ton={eylemMesaji.ton}>{eylemMesaji.metin}</Uyari>}
        {plan.aktarim && <AktarimKutusu clientId={clientId} detay={detay} />}
      </div>

      {yenileHatasi && (
        <Uyari
          ton="tehlike"
          baslik="Plan yeniden okunamadı."
          eylem={
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => void yenile()}>
              Tekrar dene
            </Dugme>
          }
        >
          {yenileHatasi}
          {detay.kelimeler.aramaSuruyor && ' Kelime aramasının durumu bu yüzden güncellenmiyor.'}
        </Uyari>
      )}

      {/* İÇ MENÜ: seçim adreste (`?bolum=`), bağlantı `stratejiAdresi` ile. */}
      <nav aria-label="Plan bölümleri" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex gap-1 border-b border-line">
          {STRATEJI_BOLUMLERI.map((b) => {
            const secili = b.kod === bolum;
            return (
              <li key={b.kod} className="shrink-0">
                <Link
                  href={stratejiAdresi(clientId, { plan: plan.id, bolum: b.kod })}
                  aria-current={secili ? 'page' : undefined}
                  scroll={false}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                    secili ? 'border-brand font-semibold text-brand-strong' : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  {b.ad}
                  {kirli[b.kod] && (
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="kaydedilmemiş değişiklik var" role="img" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div hidden={bolum !== 'butce'}>
        <ButceBolumu detay={detay} kilit={kilit} yenile={yenile} onKirli={kirliButce} />
      </div>
      <div hidden={bolum !== 'arama'}>
        <AramaBolumu detay={detay} kilit={kilit} yenile={yenile} onKirli={kirliArama} />
      </div>
      <div hidden={bolum !== 'matris'}>
        <MatrisBolumu clientId={clientId} detay={detay} kilit={kilit} yenile={yenile} onKirli={kirliMatris} />
      </div>
    </div>
  );
}

/** Aktarımın sonucu: kaç satır, kaçı atlandı ve neden; açılan oturumlara bağlantı. */
function AktarimKutusu({ clientId, detay }: { clientId: string; detay: PlanDetayi }) {
  const a = detay.plan.aktarim;
  if (!a) return null;
  const ozet = aktarimOzeti(a);
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-surface-muted p-3 text-sm">
      <p className="font-semibold text-ink">{ozet.baslik}</p>
      <p className="text-xs text-ink-muted">Aktarım zamanı: {zamanMetni(a.zaman)}</p>
      {ozet.nedenler.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-ink">
          {ozet.nedenler.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {a.aktarilan.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {a.aktarilan.map((x, i) => (
            <li key={x.oturumId}>
              <Link href={baglanti('/reklam', { musteri: clientId, oturum: x.oturumId })} className="text-brand-strong underline-offset-2 hover:underline">
                AdvCampaign oturumu {i + 1}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
