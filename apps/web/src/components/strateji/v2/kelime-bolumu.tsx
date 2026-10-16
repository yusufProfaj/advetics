'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { stratejiUcYolu } from '@advetics/shared';
import type { StratejiDetayi } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiKelimeSozlugu } from '@/dil/sozlukler/strateji-v2-belge';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum } from '@/components/ui/hal';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import {
  DIGER_GRUBU,
  rekabetEtiketi,
  YOKLAMA_MS,
  aylikAramaMetni,
  grupSecimHali,
  kelimeDegisiklikleri,
  kelimeGruplari,
  tohumlariAyir,
  zamanMetni,
  type KelimeGrubu,
} from '../hesap';
import { kelimeAramaHali, seciliKelimeGruplari } from './hesap';
import { Bildirim, GIRDI, durumHali, yaz } from './ortak';
import { Tutar } from './tutar';

type Taslak = Record<string, { secili: boolean; grup: string }>;
const taslakKur = (k: StratejiDetayi['kelimeler']): Taslak => Object.fromEntries(k.satirlar.map((s) => [s.id, { secili: s.secili, grup: s.grup ?? '' }]));

/** Düzenleyicinin "Kelime ara" eylemi bu kimliğe kaydırıp odaklar. */
export const KELIME_TOHUM_ID = 'strateji-kelime-tohum';

/**
 * ═══ GOOGLE KELİME ARAMASI (v2) — Ajan 4 AÇIK-1 ═══
 *
 * v2 ekranında kelime araması YOKTU: kalem düzenleyici "kelime araması
 * yapılmadı" diyor ama yolunu göstermiyordu ve Google Arama kalemleri
 * rehbere KELİMESİZ gidiyordu. Uçlar v2'nin (`…/v2/planlar/:id/kelime-ara`,
 * `…/kelimeler`); tablo, kuyruk ve satır şekli v1 ile AYNI, saf yardımcılar
 * da v1'in (`tohumlariAyir`, `kelimeGruplari`, `kelimeDegisiklikleri`):
 * ikinci bir gruplama ya da tohum ayrıştırıcı doğduğu anda ayrışırdı.
 * v1 bileşeni (`arama-bolumu.tsx`) doğrudan kullanılmadı: v1 detay tipine ve
 * panelin uyarı renklerine bağlı; görünüş bu modülde kılavuzun dört rengi.
 *
 * YOKLAMA yalnız arama sürerken, bileşen kalkınca temizlenir; okuma düşerse
 * yoklama DURUR ve bunu yazar (sessizce denemeye devam etmek de, sessizce
 * durmak da "sürüyor" yazısını sonsuza kadar ekranda bırakırdı).
 *
 * KELİME → KALEM: grup başlığından doğrudan "Kampanyaya bağla". Yalnız
 * KAYDEDİLMİŞ seçili kelimesi olan grup bağlanabilir (`seciliKelimeGruplari`):
 * aktarım sunucuda `secili AND grup = kelime_grubu` okuyor.
 */
