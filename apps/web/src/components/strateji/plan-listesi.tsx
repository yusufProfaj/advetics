'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatMoney } from '@/lib/format';
import { planOlusturSchema, type PlanDetayi, type PlanListesi as PlanListesiVerisi, type PlanOzeti } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { donemEtiketi, stratejiAdresi, ucAdresi, yazmaHatasiSinifla, type StratejiBolumu } from './hesap';
import { DurumRozeti, GIRDI_SINIFI } from './ortak';

/**
 * ═══ WORKSPACE'İN PLANLARI + YENİ PLAN ═══
 *
 * Liste dönem azalan (sunucu sıralıyor) ve TOPLAM yazılı: sunucu listeyi
 * kesiyorsa "N / toplam" görünür. Seçim adreste (`?plan=`), bölüm korunuyor:
 * Matris'e bakarken başka aya geçen kullanıcı yine Matris'te kalmalı.
 */
export function PlanListesi({
  clientId,
  liste,
  seciliId,
  bolum,
  yazabilir,
  varsayilanDonem,
}: {
  clientId: string;
  liste: PlanListesiVerisi;
  seciliId: string | null;
  bolum: StratejiBolumu;
  yazabilir: boolean;
  varsayilanDonem: string;
}) {
  const [formAcik, setFormAcik] = useState(liste.planlar.length === 0 && yazabilir);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-baslik text-base font-semibold text-ink">Planlar</h2>
        {yazabilir && !formAcik && (
          <Dugme boyut="kucuk" onClick={() => setFormAcik(true)}>
            Yeni plan
          </Dugme>
        )}
      </div>

      {formAcik && (
        <YeniPlanFormu clientId={clientId} varsayilanDonem={varsayilanDonem} kapat={() => setFormAcik(false)} kapatilabilir={liste.planlar.length > 0} />
      )}

      {liste.planlar.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-5 text-center text-sm text-ink-muted">
          {/* BOŞ LİSTE NEDENİNİ SÖYLÜYOR: yazabilen ile yalnız okuyabilen için yapılacak iş farklı. */}
          {yazabilir
            ? 'Bu workspace için henüz medya planı yok. İlk planı yukarıdan oluştur.'
            : 'Bu workspace için henüz medya planı yok. Ajansın planı hazırlayınca burada görünür.'}
        </p>
      ) : (
        <nav aria-label="Planlar">
          <ul className="space-y-1.5">
            {liste.planlar.map((p) => (
              <PlanSatiri key={p.id} plan={p} secili={p.id === seciliId} href={stratejiAdresi(clientId, { plan: p.id, bolum })} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            {liste.planlar.length < liste.toplam
              ? `${liste.planlar.length} / ${liste.toplam} plan gösteriliyor`
              : `${liste.toplam} plan`}
          </p>
        </nav>
      )}
    </div>
  );
}

function PlanSatiri({ plan, secili, href }: { plan: PlanOzeti; secili: boolean; href: string }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={secili ? 'page' : undefined}
        className={`block rounded-xl border px-3 py-2.5 text-sm transition-colors ${
          secili ? 'border-brand/40 bg-brand-soft' : 'border-line bg-surface hover:bg-surface-muted'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={`font-semibold ${secili ? 'text-brand-strong' : 'text-ink'}`}>{donemEtiketi(plan.donem)}</span>
          <DurumRozeti durum={plan.durum} />
        </span>
        <span className="mt-0.5 block tabular-nums text-ink-muted">{formatMoney(plan.toplamButceMicros, plan.paraBirimi)}</span>
      </Link>
    </li>
  );
}

/**
 * Yeni taslak plan: dönem + toplam bütçe. Para birimi SORULMUYOR: sunucu
 * workspace'in hesaplarından çözüyor ve hesaplar karışıksa reddedip nedenini
 * söylüyor (sözleşme `planOlusturSchema`). Ekranın tahmin etmesi, sunucunun
 * çözdüğünden farklı bir birim gösterme riski demekti.
 */
function YeniPlanFormu({
  clientId,
  varsayilanDonem,
  kapat,
  kapatilabilir,
}: {
  clientId: string;
  varsayilanDonem: string;
  kapat: () => void;
  kapatilabilir: boolean;
}) {
  const router = useRouter();
  const [donem, setDonem] = useState(varsayilanDonem);
  const [toplam, setToplam] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function olustur(e: FormEvent) {
    e.preventDefault();
    const girdi = planOlusturSchema.safeParse({ clientId, donem, toplamButce: toplam });
    if (!girdi.success) {
      setHata(girdi.error.issues[0]?.message ?? 'Bilgiler eksik.');
      return;
    }
    setHata(null);
    setGonderiliyor(true);
    try {
      /*
       * YANIT ŞEKLİ SÖZLEŞMEDE YAZILI DEĞİL (devir notu). Hem `PlanOzeti`
       * hem `PlanDetayi` kabul ediliyor; ikisinde de kimlik yoksa sessizce
       * listeye dönmek yerine bunu söylüyoruz.
       */
      const r = await apiFetch<PlanOzeti | PlanDetayi | undefined>(ucAdresi('/strateji/planlar'), {
        method: 'POST',
        body: JSON.stringify(girdi.data),
      });
      const id = r && 'plan' in r ? r.plan.id : r?.id;
      if (!id) {
        setHata('Plan oluşturuldu ama sunucu kimliğini döndürmedi. Sayfayı yenileyin.');
        router.refresh();
        return;
      }
      router.push(stratejiAdresi(clientId, { plan: id, bolum: 'butce' }));
      router.refresh();
      kapat();
    } catch (err) {
      // Sürüm yok: yeni plan. 409 burada "bu ay için açık plan var" ve
      // sunucunun cümlesi olduğu gibi gösteriliyor.
      setHata(yazmaHatasiSinifla(err, null, null).mesaj);
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <form onSubmit={olustur} className="space-y-3 rounded-xl border border-line bg-surface p-4" noValidate>
      <p className="font-semibold text-ink">Yeni plan</p>
      <div className="space-y-1">
        <label htmlFor="plan-donem" className="block text-sm text-ink">
          Ay
        </label>
        <input id="plan-donem" type="month" required className={GIRDI_SINIFI} value={donem} onChange={(e) => setDonem(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label htmlFor="plan-toplam" className="block text-sm text-ink">
          Toplam bütçe
        </label>
        <input
          id="plan-toplam"
          inputMode="decimal"
          required
          placeholder="Örn. 200.000"
          className={GIRDI_SINIFI}
          value={toplam}
          onChange={(e) => setToplam(e.target.value)}
        />
        <p className="text-xs text-ink-muted">Para birimi workspace’in reklam hesaplarından alınır.</p>
      </div>
      {hata && <Uyari ton="tehlike">{hata}</Uyari>}
      <div className="flex flex-wrap gap-2">
        <Dugme type="submit" bekliyor={gonderiliyor}>
          Planı oluştur
        </Dugme>
        {kapatilabilir && (
          <Dugme ton="sade" onClick={kapat}>
            Vazgeç
          </Dugme>
        )}
      </div>
    </form>
  );
}
