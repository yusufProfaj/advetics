import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type {
  BekleyenIslerYaniti,
  ClientPacing,
  MetricsAccountBreakdown,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsConversionDetail,
  MetricsOrganizationRow,
  MetricsSummary,
  MetricsTimeseries,
  Platform,
} from '@advetics/shared';
import { PLATFORMS, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { enEskiGunGerekli, rangeParams, resolveRange } from '@/lib/date-range';
import { baglanti } from '@/lib/baglanti';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
import {
  changePercent,
  changePercentMicros,
  formatDayLong,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
  microsOf,
} from '@/lib/format';
import { ayAnahtari } from '@/components/butce/butce-icerik';
import { butceAdresi } from '@/lib/butce-adresi';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { bekleyenIslerYolu, boostRozeti, type BekleyenIslerSonucu } from '@/lib/bekleyen-isler';
import { hizliErisim } from '@/lib/hizli-erisim';
import { visibleSections } from '@/lib/nav-sections';
import {
  BildirimSeridi,
  EnCokHarcayanlarKarti,
  MecraDagilimi,
  OzetListeKarti,
  PerformansKarti,
  type Bildirim,
  type IkincilMetrik,
  type OzetSatiri,
  type PerformansMetrigi,
} from '@/components/taslak/genel-bakis-parcalari';
import {
  BekleyenIskelet,
  BekleyenIslerKarti,
  ButceKarti,
  DonusumKarti,
  KapsamOzeti,
} from '@/components/taslak/genel-bakis-kartlari';
import s from '@/components/taslak/taslak.module.css';
import { first, hataMetni, resolvePlatform } from '@/lib/sayfa-yardimcilari';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';

export const metadata = { title: 'Genel Bakış · Advetics' };

/**
 * ═══ GENEL BAKIŞ — ONAYLANAN TASLAĞIN BİREBİR HÂLİ (2026-10-09) ═══
 *
 * Kullanıcı taslağı onayladı ("mükemmel olmuş"), ilk kod sürümünü reddetti
 * ("taslağın aynısını istiyorum, en ufak bir hata istemiyorum"): ilk sürüm
 * taslağı eski bileşenlerle YAKLAŞIK kurmuştu. Bu sayfa taslağın kendi
 * yapısı ve CSS'i (`components/taslak/`) ile çiziliyor; veri kuralları
 * eskisiyle aynı.
 *
 * Düzen: üstte başlık, tarih, güncelle; platform sekmeleri ve kısayollar;
 * uyarı şeridi. Solda Performans (seçilebilir kutular + çizgi grafik +
 * ikincil şerit) ve paranın nereye gittiği; sağda bekleyen işler, bütçe,
 * mecra dağılımı, dönüşümler. AJANS GÖRÜNÜMÜNDE sağ sütun boş kalmıyor
 * (kullanıcı: "boşlukları doldur"): mecra dağılımı ve kapsam özeti.
 *
 * VERİ EKSİLTİLMEDİ: iniş tablosu (kampanya → reklam seti → reklam,
 * önizleme) Reklam Yöneticisi'nde; eski iniş adresleri oraya yönleniyor.
 */
export const dynamic = 'force-dynamic';

/** Genel Bakış'ın açılış aralığı. Adreste `aralik` yoksa bu kullanılıyor. */
const GENEL_BAKIS_ARALIGI = 'bu_ay';

/** Şirket/workspace/hesap listesinde kaç satır görünür; tamamı Reklam Yöneticisi'nde. */
const OZET_SATIR = 5;

/** Kampanya kartının sunucudan istediği satır: pay ve "en az N" bunun üstünden. */
const KAMPANYA_SINIRI = 50;

/**
 * İNİŞ PARAMETRELERİ Reklam Yöneticisi'ne ait. Paylaşılmış eski bir Genel
 * Bakış bağlantısı (`?kampanya=...`) burada AÇILIRSA kampanya süzgeci
 * sessizce düşer ve kullanıcı bütün workspace'in rakamlarını o kampanyanınki
 * sanır. O yüzden adres olduğu gibi oraya taşınıyor.
 */
const INIS_PARAMETRELERI = ['hesap', 'kampanya', 'reklamSeti', 'seviye', 'sirala'] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  if (INIS_PARAMETRELERI.some((k) => first(params[k]) !== undefined)) {
    const tasi = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const deger = first(v);
      if (deger !== undefined) tasi.set(k, deger);
    }
    redirect(`${REKLAM_YONETICISI}?${tasi}`);
  }

  /*
   * BEKLEYEN İŞLER EN BAŞTA BAŞLIYOR, BEKLENMİYOR: söz `await` edilmiyor,
   * metrik okumalarıyla paralel koşuyor; kart ve Akıllı Boost rozeti onu
   * kendi Suspense sınırlarında bekliyor. HATA NESNEYE ÇEVRİLİYOR:
   * `.catch(() => null)` "iş yok" ile "çağrı düştü"yü aynı boş karta
   * çevirirdi.
   */
  const bekleyenler: Promise<BekleyenIslerSonucu> = serverApiFetch<BekleyenIslerYaniti>(
    bekleyenIslerYolu(session.activeClientId),
  ).then(
    (yanit) => ({ durum: 'tamam', yanit }),
    (e: unknown) => ({ durum: 'hata', mesaj: hataMetni(e) }),
  );
  /* HIZLI ERİŞİM MENÜNÜN SÜZGECİNDEN: menüde görünmeyen kısayol olmaz. */
  const kisayollar = hizliErisim(
    visibleSections(session.permissions, {
      ustHesapGorunur: session.platformAdmin || session.managerAccount !== null,
      platformSahibi: session.platformAdmin,
    }),
  );

  /* KAPSAM YALNIZCA "Tüm zamanlar" İÇİN OKUNUYOR (en eski gün). */
  const aralik = first(params.aralik) ?? GENEL_BAKIS_ARALIGI;
  const kapsam = enEskiGunGerekli(aralik)
    ? await serverApiFetch<{ earliestDate: string | null }>(
        `/metrics/coverage?from=${first(params.baslangic) ?? '2026-01-01'}&to=${first(params.bitis) ?? '2026-01-01'}`,
      ).catch(() => null)
    : null;

  const range = resolveRange({
    aralik,
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
    enEskiGun: kapsam?.earliestDate ?? null,
  });
  const platform = resolvePlatform(first(params.platform));

  /*
   * TAŞINAN SÜZGEÇLER: tarih ve platform. Buradan Reklam Yöneticisi'ne
   * giden her bağlantı aynı dönemi ve platformu taşıyor; yoksa tıklayan
   * kullanıcı başka bir dönemin rakamlarına düşerdi.
   */
  const tasinan = {
    ...rangeParams(range),
    platform: platform ?? undefined,
  };
  const tasinanSorgu = new URLSearchParams();
  for (const [k, v] of Object.entries(tasinan) as Array<[string, string | undefined]>) {
    if (v !== undefined) tasinanSorgu.set(k, v);
  }

  const base = new URLSearchParams({ from: range.from, to: range.to });
  if (range.compareFrom && range.compareTo) {
    base.set('compareFrom', range.compareFrom);
    base.set('compareTo', range.compareTo);
  }
  if (platform) base.set('platform', platform);
  const kampanyaQs = new URLSearchParams(base);
  kampanyaQs.set('level', 'campaign');
  kampanyaQs.set('limit', String(KAMPANYA_SINIRI));

  let ozetHatasi: string | null = null;

  /*
   * ÜÇ KATMAN: ajans ("Tüm şirketler") → şirketler; şirket (workspace
   * seçili değil) → workspace'ler; workspace → hesaplar + kampanyalar.
   * Ajans kontrolü MCC'den ÖNCE: ajans kipinde `activeClientId` boş ve MCC
   * koşulu da tutuyor.
   */
  const ajansGorunumu = session.tumSirketler;
  const mcc =
    !ajansGorunumu && session.activeClientId === null && session.availableClients.length > 1;
  const workspaceGorunumu = !ajansGorunumu && !mcc;

  /* BU AYIN BÜTÇESİ — yalnızca tek workspace seçiliyken ve okuma yetkisi varsa. */
  const butceGorunur =
    !mcc && !ajansGorunumu && session.activeClientId !== null && session.permissions.includes('budget.read');
  let butceHatasi: string | null = null;

  const [summary, series, musteriler, sirketler, kampanyalar, hesaplar, donusum, butce] =
    await Promise.all([
      serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch((e: unknown) => {
        ozetHatasi = hataMetni(e);
        return null;
      }),
      range.days > 1
        ? serverApiFetch<MetricsTimeseries>(`/metrics/timeseries?${base}`).catch(() => null)
        : Promise.resolve<MetricsTimeseries>({ points: [], previous: null }),
      mcc
        ? serverApiFetch<MetricsClientRow[]>(`/metrics/clients?${base}`).catch(() => null)
        : Promise.resolve(null),
      ajansGorunumu
        ? serverApiFetch<MetricsOrganizationRow[]>(`/metrics/organizations?${base}`).catch(
            () => null,
          )
        : Promise.resolve(null),
      workspaceGorunumu
        ? serverApiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${kampanyaQs}`).catch(() => null)
        : Promise.resolve(null),
      workspaceGorunumu
        ? serverApiFetch<MetricsAccountBreakdown>(`/metrics/hesaplar?${base}`).catch(() => null)
        : Promise.resolve(null),
      /* Dönüşüm eylemleri üst katmanlarda anlamsız ve sorgu pahalı. */
      workspaceGorunumu
        ? serverApiFetch<MetricsConversionDetail>(`/metrics/donusum-detay?${base}`).catch(
            () => null,
          )
        : Promise.resolve(null),
      butceGorunur
        ? serverApiFetch<ClientPacing>(
            `/budgets/pacing?${new URLSearchParams({ clientId: session.activeClientId!, month: ayAnahtari() })}`,
          ).catch((e: unknown) => {
            butceHatasi = hataMetni(e);
            return null;
          })
        : Promise.resolve(null),
    ]);

  const activeClient = session.availableClients.find((c) => c.id === session.activeClientId);
  const scopeLabel = ajansGorunumu
    ? 'Tüm şirketler'
    : (activeClient?.name ?? 'Tüm workspace’ler');

  /* KAPSAM ŞERİDİ: ajans › şirket › workspace; üst basamak kapsamı değiştiriyor. */
  const basamaklar: YolBasamagi[] = [];
  if (session.managerAccount) {
    basamaklar.push({ ad: session.managerAccount.name, kapsam: { tip: 'ajans' } });
  }
  if (!ajansGorunumu) {
    const sirketAdi =
      session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)
        ?.name ?? session.organization.name;
    basamaklar.push({ ad: sirketAdi, kapsam: { tip: 'sirket' } });
  }
  if (activeClient) basamaklar.push({ ad: activeClient.name });

  const karsilastir = range.karsilastirma !== 'yok';
  const veriVar = summary !== null && summary.accountCount > 0;

  const yeniReklam = kisayollar.find((k) => k.href === '/reklam');
  const digerKisayollar = kisayollar.filter((k) => k.href !== '/reklam');

  return (
    <div className={s.kok}>
      {/*
        BAŞLIK: kırıntı, ad, kapsam ve dönem solda; tarih ve güncelle sağda.
        TAZELİK güncelle düğmesinin içinde: en çok bakılan bilgilerden biri.
      */}
      <header className={s.ust}>
        <div>
          {basamaklar.length > 1 && (
            <HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} gorunum="kirinti" />
          )}
          <h1>Genel Bakış</h1>
          <div className={s.altSatir}>
            {scopeLabel} · {formatDayLong(range.from)} - {formatDayLong(range.to)}
            {range.incomplete && <span className={s.uyarMetin}> · Gün bitmedi, rakamlar artacak</span>}
          </div>
        </div>
        <div className={s.kontroller}>
          <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
          <RefreshButton
            dateFrom={range.from}
            dateTo={range.to}
            rangeLabel={range.label}
            sonGuncelleme={summary?.lastFetchedAt ?? null}
          />
        </div>
      </header>

      <div className={s.serit2}>
        <nav className={s.seg} aria-label="Platform">
          {[null, ...PLATFORMS].map((p) => (
            <Link
              key={p ?? 'tumu'}
              href={baglanti('/dashboard', tasinan, { platform: p ?? undefined })}
              aria-current={platform === p ? 'page' : undefined}
            >
              {p ? PLATFORM_KISA_ADLARI[p] : 'Tümü'}
            </Link>
          ))}
        </nav>
        {summary !== null && <span className={s.notKucuk}>{summary.accountCount} reklam hesabı</span>}
        {(digerKisayollar.length > 0 || yeniReklam) && (
          <nav className={s.hizli} aria-label="Hızlı erişim">
            {digerKisayollar.map((k) => (
              <Link key={k.href} className={s.hap} href={k.href}>
                {k.etiket}
                {k.boostRozeti && (
                  <Suspense fallback={null}>
                    <BoostSayisi sonuc={bekleyenler} />
                  </Suspense>
                )}
              </Link>
            ))}
            {yeniReklam && (
              <Link className={s.birincil} href={yeniReklam.href}>
                ＋ Reklam oluştur
              </Link>
            )}
          </nav>
        )}
      </div>

      {summary === null ? (
        <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Veriler alınamadı.</strong>
            {ozetHatasi && <span> {ozetHatasi}</span>}
          </span>
        </div>
      ) : summary.accountCount === 0 ? (
        <div className={s.bildirim} role="status">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Henüz veri yok.</strong> Bir platform bağlayıp reklam hesabını bir workspace&apos;e ata.
          </span>
          <Link className={s.cozum} href="/ayarlar/baglantilar">
            Bağlantılara git →
          </Link>
        </div>
      ) : (
        <BildirimSeridi bildirimler={bildirimler(summary)} />
      )}

      <div className={s.izgara}>
        <div className={s.sutun}>
          {veriVar && (
            <PerformansKarti
              metrikler={performansMetrikleri(summary!, karsilastir)}
              ikincil={ikincilMetrikler(summary!, karsilastir)}
              noktalar={series?.points ?? []}
              onceki={karsilastir ? (series?.previous ?? null) : null}
              tekGun={range.days <= 1}
              seriHatasi={series === null}
            />
          )}

          {veriVar &&
            (ajansGorunumu ? (
              sirketler === null ? (
                <HataKarti metin="Şirket dağılımı alınamadı." />
              ) : (
                <OzetListeKarti
                  baslik="Şirketler"
                  sutunAdi="Şirket"
                  satirlar={sirketSatirlari(sirketler)}
                  toplam={sirketler.length}
                  tumuHref={REKLAM_YONETICISI}
                  tumuEtiket="şirket"
                  altNot={`${sirketler.filter((r) => r.spendMicros !== '0').length} tanesi bu dönemde harcadı`}
                />
              )
            ) : mcc ? (
              musteriler === null ? (
                <HataKarti metin="Workspace dağılımı alınamadı." />
              ) : (
                <OzetListeKarti
                  baslik="Workspace’ler"
                  sutunAdi="Workspace"
                  satirlar={workspaceSatirlari(musteriler)}
                  toplam={musteriler.length}
                  tumuHref={REKLAM_YONETICISI}
                  tumuEtiket="workspace"
                  altNot={`${musteriler.filter((r) => r.spendMicros !== '0').length} tanesi bu dönemde harcadı`}
                />
              )
            ) : (
              <>
                {hesaplar === null ? (
                  <HataKarti metin="Hesap dağılımı alınamadı." />
                ) : (
                  <OzetListeKarti
                    baslik="Hesaplar"
                    sutunAdi="Hesap"
                    satirlar={hesapSatirlari(hesaplar, tasinan)}
                    toplam={hesaplar.accounts.length}
                    tumuHref={baglanti(REKLAM_YONETICISI, tasinan, {})}
                    tumuEtiket="hesap"
                    altNot={izlenmeyenNotu(hesaplar)}
                  />
                )}
                <EnCokHarcayanlarKarti
                  ilk={kampanyalar}
                  sorgu={base.toString()}
                  sinir={KAMPANYA_SINIRI}
                  paraBirimi={summary!.currency}
                  reklamYoneticisi={REKLAM_YONETICISI}
                  tasinanSorgu={tasinanSorgu.toString()}
                />
              </>
            ))}
        </div>

        <div className={s.sutun}>
          <Suspense fallback={<BekleyenIskelet />}>
            <BekleyenIslerKarti
              sonuc={bekleyenler}
              onayYetkisi={session.permissions.includes('strategy.approve')}
            />
          </Suspense>

          {butceGorunur && (
            <ButceKarti
              veri={butce}
              hata={butceHatasi}
              href={butceAdresi(session.activeClientId)}
              ayAdi={buAyAdi()}
            />
          )}

          {veriVar && (
            <MecraDagilimi
              dilimler={mecraDilimleri({ sirketler, musteriler, hesaplar })}
              paraBirimi={summary!.currency}
            />
          )}

          {/* Her görünümde: sağ sütun soldan kısa kalıp boşluk bırakmasın (kullanıcı: "boşlukları doldur"). */}
          {veriVar && (
            <KapsamOzeti
              satirlar={kapsamSatirlari({ summary: summary!, sirketler, musteriler, kampanyalar, donusum })}
            />
          )}

          {donusum !== null && <DonusumKarti detay={donusum} />}
        </div>
      </div>

      {/* Aralığın sınırı YALNIZCA bugün dâhil değilken; dâhilken başlık zaten söylüyor. */}
      {!range.incomplete && <p className={s.notKucuk}>Bugün dâhil değil.</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HataKarti({ metin }: { metin: string }) {
  return (
    <section className={s.kart}>
      <p role="alert" className={s.hataMetin}>
        {metin}
      </p>
    </section>
  );
}

/** Akıllı Boost kısayolundaki bekleyen sayısı; sıfırsa rozet yok. */
async function BoostSayisi({ sonuc }: { sonuc: Promise<BekleyenIslerSonucu> }) {
  const r = boostRozeti(await sonuc);
  if (!r) return null;
  return (
    <span className={`${s.rozet} ${s.num}`} title={r.baslik} aria-label={r.baslik}>
      {r.metin}
    </span>
  );
}

/**
 * Uyarılar TEK şeritte. Para birimi karışıksa tutarlar toplanmıyor;
 * izlenmeyen hesabın harcaması toplamdan çıkıyor ve söylenmezse "harcama
 * neden azaldı" sorulur.
 */
function bildirimler(summary: MetricsSummary): Bildirim[] {
  const out: Bildirim[] = [];
  if (summary.hiddenAccounts > 0) {
    out.push({
      icerik: (
        <>
          <strong>{summary.hiddenAccounts} hesap izlenmiyor</strong> ve bu rakamlara dâhil değil. Verileri
          duruyor.
        </>
      ),
      eylem: { etiket: 'Bağlantılarda aç', href: '/ayarlar/baglantilar' },
    });
  }
  if (summary.currency === null && summary.byCurrency.length > 1) {
    out.push({
      icerik: (
        <>
          <strong>Birden fazla para birimi var</strong> ({summary.byCurrency.map((c) => c.currency).join(', ')}).
          Tutarlar ayrı gösteriliyor.
        </>
      ),
    });
  }
  return out;
}

/**
 * Dört kutu. Dördüncüsü gelir takip ediliyorsa ROAS, edilmiyorsa ERİŞİM:
 * form ve mesaj kampanyalarında gelir yok ve ROAS kutusu hep "—" olurdu.
 * Erişim çok günlü aralıkta GÜNLÜK ORTALAMA ve bu yazılıyor; dönemin tekil
 * kişi sayısı gibi okunmamalı.
 */
function performansMetrikleri(summary: MetricsSummary, karsilastir: boolean): PerformansMetrigi[] {
  const prev = karsilastir ? summary.previous : null;
  const currency = summary.currency;
  const harcama =
    currency === null && summary.byCurrency.length > 1
      ? summary.byCurrency.map((c) => formatMoney(c.spendMicros, c.currency, { compact: true })).join(' + ')
      : formatMoney(summary.spendMicros, currency);
  const dorduncu: PerformansMetrigi =
    summary.roas === null
      ? {
          anahtar: 'erisim',
          ad: 'Erişim',
          deger: formatNumber(summary.reach),
          degisim: null,
          ipucu:
            summary.reach === null
              ? 'platform bildirmiyor'
              : summary.reachKind === 'daily_average'
                ? summary.reachAcrossAccounts
                  ? 'günlük ortalama, hesaplar arası mükerrer olabilir'
                  : 'günlük ortalama'
                : summary.reachAcrossAccounts
                  ? 'hesaplar arası mükerrer olabilir'
                  : undefined,
        }
      : {
          anahtar: 'roas',
          ad: 'Reklam getirisi',
          deger: formatRoas(summary.roas),
          degisim: changePercent(summary.roas, prev?.roas),
        };
  return [
    {
      anahtar: 'harcama',
      ad: 'Harcama',
      deger: harcama,
      degisim: prev ? changePercentMicros(summary.spendMicros, prev.spendMicros) : null,
    },
    {
      anahtar: 'donusum',
      ad: 'Dönüşüm',
      deger: formatNumber(summary.conversions),
      degisim: prev ? changePercent(summary.conversions, prev.conversions) : null,
    },
    {
      anahtar: 'dbm',
      ad: 'Dönüşüm başı maliyet',
      deger: formatMoney(microsOf(summary.cpa), currency),
      degisim: summary.cpa === null || !prev ? null : changePercent(summary.cpa, prev.cpa),
      ters: true,
      ipucu: summary.cpa === null ? 'henüz sonuç yok' : undefined,
    },
    dorduncu,
  ];
}

function ikincilMetrikler(summary: MetricsSummary, karsilastir: boolean): IkincilMetrik[] {
  const prev = karsilastir ? summary.previous : null;
  const c = summary.currency;
  const d = (a: number | null, b: number | null | undefined) =>
    a === null || !prev ? null : changePercent(a, b);
  return [
    { ad: 'Gösterim', deger: formatNumber(summary.impressions), degisim: d(summary.impressions, prev?.impressions) },
    { ad: 'Tıklama', deger: formatNumber(summary.clicks), degisim: d(summary.clicks, prev?.clicks) },
    { ad: 'Tıklama oranı', deger: formatPercent(summary.ctr), degisim: d(summary.ctr, prev?.ctr) },
    { ad: 'Tıklama başı maliyet', deger: formatMoney(microsOf(summary.cpc), c), degisim: d(summary.cpc, prev?.cpc), ters: true },
    { ad: 'Bin gösterim maliyeti', deger: formatMoney(microsOf(summary.cpm), c), degisim: d(summary.cpm, prev?.cpm), ters: true },
  ];
}

/** Pay: satırın harcamasının GELEN BÜTÜN satırların toplamına oranı (%). */
function paylar<T extends { spendMicros: string }>(rows: T[]): Array<T & { pay: number }> {
  const toplam = rows.reduce((a, r) => a + BigInt(r.spendMicros), 0n);
  return [...rows]
    .sort((a, b) => (BigInt(b.spendMicros) > BigInt(a.spendMicros) ? 1 : BigInt(b.spendMicros) < BigInt(a.spendMicros) ? -1 : 0))
    .map((r) => ({ ...r, pay: toplam === 0n ? 0 : Number((BigInt(r.spendMicros) * 1000n) / toplam) / 10 }));
}

function sirketSatirlari(rows: MetricsOrganizationRow[]): OzetSatiri[] {
  return paylar(rows)
    .slice(0, OZET_SATIR)
    .map((r) => ({
      id: r.organizationId,
      ad: r.name,
      alt:
        r.clientCount === 0
          ? 'workspace yok'
          : `${r.clientCount} workspace · ${r.adAccountCount === 0 ? 'izlemede hesap yok' : `${r.adAccountCount} hesap`}`,
      gosterge: 'karo',
      spendMicros: r.spendMicros,
      pay: r.pay,
      donusum: r.conversions,
      dbmMicros: microsOf(r.cpa),
      paraBirimi: r.currency,
      eylem: { tur: 'org', id: r.organizationId },
    }));
}

function workspaceSatirlari(rows: MetricsClientRow[]): OzetSatiri[] {
  return paylar(rows)
    .slice(0, OZET_SATIR)
    .map((r) => ({
      id: r.clientId,
      ad: r.name,
      alt: r.adAccountCount === 0 ? 'izlemede hesap yok' : `${r.adAccountCount} hesap`,
      gosterge: 'karo',
      spendMicros: r.spendMicros,
      pay: r.pay,
      donusum: r.conversions,
      dbmMicros: microsOf(r.cpa),
      paraBirimi: r.currency,
      eylem: { tur: 'client', id: r.clientId },
    }));
}

function hesapSatirlari(
  veri: MetricsAccountBreakdown,
  tasinan: Record<string, string | undefined>,
): OzetSatiri[] {
  return paylar(veri.accounts)
    .slice(0, OZET_SATIR)
    .map((a) => ({
      id: a.adAccountId,
      ad: a.name,
      alt: `${PLATFORM_KISA_ADLARI[a.platform]} · ${a.externalId}${a.syncEnabled ? '' : ' · izlenmiyor'}`,
      gosterge: a.syncEnabled ? 'yayinda' : 'durdu',
      spendMicros: a.spendMicros,
      pay: a.pay,
      donusum: a.conversions,
      dbmMicros: microsOf(a.cpa),
      paraBirimi: a.currency,
      // İZLENMEYEN HESAP BAĞLANTI DEĞİL: içi boş bir kampanya listesine götürürdü.
      eylem: a.syncEnabled
        ? {
            tur: 'link',
            href: baglanti(REKLAM_YONETICISI, tasinan, {
              platform: a.platform,
              hesap: a.adAccountId,
              seviye: 'campaign',
            }),
          }
        : null,
    }));
}

function izlenmeyenNotu(veri: MetricsAccountBreakdown): string | undefined {
  const n = veri.accounts.filter((a) => !a.syncEnabled).length;
  return n > 0 ? `${n} hesap izlenmiyor` : undefined;
}

/** Mecra dağılımı: hangi katmandaysak onun satırlarının platform kırılımı toplanıyor. */
function mecraDilimleri(v: {
  sirketler: MetricsOrganizationRow[] | null;
  musteriler: MetricsClientRow[] | null;
  hesaplar: MetricsAccountBreakdown | null;
}): Array<{ platform: Platform; spendMicros: string }> {
  const toplam = new Map<Platform, bigint>();
  const ekle = (p: Platform, m: string) => toplam.set(p, (toplam.get(p) ?? 0n) + BigInt(m));
  if (v.sirketler) v.sirketler.forEach((r) => r.byPlatform.forEach((p) => ekle(p.platform, p.spendMicros)));
  else if (v.musteriler) v.musteriler.forEach((r) => r.byPlatform.forEach((p) => ekle(p.platform, p.spendMicros)));
  else if (v.hesaplar) v.hesaplar.platforms.forEach((p) => ekle(p.platform, p.spendMicros));
  return PLATFORMS.filter((p) => toplam.has(p)).map((p) => ({ platform: p, spendMicros: toplam.get(p)!.toString() }));
}

function kapsamSatirlari(v: {
  summary: MetricsSummary;
  sirketler: MetricsOrganizationRow[] | null;
  musteriler: MetricsClientRow[] | null;
  kampanyalar: MetricsBreakdownRow[] | null;
  donusum: MetricsConversionDetail | null;
}): Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }> {
  const out: Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }> = [];
  if (v.sirketler) {
    out.push({ etiket: 'Şirket', deger: formatNumber(v.sirketler.length) });
    out.push({
      etiket: 'Bu dönemde harcayan şirket',
      deger: formatNumber(v.sirketler.filter((r) => r.spendMicros !== '0').length),
    });
    out.push({ etiket: 'Workspace', deger: formatNumber(v.sirketler.reduce((a, r) => a + r.clientCount, 0)) });
  }
  if (v.musteriler) {
    out.push({ etiket: 'Workspace', deger: formatNumber(v.musteriler.length) });
    out.push({
      etiket: 'Bu dönemde harcayan workspace',
      deger: formatNumber(v.musteriler.filter((r) => r.spendMicros !== '0').length),
    });
  }
  out.push({ etiket: 'İzlenen reklam hesabı', deger: formatNumber(v.summary.accountCount) });
  if (v.kampanyalar) {
    // Sınıra ulaştıysa sayı "en az": kesilen liste toplam gibi okunmasın.
    const n = v.kampanyalar.filter((r) => r.spendMicros !== '0').length;
    out.push({
      etiket: 'Bu dönemde harcayan kampanya',
      deger: v.kampanyalar.length >= KAMPANYA_SINIRI ? `en az ${formatNumber(n)}` : formatNumber(n),
    });
  }
  if (v.donusum && v.donusum.satirlar.length > 0) {
    out.push({ etiket: 'Dönüşüm eylemi', deger: formatNumber(v.donusum.satirlar.length) });
  }
  if (v.summary.hiddenAccounts > 0) {
    out.push({
      etiket: 'İzlenmeyen hesap',
      deger: formatNumber(v.summary.hiddenAccounts),
      uyari: true,
      href: '/ayarlar/baglantilar',
    });
  }
  return out;
}

/** "Ekim" — bütçe kartının başlığı; ay anahtarıyla aynı saat dilimi (UTC). */
function buAyAdi(): string {
  const ad = new Date().toLocaleDateString('tr-TR', { month: 'long', timeZone: 'UTC' });
  return ad.charAt(0).toLocaleUpperCase('tr-TR') + ad.slice(1);
}