export function KelimeBolumu({
  detay,
  duzenlenebilir,
  yenile,
  tazeSurum,
  aramaKalemleri,
  grubaBagla,
}: {
  detay: StratejiDetayi;
  duzenlenebilir: boolean;
  yenile: () => Promise<StratejiDetayi | null>;
  tazeSurum: () => Promise<number | null>;
  /** Google payı olan Arama kurgulu kalemler (ekrandaki taslaktan). */
  aramaKalemleri: ReadonlyArray<{ index: number; ad: string; kelimeGrubu: string | null }>;
  grubaBagla: (index: number, grup: string) => void;
}) {
  const km = useSozluk(stratejiKelimeSozlugu);
  const { dil } = useDil();
  const sayiYereli = dil === 'en' ? 'en-US' : 'tr-TR';
  const { plan, kelimeler } = detay;
  const hal = kelimeAramaHali(kelimeler);
  const [tohum, setTohum] = useState('');
  const [tohumHatasi, setTohumHatasi] = useState<string | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const [aramaHatasi, setAramaHatasi] = useState<string | null>(null);
  const [yoklamaDustu, setYoklamaDustu] = useState(false);
  const [taslak, setTaslak] = useState<Taslak>(() => taslakKur(kelimeler));
  const [kirli, setKirli] = useState(false);
  const [kayit, setKayit] = useState<{ tur: 'bos' } | { tur: 'suruyor' } | { tur: 'tamam'; n: number } | { tur: 'cakisma' | 'hata'; mesaj: string }>({ tur: 'bos' });

  useEffect(() => {
    if (!kirli) setTaslak(taslakKur(kelimeler));
  }, [kelimeler, kirli]);

  // YOKLAMA: yalnız sürerken; bileşen kalkınca ya da hâl değişince temizlenir.
  useEffect(() => {
    if (!kelimeler.aramaSuruyor || yoklamaDustu) return;
    const t = window.setTimeout(() => {
      void yenile().then((taze) => {
        if (!taze) setYoklamaDustu(true);
      });
    }, YOKLAMA_MS);
    return () => window.clearTimeout(t);
  }, [kelimeler, yenile, yoklamaDustu]);

  const degisiklik = useMemo(() => kelimeDegisiklikleri(kelimeler.satirlar, taslak), [kelimeler.satirlar, taslak]);
  const gruplu = useMemo(() => kelimeGruplari(kelimeler.satirlar, taslak), [kelimeler.satirlar, taslak]);
  const baglanabilir = useMemo(() => new Set(seciliKelimeGruplari(kelimeler.satirlar).map((g) => g.grup)), [kelimeler.satirlar]);
  const seciliSayisi = Object.values(taslak).filter((t) => t.secili).length;
  const sonCekim = kelimeler.satirlar.reduce<string | null>((s, x) => (s === null || x.cekimZamani > s ? x.cekimZamani : s), null);

  async function ara() {
    const r = tohumlariAyir(tohum, dil);
    if (r.tur === 'hata') return setTohumHatasi(r.mesaj);
    setTohumHatasi(null);
    setAramaHatasi(null);
    setAraniyor(true);
    // Sonuç YANITTAN DEĞİL plandan okunur: erişim, `sonHata`, `aramaSuruyor` tek yerden.
    const s = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/kelime-ara', { id: plan.id }), 'POST', { tohumlar: r.tohumlar }, tazeSurum, null, dil);
    setAraniyor(false);
    if (s.tur === 'tamam') {
      setTohum('');
      setYoklamaDustu(false);
      await yenile();
    } else setAramaHatasi(s.mesaj);
  }

  async function kaydet() {
    if (degisiklik.length === 0) return;
    setKayit({ tur: 'suruyor' });
    const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/kelimeler', { id: plan.id }), 'PATCH', { satirlar: degisiklik, surum: plan.surum }, tazeSurum, plan.surum, dil);
    if (r.tur === 'tamam') {
      setKirli(false);
      setKayit({ tur: 'tamam', n: degisiklik.length });
      await yenile();
    } else setKayit({ tur: r.tur, mesaj: r.mesaj });
  }

  function guncelle(ids: readonly string[], d: Partial<{ secili: boolean; grup: string }>) {
    setTaslak((t) => {
      const y = { ...t };
      for (const id of ids) if (y[id]) y[id] = { ...y[id]!, ...d };
      return y;
    });
    setKirli(true);
    setKayit({ tur: 'bos' });
  }

  return (
    <Kart baslik={km.baslik} eylem={<KelimeHali hal={hal} />}>
      <p className="m-0 text-12 text-ink-muted">{km.aciklama}</p>

      {hal === 'erisim_yok' && (
        <div className="mt-3">
          <Bildirim hata baslik={km.erisimYok}>
            {kelimeler.sonHata ?? km.reddetti}
          </Bildirim>
        </div>
      )}
      {hal === 'dustu' && (
        <div className="mt-3">
          <Bildirim hata baslik={km.sonArama}>
            {kelimeler.sonHata}
          </Bildirim>
        </div>
      )}
      {hal === 'suruyor' && (
        <p className="m-0 mt-3 text-[13px] text-ink-muted" role="status">
          {km.suruyor(YOKLAMA_MS / 1000)}
        </p>
      )}
      {yoklamaDustu && hal === 'suruyor' && (
        <div className="mt-3">
          <Bildirim
            hata
            baslik={km.yoklamaDustu}
            eylem={
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => setYoklamaDustu(false)}>
                {km.yenidenDene}
              </Dugme>
            }
          />
        </div>
      )}

      {duzenlenebilir && hal !== 'erisim_yok' && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor={KELIME_TOHUM_ID} className="text-xs font-semibold text-ink-muted">
            {km.aranacak}
          </label>
          <textarea
            id={KELIME_TOHUM_ID}
            rows={2}
            className={GIRDI}
            placeholder={km.tohumOrnek}
            value={tohum}
            aria-invalid={tohumHatasi ? true : undefined}
            onChange={(e) => {
              setTohum(e.target.value);
              setTohumHatasi(null);
            }}
          />
          {tohumHatasi && (
            <span className="text-xs text-brand-strong" role="alert">
              {tohumHatasi}
            </span>
          )}
          <span>
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void ara()} bekliyor={araniyor} disabled={hal === 'suruyor'}>
              {km.kelimeAra}
            </Dugme>
          </span>
          {aramaHatasi && <Bildirim hata baslik={km.aramaBaslatilamadi(aramaHatasi)} />}
        </div>
      )}

      {kelimeler.satirlar.length === 0 ? (
        hal === 'aranmadi' && (
          <div className="mt-3">
            <BosDurum baslik={km.kelimeYok} neden={duzenlenebilir ? km.aranmadi : km.kelimeYokNeden} />
          </div>
        )
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-muted">
            {/* SESSİZ KESME YOK: Google binlerce fikir döndürüyor, ekran ilk N'i taşıyor. */}
            <span>
              {km.gosteriliyor(kelimeler.gosterilen.toLocaleString(sayiYereli), kelimeler.toplam.toLocaleString(sayiYereli), seciliSayisi)}
            </span>
            {sonCekim && <span>{km.cekildi(zamanMetni(sonCekim, dil))}</span>}
          </div>
          <div className="mt-2 overflow-x-auto" role="region" aria-label={km.tablo} tabIndex={0}>
            <table className="w-full min-w-[44rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-2.5 py-2 font-semibold">{km.planaAl}</th>
                  <th className="px-2.5 py-2 font-semibold">{km.kelime}</th>
                  <th className="px-2.5 py-2 text-right font-semibold">{km.aylikArama}</th>
                  <th className="px-2.5 py-2 font-semibold">{km.rekabet}</th>
                  <th className="px-2.5 py-2 text-right font-semibold">{km.teklif}</th>
                  <th className="px-2.5 py-2 font-semibold">{km.grup}</th>
                </tr>
              </thead>
              {gruplu.map((g) => (
                <tbody key={g.anahtar || '(grupsuz)'}>
                  <GrupBasligi
                    g={g}
                    kilitli={!duzenlenebilir}
                    secimDegistir={(secili) => guncelle(g.satirlar.map((s) => s.id), { secili })}
                    baglanabilir={g.anahtar !== '' && baglanabilir.has(g.anahtar) && !kirli}
                    kirli={kirli}
                    aramaKalemleri={aramaKalemleri}
                    bagla={(i) => grubaBagla(i, g.anahtar)}
                  />
                  {g.satirlar.map((s) => {
                    const t = taslak[s.id] ?? { secili: s.secili, grup: s.grup ?? '' };
                    return (
                      <tr key={s.id} className="border-b border-line align-top">
                        <td className="px-2.5 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-brand" aria-label={km.planaAlinsin(s.kelime)} checked={t.secili} disabled={!duzenlenebilir} onChange={(e) => guncelle([s.id], { secili: e.target.checked })} />
                        </td>
                        <td className="px-2.5 py-2">
                          {s.kelime}
                          {s.varyantlar.length > 0 && <span className="block text-[11px] text-ink-muted">{km.ayniSayilan(s.varyantlar.join(', '))}</span>}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{aylikAramaMetni(s.aylikArama, dil)}</td>
                        <td className="px-2.5 py-2">{s.rekabet ? rekabetEtiketi(s.rekabet, dil) : km.veriYok}</td>
                        <td className="px-2.5 py-2 text-right">
                          <Teklif alt={s.teklifAltMicros} ust={s.teklifUstMicros} para={plan.paraBirimi} />
                        </td>
                        <td className="px-2.5 py-2">
                          <input aria-label={km.grubu(s.kelime)} list="strateji-kelime-gruplari" maxLength={80} className={`${GIRDI} min-w-[9rem]`} value={t.grup} disabled={!duzenlenebilir} onChange={(e) => guncelle([s.id], { grup: e.target.value })} />
                          {s.grupElle && <span className="mt-1 inline-block text-[11px] text-ink-muted">{km.elleYazildi}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <datalist id="strateji-kelime-gruplari">
            {[...new Set(Object.values(taslak).map((t) => t.grup.trim()).filter(Boolean))].map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          {duzenlenebilir && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Dugme ton="koyu" boyut="kucuk" onClick={() => void kaydet()} disabled={degisiklik.length === 0} bekliyor={kayit.tur === 'suruyor'}>
                {km.secimiKaydet}
              </Dugme>
              {degisiklik.length > 0 && <span className="text-xs text-ink-muted">{km.kaydedilmemis(degisiklik.length)}</span>}
              {kayit.tur === 'tamam' && <span className="text-xs text-ink-muted">{km.guncellendi(kayit.n)}</span>}
            </div>
          )}
          {(kayit.tur === 'hata' || kayit.tur === 'cakisma') && (
            <div className="mt-2">
              <Bildirim hata baslik={kayit.tur === 'cakisma' ? km.cakisma : km.kaydedilemedi}>
                {kayit.mesaj}
              </Bildirim>
            </div>
          )}
        </>
      )}
    </Kart>
  );
}

const HAL_TONU = { erisim_yok: 'uyari', suruyor: 'notr', dustu: 'uyari', bitti: 'ok', aranmadi: 'notr' } as const;

function KelimeHali({ hal }: { hal: keyof typeof HAL_TONU }) {
  const km = useSozluk(stratejiKelimeSozlugu);
  return <Rozet hal={durumHali(HAL_TONU[hal])}>{km.hal[hal]}</Rozet>;
}

/** Teklif alanları Google'dan boş gelebiliyor; boş "veri yok", sıfır değil. */
function Teklif({ alt, ust, para }: { alt: string | null; ust: string | null; para: string }) {
  const km = useSozluk(stratejiKelimeSozlugu);
  if (alt === null && ust === null) return <>{km.veriYok}</>;
  if (alt === null) return <>{km.enCok} <Tutar micros={ust!} para={para} /></>;
  if (ust === null) return <>{km.enAz} <Tutar micros={alt} para={para} /></>;
  return (
    <>
      <Tutar micros={alt} para={para} /> - <Tutar micros={ust} para={para} />
    </>
  );
}

/** Grup başlığı: üç hâlli toplu seçim, yaklaşık toplam hacim, kampanyaya bağlama. */
function GrupBasligi({
  g,
  kilitli,
  secimDegistir,
  baglanabilir,
  kirli,
  aramaKalemleri,
  bagla,
}: {
  g: KelimeGrubu;
  kilitli: boolean;
  secimDegistir: (secili: boolean) => void;
  baglanabilir: boolean;
  kirli: boolean;
  aramaKalemleri: ReadonlyArray<{ index: number; ad: string; kelimeGrubu: string | null }>;
  bagla: (index: number) => void;
}) {
  const km = useSozluk(stratejiKelimeSozlugu);
  const { dil } = useDil();
  const kutu = useRef<HTMLInputElement>(null);
  const hal = grupSecimHali(g);
  useEffect(() => {
    if (kutu.current) kutu.current.indeterminate = hal === 'bazisi';
  }, [hal]);
  const ad = g.anahtar === '' ? km.grupsuz : g.anahtar;
  const bagli = aramaKalemleri.filter((k) => k.kelimeGrubu === g.anahtar);
  return (
    <tr className="border-b border-line bg-surface-muted">
      <td className="px-2.5 py-2">
        <input ref={kutu} type="checkbox" className="h-4 w-4 accent-brand" aria-label={km.grupHepsi(ad)} checked={hal === 'hepsi'} disabled={kilitli} onChange={() => secimDegistir(hal !== 'hepsi')} />
      </td>
      <td colSpan={5} className="px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <b>{ad}</b>
          <span className="text-xs text-ink-muted">
            {km.grupOzeti(g.satirlar.length, g.secili, g.toplamArama.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR'))}
            {g.veriYok > 0 && ` (${km.grupVeriYok(g.veriYok)})`}
            {g.anahtar === DIGER_GRUBU && ` · ${km.digerAciklama}`}
          </span>
          {bagli.length > 0 && <span className="text-xs font-semibold">{km.bagli(bagli.map((k) => k.ad).join(', '))}</span>}
          {!kilitli && g.anahtar !== '' && aramaKalemleri.length > 0 && (
            <select
              className={`${GIRDI} ml-auto w-auto text-xs`}
              aria-label={km.grubuBagla(ad)}
              value=""
              disabled={!baglanabilir}
              title={baglanabilir ? undefined : kirli ? km.onceKaydet : km.grupSeciliYok}
              onChange={(e) => e.target.value !== '' && bagla(Number(e.target.value))}
            >
              <option value="">{baglanabilir ? km.kampanyayaBagla : kirli ? km.onceKaydet : km.seciliYok}</option>
              {aramaKalemleri.map((k) => (
                <option key={k.index} value={k.index}>
                  {k.ad}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
    </tr>
  );
}
