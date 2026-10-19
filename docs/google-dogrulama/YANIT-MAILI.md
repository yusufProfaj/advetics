# Google'a yanıt maili (taslak)

Gönderen: kullanıcı, doğrulama mailinin geldiği konu zincirine yanıt
olarak. `[…]` yerleri doldurulacak. Gizlilik politikasına Google kullanıcı
verisi bölümü eklenirse ([`GIZLILIK-ONERISI.md`](GIZLILIK-ONERISI.md),
onay bekliyor) 2. maddedeki köşeli cümle kalır, eklenmezse silinir.
**Deploy'dan ÖNCE gönderilmez:** 1. maddedeki "www variants redirect"
cümlesi `www` düzeltmesi canlıya çıkınca doğru oluyor (bugün `www` 307 →
`/r/bulunamadi`). Göndermeden önce
`curl -sI https://www.advetics.com/` → `308` ve `location: https://advetics.com/` gör.

---

**Subject:** Re: OAuth verification — Advetics (Project ID advetics-504618 / 355436290681)

Hello Google Trust & Safety team,

Thank you for the review. We have addressed the three issues raised in
your email of October 17.

**1. Home page URL.** The home page was affected by a redirect loop on our
side that occurred only for visitors who selected English on the
first-visit language prompt. It was fixed and deployed on October 17. We
have also updated the home page URL on the OAuth consent screen to the
English version, which loads directly without any prompt:
https://advetics.com/en
(The Turkish version https://advetics.com/ continues to work; https and
www variants redirect to it.)

**2. Privacy policy URL.** The privacy policy had the same cause and is
now reachable without redirects. We updated the URL on the consent screen
to the English version:
https://advetics.com/en/privacy
It describes which Google user data the app accesses, how it is used,
stored and shared, and how users can revoke access. [It now also includes
a dedicated "Google user data" section with our Limited Use statement and
a description of AI processing.]

**3. Demo video.** We recorded a new video that shows each requested scope
in the app and the resulting change in the user's Google account:
[YouTube unlisted link]

| Scope | Where in the video | What it is used for | Why a narrower scope is not sufficient |
|---|---|---|---|
| `https://www.googleapis.com/auth/adwords` | 1:15–3:00 | Reads campaigns and metrics for reporting; pauses/enables campaigns and changes budgets at the user's request. The change is shown in Google Ads change history. | The Google Ads API has a single OAuth scope; no read-only variant exists. |
| `https://www.googleapis.com/auth/tagmanager.edit.containers` | 3:45–4:45 | Creates an "Advetics" workspace with conversion tags, triggers and variables in the user's container. Shown in Tag Manager. | `tagmanager.readonly` cannot create tags. |
| `https://www.googleapis.com/auth/tagmanager.edit.containerversions` | 4:45–5:15 | Creates a container version from that workspace. Shown under Versions. | `edit.containers` does not allow creating versions. |
| `https://www.googleapis.com/auth/tagmanager.publish` | 5:15–5:50 | Publishes the version so conversion tracking goes live. Shown as the Live version. | Publishing requires this scope; there is no narrower one. |
| `https://www.googleapis.com/auth/analytics.edit` | 5:50–6:40 | Creates the GA4 property, web data stream, Google Ads link and `generate_lead` key event. Shown in GA4 Admin. | `analytics.readonly` cannot create or link resources. |
| `https://www.googleapis.com/auth/analytics.readonly` | 6:40–7:20 | Reads GA4 reports (Data API `runReport`) to show traffic next to ad performance. | This is the narrowest read scope; the Data API does not accept `analytics.edit`. |

The Tag Manager and Analytics scopes are requested only when a user starts
conversion tracking setup (incremental authorization); the first
connection asks for Google Ads only. The app does not request any YouTube,
Gmail, Drive or user profile scopes. When a user disconnects Google in
Advetics, we revoke the token via the OAuth revoke endpoint; this is shown
at the end of the video (7:20–8:00).

The video was recorded with a separate demo Google account and demo
assets; no customer data appears in it.

Please let us know if anything else is needed.

Best regards,
[Ad Soyad]
Profaj — Advetics
[yusuf@profaj.com]
