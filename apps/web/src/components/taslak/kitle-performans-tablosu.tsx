'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PLATFORM_KISA_ADLARI, type KitlePerformansi, type KitlePerformansSatiri, type KitleSablonuRecord } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDecimal, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { varliklarAdresi } from '@/lib/panel-adresleri';
import { useDil, useSozluk } from '@/dil/saglayici';
import { kitleSozlugu } from '@/dil/sozlukler/kitle';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, Girdi } from '@/components/ui/alan';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { Pencere } from '@/components/ui/pencere';
import { AdHucresi, SayfalamaCubugu, Tablo } from '@/components/ui/tablo';

/*
 * ═══ REKLAM YÖNETİCİSİ › HEDEF KİTLELER (2026-10-16) ═══
 *
 * Kullanıcı: "hangi kitleden ne dönüş geldi görülsün; hedefleme yaparken de
 * kullanılsın". Satırlar sunucuda kitleye göre toplanmış reklam setleri
 * (`/metrics/kitleler`, `kitlelereGoreTopla`). Meta satırında "Kütüphaneye
 * kaydet" setin hedeflemesini Base › Kitleler'e şablon olarak alıyor;
 * şablona taşınamayan parçalar (davranış, adres çevresi…) kayıttan sonra
 * yazıyor. Hedeflemesi okunamayan setler TEK satırda ve NEDENİYLE duruyor:
 * atılsalardı toplam sessizce eksik görünürdü.
 */
export function KitlePerformansTablosu({
  yanit,
  kitleKaydedebilir,
  clientId,
}: {
  yanit: { tur: 'veri'; v: KitlePerformansi } | { tur: 'hata'; mesaj: string };
  kitleKaydedebilir: boolean;
  clientId: string | null;
}) {
  const d = useSozluk(kitleSozlugu);
  const { dil } = useDil();
  const [kaydedilecek, setKaydedilecek] = useState<KitlePerformansSatiri | null>(null);
  const [ad, setAd] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ ad: string; atilanlar: string[] } | null>(null);

  if (yanit.tur === 'hata') return <HataDurumu baslik={d.alinamadi} mesaj={yanit.mesaj} />;
  const v = yanit.v;
  if (v.satirlar.length === 0) return <BosDurum baslik={d.bosBaslik} neden={d.bosNeden} />;

  const para = (n: number, c: string) => formatMoney(String(Math.round(n * 1_000_000)), c, { dil });
  const ac = (s: KitlePerformansSatiri) => {
    setHata(null);
    setAd(s.ozet.slice(0, 80));
    setKaydedilecek(s);
  };
  async function kaydet(): Promise<void> {
    if (!kaydedilecek?.ornekSetId || !clientId) return;
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<{ kayit: KitleSablonuRecord; atilanlar: string[] }>('/audience-templates/setten', {
        method: 'POST',
        body: JSON.stringify({ clientId, adGroupId: kaydedilecek.ornekSetId, name: ad.trim() }),
      });
      setSonuc({ ad: r.kayit.name, atilanlar: r.atilanlar });
      setKaydedilecek(null);
    } catch (e) {
      // SUNUCUNUN KENDİ CÜMLESİ: "bu adla şablon var", "ülke + il".
      setHata(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <p className="m-0 text-13 text-ink-muted">{d.aciklama}</p>
      {v.setSiniri !== null && <Serit ton="bilgi" baslik={d.sinirNotu(v.setSiniri)} />}
      {sonuc && (
        <Serit
          ton="bilgi"
          baslik={d.kaydedildi(sonuc.ad)}
          eylemler={
            clientId && (
              <Link href={varliklarAdresi('kitleler', clientId)} className="text-13 font-semibold text-brand-strong underline-offset-2 hover:underline">
                {d.kutuphaneyeGit}
              </Link>
            )
          }
        >
          {sonuc.atilanlar.length > 0 && (
            <>
              {d.tasinamayan} {sonuc.atilanlar.join(' · ')}
            </>
          )}
        </Serit>
      )}
      <Kart dolgu={false}>
        <Tablo<KitlePerformansSatiri>
          etiket={d.kitle}
          satirlar={v.satirlar}
          satirAnahtari={(s) => s.anahtar}
          sutunlar={[
            {
              anahtar: 'kitle',
              baslik: d.kitle,
              hucre: (s) => (
                <AdHucresi
                  ad={s.ozet}
                  alt={
                    s.neden ??
                    `${d.setSayisi(s.setSayisi)}: ${s.setler.map((x) => x.ad).join(', ')}${s.setSayisi > s.setler.length ? ` +${s.setSayisi - s.setler.length}` : ''}`
                  }
                />
              ),
            },
            { anahtar: 'platform', baslik: 'Platform', hucre: (s) => PLATFORM_KISA_ADLARI[s.platform] },
            { anahtar: 'harcama', baslik: d.harcama, sayi: true, hucre: (s) => para(s.spend, s.currency) },
            { anahtar: 'gosterim', baslik: d.gosterim, sayi: true, ikincil: true, hucre: (s) => formatNumber(s.impressions, dil) },
            { anahtar: 'tik', baslik: d.tiklama, sayi: true, ikincil: true, hucre: (s) => formatNumber(s.clicks, dil) },
            { anahtar: 'to', baslik: d.to, sayi: true, ikincil: true, hucre: (s) => formatPercent(s.ctr === null ? null : s.ctr * 100, 2, dil) },
            { anahtar: 'donusum', baslik: d.donusum, sayi: true, hucre: (s) => formatDecimal(s.conversions, s.conversions % 1 === 0 ? 0 : 1, dil) },
            // TANIMSIZ "—", SIFIR DEĞİL: dönüşümsüz kitlede EBM yok.
            { anahtar: 'ebm', baslik: d.ebm, sayi: true, hucre: (s) => (s.cpa === null ? '—' : para(s.cpa, s.currency)) },
            { anahtar: 'roas', baslik: 'ROAS', sayi: true, ikincil: true, hucre: (s) => (s.roas === null ? '—' : `${formatDecimal(s.roas, 2, dil)}×`) },
            {
              anahtar: 'eylem',
              baslik: <span className="sr-only">{d.kaydet}</span>,
              sayi: true,
              hucre: (s) =>
                kitleKaydedebilir && s.ornekSetId && clientId ? (
                  <Dugme ton="ikincil" boyut="kucuk" onClick={() => ac(s)}>
                    {d.kaydet}
                  </Dugme>
                ) : null,
            },
          ]}
        />
        <SayfalamaCubugu bas={1} son={v.satirlar.length} toplam={v.satirlar.length + v.gizlenenKitle} />
      </Kart>
      {v.gizlenenKitle > 0 && <p className="m-0 text-12 text-ink-muted">{d.gizlenen(v.gizlenenKitle)}</p>}

      <Pencere
        acik={kaydedilecek !== null}
        onKapat={() => setKaydedilecek(null)}
        genislik="dar"
        baslik={d.kaydetBaslik}
        aciklama={d.kaydetAciklama}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setKaydedilecek(null)} disabled={busy}>
              {d.vazgec}
            </Dugme>
            <Dugme onClick={() => void kaydet()} bekliyor={busy} disabled={!ad.trim()}>
              {d.kaydet}
            </Dugme>
          </>
        }
      >
        <div className="grid gap-3">
          <Alan etiket={d.kitleAdi}>{(id) => <Girdi id={id} value={ad} maxLength={80} onChange={(e) => setAd(e.target.value)} />}</Alan>
          {hata && <Serit ton="hata" baslik={hata} />}
        </div>
      </Pencere>
    </div>
  );
}
