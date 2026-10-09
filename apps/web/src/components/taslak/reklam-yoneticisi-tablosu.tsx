'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Platform } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { ReklamOnizleme } from '@/components/reklam-onizleme';
import { onizlemeAcikMi } from '@/components/breakdown-table';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { basHarfler } from './genel-bakis-parcalari';
import s from './taslak.module.css';

/*
 * ═══ REKLAM YÖNETİCİSİ — ONAYLANAN TASLAĞIN TEK TABLOSU ═══
 *
 * Taslakta tek kart: düzey sekmeleri, metrik kutuları, süzgeç çubuğu
 * (platform, durum, arama, "Önizlemeler" anahtarı), tablo, toplam satırı ve
 * sayaç. Her düzey (şirket, workspace, hesap, kampanya, reklam seti,
 * reklam) AYNI tabloyla çiziliyor; sunucu satırları tek biçime çeviriyor.
 * Google Ads'in tutarlılığı buradan geliyor: kullanıcı her düzeyde aynı
 * yerde aynı şeyi buluyor.
 */

export type YmDuzey = 'sirket' | 'workspace' | 'hesap' | 'campaign' | 'ad_group' | 'ad';

export interface YmSatir {
  id: string;
  ad: string;
  alt: string | null;
  altTon?: 'tehlike' | 'uyari';
  /** Durum noktası: yayında (yeşil, yalnız durum için onaylı), durdu (gri), sorun (kırmızı). */
  durum: { tur: 'yayinda' | 'durdu' | 'hata'; ad: string } | null;
  karo: boolean;
  mecralar: Platform[];
  spendMicros: string;
  impressions: number;
  clicks: number;
  conversions: number;
  paraBirimi: string | null;
  /** Ada tıklayınca: kapsam geçişi, alt düzeye bağlantı ya da önizleme. */
  eylem:
    | { tur: 'org'; id: string }
    | { tur: 'client'; id: string }
    | { tur: 'link'; href: string }
    | { tur: 'onizle' }
    | null;
}

export interface YmSekme {
  anahtar: YmDuzey;
  ad: string;
  /** Yalnız aktif düzeyde biliniyor; ötekilerde sayı uydurulmuyor. */
  sayi: number | null;
  hedef:
    | { tur: 'aktif' }
    | { tur: 'link'; href: string }
    | { tur: 'org' }
    | { tur: 'client' }
    | { tur: 'kapali'; neden: string };
}

export interface YmMetrik {
  ad: string;
  deger: string;
  degisim: number | null;
  ters?: boolean;
}

const BIRIM: Record<YmDuzey, string> = {
  sirket: 'şirket',
  workspace: 'workspace',
  hesap: 'hesap',
  campaign: 'kampanya',
  ad_group: 'reklam seti',
  ad: 'reklam',
};
const SUTUN: Record<YmDuzey, string> = {
  sirket: 'Şirket',
  workspace: 'Workspace',
  hesap: 'Hesap',
  campaign: 'Kampanya',
  ad_group: 'Reklam seti',
  ad: 'Reklam',
};

type Siralama = 'harcama' | 'gosterim' | 'tik' | 'to' | 'donusum' | 'dbm';
const deger = (r: YmSatir, k: Siralama): number | null => {
  const h = Number(BigInt(r.spendMicros) / 1000n) / 1000;
  switch (k) {
    case 'harcama':
      return h;
    case 'gosterim':
      return r.impressions;
    case 'tik':
      return r.clicks;
    case 'to':
      return r.impressions > 0 ? r.clicks / r.impressions : null;
    case 'donusum':
      return r.conversions;
    case 'dbm':
      return r.conversions > 0 ? h / r.conversions : null;
  }
};

function Degisim({ d, ters }: { d: number | null; ters?: boolean }) {
  if (d === null || !Number.isFinite(d)) return null;
  const sabit = Math.abs(d) < 0.05;
  const iyi = sabit ? null : d > 0 !== Boolean(ters);
  return (
    <div className={`${s.metrikFark} ${iyi === null ? '' : iyi ? s.iyi : s.kotu}`}>
      {sabit ? '→' : d > 0 ? '↑' : '↓'} %{Math.abs(d).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} önceki döneme göre
    </div>
  );
}

