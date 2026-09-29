'use client';

import { useEffect, useState } from 'react';
import { KITLE_SINIRLARI, type InterestOption, type KitleIlgi } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useIzlenenMetaHesabi } from '@/components/autoboost/hedefleme-secici';

/**
 * ═══ İLGİ ALANI SEÇİCİ (Marka Merkezi Bölüm 4c) ═══
 *
 * Meta'nın `adinterest` araması. Her sonuçta Meta'nın TAHMİNİ kitle büyüklüğü
 * yazıyor: K16 ilgi seçimini "yanlış kullanıldığında erişimi sessizce
 * öldürüyor" diye kapatmıştı; büyüklüğü göstermek o riski görünür kılıyor.
 *
 * DÖRT HÂL AYRI: kısa sorgu, aranıyor, çağrı düştü (Meta'nın cümlesiyle),
 * sonuç yok.
 */
export function IlgiSecici({
  clientId,
  secili,
  degis,
}: {
  clientId: string;
  secili: KitleIlgi[];
  degis: (v: KitleIlgi[]) => void;
}) {
  const { hesap, hesapHata } = useIzlenenMetaHesabi(clientId);
  const [arama, setArama] = useState('');
  const [sonuc, setSonuc] = useState<InterestOption[]>([]);
  const [durum, setDurum] = useState<'bos' | 'kisa' | 'araniyor' | 'bitti'>('bos');
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    setHata(null);
    if (!hesap) return;
    const q = arama.trim();
    if (q.length === 0) {
      setDurum('bos');
      setSonuc([]);
      return;
    }
    if (q.length < 2) {
      setDurum('kisa');
      setSonuc([]);
      return;
    }
    setDurum('araniyor');
    // 350 ms bekleme: her tuşa bir Meta çağrısı kotayı yakar.
    const t = setTimeout(() => {
      void apiFetch<InterestOption[]>(
        `/connections/targeting/interests?adAccountId=${hesap.id}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          setSonuc(r);
          setDurum('bitti');
        })
        .catch((err: unknown) => {
          setSonuc([]);
          setDurum('bitti');
          setHata(err instanceof ApiRequestError ? err.message : 'İlgi alanı araması düştü.');
        });
    }, 350);
    return () => clearTimeout(t);
  }, [arama, hesap]);

  if (hesapHata) {
    return <p className="text-[11px] text-danger-strong">Reklam hesabı okunamadı — {hesapHata}</p>;
  }
  if (hesap === undefined) return <p className="text-[11px] text-ink-muted">Reklam hesabı aranıyor…</p>;
  if (hesap === null) {
    return (
      <p className="text-[11px] text-ink-muted">
        İlgi alanı araması izlenen bir Meta reklam hesabı istiyor; bu workspace’e atanmış hesap yok.
      </p>
    );
  }

  const dolu = secili.length >= KITLE_SINIRLARI.ilgi;

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <p className="text-xs font-medium text-ink">
        İlgi alanları ({secili.length}/{KITLE_SINIRLARI.ilgi})
      </p>
      <p className="text-[11px] text-ink-muted">
        Birden çok ilgi “bunlardan biriyle ilgilenen” demek; kitleyi daraltmaz, genişletir. Boş
        bırakırsan ilgi daraltması yapılmaz.
      </p>
      {secili.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {secili.map((i) => (
            <span
              key={i.id}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[11px]"
            >
              {i.name}
              <button
                type="button"
                onClick={() => degis(secili.filter((x) => x.id !== i.id))}
                className="text-ink-muted hover:text-danger"
                aria-label={`${i.name} kaldır`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {!dolu && (
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder="Örn. lüks otomobil"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
      )}
      {durum === 'kisa' && <p className="text-[11px] text-ink-muted">En az iki harf yaz.</p>}
      {durum === 'araniyor' && <p className="text-[11px] text-ink-muted">Aranıyor…</p>}
      {hata && <p className="text-[11px] text-danger-strong">{hata}</p>}
      {durum === 'bitti' && !hata && sonuc.length === 0 && (
        <p className="text-[11px] text-ink-muted">Meta’da bu terimle ilgi alanı bulunamadı.</p>
      )}
      {sonuc.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {sonuc.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={secili.some((x) => x.id === o.id)}
                onClick={() => {
                  degis([...secili, { id: o.id, name: o.name }]);
                  setArama('');
                }}
                className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-surface-muted disabled:opacity-50"
              >
                <span className="text-ink">{o.name}</span>
                <span className="ml-2 text-ink-muted">{kitleBuyuklugu(o)}</span>
                {o.path.length > 1 && (
                  <span className="block text-[10px] text-ink-muted">{o.path.join(' › ')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Meta aralığı; bilinmiyorsa AÇIKÇA "bilinmiyor" — sıfır yazmak "kimse yok" okunurdu. */
export function kitleBuyuklugu(o: { audienceMin: number | null; audienceMax: number | null }): string {
  if (o.audienceMin === null || o.audienceMax === null) return 'büyüklük bilinmiyor';
  const f = (n: number) => n.toLocaleString('tr-TR');
  return `~${f(o.audienceMin)}–${f(o.audienceMax)} kişi`;
}
