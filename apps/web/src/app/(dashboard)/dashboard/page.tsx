import Link from 'next/link';
import type {
  MetricLevel,
  Platform,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsHierarchyPath,
  MetricsOrganizationRow,
  MetricsSummary,
  MetricsTimeseries,
} from '@advetics/shared';
import { METRIC_LEVELS, PLATFORMS } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
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
  formatRelative,
  formatRoas,
  isStale,
  microsOf,
} from '@/lib/format';
import { MetricCard } from '@/components/metric-card';
import { MetricStrip } from '@/components/metric-strip';
import { MetricsChart } from '@/components/metrics-chart';
import { BreakdownTable } from '@/components/breakdown-table';
import { MusteriTablosu } from '@/components/musteri-tablosu';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { SirketTablosu } from '@/components/sirket-tablosu';
import { kirilimSirala, siralamaCoz } from '@/lib/kirilim-siralama';

export const metadata = { title: 'Genel Bakış · Advetics' };

/**
 * Unified Dashboard.
 *
 * Üç uç nokta PARALEL çekiliyor. Sırayla beklemek toplam gecikmeyi üçe
 * katlardı; hiçbiri diğerinin sonucuna ihtiyaç duymuyor.
 *
 * Sunucu bileşeni: veri sunucuda çekiliyor, tarayıcıya JS inmeden ekran hazır
 * geliyor. Aralık ve seviye seçimi URL'de olduğu için etkileşim için de JS
 * gerekmiyor — seçiciler birer link.
 *
 * `force-dynamic`: metrikler her istekte tazeleniyor. Next.js'in varsayılan
 * önbelleği burada yanlış olurdu — kullanıcı "yenile"ye bastığında bayat sayı
 * görmesi, panelin güvenilirliğini bitirir.
 */
export const dynamic = 'force-dynamic';

/**
 * Kırılım tablosunun satır sınırı.
 *
 * SABİT BİR YERDE çünkü iki tüketicisi var: sorgu (`limit=`) ve tablo
 * (kesmeyi ekranda YAZAN not). İkisini ayrı yazmak, biri değişince notun
 * yanlış sayıyı söylemesi demekti — panelde "Üst sınır 10 MB" elle yazılıyken
 * tam olarak bu oldu.
 */
