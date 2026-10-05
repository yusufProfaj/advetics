# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-10-05 · **Canlı (539f6fb):** Google gün içi saatlik,
Genel Bakış "Reklam Hesapları", Aşama 0 düzeltmeleri (kitle önerisi canlıda
doğrulandı).
**Bekleyen deploy:** konum ülkesi kuralı, LinkedIn para birimi (MIGRATION VAR: boş birimli metrik satırları), rapor süre sınırı + hata kodu + ölçüm aracı.

**Kullanıcı kararı (2026-09-29): reklam oluşturma sistemi DONDU.**
`/reklam-olustur`, uzman mod, taslak ve yayın yoluna yeni kurgu eklenmiyor;
kullanıcı orayı baştan düzenleyecek. Sıradaki işlerde onu atla.

"O günden beri ne geldi" sorusunun başlangıç noktası bu belgeyi DEĞİŞTİREN
SON COMMIT — hash buraya elle yazılmıyor (yazılan hash kendi commit'ini
gösteremez ve kayar):
`git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`.

---

## Son oturumda biten

- **Marka Merkezi Bölüm 1 bitti** (`/marka-merkezi`): hazırlık listesi (6 madde),
  bağlantılar, iki adımlı kaldırma, havuz araması; şirket admini ajansın
  atadığını kaldırabiliyor ama taşıyamıyor, denetim kaydı + ajansa mail,
  "Ajans atadı" rozeti.
- Panel: ortak `components/ui/` bileşenleri; workspace seçilmemişse 13 sayfa
  artık soruyor; Genel Bakış kısaltmalarına Türkçe açıklama.
- Canlı düzeltmeler: "Tüm şirketler" modunda Uyarılar/Senkronizasyon 500'ü;
  Google için yanlış "yetki doluyor" alarmı (`authorization_expires_at`,
  migration); Senkronizasyon sayaçları 1.536 → 457 ms; sayaçlar son 7 gün.
- **LinkedIn'e yapılamayacak işler artık gönderilmiyor** (`queue/platform-isleri.ts`):
  kırılım işi hiç açılmıyor; günlük/gün içi metrik işi LinkedIn'de hesap
  seviyesini atlıyor. İkincisi LinkedIn günlük metriğinin HİÇ gelmemesinin
  sebebiydi. Deploy sonrası bakılacak: son 7 günün düşen iş sayısı inmeli,
  LinkedIn `insights_daily` işleri `succeeded` olmalı.
- **Google kotası ölçüldü: sebep hacim, günlük tavan.** "Günlük" metrik işi
  hesap başına günde ~11 kez koşuyordu; artık dün bir kez çekiliyor.
  Kota dolunca bütün Google işleri Google'ın söylediği süre kadar bekliyor
  (önce yalnızca çarpan hesap 15 dk duruyordu, 1.521 iş düşmüştü).
- **Bölüm 2 bitti:** Marka sekmesi yapılandırılmış alanlarla (sektör,
  kategoriler, sık sayfalar, ana amaç, üslup, vaatler); AI asistan, reklam
  metni ve Hızlı Reklam okuyor (amaç seçili açılıyor, adres listeden).
- **Bölüm 3 bitti:** Görsel Arşivi, Kreatifler, Formlar Marka Merkezi'nde
  "Varlıklar"da (menüden kalktı). Metin şablonları ve zorunlu yasal uyarı:
  uyarı Meta ana metninde yoksa yayın duruyor. Marka renkleri eklenmedi
  (kullanıcı kararı: okuyan özellik yok).
- **Bölüm 4a:** kitle şablonları (yalnızca Meta) Marka Merkezi'nde; Hızlı
  Reklam varsayılanı seçili açıyor. Öncesinde taslak ağacının hedefleme
  üreticisi birleştirildi: şehir seçilince ülke de gidiyordu (= ülke geneli).
