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

export const metadata = { title: 'Akıllı Boost · Advetics' };
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

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir workspace seç</h1>
        <p className="mt-2 text-sm text-ink-muted">Akıllı Boost workspace bazında çalışıyor.</p>
      </div>
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Akıllı Boost</h1>
          {/*
            DEĞERLENDİRME SIKLIĞI BURADAN KALKTI. "günde iki kez" yalnızca
            KURAL motoru için doğru; yeni içerik kartları yayınlandığı anda
            düşüyor. İkisini tek cümlede söylemek, kartını bekleyen
            kullanıcıya akşamı beklettiriyordu. Sıklık artık kuralların
            başlığında.
          */}
          <p className="mt-0.5 text-sm text-ink-muted">{clientName}</p>
        </div>
        {/*
          BAŞLIK SATIRINDA TEK DÜĞME: ön ayar. Kartın nasıl yayınlanacağını
          belirleyen tek yer orası ve sayfadaki diğer her şey onun sonucu.
        */}
        {canWrite && <BoostOnAyariDugmesi clientId={clientId} canWrite={canWrite} />}
      </header>


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
        <Notice tone="error">
          <strong>Boost listesi okunamadı.</strong> {hataMetni(boostSonuc)}
        </Notice>
      ) : (
        candidates.length > 0 && (
          <section className="rounded-xl border border-warn/30 bg-warn-soft/50 p-4">
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
                Kuralın seçtikleri
                <span className="ml-2 font-normal text-ink-muted">{candidates.length} gönderi</span>
              </h2>
              {/* TOPLAM TAAHHÜT ÜSTTE. Tek tek onaylarken kaç para
                  bağlandığını görmek, her karardan sonra hesap yapmaktan
                  daha güvenilir. */}
              <span className="text-sm text-ink-muted">
                toplam {formatMoney(pendingTotal.toString(), currency)}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {candidates.map((b) => (
                <BoostCard key={b.id} boost={b} currency={currency} canApprove={canApprove} />
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
        <Notice tone="error">
          <strong>Kurallar okunamadı.</strong> {hataMetni(kuralSonuc)}
        </Notice>
      ) : (
        <RuleList rules={rules} currency={currency} canWrite={canWrite} />
      )}

      {gecmis.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Geçmiş</h2>
            {/* SESSİZ KESME YOK: kaç tanesi gösteriliyor ve toplam kaç. */}
            <span className="text-[11px] text-ink-muted">
              {others.length > gecmis.length
                ? `son ${gecmis.length} · toplam ${others.length}`
                : `${others.length} boost`}
            </span>
          </div>
          <ul className="divide-y divide-line/60">
            {gecmis.map((b) => (
              <GecmisSatiri key={b.id} boost={b} currency={currency} />
            ))}
          </ul>
        </section>
      )}

      {boosts !== null && boosts.length === 0 && rules !== null && rules.length === 0 && (
        <EmptyState />
      )}
    </div>
  );
}

