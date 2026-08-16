'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CREATIVE_TEXT_CAPS,
  FORMAT_TEXT_SPEC,
  emptyCreativeTexts,
  matchRatio,
  packTextsFor,
  type AssetRecord,
  type CreativeFormat,
  type CreativeRecord,
  type CreativeTexts,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';

/**
 * Kreatif düzenleyici — metin havuzu + görsel havuzu.
 *
 * EKRANIN ASIL DEĞERİ SAĞ SÜTUN: aynı havuzun Meta ve Google paketleri yan
 * yana duruyor. §9.5'in söylediği asimetri ancak burada GÖRÜNÜR oluyor —
 * Meta bir başlık alıyor, Google en az üç istiyor ve 30 karakterle
 * sınırlıyor. Kullanıcı bunu yayın anında bir hata mesajından değil, yazarken
 * öğreniyor.
 *
 * Bu ekran olmadan Google'a çıkmak pratikte imkânsızdı: basit yüzeyden
 * oluşturulan kreatifler tek başlık ve tek açıklamayla geliyor ve Google RSA
 * en az 3 + 2 istiyor.
 */
export function CreativeEditor({
  clientId,
  creative,
  libraryAssets,
  onDone,
  onCancel,
}: {
  clientId: string;
  /** Boşsa yeni kreatif. */
  creative: CreativeRecord | null;
  libraryAssets: AssetRecord[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();

  const [name, setName] = useState(creative?.name ?? '');
  const [texts, setTexts] = useState<CreativeTexts>(creative?.texts ?? emptyCreativeTexts());
  const [assetIds, setAssetIds] = useState<string[]>(
    creative?.assets.map((a) => a.assetId) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paketler = useMemo(
    () =>
      (['meta_single_image', 'google_rsa'] as CreativeFormat[]).map((f) => ({
        format: f,
        packed: packTextsFor(f, texts),
      })),
    [texts],
  );

  async function kaydet(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({ clientId, name: name.trim(), texts, assetIds });
      if (creative) {
        await apiFetch(`/creatives/${creative.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/creatives', { method: 'POST', body });
      }
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kreatif kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand/40 bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          {creative ? 'Kreatifi düzenle' : 'Yeni kreatif'}
        </h2>
        <span className="text-[11px] text-ink-muted">
          Metinler bir HAVUZ — her platform kendi paketini buradan kuruyor.
        </span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Kreatif adı
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yaz indirimi — genel"
              className={input}
            />
          </label>

          {/* ANA METİN TEK, diğerleri LİSTE. Meta'nın birincil metni tek bir
              alan; Google'da karşılığı yok ve paketleme bunu söylüyor. */}
          <label className="block">
            <span className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Ana metin
              </span>
              <span className="text-[11px] text-ink-muted">
                {(texts.primaryText ?? '').length}/{CREATIVE_TEXT_CAPS.primaryText}
              </span>
            </span>
            <textarea
              value={texts.primaryText ?? ''}
              onChange={(e) => setTexts({ ...texts, primaryText: e.target.value })}
              rows={3}
              className={input}
            />
            <span className="mt-0.5 block text-[11px] text-ink-muted">
              Yalnızca Meta kullanıyor. Google arama reklamında karşılığı yok.
            </span>
          </label>

          <MetinListesi
            baslik="Başlıklar"
            ipucu="Meta ilkini kullanıyor; Google en az 3 istiyor ve 30 karakterle sınırlıyor."
            items={texts.headlines}
            max={CREATIVE_TEXT_CAPS.maxHeadlines}
            maxLength={CREATIVE_TEXT_CAPS.headline}
            uyariUzunlugu={FORMAT_TEXT_SPEC.google_rsa.headlines.maxLength}
            onChange={(headlines) => setTexts({ ...texts, headlines })}
          />

          <MetinListesi
            baslik="Açıklamalar"
            ipucu="Meta ilkini kullanıyor; Google en az 2 istiyor ve 90 karakterle sınırlıyor."
            items={texts.descriptions}
            max={CREATIVE_TEXT_CAPS.maxDescriptions}
            maxLength={CREATIVE_TEXT_CAPS.description}
            uyariUzunlugu={FORMAT_TEXT_SPEC.google_rsa.descriptions.maxLength}
            onChange={(descriptions) => setTexts({ ...texts, descriptions })}
          />

          {/* Görseller */}
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Görseller
              <span className="ml-1.5 font-normal normal-case tracking-normal">
                {assetIds.length} seçili
              </span>
            </p>
            {libraryAssets.length === 0 ? (
              <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                Arşivde görsel yok. Google arama kampanyası görsel kullanmıyor; Meta için
                gerekiyor.
              </p>
            ) : (
              <ul className="grid grid-cols-6 gap-2">
                {libraryAssets.map((a) => {
                  const oran = matchRatio(a.width, a.height);
                  const sira = assetIds.indexOf(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        disabled={oran === null}
                        onClick={() =>
                          setAssetIds((prev) =>
                            prev.includes(a.id)
                              ? prev.filter((x) => x !== a.id)
                              : [...prev, a.id],
                          )
                        }
                        title={`${a.name} · ${a.width}×${a.height}`}
                        className={`block w-full overflow-hidden rounded-lg border-2 bg-surface-sunken transition ${
                          sira >= 0
                            ? 'border-brand'
                            : oran
                              ? 'border-transparent hover:border-line'
                              : 'cursor-not-allowed border-transparent opacity-35'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${API_URL}${a.previewUrl}`}
                          alt={a.name}
                          className="aspect-square w-full object-contain"
                          loading="lazy"
                        />
                        <span className="block truncate px-1 pb-0.5 text-[10px] text-ink-muted">
                          {sira >= 0 ? `✓ ${sira + 1}.` : oran ? a.name : 'oran uymuyor'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* PLATFORM PAKETLERİ — ekranın asıl değeri */}
        <div className="space-y-3">
          {paketler.map(({ format, packed }) => (
            <section
              key={format}
              className={`rounded-lg border p-3 ${
                packed.blockers.length > 0 ? 'border-rose-200 bg-rose-50/40' : 'border-line'
              }`}
            >
              <h3 className="text-xs font-semibold text-ink">{FORMAT_TEXT_SPEC[format].label}</h3>

              <dl className="mt-2 space-y-1 text-[11px]">
                {FORMAT_TEXT_SPEC[format].usesPrimaryText && (
                  <Satir etiket="Ana metin" deger={packed.primaryText ? '✓' : '—'} />
                )}
                <Satir
                  etiket="Başlık"
                  deger={`${packed.headlines.length} / en az ${FORMAT_TEXT_SPEC[format].headlines.min}`}
                />
                <Satir
                  etiket="Açıklama"
                  deger={`${packed.descriptions.length} / en az ${FORMAT_TEXT_SPEC[format].descriptions.min}`}
                />
              </dl>

              {/* ENGELLER VE UYARILAR AYRI — yayın kontrolüyle aynı sözleşme. */}
              {packed.blockers.map((b) => (
                <p key={b} className="mt-1.5 text-[11px] text-rose-700">
                  · {b}
                </p>
              ))}
              {packed.warnings.map((w) => (
                <p key={w} className="mt-1.5 text-[11px] text-amber-700">
                  · {w}
                </p>
              ))}
              {packed.blockers.length === 0 && packed.warnings.length === 0 && (
                <p className="mt-1.5 text-[11px] text-emerald-700">Bu platform için hazır.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={kaydet}
          disabled={busy || !name.trim()}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Kaydediliyor…' : creative ? 'Değişiklikleri kaydet' : 'Kreatifi oluştur'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          Vazgeç
        </button>
      </div>

      {/* HİÇBİR PLATFORMA HAZIR DEĞİLSE KAYIT YİNE MÜMKÜN.
          Kullanıcı metni parça parça yazabilmeli; eksik bir kreatifi
          kaydedememek, `ad_drafts`'ta yaşanan "3. adım hiç çalışmıyor"
          hatasının aynısı olurdu. Eksikler yayın kontrolünde de duruyor. */}
      <p className="mt-2 text-[11px] text-ink-muted">
        Eksik bir kreatifi kaydedebilirsin — yayın kontrolü hangi platformda neyin eksik
        olduğunu tekrar söyleyecek.
      </p>
    </div>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-muted">{etiket}</dt>
      <dd className="font-medium text-ink">{deger}</dd>
    </div>
  );
}

/**
 * Metin listesi — ekle, sil, sırala.
 *
 * SIRA ANLAMLI ve bu yüzden taşınabiliyor: Meta İLK başlığı kullanıyor, yani
 * listenin başındaki metin ana başlık oluyor. Sıra rastgele olsaydı,
 * kullanıcının Google için yazdığı beşinci alternatif Meta reklamının ana
 * başlığı olurdu.
 */
function MetinListesi({
  baslik,
  ipucu,
  items,
  max,
  maxLength,
  uyariUzunlugu,
  onChange,
}: {
  baslik: string;
  ipucu: string;
  items: string[];
  max: number;
  maxLength: number;
  /** Bu uzunluğu aşan metin Google paketine giremiyor. */
  uyariUzunlugu: number;
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {baslik}
        </span>
        <span className="text-[11px] text-ink-muted">
          {items.length}/{max}
        </span>
      </p>

      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-2 w-4 shrink-0 text-[11px] text-ink-muted">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <input
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value.slice(0, maxLength);
                  onChange(next);
                }}
                className={input}
              />
              {/* GOOGLE SINIRI AŞILDIYSA SÖYLENİYOR — metin silinmiyor.
                  Meta'da sorunsuz çalışan bir başlık, Google'a girmiyor diye
                  kesilmemeli; kullanıcı hangi platformu kaybettiğini bilerek
                  karar versin. */}
              {item.length > uyariUzunlugu && (
                <span className="mt-0.5 block text-[11px] text-amber-700">
                  {item.length} karakter — Google paketine giremiyor (sınır {uyariUzunlugu}).
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="mt-1.5 shrink-0 text-[11px] text-rose-700 hover:underline"
            >
              sil
            </button>
            {i > 0 && (
              <button
                type="button"
                onClick={() => {
                  const next = [...items];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  onChange(next);
                }}
                title="Yukarı taşı — Meta ilk sıradakini kullanıyor"
                className="mt-1.5 shrink-0 text-[11px] text-ink-muted hover:underline"
              >
                ↑
              </button>
            )}
          </li>
        ))}
      </ul>

      {items.length < max && (
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="mt-1.5 text-[11px] text-brand underline"
        >
          + {baslik.toLowerCase()} ekle
        </button>
      )}
      <p className="mt-1 text-[11px] text-ink-muted">{ipucu}</p>
    </div>
  );
}

const input =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand';
