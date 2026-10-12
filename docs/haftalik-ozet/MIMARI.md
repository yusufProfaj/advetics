# Paket B: Haftalık özet maili (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** [`../rakip-analizi/ORPHEX-BOSLUK.md`](../rakip-analizi/ORPHEX-BOSLUK.md)
§1 B-5 ve §2 "Paket B" · **Sözleşme:** `packages/shared/src/haftalik-ozet/`
(derleme çıktısıyla temiz, `apps/api/src/modules/haftalik-ozet/sozlesme.spec.ts`
34 test, 10 kritik kural mutasyonla doğrulandı) · **Taslak:** [`taslak.html`](taslak.html)
· **Okuduğu:** Paket A [`../sinyal/MIMARI.md`](../sinyal/MIMARI.md) (sinyaller,
kanallar), Paket C [`../etki/MIMARI.md`](../etki/MIMARI.md) (değişiklikler,
etkiler) · **Durum:** Ajan 1 bitti; Ajan 2-3 Paket A ve C canlıdayken (Ç-B6).

Her pazartesi 09:00 İstanbul, workspace başına: geçen hafta ile önceki hafta,
en çok değişen 3-5 kalem, bu hafta yaptıklarımız ve ölçülen etkileri, (ajansa)
açık sinyaller ve bekleyen işler, tek cümle öneri ve yapay zekânın yazdığı ama
SAYI YAZAMADIĞI kısa yorum. İkinci bir zamanlayıcı ya da gönderici YOK.

---

## 0. Çelişki tablosu

Kullanıcı karar yetkisini oturum yöneticisine devretti (2026-10-12). Tasarım
"Öneri" sütununu varsayarak tamamlandı. **"Öneri, yönetici onayına"** satırlar
onay bekliyor; ret hâlinde değişecek yer satırda yazılı. "Mimar (§5)" saf
arayüz/teknik karar.

