/**
 * ═══ GEZİNME İSKELETİ — "TIKLIYORUM, GİTMİYOR"UN CEVABI ═══
 *
 * BULUNAN ARIZA: panelde tek bir `loading.tsx` ya da `<Suspense>` sınırı
 * yoktu ve bütün sayfalar dinamik (`force-dynamic`, ya da `serverApiFetch`
 * içinden `cookies()` okunduğu için zaten dinamik).
 *
 * Next App Router'da `<Link>` tıklanınca bir geçiş başlıyor ve gösterilecek
 * bir yükleme sınırı YOKSA React ESKİ AĞACI ekranda tutuyor. Sonuç: tıklanan
 * bağlantı rengini bile değiştirmiyor, ekranda hiçbir şey olmuyor, sunucu
 * render'ı bitene kadar panel DONMUŞ görünüyor. Kullanıcı tekrar tıklıyor.
 * Gezinme bir belge navigasyonu değil RSC isteği olduğu için tarayıcının
 * sekme spinner'ı bile dönmüyor.
 *
 * Bu, CLAUDE.md'deki "sessiz hata" kuralının arayüz karşılığı: "yükleniyor",
 * "bitti" ve "çağrı düştü" aynı hiçbir şey olmayan ekrana çevrilmişti.
 *
 * BU DOSYA HIZLANDIRMIYOR, GÖRÜNÜR KILIYOR. Gecikmenin kendisi ayrı bir iş
 * (475 hesaplık `/connections` yanıtı, sayfa başına iki oturum sorgusu).
 * İkisini karıştırmamak önemli: iskelet eklenip gecikme durursa "düzelttik
 * ama hâlâ yavaş" olur.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Sayfa yükleniyor…</span>

      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-sunken" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface-sunken" />
      </div>

      <div className="h-14 animate-pulse rounded-xl bg-surface-sunken" />

      {/* Kart ızgarası — panelin çoğu ekranı bu şekilde. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-sunken" />
        ))}
      </div>
    </div>
  );
}
