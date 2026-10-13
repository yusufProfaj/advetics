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
import { YanPanel } from '@/components/ui/pencere';
import { Dugme } from '@/components/ui/dugme';
import { Alan, Girdi, MetinAlani } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';

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
 *
 * YAN PANELDE (2026-10-14, BILESENLER § 3.4): düzenleme sayfadan çıkmadan,
 * sağdan. Eskiden düzenleyici listenin YERİNE açılıyordu ve kullanıcı
 * hangi kreatifi düzenlediğini listeye bakarak doğrulayamıyordu. Kaydet sağ
 * altta, kapat sağ üstte; Esc ve perde Vazgeç'le aynı.
 */
export function CreativeEditor({
  acik,
  clientId,
  creative,
  libraryAssets,
  onDone,
  onCancel,
}: {
  acik: boolean;
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
    <YanPanel
      acik={acik}
      onKapat={onCancel}
      genislik={720}
      baslik={creative ? 'Kreatifi düzenle' : 'Yeni kreatif'}
      altEylemler={
        <>
          <Dugme ton="ikincil" onClick={onCancel}>
            Vazgeç
          </Dugme>
          <Dugme onClick={kaydet} bekliyor={busy} disabled={!name.trim()}>
            {creative ? 'Değişiklikleri kaydet' : 'Kreatifi oluştur'}
          </Dugme>
        </>
      }
    >
      <p className="m-0 text-13 text-ink-muted">Metinler bir havuz: her platform kendi paketini buradan kuruyor.</p>

      <div className="grid gap-5">
        <div className="grid gap-4">
          <Alan etiket="Kreatif adı">
            {(id) => (
              <Girdi id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Yaz indirimi, genel" />
            )}
          </Alan>

          {/* ANA METİN TEK, diğerleri LİSTE. Meta'nın birincil metni tek bir
              alan; Google'da karşılığı yok ve paketleme bunu söylüyor. */}
          <Alan
            etiket={`Ana metin (${(texts.primaryText ?? '').length}/${CREATIVE_TEXT_CAPS.primaryText})`}
            ipucu="Yalnızca Meta kullanıyor. Google arama reklamında karşılığı yok."
          >
            {(id, aciklamaId) => (
              <MetinAlani
                id={id}
                aria-describedby={aciklamaId}
                value={texts.primaryText ?? ''}
                onChange={(e) => setTexts({ ...texts, primaryText: e.target.value })}
                rows={3}
              />
            )}
          </Alan>

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
            <p className="m-0 mb-1.5 text-13 font-semibold text-ink">
              Görseller
              <span className="ml-1.5 text-12 font-normal text-ink-muted">{assetIds.length} seçili</span>
            </p>
            {libraryAssets.length === 0 ? (
              <p className="m-0 rounded-alan bg-surface-sunken px-3 py-2 text-12 text-ink-muted">
                Arşivde görsel yok. Google arama kampanyası görsel kullanmıyor; Meta için gerekiyor.
              </p>
            ) : (
              <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0 sm:grid-cols-6">
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
                        aria-pressed={sira >= 0}
                        className={`block w-full overflow-hidden rounded-alan border-2 bg-surface-sunken transition-colors motion-reduce:transition-none ${
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
                        <span className="block truncate px-1 pb-0.5 text-11 text-ink-muted">
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

        {/* PLATFORM PAKETLERİ, ekranın asıl değeri */}
        <div className="grid gap-3 sm:grid-cols-2">
          {paketler.map(({ format, packed }) => (
            <section
              key={format}
              className={`rounded-alan border p-3 ${
                packed.blockers.length > 0 ? 'border-line border-l-4 border-l-danger' : 'border-line'
              }`}
            >
              <h3 className="font-baslik m-0 text-13 font-bold text-ink">{FORMAT_TEXT_SPEC[format].label}</h3>

              <dl className="m-0 mt-2 grid gap-1 text-12">
                {FORMAT_TEXT_SPEC[format].usesPrimaryText && (
                  <Satir etiket="Ana metin" deger={packed.primaryText ? '✓' : 'yok'} />
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
                <p key={b} className="m-0 mt-1.5 text-12 text-danger-strong">
                  · {b}
                </p>
              ))}
              {packed.warnings.map((w) => (
                <p key={w} className="m-0 mt-1.5 text-12 text-ink-muted">
                  · {w}
                </p>
              ))}
              {packed.blockers.length === 0 && packed.warnings.length === 0 && (
                <p className="m-0 mt-1.5 text-12 font-semibold text-ink">Bu platform için hazır.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      {error && (
        <Serit ton="hata" baslik="Kreatif kaydedilemedi.">
          {error}
        </Serit>
      )}

      {/* HİÇBİR PLATFORMA HAZIR DEĞİLSE KAYIT YİNE MÜMKÜN.
          Kullanıcı metni parça parça yazabilmeli; eksik bir kreatifi
          kaydedememek, `ad_drafts`'ta yaşanan "3. adım hiç çalışmıyor"
          hatasının aynısı olurdu. Eksikler yayın kontrolünde de duruyor. */}
      <p className="m-0 text-12 text-ink-muted">
        Eksik bir kreatifi kaydedebilirsin; yayın kontrolü hangi platformda neyin eksik olduğunu tekrar söyler.
      </p>
    </YanPanel>
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
      <p className="m-0 mb-1.5 flex items-baseline justify-between">
        <span className="text-13 font-semibold text-ink">{baslik}</span>
        <span className="text-12 text-ink-muted tabular-nums">
          {items.length}/{max}
        </span>
      </p>

      <ul className="m-0 grid list-none gap-1.5 p-0">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-2.5 w-4 shrink-0 text-12 text-ink-muted">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <Girdi
                aria-label={`${baslik} ${i + 1}`}
                hatali={item.length > uyariUzunlugu}
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = e.target.value.slice(0, maxLength);
                  onChange(next);
                }}
              />
              {/* GOOGLE SINIRI AŞILDIYSA SÖYLENİYOR — metin silinmiyor.
                  Meta'da sorunsuz çalışan bir başlık, Google'a girmiyor diye
                  kesilmemeli; kullanıcı hangi platformu kaybettiğini bilerek
                  karar versin. */}
              {item.length > uyariUzunlugu && (
                <span className="mt-0.5 block text-12 text-danger-strong">
                  {item.length} karakter: Google paketine giremiyor (sınır {uyariUzunlugu}).
                </span>
              )}
            </div>
            {i > 0 && (
              <Dugme
                ton="hayalet"
                boyut="kucuk"
                onClick={() => {
                  const next = [...items];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  onChange(next);
                }}
                title="Yukarı taşı: Meta ilk sıradakini kullanıyor"
                aria-label={`${baslik} ${i + 1}: yukarı taşı`}
                className="mt-1 w-8 px-0"
              >
                ↑
              </Dugme>
            )}
            <Dugme
              ton="hayalet"
              boyut="kucuk"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`${baslik} ${i + 1}: sil`}
              className="mt-1 text-danger-strong"
            >
              Sil
            </Dugme>
          </li>
        ))}
      </ul>

      {items.length < max && (
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => onChange([...items, ''])} className="mt-2">
          + {baslik.toLocaleLowerCase('tr')} ekle
        </Dugme>
      )}
      <p className="m-0 mt-1 text-12 text-ink-muted">{ipucu}</p>
    </div>
  );
}
