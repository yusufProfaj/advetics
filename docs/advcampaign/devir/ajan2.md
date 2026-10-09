# Ajan 2 · Arka Plan — devir notu (2026-10-10)

> Girdi: `packages/shared/src/reklam/rehber/` (Ajan 1, bab2e2d + sonraki eklemeler), `MIMARI-REHBER.md` § 2-6.
> Commit EDİLMEDİ. API typecheck temiz; tam API paketi tek başına koşturuldu: **4.399 geçti, 1 düştü** (düşen benim değil, aşağıda "Ajan 1'e" 1).

## Ne yapıldı

**Migration:** `apps/api/prisma/migrations/20261010120000_reklam_rehberi/migration.sql`
- `reklam_rehberi` tablosu (MIMARI § 2.1 + `prova_ozeti`/`prova_at`: son provanın hangi içeriğe yapıldığı). Kompozit FK `(client_id, org_id)`, durum CHECK = `REHBER_DURUMLARI`.
- `yayin`a `kapali_kalacak`, `uyum_surumu`, `uyum_sonucu` (+ CHECK); `yayin_govde_degismez` trigger'ı bu üç kolonu da kilitliyor.
- Üç durak: `02_rls.sql` (tablo listesi + select/insert/update politikası, DELETE yok), `test/pglite-harness.ts` TRUNCATE, `workspace-tasima.ts#WORKSPACE_TABLOLARI` (taşınır). Prisma şemasına `ReklamRehberi` modeli ve `Yayin`ın üç kolonu.

**Yeni dosyalar**
- `apps/api/src/modules/reklam/rehber/` — `rehber.module.ts` (ayrı Nest modülü: Connections + Reklam + AutoBoost içe aktarıyor), `rehber.controller.ts`, `rehber.service.ts`, `rehber-kayit.ts` (özet + birleştirme, saf), `oneriler.ts` (kelime tekilleştirme, konum eşleme, metin önerisi temizliği, saf), `platform-okuma.ts` (Meta asgari bütçe, form koşulu), `yayin-kapilari.ts` (sıralı, tembel, sıfır platform çağrılı kapılar).
- `apps/api/src/modules/reklam/google/` — `derle-google.ts` (GoogleDerlemeGirdisi → atomik gövde + beklenen geri okuma; yeni kurucu YOK), `google-yayin.ts` (işleyici: kur → geri oku → tekillik → aç / duraklatılmış bırak; uzlaştırma yalnız okur).
- `apps/api/src/yapay-zeka/model-gecmisi.ts` — sohbetten taşındı (İyileştir asistanı kullanıyor).
- Testler: `rehber/rehber-saf.spec.ts`, `rehber/rehber.service.spec.ts` (PGlite + gerçek RLS: SET ROLE + RETURNING), `rehber/rehber-meta-yayin.spec.ts`, `rehber/rehber-modulu.spec.ts` (Nest kaydı + uç↔api.ts eşlemesi, kaynak taraması), `google/derle-google.spec.ts` (kararTablosu ↔ gövde), `google/google-yayin.spec.ts`, `yapay-zeka/model-gecmisi.spec.ts`.

**Değişen dosyalar**
- `connections/providers/google-write.ts`: `campaignBody`ye `teklif` (manualCpc|targetSpend|maximizeConversions), `assetAutomationSettings` (metin özelleştirme + URL genişletme OPTED_OUT), `geoTargetTypeSetting` PRESENCE; `adGroupBody` otomatik teklifte `cpcBidMicros: null`; `responsiveSearchAdBody` `durum`; yeni `kampanyaKonumlariBody`, `kampanyaDiliBody`, `kampanyaNegatifleriBody` (BROAD), `aramaAtomikIstek`.
- `google-demandgen.ts`: `endDate` nullable, `startDate`, `yalnizBulunanlar` (yalnız rehber PRESENCE yazıyor; Akıllı Boost gövdesi değişmedi).
- `google.provider.ts`: taşıma metotları `rehberMutate`, `rehberAra`, `rehberKampanyaAc` (gövde üretmez).
- `yayin-baslat.ts`: `YayinIstegi.rehber {uyum, kapaliKalacak}`; UYUM reti yalnız rehber + `gecti` ise kalkıyor, eski yolda aynen duruyor.
- `yayin-motoru.ts`: `kapaliBirak()` (Meta ve Google ortak), `kapali_kalacak` ise tekillik kapısından sonra AÇMIYOR; `yayinKaydiOlustur` yeni kolonları yazıyor.
- `reklam-kuyrugu.ts` (`google_kur` işi), `yayin-isleyici.ts` (dağıtım), `worker.ts` (Google portu).
- `hazirlik.service.ts`: `rehberOku()` (RehberHazirligi; platform okumaları transaction dışında, düşerse null + log), `GOOGLE_TY_ASGARI_TRY_MICROS`, Meta hesaplarına `disKimlik`, `formSablonlari` (ilk sayfanın `lead_forms` son sürümleri).
- `reklam.module.ts`: sohbet controller/servisleri çıktı; taslak/hazırlık/yayın/kuyruk export ediliyor.
- `hazirlik.service.spec.ts` (modül sınırı testi): `rehber/` hariç tutuldu; bağlantı modülünden yalnız üç SAF dosyaya izin (`google-write`, `google-demandgen`, `provider.types`). Gerekçe dosyada.
- Sohbet kaldırıldı: `modules/reklam/sohbet/` (controller, servisler, döngü, araçlar, onay, testler) silindi. Tablolar duruyor. `strateji/aktarim.spec.ts`ten sohbet servisini okuyan tek test çıktı.
- İyileştir asistanı: `advcampaign_devret` artık oturum AÇMIYOR, yalnız `/reklam` yönlendirmesi döndürüyor (`araclar.ts`, `asistan.service.ts`, `dongu.ts`, `istem.ts`, `asistan.spec.ts`).

