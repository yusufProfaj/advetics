'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  OLCUM_TURU_ADLARI,
  REHBER_AMACLARI,
  type OlcumDurumuYaniti,
  type OlcumHucreDurumu,
  type OlcumHucresi,
  type OlcumOkumaHatasi,
  type OlcumOnerisi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { mmAdresi } from './bolumler';

/**
 * ═══ MARKA MERKEZİ › ÖLÇÜM (docs/olcum/MIMARI.md, taslak.html) ═══
 *
 * Google Ads'in Hedefler › Dönüşümler mantığı: önce tablo (neyi ölçüyoruz,
 * durumu NEDENİYLE), sonra TEK en uygun öneri ve tek düğme. Karar
 * fonksiyonları shared'da (`enUygunOneri`, `olcumSatirlari`); burada yalnız
 * çizim.
 *
 * DÖRT HÂL AYRI (`.catch(() => setX([]))` yasağı): okunuyor, çağrı düştü,
 * geldi; gelen yanıtın içinde de her kaynağın kendi hatası (`okumaHatalari`).
 */
type Hal = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: OlcumDurumuYaniti };

/** Sözlük, dallanma değil: yeni bir kaynak eklenince derleme kırılsın. */
const KAYNAK_ADI: Record<OlcumOkumaHatasi['kaynak'], string> = { site: 'Site', google: 'Google Ads', meta: 'Meta' };

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

export function OlcumBolumu({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });
  const [taraniyor, setTaraniyor] = useState(false);

  const oku = useCallback(
    async (yenile: boolean) => {
      try {
        const veri = await apiFetch<OlcumDurumuYaniti>(`/olcum?clientId=${encodeURIComponent(clientId)}${yenile ? '&yenile=1' : ''}`);
        setHal({ tur: 'geldi', veri });
      } catch (e) {
        setHal({ tur: 'hata', mesaj: hataMetni(e) });
      }
    },
    [clientId],
  );

  useEffect(() => {
    void oku(false);
  }, [oku]);

  async function yenidenTara() {
    setTaraniyor(true);
    await oku(true);
    setTaraniyor(false);
  }

  if (hal.tur === 'okunuyor') {
    return <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-muted">Site, Google Ads ve Meta okunuyor…</p>;
  }
  if (hal.tur === 'hata') {
    return (
      <Uyari ton="tehlike" baslik="Ölçüm durumu alınamadı.">
        {hal.mesaj}{' '}
        <button type="button" className="font-semibold underline" onClick={() => void yenidenTara()}>
          Yeniden dene
        </button>
      </Uyari>
    );
  }
  const v = hal.veri;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-ink-muted">Son tarama: {zamanGoster(v.zaman)}</span>
        <Dugme ton="ikincil" boyut="kucuk" bekliyor={taraniyor} onClick={() => void yenidenTara()}>
          Siteyi yeniden tara
        </Dugme>
      </div>

      {v.okumaHatalari.length > 0 && (
        <Uyari ton="uyari" baslik="Bazı kaynaklar okunamadı; tablodaki ilgili hücre bunu söylüyor.">
          <ul className="mt-1 space-y-0.5">
            {v.okumaHatalari.map((h) => (
              <li key={h.kaynak}>
                <b>{KAYNAK_ADI[h.kaynak]}:</b> {h.mesaj}
              </li>
            ))}
          </ul>
        </Uyari>
      )}

      <Ozet v={v} />
      <Oneri clientId={clientId} oneri={v.oneri} yazabilir={yazabilir} guncelle={(y) => setHal({ tur: 'geldi', veri: y })} />
      <Tablo v={v} />
      <GoogleIslemleri v={v} />
    </div>
  );
}

