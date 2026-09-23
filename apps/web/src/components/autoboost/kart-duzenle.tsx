'use client';

import { useState } from 'react';
import {
  autoBoostQueueOverrideSchema,
  hedeflemeLokasyonu,
  type AutoBoostQueueItemRecord,
  type AutoBoostQueueOverride,
  type GeoLocationOption,
} from '@advetics/shared';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';

/**
 * ═══ SADECE BU GÖNDERİ İÇİN — AYRI PENCEREDE DEĞİL, KARTIN ÜSTÜNDE ═══
 *
 * Bu düzenleme bir süre modal penceredeydi ve kullanıcının tarifi şuydu:
 * *"düzenle diyince ayrı bir pop up açılması yerine konum yaş cinsiyet
 * yerleri düzenlenebilir bir moda geçmesi daha doğru olur"*. Haklı sebebi
 * var: pencere kartın ÜSTÜNÜ örtüyordu, yani kullanıcı neyi düzenlediğini —
 * gönderinin görselini, metnini, tarihini — düzenlerken göremiyordu. Karar
 * "şu gönderiye şu kitleye şu bütçeyle" ve üçünden biri ekrandan kalkınca
 * karar yarım kalıyor.
 *
 * Bugün alanlar DEĞERİN DURDUĞU YERDE açılıyor: hedefleme özeti hedefleme
 * denetimlerine, bütçe okuması bütçe alanlarına dönüşüyor. Kart yerinde
 * kalıyor.
 *
 * ═══ ÖN AYAR DEĞİŞMİYOR ═══
 *
 * Kaydeden bir uç yok: değerler onay isteğiyle birlikte gidiyor ve yalnızca
 * o kartın reklamına yazılıyor. Bunu ekranda YAZMAK zorundayız — "düzenle"
 * kelimesi kalıcı bir ayar değişikliği gibi okunuyor ve kullanıcı sonraki
 * gönderilerin de etkilendiğini sanırdı.
 *
 * ALANLAR ÖN AYARDAN DOLU BAŞLIYOR. Boş bir form, kullanıcının hiç
 * dokunmadığı alanları da yeniden düşünmesini isterdi; buradaki iş
 * "varsayılanın bir kısmını değiştir".
 */
export interface KartDuzenleDurumu {
  kip: 'daily' | 'lifetime';
  setKip: (v: 'daily' | 'lifetime') => void;
  tutar: string;
  setTutar: (v: string) => void;
  gun: number;
  setGun: (v: number) => void;
  kitleId: string | null;
  setKitleId: (v: string | null) => void;
  lokasyonlar: GeoLocationOption[];
  setLokasyonlar: (v: GeoLocationOption[]) => void;
  yasMin: number;
  setYasMin: (v: number) => void;
  yasMax: number;
  setYasMax: (v: number) => void;
  cinsiyet: 'all' | 'male' | 'female';
  setCinsiyet: (v: 'all' | 'male' | 'female') => void;
  /** Google'da toplam bütçe yok — kip seçeneği orada hiç gösterilmiyor. */
  gunlukZorunlu: boolean;
  metaAyar: boolean;
  onAyarVar: boolean;
  hata: string | null;
  /** Doğrulanmış override; geçersizse `null` ve `hata` doluyor. */
  topla: () => AutoBoostQueueOverride | null;
}

/**
 * Düzenleme durumunu kart bileşenine veriyor.
 *
 * ═══ NEDEN HOOK, NEDEN TEK BİLEŞEN DEĞİL ═══
 *
 * Alanlar kartın İKİ AYRI SÜTUNUNDA açılıyor: hedefleme solda, bütçe sağda.
 * Tek bir çocuk bileşen ikisini birden kaplayamıyor. Durumu hook'ta tutmak,
 * iki alan grubunun aynı kaynaktan beslenmesini ve doğrulamanın TEK yerde
 * kalmasını sağlıyor — iki ayrı kopya doğduğu anda biri şemayı atlardı.
 */
