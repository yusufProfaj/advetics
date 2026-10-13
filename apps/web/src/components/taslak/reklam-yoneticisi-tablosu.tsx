'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import type { Platform } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI, TUM_SIRKETLER } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { ReklamOnizleme } from '@/components/reklam-onizleme';
import { onizlemeAcikMi } from '@/lib/onizleme-durumu';
import { degisimHali } from '@/lib/degisim';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { SuzgecMenusu } from '@/components/suzgec-menusu';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { KART_BAGLANTISI } from '@/components/ui/kart';
import { MetrikKutulari, type MetrikKutusu } from '@/components/ui/metrik-kutulari';
import { DurumNoktasi } from '@/components/ui/rozet';
import { SayfaIcDuzen, SayfaIcMenu, type IcMenuOgesi } from '@/components/ui/sayfa-ic-menu';
import { basHarfler } from './genel-bakis-parcalari';
import { VarlikEylemPenceresi } from './varlik-eylem-penceresi';
import type { VarlikEylemHedefi } from '@/lib/varlik-eylemi';

/*
 * ═══ REKLAM YÖNETİCİSİ — ONAYLANAN TASLAĞIN TEK TABLOSU ═══
 *
 * Düzeyler (şirket, workspace, hesap, kampanya, reklam seti, reklam) SAYFA
 * İÇİ YAN MENÜDE, sayılarıyla (kullanıcı kararı 2026-10-14, onaylı taslak
 * `docs/marka/sayfa-taslaklari.html#yonetici`): üstteki düzey hapları
 * "kontrolü karmaşık" yapıyordu. Sağda kırıntı hapları, metrik kutuları,
 * şeritler ve TEK kart: süzgeç çipleri (platform, durum, arama,
 * "Önizlemeler" anahtarı), tablo, toplam satırı ve sayaç. Her düzey AYNI
 * tabloyla çiziliyor; sunucu satırları tek biçime çeviriyor. Google Ads'in
 * tutarlılığı buradan geliyor: kullanıcı her düzeyde aynı yerde aynı şeyi
 * buluyor.
 *
 * TABLO ORTAK `Tablo` BİLEŞENİYLE ÇİZİLMİYOR (BILESENLER "Grup 1 sapması"):
 * burada sütun başlığı sıralama düğmesi ve reklam satırının altında açılan
 * bir önizleme satırı var; ortak bileşen ikisini de taşımıyor. Hücre, başlık
 * ve toplam sınıfları ortak bileşenle AYNI ölçüde yazıldı.
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
  /** Satır içi durdur/başlat; `null` = düğme yok (platform yazamıyor ya da durum belirsiz). */
  eylemHedefi: VarlikEylemHedefi | null;
  /** Kampanya satırının Reklam Galerisi bağlantısı (o kampanyaya süzülmüş). ⋯ menüsünde. */
  galeriHref?: string;
  /**
   * Paket F1 "Sitede" sütunu: Analytics'in bu kampanyaya bağladığı anahtar
   * etkinlik ve takip etiketi. `null` = bu satır eşlenmedi (0 değil, "-").
   */
  sitede?: { anahtarEtkinlik: number; etiket: string | null } | null;
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
/** Ada tıklayınca inilen düzeyin adı (⋯ menüsündeki "… aç"). */
const ALT_DUZEY: Partial<Record<YmDuzey, string>> = {
  hesap: 'Kampanyaları aç',
  campaign: 'Reklam setlerini aç',
  ad_group: 'Reklamları aç',
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

/*
 * Ortak `Tablo` bileşeniyle aynı ölçüler: başlık 12 piksel ve BÜYÜK HARF
 * YOK, sayı sağa yaslı ve hizalı rakam, satır hover'ı zemin tonu.
 */
const TH = 'whitespace-nowrap border-b border-line px-4 py-2.5 text-left text-12 font-semibold normal-case tracking-normal text-ink-muted';
const TD = 'border-b border-line px-4 py-3 align-middle';
const SAYI = 'text-right whitespace-nowrap font-baslik text-13 font-semibold tabular-nums';

/**
 * Metrik kutusunun fark satırı. İyi/kötü kararı `degisimHali`nde: Genel
 * Bakış'la tek kural. İYİ YÖN GRİ, KÖTÜ YÖN KIRMIZI (taslak `.metrik
 * small.kotu`): yeşil yalnız durum noktasında (kılavuz).
 */
function metrikKutusu(m: YmMetrik, i: number): MetrikKutusu {
  const h = degisimHali(m.degisim, m.ters);
  return {
    anahtar: m.ad,
    ad: m.ad,
    deger: m.deger,
    seri: i === 0 ? 1 : i === 1 ? 2 : undefined,
    fark: h
      ? { metin: `${h.metin} önceki döneme göre`, hal: h.iyi === false ? 'kotu' : 'notr', etiket: h.etiket }
      : undefined,
  };
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
  yazabilir,
  site,
  kirinti,
  seritler,
  yerine,
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
  /** `budget.write`: satır içi durdur/başlat (İyileştir'in Uygula'sıyla aynı yetki). */
  yazabilir: boolean;
  /**
   * Paket F1: GA4 bağlıysa "Sitede" sütunu açılır. `hata` = Analytics
   * okunamadı (platformun cümlesi); sütun yine açık, satırlar "-" ve
   * neden tablonun altında yazar (boş ile "alınamadı" ayrı).
   */
  site?: { hata: string | null; not: string | null } | null;
  /** İçerik sütununun başı: kırıntı hapları (`HiyerarsiYolu`). */
  kirinti?: ReactNode;
  /** Metrik kutularının altındaki şeritler (izlenmeyen hesap, veri alınamadı). */
  seritler?: ReactNode;
  /**
   * Tablo çizilemiyorsa yerine çizilen hâl (`BosDurum` nedeniyle ya da
   * `HataDurumu` platformun cümlesiyle). Yan menü yine durur: kullanıcı
   * başka bir düzeye geçebilmeli.
   */
  yerine?: ReactNode;
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
  /*
   * ⋯ MENÜSÜNÜN ÖĞELERİ: yalnız ÇALIŞAN eylemler. Taslaktaki "Kopyala",
   * "Arşivle", "Platformda aç" panelde yazılmadı; hiçbir şey yapmayan bir
   * menü öğesi çalışmayan bir özelliği vaat eder (BILESENLER § 4 "Ara ve
   * Yardım" kararıyla aynı gerekçe).
   */
  const menuVar = (r: YmSatir) =>
    (r.eylem?.tur === 'link' && ALT_DUZEY[duzey] !== undefined) || Boolean(r.galeriHref) || r.eylem?.tur === 'onizle';
  /*
   * EYLEM SÜTUNU yalnız yapılacak bir şey varsa: müşteri hesabında ya da
   * şirket düzeyinde boş bir sütun "burada bir şey yapılabilirdi" izlenimi
   * bırakırdı. Durdur/Başlat `budget.write` ister; ⋯ gezinmedir, herkese açık.
   */
  const durdurVar = yazabilir && satirlar.some((r) => r.eylemHedefi !== null);
  const eylemSutunu = durdurVar || satirlar.some(menuVar);
  // "Sitede" sütunu YALNIZ GA4 bağlıysa (MIMARI § 3.4): bağlı değilse sütun yok, boş sütun değil.
  const siteSutunu = site !== undefined && site !== null;
  const sutunSayisi = 8 + (eylemSutunu ? 1 : 0) + (siteSutunu ? 1 : 0);
  const [eylemHedefi, setEylemHedefi] = useState<VarlikEylemHedefi | null>(null);
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
    <th scope="col" className={`${TH} text-right`} aria-sort={sira.k === k ? (sira.artan ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        onClick={() => setSira((x) => ({ k, artan: x.k === k ? !x.artan : k === 'dbm' }))}
        className={`inline-flex items-center gap-1 font-semibold hover:text-ink ${sira.k === k ? 'text-ink' : ''}`}
      >
        {ad}
        {sira.k === k && <span aria-hidden>{sira.artan ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const secPlatform = platformSecenekleri.find((p) => p.secili)?.ad ?? 'Tümü';
  const durumAdi = { hepsi: 'Tümü', yayinda: 'Yayında', degil: 'Yayında değil' }[durumSuz];

  /*
   * DÜZEY YAN MENÜSÜ. Üst düzeyler kapsam değiştiriyor (oturumda), alt
   * düzeyler adresteki seviyeyi. Gidilemeyen düzey soluk ve NEDENİNİ
   * `title`da söylüyor (`kapaliNedeni`).
   */
  const menuOgeleri: IcMenuOgesi[] = sekmeler.map((t) => ({
    deger: t.anahtar,
    etiket: t.ad,
    sayi: t.sayi ?? undefined,
    href: t.hedef.tur === 'link' ? t.hedef.href : undefined,
    kapaliNedeni: t.hedef.tur === 'kapali' ? t.hedef.neden : undefined,
  }));
  function duzeySec(anahtar: string) {
    const t = sekmeler.find((x) => x.anahtar === anahtar);
    // AJANS KAPSAMI ÖZEL DEĞERLE (`TUM_SIRKETLER`), `null` ile DEĞİL:
    // `null` hata vermeden kabul edilip hiçbir şey değiştirmiyordu ve
    // sekme tıklanınca sessizce olduğu yerde kalıyordu (canlı denetim).
    if (t?.hedef.tur === 'org') void kapsamaGec('org', TUM_SIRKETLER, 'Tüm şirketler');
    else if (t?.hedef.tur === 'client') void kapsamaGec('client', null, 'Tüm workspace’ler');
  }

  return (
    <SayfaIcDuzen
      menu={<SayfaIcMenu etiket="Reklam düzeyi" ogeler={menuOgeleri} secili={duzey} onSec={duzeySec} />}
    >
      {(gecilen ?? yenileniyor) && (
        <TamEkranYukleniyor mesaj={`${gecilen ?? yenileniyor} görünümüne geçiliyor…`} />
      )}

      {kirinti}

      {metrikler && <MetrikKutulari kutular={metrikler.map(metrikKutusu)} />}

      {seritler}

      {hata && (
        <Serit ton="hata" baslik="Görünüm değiştirilemedi">
          {hata}
        </Serit>
      )}

      {yerine ?? (
        <section className="min-w-0 rounded-kart border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <SuzgecMenusu
              etiket="Platform"
              deger={secPlatform}
              secili={secPlatform !== 'Tümü'}
              kaldirHref={platformSecenekleri[0]?.href}
              secenekler={platformSecenekleri.map((p) => ({ href: p.href, ad: p.ad, aktif: p.secili }))}
            />
            {durumVar && (
              <SuzgecMenusu
                etiket="Durum"
                deger={durumAdi}
                secili={durumSuz !== 'hepsi'}
                onKaldir={() => setDurumSuz('hepsi')}
                secenekler={(['hepsi', 'yayinda', 'degil'] as const).map((d) => ({
                  ad: { hepsi: 'Tümü', yayinda: 'Yayında', degil: 'Yayında değil' }[d],
                  aktif: durumSuz === d,
                  onSec: () => setDurumSuz(d),
                }))}
              />
            )}
            <label className="flex h-8 min-w-0 flex-[0_1_240px] items-center gap-2 rounded-full border border-line-strong bg-surface px-3">
              <span aria-hidden className="text-ink-soluk">
                ⌕
              </span>
              <input
                type="search"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder="Ada göre ara"
                aria-label={`${SUTUN[duzey]} adına göre ara`}
                className="min-w-0 flex-1 border-0 bg-transparent text-13 text-ink outline-none placeholder:text-ink-soluk"
              />
            </label>
            <span className="flex-1" />
            <button
              type="button"
              role="switch"
              aria-checked={reklamda && hepsiAcik}
              aria-disabled={!reklamda || undefined}
              title={reklamda ? 'Bütün önizlemeleri aç ya da kapat' : 'Reklam düzeyinde açılır'}
              onClick={hepsiniDegistir}
              className="inline-flex items-center gap-2.5 text-13 font-semibold text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
            >
              <span
                aria-hidden
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface after:transition-transform motion-reduce:after:transition-none ${
                  reklamda && hepsiAcik ? 'bg-ink after:translate-x-4' : 'bg-line-strong'
                }`}
              />
              Önizlemeler
            </button>
          </div>

          {satirlar.length === 0 ? (
            <p className="m-0 px-4 py-8 text-center text-13 text-ink-muted">Bu dönemde bu düzeyde veri yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13.5px]" aria-label={`${SUTUN[duzey]} tablosu`}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      {SUTUN[duzey]}
                    </th>
                    <th scope="col" className={TH}>
                      Mecra
                    </th>
                    <Baslik k="harcama" ad="Harcama" />
                    <Baslik k="gosterim" ad="Gösterim" />
                    <Baslik k="tik" ad="Tıklama" />
                    <Baslik k="to" ad="Tıklama oranı" />
                    <Baslik k="donusum" ad="Dönüşüm" />
                    <Baslik k="dbm" ad="Dönüşüm başı maliyet" />
                    {siteSutunu && (
                      <th scope="col" className={`${TH} text-right`} title="Analytics'in bu kampanyaya bağladığı anahtar etkinlik">
                        Sitede
                      </th>
                    )}
                    {eylemSutunu && (
                      <th scope="col" className={`${TH} text-right`}>
                        Eylem
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody key={`${duzey}-${satirlar.length}`}>
                  {gorunen.length === 0 && (
                    <tr>
                      <td colSpan={sutunSayisi} className={`${TD} py-8 text-center text-13 text-ink-muted`}>
                        Süzgece uyan satır yok.
                      </td>
                    </tr>
                  )}
                  {gorunen.map((r) => {
                    const acik = reklamda && acikMi(r.id);
                    const adSinifi =
                      'max-w-[22rem] truncate text-left font-semibold text-ink no-underline hover:text-brand-strong hover:underline';
                    const adOgesi =
                      r.eylem?.tur === 'link' ? (
                        <Link href={r.eylem.href} title={r.ad} className={`block ${adSinifi}`}>
                          {r.ad}
                        </Link>
                      ) : r.eylem ? (
                        <button
                          type="button"
                          title={r.ad}
                          className={`block ${adSinifi}`}
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
                        <span title={r.ad} className="block max-w-[22rem] truncate font-semibold text-ink">
                          {r.ad}
                        </span>
                      );
                    return (
                      <Fragment key={r.id}>
                        <tr className="hover:bg-surface-muted">
                          <td className={TD}>
                            <div className="flex min-w-[220px] items-center gap-2.5">
                              {reklamda && (
                                <button
                                  type="button"
                                  aria-expanded={acik}
                                  aria-label={acik ? 'Önizlemeyi kapat' : 'Önizlemeyi aç'}
                                  onClick={() => satiriDegistir(r.id)}
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 12 12"
                                    aria-hidden
                                    className={`transition-transform motion-reduce:transition-none ${acik ? 'rotate-90' : ''}`}
                                  >
                                    <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                  </svg>
                                </button>
                              )}
                              {r.durum && (
                                <DurumNoktasi
                                  hal={r.durum.tur === 'yayinda' ? 'ok' : r.durum.tur === 'hata' ? 'hata' : 'dur'}
                                  etiket={r.durum.ad}
                                />
                              )}
                              {r.karo && (
                                <span
                                  aria-hidden
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-alan bg-ink font-baslik text-12 font-extrabold text-surface"
                                >
                                  {basHarfler(r.ad)}
                                </span>
                              )}
                              <div className="min-w-0">
                                {adOgesi}
                                {r.alt && (
                                  <small
                                    data-ton={r.altTon}
                                    title={r.alt}
                                    className={`block max-w-[22rem] truncate text-12 ${r.altTon ? 'text-danger-strong' : 'text-ink-muted'}`}
                                  >
                                    {r.alt}
                                  </small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} whitespace-nowrap text-13 text-ink-muted`}>
                            {r.mecralar.map((m) => PLATFORM_KISA_ADLARI[m]).join(' · ')}
                          </td>
                          <td className={`${TD} ${SAYI}`}>{para(r.spendMicros, r.paraBirimi)}</td>
                          <td className={`${TD} ${SAYI}`}>{formatNumber(r.impressions)}</td>
                          <td className={`${TD} ${SAYI}`}>{formatNumber(r.clicks)}</td>
                          <td className={`${TD} ${SAYI}`}>
                            {r.impressions > 0 ? formatPercent((r.clicks / r.impressions) * 100) : '—'}
                          </td>
                          <td className={`${TD} ${SAYI}`}>{formatNumber(r.conversions)}</td>
                          <td className={`${TD} ${SAYI}`}>{dbm(BigInt(r.spendMicros), r.conversions, r.paraBirimi)}</td>
                          {siteSutunu && (
                            <td className={`${TD} ${SAYI}`}>
                              {r.sitede ? formatNumber(r.sitede.anahtarEtkinlik) : '—'}
                              {r.sitede?.etiket && (
                                <small className="block text-11 font-normal text-ink-muted">{r.sitede.etiket}</small>
                              )}
                            </td>
                          )}
                          {eylemSutunu && (
                            <td className={`${TD} whitespace-nowrap text-right`}>
                              <span className="inline-flex items-center gap-1">
                                {yazabilir && r.eylemHedefi && (
                                  <Dugme
                                    ton="ikincil"
                                    boyut="kucuk"
                                    onClick={() => setEylemHedefi(r.eylemHedefi)}
                                    aria-label={`${r.ad}: ${r.eylemHedefi.yayinda ? 'durdur' : 'başlat'}`}
                                  >
                                    {r.eylemHedefi.yayinda ? 'Durdur' : 'Başlat'}
                                  </Dugme>
                                )}
                                {menuVar(r) && (
                                  <AcilirMenu
                                    tasma="portal"
                                    etiket={`${r.ad}: diğer eylemler`}
                                    hizala="sag"
                                    genislik="w-56"
                                    tetik={({ acik: menuAcik, ...o }) => (
                                      <button type="button" {...o} aria-label="Diğer eylemler" className={IKON_TETIK}>
                                        <span aria-hidden className="text-15 leading-none">
                                          ⋯
                                        </span>
                                      </button>
                                    )}
                                  >
                                    {r.eylem?.tur === 'link' && ALT_DUZEY[duzey] && (
                                      <MenuOgesi href={r.eylem.href}>{ALT_DUZEY[duzey]}</MenuOgesi>
                                    )}
                                    {r.eylem?.tur === 'onizle' && (
                                      <MenuOgesi onClick={() => satiriDegistir(r.id)}>
                                        {acik ? 'Önizlemeyi kapat' : 'Önizlemeyi aç'}
                                      </MenuOgesi>
                                    )}
                                    {r.galeriHref && <MenuOgesi href={r.galeriHref}>Reklam Galerisi'nde gör</MenuOgesi>}
                                  </AcilirMenu>
                                )}
                              </span>
                            </td>
                          )}
                        </tr>
                        {reklamda && (acilmis.has(r.id) || acik) && (
                          <tr>
                            <td colSpan={sutunSayisi} className={`p-0 ${acik ? 'border-b border-line' : ''}`}>
                              <div
                                className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
                                  acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                                }`}
                              >
                                <div className="min-h-0 overflow-hidden">
                                  <div inert={!acik}>
                                    <div className="bg-surface-muted px-4 py-4">
                                      <ReklamOnizleme
                                        adId={r.id}
                                        from={aralik.from}
                                        to={aralik.to}
                                        currency={r.paraBirimi ?? 'TRY'}
                                      />
                                    </div>
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
                    <tr className="bg-surface-muted font-bold">
                      <td className={TD}>Toplam: mevcut görünüm</td>
                      <td className={TD} />
                      <td className={`${TD} ${SAYI}`}>{para(T.h.toString(), tekBirim)}</td>
                      <td className={`${TD} ${SAYI}`}>{formatNumber(T.g)}</td>
                      <td className={`${TD} ${SAYI}`}>{formatNumber(T.t)}</td>
                      <td className={`${TD} ${SAYI}`}>{T.g > 0 ? formatPercent((T.t / T.g) * 100) : '—'}</td>
                      <td className={`${TD} ${SAYI}`}>{formatNumber(T.d)}</td>
                      <td className={`${TD} ${SAYI}`}>{dbm(T.h, T.d, tekBirim)}</td>
                      {siteSutunu && (
                        <td className={`${TD} ${SAYI}`}>
                          {formatNumber(gorunen.reduce((a, r) => a + (r.sitede?.anahtarEtkinlik ?? 0), 0))}
                        </td>
                      )}
                      {eylemSutunu && <td className={TD} />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {siteSutunu && (site.hata || site.not) && (
            <p
              className={`m-0 px-4 pt-3 text-12 ${site.hata ? 'text-danger-strong' : 'text-ink-muted'}`}
              role={site.hata ? 'alert' : undefined}
            >
              {site.hata ? `Sitede sütunu alınamadı: ${site.hata}` : site.not}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-4 px-4 py-2.5 text-[12.5px] text-ink-muted">
            <Link href={galeriHref} className={`mr-auto ${KART_BAGLANTISI}`}>
              Reklam Galerisi (arama, sorunlu reklamlar) →
            </Link>
            <span className="tabular-nums">
              {gorunen.length < satirlar.length
                ? `${gorunen.length} / ${satirlar.length} ${BIRIM[duzey]} (süzgeçli)`
                : satirlar.length === 0
                  ? `0 / 0 ${BIRIM[duzey]}`
                  : `1 - ${satirlar.length} / ${satirlar.length} ${BIRIM[duzey]}`}
              {kesmeNotu ? ` · ${kesmeNotu}` : ''}
            </span>
          </div>
        </section>
      )}

      <VarlikEylemPenceresi hedef={eylemHedefi} onKapat={() => setEylemHedefi(null)} />
    </SayfaIcDuzen>
  );
}
