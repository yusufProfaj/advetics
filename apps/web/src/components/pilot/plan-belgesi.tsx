'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { NIYET_KATALOGU, bulgulariSirala, type PlanOnerisi } from '@advetics/shared';
import { API_URL, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { ButceSeridi } from './butce-seridi';
import { BosHucre, HucreDegeri, KaynakCipi } from './kaynak-cipi';
import { DegistirKutusu } from './degistir-kutusu';
import {
  ADIMLAR,
  ARAMA_ESIGI_METNI,
  DURUM_ETIKETI,
  UYUM_DURUM_METNI,
  adimHalleri,
  ajansKipNotu,
  altCubuk,
  ayAdi,
  butceAltSatiri,
  donemEtiketi,
  eylemIstegi,
  gerekceEksigi,
  isaretliMi,
  kampanyaDagilimi,
  kelimeGruplari,
  okumaHatasi,
  onayIstegi,
  onayRetMesajlari,
  para,
  pdfDosyaAdi,
  pilotUcAdresi,
  planAdresi,
  satirCikarIstegi,
  type EylemDugmesi,
} from './hesap';
import type { PilotEkranEylemi, PilotPlanDetayi } from './yanitlar';

/**
 * ═══ ADVSTRATEGY: TEK SAYFA PLAN BELGESİ ═══
 *
 * Yukarıdan aşağı okunur: özet → bütçe şeridi → kampanyalar → kelimeler →
 * alt çubuk. SEKME YOK: eski ekranın dört sekmesi birbirine bağımlıydı
 * (bütçe değişince matris bayatlıyordu) ve hangi sırayla gezileceği
 * söylenmiyordu. Plan bir belge; belge sekmeye bölünmez.
 *
 * KART YALNIZ KARAR BEKLEYENE. Özet ve onay kutuları kart; kampanya
 * satırları ince çizgili liste. Her şeyi kart yapmak hiçbir şeyi öne
 * çıkarmamak demek (pilot-arayuz.html taslağının kuralı).
 *
 * MÜŞTERİ BAŞKA BİR EKRAN GÖRMÜYOR, AYNI BELGENİN SADE HÂLİNİ GÖRÜYOR.
 * Ayrı bir müşteri sayfası, ajansın gördüğü plan ile müşterinin onayladığı
 * planın iki ayrı çizimden geçmesi demekti; biri güncellenip diğeri
 * unutulduğunda müşteri ekranda olmayan bir şeyi onaylardı. Fark yalnız:
 * müşteri `musteriOzeti` cümlelerini okur, uyum/test kipi ona yazılmaz
 * (Ç-4), kaynak çipleri bağlantı değil, yazma düğmeleri yok.
 */

type Islem = { tur: 'bos' } | { tur: 'suruyor'; eylem: string } | { tur: 'hata'; mesaj: string };

export function PlanBelgesi({ clientId, detay, eskiPlanNotu }: { clientId: string; detay: PilotPlanDetayi; eskiPlanNotu: string | null }) {
  const router = useRouter();
  const { plan, icerik, rol } = detay;
  const musteri = rol === 'musteri';
  const izinli = new Set(detay.yapilabilir);
  const [islem, setIslem] = useState<Islem>({ tur: 'bos' });
  const [acikKutu, setAcikKutu] = useState<null | 'adina_onay' | 'degisiklik_iste' | 'iptal' | 'kapat' | 'yeniden_hazirla'>(null);
  const cubuk = altCubuk(detay);
  const adimlar = adimHalleri(plan.durum);
  const ay = ayAdi(plan.donem);
  const suruyor = islem.tur === 'suruyor';

  /*
   * HER YAZMA AYNI YOLDAN: istek → başarıda sayfayı sunucudan yeniden oku.
   * Panel cevabı kendi state'ine yazsaydı ekranda iki gerçek olurdu
   * (sunucunun sürümü ve panelin tahmini) ve onay yanlış sürüme giderdi.
   * Hata SUNUCUNUN cümlesiyle ekranda; yutulmuyor.
   */
  async function yaz(eylem: string, yol: string, govde: unknown, sonra?: (cevap: unknown) => void) {
    setIslem({ tur: 'suruyor', eylem });
    try {
      const cevap = await apiFetch<unknown>(yol, { method: 'POST', body: JSON.stringify(govde) });
      setIslem({ tur: 'bos' });
      setAcikKutu(null);
      if (sonra) sonra(cevap);
      else router.refresh();
    } catch (e) {
      setIslem({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  function eylemYap(e: PilotEkranEylemi) {
    switch (e) {
      case 'musteriye_gonder':
      case 'geri_cek':
      case 'yeniden_dene': {
        const { yol, govde } = eylemIstegi(plan.id, e, plan.surum);
        return void yaz(e, yol, govde);
      }
      case 'onayla':
        // Müşteri: tek dokunuş (alt çubuktaki cümle en çok tutarı zaten söylüyor).
        // Ajans: gerekçe kutusu açılır; gerekçesiz müşteri adına onay yok (S-1).
        if (musteri) return void yaz(e, pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan));
        return setAcikKutu('adina_onay');
      case 'degisiklik_iste':
      case 'iptal':
      case 'kapat':
        return setAcikKutu(e);
      case 'yeniden_hazirla':
        // İlk sürümde elle değişiklik olamaz: uyarı gereksiz bir tıklama olurdu.
        if (plan.surum === 1) return void yeniden(false);
        return setAcikKutu('yeniden_hazirla');
      case 'degistir':
      case 'uyum_isaret':
        return;
    }
  }

  function yeniden(onay: boolean) {
    void yaz('yeniden_hazirla', pilotUcAdresi('/pilot/planlar/:id/yeniden-hazirla', plan.id), { surum: plan.surum, onay }, (c) => {
      const id = (c as { id?: string } | null)?.id;
      router.push(planAdresi(clientId, { plan: id ?? plan.id }));
      router.refresh();
    });
  }

  return (
    <article className="mx-auto flex w-full max-w-[56rem] flex-col gap-7 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            {donemEtiketi(plan.donem)} · {DURUM_ETIKETI[plan.durum]}
          </p>
          <h2 className="mt-1 font-baslik text-2xl font-bold tracking-tight text-ink [text-wrap:balance]">{belgeBasligi(ay, plan.durum, musteri)}</h2>
          <div className="mt-1.5 text-sm text-ink-muted">
            {icerik.ozetMetni.dolu ? (
              <span className="flex flex-col items-start gap-1.5">
                <span className="[text-wrap:pretty]">{icerik.ozetMetni.deger}</span>
                <KaynakCipi kaynak={icerik.ozetMetni.kaynak} clientId={clientId} baglantisiz={musteri} />
              </span>
            ) : musteri ? null : (
              <BosHucre neden={icerik.ozetMetni.emptyReason} clientId={clientId} />
            )}
          </div>
        </div>
        {adimlar && (
          <ol aria-label="Plan durumu" className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
            {ADIMLAR.map((a, i) => (
              <li
                key={a}
                aria-current={adimlar[i] === 'simdi' ? 'step' : undefined}
                className={`flex items-center gap-2 ${adimlar[i] === 'simdi' ? 'font-semibold text-brand-strong' : adimlar[i] === 'bitti' ? 'text-ink' : 'text-ink-muted'}`}
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 rounded-full border-2 ${
                    adimlar[i] === 'bitti' ? 'border-ink bg-ink' : adimlar[i] === 'simdi' ? 'border-brand bg-brand/10' : 'border-line'
                  }`}
                />
                {a}
              </li>
            ))}
          </ol>
        )}
      </header>

      {eskiPlanNotu && !musteri && <Uyari ton="bilgi" baslik={eskiPlanNotu} />}

      {plan.onay?.rol === 'ajans' && (
        <Uyari ton="bilgi" baslik="Ajans müşteri adına onayladı.">
          {plan.onay.gerekce} · {zamanEtiketi(plan.onay.zaman)}
          {plan.onay.kim ? ` · ${plan.onay.kim}` : ''}
        </Uyari>
      )}
      {plan.musteriNotu && plan.durum === 'taslak' && (
        <Uyari ton="uyari" baslik={musteri ? 'Değişiklik isteğin ajansa iletildi.' : 'Müşteri değişiklik istedi.'}>
          {plan.musteriNotu}
        </Uyari>
      )}

      {!musteri && <AjansNotlari detay={detay} izinli={izinli.has('uyum_isaret')} yaz={yaz} suruyor={suruyor} />}

      {/* ─── Özet ─── */}
      {musteri && detay.musteriOzeti ? (
        <section aria-label="Plan özeti" className="rounded-xl border border-line bg-surface p-6">
          <ul className="space-y-2 text-[15px] text-ink">
            {detay.musteriOzeti.cumleler.map((c) => (
              <li key={c} className="[text-wrap:pretty]">
                {c}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Plan özeti" className="grid gap-5 rounded-xl border border-line bg-surface p-6 sm:grid-cols-3">
          <OzetHucresi etiket="Toplam bütçe">
            <HucreDegeri hucre={icerik.toplam} clientId={clientId} goster={(v) => para(v, icerik.paraBirimi)} sinif={OZET_DEGER} baglantisiz={musteri} />
          </OzetHucresi>
          <OzetHucresi etiket="Beklenen sonuç">
            <HucreDegeri hucre={icerik.beklenenSonuc} clientId={clientId} goster={(v) => `~${v.toLocaleString('tr-TR')}`} sinif={OZET_DEGER} baglantisiz={musteri} />
          </OzetHucresi>
          <OzetHucresi etiket="Kampanya">
            <span className="flex flex-col items-start gap-1.5">
              <span className={OZET_DEGER}>{icerik.satirlar.length}</span>
              <span className="text-xs text-ink-muted">{kampanyaDagilimi(icerik) || 'Kampanya yok'}</span>
            </span>
          </OzetHucresi>
        </section>
      )}

      {icerik.engeller.length > 0 && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
          <h3 className="font-baslik text-base font-semibold text-ink">Plan hazırlanamadı</h3>
          <ul className="space-y-2">
            {icerik.engeller.map((n) => (
              <li key={n}>
                <BosHucre neden={n} clientId={clientId} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Bütçe şeridi ─── */}
      {icerik.satirlar.length > 0 && (
        <section className="space-y-3.5">
          <BolumBasligi baslik="Bütçe nereye gidiyor" />
          <ButceSeridi plan={icerik} clientId={clientId} />
        </section>
      )}

      {/* ─── Kampanyalar ─── */}
      {icerik.satirlar.length > 0 && (
        <section className="space-y-3.5">
          <BolumBasligi baslik="Kampanyalar" not={`${icerik.satirlar.length} kampanya`} />
          <KampanyaListesi
            plan={icerik}
            clientId={clientId}
            musteri={musteri}
            cikarabilir={izinli.has('degistir') && !suruyor}
            cikar={(anahtar) => void yaz('degistir', pilotUcAdresi('/pilot/planlar/:id/degistir', plan.id), satirCikarIstegi(plan.surum, anahtar))}
          />
        </section>
      )}

      {/* ─── Kelimeler ─── */}
      <KelimeBolumu plan={icerik} clientId={clientId} musteri={musteri} />

      {/* ─── Değiştir kutusu ─── */}
      {izinli.has('degistir') && <DegistirKutusu planId={plan.id} surum={plan.surum} />}

      {/* ─── Açılan karar kutuları ─── */}
      {acikKutu === 'adina_onay' && (
        <AdinaOnayKutusu
          enCok={detay.musteriOzeti ? para(detay.musteriOzeti.enCokMicros, detay.musteriOzeti.paraBirimi) : null}
          retler={onayRetMesajlari(detay.onayKapisi, 'ajans')}
          suruyor={suruyor}
          vazgec={() => setAcikKutu(null)}
          onayla={(g) => void yaz('onayla', pilotUcAdresi('/pilot/planlar/:id/onayla', plan.id), onayIstegi(plan, g))}
        />
      )}
      {acikKutu === 'degisiklik_iste' && (
        <NotKutusu
          baslik="Ne değişsin?"
          aciklama="Notun ajansına gider; plan yeniden hazırlanınca tekrar onayına gelir."
          dugme="Gönder"
          zorunlu
          suruyor={suruyor}
          vazgec={() => setAcikKutu(null)}
          gonder={(not) => void yaz('degisiklik_iste', pilotUcAdresi('/pilot/planlar/:id/degisiklik-iste', plan.id), { surum: plan.surum, not })}
        />
      )}
      {(acikKutu === 'iptal' || acikKutu === 'kapat') && (
        <OnayIste
          metin={acikKutu === 'iptal' ? 'Plan iptal edilsin mi? Geri alınamaz.' : 'Plan kapatılsın mı? Kurulmayan kampanyalar kurulmaz.'}
          dugme={acikKutu === 'iptal' ? 'İptal et' : 'Planı kapat'}
          suruyor={suruyor}
          vazgec={() => setAcikKutu(null)}
          evet={() => {
            const { yol, govde } = eylemIstegi(plan.id, acikKutu, plan.surum);
            void yaz(acikKutu, yol, govde);
          }}
        />
      )}
      {acikKutu === 'yeniden_hazirla' && (
        <OnayIste
          metin="Plan taze veriyle yeniden hazırlanır. Elle yaptığın değişiklikler korunmaz."
          dugme="Yeniden hazırla"
          suruyor={suruyor}
          vazgec={() => setAcikKutu(null)}
          evet={() => yeniden(true)}
        />
      )}

      {islem.tur === 'hata' && (
        <Uyari ton="tehlike" baslik="İşlem yapılamadı.">
          {islem.mesaj}
        </Uyari>
      )}

      {/* ─── Alt çubuk: tek birincil eylem ─── */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink py-3 pl-5 pr-3 text-surface shadow-acilir">
        <span className="min-w-0 flex-1 basis-56 text-sm [text-wrap:pretty]">{cubuk.metin}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <PdfDugmesi planId={plan.id} donem={plan.donem} surum={plan.surum} />
          {cubuk.ikincil.map((d) => (
            <CubukDugmesi key={d.eylem} d={d} suruyor={islem.tur === 'suruyor' && islem.eylem === d.eylem} kilitli={suruyor} tikla={() => eylemYap(d.eylem)} />
          ))}
          {cubuk.birincil && (
            <Dugme
              bekliyor={islem.tur === 'suruyor' && islem.eylem === cubuk.birincil.eylem}
              disabled={suruyor}
              onClick={() => eylemYap(cubuk.birincil!.eylem)}
            >
              {cubuk.birincil.etiket}
            </Dugme>
          )}
        </div>
      </div>

      {!musteri && (
        <p className="text-center text-xs text-ink-muted">
          <Link href={planAdresi(clientId, { eski: true })} className="underline decoration-ink-muted/40 underline-offset-2 hover:text-ink">
            Eski AdvStrategy ekranı
          </Link>
        </p>
      )}
    </article>
  );
}

const OZET_DEGER = 'font-baslik text-[26px] font-bold leading-tight text-ink';

function belgeBasligi(ay: string, durum: PilotPlanDetayi['plan']['durum'], musteri: boolean): string {
  if (musteri && durum === 'musteride') return `${ay} planı onayını bekliyor`;
  switch (durum) {
    case 'taslak':
      return `${ay} planı hazır`;
    case 'musteride':
      return `${ay} planı müşteride`;
    case 'onaylandi':
    case 'kuruluyor':
      return `${ay} planı onaylandı`;
    case 'kismen_kuruldu':
      return `${ay} planı kısmen kuruldu`;
    case 'kuruldu':
      return `${ay} planı kuruldu`;
    case 'kapatildi':
      return `${ay} planı kapatıldı`;
    case 'iptal':
      return `${ay} planı iptal edildi`;
  }
}

function zamanEtiketi(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function OzetHucresi({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{etiket}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function BolumBasligi({ baslik, not }: { baslik: string; not?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h3 className="font-baslik text-lg font-bold text-ink">{baslik}</h3>
      {not && <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">{not}</span>}
    </div>
  );
}

/*
 * KOYU ÇUBUKTA İKİNCİL DÜĞME. `Dugme`nin "sade" tonu açık zemin için
 * (`text-ink-muted`); className ile ezmek Tailwind'de SINIF SIRASINA değil
 * stil sayfasındaki sıraya bağlı ve hangisinin kazandığı belirsiz. Ayrı
 * ve tek bir sınıf dizisi.
 */
const CUBUK_IKINCIL =
  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-surface/85 transition-colors hover:bg-surface/10 hover:text-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50';

function CubukDugmesi({ d, suruyor, kilitli, tikla }: { d: EylemDugmesi; suruyor: boolean; kilitli: boolean; tikla: () => void }) {
  return (
    <button type="button" className={CUBUK_IKINCIL} disabled={kilitli} aria-busy={suruyor || undefined} onClick={tikla}>
      {suruyor && <span aria-hidden className="advetics-donus h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent" />}
      {d.etiket}
    </button>
  );
}

// ─── Kampanya listesi ──────────────────────────────────────────────────────

function KampanyaListesi({
  plan,
  clientId,
  musteri,
  cikarabilir,
  cikar,
}: {
  plan: PlanOnerisi;
  clientId: string;
  musteri: boolean;
  cikarabilir: boolean;
  cikar: (anahtar: string) => void;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {plan.satirlar.map((s) => {
        const niyet = s.niyet.dolu ? NIYET_KATALOGU[s.niyet.deger].ekranAdi : null;
        const varlikSayisi = s.varliklar?.dolu ? s.varliklar.deger.length : 0;
        const ozet = [niyet, s.kitle?.dolu ? s.kitle.deger.ad : null, s.kelimeGrubu ? `${s.kelimeGrubu.kelimeler.deger.length} kelime` : null, varlikSayisi > 0 ? `${varlikSayisi} görsel` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={s.anahtar} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:px-5">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-lg font-baslik text-[10px] font-bold text-white sm:h-14 sm:w-14"
              style={{ background: s.platform === 'meta' ? 'var(--platform-meta)' : 'var(--platform-google)' }}
            >
              {s.platform === 'meta' ? 'META' : 'G'}
            </span>
            <div className="min-w-0 space-y-1.5">
              <h4 className="font-semibold text-ink [overflow-wrap:anywhere]">{s.ad}</h4>
              {ozet && <p className="text-[13.5px] text-ink-muted">{ozet}</p>}
              <div className="flex flex-wrap gap-1.5">
                {s.kitle?.dolu && <KaynakCipi kaynak={s.kitle.kaynak} clientId={clientId} baglantisiz={musteri} />}
                {s.varliklar?.dolu && s.varliklar.deger[0] && <KaynakCipi kaynak={s.varliklar.deger[0].kaynak} clientId={clientId} baglantisiz={musteri} />}
                {s.kelimeGrubu && <KaynakCipi kaynak={s.kelimeGrubu.kelimeler.kaynak} clientId={clientId} baglantisiz={musteri} />}
                <KaynakCipi kaynak={s.tutar.kaynak} clientId={clientId} baglantisiz={musteri} />
              </div>
              {!musteri && (
                <>
                  {s.kitle && !s.kitle.dolu && <BosHucre neden={s.kitle.emptyReason} clientId={clientId} />}
                  {s.varliklar && !s.varliklar.dolu && <BosHucre neden={s.varliklar.emptyReason} clientId={clientId} />}
                  {!s.niyet.dolu && <BosHucre neden={s.niyet.emptyReason} clientId={clientId} />}
                  {s.engeller.length > 0 && (
                    <ul className="space-y-1.5 rounded-lg bg-surface-sunken px-3 py-2">
                      {s.engeller.map((n) => (
                        <li key={n}>
                          <BosHucre neden={n} clientId={clientId} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.notlar.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-ink-muted">
                      {s.notlar.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className="col-start-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:col-start-3 sm:flex-col sm:items-end sm:text-right">
              <span className="font-baslik text-base font-bold tabular-nums text-ink">{para(s.tutar.deger, plan.paraBirimi)}</span>
              <span className="text-xs text-ink-muted">{butceAltSatiri(s.butce.deger, plan.paraBirimi)}</span>
              {cikarabilir && (
                <button type="button" onClick={() => cikar(s.anahtar)} className="text-xs text-ink-muted underline decoration-ink-muted/40 underline-offset-2 hover:text-ink">
                  Plandan çıkar
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Kelimeler ─────────────────────────────────────────────────────────────

function KelimeBolumu({ plan, clientId, musteri }: { plan: PlanOnerisi; clientId: string; musteri: boolean }) {
  const gruplar = kelimeGruplari(plan);
  if (gruplar.length === 0) return null;
  return (
    <section className="space-y-3.5">
      <BolumBasligi baslik="Google arama kelimeleri" not={ARAMA_ESIGI_METNI} />
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {gruplar.map((g) => (
          <li key={g.anahtar} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5">
            <div className="min-w-0">
              <b className="font-semibold text-ink">{g.grup}</b>
              <small className="block truncate text-[13px] text-ink-muted">
                {g.ornekler.join(', ')}
                {g.kalan > 0 ? ` +${g.kalan}` : ''}
              </small>
            </div>
            <span className="text-[13px] tabular-nums text-ink-muted">~{g.satir.kelimeGrubu!.aylikArama.deger.toLocaleString('tr-TR')} / ay</span>
            <span className="col-span-2 sm:col-span-1">
              <KaynakCipi kaynak={g.satir.kelimeGrubu!.aylikArama.kaynak} clientId={clientId} baglantisiz={musteri} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-center text-xs text-ink-muted">Hacimler Google’ın yuvarladığı değerler. Yakın yazımlar tek sayılıyor.</p>
    </section>
  );
}

// ─── Ajans notları: yayın kipi + uyum ──────────────────────────────────────

function AjansNotlari({
  detay,
  izinli,
  yaz,
  suruyor,
}: {
  detay: PilotPlanDetayi;
  izinli: boolean;
  yaz: (eylem: string, yol: string, govde: unknown) => Promise<void>;
  suruyor: boolean;
}) {
  const kip = ajansKipNotu(detay);
  const retler = detay.plan.durum === 'musteride' ? onayRetMesajlari(detay.onayKapisi, 'ajans') : [];
  const uyum = detay.uyum;
  const bulgular = uyum ? bulgulariSirala(uyum.bulgular) : [];
  if (!kip && retler.length === 0 && !uyum) return null;
  return (
    <div className="space-y-3">
      {kip && <Uyari ton="uyari" baslik={kip} />}
      {retler.length > 0 && (
        <Uyari ton="uyari" baslik="Müşteri şu an onaylayamaz.">
          <ul className="list-disc pl-4">
            {retler.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Uyari>
      )}
      {uyum && (
        <section className="space-y-2.5 rounded-xl border border-line bg-surface p-5">
          <Uyari ton={UYUM_DURUM_METNI[uyum.durum].ton} baslik={UYUM_DURUM_METNI[uyum.durum].metin} />
          {bulgular.length > 0 && (
            <ul className="divide-y divide-line">
              {bulgular.map((b) => {
                const isaretli = isaretliMi(b, uyum.isaretler);
                return (
                  <li key={`${b.kuralKimligi}:${b.yer}`} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1 basis-64 text-sm">
                      <p className="font-semibold text-ink">
                        <span className={b.seviye === 'ENGEL' ? 'text-danger-strong' : b.seviye === 'UYARI' ? 'text-warn-strong' : 'text-ink-muted'}>{b.seviye}</span> · {b.mesaj}
                      </p>
                      <p className="text-ink-muted">{b.neYapmali}</p>
                    </div>
                    {b.seviye === 'UYARI' &&
                      (isaretli ? (
                        <span className="text-xs text-ink-muted">Okundu</span>
                      ) : izinli ? (
                        <Dugme
                          ton="ikincil"
                          boyut="kucuk"
                          disabled={suruyor}
                          onClick={() =>
                            void yaz('uyum_isaret', pilotUcAdresi('/pilot/planlar/:id/uyum-isaret', detay.plan.id), {
                              surum: detay.plan.surum,
                              kuralKimligi: b.kuralKimligi,
                              mesaj: b.mesaj,
                            })
                          }
                        >
                          Okudum, sorumluluk bende
                        </Dugme>
                      ) : null)}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Karar kutuları ────────────────────────────────────────────────────────

function AdinaOnayKutusu({
  enCok,
  retler,
  suruyor,
  vazgec,
  onayla,
}: {
  enCok: string | null;
  retler: string[];
  suruyor: boolean;
  vazgec: () => void;
  onayla: (gerekce: string) => void;
}) {
  const [gerekce, setGerekce] = useState('');
  const eksik = gerekceEksigi(gerekce);
  return (
    <section aria-label="Müşteri adına onay" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h3 className="font-baslik text-base font-semibold text-ink">Müşteri adına onayla</h3>
      <p className="text-sm text-ink-muted">
        Onay yayını başlatır{enCok ? `; en çok ${enCok} harcanır` : ''}. Müşteri planında “Ajans müşteri adına onayladı” ve gerekçeni görür.
      </p>
      {retler.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-warn-strong">
          {retler.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">Gerekçe</span>
        <textarea
          value={gerekce}
          onChange={(e) => setGerekce(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Örnek: Müşteri 7 Ekim toplantısında onayladı, mail yazısı ekte."
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <span className="block text-xs text-ink-muted">{eksik > 0 ? `En az ${eksik} karakter daha.` : 'Yeterli.'}</span>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <Dugme ton="sade" onClick={vazgec} disabled={suruyor}>
          Vazgeç
        </Dugme>
        <Dugme onClick={() => onayla(gerekce)} disabled={eksik > 0} bekliyor={suruyor}>
          Müşteri adına onayla
        </Dugme>
      </div>
    </section>
  );
}

function NotKutusu({
  baslik,
  aciklama,
  dugme,
  zorunlu,
  suruyor,
  vazgec,
  gonder,
}: {
  baslik: string;
  aciklama: string;
  dugme: string;
  zorunlu: boolean;
  suruyor: boolean;
  vazgec: () => void;
  gonder: (not: string) => void;
}) {
  const [not, setNot] = useState('');
  const bos = not.trim().length === 0;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h3 className="font-baslik text-base font-semibold text-ink">{baslik}</h3>
      <p className="text-sm text-ink-muted">{aciklama}</p>
      <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
      <div className="flex flex-wrap justify-end gap-2">
        <Dugme ton="sade" onClick={vazgec} disabled={suruyor}>
          Vazgeç
        </Dugme>
        <Dugme onClick={() => gonder(not.trim())} disabled={zorunlu && bos} bekliyor={suruyor}>
          {dugme}
        </Dugme>
      </div>
    </section>
  );
}

function OnayIste({ metin, dugme, suruyor, vazgec, evet }: { metin: string; dugme: string; suruyor: boolean; vazgec: () => void; evet: () => void }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
      <p className="min-w-0 flex-1 basis-64 text-sm text-ink">{metin}</p>
      <div className="flex gap-2">
        <Dugme ton="sade" onClick={vazgec} disabled={suruyor}>
          Vazgeç
        </Dugme>
        <Dugme ton="ikincil" onClick={evet} bekliyor={suruyor}>
          {dugme}
        </Dugme>
      </div>
    </section>
  );
}

// ─── PDF ───────────────────────────────────────────────────────────────────

/**
 * PDF indirme: hata SUNUCUNUN cümlesiyle (gövde JSON değilse durum kodlu
 * cümle). Bağlantı (`<a href>`) kullanılmadı: API başka kökende ve hata
 * dönerse tarayıcı ham JSON sayfası açardı.
 */
function PdfDugmesi({ planId, donem, surum }: { planId: string; donem: string; surum: number }) {
  const [hal, setHal] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  async function indir() {
    setHal({ tur: 'suruyor' });
    try {
      const res = await fetch(`${API_URL}${pilotUcAdresi('/pilot/planlar/:id/pdf', planId)}`, { credentials: 'include' });
      if (!res.ok) {
        let mesaj = `PDF üretilemedi (HTTP ${res.status}).`;
        try {
          const g = (await res.json()) as { message?: string };
          if (g.message) mesaj = g.message;
        } catch {
          // Gövde JSON değil: durum kodlu cümle kalıyor, ekran yine bir neden gösteriyor.
        }
        setHal({ tur: 'hata', mesaj });
        return;
      }
      const adres = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = adres;
      a.download = pdfDosyaAdi(donem, surum);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(adres), 10_000);
      setHal({ tur: 'bos' });
    } catch {
      setHal({ tur: 'hata', mesaj: 'Sunucuya ulaşılamadı.' });
    }
  }
  return (
    <>
      <button type="button" className={CUBUK_IKINCIL} disabled={hal.tur === 'suruyor'} aria-busy={hal.tur === 'suruyor' || undefined} onClick={() => void indir()}>
        PDF
      </button>
      {hal.tur === 'hata' && (
        <span role="alert" className="basis-full text-xs text-surface/85">
          {hal.mesaj}
        </span>
      )}
    </>
  );
}
