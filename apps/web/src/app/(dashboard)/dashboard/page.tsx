import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type {
  BekleyenIslerYaniti,
  ClientPacing,
  MetricsAccountBreakdown,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsConversionDetail,
  MetricsOrganizationRow,
  MetricsSummary,
  MetricsTimeseries,
  Platform,
} from '@advetics/shared';
import { PLATFORMS, PLATFORM_KISA_ADLARI, bicimKodu, sec, type Dil } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { enEskiGunGerekli, rangeParams, resolveRange } from '@/lib/date-range';
import { baglanti } from '@/lib/baglanti';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
import {
  changePercent,
  changePercentMicros,
  formatDayLong,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
  microsOf,
} from '@/lib/format';
import { ayAnahtari } from '@/components/butce/butce-icerik';
import { butceAdresi, butceKapsami } from '@/lib/butce-adresi';
import { HiyerarsiYolu, type YolBasamagi } from '@/components/hiyerarsi-yolu';
import { bekleyenIslerYolu, boostRozeti, type BekleyenIslerSonucu } from '@/lib/bekleyen-isler';
import { hizliErisim } from '@/lib/hizli-erisim';
import { menuSatiriEtiketi, visibleSections } from '@/lib/nav-sections';
import { HESAP_AJANSTA, hesaplarHedefi } from '@/lib/ayar-kapilari';
import {
  BildirimSeridi,
  EnCokHarcayanlarKarti,
  MecraDagilimi,
  OzetListeKarti,
  PerformansKarti,
  type Bildirim,
  type IkincilMetrik,
  type OzetSatiri,
  type PerformansMetrigi,
} from '@/components/taslak/genel-bakis-parcalari';
import {
  BekleyenIskelet,
  BekleyenIslerKarti,
  ButceKarti,
  DonusumKarti,
  KapsamOzeti,
} from '@/components/taslak/genel-bakis-kartlari';
import s from '@/components/taslak/taslak.module.css';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BolumluBaglantilar } from '@/components/suzgec-menusu';
import { first, hataMetni, resolvePlatform } from '@/lib/sayfa-yardimcilari';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { kapi } from '@/lib/panel-adresleri';
import { KurulumSeridi } from '@/components/genel-bakis/kurulum-seridi';
import { HaftalikOzetBaglantisi } from '@/components/report/haftalik-ozet-baglantisi';

/** Başlık istek anında: dil çerezden okunuyor (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  // SAYFA ADI MENÜNÜN KENDİ ÇEVİRİSİNDEN: ayrı bir sözlük girdisi iki dilde
  // menüden ayrışabilirdi (`nav-sections.spec.ts` "MENÜDEKİ AD İLE SAYFANIN ADI AYNI").
  return { title: `${menuSatiriEtiketi('/dashboard', await dilAl())} · Advetics` };
}

/** Sayfanın sözlüğü; yardımcılar dili ve metni parametreyle alıyor (modül düzeyinde dil yok). */
type GB = (typeof genelBakisSozlugu)['tr'];

/**
 * ═══ GENEL BAKIŞ — ONAYLANAN TASLAĞIN BİREBİR HÂLİ (2026-10-09) ═══
 *
 * Kullanıcı taslağı onayladı ("mükemmel olmuş"), ilk kod sürümünü reddetti
 * ("taslağın aynısını istiyorum, en ufak bir hata istemiyorum"): ilk sürüm
 * taslağı eski bileşenlerle YAKLAŞIK kurmuştu. Bu sayfa taslağın kendi
 * yapısı ve CSS'i (`components/taslak/`) ile çiziliyor; veri kuralları
 * eskisiyle aynı.
 *
 * Düzen: üstte başlık, tarih, güncelle; platform sekmeleri ve kısayollar;
 * uyarı şeridi. Solda Performans (seçilebilir kutular + çizgi grafik +
 * ikincil şerit) ve paranın nereye gittiği; sağda bekleyen işler, bütçe,
 * mecra dağılımı, dönüşümler. AJANS GÖRÜNÜMÜNDE sağ sütun boş kalmıyor
 * (kullanıcı: "boşlukları doldur"): mecra dağılımı ve kapsam özeti.
 *
 * VERİ EKSİLTİLMEDİ: iniş tablosu (kampanya → reklam seti → reklam,
 * önizleme) Reklam Yöneticisi'nde; eski iniş adresleri oraya yönleniyor.
 */
export const dynamic = 'force-dynamic';

