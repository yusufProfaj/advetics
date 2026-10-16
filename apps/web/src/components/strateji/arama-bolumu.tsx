'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sec, type Dil, type PlanDetayi } from '@advetics/shared';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { BosDurum } from '@/components/ui/hal';
import { Kart } from '@/components/ui/kart';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiPlanSozlugu } from '@/dil/sozlukler/strateji-plan';
import {
  rekabetEtiketi,
  bolumAdi,
  yerelKodu,
  DIGER_GRUBU,
  aylikAramaMetni,
  grupSecimHali,
  kelimeGruplari,
  kelimeDegisiklikleri,
  tohumlariAyir,
  ucAdresi,
  zamanMetni,
  type KelimeGrubu,
} from './hesap';
import { BolumBasligi, GIRDI_SINIFI, KilitNotu, TabloKabi, planaYaz } from './ortak';

type Taslak = Record<string, { secili: boolean; grup: string }>;

function taslakKur(detay: PlanDetayi): Taslak {
  return Object.fromEntries(detay.kelimeler.satirlar.map((s) => [s.id, { secili: s.secili, grup: s.grup ?? '' }]));
}

/**
 * ═══ BÖLÜM 2 — GOOGLE ARAMA KURGUSU ═══
 *
 * ERİŞİM DURUMU AYRI YAZILIYOR. "Erişim yok" ile "sonuç yok" aynı boş tablo
 * olsaydı kullanıcı sorunu kelimesinde arardı (sözleşme `KELIME_ERISIM_
 * DURUMLARI`). Ekran Google'ı doğrudan çağırmıyor: sunucu sonuçları çekim
 * zamanıyla tabloya yazıyor ve ekran o tabloyu okuyor; arama sürerken
 * yoklama `PlanEkrani`nda (sayfadan çıkınca duruyor).
 */
