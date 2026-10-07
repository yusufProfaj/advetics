'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlanDetayi } from '@advetics/shared';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import {
  REKABET_ETIKETI,
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
    const r = tohumlariAyir(tohumMetni);
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
    );
    setKaydediliyor(false);
    if (r.tur === 'tamam') {
      setKirli(false);
      setKayitMesaji({ ton: 'basari', metin: `${degisiklik.length} kelime güncellendi.` });
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
        baslik="Google arama"
        aciklama="İnsanların Google’da ne aradığı ve ayda kaç kez aradığı. Plana alacağın kelimeleri işaretle."
      />

      {kilit && <KilitNotu neden={kilit} />}

      <ErisimDurumu erisim={kelimeler.erisim} sonHata={kelimeler.sonHata} />

      {kelimeler.erisim === 'var' && kilit === null && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <label htmlFor="tohumlar" className="block text-sm font-semibold text-ink">
            Aranacak kelimeler
          </label>
          <p id="tohumlar-yardim" className="text-sm text-ink-muted">
            Her satıra ya da virgülle ayırarak en çok 20 kelime. Örnek: filtre kahve, french press.
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
          <Dugme onClick={ara} bekliyor={araniyor} disabled={kelimeler.aramaSuruyor}>
            Kelimeleri ara
          </Dugme>
        </div>
      )}

      {kelimeler.aramaSuruyor && (
        <p className="text-sm text-ink-muted" role="status">
          Google’dan kelimeler çekiliyor. Bu sayfa birkaç saniyede bir kendini yeniliyor.
        </p>
      )}

      {aramaMesaji && (
        <Uyari ton={aramaMesaji.ton} baslik={aramaMesaji.ton === 'tehlike' ? 'Arama yapılamadı.' : undefined}>
          {aramaMesaji.metin}
        </Uyari>
      )}

      {kelimeler.satirlar.length === 0 ? (
        kelimeler.erisim === 'var' &&
        !kelimeler.aramaSuruyor && (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">
            {kelimeler.sonHata
              ? 'Son arama sonuç getirmedi; nedeni yukarıda.'
              : kilit === null
                ? 'Bu plan için henüz kelime aranmadı.'
                : 'Bu planda kelime yok.'}
          </p>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
            <span>
              {/* SESSİZ KESME YOK: Google binlerce fikir döndürüyor, plan ilk N'i taşıyor. */}
              {kelimeler.gosterilen.toLocaleString('tr-TR')} / {kelimeler.toplam.toLocaleString('tr-TR')} kelime gösteriliyor ·{' '}
              {seciliSayisi} seçili
              {seciliSayisi > 0 && ` · seçililer ayda yaklaşık ${seciliArama.toLocaleString('tr-TR')} arama`}
            </span>
            {sonCekim && <span>Google’dan çekildi: {zamanMetni(sonCekim)}</span>}
          </div>
          <TabloKabi etiket="Kelime tablosu">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-semibold">Plana al</th>
                  <th className="px-3 py-2 font-semibold">Kelime</th>
                  <th className="px-3 py-2 text-right font-semibold">Aylık arama</th>
                  <th className="px-3 py-2 font-semibold">Rekabet</th>
                  <th className="px-3 py-2 text-right font-semibold">Tıklama başı teklif</th>
                  <th className="px-3 py-2 font-semibold">Reklam grubu</th>
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
                            aria-label={`${s.kelime} plana alınsın`}
                            checked={t.secili}
                            disabled={kilit !== null}
                            onChange={(e) => guncelle(s.id, { secili: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 text-ink">
                          {s.kelime}
                          {s.varyantlar.length > 0 && (
                            <span className="mt-0.5 block text-xs text-ink-muted">Aynı sayılan: {s.varyantlar.join(', ')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{aylikAramaMetni(s.aylikArama)}</td>
                        <td className="px-3 py-2">{s.rekabet ? REKABET_ETIKETI[s.rekabet] : 'veri yok'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <TeklifAraligi alt={s.teklifAltMicros} ust={s.teklifUstMicros} para={plan.paraBirimi} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`${s.kelime} reklam grubu`}
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
                            <span className="mt-1 inline-block rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-muted" title="Bu grup adını elle yazdın; yeniden gruplama değiştirmez.">
                              elle
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
                    Kayıtlı hâli yükle
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
                Seçimi kaydet
              </Dugme>
              {degisiklik.length > 0 && (
                <span className="text-sm text-ink-muted">{degisiklik.length} kelimede kaydedilmemiş değişiklik var.</span>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ErisimDurumu({ erisim, sonHata }: { erisim: PlanDetayi['kelimeler']['erisim']; sonHata: string | null }) {
  if (erisim === 'olculmedi') {
    return (
      <Uyari ton="bilgi" baslik="Kelime araması bu hesapta henüz açılmadı.">
        Google’ın kelime verisine erişim bu hesap için henüz doğrulanmadı. Doğrulanınca burada arama yapılabilecek.
      </Uyari>
    );
  }
  if (erisim === 'yok') {
    return (
      <Uyari ton="tehlike" baslik="Google Keyword Planner bu hesapta açık değil.">
        {sonHata ?? 'Google erişimi reddetti; neden bildirmedi.'}
      </Uyari>
    );
  }
  // Erişim var ama son arama düştü: platformun cümlesi olduğu gibi.
  return sonHata ? (
    <Uyari ton="tehlike" baslik="Son arama tamamlanamadı.">
      {sonHata}
    </Uyari>
  ) : null;
}

/** Teklif alanları Google'dan boş gelebiliyor; boş "veri yok", sıfır değil. */
function TeklifAraligi({ alt, ust, para }: { alt: string | null; ust: string | null; para: string }) {
  if (alt === null && ust === null) return <>veri yok</>;
  if (alt === null) return <>en çok {formatMoney(ust, para)}</>;
  if (ust === null) return <>en az {formatMoney(alt, para)}</>;
  return (
    <>
      {formatMoney(alt, para)} - {formatMoney(ust, para)}
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
  kilitli,
  secimDegistir,
  adDegistir,
}: {
  grup: KelimeGrubu;
  ad: string;
  kilitli: boolean;
  secimDegistir: (secili: boolean) => void;
  adDegistir: (ad: string) => void;
}) {
  const kutu = useRef<HTMLInputElement>(null);
  const hal = grupSecimHali(grup);
  useEffect(() => {
    if (kutu.current) kutu.current.indeterminate = hal === 'bazisi';
  }, [hal]);
  const baslik = grup.anahtar === '' ? 'Grupsuz' : grup.anahtar;
  return (
    <tr className="border-t-2 border-line bg-surface-muted">
      <td className="px-3 py-2">
        <input
          ref={kutu}
          type="checkbox"
          className="h-4 w-4 accent-brand"
          aria-label={`${baslik} grubundaki bütün kelimeler plana alınsın`}
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
              aria-label={`${baslik} grubunun adı`}
              maxLength={80}
              className={`${GIRDI_SINIFI} max-w-[16rem] font-semibold`}
              value={ad}
              onChange={(e) => adDegistir(e.target.value)}
            />
          )}
          <span className="text-xs text-ink-muted">
            {grup.satirlar.length} kelime · {grup.secili} seçili · ayda yaklaşık {grup.toplamArama.toLocaleString('tr-TR')} arama
            {grup.veriYok > 0 && ` (${grup.veriYok} kelimede veri yok)`}
            {grup.anahtar === DIGER_GRUBU && ' · tohumların dışında kalan küçük kelimeler'}
          </span>
        </div>
      </td>
    </tr>
  );
}
