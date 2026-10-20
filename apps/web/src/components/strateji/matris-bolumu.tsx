'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DERLENEN_NIYETLER,
  HUNI_ETIKETLERI,
  HUNI_KATMANLARI,
  MATRIS_SATIR_SINIRI,
  MATRIS_VARLIK_SINIRI,
  NIYET_KATALOGU,
  NIYET_KODLARI,
  PLATFORM_KISA_ADLARI,
  STRATEJI_PLATFORMLARI,
  sec,
  type AssetListResult,
  type Dil,
  type HuniKatmani,
  type KitleSablonuListesi,
  type MatrisSatiri,
  type NiyetKodu,
  type PlanDetayi,
  type StratejiPlatformu,
} from '@advetics/shared';
import { apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { BosDurum } from '@/components/ui/hal';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiPlanSozlugu } from '@/dil/sozlukler/strateji-plan';
import {
  bolumAdi,
  kitleMetni,
  matrisAsimlari,
  matrisSatiriDogrula,
  matrisTaslagi,
  okumaHatasi,
  ucAdresi,
  type MatrisTaslakSatiri,
} from './hesap';
import { BolumBasligi, GIRDI_SINIFI, KilitNotu, TabloKabi, planaYaz } from './ortak';

/*
 * Base'ten okunan iki liste (kitle şablonları, görseller). Dört hâl ayrı:
 * istenmedi (plan salt okunur, liste gerekmiyor) / yükleniyor / geldi /
 * düştü. Boş liste ile düşen çağrı AYNI boş seçici olsaydı kullanıcı
 * "kitlem yok" sanıp Base'e gider, orada kitlelerini görür ve şaşırırdı.
 */
type Liste<T> = { tur: 'istenmedi' } | { tur: 'yukleniyor' } | { tur: 'geldi'; veri: T } | { tur: 'hata'; mesaj: string };

function niyetSecenekleri(dil: Dil): Array<{ kod: NiyetKodu; ad: string }> {
  const m = sec(stratejiPlanSozlugu, dil).matrisEkrani;
  return NIYET_KODLARI.map((k) => ({
    kod: k,
    // AKTARILAMAYAN AMAÇ İŞARETLİ. Satır kaydediliyor ama aktarımda
    // `niyet_desteklenmiyor` ile atlanacak; bunu aktarım anında öğrenmek,
    // müşterinin onayladığı planın bir kısmının hiç kurulmaması demek.
    ad: (DERLENEN_NIYETLER as readonly NiyetKodu[]).includes(k)
      ? NIYET_KATALOGU[k].ekranAdi
      : m.aktarilamaz(NIYET_KATALOGU[k].ekranAdi),
  }));
}

/**
 * ═══ BÖLÜM 3 — KİTLE × KREATİF MATRİSİ ═══
 *
 * Her satır AdvCampaign'e aktarımın birimi: bir satır = bir oturum. Hücre
 * aşımı (bir platform × katmandaki satırların toplamı dağılımdaki tutarı
 * geçerse) YAZARKEN görünür; karar sözleşmenin `matrisButceDenetimi`
 * fonksiyonundan, sunucunun kayıtta koştuğu fonksiyonun aynısı.
 */
