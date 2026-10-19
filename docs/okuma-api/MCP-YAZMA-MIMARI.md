# MCP ile reklam kurma ve yönetme (yazma anahtarı)

> Ajan 1 · Mimar çıktısı, 2026-10-19. Sözleşme `packages/shared/src/okuma-api`.
> Kullanıcı kararları (2026-10-19): (1) MCP yayınlar, yayın DURAKLATILMIŞ açılır;
> (2) pilot: yalnız platform sahibi; (3) istemci Claude Code (Bearer anahtar);
> (4) bütün yazma araçları, ama her platform işleminden önce "şöyle yapacağım,
> onaylıyor musunuz?"; (5) MCP üzerinden yüklenen görsel Varlıklar'a girer.

## 0. Çelişki tablosu (kullanıcıyla kapandı)

| # | Eski karar / depo | Yeni | Nasıl kapandı |
|---|---|---|---|
| Ç-1 | Asistan tasarımı (2026-09-08): "yayın her zaman panelden, `publish_campaign` aracı YOK" | MCP yayınlar | Kullanıcı kararı (1). Güvence iki katman: yayın DURAKLATILMIŞ açılır, açmak ayrı ve ayrıca onaylı bir işlem. |
| Ç-2 | `MCP_TALIMATLARI`: "Hiçbir araç yazmaz" | Okuma anahtarına aynı metin; yazma anahtarına ayrı talimat | Talimat anahtarın yetkisine göre seçiliyor. Okuma anahtarı yazma araçlarını `tools/list`te hiç görmüyor. |
| Ç-3 | Anahtar yalnız `@OkumaAnahtariyla()` uçlarında, uçların hiçbiri yazmıyor | Yazma `/mcp` ucunun içinden, araç düzeyinde | Uç aynı kalıyor; yazma aracı anahtarın `yetki = 'yazma'` olduğunu ve kullanıcının izni olduğunu ARAÇ İÇİNDE ayrıca denetliyor (§ 3). Panelin hiçbir yazma ucu anahtara açılmadı. |
| Ç-4 | `ai_onerisi` kaynaklı yapısal alan, kullanıcı kabul edene kadar derlenmez | MCP'nin yazdığı alan `kullanici` kaynağıyla yazılıyor | Alanı modelin değil kullanıcının sözüyle yazdığı kabul ediliyor: yayının onay özeti BÜTÜN yapısal alanları (hesap, amaç, bütçe, takvim, konum, yaş, özel kategori, hedef adres) listeliyor ve kullanıcı onu onaylamadan yayın yok. Yeni bir `mcp` kaynağı açılmadı: `REHBER_IZINLI_KAYNAKLAR` ve DB CHECK'leri genişlerdi. |
| Ç-5 | `yayin.kaynak` CHECK: panel / ai_kart / kopya / toplu | MCP izi yayın tablosunda değil | Rehber yayını iki platform yolunda da `panel` yazıyor; CHECK'e dokunmak iki yolu değiştirmek demekti. MCP izi `mcp_onaylari` satırında (rehber kimliği, sonuç) ve `audit_logs`ta (`mcp.*` eylemleri). |
| Ç-6 | Rehber yayınında açılış amaca göre (`platformAcilabilirMi`) | MCP yayını her zaman kapalı | `RehberService.yayinla`ya `{ hepsiKapali: true }` seçeneği; panel çağrısı değişmedi. |
| Ç-7 | Etkinleştirme panelde "Reklam Yöneticisi'nden Başlat" | MCP'de `varlik_etkinlestir` | Aynı yol: `CampaignActionsService.uygula` (şalter, kota, geri okuma, denetim). Kimlik Advetics kampanya UUID'si; yapı taraması kampanyayı görmeden UUID yok ve araç bunu SÖYLÜYOR. |
| Ç-9 | Panelde serbest bütçe yazma YOK: bütçe İyileştir önerisinden (%20 sınırı, aylık bütçe kontrolü) | MCP'de `butce_degistir` | Kullanıcı kararı (4) "tam yetki, onayla". Onay özeti eski → yeni değeri ve değişim yüzdesini yazıyor; %20'yi aşan değişiklikte "öğrenme sıfırlanabilir" uyarısı. Aylık bütçe planı KONTROL EDİLMİYOR ve özet bunu söylüyor. |
| Ç-8 | Modül adı `okuma-api` | Aynı modül | Ad korunuyor (tablo `okuma_api_anahtarlari`, panel bileşenleri); yeniden adlandırma bu işin parçası değil. Ekranın başlığı değişebilir (Ajan 3 taslağı). |

## 1. Anahtar