export function useKartDuzenle(kayit: AutoBoostQueueItemRecord): KartDuzenleDurumu {
  const preset = kayit.preset;
  const metaAyar = preset && preset.settings.platform === 'meta' ? preset.settings : null;

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
       * ESKİ ÖN AYARLARDA ETİKET YOK — yalnızca anahtar saklanıyordu ve
       * şehir anahtarı Meta'nın sayısal kimliği ("3684"). Anahtarı TÜRÜYLE
       * göstermek, çıplak sayıdan iyi: en azından neyin seçili olduğu
       * anlaşılıyor. Kullanıcı konumu yeniden seçtiğinde adı da kaydediliyor
       * ve bir daha bu yedeğe düşmüyor.
       */
      name: l.label ?? anahtarEtiketi(l.key, l.type),
      label: l.label ?? anahtarEtiketi(l.key, l.type),
      countryCode: null,
    })),
  );
  const [yasMin, setYasMin] = useState(metaAyar?.ageMin ?? 18);
  const [yasMax, setYasMax] = useState(metaAyar?.ageMax ?? 65);
  const [cinsiyet, setCinsiyet] = useState<'all' | 'male' | 'female'>(
    metaAyar?.genders ?? 'all',
  );
  const [hata, setHata] = useState<string | null>(null);

  const gunlukZorunlu = kayit.platform === 'google';

  function topla(): AutoBoostQueueOverride | null {
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
      return null;
    }
    setHata(null);
    return parsed.data;
  }

  return {
    kip,
    setKip,
    tutar,
    setTutar,
    gun,
    setGun,
    kitleId,
    setKitleId,
    lokasyonlar,
    setLokasyonlar,
    yasMin,
    setYasMin,
    yasMax,
    setYasMax,
    cinsiyet,
    setCinsiyet,
    gunlukZorunlu,
    metaAyar: metaAyar !== null,
    onAyarVar: preset !== null,
    hata,
    topla,
  };
}

/**
 * ═══ HEDEFLEME ALANLARI — ÖZETİN DURDUĞU YERDE ═══
 *
 * Okuma hâlinde burada "Konum · Yaş · Cinsiyet" özeti duruyor; düzenleme
 * hâlinde aynı yerde aynı üç şeyin denetimleri açılıyor. Alanların yeri
 * değişmediği için kullanıcı neyi değiştirdiğini aramıyor.
 */