function BoostCard({
  boost,
  currency,
  canApprove,
}: {
  boost: BoostRecord;
  currency: string | null;
  canApprove: boolean;
}) {
  const p = boost.post;
  return (
    <div className="flex flex-wrap gap-3 rounded-xl bg-surface p-3 sm:flex-nowrap">
      {p.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.thumbnailUrl}
          alt=""
          loading="lazy"
          /* Beyaz etiket alan adını Meta'ya sızdırmamak için — kreatif
             kartında baştan beri var, burada eksikti. */
          referrerPolicy="no-referrer"
          className="h-24 w-24 shrink-0 rounded-lg bg-surface-sunken object-cover"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[11px] text-ink-muted">
          {MEDIA_TYPE_LABELS[p.mediaType]}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={boost.status} />
          <span className="text-[11px] text-ink-muted">
            {p.socialProfileName} · {formatRelative(p.publishedAt)}
          </span>
          {p.permalink && (
            <a
              href={p.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-brand-strong hover:underline"
            >
              Gönderiyi aç
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
          <Stat label={BOOST_METRIC_META.reach.label} value={formatNumber(p.reach)} />
          <Stat label={BOOST_METRIC_META.engagements.label} value={formatNumber(p.engagements)} />
          <Stat
            label={BOOST_METRIC_META.engagement_rate.label}
            value={
              p.engagementRate === null
                ? '—'
                : `%${p.engagementRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`
            }
          />
          <Stat label="Yorum" value={formatNumber(p.comments)} />
          <Stat label="Paylaşım" value={formatNumber(p.shares)} />
        </dl>

        <p className="mt-1.5 text-[11px] text-ink-muted">
          <span className="font-medium text-ink">Seçilme sebebi:</span> {boost.reason}
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
                {formatMoney(boost.totalBudgetMicros, currency)}
              </strong>{' '}
              toplam · {boost.durationDays} gün
            </>
          ) : (
            <>
              {formatMoney(boost.dailyBudgetMicros, currency)}/gün × {boost.durationDays} gün
              ={' '}
              <strong className="text-ink">
                {formatMoney(boost.totalBudgetMicros, currency)}
              </strong>
            </>
          )}{' '}
          · {boost.adAccountName}
        </p>

        {boost.error && (
          <p className="mt-1.5 rounded-lg bg-danger-soft px-2 py-1 text-[11px] text-danger-strong">
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
}: {
  rules: BoostRuleRecord[];
  currency: string | null;
  canWrite: boolean;
}) {
  if (rules.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Boost kuralları</h2>
        {/*
          SIKLIK KURALIN YANINDA, SAYFA BAŞLIĞINDA DEĞİL. Başlıkta dururken
          bütün ekran için geçerli gibi okunuyordu; oysa yeni içerik kartları
          yayınlandığı anda düşüyor ve yalnızca kurallar günde iki kez
          değerlendiriliyor.
        */}
        <p className="mt-0.5 text-[11px] text-ink-muted">Her gün 08:30 ve 20:30'da çalışıyor.</p>
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
                {!r.enabled && <Chip cls="bg-surface-sunken text-ink-muted ring-line">Kapalı</Chip>}
                {r.autoApprove && (
                  // OTOMATİK ONAY GÖRÜNÜR OLMALI: bu kural insan onayı
                  // beklemeden para taahhüt ediyor.
                  <Chip cls="bg-warn-soft text-warn-strong ring-warn/30">Otomatik onay</Chip>
                )}
              </div>

              <p className="mt-1 text-sm text-ink-muted">{describe(r)}</p>

              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[11px] text-ink-muted">
                  <span>
                    Aylık tavan: {formatMoney(r.committedThisMonthMicros, currency)} /{' '}
                    {formatMoney(r.monthlyCapMicros, currency)}
                  </span>
                  <span>%{pct}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'bg-ok'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>

              <p className="mt-1.5 text-[11px] text-ink-muted">
                {r.socialProfileName ?? 'Tüm profiller'} ·{' '}
                {r.lastRunAt ? `son çalışma ${formatRelative(r.lastRunAt)}` : 'henüz çalışmadı'}
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

function describe(r: BoostRuleRecord): string {
  const parts = r.conditions.map(
    (c) =>
      `${BOOST_METRIC_META[c.metric].label} ${c.operator === 'gte' ? '≥' : '>'} ${c.value}${
        BOOST_METRIC_META[c.metric].unit === 'percent' ? '%' : ''
      }`,
  );
  const joined = parts.join(r.combinator === 'and' ? ' VE ' : ' VEYA ');
  return `${r.minPostAgeHours}–${r.maxPostAgeHours} saatlik gönderilerden ${joined} olanları ${r.durationDays} gün boost et.`;
}

const STATUS_TONE: Record<BoostStatus, string> = {
  candidate: 'bg-warn-soft text-warn-strong ring-warn/30',
  approved: 'bg-info-soft text-info-strong ring-info/30',
  rejected: 'bg-surface-sunken text-ink-muted ring-line',
  creating: 'bg-info-soft text-info-strong ring-info/30',
  active: 'bg-ok-soft text-ok-strong ring-ok/30',
  // SÜRESİ DOLMUŞ boost NÖTR renkte — yeşil değil. Yeşil "şu an harcıyor"
  // demek ve biten bir kampanyayı öyle göstermek, aylık harcamayı gözle
  // toplayan birine yanlış sayı verdirirdi.
  completed: 'bg-surface-sunken text-ink-muted ring-line',
  // DURAKLATILMIŞ boost UYARI renginde, nötr DEĞİL: yapılacak bir iş var —
  // ya sürdürülecek ya iptal edilecek. Biten bir boostla aynı renkte
  // göstermek, unutulmuş bir kampanyayı görünmez yapardı.
  paused: 'bg-warn-soft text-warn-strong ring-warn/30',
  failed: 'bg-danger-soft text-danger-strong ring-danger/30',
};

function StatusChip({ status }: { status: BoostStatus }) {
  return <Chip cls={STATUS_TONE[status]}>{BOOST_STATUS_LABELS[status]}</Chip>;
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-ink-muted">{label}:</span>{' '}
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz boost kuralı yok</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
        Auto-Boost, iyi giden organik gönderileri bulup reklama çevirir. Kural gönderiyi
        seçer, sen onaylarsın, sistem kampanyayı açar.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">
        Her aday <strong>onay bekler</strong> ve onay düğmesinde taahhüt edilecek toplam
        tutar yazar. Kuralın aylık bir harcama tavanı var; tavan dolduğunda yeni aday
        üretilmez.
      </p>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'error'
      ? 'bg-danger-soft text-danger-strong ring-danger/30'
      : 'bg-warn-soft text-warn-strong ring-warn/30';
  return (
    // Hata satırı ekran okuyucuya da duyuruluyor; uyarı yalnızca durum.
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cls}`}
    >
      {children}
    </div>
  );
}

/**
 * Düşen isteğin SEBEBİ — sunucunun kendi cümlesi.
 *
 * "Veri alınamadı" kullanıcıyı sebebi kendi kurulumunda aramaya gönderiyor;
 * oysa mesaj çoğu zaman doğrudan söylüyor (yetki yok, workspace bulunamadı).
 */
function hataMetni(sonuc: PromiseSettledResult<unknown>): string {
  if (sonuc.status === 'fulfilled') return '';
  return sonuc.reason instanceof ApiRequestError
    ? sonuc.reason.message
    : 'Sunucuya ulaşılamadı.';
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
function GecmisSatiri({ boost, currency }: { boost: BoostRecord; currency: string | null }) {
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
          {boost.post.socialProfileName} · {formatRelative(boost.createdAt)} ·{' '}
          {formatMoney(boost.totalBudgetMicros, currency)}
        </p>
        {/* HATA SATIRDA KALIYOR: başarısız bir boost'un sebebini görmek için
            başka bir ekrana gitmek gerekmemeli. */}
        {boost.error && <p className="mt-0.5 text-[11px] text-danger">{boost.error}</p>}
      </div>

      <StatusChip status={boost.status} />
    </li>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
