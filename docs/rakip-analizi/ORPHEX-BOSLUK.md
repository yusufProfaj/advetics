# Orphex boşluk analizi ve mimari yol haritası

**Tarih:** 2026-10-12 · **Durum:** taslak — her madde kullanıcı onayıyla
ilerliyor (aşağıda "Karar" sütunu). Onaylanan madde kendi
`docs/<modül>/MIMARI.md`'sini açar ve beş ajan düzeniyle yürür.

**Kaynak:** yalnızca Orphex'in HERKESE AÇIK yüzeyi — orphex.co sayfaları ve
JS paketleri, changelog ucu (40 kayıt), intercom.help/orphex (49 makale),
mcp.orphex.co, GitHub `OrphexTech/agent-skills` (MIT). `app.orphex.co`'ya
girilmedi, hesap açılmadı. Ham döküm oturum scratchpad'inde; buraya
yalnızca kararı etkileyen bulgular alındı.

**Kopyalama yok, işlev var** (URUN-YAPISI-PLANI §1): metin, görsel, marka,
kod alınmıyor. Aşağıdaki sayılar (eşikler, pencereler) Orphex'in
kullanıcıya YAZDIĞI parametreler; bizde kendi canlı verimizle ölçülüp
yeniden kararlaştırılır.

---

## 0. Çelişki: "Orphex söyler, Advetics yapar" artık tam doğru değil

URUN-YAPISI-PLANI §1 "Orphex reklam kurmuyor ve değiştirmiyor" diyor.
2026'da çıkan **Orphex MCP** Claude/ChatGPT/Copilot üzerinden YAZIYOR:
Google/Meta/TikTok'ta durum, bütçe, teklif stratejisi, kampanya/set/reklam
kurulumu; Google'da anahtar kelime, negatif, RSA, uzantı. Onay modeli:
önizleme platformdan canlı değeri okur, onay 15 dk / istek 24 saat
geçerli, "rehearsal" (prova), isteğe bağlı ikinci onaylayıcı, her yeni
nesne duraklatılmış başlar, tek değişiklikte bütçe en fazla %50, günde 50
yeni nesne, değer değişikliği geri alınabilir.

Ana panel (ve Orpheus asistanı) hâlâ büyük ölçüde öneri veriyor. Bizim
gerçek farkımız şuna daralıyor:

- **Reklam bilmeyen kullanıcı** için uçtan uca kurulum (AdvCampaign rehberi,
  hedef/teklif sorulmuyor) — Orphex MCP uzman bir ajan kullanıcısı varsayıyor.
- **Beyaz etiket + müşteri onayı** (AdvStrategy, müşteri paneli, rapor/fatura).
- **Panel içinde "Uygula"**: MCP dışarıda, bizimki ekranda.
- Akıllı Boost, lead yönetimi, kurulum/ölçüm rehberi.

**Karar gerekiyor (Ç-O1):** URUN-YAPISI-PLANI §1 cümlesi güncellensin mi?

---

## 1. Boşluk tablosu

Öncelik ölçütü CLAUDE.md §5: **kullanım kolaylığı ve reklam verimliliği**,
artı maliyet (yeni entegrasyon mu, var olan veri mi).

