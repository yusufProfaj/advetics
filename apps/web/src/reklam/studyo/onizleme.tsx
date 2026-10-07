'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  NIYET_KATALOGU,
  OZEL_KATEGORI_ETIKETLERI,
  sonucEtiketi,
  tutarAyristir,
  tutarGoster,
  type AtifDurumu,
  type OzelKategori,
  type ReklamHazirligi,
  type ReklamTaslakKaydi,
  type TaslakAlanlari,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { Dugme, Kutu, dugmeSinifi } from '../ui';
import { BUTUN_TURKIYE, bugun, ekranDegerleri, gunEkle, kavramlarKur, tarihGoster } from '../akis/akis';
import { ProvaBlogu } from '../akis/prova-blogu';
import { YayinPaneli } from '../akis/yayin-paneli';

type Degisiklik = Partial<Record<keyof TaslakAlanlari, { deger: unknown; kaynak: 'kullanici' | 'marka_merkezi' } | null>>;

/** Düğme metni niyetten: Meta'daki CTA'nın Türkçe karşılığı. */
const CTA: Record<string, string> = {
  FORM: 'Kaydol',
  WHATSAPP: 'WhatsApp’tan yaz',
  SITE: 'Daha fazla bilgi',
  SATIS: 'Alışveriş yap',
};
const BICIMLER = [
  { ad: 'Akış', oran: 'aspect-[4/5]' },
  { ad: 'Hikâye', oran: 'aspect-[9/16]' },
  { ad: 'Reels', oran: 'aspect-[9/16]' },
] as const;
const KATEGORILER: OzelKategori[] = ['HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES', 'ISSUES_ELECTIONS_POLITICS'];

/**
 * ÖNİZLEME VE ONAY — asistanın taslağı burada görünür. "Onayla" önerileri
 * kullanıcının kararı yapar (sunucuda `ai_onerisi` → `kullanici`, gördüğün
 * sürümün özetiyle); ardından Meta'nın ön kontrolü kendiliğinden başlar.
 *
 * Asistanın dolduramadığı her şey (bütçe, kategori sorusu, hesap) eksik
 * listesinden TÜRETİLEN satır içi sorularla soruluyor; ayrı bir soru listesi
 * yazılmıyor — yazılsaydı panel ile yayın kapısı ayrışırdı.
 */
