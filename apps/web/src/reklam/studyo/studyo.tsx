'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { HazirlikGorseli, ReklamHazirligi, ReklamTaslakKaydi } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { Dugme, Kutu } from '../ui';

type Gorsel = Pick<HazirlikGorseli, 'id' | 'ad' | 'onizlemeAdresi'>;
type YuklemeHali = { ad: string; tur: 'yukleniyor' } | { ad: string; tur: 'hata'; mesaj: string };

const ORNEKLER = [
  'Bu görsellerle form kampanyası oluştur',
  'WhatsApp’tan yazsınlar, günlük 300 TL, 14 gün',
  'Siteme trafik getir, toplam 5.000 TL, 10 gün',
];

/**
 * REKLAM STÜDYOSU — görselleri bırak, ne istediğini yaz; asistan taslağı
 * kurar, önizlemeyi gösterir, sen onaylarsın (kullanıcı kararı 2026-10-07).
 *
 * Görsel GİRİŞ ANINDA doğrulanıyor: biçim ya da boyut uygun değilse dosya
 * bırakıldığı an söyleniyor, taslak kurulurken değil. Yükleme ve asistan
 * hataları ayrı ayrı ve sunucunun cümlesiyle görünüyor.
 */
export function ReklamStudyosu({ clientId, hazirlik }: { clientId: string; hazirlik: ReklamHazirligi }) {
  const router = useRouter();
  const [secili, setSecili] = useState<Gorsel[]>([]);
  const [yuklemeler, setYuklemeler] = useState<YuklemeHali[]>([]);
  const [cumle, setCumle] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const dosyaGirdisi = useRef<HTMLInputElement>(null);

  const ekle = (g: Gorsel) => setSecili((s) => (s.some((x) => x.id === g.id) || s.length >= 10 ? s : [...s, g]));

  async function yukle(dosyalar: FileList | File[]) {
    for (const d of Array.from(dosyalar).slice(0, 10)) {
      setYuklemeler((y) => [...y.filter((x) => x.ad !== d.name), { ad: d.name, tur: 'yukleniyor' }]);
      const form = new FormData();
      form.append('dosya', d);
      try {
        const res = await fetch(`${API_URL}/reklam/gorseller?clientId=${clientId}`, { method: 'POST', body: form, credentials: 'include' });
        const govde = (await res.json().catch(() => null)) as { message?: string } & Gorsel | null;
        if (!res.ok || !govde) throw new Error(govde?.message ?? `Yükleme düştü (HTTP ${res.status})`);
        ekle(govde);
        setYuklemeler((y) => y.filter((x) => x.ad !== d.name));
      } catch (e) {
        setYuklemeler((y) => y.map((x) => (x.ad === d.name ? { ad: d.name, tur: 'hata', mesaj: (e as Error).message } : x)));
      }
    }
  }

  async function olustur() {
    setCalisiyor(true);
    setHata(null);
    try {
      const r = await apiFetch<{ taslak: ReklamTaslakKaydi; notlar: string[] }>('/reklam/ai-taslak', {
        method: 'POST',
        body: JSON.stringify({ clientId, cumle, varliklar: secili.map((g) => g.id) }),
      });
      // Notlar yalnız bu oturumda: sayfa yenilenince eksik listesi zaten aynı şeyi söylüyor.
      try {
        sessionStorage.setItem(`reklam-notlar:${r.taslak.id}`, JSON.stringify(r.notlar));
      } catch {
        // Depolama kapalıysa notlar gösterilmez; eksik listesi yine görünür.
      }
      router.push(`/reklam/onizleme?musteri=${clientId}&taslak=${r.taslak.id}`);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
      setCalisiyor(false);
    }
  }

  const hazir = secili.length > 0 && cumle.trim().length >= 3 && !calisiyor;

  return (
    <div className="space-y-5">
      <section
        className={`relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-7 ${
          calisiyor ? 'motion-safe:animate-pulse' : ''
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl"
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-info/10 blur-3xl" />

        <div className="relative space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-strong">Reklam Stüdyosu</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Görselleri bırak, ne istediğini yaz.</h2>
            <p className="mt-1 text-sm text-ink-muted">Taslağı biz kuruyoruz; sen yalnızca önizlemeye bakıp onaylıyorsun.</p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => dosyaGirdisi.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && dosyaGirdisi.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurukleniyor(true);
            }}
            onDragLeave={() => setSurukleniyor(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurukleniyor(false);
              void yukle(e.dataTransfer.files);
            }}
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
              surukleniyor ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/60'
            }`}
          >
            <span className="text-sm font-semibold">Görselleri buraya bırak ya da tıkla</span>
            <span className="text-xs text-ink-muted">JPEG ya da PNG, kısa kenar en az 600 piksel, en çok 10 görsel</span>
            <input
              ref={dosyaGirdisi}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              hidden
              onChange={(e) => e.target.files && void yukle(e.target.files)}
            />
          </div>

          {yuklemeler.length > 0 && (
            <ul className="space-y-1 text-xs">
              {yuklemeler.map((y) => (
                <li key={y.ad} className={y.tur === 'hata' ? 'text-danger-strong' : 'text-ink-muted'}>
                  {y.ad}: {y.tur === 'hata' ? y.mesaj : 'yükleniyor…'}
                </li>
              ))}
            </ul>
          )}

          {secili.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {secili.map((g, i) => (
                <figure key={g.id} className="relative w-24 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={onizlemeAdresi(g.onizlemeAdresi)} alt={g.ad} className="aspect-square w-24 rounded-lg object-cover" />
                  <span className="absolute left-1 top-1 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                  <button
                    type="button"
                    aria-label={`${g.ad} çıkar`}
                    onClick={() => setSecili((s) => s.filter((x) => x.id !== g.id))}
                    className="absolute right-1 top-1 rounded-full bg-surface/90 px-1.5 text-xs"
                  >
                    ×
                  </button>
                </figure>
              ))}
            </div>
          )}

          {hazirlik.gorseller.satirlar.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted">
                Arşivden seç ({hazirlik.gorseller.satirlar.length} / {hazirlik.gorseller.toplam})
              </summary>
              <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
                {hazirlik.gorseller.satirlar.map((g) => (
                  <button key={g.id} type="button" onClick={() => ekle(g)} className="overflow-hidden rounded-md border border-line hover:border-brand">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={onizlemeAdresi(g.onizlemeAdresi)} alt={g.ad} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </details>
          )}

          <div className="space-y-2">
            <label htmlFor="studyo-cumle" className="sr-only">
              Ne istiyorsun?
            </label>
            <textarea
              id="studyo-cumle"
              rows={3}
              value={cumle}
              onChange={(e) => setCumle(e.target.value)}
              placeholder="Örnek: Bu görsellerle form kampanyası oluştur, günlük 500 TL, 14 gün"
              className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base focus:border-brand focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {ORNEKLER.map((o) => (
                <button key={o} type="button" onClick={() => setCumle(o)} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-muted">
                  {o}
                </button>
              ))}
            </div>
          </div>

          {hata && <Kutu ton="tehlike" baslik="Taslak kurulamadı">{hata}</Kutu>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              Bütçe ve süreyi cümlede yazmazsan önizlemede sorarız; biz tahmin etmeyiz.
            </p>
            <Dugme disabled={!hazir} onClick={olustur} className="h-11 px-6 text-base">
              {calisiyor ? 'Taslak hazırlanıyor…' : 'Taslağı oluştur'}
            </Dugme>
          </div>
        </div>
      </section>
    </div>
  );
}
