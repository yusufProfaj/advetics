'use client';

import { Fragment, useState } from 'react';
import { KaydirmaIpucu } from '@/components/kaydirma-ipucu';
import { ReklamOnizleme } from '@/components/reklam-onizleme';
import Link from 'next/link';
import { platformKanali, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { DeltaRozeti } from '@/components/delta-rozeti';
import { PlatformLogo } from '@/components/platform-logo';
import { SIRALAMA_YONU, type Siralama } from '@/lib/kirilim-siralama';
import type { MetricsBreakdownRow, MetricLevel, Platform } from '@advetics/shared';
import type { PanelSeviyesi } from '@/lib/genel-bakis-seviyesi';
import {
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
  changePercent,
} from '@/lib/format';

/**
 * ═══ SEVİYE SEKMELERİ ODAĞI DA YÖNETİYOR ═══
 *
 * Hiyerarşi kampanya › reklam seti › reklam ve kullanıcı bir kampanyanın
 * İÇİNDEYKEN sekme değiştirebiliyor. Sekme yalnızca seviyeyi değiştirseydi
 * "Kampanya"ya basmak, kartlar tek kampanyayı gösterirken tablonun bütün
 * kampanyaları listelemesi demek olurdu — aynı ekranda iki farklı gerçek.
 *
 * Her sekme HANGİ ODAĞI DÜŞÜRECEĞİNİ kendisi söylüyor:
 *   · Kampanya   → ikisini de düşür (workspace geneline çık)
 *   · Reklam seti → kampanyayı koru, reklam setini düşür
 *   · Reklam      → ikisini de koru
 */
/*
 * REKLAM HESAPLARI SEKMESİ (2026-10-02): workspace › reklam hesapları ›
 * kampanya. `insights_daily` seviyesi değil, kampanya toplamları
 * (`genel-bakis-seviyesi.ts`) ve tablosu `HesapKirilimi`. Sekmeler İKİ
 * tabloda da AYNI listeden çiziliyor: iki ayrı sekme şeridi, birine eklenen
 * basamağın öbüründe eksik kalması demekti.
 *
 *   · Reklam Hesapları → hesabı ve altındaki odağı düşür, mecra süzgecini koru
 */
const LEVEL_TABS: Array<{
  key: PanelSeviyesi;
  label: string;
  dusen: Record<string, undefined>;
}> = [
  {
    key: 'hesap',
    label: 'Reklam Hesapları',
    dusen: { hesap: undefined, kampanya: undefined, reklamSeti: undefined },
  },
  { key: 'campaign', label: 'Kampanya', dusen: { kampanya: undefined, reklamSeti: undefined } },
  { key: 'ad_group', label: 'Reklam seti', dusen: { reklamSeti: undefined } },
  { key: 'ad', label: 'Reklam', dusen: {} },
];

/**
 * ═══ SATIRDAN BİR ALT BASAMAĞA İNMEK ═══
 *
 * `Record` BİLEREK: elle yazılmış bir koşul zinciri yeni bir seviye
 * eklendiğinde sessizce yanlış yere giderdi. `null` = daha alt basamak yok
 * (reklam en derin seviye) ve satır bağlantı OLMUYOR — tıklanabilir görünen
 * ama hiçbir şey yapmayan bir bağlantı, bozuk bir ekrandan ayırt edilemez.
 */
const ALT_BASAMAK: Record<MetricLevel, ((entityId: string) => Record<string, string>) | null> = {
  /*
   * HESAP SEVİYESİ BU TABLODA SEÇİLEMİYOR (sekmelerde yok) ama `MetricLevel`
   * onu taşıyor ve `Record` eksik bırakmaya izin vermiyor — doğrusu bu:
   * seviye bir gün sekmelere eklenirse derleme BURADA kırılacak ve satırın
   * nereye gideceği bilinçli olarak yazılacak.
   */
  account: null,
  campaign: (id) => ({ seviye: 'ad_group', kampanya: id }),
  ad_group: (id) => ({ seviye: 'ad', reklamSeti: id }),
  ad: null,
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-ok-soft text-ok-strong ring-ok/20',
  paused: 'bg-warn-soft text-warn-strong ring-warn/20',
  deleted: 'bg-surface-sunken text-ink-muted ring-ink-muted/20',
  pending_review: 'bg-info-soft text-info-strong ring-info/20',
  ended: 'bg-surface-sunken text-ink-muted ring-ink-muted/20',
  unknown: 'bg-surface-sunken text-ink-muted ring-ink-muted/20',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  deleted: 'Silindi',
  pending_review: 'İncelemede',
  ended: 'Bitti',
  unknown: 'Bilinmiyor',
};

/**
 * Kırılım tablosu.
 *
 * Seviye sekmeleri LİNK, buton değil: seçim URL'de duruyor, sunucuda render
 * ediliyor ve paylaşılabiliyor. İstemci state'i kullanmak üçünü kaybettirirdi.
 *
 * `parentName` gösterilmesi zorunlu: reklam adları ad set'ler arasında tekrar
 * ediyor (aynı creative birden fazla sette kullanılıyor) ve üst varlık olmadan
 * tabloda hangi satırın hangisi olduğu ayırt edilemiyor. Canlı veride üç ayrı
 * satır "Reklam B-1 · Kreatif 1" olarak görünüyordu.
 */
export function BreakdownTable({
  rows,
  level,
  tasinan,
  currency,
  siralama,
  limit,
  range,
}: {
  rows: MetricsBreakdownRow[];
  /** `account` bu tabloda yok: hesap basamağı `HesapKirilimi`. */
  level: Exclude<MetricLevel, 'account'>;
  tasinan: Record<string, string | undefined>;
  currency: string | null;
  /** Ekrandaki sıra — satır KÜMESİNİ değiştirmiyor, bkz. `kirilim-siralama.ts`. */
  siralama: Siralama;
  /** Sunucudan istenen satır sayısı — kesme ekranda YAZILABİLSİN diye. */
  limit: number;
  /**
   * Açılan reklamın önizlemesi bu aralıkta çekiliyor.
   *
   * `tasinan` içindeki `aralik`/`baslangic`/`bitis` ÖN AYAR KODLARI, çözülmüş
   * tarihler değil; önizleme ucu gerçek tarihleri istiyor. Bileşende yeniden
   * çözmek, aynı aralığı iki yerde hesaplamak ve bir gün ayrışmak olurdu.
   */
  range: { from: string; to: string };
}) {
  // ÖLÜ KOLONU GÖSTERMİYORUZ.
  //
  // Hiçbir satırda dönüşüm değeri yoksa ROAS kolonu baştan sona "—" oluyor:
  // yatay yer kaplıyor, göz taramasını uzatıyor ve hiçbir şey söylemiyor.
  // Kartta ROAS yerine erişim gösterme kararının tablodaki karşılığı bu.
  //
  // Tek satırda bile gelir varsa kolon kalıyor — o zaman karşılaştırma anlamlı.
  const showRoas = rows.some((r) => r.roas !== null);
  const tipGoster = level === 'campaign';
  const altBasamak = ALT_BASAMAK[level];

  /**
   * ═══ ÖNİZLEMELER: TEK TEK YA DA HEPSİ BİRDEN ═══
   *
   * İki kullanıcı isteği birlikte:
   *   1. "farklı reklamın önizlemesini görmek istediğimde diğerinin kapanıp
   *      tıkladığım reklamın açılması gerekiyor" → anahtar KAPALIYKEN tek
   *      kimlik tutuluyor (`tekAcik`), biri açılınca öbürü kapanıyor.
   *   2. (2026-10-09) "filtre kısmında bir switch: açınca hepsi açık,
   *      kapatınca hepsi kapalı, tek tek elle de açılmalı" → anahtar
   *      AÇIKKEN hepsi açık ve tek tek KAPATILANLAR tutuluyor (`kapatilan`).
   * Kural tek fonksiyonda (`onizlemeAcikMi`); iki ayrı koşul zinciri
   * yazmak, birinin bir dalda unutulması olurdu.
   *
   * ANİMASYON HATASIZ: önizleme bir kez açıldıktan sonra DOM'dan çıkmıyor
   * (`acilmis`), kapanış `grid-template-rows` geçişiyle. İlk açılışta satır
   * KAPALI doğuyor ve iki kare sonra açılıyor; açık doğan öğe geçiş
   * oynatmaz, bir karede belirirdi. Henüz açılmamış önizleme hiç
   * kurulmuyor: 25 reklamın önizlemesini sayfa açılırken çekmek boşa yük.
   *
   * SEÇİM URL'DE DEĞİL: sayfa `force-dynamic` ve adres değişimi bütün
   * sorguları yeniden koşturuyordu; bir kutuyu açmanın bedeli olamaz.
   */
  const [hepsiAcik, setHepsiAcik] = useState(false);
  const [tekAcik, setTekAcik] = useState<string | null>(null);
  const [kapatilan, setKapatilan] = useState<ReadonlySet<string>>(new Set());
  const [acilmis, setAcilmis] = useState<ReadonlySet<string>>(new Set());
  const durum = { hepsiAcik, tekAcik, kapatilan };
  const acikMi = (id: string) => onizlemeAcikMi(durum, id);

  /** Önce DOM'a kapalı koy, iki kare sonra aç: geçiş görünür oynasın. */
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
    setKapatilan(new Set());
    setTekAcik(null);
    if (hepsiAcik) return setHepsiAcik(false);
    kurVeAc(
      rows.map((r) => r.entityId),
      () => setHepsiAcik(true),
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface">
      <TabloBasligi seviye={level} tasinan={tasinan} />

      {/*
        ÖNİZLEME ANAHTARI YALNIZCA REKLAM SEVİYESİNDE: kampanya ve reklam
        setinin önizlemesi yok, orada soluk bir anahtar çalışmayan bir
        seçenek olurdu.
      */}
      {level === 'ad' && rows.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-b border-line px-4 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={hepsiAcik}
            onClick={hepsiniDegistir}
            className="group inline-flex items-center gap-2 rounded-full px-1 py-0.5 text-xs font-semibold text-ink"
          >
            <span
              aria-hidden
              className={`relative h-5 w-9 rounded-full transition-colors duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
                hepsiAcik ? 'bg-brand' : 'bg-surface-sunken ring-1 ring-inset ring-line'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
                  hepsiAcik ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </span>
            Önizlemeler
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">
          Bu aralıkta bu seviyede veri yok.
        </p>
      ) : (
        <>
          {/* Yatay kaydırma KENDİ kabında: sayfanın gövdesi yatay kaymamalı. */}
          <div className="overflow-x-auto">
          <table className={`w-full text-sm ${showRoas ? (tipGoster ? 'min-w-[1000px]' : 'min-w-[920px]') : tipGoster ? 'min-w-[920px]' : 'min-w-[840px]'}`}>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2 font-semibold">Ad</th>
                {/*
                  MECRA SÜTUNU — ADIN HEMEN YANINDA.
                  Platform bilgisi tabloda HİÇ YOKTU: aynı listede Meta ve
                  Google kampanyaları yan yana duruyor ve hangi harcamanın
                  hangi mecraya gittiği yalnızca kampanya adından tahmin
                  edilebiliyordu. Üstteki platform sekmesi süzüyor ama
                  "Tümü" seçiliyken satır bazında cevap vermiyor.
                */}
                <SiraliBaslik
                  etiket="Mecra"
                  anahtar="mecra"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2"
                />
                {/*
                  KAMPANYA TİPİ MECRANIN YANINDA, YALNIZCA KAMPANYA SEVİYESİNDE.
                  "Meta · Form", "Google · YouTube" birlikte okunuyor. Reklam
                  seti ve reklam satırlarında tip üst kampanyanın özelliği;
                  orada tekrar etmek her satıra aynı kelimeyi basmak olurdu.
                */}
                {tipGoster && <th className="px-3 py-2 font-semibold">Tip</th>}
                <SiraliBaslik
                  etiket="Harcama"
                  anahtar="harcama"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="Gösterim"
                  anahtar="gosterim"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="Tık"
                  anahtar="tik"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                {/* CTR SIRALANMIYOR: türetilmiş bir oran ve gösterimi sıfır
                    olan satırlarda `null`. Sıralanabilir göstermek, aynı
                    tabloda anlamı olmayan bir düzen üretirdi. */}
                <th className="px-3 py-2 text-right font-semibold">CTR</th>
                <SiraliBaslik
                  etiket="Dönüşüm"
                  anahtar="donusum"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="CPA"
                  anahtar="cpa"
                  aktif={siralama}
                  tasinan={tasinan}
                  className={`px-3 py-2 text-right ${showRoas ? '' : 'pr-4'}`}
                />
                {showRoas && <th className="px-4 py-2 text-right font-semibold">ROAS</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={`${r.entityId}-${r.currency}`}>
                <tr className="border-b border-line/60 last:border-0">
                  <td className="max-w-[260px] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {/*
                        AD BAĞLANTI — bir alt basamağa iniyor.
                        Reklam seviyesinde alt basamak yok ve orada düz metin
                        kalıyor: tıklanabilir görünüp hiçbir şey yapmayan bir
                        bağlantı, bozuk bir ekrandan ayırt edilemez.
                      */}
                      {altBasamak ? (
                        <Link
                          href={baglanti(REKLAM_YONETICISI, tasinan, altBasamak(r.entityId))}
                          className="truncate font-medium text-ink transition hover:text-brand-strong hover:underline"
                          title={`${r.name} — içine gir`}
                        >
                          {r.name}
                        </Link>
                      ) : level === 'ad' ? (
                        /*
                          REKLAM SEVİYESİNDE AD BİR AÇMA DÜĞMESİ.
                          Hiyerarşinin son basamağı ve altında gidilecek bir
                          liste yok; gidilecek şey reklamın KENDİSİ — nasıl
                          göründüğü. Bağlantı yapmak, hiçbir yere gitmeyen
                          bir bağlantı olurdu.
                        */
                        <button
                          type="button"
                          onClick={() => satiriDegistir(r.entityId)}
                          aria-expanded={acikMi(r.entityId)}
                          title={`${r.name}: önizlemeyi ${acikMi(r.entityId) ? 'kapat' : 'aç'}`}
                          className="flex min-w-0 items-center gap-1 text-left font-medium text-ink transition hover:text-brand-strong"
                        >
                          {/* OK YÖNÜ DURUMU SÖYLÜYOR: açılabilir olduğu
                              tıklamadan ÖNCE anlaşılmalı. */}
                          <span
                            aria-hidden="true"
                            className={`shrink-0 text-[10px] text-ink-muted transition-transform duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
                              acikMi(r.entityId) ? 'rotate-90' : ''
                            }`}
                          >
                            ▶
                          </span>
                          <span className="truncate">{r.name}</span>
                        </button>
                      ) : (
                        <span className="truncate font-medium text-ink" title={r.name}>
                          {r.name}
                        </span>
                      )}
                      <StatusPill status={r.status} />
                    </div>
                    {r.parentName && (
                      <p className="truncate text-xs text-ink-muted" title={r.parentName}>
                        {r.parentName}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Mecra platform={r.platform} />
                  </td>
                  {tipGoster && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-ink-muted">
                      {r.campaignType ?? (
                        <span title="Platform bu seviyede kampanya tipi bildirmiyor">—</span>
                      )}
                    </td>
                  )}
                  {/*
                    DELTA HÜCRENİN ALTINDA, YENİ SÜTUN DEĞİL.
                    Tablo zaten sabit genişlikte (min-w-[820px]); altı metrik
                    için altı ek sütun onu mobilde tamamen yatay kaydırmaya
                    mahkûm ederdi.
                  */}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {/* Satır kendi para birimini taşıyor: karışık para
                        biriminde tek bir sembol göstermek yanlış olurdu. */}
                    {formatMoney(r.spendMicros, currency ?? r.currency)}
                    <Delta simdi={mikroSayi(r.spendMicros)} once={mikroSayi(r.previous?.spendMicros)} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.impressions)}
                    <Delta simdi={r.impressions} once={r.previous?.impressions} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.clicks)}
                    <Delta simdi={r.clicks} once={r.previous?.clicks} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatPercent(r.ctr)}
                    <Delta simdi={r.ctr} once={r.previous?.ctr} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {formatDecimal(r.conversions, 0)}
                    <Delta simdi={r.conversions} once={r.previous?.conversions} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums text-ink-muted ${
                      showRoas ? '' : 'pr-4'
                    }`}
                  >
                    {formatMoney(
                      r.cpa === null ? null : String(Math.round(r.cpa * 1_000_000)),
                      currency ?? r.currency,
                    )}
                    {/* CPA'da ARTIŞ KÖTÜ — `inverse`. */}
                    <Delta simdi={r.cpa} once={r.previous?.cpa} inverse />
                  </td>
                  {showRoas && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {formatRoas(r.roas)}
                    </td>
                  )}
                </tr>
                {/*
                  ÖNİZLEME KENDİ SATIRINDA, `colSpan` ile.
                  Hücrenin içine koymak tablo düzenini bozuyor: kart sütun
                  genişliğine sıkışıp okunmaz hâle geliyor ve komşu
                  hücrelerin yüksekliğini şişiriyor.
                */}
                {(acilmis.has(r.entityId) || acikMi(r.entityId)) && (
                  <tr>
                    <td colSpan={showRoas ? 9 : 8} className="p-0">
                      <div
                        className={`grid transition-[grid-template-rows] duration-[420ms] ease-[var(--ease-out)] motion-reduce:transition-none ${
                          acikMi(r.entityId) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                        }`}
                      >
                        <div className="overflow-hidden" inert={!acikMi(r.entityId)}>
                          <div className="border-b border-line/60 bg-surface-sunken/40">
                            <ReklamOnizleme
                              adId={r.entityId}
                              from={range.from}
                              to={range.to}
                              currency={currency ?? r.currency}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
          <KaydirmaIpucu />
        </>
      )}

      {/*
        SESSİZ KESME YOK.
        Tablo her zaman HARCAMAYA GÖRE İLK N satırı gösteriyor ve sıralama o
        kümenin içinde çalışıyor. Bu yazılmazsa "mecraya göre sıraladım ama
        Google kampanyalarımın çoğu listede yok" hâli hiçbir yerde
        açıklanmaz. Not yalnızca kesme İHTİMALİ varsa basılıyor — her
        ekranda duran bir uyarı okunmaz hâle gelir.
      */}
      {rows.length >= limit && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
          Harcamaya göre ilk {limit} satır gösteriliyor
          {siralama !== 'harcama' ? ' — sıralama bu satırların içinde yapılıyor' : ''}.
        </p>
      )}
    </section>
  );
}