export function AramaBolumu({
  detay,
  kilit,
  yenile,
  onKirli,
}: {
  detay: PlanDetayi;
  kilit: string | null;
  yenile: () => Promise<PlanDetayi | null>;
  onKirli: (kirli: boolean) => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(stratejiPlanSozlugu);
  const a = d.aramaEkrani;
  const { plan, kelimeler } = detay;
  const [tohumMetni, setTohumMetni] = useState('');
  const [tohumHatasi, setTohumHatasi] = useState<string | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const [aramaMesaji, setAramaMesaji] = useState<{ ton: 'tehlike' | 'uyari'; metin: string } | null>(null);
  const [taslak, setTaslak] = useState<Taslak>(() => taslakKur(detay));
  const [kirli, setKirli] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kayitMesaji, setKayitMesaji] = useState<{ ton: 'tehlike' | 'uyari' | 'basari'; metin: string } | null>(null);

  useEffect(() => {
    if (!kirli) setTaslak(taslakKur(detay));
  }, [detay, kirli]);
  useEffect(() => onKirli(kirli), [kirli, onKirli]);

  const degisiklik = useMemo(() => kelimeDegisiklikleri(kelimeler.satirlar, taslak), [kelimeler.satirlar, taslak]);
  const seciliSayisi = Object.values(taslak).filter((t) => t.secili).length;
  const sonCekim = kelimeler.satirlar.reduce<string | null>((son, s) => (son === null || s.cekimZamani > son ? s.cekimZamani : son), null);
  const gruplu = useMemo(() => kelimeGruplari(kelimeler.satirlar, taslak), [kelimeler.satirlar, taslak]);
  const seciliArama = gruplu.reduce((t, g) => t + g.seciliArama, 0);
  const gruplar = useMemo(
    () => [...new Set(Object.values(taslak).map((t) => t.grup.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [taslak],
  );

  async function ara() {
    const r = tohumlariAyir(tohumMetni, dil);
    if (r.tur === 'hata') {
      setTohumHatasi(r.mesaj);
      return;
    }
    setTohumHatasi(null);
    setAramaMesaji(null);
    setAraniyor(true);
    /*
     * Sonuç YANITTAN DEĞİL PLANDAN okunuyor: `planaYaz` planı yeniden
     * okuyor ve erişim durumu, `sonHata` ve `aramaSuruyor` oradan geliyor.
     * Google'ın reddi de (erişim `yok` + platform cümlesi) aynı yoldan
     * `ErisimDurumu` kutusunda görünüyor; ikinci bir gösterim ayrışırdı.
     */
    const s = await planaYaz(
      ucAdresi('/strateji/planlar/:id/kelime-ara', plan.id),
      'POST',
      { tohumlar: r.tohumlar },
      yenile,
      plan.surum,
      dil,
    );
    setAraniyor(false);
    if (s.tur === 'tamam') setTohumMetni('');
    else setAramaMesaji({ ton: s.tur === 'cakisma' ? 'uyari' : 'tehlike', metin: s.mesaj });
  }

  async function kaydet() {
    if (degisiklik.length === 0) return;
    setKaydediliyor(true);
    setKayitMesaji(null);
    const r = await planaYaz(
      ucAdresi('/strateji/planlar/:id/kelimeler', plan.id),
      'PATCH',
      { satirlar: degisiklik, surum: plan.surum },
      yenile,
      plan.surum,
      dil,
    );
    setKaydediliyor(false);
    if (r.tur === 'tamam') {
      setKirli(false);
      setKayitMesaji({ ton: 'basari', metin: a.guncellendi(degisiklik.length) });
    } else {
      setKayitMesaji({ ton: r.tur === 'cakisma' ? 'uyari' : 'tehlike', metin: r.mesaj });
    }
  }

  /** Gruptaki bütün satırlara aynı değişiklik: toplu seçim ya da grubun adı. */
  function grupGuncelle(g: KelimeGrubu, deger: Partial<{ secili: boolean; grup: string }>) {
    setTaslak((t) => {
      const yeni = { ...t };
      for (const s of g.satirlar) {
        const eski = yeni[s.id];
        if (eski) yeni[s.id] = { ...eski, ...deger };
      }
      return yeni;
    });
    setKirli(true);
    setKayitMesaji(null);
  }

  /** Başlıktaki ad: satırların taslak adı ortaksa o, değilse kayıtlı ad. */
  function grupAdi(g: KelimeGrubu): string {
    const adlar = new Set(g.satirlar.map((s) => taslak[s.id]?.grup ?? s.grup ?? ''));
    return adlar.size === 1 ? [...adlar][0]! : g.anahtar;
  }

  function guncelle(id: string, deger: Partial<{ secili: boolean; grup: string }>) {
    setTaslak((t) => {
      const eski = t[id];
      return eski ? { ...t, [id]: { ...eski, ...deger } } : t;
    });
    setKirli(true);
    setKayitMesaji(null);
  }

  return (
    <section aria-labelledby="arama-baslik" className="space-y-4">
      <BolumBasligi
        id="arama-baslik"
        baslik={bolumAdi('arama', dil)}
        aciklama={a.aciklama}
      />

      {kilit && <KilitNotu neden={kilit} />}

      <ErisimDurumu erisim={kelimeler.erisim} sonHata={kelimeler.sonHata} dil={dil} />

      {kelimeler.erisim === 'var' && kilit === null && (
        <Kart as="div">
          <div className="space-y-2">
            <label htmlFor="tohumlar" className="block text-sm font-semibold text-ink">
              {a.tohumEtiketi}
            </label>
            <p id="tohumlar-yardim" className="text-sm text-ink-muted">
              {a.tohumYardim}
            </p>
            <textarea
              id="tohumlar"
              rows={3}
              aria-describedby={tohumHatasi ? 'tohumlar-yardim tohumlar-hata' : 'tohumlar-yardim'}
              aria-invalid={tohumHatasi ? true : undefined}
              className={GIRDI_SINIFI}
              value={tohumMetni}
              onChange={(e) => {
                setTohumMetni(e.target.value);
                setTohumHatasi(null);
              }}
            />
            {tohumHatasi && (
              <p id="tohumlar-hata" className="text-sm text-danger-strong">
                {tohumHatasi}
              </p>
            )}
            <Dugme ton="koyu" onClick={ara} bekliyor={araniyor} disabled={kelimeler.aramaSuruyor}>
              {a.kelimeleriAra}
            </Dugme>
          </div>
        </Kart>
      )}

      {kelimeler.aramaSuruyor && (
        <p className="text-sm text-ink-muted" role="status">
          {a.suruyor}
        </p>
      )}

      {aramaMesaji && (
        <Uyari ton={aramaMesaji.ton} baslik={aramaMesaji.ton === 'tehlike' ? a.aramaYapilamadi : undefined}>
          {aramaMesaji.metin}
        </Uyari>
      )}

      {kelimeler.satirlar.length === 0 ? (
        kelimeler.erisim === 'var' &&
        !kelimeler.aramaSuruyor && (
          <BosDurum
            baslik={a.kelimeYok}
            neden={kelimeler.sonHata ? a.sonAramaSonucsuz : kilit === null ? a.henuzAranmadi : a.planda_yok}
          />
        )
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
            <span>
              {/* SESSİZ KESME YOK: Google binlerce fikir döndürüyor, plan ilk N'i taşıyor. */}
              {a.gosteriliyor(kelimeler.gosterilen.toLocaleString(yerelKodu(dil)), kelimeler.toplam.toLocaleString(yerelKodu(dil)))} ·{' '}
              {a.secili(seciliSayisi)}
              {seciliSayisi > 0 && ` · ${a.seciliArama(seciliArama.toLocaleString(yerelKodu(dil)))}`}
            </span>
            {sonCekim && (
              <span>
                {a.cekildi}: {zamanMetni(sonCekim, dil)}
              </span>
            )}
          </div>
          <TabloKabi etiket={a.tabloEtiketi}>
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-semibold">{a.planaAl}</th>
                  <th className="px-3 py-2 font-semibold">{a.kelime}</th>
                  <th className="px-3 py-2 text-right font-semibold">{a.aylikArama}</th>
                  <th className="px-3 py-2 font-semibold">{a.rekabet}</th>
                  <th className="px-3 py-2 text-right font-semibold">{a.teklif}</th>
                  <th className="px-3 py-2 font-semibold">{a.reklamGrubu}</th>
                </tr>
              </thead>
              {/*
                GRUPLU GÖRÜNÜM: grup Google'da bir reklam grubu olacak, karar
                da grup grup veriliyor. Her grubun başlığında toplu seçim, ad
                değiştirme ve toplam hacim; tek bir kelimeyi başka gruba
                taşımak için satırdaki kutu duruyor.
              */}
              {gruplu.map((g) => (
                <tbody key={g.anahtar || '(grupsuz)'}>
                  <GrupBasligi
                    grup={g}
                    ad={grupAdi(g)}
                    dil={dil}
                    kilitli={kilit !== null}
                    secimDegistir={(secili) => grupGuncelle(g, { secili })}
                    adDegistir={(ad) => grupGuncelle(g, { grup: ad })}
                  />
                  {g.satirlar.map((s) => {
                    const t = taslak[s.id] ?? { secili: s.secili, grup: s.grup ?? '' };
                    return (
                      <tr key={s.id} className="border-t border-line align-top">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand"
                            aria-label={a.planaAlinsin(s.kelime)}
                            checked={t.secili}
                            disabled={kilit !== null}
                            onChange={(e) => guncelle(s.id, { secili: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {s.kelime}
                          {s.varyantlar.length > 0 && (
                            <span className="mt-0.5 block text-xs text-ink-muted">
                              {a.ayniSayilan}: {s.varyantlar.join(', ')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{aylikAramaMetni(s.aylikArama, dil)}</td>
                        <td className="px-3 py-2">{s.rekabet ? rekabetEtiketi(s.rekabet, dil) : d.ortak.veriYok}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <TeklifAraligi alt={s.teklifAltMicros} ust={s.teklifUstMicros} para={plan.paraBirimi} dil={dil} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={a.grupEtiketi(s.kelime)}
                            list="kelime-gruplari"
                            maxLength={80}
                            className={`${GIRDI_SINIFI} min-w-[10rem]`}
                            value={t.grup}
                            disabled={kilit !== null}
                            onChange={(e) => guncelle(s.id, { grup: e.target.value })}
                          />
                          {/*
                            "ELLE" İŞARETİ: bu ad kullanıcının; yeniden gruplama onu
                            ezmiyor (MIMARI §6.2). İşaret olmasa kullanıcı hangi
                            grupların kuraldan, hangilerinin kendisinden geldiğini
                            bilemez ve kuralın "değiştirmediği" adı bozuk sanabilir.
                          */}
                          {s.grupElle && (
                            <span className="mt-1 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted" title={a.elleAciklama}>
                              {a.elle}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </TabloKabi>
          <datalist id="kelime-gruplari">
            {gruplar.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>

          {kayitMesaji && (
            <Uyari
              ton={kayitMesaji.ton}
              eylem={
                kayitMesaji.ton === 'uyari' ? (
                  <Dugme
                    ton="ikincil"
                    boyut="kucuk"
                    onClick={() => {
                      setKirli(false);
                      setKayitMesaji(null);
                    }}
                  >
                    {d.ortak.kayitliYukle}
                  </Dugme>
                ) : undefined
              }
            >
              {kayitMesaji.metin}
            </Uyari>
          )}

          {kilit === null && (
            <div className="flex flex-wrap items-center gap-3">
              <Dugme onClick={kaydet} disabled={degisiklik.length === 0} bekliyor={kaydediliyor}>
                {a.secimiKaydet}
              </Dugme>
              {degisiklik.length > 0 && (
                <span className="text-sm text-ink-muted">{a.kaydedilmemisKelime(degisiklik.length)}</span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ErisimDurumu({ erisim, sonHata, dil }: { erisim: PlanDetayi['kelimeler']['erisim']; sonHata: string | null; dil: Dil }) {
  const a = sec(stratejiPlanSozlugu, dil).aramaEkrani;
  if (erisim === 'olculmedi') {
    return (
      <Uyari ton="bilgi" baslik={a.erisimOlculmedi}>
        {a.erisimOlculmediMetin}
      </Uyari>
    );
  }
  if (erisim === 'yok') {
    return (
      <Uyari ton="tehlike" baslik={a.erisimYok}>
        {sonHata ?? a.erisimNedenYok}
      </Uyari>
    );
  }
  // Erişim var ama son arama düştü: platformun cümlesi olduğu gibi.
  return sonHata ? (
    <Uyari ton="tehlike" baslik={a.sonAramaDustu}>
      {sonHata}
    </Uyari>
  ) : null;
}

/** Teklif alanları Google'dan boş gelebiliyor; boş "veri yok", sıfır değil. */
function TeklifAraligi({ alt, ust, para, dil }: { alt: string | null; ust: string | null; para: string; dil: Dil }) {
  const d = sec(stratejiPlanSozlugu, dil);
  if (alt === null && ust === null) return <>{d.ortak.veriYok}</>;
  if (alt === null) return <>{d.aramaEkrani.enCok(formatMoney(ust, para, { dil }))}</>;
  if (ust === null) return <>{d.aramaEkrani.enAz(formatMoney(alt, para, { dil }))}</>;
  return (
    <>
      {formatMoney(alt, para, { dil })} - {formatMoney(ust, para, { dil })}
    </>
  );
}

/**
 * Grup başlığı. Toplu seçim kutusu ÜÇ HÂLLİ (hepsi / hiçbiri / bazısı):
 * iki hâlli bir kutu "bazısı seçili" grubu ya seçili ya seçilmemiş gösterir
 * ve kullanıcı grubun yarısının plana girdiğini göremezdi.
 *
 * TOPLAM "yaklaşık" ve hacmi bilinmeyen kelimeler SAYILIYOR: toplam onlar
 * olmadan hesaplanıyor ve bunu söylemezse küçük görünür.
 */
function GrupBasligi({
  grup,
  ad,
  dil,
  kilitli,
  secimDegistir,
  adDegistir,
}: {
  grup: KelimeGrubu;
  ad: string;
  dil: Dil;
  kilitli: boolean;
  secimDegistir: (secili: boolean) => void;
  adDegistir: (ad: string) => void;
}) {
  const a = sec(stratejiPlanSozlugu, dil).aramaEkrani;
  const kutu = useRef<HTMLInputElement>(null);
  const hal = grupSecimHali(grup);
  useEffect(() => {
    if (kutu.current) kutu.current.indeterminate = hal === 'bazisi';
  }, [hal]);
  const baslik = grup.anahtar === '' ? a.grupsuz : grup.anahtar === DIGER_GRUBU ? a.digerGrubu : grup.anahtar;
  return (
    <tr className="border-t-2 border-line bg-surface-muted">
      <td className="px-3 py-2">
        <input
          ref={kutu}
          type="checkbox"
          className="h-4 w-4 accent-brand"
          aria-label={a.grupHepsiEtiketi(baslik)}
          checked={hal === 'hepsi'}
          disabled={kilitli}
          onChange={() => secimDegistir(hal !== 'hepsi')}
        />
      </td>
      <td colSpan={5} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {kilitli || grup.anahtar === '' ? (
            <span className="font-semibold text-ink">{baslik}</span>
          ) : (
            <input
              aria-label={a.grupAdiEtiketi(baslik)}
              maxLength={80}
              className={`${GIRDI_SINIFI} max-w-[16rem] font-semibold`}
              value={ad}
              onChange={(e) => adDegistir(e.target.value)}
            />
          )}
          <span className="text-xs text-ink-muted">
            {a.grupOzeti(grup.satirlar.length, grup.secili, grup.toplamArama.toLocaleString(yerelKodu(dil)))}
            {grup.veriYok > 0 && a.grupVeriYok(grup.veriYok)}
            {grup.anahtar === DIGER_GRUBU && ` · ${a.digerAciklama}`}
          </span>
        </div>
      </td>
    </tr>
  );
}
