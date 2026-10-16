'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { V1_AKTARIM_KAPALI_SEBEBI, V1_ESKI_AKTARIM_NOTU, type PlanDetayi, type PlanEylemi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { Kart } from '@/components/ui/kart';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiPlanSozlugu } from '@/dil/sozlukler/strateji-plan';
import { AramaBolumu } from './arama-bolumu';
import { ButceBolumu } from './butce-bolumu';
import { MatrisBolumu } from './matris-bolumu';
import { SunumBolumu } from './sunum-bolumu';
import {
  STRATEJI_BOLUMLERI,
  bolumAdi,
  YOKLAMA_MS,
  aktarimOnizlemesi,
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
  type AktarimOnizlemesi,
  type StratejiBolumu,
} from './hesap';
import { DurumRozeti, planaYaz } from './ortak';

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
  const { dil } = useDil();
  const d = useSozluk(stratejiPlanSozlugu);
  const [detay, setDetay] = useState(ilkDetay);
  const [yenileHatasi, setYenileHatasi] = useState<string | null>(null);
  const [kirli, setKirli] = useState<Record<StratejiBolumu, boolean>>({ butce: false, arama: false, matris: false, sunum: false });
  const [eylemSuruyor, setEylemSuruyor] = useState<PlanEylemi | null>(null);
  const [eylemMesaji, setEylemMesaji] = useState<{ ton: 'basari' | 'uyari' | 'tehlike'; metin: string } | null>(null);
  /*
   * İKİ ADIMLI EYLEMLER: iptal geri alınamıyor, aktarım AdvCampaign'de
   * oturum açıyor. İkisinde de ilk tıklama SONUCU gösteriyor (iptal: uyarı,
   * aktarım: kaç satırın gideceği ve neden atlanacağı), ikinci tıklama
   * yapıyor. Aktarımda önizleme olmadan kullanıcı "12 satır onayladım"
   * düşünüp 7 oturumla karşılaşırdı.
   */
  const [onayBekleyen, setOnayBekleyen] = useState<'iptal' | 'aktar' | null>(null);
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
      setYenileHatasi(okumaHatasi(err, dil));
      return null;
    }
  }, [planId, dil]);

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
  const kilit = duzenlemeKilidi(plan.durum, yazabilir, dil);
  const dugmeler = useMemo(() => eylemDugmeleri(detay.yapilabilir, dil), [detay.yapilabilir, dil]);
  const onay = onayMetni(plan.onaylayan, dil);

  async function eylemYap(eylem: PlanEylemi) {
    const { yol, govde } = eylemIstegi(plan.id, eylem, plan.surum);
    setEylemSuruyor(eylem);
    setEylemMesaji(null);
    const r = await planaYaz(yol, 'POST', govde, yenile, plan.surum, dil);
    setEylemSuruyor(null);
    setOnayBekleyen(null);
    if (r.tur === 'tamam') {
      setEylemMesaji({ ton: 'basari', metin: d.eylemSonucu[eylem] });
      // Plan listesindeki durum rozeti de değişti; sunucu sayfayı yeniden çizsin.
      router.refresh();
    } else {
      setEylemMesaji({ ton: r.tur === 'cakisma' ? 'uyari' : 'tehlike', metin: r.mesaj });
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <Kart as="div">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-baslik text-xl font-semibold text-ink">{d.ekran.medyaPlani(donemEtiketi(plan.donem, dil))}</h2>
                <DurumRozeti durum={plan.durum} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                {d.ekran.toplam} <strong className="tabular-nums text-ink">{formatMoney(plan.toplamButceMicros, plan.paraBirimi, { dil })}</strong> ·{' '}
                {d.ekran.surum} {plan.surum} · {d.ekran.sonDegisiklik} {zamanMetni(plan.guncellendi, dil)}
              </p>
              {onay && <p className="mt-1 text-sm font-medium text-ink">{onay}</p>}
              {plan.not && <p className="mt-1 text-sm text-ink">{plan.not}</p>}
            </div>

            {dugmeler.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {dugmeler.map((dg) =>
                  (dg.eylem === 'iptal' || dg.eylem === 'aktar') && onayBekleyen !== dg.eylem ? (
                    <Dugme
                      key={dg.eylem}
                      ton={dg.eylem === 'iptal' ? 'tehlike' : dg.ton}
                      onClick={() => setOnayBekleyen(dg.eylem as 'iptal' | 'aktar')}
                      disabled={eylemSuruyor !== null}
                    >
                      {dg.etiket}
                    </Dugme>
                  ) : dg.eylem === 'aktar' ? null : (
                    <Dugme
                      key={dg.eylem}
                      ton={dg.ton}
                      onClick={() => void eylemYap(dg.eylem)}
                      bekliyor={eylemSuruyor === dg.eylem}
                      // Kaydedilmemiş taslakla onaya göndermek, onaylanan planın
                      // ekranda görünenden FARKLI olması demek.
                      disabled={(eylemSuruyor !== null && eylemSuruyor !== dg.eylem) || (dg.eylem === 'onaya_gonder' && kaydedilmemis)}
                    >
                      {dg.eylem === 'iptal' ? d.ekran.iptalOnay : dg.etiket}
                    </Dugme>
                  ),
                )}
                {onayBekleyen === 'iptal' && (
                  <Dugme ton="hayalet" onClick={() => setOnayBekleyen(null)}>
                    {d.ortak.vazgec}
                  </Dugme>
                )}
              </div>
            )}
          </div>

          {onayBekleyen === 'aktar' && (
            <AktarimOnizlemeKutusu
              onizleme={aktarimOnizlemesi(detay, dil)}
              para={plan.paraBirimi}
              bekliyor={eylemSuruyor === 'aktar'}
              onayla={() => void eylemYap('aktar')}
              vazgec={() => setOnayBekleyen(null)}
            />
          )}
          {onayBekleyen === 'iptal' && (
            <p className="text-sm text-danger-strong">{d.ekran.iptalUyari}</p>
          )}
          {kaydedilmemis && dugmeler.some((d) => d.eylem === 'onaya_gonder') && (
            <p className="text-sm text-warn-strong">{d.ekran.onayaGondermeKaydet}</p>
          )}
          {eylemMesaji && <Uyari ton={eylemMesaji.ton}>{eylemMesaji.metin}</Uyari>}
          {/* Onaylı plan AdvCampaign'e AKTARILAMIYOR (ölü sohbet yolu kapatıldı): kullanıcı
              "Aktar" düğmesini neden göremediğini burada okur. */}
          {plan.durum === 'onaylandi' && (
            <Uyari ton="bilgi" baslik={d.ekran.aktarimKapali}>
              {V1_AKTARIM_KAPALI_SEBEBI}
            </Uyari>
          )}
          {plan.aktarim && <AktarimKutusu detay={detay} />}
        </div>
      </Kart>

      {yenileHatasi && (
        <Uyari
          ton="tehlike"
          baslik={d.ekran.yenilenemedi}
          eylem={
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => void yenile()}>
              {d.ekran.tekrarDene}
            </Dugme>
          }
        >
          {yenileHatasi}
          {detay.kelimeler.aramaSuruyor && d.ekran.aramaDurumuEki}
        </Uyari>
      )}

      {/* İÇ MENÜ: seçim adreste (`?bolum=`), bağlantı `stratejiAdresi` ile. */}
      <nav aria-label={d.ekran.bolumlerEtiketi} className="-mx-1 overflow-x-auto px-1">
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
                  {bolumAdi(b.kod, dil)}
                  {kirli[b.kod] && (
                    <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label={d.ekran.kaydedilmemisIsareti} role="img" />
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
      <div hidden={bolum !== 'sunum'}>
        <SunumBolumu plan={plan} kaydedilmemis={kaydedilmemis} />
      </div>
    </div>
  );
}

