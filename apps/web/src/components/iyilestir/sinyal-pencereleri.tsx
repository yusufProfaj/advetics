'use client';

import { useEffect, useId, useState } from 'react';
import type { Sinyal, SinyalUygulamaSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { sinyalSozlugu } from '@/dil/sozlukler/iyilestir-sinyal';
import { adimHalleri, adimMetinleri, uygulaHatasi, type UygulamaAsamasi } from '@/lib/iyilestir';
import { sinyalEylemYolu, sinyalUygulamaCoz } from '@/lib/sinyal';
import { varlikEylemMetni } from '@/lib/varlik-eylemi';
import { Dugme } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';
import { Alan, MetinAlani } from '@/components/ui/alan';
import { AdimListesi, DegisimKutusu, SonucKutusu } from './onay-penceresi';

/**
 * ═══ SİNYAL › DURDUR ONAYI ═══
 *
 * İKİNCİ BİR YAZMA YOLU DEĞİL: istek `POST /sinyaller/:id/uygula`ya gidiyor
 * ve sunucu Reklam Yöneticisi satır içi durdurun AYNI servisini
 * (`CampaignActionsService`, geri okumalı) çağırıyor (MIMARI § 3). Pencere
 * de aynı görünüşte ve aynı metinle (`varlikEylemMetni`): "kampanyayı
 * durdurmak altındaki setleri de durdurur" cümlesi iki ekranda ayrışmasın.
 *
 * İSTEK `ozet` TAŞIYOR: sunucu satırı yeniden okuyor; sinyal bu arada
 * kapandıysa ya da değiştiyse 409 döner ve pencere tek eylem olarak
 * "Yenile" gösterir. Ekran açıkken kapanmış bir sinyalin kampanyasını
 * durdurmak istenmeyen bir eylem.
 *
 * ADIMLAR GERÇEĞİ GÖSTERİYOR (`adimHalleri`): sunucu üç adımı tek istekte
 * yapıyor; istek sürerken yalnız ilk adım dönüyor. Taslaktaki 650 ms'lik
 * zamanlayıcı, henüz geri okunmamış bir değeri "okundu" gösterirdi.
 *
 * DOM'DAN ÇIKMIYOR: `Pencere` kapalıyken `invisible` + `inert` (tasarım
 * kuralı); Esc, perde ve odak tuzağı bileşende. Gövde parçaları öneri
 * onayıyla ORTAK (`onay-penceresi.tsx`), iki pencere aynı görünüşte kalsın.
 */
export function SinyalDurdurPenceresi({
  sinyal,
  onKapat,
  onSonuc,
  onYenile,
}: {
  sinyal: Sinyal | null;
  onKapat: () => void;
  onSonuc: (sonuc: SinyalUygulamaSonucu) => void;
  onYenile: () => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(sinyalSozlugu).pencere;
  const [gosterilen, setGosterilen] = useState<Sinyal | null>(sinyal);
  const [asama, setAsama] = useState<UygulamaAsamasi>('hazir');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<SinyalUygulamaSonucu | null>(null);
  // Kimlikle odak: `Dugme` ref almıyor (bkz. `onay-penceresi.tsx`).
  const onaylaId = useId();
  const acik = sinyal !== null;
  const suruyor = asama === 'gonderiliyor';

  useEffect(() => {
    if (!sinyal) return;
    setGosterilen(sinyal);
    setAsama('hazir');
    setMesaj(null);
    setSonuc(null);
    requestAnimationFrame(() => document.getElementById(onaylaId)?.focus());
  }, [sinyal, onaylaId]);

  const s = gosterilen;
  const hedef =
    s && s.eylem?.tur === 'durdur'
      ? { seviye: s.eylem.seviye, id: s.eylem.varlikId, ad: s.varlik.ad, platform: s.platform, yayinda: true }
      : null;
  const metin = hedef ? varlikEylemMetni(hedef, dil) : null;
  const adimlar = s ? adimMetinleri(s.platform, dil) : ['', '', ''];
  const haller = adimHalleri(asama);

  async function onayla() {
    if (!s) return;
    setAsama('gonderiliyor');
    setMesaj(null);
    try {
      const yanit = await apiFetch<unknown>(sinyalEylemYolu(s.id, 'uygula'), {
        method: 'POST',
        body: JSON.stringify({ ozet: s.ozet }),
      });
      const r = sinyalUygulamaCoz(yanit);
      if (!r) {
        // İstek başarılı ama sonuç okunamadı: platformda değişiklik OLMUŞ
        // olabilir. "Durdurulamadı" yanlış, "doğrulandı" yalan.
        setAsama('degisti');
        setMesaj(d.sonucOkunamadi);
        return;
      }
      setSonuc(r);
      setAsama(r.dogrulama);
      onSonuc(r);
      // Uyuşmadıysa AÇIK KALIYOR: platformun söylediği değer okunmalı.
      if (r.dogrulama === 'dogrulandi') setTimeout(onKapat, 900);
    } catch (e) {
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null, dil);
      setAsama(h.asama);
      setMesaj(h.mesaj);
    }
  }

  const platform = s ? PLATFORM_KISA_ADLARI[s.platform] : '';
  /*
   * İstek sürerken Esc ve perde kapatmıyor: sonucu görmeden kapatan
   * kullanıcı kampanyanın durup durmadığını bilemez. `Pencere` ikisinde de
   * `onKapat` çağırıyor; kapı burada.
   */
  const kapatGuvenli = () => {
    if (!suruyor) onKapat();
  };
  return (
    <Pencere
      acik={acik}
      onKapat={kapatGuvenli}
      baslik={metin?.baslik ?? d.onay}
      aciklama={
        <>
          {s ? `${s.varlik.ad} · ${s.clientAdi} · ${platform}. ` : ''}
          {metin?.aciklama ?? ''}
        </>
      }
      altEylemler={
        asama === 'degisti' ? (
          <Dugme
            ton="koyu"
            onClick={() => {
              onKapat();
              onYenile();
            }}
          >
            {d.yenile}
          </Dugme>
        ) : sonuc ? (
          <Dugme ton="ikincil" onClick={onKapat}>
            {d.kapat}
          </Dugme>
        ) : (
          <>
            <Dugme ton="ikincil" onClick={onKapat} disabled={suruyor}>
              {d.vazgec}
            </Dugme>
            <Dugme id={onaylaId} ton="koyu" onClick={() => void onayla()} disabled={!metin} bekliyor={suruyor}>
              {asama === 'hata' ? d.tekrarDene : d.durdur}
            </Dugme>
          </>
        )
      }
    >
      <div className="grid gap-4">
        <DegisimKutusu once={metin?.once ?? null} sonra={metin?.sonra ?? null} />
        <AdimListesi adimlar={[adimlar[0], adimlar[1], d.kaydetKapat]} haller={haller} />
        {sonuc && (
          <SonucKutusu ton={sonuc.dogrulama === 'dogrulandi' ? 'ok' : 'uyari'}>
            {sonuc.dogrulama === 'dogrulandi'
              ? d.durduruldu(platform, sonuc.platformDegeri)
              : d.uyusmadi(platform, sonuc.platformDegeri)}
          </SonucKutusu>
        )}
        {mesaj && (
          <SonucKutusu ton="hata">
            {asama === 'degisti' ? <strong>{d.sinyalDegisti}</strong> : <strong>{d.durdurulamadi}</strong>}
            {mesaj}
          </SonucKutusu>
        )}
      </div>
    </Pencere>
  );
}

/**
 * ═══ SİNYAL › KAPAT ═══
 *
 * Not isteğe bağlı ama alan GÖRÜNÜR: sessiz koşumda yanlış alarm ölçümü
 * kapatma notuyla yapılıyor (MIMARI § 10) ve not alanı gizli bir "ayrıntı"
 * olsaydı hiç doldurulmazdı. Cümle durum makinesini anlatıyor: kapatılan
 * sinyal bu olay sürdükçe açılmaz, kötüleşirse döner.
 */
export function SinyalKapatPenceresi({
  sinyal,
  onKapat,
  onKapandi,
  onYenile,
}: {
  sinyal: Sinyal | null;
  onKapat: () => void;
  onKapandi: (id: string) => void;
  onYenile: () => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(sinyalSozlugu).pencere;
  const [not, setNot] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<{ mesaj: string; degisti: boolean } | null>(null);
  // Kimlikle odak: not alanı `MetinAlani` (ortak bileşen) ref'i iletse de
  // açılış odağını `Pencere` ✕'e veriyor; bir kare sonra alana taşınıyor.
  const alanId = useId();
  const acik = sinyal !== null;

  useEffect(() => {
    if (!sinyal) return;
    setNot('');
    setHata(null);
    setGonderiliyor(false);
    requestAnimationFrame(() => document.getElementById(alanId)?.focus());
  }, [sinyal, alanId]);

  async function kapat() {
    if (!sinyal) return;
    setGonderiliyor(true);
    setHata(null);
    try {
      const temiz = not.trim();
      await apiFetch<unknown>(sinyalEylemYolu(sinyal.id, 'kapat'), {
        method: 'POST',
        body: JSON.stringify(temiz ? { not: temiz } : {}),
      });
      onKapandi(sinyal.id);
      onKapat();
    } catch (e) {
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null, dil);
      setHata({ mesaj: h.mesaj, degisti: h.asama === 'degisti' });
    } finally {
      setGonderiliyor(false);
    }
  }

  // İstek sürerken Esc ve perde kapatmıyor (yukarıdaki pencereyle aynı kural).
  const kapatGuvenli = () => {
    if (!gonderiliyor) onKapat();
  };

  return (
    <Pencere
      acik={acik}
      onKapat={kapatGuvenli}
      genislik="dar"
      baslik={d.kapatBaslik}
      aciklama={d.kapatAciklama}
      altEylemler={
        hata?.degisti ? (
          <Dugme
            ton="koyu"
            onClick={() => {
              onKapat();
              onYenile();
            }}
          >
            {d.yenile}
          </Dugme>
        ) : (
          <>
            <Dugme ton="ikincil" onClick={onKapat} disabled={gonderiliyor}>
              {d.vazgec}
            </Dugme>
            <Dugme ton="koyu" onClick={() => void kapat()} bekliyor={gonderiliyor}>
              {gonderiliyor ? d.kapatiliyor : d.kapat}
            </Dugme>
          </>
        )
      }
    >
      <div className="grid gap-4">
        <Alan etiket={d.notEtiketi} id={alanId}>
          {(id, aciklamaId) => (
            <MetinAlani
              id={id}
              aria-describedby={aciklamaId}
              value={not}
              maxLength={300}
              onChange={(e) => setNot(e.target.value)}
              placeholder={d.notYeri}
            />
          )}
        </Alan>
        {hata && (
          <SonucKutusu ton="hata">
            {hata.degisti ? <strong>{d.sinyalDegisti}</strong> : <strong>{d.kapatilamadi}</strong>}
            {hata.mesaj}
          </SonucKutusu>
        )}
      </div>
    </Pencere>
  );
}
