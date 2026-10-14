'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { stratejiPanelAdresi, stratejiUcYolu, type Permission, type StratejiYorumu } from '@advetics/shared';
import type { Gerceklesen, StratejiDetayi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { dugmeSinifi, Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { okumaHatasi } from '../hesap';
import { durumTonu, kurulabilirMi } from './akis';
import { StratejiBelgesi } from './belge';
import { GonderPaneli, PdfIndir, pdfDosyaAdi } from './gonder';
import { STRATEJI_DURUM_ETIKETI, donemMetni } from './hesap';
import { KapatmaPenceresi, iptalEdilebilirMi, type KapatmaHedefi } from './kapatma';
import { PanelOnayKutusu } from './onay-kutusu';
import { Bildirim, durumHali, yaz } from './ortak';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };

/**
 * ═══ RAPORU İNCELE — KURUMSAL BELGE + ONAY ═══
 *
 * Müşterinin gördüğü belge (`StratejiBelgesi`: panel ve PDF aynı bölüm
 * listesi, kapakta yalnız Advetics logosu), altında onay kutusu. Üst
 * çubuktaki eylemler durumdan ve izinden: müşteri hesabı yalnız okur ve
 * karar verir; ajans taslağı düzenlemeye döner, onaydaki stratejiyi geri
 * çeker ya da onay bağlantısı oluşturur; onaylıysa "Kampanyaları kur".
 * Kurulum izni (`bulk.write`) yoksa düğme yerine nedeni yazar.
 */
export function RaporEkrani({
  clientId,
  ilkDetay,
  yorumlar,
  gerceklesen,
  izinler,
}: {
  clientId: string;
  ilkDetay: StratejiDetayi;
  yorumlar: Okuma<StratejiYorumu[]>;
  gerceklesen: Okuma<Gerceklesen> | null;
  izinler: readonly Permission[];
}) {
  const router = useRouter();
  const [detay, setDetay] = useState(ilkDetay);
  const [hata, setHata] = useState<string | null>(null);
  const [geriCekiliyor, setGeriCekiliyor] = useState(false);
  const [kapatma, setKapatma] = useState<KapatmaHedefi | null>(null);
  useEffect(() => setDetay(ilkDetay), [ilkDetay]);
  const { plan } = detay;
  const yazabilir = izinler.includes('strategy.write');
  const kurabilir = yazabilir && izinler.includes('bulk.write');

  const yenile = useCallback(async () => {
    try {
      setDetay(await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: plan.id })));
      setHata(null);
      router.refresh();
    } catch (e) {
      setHata(`Strateji yeniden okunamadı: ${okumaHatasi(e)}`);
    }
  }, [plan.id, router]);
  const tazeSurum = useCallback(async () => {
    try {
      const d = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: plan.id }));
      setDetay(d);
      return d.plan.surum;
    } catch {
      return null;
    }
  }, [plan.id]);

  async function geriCek() {
    setGeriCekiliyor(true);
    const r = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/eylem', { id: plan.id }), 'POST', { eylem: 'geri_cek', surum: plan.surum }, tazeSurum, plan.surum);
    setGeriCekiliyor(false);
    if (r.tur !== 'tamam') return setHata(r.mesaj);
    router.push(stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'plan' }));
  }

  return (
    <div className="space-y-4">
      <KapatmaPenceresi
        hedef={kapatma}
        onKapat={() => setKapatma(null)}
        onBitti={(tur) => {
          setKapatma(null);
          // Silinen stratejinin raporu yok: listeye dön. İptalde rapor kalır, durum tazelenir.
          if (tur === 'sil') {
            router.push(stratejiPanelAdresi({ musteri: clientId, adim: 'raporlar' }));
            router.refresh();
          } else void yenile();
        }}
      />
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-2">
        <Link href={stratejiPanelAdresi({ musteri: clientId, adim: 'raporlar' })} className={dugmeSinifi('ikincil', 'kucuk')}>
          ← Stratejiler
        </Link>
        <Rozet hal={durumHali(durumTonu(plan.durum))}>
          {STRATEJI_DURUM_ETIKETI[plan.durum]} · sürüm {plan.surum}
        </Rozet>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{donemMetni(plan.baslangic, plan.bitis)}</span>
        {yazabilir && (plan.durum === 'taslak' || plan.durum === 'revizyon') && (
          <Link href={stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'plan' })} className={dugmeSinifi('ikincil', 'kucuk')}>
            Düzenle
          </Link>
        )}
        {yazabilir && plan.durum === 'onayda' && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => void geriCek()} bekliyor={geriCekiliyor}>
            Geri çek ve düzenle
          </Dugme>
        )}
        <PdfIndir planId={plan.id} surum={plan.surum} dosyaAdi={pdfDosyaAdi(plan.baslangic, plan.surum)} />
        {/* İPTAL VE SİL (2026-10-14): yeni stratejiyi panelde kapatmanın yolu yoktu; onay bekleyen strateji yenisini kilitliyordu. */}
        {yazabilir && iptalEdilebilirMi({ bicim: 2, durum: plan.durum }) && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => setKapatma({ tur: 'iptal', id: plan.id, surum: plan.surum, ad: donemMetni(plan.baslangic, plan.bitis), durum: plan.durum, bicim: 2 })}>
            İptal et
          </Dugme>
        )}
        {yazabilir && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => setKapatma({ tur: 'sil', id: plan.id, surum: plan.surum, ad: donemMetni(plan.baslangic, plan.bitis), durum: plan.durum, bicim: 2 })}>
            Sil
          </Dugme>
        )}
        {kurulabilirMi(plan) &&
          (kurabilir ? (
            <Link href={stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'kur' })} className={dugmeSinifi('birincil', 'kucuk')}>
              Kampanyaları kur
            </Link>
          ) : yazabilir ? (
            <span className="text-xs text-ink-muted">Kampanya kurmak reklam oluşturma yetkisi ister.</span>
          ) : null)}
      </div>
      {plan.durum === 'onaylandi' && plan.onaylananSurum !== plan.surum && (
        <div className="mx-auto max-w-[860px]">
          <Bildirim baslik="Onaydan sonra strateji değişti; kampanyalar kurulmadan önce yeniden onaylanmalı." />
        </div>
      )}
      {hata && (
        <div className="mx-auto max-w-[860px]">
          <Bildirim hata baslik={hata} />
        </div>
      )}
      {yazabilir && plan.durum === 'onayda' && (
        <div className="mx-auto max-w-[860px]">
          <Kart baslik="Müşteriye gönder">
            <GonderPaneli planId={plan.id} surum={plan.surum} izinler={izinler} tazeSurum={tazeSurum} />
          </Kart>
        </div>
      )}
      <StratejiBelgesi
        kapakBasligi="h2"
        veri={detay}
        gerceklesen={gerceklesen}
        onayYuvasi={
          <PanelOnayKutusu kalemler={detay.kalemler} planId={plan.id} surum={plan.surum} durum={plan.durum} izinler={izinler} onay={plan.onay} yorumlar={yorumlar} yenile={() => void yenile()} tazeSurum={tazeSurum} />
        }
      />
    </div>
  );
}