function zamanGoster(iso: string): string {
  const d = new Date(iso);
  const dk = Math.round((Date.now() - d.getTime()) / 60_000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dakika önce`;
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// ── Özet şeridi: dört kutu ───────────────────────────────────────────────────

function Ozet({ v }: { v: OlcumDurumuYaniti }) {
  const s = v.site;
  const siteAlt =
    s.durum === 'adres_yok'
      ? "Site adresi girilmemiş"
      : s.durum === 'ulasilamadi'
        ? `Okunamadı: ${s.hata ?? ''}`
        : s.tagManager.length
          ? `Tag Manager: ${s.tagManager.join(', ')}${s.tagManagerOkunamayan.length ? ` (${s.tagManagerOkunamayan.length} okunamadı)` : ''}`
          : 'Tag Manager bulunamadı';
  const gIslem = v.googleIslemleri;
  const kaydeden = gIslem ? gIslem.satirlar.filter((i) => i.durum === 'ENABLED' && i.birincil && i.sayim30Gun > 0).length : null;
  const meta = v.metaPikselleri;
  const etkinPiksel = meta ? meta.satirlar.filter((p) => !p.kullanilamaz && p.sonCalisma).length : null;
  const hazir = v.satirlar.flatMap((r) => [r.meta, r.google]).filter((h) => h.durum === 'kaydediliyor' || h.durum === 'platform_sayiyor').length;
  const olcululebilir = v.satirlar.flatMap((r) => [r.meta, r.google]).filter((h) => h.durum !== 'platformda_yok').length;
  return (
    <section className="grid overflow-hidden rounded-xl border border-line bg-surface sm:grid-cols-2 xl:grid-cols-4" aria-label="Ölçüm özeti">
      <Kutu baslik="Site" deger={s.adres ? new URL(s.adres).hostname : '—'} alt={siteAlt} kucukDeger />
      <Kutu
        baslik="Google Ads dönüşümü"
        deger={v.googleHesabi === null ? 'Hesap yok' : kaydeden === null ? 'Okunamadı' : `${kaydeden} kaydediliyor`}
        alt={
          v.googleHesabi === null
            ? "Bu workspace'e Google Ads hesabı atanmamış"
            : gIslem
              ? `${gIslem.toplam} işlem tanımlı${v.analyticsBagli ? ' · Analytics bağlı' : ''}`
              : 'Dönüşüm listesi okunamadı'
        }
      />
      <Kutu
        baslik="Meta pikseli"
        deger={v.metaHesabi === null ? 'Hesap yok' : meta === null ? 'Okunamadı' : `${etkinPiksel} / ${meta.toplam} çalışıyor`}
        alt={v.metaHesabi === null ? "Bu workspace'e Meta reklam hesabı atanmamış" : s.metaPiksel.length ? `Sitede görülen: ${s.metaPiksel.join(', ')}` : 'Sitede piksel kodu görülmedi'}
      />
      <Kutu baslik="Ölçülen sonuçlar" deger={`${hazir} / ${olcululebilir}`} alt="Platform başına; platformda olmayan sayılmadı" />
    </section>
  );
}

function Kutu({ baslik, deger, alt, kucukDeger = false }: { baslik: string; deger: string; alt: string; kucukDeger?: boolean }) {
  return (
    <div className="min-w-0 border-b border-line p-4 last:border-b-0 sm:border-r xl:border-b-0">
      <p className="text-xs font-semibold text-ink-muted">{baslik}</p>
      <p className={`mt-0.5 break-words font-semibold text-ink ${kucukDeger ? 'text-base' : 'font-baslik text-xl'}`}>{deger}</p>
      <p className="mt-0.5 break-words text-xs text-ink-muted">{alt}</p>
    </div>
  );
}

// ── Durum: şekil + metin; yeşil yalnız durumda ──────────────────────────────

const DURUM_SEKLI: Record<OlcumHucreDurumu, { renk: string; sekil: 'nokta' | 'carpi' | 'halka' }> = {
  kaydediliyor: { renk: 'text-ok-strong', sekil: 'nokta' },
  platform_sayiyor: { renk: 'text-ok-strong', sekil: 'nokta' },
  ikincil: { renk: 'text-warn-strong', sekil: 'nokta' },
  sinyal_yok: { renk: 'text-warn-strong', sekil: 'halka' },
  tanim_yok: { renk: 'text-danger-strong', sekil: 'carpi' },
  bilinmiyor: { renk: 'text-ink-muted', sekil: 'halka' },
  platformda_yok: { renk: 'text-ink-muted', sekil: 'halka' },
  hesap_yok: { renk: 'text-ink-muted', sekil: 'halka' },
};

export function DurumIsareti({ h }: { h: OlcumHucresi }) {
  const d = DURUM_SEKLI[h.durum];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${d.renk}`}>
      {d.sekil === 'nokta' && <span aria-hidden className="size-2 rounded-full bg-current" />}
      {d.sekil === 'halka' && <span aria-hidden className="size-2 rounded-full border-2 border-current" />}
      {d.sekil === 'carpi' && <span aria-hidden className="text-[11px] leading-none">✕</span>}
      {h.etiket}
    </span>
  );
}

