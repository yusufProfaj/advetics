'use client';

import { useEffect, useState } from 'react';
import {
  KITLE_SINIRLARI,
  type CustomAudienceList,
  type CustomAudienceOption,
  type KitleOzel,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useIzlenenMetaHesabi } from '@/components/autoboost/hedefleme-secici';

/**
 * ═══ META ÖZEL VE BENZER KİTLELER (Marka Merkezi Bölüm 4b) ═══
 *
 * Ads Manager'da kurulmuş kitleler OKUNUYOR; burada kitle oluşturulmuyor.
 *
 * KİTLE HESABA BAĞLI: seçilen her kitle hesabını taşıyor ve Hızlı Reklam
 * başka bir hesapla yayın kurulurken bunu söylüyor. Hesap kararı tek hook
 * (`useIzlenenMetaHesabi`); konum ve ilgi aramasıyla aynı hesap.
 *
 * YAYINA HAZIR OLMAYAN KİTLE SEÇİLEMİYOR ve sebebi Meta'nın kendi cümlesi:
 * "hedef kitle çok küçük" bir kitleyle kurulan reklam hata vermeden hiç
 * gösterilmez.
 */
export function OzelKitleSecici({
  clientId,
  secili,
  degis,
}: {
  clientId: string;
  secili: KitleOzel[];
  degis: (v: KitleOzel[]) => void;
}) {
  const { hesap, hesapHata } = useIzlenenMetaHesabi(clientId);
  const [liste, setListe] = useState<CustomAudienceList | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!hesap) return;
    setHata(null);
    void apiFetch<CustomAudienceList>(`/connections/targeting/custom-audiences?adAccountId=${hesap.id}`)
      .then(setListe)
      .catch((err: unknown) => {
        setListe(null);
        setHata(err instanceof ApiRequestError ? err.message : 'Özel kitleler alınamadı.');
      });
  }, [hesap]);

  if (hesapHata) return <p className="text-[11px] text-danger-strong">Reklam hesabı okunamadı — {hesapHata}</p>;
  if (hesap === undefined) return <p className="text-[11px] text-ink-muted">Reklam hesabı aranıyor…</p>;
  if (hesap === null) {
    return <p className="text-[11px] text-ink-muted">Özel kitleler izlenen bir Meta reklam hesabı istiyor.</p>;
  }

  // Şablonda BAŞKA hesabın kitlesi varsa (hesap değişmiş) açıkça söyleniyor.
  const yabanci = secili.filter((o) => o.hesapId !== hesap.id);

  function sec(o: CustomAudienceOption, mod: KitleOzel['mod'] | null): void {
    if (!hesap) return;
    const kalan = secili.filter((x) => x.id !== o.id);
    if (mod === null) return degis(kalan);
    degis([...kalan, { id: o.id, name: o.name, tip: o.tip, mod, hesapId: hesap.id, hesapAdi: hesap.name }]);
  }

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <p className="text-xs font-medium text-ink">
        Meta’daki kitleler ({secili.length}/{KITLE_SINIRLARI.ozelKitle}) — <strong>{hesap.name}</strong>
      </p>
      <p className="text-[11px] text-ink-muted">
        Ads Manager’da kurulmuş özel ve benzer kitleler. Yalnızca bu hesapta çalışır. “Hariç” seçilen kitleye
        reklam gösterilmez (örn. zaten satın almış kişiler).
      </p>
      {yabanci.length > 0 && (
        <p className="text-[11px] text-warn-strong">
          Bu kitlede başka hesabın özel kitleleri var ({yabanci.map((o) => `${o.name} · ${o.hesapAdi}`).join(', ')}).
          Yalnızca kendi hesaplarında çalışırlar; kaldırıp buradan yeniden seç.
        </p>
      )}
      {hata && <p className="text-[11px] text-danger-strong">{hata}</p>}
      {!hata && liste === null && <p className="text-[11px] text-ink-muted">Kitleler yükleniyor…</p>}
      {liste && liste.items.length === 0 && (
        <p className="text-[11px] text-ink-muted">Bu hesapta Ads Manager’da kurulmuş özel ya da benzer kitle yok.</p>
      )}
      {liste && liste.items.length > 0 && (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
          {liste.items.map((o) => {
            const mevcut = secili.find((x) => x.id === o.id)?.mod ?? null;
            const kapali = o.hazir === false;
            const dolu = secili.length >= KITLE_SINIRLARI.ozelKitle && mevcut === null;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{o.name}</span>
                  <span className="ml-2 text-ink-muted">
                    {o.tip === 'benzer' ? 'Benzer' : 'Özel'} · {boyut(o)}
                  </span>
                  {(kapali || o.hazir === null) && (
                    <span className={`block text-[10px] ${kapali ? 'text-danger-strong' : 'text-ink-muted'}`}>
                      {kapali
                        ? `Yayına hazır değil${o.durum ? `: ${o.durum}` : ''}`
                        : 'Meta hazır olup olmadığını bildirmedi'}
                    </span>
                  )}
                </span>
                <select
                  value={mevcut ?? ''}
                  disabled={kapali || dolu}
                  onChange={(e) => sec(o, (e.target.value || null) as KitleOzel['mod'] | null)}
                  className="rounded border border-line bg-surface px-1.5 py-0.5 text-[11px]"
                >
                  <option value="">Kullanma</option>
                  <option value="dahil">Dahil et</option>
                  <option value="haric">Hariç tut</option>
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** -1 → null (ölçülmemiş) sunucuda çevrildi; burada "bilinmiyor" diye yazılıyor. */
function boyut(o: CustomAudienceOption): string {
  if (o.sizeMin === null || o.sizeMax === null) return 'büyüklük bilinmiyor';
  const f = (n: number) => n.toLocaleString('tr-TR');
  return `~${f(o.sizeMin)}–${f(o.sizeMax)} kişi`;
}
