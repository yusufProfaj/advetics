'use client';

import { useEffect, useState } from 'react';
import {
  KALEM_KONUM_SINIRI,
  REHBER_AMACLARI,
  kalemTarihHatasi,
  stratejiUcYolu,
  type GeoLocationOption,
  type KalemMetni,
  type RehberKonumu,
  type StratejiKalemiGirdisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { tutarCoz } from '../hesap';
import { kullan, platformDegisti } from './hesap';
import { GIRDI, Etiket } from './ortak';

/**
 * ═══ KALEMİ DÜZENLE (Plan adımında, kalemin İÇİNDEN) ═══
 *
 * Sekmeli düzenleyicinin alanları SADE biçimde: bütçe, tarih, platform ve
 * pay, bölge, yaş, görsel yönergesi, reklam metni. Amaç burada YOK: hedefi
 * Hedef adımı seçti, kalemin amacını değiştirmek o seçimi sessizce bozardı.
 * "Kime anlatıyoruz" da yok: Kime adımında onaylandı ve bütün kalemlere
 * aynı tarif gidiyor. Kelimeler kalemin kendi kutusunda (`KelimeBolumu`).
 *
 * Kapalıyken DOM'dan ÇIKMAZ (CLAUDE.md): yazılan metin, açık konum araması
 * kaybolmasın; `inert` görünmeyen alanı klavyeden saklar, geçiş
 * `motion-safe` altında.
 *
 * Kalem tek bir `StratejiKalemiGirdisi` (sözleşme); doğrulama GİRİŞ
 * ANINDA: tarih dönem dışına taşıyorsa `kalemTarihHatasi`nin cümlesi
 * (sunucunun da koştuğu fonksiyon).
 */
export function KalemDuzenleyici({
  acik,
  k,
  degistir,
  sil,
  plan,
  para,
  konumHesabi,
  ozelKategori,
  kilitli,
  planId,
  kalemKayitli,
}: {
  acik: boolean;
  k: StratejiKalemiGirdisi;
  degistir: (k: StratejiKalemiGirdisi) => void;
  sil: () => void;
  plan: { baslangic: string; bitis: string };
  para: string;
  konumHesabi: string | null;
  ozelKategori: boolean;
  kilitli: boolean;
  planId: string;
  /** Metin önerisi kayıtlı kalem ister (uç `:kalemId` taşıyor). */
  kalemKayitli: boolean;
}) {
  const tutar = tutarCoz(k.butce, para);
  const tarihHatasi = kalemTarihHatasi(k, plan);
  const g = REHBER_AMACLARI[k.amac].google;
  const set = (x: Partial<StratejiKalemiGirdisi>) => degistir({ ...k, ...x });

  return (
    <div className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} inert={!acik}>
      <div className="overflow-hidden">
        <fieldset disabled={kilitli} className="grid gap-3.5 rounded-xl bg-surface-muted px-3 py-4 sm:px-4 md:grid-cols-3">
          <Alan etiket="Bütçe (dönem toplamı)">
            <input className={GIRDI} inputMode="decimal" value={k.butce} onChange={(e) => set({ butce: e.target.value })} aria-invalid={tutar.tur === 'hata'} />
            {tutar.tur === 'hata' && (
              <span className="text-[11px] text-brand-strong" role="alert">
                {tutar.mesaj}
              </span>
            )}
          </Alan>

          <Alan etiket="Tarih">
            <div className="flex items-center gap-1.5">
              <input type="date" className={GIRDI} min={plan.baslangic} max={plan.bitis} value={k.baslangic} onChange={(e) => e.target.value && set({ baslangic: e.target.value })} aria-label="Başlangıç" />
              <span aria-hidden>-</span>
              <input type="date" className={GIRDI} min={plan.baslangic} max={plan.bitis} value={k.bitis} onChange={(e) => e.target.value && set({ bitis: e.target.value })} aria-label="Bitiş" />
            </div>
            {tarihHatasi && (
              <span className="text-[11px] text-brand-strong" role="alert">
                {tarihHatasi}
              </span>
            )}
          </Alan>

          <Alan etiket="Nerede">
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" className="accent-brand" checked={k.meta} onChange={(e) => degistir(platformDegisti(k, 'meta', e.target.checked))} /> Meta
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" className="accent-brand" checked={k.google} disabled={g.kurgu === null} onChange={(e) => degistir(platformDegisti(k, 'google', e.target.checked))} /> Google
              </label>
            </div>
            {g.kurgu === null && <span className="text-[11px] text-ink-muted">Google kapalı: {g.sebep}.</span>}
            {k.meta && k.google && (
              <>
                <input type="range" min={10} max={90} step={5} value={k.metaPayi ?? 50} aria-label="Meta payı" className="w-full accent-brand" onChange={(e) => set({ metaPayi: Number(e.target.value) })} />
                <span className="text-[11px] text-ink-muted">
                  Meta %{k.metaPayi ?? 50} · Google %{100 - (k.metaPayi ?? 50)}
                </span>
              </>
            )}
          </Alan>

          <div className="md:col-span-2">
            <Alan etiket="Bölge">
              <KonumSecici konumlar={k.konumlar} degistir={(konumlar) => set({ konumlar })} hesap={konumHesabi} acik={acik && !kilitli} />
              {ozelKategori && <span className="text-[11px] text-ink-muted">Özel reklam kategorisi: bölge geniş tutulur, adres çevresi kurulamaz.</span>}
            </Alan>
          </div>

          <Alan etiket="Yaş">
            {ozelKategori ? (
              <>
                <input className={GIRDI} value="18-65+" disabled readOnly />
                <span className="text-[11px] text-ink-muted">Özel kategoride daraltılamaz.</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={18} max={65} className={GIRDI} placeholder="18" value={k.yasMin ?? ''} aria-label="En küçük yaş" onChange={(e) => set(yasDegisti(k, 'yasMin', e.target.value))} />
                  <span aria-hidden>-</span>
                  <input type="number" min={18} max={65} className={GIRDI} placeholder="65+" value={k.yasMax ?? ''} aria-label="En büyük yaş" onChange={(e) => set(yasDegisti(k, 'yasMax', e.target.value))} />
                </div>
                <span className="text-[11px] text-ink-muted">Boş bırakılırsa 18-65+.</span>
              </>
            )}
          </Alan>

          <div className="md:col-span-3">
            <MetinKutusu baslik="Görsel ve mesaj" deger={k.kreatifYonergesi} degistir={(m) => set({ kreatifYonergesi: m })} />
          </div>

          <div className="md:col-span-3">
            <ReklamMetni metin={k.metin} degistir={(m) => set({ metin: m })} planId={planId} kalemId={k.id ?? null} kalemKayitli={kalemKayitli} />
          </div>

          <div className="flex items-end md:col-span-3">
            <Dugme ton="hayalet" boyut="kucuk" onClick={sil}>
              Bu kampanyayı plandan çıkar
            </Dugme>
          </div>
        </fieldset>
      </div>
    </div>
  );
}

