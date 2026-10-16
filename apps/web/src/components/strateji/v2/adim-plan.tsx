'use client';

import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react';
import {
  REHBER_AMACLARI,
  kalemTarihHatasi,
  stratejiKalemleriKaydetSchema,
  stratejiUcYolu,
  type Dil,
  type KaynakliMetin,
  type StratejiKalemi,
  type StratejiKalemiGirdisi,
  type StratejiSihirbazGirdileri,
} from '@advetics/shared';
import type { StratejiDetayi } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiAdimlarSozlugu } from '@/dil/sozlukler/strateji-v2-adimlar';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Soru } from '@/components/ui/sihirbaz';
import { tutarCoz } from '../hesap';
import { AmacIkonu } from './belge';
import {
  HALKA_CEVRE,
  PLATFORM_ADI,
  amacAdi,
  bolumBasligi,
  bolumKayitGovdesi,
  dagitilmamis,
  halkaYaylari,
  kalemGirdisi,
  kalemKelimeDurumu,
  kalemKelimeMetni,
  kaynakEtiketi,
  kalemPlatformTutarlari,
  konumOzeti,
  kullan,
  payMetni,
  platformToplamlari,
  seciliKelimeGruplari,
  tahminMetni,
  tarihAraligi,
  yasMetni,
  yuzde,
} from './hesap';
import { KalemDuzenleyici } from './kalem-duzenleyici';
import { KelimeBolumu } from './kelime-bolumu';
import { Bildirim, Etiket, yaz } from './ortak';
import { Tutar } from './tutar';

/** Rapordaki yapay zekâ metinleri (kitle Kime adımında onaylandı, burada değil). */
const RAPOR_METINLERI = ['ozet', 'isletme', 'kreatif'] as const;
type PlanMetni = (typeof stratejiAdimlarSozlugu)['tr']['plan'];
type RaporMetni = (typeof RAPOR_METINLERI)[number];

export interface PlanAdimiTutamagi {
  /** "Planı onayla": değişiklikleri ve yapay zekâ metinlerinin kabulünü yazar; başarıda taze detay. */
  onayla: () => Promise<StratejiDetayi | null>;
}

/**
 * ═══ 6 · PLAN — ÖNERİLEN PLAN, KALEM KALEM ═══
 *
 * Üstte bütçe halkası ve kampanya çubukları; altta kalem akordiyonları. Kalem
 * açılınca neden böyle önerildiği (nerede, tarih, bölge, beklenen ya da
 * "Tahmin yok · neden", görsel ve mesaj). Düzenleme kalemin İÇİNDEN; Google
 * Arama kampanyasının kelimeleri de kalemin içinde aranır (Ajan 4 AÇIK-1:
 * kelimesiz Arama kalemi AdvCampaign'e kelimesiz gidiyordu).
 *
 * AÇILIP KAPANAN İÇERİK DOM'DAN ÇIKMAZ: yüksekliği `grid-template-rows` ile
 * değişir, kapalıyken `inert`; geçiş `motion-safe` altında.
 *
 * "PLANI ONAYLA" yapay zekâ metinlerini KABUL eder (kaynak `ajans`): metinler
 * bu ekranda okunuyor ve düğmenin yanında bunu söylüyor. Kabul edilmemiş
 * öneri müşterinin belgesine girmez (`belgeyeGirerMi`); onay olmadan
 * belgenin özeti boş giderdi.
 */
