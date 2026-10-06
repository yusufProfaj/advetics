# Derin araştırma — ortak talimat

Kök: `docs/meta-reklam-brief/` (depo kökü: `/Users/yusufalgan/Desktop/Advetics-Proje/.claude/worktrees/terminal-kur-2ecf33`).
Bu dosya araştırma hatlarını yürüten ajanlara verilen ortak talimat.

## Bağlam

Advetics, Profaj ajansı için yazılan beyaz etiketli bir reklam yönetim SaaS'ı (Meta, Google, LinkedIn).
Reklam izliyor ve raporluyor; ama **bugüne kadar tek bir reklam kampanyası kurup yayınlayamadı.**
Kullanıcı, Akıllı Boost DIŞINDAKİ "Reklam Oluştur" modülünü **mevcut yapıya hiç bağlı kalmadan,
baştan** ve "en iyi kullanım senaryosuna sahip uygulama" olarak yeniden tasarlamak istiyor.
Kullanıcının cümlesi: *"derin araştırma yapıp en iyi kullanım senaryosuna sahip uygulamaya
çevireceğiz ... şu an adveticste var olan yapıyı düşünme"*.

**Hedef kullanıcı reklamcılık BİLMİYOR:** *"reklam ile ilgili bilgisi olmayan birisinin bile platformu
kullanabilmesi"*. Kullanıcılar: ajans ekibi (Profaj) ve ajansın müşterileri (şirketler). Arayüz Türkçe,
pazar Türkiye. Uzman için ayrı bir "Gelişmiş" mod da olacak.

Önce şunları oku (girdi):
- `README.md` — Meta dokümantasyonunun tamamından (1.013 sayfa) çıkan brief. Özellikle §1 (model), §2
  (sessiz hata manifestosu), §3 (canlı kurallarla çelişkiler), §5.3 (niyet sözlüğü), §6 (AI katmanları),
  §8 (kararlar). Başındaki **"Kullanıcı kararları (2026-10-06)"** kutusu BAĞLAYICI.
- `bolumler/` — konu bölümleri (ihtiyaç duydukça). Ham Meta sayfaları `kaynak/` altında (markdown).

**Bağlayıcı kararlar:** (1) yayın onayı tek adım; (2) **Advantage+ kitle ve Advantage+ (otomatik) yerleşim
AÇIK**; (3) AI asistanı onay kartıyla sohbetten yayınlayabilir; (4) konut reklamı kısıtları (HOUSING)
Türkiye'de de uygulanır; (5) modül sıfırdan tasarlanır.

**Projenin ilkeleri (araştırmayı bu gözle yap):** sessiz hata baş belası (platformun hata vermeden yanlış
şey yaptığı her durumu işaretle); platformun varsayılanına güvenme; tahmin etmektense kısıtla; doğrulama
giriş anında; "200 döndü" doğrulama değil.

## Kurallar

- **ALT AJAN BAŞLATMA.** Araştırmayı kendin yap (WebSearch / WebFetch; araçlar yüklü değilse ToolSearch
  ile yükle). Depodaki `kaynak/` ve `bolumler/` dosyalarını da kullan, aynı bilgiyi webde yeniden arama.
- **Kaynak disiplini:** her önemli iddianın yanında kaynak (URL, varsa yayın tarihi) ve güvenilirlik
  etiketi: **[Resmî-Meta]**, **[Resmî-diğer]** (Google, TikTok, mevzuat metni vb.), **[Sektör]**
  (tanınmış uzman/ajans yazısı), **[Topluluk]** (forum, kişisel blog). Tarihi 2024'ten eski olan bilgiyi
  "eski olabilir" diye işaretle. Çelişen kaynakları ikisini de yazarak göster; tahminle birleştirme.
- **Metni kopyalama:** kendi cümlelerinle, Türkçe yaz. Doğrudan alıntı gerekiyorsa 15 kelimeyi geçmesin.
- **Müşteri adı YAZMA.** Depo herkese açık; yalnızca sektör kategorisi kullan (ör. "inşaat/konut",
  "özel klinik", "e-ticaret").
- Güncel tarih 2026-10-06. "Bugün geçerli mi" sorusunu her bulguda sor.

## Çıktı biçimi

Dosya: `arastirma/<HAT>.md` (adı sana verildi).

```
# <HAT> — <başlık>

> Yöntem: ne arandı, kaç kaynak okundu, hangi tarihler · Güvenilirlik özeti

## Özet: yeni modül için ne demek (en önemli 8–12 madde)

## Bulgular
(alt başlıklarla; her iddia kaynak + etiketle)

## Advetics için tasarım önerileri
(somut: ekran/akış/kural/varsayılan/araç düzeyinde; bağlayıcı kararlarla uyumlu; her öneri hangi
bulguya dayanıyor)

## Açık sorular ve doğrulanması gerekenler
(canlıda ölçülmeli / kullanıcıya sorulmalı)

## Kaynaklar
| # | Başlık | URL | Tarih | Etiket |
```

Bitince çağırana 150 kelimeyi geçmeyen özet dön: dosya yolu, okunan kaynak sayısı, en kritik 3–5 bulgu.
