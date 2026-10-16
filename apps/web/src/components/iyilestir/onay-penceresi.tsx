'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Oneri, UygulamaSonucu } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { iyilestirSozlugu } from '@/dil/sozlukler/iyilestir';
import {
  adimHalleri,
  adimMetinleri,
  eylemMetni,
  oneriEylemAdresi,
  sonucMetni,
  uygulaHatasi,
  uygulamaSonucuCoz,
  type AdimHali,
  type UygulamaAsamasi,
} from '@/lib/iyilestir';
import { Dugme } from '@/components/ui/dugme';
import { Pencere } from '@/components/ui/pencere';
import { DurumNoktasi } from '@/components/ui/rozet';

/**
 * ═══ ONAY PENCERESİ — ÖNERİ KARTI VE ASİSTANIN UYGULA KARTI AYNI YOLDAN ═══
 *
 * İki kapı (Öneriler sekmesi, sohbetteki Uygula kartı) TEK uca gidiyor
 * (`POST /iyilestir/oneriler/:anahtar/uygula`, MIMARI §3) ve TEK pencereden
 * geçiyor: ikinci bir pencere yazılırsa biri "şimdi → sonra"yı, öbürü
 * adımları kaybeder ve kullanıcı aynı işi iki farklı onayla verir.
 *
 * DOM'DAN ÇIKMIYOR (CLAUDE.md tasarım kuralı): `Pencere` kapalıyken
 * `invisible` + `inert`, açılırken geçişle görünüyor; Esc, perde ve odak
 * tuzağı bileşende. Koşullu render, kapanış geçişini keser ve pencere bir
 * karede kaybolur. Onay düğmesi KOYU, kırmızı dolu değil: sayfanın tek
 * birincil eylemi başlıktaki "Yeni kural".
 *
 * İSTEK `ozet` TAŞIYOR: sunucu öneriyi yeniden hesaplayıp özet eşleşmezse
 * 409 dönüyor. Bu hâlde aynı düğmeye tekrar basmak yine 409 alır; pencere
 * tek eylem olarak "Yenile" gösteriyor.
 */
export function OnayPenceresi({
  oneri,
  onKapat,
  onSonuc,
}: {
  /** `null` = kapalı. Kapalıyken son öneri içerikte kalıyor (kapanış geçişi boş kutu göstermesin). */
  oneri: Oneri | null;
  onKapat: () => void;
  onSonuc: (anahtar: string, sonuc: UygulamaSonucu) => void;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const t = useSozluk(iyilestirSozlugu);
  const [gosterilen, setGosterilen] = useState<Oneri | null>(oneri);
  const [asama, setAsama] = useState<UygulamaAsamasi>('hazir');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<UygulamaSonucu | null>(null);
  /*
   * KİMLİKLE ODAK, ref DEĞİL: `Dugme` ref almıyor (ortak bileşen, bu işin
   * dışında). `Pencere` açılınca odağı ilk öğeye (✕) veriyor; klavye
   * kullanıcısı eskisi gibi onay düğmesinde başlasın diye bir kare sonra
   * buraya taşınıyor.
   */
  const onaylaId = useId();
  const acik = oneri !== null;

  useEffect(() => {
    if (oneri) {
      setGosterilen(oneri);
      setAsama('hazir');
      setMesaj(null);
      setSonuc(null);
      // Klavye kullanıcısı pencerenin içinde başlasın.
      requestAnimationFrame(() => document.getElementById(onaylaId)?.focus());
    }
  }, [oneri, onaylaId]);

  const suruyor = asama === 'gonderiliyor';

  const o = gosterilen;
  const metin = o ? eylemMetni(o, dil) : null;
  const adimlar = o ? adimMetinleri(o.platform, dil) : null;
  const haller = adimHalleri(asama);

  async function onayla() {
    if (!o) return;
    setAsama('gonderiliyor');
    setMesaj(null);
    try {
      const yanit = await apiFetch<unknown>(oneriEylemAdresi(o, 'uygula'), {
        method: 'POST',
        body: JSON.stringify({ ozet: o.ozet }),
      });
      const r = uygulamaSonucuCoz(yanit);
      if (!r) {
        /*
         * İstek başarılı ama sonuç okunamadı: platformda değişiklik OLMUŞ
         * olabilir. "Uygulanamadı" demek yanlış, "doğrulandı" demek yalan;
         * doğrusu kayıtlı hâle bakmak (sayfayı yenilemek).
         */
        setAsama('degisti');
        setMesaj(t.hata.sonucOkunamadi);
        return;
      }
      setSonuc(r);
      setAsama(r.durum);
      onSonuc(o.anahtar, r);
      /*
       * DOĞRULANDIYSA taslaktaki gibi kendiliğinden kapanıyor ve kart
       * "Uygulandı · Meta'da doğrulandı" oluyor. UYUŞMADIYSA AÇIK KALIYOR:
       * platformun bildirdiği değer kullanıcının görmesi gereken bir bilgi
       * ve kendiliğinden kapanan pencere onu bir saniyede yutardı.
       */
      if (r.durum === 'dogrulandi') setTimeout(onKapat, 900);
    } catch (e) {
      const h = uygulaHatasi(e instanceof ApiRequestError ? e : null, dil);
      setAsama(h.asama);
      setMesaj(h.mesaj);
    }
  }

  /*
   * İSTEK SÜRERKEN KAPANMIYOR: `Pencere` Esc'te ve perde tıklamasında
   * `onKapat` çağırıyor; sonucu görmeden pencereyi kapatan kullanıcı
   * değişikliğin olup olmadığını bilemez. Kapı burada, tek yerde.
   */
  const kapatGuvenli = () => {
    if (!suruyor) onKapat();
  };

  return (
    <Pencere
      acik={acik}
      onKapat={kapatGuvenli}
      baslik={metin?.baslik ?? t.onay.baslik}
      aciklama={metin?.aciklama ?? ''}
      altEylemler={
        asama === 'degisti' ? (
          <Dugme
            ton="koyu"
            onClick={() => {
              onKapat();
              router.refresh();
            }}
          >
            {t.onay.yenile}
          </Dugme>
        ) : sonuc ? (
          <Dugme ton="ikincil" onClick={onKapat}>
            {t.onay.kapat}
          </Dugme>
        ) : (
          <>
            <Dugme ton="ikincil" onClick={onKapat} disabled={suruyor}>
              {t.onay.vazgec}
            </Dugme>
            <Dugme id={onaylaId} ton="koyu" onClick={onayla} disabled={!metin} bekliyor={suruyor}>
              {asama === 'hata' ? t.onay.tekrarDene : t.onay.onaylaUygula}
            </Dugme>
          </>
        )
      }
    >
      <div className="grid gap-4">
        <DegisimKutusu once={metin?.once ?? null} sonra={metin?.sonra ?? null} />
        <AdimListesi adimlar={adimlar ?? ['', '', '']} haller={haller} />

        {sonuc && o && (
          <SonucKutusu ton={sonuc.durum === 'dogrulandi' ? 'ok' : 'uyari'}>
            {sonucMetni(sonuc, o.platform, metin?.sonra ?? null, t.azOnce, dil).metin}
          </SonucKutusu>
        )}
        {mesaj && (
          <SonucKutusu ton="hata">
            {asama === 'degisti' ? <strong>{t.onay.oneriDegisti}</strong> : <strong>{t.onay.uygulanamadi}</strong>}
            {mesaj}
          </SonucKutusu>
        )}
      </div>
    </Pencere>
  );
}

/*
 * ═══ ONAY GÖVDESİNİN PARÇALARI (Grup 3 sapması: yerel yardımcı) ═══
 *
 * Öneri onayı ve sinyal durdurma onayı AYNI görünüşte olmak zorunda
 * (`sinyal-pencereleri.tsx` başı: "kampanyayı durdurmak altındaki setleri de
 * durdurur" cümlesi iki ekranda ayrışmasın). `components/ui`da "şimdi → sonra"
 * kutusu ve adım listesi yok; iki pencere bunları buradan alıyor, ikinci bir
 * kopya doğduğu anda ayrışırdı.
 */

/** "Şimdi → Sonra" kutusu. Değer yoksa uzun tire DEĞİL kısa çizgi (panel metin dili). */
export function DegisimKutusu({ once, sonra }: { once: string | null; sonra: string | null }) {
  const d = useSozluk(iyilestirSozlugu).onay;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-alan border border-line p-3">
      <div className="min-w-0">
        <small className="block text-12 text-ink-muted">{d.simdi}</small>
        <b className="font-baslik text-15 tabular-nums text-ink">{once ?? '-'}</b>
      </div>
      <span aria-hidden className="text-18 text-ink-muted">
        →
      </span>
      <div className="min-w-0">
        <small className="block text-12 text-ink-muted">{d.sonra}</small>
        <b className="font-baslik text-15 tabular-nums text-ink">{sonra ?? '-'}</b>
      </div>
    </div>
  );
}

