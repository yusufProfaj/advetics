import Link from 'next/link';
import type {
  MetricsAccountBreakdown,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsConversionDetail,
  MetricsHierarchyPath,
  MetricsOrganizationRow,
  MetricsSummary,
} from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { enEskiGunGerekli, rangeParams, resolveRange } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
import { formatDayLong } from '@/lib/format';
import { BreakdownTable } from '@/components/breakdown-table';
import { HesapKirilimi } from '@/components/hesap-kirilimi';
import {
  hesapCoz,
  panelSeviyesiCoz,
  varlikSeviyesi,
} from '@/lib/genel-bakis-seviyesi';
import { DonusumDetay } from '@/components/donusum-detay';
import { MusteriTablosu } from '@/components/musteri-tablosu';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { SirketTablosu } from '@/components/sirket-tablosu';
import { Uyari, UyariListesi } from '@/components/ui/uyari';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { kirilimSirala, siralamaCoz } from '@/lib/kirilim-siralama';
import {
  PerformansKutulari,
  PlatformSekmeleri,
  VeriYokDurumu,
} from '@/components/genel-bakis/ozet-parcalari';
import { first, hataMetni, resolvePlatform } from '@/lib/sayfa-yardimcilari';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';

export const metadata = { title: 'Reklam Yöneticisi · Advetics' };

/**
 * ═══ REKLAM YÖNETİCİSİ (2026-10-09) ═══
 *
 * Kullanıcının tarifi: "şirketler listelenecek ve genel → şirket →
 * workspace → hesap → mecra → kampanya → reklam seti → reklam → reklam
 * önizlemesi". Bu iniş zinciri Genel Bakış'ın altında ZATEN vardı ve
 * çalışıyordu; ekran sıfırdan yazılmadı, zincir buraya TAŞINDI (Google
 * Ads'te de hesap özeti ile kampanya tablosu ayrı ekranlar). Genel Bakış
 * artık özet ve "bugün ne yapmalıyım" ekranı, ilk beş satırı gösterip
 * buraya bağlanıyor.
 *
 * Eski reklam kartları ekranı (arama, "Sorunlu" süzgeci) KALDIRILMADI,
 * Reklam Galerisi olarak alt sayfada (`/ads-explorer/galeri`).
 *
 * Sunucu bileşeni; seviye, odak ve süzgeçler adreste. Kapsam (şirket,
 * workspace) oturumda: satıra tıklayınca `switch-org`/`switch-client`
 * çağrılıyor ve kullanıcı AYNI SAYFADA kalıyor.
 */

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

/**
 * Açılış aralığı Genel Bakış'la AYNI ("bu ay"): Genel Bakış'taki "Tümü"
 * bağlantısıyla gelen kullanıcı aynı dönemin rakamlarını görmeli; iki ekran
 * iki ayrı dönem açarsa aynı şirketin harcaması iki farklı sayı olur.
 */