## Uçlar (`/reklam` altında, `RehberController`)
`GET rehber/hazirlik` · `GET rehber/youtube-videolari` · `GET rehberler` (RehberListesi) · `POST rehberler` · `GET/PUT rehberler/:id` (409 = sürüm eski; silme `sil: true`) · `POST rehberler/:id/konum-esle` · `POST …/anahtar-kelime-oner` · `POST …/metin-oner` (kayda yazmaz) · `POST/GET …/prova` (GET: hiç prova yoksa null) · `POST …/yayinla` · `GET …/yayin` · `POST …/arsivle`. İzinler api.ts ile birebir (`rehber-modulu.spec.ts` kilitliyor).

## Mutasyonla doğrulananlar
Karar tablosu ↔ gövde (ağ bayrağı, PRESENCE, AI Max, teklif, Demand Gen PRESENCE, negatifler); yayın kapılarının sırası (prova özetten önce okunursa düşüyor), prova özet bağı, yazma kapısı; Google işleyicisi (deneme açılışı, geri okuma farkı, belirsiz=kesin karışması, yazma kesicisi); Meta `kapali_kalacak`, uyum `durdu`; RLS SELECT politikası; ISTEMCI_YAZAMAZ; aitlik denetimi; konum tek eşleşme; asgari bütçe birimi; iyimser kilit (iki koruma birlikte bozulunca düşüyor — tek tek bozulunca diğeri tutuyor). RLS WITH CHECK tek başına bozulunca test yeşil kalıyor: yeni satır SELECT politikasından da geçmek zorunda (CLAUDE.md), yani o yol çift korumalı.

## NEYİ ÖLÇMEDİM (canlıda hiç koşmadı)
- **Google Arama atomik isteği hiç Google'a gitmedi** (Ö-1). Belgeden: `assetAutomationSettings` tür adları (`TEXT_ASSET_AUTOMATION`, `FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION`), atomik istekte `campaignCriterionOperation` (dil/konum/negatif), `targetSpend` ile grup teklifsiz kurulum, `startDateTime` ileri tarih.
- Demand Gen'de `geoTargetTypeSetting` kabul ediliyor mu (Ö-6). Reddederse karar tablosunun Talep Yaratma "Konum" satırı değişmeli.
- Talep Yaratma: uzun başlık açıklamalardan, işletme adı 25 karakter sınırı derleyicide denetlenmiyor (prova söyler).
- GAQL geri okuma alan adları (`campaign.geo_target_type_setting…`, kriter türleri) ve `campaign.name LIKE '%adv-…%'` tekillik araması.
- Meta `minimum_budgets`: birim (kuruş) ve `min_daily_budget_imp` seçimi (Ö-3, 49,34 ₺ ile karşılaştır). Meta `leadgen_tos_accepted` sayfa token'ıyla.
- Google `conversion_action` (birincil + ENABLED) sorgusu.
- `geoTargetConstants:suggest` tam ad eşleşmesi (Ö-4): Google `name` alanı "İzmir" mi "Izmir" mi döndürüyor; `sadelestir` iki yazımı aynı sayıyor.
- Keyword Planner 1 QPS: API ucu süreç içi 1,1 sn bekliyor, worker'daki AdvStrategy kuyruğuyla ORTAK kotayı görmüyor.
- Toplam bütçe Google'da gün sayısına bölünüp GÜNLÜK gidiyor (kampanya toplam bütçesi ölçülmedi); kullanıcıya provanın `not`unda söyleniyor.
- Gemini metin önerisi: istem + JSON şeması canlı modelle denenmedi.

