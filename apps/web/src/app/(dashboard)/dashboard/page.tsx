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
} from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { enEskiGunGerekli, rangeParams, resolveRange } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
import { formatDayLong } from '@/lib/format';
import { MetricsChart } from '@/components/metrics-chart';
import { HesapKirilimi } from '@/components/hesap-kirilimi';
import { ButceKarti } from '@/components/budget/butce-karti';
import { ayAnahtari } from '@/components/butce/butce-icerik';
import { butceAdresi } from '@/lib/butce-adresi';
import { DonusumDetay } from '@/components/donusum-detay';
import { MusteriTablosu } from '@/components/musteri-tablosu';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { SirketTablosu } from '@/components/sirket-tablosu';
import { Uyari, UyariListesi } from '@/components/ui/uyari';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { siralamaCoz } from '@/lib/kirilim-siralama';
import { bekleyenIslerYolu, type BekleyenIslerSonucu } from '@/lib/bekleyen-isler';
import { hizliErisim } from '@/lib/hizli-erisim';
import { visibleSections } from '@/lib/nav-sections';
import {
  BekleyenIslerIskeleti,
  BekleyenIslerKutusu,
  BoostRozeti,
  HizliErisim,
} from '@/components/genel-bakis/bekleyen-isler-kutusu';
import {
  IkincilSerit,
  PerformansKutulari,
  PlatformSekmeleri,
  VeriYokDurumu,
} from '@/components/genel-bakis/ozet-parcalari';
import { EnCokHarcayanlar, OZET_KAMPANYA_SAYISI } from '@/components/genel-bakis/en-cok-harcayanlar';
import { first, hataMetni, resolvePlatform } from '@/lib/sayfa-yardimcilari';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';

export const metadata = { title: 'Genel Bakış · Advetics' };

/**
 * ═══ GENEL BAKIŞ (2026-10-09 düzeni) ═══
 *
 * Google Ads'in hesap genel bakışı mantığıyla, Advetics görünüşüyle: solda
 * geniş sütunda Performans (metrik kutuları + günlük grafik + ikincil
 * metrikler) ve paranın nereye gittiği; sağda dar sütunda "bugün ne
 * yapmalıyım" (bekleyen işler), bu ayın bütçesi ve dönüşümlerin ne olduğu.
 *
 * VERİ EKSİLTİLMEDİ (kullanıcı: "veri eksiltme, sadece görünümünü benzet").
 * Eski ekrandaki her parça burada ya da bir tık ötede:
 *   · Şirket / workspace listesi → ilk beşi burada, tamamı Reklam Yöneticisi.
 *   · Kampanya → reklam seti → reklam kırılımı ve önizleme → Reklam
 *     Yöneticisi (kullanıcı kararı: iniş orada). Eski adresler oraya
 *     yönleniyor, aşağıya bkz.
 *
 * Sunucu bileşeni, `force-dynamic`: metrikler her istekte tazeleniyor.
 * Bütün okumalar PARALEL; bekleyen işler kendi Suspense sınırında.
 */
export const dynamic = 'force-dynamic';

/** Genel Bakış'ın açılış aralığı. Adreste `aralik` yoksa bu kullanılıyor. */
const GENEL_BAKIS_ARALIGI = 'bu_ay';

