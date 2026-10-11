'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_META,
  type GeoLocationOption,
  type HazirlamaCevabi,
  type HazirlamaSorusu,
  type HazirlamaYaniti,
  type KitleKonumu,
  type SpecialAdCategory,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { ADIM_ADI, ADIM_DURUM_TONU, GENEL_DURUM_METNI, YOKLAMA_ARALIGI_MS, YOKLAMA_SINIRI, butceGirdisi, yoklamaGerekli } from './hazirlama-mantik';

/**
 * ═══ HAZIR WORKSPACE KARTI (HAZIR-WORKSPACE-PLANI.md § Dalga 3) ═══
 *
 * Kullanıcı (2026-10-12): "kullanıcı neredeyse hiç uğraşmaması lazım, marka
 * merkezini doldurmayla falan". Hesap atanınca sistem siteyi, marka
 * bilgilerini, pikseli, bütçeyi KENDİSİ hazırlıyor; bu kart yalnız SONUCU
 * ve tahmin edilemeyen soruları (iki piksel, kategori beyanı, hizmet bölgesi)
 * gösteriyor. Soru yoksa kart tek satıra iner: "Reklama hazır".
 *
 * Okuma hazırlığı TETİKLİYOR (sunucu, imza değiştiyse); kart çalışırken
 * yokluyor ve sınırda durup bunu söylüyor.
 */
type Hal = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: HazirlamaYaniti };

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

const TON_SINIFI: Record<'tamam' | 'soru' | 'eksik' | 'pasif', string> = {
  tamam: 'bg-ok',
  soru: 'bg-brand',
  eksik: 'bg-danger',
  pasif: 'bg-line',
};

export function HazirlamaKarti({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });
  const [yeniden, setYeniden] = useState(false);
  const [yoklamaBitti, setYoklamaBitti] = useState(false);
  const yoklama = useRef(0);

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  useEffect(() => {
    void oku();
  }, [oku]);

  const calisiyor = hal.tur === 'geldi' && yoklamaGerekli(hal.veri.durum);
  useEffect(() => {
    if (!calisiyor) {
      yoklama.current = 0;
      return;
    }
    if (yoklama.current >= YOKLAMA_SINIRI) {
      setYoklamaBitti(true);
      return;
    }
    const z = window.setTimeout(() => {
      yoklama.current += 1;
      void oku();
    }, YOKLAMA_ARALIGI_MS);
    return () => window.clearTimeout(z);
  }, [calisiyor, hal, oku]);

  async function yenidenHazirla() {
    setYeniden(true);
    setYoklamaBitti(false);
    yoklama.current = 0;
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama`, { method: 'POST' }) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    } finally {
      setYeniden(false);
    }
  }

  if (hal.tur === 'okunuyor') {
    return <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">Reklam hazırlığı okunuyor…</p>;
  }
  if (hal.tur === 'hata') {
    return (
      <Uyari ton="tehlike" baslik="Reklam hazırlığı alınamadı.">
        {hal.mesaj}{' '}
        <button type="button" className="font-semibold underline" onClick={() => void oku()}>
          Yeniden dene
        </button>
      </Uyari>
    );
  }

  const v = hal.veri;
  return (
    <section aria-labelledby="hazirlama-baslik" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h3 id="hazirlama-baslik" className="font-baslik text-base font-semibold text-ink">
            Reklam hazırlığı · {GENEL_DURUM_METNI[v.durum]}
          </h3>
          <p className="text-xs text-ink-muted">
            {calisiyor
              ? 'Site, marka bilgileri ve piksel okunuyor. Bu sayfadan ayrılabilirsin, iş arka planda sürer.'
              : 'Reklam kurarken bunlar önden dolu gelir; sen yalnız amacı ve görseli seçersin.'}
            {v.sonCalisma && !calisiyor && ` Son hazırlık: ${new Date(v.sonCalisma).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}.`}
          </p>
        </div>
        {yazabilir && (
          <Dugme ton="ikincil" boyut="kucuk" bekliyor={yeniden || calisiyor} onClick={() => void yenidenHazirla()}>
            Yeniden hazırla
          </Dugme>
        )}
        {v.durum === 'hazir' && (
          <Link href={baglanti('/reklam', { musteri: clientId })} className="text-sm font-semibold text-brand-strong hover:underline">
            Reklam kur
          </Link>
        )}
      </div>

      {yoklamaBitti && calisiyor && (
        <div className="px-5 pt-4">
          <Uyari ton="uyari" baslik="Hazırlık beklenenden uzun sürüyor.">
            Sayfayı yenileyerek durumu tekrar okuyabilirsin. Site yavaşsa ya da platform yanıt vermiyorsa adımlar hata nedeniyle görünecek.
          </Uyari>
        </div>
      )}

      {v.sorular.length > 0 && !yazabilir && (
        <p className="border-b border-line px-5 py-3 text-sm text-ink-muted">
          {v.sorular.length} soru cevap bekliyor; cevabı workspace’i düzenleme yetkisi olan kişi verecek.
        </p>
      )}
      {v.sorular.length > 0 && yazabilir && (
        <div className="space-y-3 border-b border-line px-5 py-4">
          {v.sorular.map((q) => (
            <Soru key={q.kod} clientId={clientId} soru={q} guncelle={(y) => setHal({ tur: 'geldi', veri: y })} />
          ))}
        </div>
      )}

      <ul className="divide-y divide-line">
        {v.adimlar.map((a) => (
          <li key={a.kod} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
            <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TON_SINIFI[ADIM_DURUM_TONU[a.durum]]}`} />
            {/* Mobilde etiket üstte: sabit genişlikli sütun site adresini taşırıyordu. */}
            <span className="min-w-0 flex-1 text-ink-muted sm:w-36 sm:flex-none">{ADIM_ADI[a.kod]}</span>
            <span className="min-w-0 basis-full break-words pl-5 sm:basis-0 sm:flex-1 sm:pl-0 [overflow-wrap:anywhere]">
              <span className="font-medium text-ink">{a.baslik}</span>
              <span className="block text-xs text-ink-muted">{a.neden}</span>
            </span>
            {a.kod === 'butce' && yazabilir && <ButceDegistir clientId={clientId} guncelle={(y) => setHal({ tur: 'geldi', veri: y })} />}
          </li>
        ))}
      </ul>
      {v.adimlar.length === 0 && !calisiyor && (
        <p className="px-5 py-4 text-sm text-ink-muted">Hazırlık henüz koşmadı. Bu workspace’e bir reklam hesabı atandığında kendiliğinden başlar.</p>
      )}
    </section>
  );
}

