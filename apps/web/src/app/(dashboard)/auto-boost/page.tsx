import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import {
  BOOST_METRIC_META,
  BOOST_STATUS_LABELS,
  MEDIA_TYPE_LABELS,
  type BoostRecord,
  type BoostRuleRecord,
  type BoostStatus,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatMoney, formatNumber, formatRelative } from '@/lib/format';
import { BoostDecision, RunBoostRuleButton } from '@/components/boost/boost-controls';
import { BildirimHavuzu } from '@/components/autoboost/bildirim-havuzu';
import { BoostOnAyariDugmesi } from '@/components/autoboost/boost-on-ayari';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { BosDurum, Serit } from '@/components/ui/hal';
import { dilAl } from '@/dil/sunucu';
import { boostSozlugu } from '@/dil/sozlukler/boost';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';
import { sec, type Dil } from '@advetics/shared';

/** Sekme başlığı istek anında: dil çerezden okunuyor (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/auto-boost', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

/**
 * Modül 7 — Akıllı Boost.
 *
 * ═══ EKRANIN ADI KENAR ÇUBUĞUYLA AYNI ═══
 *
 * Menüde "Akıllı Boost" yazıyordu, sayfa "Auto-Boost" açılıyordu. Aynı şeyin
 * iki adı olması kullanıcıya yanlış sayfaya düştüğünü düşündürüyor ve
 * "Auto-Boost" zaten Türkçe değil. Aynı sebeple "Bildirim Havuzu" başlığı da
 * kalktı: havuz bizim iç terimimiz, kullanıcının gördüğü şey yeni içerikler.
 *
 * SAYFANIN TAŞIDIĞI TEK MESAJ: buradaki her onay PARA TAAHHÜDÜ. Harcanacak
 * tutar her zaman onay düğmesinin ÜSTÜNDE yazıyor. Modül 5'ten farkı bu:
 * orada karar harcamayı DURDURUYORDU, burada BAŞLATIYOR.
 *
 * ═══ EKRAN SADELEŞTİ — ÜÇ YÜZEY KALDIRILDI ═══
 *
 * Kullanıcının tarifi "çok karışık ve kullanışsız" oldu ve sebebi ölçüldü:
 * aynı sayfada BEŞ ayrı eylem yüzeyi vardı ve üçü ya çalışmıyordu ya da
 * bildirim havuzuyla aynı işi ikinci kez yapıyordu.
 *
 *   · "Gönderi öne çıkar" — havuzla AYNI işi yapan ikinci bir yayın yolu.
 *     Aynı gönderi iki farklı yerden, iki farklı ekranla yayınlanabiliyordu.
 *   · "Onaylananları şimdi oluştur" — havuzdan onaylanan kart zaten anında
 *     yayınlanıyor; düğme neredeyse her zaman "0 boost oluşturuldu" diyordu.
 *   · "YouTube kanalı ekle" — kanal bağlama işi Platform Bağlantıları'na
 *     ait ve orada AYRI bir entegrasyon olarak kurulacak; boost ekranında
 *     durması, bağlantı kurulumunu boost yetkisinin yanına koyuyordu.
 *
 * Geriye TEK bir eylem yüzeyi kaldı: bildirim havuzu. Kural motorunun
 * adayları, kurallar ve geçmiş onun ALTINDA — üçü de okunacak şeyler,
 * yapılacak şeyler değil.
 */
