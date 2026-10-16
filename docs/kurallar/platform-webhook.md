# Webhook gerçekleri (Meta, Instagram, YouTube)

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

**Webhook'lar** (2026-08 araştırması, iki bağımsız sınayıcıyla)

- **Instagram'da "yeni gönderi" WEBHOOK'U YOK.** Abone olunabilir alanlar
  yorum/bahsetme/mesajlaşma etrafında; medya yayınını bildiren alan yok ve
  changelog o yönde hazırlık göstermiyor. Tespit yalnızca
  `/{ig-user-id}/media` yoklamasıyla. Facebook Sayfa `feed` alanı da
  KULLANILMAZ: crosspost açık müşteride tetiklenir, IG-only paylaşanda hiç —
  aynı kod iki müşteride farklı davranır.
- **Gönderi süpürmesinde `media_product_type = 'AD'` FİLTRELENMELİ.** Yoksa
  sistemin kendi ürettiği reklam kreatifleri "yeni gönderi" sanılır ve geri
  besleme döngüsü oluşur.
- **Medya kimliklerinin zamana göre arttığı GARANTİ DEĞİL** ve `/media` liste
  sırası da garanti edilmiyor (sabitlenmiş gönderi başa geçebiliyor). Tespit
  `timestamp` ile görülen kimlik kümesini BİRLİKTE kullanmalı, sıralama kendi
  tarafımızda yapılmalı.
- **YouTube WebSub SESSİZCE ÖLÜYOR:** kiralama ~10 günde doluyor ve hub haber
  vermiyor; `hub.mode=denied` daha hızlı bir ölüm yolu ve işlenmesi
  spesifikasyonda MUST. Yenileme işinin kendisi de tek noktalı arıza — ölü
  adam düğmesi şart. Hub URL'si sabit yazılmalı: YouTube feed'i `Link:`
  başlığında hub'ı ilan etmiyor.
- **İKİ WEBHOOK İÇİN TEK DOĞRULAMA FONKSİYONU YAZILAMAZ.** Meta
  `X-Hub-Signature-256` (sha256) + JSON; WebSub `X-Hub-Signature` (sha1) +
  Atom XML. Önek parse edilmeli, algoritma sabit varsayılmamalı.
- **NestJS `rawBody` XML ucunda ÇALIŞMIYOR** — kanca yalnızca `json` ve
  `urlencoded` parser'lara takılı. İmza ham gövde istediği için YouTube
  ucunda ham gövde elle toplanmalı.
- **Meta'da tekilleştirme `entry`/`change` seviyesinde**, istek seviyesinde
  değil: tek istekte 1000'e kadar olay gelebiliyor.
