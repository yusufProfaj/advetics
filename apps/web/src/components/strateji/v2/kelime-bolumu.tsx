'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { stratejiUcYolu } from '@advetics/shared';
import type { StratejiDetayi } from '@advetics/shared';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum } from '@/components/ui/hal';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import {
  DIGER_GRUBU,
  REKABET_ETIKETI,
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
    const r = tohumlariAyir(tohum);
    if (r.tur === 'hata') return setTohumHatasi(r.mesaj);
    setTohumHatasi(null);
    setAramaHatasi(null);
    setAraniyor(true);
    // Sonuç YANITTAN DEĞİL plandan okunur: erişim, `sonHata`, `aramaSuruyor` tek yerden.
    const s = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/kelime-ara', { id: plan.id }), 'POST', { tohumlar: r.tohumlar }, tazeSurum, null);
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
    const r = await yaz(stratejiUcYolu('/strateji/v2/planlar/:id/kelimeler', { id: plan.id }), 'PATCH', { satirlar: degisiklik, surum: plan.surum }, tazeSurum, plan.surum);
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
    <Kart baslik="Google arama kelimeleri" eylem={<KelimeHali hal={hal} />}>
      <p className="m-0 text-12 text-ink-muted">İnsanların Google'da ne aradığı, ayda yaklaşık kaç kez. Seçtiğin grup, Google Arama kampanyasının kelimeleri olur.</p>

      {hal === 'erisim_yok' && (
        <div className="mt-3">
          <Bildirim hata baslik="Google Keyword Planner bu hesapta açık değil.">
            {kelimeler.sonHata ?? 'Google erişimi reddetti; neden bildirmedi.'}
          </Bildirim>
        </div>
      )}
      {hal === 'dustu' && (
        <div className="mt-3">
          <Bildirim hata baslik="Son arama tamamlanamadı.">
            {kelimeler.sonHata}
          </Bildirim>
        </div>
      )}
      {hal === 'suruyor' && (
        <p className="m-0 mt-3 text-[13px] text-ink-muted" role="status">
          Google'dan kelimeler çekiliyor (kuyrukta ya da soruluyor). Ekran {YOKLAMA_MS / 1000} saniyede bir yeniliyor.
        </p>
      )}
      {yoklamaDustu && hal === 'suruyor' && (
        <div className="mt-3">
          <Bildirim
            hata
            baslik="Aramanın durumu okunamadı; yenileme durdu."
            eylem={
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => setYoklamaDustu(false)}>
                Yeniden dene
              </Dugme>
            }
          />
        </div>
      )}

      {duzenlenebilir && hal !== 'erisim_yok' && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor={KELIME_TOHUM_ID} className="text-xs font-semibold text-ink-muted">
            Aranacak kelimeler
          </label>
          <textarea
            id={KELIME_TOHUM_ID}
            rows={2}
            className={GIRDI}
            placeholder="Her satıra ya da virgülle; en çok 20. Örnek: satılık daire izmir, deniz manzaralı daire"
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
              Kelime ara
            </Dugme>
          </span>
          {aramaHatasi && <Bildirim hata baslik={`Arama başlatılamadı: ${aramaHatasi}`} />}
        </div>
      )}

      {kelimeler.satirlar.length === 0 ? (
        hal === 'aranmadi' && (
          <div className="mt-3">
            <BosDurum baslik="Kelime yok" neden={duzenlenebilir ? 'Bu stratejide henüz kelime aranmadı.' : 'Bu stratejide kelime yok.'} />
          </div>
        )
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-muted">
            {/* SESSİZ KESME YOK: Google binlerce fikir döndürüyor, ekran ilk N'i taşıyor. */}
            <span>
              {kelimeler.gosterilen.toLocaleString('tr-TR')} / {kelimeler.toplam.toLocaleString('tr-TR')} kelime gösteriliyor · {seciliSayisi} seçili · hacimler yaklaşık, yakın varyantlar tek satır
            </span>
            {sonCekim && <span>Google'dan çekildi: {zamanMetni(sonCekim)}</span>}
          </div>
          <div className="mt-2 overflow-x-auto" role="region" aria-label="Kelime tablosu" tabIndex={0}>
            <table className="w-full min-w-[44rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-2.5 py-2 font-semibold">Plana al</th>
                  <th className="px-2.5 py-2 font-semibold">Kelime</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Aylık arama</th>
                  <th className="px-2.5 py-2 font-semibold">Rekabet</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Tıklama başı teklif</th>
                  <th className="px-2.5 py-2 font-semibold">Grup</th>
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
                          <input type="checkbox" className="h-4 w-4 accent-brand" aria-label={`${s.kelime} plana alınsın`} checked={t.secili} disabled={!duzenlenebilir} onChange={(e) => guncelle([s.id], { secili: e.target.checked })} />
                        </td>
                        <td className="px-2.5 py-2">
                          {s.kelime}
                          {s.varyantlar.length > 0 && <span className="block text-[11px] text-ink-muted">Aynı sayılan: {s.varyantlar.join(', ')}</span>}
                        </td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{aylikAramaMetni(s.aylikArama)}</td>
                        <td className="px-2.5 py-2">{s.rekabet ? REKABET_ETIKETI[s.rekabet] : 'veri yok'}</td>
                        <td className="px-2.5 py-2 text-right">
                          <Teklif alt={s.teklifAltMicros} ust={s.teklifUstMicros} para={plan.paraBirimi} />
                        </td>
                        <td className="px-2.5 py-2">
                          <input aria-label={`${s.kelime} grubu`} list="strateji-kelime-gruplari" maxLength={80} className={`${GIRDI} min-w-[9rem]`} value={t.grup} disabled={!duzenlenebilir} onChange={(e) => guncelle([s.id], { grup: e.target.value })} />
                          {s.grupElle && <span className="mt-1 inline-block text-[11px] text-ink-muted">elle yazıldı</span>}
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
                Seçimi kaydet
              </Dugme>
              {degisiklik.length > 0 && <span className="text-xs text-ink-muted">{degisiklik.length} kelimede kaydedilmemiş değişiklik var; gruplar kaydedince kampanyaya bağlanabilir.</span>}
              {kayit.tur === 'tamam' && <span className="text-xs text-ink-muted">{kayit.n} kelime güncellendi.</span>}
            </div>
          )}
          {(kayit.tur === 'hata' || kayit.tur === 'cakisma') && (
            <div className="mt-2">
              <Bildirim hata baslik={kayit.tur === 'cakisma' ? 'Strateji başka biri tarafından değiştirildi.' : 'Seçim kaydedilemedi.'}>
                {kayit.mesaj}
              </Bildirim>
            </div>
          )}
        </>
      )}
    </Kart>
  );
}

