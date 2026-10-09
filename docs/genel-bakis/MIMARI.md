# Genel Bakış — Aşama 2 mimarisi (Ajan 1 / Mimar)

**Tarih:** 2026-10-09 · **Plan:** [`../URUN-YAPISI-PLANI.md`](../URUN-YAPISI-PLANI.md) Aşama 2
**Sözleşme:** `packages/shared/src/genel-bakis/index.ts` (derlendi, çıktısıyla temiz)

Genel Bakış "bugün ne yapmalıyım" sorusunu cevaplayan ekran olacak. Üç parça:

1. **Bekleyen işler** — yeni uç + panel kutusu.
2. **Ayın temposu** — VAR OLAN pacing verisinin cümleye dökülmesi (yalnız panel).
3. **Hızlı erişim** — modül kısayolları, Akıllı Boost'a tek tık (yalnız panel).

## Çelişki tablosu

| # | Konu | Karar |
|---|---|---|
| Ç-1 | Plan "KPI tempo: CPA/ROAS hedefi" diyor; hiçbir yerde hedef tutulmuyor | **Bu aşamada YOK.** Yeni veri alanı ve onu girecek ekran ister. Tempo yalnız BÜTÇE için (veri hazır: `elapsedRatio`, `paceDelta`, `projectedMicros`, `suggestedDailyMicros`). Hedef temposu ayrı iş. |
| Ç-2 | Bağlantı/ödeme uyarıları "bekleyen iş" mi? | **Hayır.** Genel Bakış'ta zaten `Uyarilar` kutusu var (`/alerts`); iki kutuda aynı satır olmaz. |
| Ç-3 | Zil (`BildirimZili`) de Boost kuyruğunu sayıyor | Bu aşamada zile dokunulmuyor. Zil anlık bildirim, kutu iş listesi. Zilin strateji onaylarını da göstermesi sonraki iş. |
| Ç-4 | Ürün kararları | CLAUDE.md §5: arayüz kararları kullanım kolaylığı + reklam verimliliğiyle verildi, sorulmadı. |

## 1. Bekleyen işler

### Uç (Ajan 2)

`GET /genel-bakis/bekleyenler?clientId=<uuid>` → `BekleyenIslerYaniti`

