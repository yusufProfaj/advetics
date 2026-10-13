'use client';

import { useState } from 'react';
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
import { Dugme } from '@/components/ui/dugme';
import { Girdi } from '@/components/ui/alan';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { butceGirdisi } from './hazirlama-mantik';

/**
 * ═══ HAZIRLAMA SORULARI (HAZIR-WORKSPACE-PLANI.md § Dalga 3) ═══
 *
 * Hesap atanınca sistem siteyi, marka bilgilerini, pikseli ve bütçeyi
 * KENDİSİ hazırlıyor; burada yalnız tahmin edilemeyen soruların (iki piksel,
 * özel kategori beyanı, hizmet bölgesi) ve günlük bütçenin girdisi var.
 *
 * KART KALKTI (2026-10-13): "Reklam hazırlığı" kartı Bağlantılar'da kendi
 * sayacıyla duruyordu; şimdi soruları Kurulum'un ilgili adımlarının İÇİNDE
 * (piksel → Meta pikseli, kategori/konum/bütçe → Reklam varsayılanları) ve
 * sayaç tek (`kurulum-listesi.tsx`, docs/panel-sadelestirme/MIMARI.md § 7).
 */
const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

export async function cevapla(clientId: string, c: HazirlamaCevabi): Promise<HazirlamaYaniti> {
  return apiFetch<HazirlamaYaniti>(`/clients/${clientId}/hazirlama/cevap`, { method: 'POST', body: JSON.stringify(c) });
}

export function Soru({ clientId, soru, guncelle }: { clientId: string; soru: HazirlamaSorusu; guncelle: (y: HazirlamaYaniti) => void }) {
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
    <div className="space-y-2 rounded-alan border border-brand/40 p-4">
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
          <Dugme ton="koyu" boyut="kucuk" disabled={!piksel} bekliyor={gonderiliyor} onClick={() => piksel && void gonder({ kod: 'piksel', pikselId: piksel })}>
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
            <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} disabled={kategoriler.length === 0} onClick={() => void gonder({ kod: 'kategori', kategoriler })}>
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
            ton="koyu"
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

export function ButceDegistir({ clientId, guncelle }: { clientId: string; guncelle: (y: HazirlamaYaniti) => void }) {
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
        <Girdi
          aria-label="Günlük bütçe"
          inputMode="decimal"
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder="750"
          className="!h-8 !w-24"
        />
        <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} onClick={() => void kaydet()}>
          Kaydet
        </Dugme>
      </span>
      {hata && <span className="text-xs text-danger-strong">{hata}</span>}
    </span>
  );
}
