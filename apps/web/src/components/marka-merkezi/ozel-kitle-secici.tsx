'use client';

import { useEffect, useState } from 'react';
import {
  KITLE_SINIRLARI,
  type CustomAudienceList,
  type CustomAudienceOption,
  type Dil,
  sec as dilSec,
  type KitleOzel,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { useIzlenenMetaHesabi } from '@/components/autoboost/hedefleme-secici';
import { useDil } from '@/dil/saglayici';
import { markaMerkeziVeriSozlugu } from '@/dil/sozlukler/marka-merkezi-veri';

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
  const { dil } = useDil();
  const t = dilSec(markaMerkeziVeriSozlugu, dil).ozelKitle;
  const [liste, setListe] = useState<CustomAudienceList | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!hesap) return;
    setHata(null);
    void apiFetch<CustomAudienceList>(`/connections/targeting/custom-audiences?adAccountId=${hesap.id}`)
      .then(setListe)
      .catch((err: unknown) => {
        setListe(null);
        setHata(err instanceof ApiRequestError ? err.message : t.alinamadi);
      });
  }, [hesap, t]);

  if (hesapHata) return <p className="text-12 text-danger-strong">{t.hesapOkunamadi(hesapHata)}</p>;
  if (hesap === undefined) return <p className="text-12 text-ink-muted">{t.hesapAraniyor}</p>;
  if (hesap === null) {
    return <p className="text-12 text-ink-muted">{t.hesapIstiyor}</p>;
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
    <div className="grid gap-2 rounded-alan border border-line p-3">
      <p className="m-0 text-13 font-semibold text-ink">
        {t.baslik(secili.length, KITLE_SINIRLARI.ozelKitle)}<strong>{hesap.name}</strong>
      </p>
      <p className="text-12 text-ink-muted">{t.aciklama}</p>
      {yabanci.length > 0 && (
        <p className="text-12 text-warn-strong">
          {t.yabanci(yabanci.map((o) => `${o.name} · ${o.hesapAdi}`).join(', '))}
        </p>
      )}
      {hata && <p className="text-12 text-danger-strong">{hata}</p>}
      {!hata && liste === null && <p className="text-12 text-ink-muted">{t.yukleniyor}</p>}
      {liste && liste.items.length === 0 && (
        <p className="text-12 text-ink-muted">{t.yok}</p>
      )}
      {liste && liste.items.length > 0 && (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-alan border border-line">
          {liste.items.map((o) => {
            const mevcut = secili.find((x) => x.id === o.id)?.mod ?? null;
            const kapali = o.hazir === false;
            const dolu = secili.length >= KITLE_SINIRLARI.ozelKitle && mevcut === null;
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{o.name}</span>
                  <span className="ml-2 text-ink-muted">
                    {o.tip === 'benzer' ? t.benzer : t.ozel} · {boyut(o, dil)}
                  </span>
                  {(kapali || o.hazir === null) && (
                    <span className={`block text-11 ${kapali ? 'text-danger-strong' : 'text-ink-muted'}`}>
                      {kapali
                        ? `${t.yayinaHazirDegil}${o.durum ? `: ${o.durum}` : ''}`
                        : t.metaBildirmedi}
                    </span>
                  )}
                </span>
                <select
                  value={mevcut ?? ''}
                  disabled={kapali || dolu}
                  onChange={(e) => sec(o, (e.target.value || null) as KitleOzel['mod'] | null)}
                  className="h-8 rounded-alan border border-line-strong bg-surface px-2 text-12 text-ink"
                >
                  <option value="">{t.kullanma}</option>
                  <option value="dahil">{t.dahilEt}</option>
                  <option value="haric">{t.haricTut}</option>
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
function boyut(o: CustomAudienceOption, dil: Dil): string {
  const t = dilSec(markaMerkeziVeriSozlugu, dil).ozelKitle;
  if (o.sizeMin === null || o.sizeMax === null) return t.boyutBilinmiyor;
  const f = (n: number) => n.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR');
  return t.boyut(f(o.sizeMin), f(o.sizeMax));
}
