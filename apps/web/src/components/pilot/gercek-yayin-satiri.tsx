'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PilotGercekYayinDurumu } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { GERCEK_YAYIN_ACMA_UYARISI, gercekYayinGorunumu, gercekYayinIstegi, okumaHatasi, pilotUcAdresi } from './hesap';

/**
 * ═══ GERÇEK YAYIN ANAHTARI — AdvCampaign'de, YALNIZ AJANSA ═══
 *
 * YERİ NEDEN BURASI: anahtar AJANS GENELİ (bir şirket, bütün workspace'ler);
 * Marka Merkezi ise workspace kapsamlı ve orada durursa "bu workspace için mi
 * açtım?" sorusu doğardı. Etkisi kurulumda görülüyor ve kurulum kartları bu
 * ekranda. Satır yalnız ucu okuyabilen kişiye çiziliyor (müşteri hesabı hiç
 * okumuyor); değiştirme düğmesi yalnız `degistirebilir` olana.
 *
 * AÇMAK PARA HARCATIR: tek cümlelik uyarı + sebep alanı. Sebep kapatırken de
 * zorunlu: sabah gelen ekip "neden kapandı" sorusunun cevabını görmeli.
 */
export function GercekYayinSatiri({ durum }: { durum: PilotGercekYayinDurumu }) {
  const router = useRouter();
  const g = gercekYayinGorunumu(durum);
  const [acikForm, setAcikForm] = useState(false);
  const [sebep, setSebep] = useState('');
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });

  async function kaydet() {
    const istek = gercekYayinIstegi(!g.acik, sebep);
    if (istek.tur === 'hata') return setHal({ tur: 'hata', mesaj: istek.mesaj });
    setHal({ tur: 'suruyor' });
    try {
      await apiFetch(pilotUcAdresi('/pilot/gercek-yayin'), { method: 'PUT', body: JSON.stringify(istek.govde) });
      setHal({ tur: 'bos' });
      setAcikForm(false);
      setSebep('');
      router.refresh();
    } catch (e) {
      setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  return (
    <div className="space-y-2">
      <Uyari
        ton={g.ton}
        baslik={g.baslik}
        eylem={
          g.eylem && !acikForm ? (
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => setAcikForm(true)}>
              {g.eylem === 'ac' ? 'Gerçek yayını aç' : 'Kapat'}
            </Dugme>
          ) : undefined
        }
      >
        {g.iz}
      </Uyari>
      {acikForm && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          {g.eylem === 'ac' && <p className="text-sm font-semibold text-ink">{GERCEK_YAYIN_ACMA_UYARISI}</p>}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Sebep</span>
            <textarea
              value={sebep}
              onChange={(e) => setSebep(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={g.eylem === 'ac' ? 'Örnek: Uyum kontrolü canlıda doğrulandı.' : 'Örnek: Platform hatası incelenene kadar.'}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Dugme ton="sade" onClick={() => setAcikForm(false)} disabled={hal.tur === 'suruyor'}>
              Vazgeç
            </Dugme>
            <Dugme ton={g.eylem === 'ac' ? 'tehlike' : 'ikincil'} onClick={() => void kaydet()} bekliyor={hal.tur === 'suruyor'}>
              {g.eylem === 'ac' ? 'Gerçek yayını aç' : 'Gerçek yayını kapat'}
            </Dugme>
          </div>
          {hal.tur === 'hata' && (
            <p role="alert" className="text-sm text-danger-strong">
              {hal.mesaj}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
