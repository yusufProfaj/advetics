# Neden bu iki dosya depoda?

PDF raporunda **Türkçe okunabilmesi için gömülü bir yazı tipi ZORUNLU.**

PDF'in standart yazı tipleri (Helvetica vb.) WinAnsi kodlaması kullanıyor ve
o kodlamada `ğ`, `ş`, `ı` **yok**; `₺` (U+20BA) hiç yok. Gömmeden üretilen bir
PDF'te "Gösterim" ve "₺34.026,44" bozuk çıkar — ve bu **sessiz** bir hata:
kütüphane hata vermez, karakteri düşürür ya da kutu basar. Müşteriye giden
belgede.

## Neden npm paketi değil

`dejavu-fonts-ttf` paketi 22 TTF taşıyor (~5,4 MB tarball, açılınca çok daha
fazlası). Bize yalnızca ikisi lazım. Üretim sunucusu **paylaşımlı** ve yanında
11 canlı site var; her deploy'da onlarca megabaytlık bir font paketi indirmek
o kısıtla çelişiyor. İki dosya = ~1,4 MB, `git pull` ile geliyor, kurulum
maliyeti sıfır.

## Neden DejaVu

Türkçe glifleri ve `₺` işaretini taşıdığı **doğrulandı** (varsayılmadı):
cmap tablosu `ğ Ğ ş Ş ı İ ç ö ü ₺ € — †` için gerçek glif kimliği döndürüyor.
`pdf-yazi-tipi.spec.ts` bunu her koşuda yeniden tarıyor.

Lisans: `LICENSE-DejaVu.txt` (Bitstream Vera + public domain değişiklikler) —
gömme ve yeniden dağıtım serbest.