export function AdimPlan({
  detay,
  guncelle,
  yenile,
  tazeSurum,
  girdiler,
  tutamak,
}: {
  detay: StratejiDetayi;
  guncelle: (d: StratejiDetayi) => void;
  yenile: () => Promise<StratejiDetayi | null>;
  tazeSurum: () => Promise<number | null>;
  girdiler: StratejiSihirbazGirdileri | null;
  tutamak: Ref<PlanAdimiTutamagi>;
}) {
  const ml = useSozluk(stratejiAdimlarSozlugu).plan;
  const { dil } = useDil();
  const { plan } = detay;
  const para = plan.paraBirimi;
  const kayitliTaslak = useMemo(() => detay.kalemler.map((k) => kalemGirdisi(k, para)), [detay.kalemler, para]);
  const [taslak, setTaslak] = useState<StratejiKalemiGirdisi[]>(kayitliTaslak);
  const [kirli, setKirli] = useState(false);
  const [acik, setAcik] = useState<number | null>(0);
  const [duzenle, setDuzenle] = useState<number | null>(null);
  const [metinler, setMetinler] = useState<Partial<Record<RaporMetni, { metin: string; kaynak: KaynakliMetin['kaynak'] }>>>(() => metinTaslagi(detay.bolumler));
  const [hata, setHata] = useState<string | null>(null);

  // Sunucudan taze detay gelince (kelime araması, metin önerisi) KAYDEDİLMEMİŞ
  // düzenleme yoksa taslak tazelenir; varsa kullanıcının yazdığı ezilmez.
  useEffect(() => {
    if (!kirli) setTaslak(kayitliTaslak);
  }, [kayitliTaslak, kirli]);

  const degistir = (i: number, k: StratejiKalemiGirdisi) => {
    setTaslak((x) => x.map((y, j) => (j === i ? k : y)));
    setKirli(true);
    setHata(null);
  };

  /* Ekrandaki sayılar TASLAKTAN: düzenleme halkaya anında yansır. Geçersiz tutarlı kalem 0 sayılır ve hatası kalemde yazar. */
  const sayisal = taslak.map((k) => {
    const t = tutarCoz(k.butce, para);
    return { amac: k.amac, meta: k.meta, google: k.google, metaPayi: k.metaPayi, butceMicros: t.tur === 'tamam' ? t.micros.toString() : '0' };
  });
  const toplamlar = platformToplamlari(sayisal, para);
  const yay = halkaYaylari(toplamlar.meta, toplamlar.google);
  const kalan = dagitilmamis(plan.toplamButceMicros, sayisal);
  const kelimeGruplari = seciliKelimeGruplari(detay.kelimeler.satirlar);
  const notlar = detay.sihirbaz?.notlar ?? [];
  const disarida = notlar.filter((n) => n.includes('plana alınmadı'));
  const digerNotlar = notlar.filter((n) => !n.includes('plana alınmadı'));
  const yapayZekaVar = taslak.some((k) => k.kreatifYonergesi?.kaynak === 'ai') || RAPOR_METINLERI.some((b) => metinler[b]?.kaynak === 'ai');

  useImperativeHandle(tutamak, () => ({
    async onayla() {
      setHata(null);
      if (taslak.length === 0) {
        setHata(ml.kampanyaYok);
        return null;
      }
      for (const [i, k] of taslak.entries()) {
        const t = tutarCoz(k.butce, para);
        const sorun = t.tur !== 'tamam' ? ml.sorunButce : kalemTarihHatasi(k, plan) ?? (k.konumlar.length === 0 ? ml.sorunBolge : null);
        if (sorun) {
          setAcik(i);
          setHata(`${amacAdi(k.amac)}: ${sorun}.`);
          return null;
        }
      }
      if (kalan < 0n) {
        setHata(ml.butceAsiyor);
        return null;
      }
      const id = { id: plan.id };
      let d = detay;
      // Kalemler: değiştiyse ya da kabul edilecek yapay zekâ yönergesi varsa.
      const kabul = taslak.map((k) => ({ ...k, kreatifYonergesi: k.kreatifYonergesi ? kullan(k.kreatifYonergesi) : null }));
      if (kirli || kabul.some((k, i) => k.kreatifYonergesi?.kaynak !== taslak[i]!.kreatifYonergesi?.kaynak)) {
        const govde = stratejiKalemleriKaydetSchema.safeParse({ surum: d.plan.surum, kalemler: kabul });
        if (!govde.success) {
          setHata(govde.error.issues[0]?.message ?? ml.kampanyaEksik);
          return null;
        }
        const r = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/kalemler', id), 'PUT', govde.data, tazeSurum, d.plan.surum, dil);
        if (r.tur !== 'tamam') {
          setHata(r.mesaj);
          return null;
        }
        d = r.veri;
        setKirli(false);
      }
      // Rapor metinleri: yapay zekâ önerisi bu ekranda okundu; onay = kabul.
      const kabulMetin = Object.fromEntries(RAPOR_METINLERI.flatMap((b) => (metinler[b] ? [[b, { metin: metinler[b]!.metin, kaynak: 'ajans' as const }]] : []))) as Partial<Record<RaporMetni, { metin: string; kaynak: 'ajans' }>>;
      const bolumGovdesi = bolumKayitGovdesi(d.bolumler, kabulMetin, RAPOR_METINLERI);
      if (Object.keys(bolumGovdesi).length > 0) {
        const r = await yaz<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id/bolumler', id), 'PUT', { surum: d.plan.surum, bolumler: bolumGovdesi }, tazeSurum, d.plan.surum, dil);
        if (r.tur !== 'tamam') {
          setHata(ml.metinlerKaydedilemedi(r.mesaj));
          return null;
        }
        d = r.veri;
      }
      guncelle(d);
      return d;
    },
  }));

  return (
    <>
      <Soru ust={ml.ust} soru={ml.soru} aciklama={ml.aciklama} />

      {plan.durum === 'revizyon' && plan.revizyonNotu && (
        <div className="mb-4">
          <Bildirim hata baslik={ml.musteriDegisiklikIstedi}>
            {plan.revizyonNotu}
          </Bildirim>
        </div>
      )}

      <Kart baslik={ml.butceDagilimi} className="mb-6">
        <div className="grid items-center gap-7 md:grid-cols-[240px_1fr]">
        <svg viewBox="0 0 200 200" width="220" height="220" className="mx-auto max-w-full" role="img" aria-label={ml.halkaEtiketi(Math.round(yuzde(toplamlar.meta, toplamlar.meta + toplamlar.google)), Math.round(yuzde(toplamlar.google, toplamlar.meta + toplamlar.google)))}>
          <circle cx="100" cy="100" r="70" fill="none" className="stroke-ink/10" strokeWidth="26" />
          <circle cx="100" cy="100" r="70" fill="none" className="stroke-ink" strokeWidth="26" strokeDasharray={`${yay.meta} ${HALKA_CEVRE}`} transform="rotate(-90 100 100)" />
          <circle cx="100" cy="100" r="70" fill="none" className="stroke-brand" strokeWidth="26" strokeDasharray={`${yay.google} ${HALKA_CEVRE}`} strokeDashoffset={-yay.meta} transform="rotate(-90 100 100)" />
          <text x="100" y="98" textAnchor="middle" className="tutar fill-ink" fontWeight="800" fontSize="19">
            {(BigInt(plan.toplamButceMicros) / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} {para === 'TRY' ? '₺' : para}
          </text>
          <text x="100" y="120" textAnchor="middle" fontSize="12" className="fill-ink-muted">
            {ml.donemToplami}
          </text>
        </svg>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-ink-muted">
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-ink align-[-1px]" />
              Meta <Tutar micros={toplamlar.meta} para={para} />
            </span>
            <span>
              <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-[-1px]" />
              Google <Tutar micros={toplamlar.google} para={para} />
            </span>
          </div>
          {sayisal.map((k, i) => {
            const t = kalemPlatformTutarlari(k, para);
            const pay = BigInt(plan.toplamButceMicros);
            return (
              <div key={i} className="my-2.5 grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{amacAdi(k.amac)}</span>
                <span className="flex h-3 overflow-hidden rounded-md bg-ink/10">
                  <span className="block h-full bg-ink" style={{ width: `${yuzde(t.meta, pay)}%` }} />
                  <span className="block h-full bg-brand" style={{ width: `${yuzde(t.google, pay)}%` }} />
                </span>
                <Tutar micros={k.butceMicros} para={para} className="text-right" />
              </div>
            );
          })}
          <p className="m-0 mt-2 text-[12.5px] text-ink-muted">{ml.toplanmaz}</p>
          {kalan !== 0n && (
            <p className={`m-0 mt-1.5 text-[12.5px] font-semibold ${kalan < 0n ? 'text-brand-strong' : 'text-ink'}`}>
              {kalan > 0n ? ml.dagitilmamis : ml.butceAsimi}
              <Tutar micros={kalan < 0n ? -kalan : kalan} para={para} />
            </p>
          )}
        </div>
        </div>
      </Kart>

      <div className="grid gap-3">
        {taslak.map((k, i) => {
          const kayitli: StratejiKalemi | undefined = detay.kalemler.find((x) => x.id === k.id);
          return (
            <KalemAkordiyonu
              key={k.id ?? i}
              k={k}
              kayitli={kayitli ?? null}
              para={para}
              acik={acik === i}
              ac={() => setAcik(acik === i ? null : i)}
              birincil={i === 0}
              kirli={kirli}
              ml={ml}
              dil={dil}
            >
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Dugme ton="ikincil" boyut="kucuk" aria-expanded={duzenle === i} onClick={() => setDuzenle(duzenle === i ? null : i)}>
                  {duzenle === i ? ml.duzenlemeyiKapat : ml.buKampanyayiDuzenle}
                </Dugme>
              </div>
              <div className="mt-3">
                <KalemDuzenleyici
                  acik={duzenle === i}
                  k={k}
                  degistir={(y) => degistir(i, y)}
                  sil={() => {
                    setTaslak((x) => x.filter((_, j) => j !== i));
                    setKirli(true);
                    setDuzenle(null);
                  }}
                  plan={plan}
                  para={para}
                  konumHesabi={girdiler?.konumHesabi ?? null}
                  ozelKategori={girdiler?.ozelKategori ?? false}
                  kilitli={false}
                  planId={plan.id}
                  kalemKayitli={!!kayitli && !kirli}
                />
              </div>
              {kalemKelimeDurumu(k, kelimeGruplari) !== 'gerekmez' && (
                <div className="mt-3 space-y-2">
                  {kalemKelimeDurumu(k, kelimeGruplari) !== 'tamam' && <p className="m-0 text-[13px] font-semibold text-brand-strong">{kalemKelimeMetni(kalemKelimeDurumu(k, kelimeGruplari) as 'eksik' | 'bos_grup', dil)}</p>}
                  <KelimeBolumu
                    detay={detay}
                    duzenlenebilir
                    yenile={yenile}
                    tazeSurum={tazeSurum}
                    aramaKalemleri={[{ index: i, ad: amacAdi(k.amac), kelimeGrubu: k.kelimeGrubu }]}
                    grubaBagla={(j, grup) => degistir(j, { ...taslak[j]!, kelimeGrubu: grup })}
                  />
                </div>
              )}
            </KalemAkordiyonu>
          );
        })}
      </div>

      {disarida.length > 0 && (
        <div className="mt-4">
          <Bildirim baslik={ml.hedeflerAlinmadi}>
            {disarida.map((n) => (
              <span key={n} className="block">
                {n}
              </span>
            ))}
          </Bildirim>
        </div>
      )}

      {(digerNotlar.length > 0 || detay.riskler.length > 0) && (
        <details className="mt-4 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">{ml.nedenBoyle(digerNotlar.length + detay.riskler.length)}</summary>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[13px] text-ink-muted">
            {detay.riskler.map((r, i) => (
              <li key={`r${i}`} className="text-ink">
                {r.metin}
              </li>
            ))}
            {digerNotlar.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}

      <Kart baslik={ml.raporMetinleri} className="mt-6">
        <p className="m-0 text-[13px] text-ink-muted">{ml.raporMetinleriAciklama}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {RAPOR_METINLERI.map((b) => {
            const m = metinler[b];
            return (
              <label key={b} className="flex min-w-0 flex-col gap-1.5">
                <span className="flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted">
                  {bolumBasligi(b, dil)}
                  {m && <Etiket ton={m.kaynak === 'ai' ? 'kirmizi' : 'cizgi'}>{kaynakEtiketi(m, dil)}</Etiket>}
                </span>
                <textarea
                  className="min-h-[7.5rem] w-full rounded-alan border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none focus:border-brand"
                  maxLength={2000}
                  value={m?.metin ?? ''}
                  placeholder={ml.yazamadi}
                  onChange={(e) => setMetinler((x) => ({ ...x, [b]: e.target.value.trim() === '' ? undefined : { metin: e.target.value, kaynak: 'ajans' } }))}
                />
              </label>
            );
          })}
        </div>
      </Kart>

      {hata && (
        <div className="mt-4">
          <Bildirim hata baslik={ml.planKaydedilemedi}>
            {hata}
          </Bildirim>
        </div>
      )}
      {(kirli || yapayZekaVar) && (
        <p className="m-0 mt-3 text-[12.5px] text-ink-muted">
          {kirli ? `${ml.kaydedilmemis} ` : ''}
          {yapayZekaVar ? ml.onaylaYapayZeka : ''}
        </p>
      )}
    </>
  );
}

function metinTaslagi(b: StratejiDetayi['bolumler']): Partial<Record<RaporMetni, { metin: string; kaynak: KaynakliMetin['kaynak'] }>> {
  const out: Partial<Record<RaporMetni, { metin: string; kaynak: KaynakliMetin['kaynak'] }>> = {};
  for (const k of RAPOR_METINLERI) {
    const m = b[k];
    if (m) out[k] = { metin: m.metin, kaynak: m.kaynak };
  }
  return out;
}

/**
 * Kalemin başlığı (tıklanınca açılır) ve gövdesi. Beklenen sonuç KAYITLI
 * kalemden: tahmin sunucunun (hesabın kendi verisi); kaydedilmemiş bütçe
 * değişikliğinde eski tahmin "kaydedince yeniden hesaplanır" notuyla durur.
 */
function KalemAkordiyonu({
  k,
  kayitli,
  para,
  acik,
  ac,
  birincil,
  kirli,
  ml,
  dil,
  children,
}: {
  k: StratejiKalemiGirdisi;
  kayitli: StratejiKalemi | null;
  para: string;
  acik: boolean;
  ac: () => void;
  birincil: boolean;
  kirli: boolean;
  ml: PlanMetni;
  dil: Dil;
  children: React.ReactNode;
}) {
  const t = tutarCoz(k.butce, para);
  const g = REHBER_AMACLARI[k.amac];
  const nasil = [k.meta && g.meta.kurulacak, k.google && g.google.kurgu ? g.google.kurulacak : null].filter(Boolean).join(' + ');
  const panelId = `kalem-${k.id ?? k.amac}`;
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <button
        type="button"
        aria-expanded={acik}
        aria-controls={panelId}
        onClick={ac}
        className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand sm:grid-cols-[44px_minmax(0,1fr)_auto_auto] sm:px-5"
      >
        <span className={birincil ? '' : 'opacity-90'}>
          <AmacIkonu amac={k.amac} />
        </span>
        <span className="min-w-0">
          <b className="font-baslik block text-base text-ink">{g.ekranAdi}</b>
          <small className="block truncate text-[13px] text-ink-muted">{nasil}</small>
        </span>
        {t.tur === 'tamam' ? <Tutar micros={t.micros} para={para} className="text-lg font-bold text-ink" /> : <span className="text-sm font-semibold text-brand-strong">{ml.tutarGecersiz}</span>}
        <span aria-hidden className={`hidden text-ink-muted motion-safe:transition-transform motion-safe:duration-200 sm:inline ${acik ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      <div id={panelId} className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-[250ms] ${acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} inert={!acik}>
        <div className="overflow-hidden">
          <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
            <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3.5 md:grid-cols-4">
              <Satir etiket={ml.nerede}>
                {payMetni(k, dil)}
                {k.meta && k.google && (
                  <span className="mt-1.5 flex h-1.5 overflow-hidden rounded bg-ink/10">
                    <span className="block h-full bg-ink" style={{ width: `${k.metaPayi ?? 50}%` }} />
                    <span className="block h-full bg-brand" style={{ width: `${100 - (k.metaPayi ?? 50)}%` }} />
                  </span>
                )}
              </Satir>
              <Satir etiket={ml.tarih}>{tarihAraligi(k.baslangic, k.bitis, dil)}</Satir>
              <Satir etiket={ml.bolgeYas}>
                {konumOzeti(k.konumlar, dil)} · {yasMetni(k.yasMin, k.yasMax)}
              </Satir>
              <Satir etiket={ml.beklenen}>
                {kayitli ? (
                  (['meta', 'google'] as const)
                    .filter((p) => k[p])
                    .map((p) => {
                      const x = tahminMetni(kayitli.tahmin[p], k.amac, dil);
                      return (
                        <span key={p} className="block">
                          {k.meta && k.google ? `${PLATFORM_ADI[p]}: ` : ''}
                          {x.veri ? (
                            <>
                              {x.ana} <Etiket>{ml.hesapVerisi}</Etiket>
                            </>
                          ) : (
                            <span className="text-[13px] text-ink-muted">
                              {ml.tahminYok(x.alt)}
                            </span>
                          )}
                        </span>
                      );
                    })
                ) : (
                  <span className="text-[13px] text-ink-muted">{ml.kaydedinceHesaplanir}</span>
                )}
                {kayitli && kirli && <span className="mt-1 block text-[11px] text-ink-muted">{ml.yenidenHesaplanir}</span>}
              </Satir>
              <div className="col-span-2 md:col-span-4">
                <dt className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                  {ml.gorselMesaj} {k.kreatifYonergesi && <Etiket ton={k.kreatifYonergesi.kaynak === 'ai' ? 'kirmizi' : 'cizgi'}>{k.kreatifYonergesi.kaynak === 'ai' ? ml.yapayZeka : ml.ajansYazdi}</Etiket>}
                </dt>
                <dd className="m-0 mt-0.5 text-sm text-ink">{k.kreatifYonergesi?.metin ?? <span className="text-ink-muted">{ml.yonergeYok}</span>}</dd>
                {k.metin && k.metin.basliklar[0] && <dd className="m-0 mt-1 text-[13px] text-ink-muted">{ml.ornekBaslik(k.metin.basliklar[0])}</dd>}
              </div>
            </dl>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Satir({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-ink-muted">{etiket}</dt>
      <dd className="m-0 mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}
