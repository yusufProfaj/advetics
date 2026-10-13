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

## Montserrat (AdvStrategy strateji PDF'i, 2026-10-13)

Profaj kurumsal kılavuzu ana başlık ve büyük sayılar için Montserrat istiyor
(`docs/advstrategy/YENIDEN-TASARIM.md` § 3, § 9.4). Üç dosya: Bold (başlık),
Medium (sayılar), Regular (gövde). Sürüm 9.000, Google Fonts / upstream ile
aynı; kullanıcının kendi diskindeki kopyadan (`reklam-kampanyası/…/marka/`)
alındı, internetten indirilmedi. `ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü ₺` cmap'te var;
`strateji-pdf.spec.ts` her koşuda tarıyor.

Lisans: SIL Open Font License 1.1 — `LICENSE-Montserrat-OFL.txt` (telif satırı
dosyanın kendi `name` tablosundan). Gömme ve yeniden dağıtım serbest.

**Open Sans YOK.** Kılavuz gövde için Open Sans istiyor; tam TTF depoda ve
makinede yoktu, indirmek kullanıcı izni istiyor. Gövde şimdilik Montserrat
Regular (`strateji-pdf.ts#GOVDE_DOSYASI`). Open Sans eklenecekse:
`OpenSans-Regular.ttf` + lisansı bu klasöre, sabit tek satır değişir; Open
Sans `₺` taşımıyor (ölçüldü, § 9.4) — o dizeler kodda zaten yedek yazı tipine
dize başına düşüyor.