const KIRILIM_LIMITI = 25;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  /*
   * ═══ KAPSAM YALNIZCA GEREKİYORSA OKUNUYOR ═══
   *
   * "Tüm zamanlar" ön ayarı elimizdeki en eski veri gününe dayanıyor. Sabit
   * bir alt sınır hem yüzlerce boş günü tarar hem de 400 günlük sunucu
   * sınırına takılıp hata sayfası üretirdi.
   *
   * AMA BU ÇAĞRI PAHALI VE SERİ. `/metrics/coverage` metrik tablosundaki
   * TARİH SINIRI OLMAYAN tek sorgu (`MIN(date)`/`MAX(date)`): bütün
   * partition'ları tarıyor ve üretimde ÖLÇÜLDÜ — 17.364 ms. Diğer beş
   * isteğin toplamı 12,5 saniyeydi ve onlar paralel; bu ise `await` ile
   * hepsinden ÖNCE bekliyordu. Yani ajans genel bakışında kullanıcının
   * beklediği sürenin en büyük parçası, o yüklemede HİÇ KULLANILMAYAN bir
   * değer içindi.
   *
   * Hata YUTULMUYOR ama aralığı da düşürmüyor: kapsam alınamazsa "Tüm
   * zamanlar" 90 güne düşüyor ve bu `date-range.ts` içinde yazılı.
   */
  const kapsam = enEskiGunGerekli(first(params.aralik))
    ? await serverApiFetch<{ earliestDate: string | null }>(
        `/metrics/coverage?from=${first(params.baslangic) ?? '2026-01-01'}&to=${first(params.bitis) ?? '2026-01-01'}`,
      ).catch(() => null)
    : null;

  const range = resolveRange({
    aralik: first(params.aralik),
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
    enEskiGun: kapsam?.earliestDate ?? null,
  });
  const platform = resolvePlatform(first(params.platform));
  const siralama = siralamaCoz(first(params.sirala));

  /*
   * ═══ ODAK: HİYERARŞİDE İNİLEN VARLIK ═══
   *
   * Kullanıcının isteği Google Ads'teki kampanya hiyerarşisi: şirket ›
   * workspace › kampanya › reklam seti › reklam, her basamak tıklanabilir.
   * Kampanyaya tıklandığında ekranın TAMAMI ona daralıyor — kartlar, grafik
   * ve tablo. Yalnızca tabloyu daraltmak, aynı ekranda iki farklı gerçek
   * göstermek olurdu.
   */
  const kampanya = first(params.kampanya);
  const reklamSeti = first(params.reklamSeti);

  /*
   * ODAKLIYKEN SEVİYE BİR ALT BASAMAĞA ÇEKİLİYOR.
   *
   * Bir kampanyanın içindeyken "kampanya" seviyesi anlamsız: kartlar tek
   * kampanyayı gösterirken tablo bütün kampanyaları listelerdi. Arayüzde bu
   * hâle düşmenin yolu yok (sekme odağı temizliyor) ama adres elle
   * yazılabiliyor ve sunucu buna bahis oynamamalı.
   */
  const istenenSeviye = resolveLevel(first(params.seviye));
  const level = reklamSeti
    ? 'ad'
    : kampanya && istenenSeviye === 'campaign'
      ? 'ad_group'
      : istenenSeviye;

  /*
   * BAĞLANTILARDA TAŞINAN SÜZGEÇLER — TEK YERDE.
   *
   * Platform sekmesi ve kırılım sekmesi bağlantılarını elle birleştiriyordu
   * ve kırılım sekmesi `platform`ı DÜŞÜRÜYORDU: kullanıcı "Meta" seçip
   * "Reklam seti"ne basınca süzgeç sessizce sıfırlanıyordu. Özel tarih
   * aralığı gelince taşınacak anahtar sayısı üçten beşe çıktı ve elle
   * birleştirme sürdürülemez hâle geldi.
   */
  const tasinan = {
    ...rangeParams(range),
    platform: platform ?? undefined,
    seviye: level,
    // Sıralama da TAŞINIYOR: seviye ya da platform değiştiren kullanıcının
    // seçtiği sütun düşerse süzgeç kaybolması hatasının aynısı olurdu.
    sirala: siralama,
    // ODAK DA TAŞINIYOR: platform sekmesi ya da tarih değiştiren kullanıcı
    // bulunduğu kampanyadan düşmemeli. Aynı unutkanlık `platform`ta
    // yaşanmıştı.
    kampanya,
    reklamSeti,
  };

  const base = new URLSearchParams({ from: range.from, to: range.to });
  /*
   * KARŞILAŞTIRMA PENCERESİ AÇIKÇA GİDİYOR. Sunucu eskiden bunu koşulsuz
   * kendisi hesaplıyordu; kullanıcı ne kapatabiliyor ne "önceki yıl"
   * seçebiliyordu. Pencereyi panel hesaplayıp EKRANDA YAZDIĞI için (seçicide
   * "1–31 Tem ile karşılaştırılacak") sorguya da o gitmeli — iki taraf ayrı
   * hesaplarsa yazan dönem ile karşılaştırılan dönem ayrışır.
   */
  if (range.compareFrom && range.compareTo) {
    base.set('compareFrom', range.compareFrom);
    base.set('compareTo', range.compareTo);
  }
  // PLATFORM FİLTRESİ ÜÇ SORGUYA DA gidiyor: özet, grafik ve dağılım aynı
  // kapsamı göstermeli. Yalnızca tabloya uygulamak, üstteki kartların
  // "toplam" gösterirken tablonun tek platformu listelemesi demek olurdu —
  // aynı ekranda iki farklı gerçek.
  if (platform) base.set('platform', platform);
  /*
   * ODAK ÜÇ SORGUYA DA gidiyor. Yalnızca tabloya uygulamak, üstteki
   * kartların workspace toplamını gösterirken tablonun tek bir kampanyanın
   * satırlarını listelemesi demek olurdu — platform süzgecinde aynı karar
   * aynı gerekçeyle verildi.
   */
  if (kampanya) base.set('campaignId', kampanya);
  if (reklamSeti) base.set('adGroupId', reklamSeti);
  const breakdownQs = new URLSearchParams(base);
  breakdownQs.set('level', level);
  breakdownQs.set('limit', String(KIRILIM_LIMITI));

  // Bir uç noktanın düşmesi TÜM ekranı düşürmemeli: panel açılıp "veri
  // alınamadı" demeli, 500 sayfası göstermemeli.
  /*
   * ═══ EKRANIN ÜÇ KATMANI: AJANS › ŞİRKET › WORKSPACE ═══
   *
   * Genel Bakış artık hiyerarşiyi izliyor ve her katmanda BİR ALT KATMANI
   * listeliyor:
   *
   *   · Ajans kapsamında ("Tüm şirketler")  → ŞİRKET tablosu
   *   · Şirket kapsamında, workspace seçili değilse → WORKSPACE tablosu
   *   · Workspace seçiliyse → kampanya/reklam kırılımı
   *
   * ÖNCEDEN AJANS KATMANI YOKTU: "Tüm şirketler" seçildiğinde bütün
   * şirketlerin workspace'leri tek düz tabloda listeleniyordu ve hangi
   * satırın hangi şirkete ait olduğu HİÇBİR YERDE yazmıyordu — "Tüm
   * müşteriler"de kampanya listelenirken düzeltilen hatanın bir üst
   * katmandaki tekrarı.
   *
   * SIRA ÖNEMLİ: ajans kontrolü ÖNCE geliyor. `tumSirketler` modunda
   * `activeClientId` daima null ve `availableClients` bütün şirketlerin
   * workspace'lerini taşıyor, yani `mcc` koşulu da doğru olurdu ve ekran
   * yine düz workspace listesi gösterirdi.
   *
   * WORKSPACE KATMANININ KOŞULU AKTİF SEÇİM, kullanıcının rolü DEĞİL: tek
   * workspace'i olan bir şirkette de `activeClientId` null olabiliyor ve
   * orada tek satırlık bir workspace tablosu, kampanya listesinden daha az
   * şey söylerdi — o yüzden `> 1` koşulu duruyor.
   */
  /*
   * Hata mesajı `Promise.all` içinden YAZILIYOR: `allSettled`a çevirmek beş
   * dalın hepsinin sonucunu açmayı gerektirirdi ve buradaki soru tek —
   * "özet neden gelmedi".
   */
  let ozetHatasi: string | null = null;

  const ajansGorunumu = session.tumSirketler;
  const mcc =
    !ajansGorunumu && session.activeClientId === null && session.availableClients.length > 1;

  /*
   * ═══ HATA YUTULMUYOR — "Metrikler alınamadı" TEK BAŞINA BİR ŞEY SÖYLEMİYOR
   * ═══
   *
   * Bu çağrı `.catch(() => null)` ile susturuluyordu ve ekranda tek bir
   * cümle kalıyordu: "Metrikler alınamadı. API çalışıyor mu?" Kullanıcı
   * ajans görünümünde bu ekranı gördü, şirket görünümünde görmedi ve
   * SEBEBİ HİÇBİR YERDE YAZMIYORDU — teşhis için sunucu loguna bakmak
   * gerekiyordu. Bu depoda adı konmuş yasağın ta kendisi.
   *
   * Sebep artık platformun KENDİ cümlesiyle ekranda; sayfa yine açılıyor.
   */
  const [summary, series, breakdown, musteriler, sirketler, yol] = await Promise.all([
    serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch((e: unknown) => {
      ozetHatasi = hataMetni(e);
      return null;
    }),
    // Tek günlük aralıkta grafik çizilmiyor; sorguyu da atlıyoruz.
    range.days > 1
      ? serverApiFetch<MetricsTimeseries>(`/metrics/timeseries?${base}`).catch(() => null)
      : Promise.resolve<MetricsTimeseries>({ points: [], previous: null }),
    // Üst katman görünümlerinde kampanya tablosu ÇEKİLMİYOR: gösterilmeyecek
    // bir sorguyu koşmak, en ağır sorgusu boşa giden bir ekran demekti.
    mcc || ajansGorunumu
      ? Promise.resolve(null)
      : serverApiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${breakdownQs}`).catch(
          () => null,
        ),
    mcc
      ? serverApiFetch<MetricsClientRow[]>(`/metrics/clients?${base}`).catch(() => null)
      : Promise.resolve(null),
    ajansGorunumu
      ? serverApiFetch<MetricsOrganizationRow[]>(`/metrics/organizations?${base}`).catch(
          () => null,
        )
      : Promise.resolve(null),
    /*
     * EKMEK KIRINTISININ İSİMLERİ — yalnızca odaklıyken çekiliyor.
     *
     * Ad kırılım satırlarında da duruyor (`parentName`) ama liste BOŞ
     * olabiliyor: seçili aralıkta o kampanyanın hiç reklam seti verisi
     * yoksa tablo boş döner ve şerit adsız kalırdı. Ad VERİDEN değil
     * YAPIDAN okunmalı.
     */
    kampanya || reklamSeti
      ? serverApiFetch<MetricsHierarchyPath>(
          `/metrics/kirilim-yolu?${new URLSearchParams({
            ...(kampanya ? { campaignId: kampanya } : {}),
            ...(reklamSeti ? { adGroupId: reklamSeti } : {}),
          })}`,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const activeClient = session.availableClients.find((c) => c.id === session.activeClientId);
  /*
   * BAŞLIK GÖVDEYLE AYNI ŞEYİ SÖYLEMEK ZORUNDA. Ajans kapsamında "Tüm
   * workspace'ler" yazmak, tablo ŞİRKET listelerken başlığın başka bir
   * katmandan bahsetmesi olurdu; bu depoda başlık≠gövde ayrışması bir kez
   * "veri sızıntısı" sanıldı.
   */
  const scopeLabel = ajansGorunumu
    ? 'Tüm şirketler'
    : (activeClient?.name ?? 'Tüm workspace’ler');

  /*
   * ═══ ŞERİDİN BASAMAKLARI — VAR OLANLAR ═══
   *
   * Basamak sayısı kullanıcının kurulumuna göre değişiyor ve eksik olanı
   * boş çizmek yerine HİÇ çizmiyoruz: üst hesabı olmayan bir kullanıcıya
   * "Tüm şirketler" göstermek, gidemeyeceği bir yere kapı açmak olurdu.
   *
   * SON BASAMAK BULUNDUĞUN YER ve bileşen onu bağlantı yapmıyor.
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
  if (activeClient) {
    // WORKSPACE BASAMAĞI ODAĞI TEMİZLİYOR: kampanyanın içinden workspace'e
    // dönmenin yolu bu.
    basamaklar.push({
      ad: activeClient.name,
      sorgu: { kampanya: undefined, reklamSeti: undefined, seviye: 'campaign' },
    });
  }
  if (yol?.campaign) {
    basamaklar.push({
      ad: yol.campaign.name,
      sorgu: { kampanya: yol.campaign.id, reklamSeti: undefined, seviye: 'ad_group' },
    });
  }
  if (yol?.adGroup) {
    basamaklar.push({ ad: yol.adGroup.name, sorgu: { reklamSeti: yol.adGroup.id, seviye: 'ad' } });
  }

  return (
    <div className="space-y-6">
      {/*
        ═══ BAŞLIK İKİ SIRA: BAĞLAM ÜSTTE, KONTROLLER ALTTA ═══
        Üçü (platform sekmeleri, tarih seçici, güncelle) başlıkla AYNI satırda
        duruyordu ve `flex-wrap` ile sığmayınca alt satıra tek tek düşüp
        başlığın altını parçalıyordu. Tablette en kötü hâlindeydi. Kontroller
        artık kendi sırasında: dar ekranda ikiye bölünüyor, asla başlığın
        altına sızmıyor.
      */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            {/* ŞERİT BAŞLIĞIN ÜSTÜNDE: "neredeyim" sorusunun cevabı, sayfanın
                adından önce okunmalı. */}
            {basamaklar.length > 1 && (
              <div className="mb-1">
                <HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} />
              </div>
            )}
            <h1 className="text-xl font-semibold text-ink">Genel Bakış</h1>
            {/*
              TAMAMLANMAMIŞ GÜN AYNI SATIRDA. Ayrı bir satırdayken başlık
              bloğu üç satıra çıkıyordu; uyarı kısa ve bağlamın parçası.
              Sabah 09:00'da görülen düşük harcama "kampanya durmuş" diye
              okunuyor, oysa gün bitmemiş.
            */}
            <p className="mt-0.5 text-sm text-ink-muted">
              {scopeLabel} · {formatDayLong(range.from)} - {formatDayLong(range.to)}
              {range.incomplete && (
                <span className="text-warn-strong"> · Gün bitmedi, rakamlar artacak</span>
              )}
            </p>
          </div>
          {/*
            TAZELİK BAŞLIKTA, SAYFANIN DİBİNDE DEĞİL. "Veriler ne zaman
            güncellendi" en çok bakılan bilgilerden biriydi ve en az görünen
            yerde, 12 piksellik gri bir satırda duruyordu. Güncelle düğmesinin
            hemen yanında olması da doğru: kullanıcı buna bakıp o düğmeye
            basıyor.
          */}
          {summary !== null && (
            <p className="text-[11px] text-ink-muted">
              {summary.accountCount} reklam hesabı · {formatRelative(summary.lastFetchedAt)}{' '}
              güncellendi
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PlatformTabs current={platform} tasinan={tasinan} />
          <div className="flex flex-1 items-center justify-end gap-2">
            <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
            {/*
              "GEÇMİŞ VERİYİ ÇEK" DÜĞMESİ KALDIRILDI: işi iki yere dağıldı ve
              ikisi de kendiliğinden çalışıyor. Hesap bir workspace'e
              atandığında 90 günlük geçmiş kuyruğa giriyor; "Şimdi güncelle"
              de ekranda seçili aralığı yeniliyor. Üçüncü bir düğme,
              kullanıcıya hangisine basacağını sorduruyordu.
            */}
            <RefreshButton dateFrom={range.from} dateTo={range.to} rangeLabel={range.label} />
          </div>
        </div>
      </header>

      {summary === null ? (
        <Notice tone="error">
          {/* TEKNİK AYRINTI EKRANDAN KALKTI: `pm2 logs` komutu müşterinin
              okuduğu bir ekranda hem anlamsız hem ürkütücü. Sunucunun kendi
              hata cümlesi duruyor, teşhis için o yeterli. */}
          <strong>Veriler alınamadı.</strong>
          {ozetHatasi && <span className="ml-1">{ozetHatasi}</span>}
        </Notice>
      ) : summary.accountCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/*
            ═══ UYARILAR TEK KUTUDA ═══
            Üçü ayrı ayrı tam genişlikte sarı kutulardı ve aynı anda
            çıkabiliyorlardı: kötü bir günde kullanıcı tek bir rakam görmeden
            üç katlı bir uyarı duvarına bakıyordu. Aynı bilgi, tek kutuda alt
            alta satırlar olarak duruyor ve sayfanın ağırlık merkezi
            rakamlarda kalıyor.
          */}
          <Uyarilar
            satirlar={[
              summary.currency === null && summary.byCurrency.length > 1 ? (
                <>
                  <strong>Birden fazla para birimi var</strong> (
                  {summary.byCurrency.map((c) => c.currency).join(', ')}). Tutarlar ayrı
                  gösteriliyor.
                </>
              ) : null,
              /* İZLENMEYEN HESAPLAR SESSİZCE DÜŞMÜYOR. Kapatılan bir hesabın
                 harcaması toplamdan çıkıyor ve sebebini görmeyen kullanıcı
                 "harcama neden azaldı" diye sorar. */
              summary.hiddenAccounts > 0 ? (
                <>
                  <strong>{summary.hiddenAccounts} hesap izlenmiyor</strong> ve bu rakamlara
                  dâhil değil. Verileri duruyor; Platform Bağlantıları sayfasından yeniden
                  açabilirsin.
                </>
              ) : null,
              isStale(summary.lastFetchedAt) ? (
                <>Veriler {formatRelative(summary.lastFetchedAt)} güncellendi. Güncelleme durmuş olabilir.</>
              ) : null,
            ]}
          />

          {/*
            ÖZET TEK BLOK: kartlar ve şerit aynı soruyu cevaplıyor, aralarına
            bölümler arası boşluk koymak ikisini ayrı düşünce birimi gibi
            gösteriyordu. Dışarıdaki `space-y-6` bölümleri ayırıyor, buradaki
            `space-y-3` özeti birbirine bağlıyor.
          */}
          <div className="space-y-3">
            <Cards summary={summary} karsilastir={range.karsilastirma !== 'yok'} />
            <SecondaryStrip summary={summary} karsilastir={range.karsilastirma !== 'yok'} />
          </div>

          {/* TEK GÜNLÜK ARALIKTA GRAFİK YOK.
              Bir gün için zaman serisi tek bir bar demek: kocaman boş bir
              kutuda hiçbir eğilim göstermeyen tek çubuk. Kartlar aynı bilgiyi
              daha okunur veriyor. Saat bazlı kırılım olsa anlamlı olurdu ama
              `insights_daily` günlük granülerlikte. */}
          {range.days > 1 &&
            (series === null ? (
              <Notice tone="error">Grafik verisi alınamadı.</Notice>
            ) : (
              <MetricsChart
                points={series.points}
                previous={series.previous}
                from={range.from}
                to={range.to}
                compareFrom={range.compareFrom}
                compareTo={range.compareTo}
                currency={summary.currency}
              />
            ))}

          {ajansGorunumu ? (
            sirketler === null ? (
              <Notice tone="error">Şirket dağılımı alınamadı.</Notice>
            ) : (
              <SirketTablosu rows={sirketler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : mcc ? (
            musteriler === null ? (
              <Notice tone="error">Workspace dağılımı alınamadı.</Notice>
            ) : (
              <MusteriTablosu rows={musteriler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : breakdown === null ? (
            <Notice tone="error">Dağılım verisi alınamadı.</Notice>
          ) : (
            <BreakdownTable
              /*
               * SIRALAMA BURADA UYGULANIYOR, SORGUDA DEĞİL. Satır kümesi her
               * zaman "harcamaya göre ilk N"; `ORDER BY`ı SQL'e taşımak
               * kümeyi de değiştirirdi ve "mecraya göre sırala" diyen
               * kullanıcı bir platformu tabloda HİÇ göremezdi.
               */
              rows={kirilimSirala(breakdown, siralama)}
              level={level}
              tasinan={tasinan}
              currency={summary.currency}
              siralama={siralama}
              limit={KIRILIM_LIMITI}
              /* ÇÖZÜLMÜŞ TARİHLER: `tasinan` ön ayar kodu taşıyor ("son30"),
                 önizleme ucu gerçek tarih istiyor. İkinci kez çözmek, aynı
                 aralığı iki yerde hesaplamak olurdu. */
              range={{ from: range.from, to: range.to }}
            />
          )}

          {/*
            HESAP SAYISI VE TAZELİK BAŞLIĞA TAŞINDI. Burada kalan tek şey
            aralığın sınırı ve o da YALNIZCA bugün dâhil değilken yazılıyor:
            dâhilken başlıktaki uyarı zaten aynı şeyi söylüyor ve iki yerde
            tekrar etmek, ekranın kendi kendine açıklama yapması demek.
          */}
          {!range.incomplete && <p className="text-xs text-ink-muted">Bugün dâhil değil</p>}
        </>
      )}
    </div>
  );
}

function Cards({
  summary,
  karsilastir,
}: {
  summary: MetricsSummary;
  karsilastir: boolean;
}) {
  /*
   * KARŞILAŞTIRMA KAPALIYSA DELTA DA YOK.
   *
   * Sunucu geriye dönük uyum için önceki dönemi yine döndürüyor (rapor bu
   * ucu parametresiz çağırıyor). Onu ekranda göstermek, seçicide "Karşılaştır
   * kapalı" yazarken kartlarda yüzde değişim basmak demek olurdu — düğme
   * yaptığını söylemeyen bir düğme olurdu.
   */
  const prev = karsilastir ? summary.previous : null;
  const currency = summary.currency;

  // Karışık para biriminde tek bir harcama toplamı göstermek yanlış olurdu;
  // tutarları para birimi başına yan yana veriyoruz.
  const spendValue =
    currency === null && summary.byCurrency.length > 1
      ? summary.byCurrency
          .map((c) => formatMoney(c.spendMicros, c.currency, { compact: true }))
          .join(' + ')
      : formatMoney(summary.spendMicros, currency);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Harcama"
        value={spendValue}
        change={changePercentMicros(summary.spendMicros, prev?.spendMicros)}
        emphasis
      />
      <MetricCard
        label="Dönüşüm"
        value={formatNumber(summary.conversions)}
        change={changePercent(summary.conversions, prev?.conversions)}
      />
      <MetricCard
        label="CPA"
        value={formatMoney(microsOf(summary.cpa), currency)}
        // ARTIŞ KÖTÜ: dönüşüm başına maliyet yükseliyorsa kırmızı olmalı.
        inverse
        change={summary.cpa === null ? null : changePercent(summary.cpa, prev?.cpa)}
        hint={summary.cpa === null ? 'dönüşüm yok' : undefined}
      />
      {/* ROAS YERİNE ERİŞİM — gelir takip edilmiyorsa.
          Lead formu ve mesajlaşma kampanyalarında gelir değeri hiç yok ve
          ROAS kartı sürekli "—" gösteriyor: bir kart boyunca yer kaplayıp
          hiçbir şey söylemiyor. Erişim o hesaplarda anlamlı bir dördüncü
          metrik. Gelir varsa ROAS geri geliyor — asıl karar metriği o. */}
      {summary.roas === null ? (
        <MetricCard
          label={summary.reachKind === 'exact' ? 'Erişim' : 'Günlük ort. erişim'}
          value={formatNumber(summary.reach)}
          hint={
            summary.reach === null
              ? 'platform bildirmiyor'
              : summary.reachAcrossAccounts
                ? 'hesaplar arası mükerrer olabilir'
                : summary.reachKind === 'daily_average'
                  ? 'tekil erişim toplanamaz'
                  : undefined
          }
        />
      ) : (
        <MetricCard label="ROAS" value={formatRoas(summary.roas)} change={changePercent(summary.roas, prev?.roas)} />
      )}
    </div>
  );
}

/** İkincil metrikler — bağlam veriyor, karar verdirmiyor. */
function SecondaryStrip({
  summary,
  karsilastir,
}: {
  summary: MetricsSummary;
  karsilastir: boolean;
}) {
  const prev = karsilastir ? summary.previous : null;
  const currency = summary.currency;

  return (
    <MetricStrip
      items={[
        {
          label: 'Gösterim',
          value: formatNumber(summary.impressions),
          change: changePercent(summary.impressions, prev?.impressions),
        },
        {
          label: 'Tık',
          value: formatNumber(summary.clicks),
          change: changePercent(summary.clicks, prev?.clicks),
        },
        {
          label: 'CTR',
          value: formatPercent(summary.ctr),
          change: summary.ctr === null ? null : changePercent(summary.ctr, prev?.ctr),
        },
        {
          label: 'CPC',
          value: formatMoney(microsOf(summary.cpc), currency),
          // Artış kötü: tık başına maliyet yükselmesi iyi haber değil.
          inverse: true,
          change: summary.cpc === null ? null : changePercent(summary.cpc, prev?.cpc),
        },
      ]}
    />
  );
}

/**
 * Platform sekmeleri.
 *
 * "Tümü" varsayılan çünkü bu ürünün ana vaadi iki platformu TEK ekranda
 * toplamak. Sekmeler o vaadi bozmuyor, derinleşme yolu açıyor: bir platformun
 * kampanyalarına odaklanmak istediğinde diğerinin gürültüsü kalkıyor.
 *
 * Seçim URL'de taşınıyor — sayfa sunucu bileşeni ve seçim için JS inmiyor;
 * ayrıca bağlantı paylaşılabilir oluyor.
 */
function PlatformTabs({
  current,
  tasinan,
}: {
  current: Platform | null;
  tasinan: Record<string, string | undefined>;
}) {
  /*
   * SEKMELER `PLATFORMS`TAN. Elle yazılıydı ve tuhaf bir hâl üretiyordu:
   * `resolvePlatform` LinkedIn'i URL'den ÇÖZÜYOR ama tıklanacak sekme YOK —
   * yani özellik var, girişi yok.
   */
  const options: Array<{ key: Platform | null; label: string }> = [
    { key: null, label: 'Tümü' },
    ...PLATFORMS.map((p) => ({ key: p as Platform | null, label: PLATFORM_KISA_ADLARI[p] })),
  ];
  return (
    <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Platform">
      {options.map((o) => {
        const active = current === o.key;
        return (
          <Link
            key={o.label}
            href={baglanti('/dashboard', tasinan, { platform: o.key ?? undefined })}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz veri yok</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Bir platform bağlayıp reklam hesabını bir workspace&apos;e ata. Veriler kısa süre içinde
        burada görünür.
      </p>
      <Link
        href="/ayarlar/baglantilar"
        className="mt-4 inline-flex rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        Bağlantılara git
      </Link>
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
  const dolu = satirlar.filter((x): x is React.ReactNode => x !== null && x !== false);
  if (dolu.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-warn/30 bg-warn-soft text-sm text-warn-strong"
    >
      <ul className="divide-y divide-warn/20">
        {dolu.map((satir, i) => (
          <li key={i} className="px-3.5 py-2">
            {satir}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-warn/30 bg-warn-soft text-warn-strong'
      : 'border-danger/30 bg-danger-soft text-danger-strong';
  return (
    /*
     * HATA `alert`, UYARI `status`. İkisi de `status` iken ekran okuyucu
     * hatayı sıradan bir güncelleme gibi duyuruyordu: kullanıcı verinin
     * alınamadığını öğrenmeden sayfada gezinmeye devam ediyordu.
     */
    <div
      className={`rounded-lg border px-3.5 py-2.5 text-sm ${cls}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

/** Oranı micros string'e çevirir — `formatMoney` tek bir giriş biçimi bekliyor. */
/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.';
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Platform parametresi.
 *
 * Bilinmeyen değer "tümü"ye düşüyor, hata vermiyor: URL elle düzenlenmiş
 * olabilir ve bir yazım hatası yüzünden panelin açılmaması abartı olurdu.
 */
function resolvePlatform(raw: string | undefined): Platform | null {
  /*
   * LİSTEDEN ÇÖZÜLÜYOR, ELLE DALLANMIYOR.
   *
   * Burada `raw === 'meta' || raw === 'google'` yazıyordu ve üçüncü platform
   * eklenince en can sıkıcı hâli üretecekti: LinkedIn süzgecini seçen
   * kullanıcı bilinmeyen değer sayılıp SESSİZCE "tümü"ye dönerdi. Hata yok,
   * uyarı yok — sadece yanlış rakamlar. CLAUDE.md'deki "süzgeç bazen
   * kayboluyor" hatasının aynısı.
   */
  return PLATFORMS.find((p) => p === raw) ?? null;
}

function resolveLevel(raw: string | undefined): MetricLevel {
  // `account` sekmesi YOK: hesap seviyesi zaten üstteki kartlar. Tabloda
  // göstermek aynı sayıyı iki kez göstermek olurdu.
  return METRIC_LEVELS.includes(raw as MetricLevel) && raw !== 'account'
    ? (raw as MetricLevel)
    : 'campaign';
}
