'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REHBER_AMACLARI,
  REHBER_AMAC_KODLARI,
  markaMerkeziAdresi,
  stratejiUcYolu,
  type RehberAmacKodu,
  type RehberKonumu,
  type SihirbazKitlesi,
  type StratejiKitleOnerisi,
  type StratejiSihirbazGirdileri,
} from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Soru } from '@/components/ui/sihirbaz';
import { microsGirdiMetni, okumaHatasi } from '../hesap';
import { SURE_SECENEKLERI, hedefDegistir, hedefKarti, kaydiriciAraligi, type ButceDurumu } from './akis';
import { AmacIkonu } from './belge';
import { donemMetni } from './hesap';
import { KonumSecici } from './kalem-duzenleyici';
import { Bildirim, Etiket } from './ortak';
import { Tutar } from './tutar';

/**
 * ═══ SORU ADIMLARI: 1 Hedef · 2 Bütçe · 3 Bölge · 4 Kime ═══
 *
 * Her ekran TEK soru. Değerler çerçevede (`sihirbaz.tsx`) duruyor: "Kaydet
 * ve çık" hangi adımda basılırsa basılsın hepsini yazabilsin. Bu bileşenler
 * istek atmaz; yalnız Kime adımı yapay zekâdan tarif ister (YAZMAZ).
 */

// ─── 1 · Hedef ───────────────────────────────────────────────────────────────