function yasDegisti(k: StratejiKalemiGirdisi, alan: 'yasMin' | 'yasMax', ham: string): Partial<StratejiKalemiGirdisi> {
  const v = ham === '' ? null : Number(ham);
  // İki uç birlikte (sözleşme): biri silinince ikisi de boşalır; biri yazılınca diğeri ucun varsayılanını alır.
  if (v === null) return { yasMin: null, yasMax: null };
  return alan === 'yasMin' ? { yasMin: v, yasMax: k.yasMax ?? 65 } : { yasMin: k.yasMin ?? 18, yasMax: v };
}

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-ink-muted">{etiket}</span>
      {children}
    </div>
  );
}

/**
 * Kreatif yönergesi / kitle tarifi. `ai` = öneri: "Kullan" demeden belgeye
 * girmez; elle düzenlemek de kaynağı `ajans` yapar (yazan artık ajans).
 */
function MetinKutusu({ baslik, deger, degistir }: { baslik: string; deger: StratejiKalemiGirdisi['kreatifYonergesi']; degistir: (m: StratejiKalemiGirdisi['kreatifYonergesi']) => void }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <b className="text-[13px]">{baslik}</b>
        {deger && <Etiket>{deger.kaynak === 'ai' ? 'Yapay zekâ önerisi' : 'Ajans yazdı'}</Etiket>}
      </div>
      <textarea
        className={`${GIRDI} min-h-[64px]`}
        maxLength={2000}
        value={deger?.metin ?? ''}
        aria-label={baslik}
        onChange={(e) => degistir(e.target.value.trim() === '' ? null : { metin: e.target.value, kaynak: 'ajans' })}
      />
      {deger?.kaynak === 'ai' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Dugme ton="koyu" boyut="kucuk" onClick={() => degistir(kullan(deger))}>
            Kullan
          </Dugme>
          <span className="text-[11px] text-ink-muted">"Kullan" denmeyen öneri müşterinin belgesine girmez.</span>
        </div>
      )}
    </div>
  );
}

