'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '../ui';

interface ProvaGorunumu {
  durum: { tur: 'yok' | 'bekliyor' | 'reddedildi' | 'dogrulanamadi' | 'bayat' | 'gecti'; metin: string };
  sonuclar: Array<{ ad: string; sonuc: string; mesaj?: string; not?: string }>;
}

/** Gövde adının ekrandaki karşılığı; kod adı ekrana basılmaz. */
function parcaAdi(ad: string): string {
  if (ad === 'kampanya') return 'Kampanya';
  if (ad === 'reklam_seti') return 'Kitle ve bütçe';
  const [tur, n] = ad.split(':');
  if (tur === 'kreatif') return `Fikir ${n} görseli ve metni`;
  if (tur === 'reklam') return `Fikir ${n}`;
  return 'Görsel';
}

/**
 * Meta'nın ön kontrolü (TASARIM § 04.3). Hâller AYRI: "sormadım",
 * "soruyorum", "geçti", "reddetti", "tamamlanamadı" aynı boş alana
 * çevrilmez. Kullanıcının eksiği kalmayınca BİR KEZ kendiliğinden başlar;
 * düşerse "Yeniden kontrol et" insanın elinde.
 */
export function ProvaBlogu({ taslakId, ozet, kullaniciEksigi }: { taslakId: string; ozet: string | null; kullaniciEksigi: number }) {
  const [p, setP] = useState<ProvaGorunumu | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  const oku = useCallback(async () => {
    try {
      setP(await apiFetch<ProvaGorunumu>(`/reklam/taslaklar/${taslakId}/prova`));
      setHata(null);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    }
  }, [taslakId]);

  const iste = useCallback(async () => {
    setBekliyor(true);
    try {
      setP(await apiFetch<ProvaGorunumu>(`/reklam/taslaklar/${taslakId}/prova`, { method: 'POST' }));
      setHata(null);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    } finally {
      setBekliyor(false);
    }
  }, [taslakId]);

  useEffect(() => {
    void oku();
  }, [oku, ozet]);

  // Kendiliğinden: özet başına BİR KEZ. Düşen provayı döngüye sokmak kotayı
  // ve uygulama geneli hata sayacını yer.
  const istenen = useRef<string | null>(null);
  useEffect(() => {
    if (!p || !ozet || kullaniciEksigi > 0 || istenen.current === ozet) return;
    if (p.durum.tur === 'yok' || p.durum.tur === 'bayat') {
      istenen.current = ozet;
      void iste();
    }
  }, [p, ozet, kullaniciEksigi, iste]);

  useEffect(() => {
    if (p?.durum.tur !== 'bekliyor') return;
    const t = setInterval(() => void oku(), 3000);
    return () => clearInterval(t);
  }, [p?.durum.tur, oku]);

  const renk =
    p?.durum.tur === 'gecti' ? 'text-ok-strong' : p?.durum.tur === 'reddedildi' || p?.durum.tur === 'dogrulanamadi' ? 'text-danger-strong' : 'text-ink-muted';

  return (
    <section className="rounded-lg border border-line p-3.5 text-sm">
      <h3 className="mb-1 font-semibold">Meta’nın ön kontrolü</h3>
      {hata ? (
        <p role="alert" className="text-danger-strong">
          Kontrol durumu okunamadı: {hata}
        </p>
      ) : kullaniciEksigi > 0 ? (
        <p className="text-ink-muted">Eksikler tamamlanınca Meta’nın kontrolü kendiliğinden başlar.</p>
      ) : !p ? (
        <p className="text-ink-muted">Okunuyor…</p>
      ) : (
        <>
          <p className={renk}>{p.durum.metin}</p>
          {p.sonuclar.some((s) => s.sonuc !== 'gecti' || s.not) && (
            <ul className="mt-2 space-y-1 text-xs">
              {p.sonuclar
                .filter((s) => s.sonuc !== 'gecti' || s.not)
                .map((s, i) => (
                  <li key={i} className={s.sonuc === 'gecti' ? 'text-ink-muted' : undefined}>
                    <b>{parcaAdi(s.ad)}:</b> {s.sonuc === 'gecti' ? s.not : (s.mesaj ?? 'kontrol tamamlanamadı')}
                  </li>
                ))}
            </ul>
          )}
          {(p.durum.tur === 'reddedildi' || p.durum.tur === 'dogrulanamadi' || p.durum.tur === 'bayat') && (
            <Dugme ton="ikincil" kucuk className="mt-2" disabled={bekliyor} onClick={iste}>
              Yeniden kontrol et
            </Dugme>
          )}
        </>
      )}
    </section>
  );
}