export function HedeflemeAlanlari({
  d,
  clientId,
}: {
  d: KartDuzenleDurumu;
  clientId: string;
}) {
  if (!d.metaAyar) {
    /* HEDEFLEME YALNIZCA INSTAGRAM'DA — sebebi yazılı, alan gizli. */
    return (
      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
        Hedef kitle ve şehir seçimi Instagram kartlarında açık. YouTube tarafında
        hedefleme kampanya seviyesinde ve bu ekrandan yönetilmiyor.
      </p>
    );
  }

  return (
    /*
      ALAN KUTUSU NÖTR — MARKA RENGİ DEĞİL.

      Düzenleme hâli zaten üç yerde işaretli: kartın halkası, "Düzenleniyor"
      rozeti ve birincil düğme. Alan kutusunu da markaya boyamak dördüncü bir
      kırmızı yüzey demekti ve ekranda gözün nereye gideceği belirsizleşiyor —
      oysa orada okunması gereken şey ALANLARIN KENDİSİ.
    */
    <fieldset className="space-y-2.5 rounded-xl border border-line bg-surface-sunken/60 p-3">
      <legend className="px-1 text-[11px] font-semibold text-ink">Hedef kitle ve şehir</legend>

      {/* AYNI SEÇİCİ ÖN AYAR FORMUNDA DA KULLANILIYOR: ikinci bir kopya
          doğduğu anda ayrışır ve iki ekran farklı hedefleme kurardı. */}
      <HedeflemeSecici
        clientId={clientId}
        lokasyonlar={d.lokasyonlar}
        setLokasyonlar={d.setLokasyonlar}
        kitleId={d.kitleId}
        setKitleId={d.setKitleId}
      />

      {!d.kitleId && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] text-ink-muted">Yaş (alt)</span>
            <input
              type="number"
              min={13}
              max={65}
              value={d.yasMin}
              onChange={(e) => d.setYasMin(Number(e.target.value))}
              className={ALAN}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-ink-muted">Yaş (üst)</span>
            <input
              type="number"
              min={13}
              max={65}
              value={d.yasMax}
              onChange={(e) => d.setYasMax(Number(e.target.value))}
              className={ALAN}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-ink-muted">Cinsiyet</span>
            <select
              value={d.cinsiyet}
              onChange={(e) => d.setCinsiyet(e.target.value as 'all' | 'male' | 'female')}
              className={ALAN}
            >
              <option value="all">Hepsi</option>
              <option value="female">Kadın</option>
              <option value="male">Erkek</option>
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
}

/**
 * ═══ BÜTÇE ALANLARI — OKUMADAKİ YERİNDE ═══
 *
 * Kartın sağ sütununda okuma hâlinde bütçe ve süre yazıyor; düzenleme
 * hâlinde aynı sütun aynı iki değerin alanlarına dönüşüyor.
 */
export function ButceAlanlari({ d }: { d: KartDuzenleDurumu }) {
  const toplam = hesaplananToplam(d.gunlukZorunlu ? 'daily' : d.kip, d.tutar, d.gun);

  return (
    <fieldset className="space-y-2.5">
      <legend className="text-[11px] font-semibold text-ink">Bütçe ve süre</legend>

      {!d.gunlukZorunlu && (
        <div className="flex gap-1.5">
          {(
            [
              ['lifetime', 'Toplam'],
              ['daily', 'Günlük'],
            ] as const
          ).map(([k, etiket]) => (
            <button
              key={k}
              type="button"
              onClick={() => d.setKip(k)}
              aria-pressed={d.kip === k}
              className={`flex-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                d.kip === k
                  ? 'border-brand bg-brand/10 text-brand-strong'
                  : 'border-line text-ink-muted hover:bg-surface-sunken'
              }`}
            >
              {etiket}
            </button>
          ))}
        </div>
      )}

      <label className="block">
        <span className="text-[11px] text-ink-muted">
          {d.gunlukZorunlu || d.kip === 'daily' ? 'Günlük tutar (₺)' : 'Toplam tutar (₺)'}
        </span>
        <input
          inputMode="decimal"
          value={d.tutar}
          onChange={(e) => d.setTutar(e.target.value)}
          placeholder="300"
          className={ALAN}
        />
      </label>

      <label className="block">
        <span className="text-[11px] text-ink-muted">Kaç gün</span>
        <input
          type="number"
          min={1}
          max={30}
          value={d.gun}
          onChange={(e) => d.setGun(Number(e.target.value))}
          className={ALAN}
        />
      </label>

      {/*
        TOPLAM TAAHHÜT EKRANDA — düğmenin ÜSTÜNDE.
        Günlük bütçede "kaç para bağlanıyor" sorusunun cevabı çarpım ve onu
        kullanıcıya yaptırmak, her karardan sonra hesap yaptırmak demekti.
      */}
      <p className="text-[11px] text-ink-muted">
        {toplam === null
          ? 'Tutar girilince toplam taahhüt burada yazacak.'
          : d.gunlukZorunlu || d.kip === 'daily'
            ? `Toplam taahhüt: ${toplam} ₺ (${d.gun} gün × günlük tutar)`
            : `Toplam taahhüt: ${toplam} ₺ · ${d.gun} güne yayılacak`}
      </p>

      {d.gunlukZorunlu && (
        <p className="text-[11px] text-ink-muted">
          YouTube tarafında toplam bütçe yok — bütçe kampanya seviyesinde ve günlük.
        </p>
      )}
    </fieldset>
  );
}

const ALAN =
  'mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none transition focus:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand';

/**
 * Etiketi olmayan lokasyon anahtarı → okunabilir yedek.
 *
 * Şehir ve bölge anahtarı Meta'nın sayısal kimliği ("3684") ve ekranda çıplak
 * hâliyle hiçbir soruyu cevaplamıyordu. Türüyle birlikte göstermek en azından
 * NEYİN seçili olduğunu söylüyor. Ülke anahtarı zaten okunabilir ("TR").
 *
 * KALICI ÇÖZÜM DEĞİL, YEDEK: ad alanı şemaya sonradan eklendi ve eski ön
 * ayarlarda yok. Kullanıcı konumu yeniden seçtiğinde adı da kaydediliyor.
 */
function anahtarEtiketi(key: string, type: 'country' | 'region' | 'city'): string {
  if (type === 'country') return key;
  return `${type === 'city' ? 'Şehir' : 'Bölge'} #${key}`;
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