type OneriHali = { tur: 'bos' } | { tur: 'suruyor' } | { tur: 'hata'; mesaj: string };

/** Reklam metni rehberin metin motorundan (`…/metin-oner`); "Kullan" denmeyen metin rehbere ÖNERİ olarak gider. */
function ReklamMetni({ metin, degistir, planId, kalemId, kalemKayitli }: { metin: KalemMetni | null; degistir: (m: KalemMetni | null) => void; planId: string; kalemId: string | null; kalemKayitli: boolean }) {
  const [hal, setHal] = useState<OneriHali>({ tur: 'bos' });

  async function oner() {
    if (!kalemId) return;
    setHal({ tur: 'suruyor' });
    try {
      const m = await apiFetch<KalemMetni>(stratejiUcYolu('/strateji/v2/planlar/:id/kalemler/:kalemId/metin-oner', { id: planId, kalemId }), { method: 'POST', body: '{}' });
      degistir({ ...m, kaynak: 'ai' });
      setHal({ tur: 'bos' });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' });
    }
  }

  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <b className="text-[13px]">Reklam metni önerisi</b>
        {metin && <Etiket>{metin.kaynak === 'ai' ? 'AdvCampaign metin motoru' : 'Ajans yazdı'}</Etiket>}
      </div>
      {metin ? (
        <div className="space-y-1 text-[13px]">
          {metin.basliklar.length > 0 && (
            <p className="m-0">
              <b>Başlık:</b> {metin.basliklar.join(' · ')}
            </p>
          )}
          {metin.anaMetin && (
            <p className="m-0">
              <b>Ana metin:</b> {metin.anaMetin}
            </p>
          )}
        </div>
      ) : (
        <p className="m-0 text-[13px] text-ink-muted">Henüz metin yok.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {metin?.kaynak === 'ai' && (
          <Dugme ton="koyu" boyut="kucuk" onClick={() => degistir(kullan(metin))}>
            Kullan
          </Dugme>
        )}
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oner()} bekliyor={hal.tur === 'suruyor'} disabled={!kalemKayitli || !kalemId}>
          {metin ? 'Yeniden yaz' : 'Metin öner'}
        </Dugme>
        {metin && (
          <Dugme ton="hayalet" boyut="kucuk" onClick={() => degistir(null)}>
            Metni kaldır
          </Dugme>
        )}
        <span className="text-[11px] text-ink-muted">
          {!kalemKayitli || !kalemId ? 'Metin önerisi için önce kaydet.' : '"Kullan" denmeyen metin AdvCampaign’e öneri olarak gider.'}
        </span>
      </div>
      {hal.tur === 'hata' && (
        <p className="m-0 mt-1.5 text-xs text-brand-strong" role="alert">
          Metin önerilemedi: {hal.mesaj}
        </p>
      )}
    </div>
  );
}

