import type { AdExplorerRow } from '@advetics/shared';
import { platformKanali } from '@advetics/shared';
import { platformKisaAdi } from '@advetics/shared';
import { formatMoney, formatNumber, formatPercent, formatRoas } from '@/lib/format';
import { KreatifGorsel } from '@/components/kreatif-gorsel';
import { PlatformLogo } from '@/components/platform-logo';
import { ctaEtiketi, incelemeEtiketi, kreatifTuruEtiketi } from '@/lib/reklam-etiketleri';
import { AramaReklamiOnizleme } from '@/components/arama-reklami-onizleme';
import { Rozet, type DurumHali } from '@/components/ui/rozet';

/*
 * DURUM ROZETİ ORTAK BİLEŞENDEN (`Rozet`): yeşil yalnız yayında olan
 * reklamda, duraklatılmış gri kare, incelemede/bitmiş gri. Eski rozetler
 * turuncu ve mavi tonlar taşıyordu; kılavuzda yoklar (CLAUDE.md §3 Tasarım).
 */
const STATUS_HAL: Record<string, DurumHali> = {
  active: 'ok',
  paused: 'dur',
  deleted: 'taslak',
  pending_review: 'taslak',
  ended: 'taslak',
  unknown: 'taslak',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  deleted: 'Silindi',
  pending_review: 'İncelemede',
  ended: 'Bitti',
  unknown: 'Bilinmiyor',
};

/**
 * Reklam kartı. İKİ BİÇİM, TEK KART:
 *
 * - `satir` (varsayılan): görsel + metin + metrikler yan yana. Reklam
 *   Yöneticisi'nin satır içi önizlemesi bunu kullanıyor; geniş satırda
 *   reklamın metni ve bütün sayıları aynı bakışta.
 * - `izgara`: Reklam Galerisi'nin kartı (onaylı taslak `#galeri`): kare
 *   görsel üstte, durum rozeti köşede, başlık ve kampanya yolu, altta üç
 *   sayı (Harcama · Dönüşüm · CPA). Ayrıntı satır biçiminde ve önizlemede.
 *
 * İKİ AYRI BİLEŞEN YAZILMADI: "görsel yok" ayrımı, arama reklamının metin
 * önizlemesi ve platform önizleme bağlantısı canlıda öğrenilmiş kararlar ve
 * ikinci bir kopya doğduğu anda ayrışırdı.
 *
 * Tablo yerine kart: Galeri'nin sorusu "hangi reklam neyi yapıyor" ve
 * cevabın yarısı GÖRSEL.
 *
 * Görsel adresleri platform CDN'inden ve SÜRESİ DOLABİLİYOR. `<img>` doğrudan
 * kullanılıyor (Next Image uzak alan yapılandırması gerektiriyor ve süresi
 * dolan adres için optimizasyon boşa gidiyor). Yüklenemezse arka plandaki yer
 * tutucu görünüyor: kırık resim ikonu panelin bozuk olduğu izlenimi verir.
 */
