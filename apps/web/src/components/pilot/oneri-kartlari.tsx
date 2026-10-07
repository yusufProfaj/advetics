'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OneriKarti } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { BosHucre, KaynakCipi } from './kaynak-cipi';
import { ONERI_DURUM_METNI, ONERI_UYGULAMA_ACIK, ONERI_TUR_ETIKETI, okumaHatasi, oneriBasligi, oneriDugmeleri, oneriEylemEtiketi, oneriSirala, para, pilotUcAdresi } from './hesap';

/**
 * ═══ KARAR BEKLEYEN: ÖNERİ KARTLARI ═══
 *
 * Kart YALNIZ karar bekleyen şeye. Pilot hiçbir şeyi kendiliğinden
 * değiştirmez (Ç-3); her değişiklik bir kart ve bir kişinin tek dokunuşu.
 * "Uygula" isteği sunucuda TAZE kontrolden geçer (`oneriBayatMi`): kartın
 * ölçüsü eskidiyse ya da hedef başka yerden değiştiyse eylem gönderilmez ve
 * sunucunun cümlesi kartın altında yazar.
 *
 * Ekran uygulanınca kartı kendi başına "uygulandı" YAPMAZ: durum sunucudan
 * yeniden okunur. Platform cevap vermediyse kart `sonuc_belirsiz`de durur
 * ve tekrar gönderilmez; panel "uygulandı" yazsaydı kullanıcı olmayan bir
 * değişikliğe güvenirdi.
 */
export function OneriKartlari({
  kartlar,
  clientId,
  paraBirimi,
  uygulayabilir,
  simdi,
}: {
  kartlar: OneriKarti[];
  clientId: string;
  paraBirimi: string | null;
  /** `bulk.publish`: uygulamak ve geri almak platforma yazmak demek. */
  uygulayabilir: boolean;
  simdi: string;
}) {
  const router = useRouter();
  const [islem, setIslem] = useState<{ id: string; eylem: string } | null>(null);
  const [hata, setHata] = useState<Record<string, string>>({});

  async function yap(k: OneriKarti, eylem: 'uygula' | 'gec' | 'geri_al') {
    const yol =
      eylem === 'uygula'
        ? pilotUcAdresi('/pilot/oneriler/:id/uygula', k.id)
        : eylem === 'gec'
          ? pilotUcAdresi('/pilot/oneriler/:id/gec', k.id)
          : pilotUcAdresi('/pilot/oneriler/:id/geri-al', k.id);
    setIslem({ id: k.id, eylem });
    setHata((h) => ({ ...h, [k.id]: '' }));
    try {
      await apiFetch(yol, { method: 'POST', body: '{}' });
      router.refresh();
    } catch (e) {
      setHata((h) => ({ ...h, [k.id]: okumaHatasi(e) }));
    } finally {
      setIslem(null);
    }
  }

  return (
    <ul className="space-y-3">
      {oneriSirala(kartlar).map((k) => {
        const dugmeler = oneriDugmeleri(k, simdi).filter((d) => d === 'gec' || uygulayabilir);
        const durumMetni = ONERI_DURUM_METNI[k.durum];
        const soluk = k.durum !== 'yeni';
        return (
          <li key={k.id} className={`rounded-xl border border-line bg-surface p-5 ${soluk ? 'opacity-70' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-2">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: k.hedef.platform === 'meta' ? 'var(--platform-meta)' : 'var(--platform-google)' }} />
                  {k.hedef.platform === 'meta' ? 'Meta' : 'Google'} · {ONERI_TUR_ETIKETI[k.tur]}
                </p>
                <h3 className="font-baslik text-base font-bold text-ink [overflow-wrap:anywhere]">{oneriBasligi(k)}</h3>
                <p className="text-sm text-ink-muted [text-wrap:pretty]">{k.neden}</p>
                {k.olculer.length > 0 && (
                  <dl className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[13px]">
                    {k.olculer.map((o) => (
                      <div key={o.etiket} className="min-w-0">
                        <dt className="text-ink-muted">{o.etiket}</dt>
                        <dd className="font-baslik text-[15px] font-bold tabular-nums text-ink">{typeof o.deger === 'number' ? o.deger.toLocaleString('tr-TR') : o.deger}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {k.olculer[0] && <KaynakCipi kaynak={k.olculer[0].kaynak} clientId={clientId} />}
                  {k.beklenenEtki.dolu ? (
                    <span className="text-xs text-ok-strong">
                      {k.beklenenEtki.deger.micros !== null && `~${para(k.beklenenEtki.deger.micros, paraBirimi)} `}
                      {k.beklenenEtki.deger.tur === 'tasarruf' ? 'tasarruf' : k.beklenenEtki.deger.tur === 'sonuc_artisi' ? 'daha çok sonuç' : 'bütçe hızı düzelir'}
                      {k.beklenenEtki.deger.adet !== null && ` (${k.beklenenEtki.deger.adet.toLocaleString('tr-TR')})`}
                    </span>
                  ) : (
                    <BosHucre neden={k.beklenenEtki.emptyReason} clientId={clientId} kisa />
                  )}
                </div>
              </div>
              {dugmeler.length > 0 && (
                <div className="flex flex-row flex-wrap gap-2 sm:min-w-[9.5rem] sm:flex-col sm:items-stretch">
                  {dugmeler.map((d) => (
                    <Dugme
                      key={d}
                      ton={d === 'uygula' ? 'birincil' : d === 'geri_al' ? 'ikincil' : 'sade'}
                      bekliyor={islem?.id === k.id && islem.eylem === d}
                      disabled={islem !== null}
                      onClick={() => void yap(k, d)}
                    >
                      {d === 'uygula' ? oneriEylemEtiketi(k.eylem) : d === 'gec' ? 'Şimdilik geç' : 'Geri al'}
                    </Dugme>
                  ))}
                </div>
              )}
            </div>
            {!ONERI_UYGULAMA_ACIK && k.durum === 'yeni' && <p className="mt-3 text-xs text-ink-muted">Şimdilik yalnız bilgi. Uygulama düğmesi sonraki adımda açılıyor.</p>}
            {durumMetni && <p className={`mt-3 text-sm ${k.durum === 'uygulandi' || k.durum === 'geri_alindi' ? 'text-ok-strong' : 'text-ink-muted'}`}>{durumMetni}</p>}
            {k.platformMesaji && (
              <p role="alert" className="mt-2 text-sm text-danger-strong">
                Platform: {k.platformMesaji}
              </p>
            )}
            {hata[k.id] && (
              <p role="alert" className="mt-2 text-sm text-danger-strong">
                {hata[k.id]}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