- **Kapı:** `insights.read` (Genel Bakış'ın kapısı). Tür başına ek yetki
  `BEKLEYEN_IS_YETKISI`; yetkisi olmayan tür SORULMAZ ve `sorulmayan`a yazılır.
- **Kapsam:** `clientId` verilirse o workspace (ctx'in erişebildiği küme
  içinde olmalı, değilse 403); verilmezse `ctx.clientIds`'in TAMAMI.
  Bütün sorgular `withTenant` içinde — RLS son savunma.
- **Kaynaklar** (her biri ayrı try; düşen kaynak `hatalar`a, diğerleri gelir):

| Tür | Kaynak | Koşul | `sayi` | `enEski` |
|---|---|---|---|---|
| `boost_onay` | `auto_boost_queue_items` | `status = 'pending'` | satır sayısı | `min(created_at)` |
| `strateji_onay` | `strateji_planlari` | `durum = 'onayda'` | plan sayısı | onaya gönderilme zamanı (yoksa `updated_at`) |
| `strateji_aktar` | `strateji_planlari` | `durum = 'onaylandi'` | plan sayısı | onay zamanı (yoksa `updated_at`) |
| `butce_yok` | `insights_daily` + `monthly_budgets` | bu ay (workspace saat dilimi değil, panelin ay tanımı — `budgets` servisi neyi kullanıyorsa o) harcama > 0 VE o ay için workspace'in HİÇ bütçe satırı yok | 1 | null |

- `boost_onay`: Facebook sayfası kartları kapalı listede değilse SAYILMAZ —
  ekranın "Onay bekliyor" sayacı neyi sayıyorsa o (`AKILLI_BOOST_META_PROFILLERI`
  kuralı, CLAUDE.md §5). Ekranla aynı sayıyı vermeyen kutu güven kaybettirir.
  **Ölçülecek:** Ege Birlik'te ekran "Onay bekliyor 15" diyor; uç aynı sayıyı
  vermeli.
- `butce_yok`: harcama toplamında **çift sayım yok** — yalnız `> 0`
  sorgulanıyor, tutar gösterilmiyor. Havuz hesapları (`client_id IS NULL`)
  sayılmaz (CLAUDE.md "havuz satırları müşteri-kapsamlı sayıma girmez").
- Sıralama `bekleyenIsSirasi`; kesme `BEKLEYEN_IS_SINIRI`, `toplam` kesilmeden.
- `clientAdi` `clients.name`'den; yalnız ekranda gösterilecek süs, satırı
  süzmemeli (`LEFT JOIN`, CLAUDE.md "RLS'li tabloya INNER JOIN").
- **Performans:** 52 workspace'te tek istek. Sorgular `client_id = ANY($1)`
  dizisiyle (CLAUDE.md: alt sorgu yerine dizi, ölçerek). Hedef < 300 ms.

### Panel (Ajan 3)

Genel Bakış'ta başlığın hemen altında **"Bekleyen işler"** kutusu:

- Satır: `{workspace} · {cümle} · {yaş}` + işin ekranına bağlantı.
  Cümleler: `15 Akıllı Boost kartı onay bekliyor`, `Medya planı onayını
  bekliyor` (onay yetkisi varsa) / `Medya planı müşteri onayında` (yoksa),
  `Onaylanan plan AdvCampaign'e aktarılmadı`, `Bu ay harcama var, bütçe
  tanımlı değil`. Yaş: `23 gündür`.
- Adresler: `boost_onay` → `/auto-boost?musteri=`, `strateji_*` →
  `stratejiAdresi(...)`, `butce_yok` → `butceAdresi(...)`. Adres üreticileri
  var olanlar, elle birleştirilmez (CLAUDE.md "bağlantıyı elle birleştirme").
- **Dört hâl ayrı** (CLAUDE.md `.catch(() => setX([]))` yasağı): yükleniyor,
  hata (sunucunun cümlesi), boş ("Bekleyen iş yok"), dolu. Kısmi hata:
  satırlar + altta "Boost kuyruğu okunamadı: …".
- Sessiz kesme yok: `toplam > isler.length` ise "50 / 73 gösteriliyor".
- Tek workspace seçiliyken `clientId` gönderilir; "Tüm workspace'ler"de
  gönderilmez. Sayfa zaten bir sunucu bileşeni; diğer okumalarla paralel.

## 2. Ayın temposu (yalnız panel)

`ButceKarti` bugün harcama/bütçe ve çubuk gösteriyor. Eklenecek cümleler
(veri `ClientPacing.overall`, yeni alan yok):

- `Ayın %26'sı geçti, bütçenin %31'i harcandı` (`elapsedRatio`, `spentRatio`)
- `Bu hızla ay sonu: 87.400 ₺` (`projectedMicros`) — bütçeyi aşıyorsa uyarı
  tonu ve `bütçeyi %X aşar`
- `Kalan günlerde günde 2.150 ₺ harcanabilir` (`suggestedDailyMicros`)
- Bütçe yoksa bugünkü "Tanımla →" kalıyor.
- Hesap **saf fonksiyonda** ve test edilmiş (CLAUDE.md "effect içindeki karar
  test edilemiyor"): `tempoCumleleri(pacing, birim)`.
- `throughDate` dünü gösteriyor: cümlede "dün itibarıyla" (bugünün verisi
  eksik, CLAUDE.md pacing kuralı).

## 3. Hızlı erişim (yalnız panel)

Başlığın yanında küçük düğmeler: **Akıllı Boost** (bekleyen sayısı rozetiyle,
aynı yanıttan), **Yeni reklam** (`/reklam`), **AdvStrategy**, **Raporlar**.
Yetki: menüyle AYNI süzgeç (`visibleSections`) — menüde görünmeyen kısayol
olmaz. Müşteri hesabında yalnız AdvStrategy ve Raporlar.

## Ajan 4'ün bakacağı yerler

- RLS: uç `withTenant` içinde; başka şirketin workspace'i `clientId` ile
  istenirse 403 ve hiçbir sayı sızmıyor. `SET ROLE` deseniyle sınanmalı.
- Müşteri hesabı (`client_viewer`): yalnız `strateji_onay` (ve onay cümlesi),
  `boost_onay`/`butce_yok`/`strateji_aktar` `sorulmayan`da.
- Sayı eşitliği: `boost_onay` ekrandaki "Onay bekliyor" sayacıyla aynı süzgeç.
- Sessiz hata: bir kaynak düşünce diğerleri geliyor ve hata yazılıyor.
- Kesme: 51. satır `toplam`da sayılıyor.

## Ölçüm listesi (Ajan 5, canlıda)

1. Ege Birlik: `boost_onay` sayısı = ekrandaki "Onay bekliyor" (bugün 14–15).
2. Tüm workspace'ler kipinde yanıt süresi (< 300 ms hedef).
3. Müşteri hesabıyla girildiğinde kutuda yalnız strateji onayı.