export function ReklamYoneticisiTablosu({
  duzey,
  sekmeler,
  metrikler,
  satirlar,
  platformSecenekleri,
  kesmeNotu,
  aralik,
  galeriHref,
}: {
  duzey: YmDuzey;
  sekmeler: YmSekme[];
  metrikler: YmMetrik[] | null;
  satirlar: YmSatir[];
  platformSecenekleri: Array<{ ad: string; href: string; secili: boolean }>;
  /** Sunucu sınıra ulaştıysa: "Harcamaya göre ilk 25 satır". */
  kesmeNotu: string | null;
  aralik: { from: string; to: string };
  galeriHref: string;
}) {
  const router = useRouter();
  const yol = usePathname() ?? '/ads-explorer';
  /*
   * YÜKLEME KATMANI İKİ AŞAMALI: kapsam isteği sürerken `gecilen`, sonra
   * sayfa yenilenirken `isPending`. Katman ikisi de bitince kalkıyor.
   * Eskiden yalnız `gecilen` vardı ve hiç sıfırlanmıyordu: her düzey
   * ayrı bileşenken sayfa bileşeni değiştirip katmanı da götürüyordu; tek
   * tabloya geçince katman geçiş bittikten sonra ekranda KALDI (canlı
   * denetim, 2026-10-09).
   */
  const [isPending, startTransition] = useTransition();
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [yenileniyor, setYenileniyor] = useState<string | null>(null);
  useEffect(() => {
    if (!isPending) setYenileniyor(null);
  }, [isPending]);
  // Yeni kapsamın satırları geldiyse geçiş bitmiştir: geçiş durumu hiç
  // değişmeden (anında yenileme) tamamlansa bile katman kalmasın.
  useEffect(() => {
    setYenileniyor(null);
  }, [satirlar]);
  const [hata, setHata] = useState<string | null>(null);

  const [ara, setAra] = useState('');
  const [durumSuz, setDurumSuz] = useState<'hepsi' | 'yayinda' | 'degil'>('hepsi');
  const [sira, setSira] = useState<{ k: Siralama; artan: boolean }>({ k: 'harcama', artan: false });
  const [menu, setMenu] = useState<'platform' | 'durum' | null>(null);
  const aracRef = useRef<HTMLDivElement>(null);

  // Menü dışarı tıklayınca ve Esc ile kapanıyor.
  useEffect(() => {
    if (!menu) return;
    const tik = (e: MouseEvent) => {
      if (!aracRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const tus = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', tik);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', tik);
      document.removeEventListener('keydown', tus);
    };
  }, [menu]);

  /*
   * ÖNİZLEMELER: anahtar KAPALIYKEN tek önizleme açık (kullanıcının eski
   * isteği: "başkasını açınca öncekisi kapansın"); AÇIKKEN hepsi açık ve
   * tek tek kapatılabiliyor. Karar `onizlemeAcikMi`de, sınanıyor.
   * Açılmış önizleme DOM'dan çıkmıyor; ilk açılışta kapalı doğup iki kare
   * sonra açılıyor (açık doğan öğe geçiş oynatmaz).
   */
  const [hepsiAcik, setHepsiAcik] = useState(false);
  const [tekAcik, setTekAcik] = useState<string | null>(null);
  const [kapatilan, setKapatilan] = useState<ReadonlySet<string>>(new Set());
  const [acilmis, setAcilmis] = useState<ReadonlySet<string>>(new Set());
  const acikMi = (id: string) => onizlemeAcikMi({ hepsiAcik, tekAcik, kapatilan }, id);
  const reklamda = duzey === 'ad';

  function kurVeAc(idler: string[], ac: () => void) {
    const yeni = idler.filter((id) => !acilmis.has(id));
    if (yeni.length === 0) return ac();
    setAcilmis((m) => new Set([...m, ...yeni]));
    requestAnimationFrame(() => requestAnimationFrame(ac));
  }
  function satiriDegistir(id: string) {
    if (hepsiAcik) {
      setKapatilan((k) => {
        const y = new Set(k);
        if (y.has(id)) y.delete(id);
        else y.add(id);
        return y;
      });
      return;
    }
    if (tekAcik === id) return setTekAcik(null);
    kurVeAc([id], () => setTekAcik(id));
  }
  function hepsiniDegistir() {
    if (!reklamda) return;
    setKapatilan(new Set());
    setTekAcik(null);
    if (hepsiAcik) return setHepsiAcik(false);
    kurVeAc(
      gorunen.map((r) => r.id),
      () => setHepsiAcik(true),
    );
  }

  async function kapsamaGec(tur: 'org' | 'client', id: string | null, ad: string) {
    setGecilen(ad);
    setHata(null);
    try {
      await apiFetch(tur === 'org' ? '/auth/switch-org' : '/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify(tur === 'org' ? { organizationId: id } : { clientId: id }),
      });
      // Adres temizleniyor: URL süzgeci oturumu ezer, gövde eski kapsamı gösterirdi.
      setYenileniyor(ad);
      setGecilen(null);
      startTransition(() => {
        router.replace(yol);
        router.refresh();
      });
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Geçilemedi.');
      setGecilen(null);
    }
  }

  const durumVar = satirlar.some((r) => r.durum !== null);
  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr-TR');
    const suz = satirlar.filter(
      (r) =>
        (!q || r.ad.toLocaleLowerCase('tr-TR').includes(q)) &&
        (durumSuz === 'hepsi' ||
          (durumSuz === 'yayinda' ? r.durum?.tur === 'yayinda' : r.durum !== null && r.durum.tur !== 'yayinda')),
    );
    // DEĞERİ OLMAYAN SATIR (ör. dönüşümsüz DBM) her yönde SONDA: "en ucuz" sanılmasın.
    return [...suz].sort((a, b) => {
      const x = deger(a, sira.k);
      const y = deger(b, sira.k);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return sira.artan ? x - y : y - x;
    });
  }, [satirlar, ara, durumSuz, sira]);

  const birimler = new Set(gorunen.map((r) => r.paraBirimi));
  const tekBirim = birimler.size === 1 ? [...birimler][0]! : null;
  const T = gorunen.reduce(
    (a, r) => ({
      h: a.h + BigInt(r.spendMicros),
      g: a.g + r.impressions,
      t: a.t + r.clicks,
      d: a.d + r.conversions,
    }),
    { h: 0n, g: 0, t: 0, d: 0 },
  );
  const para = (m: string, b: string | null) => (b ? formatMoney(m, b) : 'karışık');
  const dbm = (h: bigint, d: number, b: string | null) =>
    d > 0 && b ? formatMoney(((h * 100n) / BigInt(Math.round(d * 100))).toString(), b) : '—';

  const Baslik = ({ k, ad }: { k: Siralama; ad: string }) => (
    <th aria-sort={sira.k === k ? (sira.artan ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => setSira((x) => ({ k, artan: x.k === k ? !x.artan : k === 'dbm' }))}
        style={{ fontWeight: 700 }}
      >
        {ad}
        {sira.k === k && <span className={s.siraOk}>{sira.artan ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const secPlatform = platformSecenekleri.find((p) => p.secili)?.ad ?? 'Tümü';
  const durumAdi = { hepsi: 'Tümü', yayinda: 'Yayında', degil: 'Yayında değil' }[durumSuz];

  return (
    <section className={`${s.kart} ${s.gir}`}>
      {(gecilen ?? yenileniyor) && (
        <TamEkranYukleniyor mesaj={`${gecilen ?? yenileniyor} görünümüne geçiliyor…`} />
      )}

      <div className={s.duzeyler} role="tablist" aria-label="Düzey">
        {sekmeler.map((t) => {
          const secili = t.hedef.tur === 'aktif';
          const icerik = (
            <>
              {t.ad}
              {t.sayi !== null && <span className={`${s.duzeySayi} ${s.num}`}>{t.sayi}</span>}
            </>
          );
          if (t.hedef.tur === 'link') {
            return (
              <Link key={t.anahtar} role="tab" aria-selected={false} className={s.duzey} href={t.hedef.href}>
                {icerik}
              </Link>
            );
          }
          const kapali = t.hedef.tur === 'kapali';
          return (
            <button
              key={t.anahtar}
              type="button"
              role="tab"
              aria-selected={secili}
              aria-disabled={kapali || undefined}
              title={kapali && t.hedef.tur === 'kapali' ? t.hedef.neden : undefined}
              className={s.duzey}
              onClick={() => {
                if (t.hedef.tur === 'org') void kapsamaGec('org', null, 'Tüm şirketler');
                else if (t.hedef.tur === 'client') void kapsamaGec('client', null, 'Tüm workspace’ler');
              }}
            >
              {icerik}
            </button>
          );
        })}
      </div>

      {metrikler && (
        <div className={s.metrikler}>
          {metrikler.map((m, i) => (
            <div key={m.ad} className={`${s.metrik} ${i === 0 ? s.metrikVurgu : ''}`}>
              <div className={s.metrikAd}>{m.ad}</div>
              <div className={`${s.metrikDeger} ${s.num}`}>{m.deger}</div>
              <Degisim d={m.degisim} ters={m.ters} />
            </div>
          ))}
        </div>
      )}

      <div className={s.arac} ref={aracRef}>
        <span className={s.cipMenu}>
          <button
            type="button"
            className={s.cip}
            aria-expanded={menu === 'platform'}
            onClick={() => setMenu((m) => (m === 'platform' ? null : 'platform'))}
          >
            Platform: <b>{secPlatform}</b> ▾
          </button>
          <span className={`${s.menu} ${menu === 'platform' ? s.menuAcik : ''}`} inert={menu !== 'platform'}>
            {platformSecenekleri.map((p) => (
              <Link key={p.ad} href={p.href} aria-current={p.secili ? 'true' : undefined} onClick={() => setMenu(null)}>
                {p.ad}
              </Link>
            ))}
          </span>
        </span>
        {durumVar && (
          <span className={s.cipMenu}>
            <button
              type="button"
              className={s.cip}
              aria-expanded={menu === 'durum'}
              onClick={() => setMenu((m) => (m === 'durum' ? null : 'durum'))}
            >
              Durum: <b>{durumAdi}</b> ▾
            </button>
            <span className={`${s.menu} ${menu === 'durum' ? s.menuAcik : ''}`} inert={menu !== 'durum'}>
              {(['hepsi', 'yayinda', 'degil'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-current={durumSuz === d ? 'true' : undefined}
                  onClick={() => {
                    setDurumSuz(d);
                    setMenu(null);
                  }}
                >
                  {{ hepsi: 'Tümü', yayinda: 'Yayında', degil: 'Yayında değil' }[d]}
                </button>
              ))}
            </span>
          </span>
        )}
        <label className={s.ara}>
          <span aria-hidden>⌕</span>
          <input
            type="search"
            value={ara}
            onChange={(e) => setAra(e.target.value)}
            placeholder="Ada göre ara"
            aria-label={`${SUTUN[duzey]} adına göre ara`}
          />
        </label>
        <span className={s.bosluk} />
        <button
          type="button"
          role="switch"
          className={s.anahtar}
          aria-checked={reklamda && hepsiAcik}
          aria-disabled={!reklamda || undefined}
          title={reklamda ? 'Bütün önizlemeleri aç ya da kapat' : 'Reklam düzeyinde açılır'}
          onClick={hepsiniDegistir}
        >
          <span className={s.anahtarRay} aria-hidden />
          Önizlemeler
        </button>
      </div>

      {hata && (
        <p role="alert" className={s.hataMetin}>
          {hata}
        </p>
      )}

      {satirlar.length === 0 ? (
        <p className={s.bosMetin}>Bu dönemde bu düzeyde veri yok.</p>
      ) : (
        <div className={s.tabloSar}>
          <table className={`${s.tablo} ${s.ymTablo}`}>
            <thead>
              <tr>
                <th>{SUTUN[duzey]}</th>
                <th>Mecra</th>
                <Baslik k="harcama" ad="Harcama" />
                <Baslik k="gosterim" ad="Gösterim" />
                <Baslik k="tik" ad="Tıklama" />
                <Baslik k="to" ad="Tıklama oranı" />
                <Baslik k="donusum" ad="Dönüşüm" />
                <Baslik k="dbm" ad="Dönüşüm başı maliyet" />
              </tr>
            </thead>
            <tbody key={`${duzey}-${satirlar.length}`} className={s.yenilenen}>
              {gorunen.length === 0 && (
                <tr>
                  <td colSpan={8} className={s.bosMetin} style={{ textAlign: 'center' }}>
                    Süzgece uyan satır yok.
                  </td>
                </tr>
              )}
              {gorunen.map((r) => {
                const acik = reklamda && acikMi(r.id);
                const adOgesi =
                  r.eylem?.tur === 'link' ? (
                    <Link href={r.eylem.href} title={r.ad}>
                      {r.ad}
                    </Link>
                  ) : r.eylem ? (
                    <button
                      type="button"
                      title={r.ad}
                      aria-expanded={r.eylem.tur === 'onizle' ? acik : undefined}
                      onClick={() => {
                        const e = r.eylem!;
                        if (e.tur === 'onizle') satiriDegistir(r.id);
                        else if (e.tur === 'org' || e.tur === 'client') void kapsamaGec(e.tur, e.id, r.ad);
                      }}
                    >
                      {r.ad}
                    </button>
                  ) : (
                    <span title={r.ad}>{r.ad}</span>
                  );
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <div className={s.adHucre}>
                          {reklamda && (
                            <button
                              type="button"
                              className={s.acKapa}
                              aria-expanded={acik}
                              aria-label={acik ? 'Önizlemeyi kapat' : 'Önizlemeyi aç'}
                              onClick={() => satiriDegistir(r.id)}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                                <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            </button>
                          )}
                          {r.durum && (
                            <span
                              className={`${s.nokta} ${r.durum.tur === 'durdu' ? s.noktaDurdu : r.durum.tur === 'hata' ? s.noktaHata : ''}`}
                              title={r.durum.ad}
                            />
                          )}
                          {r.karo && <span className={s.karo}>{basHarfler(r.ad)}</span>}
                          <div className={s.adMetin}>
                            {adOgesi}
                            {r.alt && (
                              <small data-ton={r.altTon} title={r.alt}>
                                {r.alt}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={s.mecra}>
                          {r.mecralar.map((m) => (
                            <span key={m}>{PLATFORM_KISA_ADLARI[m]}</span>
                          ))}
                        </span>
                      </td>
                      <td className={s.num}>{para(r.spendMicros, r.paraBirimi)}</td>
                      <td className={s.num}>{formatNumber(r.impressions)}</td>
                      <td className={s.num}>{formatNumber(r.clicks)}</td>
                      <td className={s.num}>{r.impressions > 0 ? formatPercent((r.clicks / r.impressions) * 100) : '—'}</td>
                      <td className={s.num}>{formatNumber(r.conversions)}</td>
                      <td className={s.num}>{dbm(BigInt(r.spendMicros), r.conversions, r.paraBirimi)}</td>
                    </tr>
                    {reklamda && (acilmis.has(r.id) || acik) && (
                      <tr className={`${s.onizlemeSatir} ${acik ? s.onizlemeAcik : ''}`}>
                        <td colSpan={8}>
                          <div className={`${s.kap} ${acik ? s.kapAcik : ''}`}>
                            <div inert={!acik}>
                              <div className={s.onz}>
                                <ReklamOnizleme
                                  adId={r.id}
                                  from={aralik.from}
                                  to={aralik.to}
                                  currency={r.paraBirimi ?? 'TRY'}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            {gorunen.length > 0 && (
              <tfoot>
                <tr className={s.toplam}>
                  <td>Toplam: mevcut görünüm</td>
                  <td />
                  <td className={s.num}>{para(T.h.toString(), tekBirim)}</td>
                  <td className={s.num}>{formatNumber(T.g)}</td>
                  <td className={s.num}>{formatNumber(T.t)}</td>
                  <td className={s.num}>{T.g > 0 ? formatPercent((T.t / T.g) * 100) : '—'}</td>
                  <td className={s.num}>{formatNumber(T.d)}</td>
                  <td className={s.num}>{dbm(T.h, T.d, tekBirim)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div className={s.altBilgi}>
        <Link href={galeriHref}>Reklam Galerisi (arama, sorunlu reklamlar) →</Link>
        <span className={s.num}>
          {gorunen.length < satirlar.length
            ? `${gorunen.length} / ${satirlar.length} ${BIRIM[duzey]} (süzgeçli)`
            : `1 - ${satirlar.length} / ${satirlar.length} ${BIRIM[duzey]}`}
          {kesmeNotu ? ` · ${kesmeNotu}` : ''}
        </span>
      </div>
    </section>
  );
}
