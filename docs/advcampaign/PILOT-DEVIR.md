# Pilot (AdvStrategy + AdvCampaign yeniden kurgu) — nerede kaldık

> **Tarih:** 2026-10-08 · **Dal:** `claude/advcampaign-agents-strategy-1d8a19` (main'e
> BİRLEŞTİRİLMEDİ) · **Son commit:** `028bed2` · **Deploy:** YOK, yapılmamalı (Ajan 4 kapısı KAPALI).
> Devam etmek için: [`PILOT-DEVAM-PROMPTU.md`](PILOT-DEVAM-PROMPTU.md).

## Ne istendi

Kullanıcı (2026-10-07): AdvCampaign'i strateji modülündeki gibi beş ajanla, **en baştan**, en az
tıklamayla, **yapay zekâ odaklı reklam yönetimi** olarak kurgula; AdvStrategy'yi de dahil et
(çok manuel); amaç müşteriden veri alıp hesabını yapay zekâyla yönetmek; iki modülün tasarımı
beğenilmedi.

## Kurgu (onaylandı)

Veri → Plan → Kurulum → Pilot. Yapay zekâ doldurur, insan itiraz eder. Hedef: aylık plan +
kurulum **3 tıklama** (Planı hazırla · Müşteriye gönder · müşteri Onayla); bugün ~115.
Ayrıntı: [`AJAN-PLANI.md`](AJAN-PLANI.md) · arayüz taslağı (yönü onaylandı):
[`pilot-arayuz.html`](pilot-arayuz.html), yayında: claude.ai/artifact/Ky6hWwUJjmfChw49vCewbe.
Mimari ve kararlar: [`MIMARI.md`](MIMARI.md) (§9 KARARLAR, §11 anahtar/beyan) · canlıda öğrenilen
kuralların listesi: [`KABUL-LISTESI.md`](KABUL-LISTESI.md) (174 madde).

## Kullanıcı kararları (hepsi kapandı)

| Konu | Karar |
|---|---|
| Pilot otonomisi | Yalnız önerir, tek dokunuşla uygulanır; kendiliğinden hiçbir şey değiştirmez |
| Para harcamayı kim başlatır | **Müşteri onayı yeter** (ajansın yayın düğmesi yok) |
| Ajans müşteri adına onay | Evet, gerekçe zorunlu, ayrı kayıt |
| "Baştan" kapsamı | Her şey baştan; ama derleyici/para/hedefleme saf kuralları içe aktarılır |
| Kısmi ay | Plan toplamı = ayın harcanmamış kalanı; harcanan bilinmiyorsa boş + neden |
| Uyum bağlanınca bekleyen planlar | Ajans "Şimdi kur" der, müşteriye yeniden sorulmaz |
| İlk canlı | **Gerçek yayın anahtarı varsayılan KAPALI.** Kapalıyken ajansın kendi şirketi test kipi (kur → geri oku → açmadan arşivle), müşteri şirketi `kapali` (platforma sıfır çağrı). Profaj'ın hesabında temiz tur geçince kullanıcı açar |
| Tasarım | Taslağın yönü onaylandı |

## Ajanların durumu

| Ajan | Durum | Commit'ler |
|---|---|---|
| 1 Mimar | Bitti: `packages/shared/src/pilot/`, `uyum/`, yeni izin `strategy.publish` | `41dd62c`, `e3d6c36` |
| 2 Arka plan | Tur 1 bitti: uyum denetçisi, migration `20261009100000_pilot` (8 tablo) + `20261009110000_pilot_gercek_yayin`, plan uçları, taslak, kurulum işçisi, anahtar, beyan, hata filtresi `retler` | `6417255` … `fc76db5` |
| 3 Ön yüz | Tur 1 bitti: `/strateji` tek sayfa plan belgesi, `/reklam` Pilot açılışı (eskiler `?eski=1`), gerçek yayın anahtarı satırı, Marka Merkezi "Reklam beyanı" | `28f9fec` … `9633e40` |
| 4 Test & Güvenlik | **KAPI KAPALI.** Testler `028bed2` (beş bulgu `it.fails` ile kilitli) | `028bed2` |
| 5 Canlıya alma | Başlamadı | — |

Son ölçümler: API tam paket 4.246 yeşil (`fc76db5`, Ajan 2); web 1.285 yeşil; Ajan 4'ün eklediği
testlerden sonra **tam API paketi hiç sonuna kadar koşmadı** (makine yükü).

## Kapıyı kapatan bulgular (Ajan 4)

| # | Şiddet | Ne | Düzeltecek |
|---|---|---|---|
| B-4 | kırmızı | Satır işi ara durumda (`prova/kuruluyor/...`) beklenmedik hatayla düşerse plan sonsuza dek "kuruluyor"da kalır, kısmi tekil indeks o ayın yeni planını kilitler. `worker.ts` failed dinleyicisi ve `kurulum-supurme.ts` yalnız `taslak`ı kapatıyor; `kuruluyor`dan ajans çıkışı yok | Ajan 2 (+ durum makinesi Ajan 1) |
| B-1 | kırmızı (güvenli yöne) | `gercek-yayin.ts` `ajansOrgu` müşteri (`client_viewer`) bağlamında RLS yüzünden ajansı bulamıyor → anahtar açıkken bile müşteri onayı `kapali`ya düşüyor; Ç-6 fiilen çalışmıyor | Ajan 2 |
| B-2 | sarı | `plan.service.ts` `detayKur` müşteri yanıtına `ajansNotu`, `ajansMesaji`, `yayinKipi` koyuyor (panel çizmiyor ama API sızdırıyor) | Ajan 2 |
| B-3 | sarı | `shared/pilot/onay.ts` bütçe kontrolü beyan edilen `plan.toplam` ile; harcanacak olan satır toplamı | Ajan 1 — **KAPANDI 2026-10-08** (satır toplamı; test `it`) |
| B-5 | düşük | `kurulum-isleyici.ts` `derle` kitle şablonunu `client_id` süzgeçsiz okuyor | Ajan 2 |