| # | Boşluk | Orphex'te | Advetics'te bugün | Maliyet | Öneri |
|---|---|---|---|---|---|
| B-1 | **Performans anomalisi** | 100+ metrik, beklenen aralık dışı, düşük hacim eşiği, 7 gün sonra kendiliğinden kapanır, sabah maili | YOK (yalnız teknik/hesap uyarıları) | Düşük — `insights_daily` hazır | **1. sıra** |
| B-2 | **Bildirim kanalları + alarm sihirbazı** | E-posta, Slack, Teams, WhatsApp; 5 adım (seviye → süzgeç → koşul → kanal → önizleme) | Kural `notify` yalnız log yazıyor; kanal yok | Düşük-orta | B-1 ile birlikte |
| B-3 | **KPI hedef temposu** | Hedef vs "bugün olması gereken"; CPA/CPC'de yön ters; liste/ızgara/grafik | Yalnız aylık bütçe temposu | Düşük — Aşama 2'de zaten var | Aşama 2 |
| B-4 | **Sağlık kontrolleri** | 9 kontrol: UTM eksik, Meta kitlesi <1.000, tracking gap, GA4 key event yok, reddedilmiş reklam, PMax asgari varlık, 7 gün sıfır gösterim, Search Console yok, erişim kaybı; kapatılabilir, kötüleşirse geri açılır | Teknik uyarılar + Ölçüm denetimi (kısmen) | Düşük — çoğu veri hazır | 2. sıra |
| B-5 | **Haftalık özet maili** | Pazartesi 09:00: sonuç, metrik, neden, 4-5 öne çıkan, önerilen aksiyon | Yalnız zamanlanmış rapor PDF'i | Düşük — SMTP + Gemini + rapor sorguları hazır | 3. sıra |
| B-6 | **Değişiklik etkisi (Impact Analysis)** | Bütçe/teklif değişikliğinden sonra karşıt olgusal etki; 60 gün önce / 7 gün sonra, ≥200 tık, "Gerçek etki" / "Henüz belli değil" | YOK | Orta — **değişiklik anını biz zaten kaydediyoruz** (`campaign-actions`, `RuleActionLog`, `IyilestirOneriKarar`) | 4. sıra — "Uygula"nın kanıtı |
| B-7 | **Kreatif zekâsı** | Görsel etiketleme (renk, insan, CTA, metin yoğunluğu) × performans, lift tahmini; yeni kreatif kovaları; 0-100 puan; üretim brief'i | Meta yorgunluğu + geçmiş sıralama | Orta-yüksek — Gemini görü var, kota/maliyet ölçülmeli | 5. sıra |
| B-8 | **Dönüşüm geri besleme** | Meta CAPI, Google click-conversion upload, özel kitle yükleme | Lead modülü VAR ama platforma kalite geri gitmiyor | Orta | 6. sıra — verimlilik etkisi yüksek |
| B-9 | **GA4 okuma** | GA4 + BigQuery export, platform dönüşümüyle yan yana, "tracking gap" | Yalnız GA4 kurulum (Admin API) | Orta | B-4'ün "tracking gap"i buna bağlı |
| B-10 | **Rakip takibi** | Meta Ad Library + Google Transparency, platform başına 10 marka | YOK | **Belirsiz** — aşağıya bkz. | Ölçülmeden karar yok |
| B-11 | **MCP yazma + onay modeli** | Yukarıda §0 | MCP salt okunur, 9 araç, yalnız platform sahibi | Orta — `campaign-actions` hazır | Aşama 6 |
| B-12 | **Search Console** | Organik + ücretli arama örtüşmesi | YOK | Düşük-orta | B-9'dan sonra |
| B-13 | **E-ticaret / ürün performansı** | Merchant Center, Meta Catalog, Shopify, ikas, Ticimax (RFM, iade, pazaryeri) | YOK (yalnız site taramasında altyapı tanıma) | Yüksek | Müşteri tabanına bağlı — soru |
| B-14 | **TikTok** | Okuma + MCP yazma, benchmark | YOK | Yüksek (CLAUDE.md "platform eklemenin gerçek yüzeyi") | Müşteri talebine bağlı — soru |
| B-15 | **2FA** | Zorunlu, 6 hane, 10 dk | YOK (kaynakta iz yok) | Düşük | Güvenlik — öneri |
| B-16 | Özel pano / formüllü metrik | Sürükle-bırak, 15 düzey formül | YOK | Orta | **Önerilmiyor**: reklam bilmeyen kullanıcı hedefiyle çelişiyor |
| B-17 | MMP (AppsFlyer/Adjust), BigQuery, DV360/CM360 | VAR | YOK | Yüksek | **Önerilmiyor**: müşteri tabanında uygulama/kurumsal veri ambarı yok (doğrulanmalı) |

**B-10 notu:** Meta Ad Library API'si ticari reklamları yalnız AB'de
gösterilenler için veriyor; Türkiye'deki ticari reklamlar API'de yok
(siyasi/sosyal konu reklamları hariç). Google Ads Transparency Center'ın
resmî API'si yok. Yani Türkiye pazarında rakip takibi büyük ihtimalle
sayfa kazıması demek — kullanım koşulları ve kırılganlık riski. Ölçüm
turu olmadan plana girmez.

---

## 2. Önerilen sıra ve mimari taslakları

Hepsi URUN-YAPISI-PLANI'deki aşamalara oturuyor; yeni menü bölümü YOK.

### Paket A — "Bir şey ters gidince haber ver" (B-1 + B-2 + B-4)

İyileştir'in ve Genel Bakış'ın "bugün ne yapmalıyım" sorusunu cevaplıyor.
Ek entegrasyon yok, tamamı mevcut veriden.