async function cevapla(clientId: string, c: HazirlamaCevabi): Promise<HazirlamaYaniti> {
  return apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama/cevap`, { method: 'POST', body: JSON.stringify(c) });
}

function Soru({ clientId, soru, guncelle }: { clientId: string; soru: HazirlamaSorusu; guncelle: (y: HazirlamaYaniti) => void }) {
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [piksel, setPiksel] = useState<string | null>(null);
  const [kategoriler, setKategoriler] = useState<SpecialAdCategory[]>([]);
  const [konumlar, setKonumlar] = useState<GeoLocationOption[]>([]);

  async function gonder(c: HazirlamaCevabi) {
    setGonderiliyor(true);
    setHata(null);
    try {
      guncelle(await cevapla(clientId, c));
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand/40 p-4">
      <p className="text-sm font-semibold text-ink">{soru.soru}</p>
      {soru.kod === 'piksel' && (
        <>
          <div className="space-y-1">
            {soru.secenekler.map((x) => (
              <label key={x.deger} className="flex items-center gap-2 text-sm">
                <input type="radio" name="hazirlama-piksel" checked={piksel === x.deger} onChange={() => setPiksel(x.deger)} />
                {x.etiket} <span className="text-xs text-ink-muted">({x.deger})</span>
              </label>
            ))}
          </div>
          <Dugme boyut="kucuk" disabled={!piksel} bekliyor={gonderiliyor} onClick={() => piksel && void gonder({ kod: 'piksel', pikselId: piksel })}>
            Bu pikseli kullan
          </Dugme>
        </>
      )}
      {soru.kod === 'kategori' && (
        <>
          <p className="text-xs text-ink-muted">Yasal bir beyan; Meta bu reklamlarda hedeflemeyi kısıtlıyor. Bir kez cevaplanır.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {SPECIAL_AD_CATEGORIES.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kategoriler.includes(k)}
                  onChange={(e) => setKategoriler(e.target.checked ? [...kategoriler, k] : kategoriler.filter((x) => x !== k))}
                />
                {SPECIAL_AD_CATEGORY_META[k].label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Dugme boyut="kucuk" ton="ikincil" bekliyor={gonderiliyor} disabled={kategoriler.length > 0} onClick={() => void gonder({ kod: 'kategori', kategoriler: [] })}>
              Hiçbiri
            </Dugme>
            <Dugme boyut="kucuk" bekliyor={gonderiliyor} disabled={kategoriler.length === 0} onClick={() => void gonder({ kod: 'kategori', kategoriler })}>
              Seçilenleri kaydet
            </Dugme>
          </div>
        </>
      )}
      {soru.kod === 'konum' && (
        <>
          <HedeflemeSecici
            clientId={clientId}
            lokasyonlar={konumlar}
            setLokasyonlar={setKonumlar}
            kitleId={null}
            setKitleId={() => undefined}
            kayitliKitle={false}
            bosMetni="Hizmet verdiğin şehir ya da bölgeleri seç; tüm Türkiye için Türkiye'yi seç."
          />
          <Dugme
            boyut="kucuk"
            bekliyor={gonderiliyor}
            disabled={konumlar.length === 0}
            onClick={() =>
              void gonder({
                kod: 'konum',
                // Arama yalnız ülke/il/şehir döndürüyor; başka tür gelirse
                // sunucu şeması reddeder ve sebep aşağıda yazar.
                konumlar: konumlar.map((o) => ({ key: o.key, type: o.type as KitleKonumu['type'], label: o.label, countryCode: o.countryCode || null })),
              })
            }
          >
            Varsayılan konum yap
          </Dugme>
        </>
      )}
      {hata && <p className="text-sm text-danger-strong">{hata}</p>}
    </div>
  );
}

function ButceDegistir({ clientId, guncelle }: { clientId: string; guncelle: (y: HazirlamaYaniti) => void }) {
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function kaydet() {
    const r = butceGirdisi(metin);
    if (r.tur === 'hata') return setHata(r.mesaj);
    setGonderiliyor(true);
    setHata(null);
    try {
      guncelle(await cevapla(clientId, { kod: 'butce', gunlukButceMicros: r.micros }));
      setAcik(false);
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  }

  if (!acik) {
    return (
      <button type="button" className="shrink-0 text-xs font-semibold text-brand-strong hover:underline" onClick={() => setAcik(true)}>
        Değiştir
      </button>
    );
  }
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <input
          aria-label="Günlük bütçe"
          inputMode="decimal"
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder="750"
          className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
        />
        <Dugme boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void kaydet()}>
          Kaydet
        </Dugme>
      </span>
      {hata && <span className="text-xs text-danger-strong">{hata}</span>}
    </span>
  );
}
