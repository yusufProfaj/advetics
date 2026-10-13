'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AI_METIN_BOLUMLERI,
  AMAC_ASAMASI,
  KALEM_SINIRI,
  STRATEJI_ASAMA_ETIKETI,
  STRATEJI_BELGE_BOLUMLERI,
  stratejiDuzenlenebilirMi,
  stratejiKalemleriKaydetSchema,
  stratejiUcYolu,
  stratejiYapilabilir,
  type KaynakliMetin,
  type Permission,
  type StratejiEylemi,
  type StratejiKalemi,
  type StratejiKalemiGirdisi,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { okumaHatasi, tutarCoz, zamanMetni } from '../hesap';
import { AmacIkonu } from './belge';
import { GonderPaneli } from './gonder';
import {
  PLATFORM_ADI,
  STRATEJI_DURUM_ETIKETI,
  amacAdi,
  asamaDagilimi,
  beklenenKutulari,
  bolumKayitGovdesi,
  dagitilmamis,
  donemMetni,
  kalemGirdisi,
  konumOzeti,
  payMetni,
  platformToplamlari,
  tahminMetni,
  tarihAraligi,
  yuzde,
} from './hesap';
import { KalemDuzenleyici } from './kalem-duzenleyici';
import { Bildirim, GIRDI, Kart, Nokta, Rozet, yaz } from './ortak';
import { Tutar } from './tutar';
import type { StratejiDetayi, StratejiGirdileri, StratejiOnerisi } from '@advetics/shared';

type AiBolum = (typeof AI_METIN_BOLUMLERI)[number];
type BolumTaslagi = Partial<Record<AiBolum, { metin: string; kaynak: KaynakliMetin['kaynak'] }>>;

const PANEL_EYLEM_ETIKETI: Partial<Record<StratejiEylemi, string>> = {
  geri_cek: 'Onaydan geri çek',
  kapat: 'Stratejiyi kapat',
  iptal: 'İptal et',
};

function bolumTaslagi(b: StratejiDetayi['bolumler']): BolumTaslagi {
  const t: BolumTaslagi = {};
  for (const k of AI_METIN_BOLUMLERI) {
    const m = b[k];
    if (m) t[k] = { metin: m.metin, kaynak: m.kaynak };
  }
  return t;
}

/**
 * ═══ EKRAN (a) — STRATEJİ OLUŞTUR / DÜZENLE (ajans) ═══
 *
 * Google Ads planlayıcısının mantığı: solda girdiler ve önerinin dayandığı
 * bilgiler, sağda önerilen strateji (özet kutuları, aşama çubuğu, kalem
 * tablosu, riskler, belge yazıları), altta Kaydet / Müşteriye gönder.
 *
 * TASLAK YEREL, KAYIT TEK SEFERDE: kalemler `PUT …/kalemler` ile sürümlü
 * (409), bölüm metinleri `PUT …/bolumler`. Kaydedilmemiş değişiklik varken
 * onaya göndermek kapalı: onaylanan belge ekranda görünenden farklı olurdu.
 *
 * RİSKLER VE TAHMİN SUNUCUDAN: ikisi de ölçüm, hesap ve geçmiş verisini
 * ister. Taslakta değişen kalemin tahmini "kaydedince hesaplanır" der;
 * ekranın tahmin uydurması kullanıcı kararı 3'ü delerdi.
 */