- **Veri:** yeni `performans_sinyalleri` (anomali + sağlık kontrolü tek
  tabloda, `tur` kolonu) — `client_id`, `ad_account_id`, seviye, varlık,
  metrik, beklenen aralık, gözlenen, `durum` (`acik`/`kapatildi`/
  `kendiliginden_kapandi`), `kapatan`, `ilk_gorulme`, `son_gorulme`.
  Üç durak: TRUNCATE listesi, `02_rls.sql`, `WORKSPACE_TABLOLARI`.
- **Durum makinesi:** açık → kapatıldı (kullanıcı) / kendiliğinden kapandı
  (7 gün görülmedi). Kapatılan sinyal KÖTÜLEŞİRSE yeniden açılır (Orphex
  deseni). SON durumları sayan her yer aynı commit'te (CLAUDE.md
  "durum enum'ından ikisini saymak").
- **Hesap:** `sweep:sinyaller` saatlik değil GÜNLÜK, `daily` metrik işinin
  SONUNA zincirli (kuyruk önceliği bariyer değil). Beklenen aralık için ilk
  sürüm basit: aynı haftanın günü, son 4-8 hafta, medyan ± MAD; düşük
  hacimde (gösterim/harcama eşiği) sinyal üretilmez. Eşikler canlı veriyle
  ölçülür.
- **Sağlık kontrolleri:** her kontrol saf bir fonksiyon (`kontrol(veri) →
  bulgu | null`), listesi tek sabitte. İlk set yalnız elimizde verisi
  olanlar: 7 gün sıfır gösterim, reddedilmiş/sınırlı reklam, Meta kitlesi
  <1.000, dönüşüm işlemi yok/pasif, GA4 key event yok (kurulum modülü
  biliyor), PMax asgari varlık.
- **Bildirim kanalları:** workspace başına kanal listesi (e-posta, Slack
  webhook, Teams webhook). WhatsApp Business API ayrı onay/maliyet ister —
  ilk sürümde YOK, açıkça yazılır. Webhook adresi şifreli saklanır,
  giden istek beyaz liste (`hooks.slack.com`, `*.webhook.office.com`).
  Kural motorunun `notify` eylemi aynı kanallara bağlanır.
- **Ekran:** İyileştir'e "Sinyaller" sekmesi; Genel Bakış'ta "Bekleyen
  işler" listesine girer (Aşama 2). Her sinyalin yanında var olduğu yerde
  "Uygula" (durdur/bütçe) — farkımız bu.
- **Ölçülecek:** yanlış alarm oranı (2 hafta sessiz koşum, kullanıcıya
  gösterilmeden), Slack/Teams'e gerçek gönderim.

### Paket B — Haftalık özet maili (B-5)

- Zamanlanmış rapor altyapısı (`report_schedules`) üstüne YENİ bir tür:
  `haftalik_ozet`. PDF yok, mail gövdesi.
- İçerik: geçen hafta vs önceki hafta, en çok değişen 3-5 kalem, Paket
  A'nın açık sinyalleri, bekleyen Uygula kartları. Gemini YALNIZ yorum
  cümlesini yazar; sayılar sorgudan gelir ve metne şablonla girer (model
  sayı uydurmasın).
- Alıcılar Marka Merkezi'ndeki rapor alıcıları.

### Paket C — Değişiklik etkisi (B-6)

