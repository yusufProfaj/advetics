import Link from 'next/link';
import type {
  MetricsAccountBreakdown,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsHierarchyPath,
  MetricsOrganizationRow,
  MetricsAccountRow,
  MetricsSummary,
} from '@advetics/shared';
import { PLATFORMS, PLATFORM_KISA_ADLARI, type KitlePerformansi, type TakipAcigiYaniti } from '@advetics/shared';
import { kapi, markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { HedefKitleler, type KitleAltSekmesi } from '@/components/taslak/hedef-kitleler';
import { VarlikBirincilEylem } from '@/components/marka-merkezi/varliklar/birincil-eylem';
import { requireSession } from '@/lib/session';
import { HESAP_AJANSTA, hesaplarHedefi } from '@/lib/ayar-kapilari';
import { serverApiFetch } from '@/lib/api';
import { enEskiGunGerekli, rangeParams, resolveRange } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
import { changePercent, changePercentMicros, formatDayLong, formatMoney, formatNumber, microsOf } from '@/lib/format';
import {
  hesapCoz,
  panelSeviyesiCoz,
  platformSekmesiSorgusu,
  varlikSeviyesi,
} from '@/lib/genel-bakis-seviyesi';
import { baglanti } from '@/lib/baglanti';
import {
  ReklamYoneticisiTablosu,
  type YmDuzey,
  type YmMetrik,
  type YmSatir,
  type YmSekme,
  type YmSekmeAnahtari,
} from '@/components/taslak/reklam-yoneticisi-tablosu';
import { SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { kirilimSirala, siralamaCoz } from '@/lib/kirilim-siralama';
import { first, hataMetni, resolvePlatform } from '@/lib/sayfa-yardimcilari';
import { REKLAM_YONETICISI, olusturDugmesi } from '@/lib/reklam-yoneticisi';
import { eylemHedefiCoz } from '@/lib/varlik-eylemi';
import { siteSutunuKarari, sitedeHaritasi } from '@/lib/veri-kaynagi';
import { sec, type Dil } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';

/** Başlık istek anında: dil çerezden okunuyor (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  // SAYFA ADI MENÜNÜN KENDİ ÇEVİRİSİNDEN (`nav-sections.spec.ts` "MENÜDEKİ AD İLE SAYFANIN ADI AYNI").
  return { title: `${menuSatiriEtiketi('/ads-explorer', await dilAl())} · Advetics` };
}

/** Sayfanın sözlüğü; yardımcılar metni parametreyle alıyor (modül düzeyinde dil yok). */
type RY = (typeof reklamYoneticisiSozlugu)['tr'];

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
  const dil = await dilAl();
  const d = sec(reklamYoneticisiSozlugu, dil);
  /*
   * "HESABI ATA / İZLEMEYİ AÇ" BAĞLANTISI YALNIZ HEDEFİ AÇIKSA (MIMARI
   * Ç-19): müşteri hesabı bu ekranı görüyor ve "Bağlantılara git"e basınca
   * 403 alıyordu. Kapalıysa bağlantı yerine "ajansınıza yazın".
   */
  const hesapHedefi = hesaplarHedefi(session, session.activeClientId);


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

  const [summary, breakdown, musteriler, sirketler, yol, hesaplar] =
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
    ? d.tumSirketler
    : (activeClient?.name ?? d.tumWorkspaceler);

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
    basamaklar.push({ ad: d.tumSirketler, kapsam: { tip: 'ajans' } });
  }
  if (!ajansGorunumu) {
    const sirketAdi =
      session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)
        ?.name ?? session.organization.name;
    basamaklar.push({ ad: sirketAdi, kapsam: { tip: 'sirket' }, duzey: d.duzeyAdi.sirket });
  }
  if (activeClient) {
    // WORKSPACE BASAMAĞI ODAĞI, HESABI VE MECRAYI TEMİZLİYOR: kampanyanın ya
    // da hesabın içinden workspace'in bütün reklam hesaplarına dönmenin yolu.
    basamaklar.push({
      ad: activeClient.name,
      duzey: 'Workspace',
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
        duzey: d.duzeyAdi.hesap,
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
      duzey: d.duzeyAdi.kampanya,
      sorgu: { kampanya: yol.campaign.id, reklamSeti: undefined, seviye: 'ad_group' },
    });
  }
  if (yol?.adGroup) {
    basamaklar.push({ ad: yol.adGroup.name, duzey: d.duzeyAdi.reklamSeti, sorgu: { reklamSeti: yol.adGroup.id, seviye: 'ad' } });
  }

  /*
   * ═══ TEK TABLO: HER DÜZEY AYNI BİÇİME ÇEVRİLİYOR ═══
   * Onaylanan taslakta tek kart ve tek tablo var; düzey değişince yalnız
   * satırlar değişiyor. Eski ekranda dört ayrı bileşen (şirket, workspace,
   * hesap, kırılım tablosu) dört ayrı görünüş çiziyordu.
   */
  /*
   * "SİTEDE" SÜTUNU (Paket F1, MIMARI § 3.4): yalnız KAMPANYA düzeyinde ve
   * tek workspace seçiliyken. GA4 bağlı değilse sütun hiç açılmıyor
   * (`siteSutunuKarari`). Hata YUTULMUYOR: sütun açık kalıyor ve platformun
   * cümlesi tablonun altında yazıyor (`.catch(() => [])` yasağı).
   */
  const siteYaniti =
    varlik === 'campaign' && !mcc && !ajansGorunumu && session.activeClientId
      ? await serverApiFetch<TakipAcigiYaniti>(
          `/veri-kaynaklari/takip-acigi?${new URLSearchParams({ clientId: session.activeClientId, from: range.from, to: range.to })}`,
        ).catch((e: unknown) => ({ hata: hataMetni(e) }))
      : null;
  const site = siteYaniti === null ? null : siteSutunuKarari(siteYaniti, dil);
  const sitede = siteYaniti && !('hata' in siteYaniti) ? sitedeHaritasi(siteYaniti) : null;

  const duzey: YmDuzey = ajansGorunumu ? 'sirket' : mcc ? 'workspace' : varlik === null ? 'hesap' : varlik;
  /*
   * ═══ HEDEF KİTLELER SEKMESİ (2026-10-16) ═══
   * "Hangi kitleden ne dönüş geldi": aynı hedeflemeli reklam setleri tek
   * satırda (`/metrics/kitleler`). Yalnız tek workspace seçiliyken: kitle
   * bir workspace'in hedeflemesi, ajans/şirket toplamında anlamsız. Hata
   * yutulmuyor, tablonun yerinde platformun/sunucunun cümlesi yazıyor.
   */
  const kitleGorunumu = first(params.seviye) === 'kitle' && !ajansGorunumu && !mcc;
  /*
   * Alt sekme (2026-10-20): kayıtlı kitleler varsayılan; performans çağrısı
   * yalnız o sekmede. ŞİRKET DÜZEYİNDE ("Tüm workspace'ler") seçili
   * workspace yok ve kayıtlı kitle workspace'e ait: varsayılan orada
   * PERFORMANS. Canlıda bu durumda sekme seçili görünüp altında hesap
   * tablosu çiziliyordu (görünüm workspace'siz sessizce düşüyordu).
   */
  const kitleAltParam = first(params.kitle);
  const kitleAlt: KitleAltSekmesi =
    kitleAltParam === 'performans' || (kitleAltParam !== 'kayitli' && !session.activeClientId) ? 'performans' : 'kayitli';
  const kitleYaniti: { tur: 'veri'; v: KitlePerformansi } | { tur: 'hata'; mesaj: string } | null = kitleGorunumu && kitleAlt === 'performans'
    ? await serverApiFetch<KitlePerformansi>(`/metrics/kitleler?${base}`)
        .then((v) => ({ tur: 'veri' as const, v }))
        .catch((e: unknown) => ({ tur: 'hata' as const, mesaj: hataMetni(e) }))
    : null;
  const seciliSekme: YmSekmeAnahtari = kitleGorunumu ? 'kitle' : duzey;
  const satirlar: YmSatir[] | null = ajansGorunumu
    ? sirketler && sirketler.map((r) => sirketSatiri(r, d.satir))
    : mcc
      ? musteriler && musteriler.map((r) => workspaceSatiri(r, d.satir))
      : varlik === null
        ? hesaplar && hesaplar.accounts.map((a) => hesapSatiri(a, tasinan, d.satir))
        : breakdown &&
          kirilimSirala(breakdown, siralama).map((b) => ({
            ...varlikSatiri(b, varlik, tasinan, d.satir),
            /*
             * KAMPANYA SATIRININ ⋯ MENÜSÜ: aynı kampanyanın reklam kartları
             * Galeri'de. Kimlik aynı uzayda (iki uç da iç kampanya UUID'si
             * alıyor) ve tarih anahtarları taşınıyor: aralık düşerse Galeri
             * başka dönemin reklamlarını gösterirdi.
             */
            ...(varlik === 'campaign'
              ? { galeriHref: baglanti(`${REKLAM_YONETICISI}/galeri`, rangeParams(range), { kampanya: b.entityId }) }
              : {}),
            ...(site ? { sitede: sitede?.get(b.entityId) ?? null } : {}),
          }));
  const yuklenemedi = ajansGorunumu
    ? d.yuklenemedi.sirket
    : mcc
      ? d.yuklenemedi.workspace
      : varlik === null
        ? d.yuklenemedi.hesap
        : d.yuklenemedi.varlik;

  const sekmeler = duzeySekmeleri({
    duzey,
    kitleAktif: kitleGorunumu,
    kitleSayisi: kitleYaniti?.tur === 'veri' ? kitleYaniti.v.satirlar.length : null,
    sayi: satirlar?.length ?? null,
    ajansVar: session.managerAccount !== null,
    workspaceSecili: !ajansGorunumu && !mcc,
    cokluWorkspace: session.availableClients.length > 1,
    tasinan,
    d,
  });

  /*
   * YAZI: başlık ortak `SayfaIskeleti` (Yönet › Reklam Yöneticisi), düzeyler
   * sayfa içi yan menüde, kırıntı hapları ve şeritler içerik sütununun
   * başında (onaylı taslak `#yonetici`). Tablo çizilemiyorsa yerine NEDENİ
   * yazan hâl geliyor ama yan menü duruyor: kullanıcı başka düzeye geçebilmeli.
   */
  const seritler =
    summary === null ? (
      <Serit ton="hata" baslik={d.verilerAlinamadi}>
        {ozetHatasi ?? d.sebepYok}
      </Serit>
    ) : summary.hiddenAccounts > 0 ? (
      /* İzlenmeyen hesap bu rakamlara girmiyor: söylenmezse "harcama neden az" sorulur. */
      <Serit
        ton="bilgi"
        baslik={d.izlenmeyen(summary.hiddenAccounts)}
        eylemler={
          hesapHedefi && (
            <Link className={dugmeSinifi('ikincil', 'kucuk')} href={hesapHedefi}>
              {d.hesaplardaAc}
            </Link>
          )
        }
      />
    ) : null;

  const yerine =
    summary !== null && summary.accountCount === 0 ? (
      <BosDurum
        baslik={d.henuzVeriYok}
        neden={hesapHedefi ? d.hesapAta : HESAP_AJANSTA}
        eylem={
          hesapHedefi && (
            <Link className={dugmeSinifi('ikincil', 'kucuk')} href={hesapHedefi}>
              {d.hesaplaraGit}
            </Link>
          )
        }
      />
    ) : satirlar === null ? (
      <HataDurumu baslik={yuklenemedi} mesaj={d.satirlarGelmedi} />
    ) : undefined;

  const kitleYazabilir = kapi(session, 'kitle.yaz');
  const tabloYerine =
    kitleGorunumu ? (
      <HedefKitleler
        alt={kitleAlt}
        hrefler={{
          kayitli: baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'kitle', kitle: 'kayitli', yeni: undefined }),
          performans: baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'kitle', kitle: 'performans', yeni: undefined }),
        }}
        clientId={session.activeClientId}
        yazabilir={kitleYazabilir}
        varsayilanAdresi={
          session.activeClientId && kapi(session, 'markaMerkezi.gor')
            ? markaMerkeziAdresi('kurulum', session.activeClientId, 'varsayilanlar')
            : null
        }
        yeniAc={first(params.yeni) === '1'}
        ilkSuzgec={platform ?? null}
        performans={kitleYaniti}
      />
    ) : (
      yerine
    );
  const olustur = olusturDugmesi(seciliSekme, session.activeClientId, {
    reklam: session.permissions.includes('bulk.write'),
    kitle: kitleYazabilir,
  }, dil);
  /*
   * KAYITLI KİTLELER AÇIKKEN "＋ Yeni hedef kitle" SAYFADA PANEL AÇAR (olay,
   * `VarlikBirincilEylem`): bağlantı aynı adrese gidip `yeni=1` zaten
   * adresteyse ikinci tıklamada hiçbir şey yapmazdı. Performans alt
   * sekmesinden ise kayıtlı kitlelere `yeni=1` ile gidiliyor.
   */
  const kitlePaneliDugmesi = kitleGorunumu && kitleAlt === 'kayitli' && olustur !== null;

  return (
    <SayfaIskeleti
      bolum={menuBolumuEtiketi('/ads-explorer', dil)}
      baslik={menuSatiriEtiketi('/ads-explorer', dil)}
      aciklama={
        <>
          {scopeLabel} · {formatDayLong(range.from, dil)} - {formatDayLong(range.to, dil)}
          {range.incomplete && <span className="text-danger-strong"> · {d.gunBitmedi}</span>}
        </>
      }
      eylemler={
        <>
          <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
          <RefreshButton
            dateFrom={range.from}
            dateTo={range.to}
            rangeLabel={range.label}
            sonGuncelleme={summary?.lastFetchedAt ?? null}
          />
          {kitlePaneliDugmesi && olustur ? (
            <VarlikBirincilEylem bolum="kitleler" etiket={olustur.etiket} />
          ) : (
            olustur && (
              <Link className={dugmeSinifi('birincil')} href={olustur.href}>
                ＋ {olustur.etiket}
              </Link>
            )
          )}
        </>
      }
    >
      <ReklamYoneticisiTablosu
        duzey={duzey}
        seciliSekme={seciliSekme}
        sekmeler={sekmeler}
        metrikler={summary === null ? null : ymMetrikleri(summary, range.karsilastirma !== 'yok', d.metrik, dil)}
        satirlar={satirlar ?? []}
        kirinti={<HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} gorunum="hap" />}
        seritler={seritler}
        yerine={tabloYerine}
        platformSecenekleri={[null, ...PLATFORMS].map((p) => ({
          ad: p ? PLATFORM_KISA_ADLARI[p] : d.tumu,
          href: baglanti(
            REKLAM_YONETICISI,
            tasinan,
            platformSekmesiSorgusu(p, { platform, hesap, seviye: level }),
          ),
          secili: platform === p,
        }))}
        kesmeNotu={
          varlik !== null && breakdown !== null && breakdown.length >= KIRILIM_LIMITI
            ? d.kesme(KIRILIM_LIMITI)
            : null
        }
        aralik={{ from: range.from, to: range.to }}
        galeriHref={`${REKLAM_YONETICISI}/galeri`}
        yazabilir={session.permissions.includes('budget.write')}
        site={site}
      />

      {!range.incomplete && <p className="m-0 text-12 text-ink-muted">{d.bugunDahilDegil}</p>}
    </SayfaIskeleti>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ymMetrikleri(summary: MetricsSummary, karsilastir: boolean, m: RY['metrik'], dil: Dil): YmMetrik[] {
  const prev = karsilastir ? summary.previous : null;
  const c = summary.currency;
  const harcama =
    c === null && summary.byCurrency.length > 1
      ? summary.byCurrency.map((x) => formatMoney(x.spendMicros, x.currency, { compact: true, dil })).join(' + ')
      : formatMoney(summary.spendMicros, c, { dil });
  return [
    { ad: m.harcama, deger: harcama, degisim: prev ? changePercentMicros(summary.spendMicros, prev.spendMicros) : null },
    { ad: m.donusum, deger: formatNumber(summary.conversions, dil), degisim: prev ? changePercent(summary.conversions, prev.conversions) : null },
    {
      ad: m.donusumBasiMaliyet,
      deger: formatMoney(microsOf(summary.cpa), c, { dil }),
      degisim: summary.cpa === null || !prev ? null : changePercent(summary.cpa, prev.cpa),
      ters: true,
    },
    { ad: m.tiklama, deger: formatNumber(summary.clicks, dil), degisim: prev ? changePercent(summary.clicks, prev.clicks) : null },
  ];
}

