'use client';

import { useEffect, useState } from 'react';
import {
  GOOGLE_YAS_ARALIKLARI,
  type GeoLocationOption,
  type GoogleYasAraligi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

export interface GoogleKonum {
  key: string;
  label: string;
}

const YAS_ETIKETI: Record<GoogleYasAraligi, string> = {
  AGE_RANGE_18_24: '18-24',
  AGE_RANGE_25_34: '25-34',
  AGE_RANGE_35_44: '35-44',
  AGE_RANGE_45_54: '45-54',
  AGE_RANGE_55_64: '55-64',
  AGE_RANGE_65_UP: '65+',
};

/** En fazla konum — şemadaki sınırla aynı; ayrışırsa kayıt sunucuda düşer. */
const KONUM_SINIRI = 25;

type AramaDurumu = 'bos' | 'araniyor' | 'bitti';

/**
 * ═══ YOUTUBE HEDEF KİTLESİ — konum ve yaş ═══
 *
 * İKİ VARSAYILAN, İKİSİ DE EKRANDA YAZILI:
 *
 *   · KONUM SEÇİLMEZSE TÜRKİYE. Konumsuz Demand Gen kampanyası bütün
 *     ülkelere açılıyor; sunucu boş listede Türkiye'yi açıkça gönderiyor.
 *     "Konum seçmedim" diyen kullanıcı dünya geneline değil Türkiye'ye
 *     reklam veriyor ve bunu burada okuyor.
 *   · YAŞ SEÇİLMEZSE BÜTÜN YAŞLAR. Altısını birden seçmek de aynı şey;
 *     sunucu kısıt kurmuyor, yaşı bilinmeyenler de dahil kalıyor.
 *
 * ARAMA DÖRT HÂLLİ. "Henüz aramadım", "arıyorum", "sonuç yok" ve "çağrı
 * düştü" aynı boş alana çevrilirse kullanıcı neden sonuç gelmediğini
 * bilemez (CLAUDE.md). Hata Google'ın kendi cümlesiyle yazılıyor.
 */
export function GoogleHedefleme({
  reklamHesabiId,
  konumlar,
  setKonumlar,
  yaslar,
  setYaslar,
}: {
  reklamHesabiId: string | null;
  konumlar: GoogleKonum[];
  setKonumlar: (k: GoogleKonum[]) => void;
  yaslar: GoogleYasAraligi[];
  setYaslar: (y: GoogleYasAraligi[]) => void;
}) {
  const [q, setQ] = useState('');
  const [sonuc, setSonuc] = useState<GeoLocationOption[]>([]);
  const [durum, setDurum] = useState<AramaDurumu>('bos');
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const aranan = q.trim();
    if (!reklamHesabiId || aranan.length < 2) {
      setSonuc([]);
      setHata(null);
      setDurum('bos');
      return;
    }
    setDurum('araniyor');
    setHata(null);
    // YAZARKEN HER TUŞTA DEĞİL: kısa bir bekleme, her harfin Google'a ayrı
    // bir istek olmasını engelliyor.
    const t = setTimeout(() => {
      void apiFetch<GeoLocationOption[]>(
        `/connections/targeting/locations?adAccountId=${reklamHesabiId}&q=${encodeURIComponent(aranan)}`,
      )
        .then((r) => {
          setSonuc(r);
          setDurum('bitti');
        })
        .catch((err: unknown) => {
          setSonuc([]);
          setHata(err instanceof ApiRequestError ? err.message : 'Konum araması yapılamadı.');
          setDurum('bitti');
        });
    }, 350);
    return () => clearTimeout(t);
  }, [q, reklamHesabiId]);

  function ekle(o: GeoLocationOption): void {
    if (konumlar.some((k) => k.key === o.key) || konumlar.length >= KONUM_SINIRI) return;
    setKonumlar([...konumlar, { key: o.key, label: o.label }]);
    setQ('');
  }

  function yasDegistir(y: GoogleYasAraligi): void {
    setYaslar(yaslar.includes(y) ? yaslar.filter((x) => x !== y) : [...yaslar, y]);
  }

  const tumYaslar = yaslar.length === 0 || yaslar.length === GOOGLE_YAS_ARALIKLARI.length;

  return (
    <section className="space-y-4 rounded-lg border border-line px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Hedef kitle</p>

      {/* ═══ KONUM ═══ */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Konum</p>

        {konumlar.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Seçilmedi: reklam <strong className="text-ink">Türkiye</strong> genelinde gösterilir.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {konumlar.map((k) => (
              <li key={k.key}>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-2.5 pr-1 text-xs text-ink">
                  {k.label}
                  <button
                    type="button"
                    onClick={() => setKonumlar(konumlar.filter((x) => x.key !== k.key))}
                    aria-label={`${k.label} konumunu kaldır`}
                    className="grid size-5 place-items-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {reklamHesabiId ? (
          <div className="space-y-1.5">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Şehir, il ya da ülke ara"
              aria-label="Konum ara"
              disabled={konumlar.length >= KONUM_SINIRI}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
            />
            {durum === 'araniyor' && <p className="text-[11px] text-ink-muted">Aranıyor…</p>}
            {hata && (
              <p role="alert" className="text-[11px] text-danger">
                {hata}
              </p>
            )}
            {durum === 'bitti' && !hata && sonuc.length === 0 && (
              <p className="text-[11px] text-ink-muted">“{q.trim()}” için konum bulunamadı.</p>
            )}
            {sonuc.length > 0 && (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
                {sonuc.map((o) => {
                  const secili = konumlar.some((k) => k.key === o.key);
                  return (
                    <li key={o.key}>
                      <button
                        type="button"
                        onClick={() => ekle(o)}
                        disabled={secili}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs transition hover:bg-surface-sunken disabled:opacity-50"
                      >
                        <span className="min-w-0 truncate text-ink" title={o.label}>
                          {o.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-muted">
                          {secili ? 'eklendi' : 'ekle'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {konumlar.length >= KONUM_SINIRI && (
              <p className="text-[11px] text-ink-muted">En fazla {KONUM_SINIRI} konum seçilebilir.</p>
            )}
          </div>
        ) : (
          /*
           * ARAMA NEDEN YOK — söyleniyor. Konum araması kanalın bağlı Google
           * reklam hesabı üzerinden yapılıyor; hesap yoksa arama kutusunu
           * göstermek, her harfte hata veren bir kutu göstermek olurdu.
           */
          <p className="text-[11px] text-warn-strong">
            Konum aramak için YouTube kanalına bir Google reklam hesabı bağlı olmalı.
          </p>
        )}
      </div>

      {/* ═══ YAŞ ═══ */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">Yaş</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Yaş aralıkları">
          {GOOGLE_YAS_ARALIKLARI.map((y) => {
            const secili = yaslar.includes(y);
            return (
              <button
                key={y}
                type="button"
                onClick={() => yasDegistir(y)}
                aria-pressed={secili}
                className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  secili
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-line text-ink-muted hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                {YAS_ETIKETI[y]}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-muted">
          {tumYaslar
            ? 'Seçilmedi: bütün yaşlar hedeflenir.'
            : 'Yalnızca seçilen yaşlar hedeflenir; yaşı bilinmeyen izleyiciler dahil değil.'}
        </p>
      </div>
    </section>
  );
}
