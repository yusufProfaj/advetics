'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  REHBER_ALAN_ETIKETI,
  stratejiEkrani,
  stratejiPanelAdresi,
  stratejiUcYolu,
  type Permission,
  type StratejiAktarimSonucu,
  type StratejiKalemi,
} from '@advetics/shared';
import type { AktarimOnizlemesi, StratejiDetayi } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { AltCubuk, Soru } from '@/components/ui/sihirbaz';
import { okumaHatasi } from '../hesap';
import { kurulabilirMi, kurulumSirasi, kurulumSatiri, siradakiKalem } from './akis';
import { PLATFORM_ADI, amacAdi, konumOzeti, payMetni, tarihAraligi, yasMetni } from './hesap';
import { Bildirim, Etiket, yaz } from './ortak';
import { Tutar } from './tutar';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };

/**
 * ═══ KAMPANYALARI KUR — TEK TEK ═══ (taslak `simulasyon.html`)
 *
 * "Kampanya i / N": solda sıra (bitti / şimdi / sırada), sağda bu kampanyada
 * NEYİN plandan geldiği, neyin workspace'ten seçileceği ve neyin
 * AdvCampaign'de kullanıcıya kalacağı. Kaynak sunucunun aktarım önizlemesi
 * (`kalemAktarimEngeli` + `rehberdeTamamlanacak`); ekran ikinci bir kural
 * yazmıyor.
 *
 * "Taslağı aç ve sonrakine geç" = kalem başına `POST …/aktar`. Reklam
 * KURMAZ, para harcamaz: AdvCampaign'de dolu bir taslak açar; yayın orada,
 * son kontrolle. Açılmayan (bekleyen) kampanya NEDENİYLE atlanabilir.
 * İlerleme sunucudan türer (kalem durumu): yarıda bırakılan kurulum
 * kaldığı yerden açılır. Sıradaki kalem adreste (`?kalem=`).
 */