/**
 * DÜZEY SEKMELERİ. Üst düzeyler kapsam değiştiriyor (oturumda), alt düzeyler
 * adresteki seviyeyi. Gidilemeyen düzey SOLUK ve NEDENİNİ söylüyor: ajans
 * kapsamında "Kampanyalar"a basmak hangi workspace'in kampanyaları
 * olduğunu bilmeden boş bir liste açardı.
 */
function duzeySekmeleri(v: {
  duzey: YmDuzey;
  /** "Hedef kitleler" seçiliyse düzey sekmeleri bağlantı olur (aktif değil). */
  kitleAktif: boolean;
  kitleSayisi: number | null;
  sayi: number | null;
  ajansVar: boolean;
  workspaceSecili: boolean;
  cokluWorkspace: boolean;
  tasinan: Record<string, string | undefined>;
  d: RY;
}): YmSekme[] {
  const sira: YmDuzey[] = ['sirket', 'workspace', 'hesap', 'campaign', 'ad_group', 'ad'];
  const ad: Record<YmDuzey, string> = v.d.sekme;
  // Her alt düzey hangi odağı düşürüyor: kırılım tablosundaki kuralın aynısı.
  const dusen: Record<'hesap' | 'campaign' | 'ad_group' | 'ad', Record<string, string | undefined>> = {
    hesap: { hesap: undefined, kampanya: undefined, reklamSeti: undefined },
    campaign: { kampanya: undefined, reklamSeti: undefined },
    ad_group: { reklamSeti: undefined },
    ad: {},
  };
  const duzeyler = sira
    .filter((d) => d !== 'sirket' || v.ajansVar)
    .map((d): YmSekme => {
      const aktif = d === v.duzey && !v.kitleAktif;
      const sayi = aktif ? v.sayi : null;
      if (aktif) return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'aktif' } };
      if (d === 'sirket') return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'org' } };
      if (d === 'workspace') {
        if (v.duzey === 'sirket') return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'kapali', neden: v.d.kapali.sirketSec } };
        if (!v.cokluWorkspace) return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'kapali', neden: v.d.kapali.tekWorkspace } };
        return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'client' } };
      }
      if (!v.workspaceSecili) {
        return { anahtar: d, ad: ad[d], sayi, hedef: { tur: 'kapali', neden: v.d.kapali.workspaceSec } };
      }
      return {
        anahtar: d,
        ad: ad[d],
        sayi,
        hedef: { tur: 'link', href: baglanti(REKLAM_YONETICISI, v.tasinan, { seviye: d, ...dusen[d] }) },
      };
    });
  /*
   * HEDEF KİTLELER: düzey değil görünüm. Kampanya odağı taşınıyor (o
   * kampanyanın setlerinin kitleleri), reklam seti odağı düşüyor (tek setin
   * tek kitlesi tablo değil).
   */
  const kitle: YmSekme = v.kitleAktif
    ? { anahtar: 'kitle', ad: v.d.sekme.kitle, sayi: v.kitleSayisi, hedef: { tur: 'aktif' } }
    : !v.workspaceSecili
      ? { anahtar: 'kitle', ad: v.d.sekme.kitle, sayi: null, hedef: { tur: 'kapali', neden: v.d.kapali.gorunumWorkspaceSec } }
      : { anahtar: 'kitle', ad: v.d.sekme.kitle, sayi: null, hedef: { tur: 'link', href: baglanti(REKLAM_YONETICISI, v.tasinan, { seviye: 'kitle', reklamSeti: undefined }) } };
  return [...duzeyler, kitle];
}

