'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  kitleOzeti,
  type KitleSablonuListesi,
  type KurulumAdimDurumu,
  type KurulumListesiDurumu,
  type VeriKaynaklariYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDayLong } from '@/lib/format';
import { useDil, useSozluk } from '@/dil/saglayici';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { kaynakDurumMetni } from '@/lib/veri-kaynagi';
import { varliklarAdresi } from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';
import { Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';

/**
 * Kurulum adımlarının içindeki iki küçük parça: Analytics veri kaynağının
 * salt okunur durumu (Dönüşüm ölçümü) ve varsayılan kitlenin seçimi (Reklam
 * varsayılanları). İkisi de DÖRT HÂLİ ayrı yazıyor: okunuyor, çağrı düştü
 * (sunucunun cümlesi), boş + neden, dolu.
 */
const hataMetniDil = (e: unknown, yedek: string) => (e instanceof ApiRequestError ? e.message : yedek);

type Hal<T> = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: T };

/**
 * ═══ GA4 TEK KAYIT — VERİ KAYNAĞININ DURUMU SALT OKUNUR (MIMARI Ç-8) ═══
 *
 * Analytics'in evi Kurulum'un `ga4_mulk` adımı; mülk orada seçilince veri
 * kaynağı da bağlanıyor. Burada bağlama formu YOK, yalnız kaynağın son
 * çekimi ve hatası. İki kaydın mülkü ayrışmışsa (eski veri) AÇIKÇA
 * yazılıyor; hangisinin doğru olduğu sessizce seçilmiyor.
 */
