'use client';

import { useEffect, useRef, useState } from 'react';
import type { Sinyal, SinyalUygulamaSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { adimHalleri, adimMetinleri, uygulaHatasi, type UygulamaAsamasi } from '@/lib/iyilestir';
import { sinyalEylemYolu, sinyalUygulamaCoz } from '@/lib/sinyal';
import { varlikEylemMetni } from '@/lib/varlik-eylemi';
import i from '@/components/taslak/iyilestir.module.css';

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
 * DOM'DAN ÇIKMIYOR: kapalıyken `visibility: hidden` (tasarım kuralı).
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
  const [gosterilen, setGosterilen] = useState<Sinyal | null>(sinyal);
  const [asama, setAsama] = useState<UygulamaAsamasi>('hazir');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<SinyalUygulamaSonucu | null>(null);
  const onaylaRef = useRef<HTMLButtonElement>(null);
  const acik = sinyal !== null;
  const suruyor = asama === 'gonderiliyor';

  useEffect(() => {
    if (!sinyal) return;
    setGosterilen(sinyal);
    setAsama('hazir');
    setMesaj(null);
    setSonuc(null);
    requestAnimationFrame(() => onaylaRef.current?.focus());
  }, [sinyal]);

  useEffect(() => {
    if (!acik) return;
    // İstek sürerken Esc kapatmıyor: sonucu görmeden kapatan kullanıcı
    // kampanyanın durup durmadığını bilemez.
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && !suruyor && onKapat();
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, suruyor, onKapat]);

  const s = gosterilen;
  const hedef =
    s && s.eylem?.tur === 'durdur'
      ? { seviye: s.eylem.seviye, id: s.eylem.varlikId, ad: s.varlik.ad, platform: s.platform, yayinda: true }
      : null;
  const metin = hedef ? varlikEylemMetni(hedef) : null;
  const adimlar = s ? adimMetinleri(s.platform) : ['', '', ''];
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
        setMesaj('Sunucu yanıt verdi ama geri okuma sonucu okunamadı. Listeyi yenileyip sinyalin durumuna bakın.');
        return;
      }
      setSonuc(r);
      setAsama(r.dogrulama);
      onSonuc(r);
      // Uyuşmadıysa AÇIK KALIYOR: platformun söylediği değer okunmalı.
      if (r.dogrulama === 'dogrulandi') setTimeout(onKapat, 900);
    } catch (e) {
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null);
      setAsama(h.asama);
      setMesaj(h.mesaj);
    }
  }

  const platform = s ? PLATFORM_KISA_ADLARI[s.platform] : '';
  return (
    <div className={`${i.perde} ${acik ? i.perdeAcik : ''}`} aria-hidden={!acik} onClick={(e) => e.target === e.currentTarget && !suruyor && onKapat()}>
      <div className={i.pencere} role="dialog" aria-modal="true" aria-labelledby="sinyal-durdur-baslik">
        <h3 id="sinyal-durdur-baslik">{metin?.baslik ?? 'Onay'}</h3>
        <p>
          {s ? `${s.varlik.ad} · ${s.clientAdi} · ${platform}. ` : ''}
          {metin?.aciklama ?? ''}
        </p>
        <div className={i.degisim}>
          <div>
            <small>Şimdi</small>
            <b>{metin?.once ?? '—'}</b>
          </div>
          <span className={i.ok}>→</span>
          <div>
            <small>Sonra</small>
            <b>{metin?.sonra ?? '—'}</b>
          </div>
        </div>
        <ul className={i.adimlar} aria-live="polite">
          {[adimlar[0], adimlar[1], 'Kaydet ve sinyali kapat'].map((a, n) => (
            <li key={n} data-hal={haller[n]}>
              <i />
              {a}
            </li>
          ))}
        </ul>
        {sonuc && (
          <div className={`${i.sonuc} ${sonuc.dogrulama === 'dogrulandi' ? i.sonucOk : i.sonucUyari}`} role="status">
            {sonuc.dogrulama === 'dogrulandi'
              ? `Durduruldu · ${platform} tarafında doğrulandı: ${sonuc.platformDegeri}. Sinyal kapatıldı.`
              : `${platform} isteği kabul etti ama okunan durum farklı: ${sonuc.platformDegeri}.`}
          </div>
        )}
        {mesaj && (
          <div className={`${i.sonuc} ${i.sonucHata}`} role="alert">
            {asama === 'degisti' ? <strong>Sinyal değişti, yenile. </strong> : <strong>Durdurulamadı. </strong>}
            {mesaj}
          </div>
        )}
        <div className={i.pencereAlt}>
          {asama === 'degisti' ? (
            <button
              type="button"
              className={i.birincil}
              onClick={() => {
                onKapat();
                onYenile();
              }}
            >
              Yenile
            </button>
          ) : sonuc ? (
            <button type="button" className={i.ikincil} onClick={onKapat}>
              Kapat
            </button>
          ) : (
            <>
              <button type="button" className={i.ikincil} onClick={onKapat} disabled={suruyor}>
                Vazgeç
              </button>
              <button ref={onaylaRef} type="button" className={i.birincil} onClick={() => void onayla()} disabled={suruyor || !metin}>
                {asama === 'hata' ? 'Tekrar dene' : 'Durdur'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
  const [not, setNot] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<{ mesaj: string; degisti: boolean } | null>(null);
  const alanRef = useRef<HTMLTextAreaElement>(null);
  const acik = sinyal !== null;

  useEffect(() => {
    if (!sinyal) return;
    setNot('');
    setHata(null);
    setGonderiliyor(false);
    requestAnimationFrame(() => alanRef.current?.focus());
  }, [sinyal]);

  useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && !gonderiliyor && onKapat();
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [acik, gonderiliyor, onKapat]);

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
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null);
      setHata({ mesaj: h.mesaj, degisti: h.asama === 'degisti' });
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className={`${i.perde} ${acik ? i.perdeAcik : ''}`} aria-hidden={!acik} onClick={(e) => e.target === e.currentTarget && !gonderiliyor && onKapat()}>
      <div className={i.pencere} role="dialog" aria-modal="true" aria-labelledby="sinyal-kapat-baslik">
        <h3 id="sinyal-kapat-baslik">Sinyali kapat</h3>
        <p>Bu olay sürdükçe tekrar açılmaz. Daha kötüye giderse yeniden açılır ve haber verilir.</p>
        <label className="sr-only" htmlFor="sinyal-kapat-not">
          Not
        </label>
        <textarea
          id="sinyal-kapat-not"
          ref={alanRef}
          className={i.notAlani}
          value={not}
          maxLength={300}
          onChange={(e) => setNot(e.target.value)}
          placeholder="Not (isteğe bağlı): ör. kampanya bilerek yavaşlatıldı"
        />
        {hata && (
          <div className={`${i.sonuc} ${i.sonucHata}`} role="alert">
            {hata.degisti ? <strong>Sinyal değişti, yenile. </strong> : <strong>Kapatılamadı. </strong>}
            {hata.mesaj}
          </div>
        )}
        <div className={i.pencereAlt}>
          {hata?.degisti ? (
            <button
              type="button"
              className={i.birincil}
              onClick={() => {
                onKapat();
                onYenile();
              }}
            >
              Yenile
            </button>
          ) : (
            <>
              <button type="button" className={i.ikincil} onClick={onKapat} disabled={gonderiliyor}>
                Vazgeç
              </button>
              <button type="button" className={i.birincil} onClick={() => void kapat()} disabled={gonderiliyor}>
                {gonderiliyor ? 'Kapatılıyor…' : 'Kapat'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
