# Gizlilik politikasına eklenecek bölüm — ÖNERİ (onay bekliyor)

**Yasal metin. Kullanıcı onayı olmadan `components/yasal/gizlilik.*.tsx`e
yazılmaz.** Google'ın ret mailinde gizlilik maddesi yalnız "yanıt
vermiyor"du; ama sayfa açıldığında inceleyici bunları arayacak:

1. **Limited Use beyanı** — Google API Services User Data Policy'ye uyum
   cümlesi. Bugün metinde YOK (`grep -i "limited use"` boş).
2. **Hangi Google verisine hangi izinle erişildiği** — bugün yalnız "Google
   Ads API" geçiyor; Tag Manager ve Analytics hiç anılmıyor.
3. **Yapay zekâ işlemesi** — Gemini (`apps/api/src/yapay-zeka/gemini.ts`)
   hesap verisini işliyor: AdvStrategy, İyileştir asistanı, haftalık özet,
   reklam metni, kitle önerisi. Metinde Gemini/AI yok. Google'ın 2025'ten
   beri sorduğu "AI/ML disclosure" bu.

**Kullanıcının doğrulaması gereken bir olgu:** Gemini API'si hangi katmanda
kullanılıyor? Ücretli katmanda Google istem ve yanıtları ürün geliştirmede
kullanmıyor; ücretsiz katmanda kullanıyor. Aşağıdaki "modeli eğitmek için
kullanılmaz" cümlesi YALNIZ ücretli katmanda doğru; doğrulanmadan
yazılmamalı. Ayrıca Gemini'ye giden istemde Google Ads/GA4 verisi olup
olmadığı alan bazında ölçülmedi (asistanın araçları reklam metriklerini
okuyor; haftalık özet metrik özetliyor).

## Önerilen İngilizce metin (`gizlilik.en.tsx`, yeni bölüm)

> ### Google user data
>
> When you connect a Google account, Advetics requests only the
> permissions needed for the features you use:
>
> - **Google Ads** (`adwords`): to read campaigns, ads and performance
>   metrics for dashboards and reports, and — only when you ask — to
>   pause or enable campaigns, change budgets, create campaigns and
>   conversion actions.
> - **Google Tag Manager** (`tagmanager.edit.containers`,
>   `tagmanager.edit.containerversions`, `tagmanager.publish`): only when
>   you start conversion tracking setup, to create conversion tags,
>   triggers and variables in your container and publish them.
> - **Google Analytics** (`analytics.edit`, `analytics.readonly`): only
>   when you start conversion tracking setup or add GA4 as a data source,
>   to create a GA4 property, data stream, Google Ads link and key event,
>   and to read traffic reports.
>
> We do not request access to Gmail, Drive, YouTube or your Google
> profile.
>
> **Limited Use.** Advetics' use and transfer of information received
> from Google APIs to any other app will adhere to the
> [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
> including the Limited Use requirements. Google user data is used only to
> provide and improve the user-facing features described above. It is not
> sold, not used for advertising, and not shared with third parties except
> the processors listed in this policy to provide those features, as
> required by law, or with your consent. Humans at Advetics do not read
> this data except with your permission, for security purposes, or as
> required by law.
>
> **AI processing.** Some features (strategy suggestions, the improvement
> assistant, weekly summaries and ad copy suggestions) send advertising
> performance data to Google's Gemini API to generate text for you.
> [Data sent to the Gemini API is not used to train Google's models.]
> Advetics does not use Google user data to develop, improve or train
> generalized AI or machine learning models.
>
> **Revoking access.** You can disconnect Google at any time under
> Settings → Connections; Advetics then revokes its token with Google. You
> can also remove access at https://myaccount.google.com/permissions.

Türkçe karşılığı (`gizlilik.tr.tsx`) aynı yapıda yazılacak. LinkedIn ve
KVKK aydınlatma metni ayrı açık maddeler (`docs/DEVAM.md` "Kullanıcı
kararı bekleyen").
