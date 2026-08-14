# Devir belgesi — nerede kaldık

**Son güncelleme:** 2026-08-13 · **Son commit:** `97c1b0e`

Bu belge yeni bir oturumun (ve yeni bir hesabın) kaldığı yerden devam
edebilmesi için. Ayrıntılı durum [`DURUM.md`](DURUM.md) içinde; çalışma
kuralları kök dizindeki [`CLAUDE.md`](../CLAUDE.md) içinde ve her oturumda
otomatik yükleniyor.

---

## 1. Tam olarak nerede durduk

**Meta yayın yolu kodda tamamlandı, platform yapılandırmasında takıldı.**

13 Ağustos'ta arşiv testi sırasında **ilk gerçek Meta yazma çağrısı** yapıldı.
Altı hata çıktı, altısı da düzeltilip teste bağlandı. Yedinci engel kod değil:

```
subcode=1885183 — Reklam kreatif gönderisi, geliştirme modundaki bir uygulama
tarafından oluşturuldu.
```

**Kullanıcının yapması gereken:** Meta uygulamasını developers.facebook.com
üzerinden **Geliştirme → Canlı** moduna almak. Anahtar panelin üstünde, uygulama
adının yanında (ya da sol menüde "Uygulama İncelemesi" sayfasının başında).
Açılmıyorsa Meta şunları istiyor: gizlilik politikası adresi
(`https://advetics.com/gizlilik` — var), uygulama simgesi 1024×1024, kategori,
veri silme geri araması (`POST /connections/meta/data-deletion` — var).

Canlı moda geçince tekrar denenmeli. İki sonuçtan biri gelecek:

- **Reklam oluşur** → kendi ajans hesaplarında canlı mod + standart erişim
  yetiyor demektir.
- **`ads_management` Advanced Access hatası** → App Review gerekiyor; müşteri
  hesaplarına erişim onaya kadar bekler.

> **Uyarı:** Kullanıcı bu ararken uygulama ayarlarındaki *"Native or desktop
> app?"* anahtarını açtı. **Kapalı olmalı** — Advetics sunucuda çalışan bir web
> uygulaması, app secret tarayıcıya gitmiyor. Açık bırakmak OAuth doğrulama
> davranışını değiştirip mevcut bağlantıları bozabilir.

## 2. 13 Ağustos'ta canlıda öğrenilenler

Hiçbiri birim testiyle yakalanamazdı. Hepsi kalıcı teste bağlandı.

