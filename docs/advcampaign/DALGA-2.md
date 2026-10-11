# AdvCampaign Dalga 2: Form, Telefon, WhatsApp

Kullanıcı isteği (2026-10-11): *"kampanya modülünde diğer amaçları da
yazmaya başlayalım sonra konudan sapma"*. Dalga 1 (Siteme gelsinler, Videom
izlensin) `deneme` kipinde canlıda. Bu belge Dalga 2'nin kapsamını, depoyla
çelişen yerleri ve ajan bölüşümünü tutuyor. Boşluk analizi 2026-10-11'de
kaynaktan çıkarıldı (dosya:satır referansları ajan devir notlarında).

## Kapsam

| Amaç × platform | Bu dalgada | Gerekçe |
|---|---|---|
| Form · Meta | **yazılıyor** | Derleyici hazır; kimlik `taslakDerle`de `formId: null` diye düşüyor |
| Telefon · Meta | **yazılıyor** | Niyet kataloğunda doğru satır var, derlenmiyor; numara derleyiciye hiç ulaşmıyor |
| WhatsApp · Meta | **yazılıyor** | Aynı: katalog doğru, derleyici CTA'yı web bağlantısı sanıyor |
| Telefon · Google | **yazılıyor** | Arama kampanyası çalışıyor; eksik olan yalnız arama öğesi (CallAsset) |
| Form · Google | **sonraya** | Google form öğesi (LeadFormAsset) kendi içeriğini ister (başlık, alanlar, gizlilik adresi); kaynağı yok. Ayrı karar |
| WhatsApp · Google | yok | Google'da WhatsApp reklamı yok (`amaclar.ts`) |

Bitince açılış `REHBER_ACILIS`te `kapali` → `deneme` (yalnız ajans yöneticisi
görür, kurulum DURAKLATILMIŞ). Her satır KENDİ commit'inde ve canlı turun
kanıtıyla açılır; bu dalganın kod commit'leri tabloyu değiştirmez.

## Çelişki tablosu (kararlar)

Arayüz ve kapsam kararları "kullanım kolaylığı + reklam verimliliği"
ölçütüyle verildi (CLAUDE.md §5). Para harcayan bir şey yok: `deneme`
kurulumu açmıyor.

| # | Brief / plan diyor | Depo gerçeği | Karar |
|---|---|---|---|
| Ç-1 | REHBER-PLANI §3: Form Dalga 1 | `formId: null` + gizlilik alanı yok; Dalga 2'ye kaydı | Dalga 2'de yazılıyor |
| Ç-2 | Form listesi "Meta'da oluştur, burada seç" diyor (panel metni) | Liste Advetics'in `lead_forms` tablosunu, İLK sayfayı ve taslak formları da okuyor; Meta'da oluşturulan form listeye hiç düşmüyor | Liste SEÇİLİ sayfanın Meta'daki yayında formlarından (`listPageLeadForms`); Advetics'te yayınlanmış formlar da kimliğiyle birleşir |
| Ç-3 | `FORM-GIZLILIK`: Marka Merkezi'nde gizlilik adresi şart | Değer iki yerde sabit `false`: Form amacı her zaman engelde | Var olan bir Meta formu gizlilik adresini KENDİ taşıyor (Meta zorunlu tutuyor). Kontrol formun kendi adresine bakar; Marka Merkezi alanı gerekmez |
| Ç-4 | Banner seti her amaçta | Derleyici seti yalnız SITE'de kabul ediyor (`KRT-SET`) ve eksik listesi bunu söylemiyor: ret ancak provada | Diğer amaçlarda set desteği ÖLÇÜLMEDEN açılmaz; eksik listesi aynı kuralı engel olarak, kullanıcının diliyle söyler |
| Ç-5 | WhatsApp ön koşulu ekranda | `metaWhatsapp` sabit `null`: hep "bilinmiyor" uyarısı | Sayfanın WhatsApp hattı var olan okuyucuyla okunur, üç hâlli kalır |
| Ç-6 | Telefon reklamında Meta'nın `link_data.link` alanı | Ölçülmedi | Canlı turda prova ile ölçülür; derleyici bilinen en güvenli biçimi yazar ve neyin ölçülmediğini koda not düşer |

## Ajan bölüşümü

1. **Meta derleyici** (`derle.ts`, `taslak-alanlari.ts`, `turet.ts`):
   TELEFON ve WHATSAPP derleniyor, telefon numarası taslağa taşınıyor,
   Ç-4 eksik listesine.
2. **Meta form ve ön koşullar** (`yayin-baslat.ts`, `hazirlik.service.ts`,
   `rehber.service.ts`, form seçici): Ç-2, Ç-3, Ç-5.
3. **Google arama öğesi** (`google-write.ts`, `derle-google.ts`): Telefon ·
   Google; Form · Google `G-KURGU-KAPALI`da kalır.
4. **Test ve güvenlik:** üçünün ardından; kapıyı bu açar.
5. **Canlıya alma + canlı tur:** Profaj hesabında prova, duraklatılmış
   kurulum, gözle doğrulama; sonra `REHBER_ACILIS`.
6. **Tasarım denetimi.**
