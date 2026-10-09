# İyileştir v1 + AI Asistan v1 — Mimari (Ajan 1)

**Tarih:** 2026-10-09 · Sözleşme: `packages/shared/src/iyilestir/index.ts`
(derleme çıktısıyla temiz). Plan ve çelişki tablosu: [`PLAN.md`](PLAN.md).
Ekran: [`taslak.html`](taslak.html) (kullanıcı onayladı, tek değişiklik:
Google'da da Uygula).

## 1. Ölçüm (canlı, 2026-10-09, salt okuma)

| Soru | Sonuç |
|---|---|
| Reklam seviyesi sıklık dolu mu? | Meta: 15.288 satırın 15.098'i (son 30 gün). Google ve LinkedIn: **0** (erişim gelmiyor) |
| Günlük sıklık dağılımı (Meta reklam, ≥1.000 gösterim) | ortanca 1,11 · üst %10 1,36 |
| Tıklama oranı oranı (bu hafta / geçen hafta) | ortanca 0,99 · alt %10 **0,66** |
| CTR %30+ düştü VE sıklık arttı | **22 reklam**, son 7 günde 24.102 ₺ |

Sonuç: yorgunluk eşiği `YORGUNLUK` sabitinde (oran ≤ 0,7, sıklık artmış,
iki haftada ≥1.000 gösterim). **7 günlük sıklık tablodan HESAPLANAMAZ**
(günlük erişim toplanamaz); kartta "günlük sıklık" yazılır, "haftalık"
diye uydurulmaz. Kurallar motorunun `frequency`'si toplam gösterim ÷
ortalama günlük erişim — bilinçli üst sınır, yorumunda yazılı.

**Ölçülmedi (Ajan 5):** Google bütçelerinin kaçının paylaşımlı
(`explicitly_shared`) olduğu; ilk Google yazmasının `validateOnly` provası.

## 2. Öneri üretimi

Öneriler **istek anında hesaplanır, saklanmaz**; yalnız KARAR saklanır.
Gerekçe: saklanan öneri bayatlar (bütçe başkası tarafından değişir) ve
eski değerle uygulanır. Kararlı anahtar `tur:seviye:varlıkId:ISO-hafta`.

| Tür | Kaynak | Koşul | Eylem |
|---|---|---|---|
| `kreatif_yorgunlugu` | `insights_daily` reklam seviyesi, Meta | `YORGUNLUK` eşikleri | reklamı durdur (`ad`). Setteki TEK yayındaki reklamsa uyarı cümlesi + "AdvCampaign'de yeni kreatif" |
| `butce_artir` | kampanya/set seviyesi, Meta + Google | bütçenin ≥%90'ı harcanıyor (son 7 gün) VE dönüşüm başı maliyet workspace ortalamasının ≤%70'i VE ≥5 dönüşüm | bütçe +%≤20, aylık bütçeye (`budgets/pacing`) sığmıyorsa öneri YOK |
| `butce_azalt` | aynı | bütçenin <%30'u harcanıyor (son 7 gün) | bütçeyi son 7 günün en yüksek günlük harcamasının 1,2 katına indir, en fazla %20 adımla |

Bütçe **gerçekte durduğu seviyede**: Meta'da kampanya bütçesi varsa
kampanya, yoksa reklam seti; Google'da kampanya bütçesi (paylaşımlı
bütçe → öneri YOK, `kisit`: "bütçe başka kampanyalarla paylaşılıyor").
Bilinmiyorsa öneri üretilmez (tahmin etmektense kısıtla).

## 3. Uygulama yolu (tek yol)

`POST /iyilestir/oneriler/:anahtar/uygula {ozet}` →
1. Öneriyi YENİDEN hesapla; yoksa 409 "öneri artık geçerli değil";
   `ozet` farklıysa 409 "öneri değişti, yenile".
2. `CampaignActionsService.uygula(...)` — **genişletilecek**: seviye
   `campaign | ad_group | ad`, eylem `pause | set_budget`.
3. **Platformdan geri oku** (Meta: `GET /{id}?fields=status,daily_budget,
   lifetime_budget`; Google: GAQL `campaign.status`, `campaign_budget.
   amount_micros` / `ad_group_ad.status`) ve karşılaştır → `dogrulandi |
   uyusmadi`.
4. Karar tablosuna yaz (kim, ne zaman, eski → yeni, platform değeri) +
   `audit.record`.

Asistanın Uygula kartı AYNI uca gider; ayrı yazma yolu yok.