export function AdCard({
  ad,
  currency,
  bicim = 'satir',
}: {
  ad: AdExplorerRow;
  currency: string | null;
  bicim?: 'satir' | 'izgara';
}) {
  const money = currency ?? ad.currency ?? null;
  const image = ad.creative?.assetUrls[0];
  const hasIssues = ad.issues.length > 0;
  const izgara = bicim === 'izgara';

  /*
   * ═══ "GÖRSEL YOK" ÜÇ FARKLI ŞEY DEMEKTİ ═══
   *
   * Aynı boş kutu şunların hepsini temsil ediyordu ve üçünün yapılacak işi
   * farklı:
   *
   *   · Google ARAMA reklamı: görsel ZATEN YOK, bu normal ve doğru. Kutu
   *     göstermek raporda ve ekranda görüntü kirliliği üretiyor.
   *   · Google Display: kaynak adı URL sanılıp kırık görsel çıkıyordu
   *     (API tarafında elendi, artık "alınamadı" dalına düşüyor).
   *   · Meta kreatifi: adres ölmüş ya da hiç senkronize edilmemiş.
   *
   * `platform` ve `creativeType` ikisi de API'den ZATEN geliyordu; kart
   * hiçbirini karara sokmuyordu.
   */
  const aramaReklami =
    ad.platform === 'google' && /SEARCH/i.test(ad.creative?.creativeType ?? '');

  /**
   * Reklamın platformdaki önizlemesi.
   *
   * Kendi çizdiğimiz kart reklamın NASIL GÖRÜNDÜĞÜNÜ tam olarak gösteremiyor:
   * yerleşim (feed, story, reels), kırpma ve biçim kurallarını platform
   * uyguluyor. Bu yüzden "gerçekten neye benziyor" sorusunun cevabı Meta'nın
   * kendi önizlemesi; biz oraya götürüyoruz.
   *
   * `preview_shareable_link` yapı senkronizasyonunda geliyor. Eski senkronize
   * edilmiş reklamlarda boş olabilir; o durumda kart tıklanabilir olmuyor:
   * hiçbir yere gitmeyen bir bağlantı vermekten iyi.
   */
  const preview = ad.previewUrl;

  /*
   * ARAMA REKLAMINDA GÖVDEDEKİ BAŞLIK REKLAMIN ADI. Kreatif başlığı artık
   * önizleme kutusunda duruyor; ikisini birden basmak aynı cümleyi kartta iki
   * kez göstermek olurdu. Reklamın kendi adı ise listede aranan şey.
   */
  const baslikMetni = aramaReklami ? ad.name : (ad.creative?.headline ?? ad.name);
  const durumAnahtari = ad.deleted ? 'deleted' : ad.status;
  const cpa = formatMoney(ad.cpa === null ? null : String(Math.round(ad.cpa * 1_000_000)), money);
  const sorunSiniri = izgara ? 2 : 4;

  /*
   * ═══ ARAMA REKLAMINDA GÖRSEL DEĞİL, METNİN KENDİSİ ═══
   * Görsel kutusu burada gizleniyordu ve yerine hiçbir şey gelmiyordu: boş
   * bir kutu "eksik bir şey var" izlenimi veriyordu, doğru. Ama hiçbir şey
   * koymamak da ekranın asıl sorusunu cevapsız bırakıyordu: bu reklam NE
   * DİYOR. Metin reklamının kreatifi metnidir.
   *
   * AÇIKLAMA İÇİN YEDEK ALAN VAR: Google, RSA açıklamalarının ilkini
   * `primaryText` alanına yazıyor ve `description`ı boş bırakıyor
   * (`mapGoogleCreative`). Yalnızca `description` okumak, her arama
   * reklamının açıklamasını sessizce kaybetmek demekti.
   *
   * GÖRSEL `object-contain`, `object-cover` DEĞİL: Meta kreatifleri
   * çoğunlukla dikey (4:5 ya da 9:16) ve `cover` başlığı ve fiyatı kırpıyor.
   */
  const gorselKutusu = aramaReklami ? (
    <AramaReklamiOnizleme
      baslik={ad.creative?.headline ?? null}
      aciklama={ad.creative?.description ?? ad.creative?.primaryText ?? null}
      gorunenAdres={ad.creative?.displayUrl ?? null}
      hedefAdres={ad.creative?.destinationUrl ?? null}
      /* Gerçek arama sonucu geniş; 224 pikselde başlık iki satıra
         bölünüp kırılıyordu ve taklit ettiğimiz görünüm bozuluyordu. */
      className={izgara ? 'w-full bg-surface-muted p-3 pt-11' : 'w-full shrink-0 sm:w-72'}
    />
  ) : (
    <PreviewLink
      href={preview}
      className={
        izgara
          ? 'relative block aspect-square w-full overflow-hidden bg-surface-sunken'
          : 'relative aspect-[4/5] w-full shrink-0 overflow-hidden rounded-alan bg-surface-sunken sm:w-36'
      }
    >
      {image ? (
        <KreatifGorsel src={image} alt={ad.creative?.headline ?? ad.name} bosMetin="görsel alınamadı" />
      ) : (
        <div className="flex h-full items-center justify-center px-2 text-center text-11 text-ink-muted">
          görsel alınamadı
        </div>
      )}
      {/* Birden fazla görsel varsa (karusel / dinamik kreatif) sayısı
          belirtiliyor: tek kare tüm varyasyonları temsil etmiyor. */}
      {(ad.creative?.assetUrls.length ?? 0) > 1 && (
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-11 font-bold text-white">
          +{ad.creative!.assetUrls.length - 1} görsel
        </span>
      )}
      {preview && (
        // Tıklanabilir olduğu GÖRÜNMELİ: fareyle üzerine gelmeden
        // anlaşılmayan bir bağlantı, olmayan bir bağlantı gibidir.
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/45 group-hover:opacity-100 motion-reduce:transition-none">
          <span className="rounded-full bg-surface px-2.5 py-1 text-11 font-bold text-ink">Önizlemeyi aç ↗</span>
        </span>
      )}
    </PreviewLink>
  );

  const durumRozeti = (
    <Rozet hal={hasIssues ? 'hata' : (STATUS_HAL[durumAnahtari] ?? 'taslak')}>
      {STATUS_LABEL[durumAnahtari] ?? ad.status}
    </Rozet>
  );

  const baslik = (
    <h3 className="m-0 truncate font-baslik text-14 font-bold text-ink" title={ad.name}>
      {preview ? (
        <a
          href={preview}
          target="_blank"
          // `noreferrer` de gerekli: platforma hangi panelden
          // gelindiğini sızdırmaya gerek yok.
          rel="noopener noreferrer"
          className="text-ink no-underline hover:text-brand-strong hover:underline"
        >
          {baslikMetni}
        </a>
      ) : (
        baslikMetni
      )}
    </h3>
  );

  /*
   * ═══ HAM PLATFORM KODLARI EKRANDAN KALKTI ═══
   * `RESPONSIVE_SEARCH_AD`, `SHOP_NOW`, `DISAPPROVED` Meta ve Google'ın iç
   * kodları; paneli kullanan kişi reklamcı bile olmayabilir. Bilinmeyen kod
   * UYDURULMUYOR, yalnızca okunabilir hâle geliyor (`reklam-etiketleri.ts`).
   * PLATFORM ADI ÖNDE: Meta ve Google reklamları aynı listede yan yana ve
   * hangisinin hangi platforma ait olduğu ancak kampanya adından tahmin
   * edilebiliyordu.
   */
  const etiketler = (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-12 text-ink-muted">
      <span className="inline-flex items-center gap-1">
        <PlatformLogo kind={platformKanali(ad.platform)} className="h-3 w-3" />
        {platformKisaAdi(ad.platform)}
      </span>
      {aramaReklami && <span>· Arama reklamı, görseli yok</span>}
      {/* Arama reklamında tür etiketi TEKRAR olurdu. */}
      {ad.creative?.creativeType && !aramaReklami && <span>· {kreatifTuruEtiketi(ad.creative.creativeType)}</span>}
      {ad.creative?.ctaType && <span>· {ctaEtiketi(ad.creative.ctaType)}</span>}
    </span>
  );

  const sorunlar = hasIssues && (
    <div className="border-t border-line px-4 py-2.5">
      <p className="m-0 text-12 font-bold text-danger-strong">
        İnceleme sorunu{ad.reviewStatus ? ` · ${incelemeEtiketi(ad.reviewStatus)}` : ''}
      </p>
      <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
        {ad.issues.slice(0, sorunSiniri).map((issue, i) => (
          <li key={`${issue.topic}-${i}`} className="text-12 text-ink">
            <span className="font-semibold">{issue.topic}</span>
            {issue.detail && <span className="text-ink-muted">: {issue.detail}</span>}
          </li>
        ))}
        {ad.issues.length > sorunSiniri && (
          <li className="text-12 text-ink-muted">+{ad.issues.length - sorunSiniri} sorun daha</li>
        )}
      </ul>
    </div>
  );

  const kenar = hasIssues ? 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)]' : 'border-line';

  if (izgara) {
    return (
      <article className={`group flex min-w-0 flex-col overflow-hidden rounded-kart border bg-surface ${kenar}`}>
        <div className="relative">
          {gorselKutusu}
          <span className="absolute left-2.5 top-2.5">{durumRozeti}</span>
        </div>
        <div className="grid flex-1 content-start gap-1.5 p-3.5">
          {etiketler}
          {baslik}
          <small className="truncate text-12 text-ink-muted" title={`${ad.campaignName} › ${ad.adGroupName}`}>
            {ad.campaignName} › {ad.adGroupName}
          </small>
        </div>
        {sorunlar}
        <dl className="m-0 grid grid-cols-3 gap-1.5 border-t border-line px-3.5 py-2.5">
          <Metric label="Harcama" value={formatMoney(ad.spendMicros, money)} strong />
          <Metric label="Dönüşüm" value={formatNumber(ad.conversions)} strong />
          <Metric label="CPA" value={cpa} strong />
        </dl>
      </article>
    );
  }

  return (
    <article className={`group overflow-hidden rounded-kart border bg-surface ${kenar}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {gorselKutusu}

        {/* İçerik */}
        <div className="grid min-w-0 flex-1 content-start gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {durumRozeti}
            {etiketler}
          </div>
          {baslik}
          <p className="m-0 truncate text-12 text-ink-muted">
            {ad.campaignName} · {ad.adGroupName}
          </p>

          {/* ARAMA REKLAMINDA METİN ÖNİZLEMEDE: burada tekrar basmak aynı
              açıklamayı kartta iki kez göstermek olurdu. */}
          {!aramaReklami && ad.creative?.primaryText && (
            // Üç satırda kırpılıyor: kreatif metni bazen 500 karakter ve
            // kartı uzatmak listeyi taramayı imkânsız kılıyor.
            <p className="m-0 line-clamp-3 text-12 leading-relaxed text-ink-muted">{ad.creative.primaryText}</p>
          )}

          {ad.creative?.destinationUrl && (
            <p className="m-0 truncate text-11 text-ink-muted">
              →{' '}
              <span className="text-ink" title={ad.creative.destinationUrl}>
                {ad.creative.displayUrl ?? ad.creative.destinationUrl}
              </span>
            </p>
          )}
        </div>

        {/* Metrikler */}
        <dl className="m-0 grid shrink-0 grid-cols-2 gap-x-5 gap-y-1.5 sm:w-48">
          <Metric label="Harcama" value={formatMoney(ad.spendMicros, money)} strong />
          <Metric label="Dönüşüm" value={formatNumber(ad.conversions)} strong />
          <Metric label="Gösterim" value={formatNumber(ad.impressions)} />
          <Metric label="Tık" value={formatNumber(ad.clicks)} />
          <Metric label="CTR" value={formatPercent(ad.ctr)} />
          <Metric label="CPA" value={cpa} />
          {/* ROAS yalnızca gelir varsa: "0.00×" kampanyanın battığını söyler. */}
          {ad.roas !== null && <Metric label="ROAS" value={formatRoas(ad.roas)} />}
        </dl>
      </div>

      {sorunlar}
    </article>
  );
}

/**
 * Önizleme varsa bağlantı, yoksa düz kutu.
 *
 * Aynı görseli iki ayrı JSX dalında tekrarlamamak için sarmalayıcı: kopyala
 * yapıştır iki dalın zamanla ayrışmasına yol açıyor.
 */
function PreviewLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] text-ink-muted">{label}</dt>
      <dd className={`m-0 truncate font-baslik tabular-nums ${strong ? 'text-13 font-bold text-ink' : 'text-12 text-ink-muted'}`}>
        {value}
      </dd>
    </div>
  );
}
