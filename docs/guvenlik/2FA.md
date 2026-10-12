# İki adımlı doğrulama (2FA)

Kaynak: `docs/rakip-analizi/ORPHEX-BOSLUK.md` B-15, kullanıcı kararı Ç-O6
(2026-10-12, "listeye eklendi"). Karar yetkisi oturum yöneticisine devredildi;
aşağıdaki açık kararlar öneriyle kapatıldı ve uygulandı. Ölçüt: güvenlik +
kullanım kolaylığı (kullanıcı teknik değil).

Ajan 1-2-3 tek seferde yürütüldü (küçük güvenlik işi). **Kapıyı Ajan 4 açar.**

## Çelişki ve karar tablosu

| # | Konu | Brief / rakip | Depo gerçeği | Karar ve gerekçe |
|---|---|---|---|---|
| K-1 | Yöntem | Orphex: "zorunlu, 6 hane, 10 dk" (e-posta kodu) | SMTP her kurulumda yok (şifre sıfırlamanın ayrı hata dalı var) | **Doğrulayıcı uygulama (TOTP, RFC 6238)**: 30 sn, 6 hane, HMAC-SHA1. E-posta kodu yok: SMTP'ye bağımlı olurdu ve kodu parolayla aynı kanala (posta kutusu) gönderirdi. |
| K-2 | Algoritma | — | — | **SHA1.** Google/Microsoft Authenticator `algorithm=SHA256`yı yok sayıyor; SHA256 seçmek telefonda tutmayan kodlar demek. HMAC içinde SHA1 zayıflığı anlamsız. |
| K-3 | Zorunluluk | Orphex zorunlu | Canlıda çok sayıda kullanıcı, kimse kurmadı | **Kişi başına isteğe bağlı + şirket yöneticisi "zorunlu yap" seçebilir, varsayılan KAPALI.** Deploy anında herkesi telefona zorlamak kilitlenme ve destek yükü üretirdi. Zorunluluk girişte (kurulum adımı) ve oturum yenilemede (`rotate` reddi, ≤15 dk) uygulanıyor. Yönetici açmadan önce kendi 2FA'sını açmak zorunda. |
| K-4 | Zorunluluğa bakılan şirket | — | Ajans yöneticisi kardeş şirketlere geçiyor (`ctx.orgId` seçili, `users.org_id` ev) | Kullanıcının **ev şirketi**: giriş ve rotasyonda seçili şirket yok. Ekip ekranındaki ayar **seçili** şirketi değiştiriyor; "tüm şirketler" modunda ayar yok. |
| K-5 | Veri modeli | "yeni kolonlar/tablo" | `users.mfa_secret_enc`, `mfa_enabled` ilk migration'dan beri var, okunmuyordu | **Yeni tablo yok**; `users` (+5 kolon), `organizations` (+1). Kullanıcı başına tek satırlık durum; ayrı tablo RLS + TRUNCATE + tutarlılık borcu getirirdi. Enum yok → tek migration. RLS: satır politikaları devralıyor; TRUNCATE: tablolar listede; `WORKSPACE_TABLOLARI`: `client_id` yok, karar gerekmiyor. |
| K-6 | Anahtar saklama | "şifreli, mevcut yardımcı" | `CryptoService` (AES-256-GCM, sürümlü) | Uygulandı; anahtar base64 metin olarak şifreleniyor. |
| K-7 | Kurtarma kodu | 10 kod, hash'li, bir kez | — | 10 kod, 12 karakter Crockford base32 (60 bit, `xxxx-xxxx-xxxx`), **SHA-256** özet. Argon2 değil: her denemede 10 doğrulama = kimliksiz uçta işlemci yükü saldırısı; kod rastgele ve parola da gerekiyor. Kalan risk: veritabanı sızarsa çevrimdışı kırma ~aylar/kod (parolasız işe yaramaz). |
| K-8 | Kaba kuvvet | sayaç + bekleme | Girişte genel hız sınırı YOK (bu işin kapsamı dışı) | Kullanıcı başına sayaç; her 5 hatada kilit, süre **katlanıyor** (15 dk → 30 → 60 … ≤24 sa). Sabit 15 dk yılda ~%40 tahmin şansı veriyordu. Kilitliyken doğru kod da reddediliyor. Biçimi bozuk girdi sayılmıyor. Kurulum onayındaki hatalar sayılmıyor (korunan bir şey yok). |
| K-9 | Ara oturum | "kısa ömürlü ara token" | Bekçi yalnız `typ: 'access'` kabul ediyor | JWT `typ: 'mfa'`, `amac: dogrula|kurulum`, 5 dk, httpOnly çerez `adv_mfa` (`/api/auth` yolu). Bekçi çerezi hiç okumuyor; token Bearer/erişim çerezi olarak sunulsa da reddediliyor (gerçek bekçiyle test). |
| K-10 | QR | "bağımlılık eğilimi düşük" | Panelde ve API'de QR kütüphanesi yok | **`qrcode-generator@1.4.4`** (sıfır bağımlılık, MIT, tam sürüm sabit, API'de). TOTP ise bağımlılıksız (`node:crypto`). QR kodlayıcıyı elle yazmak bir QR çözücüyle sınanmayı gerektirirdi. SVG `data:` adresi, panelde `<img>` ile (betik çalışamaz). |
| K-11 | Ekran yeri | "Ayarlar › Güvenlik ya da Hesabım" | Ayarlar yönetim yetkisine bağlı; workspace kullanıcısı görmüyor; müşteri menüsü 4 ekran (kullanıcı kararı) | **Yeni `/hesabim` sayfası**, kapısı kenar çubuğundaki ad kartı (menü satırı değil). Şirket zorunluluğu ve kişi sıfırlama **Ayarlar › Ekip & Yetkiler**'de (yönetici). |
| K-12 | Yönetici sıfırlaması | denetim kaydıyla | `members` uçları `@RequireOrgAdmin` + `user.write` | Aynı kapılar; RLS'li istemciyle (görünmeyen kullanıcı "bulunamadı"); kendi hesabına kapalı (kendi 2FA'nı kodla kapatırsın). Denetim: `user.iki_adim_sifirlandi`. |
| K-13 | Diğer oturumlar | — | — | 2FA açılınca bu tarayıcı dışındaki oturumlar kapanıyor (parolası sızmış hesapta saldırganın oturumu yaşamasın). |
| K-14 | Okuma API anahtarı (MCP) | — | Bearer `adv_ro_` girişten geçmiyor | 2FA'dan muaf kalıyor: anahtar 2FA'lı bir oturumda üretiliyor, yalnız okuyor ve yalnız platform sahibinde. |