| # | Brief diyor | Depo gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-B1 | Alıcılar rapor alıcıları; içerikte Paket A sinyalleri ve bekleyen Uygula işleri | Rapor alıcıları MÜŞTERİ (`clients.contact_emails`). Sinyal ajansın iç bilgisi: müşteri hesabı `rule.read` taşımıyor ve Paket A Ç-8/Ç-9 bunu kilitliyor. Müşteriye sinyal maili, panelde kapattığımız kapıyı mailden açmak | **İki görünüm, tek içerik.** İçerik BİR KEZ üretilir ve saklanır (`haftalik_ozetler`). **Müşteri görünümü** (rapor alıcıları, `report_schedules`, danışmanın SMTP'si): sonuç, en çok değişenler, bu hafta yaptıklarımız, ölçülen etkiler, yorum. **Ajans görünümü** (Paket A kanalları: e-posta, Slack, Teams kısa sürüm): hepsi + sinyaller + bekleyen işler + öneri. Tek tablo `OZET_BOLUM_KITLESI`, tek süzgeç `ozetKitleyeGore` (testte "müşteriye sinyal gitmez" kilitli) | **Öneri, yönetici onayına.** Ret hâlinde (tek görünüm, müşteriye her şey): `OZET_BOLUM_KITLESI` satırları; Paket A Ç-8 de yeniden açılmalı |
| Ç-B2 | "Her pazartesi, workspace başına" | Müşteri maili danışmanın adresinden MÜŞTERİYE gider; açılmamış bir workspace'e kendiliğinden başlatmak geri alınamaz | **Müşteri özeti varsayılan KAPALI**, workspace başına tek anahtar (Raporlar › Haftalık özet). **Ajans özeti** Paket A kanalının olay listesinde (`haftalik_ozet`); yeni kanalda varsayılan İŞARETLİ | **Öneri, yönetici onayına.** Ret hâlinde (müşteriye varsayılan açık): bir migration ile var olan rapor planı olan workspace'lere `etkin=true` satırı |
| Ç-B3 | "Geçen hafta vs önceki hafta" | Pazartesi sabahı geçen haftanın Cuma-Pazar dönüşümleri henüz oturmadı (atıf; `insights_backfill`). Düz kıyas HER PAZARTESİ "dönüşüm düştü" der | Dönüşüm ve dönüşüm başı maliyetin DEĞİŞİMİ iki haftanın **aynı olgun günleri** üzerinden (Pazartesi üretimde Pzt-Per); hafta toplamı yine gösterilir, "kesinleşmedi" işaretiyle. Gecikme Paket A ile AYNI sabit (`donusumKiyasi`) | **Öneri, yönetici onayına.** Ret hâlinde: gönderim günü Perşembe (o gün bütün hafta olgun) |
| Ç-B4 | "İkinci zamanlayıcı/gönderici yazma" | Zamanlanmış rapor `sweep:report-schedules` (saatlik, İstanbul) + `RaporGonderService`; Paket A `sweep:notifications` (5 dk) + kanal göndericileri | Müşteri: `report_schedules`e `tur` kolonu (`rapor`/`haftalik_ozet`), aynı süpürme, `calistir` döngüsünde dal; gönderim `RaporGonderService`in aynı SMTP yolu, PDF yok. Ajans: Paket A süpürmesi Pazartesi 09:00'da `haftalik:<hafta>` gönderim satırı üretir. İçeriği ikisi de AYNI servisten alır (`OzetService.getir`, yoksa üretir, saklar) | Mimar (§5) |
| Ç-B5 | "Gemini yalnız yorum yazar, sayı uyduramaz" | `yapay-zeka/gemini.ts#metinIste` (`ret/kesildi/bos` ayrı) | Modele SAYI ve AD verilmez: nitel tarif + yer tutucu adları (`yorumGirdisi`). Çıktıda rakam (Unicode dahil), `% ₺ $ €`, sayı sözcüğü (iki, yarı, kat, yüzde...), bilinmeyen yer tutucu, HTML ya da çok paragraf varsa yorum REDDEDİLİR, mail yorumsuz gider, ajans önizlemesi nedeni yazar (`yorumDenetle`). Tek deneme (maliyet). Yorum yalnız İKİ kitleye görünen bölümlerden beslenir | Mimar (brief kararı, uygulaması) |
| Ç-B6 | Sıra (Ç-O2: A → B → C) | B, A'nın sinyal ve kanallarını ve C'nin etkilerini okuyor. Paket A Ajan 2-3 BEKLİYOR (Ç-O7) | **A → C → B.** `BILDIRIM_OLAYLARI`na `haftalik_ozet` eklemek Paket A'nın sözleşmesi; bu iş ona dokunmadı (`OZET_BILDIRIM_OLAYI`), Paket B Ajan 2 kendi commit'inde ekler | **Öneri, yönetici onayına** (Paket C Ç-C13 ile aynı) |
| Ç-B7 | "Kısa öneri" | İyileştir önerisi saklanmıyor, her istekte hesaplanıyor; sinyalin eylemi sözleşmede | Öneri YAPAY ZEKÂDAN DEĞİL, veriden ve sabit öncelikle: (1) uygulanabilir yüksek önemli sinyal, (2) onay bekleyen İyileştir önerisi, (3) bekleyen iş. Tek cümle, YALNIZ ajans görünümü (`kisaOneri`) | Mimar (§5) |
| Ç-B8 | "En çok değişen 3-5 kalem", "düşük hacimde gürültü filtresi" | (yeni) | Kalem = kampanya × (maliyet, dönüşüm, dönüşüm başı maliyet). Üç kapı: haftalık gösterim ≥1.000 iki haftada da; göreli değişim ≥%20; kampanyanın iki haftalık harcama payı ≥%5. Sıra `|değişim| × pay`, kampanya başına tek kalem, en fazla 5. Elenenler nedeniyle sayılır. Workspace iki haftada da <1.000 gösterimse "en çok değişen" ve yorum ÜRETİLMEZ, nedeni yazılır; iki haftada da harcama 0 ise özet GİTMEZ (`ozetHacmi`). Hepsi `OZET` sabitinde "ÖLÇÜLECEK" | Mimar (§5) |
| Ç-B9 | Para | Workspace'te TRY Meta + USD Google olabilir | Workspace toplamları raporlama para biriminde (`spend_micros_reporting`); kur yoksa o hesap toplama girmez ve `hatalar`a yazılır (sessiz düşüş yok). Kalem payı da raporlama biriminde | Mimar (§5) |
| Ç-B10 | "Panelde bu haftanın özetini gör" | Raporlar sayfası müşteri hesabına da açık (`report.read`) | **Raporlar › Haftalık özet** sekmesi: önizleme (müşteri ve ajans görünümü sekmesi; ajans yalnız `rule.read` ile), mail kendisi (API'nin ürettiği HTML, yalıtılmış çerçevede), Slack metni, müşteri planı anahtarı, "Kendime gönder". Genel Bakış'tan bağlantı. "Bu hafta" = son TAMAMLANMIŞ hafta (yarım haftayı tam haftayla kıyaslamak yanıltır); geçmiş haftalar seçilebilir | Mimar (§5) |
| Ç-B11 | (yeni) Önizleme ile gönderilen ayrışmasın | Önizleme sonradan açılırsa gece düzeltilen dönüşümlerle farklı sayı gösterir | İlk üretim SAKLANIR ve hem gönderim hem önizleme onu okur ("Pazartesi 09:00'da üretildi"). Yeniden üretme v1'de YOK: müşteriye giden ile ekrandaki aynı kalmalı | Mimar (§5) |
| Ç-B12 | (yeni) Ajans özeti hangi workspace'lere | Kanallar workspace başına | Kanalı olan ve olayı `haftalik_ozet` seçili workspace'lere. Kanalı olmayana gitmez; panel önizlemesi yine çalışır | Mimar (§5) |

---

## 1. Neyin nerede olduğu

| Konu | Yer | Rolü |
|---|---|---|
| Zamanlayıcı (müşteri) | `report_schedules` + `rapor-plani.service.ts#calistir` (koşullu claim, önce ileri at sonra gönder, tekrar deneme yok) + `sweep:report-schedules` | Özet planı aynı tabloda, `tur` dalı |
| Gönderici (müşteri) | `rapor-gonder.service.ts` (`gonderen`, `musteriEpostalari`, `nihaiAlicilar`, `mailGonder {kabul, ret}`) | Aynı yol, PDF'siz gövde |
| Rapor alıcıları | `clients.contact_emails` (Marka Merkezi) | Müşteri görünümü alıcıları |
| Kanallar (ajans) | Paket A `bildirim_kanallari`, `bildirim_gonderimleri`, `notifications_send` | Ajans görünümü |
| Sinyaller | Paket A `SinyalListesi` | Ajans bölümü |
| Değişiklik/etki | Paket C `degisiklik_etkileri` | Ortak bölümler |
| Bekleyen işler | `genel-bakis` `BekleyenIs`, İyileştir açık öneri sayısı | Ajans bölümü |
| Yapay zekâ | `yapay-zeka/gemini.ts#metinIste` | Yorum |
| Hafta | `iyilestir/oneri-hesap.ts#isoHafta` (API'de) | `isoHaftaKodu` shared'a; eşdeğerlik testte 3 yıl boyunca her gün |

## 2. Veri modeli (Ajan 2)

### `haftalik_ozetler` (yeni)

| Kolon | Tip | Not |
|---|---|---|
| id, org_id, client_id | uuid | org_id hedef müşteriden; kompozit FK |
| hafta | varchar(8) | `YYYY-Www`; **UNIQUE (client_id, hafta)** |
| veri | jsonb | `HaftalikOzet` AJANS hâli (yorum dahil) |
| yorum_durumu | varchar(12) | CHECK `YORUM_DURUMLARI` |
| model | varchar(80) NULL | yorumu yazan model (`model-gecmisi` deseni) |
| uretildi | timestamptz | |

Satır DEĞİŞMEZ (UPDATE yok, Ç-B11). Eşzamanlı iki üretici (önizleme +
süpürme): `INSERT ... ON CONFLICT DO NOTHING` + yeniden oku; en kötü ihtimalle
bir yapay zekâ çağrısı boşa gider, iki farklı özet doğmaz.

**`veri` ajans bilgisini taşır** ve RLS satırı workspace'e açar. Müşteri
yolu hiçbir yanıtta ham `veri` döndürmez, `ozetKitleyeGore`dan geçer
(Ajan 4 yanıt + kaynak taraması).

### `report_schedules` değişikliği

- `tur varchar(20) NOT NULL DEFAULT 'rapor'` + CHECK `RAPOR_PLANI_TURLERI`.
- Kısmi tekil indeks `(client_id) WHERE tur = 'haftalik_ozet'` (workspace başına tek özet planı).
- Özet satırı: `frequency='weekly'`, `day_of_week=1`, `range_key=OZET_PENCERE_ANAHTARI`,
  `attach_pdf=false`, `template_id=NULL`. `raporPenceresi` bu anahtarı TANIMAZ
  (testte kilitli): rapor dalına yanlışlıkla düşen özet planı `skipped` yazar,
  yanlış dönemli rapor göndermez.
- `RaporPlaniOzeti`ne `tur` alanı Ajan 2'nin commit'inde (şimdi eklemek API derlemesini kırar); mevcut plan listesi özet planını GÖSTERMEZ (`tur='rapor'` süzgeci), özetin kendi kartı var.

### Üç durak

| Tablo | TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` | Hesap taşıma |
|---|---|---|---|---|
| `haftalik_ozetler` | ekle | SELECT + INSERT workspace kapsamı; UPDATE/DELETE yok | TAŞINIR | hesaba bağlı değil, dokunulmaz (geçmiş kayıt) |
| `report_schedules` (kolon) | var | var | var | değişmez |

Enum değeri YOK (tür varchar + CHECK). Migration'dan hemen önce `git pull`.

## 3. Uçlar ve izinler

Tek kaynak `OZET_UCLARI`.

- `GET /haftalik-ozet/onizleme?clientId&kitle&hafta` (`report.read`; `kitle=ajans`
  ise servis AYRICA `OZET_AJANS_IZNI` = `rule.read` ister, yoksa 403):
  `HaftalikOzetOnizleme` = süzülmüş özet + **API'nin ürettiği mail HTML'i ve
  konusu** (önizleme ikinci bir şablon yazmaz) + kısa metin (ajans) + bu
  haftanın gönderim durumu (müşteri planı son sonucu, kanal gönderimleri).
  Hafta boşsa son tamamlanmış hafta; şimdiki/gelecek hafta 400.
- `GET/PUT /haftalik-ozet/plan` (`report.share`, rapor planlarıyla aynı izin):
  aç/kapat, saat, alıcılar. Açarken `RaporPlaniService#onKosullar` aynısı
  (kullanıcının doğrulanmış SMTP kimliği yoksa 400, giriş anında doğrulama).
- `POST /haftalik-ozet/deneme` (`report.share`): özeti YALNIZ isteyen
  kullanıcının kendi adresine gönderir ("200 döndü" doğrulama değil; kullanıcı
  gelen kutusunda görür).

Yapay zekâ çağrısı transaction DIŞINDA (CLAUDE.md, 5 sn sınırı).

## 4. Durum

Özetin kendi durum makinesi YOK: satır bir kez yazılır. Teslim durumları
var olan iki makinede: müşteri `report_schedules.last_status`
(`sent/failed/skipped`), ajans Paket A `TESLIM_DURUMLARI`. Yorumun hâli
`YORUM_DURUMLARI` (beşi de ekranda ayrı cümle).

## 5. Zamanlama (ikinci zamanlayıcı yok)

| Saat (İstanbul) | İş | Ne |
|---|---|---|
| 07:20 | Paket C `sweep:impact` | etkiler güncel |
| 07:40 | Paket A `sweep:signals` | sinyaller güncel |
| 09:00+ | Paket A `sweep:notifications` | Pazartesi, `haftalik_ozet` olaylı her kanala `haftalik:<hafta>` satırı; içerik `OzetService.getir` |
| 09:19 (planın saati + :19) | `sweep:report-schedules` | `tur='haftalik_ozet'` dalı: `ozetHaftasi(next_run_at)` (worker geç kalsa da aynı hafta), `hacim='bos'` → `skipped` + neden, yoksa müşteri maili |

`OzetService.getir(clientId, hafta)`: kayıt varsa onu döndür; yoksa
sorgular (raporlama para birimi, olgun dönüşüm günleri, Paket A ve C okumaları,
her kaynak AYRI try: biri düşerse `hatalar`a, diğerleri gelir), `kalemleriSec`,
`kisaOneri`, `yorumGirdisi` → `metinIste` → `yorumDenetle` → `yerTutucuDoldur`,
INSERT. Rapor gönderiminin "otomatik tekrar deneme yok" kuralı korunur.

## 6. Mail içeriği

- Konu `ozetKonusu`: `Haftalık özet · Acme · 5-11 Ekim`.
- Gövde (iki görünüm aynı oluşturucu, bölümler `bolumGorunurMu` ile): üst
  bant (Advetics logosu, beyaz etiket kuralı rapor kapağıyla aynı), sonuç
  tablosu (4 metrik, önceki hafta, değişim; harcama rengi nötr; dönüşümde
  "kesinleşmedi" dipnotu ve olgun günler), yorum (varsa), en çok değişenler
  (en fazla 5; boşsa NEDEN), bu hafta yaptıklarımız (en fazla 8 + "ve N daha"),
  ölçülen etkiler (`etkiCumlesi`), [ajans] açık sinyaller, bekleyen işler,
  öneri, panel bağlantısı.
- Slack/Teams: `kisaOzet` (en fazla 6 satır + panel bağlantısı, kesilen satır
  sayısı yazılır). Gövde biçimi Paket A göndericisinde (Slack blocks, Teams iki aile).
- Biçim: tablolar satır içi CSS (mail istemcileri `<style>`u siliyor), renkler
  yalnız kılavuz dördü, yeşil yalnız durum noktası.

## 7. Ekran (Ajan 3), taslak `taslak.html`

- **Raporlar › Haftalık özet** sekmesi: hafta seçici (son tamamlanan varsayılan),
  "Müşteriye giden / Ajans görünümü" sekmesi (ikincisi yalnız `rule.read`),
  mail önizlemesi (yalıtılmış çerçeve, API HTML'i), Slack metni (ajans), sağda
  "Müşteri özeti" kartı (anahtar, saat, alıcılar, gönderen, son gönderim,
  "Kendime gönder") ve "Ajans kanalları" kartı (Marka Merkezi › Bildirimler bağlantısı).
- Genel Bakış: "Haftalık özet hazır · 5-11 Ekim" bağlantısı.
- Dört hâl ayrı: yükleniyor, hata (sunucu cümlesi), boş hafta (`hacim='bos'`:
  "Bu hafta harcama yok; özet gönderilmeyecek"), dolu. Yorum yoksa nedeni
  (`YORUM_DURUMU_ADI`) yalnız ajans görünümünde.

## 8. Güvenlik

- Yapay zekâ çıktısı düz metin, HTML reddedilir; doldurulan değerler mail
  şablonunda kaçışlanır (kampanya adı `<` taşıyabilir).
- Müşteri görünümü ajans bölümü taşımaz (testte; Ajan 4 yanıtta da).
- Mail gönderimi danışmanın kimliğiyle; kimlik bozuksa başka göndericiye
  DÜŞÜLMEZ (`report_schedules` kuralı).

## 9. Ölçüm listesi (Ajan 5)

1. **İlk dört pazartesi, sessiz**: müşteri planları kapalıyken ajans kanalına
   ve önizlemeye bak; workspace başına kaç kalem, hangi kapıdan kaç eleme,
   kaç özet "belirgin değişiklik yok". `OZET` eşikleri ölçümle yazılır.
2. **Yorum reddi oranı**: kaç yorum `reddedildi` (hangi neden). %20'yi
   geçerse talimat düzeltilir, denetim GEVŞETİLMEZ.
3. **Dönüşüm olgunluğu**: Pazartesi ve Perşembe üretilen iki özetin dönüşüm
   farkı; `ANOMALI.donusumGecikmesiGun` ile tutarlı mı.
4. **Mail istemcileri**: Gmail, Outlook, iOS Mail'de gözle (satır içi CSS, 375 px).
5. **Slack/Teams**: gerçek kanala kısa sürüm (Paket A ölçümüyle birlikte).
6. **Süre**: 09:00'da kaç workspace, `getir` başına süre (yapay zekâ dahil).

## 10. Ajan görevleri

**Ajan 2 · Arka Plan** (`apps/api/src/modules/haftalik-ozet/` + migration'lar)
- [ ] Migration: `haftalik_ozetler`; `report_schedules.tur` + CHECK + kısmi tekil indeks.
- [ ] Üç durak (`haftalik_ozetler`).
- [ ] `iyilestir/oneri-hesap.ts#isoHafta` → `isoHaftaKodu` yeniden dışa aktarımı (tek tanım).
- [ ] `OzetService.getir` (§ 5), Gemini çağrısı transaction dışında, `YORUM_SISTEM_TALIMATI`.
- [ ] Mail HTML oluşturucu (`ozet-mail.ts`, tek oluşturucu; önizleme ve gönderim aynı).
- [ ] `RaporPlaniService.calistir`: `tur` dalı; `listele` `tur='rapor'` süzgeci; `RaporPlaniOzeti.tur`.
- [ ] Paket A: `BILDIRIM_OLAYLARI` + `BILDIRIM_OLAYI_ADI` + CHECK'e `haftalik_ozet` (Paket A sözleşme testi güncellenir), Pazartesi satır üretimi.
- [ ] Uçlar `OZET_UCLARI` ile birebir; `kitle=ajans` ek izin kontrolü; modül kaydı + kaynak taramasıyla kilit.

**Ajan 3 · Ön Yüz**: § 7; önizleme `<iframe sandbox srcdoc>`; bağlantılar üreticiden; karar mantığı saf fonksiyonda.

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING` (`haftalik_ozetler`): başka workspace okunamıyor; UPDATE politikası yok.
- [ ] `kitle=musteri` yanıtında sinyal başlığı/kampanyası YOK (fixture'a özgün dize koy, yanıtta ara).
- [ ] `client_viewer` `kitle=ajans` → 403.
- [ ] Yapay zekâ sahte üreticisiyle: rakamlı cevap → mail yorumsuz, `yorum_durumu='reddedildi'`.
- [ ] Mutasyonlar: `ozetKitleyeGore` çağrısını gönderimden sil → müşteri testi düşmeli; `yorumDenetle` çağrısını sil → ret testi düşmeli; `hacim='bos'` dalını sil → boş hafta testi düşmeli; plan claim'ini sil → mükerrer testi düşmeli.
- [ ] `report_schedules` rapor dalı özet satırını göndermiyor (`raporPenceresi` null → `skipped`).

**Ajan 5**: Paket A ve C canlıdayken; § 9; `DEVAM.md`.

**Ajan 6**: mail üç istemcide + panel, masaüstü ve telefon.

## 11. Neyi ÖLÇMEDİM (Ajan 1)

- Eşiklerin hiçbirini canlı veriyle ölçmedim (`OZET`).
- Gemini'nin talimata ne sıklıkla uyduğunu (ret oranı) ölçmedim.
- `spend_micros_reporting`in bütün hesaplarda dolu olduğunu ölçmedim.
- Paket A tabloları henüz yok; kanal entegrasyonu sözleşmeden tasarlandı.
- Mail HTML'inin istemcilerde nasıl göründüğünü (taslak tarayıcıda).