export function AdimHedef({
  girdiler,
  secili,
  degistir,
  clientId,
}: {
  girdiler: StratejiSihirbazGirdileri;
  secili: readonly RehberAmacKodu[];
  degistir: (a: RehberAmacKodu[]) => void;
  clientId: string;
}) {
  const kapaliVar = girdiler.amaclar.some((a) => !a.acik);
  return (
    <>
      <Soru ust="1 / 7 · Hedef" soru="Reklamdan ne bekliyorsun?" aciklama="Birden çok seçebilirsin. Seçtiğin sıra önceliği gösterir; bütçenin çoğu ilk seçtiğine gider." />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
        {REHBER_AMAC_KODLARI.map((amac) => {
          const g = girdiler.amaclar.find((x) => x.amac === amac);
          const kart = hedefKarti(g);
          const sira = secili.indexOf(amac);
          const seciliMi = sira > -1;
          return (
            <button
              key={amac}
              type="button"
              aria-pressed={seciliMi}
              disabled={kart.kapali && !seciliMi}
              title={g && g.sebepler.length > 0 ? g.sebepler.join(' ') : undefined}
              onClick={() => degistir(hedefDegistir(secili, amac))}
              className={`relative grid content-start gap-2 rounded-xl border p-4 text-left motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-55 ${seciliMi ? 'border-brand bg-vurgu shadow-[0_0_0_1px_var(--color-brand)]' : 'border-line bg-surface hover:border-ink/25'}`}
            >
              <AmacIkonu amac={amac} />
              <b className="font-baslik text-[15px] text-ink">{REHBER_AMACLARI[amac].ekranAdi}</b>
              <small className="text-[12.5px] text-ink-muted">{REHBER_AMACLARI[amac].neAlacaksin}</small>
              {kart.kapali ? (
                <span className="text-xs text-brand-strong">{kart.neden}</span>
              ) : (
                <span className="text-[11.5px] text-ink-muted">{kart.platformlar}</span>
              )}
              <span
                aria-hidden
                className={`font-baslik absolute right-3 top-3 grid h-[22px] w-[22px] place-items-center rounded-full bg-brand text-xs font-bold text-[var(--beyaz)] motion-safe:transition-[opacity,transform] motion-safe:duration-150 ${seciliMi ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
              >
                {sira + 1}
              </span>
            </button>
          );
        })}
      </div>
      {kapaliVar && (
        <div className="mt-4">
          <Bildirim baslik="Kapalı olanların nedeni kartın altında yazıyor.">
            Çoğu{' '}
            <Link href={markaMerkeziAdresi('kurulum', clientId, 'olcum')} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
              Kurulum › Ölçüm
            </Link>{' '}
            ekranında çözülür. Ölçülmeyen bir sonuca reklam vermek, parayı tıklamaya harcamak demek.
          </Bildirim>
        </div>
      )}
      {girdiler.okumaHatalari.length > 0 && (
        <div className="mt-4">
          <Bildirim baslik="Bazı bilgiler okunamadı; o hedefler kapatılmadı.">
            {girdiler.okumaHatalari.join(' ')}
          </Bildirim>
        </div>
      )}
    </>
  );
}

// ─── 2 · Bütçe ───────────────────────────────────────────────────────────────

export function AdimButce({
  girdiler,
  sure,
  setSure,
  metin,
  setMetin,
  durum,
}: {
  girdiler: StratejiSihirbazGirdileri;
  sure: number;
  setSure: (s: number) => void;
  metin: string;
  setMetin: (m: string) => void;
  durum: ButceDurumu;
}) {
  const para = girdiler.paraBirimi;
  const micros = durum.tutar.tur === 'tamam' ? durum.tutar.micros : null;
  const aralik = kaydiriciAraligi(micros);
  const kaydirici = micros === null ? aralik.min : Math.min(aralik.max, Number(micros / 1_000_000n));
  const yetmeyen = durum.kontrol?.satirlar.filter((s) => s.durum === 'yetmez') ?? [];
  const bilinmeyen = durum.kontrol?.satirlar.filter((s) => s.durum === 'bilinmiyor') ?? [];
  return (
    <>
      <Soru ust="2 / 7 · Bütçe" soru="Ne kadar süre, ne kadar bütçe?" aciklama="Toplam tutarı yaz. Günlük karşılığını ve platformların alt sınırına yetip yetmediğini anında görürsün." />
      <div className="max-w-[720px]">
        <div className="mb-5 grid gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Süre</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Süre">
            {SURE_SECENEKLERI.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sure === s}
                onClick={() => setSure(s)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${sure === s ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:border-ink/30'}`}
              >
                {s} ay
              </button>
            ))}
          </div>
          <span className="text-[12.5px] text-ink-muted">{donemMetni(durum.donem.baslangic, durum.donem.bitis)} · {durum.gun} gün</span>
        </div>

        <Kart as="div">
          <label htmlFor="strateji-toplam" className="text-xs font-bold uppercase tracking-[0.08em] text-brand-strong">
            Toplam bütçe
          </label>
          <div className="flex items-baseline gap-2">
            <input
              id="strateji-toplam"
              inputMode="decimal"
              className="tutar w-[8ch] min-w-0 flex-1 border-0 border-b-2 border-line bg-transparent py-1 text-[40px] font-extrabold leading-none text-ink outline-none focus:border-brand sm:max-w-[9ch] sm:text-[44px]"
              value={metin}
              aria-invalid={durum.tutar.tur === 'hata'}
              onChange={(e) => setMetin(e.target.value)}
            />
            <span className="tutar text-2xl font-bold text-ink-muted">{para === 'TRY' ? '₺' : para}</span>
          </div>
          {durum.tutar.tur === 'hata' && (
            <p className="m-0 mt-1 text-xs text-brand-strong" role="alert">
              {durum.tutar.mesaj}
            </p>
          )}
          <input
            type="range"
            min={aralik.min}
            max={aralik.max}
            step={aralik.adim}
            value={kaydirici}
            aria-label="Toplam bütçe"
            className="mb-1.5 mt-5 w-full accent-brand"
            onChange={(e) => setMetin(microsGirdiMetni(BigInt(e.target.value) * 1_000_000n, para))}
          />
          <div className="flex justify-between text-xs text-ink-muted">
            <Tutar micros={BigInt(aralik.min) * 1_000_000n} para={para} />
            <Tutar micros={BigInt(aralik.max) * 1_000_000n} para={para} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <BilgiKutusu etiket="Aylık" micros={durum.aylik} para={para} />
            <BilgiKutusu etiket="Günlük" micros={durum.gunluk} para={para} />
            <div className={`rounded-[10px] px-3.5 py-3 ${yetmeyen.length ? 'bg-vurgu' : 'bg-surface-sunken'}`}>
              <span className="block text-xs text-ink-muted">Hedef başına günlük</span>
              {durum.kontrol && durum.kontrol.satirlar.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {durum.kontrol.satirlar.map((s) => (
                    <li key={s.amac} className="flex justify-between gap-2 text-[13px]">
                      <span className="truncate text-ink-muted">{REHBER_AMACLARI[s.amac].ekranAdi}</span>
                      <Tutar micros={s.gunlukMicros} para={para} className={`font-bold ${s.durum === 'yetmez' ? 'text-brand-strong' : 'text-ink'}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <b className="font-baslik text-[17px] text-ink-muted">-</b>
              )}
            </div>
          </div>
          {yetmeyen.map((s) => (
            <p key={s.amac} className="m-0 mt-3 text-[13px] text-brand-strong" role="alert">
              {s.cumle}
            </p>
          ))}
          {bilinmeyen.map((s) => (
            <p key={s.amac} className="m-0 mt-3 text-[13px] text-ink-muted">
              {s.cumle}
            </p>
          ))}
          {durum.kontrol && yetmeyen.length === 0 && bilinmeyen.length === 0 && <p className="m-0 mt-3 text-[13px] text-ink-muted">Her hedef, açık platformlarından en az birinin günlük alt sınırının üstünde.</p>}
        </Kart>
        {girdiler.paraBirimiHatasi && (
          <div className="mt-4">
            <Bildirim hata baslik="Para birimi çözülemedi; strateji açılamaz.">
              {girdiler.paraBirimiHatasi}
            </Bildirim>
          </div>
        )}
        {durum.planYenidenKurulur && (
          <div className="mt-4">
            <Bildirim baslik="Bütçe ya da süre değişti.">Devam edersen kayıtlı kampanyalar silinir ve İnceleme adımı planı bu tutarla yeniden kurar.</Bildirim>
          </div>
        )}
      </div>
    </>
  );
}

function BilgiKutusu({ etiket, micros, para }: { etiket: string; micros: bigint | null; para: string }) {
  return (
    <div className="rounded-[10px] bg-surface-sunken px-3.5 py-3">
      <span className="block text-xs text-ink-muted">{etiket}</span>
      {micros === null ? <b className="font-baslik text-[17px] text-ink-muted">-</b> : <Tutar micros={micros} para={para} className="text-[17px] font-bold text-ink" />}
    </div>
  );
}

// ─── 3 · Bölge ───────────────────────────────────────────────────────────────

export function AdimBolge({ girdiler, konumlar, degistir }: { girdiler: StratejiSihirbazGirdileri; konumlar: RehberKonumu[]; degistir: (k: RehberKonumu[]) => void }) {
  const oneri = girdiler.konumOnerisi;
  return (
    <>
      <Soru
        ust="3 / 7 · Bölge"
        soru="Reklam nerede görünsün?"
        aciklama={oneri.kaynak === 'marka' ? "Marka Merkezi'ndeki varsayılan kitleden önerdik. İl, ilçe ya da ülke ekleyebilirsin." : "Marka Merkezi'nde varsayılan bölge yok; aramaya yazıp ekle."}
      />
      <div className="max-w-[720px] space-y-4">
        <Kart as="div">
          <span className="mb-2 block text-[13px] font-semibold text-ink">Bölgeler</span>
          <KonumSecici konumlar={konumlar} degistir={degistir} hesap={girdiler.konumHesabi} acik />
          {oneri.adres && <p className="m-0 mt-2.5 text-xs text-ink-muted">İşletme adresi: {oneri.adres}. Adresin çevresi AdvCampaign'de ayrıca seçilebilir.</p>}
        </Kart>
        {girdiler.ozelKategori && (
          <Bildirim baslik="Özel reklam kategorisi beyan edildi.">Meta bu kategoride yaşı ve adres çevresini daraltmaya izin vermiyor; bölge geniş tutulur, yaş 18-65+.</Bildirim>
        )}
      </div>
    </>
  );
}

// ─── 4 · Kime ────────────────────────────────────────────────────────────────

type OneriHali = { tur: 'bos' } | { tur: 'suruyor' } | { tur: 'yok'; neden: string } | { tur: 'hata'; mesaj: string };

/**
 * "Kime anlatıyoruz". Yapay zekânın tarifi bir ÖNERİ: kullanıcı okuyup
 * "Bu tarif doğru, kullan" demeden Devam kapalı. Metne dokunmak onayı
 * kaldırır (onaylanan metin ile kaydedilen metin ayrışmasın). Dört hâl
 * ayrı yazılı: "henüz istenmedi", "yazılıyor", "yazamadı (nedeniyle)",
 * "istek düştü"; boş kutuya düşmek kullanıcıyı sebebi aramaya gönderirdi.
 */
export function AdimKime({ planId, kitle, degistir }: { planId: string; kitle: SihirbazKitlesi | null; degistir: (k: SihirbazKitlesi | null) => void }) {
  const [hal, setHal] = useState<OneriHali>({ tur: 'bos' });

  const iste = useCallback(
    async (onceki: string | null) => {
      setHal({ tur: 'suruyor' });
      try {
        const r = await apiFetch<StratejiKitleOnerisi>(stratejiUcYolu('/strateji/v2/planlar/:id/kitle-oner', { id: planId }), {
          method: 'POST',
          body: JSON.stringify(onceki ? { yeniden: true, onceki } : {}),
        });
        if (r.tur === 'metin') {
          degistir({ metin: r.metin, kaynak: 'ai', onaylandi: false });
          setHal({ tur: 'bos' });
        } else setHal({ tur: 'yok', neden: r.neden });
      } catch (e) {
        setHal({ tur: 'hata', mesaj: okumaHatasi(e) });
      }
    },
    [planId, degistir],
  );

  // Tarif yoksa ilk açılışta bir kez istenir; kayıtlı tarif EZİLMEZ. Bayrak
  // ref'te: geliştirme kipinde effect iki kez koşar ve state henüz
  // güncellenmemiş olur; yapay zekâya iki istek gitmesin.
  const istendi = useRef(false);
  useEffect(() => {
    if (kitle || istendi.current) return;
    istendi.current = true;
    void iste(null);
  }, [kitle, iste]);

  return (
    <>
      <Soru ust="4 / 7 · Kime" soru="Kime anlatıyoruz?" aciklama="Sitenden ve Marka Merkezi'nden yazdık. Değiştir ya da olduğu gibi kullan; rapor ve reklam metinleri buna göre yazılır." />
      <div className="max-w-[720px]">
        <Kart as="div">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {kitle ? <Etiket ton={kitle.kaynak === 'ai' ? 'kirmizi' : 'cizgi'}>{kitle.kaynak === 'ai' ? 'Yapay zekâ önerisi' : 'Ajans yazdı'}</Etiket> : <span />}
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => void iste(kitle?.metin ?? null)} bekliyor={hal.tur === 'suruyor'}>
              {kitle ? 'Yeniden yaz' : 'Tarif yaz'}
            </Dugme>
          </div>
          <textarea
            aria-label="Kime anlatıyoruz"
            className="min-h-[7rem] w-full resize-y border-0 bg-transparent text-[15px] leading-relaxed text-ink outline-none"
            maxLength={2000}
            placeholder={hal.tur === 'suruyor' ? 'Tarif yazılıyor…' : 'Reklamın anlattığı kişiyi iki-üç cümleyle yaz.'}
            value={kitle?.metin ?? ''}
            onChange={(e) => degistir(e.target.value.trim() === '' ? null : { metin: e.target.value, kaynak: 'ajans', onaylandi: false })}
          />
        </Kart>
        {hal.tur === 'yok' && <p className="m-0 mt-2 text-[13px] text-ink-muted">Tarif yazılamadı: {hal.neden}</p>}
        {hal.tur === 'hata' && (
          <p className="m-0 mt-2 text-[13px] text-brand-strong" role="alert">
            Tarif istenemedi: {hal.mesaj}
          </p>
        )}
        <label className={`mt-4 flex items-center gap-2.5 text-sm font-semibold ${kitle ? 'cursor-pointer text-ink' : 'text-ink-muted'}`}>
          <input
            type="checkbox"
            className="h-[18px] w-[18px] accent-brand"
            disabled={!kitle}
            checked={kitle?.onaylandi ?? false}
            onChange={(e) => kitle && degistir({ ...kitle, onaylandi: e.target.checked })}
          />
          Bu tarif doğru, kullan
        </label>
        <p className="m-0 mt-1.5 text-xs text-ink-muted">Bu metin hedefleme ayarı değil; görsel ve metin yönünü belirler. Bölge ve yaş ayrı.</p>
      </div>
    </>
  );
}
