# Advetics logosu — depoda, indirilmiyor

Rapor kapağında **her zaman** bu logo basılıyor; ajansın kendi
`branding.logoUrl` değeri rapor kapağında KULLANILMIYOR (panel arayüzünde
kullanılmaya devam ediyor). Karar bilinçli ve beyaz etiket vaadinden bir
sapma: müşteriye giden belgede ajansın değil Advetics'in logosu görünüyor.

## Neden dosya depoda, uzaktan indirilmiyor

Uzaktan indirmek, müşteriye giden bir belgenin üretimini ağa bağımlı yapardı:
adres bir gün cevap vermediğinde rapor logosuz çıkar ve bunu ilk gören
müşteri olur. Dosya 35 KB, `git pull` ile geliyor, kurulum maliyeti sıfır.

Aynı dosyanın ikinci kopyası `apps/web/public/advetics-logo.png` altında —
panel raporu tarayıcıda render ediliyor ve statik dosyayı oradan sunuyor.
İkisi AYNI dosya olmalı; biri güncellenip diğeri unutulursa PDF ile ekran
farklı logo gösterir ve `marka-logosu.spec.ts` bunu yakalar.

## Biçim

670×139, 8-bit RGBA PNG. `pdf-lib` yalnızca JPEG ve PNG gömüyor; alfa kanalı
SMask olarak taşınıyor, yani şeffaf zemin PDF'te de şeffaf kalıyor.