type AramaHali = { tur: 'bos' } | { tur: 'kisa' } | { tur: 'araniyor' } | { tur: 'bitti'; sonuc: GeoLocationOption[] } | { tur: 'hata'; mesaj: string };
const KONUM_TURLERI = new Set(['country', 'region', 'city']);

/**
 * Bölge: rehberin konum aramasının AYNISI (Meta hesabı üzerinden). Dört hâl
 * ayrı yazılı ("aramadım", "arıyorum", "sonuç yok", "çağrı düştü"); hatayı
 * boş listeye çevirmek lokasyon aramasının teşhisini bir kez imkânsız kıldı.
 */
export function KonumSecici({ konumlar, degistir, hesap, acik }: { konumlar: RehberKonumu[]; degistir: (k: RehberKonumu[]) => void; hesap: string | null; acik: boolean }) {
  const [q, setQ] = useState('');
  const [hal, setHal] = useState<AramaHali>({ tur: 'bos' });

  useEffect(() => {
    const t = q.trim();
    if (!acik || !hesap) return;
    if (t.length === 0) return setHal({ tur: 'bos' });
    if (t.length < 2) return setHal({ tur: 'kisa' });
    setHal({ tur: 'araniyor' });
    let iptal = false;
    const z = setTimeout(() => {
      apiFetch<GeoLocationOption[]>(`/connections/targeting/locations?adAccountId=${encodeURIComponent(hesap)}&q=${encodeURIComponent(t)}`).then(
        (r) => !iptal && setHal({ tur: 'bitti', sonuc: r.filter((x) => KONUM_TURLERI.has(x.type)) }),
        (e: unknown) => !iptal && setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Konum araması düştü.' }),
      );
    }, 350);
    return () => {
      iptal = true;
      clearTimeout(z);
    };
  }, [q, acik, hesap]);

  const ekle = (x: GeoLocationOption) => {
    if (konumlar.some((k) => k.key === x.key && k.tur === x.type) || konumlar.length >= KALEM_KONUM_SINIRI) return;
    degistir([...konumlar, { tur: x.type as RehberKonumu['tur'], key: x.key, etiket: x.label, ulkeKodu: x.countryCode }]);
    setQ('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {konumlar.length === 0 && <span className="text-[13px] text-brand-strong">En az bir bölge seçilmeli.</span>}
        {konumlar.map((k) => (
          <span key={`${k.tur}:${k.key}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs">
            {k.etiket}
            <button type="button" aria-label={`${k.etiket} bölgesini çıkar`} className="text-ink-muted hover:text-brand-strong" onClick={() => degistir(konumlar.filter((x) => x !== k))}>
              ✕
            </button>
          </span>
        ))}
      </div>
      {hesap ? (
        <>
          <input className={GIRDI} value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl, ilçe ya da ülke ara" aria-label="Bölge ara" />
          {hal.tur === 'kisa' && <span className="text-[11px] text-ink-muted">En az 2 harf yaz.</span>}
          {hal.tur === 'araniyor' && <span className="text-[11px] text-ink-muted">Aranıyor…</span>}
          {hal.tur === 'hata' && (
            <span className="text-[11px] text-brand-strong" role="alert">
              Bölge araması düştü: {hal.mesaj}
            </span>
          )}
          {hal.tur === 'bitti' && hal.sonuc.length === 0 && <span className="text-[11px] text-ink-muted">"{q.trim()}" için eşleşen yer yok.</span>}
          {hal.tur === 'bitti' && hal.sonuc.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hal.sonuc.map((x) => (
                <button key={`${x.type}:${x.key}`} type="button" className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-brand" onClick={() => ekle(x)}>
                  + {x.label}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <span className="text-[11px] text-ink-muted">Bölge araması Meta reklam hesabı üzerinden yapılıyor ve bu workspace'e Meta hesabı atanmamış.</span>
      )}
    </div>
  );
}
