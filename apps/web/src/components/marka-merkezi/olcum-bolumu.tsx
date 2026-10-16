'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  OLCUM_TURU_ADLARI,
  sec,
  type Dil,
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
import { DurumNoktasi, type DurumHali } from '@/components/ui/rozet';
import { eskiMarkaMerkeziYonu, markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { useDil } from '@/dil/saglayici';
import { markaMerkeziVeriSozlugu } from '@/dil/sozlukler/marka-merkezi-veri';

/**
 * ═══ MARKA MERKEZİ › KURULUM › DÖNÜŞÜM ÖLÇÜMÜ (docs/olcum/MIMARI.md) ═══
 *
 * 2026-10-13'e kadar ayrı "Ölçüm" bölümüydü; Kurulum'un 5. adımının İÇİNE
 * katlandı (docs/panel-sadelestirme/MIMARI.md § 7). Adım açılınca monte
 * oluyor: tablo siteyi tarıyor ve her Kurulum açılışında taramak boşa iş.
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

const HESAP_PLATFORMU: Record<OlcumDurumuYaniti['ekHesaplar'][number]['platform'], string> = { google: 'Google Ads', meta: 'Meta' };

const hataMetni = (e: unknown, dil: Dil) => (e instanceof ApiRequestError ? e.message : sec(markaMerkeziVeriSozlugu, dil).sunucuUlasilamadi);

export function OlcumBolumu({ clientId, yazabilir }: { clientId: string; yazabilir: boolean }) {
  const { dil } = useDil();
  const d = sec(markaMerkeziVeriSozlugu, dil).olcum;
  const [hal, setHal] = useState<Hal>({ tur: 'okunuyor' });
  const [taraniyor, setTaraniyor] = useState(false);

  const oku = useCallback(
    async (yenile: boolean) => {
      try {
        const veri = await apiFetch<OlcumDurumuYaniti>(`/olcum?clientId=${encodeURIComponent(clientId)}${yenile ? '&yenile=1' : ''}`);
        setHal({ tur: 'geldi', veri });
      } catch (e) {
        setHal({ tur: 'hata', mesaj: hataMetni(e, dil) });
      }
    },
    [clientId, dil],
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
    return <p role="status" className="rounded-kart border border-line bg-surface p-5 text-sm text-ink-muted">{d.okunuyor}</p>;
  }
  if (hal.tur === 'hata') {
    return (
      <Uyari
        ton="tehlike"
        baslik={d.alinamadi}
        eylem={
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => void yenidenTara()}>
            {d.yenidenDene}
          </Dugme>
        }
      >
        {hal.mesaj}
      </Uyari>
    );
  }
  const v = hal.veri;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-ink-muted">{d.sonTarama} {zamanGoster(v.zaman, dil)}</span>
        <Dugme ton="ikincil" boyut="kucuk" bekliyor={taraniyor} onClick={() => void yenidenTara()}>
          {d.yenidenTara}
        </Dugme>
      </div>

      {v.okumaHatalari.length > 0 && (
        <Uyari ton="uyari" baslik={d.okumaHatasi}>
          <ul className="mt-1 space-y-0.5">
            {v.okumaHatalari.map((h) => (
              <li key={h.kaynak}>
                <b>{KAYNAK_ADI[h.kaynak]}:</b> {h.mesaj}
              </li>
            ))}
          </ul>
        </Uyari>
      )}

      {v.ekHesaplar.length > 0 && (
        <Uyari ton="bilgi" baslik={d.ekHesap(v.ekHesaplar.length)}>
          {v.ekHesaplar.map((h) => `${HESAP_PLATFORMU[h.platform]} · ${h.ad}`).join(', ')}
        </Uyari>
      )}

      <Ozet v={v} dil={dil} />
      <Oneri clientId={clientId} oneri={v.oneri} yazabilir={yazabilir} dil={dil} guncelle={(y) => setHal({ tur: 'geldi', veri: y })} />
      <Tablo v={v} dil={dil} />
      <GoogleIslemleri v={v} dil={dil} />
    </div>
  );
}

/**
 * Adres GÜVENLE: sunucu ayrıştırılamayan adresi `null` döndürüyor, ama panel
 * bir yanıt alanına güvenip bölümün tamamını düşürmemeli (Ajan 4, B3).
 */
export function alanAdi(adres: string | null): string {
  if (!adres) return '—';
  try {
    return new URL(adres).hostname;
  } catch {
    return adres;
  }
}

function zamanGoster(iso: string, dil: Dil): string {
  const t = sec(markaMerkeziVeriSozlugu, dil).olcum;
  const d = new Date(iso);
  const dk = Math.round((Date.now() - d.getTime()) / 60_000);
  if (dk < 1) return t.azOnce;
  if (dk < 60) return t.dakikaOnce(dk);
  return d.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// ── Özet şeridi: dört kutu ───────────────────────────────────────────────────

function Ozet({ v, dil }: { v: OlcumDurumuYaniti; dil: Dil }) {
  const d = sec(markaMerkeziVeriSozlugu, dil).olcum;
  const s = v.site;
  const siteAlt =
    s.durum === 'adres_yok'
      ? d.siteAdresYok
      : s.durum === 'ulasilamadi'
        ? d.siteOkunamadi(s.hata ?? '')
        : s.tagManager.length
          ? `Tag Manager: ${s.tagManager.join(', ')}${s.tagManagerOkunamayan.length ? d.tagManagerOkunamayan(s.tagManagerOkunamayan.length) : ''}`
          : d.tagManagerYok;
  const gIslem = v.googleIslemleri;
  const kaydeden = gIslem ? gIslem.satirlar.filter((i) => i.durum === 'ENABLED' && i.birincil && i.sayim30Gun > 0).length : null;
  const meta = v.metaPikselleri;
  const etkinPiksel = meta ? meta.satirlar.filter((p) => !p.kullanilamaz && p.sonCalisma).length : null;
  const hazir = v.satirlar.flatMap((r) => [r.meta, r.google]).filter((h) => h.durum === 'kaydediliyor' || h.durum === 'platform_sayiyor').length;
  const olcululebilir = v.satirlar.flatMap((r) => [r.meta, r.google]).filter((h) => h.durum !== 'platformda_yok').length;
  return (
    <section className="grid overflow-hidden rounded-kart border border-line bg-surface sm:grid-cols-2 xl:grid-cols-4" aria-label={d.ozetEtiketi}>
      <Kutu baslik="Site" deger={alanAdi(s.adres)} alt={siteAlt} kucukDeger />
      <Kutu
        baslik={d.googleDonusumu}
        deger={v.googleHesabi === null ? d.hesapYok : kaydeden === null ? d.okunamadiKisa : d.kaydediliyor(kaydeden)}
        alt={
          v.googleHesabi === null
            ? d.googleHesapAtanmamis
            : gIslem
              ? `${d.islemTanimli(gIslem.satirlar.filter((i) => i.durum !== 'REMOVED').length)}${v.analyticsBagli ? d.analyticsBagli : ''}`
              : d.donusumListesiOkunamadi
        }
      />
      <Kutu
        baslik={d.metaPikseli}
        deger={v.metaHesabi === null ? d.hesapYok : meta === null ? d.okunamadiKisa : d.calisiyor(etkinPiksel ?? 0, meta.toplam)}
        alt={v.metaHesabi === null ? d.metaHesapAtanmamis : s.metaPiksel.length ? d.sitedeGorulen(s.metaPiksel.join(', ')) : d.pikselGorulmedi}
      />
      <Kutu baslik={d.olculenSonuclar} deger={`${hazir} / ${olcululebilir}`} alt={d.platformBasina} />
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

/*
 * Ortak durum noktası: yeşil yalnız ölçüm GERÇEKTEN sayılıyorsa. Eylem
 * isteyen üç hâl (ikincil, sinyal yok, tanım yok) kırmızı; tanımı hiç
 * olmayan ayrıca kırmızı yazıyla, çünkü o hücrede dönüşüm HİÇ sayılmıyor.
 */
const DURUM_HALI: Record<OlcumHucreDurumu, DurumHali> = {
  kaydediliyor: 'ok',
  platform_sayiyor: 'ok',
  ikincil: 'hata',
  sinyal_yok: 'hata',
  tanim_yok: 'hata',
  bilinmiyor: 'dur',
  platformda_yok: 'taslak',
  hesap_yok: 'taslak',
};

export function DurumIsareti({ h }: { h: OlcumHucresi }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${h.durum === 'tanim_yok' ? 'text-danger-strong' : 'text-ink'}`}>
      <DurumNoktasi hal={DURUM_HALI[h.durum]} />
      {h.etiket}
    </span>
  );
}

// ── Tablo ────────────────────────────────────────────────────────────────────

function Tablo({ v, dil }: { v: OlcumDurumuYaniti; dil: Dil }) {
  const d = sec(markaMerkeziVeriSozlugu, dil).olcum;
  return (
    <section className="overflow-hidden rounded-kart border border-line bg-surface" aria-labelledby="olcum-tablo">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line px-4 py-3">
        <h3 id="olcum-tablo" className="text-sm font-semibold text-ink">
          {d.neyiOlcuyoruz}
        </h3>
        <span className="text-xs text-ink-muted">{d.olcumSayisi(v.satirlar.length)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-semibold">{d.kolonOlcum}</th>
              <th className="px-4 py-2 font-semibold">Meta{v.metaHesabi ? ` · ${v.metaHesabi.ad}` : ''}</th>
              <th className="px-4 py-2 font-semibold">Google Ads{v.googleHesabi ? ` · ${v.googleHesabi.ad}` : ''}</th>
              <th className="px-4 py-2 font-semibold">{d.kolonAmaclar}</th>
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
        {d.altNot}
      </p>
    </section>
  );
}

// ── Google işlem listesi (sessiz kesme yok: tamamı) ─────────────────────────

function GoogleIslemleri({ v, dil }: { v: OlcumDurumuYaniti; dil: Dil }) {
  const d = sec(markaMerkeziVeriSozlugu, dil).olcum;
  const g = v.googleIslemleri;
  if (!g || g.toplam === 0) return null;
  return (
    <details className="group rounded-kart border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        {d.googleIslemleri} <span className="font-normal text-ink-muted">· {d.googleGosterilen(g.toplam, g.satirlar.length)}</span>
        {v.googleHesabi?.donusumKimligi && <span className="ml-2 text-xs font-normal text-ink-muted">{d.donusumKimligi} {v.googleHesabi.donusumKimligi}</span>}
      </summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface-muted text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-semibold">{d.kolonIslem}</th>
              <th className="px-4 py-2 font-semibold">{d.kolonDurum}</th>
              <th className="px-4 py-2 font-semibold">{d.kolonHedef}</th>
              <th className="px-4 py-2 text-right font-semibold">{d.kolonSayim}</th>
            </tr>
          </thead>
          <tbody>
            {g.satirlar.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="px-4 py-2">
                  <p className="text-ink">{i.ad}</p>
                  <p className="text-xs text-ink-muted">{i.kategori}</p>
                </td>
                <td className="px-4 py-2 text-xs">{i.durum === 'ENABLED' ? d.islemEtkin : i.durum === 'HIDDEN' ? d.islemGizli : i.durum === 'REMOVED' ? d.islemKaldirilmis : i.durum}</td>
                <td className="px-4 py-2 text-xs">{i.birincil ? d.birincil : d.ikincil}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Math.round(i.sayim30Gun).toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ── Tek en uygun öneri ──────────────────────────────────────────────────────

// `site` adı sözlükten (`yerAdi`); diğerleri iki dilde aynı marka adı.
const YER: Record<OlcumOnerisi['adimlar'][number]['yer'], { ad: string; site: boolean }> = {
  google_ads: { ad: 'Google Ads', site: false },
  tag_manager: { ad: 'Tag Manager', site: true },
  site: { ad: '', site: true },
  meta: { ad: 'Meta', site: false },
  advetics: { ad: 'Advetics', site: false },
};

function Oneri({
  clientId,
  oneri,
  yazabilir,
  dil,
  guncelle,
}: {
  clientId: string;
  oneri: OlcumOnerisi;
  yazabilir: boolean;
  dil: Dil;
  guncelle: (v: OlcumDurumuYaniti) => void;
}) {
  const d = sec(markaMerkeziVeriSozlugu, dil).olcum;
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
      setHata(hataMetni(e, dil));
    } finally {
      setGonderiliyor(false);
    }
  }

  const e = oneri.eylem;
  return (
    <section className={`rounded-kart border bg-surface p-4 ${tamam ? 'border-line' : 'border-brand/40'}`} aria-labelledby="olcum-oneri">
      <p className={`text-xs font-semibold ${tamam ? 'text-ink-muted' : 'text-brand-strong'}`}>{tamam ? d.oneriDurum : d.oneriEnUygun}</p>
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
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${YER[a.yer].site ? 'bg-vurgu text-brand-strong' : 'bg-surface-sunken text-ink'}`}>{a.yer === 'site' ? d.yerSite : YER[a.yer].ad}</span>
            </li>
          ))}
        </ol>
      )}
      {oneri.kisit && (
        <div className="mt-3">
          <Uyari ton="uyari">{oneri.kisit}</Uyari>
        </div>
      )}

      {e?.tur === 'birincil_yap' && (
        <div className="mt-3">
          {!yazabilir ? (
            <p className="text-xs text-ink-muted">{d.yetkiYok}</p>
          ) : (
            /* Onay SATIR İÇİNDE ve öğe DOM'dan çıkmıyor: görünürlük geçişle. */
            <div className="space-y-2">
              <div className={onay ? 'hidden' : ''}>
                <Dugme onClick={() => setOnay(true)}>{d.birincilYap}</Dugme>
              </div>
              <div
                className={`rounded-alan border border-line p-3 transition-opacity duration-200 motion-reduce:transition-none ${onay ? 'opacity-100' : 'pointer-events-none hidden opacity-0'}`}
                role="group"
                aria-label={d.onayEtiketi}
              >
                <p className="text-sm text-ink">
                  {d.onayMetni(e.donusumAdi)}
                </p>
                <div className="mt-2 flex gap-2">
                  <Dugme id={onayId} bekliyor={gonderiliyor} onClick={() => void birincilYap(e.donusumId)}>
                    {d.onayla}
                  </Dugme>
                  <Dugme ton="ikincil" disabled={gonderiliyor} onClick={() => setOnay(false)}>
                    {sec(markaMerkeziVeriSozlugu, dil).vazgec}
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
          {/*
            SÖZLEŞMEDEKİ ESKİ BÖLÜM KODU ÇEVRİLİYOR: API'nin yanıt biçimi
            (`bolum: 'baglantilar' | 'ayarlar'`) değişmedi; yeri değişti.
            Çeviri tek yerde (`eskiMarkaMerkeziYonu`), burada ikinci eşleme yok.
          */}
          <Link
            href={eskiMarkaMerkeziYonu(e.bolum, { musteri: clientId }) ?? markaMerkeziAdresi('kurulum', clientId)}
            className="text-sm font-semibold text-ink underline-offset-2 hover:text-brand-strong hover:underline"
          >
            {e.bolum === 'baglantilar' ? d.kurulumHesaplar : d.workspaceBilgileri} →
          </Link>
        </div>
      )}
    </section>
  );
}
