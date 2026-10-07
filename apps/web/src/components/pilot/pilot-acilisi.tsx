import Link from 'next/link';
import { KENDILIGINDEN_UYGULAMA } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { BosHucre } from './kaynak-cipi';
import { KurulumKarti } from './kurulum-karti';
import { OneriKartlari } from './oneri-kartlari';
import { ONERI_BOS_METNI, acilisBasligi, bugunKutulari, kurulumPlanlari, okumaHatasi, pilotAdresi, pilotUcAdresi } from './hesap';
import type { PilotBugun, PilotKurulumYaniti, PilotOneriListesi, PilotPlanListesi } from '@advetics/shared';

/**
 * ═══ ADVCAMPAIGN AÇILIŞI: PİLOT ═══
 *
 * Sohbet değil "bugün ne oldu, ne bekliyor" (AJAN-PLANI §3, ürün kararı):
 * dünkü özet → kurulum (onaylı planlar) → karar bekleyen kartlar → gece ne
 * yapıldı. Sohbet kalkmadı, eski ekranın arkasında (`?eski=1`).
 *
 * HER BÖLÜM KENDİ HÂLİNİ TAŞIR. Üç okuma birbirinden bağımsız: öneri listesi
 * düştüyse bugün özeti yine görünür ve düşen bölüm KENDİ cümlesiyle yazar.
 * Tek bir hata kutusu, çalışan iki bölümü de saklardı; tek bir "boş" ise
 * "tarama hiç koşmadı" ile "koştu, öneri yok"u aynı ekrana çevirirdi.
 *
 * KURULUM EN ÜSTTE kartlardan önce: onaylanmış bir planın yarıda kalan
 * kurulumu, bütçesi zaten onaylanmış para; bekleyen her öneriden önce gelir.
 */
const KURULUM_GOSTERILEN = 3;

type Okuma<T> = { ok: true; v: T } | { ok: false; hata: string };
const oku = <T,>(p: Promise<T>): Promise<Okuma<T>> =>
  p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
  );