const HAL_METNI = {
  erisim_yok: { metin: 'Erişim yok', ton: 'uyari' },
  suruyor: { metin: 'Aranıyor', ton: 'notr' },
  dustu: { metin: 'Arama düştü', ton: 'uyari' },
  bitti: { metin: 'Sonuçlar geldi', ton: 'ok' },
  aranmadi: { metin: 'Aranmadı', ton: 'notr' },
} as const;

function KelimeHali({ hal }: { hal: keyof typeof HAL_METNI }) {
  const h = HAL_METNI[hal];
  return (
    <Rozet hal={durumHali(h.ton)}>{h.metin}</Rozet>
  );
}

/** Teklif alanları Google'dan boş gelebiliyor; boş "veri yok", sıfır değil. */
function Teklif({ alt, ust, para }: { alt: string | null; ust: string | null; para: string }) {
  if (alt === null && ust === null) return <>veri yok</>;
  if (alt === null) return <>en çok <Tutar micros={ust!} para={para} /></>;
  if (ust === null) return <>en az <Tutar micros={alt} para={para} /></>;
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
  const kutu = useRef<HTMLInputElement>(null);
  const hal = grupSecimHali(g);
  useEffect(() => {
    if (kutu.current) kutu.current.indeterminate = hal === 'bazisi';
  }, [hal]);
  const ad = g.anahtar === '' ? 'Grupsuz' : g.anahtar;
  const bagli = aramaKalemleri.filter((k) => k.kelimeGrubu === g.anahtar);
  return (
    <tr className="border-b border-line bg-surface-muted">
      <td className="px-2.5 py-2">
        <input ref={kutu} type="checkbox" className="h-4 w-4 accent-brand" aria-label={`${ad} grubundaki bütün kelimeler plana alınsın`} checked={hal === 'hepsi'} disabled={kilitli} onChange={() => secimDegistir(hal !== 'hepsi')} />
      </td>
      <td colSpan={5} className="px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <b>{ad}</b>
          <span className="text-xs text-ink-muted">
            {g.satirlar.length} kelime · {g.secili} seçili · ayda yaklaşık {g.toplamArama.toLocaleString('tr-TR')} arama
            {g.veriYok > 0 && ` (${g.veriYok} kelimede veri yok)`}
            {g.anahtar === DIGER_GRUBU && ' · tohumların dışında kalan küçük kelimeler'}
          </span>
          {bagli.length > 0 && <span className="text-xs font-semibold">Bağlı: {bagli.map((k) => k.ad).join(', ')}</span>}
          {!kilitli && g.anahtar !== '' && aramaKalemleri.length > 0 && (
            <select
              className={`${GIRDI} ml-auto w-auto text-xs`}
              aria-label={`${ad} grubunu kampanyaya bağla`}
              value=""
              disabled={!baglanabilir}
              title={baglanabilir ? undefined : kirli ? 'Önce seçimi kaydet' : 'Grupta seçili kelime yok'}
              onChange={(e) => e.target.value !== '' && bagla(Number(e.target.value))}
            >
              <option value="">{baglanabilir ? 'Kampanyaya bağla' : kirli ? 'Önce seçimi kaydet' : 'Seçili kelime yok'}</option>
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