- **Bölüm 4c:** ilgi alanları + "Kitleyi tarif et" önerisi (AI yapılandırıyor,
  Meta'da çözülüyor, kullanıcı onaylıyor). Canlıda doğrulanmadı.
- **Bölüm 4b:** Meta özel/benzer kitleler şablonda (dahil/hariç); kitle hesaba
  bağlı, uyuşmazlık yayını durduruyor. Canlıda doğrulanmadı.
- Açık ayrı iş: eski tek reklam yayın yolu özel kategori kısıtını uygulamıyor
  (panel çağırmıyor, uç açık) — işaretlendi.
- Testler: API ve panel yeşil (sayılar son commit mesajında).

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

**Rapor yavaşlığı (öncelikli):** önizleme üretimde 40 sn'ye kadar sürüyor.
Süre sınırı 20 sn'ye çıktı (yama). Deploy sonrası
`pnpm --filter @advetics/api olcum-rapor -- --eposta=hello@profaj.com` →
hangi sorgu yavaş, `loops=` ne diyor; sonra kök düzeltme.

**BASE brief (`Advetics-Marka-Merkezi-BASE-gelistirme-brief.pdf`, 7 aşama):
Aşama 0 sürüyor.** Ajans yöneticisi turu yapıldı, 6 hata düzeltildi
(`DURUM.md` 2026-10-05). Kitle önerisi canlıda çalışıyor (sebep şemaydı). Kalan: (b) reklam
yöneticisi ve müşteri rolleri — kullanıcı giriş yapınca; (c) yazma
kontrolleri (Marka kaydet, siteden doldur, kitle şablonu, varlık yükleme,
hesap ekle/kaldır) — test workspace'i ve onay bekliyor. Aşama 1'in test
şartı (testing-library) depo kararıyla çelişiyor: **kullanıcı kararı bekliyor.**

0. **Genel Bakış "Reklam Hesapları" deploy sonrası gözle:** bir workspace
   aç → Reklam Hesapları (mecra ikonu + workspace adı) → hesap → kampanya →
   set → reklam; ekmek kırıntısıyla geri çık. LinkedIn hesabı satırının
   rakamlı geldiğine, izlenmeyen hesabın "İzlenmiyor" yazdığına bak.
1. **Google kota doğrulaması GEÇTİ** (2026-10-01): günlük iş hesap başına
   1/gün, kota hatası 0. Çağrıların %84'ü gün içi işiydi; kullanıcı kararıyla
   Google'da **saatlik** (deploy bekliyor). Deploy'dan bir gün sonra
   `olcum-google-kota -- --gun=1`: `insights_realtime` hesap başına ~24/gün,
   toplam ~7.000. `rateScope` gövde kontrolü kota hatası görülünce yapılacak.
2. ~~İlgi alanı büyüklüğü dünya geneli~~ **etiketlendi** (2026-09-29, deploy
   bekliyor). Ülkeye göre sayı (`delivery_estimate`) istenirse ayrı iş.
3. **Tasarım deploy sonrası:** gerçek sayfaları gez (pencereler, yoğun
   tablolar, Genel Bakış, Raporlar, Akıllı Boost) ve kullanıcının beğenisini
   al; sonraki tur buna göre.
   4d deploy sonrası: şablonlu ön ayarla ilk boost Ads Manager'da ilgi ve
   hariç kitleyle GÖZLE kontrol. Bölüm 4'ün kalanı (uzman mod, çok hesaplı
   kitle seçici) reklam oluşturmaya ait → dondu.
4. **Bölüm 5 — Koruma kuralları** (`BASE-PLANI.md`).
5. Açık ayrı iş (öneri kartı açıldı): eski tek reklam yayın yolu
   (`ad-publisher.service.ts`) özel kategori kısıtını uygulamıyor.

Bölüm 2, 3, 4 ekranları **tarayıcıda açılıp bakılmadı** — bir sonraki oturumun
başında kullanıcıya Marka sekmesi, Varlıklar, Kitleler ve "Kitleyi tarif et"
için bir göz attırmak iyi olur.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
