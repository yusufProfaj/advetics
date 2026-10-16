# Test kuralları (ayrıntı)

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

### Test

- `pnpm --filter @advetics/api test` — vitest. Şu an **2.253 API testi**.
- Veritabanına dokunan testler **PGlite** kullanıyor (gerçek Postgres, WASM).
  Şema üretim migration'larından kuruluyor — el yazımı test şeması yok.
- **RLS testlerde varsayılan olarak KAPALI** (worker rolü BYPASSRLS'i taklit
  ediyor). Ama kapatılabilir bir varsayılan: `SET ROLE` ile sahibi olmayan bir
  role geçen bir test politikaları GERÇEKTEN sınayabiliyor — örnek
  `ad-account-pool-rls.spec.ts` ve `hesap-tasima-rls.spec.ts` (ikincisi
  taşımanın sekiz tabloda da politikalardan geçtiğini ve `activeClientId`
  kapatılmazsa REDDEDİLDİĞİNİ kilitliyor). Kritik bir politika yazıyorsan elle gözden
  geçirmekle yetinme, o deseni kullan.
- **MUTASYON DİSİPLİNİ: kritik bir test, kodu bozarak doğrulanmadan yazılmış
  sayılmaz.** Bu oturumda üç test mutasyonla BOŞ çıktı — hepsi geçiyordu ama
  hiçbir şey tutmuyordu: (1) bir fonksiyon test edilmişti ama ÇAĞRILDIĞI test
  edilmemişti, (2) kırpma testi kırpmanın OLDUĞUNU değil yalnızca sonucun
  şeklini kontrol ediyordu, (3) ad set adının hiç testi yoktu. Testi yazdıktan
  sonra ilgili satırı boz, düştüğünü gör, geri al.
- **`packages/shared` KAYNAĞINA YAPILAN MUTASYON HİÇBİR ŞEYİ SINAMAZ —
  derlemeden.** API ve panel testleri `@advetics/shared`ı derlenmiş
  `dist`ten okuyor. Bölüm 3b'de yasal uyarı karşılaştırmasının iki
  mutasyonu (boşluk normalizasyonu, çift eklemeye karşı koruma) yeşil
  geçti; kod doğruydu, mutasyon `dist`e hiç ulaşmamıştı. Shared'da bir
  satırı bozarken `npx tsc -p packages/shared/tsconfig.json` ile yeniden
  derle, testi koş, geri al ve TEKRAR derle. Aynı dersin kardeşi:
  mutasyon sonrası test SAYISI da okunmalı — sözdizimini bozan bir
  mutasyon dosyayı yükletmiyor ve kalan testler "geçti" görünüyor.
- **SABİT UZUNLUKLU DİLİM KOMŞUYU YAKALIYOR.** `indexOf('onDragOver') + 400
  karakter` diliminde `preventDefault` aramak, o çağrıyı SİLDİĞİNDE de
  geçiyordu: pencere komşu işleyicinin (`onDrop`) içindeki aynı çağrıya kadar
  uzanıyor. Dilim, sınırlanmak istenen şeyin GERÇEK sınırıyla çıkarılmalı
  (süslü parantez sayarak); "yakınında geçiyor" bir iddia değil.
- **TARAMAYI YORUMSUZ KAYNAKTA YAP.** `KAYNAK.replace(/\/\*[\s\S]*?\*\//g, '')`.
  Bir kuralı ANLATAN yorum aynı dosyada duruyor ve `toContain` ikisini ayırt
  etmiyor; kural silinse bile yorum eşleşip test yeşil kalıyor. Bu oturumda
  ters yönde de yakalandı: "şu desen KALMADI" iddiası, deseni anlatan yoruma
  eşleşip kod DOĞRUYKEN kırmızı verdi.
- **KAYNAK TARAMASINDA İDDİA YORUMA DEĞİL KODA ÇAPALANIR.** Bir kuralı test
  ederken o kuralı ANLATAN yorum da aynı dosyada duruyor ve `toContain` ikisini
  ayırt etmiyor: `inverse` propunu silmek testi düşürmüyordu, çünkü iki satır
  yukarıdaki *"CPA'da ARTIŞ KÖTÜ — `inverse`"* yorumu eşleşiyordu. Bu oturumda
  dört ayrı testte oldu (`showBuckets`, `process.cwd()`, `ad.platform ===
  'google'`, `inverse`). Dilimi tanımın/elemanın kendisinden başlat
  (`lastIndexOf('<Delta', i)`) ya da eşleşmeyi tek bir satıra sabitle.
- Bazı testler **kaynak taraması** yapıyor (`meta-account-path.spec.ts`,
  `google-request.spec.ts`). Canlıda öğrenilen ve birim testiyle
  yakalanamayacak kuralları böyle kilitliyoruz. **Tarama BOŞA DÜŞEBİLİR:**
  metot adı değişince dilim boşalıyor ve "yasak dizge yok" iddiası her zaman
  doğru oluyor. Her taramaya "gövde gerçekten yakalandı" testi ekle ve dilim
  bulunamazsa HATA FIRLAT.