- **Bizim avantajımız:** Orphex değişikliği platformun değişiklik
  geçmişinden çıkarıyor; biz kendi yazdığımız her değişikliği zaten
  kaydediyoruz (`campaign-actions` geri okuması, `RuleActionLog`,
  `IyilestirOneriKarar`). Platform dışı (Meta arayüzünden, MCP'den)
  değişiklikler için Meta `activities` / Google `change_event` okuması
  ikinci adım.
- Yöntem ilk sürümde sade: değişiklik öncesi N gün trend + kontrol grubu
  olarak aynı hesabın değişmeyen kampanyaları; yetersiz hacimde "Henüz
  belli değil". BSTS/CausalImpact gibi ağır model sunucuya yeni ikili
  bağımlılık getirir (paylaşımlı VPS) — gerekirse ayrı karar.
- **Ekran:** her "Uygula"nın 7. gününde kartın altına sonuç. Haftalık özete
  de girer.

### Paket D — Kreatif zekâsı (B-7)

- Gemini görü ile kreatif başına etiket (sabit şema: insan var/yok, ürün
  görünür, metin yoğunluğu, baskın renk, CTA metni var/yok, format).
  Etiket bir kez üretilir, `creatives` satırına bağlı saklanır; görsel
  adresi KULLANIM ANINDA tazelenir (`kreatif-adresi.service.ts`).
- Etiket × performans: yalnız yeterli harcaması olan kreatifler; "bu
  özellikteki kreatifler CTR'de %X daha iyi" — örneklem büyüklüğü her
  zaman yazılır.
- Yeni kreatif kovaları (iyi gidiyor / dikkat / veri yetersiz) mevcut
  yorgunluk sinyaliyle aynı ekranda.
- **Ölçülecek önce:** kreatif başına Gemini maliyeti ve süresi, kota.

### Paket E — Dönüşüm geri besleme (B-8)

- Lead modülündeki "nitelikli / satışa döndü" işareti → Meta CAPI
  (`Lead` → `QualifiedLead` olayları, lead ID ile) ve Google offline
  conversion upload (GCLID varsa).
- Reklam verimliliğine doğrudan etki: platform algoritması iyi lead'e
  optimize eder.
- **Ölçülecek:** Meta CRM entegrasyonu için gereken izin, GCLID'in
  formdan gelip gelmediği.

### Paket F — Dış veri (B-9, B-12, sonra B-13/B-14)

GA4 Data API okuma → "platform dönüşümü vs site dönüşümü" farkı (tracking
gap) → Search Console. E-ticaret ve TikTok müşteri tabanına göre ayrı
karar.

### Paket G — MCP yazma (B-11)

Aşama 6. Orphex'in onay modelinden alınacak İLKELER (kod değil):
önizleme platformdan canlı okur; onayın süresi var; prova; yeni nesne
duraklatılmış; bütçe değişikliğine üst sınır; değer değişikliği geri
alınabilir; günlük nesne sınırı. `campaign-actions` bunların yarısını
zaten yapıyor (geri okuma).

---

## 3. Karar kaydı

| # | Soru | Karar |
|---|---|---|
| Ç-O1 | URUN-YAPISI-PLANI §1 cümlesi güncellensin mi | **KAPANDI (2026-10-12): güncellendi** |
| Ç-O2 | Sıra: A → B → C → D → E → F → G | **KAPANDI (2026-10-12): ilk paket A** (anomali + sağlık + bildirim); kalan sıra her paket bitince yeniden sorulur |
| Ç-O3 | E-ticaret (B-13) kapsamda mı | **KAPANDI (2026-10-12): EVET.** Merchant Center + Meta Catalog + yerli altyapılar (ikas/Ticimax/Shopify) Paket F'nin içinde, GA4 okumasından sonra |
| Ç-O4 | TikTok (B-14) kapsamda mı | **KAPANDI (2026-10-12): şimdilik HAYIR.** Müşteri talebi gelirse yeniden açılır |
| Ç-O5 | Rakip takibi (B-10) | **KAPANDI (2026-10-12): kapsam DIŞI** (resmî API Türkiye ticari reklamını vermiyor; kazıma riski) |
| Ç-O6 | 2FA (B-15) | **KAPANDI (2026-10-12): listeye eklendi**, Paket A'dan bağımsız küçük güvenlik işi |
| Ç-O7 | Paket A nasıl başlasın (devam eden işler canlıda doğrulanmadı) | **KAPANDI (2026-10-12): Ajan 1 (mimari + sözleşme) ve tarayıcı taslağı şimdi; Ajan 2-3 devam eden işler canlıda doğrulanınca** — sıra kuralı korunuyor |
| Ç-O8 | Kullanıcı karar yetkisini oturum yöneticisine devretti (2026-10-12): "alt ajanlardan gelen yanıtların hepsini sen cevaplayabilirsin … kesintisiz devam" | Paket B/C/D/E/F mimarilerindeki "öneri" satırları KABUL edildi (her MIMARI.md §0). F Ç-6 koşullu: var olan `utm_` parametresi ezilmez. Sıra A → C → B (B, C'nin etkilerini okuyor) |
| Ç-O9 | Paket E Google tarafı | Google offline dönüşüm yükleme 2026-06-15'ten beri daha önce yüklememiş geliştirici token'ına KAPALI; yerine Data Manager API (`datamanager` scope). v1 yalnız Meta |