/**
 * ESKİ aktarımın kutusu. Eski hâli "AdvCampaign oturumu N" bağlantıları
 * gösteriyordu: o oturumlar kaldırılmış sohbetin tablosunda ve bağlantı
 * yalnız rehber listesine düşüyordu. Kutu artık gerçeği söylüyor: bu plandan
 * AdvCampaign'de taslak YOK. Atlanan satırların sayısı ve nedeni kalıyor.
 */
function AktarimKutusu({ detay }: { detay: PlanDetayi }) {
  const { dil } = useDil();
  const d = useSozluk(stratejiPlanSozlugu);
  const a = detay.plan.aktarim;
  if (!a) return null;
  const ozet = aktarimOzeti(a, dil);
  return (
    <div className="space-y-1.5 rounded-alan border border-line bg-surface-muted p-3 text-sm">
      <p className="font-semibold text-ink">{V1_ESKI_AKTARIM_NOTU}</p>
      <p className="text-xs text-ink-muted">
        {d.ekran.eskiAktarimZamani}: {zamanMetni(a.zaman, dil)} · {ozet.baslik}
      </p>
    </div>
  );
}

/**
 * Aktarım önizlemesi: kararı sözleşmenin `aktarimEngeli` veriyor (servisin
 * aynısı). Hiç satır gitmeyecekse onay düğmesi kapalı ve nedeni yazılı:
 * sunucu boş aktarımı zaten reddediyor, ekranın onu denemeye izin vermesi
 * kullanıcıya bir ret daha göstermekten başka bir şey yapmazdı.
 */
function AktarimOnizlemeKutusu({
  onizleme,
  para,
  bekliyor,
  onayla,
  vazgec,
}: {
  onizleme: AktarimOnizlemesi;
  para: string;
  bekliyor: boolean;
  onayla: () => void;
  vazgec: () => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(stratejiPlanSozlugu);
  const { gidecek, atlanacak, nedenler } = onizleme;
  return (
    <div className="space-y-2 rounded-alan border border-line bg-surface-muted p-3 text-sm" role="region" aria-label={d.ekran.onizlemeEtiketi}>
      <p className="font-semibold text-ink">{d.ekran.onizlemeBaslik(gidecek.length, atlanacak.length)}</p>
      {gidecek.length > 0 && (
        <ul className="space-y-0.5 text-ink">
          {gidecek.map((g) => (
            <li key={g.id}>
              {g.baslik} · <span className="tabular-nums">{formatMoney(g.tutarMicros, para, { dil })}</span>
            </li>
          ))}
        </ul>
      )}
      {nedenler.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-ink-muted">
          {nedenler.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-muted">{d.ekran.onizlemeAciklama}</p>
      <div className="flex flex-wrap gap-2">
        <Dugme onClick={onayla} bekliyor={bekliyor} disabled={gidecek.length === 0}>
          {d.ekran.aktarimiOnayla}
        </Dugme>
        <Dugme ton="hayalet" onClick={vazgec}>
          {d.ortak.vazgec}
        </Dugme>
      </div>
      {gidecek.length === 0 && <p className="text-sm text-warn-strong">{d.ekran.aktarilacakYok}</p>}
    </div>
  );
}