## Uçlar

| Uç | Kimlik | İş |
|---|---|---|
| `POST /auth/login` | — | 2FA gerekiyorsa oturum YOK; `{ ikiAdim }` + `adv_mfa` çerezi |
| `POST /auth/2fa/giris` | ara çerez (`dogrula`) | kod ya da kurtarma kodu → oturum |
| `POST /auth/2fa/giris/kurulum`, `/onay` | ara çerez (`kurulum`) | zorunlu şirkette girişte kurulum → oturum + kodlar |
| `GET /auth/2fa` | oturum | durum (Hesabım, Ekip) |
| `POST /auth/2fa/kurulum`, `/kurulum/onay` | oturum | aç; onayda diğer oturumlar kapanır |
| `POST /auth/2fa/kapat` | oturum + kod | şirket zorunluysa ret |
| `POST /auth/2fa/kurtarma-kodlari` | oturum + uygulama kodu | yeni 10 kod |
| `PATCH /auth/2fa/sirket` | org yöneticisi | seçili şirkette zorunluluk |
| `POST /members/:userId/2fa/sifirla` | org yöneticisi + `user.write` | başkasının 2FA'sını sıfırla |

## Denetim kayıtları

`auth.iki_adim_acildi`, `auth.iki_adim_kapatildi`, `auth.iki_adim_kilitlendi`,
`auth.iki_adim_kurtarma_kodu_kullanildi`, `auth.iki_adim_kurtarma_yenilendi`,
`user.iki_adim_sifirlandi`, `org.iki_adim_zorunlu_acildi/_kapatildi`.

## Ölçülmeyenler (Ajan 4 / 5 / 6)

- **RLS `SET ROLE` testi yok**: yönetici sıfırlaması ve şirket ayarı RLS'li
  istemciyle yazıyor ama testte `withTenant` taklit (RLS kapalı). Başka şirketin
  kullanıcısını sıfırlayamama ve başka şirketin ayarını değiştirememe `SET ROLE`
  + `RETURNING` ile sınanmalı.
- Gerçek telefonla (Google/Microsoft Authenticator) QR okutma ve kod kabulü
  denenmedi; doğruluk RFC vektörleriyle.
- Panel ekranları tarayıcıda açılmadı (yerelde `.env`/API yok); masaüstü + mobil
  tasarım denetimi Ajan 6'da.
- Girişte genel (IP başına) hız sınırı yok; parola tahmini bu işin dışında.
- Canlıda `prisma migrate deploy` koşmadı.
