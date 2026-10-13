'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { kitleOzeti, type KitleSablonuListesi, type VeriKaynaklariYaniti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatDayLong } from '@/lib/format';
import { kaynakDurumMetni } from '@/lib/veri-kaynagi';
import { varliklarAdresi } from '@/lib/panel-adresleri';
import { Dugme } from '@/components/ui/dugme';

/**
 * Kurulum adımlarının içindeki iki küçük parça: Analytics veri kaynağının
 * salt okunur durumu (Dönüşüm ölçümü) ve varsayılan kitlenin seçimi (Reklam
 * varsayılanları). İkisi de DÖRT HÂLİ ayrı yazıyor: okunuyor, çağrı düştü
 * (sunucunun cümlesi), boş + neden, dolu.
 */
const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

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
  const [hal, setHal] = useState<Hal<VeriKaynaklariYaniti>>({ tur: 'okunuyor' });

  const oku = useCallback(async () => {
    try {
      setHal({ tur: 'geldi', veri: await apiFetch<VeriKaynaklariYaniti>(`/veri-kaynaklari?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  useEffect(() => {
    void oku();
  }, [oku]);

  if (hal.tur === 'okunuyor') return <p className="text-xs text-ink-muted">Analytics veri kaynağı okunuyor…</p>;
  if (hal.tur === 'hata') {
    return (
      <p role="alert" className="text-xs text-danger-strong">
        Analytics veri kaynağı okunamadı: {hal.mesaj}{' '}
        <button type="button" className="font-semibold underline" onClick={() => void oku()}>
          Yeniden dene
        </button>
      </p>
    );
  }
  const k = hal.veri.kaynaklar.find((x) => x.tur === 'ga4');
  if (!k) {
    const engel = hal.veri.baglanabilir.find((b) => b.tur === 'ga4')?.engel;
    return (
      <p className="text-xs text-ink-muted">
        Analytics verisi henüz okunmuyor. Yukarıda Analytics mülkü seçilince bağlanır.
        {engel ? ` ${engel}` : ''}
      </p>
    );
  }
  const d = kaynakDurumMetni(k);
  return (
    <div className="space-y-1 rounded-lg border border-line px-3 py-2 text-xs text-ink-muted">
      <p>
        <span className="font-semibold text-ink">Analytics verisi:</span> {d.metin} · mülk {k.disKimlik} · son çekim{' '}
        <b className="text-ink">{k.sonBasariliCekim ? formatDayLong(k.sonBasariliCekim.slice(0, 10)) : 'henüz yok'}</b>
      </p>
      {k.sonHata && <p className="text-ink">Google’ın cevabı: {k.sonHata}</p>}
      {k.kurulumUyusmazligi && (
        <p className="text-warn-strong">
          Kurulumdaki mülk ({k.kurulumUyusmazligi.kurulumMulkId}) ile okunan mülk ({k.disKimlik}) farklı. Raporlar okunan mülkü kullanır;
          doğrusu kurulumdakiyse aşağıdaki veri kaynaklarından bu mülkü kaldır, kurulumdaki mülk yeniden seçilince bağlanır.
        </p>
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
      setHal({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

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
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  }

  const kitlelerAdresi = varliklarAdresi('kitleler', clientId);
  if (hal.tur === 'okunuyor') return <p className="text-xs text-ink-muted">Kayıtlı kitleler okunuyor…</p>;
  if (hal.tur === 'hata') {
    return (
      <p role="alert" className="text-xs text-danger-strong">
        Kitleler okunamadı: {hal.mesaj}
      </p>
    );
  }
  const v = hal.veri;
  const mevcut = v.items.find((k) => k.id === v.varsayilanId) ?? null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">
        {mevcut ? (
          <>
            Şu an: <b className="text-ink">{mevcut.name}</b> · {kitleOzeti(mevcut)}
          </>
        ) : (
          'Varsayılan kitle yok: reklam Türkiye geneli, 18 yaş ve üzeri gösterir.'
        )}
      </p>
      {v.items.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Kayıtlı kitle yok.{' '}
          <Link href={kitlelerAdresi} className="font-semibold text-ink underline-offset-2 hover:underline">
            Varlıklar › Kitleler’de kitle oluştur
          </Link>
          , sonra burada varsayılan yap.
        </p>
      ) : yazabilir ? (
        <div className="flex flex-wrap items-end gap-2">
          <label htmlFor={etiket} className="sr-only">
            Varsayılan kitle
          </label>
          <select
            id={etiket}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            value={secili}
            onChange={(e) => setSecili(e.target.value)}
          >
            <option value="">Varsayılan yok</option>
            {v.items.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <Dugme boyut="kucuk" bekliyor={gonderiliyor} disabled={secili === (v.varsayilanId ?? '')} onClick={() => void kaydet()}>
            Kaydet
          </Dugme>
          <Link href={kitlelerAdresi} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
            Yeni kitle
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
