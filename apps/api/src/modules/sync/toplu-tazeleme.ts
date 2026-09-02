/**
 * ═══ TOPLU VERİ TAZELEME — PLANLAMA ═══
 *
 * "Tüm verileri güncelle" tek bir iş değil. Bu dosya, seçilen aralığın hangi
 * işlere bölüneceğine karar veriyor ve hiçbir şey yapmıyor: karar sınanabilir
 * olsun diye kuyruktan ve veritabanından AYRI duruyor.
 *
 * Bölme matematiği bu projede bir kez bedelini ödetti: bir günlük boşluk
 * sessizce eksik veri, bir günlük örtüşme boşa çağrı ve ikisi de kaynak
 * taramasıyla görünmüyor.
 */

/**
 * Metrik işi başına en fazla kaç gün.
 *
 * `backfillSchema` üst sınırı 365 ve gerekçesi yazılı: tek seferde daha
 * fazlası, iş başına dönen satır sayısını hesabın işleyemeyeceği boyuta
 * çıkarıyor. 90 gün seçildi, 365 değil — üç sebeple:
 *
 *   1. `initial_backfill` zaten 90 günlük pencereyle çalışıyor ve canlıda
 *      doğrulanmış olan boyut bu.
 *   2. İLERLEME ÇUBUĞU İÇİN BİRİM GEREKİYOR. Tek bir 730 günlük iş, %0'dan
 *      %100'e saatler sonra atlayan bir çubuk demekti — kullanıcı için
 *      hiçbir bilgi taşımayan bir animasyon.
 *   3. BİR PENCERE DÜŞERSE DİĞERLERİ YAZILMIŞ KALIYOR. Tek iş düştüğünde iki
 *      yılın tamamı kayboluyordu.
 */
export const PENCERE_GUN = 90;

/** Aralığın gün sayısı, iki uç DAHİL. */
export function gunSayisi(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000) + 1;
}

