'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FOCAL,
  RATIO_META,
  canCrop,
  planAllCrops,
  type AssetRecord,
  type AssetUploadResult,
  type CropPlan,
  type FocalPoint,
} from '@advetics/shared';
import { API_URL } from '@/lib/api';

/**
 * Kırpma stüdyosu — tek görselden üç oran.
 *
 * ÜRÜNÜN EN BÜYÜK DELİĞİ BUYDU. Meta'nın kare yuvası zorunlu ve telefondan
 * çekilmiş 4:3 bir fotoğraf hiçbir kovaya oturmuyor; bugüne kadar verdiğimiz
 * talimat "kırp ve yeniden yükle" idi, yani asıl işi kullanıcıya
 * bırakıyorduk. "Reklamcılık bilmeyen biri kullanabilsin" vaadinin eksik
 * kalan yarısı.
 *
 * TARAYICIDA YAPILIYOR, SUNUCUDA DEĞİL. Sunucu tarafı yeniden örnekleme yeni
 * bir görüntü işleme bağımlılığı demekti (bugün yalnızca `image-probe.ts` var
 * ve o sadece başlık okuyor). Canvas bunu bağımlılıksız yapıyor ve kullanıcı
 * sonucu anında görüyor.
 *
 * ÖNİZLEME CANVAS DEĞİL CSS. `object-fit: cover` + `object-position` tam
 * olarak odak noktalı kırpmanın kendisi; üç ayrı canvas çizmek aynı sonucu
 * daha pahalıya üretirdi. Canvas yalnızca DIŞA AKTARIMDA kullanılıyor.
 */
