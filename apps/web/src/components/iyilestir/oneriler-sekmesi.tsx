'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Oneri, OneriListesi, UygulamaSonucu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { iyilestirSozlugu } from '@/dil/sozlukler/iyilestir';
import {
  gorunenOneriler,
  oneriEylemAdresi,
  oneriGuncelle,
  ozetSayilari,
  turaGoreSuz,
  turCipleri,
  yoksayilanSayisi,
} from '@/lib/iyilestir';
import { kartEtkiSatiri, type EtkiSonucu } from '@/lib/etki';
import { OneriKarti } from './oneri-karti';
import { OnayPenceresi } from './onay-penceresi';
import { MetrikKutulari } from '@/components/ui/metrik-kutulari';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';

export type OneriSonucu = { durum: 'tamam'; liste: OneriListesi } | { durum: 'hata'; mesaj: string };

/** Yoksay sonrası kartın çıkış geçişi; taslakta 300 ms. */
const CIKIS_MS = 300;

/**
 * ÖNERİLER SEKMESİ — özet şeridi, tür çipleri, kartlar, onay penceresi.
 *
 * DÖRT HÂL AYRI YAZILIYOR (CLAUDE.md "`.catch(() => setX([]))` YASAK"):
 * çağrı düştü (platformun/sunucunun cümlesiyle), bazı kaynaklar okunamadı
 * (`hatalar` — liste dolu olsa bile şeritte), öneri yok, öneriler. Boş
 * liste "her şey yolunda" demek; okunamayan bir hesap varken bunu söylemek
 * yalan olurdu, o yüzden `hatalar` boş-liste cümlesinin de ÜSTÜNDE.
 *
 * Liste YEREL kopya: uygulanan kart sonucu gösteriyor, yoksayılan düşüyor.
 * Sayfa yenilendiğinde sunucunun hesapladığı hâl geçerli (öneriler
 * saklanmıyor, kararlar saklanıyor — MIMARI §2).
 */