/** Genel Bakış'ın açılış aralığı. Adreste `aralik` yoksa bu kullanılıyor. */
const GENEL_BAKIS_ARALIGI = 'bu_ay';

/** Şirket/workspace/hesap listesinde kaç satır görünür; tamamı Reklam Yöneticisi'nde. */
const OZET_SATIR = 5;

/** Kampanya kartının sunucudan istediği satır: pay ve "en az N" bunun üstünden. */
const KAMPANYA_SINIRI = 50;

/**
 * İNİŞ PARAMETRELERİ Reklam Yöneticisi'ne ait. Paylaşılmış eski bir Genel
 * Bakış bağlantısı (`?kampanya=...`) burada AÇILIRSA kampanya süzgeci
 * sessizce düşer ve kullanıcı bütün workspace'in rakamlarını o kampanyanınki
 * sanır. O yüzden adres olduğu gibi oraya taşınıyor.
 */
const INIS_PARAMETRELERI = ['hesap', 'kampanya', 'reklamSeti', 'seviye', 'sirala'] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const d = sec(genelBakisSozlugu, dil);

  if (INIS_PARAMETRELERI.some((k) => first(params[k]) !== undefined)) {
    const tasi = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const deger = first(v);
      if (deger !== undefined) tasi.set(k, deger);
    }
    redirect(`${REKLAM_YONETICISI}?${tasi}`);
  }

  /*
   * BEKLEYEN İŞLER EN BAŞTA BAŞLIYOR, BEKLENMİYOR: söz `await` edilmiyor,
   * metrik okumalarıyla paralel koşuyor; kart ve Akıllı Boost rozeti onu
   * kendi Suspense sınırlarında bekliyor. HATA NESNEYE ÇEVRİLİYOR:
   * `.catch(() => null)` "iş yok" ile "çağrı düştü"yü aynı boş karta
   * çevirirdi.
   */
  const bekleyenler: Promise<BekleyenIslerSonucu> = serverApiFetch<BekleyenIslerYaniti>(
    bekleyenIslerYolu(session.activeClientId),
  ).then(
    (yanit) => ({ durum: 'tamam', yanit }),
    (e: unknown) => ({ durum: 'hata', mesaj: hataMetni(e) }),
  );
  /* HIZLI ERİŞİM MENÜNÜN SÜZGECİNDEN: menüde görünmeyen kısayol olmaz. */
  const kisayollar = hizliErisim(
    visibleSections(session.permissions, {
      ustHesapGorunur: session.platformAdmin || session.managerAccount !== null,
      platformSahibi: session.platformAdmin,
    }),
    dil,
  );

  /*
   * "HESABI BAĞLA / ATA" BAĞLANTISI YALNIZ HEDEFİ AÇIKSA (MIMARI Ç-19).
   * Müşteri hesabı "Bağlantılara git"i görüp 403 alıyordu. Workspace
   * seçiliyse onun Kurulum'u, değilse Ayarlar'daki havuz (`hesaplarAdresi`).
   */
  const hesapHedefi = hesaplarHedefi(session, session.activeClientId);

  /* KAPSAM YALNIZCA "Tüm zamanlar" İÇİN OKUNUYOR (en eski gün). */
  const aralik = first(params.aralik) ?? GENEL_BAKIS_ARALIGI;
  const kapsam = enEskiGunGerekli(aralik)
    ? await serverApiFetch<{ earliestDate: string | null }>(
        `/metrics/coverage?from=${first(params.baslangic) ?? '2026-01-01'}&to=${first(params.bitis) ?? '2026-01-01'}`,
      ).catch(() => null)
    : null;

  const range = resolveRange({
    aralik,
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
    enEskiGun: kapsam?.earliestDate ?? null,
    dil,
  });
  const platform = resolvePlatform(first(params.platform));
  /* Tek günde günlük seri istenmiyor (grafik çizilmiyor, kart nedenini yazıyor). */
  const tekGun = range.days <= 1;

  /*
   * TAŞINAN SÜZGEÇLER: tarih ve platform. Buradan Reklam Yöneticisi'ne
   * giden her bağlantı aynı dönemi ve platformu taşıyor; yoksa tıklayan
   * kullanıcı başka bir dönemin rakamlarına düşerdi.
   */
  const tasinan = {
    ...rangeParams(range),
    platform: platform ?? undefined,
  };
  const tasinanSorgu = new URLSearchParams();
  for (const [k, v] of Object.entries(tasinan) as Array<[string, string | undefined]>) {
    if (v !== undefined) tasinanSorgu.set(k, v);
  }

  const base = new URLSearchParams({ from: range.from, to: range.to });
  if (range.compareFrom && range.compareTo) {
    base.set('compareFrom', range.compareFrom);
    base.set('compareTo', range.compareTo);
  }
  if (platform) base.set('platform', platform);
  const kampanyaQs = new URLSearchParams(base);
  kampanyaQs.set('level', 'campaign');
  kampanyaQs.set('limit', String(KAMPANYA_SINIRI));

  let ozetHatasi: string | null = null;

  /*
   * ÜÇ KATMAN: ajans ("Tüm şirketler") → şirketler; şirket (workspace
   * seçili değil) → workspace'ler; workspace → hesaplar + kampanyalar.
   * Ajans kontrolü MCC'den ÖNCE: ajans kipinde `activeClientId` boş ve MCC
   * koşulu da tutuyor.
   */
  const ajansGorunumu = session.tumSirketler;
  const mcc =
    !ajansGorunumu && session.activeClientId === null && session.availableClients.length > 1;
  const workspaceGorunumu = !ajansGorunumu && !mcc;

  /* BU AYIN BÜTÇESİ — hangi workspace'in, `butceKapsami` karar veriyor. */
  const butceK = session.permissions.includes('budget.read')
    ? butceKapsami({ ajansGorunumu, activeClientId: session.activeClientId, workspaceler: session.availableClients })
    : ({ tur: 'yok' } as const);
  const butceGorunur = butceK.tur !== 'yok';
  const butceWorkspaceId = butceK.tur === 'workspace' ? butceK.id : null;
  let butceHatasi: string | null = null;

  const [summary, series, musteriler, sirketler, kampanyalar, hesaplar, donusum, butce] =
    await Promise.all([
      serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch((e: unknown) => {
        ozetHatasi = hataMetni(e);
        return null;
      }),
      tekGun
        ? Promise.resolve<MetricsTimeseries>({ points: [], previous: null })
        : serverApiFetch<MetricsTimeseries>(`/metrics/timeseries?${base}`).catch(() => null),
      mcc
        ? serverApiFetch<MetricsClientRow[]>(`/metrics/clients?${base}`).catch(() => null)
        : Promise.resolve(null),
      ajansGorunumu
        ? serverApiFetch<MetricsOrganizationRow[]>(`/metrics/organizations?${base}`).catch(
            () => null,
          )
        : Promise.resolve(null),
      workspaceGorunumu
        ? serverApiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${kampanyaQs}`).catch(() => null)
        : Promise.resolve(null),
      workspaceGorunumu
        ? serverApiFetch<MetricsAccountBreakdown>(`/metrics/hesaplar?${base}`).catch(() => null)
        : Promise.resolve(null),
      /* Dönüşüm eylemleri üst katmanlarda anlamsız ve sorgu pahalı. */
      workspaceGorunumu
        ? serverApiFetch<MetricsConversionDetail>(`/metrics/donusum-detay?${base}`).catch(
            () => null,
          )
        : Promise.resolve(null),
      butceWorkspaceId
        ? serverApiFetch<ClientPacing>(
            `/budgets/pacing?${new URLSearchParams({ clientId: butceWorkspaceId, month: ayAnahtari() })}`,
          ).catch((e: unknown) => {
            butceHatasi = hataMetni(e);
            return null;
          })
        : Promise.resolve(null),
    ]);

  const activeClient = session.availableClients.find((c) => c.id === session.activeClientId);
  const scopeLabel = ajansGorunumu ? d.tumSirketler : (activeClient?.name ?? d.tumWorkspaceler);

  /* KAPSAM ŞERİDİ: ajans › şirket › workspace; üst basamak kapsamı değiştiriyor. */
  const basamaklar: YolBasamagi[] = [];
  if (session.managerAccount) {
    basamaklar.push({ ad: session.managerAccount.name, kapsam: { tip: 'ajans' } });
  }
  if (!ajansGorunumu) {
    const sirketAdi =
      session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)
        ?.name ?? session.organization.name;
    basamaklar.push({ ad: sirketAdi, kapsam: { tip: 'sirket' } });
  }
  if (activeClient) basamaklar.push({ ad: activeClient.name });

  const karsilastir = range.karsilastirma !== 'yok';
  const veriVar = summary !== null && summary.accountCount > 0;

  const yeniReklam = kisayollar.find((k) => k.href === '/reklam');
  const digerKisayollar = kisayollar.filter((k) => k.href !== '/reklam');

  return (
    <div className={s.kok}>
      {/*
        BAŞLIK: kırıntı, ad, kapsam ve dönem solda; tarih ve güncelle sağda.
        TAZELİK güncelle düğmesinin içinde: en çok bakılan bilgilerden biri.
        ORTAK BAŞLIK (`SayfaBasligi`): düzen aynı (kullanıcı Genel Bakış'ın
        iç düzenini beğendi, 2026-10-14); yalnız başlığın ölçüsü ve kırmızı
        üst başlık (kapsamın adı) diğer sayfalarla aynı dilde.
      */}
      <SayfaBasligi
        ust={basamaklar.length > 1 ? <HiyerarsiYolu basamaklar={basamaklar} tasinan={tasinan} gorunum="kirinti" /> : undefined}
        bolum={scopeLabel}
        baslik={menuSatiriEtiketi('/dashboard', dil)}
        aciklama={
          <>
            {scopeLabel} · {formatDayLong(range.from, dil)} - {formatDayLong(range.to, dil)}
            {range.incomplete && <span className="text-danger-strong"> · {d.gunBitmedi}</span>}
          </>
        }
        eylemler={
          <>
            <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
            <RefreshButton
              dateFrom={range.from}
              dateTo={range.to}
              rangeLabel={range.label}
              sonGuncelleme={summary?.lastFetchedAt ?? null}
            />
          </>
        }
      />

      {/*
        KURULUM EKSİK ŞERİDİ (kurulum sihirbazı, MIMARI § 3a): yalnız kurulumu
        YAPABİLENE ve bir workspace seçiliyken. Müşteri hesabı Marka
        Merkezi'ni göremiyor; ona yapamayacağı bir işi her gün göstermek olmaz.
      */}
      {session.activeClientId && kapi(session, 'kurulum.yaz') && kapi(session, 'markaMerkezi.gor') && (
        <KurulumSeridi clientId={session.activeClientId} />
      )}

      <div className={s.serit2}>
        <BolumluBaglantilar
          etiket="Platform"
          secenekler={[null, ...PLATFORMS].map((p) => ({
            href: baglanti('/dashboard', tasinan, { platform: p ?? undefined }),
            etiket: p ? PLATFORM_KISA_ADLARI[p] : d.tumu,
            secili: platform === p,
          }))}
        />
        {summary !== null && <span className={s.notKucuk}>{d.reklamHesabi(summary.accountCount)}</span>}
        {(digerKisayollar.length > 0 || yeniReklam) && (
          <nav className={s.hizli} aria-label={d.hizliErisim}>
            {digerKisayollar.map((k) => (
              <Link key={k.href} className={dugmeSinifi('ikincil', 'kucuk')} href={k.href}>
                {k.etiket}
                {k.boostRozeti && (
                  <Suspense fallback={null}>
                    <BoostSayisi sonuc={bekleyenler} dil={dil} />
                  </Suspense>
                )}
              </Link>
            ))}
            {yeniReklam && (
              <Link className={dugmeSinifi('birincil', 'kucuk')} href={yeniReklam.href}>
                {d.reklamOlustur}
              </Link>
            )}
          </nav>
        )}
      </div>

      {summary === null ? (
        <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>{d.verilerAlinamadi}</strong>
            {ozetHatasi && <span> {ozetHatasi}</span>}
          </span>
        </div>
      ) : summary.accountCount === 0 ? (
        <div className={s.bildirim} role="status">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>{d.henuzVeriYok}</strong>{' '}
            {hesapHedefi ? d.hesapAta : HESAP_AJANSTA}
          </span>
          {hesapHedefi && (
            <Link className={s.cozum} href={hesapHedefi}>
              {d.hesaplaraGit}
            </Link>
          )}
        </div>
      ) : (
        <BildirimSeridi bildirimler={bildirimler(summary, hesapHedefi, d)} />
      )}

      <div className={s.izgara}>
        <div className={s.sutun}>
          {veriVar && (
            <PerformansKarti
              metrikler={performansMetrikleri(summary!, karsilastir, d, dil)}
              ikincil={ikincilMetrikler(summary!, karsilastir, d, dil)}
              noktalar={series?.points ?? []}
              onceki={karsilastir ? (series?.previous ?? null) : null}
              tekGun={tekGun}
              seriHatasi={series === null}
            />
          )}

          {veriVar &&
            (ajansGorunumu ? (
              sirketler === null ? (
                <HataKarti metin={d.dagilimAlinamadi.sirket} />
              ) : (
                <OzetListeKarti
                  baslik={d.liste.sirketler}
                  sutunAdi={d.liste.sirket}
                  satirlar={sirketSatirlari(sirketler, d)}
                  tumuHref={REKLAM_YONETICISI}
                  sayac={d.liste.sayac(Math.min(OZET_SATIR, sirketler.length), sirketler.length, 'sirket')}
                  altNot={d.liste.harcayan(sirketler.filter((r) => r.spendMicros !== '0').length)}
                />
              )
            ) : mcc ? (
              musteriler === null ? (
                <HataKarti metin={d.dagilimAlinamadi.workspace} />
              ) : (
                <OzetListeKarti
                  baslik={d.liste.workspaceler}
                  sutunAdi="Workspace"
                  satirlar={workspaceSatirlari(musteriler, d)}
                  tumuHref={REKLAM_YONETICISI}
                  sayac={d.liste.sayac(Math.min(OZET_SATIR, musteriler.length), musteriler.length, 'workspace')}
                  altNot={d.liste.harcayan(musteriler.filter((r) => r.spendMicros !== '0').length)}
                />
              )
            ) : (
              <>
                {hesaplar === null ? (
                  <HataKarti metin={d.dagilimAlinamadi.hesap} />
                ) : (
                  <OzetListeKarti
                    baslik={d.liste.hesaplar}
                    sutunAdi={d.liste.hesap}
                    satirlar={hesapSatirlari(hesaplar, tasinan, d)}
                    tumuHref={baglanti(REKLAM_YONETICISI, tasinan, {})}
                    sayac={d.liste.sayac(Math.min(OZET_SATIR, hesaplar.accounts.length), hesaplar.accounts.length, 'hesap')}
                    altNot={izlenmeyenNotu(hesaplar, d)}
                  />
                )}
                <EnCokHarcayanlarKarti
                  ilk={kampanyalar}
                  sorgu={base.toString()}
                  sinir={KAMPANYA_SINIRI}
                  paraBirimi={summary!.currency}
                  reklamYoneticisi={REKLAM_YONETICISI}
                  tasinanSorgu={tasinanSorgu.toString()}
                />
              </>
            ))}
        </div>

        <div className={s.sutun}>
          <Suspense fallback={<BekleyenIskelet dil={dil} />}>
            <BekleyenIslerKarti
              sonuc={bekleyenler}
              onayYetkisi={session.permissions.includes('strategy.approve')}
              dil={dil}
            />
          </Suspense>

          {/* Paket B: seçili workspace'in geçen haftası. Ajans görünümünde
              (workspace seçili değil) özet workspace başına, bağlantı yok. */}
          {session.activeClientId && session.permissions.includes('report.read') && (
            <HaftalikOzetBaglantisi clientId={session.activeClientId} />
          )}

          {butceGorunur && (
            <ButceKarti
              veri={butce}
              hata={butceHatasi}
              secimGerekli={butceK.tur === 'secimGerekli'}
              href={butceAdresi(butceWorkspaceId)}
              ayAdi={buAyAdi(dil)}
              dil={dil}
            />
          )}

          {veriVar && (
            <MecraDagilimi
              dilimler={mecraDilimleri({ sirketler, musteriler, hesaplar })}
              paraBirimi={summary!.currency}
            />
          )}

          {/* Her görünümde: sağ sütun soldan kısa kalıp boşluk bırakmasın (kullanıcı: "boşlukları doldur"). */}
          {veriVar && (
            <KapsamOzeti
              satirlar={kapsamSatirlari({ summary: summary!, sirketler, musteriler, kampanyalar, donusum, hesapHedefi }, d, dil)}
              baslik={d.kapsam.baslik}
            />
          )}

          {donusum !== null && <DonusumKarti detay={donusum} dil={dil} />}
        </div>
      </div>

      {/* Aralığın sınırı YALNIZCA bugün dâhil değilken; dâhilken başlık zaten söylüyor. */}
      {!range.incomplete && <p className={s.notKucuk}>{d.bugunDahilDegil}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HataKarti({ metin }: { metin: string }) {
  return (
    <section className={s.kart}>
      <p role="alert" className={s.hataMetin}>
        {metin}
      </p>
    </section>
  );
}

/** Akıllı Boost kısayolundaki bekleyen sayısı; sıfırsa rozet yok. */
async function BoostSayisi({ sonuc, dil }: { sonuc: Promise<BekleyenIslerSonucu>; dil: Dil }) {
  const r = boostRozeti(await sonuc, dil);
  if (!r) return null;
  return (
    <span
      className="inline-flex h-[22px] items-center rounded-md bg-surface-sunken px-2 text-[11.5px] font-bold tabular-nums text-ink-muted"
      title={r.baslik}
      aria-label={r.baslik}
    >
      {r.metin}
    </span>
  );
}

/**
 * Uyarılar TEK şeritte. Para birimi karışıksa tutarlar toplanmıyor;
 * izlenmeyen hesabın harcaması toplamdan çıkıyor ve söylenmezse "harcama
 * neden azaldı" sorulur.
 */
function bildirimler(summary: MetricsSummary, hesapHedefi: string | null, d: GB): Bildirim[] {
  const out: Bildirim[] = [];
  if (summary.hiddenAccounts > 0) {
    out.push({
      icerik: (
        <>
          <strong>{d.bildirim.izlenmiyor(summary.hiddenAccounts)}</strong>
          {d.bildirim.izlenmiyorDevam}
        </>
      ),
      ...(hesapHedefi ? { eylem: { etiket: d.bildirim.hesaplardaAc, href: hesapHedefi } } : {}),
    });
  }
  if (summary.currency === null && summary.byCurrency.length > 1) {
    out.push({
      icerik: (
        <>
          <strong>{d.bildirim.paraBirimi}</strong> ({summary.byCurrency.map((c) => c.currency).join(', ')}).{' '}
          {d.bildirim.paraBirimiDevam}
        </>
      ),
    });
  }
  return out;
}

/**
 * Dört kutu. Dördüncüsü gelir takip ediliyorsa ROAS, edilmiyorsa ERİŞİM:
 * form ve mesaj kampanyalarında gelir yok ve ROAS kutusu hep "—" olurdu.
 * Erişim çok günlü aralıkta GÜNLÜK ORTALAMA ve bu yazılıyor; dönemin tekil
 * kişi sayısı gibi okunmamalı.
 */
function performansMetrikleri(summary: MetricsSummary, karsilastir: boolean, d: GB, dil: Dil): PerformansMetrigi[] {
  const m = d.metrik;
  const prev = karsilastir ? summary.previous : null;
  const currency = summary.currency;
  const harcama =
    currency === null && summary.byCurrency.length > 1
      ? summary.byCurrency.map((c) => formatMoney(c.spendMicros, c.currency, { compact: true, dil })).join(' + ')
      : formatMoney(summary.spendMicros, currency, { dil });
  const dorduncu: PerformansMetrigi =
    summary.roas === null
      ? {
          anahtar: 'erisim',
          /*
           * ETİKETİN KENDİSİ "GÜNLÜK ORTALAMA" DİYOR, ipucu değil. Çok günlü
           * aralıkta bu sayı dönemin tekil kitlesi DEĞİL (günlük satırlardan
           * tekil kişi çıkmaz) ve "Erişim" başlığıyla durduğunda dönemin
           * kitlesi gibi okunuyordu; ipucu küçük yazıyla kayboluyordu. Dönemin
           * tekil erişimi raporda Meta'dan okunuyor; panelde her sayfa
           * yüklemesinde platforma çıkmak kota demek (DEVAM notu).
           */
          ad: summary.reach !== null && summary.reachKind === 'daily_average' ? m.gunlukErisim : m.erisim,
          deger: formatNumber(summary.reach, dil),
          degisim: null,
          ipucu:
            summary.reach === null
              ? m.bildirmiyor
              : summary.reachKind === 'daily_average'
                ? summary.reachAcrossAccounts
                  ? m.tekilDegilMukerrer
                  : m.tekilDegil
                : summary.reachAcrossAccounts
                  ? m.mukerrer
                  : undefined,
        }
      : {
          anahtar: 'roas',
          ad: m.roas,
          deger: formatRoas(summary.roas, dil),
          degisim: changePercent(summary.roas, prev?.roas),
        };
  return [
    {
      anahtar: 'harcama',
      ad: m.harcama,
      deger: harcama,
      degisim: prev ? changePercentMicros(summary.spendMicros, prev.spendMicros) : null,
    },
    {
      anahtar: 'donusum',
      ad: m.donusum,
      deger: formatNumber(summary.conversions, dil),
      degisim: prev ? changePercent(summary.conversions, prev.conversions) : null,
    },
    {
      anahtar: 'dbm',
      ad: m.dbm,
      deger: formatMoney(microsOf(summary.cpa), currency, { dil }),
      degisim: summary.cpa === null || !prev ? null : changePercent(summary.cpa, prev.cpa),
      ters: true,
      ipucu: summary.cpa === null ? m.sonucYok : undefined,
    },
    dorduncu,
  ];
}

function ikincilMetrikler(summary: MetricsSummary, karsilastir: boolean, dk: GB, dil: Dil): IkincilMetrik[] {
  const m = dk.metrik;
  const prev = karsilastir ? summary.previous : null;
  const c = summary.currency;
  const d = (a: number | null, b: number | null | undefined) =>
    a === null || !prev ? null : changePercent(a, b);
  return [
    { ad: m.gosterim, deger: formatNumber(summary.impressions, dil), degisim: d(summary.impressions, prev?.impressions) },
    { ad: m.tiklama, deger: formatNumber(summary.clicks, dil), degisim: d(summary.clicks, prev?.clicks) },
    { ad: m.tiklamaOrani, deger: formatPercent(summary.ctr, 2, dil), degisim: d(summary.ctr, prev?.ctr) },
    { ad: m.tbm, deger: formatMoney(microsOf(summary.cpc), c, { dil }), degisim: d(summary.cpc, prev?.cpc), ters: true },
    { ad: m.bgbm, deger: formatMoney(microsOf(summary.cpm), c, { dil }), degisim: d(summary.cpm, prev?.cpm), ters: true },
  ];
}

/** Pay: satırın harcamasının GELEN BÜTÜN satırların toplamına oranı (%). */
function paylar<T extends { spendMicros: string }>(rows: T[]): Array<T & { pay: number }> {
  const toplam = rows.reduce((a, r) => a + BigInt(r.spendMicros), 0n);
  return [...rows]
    .sort((a, b) => (BigInt(b.spendMicros) > BigInt(a.spendMicros) ? 1 : BigInt(b.spendMicros) < BigInt(a.spendMicros) ? -1 : 0))
    .map((r) => ({ ...r, pay: toplam === 0n ? 0 : Number((BigInt(r.spendMicros) * 1000n) / toplam) / 10 }));
}

function sirketSatirlari(rows: MetricsOrganizationRow[], d: GB): OzetSatiri[] {
  return paylar(rows)
    .slice(0, OZET_SATIR)
    .map((r) => ({
      id: r.organizationId,
      ad: r.name,
      alt:
        r.clientCount === 0
          ? d.liste.workspaceYok
          : `${d.liste.workspaceSayisi(r.clientCount)} · ${r.adAccountCount === 0 ? d.liste.izlemedeHesapYok : d.liste.hesapSayisi(r.adAccountCount)}`,
      gosterge: 'karo',
      spendMicros: r.spendMicros,
      pay: r.pay,
      donusum: r.conversions,
      dbmMicros: microsOf(r.cpa),
      paraBirimi: r.currency,
      eylem: { tur: 'org', id: r.organizationId },
    }));
}

function workspaceSatirlari(rows: MetricsClientRow[], d: GB): OzetSatiri[] {
  return paylar(rows)
    .slice(0, OZET_SATIR)
    .map((r) => ({
      id: r.clientId,
      ad: r.name,
      alt: r.adAccountCount === 0 ? d.liste.izlemedeHesapYok : d.liste.hesapSayisi(r.adAccountCount),
      gosterge: 'karo',
      spendMicros: r.spendMicros,
      pay: r.pay,
      donusum: r.conversions,
      dbmMicros: microsOf(r.cpa),
      paraBirimi: r.currency,
      eylem: { tur: 'client', id: r.clientId },
    }));
}

function hesapSatirlari(
  veri: MetricsAccountBreakdown,
  tasinan: Record<string, string | undefined>,
  d: GB,
): OzetSatiri[] {
  return paylar(veri.accounts)
    .slice(0, OZET_SATIR)
    .map((a) => ({
      id: a.adAccountId,
      ad: a.name,
      alt: `${PLATFORM_KISA_ADLARI[a.platform]} · ${a.externalId}${a.syncEnabled ? '' : d.liste.izlenmiyorEki}`,
      gosterge: a.syncEnabled ? 'yayinda' : 'durdu',
      spendMicros: a.spendMicros,
      pay: a.pay,
      donusum: a.conversions,
      dbmMicros: microsOf(a.cpa),
      paraBirimi: a.currency,
      // İZLENMEYEN HESAP BAĞLANTI DEĞİL: içi boş bir kampanya listesine götürürdü.
      eylem: a.syncEnabled
        ? {
            tur: 'link',
            href: baglanti(REKLAM_YONETICISI, tasinan, {
              platform: a.platform,
              hesap: a.adAccountId,
              seviye: 'campaign',
            }),
          }
        : null,
    }));
}

function izlenmeyenNotu(veri: MetricsAccountBreakdown, d: GB): string | undefined {
  const n = veri.accounts.filter((a) => !a.syncEnabled).length;
  return n > 0 ? d.liste.izlenmeyenNotu(n) : undefined;
}

/** Mecra dağılımı: hangi katmandaysak onun satırlarının platform kırılımı toplanıyor. */
function mecraDilimleri(v: {
  sirketler: MetricsOrganizationRow[] | null;
  musteriler: MetricsClientRow[] | null;
  hesaplar: MetricsAccountBreakdown | null;
}): Array<{ platform: Platform; spendMicros: string }> {
  const toplam = new Map<Platform, bigint>();
  const ekle = (p: Platform, m: string) => toplam.set(p, (toplam.get(p) ?? 0n) + BigInt(m));
  if (v.sirketler) v.sirketler.forEach((r) => r.byPlatform.forEach((p) => ekle(p.platform, p.spendMicros)));
  else if (v.musteriler) v.musteriler.forEach((r) => r.byPlatform.forEach((p) => ekle(p.platform, p.spendMicros)));
  else if (v.hesaplar) v.hesaplar.platforms.forEach((p) => ekle(p.platform, p.spendMicros));
  return PLATFORMS.filter((p) => toplam.has(p)).map((p) => ({ platform: p, spendMicros: toplam.get(p)!.toString() }));
}

function kapsamSatirlari(v: {
  summary: MetricsSummary;
  sirketler: MetricsOrganizationRow[] | null;
  musteriler: MetricsClientRow[] | null;
  kampanyalar: MetricsBreakdownRow[] | null;
  donusum: MetricsConversionDetail | null;
  /** İzlenmeyen hesapların evi — kapı kapalıysa `null` ve satır bağlantısız. */
  hesapHedefi: string | null;
}, d: GB, dil: Dil): Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }> {
  const k = d.kapsam;
  const sayi = (n: number) => formatNumber(n, dil);
  const out: Array<{ etiket: string; deger: string; uyari?: boolean; href?: string }> = [];
  if (v.sirketler) {
    out.push({ etiket: k.sirket, deger: sayi(v.sirketler.length) });
    out.push({
      etiket: k.harcayanSirket,
      deger: sayi(v.sirketler.filter((r) => r.spendMicros !== '0').length),
    });
    out.push({ etiket: k.workspace, deger: sayi(v.sirketler.reduce((a, r) => a + r.clientCount, 0)) });
  }
  if (v.musteriler) {
    out.push({ etiket: k.workspace, deger: sayi(v.musteriler.length) });
    out.push({
      etiket: k.harcayanWorkspace,
      deger: sayi(v.musteriler.filter((r) => r.spendMicros !== '0').length),
    });
  }
  out.push({ etiket: k.izlenenHesap, deger: sayi(v.summary.accountCount) });
  if (v.kampanyalar) {
    // Sınıra ulaştıysa sayı "en az": kesilen liste toplam gibi okunmasın.
    const n = v.kampanyalar.filter((r) => r.spendMicros !== '0').length;
    out.push({
      etiket: k.harcayanKampanya,
      deger: v.kampanyalar.length >= KAMPANYA_SINIRI ? k.enAz(sayi(n)) : sayi(n),
    });
  }
  if (v.donusum && v.donusum.satirlar.length > 0) {
    out.push({ etiket: k.donusumEylemi, deger: sayi(v.donusum.satirlar.length) });
  }
  if (v.summary.hiddenAccounts > 0) {
    out.push({
      etiket: k.izlenmeyenHesap,
      deger: sayi(v.summary.hiddenAccounts),
      uyari: true,
      ...(v.hesapHedefi ? { href: v.hesapHedefi } : {}),
    });
  }
  return out;
}

/** "Ekim" — bütçe kartının başlığı; ay anahtarıyla aynı saat dilimi (UTC). */
function buAyAdi(dil: Dil): string {
  const kod = bicimKodu(dil);
  const ad = new Date().toLocaleDateString(kod, { month: 'long', timeZone: 'UTC' });
  return ad.charAt(0).toLocaleUpperCase(kod) + ad.slice(1);
}