### Google yazma yolu (yeni, kullanıcı isteği)

`google.provider.ts#applyAction` bugün "henüz yazılmadı" fırlatıyor.
Yazılacak: `campaigns:mutate` (status PAUSED/ENABLED),
`adGroupAds:mutate` (status), `campaignBudgets:mutate` (amount_micros).
Kurallar (CLAUDE.md Google): `partialFailure: false`, hata `details`/
`trigger` ATILMAZ (`googleHataAyrintisi`), paylaşımlı bütçeye yazılmaz
(önce `campaign_budget.explicitly_shared` okunur). **İlk canlı çağrı:**
`validateOnly: true` prova, sonra en küçük değişiklik (bir reklamı
duraklat + Google Ads arayüzünde GÖZLE doğrula).

## 4. Veri modeli (Ajan 2)

| Tablo | Alanlar | RLS | Workspace taşıma |
|---|---|---|---|
| `iyilestir_oneri_karar` | id, org_id, client_id, anahtar (uniq per client), tur, platform, durum (`uygulandi`/`yoksayildi`), eylem jsonb, sonuc jsonb, user_id, created_at | client_id kapsamı (diğer tablolarla aynı desen) | TAŞINIR (kararın geçmişi workspace'e ait) |
| `iyilestir_asistan_oturum` | id, org_id, client_id, user_id, created_at | client + sahibi | TAŞINIR |
| `iyilestir_asistan_mesaj` | id, oturum_id, client_id, rol, parcalar jsonb, giris/cikis token, created_at | client | TAŞINIR |

Üç tablo için üç durak: `pglite-harness` TRUNCATE, `02_rls.sql`,
`workspace-tasima.ts#WORKSPACE_TABLOLARI`. Eski `ai_conversations`
kullanılmaz.

## 5. Uçlar ve yetki

| Uç | Yetki |
|---|---|
| `GET /iyilestir/oneriler?clientId=&from=&to=` | `insights.read` |
| `POST /iyilestir/oneriler/:anahtar/uygula` | `budget.write` (kullanıcı kararı) |
| `POST /iyilestir/oneriler/:anahtar/yoksay` | `budget.write` |
| `POST /iyilestir/asistan/oturumlar`, `GET .../:id` | `insights.read` |
| `POST /iyilestir/asistan/oturumlar/:id/mesajlar` (SSE) | `insights.read` |

Müşteri hesabı (`client_viewer`) İyileştir'i GÖRMEZ: menüde yok
(`nav-sections.spec.ts` dört ekranı kilitliyor) ve `budget.write` yok.

## 6. AI Asistan

Gemini (`yapay-zeka/gemini.ts`, `akis` + araç çağırma), AdvCampaign
sohbet döngüsünün deseni (`reklam/sohbet/dongu.ts`) — kod KOPYALANMAZ,
ortak döngü parçası çıkarılır ya da çağrılır. Araçlar `ASISTAN_ARACLARI`:
okuma araçları `MetricsService` (Okuma API'nin kullandığı yol, yeni SQL
yok) + `butce_temposu` (`budgets/pacing`) + `oneriler` (yukarıdaki
üretici) + `uygula_karti` (bir öneriyi kart olarak döndürür, YAZMAZ) +
`advcampaign_devret` (`adv_oturum.hazir_istem`, AdvStrategy aktarım
deseni). Doğrudan yazma aracı YOK.

## 7. Ekran (Ajan 3)

`/iyilestir`, sekmeler adreste (`?sekme=oneriler|asistan|kurallar`);
`/kurallar` → `/iyilestir?sekme=kurallar` yönlenir (Kurallar içeriği
taşınır, yeniden yazılmaz). Görünüş `components/taslak/taslak.module.css`
(Genel Bakış ile aynı dil); taslaktan sapma yok.

## 8. Test & güvenlik listesi (Ajan 4)

- Üç tablo için `SET ROLE` + `RETURNING` RLS testi.
- Özet uyuşmazlığında uygulama YOK (mutasyon: özet kontrolünü sil → test düşmeli).
- Geri okuma uyuşmazlığı `uyusmadi` yazıyor, `dogrulandi` DEĞİL.
- Paylaşımlı Google bütçesine yazma denemesi reddediliyor.
- Bütçe adımı %20'yi geçemiyor (sınır değerleri).
- Asistan araç listesinde yazan araç yok (kaynak taraması).
- Sessiz hata: öneri kaynağı düşerse `hatalar`a yazılıyor, boş liste değil.