- Tablo aynı: `okuma_api_anahtarlari.yetki` (`okuma` | `yazma`, varsayılan `okuma`).
- Yazma anahtarı `adv_rw_` önekiyle başlar. Sızan bir anahtarın neyi açtığı
  ilk bakışta görünsün; bekçi iki öneki de anahtar sayar.
- Yazma anahtarı SÜRESİZ olamaz (30 ya da 90 gün). Okuma anahtarının süresiz
  seçeneği duruyor (gerekçesi sözleşmede).
- Yetki her istekte satırdan okunur (platform sahipliği gibi): satırı
  okumadan karar veren bir önbellek, yetkisi düşürülmüş anahtara yazdırırdı.
- Anahtar sahibinin KENDİ izinleriyle çalışır: yazma aracı `bulk.write`,
  `bulk.publish`, `budget.write` iznini seçili kapsamın bağlamında ayrıca
  arar. Anahtar kullanıcıyı aşamaz.

## 2. Onay (kullanıcı kararı 4)

Platforma dokunan dört işlem İKİ ADIMLI:

| İşlem | Araç | Altındaki servis |
|---|---|---|
| Rehberi yayınla (duraklatılmış) | `rehber_yayinla` | `RehberService.yayinla(…, { hepsiKapali: true })` |
| Durdur | `varlik_durdur` | `CampaignActionsService.uygula` `pause` |
| Başlat | `varlik_etkinlestir` | `uygula` `resume` |
| Bütçe değiştir | `butce_degistir` | `uygula` `set_budget` |

1. Araç çağrılır → sunucu bütün ön kontrolleri yapar (kapsam, izin, şalter,
   bağlantı; bütçede ve durumda platformdaki ŞU ANKİ değer okunur) ve
   platforma HİÇBİR ŞEY yazmadan `mcp_onaylari`na `bekliyor` satırı açar.
   Dönen: onay kodu, okunabilir özet (eski → yeni), geçerlilik (15 dk).
2. Model özeti kullanıcıya gösterip "onaylıyor musunuz?" diye sorar.
3. Kullanıcı evet derse model `onayla(onay_kodu)` çağırır. Argümanlar
   SUNUCUDA saklı: model onaydan sonra bir rakamı değiştiremez. Satır
   `UPDATE … WHERE durum = 'bekliyor' AND bitis > now() RETURNING` ile
   tek seferde `uygulaniyor`a geçer (çift çağrı ikinci işlem açmaz),
   işlem yapılır, `uygulandi` / `basarisiz` + sonuç yazılır.
4. `vazgec(onay_kodu)` satırı kapatır.

**Sınır, açıkça:** sunucu, `onayla`yı bir insanın mı modelin mi istediğini
ayırt edemez. İnsan kapısı Claude Code'un araç izni: `onayla` aracı
`destructiveHint: true` ile işaretli ve Claude Code onu her seferinde sorar,
YETER Kİ kullanıcı "her zaman izin ver" listesine eklemesin. Bağlantı
belgesi bunu yazıyor. Taslak araçları (rehber yazma, görsel yükleme, prova,
metin önerisi) platforma dokunmuyor ve onay istemiyor: rehber sürümlü,
her şey yayından önce özetle onaylanıyor.

## 3. Araçlar

Okuma (iki anahtar da): mevcut 9 araç.

Yazma anahtarına ek, onaysız (platforma yazmaz):

| Araç | Ne |
|---|---|
| `yazma_durumu` | Workspace'in reklam kurmaya hazırlığı: hesaplar, sayfa, Instagram, YouTube, şalterler, atıf standardı. İLK çağrılacak araç. |
| `rehberler` / `rehber_oku` | Liste ve tek rehber (alanlar, eksikler, içerik özeti). |
| `rehber_olustur` | Boş rehber (ya da `kaynak_rehber_id` ile kopya). |
| `rehber_guncelle` | Alan yaz/sil; `surum` iyimser kilit (409 = başka yer yazdı). Kaynak `kullanici`. |
| `rehber_prova` / `rehber_prova_oku` | Platform provası (nesne açmaz). Meta provası kuyrukta, sonuç sonra okunur. |
| `metin_oner` | Rehbere YAZMAZ, öneri döner. |
| `varliklar` | Workspace'in görsel/video arşivi (son 50 + toplam). |
| `yukleme_adresi` | Tek workspace'e 15 dk geçerli yükleme jetonu + hazır `curl` komutu. |
| `rehber_yayin_durumu` | Yayın kayıtları; kurulan kampanyanın Advetics UUID'si (yapı taraması gördüyse). |
| `onaylar` | Bu anahtarın son onay satırları. |
| `formlar` | Advetics'te kurulan anlık formlar (taslak dahil), Meta form kimliği ve hatası. Meta'daki yayında formlar `form_sablonlari`. |
| `form_olustur` | Advetics'te TASLAK form (panelin `FormsService.create`'i, `leadFormInputSchema`); Meta'ya gitmez. Workspace ve sayfa argümandan, formun içinden değil. |

