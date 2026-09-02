import { Prisma } from '@prisma/client';

/**
 * ═══ TOPLU UPSERT — TEK KAPI ═══
 *
 * Senkronizasyon servislerinin hepsi platformdan gelen satırları TEK bir
 * `INSERT … ON CONFLICT` ile yazıyor. Bu doğru bir tercih (satır başına sorgu
 * binlerce gidiş-dönüş demek) ama iki tuzağı var ve İKİSİ DE ÜRETİMDE PATLADI:
 *
 * ① BAĞLI PARAMETRE SINIRI (32.767).
 *    Kaşkaloğlu Göz Hastanesi'nde yapı taraması `received 84093`, arama
 *    terimleri `received 123615` ile düştü. Satır sayısı hesabın büyüklüğüne
 *    bağlı olduğu için hata DETERMİNİSTİK: tekrar denemek aynı sonucu veriyor
 *    ve iş beş denemesini de harcayıp kalıcı `failed` oluyor.
 *
 * ② AYNI PARTİDE AYNI ÇAKIŞMA ANAHTARINDAN İKİ SATIR.
 *    Postgres `ON CONFLICT DO UPDATE command cannot affect row a second time`
 *    diyor ve KOMUTUN TAMAMINI reddediyor — 3.000 satırlık bir yazmayı iki
 *    mükerrer satır yüzünden kaybediyoruz. Anahtar kelime ve kırılım
 *    senkronizasyonu tam olarak böyle düştü.
 *
 * ZİNCİRLEME ETKİSİ ASIL BEDEL: yapı taraması düşünce kampanya satırı
 * oluşmuyor, metrik işleri de doğru davranarak "yapı hiç koşmadı" deyip
 * düşüyor. Kullanıcının gördüğü şey "yeni müşteride veri gelmiyor" oluyor ve
 * sebebi yalnızca `sync_jobs` içinde yazılı.
 *
 * NEDEN TEK YARDIMCI: düzeltmeyi altı servise kopyalamak, CLAUDE.md'nin
 * "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR" dersinin tam
 * hedefi olurdu — biri chunk boyutunu değiştirir, diğeri mükerrer temizliğini
 * unutur ve fark yalnızca büyük bir hesapta görünür.
 */

/**
 * Postgres'in genişletilmiş protokolündeki bağlı parametre üst sınırı.
 * `int16` olduğu için 32.767; aşıldığında sürücü sorguyu hiç göndermiyor.
 */
export const PARAMETRE_SINIRI = 32_767;

/**
 * Hedeflenen üst sınır — SINIRIN ALTINDA pay bırakıyor.
 *
 * Sorgunun `VALUES` dışında da parametresi olabiliyor (WHERE, ON CONFLICT
 * hedefleri). Tam sınıra kadar doldurmak, o birkaç parametre yüzünden
 * patlayan bir kenar durumu demekti.
 */
export const GUVENLI_PARAMETRE = 30_000;

export interface TopluYazmaSonucu {
  /** Veritabanının bildirdiği etkilenen satır sayısı. */
  yazilan: number;
  /**
   * Aynı çakışma anahtarına düştüğü için ATILAN satır sayısı.
   *
   * SIFIR DEĞİLSE ÇAĞIRAN BUNU NOTA YAZMALI. Sessizce atmak, "3.000 satır
   * çektim, 2.987 yazdım" farkını görünmez yapardı — bu projede en pahalı
   * hata türü.
   */
  mukerrer: number;
  /** Kaç ayrı `INSERT` çalıştırıldı — teşhiste "bölündü mü" sorusunun cevabı. */
  parca: number;
}

/**
 * Satırları mükerrerlerden arındırıp parçalara bölerek yazar.
 *
 * @param satirlar   Platformdan gelen ham satırlar.
 * @param anahtar    Çakışma anahtarı — `ON CONFLICT (...)` ile AYNI alanlardan
 *                   üretilmeli. Yanlış anahtar, gerçek mükerrerleri kaçırır.
 * @param deger      Bir satırın `VALUES (...)` demeti.
 * @param yaz        Birleştirilmiş demetleri alıp `INSERT`i koşturan fonksiyon.
 */
export function parcalaVeTemizle<T>(params: {
  satirlar: readonly T[];
  anahtar: (satir: T) => string;
  deger: (satir: T) => Prisma.Sql;
}): { parcalar: Prisma.Sql[]; mukerrer: number } {
  const { satirlar, anahtar, deger } = params;
  if (satirlar.length === 0) return { parcalar: [], mukerrer: 0 };

  /*
   * SON GELEN KAZANIYOR.
   *
   * Platform aynı varlığı iki kez döndürdüğünde (sayfalama sınırında ya da
   * aynı gün iki kırılım kovasına düştüğünde) hangisinin doğru olduğu
   * belirsiz. Sonuncuyu almak, tek bir `INSERT` yerine sırayla iki `UPSERT`
   * yapılsaydı ortaya çıkacak sonucun aynısı — yani davranış, sınırı
   * aşmayan küçük hesaplarla TUTARLI kalıyor.
   */
  const benzersiz = new Map<string, T>();
  for (const satir of satirlar) benzersiz.set(anahtar(satir), satir);
  const mukerrer = satirlar.length - benzersiz.size;

  const demetler = [...benzersiz.values()].map(deger);

  /*
   * PARÇA BOYU ÖLÇÜLEREK BULUNUYOR, ELLE YAZILMIYOR.
   *
   * Satır başına parametre sayısını çağırana sordurmak, bir kolon
   * eklendiğinde güncellenmeyi bekleyen ikinci bir sayı demekti — ve yanlış
   * olduğunda hiçbir hata vermeden sınırı aşardı. `Prisma.Sql.values`
   * gerçek parametre listesi, yani sayı her zaman doğru.
   */
  const satirBasi = Math.max(1, demetler[0]!.values.length);
  const parcaBoyu = Math.max(1, Math.floor(GUVENLI_PARAMETRE / satirBasi));

  const parcalar: Prisma.Sql[] = [];
  for (let i = 0; i < demetler.length; i += parcaBoyu) {
    parcalar.push(Prisma.join(demetler.slice(i, i + parcaBoyu), ', '));
  }
  return { parcalar, mukerrer };
}

/**
 * `$executeRaw` ile yazan servisler için kısayol — etkilenen satırı topluyor.
 *
 * `RETURNING` ile satır okuyan yapı taraması `parcalaVeTemizle`yi doğrudan
 * kullanıyor: orada dönen değer sayı değil, dış kimlik → iç UUID eşlemesi.
 */
export async function topluUpsert<T>(params: {
  satirlar: readonly T[];
  anahtar: (satir: T) => string;
  deger: (satir: T) => Prisma.Sql;
  yaz: (values: Prisma.Sql) => Promise<number>;
}): Promise<TopluYazmaSonucu> {
  const { parcalar, mukerrer } = parcalaVeTemizle(params);

  let yazilan = 0;
  for (const p of parcalar) yazilan += await params.yaz(p);

  return { yazilan, mukerrer, parca: parcalar.length };
}

/** Nota eklenecek kısa açıklama — mükerrer varsa SÖYLENİYOR. */
export function topluYazmaNotu(s: TopluYazmaSonucu): string {
  const parcalar: string[] = [];
  if (s.mukerrer > 0) parcalar.push(`${s.mukerrer} mükerrer satır birleştirildi`);
  if (s.parca > 1) parcalar.push(`${s.parca} parçada yazıldı`);
  return parcalar.join(' · ');
}