// ── Tablo ────────────────────────────────────────────────────────────────────

function Tablo({ v }: { v: OlcumDurumuYaniti }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-labelledby="olcum-tablo">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line px-4 py-3">
        <h3 id="olcum-tablo" className="text-sm font-semibold text-ink">
          Neyi ölçüyoruz
        </h3>
        <span className="text-xs text-ink-muted">
          {v.satirlar.length} ölçüm · {v.satirlar.length}'i gösteriliyor
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-semibold">Ölçüm</th>
              <th className="px-4 py-2 font-semibold">Meta{v.metaHesabi ? ` · ${v.metaHesabi.ad}` : ''}</th>
              <th className="px-4 py-2 font-semibold">Google Ads{v.googleHesabi ? ` · ${v.googleHesabi.ad}` : ''}</th>
              <th className="px-4 py-2 font-semibold">Kullanan reklam amaçları</th>
            </tr>
          </thead>
          <tbody>
            {v.satirlar.map((r) => (
              <tr key={r.tur} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{OLCUM_TURU_ADLARI[r.tur].ad}</p>
                  <p className="text-xs text-ink-muted">{OLCUM_TURU_ADLARI[r.tur].aciklama}</p>
                </td>
                <td className="px-4 py-3">
                  <DurumIsareti h={r.meta} />
                  <p className="mt-0.5 text-xs text-ink-muted">{r.meta.neden}</p>
                </td>
                <td className="px-4 py-3">
                  <DurumIsareti h={r.google} />
                  <p className="mt-0.5 text-xs text-ink-muted">{r.google.neden}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.amaclar.map((a) => (
                      <span key={a} className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                        {REHBER_AMACLARI[a].ekranAdi}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line bg-surface-muted px-4 py-2 text-xs text-ink-muted">
        Google sayımı son 30 gün, Meta olayları son 7 gün. &quot;Platform sayıyor&quot;: sonuç platformun kendi uygulamasında oluşuyor, sitede kod gerekmez.
      </p>
    </section>
  );
}

// ── Google işlem listesi (sessiz kesme yok: tamamı) ─────────────────────────

function GoogleIslemleri({ v }: { v: OlcumDurumuYaniti }) {
  const g = v.googleIslemleri;
  if (!g || g.toplam === 0) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        Google Ads dönüşüm işlemleri <span className="font-normal text-ink-muted">· {g.toplam} işlemin {g.satirlar.length}'i</span>
        {v.googleHesabi?.donusumKimligi && <span className="ml-2 text-xs font-normal text-ink-muted">Dönüşüm kimliği {v.googleHesabi.donusumKimligi}</span>}
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-semibold">İşlem</th>
              <th className="px-4 py-2 font-semibold">Durum</th>
              <th className="px-4 py-2 font-semibold">Hedef</th>
              <th className="px-4 py-2 text-right font-semibold">30 gün sayım</th>
            </tr>
          </thead>
          <tbody>
            {g.satirlar.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <p className="text-ink">{i.ad}</p>
                  <p className="text-xs text-ink-muted">{i.kategori}</p>
                </td>
                <td className="px-4 py-2 text-xs">{i.durum === 'ENABLED' ? 'Etkin' : i.durum === 'HIDDEN' ? 'Gizli (içe aktarılmamış)' : i.durum === 'REMOVED' ? 'Kaldırılmış' : i.durum}</td>
                <td className="px-4 py-2 text-xs">{i.birincil ? 'Birincil' : 'İkincil'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Math.round(i.sayim30Gun).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ── Tek en uygun öneri ──────────────────────────────────────────────────────

const YER: Record<OlcumOnerisi['adimlar'][number]['yer'], { ad: string; site: boolean }> = {
  google_ads: { ad: 'Google Ads', site: false },
  tag_manager: { ad: 'Tag Manager', site: true },
  site: { ad: 'Sitende değişiklik', site: true },
  meta: { ad: 'Meta', site: false },
  advetics: { ad: 'Advetics', site: false },
};

function Oneri({
  clientId,
  oneri,
  yazabilir,
  guncelle,
}: {
  clientId: string;
  oneri: OlcumOnerisi;
  yazabilir: boolean;
  guncelle: (v: OlcumDurumuYaniti) => void;
}) {
  const [onay, setOnay] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const onayId = useId();
  const tamam = oneri.kod === 'HEPSI_HAZIR';

  useEffect(() => {
    if (onay) document.getElementById(onayId)?.focus();
  }, [onay, onayId]);

  async function birincilYap(donusumId: string) {
    setGonderiliyor(true);
    setHata(null);
    try {
      const y = await apiFetch<OlcumDurumuYaniti>('/olcum/birincil-yap', { method: 'POST', body: JSON.stringify({ clientId, donusumId }) });
      setOnay(false);
      guncelle(y);
    } catch (e) {
      setHata(hataMetni(e));
    } finally {
      setGonderiliyor(false);
    }
  }

  const e = oneri.eylem;
  return (
    <section className={`rounded-xl border bg-surface p-4 ${tamam ? 'border-line' : 'border-brand/40'}`} aria-labelledby="olcum-oneri">
      <p className={`text-xs font-semibold ${tamam ? 'text-ok-strong' : 'text-brand-strong'}`}>{tamam ? 'Durum' : 'Sizin için en uygun öneri'}</p>
      <h3 id="olcum-oneri" className="mt-1 font-baslik text-base font-semibold text-ink">
        {oneri.baslik}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">{oneri.metin}</p>
      {oneri.adimlar.length > 0 && (
        <ol className="mt-3 space-y-2">
          {oneri.adimlar.map((a, i) => (
            <li key={a.metin} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2 text-sm">
              <span className="grid size-6 place-items-center rounded-full bg-surface-sunken text-xs font-semibold">{i + 1}</span>
              <span>
                <span className="text-ink">{a.metin}</span>
                {a.ayrinti && <span className="block text-xs text-ink-muted">{a.ayrinti}</span>}
              </span>
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${YER[a.yer].site ? 'bg-brand-soft text-brand-strong' : 'bg-surface-sunken text-ink'}`}>{YER[a.yer].ad}</span>
            </li>
          ))}
        </ol>
      )}
      {oneri.kisit && <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-strong">{oneri.kisit}</p>}

      {e?.tur === 'birincil_yap' && (
        <div className="mt-3">
          {!yazabilir ? (
            <p className="text-xs text-ink-muted">Bu değişikliği yapma yetkin yok; workspace yöneticisine ilet.</p>
          ) : (
            /* Onay SATIR İÇİNDE ve öğe DOM'dan çıkmıyor: görünürlük geçişle. */
            <div className="space-y-2">
              <div className={onay ? 'hidden' : ''}>
                <Dugme onClick={() => setOnay(true)}>Birincil yap</Dugme>
              </div>
              <div
                className={`rounded-lg border border-line p-3 transition-opacity duration-200 motion-reduce:transition-none ${onay ? 'opacity-100' : 'pointer-events-none hidden opacity-0'}`}
                role="group"
                aria-label="Onay"
              >
                <p className="text-sm text-ink">
                  Google Ads&apos;te &quot;{e.donusumAdi}&quot; birincil olacak. Bu hedefi kullanan kampanyaların teklifi bu sayıma göre çalışır. Sitende değişiklik yok; Google Ads&apos;ten geri alınabilir.
                </p>
                <div className="mt-2 flex gap-2">
                  <Dugme id={onayId} bekliyor={gonderiliyor} onClick={() => void birincilYap(e.donusumId)}>
                    Onayla
                  </Dugme>
                  <Dugme ton="ikincil" disabled={gonderiliyor} onClick={() => setOnay(false)}>
                    Vazgeç
                  </Dugme>
                </div>
              </div>
              {hata && (
                <p role="alert" className="text-xs text-danger-strong">
                  {hata}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {e?.tur === 'marka_merkezi' && (
        <div className="mt-3">
          <Link href={mmAdresi(clientId, e.bolum)} className="text-sm font-semibold text-ink underline-offset-2 hover:text-brand-strong hover:underline">
            {e.bolum === 'baglantilar' ? "Bağlantılar'a git" : "Workspace ayarları'na git"} →
          </Link>
        </div>
      )}
    </section>
  );
}