/**
 * Tablonun başlığı ve seviye sekmeleri — `HesapKirilimi` de bunu çiziyor.
 */
export function TabloBasligi({
  seviye,
  tasinan,
}: {
  seviye: PanelSeviyesi;
  tasinan: Record<string, string | undefined>;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h3 className="text-sm font-semibold text-ink">Performans dağılımı</h3>
      <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Kırılım seviyesi">
        {LEVEL_TABS.map((tab) => (
          <Link
            key={tab.key}
            // TAŞINAN SÜZGEÇLERLE. Eskiden yalnızca `aralik` yazılıyordu ve
            // `platform` DÜŞÜYORDU: "Meta" seçip seviye değiştiren kullanıcı
            // sessizce bütün platformlara dönüyordu.
            href={baglanti(REKLAM_YONETICISI, tasinan, { seviye: tab.key, ...tab.dusen })}
            aria-current={seviye === tab.key ? 'page' : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              seviye === tab.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/**
 * SIRALANABİLİR SÜTUN BAŞLIĞI — LİNK, BUTON DEĞİL.
 *
 * Seçim URL'de duruyor: sayfa sunucu bileşeni kalıyor, bağlantı
 * paylaşılabiliyor ve tarayıcının geri tuşu çalışıyor. Buton yazmak üçünü de
 * kaybettirir ve tabloyu istemci bileşenine çevirirdi.
 *
 * YÖN SÜTUNA GÖMÜLÜ (`SIRALAMA_YONU`) ve OKLA GÖSTERİLİYOR. İki tıklamalı
 * artan/azalan bir başlık ikinci bir URL parametresi isterdi; her sütunun
 * zaten doğru bir yönü var ve CPA'nınki diğerlerinin TERSİ — göstermeden
 * bırakmak, kullanıcının "en pahalı CPA" beklerken en ucuzu görmesi demekti.
 */
export function SiraliBaslik({
  etiket,
  anahtar,
  aktif,
  tasinan,
  className,
}: {
  etiket: string;
  anahtar: Siralama;
  aktif: Siralama;
  tasinan: Record<string, string | undefined>;
  className: string;
}) {
  const secili = aktif === anahtar;
  const yon = SIRALAMA_YONU[anahtar];
  return (
    <th
      className={`${className} font-semibold`}
      aria-sort={secili ? (yon === 'artan' ? 'ascending' : 'descending') : 'none'}
    >
      <Link
        href={baglanti(REKLAM_YONETICISI, tasinan, { sirala: anahtar })}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${
          secili ? 'text-ink' : ''
        }`}
      >
        {etiket}
        <span aria-hidden className={secili ? '' : 'opacity-0'}>
          {yon === 'artan' ? '↑' : '↓'}
        </span>
      </Link>
    </th>
  );
}

/**
 * Mecra hücresi — logo VE metin.
 *
 * Yalnızca logo koymak, markayı tanımayan için okunamaz bir sütun demek;
 * yalnızca metin koymak da göz taramasını yavaşlatıyor (bu tablo aynı
 * ekranda platform sekmeleriyle birlikte duruyor ve oradaki işaretlerle
 * eşleşmesi gerekiyor).
 */
export function Mecra({ platform }: { platform: Platform }) {
  return (
    <span className="flex items-center gap-1.5">
      <PlatformLogo kind={platformKanali(platform)} className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs text-ink-muted">{PLATFORM_KISA_ADLARI[platform]}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        STATUS_STYLE[status] ?? STATUS_STYLE.unknown
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Hücrenin altındaki değişim rozeti.
 *
 * `changePercent` `null` döndüğünde hiçbir şey basılmıyor: önceki dönem yok
 * ya da sıfırsa karşılaştırma TANIMSIZ. "%0" ya da "%100" göstermek ikisi de
 * yanlış olurdu ve yeni açılmış her varlık "-%100" görünürdü.
 */
export function Delta({
  simdi,
  once,
  inverse,
}: {
  simdi: number | null | undefined;
  once: number | null | undefined;
  inverse?: boolean;
}) {
  if (once === undefined || once === null) return null;
  /*
   * `simdi` null olabiliyor (CTR gösterim yoksa, CPA dönüşüm yoksa) ve o
   * durumda karşılaştırma TANIMSIZ: "önceki dönemde CPA vardı, şimdi
   * hesaplanamıyor" bir düşüş değil. Sıfır saymak "-%100" gösterirdi.
   */
  if (simdi === null || simdi === undefined) return null;
  const d = changePercent(simdi, once);
  if (d === null) return null;
  return (
    <span className="mt-0.5 block">
      <DeltaRozeti change={d} inverse={inverse} size="xs" />
    </span>
  );
}

/** Micros string'i sayıya — oran hesabı için; gösterimde kullanılmıyor. */
export function mikroSayi(micros: string | null | undefined): number | null {
  if (micros === null || micros === undefined) return null;
  try {
    return Number(BigInt(micros)) / 1_000_000;
  } catch {
    return null;
  }
}

/**
 * Önizleme açık mı — anahtarın ve tek tek seçimin TEK kararı (yukarıya bkz.).
 * Saf fonksiyon: panelde bileşen render eden test altyapısı yok, kural
 * ancak böyle çalıştırılarak sınanabiliyor.
 */
export function onizlemeAcikMi(
  d: { hepsiAcik: boolean; tekAcik: string | null; kapatilan: ReadonlySet<string> },
  id: string,
): boolean {
  return d.hepsiAcik ? !d.kapatilan.has(id) : d.tekAcik === id;
}
