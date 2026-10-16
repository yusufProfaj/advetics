import Link from 'next/link';
import { BolumluBaglantilar, SayfalamaBaglantilari, SuzgecMenusu } from '@/components/suzgec-menusu';
import { SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { BosDurum, HataDurumu } from '@/components/ui/hal';
import { Cip } from '@/components/ui/tablo';
import { dugmeSinifi } from '@/components/ui/dugme';
import type { AdsExploreQuery, AdsExploreResult, Platform } from '@advetics/shared';
import { AD_SORT_FIELDS, AD_STATUSES, PLATFORMS } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { rangeParams, resolveRange } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { formatDayLong, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { AdCard } from '@/components/ad-card';
import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';

/*
 * REKLAM GALERİSİ (2026-10-09): bu ekran menüde "Reklam Keşfi" idi. Reklam
 * Yöneticisi şirketten reklama inen tabloya dönünce reklam KARTLARI, arama
 * ve "Sorunlu" süzgeci buraya, onun alt sayfasına taşındı: o tabloda
 * reklamları metinle aramanın ve reddedilenleri tek tıkla toplamanın
 * karşılığı yok, kaldırmak çalışan bir işi silmek olurdu.
 *
 * BAŞLIK EKRANIN DİLİNDE (sözlükten, "Reklam Galerisi" / "Ad Gallery").
 * Menüde "Reklam Keşfi" yazıp ekranda "Ads Explorer" görmek kullanıcının
 * doğru sayfada olduğundan şüphe etmesine yol açıyordu: ad tek kaynaktan.
 * URL değişmiyor, bağlantılar paylaşılmış olabilir.
 */
/** Başlık istek anında: dil çerezden okunuyor (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  return { title: `${sec(reklamYoneticisiSozlugu, await dilAl()).galeri.baslik} · Advetics` };
}
export const dynamic = 'force-dynamic';


/**
 * Modül 4 — Ads Explorer.
 *
 * Tüm süzgeç durumu URL'DE. Sunucuda render ediliyor, paylaşılabiliyor ve
 * "reddedilmiş reklamlar" gibi bir görünümü ekip arkadaşına link olarak
 * gönderebiliyorsun. İstemci state'i bunu kaybettirirdi.
 *
 * Arama alanı bir FORM (GET): tek istemci bileşeni bile gerekmiyor, tarayıcı
 * formu kendisi URL'e çeviriyor.
 */
export default async function AdsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const sozluk = sec(reklamYoneticisiSozlugu, dil);
  const d = sozluk.galeri;
  // CTR ve CPA iki dilde aynı: sözlükte değil, burada.
  const SORT_LABEL: Record<string, string> = { ...d.siralama, ctr: 'CTR', cpa: 'CPA' };
  const STATUS_LABEL: Record<string, string> = sozluk.kart.durum;

  const range = resolveRange({
    aralik: first(params.aralik),
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
  });
  const sort = pick(first(params.sirala), AD_SORT_FIELDS, 'spend');
  const dir = first(params.yon) === 'asc' ? 'asc' : 'desc';
  const status = pick(first(params.durum), AD_STATUSES, undefined);
  const adAccountId = first(params.hesap);
  const campaignId = first(params.kampanya);
  const q = first(params.ara)?.trim() || undefined;
  const onlyIssues = first(params.sorunlu) === '1';
  /*
   * PLATFORM SÜZGECİ. Şemada (`adsExploreQuerySchema`) ve serviste zaten
   * vardı; panel onu HİÇ göndermiyordu. Meta ve Google reklamları tek listede
   * karışık duruyor ve hangisinin hangi platforma ait olduğu ancak kampanya
   * adından tahmin edilebiliyordu — oysa `ads.platform` kolonu baştan beri
   * orada.
   */
  const platform = pick(first(params.platform), PLATFORMS, undefined);
  const page = Math.max(1, Number(first(params.sayfa) ?? 1) || 1);

  const qs = new URLSearchParams({
    from: range.from,
    to: range.to,
    sort,
    dir,
    page: String(page),
    pageSize: '25',
  });
  if (status) qs.set('status', status);
  if (adAccountId) qs.set('adAccountId', adAccountId);
  if (campaignId) qs.set('campaignId', campaignId);
  if (q) qs.set('q', q);
  if (onlyIssues) qs.set('onlyIssues', 'true');
  if (platform) qs.set('platform', platform);

  /*
   * HATA YUTULMUYOR. `.catch(() => null)` 401 (oturum), 403 (izin), 500
   * (sorgu hatası) ve "API kapalı" hâllerini AYNI cümleye çeviriyordu:
   * "Reklamlar alınamadı. API çalışıyor mu?" — sunucu log'una bakmadan
   * hangisi olduğunu anlamak imkânsızdı. CLAUDE.md'deki
   * `.catch(() => setX([]))` yasağının aynısı.
   */
  let result: AdsExploreResult | null = null;
  let hata: string | null = null;
  try {
    result = await serverApiFetch<AdsExploreResult>(`/ads?${qs}`);
  } catch (err) {
    /*
     * HATA KODU EKRANDAN KALKTI, MESAJ KALDI. `(AD_LIST_FAILED, HTTP 500)`
     * paneli kullanan kişiye hiçbir şey anlatmıyor ve ürkütücü görünüyor;
     * sunucunun kendi cümlesi teşhis için yeterli. Kod ve durum sunucu
     * log'unda zaten duruyor.
     */
    hata =
      err instanceof ApiRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : d.bilinmeyenHata;
  }

  /** Mevcut süzgeçleri koruyarak yeni bir bağlantı üretir. */
  const linkWith = (over: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      // TARİH ANAHTARLARININ HEPSİ. Yalnızca `aralik` taşınsaydı özel bir
      // aralık seçip herhangi bir süzgece basmak onu sessizce 30 güne
      // döndürürdü — "aralık bazen kayboluyor" belirtisi.
      ...rangeParams(range),
      sirala: sort,
      yon: dir,
      durum: status,
      hesap: adAccountId,
      kampanya: campaignId,
      ara: q,
      sorunlu: onlyIssues ? '1' : undefined,
      platform,
      ...over,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    return `/ads-explorer/galeri?${next}`;
  };

  const temizHref = linkWith({ ara: undefined, hesap: undefined, durum: undefined, kampanya: undefined, sorunlu: undefined, sayfa: undefined });
  const suzgecVar = Boolean(q || adAccountId || status || campaignId || onlyIssues);

  return (
    <SayfaIskeleti
      bolum={menuBolumuEtiketi('/ads-explorer', dil)}
      baslik={d.baslik}
      ust={
        <Link href="/ads-explorer" className="text-13 font-semibold text-ink-muted no-underline hover:text-ink">
          ‹ {menuSatiriEtiketi('/ads-explorer', dil)}
        </Link>
      }
      aciklama={
        <>
          {formatDayLong(range.from, dil)} - {formatDayLong(range.to, dil)}
          {result && d.reklamSayisi(formatNumber(result.total, dil))}
          {d.aciklama}
        </>
      }
      eylemler={<TarihSecici aralik={range} enEskiGun={null} />}
    >
      {/*
        ═══ SÜZGEÇLER TEK ARAÇ ÇUBUĞUNDA, KARTIN BAŞINDA ═══
        Arama bir satır, altında hesap/durum/kampanya/sıralama DÖRT satır çip
        vardı; uzun hesap ve kampanya adları satırları ikiye üçe bölüyor ve
        süzgeçler ilk ekranın yarısını kaplıyordu. Artık tek çubuk (onaylı
        taslak `#galeri`): arama + platform + her boyut için etiketli bir
        çip (`SuzgecMenusu`, seçiliyse ✕ ile tek tıkla kalkıyor) + "Sorunlu"
        çipi + sıralama. Bağlantıların hepsi `linkWith` ile sunucuda
        kuruluyor: adres süzgeci taşımaya devam ediyor.

        "Sorunlu" MENÜDE DEĞİL, ÇİP: sayısı sıfırdan büyükse dikkat istiyor
        ve bir menünün içinde görünmez olurdu. Kırmızı YAZI, dolgusuz.
      */}
      <section className="min-w-0 rounded-kart border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          {/* Arama: düz GET formu, istemci JS'i yok. */}
          <form action="/ads-explorer/galeri" method="get" className="flex min-w-0 flex-[0_1_280px]">
            {/* TARİH ANAHTARLARI GİZLİ ALAN OLARAK. Form GET ile URL'i baştan
                kurduğu için burada olmayan her parametre ARAMA YAPINCA düşüyor. */}
            {Object.entries(rangeParams(range)).map(([k, v]) =>
              v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />,
            )}
            <input type="hidden" name="sirala" value={sort} />
            <input type="hidden" name="yon" value={dir} />
            {status && <input type="hidden" name="durum" value={status} />}
            {adAccountId && <input type="hidden" name="hesap" value={adAccountId} />}
            {campaignId && <input type="hidden" name="kampanya" value={campaignId} />}
            {onlyIssues && <input type="hidden" name="sorunlu" value="1" />}
            {platform && <input type="hidden" name="platform" value={platform} />}
            {/* ENTER İLE ARANIYOR: ayrı bir kırmızı "Ara" düğmesi ekranın tek
                birincil eylemi olamaz (BILESENLER § 3). */}
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-3">
              <span aria-hidden className="text-ink-soluk">
                ⌕
              </span>
              <span className="sr-only">{d.reklamAra}</span>
              <input
                type="search"
                name="ara"
                defaultValue={q ?? ''}
                placeholder={d.aramaYeri}
                className="min-w-0 flex-1 border-0 bg-transparent text-13 text-ink outline-none placeholder:text-ink-soluk"
              />
            </label>
          </form>

          {/* PLATFORM: Google Ads'te arama reklamlarının görseli yok, Meta'da
              her reklamın var; ikisini tek listede karıştırmak taramayı
              zorlaştırıyor. Seçenekler `PLATFORMS`tan: elle yazılan liste
              üçüncü platformu ekranda hiç göstermiyordu. */}
          <BolumluBaglantilar
            etiket="Platform"
            secenekler={[
              { key: undefined as Platform | undefined, label: sozluk.tumu },
              ...PLATFORMS.map((pl) => ({ key: pl as Platform | undefined, label: PLATFORM_KISA_ADLARI[pl] })),
            ].map((p) => ({
              href: linkWith({ platform: p.key, kampanya: undefined, sayfa: undefined }),
              etiket: p.label,
              secili: platform === p.key,
            }))}
          />

          {result !== null && (
            <>
              {result.facets.adAccounts.length > 1 && (
                <SuzgecMenusu
                  etiket={d.hesap}
                  deger={result.facets.adAccounts.find((a) => a.id === adAccountId)?.name ?? (adAccountId ? d.seciliHesap : sozluk.tumu)}
                  secili={Boolean(adAccountId)}
                  kaldirHref={linkWith({ hesap: undefined, kampanya: undefined, sayfa: undefined })}
                  secenekler={[
                    {
                      href: linkWith({ hesap: undefined, kampanya: undefined, sayfa: undefined }),
                      ad: sozluk.tumu,
                      aktif: !adAccountId,
                    },
                    ...result.facets.adAccounts.map((acc) => ({
                      // Hesap değişince kampanya seçimi geçersiz kalıyor.
                      href: linkWith({ hesap: acc.id, kampanya: undefined, sayfa: undefined }),
                      ad: acc.name,
                      sayi: acc.adCount,
                      aktif: adAccountId === acc.id,
                    })),
                  ]}
                />
              )}

              <SuzgecMenusu
                etiket={d.durum}
                deger={status ? (STATUS_LABEL[status] ?? status) : sozluk.tumu}
                secili={Boolean(status)}
                kaldirHref={linkWith({ durum: undefined, sayfa: undefined })}
                secenekler={[
                  { href: linkWith({ durum: undefined, sayfa: undefined }), ad: sozluk.tumu, aktif: !status },
                  ...result.facets.statuses.map((st) => ({
                    href: linkWith({ durum: st.status, sorunlu: undefined, sayfa: undefined }),
                    ad: STATUS_LABEL[st.status] ?? st.status,
                    sayi: st.count,
                    aktif: status === st.status,
                  })),
                ]}
              />

              {result.facets.campaigns.length > 1 && (
                <SuzgecMenusu
                  etiket={d.kampanya}
                  deger={result.facets.campaigns.find((c) => c.id === campaignId)?.name ?? (campaignId ? d.seciliKampanya : sozluk.tumu)}
                  secili={Boolean(campaignId)}
                  kaldirHref={linkWith({ kampanya: undefined, sayfa: undefined })}
                  secenekler={[
                    { href: linkWith({ kampanya: undefined, sayfa: undefined }), ad: sozluk.tumu, aktif: !campaignId },
                    ...result.facets.campaigns.map((c) => ({
                      href: linkWith({ kampanya: c.id, sayfa: undefined }),
                      ad: c.name,
                      sayi: c.adCount,
                      aktif: campaignId === c.id,
                    })),
                  ]}
                />
              )}

              {q && (
                <Cip>
                  {d.arama(q)}
                  <Link
                    href={linkWith({ ara: undefined, sayfa: undefined })}
                    aria-label={d.aramayiKaldir}
                    className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted no-underline hover:bg-surface hover:text-ink"
                  >
                    ✕
                  </Link>
                </Cip>
              )}
              {suzgecVar && (
                <Link href={temizHref} className="text-12 font-semibold text-ink-muted no-underline hover:text-ink hover:underline">
                  {d.tumunuTemizle}
                </Link>
              )}

              <span className="flex-1" />

              {result.facets.issueCount > 0 && (
                <Link
                  href={linkWith({ sorunlu: onlyIssues ? undefined : '1', durum: undefined, sayfa: undefined })}
                  aria-current={onlyIssues ? 'true' : undefined}
                  title={onlyIssues ? d.sorunluKaldir : d.sorunluGoster}
                  className={`inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold text-danger-strong no-underline transition-colors ${
                    onlyIssues ? 'bg-vurgu' : 'bg-surface-sunken hover:bg-vurgu'
                  }`}
                >
                  {d.sorunlu(result.facets.issueCount)}
                  {onlyIssues && <span aria-hidden>✕</span>}
                </Link>
              )}

              <SuzgecMenusu
                etiket={d.sirala}
                deger={`${SORT_LABEL[sort]} ${dir === 'desc' ? '↓' : '↑'}`}
                secili={false}
                secenekler={AD_SORT_FIELDS.map((f) => {
                  const active = sort === f;
                  // Aynı alana tekrar tıklamak yönü çeviriyor: tablo başlığı
                  // davranışının bilinen karşılığı.
                  const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
                  return {
                    href: linkWith({ sirala: f, yon: nextDir, sayfa: undefined }),
                    ad: SORT_LABEL[f] ?? f,
                    aktif: active,
                    ek: active ? (dir === 'desc' ? d.azalan : d.artan) : undefined,
                  };
                })}
              />
            </>
          )}
        </div>

        {result === null ? (
          <div className="p-4">
            <HataDurumu baslik={d.alinamadi} mesaj={hata ?? d.sebepBilinmiyor} />
          </div>
        ) : (
          <>
            {/*
              SÜZGEÇ TOPLAMI: SAYFANIN değil, süzgecin tamamının. 12 piksellik
              gri bir satırdı ve dipnot gibi duruyordu; oysa ekrandaki en
              önemli sayı bloğu bu: seçilen süzgecin toplam harcaması. Metrik
              kutularının biçiminde, kartın üst şeridi olarak.
            */}
            <div className="grid grid-cols-2 border-b border-line sm:grid-cols-3 lg:grid-cols-6">
              <Total label={sozluk.kart.harcama} value={formatMoney(result.totals.spendMicros, result.currency, { dil })} />
              <Total label={sozluk.kart.gosterim} value={formatNumber(result.totals.impressions, dil)} />
              <Total label={sozluk.kart.tik} value={formatNumber(result.totals.clicks, dil)} />
              <Total label="CTR" value={formatPercent(result.totals.ctr, 2, dil)} />
              <Total label={sozluk.kart.donusum} value={formatNumber(result.totals.conversions, dil)} />
              <Total
                label="CPA"
                value={formatMoney(
                  result.totals.cpa === null ? null : String(Math.round(result.totals.cpa * 1_000_000)),
                  result.currency,
                  { dil },
                )}
              />
            </div>

            <div className="p-5">
              {result.rows.length === 0 ? (
                <BosDurum
                  baslik={d.bosBaslik}
                  neden={
                    suzgecVar
                      ? d.bosSuzgecli
                      : d.bosSuzgecsiz
                  }
                  eylem={
                    suzgecVar && (
                      <Link href={temizHref} className={dugmeSinifi('ikincil', 'kucuk')}>
                        {d.suzgecleriTemizle}
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                  {result.rows.map((ad) => (
                    <AdCard key={ad.id} ad={ad} currency={result!.currency} bicim="izgara" dil={dil} />
                  ))}
                </div>
              )}
            </div>

            {/* SESSİZ KESME YOK: "1 - 25 / 118" her zaman, sayfa tek olsa bile. */}
            <SayfalamaBaglantilari
              bas={(result.page - 1) * result.pageSize + 1}
              son={(result.page - 1) * result.pageSize + result.rows.length}
              toplam={result.total}
              oncekiHref={result.page > 1 ? linkWith({ sayfa: String(result.page - 1) }) : null}
              sonrakiHref={
                result.page < Math.ceil(result.total / result.pageSize) ? linkWith({ sayfa: String(result.page + 1) }) : null
              }
            />
          </>
        )}
      </section>
    </SayfaIskeleti>
  );
}

/** Süzgeç toplamının tek kutusu: `MetrikKutulari` biçimi, altı sütuna sığsın diye yerel (BILESENLER "Grup 1 sapması"). */
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 border-r border-line px-[18px] py-3.5 last:border-r-0">
      <span className="truncate text-[12.5px] font-semibold text-ink-muted">{label}</span>
      <b className="truncate font-baslik text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-ink">
        {value}
      </b>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string, D extends T | undefined>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: D,
): T | D {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
