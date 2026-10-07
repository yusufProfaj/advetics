import Link from 'next/link';
import type { PlanListesi as EskiPlanListesi, STRATEJI_UCLARI } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Uyari } from '@/components/ui/uyari';
import { PlanBelgesi } from './plan-belgesi';
import { PlanHazirla } from './plan-hazirla';
import { DURUM_ETIKETI, donemEtiketi, eskiPlanNotu, okumaHatasi, pilotUcAdresi, planAdresi, planSec } from './hesap';
import type { PilotPlanDetayi, PilotPlanListesi } from '@advetics/shared';

/**
 * ═══ ADVSTRATEGY AÇILIŞI (YENİ) ═══
 *
 * Sunucu bileşeni: liste ve seçili planın detayı sunucuda okunur, belge
 * istemcide çizilir. DÖRT HÂL AYRI:
 *   · istenmedi  → plan yok: "Planı hazırla" (ya da müşteriye "henüz yok")
 *   · yükleniyor → panelin `loading.tsx`i (sunucu okuması sürerken)
 *   · sonuç yok  → planın kendi `engeller`i / boş hücre nedenleri belgede
 *   · düştü      → sunucunun cümlesi; liste düştüyse liste, plan düştüyse plan
 * Hatayı boş listeye çeviren bir yakalayıcı "plan yok" ile "çağrı düştü"yü
 * aynı ekrana çevirirdi ve ajans var olan planın üstüne ikinci plan açmaya
 * kalkardı.
 */
const ESKI_LISTE_YOLU: (typeof STRATEJI_UCLARI)[number]['yol'] = '/strateji/planlar';

export async function PilotPlanSayfasi({
  clientId,
  planParam,
  yazabilir,
}: {
  clientId: string;
  planParam: string | undefined;
  yazabilir: boolean;
}) {
  const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const liste = await serverApiFetch<PilotPlanListesi>(baglanti(pilotUcAdresi('/pilot/planlar'), { clientId })).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
  );
  if (!liste.ok) {
    return (
      <Uyari ton="tehlike" baslik="Planlar alınamadı.">
        {liste.hata}
      </Uyari>
    );
  }

  const secim = planSec(liste.v.planlar, planParam);
  if (!secim.plan) return <PlanHazirla clientId={clientId} bugun={bugun} yazabilir={yazabilir} />;

  const [detay, eski] = await Promise.all([
    serverApiFetch<PilotPlanDetayi>(pilotUcAdresi('/pilot/planlar/:id', secim.plan.id)).then(
      (v) => ({ ok: true as const, v }),
      (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
    ),
    // Eski plan listesi yalnız S-4 uyarısı için. Okunamazsa uyarı YOK ama bu
    // da söylenir: "eski plan yok" ile "bakılamadı" aynı şey değil.
    yazabilir
      ? serverApiFetch<EskiPlanListesi>(baglanti(ESKI_LISTE_YOLU, { clientId })).then(
          (v) => ({ ok: true as const, v }),
          (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
        )
      : null,
  ]);

  const digerleri = liste.v.planlar.filter((p) => p.id !== secim.plan!.id);
  const eskiNot = eski?.ok ? eskiPlanNotu(eski.v.planlar, secim.plan.donem) : null;

  return (
    <div className="space-y-5">
      {secim.adrestekiYok && (
        <Uyari ton="uyari" baslik="Bağlantıdaki plan bu workspace’te bulunamadı.">
          Açık plan gösteriliyor: {donemEtiketi(secim.plan.donem)}.
        </Uyari>
      )}
      {eski && !eski.ok && (
        <p className="mx-auto max-w-[56rem] text-xs text-ink-muted">Eski AdvStrategy planlarına bakılamadı: {eski.hata}</p>
      )}

      {(digerleri.length > 0 || liste.v.gosterilen < liste.v.toplam) && (
        <nav aria-label="Diğer planlar" className="mx-auto flex w-full max-w-[56rem] flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
          {digerleri.map((p) => (
            <Link key={p.id} href={planAdresi(clientId, { plan: p.id })} className="hover:text-ink">
              {donemEtiketi(p.donem)} · {DURUM_ETIKETI[p.durum]}
            </Link>
          ))}
          {liste.v.gosterilen < liste.v.toplam && (
            <span className="text-xs">
              Son {liste.v.gosterilen} plan gösteriliyor, toplam {liste.v.toplam}.
            </span>
          )}
        </nav>
      )}

      {detay.ok ? (
        // `key` PLANDAN VE SÜRÜMDEN: başka plana ya da yeni sürüme geçince açık kutular sıfırlanmalı.
        <PlanBelgesi key={`${detay.v.plan.id}:${detay.v.plan.surum}`} clientId={clientId} detay={detay.v} eskiPlanNotu={eskiNot} />
      ) : (
        <Uyari ton="tehlike" baslik="Plan alınamadı.">
          {detay.hata}
        </Uyari>
      )}

      {yazabilir && secim.plan && ['kuruldu', 'kapatildi', 'iptal'].includes(secim.plan.durum) && (
        <PlanHazirla clientId={clientId} bugun={bugun} yazabilir kompakt />
      )}
    </div>
  );
}
