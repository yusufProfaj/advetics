'use client';

import { useEffect, useRef, useState } from 'react';
import {
  autoBoostQueueOverrideSchema,
  type AutoBoostQueueItemRecord,
  type AutoBoostQueueOverride,
  type GeoLocationOption,
} from '@advetics/shared';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';

/**
 * ═══ SADECE BU GÖNDERİ İÇİN ═══
 *
 * Ön ayar workspace geneli: "bu müşterinin her gönderisi şu bütçeyle, şu
 * kitleye". Tek bir gönderi bazen farklı davranmayı hak ediyor — kampanya
 * dönemindeki bir duyuru, yalnızca bir şehre yapılan bir ilan.
 *
 * ═══ PENCERE ÖN AYARI DEĞİŞTİRMİYOR ═══
 *
 * Kaydeden bir uç yok: değerler onay isteğiyle birlikte gidiyor ve yalnızca
 * o kartın reklamına yazılıyor. Bunu ekranda YAZMAK zorundayız — "düzenle"
 * kelimesi kalıcı bir ayar değişikliği gibi okunuyor ve kullanıcı sonraki
 * gönderilerin de etkilendiğini sanırdı.
 *
 * ALANLAR ÖN AYARDAN DOLU BAŞLIYOR. Boş bir form, kullanıcının hiç
 * dokunmadığı alanları da yeniden düşünmesini isterdi; buradaki iş
 * "varsayılanın bir kısmını değiştir".
 *
 * PENCERE ONAYI DA KENDİSİ VERİYOR ("Bu ayarlarla yayınla"). Ayrı bir
 * "kaydet" adımı, kaydedilecek bir yer olmadığı için yalan olurdu ve
 * kullanıcı kapatınca düzenlemesinin nereye gittiğini bilemezdi.
 */