export async function PilotAcilisi({
  clientId,
  workspaceAdi,
  planOkuyabilir,
  uygulayabilir,
}: {
  clientId: string;
  workspaceAdi: string | null;
  /** `strategy.read`: kurulum listesi plan uçlarından okunuyor. */
  planOkuyabilir: boolean;
  /** `bulk.publish`. */
  uygulayabilir: boolean;
}) {
  const simdi = new Date().toISOString();
  const [bugun, oneriler, planlar] = await Promise.all([
    oku(serverApiFetch<PilotBugun>(baglanti(pilotUcAdresi('/pilot/bugun'), { clientId }))),
    oku(serverApiFetch<PilotOneriListesi>(baglanti(pilotUcAdresi('/pilot/oneriler'), { clientId }))),
    planOkuyabilir ? oku(serverApiFetch<PilotPlanListesi>(baglanti(pilotUcAdresi('/pilot/planlar'), { clientId }))) : null,
  ]);

  const kurulacaklar = planlar?.ok ? kurulumPlanlari(planlar.v.planlar) : [];
  const kurulumlar = await Promise.all(
    kurulacaklar.slice(0, KURULUM_GOSTERILEN).map((p) => oku(serverApiFetch<PilotKurulumYaniti>(pilotUcAdresi('/pilot/planlar/:id/kurulum', p.id)))),
  );

  const bekleyen = oneriler.ok ? oneriler.v.kartlar.filter((k) => k.durum === 'yeni').length : 0;
  const para = bugun.ok ? bugun.v.paraBirimi : null;
  const sonTarama = bugun.ok ? bugun.v.sonTarama : null;

  return (
    <div className="space-y-5">
      <SayfaBasligi
        baslik="AdvCampaign"
        aciklama={
          <>
            {workspaceAdi && <strong className="font-medium text-ink">{workspaceAdi}</strong>}
            {workspaceAdi && ' · '}
            Hesabı her gece tarar, değişikliği sen onaylarsın.
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-7">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-baslik text-2xl font-bold tracking-tight text-ink">{oneriler.ok ? acilisBasligi(bekleyen) : 'Bugün'}</h2>
            <p className="mt-1 text-sm text-ink-muted">Uygula dediğin an yapılır, geri almak tek dokunuş.</p>
          </div>
          {sonTarama && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink-muted/35 px-2 py-px text-[11.5px] text-ink-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-muted/60" />
              son tarama {saat(sonTarama.bitis)}
            </span>
          )}
        </header>

        {/* ─── Bugün ─── */}
        {bugun.ok ? (
          <section aria-label="Bugün" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {bugunKutulari(bugun.v).map((k) => (
              <div key={k.etiket} className="min-w-0 bg-surface px-4 py-3.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{k.etiket}</p>
                {k.deger !== null ? (
                  <p className="mt-0.5 font-baslik text-xl font-bold tabular-nums text-ink">{k.deger}</p>
                ) : k.bos ? (
                  <div className="mt-1">
                    <BosHucre neden={k.bos} clientId={clientId} kisa />
                  </div>
                ) : null}
                {k.hiz && (
                  <div
                    className="relative mt-2 h-1.5 rounded-full bg-surface-sunken"
                    role="img"
                    aria-label={`Bütçenin yüzde ${k.hiz.harcananYuzde} kadarı harcandı, ayın yüzde ${k.hiz.gecenYuzde} kadarı geçti`}
                  >
                    <i className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${k.hiz.harcananYuzde}%` }} />
                    <b className="absolute -top-1 h-3.5 w-0.5 bg-brand" style={{ left: `${k.hiz.gecenYuzde}%` }} />
                  </div>
                )}
                {k.alt && <p className="mt-1 text-xs text-ink-muted">{k.alt}</p>}
              </div>
            ))}
          </section>
        ) : (
          <Uyari ton="tehlike" baslik="Bugünün özeti alınamadı.">
            {bugun.hata}
          </Uyari>
        )}

        {/* ─── Kurulum ─── */}
        {planlar && !planlar.ok && (
          <Uyari ton="tehlike" baslik="Planlar alınamadı.">
            {planlar.hata}
          </Uyari>
        )}
        {kurulumlar.length > 0 && (
          <section className="space-y-3">
            {kurulumlar.map((k, i) =>
              k.ok ? (
                <KurulumKarti key={k.v.plan.id} clientId={clientId} k={k.v} />
              ) : (
                <Uyari key={kurulacaklar[i]!.id} ton="tehlike" baslik="Kurulum durumu alınamadı.">
                  {k.hata}
                </Uyari>
              ),
            )}
            {kurulacaklar.length > KURULUM_GOSTERILEN && (
              <p className="text-xs text-ink-muted">
                {KURULUM_GOSTERILEN} plan gösteriliyor, toplam {kurulacaklar.length}.
              </p>
            )}
          </section>
        )}

        {/* ─── Karar bekleyen ─── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-baslik text-lg font-bold text-ink">Karar bekleyen</h3>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">en çok para etkileyen üstte</span>
          </div>
          {!oneriler.ok ? (
            <Uyari ton="tehlike" baslik="Öneriler alınamadı.">
              {oneriler.hata}
            </Uyari>
          ) : oneriler.v.kartlar.length === 0 ? (
            <OneriBos neden={oneriler.v.emptyReason} mesaj={oneriler.v.taramaMesaji} />
          ) : (
            <>
              <OneriKartlari kartlar={oneriler.v.kartlar} clientId={clientId} paraBirimi={para} uygulayabilir={uygulayabilir} simdi={simdi} />
              {oneriler.v.gosterilen < oneriler.v.toplam && (
                <p className="text-xs text-ink-muted">
                  {oneriler.v.gosterilen} kart gösteriliyor, toplam {oneriler.v.toplam}.
                </p>
              )}
            </>
          )}
        </section>

        {/* ─── Gece ne yapıldı ─── */}
        {sonTarama && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="font-baslik text-lg font-bold text-ink">Gece ne yaptım</h3>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">yalnız okuma</span>
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface px-5 text-sm">
              <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-2.5">
                <time className="text-xs text-ink-muted">{saat(sonTarama.bitis)}</time>
                <span>
                  {sonTarama.taranan.reklam.toLocaleString('tr-TR')} reklamı, {sonTarama.taranan.kelime.toLocaleString('tr-TR')} kelimeyi ve{' '}
                  {sonTarama.taranan.terim.toLocaleString('tr-TR')} arama terimini taradım; {sonTarama.kartSayisi} öneri çıktı.
                </span>
              </li>
              {sonTarama.not && (
                <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-2.5">
                  <span />
                  <span className="text-ink-muted">{sonTarama.not}</span>
                </li>
              )}
              {!KENDILIGINDEN_UYGULAMA && (
                <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-2.5">
                  <span />
                  <span className="text-ink-muted">Hiçbir şeyi kendiliğinden değiştirmedim. Her değişiklik bir kart ve senin dokunuşunla uygulanıyor.</span>
                </li>
              )}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-ink-muted">
          <Link href={pilotAdresi(clientId, { eski: true })} className="underline decoration-ink-muted/40 underline-offset-2 hover:text-ink">
            Sohbetle reklam kur (eski AdvCampaign ekranı)
          </Link>
        </p>
      </div>
    </div>
  );
}

function OneriBos({ neden, mesaj }: { neden: PilotOneriListesi['emptyReason']; mesaj: string | null }) {
  // Sunucu nedeni söylemediyse "öneri yok" DENMEZ: tarama mı koşmadı, öneri mi
  // çıkmadı bilinmiyor ve yanlış bir iyi haber vermektense bunu yazmak.
  if (!neden) return <Uyari ton="bilgi" baslik="Kart yok.">Nedeni bildirilmedi.</Uyari>;
  const m = ONERI_BOS_METNI[neden];
  return (
    <Uyari ton={neden === 'tarama_dustu' ? 'tehlike' : neden === 'oneri_yok' ? 'basari' : 'bilgi'} baslik={m.baslik}>
      {neden === 'tarama_dustu' && mesaj ? mesaj : m.aciklama}
    </Uyari>
  );
}

function saat(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}