export function OnerilerSekmesi({
  sonuc,
  yazabilir,
  etki,
}: {
  sonuc: OneriSonucu;
  yazabilir: boolean;
  /** Uygulanmış kartların altındaki etki satırı (Paket C); `null` = istenmedi. */
  etki: EtkiSonucu | null;
}) {
  const { dil } = useDil();
  const t = useSozluk(iyilestirSozlugu);
  const d = t.oneriler;
  const [oneriler, setOneriler] = useState<Oneri[]>(sonuc.durum === 'tamam' ? sonuc.liste.oneriler : []);
  const [buAyEk, setBuAyEk] = useState(0);
  const [secili, setSecili] = useState('hepsi');
  const [onayda, setOnayda] = useState<Oneri | null>(null);
  const [gidenler, setGidenler] = useState<ReadonlySet<string>>(new Set());
  const [yoksayilanlar, setYoksayilanlar] = useState<ReadonlySet<string>>(new Set());
  const [kartHatalari, setKartHatalari] = useState<Record<string, string>>({});

  /*
   * SUNUCU YENİ LİSTE GÖNDERİNCE YEREL KOPYA YENİLENİYOR. "Yenile" (409)
   * ve tarih değişimi aynı bileşene yeni `sonuc` veriyor; yerel kopya ilk
   * hâlde kalsaydı ekran yenilendiğini söyleyip ESKİ öneriyi gösterirdi ve
   * aynı düğme yine 409 alırdı.
   */
  useEffect(() => {
    setOneriler(sonuc.durum === 'tamam' ? sonuc.liste.oneriler : []);
    setBuAyEk(0);
    setGidenler(new Set());
    setKartHatalari({});
  }, [sonuc]);

  const kapat = useCallback(() => setOnayda(null), []);
  const uygulandi = useCallback((anahtar: string, r: UygulamaSonucu) => {
    setOneriler((l) => oneriGuncelle(l, anahtar, { durum: 'uygulandi', uygulama: r }));
    setBuAyEk((n) => n + 1);
  }, []);

  if (sonuc.durum === 'hata') {
    return <HataDurumu baslik={d.alinamadi} mesaj={sonuc.mesaj} />;
  }

  const liste = sonuc.liste;
  const ozet = ozetSayilari({ oneriler, buAyUygulanan: liste.buAyUygulanan + buAyEk }, dil);
  const gorunen = gorunenOneriler(oneriler);
  const cipler = turCipleri(gorunen, dil);
  // Seçili türün son kartı yoksayılınca çip kayboluyor; ekran boş kalmasın, Tümü'ye dön.
  const etkinSecim = cipler.some((c) => c.anahtar === secili) ? secili : 'hepsi';
  const suzulen = turaGoreSuz(gorunen, etkinSecim);
  const gizli = yoksayilanSayisi(oneriler);

  async function yoksay(o: Oneri) {
    setYoksayilanlar((x) => new Set(x).add(o.anahtar));
    setKartHatalari(({ [o.anahtar]: _, ...kalan }) => kalan);
    try {
      await apiFetch(oneriEylemAdresi(o, 'yoksay'), { method: 'POST', body: '{}' });
      setGidenler((x) => new Set(x).add(o.anahtar));
      setTimeout(() => setOneriler((l) => oneriGuncelle(l, o.anahtar, { durum: 'yoksayildi' })), CIKIS_MS);
    } catch (e) {
      setKartHatalari((h) => ({
        ...h,
        [o.anahtar]: d.yoksayilamadi(e instanceof ApiRequestError ? e.message : t.hata.baglanti),
      }));
    } finally {
      setYoksayilanlar((x) => {
        const y = new Set(x);
        y.delete(o.anahtar);
        return y;
      });
    }
  }

  /*
   * SAYAÇ HER ZAMAN (sessiz kesme yok): sunucu hesap başına ilk N öneriyi
   * döndürüyor; kesildiyse "toplamdan kaçı" yazıyor, kesilmediyse süzgeçten
   * sonra kaç kart görüldüğü. Yoksayılanlar listeden düşüyor ama sayısı
   * aynı satırda kalıyor.
   */
  const kesildi = liste.toplam > liste.oneriler.length;
  const sayac = [
    kesildi ? d.sayacKesildi(liste.toplam, liste.oneriler.length) : d.sayacGosteriliyor(suzulen.length),
    gizli > 0 ? d.sayacGizli(gizli) : null,
    liste.beklemede > 0 ? d.sayacBeklemede(liste.beklemede) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/*
       * ÖZET: dört kutu, yalnız sözleşmede DURAN sayılar (`ozetSayilari`).
       * Harcama yoksa kütüphane uzun tire döndürüyor; panel metin dilinde
       * uzun tire yok, kısa çizgiye çevriliyor.
       */}
      <MetrikKutulari
        kutular={[
          { anahtar: 'uygulanabilir', ad: d.kutular.uygulanabilir, deger: ozet.uygulanabilir, ipucu: d.kutular.uygulanabilirIpucu },
          { anahtar: 'harcama', ad: d.kutular.harcama, deger: ozet.harcama.replace('—', '-'), ipucu: d.kutular.harcamaIpucu },
          { anahtar: 'bilgi', ad: d.kutular.bilgi, deger: ozet.yalnizBilgi, ipucu: d.kutular.bilgiIpucu },
          { anahtar: 'buay', ad: d.kutular.buAy, deger: ozet.buAyUygulanan, ipucu: d.kutular.buAyIpucu },
        ]}
      />

      {liste.hatalar.length > 0 && (
        <Serit ton="hata" baslik={d.kaynakHatasi}>
          {liste.hatalar.join(' · ')}
        </Serit>
      )}

      {gorunen.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Tür süzgeci aynı listenin GÖRÜNÜMÜ: bölümlü seçici (BILESENLER §3.5). */}
          <BolumluSecici
            etiket={d.turEtiketi}
            secili={etkinSecim}
            onSec={setSecili}
            secenekler={cipler.map((c) => ({
              deger: c.anahtar,
              etiket: (
                <>
                  {c.etiket}
                  <span className="ml-1.5 tabular-nums text-ink-muted">{c.sayi}</span>
                </>
              ),
            }))}
          />
          <span className="ml-auto text-12 text-ink-muted">{sayac}</span>
        </div>
      )}

      {gorunen.length === 0 ? (
        <BosDurum
          baslik={d.bosBaslik}
          neden={liste.hatalar.length > 0 ? d.bosHata : gizli > 0 ? d.bosYoksayilan(gizli) : d.bosGenel}
        />
      ) : (
        <div className="grid items-start gap-4 min-[1100px]:grid-cols-2">
          {suzulen.map((o) => (
            <OneriKarti
              key={o.anahtar}
              oneri={o}
              yazabilir={yazabilir}
              gidiyor={gidenler.has(o.anahtar)}
              hata={kartHatalari[o.anahtar] ?? null}
              yoksayiliyor={yoksayilanlar.has(o.anahtar)}
              etkiSatiri={o.durum === 'uygulandi' ? kartEtkiSatiri(etki, o.anahtar, dil) : null}
              onUygula={() => setOnayda(o)}
              onYoksay={() => void yoksay(o)}
            />
          ))}
        </div>
      )}

      <OnayPenceresi oneri={onayda} onKapat={kapat} onSonuc={uygulandi} />
    </>
  );
}