Onaylı: § 2'deki dört araç + `form_yayinla` + `onayla`, `vazgec`.

**`form_yayinla` (2026-10-20, kullanıcı: "form oluşturma yolu oluşturmamız lazım").**
AdvCampaign'in form amacı Meta'da yayında bir form istiyor ve MCP yalnız
var olanları listeliyordu; yeni form ancak panelden açılabiliyordu. Yol
panelin kendi yayıncısı (`FormPublisherService.publish`: sahiplenme,
belirsiz hâl, geri okuma); ikinci bir form yayın yolu YOK. Reklam
yayınından daha geri dönüşsüz (Meta'da form silinemiyor, değiştirilemiyor),
bu yüzden onay özeti Meta'da kalıcı olacak her metni yazıyor (sorular,
gizlilik adresi, KVKK kutuları, teşekkür düğmesi) ve onay satırı formun
İÇERİK ÖZETİNİ taşıyor (`formIcerikOzeti`): onaydan sonra taslak panelden
değişirse `onayla` Meta'ya hiç gitmiyor. Geri okuma uyarısı varsa sonuç
`basarisiz` ama Meta form kimliği yine dönüyor (form açık). `belirsizOnayi`
MCP'den verilmiyor: belirsiz satırı açmak panelin Formlar ekranının kararı.
Migration `20261024100000_mcp_form_yayinla` onay tablosunun `islem`
kısıtını genişletiyor.

## 4. Görsel yükleme (kullanıcı kararı 5)

Claude Code dosyayı MCP argümanında base64 olarak göndermemeli (bir görsel
yüz binlerce karakter, modelin üretmesi gereken metin). Bunun yerine:

1. `yukleme_adresi(workspace_id)` → imzalı jeton (HMAC, `JWT_ACCESS_SECRET`
   ile alan ayrımlı), 15 dk, en çok bir workspace.
2. Claude Code kendi kabuğunda: `curl -F dosya=@gorsel.jpg -H "X-Advetics-Yukleme: <jeton>" https://advetics.com/api/mcp/yukleme`
3. Uç jetonu doğrular, ANAHTARI YENİDEN doğrular (iptal, süre, yetki,
   platform sahipliği), workspace bağlamını kurar ve `AssetsService.upload`
   çağırır: Varlıklar'ın kendi yolu, biçim/boyut/süre kontrolü giriş anında.
   Tür baytlardan (JPEG/PNG → `image`, MP4/MOV → `video`).
4. Dönen `varlik_id` rehberin `medya` alanına yazılır.

Jeton tablosu YOK: imzalı ve süreli; 15 dk içinde birden çok dosya
yüklenebilir ("bu beş görseli yükle"). İptal edilen anahtarın jetonu da
ölü, çünkü anahtar her yüklemede yeniden okunuyor.

## 5. Veri modeli

```
okuma_api_anahtarlari  + yetki VARCHAR(10) NOT NULL DEFAULT 'okuma' CHECK (okuma|yazma)

mcp_onaylari
  id UUID PK, anahtar_id → okuma_api_anahtarlari (CASCADE), user_id → users (CASCADE)
  islem   VARCHAR(30)  CHECK (rehber_yayinla|varlik_durdur|varlik_etkinlestir|butce_degistir)
  hedef   JSONB        sunucuda saklı argümanlar (onayla bunları kullanır)
  ozet    JSONB        kullanıcıya gösterilen satırlar
  durum   VARCHAR(15)  CHECK (bekliyor|uygulaniyor|uygulandi|basarisiz|vazgecildi)
  sonuc JSONB, hata TEXT, bitis TIMESTAMPTZ, karar_at TIMESTAMPTZ, created_at
```

RLS: satır yalnız sahibine (`user_id = app.current_user_id()`),
`okuma_api_anahtarlari` ile aynı kural. `client_id` kolonu YOK (hedef
workspace `hedef` içinde): 15 dakikalık bir onay satırı için workspace
taşıma kararı gerekmiyor. DELETE politikası yok.

## 6. Ölçülecekler (canlıda)

- Claude Code `/mcp`: yazma anahtarıyla araç sayısı, okuma anahtarıyla 9.
- `onayla` için Claude Code izin sorusu gerçekten geliyor mu.
- Yükleme: 5 MB JPEG ve 50 MB MP4 nginx gövde sınırından geçiyor mu
  (`client_max_body_size`; değiştirmek sistem ayarı, değiştirilmez, bildirilir).
- Yayın: Meta + Google rehberi `kapali_kuruldu`, platformda duraklatılmış.
- `varlik_etkinlestir` sonrası geri okuma `dogrulandi`.