const ACILIS_ARALIGI = 'bu_ay';

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
  /*
   * GENEL BAKIŞ "BU AY" İLE AÇILIR (kullanıcı kararı, 2026-10-07).
   * Ortak varsayılan (`DEFAULT_RANGE`, son 30 gün) raporlar ve reklam
   * gezgini için kalıyor; onu değiştirmek o ekranları da habersiz kaydırırdı.
   * Seçim adreste yoksa burada dolduruluyor: takvim seçili ön ayarı
   * çözülen aralıktan okuduğu için "Bu ay" işaretli geliyor, ve sekme
   * bağlantıları `rangeParams` ile `aralik=bu_ay` taşıyor.
   */
  const aralik = first(params.aralik) ?? ACILIS_ARALIGI;
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
   * HESAP: workspace › HESAP › kampanya basamağı. Kartlar, grafik ve tablo o
   * hesaba daralıyor — kampanya odağıyla aynı gerekçe.
   */
  const hesap = hesapCoz(first(params.hesap));

  /*
   * ODAKLIYKEN SEVİYE BİR ALT BASAMAĞA ÇEKİLİYOR.
   *
   * Bir kampanyanın içindeyken "kampanya" seviyesi anlamsız: kartlar tek
   * kampanyayı gösterirken tablo bütün kampanyaları listelerdi. Arayüzde bu
   * hâle düşmenin yolu yok (sekme odağı temizliyor) ama adres elle
   * yazılabiliyor ve sunucu buna bahis oynamamalı.
   */
  const level = panelSeviyesiCoz({
    seviye: first(params.seviye),
    hesap,
    kampanya,
    reklamSeti,
  });
  /** `null` = reklam hesapları basamağı: tablo `/metrics/hesaplar`tan. */
  const varlik = varlikSeviyesi(level);

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
    hesap,
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
  if (hesap) base.set('adAccountId', hesap);
  if (kampanya) base.set('campaignId', kampanya);
  if (reklamSeti) base.set('adGroupId', reklamSeti);
  const breakdownQs = new URLSearchParams(base);
  if (varlik) breakdownQs.set('level', varlik);
  breakdownQs.set('limit', String(KIRILIM_LIMITI));
  /*
   * HESAP KIRILIMI HESAP SÜZGECİ TAŞIMIYOR: soru "hangi hesap ne harcıyor"
   * ve şema `adAccountId` kabul etmiyor. Tarih, karşılaştırma ve mecra
   * gidiyor.
   */
  const hesapQs = new URLSearchParams({ from: range.from, to: range.to });
  if (range.compareFrom && range.compareTo) {
    hesapQs.set('compareFrom', range.compareFrom);
    hesapQs.set('compareTo', range.compareTo);
  }
  if (platform) hesapQs.set('platform', platform);

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

  const [summary, breakdown, musteriler, sirketler, donusum, yol, hesaplar] =
    await Promise.all([
    serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch((e: unknown) => {
      ozetHatasi = hataMetni(e);
      return null;
    }),
    // Üst katman görünümlerinde kampanya tablosu ÇEKİLMİYOR: gösterilmeyecek
    // bir sorguyu koşmak, en ağır sorgusu boşa giden bir ekran demekti.
    // HESAP BASAMAĞINDA kampanya kırılımı da çekilmiyor — aynı gerekçe.
    mcc || ajansGorunumu || varlik === null
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
    /*
     * DÖNÜŞÜM DETAYI — üst katman görünümlerinde ÇEKİLMİYOR.
     *
     * Ajans ve şirket kapsamında ekran şirket/workspace listeliyor; dönüşüm
     * eylemleri o katmanda anlamsız (hangi workspace'in WhatsApp tıklaması
     * olduğu yazmıyor) ve sorgu ham JSONB gövdelerini çekiyor — gösterilmeyen
     * bir listeyi doldurmak, en pahalı sorgulardan birini boşa koşturmak
     * olurdu.
     */
    // REKLAM YÖNETİCİSİNDE yalnızca bir varlık seviyesindeyken: workspace
    // genelindeki dönüşüm listesi Genel Bakış'ta duruyor.
    mcc || ajansGorunumu || varlik === null
      ? Promise.resolve(null)
      : serverApiFetch<MetricsConversionDetail>(`/metrics/donusum-detay?${base}`).catch(
          () => null,
        ),
    kampanya || reklamSeti || hesap
      ? serverApiFetch<MetricsHierarchyPath>(
          `/metrics/kirilim-yolu?${new URLSearchParams({
            ...(hesap ? { adAccountId: hesap } : {}),
            ...(kampanya ? { campaignId: kampanya } : {}),
            ...(reklamSeti ? { adGroupId: reklamSeti } : {}),
          })}`,
        ).catch(() => null)
      : Promise.resolve(null),
    !mcc && !ajansGorunumu && varlik === null
      ? serverApiFetch<MetricsAccountBreakdown>(`/metrics/hesaplar?${hesapQs}`).catch(() => null)
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
    // WORKSPACE BASAMAĞI ODAĞI, HESABI VE MECRAYI TEMİZLİYOR: kampanyanın ya
    // da hesabın içinden workspace'in bütün reklam hesaplarına dönmenin yolu.
    basamaklar.push({
      ad: activeClient.name,
      sorgu: {
        platform: undefined,
        hesap: undefined,
        kampanya: undefined,
        reklamSeti: undefined,
        seviye: 'hesap',
      },
    });
    /*
     * HESAP BASAMAĞI. Hesap kampanyadan türetiliyor (`kirilim-yolu`):
     * kampanya bağlantısı hesapsız açıldığında da şerit hangi hesabın içinde
     * olunduğunu söylemeli. Mecra adı basamağın içinde — ayrı bir mecra
     * basamağı kullanıcı kararıyla kalktı.
     */
    if (yol?.adAccount) {
      basamaklar.push({
        ad: `${PLATFORM_KISA_ADLARI[yol.adAccount.platform]} · ${yol.adAccount.name}`,
        sorgu: {
          platform: yol.adAccount.platform,
          hesap: yol.adAccount.id,
          kampanya: undefined,
          reklamSeti: undefined,
          seviye: 'campaign',
        },
      });
    }
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
    <div className="space-y-4">
      <SayfaBasligi
        baslik="Reklam Yöneticisi"
        ust={<HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} />}
        aciklama={
          <>
            {scopeLabel} · {formatDayLong(range.from)} - {formatDayLong(range.to)}
            {range.incomplete && <span className="text-warn-strong"> · Gün bitmedi</span>}
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

      <div className="flex flex-wrap items-center gap-2">
        <PlatformSekmeleri
          yol={REKLAM_YONETICISI}
          current={platform}
          hesap={hesap}
          seviye={level}
          tasinan={tasinan}
        />
        {summary !== null && (
          <span className="text-xs text-ink-muted">{summary.accountCount} reklam hesabı</span>
        )}
        {/*
          REKLAM GALERİSİ: metinle arama ve "Sorunlu" süzgeci orada. Tablonun
          üstünde durması, reddedilen reklamı arayan kullanıcının o ekranın
          varlığını bilmesi için.
        */}
        <Link
          href={`${REKLAM_YONETICISI}/galeri`}
          className="ml-auto text-xs font-semibold text-brand-strong hover:underline"
        >
          Reklam Galerisi (arama, sorunlu reklamlar) →
        </Link>
      </div>

      {summary === null ? (
        <Uyari ton="tehlike">
          <strong>Veriler alınamadı.</strong>
          {ozetHatasi && <span className="ml-1">{ozetHatasi}</span>}
        </Uyari>
      ) : summary.accountCount === 0 ? (
        <VeriYokDurumu />
      ) : (
        <>
          {/* İzlenmeyen hesap bu rakamlara girmiyor: söylenmezse "harcama neden az" sorulur. */}
          <UyariListesi
            satirlar={[
              summary.hiddenAccounts > 0 ? (
                <>
                  <strong>{summary.hiddenAccounts} hesap izlenmiyor</strong> ve bu rakamlara dâhil
                  değil.
                </>
              ) : null,
            ]}
          />

          {/*
            ÖZET VE TABLO TEK AKIŞTA: kutular tablonun kapsamını (şirket,
            workspace, hesap, kampanya) özetliyor. Google Ads'te de metrik
            kutuları tablonun hemen üstünde ve aynı süzgeçle.
          */}
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-kart">
            <PerformansKutulari summary={summary} karsilastir={range.karsilastirma !== 'yok'} />
          </section>

          {ajansGorunumu ? (
            sirketler === null ? (
              <Uyari ton="tehlike">Şirket dağılımı alınamadı.</Uyari>
            ) : (
              <SirketTablosu rows={sirketler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : mcc ? (
            musteriler === null ? (
              <Uyari ton="tehlike">Workspace dağılımı alınamadı.</Uyari>
            ) : (
              <MusteriTablosu rows={musteriler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : varlik === null ? (
            hesaplar === null ? (
              <Uyari ton="tehlike">Hesap dağılımı alınamadı.</Uyari>
            ) : (
              <HesapKirilimi
                veri={hesaplar}
                platform={platform}
                tasinan={tasinan}
                siralama={siralama}
              />
            )
          ) : breakdown === null ? (
            <Uyari ton="tehlike">Dağılım verisi alınamadı.</Uyari>
          ) : (
            <>
              <BreakdownTable
                rows={kirilimSirala(breakdown, siralama)}
                level={varlik!}
                tasinan={tasinan}
                currency={summary.currency}
                siralama={siralama}
                limit={KIRILIM_LIMITI}
                range={{ from: range.from, to: range.to }}
              />
              {/* Seçili kampanyanın/setin dönüşümleri NEYDİ: tablonun altında, aynı odakta. */}
              {donusum !== null && <DonusumDetay detay={donusum} currency={summary.currency} />}
            </>
          )}

          {!range.incomplete && <p className="text-xs text-ink-muted">Bugün dâhil değil</p>}
        </>
      )}
    </div>
  );
}