export default async function AutoBoostPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const d = sec(boostSozlugu, dil).sayfa;
  const dk = sec(boostSozlugu, dil);

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.
  const clientId = sayfaWorkspaceId(session, first(params.musteri));

  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran={menuSatiriEtiketi('/auto-boost', dil)}
        neden={d.workspaceNeden}
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const canApprove = hasPermission(session, 'boost.approve');
  const canWrite = hasPermission(session, 'boost.write');

  /*
   * HATA YUTULMUYOR — ve buradaki ikinci yutma SESSİZDİ.
   *
   * `rules` çekimi düştüğünde `null` dönüyordu ve `{rules !== null && ...}`
   * koşulu bölümü hiç çizmiyordu: kuralları olan bir kullanıcı, kuralı
   * SİLİNMİŞ gibi bir ekran görüyordu ve hiçbir yerde tek bir kelime
   * yazmıyordu. Boost verisinin hatası ise görünüyordu ama sunucunun kendi
   * cümlesi atılıyordu — "Boost verisi alınamadı" kullanıcıyı sebebi kendi
   * kurulumunda aramaya gönderiyor.
   */
  const [boostSonuc, kuralSonuc] = await Promise.allSettled([
    serverApiFetch<BoostRecord[]>(`/boosts?clientId=${clientId}`),
    serverApiFetch<BoostRuleRecord[]>(`/boosts/rules?clientId=${clientId}`),
  ]);

  const boosts = boostSonuc.status === 'fulfilled' ? boostSonuc.value : null;
  const rules = kuralSonuc.status === 'fulfilled' ? kuralSonuc.value : null;

  /*
   * PARA BİRİMİ ₺ VARSAYILIYOR — ve burada "hesaptan geliyor" yazıyordu,
   * yanlıştı.
   *
   * Akıllı Boost'un bütün giriş alanları "Tutar (₺)" diyor (ön ayar formu,
   * kart düzenleme), yani kullanıcının yazdığı sayı ₺. Ekranda başka bir
   * birim göstermek, girdiğinden farklı bir sayı göstermek olurdu. Reklam
   * hesabı ₺ dışında bir para biriminde tutuluyorsa sorun burada DEĞİL,
   * girişte: o hâlde bütçe platforma yanlış birimde gidiyor. Bugün ajansın
   * bütün hesapları ₺ ve varsayım yazılı duruyor ki bir gün değiştiğinde
   * aranacak yer belli olsun.
   */
  const currency = 'TRY';
  const candidates = boosts?.filter((b) => b.status === 'candidate') ?? [];
  const others = boosts?.filter((b) => b.status !== 'candidate') ?? [];
  const pendingTotal = candidates.reduce((a, b) => a + BigInt(b.totalBudgetMicros), 0n);

  /*
   * GEÇMİŞ KESİLİYOR — VE KESİLDİĞİ YAZILIYOR.
   *
   * `/boosts` ucu LİMİTSİZ dönüyor ve burada her kayıt tam boy kart olarak
   * çiziliyordu: günde iki boost açan bir workspace'te sayfa bir yıl sonra
   * yüzlerce görselle açılıyor. Geçmiş OKUNACAK bir şey, yapılacak bir şey
   * değil; onay bekleyenler onun üstünde ve asıl iş orada.
   */
  const gecmisSiniri = 10;
  const gecmis = others.slice(0, gecmisSiniri);

  const clientName = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Workspace';

  return (
    <div className="space-y-5">
      {/*
        DEĞERLENDİRME SIKLIĞI BURADAN KALKTI. "günde iki kez" yalnızca
        KURAL motoru için doğru; yeni içerik kartları yayınlandığı anda
        düşüyor. İkisini tek cümlede söylemek, kartını bekleyen
        kullanıcıya akşamı beklettiriyordu. Sıklık artık kuralların
        başlığında.

        BAŞLIK SATIRINDA TEK DÜĞME: ön ayar. Kartın nasıl yayınlanacağını
        belirleyen tek yer orası ve sayfadaki diğer her şey onun sonucu.
      */}
      <SayfaBasligi
        bolum={menuBolumuEtiketi('/auto-boost', dil)}
        baslik={menuSatiriEtiketi('/auto-boost', dil)}
        aciklama={clientName}
        eylemler={canWrite ? <BoostOnAyariDugmesi clientId={clientId} canWrite={canWrite} /> : undefined}
      />

      {/*
        SAYFA İÇİ MÜŞTERİ ŞERİDİ KALDIRILDI — aktif workspace TEK BİR yerden
        seçiliyor: üst bardaki değiştirici.

        Burada bütün müşterileri listeleyen ikinci bir şerit vardı ve üst
        bardaki değiştiriciyle ÇAKIŞIYORDU: şeritten bir müşteriye geçmek
        adrese `?musteri=` yazıyor, sayfalar ise aktif müşteriyi
        `params.musteri ?? session.activeClientId` sırasıyla çözüyor — yani
        URL cookie'yi eziyordu. Üst bar "Ege Birlik Yapı" yazarken gövde
        Fenbay'ın verisini gösteriyordu. Sızıntı DEĞİLDİ ama sızıntıdan
        ayırt edilemeyecek kadar kötü bir hâl.
      */}

      {/*
        ═══ SAYFANIN SIRASI: ÖNCE YAPILACAK İŞ, SONRA OKUNACAK ŞEYLER ═══

        1. YENİ İÇERİKLER  — yayınlanır yayınlanmaz düşen kartlar
        2. KURALIN SEÇTİKLERİ — performansa bakıp seçilen adaylar
        3. KURALLAR        — seçimi kimin yaptığı
        4. GEÇMİŞ          — ne olmuş

        İlk ikisi de onay kuyruğu ve eskiden ikisi de yalnızca "onay
        bekliyor" diyordu: bir gönderinin neden birinde olup diğerinde
        olmadığı hiçbir yerde yazmıyordu. Başlıklar artık KAYNAĞI söylüyor.
      */}
      <BildirimHavuzu clientId={clientId} canWrite={canWrite} />

      {boosts === null ? (
        <Serit ton="hata" baslik={d.boostListesiOkunamadi}>
          {hataMetni(boostSonuc, dk.sunucuyaUlasilamadi)}
        </Serit>
      ) : (
        candidates.length > 0 && (
          <section className="rounded-kart border border-line bg-surface-muted p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/*
                BAŞLIK ARTIK KAYNAĞI SÖYLÜYOR.

                Eski hâli "{n} gönderi onay bekliyor" idi ve bu cümle ÜSTTEKİ
                kartlar için de birebir doğruydu: aynı ekranda iki ayrı onay
                kuyruğu vardı ve ikisi de aynı şeyi söylüyordu. Kullanıcı bir
                gönderinin neden bu listede olup diğerinde olmadığını
                okuyamıyordu. Üstteki kartlar YENİ YAYINLANAN içerikler,
                buradakiler ise kuralın performansa bakıp seçtikleri.
              */}
              <h2 className="text-sm font-semibold text-ink">
                {d.kuralinSectikleri}
                <span className="ml-2 font-normal text-ink-muted">{d.gonderi(candidates.length)}</span>
              </h2>
              {/* TOPLAM TAAHHÜT ÜSTTE. Tek tek onaylarken kaç para
                  bağlandığını görmek, her karardan sonra hesap yapmaktan
                  daha güvenilir. */}
              <span className="text-sm text-ink-muted">
                {d.toplamTutar(formatMoney(pendingTotal.toString(), currency, { dil }))}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {candidates.map((b) => (
                <BoostCard key={b.id} boost={b} currency={currency} canApprove={canApprove} dil={dil} />
              ))}
            </div>
          </section>
        )
      )}

      {/*
        KURAL LİSTESİ OKUNAMADIYSA SÖYLENİYOR. Bölümü çizmemek, kuralı olan
        kullanıcıya kuralı silinmiş gibi bir ekran gösteriyordu.
      */}
      {rules === null ? (
        <Serit ton="hata" baslik={d.kurallarOkunamadi}>
          {hataMetni(kuralSonuc, dk.sunucuyaUlasilamadi)}
        </Serit>
      ) : (
        <RuleList rules={rules} currency={currency} canWrite={canWrite} dil={dil} />
      )}

      {gecmis.length > 0 && (
        <section className="overflow-hidden rounded-kart border border-line bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{d.gecmis}</h2>
            {/* SESSİZ KESME YOK: kaç tanesi gösteriliyor ve toplam kaç. */}
            <span className="text-[11px] text-ink-muted">
              {others.length > gecmis.length
                ? d.gecmisKesik(gecmis.length, others.length)
                : d.boostSayisi(others.length)}
            </span>
          </div>
          <ul className="divide-y divide-line/60">
            {gecmis.map((b) => (
              <GecmisSatiri key={b.id} boost={b} currency={currency} dil={dil} />
            ))}
          </ul>
        </section>
      )}

      {boosts !== null && boosts.length === 0 && rules !== null && rules.length === 0 && (
        <EmptyState dil={dil} />
      )}
    </div>
  );
}

