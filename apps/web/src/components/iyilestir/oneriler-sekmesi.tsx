'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Oneri, OneriListesi, UygulamaSonucu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import {
  gorunenOneriler,
  oneriEylemAdresi,
  oneriGuncelle,
  ozetSayilari,
  turaGoreSuz,
  turCipleri,
  yoksayilanSayisi,
} from '@/lib/iyilestir';
import { OneriKarti } from './oneri-karti';
import { OnayPenceresi } from './onay-penceresi';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

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
export function OnerilerSekmesi({ sonuc, yazabilir }: { sonuc: OneriSonucu; yazabilir: boolean }) {
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
    return (
      <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
        <span className={s.bildirimIkon} aria-hidden>
          !
        </span>
        <span className={s.bildirimMetin}>
          <strong>Öneriler alınamadı.</strong> {sonuc.mesaj}
        </span>
      </div>
    );
  }

  const liste = sonuc.liste;
  const ozet = ozetSayilari({ oneriler, buAyUygulanan: liste.buAyUygulanan + buAyEk });
  const gorunen = gorunenOneriler(oneriler);
  const cipler = turCipleri(gorunen);
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
        [o.anahtar]: `Yoksayılamadı: ${e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.'}`,
      }));
    } finally {
      setYoksayilanlar((x) => {
        const y = new Set(x);
        y.delete(o.anahtar);
        return y;
      });
    }
  }

  return (
    <>
      <div className={s.kart}>
        <div className={i.ozet}>
          <div className={i.vurgu}>
            <small>Uygulanabilir öneri</small>
            <b className={s.num}>{ozet.uygulanabilir}</b>
            <em>tek tıkla, onaylı</em>
          </div>
          <div>
            <small>Etkilenen harcama</small>
            <b className={s.num}>{ozet.harcama}</b>
            <em>son 7 günde bu öğelere giden</em>
          </div>
          <div>
            <small>Yalnız bilgi</small>
            <b className={s.num}>{ozet.yalnizBilgi}</b>
            <em>platformda elle yapılmalı</em>
          </div>
          <div>
            <small>Bu ay uygulanan</small>
            <b className={s.num}>{ozet.buAyUygulanan}</b>
            <em>platformdan geri okunarak</em>
          </div>
        </div>
      </div>

      {liste.hatalar.length > 0 && (
        <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Bazı kaynaklar okunamadı; liste eksik olabilir.</strong>{' '}
            {liste.hatalar.join(' · ')}
          </span>
        </div>
      )}

      {gorunen.length > 0 && (
        <div className={i.cipler} role="group" aria-label="Öneri türü">
          {cipler.map((c) => (
            <button
              key={c.anahtar}
              type="button"
              className={i.cip}
              aria-pressed={etkinSecim === c.anahtar}
              onClick={() => setSecili(c.anahtar)}
            >
              {c.etiket} <span className={i.say}>{c.sayi}</span>
            </button>
          ))}
          {/* SESSİZ KESME YOK: sunucu hesap başına ilk N öneriyi döndürüyor. */}
          {(liste.toplam > liste.oneriler.length || gizli > 0) && (
            <span className={i.gizliNot}>
              {liste.toplam > liste.oneriler.length && `${liste.toplam} öneriden ${liste.oneriler.length} tanesi gösteriliyor`}
              {liste.toplam > liste.oneriler.length && gizli > 0 && ' · '}
              {gizli > 0 && `${gizli} yoksayılan öneri gizli`}
            </span>
          )}
        </div>
      )}

      {gorunen.length === 0 ? (
        <div className={s.kart}>
          <p className={s.bosMetin}>
            {liste.hatalar.length > 0
              ? 'Okunabilen hesaplarda öneri yok. Okunamayan kaynaklar yukarıda.'
              : gizli > 0
                ? `Açık öneri yok; ${gizli} öneri yoksayıldı.`
                : 'Şu an öneri yok. Reklamlar yoruldukça ve bütçeler dolup boşaldıkça burada belirir.'}
          </p>
        </div>
      ) : (
        <div className={i.oneriler}>
          {suzulen.map((o) => (
            <OneriKarti
              key={o.anahtar}
              oneri={o}
              yazabilir={yazabilir}
              gidiyor={gidenler.has(o.anahtar)}
              hata={kartHatalari[o.anahtar] ?? null}
              yoksayiliyor={yoksayilanlar.has(o.anahtar)}
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