Testle kilitlenmemiş gözlemler: `permission_overrides`'ta `strategy.approve:false` olan üyelik
`strategy.publish`'i rolden alıyor (sarı); ajans adına onay `audit_logs`a yazılmıyor; Gemini
çağrılarında kota yok (H-09); atıf standardı onayda değil worker'da kontrol ediliyor (C-16);
"değiştir" kutusunda yön/hedef satır doğrulanmıyor.

## Reklam metni kararı — KAPANDI 2026-10-08: seçenek (a)

Metin plan hazırlanırken yazılır, planda görünür, onay özeti metni kapsar. Sözleşme Ajan 1'de bitti
(MIMARI §12); uygulama Ajan 2 (§12.4) ve Ajan 3 (§12.5). Aşağıdaki metin kararın soruluş hâli.

### (eski) Bekleyen kullanıcı kararı

**Reklam metni ne zaman yazılsın?** Bugün Gemini metni müşteri onayından SONRA worker'da yazıyor;
gerçek kipte metin kimse görmeden yayına çıkar ve onay özeti metni kapsamıyor (site metni üzerinden
prompt injection yolu). Öneri: metin plan hazırlanırken yazılsın, plan belgesinde her kampanyanın
altında önizlemeyle görünsün, onay özeti metni de kapsasın (tıklama sayısı değişmez). Alternatif:
onaydan sonra yazılsın, yayından önce ajansa "metinleri onayla" adımı (+1 tıklama).

## Sıradaki iş (sırayla)

1. Kullanıcıya reklam metni kararını sor.
2. Düzeltmeler: Ajan 1 → B-3 + `kuruluyor` çıkışı + (karar a ise) onay özetine metin; Ajan 2 → B-4,
   B-1, B-2, B-5, override/`strategy.publish`, ajans onayı denetim kaydı, C-16 onayda kontrol;
   Ajan 3 → metin önizlemesi (karar a ise).
3. Ajan 4 yeniden: `it.fails` → `it`, tam API paketi TEK BAŞINA sonuna kadar, kapı.
4. Ajan 5: deploy öncesi salt okunur SQL'ler (Ajan 4 raporu, aşağıda), migration sırası,
   `DEVAM.md`, deploy komutu (elle, `advetics`). Ardından Profaj'ın kendi hesabında test kipi turu.
5. Tur 2: Pilot taraması + dört öneri türü + uygula/geri al uçları (panelde `ONERI_UYGULAMA_ACIK`).
   Tur 3: Google satırları (K-02), Veri adımı.

## Ajan 5 için salt okunur SQL (Ajan 4'ten)

```sql
SELECT id, user_id, client_id, role, permissions FROM memberships
 WHERE permissions ?| array['strategy.approve','strategy.publish'];
SELECT o.id, o.name, o.manager_account_id, ma.ajans_org_id FROM organizations o
  LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
 WHERE o.manager_account_id IS NULL OR ma.ajans_org_id IS NULL;
SELECT org_id, atif_standardi FROM ajans_ayari WHERE atif_standardi IS NULL;
SELECT id, name, special_ad_categories FROM clients
 WHERE NOT (special_ad_categories <@ ARRAY['HOUSING','EMPLOYMENT','CREDIT','ISSUES_ELECTIONS_POLITICS']::text[]);
SELECT client_id, array_agg(DISTINCT currency) FROM ad_accounts
 WHERE client_id IS NOT NULL AND sync_enabled GROUP BY 1 HAVING count(DISTINCT currency) > 1;
SELECT client_id, month, amount_micros, currency FROM monthly_budgets
 WHERE ad_account_id IS NULL AND month >= date_trunc('month', now());
SELECT to_regclass('public.pilot_planlari');
SELECT conname FROM pg_constraint WHERE conname = 'clients_special_categories_chk';
SELECT count(*) FILTER (WHERE ozel_kategori_beyan_zamani IS NULL), count(*) FROM clients;
```

## Bilinen tuzaklar (bu oturumda yaşandı)

- Arka plan ajanları iki kez "600 sn ilerlemesiz" ile durdu (uzun test koşusunu arka plana atıp
  beklerken). Uzun koşular ön planda, yüksek timeout'la; tam API paketi tek başına.
- `pnpm` PATH'te yok: `npx -y pnpm@9 ...`.
- Ajanlar aynı worktree'de: yalnız kendi dosyalarını `git add <yol>` ile; scratchpad'de her ajan
  kendi klasörü (Ajan 2 bir kez Ajan 3'ün mutasyon betiğini çalıştırdı).
- Worktree'de `.env` yok: yeni ekranlar gerçek uçlarla hiç açılmadı.
- `clients_special_categories_chk` eski adları tutuyor (`CREDIT`); `ONLINE_GAMBLING_AND_GAMING`
  tanınmayan kategori sayılıyor.