function BoostCard({
  boost,
  currency,
  canApprove,
  dil,
}: {
  boost: BoostRecord;
  currency: string | null;
  canApprove: boolean;
  dil: Dil;
}) {
  const d = sec(boostSozlugu, dil).sayfa;
  const p = boost.post;
  return (
    <div className="flex flex-wrap gap-3 rounded-kart border border-line bg-surface p-3 sm:flex-nowrap">
      {p.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.thumbnailUrl}
          alt=""
          loading="lazy"
          /* Beyaz etiket alan adını Meta'ya sızdırmamak için — kreatif
             kartında baştan beri var, burada eksikti. */
          referrerPolicy="no-referrer"
          className="h-24 w-24 shrink-0 rounded-alan bg-surface-sunken object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-alan bg-surface-sunken text-[11px] text-ink-muted">
          {MEDIA_TYPE_LABELS[p.mediaType]}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={boost.status} />
          <span className="text-[11px] text-ink-muted">
            {p.socialProfileName} · {formatRelative(p.publishedAt, dil)}
          </span>
          {p.permalink && (
            <a
              href={p.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-brand-strong hover:underline"
            >
              {d.gonderiyiAc}
            </a>
          )}
        </div>

        {p.message && (
          <p className="mt-1 line-clamp-2 text-sm text-ink">{p.message}</p>
        )}

        {/* ORGANİK PERFORMANS — onay kararının dayanağı.
            Kuralın gerekçesi tek bir metriği anıyor; burada tam tablo var
            ki onaylayan kişi kuralın kararını doğrulayabilsin. */}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          <Stat label={BOOST_METRIC_META.reach.label} value={formatNumber(p.reach, dil)} />
          <Stat label={BOOST_METRIC_META.engagements.label} value={formatNumber(p.engagements, dil)} />
          <Stat
            label={BOOST_METRIC_META.engagement_rate.label}
            value={
              p.engagementRate === null
                ? '—'
                : yuzde(p.engagementRate, dil)
            }
          />
          <Stat label={d.yorum} value={formatNumber(p.comments, dil)} />
          <Stat label={d.paylasim} value={formatNumber(p.shares, dil)} />
        </dl>

        <p className="mt-1.5 text-[11px] text-ink-muted">
          <span className="font-medium text-ink">{d.secilmeSebebi}</span> {boost.reason}
          {boost.boostRuleName && ` (${boost.boostRuleName})`}
        </p>

        {/*
          BÜTÇE KİPE GÖRE YAZILIYOR.

          Toplam bütçeli boost'ta (elle boost — K18) günlük bütçe diye bir sayı
          YOK: Meta parayı eşit bölmüyor ve "—/gün × 5 gün" yazmak kullanıcıya
          hesaplanabilir bir şey varmış izlenimi verirdi.
        */}
        <p className="mt-1 text-[11px] text-ink-muted">
          {boost.budgetMode === 'lifetime' ? (
            <>
              <strong className="text-ink">
                {formatMoney(boost.totalBudgetMicros, currency, { dil })}
              </strong>{' '}
              {d.toplamGun(boost.durationDays)}
            </>
          ) : (
            <>
              {d.gunlukCarpim(formatMoney(boost.dailyBudgetMicros, currency, { dil }), boost.durationDays)}{' '}
              <strong className="text-ink">
                {formatMoney(boost.totalBudgetMicros, currency, { dil })}
              </strong>
            </>
          )}{' '}
          · {boost.adAccountName}
        </p>

        {boost.error && (
          <p className="mt-1.5 rounded-alan bg-danger-soft px-2 py-1 text-[11px] text-danger-strong">
            {boost.error}
          </p>
        )}

        {canApprove && (
          <div className="mt-2.5">
            <BoostDecision boost={boost} currency={currency} />
          </div>
        )}
      </div>
    </div>
  );
}

function RuleList({
  rules,
  currency,
  canWrite,
  dil,
}: {
  rules: BoostRuleRecord[];
  currency: string | null;
  canWrite: boolean;
  dil: Dil;
}) {
  const d = sec(boostSozlugu, dil).sayfa;
  if (rules.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-kart border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{d.kurallar}</h2>
        {/*
          SIKLIK KURALIN YANINDA, SAYFA BAŞLIĞINDA DEĞİL. Başlıkta dururken
          bütün ekran için geçerli gibi okunuyordu; oysa yeni içerik kartları
          yayınlandığı anda düşüyor ve yalnızca kurallar günde iki kez
          değerlendiriliyor.
        */}
        <p className="mt-0.5 text-[11px] text-ink-muted">{d.kuralZamani}</p>
      </div>
      <div className="divide-y divide-line/60">
        {rules.map((r) => {
          const cap = BigInt(r.monthlyCapMicros);
          const used = BigInt(r.committedThisMonthMicros);
          const pct = cap > 0n ? Number((used * 100n) / cap) : 0;
          return (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-ink">{r.name}</h3>
                {!r.enabled && <Rozet hal="dur">{d.kapali}</Rozet>}
                {r.autoApprove && (
                  // OTOMATİK ONAY GÖRÜNÜR OLMALI: bu kural insan onayı
                  // beklemeden para taahhüt ediyor. Durum değil uyarı: kırmızı
                  // yazılı hap, nokta yok (bir hata ya da canlı yayın değil).
                  <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full border border-line-strong px-2.5 text-12 font-bold text-danger-strong">
                    {d.otomatikOnay}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-ink-muted">{describe(r, dil)}</p>

              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[11px] text-ink-muted">
                  <span>
                    {d.aylikTavan} {formatMoney(r.committedThisMonthMicros, currency, { dil })} /{' '}
                    {formatMoney(r.monthlyCapMicros, currency, { dil })}
                  </span>
                  <span>%{pct}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    /* YEŞİL YOK: yeşil yalnız durum noktası (kılavuz). Doluluk
                       siyah, tavan dolunca kırmızı. */
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'bg-ink'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-ink-muted">
                {r.socialProfileName ?? d.tumProfiller} ·{' '}
                {r.lastRunAt ? d.sonCalisma(formatRelative(r.lastRunAt, dil)) : d.henuzCalismadi}
              </p>

              {canWrite && (
                <div className="mt-2">
                  <RunBoostRuleButton ruleId={r.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function describe(r: BoostRuleRecord, dil: Dil): string {
  const d = sec(boostSozlugu, dil).sayfa;
  const parts = r.conditions.map(
    (c) =>
      `${BOOST_METRIC_META[c.metric].label} ${c.operator === 'gte' ? '≥' : '>'} ${c.value}${
        BOOST_METRIC_META[c.metric].unit === 'percent' ? '%' : ''
      }`,
  );
  const joined = parts.join(r.combinator === 'and' ? d.ve : d.veya);
  return d.kuralCumlesi(r.minPostAgeHours, r.maxPostAgeHours, joined, r.durationDays);
}

/*
 * DURUM ROZETİ (`Rozet`): renk dört hâlle sınırlı. Yeşil YALNIZ "şu an
 * harcıyor" (active).
 */
const DURUM_HALI: Record<BoostStatus, DurumHali> = {
  candidate: 'taslak',
  approved: 'taslak',
  rejected: 'taslak',
  creating: 'taslak',
  active: 'ok',
  // SÜRESİ DOLMUŞ boost NÖTR — yeşil değil. Yeşil "şu an harcıyor" demek ve
  // biten bir kampanyayı öyle göstermek, aylık harcamayı gözle toplayan
  // birine yanlış sayı verdirirdi.
  completed: 'taslak',
  // DURAKLATILMIŞ boost KARE noktalı, biten boostla aynı DEĞİL: yapılacak bir
  // iş var — ya sürdürülecek ya iptal edilecek. Biten bir boostla aynı
  // görünmek, unutulmuş bir kampanyayı görünmez yapardı.
  paused: 'dur',
  failed: 'hata',
};

function StatusChip({ status }: { status: BoostStatus }) {
  return <Rozet hal={DURUM_HALI[status]}>{BOOST_STATUS_LABELS[status]}</Rozet>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-ink-muted">{label}:</span>{' '}
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

function EmptyState({ dil }: { dil: Dil }) {
  const d = sec(boostSozlugu, dil).sayfa;
  return (
    <BosDurum
      baslik={d.bosBaslik}
      neden={
        <>
          {d.bosNedenBas}
          <strong>{d.bosNedenVurgu}</strong>
          {d.bosNedenSon}
        </>
      }
    />
  );
}

/**
 * Düşen isteğin SEBEBİ — sunucunun kendi cümlesi.
 *
 * "Veri alınamadı" kullanıcıyı sebebi kendi kurulumunda aramaya gönderiyor;
 * oysa mesaj çoğu zaman doğrudan söylüyor (yetki yok, workspace bulunamadı).
 */
function hataMetni(sonuc: PromiseSettledResult<unknown>, ulasilamadi: string): string {
  if (sonuc.status === 'fulfilled') return '';
  return sonuc.reason instanceof ApiRequestError ? sonuc.reason.message : ulasilamadi;
}

/**
 * GEÇMİŞ SATIRI — tam boy kart DEĞİL.
 *
 * Geçmişteki her boost, onay bekleyenlerle aynı kartla çiziliyordu: 96
 * piksellik görsel, beş metrik, seçilme sebebi, bütçe dökümü. Ama geçmişte
 * verilecek bir karar yok; okunan şey "ne, ne zaman, ne kadar, sonuç ne".
 * Aynı görsel ağırlığı vermek, sayfanın asıl işini (onay) geçmişin içinde
 * kaybediyordu.
 */
function GecmisSatiri({ boost, currency, dil }: { boost: BoostRecord; currency: string | null; dil: Dil }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {boost.post.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={boost.post.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-9 w-9 shrink-0 rounded-md bg-surface-sunken object-cover"
        />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-md bg-surface-sunken" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">
          {boost.post.message || boost.post.socialProfileName}
        </p>
        <p className="text-[11px] text-ink-muted">
          {boost.post.socialProfileName} · {formatRelative(boost.createdAt, dil)} ·{' '}
          {formatMoney(boost.totalBudgetMicros, currency, { dil })}
        </p>
        {/* HATA SATIRDA KALIYOR: başarısız bir boost'un sebebini görmek için
            başka bir ekrana gitmek gerekmemeli. */}
        {boost.error && <p className="mt-0.5 text-[11px] text-danger">{boost.error}</p>}
      </div>

      <StatusChip status={boost.status} />
    </li>
  );
}

/** `%12,5` (TR) / `12.5%` (EN): en çok iki ondalık, sondaki sıfırlar atılır. */
function yuzde(n: number, dil: Dil): string {
  const s = n.toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR', { maximumFractionDigits: 2 });
  return dil === 'en' ? `${s}%` : `%${s}`;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