| # | Hata | Sessiz miydi |
|---|---|---|
| 1 | 3. adım metinsiz taslak kaydedemiyordu — görsel eklemek taslak gerektiriyor ama metin 4. adımda soruluyor | Hayır |
| 2 | Hata mesajı formun en altında, ekran dışında beliriyordu | **Evet** — "tıkladım, bir şey olmadı" |
| 3 | `act_act_...` çift önek | Hayır ama mesaj *yetki sorunu* gibi okunuyordu |
| 4 | `is_adset_budget_sharing_enabled` eksik (Meta'nın yeni zorunlu alanı) | Hayır |
| 5 | Form kimliği ad set'e konmuş + çok görselli yolda **hiç yok** | **Evet** — buton hiçbir yere gitmeyen reklam |
| 6 | Teklif stratejisi platformun varsayılanına bırakılmış | **Evet** — aynı taslak iki müşteride farklı davranır |

**Ders:** yazma yollarının "test edildi" sayılabilmesi için canlı bir çağrı
şart. Ne kadar birim testi yazılırsa yazılsın bu altısı görünmezdi.

Ayrıca `http.ts` içine **yapılacak iş ipucu** katmanı eklendi: kod
değişikliğiyle çözülemeyen Meta alt kodlarına (şimdilik yalnızca 1885183)
mesajın sonunda ne yapılacağı yazılıyor. Kodla çözülecek hatalara ipucu
eklenmiyor — yanlış yönlendirme olurdu.

## 3. Bekleyen operasyonel işler

Bunlar koda değil, sunucuya/hesaplara ait. Hiçbiri yapılmadı:

- [ ] **`META_WEBHOOK_VERIFY_TOKEN`** sunucuda `apps/api/.env` içine eklenmeli ve
      Meta uygulama panelinde webhook URL'i `https://advetics.com/api/leads/webhook`
      olarak kaydedilmeli. **Bu yapılmadan hiçbir lead bildirimi gelmez.**
- [ ] **Google hesap listesi bayat** — DB'de 29 hesap, keşifte 129 bulunmuştu.
      Platform Bağlantıları → "Hesapları yenile".
- [ ] **`db:seed-portfolio` çalıştırılmadı.** 12 müşteri + 3 kullanıcı seed'i
      hazır; parolalar ortam değişkeninden okunuyor
      (`SEED_ADMIN_PASSWORD`, `SEED_YUSUF_PASSWORD`, `SEED_ECEM_PASSWORD`).
- [ ] **Parola rotasyonu.** Geliştirme sırasında sohbete yapıştırılan sırlar
      var: site kullanıcısı SSH parolası, üç DB parolası, Meta app secret ve
      üç kullanıcı parolası. Hepsi değiştirilmeli.
- [ ] **Meta Business Verification + App Review** (`ads_management`,
      `leads_retrieval`). Yazma yollarının tamamı buna bağlı.

## 4. Sıradaki geliştirme adayları

Kullanıcının onayladığı dört maddelik sıra tamamlandı (formlar → lead CRM →
gelişmiş kampanya oluşturucu → akıllı varlık yönlendirme), ardından varlık
arşivi de yapıldı. Açık kalanlar:

1. **Bilgi bankası ve kitle kütüphanesi** — BASE bölümünün kalan iki parçası,
   hiç başlanmadı.
2. **Bildirim altyapısı** — CENTRAL uyarılarının ve zamanlanmış raporların ön
   koşulu. Şu an hiçbir şey bildirim göndermiyor.
3. **Google yazma yolu** — hiç yazılmadı. Bu bilinçli bir sıra kararıydı:
   okuma tarafı yeni doğrulandı ve Meta'daki deneyim yazma yollarının canlı
   doğrulama olmadan güvenilmez olduğunu gösterdi.
4. **Sunucu tarafı PDF raporu**, sağlık skoru, A/B test motoru — daha sonraya.

Ayrıntılı liste ve gerekçeler: [`DURUM.md`](DURUM.md) § 7.

## 5. Yeni hesabın ihtiyaç duyacağı erişimler

Repo bunları taşıyamaz; `hello@profaj.com` tarafında ayrıca sağlanmalı:

| Ne | Nerede |
|---|---|
| GitHub deposu | `yusufProfaj/advetics` — yeni hesaba erişim verilmeli |
| Sunucu SSH | `advetics` site kullanıcısı, gerekiyorsa root — adres parola yöneticisinde |
| `apps/api/.env` | Sunucuda duruyor, git'te yok. Yerel geliştirme için kopyası gerekir |
| Meta uygulaması | developers.facebook.com — yönetici yetkisi |
| Google Ads | MCC erişimi + developer token |
| Sunucu paneli | CloudPanel — adres parola yöneticisinde |

**Yerel geliştirme için `.env` şart değil:** testler PGlite kullanıyor, gerçek
veritabanı istemiyor. `pnpm install` + `pnpm --filter @advetics/api test`
doğrudan çalışır.

## 6. Günlük akış

```bash
pnpm install
pnpm --filter @advetics/api test          # 705 test
pnpm --filter @advetics/api exec nest build
pnpm --filter @advetics/web exec next build
```

Deploy (sunucuda, **site kullanıcısı olarak**):

```bash
su - advetics
cd ~/htdocs/advetics.com && git pull && ./scripts/deploy.sh
```

`deploy.sh` sırayla: bağımlılıklar → `prisma generate` →
`prisma migrate deploy` → `db:rls` (kısıtlar + RLS) → derleme → pm2 reload →
sağlık kontrolü.