export function StratejiDuzenleyici({
  detay,
  girdiler,
  izinler,
  yenile,
  tazeSurum,
  kirliBildir,
}: {
  detay: StratejiDetayi;
  girdiler: { tur: 'veri'; v: StratejiGirdileri } | { tur: 'hata'; mesaj: string };
  izinler: readonly Permission[];
  yenile: () => Promise<StratejiDetayi | null>;
  tazeSurum: () => Promise<number | null>;
  kirliBildir: (kirli: boolean) => void;
}) {
  const { plan } = detay;
  const para = plan.paraBirimi;
  const duzenlenebilir = stratejiDuzenlenebilirMi(plan.durum) && izinler.includes('strategy.write');

  const kayitliKalemler = useMemo(() => detay.kalemler.map((k) => kalemGirdisi(k, para)), [detay.kalemler, para]);
  const [kalemler, setKalemler] = useState<StratejiKalemiGirdisi[]>(kayitliKalemler);
  const [bolumler, setBolumler] = useState<BolumTaslagi>(() => bolumTaslagi(detay.bolumler));
  const [acikSatir, setAcikSatir] = useState<number | null>(null);
  const [oneri, setOneri] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hazir'; v: StratejiOnerisi } | { tur: 'hata'; mesaj: string }>({ tur: 'bos' });
  const [kayit, setKayit] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'tamam' } | { tur: 'cakisma' | 'hata'; mesaj: string }>({ tur: 'bos' });
  const [eylem, setEylem] = useState<{ suruyor: StratejiEylemi | null; mesaj: { hata: boolean; metin: string } | null; onayBekleyen: StratejiEylemi | null }>({ suruyor: null, mesaj: null, onayBekleyen: null });
  const [gonderAcik, setGonderAcik] = useState(false);

  // Sunucudan taze plan gelince taslak ona döner AMA yalnız kirli değilse:
  // başkası yazdıysa kullanıcının yazdığı ekranda kalır, hangisinin
  // kalacağına kullanıcı karar verir (409 → "başkası değiştirdi").
  const kalemKirli = JSON.stringify(kalemler) !== JSON.stringify(kayitliKalemler);
  const kayitliBolumler = useMemo(() => bolumTaslagi(detay.bolumler), [detay.bolumler]);
  const bolumKirli = JSON.stringify(bolumler) !== JSON.stringify(kayitliBolumler);
  const kirli = kalemKirli || bolumKirli;
  useEffect(() => kirliBildir(kirli), [kirli, kirliBildir]);
  useEffect(() => {
    if (!kirli) {
      setKalemler(kayitliKalemler);
      setBolumler(kayitliBolumler);
    }
    // Yalnız sunucu hâli değişince: kirli bayrağı değişti diye taslak ezilmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kayitliKalemler, kayitliBolumler]);

  const sunucuKalemi = (k: StratejiKalemiGirdisi): StratejiKalemi | null => {
    const s = k.id ? detay.kalemler.find((x) => x.id === k.id) : undefined;
    if (!s) return null;
    // Bütçe, amaç ya da platform değiştiyse sunucunun tahmini artık bu kalemin değil.
    const g = kalemGirdisi(s, para);
    return g.butce === k.butce && g.amac === k.amac && g.meta === k.meta && g.google === k.google && g.metaPayi === k.metaPayi ? s : null;
  };

  // Ekranda gösterim için kalemin "yanıt" biçimi: tutar çözülemiyorsa 0.
  const gorunum = kalemler.map((k) => {
    const t = tutarCoz(k.butce, para);
    return { ...k, butceMicros: t.tur === 'tamam' ? t.micros.toString() : '0' };
  });
  const asamalar = asamaDagilimi(gorunum, para);
  const platform = platformToplamlari(gorunum, para);
  const kalan = dagitilmamis(plan.toplamButceMicros, gorunum);
  const beklenen = beklenenKutulari(detay.kalemler).slice(0, 2);

  async function oner() {
    setOneri({ tur: 'suruyor' });
    try {
      const v = await apiFetch<StratejiOnerisi>(stratejiUcYolu('/strateji/v2/planlar/:id/oner', { id: plan.id }), { method: 'POST', body: '{}' });
      setOneri({ tur: 'hazir', v });
    } catch (e) {
      setOneri({ tur: 'hata', mesaj: okumaHatasi(e) });
    }
  }

  function oneriyiUygula(v: StratejiOnerisi) {
    // Öneri kalemleri YENİ kalem: kimlik taşımaz (aktarılmış kalem yalnız onaylı planda var, öneri taslakta).
    setKalemler(v.kalemler.map((k) => ({ ...kalemGirdisi(k, para), id: undefined })));
    setBolumler((o) => {
      const t = { ...o };
      for (const b of AI_METIN_BOLUMLERI) {
        const m = v.bolumler[b];
        if (m) t[b] = { metin: m.metin, kaynak: m.kaynak };
      }
      return t;
    });
    setAcikSatir(null);
    setOneri({ tur: 'bos' });
  }

  function kalemEkle() {
    setKalemler((x) => [
      ...x,
      {
        amac: 'SITE',
        meta: true,
        google: true,
        metaPayi: 50,
        butce: '',
        baslangic: plan.baslangic,
        bitis: plan.bitis,
        konumlar: x[0]?.konumlar ?? [],
        yasMin: null,
        yasMax: null,
        kelimeGrubu: null,
        varlikIdleri: [],
        metin: null,
        kreatifYonergesi: null,
        kitleTarifi: null,
        not: null,
      },
    ]);
    setAcikSatir(kalemler.length);
  }

  async function kaydet() {
    const g = stratejiKalemleriKaydetSchema.safeParse({ surum: plan.surum, kalemler });
    if (!g.success) {
      const i = g.error.issues[0];
      const sira = typeof i?.path[1] === 'number' ? `Kampanya ${i.path[1] + 1}: ` : '';
      setKayit({ tur: 'hata', mesaj: `${sira}${i?.message ?? 'Bilgiler eksik.'}` });
      if (typeof i?.path[1] === 'number') setAcikSatir(i.path[1]);
      return;
    }
    setKayit({ tur: 'suruyor' });
    let surum = plan.surum;
    if (kalemKirli) {
      const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/kalemler', { id: plan.id }), 'PUT', g.data, tazeSurum, surum);
      if (r.tur !== 'tamam') return setKayit({ tur: r.tur, mesaj: r.mesaj });
      // Kalem kaydı sürümü artırdı; bölümler YENİ sürümle yazılmalı. İki uç
      // arasında başkası yazarsa bölüm kaydı 409 alır ve bu ekranda söylenir.
      const taze = await yenile();
      if (!taze) return setKayit({ tur: 'hata', mesaj: 'Kampanyalar kaydedildi ama strateji yeniden okunamadı; bölüm yazıları kaydedilmedi. Sayfayı yenileyin.' });
      surum = taze.plan.surum;
    }
    const bolumFarki = bolumKayitGovdesi(kayitliBolumler, bolumler, AI_METIN_BOLUMLERI);
    if (bolumKirli && Object.keys(bolumFarki).length > 0) {
      const govde = { surum, bolumler: bolumFarki };
      const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/bolumler', { id: plan.id }), 'PUT', govde, tazeSurum, surum);
      if (r.tur !== 'tamam') return setKayit({ tur: r.tur, mesaj: r.mesaj });
      await yenile();
    }
    setKayit({ tur: 'tamam' });
  }

  async function eylemYap(e: StratejiEylemi) {
    setEylem({ suruyor: e, mesaj: null, onayBekleyen: null });
    const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/eylem', { id: plan.id }), 'POST', { eylem: e, surum: plan.surum }, tazeSurum, plan.surum);
    setEylem({ suruyor: null, onayBekleyen: null, mesaj: r.tur === 'tamam' ? { hata: false, metin: EYLEM_SONUCU[e] } : { hata: true, metin: r.mesaj } });
    if (r.tur === 'tamam') {
      await yenile();
      if (e === 'onaya_gonder') setGonderAcik(true);
    }
  }

  const yapilabilir = stratejiYapilabilir(plan.durum, izinler).filter((e) => e !== 'onayla' && e !== 'revizyon_iste');
  const gonderilebilir = yapilabilir.includes('onaya_gonder') || plan.durum === 'onayda';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* ── Sol: girdiler ── */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Kart className="p-4">
            <h3 className="font-baslik m-0 mb-3 text-[15px] font-semibold">Plan</h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-ink-muted">Dönem</dt>
              <dd className="m-0">{donemMetni(plan.baslangic, plan.bitis)}</dd>
              <dt className="text-ink-muted">Toplam bütçe</dt>
              <dd className="m-0">
                <Tutar micros={plan.toplamButceMicros} para={para} />
              </dd>
            </dl>
            {duzenlenebilir && (
              <Dugme className="mt-3 w-full" onClick={() => void oner()} bekliyor={oneri.tur === 'suruyor'}>
                Strateji öner
              </Dugme>
            )}
            <p className="m-0 mt-2 text-xs text-ink-muted">Sayılar hesabın verisinden ve Advetics kurallarından; yazılar yapay zekâdan, sayı içermez.</p>
            {oneri.tur === 'hata' && (
              <p className="m-0 mt-2 text-xs text-brand-strong" role="alert">
                Öneri alınamadı: {oneri.mesaj}
              </p>
            )}
          </Kart>

          <Kart className="p-4" etiket="Önerinin dayandığı bilgiler">
            <h3 className="font-baslik m-0 mb-1 text-[15px] font-semibold">Önerinin dayandığı bilgiler</h3>
            <p className="m-0 mb-3 text-xs text-ink-muted">Eksik olan öneriyi daraltır; nedeni yazar.</p>
            {girdiler.tur === 'hata' ? (
              <p className="m-0 text-sm text-brand-strong" role="alert">
                Bilgiler alınamadı: {girdiler.mesaj}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {girdiler.v.satirlar.map((s) => (
                  <li key={s.kod} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-1.5">
                      <Nokta ton={s.durum === 'hazir' ? 'ok' : s.durum === 'eksik' ? 'uyari' : 'notr'} etiket={s.durum === 'hazir' ? 'Hazır' : s.durum === 'eksik' ? 'Eksik' : s.durum === 'bos' ? 'Boş' : 'Bilinmiyor'} />
                    </span>
                    <span className="min-w-0">
                      {s.baslik}
                      {s.ayrinti && <span className="block text-[11px] text-ink-muted">{s.ayrinti}</span>}
                      {s.baglanti && (
                        <Link href={s.baglanti} className="text-[11px] text-brand-strong underline-offset-2 hover:underline">
                          Tamamla
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Kart>
        </aside>

        {/* ── Sağ: önerilen strateji ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {oneri.tur === 'hazir' && (
            <Bildirim
              baslik={`Öneri hazır: ${oneri.v.kalemler.length} kampanya.`}
              eylem={
                <span className="flex gap-2">
                  <Dugme boyut="kucuk" onClick={() => oneriyiUygula(oneri.v)}>
                    {kalemler.length > 0 ? `Mevcut ${kalemler.length} kampanyanın yerine uygula` : 'Uygula'}
                  </Dugme>
                  <Dugme ton="sade" boyut="kucuk" onClick={() => setOneri({ tur: 'bos' })}>
                    Vazgeç
                  </Dugme>
                </span>
              }
            >
              {oneri.v.notlar.map((n) => (
                <span key={n} className="block">
                  {n}
                </span>
              ))}
              {oneri.v.uretilemeyen.map((u) => (
                <span key={u.bolum} className="block">
                  {STRATEJI_BELGE_BOLUMLERI.find((b) => b.kod === u.bolum)?.baslik ?? u.bolum}: öneri üretilemedi ({u.neden}).
                </span>
              ))}
              <span className="block">Uygulamak kaydetmez; kontrol edip Kaydet'e bas.</span>
            </Bildirim>
          )}

          <Kart>
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
              <OzetKutusu etiket="Toplam bütçe" secili>
                <Tutar micros={plan.toplamButceMicros} para={para} className="text-[22px] font-bold" />
                <span className="block text-[11px] text-ink-muted">Plan · {donemMetni(plan.baslangic, plan.bitis)}</span>
              </OzetKutusu>
              {[0, 1].map((i) => {
                const b = beklenen[i];
                return (
                  <OzetKutusu key={i} etiket={b ? `Beklenen ${b.birim} · ${PLATFORM_ADI[b.platform]}` : 'Beklenen sonuç'}>
                    <span className="font-baslik text-[22px] font-bold">{b ? (b.alt === b.ust ? b.alt.toLocaleString('tr-TR') : `${b.alt.toLocaleString('tr-TR')}-${b.ust.toLocaleString('tr-TR')}`) : i === 0 ? 'Tahmin yok' : '-'}</span>
                    <span className="block text-[11px] text-ink-muted">{b ? 'Hesap verisi · son aylar' : i === 0 ? 'Hesabın geçmiş verisi yok' : 'Platformlar toplanmaz'}</span>
                  </OzetKutusu>
                );
              })}
              <OzetKutusu etiket="Kampanya">
                <span className="font-baslik text-[22px] font-bold">{kalemler.length}</span>
                <span className="block text-[11px] text-ink-muted">{detay.riskler.length > 0 ? `${detay.riskler.length} risk notu` : 'Risk notu yok'}</span>
              </OzetKutusu>
            </div>
            <div className="p-4">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <b className="text-sm">Bütçe nereye gidiyor</b>
                <Lejant />
              </div>
              {asamalar.map((a) => (
                <div key={a.asama} className="my-2 grid grid-cols-[80px_1fr_96px] items-center gap-2.5 text-[13px] sm:grid-cols-[110px_1fr_120px]">
                  <span>{STRATEJI_ASAMA_ETIKETI[a.asama]}</span>
                  <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-ink/[0.07]">
                    <span className="block h-full bg-ink" style={{ width: `${yuzde(a.meta, BigInt(plan.toplamButceMicros))}%` }} />
                    <span className="block h-full bg-brand" style={{ width: `${yuzde(a.google, BigInt(plan.toplamButceMicros))}%` }} />
                  </div>
                  <Tutar micros={a.toplam} para={para} className="text-right text-[13px]" />
                </div>
              ))}
              <p className="m-0 mt-1.5 text-[11px] text-ink-muted">Advetics kuralı: önce sonuç getiren kampanyanın öğrenme tabanı, kalanı tanıtıma. Meta ve Google sonuçları toplanmaz.</p>
            </div>
          </Kart>

          <Kart>
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-2">
              <div>
                <b className="text-sm">Kampanyalar</b>
                <div className="text-xs text-ink-muted">Her satır AdvCampaign'de bir reklam olur. Satıra tıkla, düzenle.</div>
              </div>
              {duzenlenebilir && (
                <Dugme ton="ikincil" boyut="kucuk" onClick={kalemEkle} disabled={kalemler.length >= KALEM_SINIRI}>
                  + Kampanya ekle
                </Dugme>
              )}
            </div>
            <div className="overflow-x-auto" role="region" aria-label="Kampanyalar" tabIndex={0}>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th className="w-6 px-2.5 py-2" />
                    <th className="px-2.5 py-2 font-semibold">Ne istiyoruz</th>
                    <th className="px-2.5 py-2 font-semibold">Nerede</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Bütçe</th>
                    <th className="hidden px-2.5 py-2 font-semibold md:table-cell">Tarih</th>
                    <th className="hidden px-2.5 py-2 font-semibold md:table-cell">Bölge</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Beklenen</th>
                  </tr>
                </thead>
                <tbody>
                  {kalemler.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-ink-muted">
                        {duzenlenebilir ? 'Henüz kampanya yok. "Strateji öner" ile başla ya da elle ekle.' : 'Bu stratejide kampanya yok.'}
                      </td>
                    </tr>
                  )}
                  {kalemler.map((k, i) => {
                    const s = sunucuKalemi(k);
                    const acik = acikSatir === i;
                    const riskli = detay.riskler.some((r) => r.kalem === i + 1);
                    return (
                      <Fragment key={k.id ?? `yeni-${i}`}>
                        <tr
                          className={`cursor-pointer border-b border-line align-top transition-colors hover:bg-surface-muted ${acik ? 'bg-surface-muted' : ''}`}
                          aria-expanded={acik}
                          tabIndex={0}
                          onClick={() => setAcikSatir(acik ? null : i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setAcikSatir(acik ? null : i);
                            }
                          }}
                        >
                          <td className="px-2.5 py-2.5">
                            <span className="mt-1.5 inline-block">
                              <Nokta ton={riskli ? 'uyari' : s ? 'ok' : 'notr'} etiket={riskli ? 'Risk notu var' : s ? 'Kayıtlı' : 'Kaydedilmedi'} />
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div className="flex items-start gap-2.5">
                              <AmacIkonu amac={k.amac} />
                              <div>
                                <b className="block font-semibold">{amacAdi(k.amac)}</b>
                                <span className="text-xs text-ink-muted">{STRATEJI_ASAMA_ETIKETI[AMAC_ASAMASI[k.amac]]}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5">
                            <div className="flex min-w-[120px] flex-col gap-1">
                              <span className="text-xs text-ink-muted">{payMetni(k)}</span>
                              <div className="flex h-1.5 overflow-hidden rounded bg-ink/[0.07]">
                                <span className="block h-full bg-ink" style={{ width: `${k.meta ? (k.google ? (k.metaPayi ?? 50) : 100) : 0}%` }} />
                                <span className="block h-full bg-brand" style={{ width: `${k.google ? (k.meta ? 100 - (k.metaPayi ?? 50) : 100) : 0}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5 text-right">
                            <Tutar micros={gorunum[i]!.butceMicros} para={para} />
                          </td>
                          <td className="hidden px-2.5 py-2.5 md:table-cell">{tarihAraligi(k.baslangic, k.bitis)}</td>
                          <td className="hidden px-2.5 py-2.5 md:table-cell">{konumOzeti(k.konumlar)}</td>
                          <td className="px-2.5 py-2.5 text-right">
                            {s ? (
                              (['meta', 'google'] as const)
                                .filter((p) => k[p])
                                .map((p) => {
                                  const t = tahminMetni(s.tahmin[p], k.amac);
                                  return (
                                    <span key={p} className="block">
                                      {k.meta && k.google ? `${PLATFORM_ADI[p]}: ` : ''}
                                      {t.ana}
                                      <span className="block text-[11px] text-ink-muted">{t.veri ? <Rozet>Veri</Rozet> : t.alt}</span>
                                    </span>
                                  );
                                })
                            ) : (
                              <span className="text-xs text-ink-muted">Kaydedince hesaplanır</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={7} className="p-0">
                            <KalemDuzenleyici
                              acik={acik}
                              k={k}
                              degistir={(y) => setKalemler((x) => x.map((z, j) => (j === i ? y : z)))}
                              sil={() => {
                                setKalemler((x) => x.filter((_, j) => j !== i));
                                setAcikSatir(null);
                              }}
                              plan={plan}
                              para={para}
                              girdiler={girdiler.tur === 'veri' ? girdiler.v : null}
                              kilitli={!duzenlenebilir}
                              planId={plan.id}
                              kalemKayitli={s !== null}
                            />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-[13px]">
                    <td />
                    <td className="px-2.5 py-2.5">
                      <b>Toplam: {kalemler.length} kampanya</b>
                    </td>
                    <td className="px-2.5 py-2.5 text-xs text-ink-muted">
                      Meta <Tutar micros={platform.meta} para={para} /> · Google <Tutar micros={platform.google} para={para} />
                    </td>
                    <td className="px-2.5 py-2.5 text-right">
                      <b>
                        <Tutar micros={platform.meta + platform.google} para={para} />
                      </b>
                    </td>
                    <td className={`hidden px-2.5 py-2.5 md:table-cell ${kalan < 0n ? 'font-semibold text-brand-strong' : 'text-ink-muted'}`} colSpan={2}>
                      {kalan < 0n ? 'Plan aşıldı: ' : 'Dağıtılmamış: '}
                      <Tutar micros={kalan < 0n ? -kalan : kalan} para={para} />
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-xs text-ink-muted">Platformlar toplanmaz</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Mobilde gizlenen "dağıtılmamış" sütunu: telefonda da görünmeli. */}
            <p className={`m-0 px-4 pb-3 text-xs md:hidden ${kalan < 0n ? 'font-semibold text-brand-strong' : 'text-ink-muted'}`}>
              {kalan < 0n ? 'Plan aşıldı: ' : 'Dağıtılmamış: '}
              <Tutar micros={kalan < 0n ? -kalan : kalan} para={para} />
            </p>
          </Kart>

          <Kart className="p-4" etiket="Riskler">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">Riskler</b>
              <span className="text-xs text-ink-muted">Kurallardan, otomatik{kirli ? ' · kaydedince güncellenir' : ''}</span>
            </div>
            {detay.riskler.length === 0 ? (
              <p className="m-0 mt-2 text-[13px] text-ink-muted">Kurallardan çıkan bir risk yok.</p>
            ) : (
              detay.riskler.map((r, i) => (
                <div key={i} className="flex gap-2.5 border-b border-line py-2.5 text-[13px] last:border-b-0">
                  <span className="min-w-[84px] text-[11px] font-semibold text-ink-muted">{r.kalem ? `Kampanya ${r.kalem}` : 'Genel'}</span>
                  <span>{r.metin}</span>
                </div>
              ))
            )}
          </Kart>

          <Kart className="p-4" etiket="Belgenin yazıları">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">Belgenin yazıları</b>
              <span className="text-xs text-ink-muted">Özet, işletme, kitle, kreatif yön</span>
            </div>
            {AI_METIN_BOLUMLERI.map((b) => {
              const m = bolumler[b];
              const baslik = STRATEJI_BELGE_BOLUMLERI.find((x) => x.kod === b)?.baslik ?? b;
              return (
                <div key={b} className="mt-2.5 rounded-[10px] border border-line px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <b className="text-[13px]">{baslik}</b>
                    {m && <Rozet>{m.kaynak === 'ai' ? 'Yapay zekâ önerisi' : m.kaynak === 'ajans' ? 'Ajans yazdı' : 'Marka Merkezi'}</Rozet>}
                  </div>
                  <textarea
                    className={`${GIRDI} min-h-[72px]`}
                    disabled={!duzenlenebilir}
                    maxLength={2000}
                    aria-label={baslik}
                    value={m?.metin ?? ''}
                    onChange={(e) => setBolumler((o) => ({ ...o, [b]: e.target.value.trim() === '' ? undefined : { metin: e.target.value, kaynak: 'ajans' } }))}
                  />
                  {m?.kaynak === 'ai' && duzenlenebilir && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Dugme boyut="kucuk" onClick={() => setBolumler((o) => ({ ...o, [b]: { metin: m.metin, kaynak: 'ajans' } }))}>
                        Kullan
                      </Dugme>
                      <span className="text-[11px] text-ink-muted">"Kullan" denmeyen öneri müşterinin belgesine girmez.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </Kart>
        </div>
      </div>

      {gonderAcik && (
        <Kart className="p-4" etiket="Müşteriye gönder">
          <div className="mb-3 flex items-center justify-between gap-2">
            <b className="text-sm">Müşteriye gönder</b>
            <Dugme ton="sade" boyut="kucuk" onClick={() => setGonderAcik(false)}>
              Kapat
            </Dugme>
          </div>
          {plan.durum === 'onayda' ? (
            <GonderPaneli planId={plan.id} surum={plan.surum} izinler={izinler} tazeSurum={tazeSurum} />
          ) : (
            <p className="m-0 text-sm text-ink-muted">Strateji önce onaya gönderilmeli; müşteri yalnız onay bekleyen sürüme karar verebilir.</p>
          )}
        </Kart>
      )}

      {/* ── Alt çubuk ── */}
      <div className="sticky bottom-0 z-10 -mx-1 border-t border-line bg-surface-muted px-1">
        <div className="flex flex-wrap items-center gap-3 py-3">
          <Rozet ton={plan.durum === 'onaylandi' ? 'dolu' : 'cizgi'}>
            {STRATEJI_DURUM_ETIKETI[plan.durum]} · sürüm {plan.surum}
          </Rozet>
          <span className="min-w-0 flex-1 text-xs text-ink-muted">
            {kayit.tur === 'suruyor'
              ? 'Kaydediliyor…'
              : kayit.tur === 'tamam' && !kirli
                ? `Kaydedildi · ${zamanMetni(plan.guncellendi)}`
                : kirli
                  ? 'Kaydedilmemiş değişiklik var.'
                  : !duzenlenebilir
                    ? plan.durum === 'onayda'
                      ? 'Onay bekleyen strateji düzenlenemez; değiştirmek için onaydan geri çek.'
                      : 'Bu strateji düzenlenemez.'
                    : "Müşteri onaylayınca kampanyalar tek tıkla AdvCampaign'e taslak olarak açılır."}
          </span>
          <span className="flex flex-wrap gap-2">
            {yapilabilir
              .filter((e) => e !== 'onaya_gonder')
              .map((e) =>
                eylem.onayBekleyen === e ? (
                  <Fragment key={e}>
                    <Dugme boyut="kucuk" onClick={() => void eylemYap(e)} bekliyor={eylem.suruyor === e}>
                      Evet, {PANEL_EYLEM_ETIKETI[e]?.toLocaleLowerCase('tr-TR')}
                    </Dugme>
                    <Dugme ton="sade" boyut="kucuk" onClick={() => setEylem((x) => ({ ...x, onayBekleyen: null }))}>
                      Vazgeç
                    </Dugme>
                  </Fragment>
                ) : (
                  <Dugme key={e} ton="sade" boyut="kucuk" disabled={eylem.suruyor !== null} onClick={() => (e === 'iptal' || e === 'kapat' ? setEylem((x) => ({ ...x, onayBekleyen: e })) : void eylemYap(e))}>
                    {PANEL_EYLEM_ETIKETI[e] ?? e}
                  </Dugme>
                ),
              )}
            {duzenlenebilir && (
              <Dugme ton="ikincil" onClick={() => void kaydet()} bekliyor={kayit.tur === 'suruyor'} disabled={!kirli}>
                Kaydet
              </Dugme>
            )}
            {gonderilebilir && (
              <Dugme
                onClick={() => (plan.durum === 'onayda' ? setGonderAcik(true) : void eylemYap('onaya_gonder'))}
                bekliyor={eylem.suruyor === 'onaya_gonder'}
                // Kaydedilmemiş taslakla onaya göndermek, onaylanan belgenin ekranda görünenden FARKLI olması demek.
                disabled={kirli || kalemler.length === 0 || eylem.suruyor !== null}
              >
                Müşteriye gönder
              </Dugme>
            )}
          </span>
        </div>
        {(kayit.tur === 'hata' || kayit.tur === 'cakisma') && (
          <div className="pb-3">
            <Bildirim hata baslik={kayit.tur === 'cakisma' ? 'Strateji başka biri tarafından değiştirildi.' : 'Kaydedilemedi.'}>
              {kayit.mesaj} Yazdıkların ekranda duruyor.
            </Bildirim>
          </div>
        )}
        {eylem.mesaj && (
          <div className="pb-3">
            <Bildirim hata={eylem.mesaj.hata} baslik={eylem.mesaj.metin} />
          </div>
        )}
        {plan.durum === 'revizyon' && plan.revizyonNotu && (
          <div className="pb-3">
            <Bildirim baslik="Müşteri revizyon istedi.">{plan.revizyonNotu}</Bildirim>
          </div>
        )}
      </div>
    </div>
  );
}

const EYLEM_SONUCU: Record<StratejiEylemi, string> = {
  onaya_gonder: 'Strateji onaya gönderildi. Müşteriye bağlantı ya da mail gönderebilirsin.',
  geri_cek: 'Strateji onaydan geri çekildi; yeniden düzenlenebilir.',
  onayla: 'Strateji onaylandı.',
  revizyon_iste: 'Revizyon istendi.',
  kapat: 'Strateji kapatıldı.',
  iptal: 'Strateji iptal edildi. AdvCampaign’e açılmış taslaklar etkilenmez.',
};

function OzetKutusu({ etiket, secili = false, children }: { etiket: string; secili?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 border-b border-r border-line px-4 py-3.5 sm:border-b-0 ${secili ? 'shadow-[inset_0_-3px_0_var(--brand-primary)]' : ''}`}>
      <div className="text-xs text-ink-muted">{etiket}</div>
      {children}
    </div>
  );
}

export function Lejant() {
  return (
    <span className="flex flex-wrap gap-3.5 text-xs text-ink-muted">
      <span>
        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-ink align-[-1px]" />
        Meta
      </span>
      <span>
        <i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-[-1px]" />
        Google
      </span>
    </span>
  );
}