export function Onizleme({
  ilkTaslak,
  hazirlik,
  ilkAtif,
  yonetici,
  workspaceAdi,
}: {
  ilkTaslak: ReklamTaslakKaydi;
  hazirlik: ReklamHazirligi;
  ilkAtif: AtifDurumu | null;
  yonetici: boolean;
  workspaceAdi: string;
}) {
  const [taslak, setTaslak] = useState(ilkTaslak);
  const [hata, setHata] = useState<string | null>(null);
  const [notlar, setNotlar] = useState<string[]>([]);
  const [bekliyor, setBekliyor] = useState(false);
  const d = ekranDegerleri(taslak.alanlar);
  const hesap = hazirlik.hesaplar.find((h) => h.id === d.hesap) ?? null;
  const sayfa = hazirlik.sayfalar.find((s) => s.id === d.sayfa) ?? null;
  const paraBirimi = hesap?.paraBirimi ?? 'TRY';
  const niyet = d.niyet ? NIYET_KATALOGU[d.niyet] : null;
  const oneriVar = Object.values(taslak.alanlar).some((v) => v?.kaynak === 'ai_onerisi');
  const kullaniciEksigi = taslak.eksikler.filter((e) => e.kod !== 'OK-17' && e.kod !== 'KAYNAK');
  const kodVar = (k: string) => taslak.eksikler.some((e) => e.kod === k);

  useEffect(() => {
    try {
      const n = sessionStorage.getItem(`reklam-notlar:${ilkTaslak.id}`);
      if (n) setNotlar(JSON.parse(n) as string[]);
    } catch {
      // Notlar yalnız kolaylık; eksik listesi aynı bilgiyi taşıyor.
    }
  }, [ilkTaslak.id]);

  const sira = useRef(0);
  async function kaydet(degisiklikler: Degisiklik) {
    const benim = ++sira.current;
    setHata(null);
    try {
      const yeni = await apiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${taslak.id}/surum`, {
        method: 'PUT',
        body: JSON.stringify({ degisiklikler }),
      });
      if (benim === sira.current) setTaslak(yeni);
    } catch (e) {
      if (benim === sira.current) setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    }
  }

  async function onayla() {
    setBekliyor(true);
    setHata(null);
    try {
      setTaslak(
        await apiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${taslak.id}/oneriyi-onayla`, {
          method: 'POST',
          body: JSON.stringify({ icerikOzeti: taslak.icerikOzeti }),
        }),
      );
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
    } finally {
      setBekliyor(false);
    }
  }

  const kavramlar = taslak.alanlar.kavramlar?.deger ?? [];
  const metinKaydet = (i: number, alan: 'baslik' | 'metin', deger: string) => {
    const yeni = kavramlar.map((k, j) => (j === i ? { ...k, [alan]: deger } : k));
    if (JSON.stringify(yeni) !== JSON.stringify(kavramlar)) void kaydet({ kavramlar: { deger: yeni, kaynak: 'kullanici' } });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
              {niyet?.ekranAdi ?? 'Amaç seçilmedi'}
            </span>
            {niyet?.meta && (
              <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted">
                Sonuç: {sonucEtiketi(niyet.meta.optimizationGoal)}
              </span>
            )}
            {oneriVar && <span className="rounded-full border border-warn/40 px-3 py-1 text-xs text-warn-strong">Asistan önerisi, onayını bekliyor</span>}
            <Link href={`/reklam/yeni?musteri=${taslak.clientId}&taslak=${taslak.id}`} className={`ml-auto ${dugmeSinifi('sade', true)}`}>
              Ayrıntılı düzenle
            </Link>
          </div>
          {taslak.alanlar.niyet && (
            <div className="relative mt-3 flex flex-wrap gap-1.5">
              {(['FORM', 'WHATSAPP', 'SITE', 'SATIS'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => kaydet({ niyet: { deger: k, kaynak: 'kullanici' } })}
                  aria-pressed={d.niyet === k}
                  className={`rounded-full border px-3 py-1 text-xs ${d.niyet === k ? 'border-brand text-brand-strong' : 'border-line text-ink-muted hover:text-ink'}`}
                >
                  {NIYET_KATALOGU[k].ekranAdi}
                </button>
              ))}
            </div>
          )}
        </section>

        {kavramlar.map((k, i) => {
          // Video fikrinde KAPAK gösterilir (videonun kendisi tarayıcıda oynatılmıyor).
          const gorselId = k.kapakVarlikId ?? k.varlikId;
          const g = hazirlik.gorseller.satirlar.find((x) => x.id === gorselId);
          const src = g ? onizlemeAdresi(g.onizlemeAdresi) : onizlemeAdresi(`/assets/${gorselId}/preview`);
          return (
            <section key={`${k.varlikId}-${i}`} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="mb-3 text-sm font-semibold">Fikir {i + 1}{k.kapakVarlikId ? ' · video' : ''}</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {BICIMLER.map((b) => (
                  <figure key={b.ad} className="w-44 shrink-0 rounded-[1.4rem] border border-line bg-surface-muted p-2 text-[11px] shadow-[var(--shadow-xs)]">
                    <figcaption className="mb-1 flex justify-between px-1 text-ink-muted">
                      <span className="truncate font-semibold text-ink">{sayfa?.ad ?? workspaceAdi}</span>
                      <span>{b.ad}</span>
                    </figcaption>
                    {b.ad === 'Akış' && <p className="mb-1 line-clamp-2 px-1">{k.metin}</p>}
                    <div className={`relative ${b.oran} w-full overflow-hidden rounded-xl bg-surface-sunken`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      {k.kapakVarlikId && (
                        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">▶ Video</span>
                      )}
                      {b.ad !== 'Akış' && (
                        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-white/90 py-1 text-center font-semibold text-black">
                          {CTA[d.niyet ?? ''] ?? 'Daha fazla bilgi'}
                        </span>
                      )}
                    </div>
                    {b.ad === 'Akış' && (
                      <div className="mt-1 flex items-center justify-between gap-1 px-1">
                        <span className="truncate font-semibold">{k.baslik}</span>
                        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5">{CTA[d.niyet ?? ''] ?? '…'}</span>
                      </div>
                    )}
                  </figure>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <input
                  aria-label={`Fikir ${i + 1} başlık`}
                  defaultValue={k.baslik}
                  maxLength={40}
                  onBlur={(e) => metinKaydet(i, 'baslik', e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
                <textarea
                  aria-label={`Fikir ${i + 1} ana metin`}
                  defaultValue={k.metin}
                  rows={3}
                  onBlur={(e) => metinKaydet(i, 'metin', e.target.value)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                />
              </div>
            </section>
          );
        })}
        {kavramlar.length === 0 && <Kutu ton="uyari" baslik="Fikir yok">Görsel ekleyip yeniden dene.</Kutu>}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm">
          <h3 className="font-semibold">Plan</h3>
          <dl className="space-y-1.5 text-xs">
            <Satir ad="Hesap" deger={hesap ? `${hesap.ad} · ${hesap.paraBirimi}` : null} />
            <Satir ad="Sayfa" deger={sayfa?.ad ?? null} />
            <Satir ad="Kime" deger={d.konumlar.length ? `${d.konumlar.map((x) => x.etiket).join(', ')} · 18+` : null} />
            <Satir
              ad="Bütçe"
              deger={d.butce ? `${tutarGoster(BigInt(d.butce.micros), paraBirimi)} ${d.butce.tip === 'gunluk' ? '/ gün' : 'toplam'}` : null}
            />
            <Satir ad="Süre" deger={d.takvim ? (d.takvim.bitis ? `${tarihGoster(d.takvim.baslangic)} – ${tarihGoster(d.takvim.bitis)}` : 'Durdurana kadar') : null} />
            <Satir ad="Nerede" deger="Otomatik yerleşim" />
          </dl>

          {kullaniciEksigi.length > 0 && (
            <div className="space-y-3 border-t border-line pt-3">
              <p className="text-xs font-semibold text-warn-strong">Tamamlanması gerekenler</p>
              {kodVar('OK-01') && (
                <Secim etiket="Reklam hesabı" deger={d.hesap} secenekler={hazirlik.hesaplar.map((h) => [h.id, `${h.ad} · ${h.paraBirimi}`])}
                  degisti={(v) => kaydet({ reklamHesabiId: v ? { deger: v, kaynak: 'kullanici' } : null })} />
              )}
              {kodVar('SAYFA') && (
                <Secim etiket="Facebook sayfası" deger={d.sayfa} secenekler={hazirlik.sayfalar.map((s) => [s.id, s.ad])}
                  degisti={(v) => kaydet({ sayfaId: v ? { deger: v, kaynak: 'kullanici' } : null })} />
              )}
              {kodVar('KNM-01') && (
                <div className="flex flex-wrap gap-1.5">
                  {hazirlik.varsayilanKitle && (
                    <Dugme ton="ikincil" kucuk onClick={() => kaydet({ konumlar: { deger: hazirlik.varsayilanKitle!.konumlar, kaynak: 'marka_merkezi' } })}>
                      {hazirlik.varsayilanKitle.ad}
                    </Dugme>
                  )}
                  <Dugme ton="ikincil" kucuk onClick={() => kaydet({ konumlar: { deger: [BUTUN_TURKIYE], kaynak: 'kullanici' } })}>
                    Bütün Türkiye
                  </Dugme>
                </div>
              )}
              {kodVar('BTC-01') && <ButceSorusu paraBirimi={paraBirimi} kaydet={(micros, tip) => kaydet({ butce: { deger: { tip, micros }, kaynak: 'kullanici' } })} />}
              {(kodVar('TKV') || kodVar('BTC-02')) && (
                <div className="space-y-1">
                  <p className="text-xs">Ne kadar sürsün? (bugünden başlar)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[7, 14, 30].map((g) => {
                      const bas = bugun(hesap?.saatDilimi ?? 'Europe/Istanbul');
                      return (
                        <Dugme key={g} ton="ikincil" kucuk onClick={() => kaydet({ takvim: { deger: { baslangic: bas, bitis: gunEkle(bas, g - 1) }, kaynak: 'kullanici' } })}>
                          {g} gün
                        </Dugme>
                      );
                    })}
                    {d.butce?.tip !== 'toplam' && (
                      <Dugme ton="ikincil" kucuk onClick={() => kaydet({ takvim: { deger: { baslangic: bugun(hesap?.saatDilimi ?? 'Europe/Istanbul'), bitis: null }, kaynak: 'kullanici' } })}>
                        Durdurana kadar
                      </Dugme>
                    )}
                  </div>
                </div>
              )}
              {kodVar('OZK-SORU') && (
                <div className="space-y-1">
                  <p className="text-xs">Bu reklam konut, iş ilanı, kredi ya da finans, siyasi ya da toplumsal bir konu içeriyor mu?</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Dugme ton="ikincil" kucuk onClick={() => kaydet({ ekKategoriler: { deger: [], kaynak: 'kullanici' } })}>Hayır</Dugme>
                    {KATEGORILER.filter((k) => !hazirlik.ozelKategoriTabani.includes(k)).map((k) => (
                      <Dugme key={k} ton="ikincil" kucuk onClick={() => kaydet({ ekKategoriler: { deger: [k], kaynak: 'kullanici' } })}>
                        {OZEL_KATEGORI_ETIKETLERI[k]}
                      </Dugme>
                    ))}
                  </div>
                </div>
              )}
              {kodVar('SITE-ADRES') && <AdresSorusu kaydet={(a) => kaydet({ hedefAdres: { deger: a, kaynak: 'kullanici' } })} />}
              {kodVar('FORM-YOK') && <p className="text-xs text-ink-muted">Form şablonu henüz yok; form amacı şimdilik test edilemez.</p>}
              <ul className="space-y-0.5 text-xs text-warn-strong">
                {kullaniciEksigi.map((e, i) => (
                  <li key={i}>{e.metin}</li>
                ))}
              </ul>
            </div>
          )}

          {notlar.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-1 text-xs font-semibold">Asistanın notları</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
                {notlar.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          {hata && <Kutu ton="tehlike" baslik="Kaydedilemedi">{hata}</Kutu>}

          {oneriVar && (
            <Dugme className="h-11 w-full text-base" disabled={bekliyor || kullaniciEksigi.length > 0} onClick={onayla}
              title={kullaniciEksigi.length > 0 ? 'Önce eksikleri tamamla' : undefined}>
              Onayla
            </Dugme>
          )}
        </section>

        {!oneriVar && (
          <section className="space-y-3">
            <ProvaBlogu taslakId={taslak.id} ozet={taslak.icerikOzeti} kullaniciEksigi={kullaniciEksigi.length} />
            {ilkAtif && !ilkAtif.standart && (
              <Kutu ton="uyari" baslik="Atıf standardı seçilmedi">
                Ajans yöneticisi seçene kadar yayın yok.{' '}
                <Link className="underline" href={`/reklam/yeni?musteri=${taslak.clientId}&taslak=${taslak.id}`}>
                  Ayrıntılı ekranda seç
                </Link>
              </Kutu>
            )}
            <div className="rounded-2xl border border-line bg-surface p-4">
              <YayinPaneli taslak={taslak} yonetici={yonetici} kullaniciEksigi={kullaniciEksigi.length} onDegisti={() => undefined} />
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function Satir({ ad, deger }: { ad: string; deger: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{ad}</dt>
      <dd className={`text-right font-semibold ${deger ? '' : 'text-warn-strong'}`}>{deger ?? 'Seçilmedi'}</dd>
    </div>
  );
}

function Secim({ etiket, deger, secenekler, degisti }: { etiket: string; deger: string | null; secenekler: Array<[string, string]>; degisti: (v: string | null) => void }) {
  return (
    <label className="block space-y-1 text-xs">
      <span>{etiket}</span>
      <select value={deger ?? ''} onChange={(e) => degisti(e.target.value || null)} className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
        <option value="">Seç ({secenekler.length})</option>
        {secenekler.map(([v, a]) => (
          <option key={v} value={v}>
            {a}
          </option>
        ))}
      </select>
    </label>
  );
}

function ButceSorusu({ paraBirimi, kaydet }: { paraBirimi: string; kaydet: (micros: string, tip: 'gunluk' | 'toplam') => void }) {
  const [tip, setTip] = useState<'gunluk' | 'toplam'>('gunluk');
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex gap-1.5">
        {(['gunluk', 'toplam'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tip === t} onClick={() => setTip(t)}
            className={`rounded-full border px-2.5 py-0.5 ${tip === t ? 'border-brand text-brand-strong' : 'border-line text-ink-muted'}`}>
            {t === 'gunluk' ? 'Günlük' : 'Toplam'}
          </button>
        ))}
      </div>
      <input
        inputMode="decimal"
        placeholder={`Tutar (${paraBirimi === 'TRY' ? 'TL' : paraBirimi})`}
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        onBlur={() => {
          if (!metin.trim()) return;
          const r = tutarAyristir(metin, paraBirimi);
          if (r.tur === 'hata') return setHata(r.mesaj);
          setHata(null);
          kaydet(r.micros.toString(), tip);
        }}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm tabular-nums"
      />
      {hata && <p className="text-danger-strong">{hata}</p>}
    </div>
  );
}

function AdresSorusu({ kaydet }: { kaydet: (a: string) => void }) {
  const [a, setA] = useState('');
  return (
    <label className="block space-y-1 text-xs">
      <span>Site adresi</span>
      <input type="url" placeholder="https://" value={a} onChange={(e) => setA(e.target.value)} onBlur={() => a.trim() && kaydet(a.trim())}
        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
    </label>
  );
}