function sirketSatiri(r: MetricsOrganizationRow, m: RY['satir']): YmSatir {
  return {
    id: r.organizationId,
    ad: r.name,
    alt:
      r.clientCount === 0
        ? m.workspaceYok
        : `${m.workspaceSayisi(r.clientCount)} · ${r.adAccountCount === 0 ? m.izlemedeHesapYok : m.hesapIzlemede(r.adAccountCount)}`,
    durum: null,
    karo: true,
    mecralar: r.byPlatform.map((p) => p.platform),
    spendMicros: r.spendMicros,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    paraBirimi: r.currency,
    eylem: { tur: 'org', id: r.organizationId },
    eylemHedefi: null,
  };
}

function workspaceSatiri(r: MetricsClientRow, m: RY['satir']): YmSatir {
  return {
    id: r.clientId,
    ad: r.name,
    alt: r.adAccountCount === 0 ? m.izlemedeHesapYok : m.hesapIzlemede(r.adAccountCount),
    durum: null,
    karo: true,
    mecralar: r.byPlatform.map((p) => p.platform),
    spendMicros: r.spendMicros,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    paraBirimi: r.currency,
    eylem: { tur: 'client', id: r.clientId },
    eylemHedefi: null,
  };
}

function hesapSatiri(a: MetricsAccountRow, tasinan: Record<string, string | undefined>, m: RY['satir']): YmSatir {
  return {
    id: a.adAccountId,
    ad: a.name,
    alt: a.syncEnabled ? `${a.clientName} · ${a.externalId}` : `${a.externalId} · ${m.izlenmiyorEki}`,
    altTon: a.syncEnabled ? undefined : 'uyari',
    // ÖDEME SORUNU İZLEMEDEN ÖNCE: izlenen hesapta reklamlar durmuşsa
    // "İzleniyor" yazmak hesabı sağlıklı gösterirdi (Google'da hesap ENABLED
    // kalıyor). Sebep ve "ne yapmalı" üst bantta.
    durum: a.odemeSorunu
      ? { tur: 'durdu', ad: m.odemeSorunu }
      : a.syncEnabled
        ? { tur: 'yayinda', ad: m.izleniyor }
        : { tur: 'durdu', ad: m.izlenmiyor },
    karo: false,
    mecralar: [a.platform],
    spendMicros: a.spendMicros,
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    paraBirimi: a.currency,
    // İZLENMEYEN HESAP BAĞLANTI DEĞİL: içi boş bir kampanya listesine götürürdü.
    eylem: a.syncEnabled
      ? {
          tur: 'link',
          href: baglanti(REKLAM_YONETICISI, tasinan, {
            platform: a.platform,
            hesap: a.adAccountId,
            kampanya: undefined,
            reklamSeti: undefined,
            seviye: 'campaign',
          }),
        }
      : null,
    // Hesap düzeyinde durdur/başlat yok: hesap platformda duraklatılmaz.
    eylemHedefi: null,
  };
}