## Ajan 1'e (sözleşme bulguları)
1. **Ajan 1'in commit'i bir testi kırdı:** `NIYET_KODLARI`na `VIDEO_IZLENME` eklendi, `strateji_matrisi_niyet_chk` (AdvStrategy migration'ı) onu içermiyor → `strateji-kayit.spec.ts` kırmızı (dogrula.yml de kırmızı olur). Karar gerekli: AdvStrategy matrisi VIDEO_IZLENME kabul edecek mi (evet → yeni migration ile CHECK genişler; hayır → test kapsamı ayrılır). Ben dokunmadım.
2. **`YAYIN_GECISLERI`nde `kapali_kuruldu`ya giden geçiş YOK.** `yayiniSonlandir(…, 'kapali_kuruldu')` bugün hiçbir durumdan çalışamaz. `deneme` açılışlı yayın bu yüzden `tekillik_kapisi`nda, "Duraklatılmış kuruldu ve AÇILMADI" sebebiyle kalıyor (para harcamıyor, açılmıyor). Öneri: `tekillik_kapisi: [..., 'kapali_kuruldu']`. Testler iki hâli de kabul ediyor; geçiş eklenince kendiliğinden doğru dala geçer.
3. `PlatformProvaSonucu`nda **"bekliyor" hâli yok**: Meta provası kuyrukta, POST cevabı çoğu zaman bekliyor → `{tur:'yapilmadi', sebep:'Meta’ya soruluyor…'}` dönüyor. Ayrı bir hâl ekranda daha doğru olur.
4. **Rehber içerik özeti shared'da yok** (`rehberKanonikIcerik`): API'de `rehber-kayit.ts#rehberOzeti` aynı kuralla (kanonikJson, kim/zaman hariç) yazıldı. Panel özet hesaplamıyor, sorun değil; ama kural shared'a taşınırsa tek kaynak olur.
5. **Meta FORM Dalga 1 ama uçtan uca çalışamaz:** `taslakDerle` `formId: null` geçiyor, `derleMeta` FORM'u `FORM-YOK` ile reddediyor. `formSablonuId` bir `lead_forms` satırına mı (mevcut form) yoksa `derleForm` ile yeni form mu kurulacak — sözleşme söylemiyor. Hazırlık bugün `lead_forms` listesini veriyor; derleyiciye bağlamak ayrı iş.
6. **`RehberOnKosullari.gizlilikAdresi`nin kaynağı yok:** Marka Merkezi'nde aydınlatma/gizlilik adresi alanı yok → her zaman `false` (FORM'da engel). Alan eklenmeli ya da kaynak `lead_forms.privacy_policy_url` olmalı.
7. Ön koşullar ve Meta asgarisi **hesap/sayfa başına**, hazırlık ucu ise hesap seçmeden çağrılıyor: ilk hesap/sayfa okunuyor; seçim farklıysa PUT/yayın bağlamı `null` (uyarı) görüyor. Hazırlığa `metaHesabiId/sayfaId/googleHesabiId` parametresi eklenirse kesin olur.
8. `karar tablosu` OTOMATIK_METIN satırı Talep Yaratma için "AI Max ve otomatik metin kapalı" diyor; Demand Gen'de AI Max yok ve metin otomasyonu için gövdede kilitlenebilecek bir alan bilmiyorum. Test yalnız Arama'yı kilitliyor.
9. `YoutubeVideoListesi.toplam` dönen sayı (en çok 50): kanalın gerçek video sayısı Akıllı Boost'un YouTube istemcisinde dönmüyor.
10. Shared `reklam/sohbet/` duruyor (sen bakacaksın); API'de artık kullanan yok.

## Açık kalanlar
- **AdvStrategy → AdvCampaign aktarımı hâlâ `adv_oturum`a yazıyor** (`strateji.service.ts#aktar`): sohbet kalktığı için bu oturumları okuyan ekran yok. Aktarım rehbere (`reklam_rehberi` taslağı) taşınmalı — ürün kararı + iş.
- Google yayını için insan düğmeleri yok: `POST /reklam/yayinlar/:id/geri-al` Meta motoruna gidiyor ve Google yayınında "Bu hesap bir Meta hesabı değil" sebebiyle olduğu yerde kalıyor (açık hata, sessiz değil). `sonuc_belirsiz`/`fark_var` Google yayınını geri almak (kampanyayı REMOVED/PAUSED) yazılmadı.
- Yayına alınmış rehber düzenlenemiyor; bütün platformlar ön kontrolde düşse bile (`on_kontrol_reddi`) rehber `yayinda` kalıyor → kullanıcı yeni rehber açmak zorunda.
- Ön koşul önbelleği süreç içi (15 dk); pm2 çoklu süreçte her süreç ayrı okur (en kötü hâl: uyarı).
- `ai-taslak.ts` + `oneriyi-onayla` ucu sohbetsiz artık ölü kod adayı (dokunulmadı).
- Logo yeni yükleniyorsa base64 baytları `yayin.derlenmis_govde` içinde saklanıyor (değişmez kayıt; boyut).
- Dalga 2-3 kurguları (Google form/telefon uzantısı, Talep Yaratma görsel, PMax) derleyicide açık retle duruyor (`G-KURGU-KAPALI`).