export function KampanyaKurulumu({ clientId, ilkDetay, ilkKalem, onizleme, izinler }: { clientId: string; ilkDetay: StratejiDetayi; ilkKalem: string | null; onizleme: Okuma<AktarimOnizlemesi> | null; izinler: readonly Permission[] }) {
  const [detay, setDetay] = useState(ilkDetay);
  const [adresteki, setAdresteki] = useState<string | null>(ilkKalem);
  const [atlanan, setAtlanan] = useState<Set<string>>(new Set());
  const [suruyor, setSuruyor] = useState(false);
  const [sonuclar, setSonuclar] = useState<Record<string, { rehberId: string | null; mesaj: string | null; notlar: string[] }>>({});
  const { plan, kalemler } = detay;
  const para = plan.paraBirimi;
  const simdi = siradakiKalem(kalemler, adresteki, atlanan);
  const liste = kurulumSirasi(kalemler, simdi);
  const kurabilir = izinler.includes('bulk.write');
  const karar = (id: string) => (onizleme?.tur === 'veri' ? (onizleme.v.kalemler.find((x) => x.kalemId === id) ?? null) : null);

  const adresYaz = useCallback(
    (kalem: string | null) => {
      setAdresteki(kalem);
      window.history.pushState(null, '', stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'kur', kalem }));
      window.scrollTo({ top: 0 });
    },
    [clientId, plan.id],
  );
  useEffect(() => {
    const geriTusu = () => {
      const q = new URLSearchParams(window.location.search);
      if (stratejiEkrani(q.get('adim')) === 'kur') setAdresteki(q.get('kalem'));
    };
    window.addEventListener('popstate', geriTusu);
    return () => window.removeEventListener('popstate', geriTusu);
  }, []);

  const tazeSurum = useCallback(async () => {
    try {
      const d = await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: plan.id }));
      setDetay(d);
      return d.plan.surum;
    } catch {
      return null;
    }
  }, [plan.id]);

  const rehberAdresi = (rehberId: string) => baglanti('/reklam', { musteri: clientId, rehber: rehberId });

  if (!kurulabilirMi(plan)) {
    return (
      <Bildirim baslik="Kampanyalar strateji onaylanınca kurulur.">
        {plan.durum === 'onaylandi' ? 'Onaydan sonra strateji değişti; yeniden onaylanmalı.' : 'Müşteri onaylayınca (ya da ajans yöneticisi müşteri adına onaylayınca) burada tek tek kurarsın.'}
      </Bildirim>
    );
  }
  if (onizleme?.tur === 'hata') return <Bildirim hata baslik={`Kurulum önizlemesi alınamadı: ${onizleme.mesaj}`} />;

  // ── Bitiş ──
  if (simdi === null) {
    const acilan = kalemler.filter((k) => k.durum.tur === 'aktarildi');
    const bekleyen = kalemler.filter((k) => k.durum.tur !== 'aktarildi');
    return (
      <div className="bolum-gecis">
        <Soru
          ust="Kurulum tamam"
          soru={`${acilan.length} kampanya AdvCampaign'de hazır`}
          aciklama="Hiçbiri yayında değil, para harcanmadı. Her birini AdvCampaign'de son kez kontrol edip yayına al."
        />
        {bekleyen.length > 0 && (
          <div className="mb-4">
            <Bildirim baslik={`${bekleyen.length} kampanya açılmadı.`}>
              {bekleyen.map((k) => `${amacAdi(k.amac)} (${kurulumSatiri(k, karar(k.id)?.karar ?? null).neden ?? 'atlandı'})`).join(' · ')}
            </Bildirim>
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Link href={baglanti('/reklam', { musteri: clientId })} className={dugmeSinifi('birincil')}>
            AdvCampaign'e git
          </Link>
          <Link href={stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'rapor' })} className={dugmeSinifi('ikincil')}>
            Rapora dön
          </Link>
          {bekleyen.length > 0 && (
            <Dugme ton="hayalet" onClick={() => setAtlanan(new Set())}>
              Atlananlara dön
            </Dugme>
          )}
        </div>
      </div>
    );
  }

  const i = kalemler.findIndex((k) => k.id === simdi);
  const k = kalemler[i]!;
  const o = karar(k.id);
  const s = kurulumSatiri(k, o?.karar ?? null);
  const sonuc = sonuclar[k.id];

  async function ac() {
    setSuruyor(true);
    const r = await yaz<StratejiAktarimSonucu>(stratejiUcYolu('/strateji/v2/planlar/:id/aktar', { id: plan.id }), 'POST', { surum: plan.surum, kalemIdleri: [k.id] }, tazeSurum, plan.surum);
    setSuruyor(false);
    if (r.tur !== 'tamam') return setSonuclar((x) => ({ ...x, [k.id]: { rehberId: null, mesaj: r.mesaj, notlar: [] } }));
    const x = r.veri.kalemler.find((y) => y.kalemId === k.id);
    if (!x) return setSonuclar((y) => ({ ...y, [k.id]: { rehberId: null, mesaj: 'Sunucu bu kampanya için sonuç döndürmedi.', notlar: [] } }));
    if (x.tur === 'engel') return setSonuclar((y) => ({ ...y, [k.id]: { rehberId: x.rehberId, mesaj: kurulumSatiri({ durum: { tur: 'aktarilmadi' } }, { tur: 'engel', engel: x.engel }).neden, notlar: x.notlar } }));
    setSonuclar((y) => ({ ...y, [k.id]: { rehberId: x.rehberId, mesaj: null, notlar: x.notlar } }));
    // Kalem durumu sunucudan: "açıldı" yalnız rehber kimliği dönünce yazılır.
    try {
      setDetay(await apiFetch<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: plan.id })));
      adresYaz(null);
    } catch (e) {
      setSonuclar((y) => ({ ...y, [k.id]: { rehberId: x.rehberId, mesaj: `Taslak açıldı ama strateji yeniden okunamadı: ${okumaHatasi(e)}`, notlar: x.notlar } }));
    }
  }

  const atla = () => {
    setAtlanan((x) => new Set(x).add(k.id));
    adresYaz(null);
  };
  const geri = () => {
    const onceki = kalemler[i - 1];
    if (onceki) adresYaz(onceki.id);
    else window.location.assign(stratejiPanelAdresi({ musteri: clientId, plan: plan.id, adim: 'rapor' }));
  };

  return (
    <div>
      <div key={k.id} className="bolum-gecis">
        <Soru ust={`Kampanya ${i + 1} / ${kalemler.length}`} soru={amacAdi(k.amac)} aciklama="Bu kampanya AdvCampaign'de dolu bir taslak olarak açılacak. Aşağıdakiler plandan gelir; gerisini AdvCampaign soracak." />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <ol className="m-0 list-none overflow-hidden rounded-[14px] border border-line p-0">
          {liste.map((x) => {
            const kk = kalemler.find((y) => y.id === x.id)!;
            const bek = !x.acildi && atlanan.has(x.id);
            return (
              <li key={x.id} className={`grid grid-cols-[26px_1fr] gap-2.5 border-t border-line p-3.5 text-sm first:border-t-0 ${x.hal === 'simdi' ? 'bg-vurgu shadow-[inset_3px_0_0_var(--color-brand)]' : ''}`}>
                <span aria-hidden className={`mt-px grid h-[22px] w-[22px] place-items-center rounded-full border-2 ${x.acildi ? 'border-ink bg-ink text-surface' : 'border-ink/25'}`}>
                  {x.acildi && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.3l2.3 2.3 4.7-5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <button type="button" className="block text-left font-semibold text-ink hover:underline" onClick={() => adresYaz(x.id)}>
                    {amacAdi(kk.amac)}
                  </button>
                  <small className="block text-[12.5px] text-ink-muted">
                    {x.acildi && kk.durum.tur === 'aktarildi' ? (
                      <Link href={rehberAdresi(kk.durum.rehberId)} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                        Taslak açıldı · aç
                      </Link>
                    ) : x.hal === 'simdi' ? (
                      'Şimdi'
                    ) : bek ? (
                      'Atlandı'
                    ) : (
                      'Sırada'
                    )}
                  </small>
                </span>
              </li>
            );
          })}
        </ol>

        <Kart as="div">
          <dl className="m-0 grid grid-cols-[110px_1fr] text-sm sm:grid-cols-[150px_1fr_auto]">
            <Esleme ad="Hedef" deger={amacAdi(k.amac)} kaynak="Plandan" />
            <Esleme ad="Platform" deger={payMetni(k)} kaynak="Plandan" />
            <Esleme ad="Bütçe" deger={<Tutar micros={k.butceMicros} para={para} />} kaynak="Plandan" />
            <Esleme ad="Tarih" deger={tarihAraligi(k.baslangic, k.bitis)} kaynak="Plandan" />
            <Esleme ad="Bölge" deger={konumOzeti(k.konumlar)} kaynak="Plandan" />
            {k.yasMin !== null && <Esleme ad="Yaş" deger={yasMetni(k.yasMin, k.yasMax)} kaynak="Plandan" />}
            <Esleme ad="Metin" deger={metinEslemesi(k)} kaynak={k.metin ? (k.metin.kaynak === 'ajans' ? 'Plandan' : 'Öneri') : null} />
            {k.kelimeGrubu && <Esleme ad="Kelimeler" deger={k.kelimeGrubu} kaynak="Plandan" />}
            {o?.notlar.map((n) => <Esleme key={n} ad="Workspace" deger={n} kaynak="Workspace" />)}
            {o?.rehberdeTamamlanacak.map((a) => <Esleme key={a} ad={REHBER_ALAN_ETIKETI[a]} deger={<span className="font-semibold text-brand-strong">AdvCampaign'de seçilecek</span>} kaynak={null} />)}
            {o?.karar.tur === 'aktarilabilir' &&
              o.karar.dusenler.map((d) => <Esleme key={d.platform} ad={PLATFORM_ADI[d.platform]} deger={<span className="text-brand-strong">Açılmayacak: {d.sebep}</span>} kaynak={null} />)}
          </dl>
          <p className="m-0 mt-3 text-[13px] text-ink-muted">Taslak açmak reklam kurmaz, para harcamaz.</p>
          {s.hal === 'bekliyor' && (
            <div className="mt-3">
              <Bildirim hata baslik="Bu kampanya şu an açılamıyor.">
                {s.neden}
              </Bildirim>
            </div>
          )}
          {sonuc?.mesaj && (
            <div className="mt-3">
              <Bildirim hata baslik={sonuc.mesaj}>
                {sonuc.rehberId && (
                  <Link href={rehberAdresi(sonuc.rehberId)} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
                    Var olan taslağı aç
                  </Link>
                )}
              </Bildirim>
            </div>
          )}
          {!kurabilir && <p className="m-0 mt-3 text-[13px] text-ink-muted">Taslak açmak reklam oluşturma yetkisi ister; bu hesapta yok.</p>}
        </Kart>
      </div>

      <AltCubuk
        geri={{ onClick: geri }}
        not={`${i + 1} / ${kalemler.length}`}
        ek={
          s.hal !== 'hazir' || sonuc?.mesaj ? (
            <Dugme ton="ikincil" onClick={atla}>
              Bu kampanyayı atla
            </Dugme>
          ) : undefined
        }
        devam={s.hal === 'hazir' && kurabilir ? { etiket: 'Taslağı aç ve sonrakine geç', onClick: () => void ac(), bekliyor: suruyor } : null}
      />
    </div>
  );
}

function metinEslemesi(k: StratejiKalemi): ReactNode {
  if (!k.metin) return <span className="font-semibold text-brand-strong">AdvCampaign'de yazılacak</span>;
  return k.metin.kaynak === 'ajans' ? `${k.metin.basliklar.length} başlık, ana metin` : 'Öneri olarak; AdvCampaign’de onaylanır';
}

function Esleme({ ad, deger, kaynak }: { ad: string; deger: ReactNode; kaynak: string | null }) {
  return (
    <>
      <dt className="border-b border-line py-2.5 text-ink-muted">{ad}</dt>
      <dd className="m-0 border-b border-line py-2.5 text-ink">{deger}</dd>
      <dd className="m-0 hidden items-center justify-end border-b border-line py-2.5 sm:flex">{kaynak && <Etiket>{kaynak}</Etiket>}</dd>
    </>
  );
}
