# Dalga 2 · Ajan 2b — Meta form ve ön koşullar (devir notu)

Dal: `dalga2-meta-form` (taban `caa7ce8`). Kararlar: DALGA-2.md Ç-2, Ç-3, Ç-5.
`REHBER_ACILIS` DEĞİŞMEDİ (Form/WhatsApp Meta hâlâ `kapali`).

## Ne yapıldı

1. **Form kimliği derleyiciye ulaşıyor.** `taslakDerle` artık `formId: null`
   yazmıyor; `formKimligiCoz` (yayin-baslat.ts) değeri Meta form kimliğine
   çeviriyor. Sayısal değer olduğu gibi gidiyor; eski kayıtlardaki UUID
   yalnız SEÇİLİ sayfanın Advetics'te `published` formuysa onun
   `external_form_id`si oluyor, değilse `FORM-KIMLIK` reddi.
   `DerlemeGirdisi`ndeki değişiklik tek satır (`formId: formKimligi`).
2. **Temsil:** `formSablonuId` şeması `formKimligiSchema` = UUID **ya da**
   sayısal Meta kimliği (`taslak-alanlari.ts`, rehber `alanlar.ts` onu
   kullanıyor). Eski kayıtlar okunmaya devam ediyor. Panel artık Meta
   kimliğini yazıyor.
3. **Form listesi (Ç-2):** yeni uç `GET /reklam/rehber/form-sablonlari?clientId=&sayfaId=`
   → `RehberFormListesi` (shared `hazirlik.ts`). Kaynak Meta
   (`/{sayfa}/leadgen_forms?fields=id,name,status,privacy_policy_url`, sayfa
   token'ı, imleçle en çok 5×100), yalnız `ACTIVE`; Advetics'te yayınlanmış
   formun adı Advetics adıyla. Okunamazsa 503 + Meta'nın mesajı; boşsa
   `bosNeden`. `RehberHazirligi.formSablonlari` KALDIRILDI (hazırlık ucuz
   kaldı, `lead_forms` sorgusu gitti). Okuyucu `platform-okuma.ts#metaSayfaFormlariOku`;
   `MetaProvider.listPageLeadForms` bilerek kullanılmadı (lead senkronizasyonunu
   besliyor; ölçülmemiş bir alan oraya eklenip reddedilirse bütün potansiyel
   müşteri taraması düşerdi).
4. **Gizlilik (Ç-3):** `RehberOnKosullari.gizlilikAdresi: boolean` (iki yerde
   sabit `false`) KALDIRILDI, yerine `seciliForm: { ad, sayfadaYayinda,
   gizlilikAdresi } | null`. Eksikler (yalnız Meta, yalnız form seçiliyse):
   `null` → `FORM-BILINMIYOR` uyarı; listede yok → `FORM-SAYFA` engel;
   adres yok → `FORM-GIZLILIK` engel, formun adıyla.
5. **WhatsApp (Ç-5):** `metaWhatsapp` var olan okuyucudan
   (`MetaProvider.fetchPageWhatsapp`, ProviderRegistry üzerinden; yeni Nest
   bağımlılığı yok). Numara okunduysa `true`, aksi hâlde `null`; `false`
   HİÇ üretilmiyor (alan belgelenmemiş, bazı sayfalarda gelmiyor).
6. **Seçili sayfa:** önbellek sayfa başına (`clientId:sayfaId`). Hazırlık ilk
   sayfayı doldurur; form listesi ucu seçili sayfayı; **prova öncesi**
   (`sayfaTazele`) FORM/WHATSAPP amacında seçili sayfanın koşulu, WhatsApp
   hattı ve form listesi TAZE okunur. Platform çağrıları transaction dışında.
7. **Panel:** `FormSecici` seçili sayfa değişince uçtan okuyor; dört hâl
   (sayfa yok / okunuyor / boş + neden / düştü + Meta mesajı), "Listeyi
   yenile", adressiz forma "gizlilik adresi yok" notu, kesilmişse "İlk N form".

## Testler

- API: rehber.service.spec (Dalga 2 bloğu: liste, seçili form hâli,
  eksik listesi FORM açılışı geçici açıkken, eski UUID, WhatsApp seçili
  sayfa + prova tazelemesi), rehber-saf.spec (çözümleyiciler, sayfalama,
  `whatsappHali`, `seciliFormHali`), rehber-sozlesme.spec (FORM-* seviyeleri,
  Meta kapsamı, şema), yayin-baslat.spec (`taslakDerle` form kimliği ve
  FORM-KIMLIK), rehber-modulu.spec (uç kaydı). Hedefli 20 dosya / 366 test yeşil.
- Panel: rehber-mantik.spec (`formListesiHali`). API ve panel typecheck temiz,
  shared derlemesi çıktısıyla temiz.
- Mutasyon: 13 mutasyonun hepsi düştü (formId null, sayfa süzgeci, ACTIVE
  süzgeci, WhatsApp false, prova tazelemesi yok, seciliForm/metaWhatsapp
  sabit, adres biçimi, imleç, FORM-GIZLILIK dalı, bilinmiyor→engel, Meta
  kapsamı, şema yalnız UUID). Shared mutasyonları yeniden derlenerek sınandı.

## ÖLÇÜLMEDİ

- **`privacy_policy_url` alan adı** canlıda okunmadı (Graph belgesindeki
  LeadgenForm alanı). Reddedilirse liste 503 ile düşer (sessiz değil). Canlı
  turda ilk bakılacak şey.
- `status` değerlerinin (`ACTIVE`/`ARCHIVED`/`DRAFT`/`DELETED`) v25'te aynen
  geldiği.
- Başka sayfanın form kimliğiyle Meta provasının ne dediği. Sayısal kimlikte
  sayfa aidiyeti yalnız rehberin taze listesiyle (`FORM-SAYFA`) korunuyor;
  `taslakDerle` platform çağırmadığı için orada doğrulanmıyor.
- `whatsapp_number` boş geldiğinde hattın gerçekten olmadığı (bu yüzden
  `false` üretilmiyor; Meta'nın provası söyler).
- Panel ekranı tarayıcıda açılmadı (tasarım denetimi Ajan 6'nın).

## Açık kalan

- Form listesi okunduktan sonra rehberin eksik listesi bir sonraki
  kayda (PUT) kadar eski kalıyor: form zaten seçiliyse "kontrol edilemedi"
  uyarısı ilk değişikliğe ya da provaya kadar görünür. Panel liste
  geldiğinde rehberi yeniden okuyabilir (küçük iş).
- Önbellek süreç içi (çok süreçte her süreç kendi okur; mevcut desen).
- Google Form (`LeadFormAsset`) bu dalgada yok; `FORM-GIZLILIK` Meta'ya sabit.
- `DEVAM.md` bu dalda güncellenmedi (paralel ajanlar; birleştiren yazmalı).

## Kapsam dışı dokunulan

- `packages/shared/src/reklam/taslak-alanlari.ts`: yalnız `formKimligiSchema`
  eklendi ve `formSablonuId` satırı ona bağlandı (taslak şeması strict;
  sayısal kimlik olmadan çocuk taslağa yazılamazdı). Telefon/CTA satırlarına
  dokunulmadı.
- `derle.ts`, `turet.ts`, google-* dokunulmadı.
