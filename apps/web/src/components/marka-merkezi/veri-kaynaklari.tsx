'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  KAYNAK_TANIMI,
  sec,
  type Dil,
  type KaynakSecenekleriYaniti,
  type KaynakTuru,
  type VeriKaynagiOzeti,
  type VeriKaynaklariYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDayLong } from '@/lib/format';
import { useDil } from '@/dil/saglayici';
import { markaMerkeziVeriSozlugu } from '@/dil/sozlukler/marka-merkezi-veri';
import { kaynakDurumMetni } from '@/lib/veri-kaynagi';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { HataDurumu, Yukleniyor } from '@/components/ui/hal';
import { DurumNoktasi } from '@/components/ui/rozet';
import { Pencere } from '@/components/ui/pencere';

/**
 * ═══ MARKA MERKEZİ › KURULUM › DİĞER VERİ KAYNAKLARI (Paket F1) ═══
 *
 * GA4 BURADA BAĞLANMIYOR (docs/panel-sadelestirme/MIMARI.md Ç-8): Analytics'in
 * TEK kaydı Kurulum'un `ga4_mulk` adımı (mülk seçilince `kurulumdanBagla`
 * veri kaynağını da bağlıyor). İkinci bir bağlama formu aynı mülk için
 * ikinci bir doğru üretirdi. GA4 kartı `haric` ile bu listeden çıkıyor ve
 * durumu Dönüşüm ölçümü adımında salt okunur (`Ga4KaynakDurumu`).
 *
 * docs/veri-kaynagi/MIMARI.md § 3.4 ve taslak.html ekran 1. AYRI BÖLÜM
 * DEĞİL, Bağlantılar'ın içinde kart grubu (dağınık yapı "nereye nereden
 * girdiğimi unutuyorum" şikâyetinin sebebiydi). Yapılmamış dalganın kartı
 * gri ve "Yakında" DEĞİL, NEDENİ yazar (sunucunun `engel` cümlesi).
 *
 * DÖRT HÂL AYRI: okunuyor, çağrı düştü (platformun/sunucunun cümlesi),
 * boş + neden, dolu. `.catch(() => setX([]))` yok.
 */
type Hal = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: VeriKaynaklariYaniti };
type Secim = { tur: 'kapali' } | { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: KaynakSecenekleriYaniti };

const KISALTMA: Record<KaynakTuru, string> = {
  ga4: 'GA',
  search_console: 'SC',
  merchant_center: 'MC',
  meta_katalog: 'MK',
  ikas: 'E',
  ticimax: 'E',
  shopify: 'E',
};

const hataMetni = (e: unknown, dil: Dil) => (e instanceof ApiRequestError ? e.message : sec(markaMerkeziVeriSozlugu, dil).sunucuUlasilamadi);
// Dönüş Kurulum'a (eski Bağlantılar bölümü kalktı). ÇAPASIZ: OAuth dönüş denetimi `#` kabul etmiyor.
const izinDonusu = (clientId: string) => markaMerkeziAdresi('kurulum', clientId);