/** Genel Bakış'taki şirket/workspace listesinin satır sayısı. */
const OZET_SATIR = 5;

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
   * metrik okumalarıyla paralel koşuyor; kutu ve Akıllı Boost rozeti onu
   * kendi Suspense sınırlarında bekliyor. HATA NESNEYE ÇEVRİLİYOR:
   * `.catch(() => null)` "iş yok" ile "çağrı düştü"yü aynı boş kutuya
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

  /*
   * KAPSAM YALNIZCA "Tüm zamanlar" İÇİN OKUNUYOR (en eski gün). Hata
   * aralığı düşürmüyor: alınamazsa pencere varsayılan başlangıçtan açılıyor.
   */
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
  const siralama = siralamaCoz(undefined);

  /*
   * TAŞINAN SÜZGEÇLER: tarih ve platform. Buradan Reklam Yöneticisi'ne
   * giden her bağlantı (kampanya satırı, hesap satırı) aynı dönemi ve
   * platformu taşıyor; yoksa tıklayan kullanıcı başka bir dönemin
   * rakamlarına düşerdi.
   */
  const tasinan = {
    ...rangeParams(range),
    platform: platform ?? undefined,
  };

  const base = new URLSearchParams({ from: range.from, to: range.to });
  if (range.compareFrom && range.compareTo) {
    base.set('compareFrom', range.compareFrom);
    base.set('compareTo', range.compareTo);
  }
  if (platform) base.set('platform', platform);
  const kampanyaQs = new URLSearchParams(base);
  kampanyaQs.set('level', 'campaign');
  // Pay sütunu GELEN bütün satırların toplamından hesaplanıyor; beş satır
  // istemek payı yanlış gösterirdi. Sınır yine var: kesmeyi ekran yazıyor.
  const KAMPANYA_SINIRI = 50;
  kampanyaQs.set('limit', String(KAMPANYA_SINIRI));

  let ozetHatasi: string | null = null;

  /*
   * ÜÇ KATMAN, ÜÇ AYRI ALT KART:
   *   · Ajans kapsamında ("Tüm şirketler")  → ŞİRKETLER (ilk beşi)
   *   · Şirket kapsamında, workspace seçili değilse → WORKSPACE'LER (ilk beşi)
   *   · Workspace seçiliyse → hesaplar + en çok harcayan kampanyalar
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
      // Tek günlük aralıkta grafik çizilmiyor; sorguyu da atlıyoruz.
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

  /*
   * KAPSAM ŞERİDİ: ajans › şirket › workspace. Kampanya basamakları yok;
   * onlar Reklam Yöneticisi'nin. Üst basamağa tıklamak kapsamı değiştiriyor
   * ve kullanıcı Genel Bakış'ta kalıyor.
   */
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

  return (
    <div className="space-y-4">
      {/*
        ═══ BAŞLIK İKİ SIRA: BAĞLAM ÜSTTE, KONTROLLER ALTTA ═══
        Tarih ve güncelle başlığın sağında; platform sekmeleri ve kısayollar
        kendi sırasında. Hepsi tek satırda dururken `flex-wrap` sığmayanı
        tek tek alt satıra düşürüp başlığın altını parçalıyordu.
        TAZELİK güncelle düğmesinin içinde: en çok bakılan bilgilerden biri.
      */}
      <header className="space-y-3">
        <SayfaBasligi
          baslik="Genel Bakış"
          ust={basamaklar.length > 1 ? <HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} /> : undefined}
          aciklama={
            <>
              {scopeLabel} · {formatDayLong(range.from)} - {formatDayLong(range.to)}
              {range.incomplete && (
                <span className="text-warn-strong"> · Gün bitmedi, rakamlar artacak</span>
              )}
            </>
          }
          eylemler={
            <div className="flex flex-wrap items-center gap-2">
              <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
              <RefreshButton
                dateFrom={range.from}
                dateTo={range.to}
                rangeLabel={range.label}
                sonGuncelleme={summary?.lastFetchedAt ?? null}
              />
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PlatformSekmeleri
            yol="/dashboard"
            current={platform}
            hesap={undefined}
            seviye="hesap"
            tasinan={tasinan}
          />
          {summary !== null && (
            <span className="text-xs text-ink-muted">{summary.accountCount} reklam hesabı</span>
          )}
          <div className="ml-auto">
            <HizliErisim
              ogeler={kisayollar}
              rozet={
                <Suspense fallback={null}>
                  <BoostRozeti sonuc={bekleyenler} />
                </Suspense>
              }
            />
          </div>
        </div>
      </header>

      {summary === null ? (
        <Uyari ton="tehlike">
          {/* Sunucunun kendi hata cümlesi; teknik ayrıntı (pm2 logs) müşteri ekranında değil. */}
          <strong>Veriler alınamadı.</strong>
          {ozetHatasi && <span className="ml-1">{ozetHatasi}</span>}
        </Uyari>
      ) : summary.accountCount === 0 ? (
        <VeriYokDurumu />
      ) : (
        <Uyarilar
          satirlar={[
            summary.currency === null && summary.byCurrency.length > 1 ? (
              <>
                <strong>Birden fazla para birimi var</strong> (
                {summary.byCurrency.map((c) => c.currency).join(', ')}). Tutarlar ayrı
                gösteriliyor.
              </>
            ) : null,
            /* İzlenmeyen hesabın harcaması toplamdan çıkıyor; söylenmezse "neden azaldı" sorulur. */
            summary.hiddenAccounts > 0 ? (
              <>
                <strong>{summary.hiddenAccounts} hesap izlenmiyor</strong> ve bu rakamlara
                dâhil değil. Verileri duruyor; Platform Bağlantıları sayfasından yeniden
                açabilirsin.
              </>
            ) : null,
          ]}
        />
      )}

      {/*
        ═══ İKİ SÜTUN: SOLDA RAKAMLAR, SAĞDA YAPILACAKLAR ═══
        Geniş ekranda 2/3 + 1/3; dar ekranda tek sütun ve SIRA önemli:
        Performans önce, bekleyen işler hemen ardından. Bekleyen işler özet
        düşse de çiziliyor: kendi kaynağı var.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {summary !== null && summary.accountCount > 0 && (
            <section
              aria-label="Performans"
              className="overflow-hidden rounded-xl border border-line bg-surface shadow-kart"
            >
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Performans</h2>
              </div>
              <PerformansKutulari summary={summary} karsilastir={karsilastir} />
              {/* TEK GÜNLÜK ARALIKTA GRAFİK YOK: tek çubuk hiçbir eğilim göstermiyor. */}
              {range.days > 1 &&
                (series === null ? (
                  <p role="alert" className="border-t border-line px-4 py-3 text-sm text-danger-strong">
                    Grafik verisi alınamadı.
                  </p>
                ) : (
                  <div className="border-t border-line">
                    <MetricsChart
                      cerceve={false}
                      points={series.points}
                      previous={series.previous}
                      from={range.from}
                      to={range.to}
                      compareFrom={range.compareFrom}
                      compareTo={range.compareTo}
                      currency={summary.currency}
                    />
                  </div>
                ))}
              <IkincilSerit summary={summary} karsilastir={karsilastir} />
            </section>
          )}

          {summary !== null && summary.accountCount > 0 && (
            ajansGorunumu ? (
              sirketler === null ? (
                <Uyari ton="tehlike">Şirket dağılımı alınamadı.</Uyari>
              ) : (
                <SirketTablosu
                  rows={sirketler}
                  karsilastir={karsilastir}
                  limit={OZET_SATIR}
                  tumuHref={REKLAM_YONETICISI}
                />
              )
            ) : mcc ? (
              musteriler === null ? (
                <Uyari ton="tehlike">Workspace dağılımı alınamadı.</Uyari>
              ) : (
                <MusteriTablosu
                  rows={musteriler}
                  karsilastir={karsilastir}
                  limit={OZET_SATIR}
                  tumuHref={REKLAM_YONETICISI}
                />
              )
            ) : (
              <>
                {hesaplar === null ? (
                  <Uyari ton="tehlike">Hesap dağılımı alınamadı.</Uyari>
                ) : (
                  <HesapKirilimi veri={hesaplar} platform={platform} tasinan={tasinan} siralama={siralama} />
                )}
                {kampanyalar === null ? (
                  <Uyari ton="tehlike">Kampanya listesi alınamadı.</Uyari>
                ) : (
                  <EnCokHarcayanlar
                    rows={kampanyalar}
                    toplamBilinmiyor={kampanyalar.length >= KAMPANYA_SINIRI}
                    currency={summary.currency}
                    tasinan={tasinan}
                  />
                )}
              </>
            )
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Suspense fallback={<BekleyenIslerIskeleti />}>
            <BekleyenIslerKutusu
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

          {donusum !== null && summary !== null && (
            <DonusumDetay detay={donusum} currency={summary.currency} />
          )}
        </div>
      </div>

      {/* Aralığın sınırı YALNIZCA bugün dâhil değilken; dâhilken başlık zaten söylüyor. */}
      {!range.incomplete && <p className="text-xs text-ink-muted">Bugün dâhil değil</p>}
    </div>
  );
}

/**
 * Uyarı listesi — hepsi TEK kutuda.
 *
 * `null` satırlar eleniyor ve hiç satır kalmazsa kutu da çizilmiyor: boş bir
 * çerçeve, kullanıcıya okunacak bir şey varmış gibi görünüyor.
 */
function Uyarilar({ satirlar }: { satirlar: Array<React.ReactNode | null> }) {
  return <UyariListesi satirlar={satirlar} />;
}

/** "Ekim" — bütçe kartının başlığı; ay anahtarıyla aynı saat dilimi (UTC). */
function buAyAdi(): string {
  const ad = new Date().toLocaleDateString('tr-TR', { month: 'long', timeZone: 'UTC' });
  return ad.charAt(0).toLocaleUpperCase('tr-TR') + ad.slice(1);
}
