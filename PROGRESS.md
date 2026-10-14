# PROGRESS — döngünün yapılacaklar listesi

Kaynak: 2026-10-14 canlı panel denetimi (1280/1035 px + 375 px) ve
`docs/DEVAM.md` açıkları. Öncelik: kullanıcıya yanlış bilgi veren önce,
sonra düzen, sonra kozmetik. Her madde tek turda biter; bitince `[x]` ve
commit. "(onay bekliyor)" yazan maddeye döngü DOKUNMAZ, kullanıcıya sorar.
Her tur `./scripts/dogrula.sh` yeşil bitmeli; push ve deploy kullanıcıda.

## 1 · Yanlış bilgi (önce)

- [ ] Potansiyel Müşteriler boş listesi gerçek sebebi söylesin: Meta bağlantısında kayıt çekme izni (`leads_retrieval`) yoksa "Form taraması hiç koşmadı" yerine "Meta bağlantısında potansiyel müşteri izni yok, Bağlantılar'dan yeniden bağla" (emptyReason + test).
- [ ] Workspace seçicisinde "şirket geneli" kesilmesin: kip ikinci satırda ayrı rozet olarak görünsün; Marka Merkezi'nin "workspace seçili değil" uyarısıyla çelişki bitsin.
- [ ] AdvStrategy giriş kartı onay bekleyen strateji varken başlığı "Strateji oluştur" demesin: "Onay bekleyen strateji var" + "Raporu aç" (kart yalan vaat etmesin).
- [ ] Akıllı Boost kartındaki "Konum 3684" ham kimliği konum adına çevir (ön ayardaki bölge etiketinden; ad yoksa "1 konum").
- [ ] Akıllı Boost sayfası ilk yüklemede başka bir workspace'in kuyruğunu (`fd82…`) sorguluyor; hangi clientId'nin nereden geldiğini teşhis et ve tek kaynağa bağla.
- [ ] (onay bekliyor) Akıllı Boost'ta 12 Facebook kartı: 2026-09-30 kararına göre yalnız IG + YouTube kart üretmeli. Eski kart mı yeni üretim mi ölç, sonra kullanıcıya sor.
- [ ] (onay bekliyor) Tek workspace'li şirkette workspace kendiliğinden seçilsin mi?

## 2 · Düzen (taşma ve sıkışma)

- [ ] Ayarlar › Bağlantılar: yedi platform sekmesi 1280 px'te sayfayı 214 px yana taşırıyor; sekme satırı sarılsın ya da kendi içinde kaysın.
- [ ] Reklam Yöneticisi telefonda 147 px yana taşıyor; taşan öğeyi bul ve kendi içinde kaydır.
- [ ] Genel Bakış 1035–1280 px: sağ sütun (Bekleyen işler, bütçe, dağılım) `xl` altında ana sütunun altına insin.
- [ ] Genel Bakış Hesaplar ve Kampanyalar tablolarında ad sütununa en az genişlik ver ("E…", "Seasig…" kesilmesin).
- [ ] AdvCampaign taslak tablosu telefonda "Devam et" düğmesini ekran dışına itiyor; satır telefonda kart düzenine geçsin.
- [ ] Raporlar önizlemesi telefonda sağdan kesik ("Adve"); önizleme genişliğe ölçeklensin.
- [ ] Marka Merkezi "bu workspace'e geç" uyarısı telefonda 12 satır; düğme metnin altına insin.
- [ ] Kenar menüsü 800 px yükseklikte Base bölümünü göstermiyor; etkin satır alttaki solmanın altında kalıyor.

## 3 · Kılavuz ve kozmetik

- [ ] `/ayarlar` markasız İngilizce 404 veriyor: `/ayarlar/sirketler`e yönlendir ve Türkçe, markalı `not-found.tsx` ekle.
- [ ] Rapor önizlemesi kılavuz dışı slate renkleri kullanıyor (`#e2e8f0`, `#334155`…) ve ikinci `h1` taşıyor; token'a ve `h2`ye çevir.
- [ ] Varlıklar süzgeç çiplerinde sayı etiketle bitişik ("Tümü21"); boşluk ekle.
- [ ] Hesabım sayfasının üst yolunda sayfa adı eksik.
- [ ] Boş durum kutularında ikon yerine "0" yazıyor; `BosDurum` ikonunu düzelt.

## 4 · Canlı doğrulama (kullanıcı giriş yapınca)

- [ ] (onay bekliyor) `3ec9bd08` (strateji iptal + sil) deploy'u.
- [ ] Ege Birlik Yapı'da onay bekleyen stratejiyi iptal et/sil ve "Strateji oluştur"un açıldığını gör.
- [ ] Boost kartları ve reklam önizlemelerinde görselin geldiğini gör; gelmeyenin sebep cümlesini oku.
- [ ] Kurulum'da Tag Manager / Analytics "Değiştir" ve aramalı listeyi masaüstü + mobilde gör.