const ADIM_NOKTASI: Record<AdimHali, string> = {
  bos: 'border-line',
  // Dönen halka: yalnız hareket serbestse döner (`motion-safe:`), değilse
  // kırmızı halka olarak durur; adım yine "sürüyor" okunur.
  suruyor: 'border-brand border-t-transparent motion-safe:animate-spin',
  // YEŞİL YALNIZ DURUM NOKTASI (kılavuz): doğrulanan adımın noktası.
  bitti: 'border-ok bg-ok',
  uyari: 'border-danger bg-danger',
  hata: 'border-danger bg-danger',
};

const ADIM_METNI: Record<AdimHali, string> = {
  bos: 'text-ink-muted',
  suruyor: 'text-ink',
  bitti: 'text-ink',
  uyari: 'text-danger-strong',
  hata: 'text-danger-strong',
};

/**
 * Üç adım GERÇEĞİ gösteriyor (`adimHalleri`); `data-hal` ekran okuyucu ve
 * test için duruyor, görünüş sınıftan.
 */
export function AdimListesi({ adimlar, haller }: { adimlar: readonly string[]; haller: readonly AdimHali[] }) {
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0 text-[12.5px]" aria-live="polite">
      {adimlar.map((a, n) => {
        const h = haller[n] ?? 'bos';
        return (
          <li key={n} data-hal={h} className={`flex items-center gap-2 transition-colors motion-reduce:transition-none ${ADIM_METNI[h]}`}>
            <i aria-hidden className={`h-4 w-4 shrink-0 rounded-full border-2 ${ADIM_NOKTASI[h]}`} />
            {a}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sonuç kutusu: zemin boyanmıyor, renk SOL ÇİZGİDE (kılavuz şeridi). Doğrulanan
 * sonuçta yeşil yalnız noktada; uyuşmayan ve hata kırmızı çizgi. Rol tondan:
 * hata hemen duyurulur (`alert`), diğerleri sırası gelince (`status`).
 */
export function SonucKutusu({ ton, children }: { ton: 'ok' | 'uyari' | 'hata'; children: ReactNode }) {
  return (
    <div
      role={ton === 'hata' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-[12px] border border-l-4 border-line bg-surface px-3 py-2.5 text-[12.5px] leading-normal ${
        ton === 'ok' ? 'border-l-ink-soluk font-semibold text-ink' : 'border-l-danger text-ink'
      }`}
    >
      {ton === 'ok' && (
        <span className="mt-1.5">
          <DurumNoktasi hal="ok" />
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
