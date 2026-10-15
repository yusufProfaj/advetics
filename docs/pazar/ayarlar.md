# Ayarlar — pazar araştırması (2026-10-15)

Döngü turu 45 (PROGRESS.md § 12). Bugünkü Ayarlar: dört sekme (Şirketler
ve workspace'ler · Platform bağlantıları · Ekip ve güvenlik · Hesabım);
roller ve izinler `packages/shared` RBAC'ta; iki adımlı doğrulama şirket
başına zorunlu kılınabiliyor (`organizations.iki_adim_zorunlu`); her
kritik işlem `audit_logs`a yazılıyor ama panelde okuyacak ekran yok;
ekip listesinde "Son giriş" var.

## 1 · Platform tarafı

- **Meta Business Manager 2FA:** yönetici "Herkes için zorunlu"
  seçebiliyor; 2FA kişisel Facebook profilinde kuruluyor; yönetici kimin
  açmadığını görebiliyor. Meta'nın 2026'da harcama erişimi olan hesaplarda
  2FA'yı zorunlu kıldığı iddiası tek blog kaynaklı, doğrulanmadı. Ajans
  ortak erişiminde 2026 değişikliği bulunamadı. Kaynak:
  [growwithsakib](https://growwithsakib.com/how-to-set-up-meta-business-manager/),
  [Chakra](https://chakrahq.com/help/learning-centre/meta-business-manager/business-information-security-verification),
  [Omneky](https://www.omneky.com/blog/remove-two-factor-authentication-facebook-ads-manager).
- **Google Merchant Center for Agencies (2026):** yönetim / operasyon /
  uygulama rolleri ayrılıyor, müşteri hesapları etiketle gruplanıp düşük
  yetkili kullanıcıya yalnız bir kısmı veriliyor. Kaynak:
  [ppc.land](https://ppc.land/google-publishes-user-access-guide-for-merchant-center-for-agencies/),
  [TechWyse](https://www.techwyse.com/news/platform-updates/google-merchant-center-agency-roles).

## 2 · Sektör dersleri (ajans erişim yönetimi)

- En az yetki; standart rol matrisi, istisnalar belgeli ("yetki
  sürünmesi"); müşteri ana varlığın SAHİBİ olmalı; **ayrılan kişinin /
  ajansın erişimi kaldırılmalı**: 2026'da eski bir ajans, altı yıl önce
  kaldırılmamış süper yönetici hakkıyla müşterinin Merchant Center
  hesabını sildi. Ortak şifre yok (iz bırakmaz); ajans çalışanı için 2FA
  zorunlu; üç ayda bir erişim gözden geçirmesi. Kaynak:
  [Postly kontrol listesi](https://blog.postly.ai/the-quality-control-checklist-for-agency-account-permissions/),
  [Kinsta](https://kinsta.com/blog/agency-client-access-management/),
  [Geeks for Growth](https://geeksforgrowth.com/blog/white-label-security-playbook/).
- Beyaz etiketli araçlarda denetim kaydı (rol değişikliği, dışa aktarma,
  giriş) karşılaştırma ölçütü. Kaynaklar satıcı yazısı.

## 3 · Bizde

- Rol + izin modeli ve şirket başına 2FA zorunluluğu var (pazarın
  önünde). Eksik: (a) ekip listesinde kişinin 2FA'sı AÇIK MI görünmüyor,
  yani zorunluluk açılmadan önce kimin kilitleneceği bilinmiyor; (b)
  uzun süredir giriş yapmamış kişiler işaretlenmiyor (ayrılan çalışan
  erişimi); (c) `audit_logs` okunabilir değil.

## 4 · Türkiye pazarı

- KVKK kişisel veri erişim kaydı ve erişim yetkisinin asgari tutulması
  beklentisi (hukuki görüş değildir); denetim kaydını görünür kılmak bu
  açıdan da değerli.

## 5 · Öneriler (öncelik sırasıyla)

1. **Ekip listesinde "uzun süredir giriş yok" işareti** (90 gün; hiç
  giriş yapmamış ayrı söylenir): ayrılan çalışanın erişimini kapatmayı
  hatırlatır. `lastLoginAt` zaten var. Onaysız.
2. **Ekip listesinde kişinin iki adımı açık mı.** Şirkette zorunluluk
  açılınca kimin girişte takılacağını önceden gösterir. Veri yeni bir
  okuma ister (kişinin 2FA kaydı); veri modeli değişmez. Onaysız.
3. **(onay bekliyor: yeni ekran bölümü + yetki kararı)** Ekip ve güvenlik
  altında "Son değişiklikler" (audit_logs okuma): kim, ne zaman, neyi.