function varlikSatiri(
  b: MetricsBreakdownRow,
  varlik: 'campaign' | 'ad_group' | 'ad',
  tasinan: Record<string, string | undefined>,
  m: RY['satir'],
): YmSatir {
  const href =
    varlik === 'campaign'
      ? baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad_group', kampanya: b.entityId })
      : varlik === 'ad_group'
        ? baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad', reklamSeti: b.entityId })
        : null;
  return {
    id: b.entityId,
    ad: b.name,
    // Üst varlığın adı ZORUNLU: reklam adları setler arasında tekrar ediyor
    // ve üst ad olmadan hangi satırın hangisi olduğu ayırt edilemiyor.
    alt: [b.campaignType, b.parentName].filter(Boolean).join(' · ') || null,
    // TESLİMAT, kendi durumu değil: kampanyası duraklatılmış set "Yayında"
    // görünüp harcamıyordu (`teslimatDurumu`, sunucuda hesaplanıyor).
    durum: {
      tur: b.teslimat.yayinda ? 'yayinda' : 'durdu',
      // Hesap ödeme engeli sözlükten; diğer teslimat adları shared'ın
      // Türkçe sabiti (D4).
      ad: b.teslimat.kod === 'hesap_odeme' ? m.hesaptaOdemeSorunu : b.teslimat.ad,
    },
    karo: false,
    mecralar: [b.platform],
    spendMicros: b.spendMicros,
    impressions: b.impressions,
    clicks: b.clicks,
    conversions: b.conversions,
    paraBirimi: b.currency,
    eylem: href ? { tur: 'link', href } : { tur: 'onizle' },
    eylemHedefi: eylemHedefiCoz({
      seviye: varlik,
      id: b.entityId,
      ad: b.name,
      platform: b.platform,
      durum: b.status,
      kampanyaKanali: b.kampanyaKanali,
    }),
  };
}