export function KartDuzenle({
  kayit,
  clientId,
  onKapat,
  onYayinla,
}: {
  kayit: AutoBoostQueueItemRecord;
  clientId: string;
  onKapat: () => void;
  /** Pencerenin ürettiği ayarlarla onayı çalıştırır. */
  onYayinla: (override: AutoBoostQueueOverride) => Promise<void>;
}) {
  const preset = kayit.preset;
  const metaAyar =
    preset && preset.settings.platform === 'meta' ? preset.settings : null;

  const [kip, setKip] = useState<'daily' | 'lifetime'>(preset?.budgetMode ?? 'lifetime');
  const [tutar, setTutar] = useState(
    preset ? (Number(preset.budgetMicros) / 1_000_000).toString() : '',
  );
  const [gun, setGun] = useState(preset?.durationDays ?? 5);

  const [kitleId, setKitleId] = useState<string | null>(metaAyar?.savedAudienceId ?? null);
  const [lokasyonlar, setLokasyonlar] = useState<GeoLocationOption[]>(
    (metaAyar?.locations ?? []).map((l) => ({
      key: l.key,
      type: l.type,
      /*
       * ÖN AYARDA ETİKET SAKLANMIYOR (yalnızca anahtar + tür): Meta'nın
       * kendi adı canlıdan geliyor. Anahtarı göstermek, hiçbir şey
       * göstermemekten iyi — kullanıcı hangi yerin seçili olduğunu
       * görmeli. Ön ayar formunda da aynı yedek kullanılıyor.
       */
      name: l.key,
      label: l.key,
      countryCode: null,
    })),
  );
  const [yasMin, setYasMin] = useState(metaAyar?.ageMin ?? 18);
  const [yasMax, setYasMax] = useState(metaAyar?.ageMax ?? 65);
  const [cinsiyet, setCinsiyet] = useState<'all' | 'male' | 'female'>(
    metaAyar?.genders ?? 'all',
  );

  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kutuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onKapat();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKapat]);

  /*
   * GOOGLE'DA TOPLAM BÜTÇE YOK — kip seçeneği orada hiç gösterilmiyor.
   * Bütçe Google'da ayrı bir kaynak ve günlük; seçtirip sunucuda reddetmek,
   * kullanıcıyı çalışmayan bir seçeneğe davet etmek olurdu.
   */
  const gunlukZorunlu = kayit.platform === 'google';

  async function yayinla(): Promise<void> {
    const override: AutoBoostQueueOverride = {
      budget: { mode: gunlukZorunlu ? 'daily' : kip, amount: tutar.trim(), durationDays: gun },
      ...(metaAyar
        ? {
            targeting: {
              savedAudienceId: kitleId,
              locations: kitleId ? [] : lokasyonlar.map(hedeflemeLokasyonu),
              ageMin: yasMin,
              ageMax: yasMax,
              genders: cinsiyet,
            },
          }
        : {}),
    };

    /*
     * ŞEMA PANELDE DE KOŞUYOR. Sunucunun cevabını beklemeden hatayı alanın
     * yanında göstermek, "yayınla"ya basıp 400 yemekten iyi — üstelik bu
     * düğme PARA HARCIYOR ve başarısız bir istekten sonra kullanıcı ikinci
     * kez basmayı deniyor.
     */
    const parsed = autoBoostQueueOverrideSchema.safeParse(override);
    if (!parsed.success) {
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }

    setBusy(true);
    setHata(null);
    try {
      await onYayinla(parsed.data);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
      setBusy(false);
    }
  }

  const toplam = hesaplananToplam(gunlukZorunlu ? 'daily' : kip, tutar, gun);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bu gönderi için ayarlar"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (!kutuRef.current?.contains(e.target as Node)) onKapat();
      }}
    >
      <div
        ref={kutuRef}
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">Sadece bu gönderi için</h2>
            {/* KALICI OLMADIĞI YAZILI — "düzenle" kelimesi kalıcı bir ayar
                değişikliği gibi okunuyor. */}
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Ön ayar değişmiyor; bu ayarlar yalnızca bu karta uygulanıyor.
            </p>
          </div>
          <button
            type="button"
            onClick={onKapat}
            className="shrink-0 text-xs text-ink-muted transition hover:text-ink"
          >
            Kapat
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!preset && (
            /* ÖN AYAR YOKSA DÜZENLENECEK BİR TABAN DA YOK. Boş bir form
               göstermek, kaydedilemeyecek bir şeyi doldurtmak olurdu. */
            <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink">
              Bu workspace için boost ön ayarı yok. Önce ön ayarı kur; bu
              pencere onun üstüne yazıyor.
            </p>
          )}

          <fieldset className="space-y-3">
            <legend className="text-xs font-medium text-ink">Bütçe ve süre</legend>

            {!gunlukZorunlu && (
              <div className="flex gap-2">
                {(
                  [
                    ['lifetime', 'Toplam bütçe'],
                    ['daily', 'Günlük bütçe'],
                  ] as const
                ).map(([k, etiket]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKip(k)}
                    aria-pressed={kip === k}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      kip === k
                        ? 'border-brand bg-brand/10 text-brand-strong'
                        : 'border-line text-ink-muted hover:bg-surface-sunken'
                    }`}
                  >
                    {etiket}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] text-ink-muted">
                  {gunlukZorunlu || kip === 'daily' ? 'Günlük tutar (₺)' : 'Toplam tutar (₺)'}
                </span>
                <input
                  inputMode="decimal"
                  value={tutar}
                  onChange={(e) => setTutar(e.target.value)}
                  placeholder="300"
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-ink-muted">Kaç gün</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={gun}
                  onChange={(e) => setGun(Number(e.target.value))}
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
            </div>

            {/*
              TOPLAM TAAHHÜT EKRANDA — düğmenin ÜSTÜNDE.
              Günlük bütçede "kaç para bağlanıyor" sorusunun cevabı çarpım
              ve onu kullanıcıya yaptırmak, her karardan sonra hesap
              yaptırmak demekti.
            */}
            <p className="text-[11px] text-ink-muted">
              {toplam === null
                ? 'Tutar girilince toplam taahhüt burada yazacak.'
                : gunlukZorunlu || kip === 'daily'
                  ? `Toplam taahhüt: ${toplam} ₺ (${gun} gün × günlük tutar)`
                  : `Toplam taahhüt: ${toplam} ₺ · ${gun} güne yayılacak`}
            </p>

            {gunlukZorunlu && (
              <p className="text-[11px] text-ink-muted">
                YouTube tarafında toplam bütçe yok — bütçe kampanya seviyesinde
                ve günlük.
              </p>
            )}
          </fieldset>

          {metaAyar ? (
            <fieldset className="space-y-3">
              <legend className="text-xs font-medium text-ink">Hedef kitle ve şehir</legend>

              {/* AYNI SEÇİCİ ÖN AYAR FORMUNDA DA KULLANILIYOR: ikinci bir
                  kopya doğduğu anda ayrışır ve iki ekran farklı hedefleme
                  kurardı. */}
              <HedeflemeSecici
                clientId={clientId}
                lokasyonlar={lokasyonlar}
                setLokasyonlar={setLokasyonlar}
                kitleId={kitleId}
                setKitleId={setKitleId}
              />

              {!kitleId && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-[11px] text-ink-muted">Yaş (alt)</span>
                    <input
                      type="number"
                      min={13}
                      max={65}
                      value={yasMin}
                      onChange={(e) => setYasMin(Number(e.target.value))}
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-ink-muted">Yaş (üst)</span>
                    <input
                      type="number"
                      min={13}
                      max={65}
                      value={yasMax}
                      onChange={(e) => setYasMax(Number(e.target.value))}
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-ink-muted">Cinsiyet</span>
                    <select
                      value={cinsiyet}
                      onChange={(e) =>
                        setCinsiyet(e.target.value as 'all' | 'male' | 'female')
                      }
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    >
                      <option value="all">Hepsi</option>
                      <option value="female">Kadın</option>
                      <option value="male">Erkek</option>
                    </select>
                  </label>
                </div>
              )}
            </fieldset>
          ) : (
            /* HEDEFLEME YALNIZCA INSTAGRAM'DA — sebebi yazılı, alan gizli. */
            <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
              Hedef kitle ve şehir seçimi Instagram kartlarında açık. YouTube
              tarafında hedefleme kampanya seviyesinde ve bu ekrandan
              yönetilmiyor.
            </p>
          )}

          {hata && (
            <p role="alert" className="text-xs text-danger">
              {hata}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onKapat}
            className="text-xs text-ink-muted transition hover:text-ink"
          >
            Vazgeç
          </button>
          {/*
            PENCERE ONAYI DA KENDİSİ VERİYOR. Ayrı bir "kaydet" adımı,
            kaydedilecek bir yer olmadığı için yalan olurdu.
          */}
          <button
            type="button"
            disabled={busy || !preset}
            onClick={() => void yayinla()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Yayınlanıyor…' : 'Bu ayarlarla yayınla'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Toplam taahhüt — girilemez bir tutarda `null`.
 *
 * SIFIR DÖNDÜRMÜYOR: boş bir alanda "0 ₺ taahhüt" yazmak, hesaplanmış bir
 * sayı gibi okunur ve kullanıcı bedava sanır.
 */
function hesaplananToplam(
  kip: 'daily' | 'lifetime',
  tutar: string,
  gun: number,
): string | null {
  const n = Number(tutar.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(gun) || gun <= 0) return null;
  const toplam = kip === 'daily' ? n * gun : n;
  return toplam.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/**
 * `GeoLocationOption` → hedefleme kovası.
 *
 * `type` seçicide `string` (Meta'nın döndürdüğü ham değer); hedefleme şeması
 * ise üç değerli bir birleşim istiyor. `as` ile susturmak, Meta bir gün
 * dördüncü bir tür döndürdüğünde onu SESSİZCE geçirmek olurdu — ve o istek
 * yayında "integer bekleniyor" gibi sebebi anlaşılmayan bir hatayla düşerdi.
 * Tanınmayan tür burada ELENİYOR ve seçici zaten yalnızca aranabilir üç türü
 * listeliyor.
 */
function hedeflemeLokasyonu(l: GeoLocationOption): {
  key: string;
  type: 'country' | 'region' | 'city';
} | never {
  if (l.type === 'country' || l.type === 'region' || l.type === 'city') {
    return { key: l.key, type: l.type };
  }
  throw new Error(`Tanınmayan lokasyon türü: ${l.type}`);
}