export function VeriKaynaklari({
  clientId,
  yonetebilir,
  yazabilir,
  haric = [],
}: {
  clientId: string;
  /** Bu listede GÖSTERİLMEYEN türler (GA4: evi Dönüşüm ölçümü adımı). */
  haric?: readonly KaynakTuru[];
  /** `connection.manage`: bağla / kaldır. */
  yonetebilir: boolean;
  /** `connection.write`: yenile / duraklat / mülk listesi. */
  yazabilir: boolean;
}) {
  const { dil } = useDil();
  const d = sec(markaMerkeziVeriSozlugu, dil).veriKaynaklari;
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<VeriKaynaklariYaniti>(`/veri-kaynaklari?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e, dil) });
    }
  }, [clientId, dil]);

  useEffect(() => {
    void oku();
  }, [oku]);

  return (
    <Kart baslik={d.baslik} baslikEki={d.baslikEki} dolgu={false}>
      {hal.tur === 'okunuyor' && (
        <div className="p-5">
          <Yukleniyor satir={2} etiket={d.okunuyor} />
        </div>
      )}
      {hal.tur === 'hata' && (
        <div className="p-5">
          <HataDurumu baslik={d.alinamadi} mesaj={hal.mesaj} onTekrar={() => void oku()} />
        </div>
      )}
      {hal.tur === 'geldi' && (
        <>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {hal.veri.kaynaklar.filter((k) => !haric.includes(k.tur)).map((k) => (
              <BagliKart key={k.id} k={k} clientId={clientId} yonetebilir={yonetebilir} yazabilir={yazabilir} yenile={oku} />
            ))}
            {hal.veri.baglanabilir.filter((b) => !haric.includes(b.tur)).map((b) => (
              <BaglanabilirKart key={b.tur} tur={b.tur} engel={b.engel} izinBaglantiId={b.izinBaglantiId ?? null} clientId={clientId} yonetebilir={yonetebilir} yazabilir={yazabilir} yenile={oku} />
            ))}
          </div>
          <ul className="m-0 grid list-none gap-1 border-t border-line px-5 py-3 text-12 text-ink-muted">
            <li>{d.mulkNotu}</li>
            {haric.includes('ga4') && <li>{d.ga4Notu}</li>}
          </ul>
        </>
      )}
    </Kart>
  );
}

function KartBasi({ tur, alt }: { tur: KaynakTuru; alt: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-alan bg-ink font-baslik text-12 font-bold text-surface">
        {KISALTMA[tur]}
      </span>
      <div className="min-w-0">
        <p className="m-0 text-13 font-bold text-ink">{KAYNAK_TANIMI[tur].ad}</p>
        <p className="m-0 truncate text-12 text-ink-muted">{alt}</p>
      </div>
    </div>
  );
}

function Durum({ metin, ton }: { metin: string; ton: 'yesil' | 'kirmizi' | 'gri' }) {
  // ORTAK DURUM NOKTASI: yeşil yalnız burada (kılavuz), kırmızı = hata.
  return (
    <span className="inline-flex items-center gap-1.5 text-12 font-semibold text-ink">
      <DurumNoktasi hal={ton === 'yesil' ? 'ok' : ton === 'kirmizi' ? 'hata' : 'taslak'} />
      {metin}
    </span>
  );
}

async function izinVer(baglantiId: string, clientId: string, dil: Dil, hata: (m: string) => void) {
  try {
    const r = await apiFetch<{ authorizeUrl: string }>(
      `/connections/${baglantiId}/reauthorize?platform=google&kapsam=olcum&donus=${encodeURIComponent(izinDonusu(clientId))}`,
      { method: 'POST' },
    );
    window.location.href = r.authorizeUrl;
  } catch (e) {
    hata(hataMetni(e, dil));
  }
}

function BagliKart({
  k,
  clientId,
  yonetebilir,
  yazabilir,
  yenile,
}: {
  k: VeriKaynagiOzeti;
  clientId: string;
  yonetebilir: boolean;
  yazabilir: boolean;
  yenile: () => Promise<void>;
}) {
  const { dil } = useDil();
  const t = sec(markaMerkeziVeriSozlugu, dil).veriKaynaklari;
  const [islem, setIslem] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  // KALDIRMA ONAYI ORTAK PENCEREDE: `window.confirm` tarayıcının kendi
  // kutusuydu (marka dışı, temasız, bazı gömülü görünümlerde hiç açılmıyor).
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const d = kaynakDurumMetni(k, dil);

  async function yap(ad: string, yol: string, method: 'POST' | 'DELETE', sonra?: string) {
    setIslem(ad);
    setHata(null);
    setBilgi(null);
    try {
      await apiFetch(yol, { method });
      if (sonra) setBilgi(sonra);
      await yenile();
    } catch (e) {
      setHata(hataMetni(e, dil));
    } finally {
      setIslem(null);
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-alan border border-line bg-surface p-4">
      <KartBasi tur={k.tur} alt={t.mulk(k.disKimlik, k.ad)} />
      <Durum {...d} />
      <ul className="space-y-1 text-12 text-ink-muted">
        <li>
          {t.sonCekim} <b className="text-ink">{k.sonBasariliCekim ? formatDayLong(k.sonBasariliCekim.slice(0, 10), dil) : t.henuzYok}</b>
          {k.sonBasariliCekim ? t.geceYenilenir : ''}
        </li>
        <li>
          {t.anahtarEtkinlik}{' '}
          <b className="text-ink">
            {k.anahtarEtkinlikler === null ? t.okunmadi : k.anahtarEtkinlikler.length === 0 ? t.tanimliDegil : k.anahtarEtkinlikler.join(', ')}
          </b>
        </li>
        {(k.saatDilimi || k.paraBirimi) && (
          <li>
            {t.saatDilimi} <b className="text-ink">{k.saatDilimi ?? t.bilinmiyor}</b> · {t.paraBirimi} <b className="text-ink">{k.paraBirimi ?? t.bilinmiyor}</b>
          </li>
        )}
      </ul>
      {k.sonHata && <p className="rounded-alan bg-brand/5 px-3 py-2 text-12 text-ink">{t.googleCevabi(k.sonHata)}</p>}
      {k.kurulumUyusmazligi && (
        <p className="rounded-alan bg-ink/5 px-3 py-2 text-12 text-ink">
          {t.uyusmazlik(k.kurulumUyusmazligi.kurulumMulkId, k.disKimlik)}
        </p>
      )}
      {hata && (
        <p role="alert" className="text-12 font-semibold text-brand-strong">
          {hata}
        </p>
      )}
      {bilgi && <p className="text-12 text-ink-muted">{bilgi}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {k.izinBaglantiId && yonetebilir && yazabilir && (
          <Dugme ton="koyu" boyut="kucuk" bekliyor={islem === 'izin'} onClick={() => (setIslem('izin'), void izinVer(k.izinBaglantiId!, clientId, dil, (m) => (setHata(m), setIslem(null))))}>
            {t.izinVer}
          </Dugme>
        )}
        {yazabilir && k.durum !== 'duraklatildi' && (
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={islem === 'yenile'} onClick={() => void yap('yenile', `/veri-kaynaklari/${k.id}/yenile`, 'POST', t.yenilemeKuyrukta)}>
            {t.simdiYenile}
          </Dugme>
        )}
        {yazabilir && (
          <Dugme boyut="kucuk" ton="ikincil" bekliyor={islem === 'duraklat'} onClick={() => void yap('duraklat', `/veri-kaynaklari/${k.id}/duraklat`, 'POST')}>
            {k.durum === 'duraklatildi' ? t.surdur : t.duraklat}
          </Dugme>
        )}
        {yonetebilir && (
          <Dugme
            boyut="kucuk"
            ton="sade"
            bekliyor={islem === 'kaldir'}
            onClick={() => setKaldirOnay(true)}
          >
            {t.kaldir}
          </Dugme>
        )}
      </div>
      <Pencere
        acik={kaldirOnay}
        onKapat={() => setKaldirOnay(false)}
        genislik="dar"
        baslik={t.kaldirSorusu(KAYNAK_TANIMI[k.tur].ad)}
        aciklama={t.kaldirAciklama}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setKaldirOnay(false)}>
              {sec(markaMerkeziVeriSozlugu, dil).vazgec}
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={islem === 'kaldir'}
              onClick={() => {
                setKaldirOnay(false);
                void yap('kaldir', `/veri-kaynaklari/${k.id}`, 'DELETE');
              }}
            >
              {t.kaldir}
            </Dugme>
          </>
        }
      />
    </article>
  );
}

function BaglanabilirKart({
  tur,
  engel,
  izinBaglantiId,
  clientId,
  yonetebilir,
  yazabilir,
  yenile,
}: {
  tur: KaynakTuru;
  engel: string | null;
  izinBaglantiId: string | null;
  clientId: string;
  yonetebilir: boolean;
  yazabilir: boolean;
  yenile: () => Promise<void>;
}) {
  const { dil } = useDil();
  const t = sec(markaMerkeziVeriSozlugu, dil).veriKaynaklari;
  const sonraki = KAYNAK_TANIMI[tur].paket !== 'F1';
  const [secim, setSecim] = useState<Secim>({ tur: 'kapali' });
  const [secili, setSecili] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [bagliyor, setBagliyor] = useState(false);
  const etiket = useId();

  async function secenekleriAc() {
    setSecim({ tur: 'okunuyor' });
    try {
      const veri = await apiFetch<KaynakSecenekleriYaniti>(`/veri-kaynaklari/secenekler?clientId=${encodeURIComponent(clientId)}&tur=${tur}`);
      setSecim({ tur: 'geldi', veri });
      // Kurulum rehberinin kurduğu mülk önden seçili gelir.
      const onerilen = veri.secenekler.find((s) => s.disKimlik === veri.kurulumMulkId && !s.bagliWorkspace);
      setSecili(onerilen?.disKimlik ?? '');
    } catch (e) {
      setSecim({ tur: 'hata', mesaj: hataMetni(e, dil) });
    }
  }

  async function bagla() {
    setBagliyor(true);
    setHata(null);
    try {
      await apiFetch('/veri-kaynaklari', { method: 'POST', body: JSON.stringify({ clientId, tur, disKimlik: secili }) });
      await yenile();
    } catch (e) {
      // Doğrulama BIRAKINCA: mülk okunamıyorsa Google'ın cümlesi şimdi görünür.
      setHata(hataMetni(e, dil));
    } finally {
      setBagliyor(false);
    }
  }

  return (
    <article className={`flex flex-col gap-3 rounded-alan border border-line p-4 ${sonraki ? 'bg-ink/[0.03]' : 'bg-surface'}`}>
      <KartBasi tur={tur} alt={sonraki ? t.sonrakiAsama : t.bagliDegil} />
      <Durum metin={sonraki ? t.henuzBaglanamiyor : engel ? t.baglanamiyor : t.bagliDegil} ton={engel && !sonraki ? 'kirmizi' : 'gri'} />
      {engel && <p className="text-12 text-ink-muted">{engel}</p>}
      {!sonraki && izinBaglantiId && yonetebilir && yazabilir && (
        <div>
          <Dugme ton="koyu" boyut="kucuk" onClick={() => void izinVer(izinBaglantiId, clientId, dil, setHata)}>
            {t.izinVer}
          </Dugme>
        </div>
      )}
      {!sonraki && !engel && yonetebilir && yazabilir && (
        <div className="space-y-2">
          {secim.tur === 'kapali' && (
            <Dugme boyut="kucuk" ton="ikincil" onClick={() => void secenekleriAc()}>
              {t.mulkSec}
            </Dugme>
          )}
          {secim.tur === 'okunuyor' && <p className="text-12 text-ink-muted">{t.mulklerOkunuyor}</p>}
          {secim.tur === 'hata' && (
            <p role="alert" className="text-12 font-semibold text-brand-strong">
              {secim.mesaj}
            </p>
          )}
          {secim.tur === 'geldi' &&
            (secim.veri.secenekler.length === 0 ? (
              <p className="text-12 text-ink-muted">{t.mulkYok}</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label htmlFor={etiket} className="sr-only">
                  {t.mulkEtiketi}
                </label>
                <select
                  id={etiket}
                  className="min-w-0 flex-1 rounded-alan border border-line bg-surface px-2 py-1.5 text-sm"
                  value={secili}
                  onChange={(e) => setSecili(e.target.value)}
                >
                  <option value="">{t.mulkSecin}</option>
                  {[...new Set(secim.veri.secenekler.map((s) => s.grup))].map((g) => (
                    <optgroup key={g} label={g}>
                      {secim.veri.secenekler
                        .filter((s) => s.grup === g)
                        .map((s) => (
                          <option key={s.disKimlik} value={s.disKimlik} disabled={s.bagliWorkspace !== null}>
                            {s.ad} ({s.disKimlik}){s.bagliWorkspace ? t.baskaWorkspace(s.bagliWorkspace) : ''}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <Dugme ton="koyu" boyut="kucuk" disabled={!secili} bekliyor={bagliyor} onClick={() => void bagla()}>
                  {t.bagla}
                </Dugme>
              </div>
            ))}
        </div>
      )}
      {!sonraki && !engel && !(yonetebilir && yazabilir) && <p className="text-12 text-ink-muted">{t.yetkiGerekli}</p>}
      {hata && (
        <p role="alert" className="text-12 font-semibold text-brand-strong">
          {hata}
        </p>
      )}
    </article>
  );
}