function gunEkle(tarih: string, n: number): string {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Aralığı işlere bölünecek pencerelere ayırır.
 *
 * BOŞLUK YOK, ÖRTÜŞME YOK. Her pencere bir öncekinin bittiği günün ERTESİ
 * günde başlıyor. Bu iki hata da sessiz: boşluk eksik veri, örtüşme boşa
 * çağrı ve ikisi de yalnızca sayarak görülüyor.
 *
 * EN YENİ PENCERE ÖNCE. Kullanıcı iki yıl bekliyor ama önce SON ayları
 * görmek istiyor; kronolojik sıra, ilk yararlı verinin en sonda gelmesi
 * demekti.
 */
export function pencereler(from: string, to: string, pencereGun = PENCERE_GUN): Array<{
  from: string;
  to: string;
}> {
  if (from > to) return [];

  const sonuc: Array<{ from: string; to: string }> = [];
  let bitis = to;

  while (bitis >= from) {
    const baslangicAdayi = gunEkle(bitis, -(pencereGun - 1));
    const baslangic = baslangicAdayi < from ? from : baslangicAdayi;
    sonuc.push({ from: baslangic, to: bitis });
    if (baslangic === from) break;
    bitis = gunEkle(baslangic, -1);
  }

  return sonuc;
}

export interface PlanlananIs {
  adAccountId: string;
  clientId: string;
  platform: 'meta' | 'google';
  jobType: 'structure' | 'insights_backfill' | 'insights_breakdowns' | 'search_terms' | 'keyword_insights';
  dateFrom?: string;
  dateTo?: string;
}

export interface PlanGirdisi {
  hesaplar: Array<{ id: string; clientId: string; platform: 'meta' | 'google' }>;
  from: string;
  to: string;
  /** Kitle kırılımları da çekilsin mi — maliyeti hesap başına ~5 çağrı/pencere. */
  kirilimlar: boolean;
}

/**
 * Açılacak işlerin TAM listesi.
 *
 * SIRA KUYRUĞA EKLEME SIRASI ve önemli: yapı taraması her hesap için ÖNCE
 * geliyor. Metrik satırı, ait olduğu kampanya satırı veritabanında yoksa
 * yazılamıyor — bu projede "atadım, veri gelmiyor" hâlinin en yaygın sebebi.
 */
export function planla(girdi: PlanGirdisi): PlanlananIs[] {
  const isler: PlanlananIs[] = [];
  const araliklar = pencereler(girdi.from, girdi.to);

  for (const hesap of girdi.hesaplar) {
    isler.push({
      adAccountId: hesap.id,
      clientId: hesap.clientId,
      platform: hesap.platform,
      jobType: 'structure',
    });

    for (const a of araliklar) {
      isler.push({
        adAccountId: hesap.id,
        clientId: hesap.clientId,
        platform: hesap.platform,
        jobType: 'insights_backfill',
        dateFrom: a.from,
        dateTo: a.to,
      });
    }

    if (girdi.kirilimlar) {
      for (const a of araliklar) {
        isler.push({
          adAccountId: hesap.id,
          clientId: hesap.clientId,
          platform: hesap.platform,
          jobType: 'insights_breakdowns',
          dateFrom: a.from,
          dateTo: a.to,
        });
      }
    }

    /*
     * ═══ ARAMA TERİMİ VE ANAHTAR KELİME GEÇMİŞİ — YALNIZCA GOOGLE ═══
     *
     * BU İKİSİ HİÇ ÇEKİLMİYORDU ve belirtisi kullanıcıdan geldi: raporda
     * "Geçen ay" seçilince arama terimleri tablosu boş çıkıyordu.
     *
     * Sebep bir hata değil, bir EKSİKLİK: bu iki tabloyu yalnızca gecelik
     * süpürme dolduruyor ve o da SON 7 GÜNÜ çekiyor. `initial_backfill` de,
     * "Tüm verileri güncelle" de kapsamıyordu — yani 8 günden eski hiçbir
     * arama terimi hiçbir zaman oluşmuyordu. Rapor bölümü "bu dönemde veri
     * yok" diyor, ki doğru; ama verinin neden hiç toplanmadığını kimse
     * söylemiyordu.
     *
     * META'YA AÇILMIYOR: arama terimi ve anahtar kelime Google Ads'e özel.
     * Meta hesabı için iş açmak, her turda kesin başarısız olacak bir iş
     * üretmek olurdu.
     */
    if (hesap.platform === 'google') {
      for (const a of araliklar) {
        isler.push({
          adAccountId: hesap.id,
          clientId: hesap.clientId,
          platform: hesap.platform,
          jobType: 'search_terms',
          dateFrom: a.from,
          dateTo: a.to,
        });
        isler.push({
          adAccountId: hesap.id,
          clientId: hesap.clientId,
          platform: hesap.platform,
          jobType: 'keyword_insights',
          dateFrom: a.from,
          dateTo: a.to,
        });
      }
    }
  }

  return isler;
}

export interface Ilerleme {
  toplam: number;
  tamamlanan: number;
  dusen: number;
  kosan: number;
  bekleyen: number;
  yuzde: number;
  /** Saniye. `null` = henüz tahmin edilemiyor. */
  kalanSaniye: number | null;
  bitti: boolean;
}

/**
 * Parti ilerlemesi ve KALAN SÜRE TAHMİNİ.
 *
 * TAHMİN ÖRNEK YETERSİZKEN `null`. İlk iş bittiğinde "23 saat kaldı" yazan
 * bir çubuk, birkaç dakika sonra "40 dakika" diyor ve kullanıcı ikisine de
 * güvenmeyi bırakıyor. En az `EN_AZ_ORNEK` iş bitmeden tahmin verilmiyor ve
 * ekranda "hesaplanıyor" yazıyor.
 *
 * EŞ ZAMANLILIK HESABA KATILIYOR: worker dört işi paralel koşuyor, yani
 * kalan süre "kalan iş × ortalama süre" DEĞİL, onun eşzamanlılığa bölünmüş
 * hâli. Bölmeyi unutmak süreyi dört katı gösterirdi.
 */
export const EN_AZ_ORNEK = 3;
export const ESZAMANLILIK = 4;

export function ilerleme(
  toplam: number,
  durumlar: { tamamlanan: number; dusen: number; kosan: number },
  ortalamaSaniye: number | null,
): Ilerleme {
  const biten = durumlar.tamamlanan + durumlar.dusen;
  const bekleyen = Math.max(0, toplam - biten - durumlar.kosan);

  /*
   * DÜŞEN İŞ DE "BİTMİŞ" SAYILIYOR — ve bu bilinçli. Sayılmasaydı çubuk
   * kalıcı olarak %90'da takılır ve kullanıcı bitmeyen bir işlemi beklerdi.
   * Düşen sayısı AYRICA gösteriliyor: yüzde tamamlandığında hepsi başarılı
   * demek değil.
   */
  const yuzde = toplam === 0 ? 100 : Math.min(100, Math.round((biten / toplam) * 100));

  const kalanIs = toplam - biten;
  const kalanSaniye =
    ortalamaSaniye === null || kalanIs <= 0
      ? null
      : Math.round((kalanIs * ortalamaSaniye) / ESZAMANLILIK);

  return {
    toplam,
    tamamlanan: durumlar.tamamlanan,
    dusen: durumlar.dusen,
    kosan: durumlar.kosan,
    bekleyen,
    yuzde,
    kalanSaniye,
    bitti: kalanIs <= 0,
  };
}
