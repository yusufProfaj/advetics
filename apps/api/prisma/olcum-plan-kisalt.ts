/**
 * ═══ PLAN SATIRINDAKİ DEV UUID DİZİLERİNİ KISALT ═══
 *
 * 48 workspace'lik bir kapsamda her `Index Cond` / `Filter` satırı 48 uuid
 * taşıyor ve aynı liste planda onlarca kez tekrarlıyor: çıktı 700 satır
 * oluyor ve terminalde okunamıyor. İlk ölçümde çıktı sohbete sığmadı ve
 * dosya olarak gönderilmek zorunda kaldı.
 *
 * KİMLİKLER SİLİNMİYOR, SAYILIYOR. Kaç kimlik olduğu teşhisin PARÇASI —
 * yüklem gerçekten bütün kapsamı taşıyor mu, yoksa bağlam eksik mi
 * kurulmuş? Tek tek hangileri olduğu ise hiçbir soruya cevap vermiyor.
 *
 * ┌─ AYRI DOSYA ÇÜNKÜ `olcum-metrik.ts` İMPORT EDİLİNCE ÇALIŞIYOR ────────┐
 * │ O dosya modül seviyesinde iki `PrismaClient` kuruyor ve en altta      │
 * │ `main()` çağırıyor; testten import etmek, testin veritabanına         │
 * │ bağlanıp ölçüm koşturması demekti. (`workspace-sirket-karari.ts` ile  │
 * │ aynı gerekçe.)                                                        │
 * └───────────────────────────────────────────────────────────────────────┘
 */

/**
 * `'{uuid,uuid,…}'::uuid[]` biçimindeki dizileri `'{… N kimlik …}'::uuid[]`
 * ile değiştirir. Satırın geri kalanına DOKUNMUYOR.
 */
export function planKisalt(satir: string): string {
  /*
   * DESEN EN AZ BİR UUID ŞART KOŞUYOR — VE BU BOŞ DİZİ İÇİN.
   *
   * `::uuid[]` son eki dizinin türünü zaten ayırt ediyor; ilk elemanın
   * uuid biçiminde olması sanki fazladan bir kemer gibi duruyor. Değil:
   * plan `COALESCE(..., '{}'::uuid[])` içeriyor ve gevşek bir desen onu
   * `'{… 1 kimlik …}'` diye kısaltırdı. Yani BOŞ bir kapsam, teşhiste
   * "bir kimlik var" gibi görünürdü — ve boş kapsam tam da aranan
   * arızalardan biri (bağlam kurulmamış).
   *
   * MUTASYONLA ÖLÇÜLDÜ: deseni gevşetmek ilk yazımda hiçbir testi
   * düşürmedi; eksik olan testti, kemer değil.
   */
  return satir.replace(
    /'\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[^}]*\}'::uuid\[\]/g,
    (dizi) => `'{… ${dizi.split(',').length} kimlik …}'::uuid[]`,
  );
}