export function Ga4KaynakDurumu({ clientId }: { clientId: string }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const [hal, setHal] = useState<Hal<VeriKaynaklariYaniti>>({ tur: 'okunuyor' });

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<VeriKaynaklariYaniti>(`/veri-kaynaklari?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetniDil(e, d.sunucuyaUlasilamadi) });
    }
  }, [clientId, d]);

  useEffect(() => {
    void oku();
  }, [oku]);

  if (hal.tur === 'okunuyor') return <p className="text-xs text-ink-muted">{d.ga4Okunuyor}</p>;
  if (hal.tur === 'hata') {
    return (
      <Serit
        ton="hata"
        baslik={d.ga4Okunamadi}
        eylemler={
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oku()}>
            {d.yenidenDene}
          </Dugme>
        }
      >
        {hal.mesaj}
      </Serit>
    );
  }
  const k = hal.veri.kaynaklar.find((x) => x.tur === 'ga4');
  if (!k) {
    const engel = hal.veri.baglanabilir.find((b) => b.tur === 'ga4')?.engel;
    return (
      <p className="text-xs text-ink-muted">
        {d.ga4Henuz}
        {engel ? ` ${engel}` : ''}
      </p>
    );
  }
  const kd = kaynakDurumMetni(k, dil);
  return (
    <div className="space-y-1 rounded-alan border border-line px-3 py-2 text-xs text-ink-muted">
      <p>
        <span className="font-semibold text-ink">{d.ga4Verisi}</span> {kd.metin} · {d.ga4Mulk} {k.disKimlik} · {d.ga4SonCekim}{' '}
        <b className="text-ink">{k.sonBasariliCekim ? formatDayLong(k.sonBasariliCekim.slice(0, 10), dil) : d.ga4Yok}</b>
      </p>
      {k.sonHata && <p className="text-ink">{d.ga4GoogleCevabi} {k.sonHata}</p>}
      {k.kurulumUyusmazligi && (
        <p className="text-danger-strong">{d.ga4Uyusmazlik(k.kurulumUyusmazligi.kurulumMulkId, k.disKimlik)}</p>
      )}
    </div>
  );
}

/**
 * ═══ VARSAYILAN KİTLE — EVİ KURULUM (MIMARI Ç-9) ═══
 *
 * Reklam kurarken konum ve yaşın önden dolduğu şablon. Kitleler sekmesinde
 * (Varlıklar) rozet salt okunur; seçim YALNIZ burada. Yeni şablon yazmak
 * Varlıklar › Kitleler'in işi: burada yeni şablon açmak, her "Değiştir"de
 * aynı adlı bir "Varsayılan" şablon biriktirirdi (MIMARI § 13).
 */
export function VarsayilanKitleSecici({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const [hal, setHal] = useState<Hal<KitleSablonuListesi>>({ tur: 'okunuyor' });
  const [secili, setSecili] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const etiket = useId();

  const oku = useCallback(async () => {
    try {
      const veri = await apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${encodeURIComponent(clientId)}`);
      setHal({ tur: 'geldi', veri });
      setSecili(veri.varsayilanId ?? '');
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetniDil(e, d.sunucuyaUlasilamadi) });
    }
  }, [clientId, d]);

  useEffect(() => {
    void oku();
  }, [oku]);

  async function kaydet() {
    setGonderiliyor(true);
    setHata(null);
    try {
      await apiFetch('/audience-templates/varsayilan', {
        method: 'PUT',
        body: JSON.stringify({ clientId, sablonId: secili || null }),
      });
      await oku();
    } catch (e) {
      setHata(hataMetniDil(e, d.sunucuyaUlasilamadi));
    } finally {
      setGonderiliyor(false);
    }
  }

  const kitlelerAdresi = varliklarAdresi('kitleler', clientId);
  if (hal.tur === 'okunuyor') return <p className="text-xs text-ink-muted">{d.kitleOkunuyor}</p>;
  if (hal.tur === 'hata') {
    return (
      <Serit ton="hata" baslik={d.kitleOkunamadi}>
        {hal.mesaj}
      </Serit>
    );
  }
  const v = hal.veri;
  const mevcut = v.items.find((k) => k.id === v.varsayilanId) ?? null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {mevcut ? (
          <>
            {d.kitleSuAn} <b className="text-ink">{mevcut.name}</b> · {kitleOzeti(mevcut)}
          </>
        ) : (
          d.kitleYok
        )}
      </p>
      {v.items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          {d.kayitliKitleYok}{' '}
          <Link href={kitlelerAdresi} className="font-semibold text-ink underline-offset-2 hover:underline">
            {d.kitleOlustur}
          </Link>
          {d.sonraVarsayilanYap}
        </p>
      ) : yazabilir ? (
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={etiket} className="sr-only">
            {d.varsayilanKitle}
          </label>
          <Secim
            id={etiket}
            className="!w-auto min-w-0 flex-1"
            value={secili}
            onChange={(e) => setSecili(e.target.value)}
          >
            <option value="">{d.varsayilanYok}</option>
            {v.items.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Secim>
          <Dugme ton="koyu" boyut="kucuk" bekliyor={gonderiliyor} disabled={secili === (v.varsayilanId ?? '')} onClick={() => void kaydet()}>
            {d.kaydet}
          </Dugme>
          <Link href={kitlelerAdresi} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
            {d.yeniKitle}
          </Link>
        </div>
      ) : null}
      {hata && (
        <p role="alert" className="text-xs text-danger-strong">
          {hata}
        </p>
      )}
    </div>
  );
}

/*
 * ═══ KURULUM DURUMUNUN ROZETİ ═══
 *
 * Durum tabloları (`DURUM_GOSTERIMI`, `LISTE_DURUMU`) etiketi taşıyor; renk
 * burada `Rozet`e çevriliyor. Eskiden her durum kendi zemin rengini
 * taşıyordu (yeşil, sarı, mavi): yeşil yalnız "Tamam"ın NOKTASINDA kalır,
 * eylem isteyen iki durum (Hata, Eksik) kırmızı, kalanlar gri. Tanınmayan
 * durum `taslak`a düşmüyor, derlemede yakalanıyor (Record anahtarı).
 */
const DURUM_HALI: Record<KurulumDurumAdi, DurumHali> = {
  tamam: 'ok',
  hata: 'hata',
  eksik: 'hata',
  soru: 'taslak',
  kullanicida: 'taslak',
  bekliyor: 'taslak',
  atlandi: 'taslak',
  bilinmiyor: 'dur',
  kullanilmiyor: 'dur',
  kapsam_disi: 'dur',
};

type KurulumDurumAdi = KurulumAdimDurumu | KurulumListesiDurumu;

export function DurumRozeti({ durum, etiket }: { durum: KurulumDurumAdi; etiket: string }) {
  return <Rozet hal={DURUM_HALI[durum]}>{etiket}</Rozet>;
}