export function CropStudio({
  clientId,
  source,
  onDone,
  onCancel,
}: {
  clientId: string;
  source: AssetRecord;
  /**
   * Üretilen (ya da arşivde zaten olan) görsellerin KAYITLARI.
   *
   * Yalnızca kimlik dönmek yetmiyor: çağıran taraf görselleri hemen
   * göstermek istiyor ve arşiv listesinin sunucudan yenilenmesini beklemek,
   * kullanıcının az önce ürettiği görselleri birkaç saniye görememesi demek.
   */
  onDone: (assets: AssetRecord[]) => void;
  onCancel: () => void;
}) {
  const [focal, setFocal] = useState<FocalPoint>(DEFAULT_FOCAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [hazir, setHazir] = useState(false);

  const uygunluk = canCrop(source);
  const plans = planAllCrops(source, focal);
  const uretilebilir = plans.filter((p) => p.usable);

  /**
   * GÖRSEL BAYT OLARAK ÇEKİLİYOR, `<img src>` ile değil.
   *
   * Canvas'a başka bir kaynaktan gelen görsel çizmek tuvali "kirletiyor" ve
   * `toBlob` SecurityError fırlatıyor. Önizleme `<img>` ile sorunsuz ama dışa
   * aktarım için baytlara ihtiyaç var; `fetch` + `createImageBitmap` yolu
   * aynı kaynak sayılıyor ve kirlenme olmuyor.
   *
   * Bu tuzak sessiz: önizleme çalışır, kullanıcı odağı ayarlar, "üret" der ve
   * ancak o an patlar.
   */
  useEffect(() => {
    let iptal = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}${source.previewUrl}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Görsel okunamadı');
        const bitmap = await createImageBitmap(await res.blob());
        if (iptal) {
          bitmap.close();
          return;
        }
        bitmapRef.current = bitmap;
        setHazir(true);
      } catch {
        setError('Görsel okunamadı — sayfayı yenileyip tekrar dene.');
      }
    })();
    return () => {
      iptal = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [source.previewUrl]);

  const odakSec = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFocal({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  async function uret(): Promise<void> {
    const bitmap = bitmapRef.current;
    if (!bitmap) return;
    setBusy(true);
    setError(null);
    try {
      const uretilen: AssetRecord[] = [];
      let mevcut = 0;

      for (const plan of uretilebilir) {
        const blob = await cropToBlob(bitmap, plan);
        const form = new FormData();
        form.append('file', blob, `${dosyaAdi(source.fileName, plan)}.jpg`);

        const ad = `${source.name} — ${RATIO_META[plan.ratio].label}`;
        // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch.
        // Content-Type ELLE VERİLMİYOR: tarayıcı boundary'yi kendisi ekliyor.
        const res = await fetch(
          `${API_URL}/assets?clientId=${clientId}&kind=image&name=${encodeURIComponent(ad)}`,
          { method: 'POST', credentials: 'include', body: form },
        );
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? 'Görsel arşive eklenemedi');
        }
        const out = (await res.json()) as AssetUploadResult;
        uretilen.push(out.asset);
        if (out.duplicate) mevcut++;
      }

      /**
       * AYNI KIRPMA İKİNCİ KEZ ARŞİVİ ŞİŞİRMİYOR.
       *
       * Arşiv içerik özetiyle mükerrer yakalıyor: aynı kaynak + aynı odak =
       * aynı baytlar = mevcut kayıt dönüyor. Yine de SÖYLÜYORUZ — kullanıcı
       * yeni bir şey ürettiğini sanmasın.
       */
      setSonuc(
        mevcut > 0
          ? `${uretilen.length} görsel hazır (${mevcut} tanesi arşivde zaten vardı).`
          : `${uretilen.length} görsel üretildi ve arşive eklendi.`,
      );
      onDone(uretilen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Görseller üretilemedi');
    } finally {
      setBusy(false);
    }
  }

  if (!uygunluk.ok) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-medium text-ink">Bu görsel kırpılamıyor</p>
        <p className="mt-1 text-xs text-ink-muted">{uygunluk.reason}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink"
        >
          Kapat
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand/40 bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Tek görselden üç oran</h3>
        <span className="text-[11px] text-ink-muted">
          {source.name} · {source.width}×{source.height}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-muted">
        Görselin üstünde <strong>korunmasını istediğin yere tıkla</strong>. Üç oran da o
        noktaya göre kırpılır.
      </p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Kaynak + odak noktası */}
        <div>
          <div
            onClick={odakSec}
            className="relative cursor-crosshair overflow-hidden rounded-lg border border-line bg-surface-sunken"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_URL}${source.previewUrl}`}
              alt={source.name}
              className="block w-full"
            />
            {/* ODAK NOKTASI GÖRÜNÜYOR. Görünmeyen bir ayar, kullanıcının
                neden farklı sonuçlar aldığını anlamaması demek. */}
            <span
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand/70 shadow"
              style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => setFocal(DEFAULT_FOCAL)}
            className="mt-1.5 text-[11px] text-brand underline"
          >
            Odağı sıfırla
          </button>
        </div>

        {/* Üç oranın önizlemesi */}
        <div className="grid grid-cols-3 gap-2">
          {plans.map((p) => (
            <div key={p.ratio}>
              <p className="mb-1 text-[11px] font-medium text-ink">{RATIO_META[p.ratio].label}</p>
              <div
                className={`overflow-hidden rounded-lg border bg-surface-sunken ${
                  p.usable ? 'border-line' : 'border-rose-200 opacity-50'
                }`}
                style={{ aspectRatio: String(RATIO_META[p.ratio].aspect) }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}${source.previewUrl}`}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ objectPosition: `${focal.x * 100}% ${focal.y * 100}%` }}
                />
              </div>
              {/* KIRPMA MİKTARI SAYIYLA. "Kırpılacak" tek başına karar
                  verdirmiyor; yüzde verdiriyor. */}
              <p className="mt-1 text-[10px] text-ink-muted">
                {p.outWidth}×{p.outHeight}
                {p.retained < 0.99 && ` · %${Math.round((1 - p.retained) * 100)} kırpılıyor`}
              </p>
              {!p.usable && <p className="text-[10px] text-rose-700">{p.reason}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* SESSİZ ELEME YOK: kaç oran üretilecek, kaçı neden üretilemiyor. */}
      {uretilebilir.length < plans.length && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-inset ring-amber-200">
          {plans.length - uretilebilir.length} oran bu görselden üretilemiyor — kaynak
          çözünürlüğü yetmiyor. Kalan {uretilebilir.length} oran yine de kullanılabilir; kare
          her yerleşimde çalışıyor.
        </p>
      )}

      {sonuc && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200">
          {sonuc}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={uret}
          disabled={busy || !hazir || uretilebilir.length === 0}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy
            ? 'Üretiliyor…'
            : !hazir
              ? 'Görsel yükleniyor…'
              : `${uretilebilir.length} oranı üret ve seç`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * Planı gerçek baytlara çevirir.
 *
 * JPEG ÜRETİLİYOR, PNG DEĞİL. Fotoğraf için PNG kayıpsız ama on kat büyük ve
 * Meta zaten yeniden sıkıştırıyor; 30 MB'lık yükleme sınırına gereksiz
 * yaklaşmak, kullanıcının hiç anlamayacağı bir hata demek. Kalite 0.92:
 * gözle fark edilmeyen ama boyutu belirgin düşüren nokta.
 */
async function cropToBlob(bitmap: ImageBitmap, plan: CropPlan): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.outWidth;
  canvas.height = plan.outHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tarayıcı görsel işlemeyi desteklemiyor.');

  // Küçültme kalitesi: tarayıcının varsayılanı hızlı ama tırtıklı.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    bitmap,
    plan.sx,
    plan.sy,
    plan.sw,
    plan.sh,
    0,
    0,
    plan.outWidth,
    plan.outHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Görsel üretilemedi'))),
      'image/jpeg',
      0.92,
    );
  });
}

/**
 * Dosya adı — ORAN VE ODAK adın içinde.
 *
 * Arşivde yan yana duran üç dosyanın hangisinin ne olduğu adından anlaşılmalı.
 * Odağın da adda olması, aynı kaynaktan farklı odakla üretilmiş iki setin
 * karışmasını engelliyor.
 */
function dosyaAdi(fileName: string, plan: CropPlan): string {
  const govde = fileName.replace(/\.[^.]+$/, '').slice(0, 60);
  return `${govde}-${plan.ratio}-${plan.sx}x${plan.sy}`;
}