export function MatrisBolumu({
  clientId,
  detay,
  kilit,
  yenile,
  onKirli,
}: {
  clientId: string;
  detay: PlanDetayi;
  kilit: string | null;
  yenile: () => Promise<PlanDetayi | null>;
  onKirli: (kirli: boolean) => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(stratejiPlanSozlugu);
  const m = d.matrisEkrani;
  const { plan } = detay;
  const para = plan.paraBirimi;
  const duzenlenebilir = kilit === null;
  const [taslak, setTaslak] = useState<MatrisTaslakSatiri[]>(() => matrisTaslagi(detay.matris, para));
  const [kirli, setKirli] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ ton: 'tehlike' | 'uyari' | 'basari'; metin: string } | null>(null);
  const [kitleler, setKitleler] = useState<Liste<KitleSablonuListesi>>({ tur: 'istenmedi' });
  const [gorseller, setGorseller] = useState<Liste<AssetListResult>>({ tur: 'istenmedi' });
  const sayac = useRef(0);

  useEffect(() => {
    if (!kirli) setTaslak(matrisTaslagi(detay.matris, para));
  }, [detay.matris, para, kirli]);
  useEffect(() => onKirli(kirli), [kirli, onKirli]);

  /*
   * LİSTELER YALNIZCA DÜZENLENEBİLİR PLANDA. Salt okunur planda satır
   * kitle ve görsel ADLARINI zaten taşıyor; müşteri hesabının Base'e
   * erişimi de yok ve gereksiz bir çağrı ona 403 kutusu gösterirdi.
   */
  useEffect(() => {
    if (!duzenlenebilir) return;
    let iptal = false;
    setKitleler({ tur: 'yukleniyor' });
    setGorseller({ tur: 'yukleniyor' });
    apiFetch<KitleSablonuListesi>(baglanti('/audience-templates', { clientId })).then(
      (veri) => !iptal && setKitleler({ tur: 'geldi', veri }),
      (e: unknown) => !iptal && setKitleler({ tur: 'hata', mesaj: okumaHatasi(e, dil) }),
    );
    apiFetch<AssetListResult>(baglanti('/assets', { clientId, kind: 'image', limit: '60', offset: '0' })).then(
      (veri) => !iptal && setGorseller({ tur: 'geldi', veri }),
      (e: unknown) => !iptal && setGorseller({ tur: 'hata', mesaj: okumaHatasi(e, dil) }),
    );
    return () => {
      iptal = true;
    };
  }, [clientId, duzenlenebilir, dil]);

  const { asimlar, okunamayan } = useMemo(() => matrisAsimlari(detay.dagilim, taslak, para), [detay.dagilim, taslak, para]);
  const dogrulama = useMemo(() => taslak.map((t) => matrisSatiriDogrula(t, dil)), [taslak, dil]);
  const hataliSatir = dogrulama.filter((d) => d.tur === 'hata').length;
  const asanHucre = new Set(asimlar.map((a) => `${a.platform}:${a.katman}`));
  const kelimeGruplari = useMemo(
    () =>
      [...new Set(detay.kelimeler.satirlar.filter((k) => k.secili && k.grup).map((k) => k.grup as string))].sort((a, b) =>
        a.localeCompare(b, 'tr'),
      ),
    [detay.kelimeler.satirlar],
  );

  function degistir(anahtar: string, deger: Partial<MatrisTaslakSatiri>) {
    setTaslak((t) => t.map((s) => (s.anahtar === anahtar ? { ...s, ...deger } : s)));
    setKirli(true);
    setMesaj(null);
  }

  function satirEkle() {
    sayac.current += 1;
    setTaslak((t) => [
      ...t,
      {
        anahtar: `yeni-${sayac.current}`,
        platform: 'meta',
        katman: 'soguk',
        niyet: DERLENEN_NIYETLER[0],
        kitleSablonuId: null,
        kelimeGrubu: '',
        varlikIdleri: [],
        tutar: '',
        not: '',
      },
    ]);
    setKirli(true);
    setMesaj(null);
  }

  function satirSil(anahtar: string) {
    setTaslak((t) => t.filter((s) => s.anahtar !== anahtar));
    setKirli(true);
    setMesaj(null);
  }

  async function kaydet() {
    const satirlar = dogrulama.flatMap((d) => (d.tur === 'tamam' ? [d.govde] : []));
    if (satirlar.length !== taslak.length) return;
    setKaydediliyor(true);
    setMesaj(null);
    const r = await planaYaz(ucAdresi('/strateji/planlar/:id/matris', plan.id), 'PUT', { surum: plan.surum, satirlar }, yenile, plan.surum, dil);
    setKaydediliyor(false);
    if (r.tur === 'tamam') {
      setKirli(false);
      setMesaj({ ton: 'basari', metin: m.kaydedildi });
    } else {
      setMesaj({ ton: r.tur === 'cakisma' ? 'uyari' : 'tehlike', metin: r.mesaj });
    }
  }

  const kaydedilebilir =
    duzenlenebilir && kirli && hataliSatir === 0 && asimlar.length === 0 && okunamayan === 0 && taslak.length <= MATRIS_SATIR_SINIRI;

  return (
    <section aria-labelledby="matris-baslik" className="space-y-4">
      <BolumBasligi
        id="matris-baslik"
        baslik={bolumAdi('matris', dil)}
        aciklama={m.aciklama}
      />

      {kilit && <KilitNotu neden={kilit} />}

      {duzenlenebilir && <ListeDurumu ad={m.kitleler} durum={kitleler} dil={dil} />}
      {duzenlenebilir && <ListeDurumu ad={m.gorseller} durum={gorseller} dil={dil} />}

      {asimlar.length > 0 && (
        <Uyari ton="tehlike" baslik={m.asimBaslik}>
          <ul className="space-y-0.5">
            {asimlar.map((a) => (
              <li key={`${a.platform}:${a.katman}`}>
                {m.asimSatiri(
                  PLATFORM_KISA_ADLARI[a.platform],
                  HUNI_ETIKETLERI[a.katman],
                  formatMoney(a.dagilimMicros.toString(), para, { dil }),
                  formatMoney(a.matrisMicros.toString(), para, { dil }),
                  formatMoney(a.asimMicros.toString(), para, { dil }),
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1">{m.kayitliKarsilastirma}</p>
        </Uyari>
      )}
      {okunamayan > 0 && (
        <p className="text-sm text-warn-strong">{m.okunamayan(okunamayan)}</p>
      )}

      {taslak.length === 0 ? (
        <BosDurum baslik={m.satirYok} neden={duzenlenebilir ? m.satirYokDuzenlenebilir : m.satirYokOkur} />
      ) : (
        <TabloKabi etiket={m.tabloEtiketi}>
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-3 py-2 font-semibold">{d.ortak.kitleKatmani}</th>
                <th className="px-3 py-2 font-semibold">{m.amac}</th>
                <th className="px-3 py-2 font-semibold">{m.kitle}</th>
                <th className="px-3 py-2 font-semibold">{m.gorselSutunu}</th>
                <th className="px-3 py-2 text-right font-semibold">{m.tutar(para)}</th>
                {duzenlenebilir && (
                  <th className="px-3 py-2 font-semibold">
                    <span className="sr-only">{m.satiriSil}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {taslak.map((s, i) => {
                const kayitli = detay.matris.find((x) => x.id === s.anahtar);
                const d = dogrulama[i];
                const asim = asanHucre.has(`${s.platform}:${s.katman}`);
                return duzenlenebilir ? (
                  <DuzenlenenSatir
                    key={s.anahtar}
                    satir={s}
                    sira={i + 1}
                    kayitli={kayitli}
                    hata={d?.tur === 'hata' ? d.mesaj : null}
                    asim={asim}
                    kitleler={kitleler}
                    gorseller={gorseller}
                    degistir={(v) => degistir(s.anahtar, v)}
                    sil={() => satirSil(s.anahtar)}
                    dil={dil}
                  />
                ) : kayitli ? (
                  <OkunanSatir key={s.anahtar} satir={kayitli} para={para} dil={dil} />
                ) : null;
              })}
            </tbody>
          </table>
        </TabloKabi>
      )}
      {/* TEK datalist: satır başına ayrı kimlik aynı id'yi tekrar ederdi. */}
      <datalist id="matris-kelime-gruplari">
        {kelimeGruplari.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {mesaj && (
        <Uyari
          ton={mesaj.ton}
          eylem={
            mesaj.ton === 'uyari' ? (
              <Dugme
                ton="ikincil"
                boyut="kucuk"
                onClick={() => {
                  setKirli(false);
                  setMesaj(null);
                }}
              >
                {d.ortak.kayitliYukle}
              </Dugme>
            ) : undefined
          }
        >
          {mesaj.metin}
          {mesaj.ton === 'uyari' && d.ortak.cakismaEki}
        </Uyari>
      )}

      {duzenlenebilir && (
        <div className="flex flex-wrap items-center gap-3">
          <Dugme ton="ikincil" onClick={satirEkle} disabled={taslak.length >= MATRIS_SATIR_SINIRI}>
            {m.satirEkle}
          </Dugme>
          <Dugme onClick={kaydet} disabled={!kaydedilebilir} bekliyor={kaydediliyor}>
            {m.matrisiKaydet}
          </Dugme>
          <span className="text-sm text-ink-muted">{m.satirSayisi(taslak.length, MATRIS_SATIR_SINIRI)}</span>
          {hataliSatir > 0 && <span className="text-sm text-danger-strong">{m.hataliSatir(hataliSatir)}</span>}
          {kirli && <span className="text-sm text-ink-muted">{d.ortak.kaydedilmemis}</span>}
        </div>
      )}
    </section>
  );
}

function ListeDurumu<T>({ ad, durum, dil }: { ad: string; durum: Liste<T>; dil: Dil }) {
  const m = sec(stratejiPlanSozlugu, dil).matrisEkrani;
  if (durum.tur === 'yukleniyor') {
    return (
      <p className="text-sm text-ink-muted" role="status">
        {m.yukleniyor(ad)}
      </p>
    );
  }
  if (durum.tur === 'hata') {
    return (
      <Uyari ton="tehlike" baslik={m.alinamadi(ad)}>
        {durum.mesaj}
      </Uyari>
    );
  }
  return null;
}

function DuzenlenenSatir({
  satir: s,
  sira,
  kayitli,
  hata,
  asim,
  kitleler,
  gorseller,
  degistir,
  sil,
  dil,
}: {
  satir: MatrisTaslakSatiri;
  sira: number;
  kayitli: MatrisSatiri | undefined;
  hata: string | null;
  asim: boolean;
  kitleler: Liste<KitleSablonuListesi>;
  gorseller: Liste<AssetListResult>;
  degistir: (v: Partial<MatrisTaslakSatiri>) => void;
  sil: () => void;
  dil: Dil;
}) {
  const m = sec(stratejiPlanSozlugu, dil).matrisEkrani;
  const etiket = m.satir(sira);
  // SATIRIN PLATFORMUNUN KİTLELERİ: Meta satırına Google kitlesi seçilirse
  // aktarımda ilgi ve kelimeleri Meta'ya gidemez (2026-10-20, tek platform).
  const kitleSecenekleri =
    kitleler.tur === 'geldi'
      ? kitleler.veri.items.filter((k) => k.platform === s.platform).map((k) => ({ id: k.id, ad: k.name }))
      : [];
  /*
   * SEÇİLİ KİTLE LİSTEDE YOKSA DA GÖRÜNÜR. Şablon silinmişse ya da liste
   * düştüyse seçici boş açılır ve kullanıcı satırın kitlesiz olduğunu
   * sanırdı; kayıtlı satırın taşıdığı ad (yoksa "silinmiş kitle") gösterilir.
   */
  if (s.kitleSablonuId && !kitleSecenekleri.some((k) => k.id === s.kitleSablonuId)) {
    const ad = kayitli?.kitle?.id === s.kitleSablonuId ? kayitli.kitle.ad : null;
    kitleSecenekleri.unshift({ id: s.kitleSablonuId, ad: ad ?? sec(stratejiPlanSozlugu, dil).kitle.silinmis });
  }
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2">
        <select
          aria-label={m.ariaPlatform(etiket)}
          className={GIRDI_SINIFI}
          value={s.platform}
          onChange={(e) => degistir({ platform: e.target.value as StratejiPlatformu })}
        >
          {STRATEJI_PLATFORMLARI.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_KISA_ADLARI[p]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={m.ariaKatman(etiket)}
          className={GIRDI_SINIFI}
          value={s.katman}
          onChange={(e) => degistir({ katman: e.target.value as HuniKatmani })}
        >
          {HUNI_KATMANLARI.map((k) => (
            <option key={k} value={k}>
              {HUNI_ETIKETLERI[k]}
            </option>
          ))}
        </select>
        {asim && <p className="mt-1 text-xs text-danger-strong">{m.katmanAsim}</p>}
      </td>
      <td className="px-3 py-2">
        <select
          aria-label={m.ariaAmac(etiket)}
          className={GIRDI_SINIFI}
          value={s.niyet}
          onChange={(e) => degistir({ niyet: e.target.value as NiyetKodu })}
        >
          {niyetSecenekleri(dil).map((n) => (
            <option key={n.kod} value={n.kod}>
              {n.ad}
            </option>
          ))}
        </select>
      </td>
      <td className="space-y-1.5 px-3 py-2">
        <select
          aria-label={m.ariaKitle(etiket)}
          className={GIRDI_SINIFI}
          value={s.kitleSablonuId ?? ''}
          onChange={(e) => degistir({ kitleSablonuId: e.target.value || null })}
        >
          {/* Google'da kitle isteğe bağlı: arama kampanyası kitleyi kelimeden alır. */}
          <option value="">{BOS_KITLE_SECENEGI[s.platform] === 'meta' ? m.bosKitleMeta : m.bosKitleGoogle}</option>
          {kitleSecenekleri.map((k) => (
            <option key={k.id} value={k.id}>
              {k.ad}
            </option>
          ))}
        </select>
        {kitleler.tur === 'geldi' && kitleler.veri.items.length === 0 && (
          <p className="text-xs text-ink-muted">{m.baseKitleYok}</p>
        )}
        {s.platform === 'google' && (
          <input
            aria-label={m.ariaKelimeGrubu(etiket)}
            list="matris-kelime-gruplari"
            maxLength={80}
            placeholder={m.kelimeGrubuYer}
            className={GIRDI_SINIFI}
            value={s.kelimeGrubu}
            onChange={(e) => degistir({ kelimeGrubu: e.target.value })}
          />
        )}
      </td>
      <td className="px-3 py-2">
        <VarlikSecici
          etiket={etiket}
          secili={s.varlikIdleri}
          kayitli={kayitli}
          gorseller={gorseller}
          dil={dil}
          degistir={(varlikIdleri) => degistir({ varlikIdleri })}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          inputMode="decimal"
          aria-label={m.ariaTutar(etiket)}
          className={`${GIRDI_SINIFI} max-w-[9rem] text-right tabular-nums`}
          value={s.tutar}
          placeholder="0"
          onChange={(e) => degistir({ tutar: e.target.value })}
        />
        {hata && <p className="mt-1 text-left text-xs text-danger-strong">{hata}</p>}
      </td>
      <td className="px-3 py-2">
        <Dugme ton="tehlike" boyut="kucuk" onClick={sil} aria-label={m.ariaSil(etiket)}>
          {m.sil}
        </Dugme>
      </td>
    </tr>
  );
}

/**
 * Görsel seçici: açılır liste, en çok `MATRIS_VARLIK_SINIRI`. Sınıra gelince
 * seçilmemiş kutular kapanıyor ve neden yazıyor. Liste ilk 60 görseli
 * taşıyor; fazlası varsa SAYISI yazılıyor (sessiz kesme yok).
 */
function VarlikSecici({
  etiket,
  secili,
  kayitli,
  gorseller,
  dil,
  degistir,
}: {
  etiket: string;
  secili: string[];
  kayitli: MatrisSatiri | undefined;
  gorseller: Liste<AssetListResult>;
  dil: Dil;
  degistir: (ids: string[]) => void;
}) {
  const m = sec(stratejiPlanSozlugu, dil).matrisEkrani;
  const dolu = secili.length >= MATRIS_VARLIK_SINIRI;
  const liste = gorseller.tur === 'geldi' ? gorseller.veri.rows : [];
  // Seçili ama listede olmayan (silinmiş ya da ilk 60'ın dışında) görsel de sayılır ve görünür.
  const listedeYok = secili.filter((id) => !liste.some((g) => g.id === id));
  return (
    <details className="min-w-[12rem]">
      <summary className="cursor-pointer rounded-alan border border-line bg-surface px-2.5 py-1.5 text-sm text-ink">
        {secili.length === 0 ? m.gorselSec : m.gorselSayaci(secili.length, MATRIS_VARLIK_SINIRI)}
        <span className="sr-only"> · {etiket}</span>
      </summary>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-alan border border-line bg-surface p-2">
        {gorseller.tur !== 'geldi' && <p className="text-xs text-ink-muted">{m.gorselListesiHazirDegil}</p>}
        {gorseller.tur === 'geldi' && liste.length === 0 && (
          <p className="text-xs text-ink-muted">{m.baseGorselYok}</p>
        )}
        {listedeYok.map((id) => {
          const ad = kayitli?.varliklar.find((v) => v.id === id)?.ad ?? null;
          return (
            <label key={id} className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked onChange={() => degistir(secili.filter((x) => x !== id))} />
              <span>{ad ?? m.listedeYokGorsel}</span>
            </label>
          );
        })}
        {liste.map((g) => {
          const isaretli = secili.includes(g.id);
          return (
            <label key={g.id} className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={isaretli}
                disabled={!isaretli && dolu}
                onChange={(e) => degistir(e.target.checked ? [...secili, g.id] : secili.filter((x) => x !== g.id))}
              />
              <img src={onizlemeAdresi(g.previewUrl)} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" />
              <span className="min-w-0 truncate">{g.name}</span>
            </label>
          );
        })}
        {dolu && <p className="text-xs text-warn-strong">{m.gorselSiniri(MATRIS_VARLIK_SINIRI)}</p>}
        {gorseller.tur === 'geldi' && gorseller.veri.total > liste.length && (
          <p className="text-xs text-ink-muted">{m.gorselGosteriliyor(liste.length, gorseller.veri.total)}</p>
        )}
      </div>
    </details>
  );
}

/**
 * Boş kitle seçeneğinin metni PLATFORM BAŞINA. "google değilse Meta" ikili
 * dallanması bu depoda yasak (`linkedin-kayit.spec.ts`): üçüncü platform
 * geldiğinde sessizce yanlış metin üretir. `Record` eksik platformu derlemede
 * yakalıyor. Meta'da kitle zorunlu ("seç"), Google aramada kelimeyle
 * hedefleme ("kitle yok").
 */
const BOS_KITLE_SECENEGI: Record<StratejiPlatformu, 'meta' | 'google'> = {
  meta: 'meta',
  google: 'google',
};

function OkunanSatir({ satir: s, para, dil }: { satir: MatrisSatiri; para: string; dil: Dil }) {
  const m = sec(stratejiPlanSozlugu, dil).matrisEkrani;
  const kitle = kitleMetni(s.platform, s.kitle, dil);
  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2 text-ink">{PLATFORM_KISA_ADLARI[s.platform]}</td>
      <td className="px-3 py-2 text-ink">{HUNI_ETIKETLERI[s.katman]}</td>
      <td className="px-3 py-2 text-ink">{NIYET_KATALOGU[s.niyet].ekranAdi}</td>
      <td className="px-3 py-2 text-ink">
        {kitle}
        {s.kelimeGrubu && <span className="mt-0.5 block text-xs text-ink-muted">
            {m.kelimeGrubu}: {s.kelimeGrubu}
          </span>}
      </td>
      <td className="px-3 py-2">
        {s.varliklar.length === 0 ? (
          <span className="text-ink-muted">{m.gorselYok}</span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {s.varliklar.map((v) => (
              <li key={v.id} title={v.ad ?? m.silinmisGorsel}>
                {v.kucukResimAdresi ? (
                  <img src={onizlemeAdresi(v.kucukResimAdresi)} alt={v.ad ?? m.silinmisGorsel} className="h-8 w-8 rounded object-cover" loading="lazy" />
                ) : (
                  <span className="text-xs text-ink-muted">{v.ad ?? m.silinmisGorsel}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(s.tutarMicros, para, { dil })}</td>
    </tr>
  );
}
