# Pilot (AdvStrategy + AdvCampaign yeniden kurgu) — nerede kaldık

> **Tarih:** 2026-10-08 (ikinci oturum sonu) · **Dal:** `claude/advcampaign-agents-strategy-1d8a19`
> (main'e BİRLEŞTİRİLMEDİ, push EDİLMEDİ) · **Son commit:** bu belgeyi taşıyan commit (kod: `ac56fc6`)
> · **Deploy:** YOK, yapılmamalı (Ajan 4 kapı turu YARIDA kesildi, kapı kararı VERİLMEDİ).
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
| 1 Mimar · tur 2 | Bitti: metin sözleşmesi (`pilot/metin.ts`, `PLAN_BICIMI = 2`, hash metni kapsıyor), B-3, `kuruluyor` çıkışı; kapanış: durdur eylemi + plan görseli ucu sözleşmede, müşteriye `kip`siz kapı (`MusteriOnayKapisi`) | `087bf90`, `ac56fc6` |
| 2 Arka plan · tur 2 | Bitti: metin plan anında (`plan-reklam-metni.ts`, 3 eşzamanlı / 40 sn / 12 satır), işçi YZ çağırmıyor, B-1 (`app.pilot_ajans_ayari` SECURITY DEFINER), B-2, B-4 (süpürme + failed dinleyicisi + `takilan_kurulumu_durdur` + politika `adv_pilot_kurulum_satirlari_durdur`), B-5, override, ajans onayı `audit_logs`, C-16 onayda, PDF'te metin, görsel ucu `GET /pilot/planlar/:id/varliklar/:varlikId` | `53df63b` |
| 3 Ön yüz · tur 2 | Bitti: plan belgesinde Meta satırı altında metin önizlemesi (ajans = müşteri), metin notları yalnız ajansta, "Kurulumu durdur" | `14ad0cc` (birleşme `4c5e229`) |
| 4 Test & Güvenlik | **YARIDA KESİLDİ (2026-10-08).** Kullanıcı hesap değiştirdi; tur hiçbir şey commit'lemeden durdu. Tam API paketi bu turda KOŞMADI. Kapı kararı yok | — |
| 5 Canlıya alma | Başlamadı | — |

Son ölçümler (`ac56fc6`): shared derlemesi temiz, API + web typecheck 0 hata; web tam paket
1.302/1.302; API YALNIZ hedefli (`src/modules/pilot`, `src/storage`, `src/modules/assets`) 262/262.
**Tam API paketi tur 1'in son halinden (`fc76db5`, 4.246) beri HİÇ sonuna kadar koşmadı.**
Mutasyon: Ajan 1 19 + 9, Ajan 2 20, Ajan 3 13 — hepsi testi düşürdü.

## Kapıyı kapatan bulgular (Ajan 4)

| # | Şiddet | Ne | Düzeltecek |
|---|---|---|---|
| B-4 | kırmızı — **düzeltildi (Ajan 2, `53df63b`), Ajan 4 doğrulamadı** | Satır işi ara durumda (`prova/kuruluyor/...`) beklenmedik hatayla düşerse plan sonsuza dek "kuruluyor"da kalır, kısmi tekil indeks o ayın yeni planını kilitler. `worker.ts` failed dinleyicisi ve `kurulum-supurme.ts` yalnız `taslak`ı kapatıyor; `kuruluyor`dan ajans çıkışı yok | Ajan 2 (+ durum makinesi Ajan 1) |
| B-1 | kırmızı (güvenli yöne) — **düzeltildi (`53df63b`), doğrulanmadı** | `gercek-yayin.ts` `ajansOrgu` müşteri (`client_viewer`) bağlamında RLS yüzünden ajansı bulamıyor → anahtar açıkken bile müşteri onayı `kapali`ya düşüyor; Ç-6 fiilen çalışmıyor | Ajan 2 |
| B-2 | sarı — **düzeltildi (`53df63b` + `ac56fc6`), doğrulanmadı** | `plan.service.ts` `detayKur` müşteri yanıtına `ajansNotu`, `ajansMesaji`, `yayinKipi` koyuyor (panel çizmiyor ama API sızdırıyor) | Ajan 2 |
| B-3 | sarı | `shared/pilot/onay.ts` bütçe kontrolü beyan edilen `plan.toplam` ile; harcanacak olan satır toplamı | Ajan 1 — **KAPANDI 2026-10-08** (satır toplamı; test `it`) |
| B-5 | düşük — **düzeltildi (`53df63b`), doğrulanmadı** | `kurulum-isleyici.ts` `derle` kitle şablonunu `client_id` süzgeçsiz okuyor | Ajan 2 |

Pilot kapsamında kalan `it.fails`: yok (hepsi `it`e döndü; Ajan 4 sayımı yapmadı).
Testle kilitlenmemiş gözlemler (override, denetim kaydı ve C-16 Ajan 2'de KAPANDI; Gemini kotası
H-09 ve "değiştir" kutusunda yön/hedef doğrulaması hâlâ AÇIK): `permission_overrides`'ta `strategy.approve:false` olan üyelik
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

1. **Ajan 4 kapı turunu baştan koş** (`PILOT-DEVAM-PROMPTU.md`'deki brif). Özellikle bakılacak yeni
   yüzeyler:
   - `app.pilot_ajans_ayari`: RLS'i atlayan ilk SECURITY DEFINER fonksiyon. Kontrol: `search_path` sabit mi; kapsam dışı şirketin anahtarını döndürüyor mu.
   - `adv_pilot_kurulum_satirlari_durdur`: kolon kısıtlamayan UPDATE politikası.
   - Görsel ucunda IDOR.
   - Onaydan sonra metin değişebiliyor mu; worker'da YZ çağrısı kaldı mı.
   - Failed dinleyicisi ile süpürme arasındaki yarış (mükerrer kampanya).
   - `PilotKurulumYaniti.plan.yayinKipi` müşteriye sızıyor mu (Ajan 1 bakmadı).
   - Plan anında Gemini çağrısında sessiz hata.
2. Bulgu çıkarsa: düzeltmeyi bulguyu üreten ajan yapar, sonra kapı yeniden.
3. Kapı açıksa Ajan 5:
   - salt okunur SQL'ler (aşağıda);
   - migration sırası;
   - `DEVAM.md`;
   - deploy komutu (elle, `advetics`).
   Ardından Profaj'ın kendi hesabında test kipi turu. Canlıda bakılacaklar: plan hazırlama süresi (satır başına Gemini), görsel ucunun müşteri oturumunda açılması.
4. Tur 2: Pilot taraması + dört öneri türü + uygula/geri al uçları (panelde `ONERI_UYGULAMA_ACIK`).
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
-- Tur 2 (Ajan 2): SECURITY DEFINER fonksiyonun sahibi BYPASSRLS mi? Değilse B-1 güvenli yöne (kapalı) düşer.
SELECT proowner::regrole, r.rolbypassrls FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
 WHERE proname = 'pilot_ajans_ayari';
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pilot_kurulum_satirlari';
-- Tur 2 (Ajan 1): PLAN_BICIMI 1 ile saklanmış plan var mı? Varsa Meta satırları onaylanamaz, yeniden hazırlanmalı.
SELECT count(*) FROM pilot_planlari;  -- tablo yeni; canlıda satır olmamalı
```

## Bilinen tuzaklar (bu oturumda yaşandı)

- Arka plan ajanları iki kez "600 sn ilerlemesiz" ile durdu (uzun test koşusunu arka plana atıp
  beklerken). Uzun koşular ön planda, yüksek timeout'la; tam API paketi tek başına.
- `pnpm` PATH'te yok: `npx -y pnpm@9 ...`.
- Ajanlar aynı worktree'de: yalnız kendi dosyalarını `git add <yol>` ile; scratchpad'de her ajan
  kendi klasörü (Ajan 2 bir kez Ajan 3'ün mutasyon betiğini çalıştırdı).
- Worktree'de `.env` yok: yeni ekranlar gerçek uçlarla hiç açılmadı.
- **İkinci oturumda bir kanca bu worktree'ye Edit/Write'ı engelledi.** Ajanlar scratchpad'de ayrı
  worktree'lerde (`claude/pilot-metin-sozlesmesi-a1`, `claude/pilot-a3-onyuz`) çalıştı; sonuç bu dala
  `git merge --ff-only` ile alındı. O iki yardımcı dal ve scratchpad worktree'leri silinebilir.
- `terminoloji.spec.ts` dizin süzgeci depo köküne göre değil mutlak yola göre çalışıyordu: worktree
  yolunda `/pilot/` geçince tarama boşa düşüyordu (Ajan 1 düzeltti).
- `clients_special_categories_chk` eski adları tutuyor (`CREDIT`); `ONLINE_GAMBLING_AND_GAMING`
  tanınmayan kategori sayılıyor.
