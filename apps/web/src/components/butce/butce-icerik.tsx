import type { BudgetPacing, ClientPacing } from '@advetics/shared';
import { requireSession, hasPermission } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatDayLong, formatMoney } from '@/lib/format';
import { BudgetForm } from '@/components/budget/budget-form';
import { PaceDelta, PacingBar, StatusChip } from '@/components/budget/pacing-bar';
import { butceAdresi } from '@/lib/butce-adresi';
import { PLATFORMS, PLATFORM_KISA_ADLARI, platformKanali } from '@advetics/shared';
import { PlatformLogo } from '@/components/platform-logo';
import { BolumluBaglantilar } from '@/components/suzgec-menusu';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { MetrikKutulari } from '@/components/ui/metrik-kutulari';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';


/**
 * Modül 5 — Aylık bütçe tablosu.
 *
 * AY SEÇİMİ TAKVİMSEL, panelin kayan aralıkları gibi değil. Bütçe aylık
 * tanımlanan bir taahhüt: "son 30 gün bütçesi" diye bir şey yok.
 *
 * GELECEK AY DA SEÇİLEBİLİYOR. Ajans ayın 25'inde gelecek ayın bütçesini
 * planlıyor; yalnızca geçmişi göstermek aracı planlama için kullanılamaz
 * kılardı.
 *
 * İKİ SEVİYE AYNI SAYFADA: müşteri geneli şemsiye bütçe üstte, proje/hesap
 * bazlı bütçeler tabloda. Bir müşterinin birden fazla projesi olabiliyor ve
 * ajans hem toplamı hem kırılımı izliyor.
 */
/**
 * PLANLA › AYLIK BÜTÇE (2026-10-09, kullanıcı: "bütçe Planla'da olsun").
 * 2026-10-06'dan beri Marka Merkezi'nin bir bölümüydü; bütçe bir PLAN
 * kararı ve AdvStrategy ile aynı bölümde durması, ikisinin aynı ayın
 * parasını konuştuğunu menüde de gösteriyor. Eski `?bolum=butce` adresi
 * buraya yönleniyor. Workspace kapısı sayfada (`/butce`).
 */
export async function ButceIcerik({
  clientId,
  params,
  baslik,
}: {
  clientId: string;
  params: Record<string, string | string[] | undefined>;
  /** Sayfa başlığı BURADA çiziliyor: birincil eylem ayın verisini istiyor. */
  baslik: { baslik: string; aciklama: string };
}) {
  const session = await requireSession();

  const months = selectableMonths();
  const selected = months.find((m) => m.key === first(params.ay)) ?? months.find((m) => m.current)!;


  const canWrite = hasPermission(session, 'budget.write');
  const qs = new URLSearchParams({ clientId, month: selected.key });
  /*
   * HATA METNİ SUNUCUDAN. Burada `.catch(() => null)` vardı ve her düşüş
   * "API çalışıyor mu? pm2 logs…" cümlesine çevriliyordu: müşteriye sunucu
   * komutu gösteriyor, asıl sebebi (yetki, workspace, sunucu) gizliyordu.
   */
  const okuma = await serverApiFetch<ClientPacing>(`/budgets/pacing?${qs}`).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' }),
  );
  const data = okuma.ok ? okuma.v : null;

  const linkWith = (over: { ay?: string }): string => butceAdresi(clientId, { ay: over.ay ?? selected.key });

  const clientName =
    session.availableClients.find((c) => c.id === clientId)?.name ?? 'Workspace';

  /*
   * BAŞLIKTA BİRİNCİL "Bütçeyi düzenle" (onaylı taslak `#butce`): workspace
   * geneli (şemsiye) bütçenin yan paneli. Kartın başlığındaki ikinci tetik
   * kalktı; aynı formu iki yerden açmak "hangisi asıl" sorusunu doğuruyordu.
   * Veri okunamadıysa düğme YOK: mevcut bütçeyi bilmeden açılan form boş
   * gelir ve "Kaydet" var olan tutarın üzerine yazar.
   */
  const birincil =
    canWrite && data ? (
      <BudgetForm
        clientId={clientId}
        adAccountId={null}
        adAccountName={null}
        month={selected.key}
        existing={data.overall.budget}
        currency={data.overall.budget?.currency ?? data.currency}
        tetik={{
          ton: 'birincil',
          boyut: 'orta',
          metin: data.overall.budget ? 'Bütçeyi düzenle' : 'Bütçe tanımla',
        }}
      />
    ) : undefined;

  return (
    <div className="grid gap-5">
      <SayfaBasligi baslik={baslik.baslik} aciklama={baslik.aciklama} eylemler={birincil} />
      {/*
        AY SEÇİMİ BÖLÜMLÜ SEÇİCİ (onaylı taslak `#butce`): aynı verinin ay ay
        görünümü, sayfa değil. Bağlantı olarak: ay adreste taşınıyor ve
        sayfa sunucuda çiziliyor. Gelecek ay "plan" etiketiyle.
      */}
      <div className="flex flex-wrap items-center gap-2.5">
        <BolumluBaglantilar
          etiket="Ay"
          secenekler={months.map((m) => ({
            href: linkWith({ ay: m.key }),
            etiket: m.future ? `${m.short} · plan` : m.short,
            secili: m.key === selected.key,
          }))}
        />
        <span className="text-12 text-ink-muted">
          <strong className="font-semibold text-ink">{clientName}</strong> · {selected.label}
        </span>
      </div>

      {data === null ? (
        <HataDurumu baslik="Bütçe verisi alınamadı" mesaj={okuma.ok ? 'Sunucu sebep bildirmedi.' : okuma.hata} />
      ) : (
        <>
          <Warnings pacing={data} />

          <OverallCard pacing={data.overall} currency={data.currency} future={selected.future} />

          <AccountTable data={data} month={selected.key} canWrite={canWrite} />
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Uyarılar — veriyi olduğundan iyi göstermemek için
// -----------------------------------------------------------------------------

function Warnings({ pacing }: { pacing: ClientPacing }) {
  const o = pacing.overall;
  const notices: React.ReactNode[] = [];

  if (o.excludedCurrencies.length > 0) {
    notices.push(
      <Serit key="fx" baslik={`Farklı para birimindeki harcama toplama dâhil edilmedi (${o.excludedCurrencies.join(', ')})`}>
        Kur çevrimi henüz yok; karışık bir toplamı bütçeyle karşılaştırmak yanıltıcı olurdu. O hesapları tabloda
        ayrı ayrı görebilirsin.
      </Serit>,
    );
  }

  // VERİ KAPSAMASI. Eksik gün, harcamayı olduğundan düşük gösteriyor ve
  // pacing "yavaş gidiyoruz" diyor. Bunu söylemeden bırakmak, ajansın
  // bütçeyi artırmasına yol açabilirdi.
  if (o.daysElapsed > 0 && o.daysWithData > 0 && o.daysWithData < o.daysElapsed) {
    notices.push(
      <Serit key="coverage" baslik={`Eksik veri: ${o.daysElapsed} günün ${o.daysWithData} günü senkronize`}>
        Harcama ve tüketim oranı olduğundan düşük görünüyor. Eksik günler çekilene kadar bu sayfadaki hız yorumu
        güvenilir değil.
      </Serit>,
    );
  }

  // BUGÜNKÜ GÜNLÜK BÜTÇELERLE AY SONU: geçmiş hız ay ortasında artırılan
  // bütçeyi görmüyor. Uyarı yalnız aşımda; ömür boyu bütçeler toplamda yok
  // ve bu da söyleniyor.
  const as = pacing.gunlukButceAySonu;
  if (as?.asimMicros && o.budget) {
    const cur = o.budget.currency;
    notices.push(
      <Serit key="aysonu" ton="uyari" baslik={`Bugünkü günlük bütçelerle ay sonunda yaklaşık ${formatMoney(as.aySonuMicros, cur)} harcanır; aylık bütçe ${formatMoney(as.asimMicros, cur)} aşılır`}>
        Yayındaki günlük bütçelerin toplamı {formatMoney(as.gunlukToplamMicros, cur)}. Meta bir günde %75&apos;e, Google 2 katına kadar fazla
        harcayabilir; ay toplamı yine de bu bütçelere bağlı.
        {as.omurBoyuSayisi > 0 && ` Ömür boyu bütçeli ${as.omurBoyuSayisi} kampanya bu hesaba katılmadı.`}
      </Serit>,
    );
  }

  if (o.alertTriggered && o.budget) {
    notices.push(
      <Serit
        key="alert"
        ton={o.status === 'exhausted' ? 'hata' : 'uyari'}
        baslik={`Uyarı eşiği aşıldı: bütçenin %${((o.spentRatio ?? 0) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}'i harcandı`}
      >
        Eşik %{o.budget.alertThresholdPct}.
      </Serit>,
    );
  }

  if (notices.length === 0) return null;
  return <div className="grid gap-2">{notices}</div>;
}

// -----------------------------------------------------------------------------
// Müşteri geneli kart
// -----------------------------------------------------------------------------

function OverallCard({
  pacing,
  currency,
  future,
}: {
  pacing: BudgetPacing;
  currency: string | null;
  future: boolean;
}) {
  const cur = pacing.budget?.currency ?? currency;

  return (
    <section className="min-w-0 overflow-hidden rounded-kart border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="m-0 font-baslik text-15 font-bold text-ink">Workspace geneli</h3>
          <small className="text-12 text-ink-muted">
            Tüm reklam hesaplarının toplamı
            {!future && <> · {formatDayLong(pacing.throughDate)} tarihine kadar</>}
          </small>
        </div>
        <StatusChip status={pacing.status} />
      </div>

      <div className="grid gap-3.5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-baslik text-28 font-extrabold tabular-nums tracking-[-0.02em] text-ink">
              {formatMoney(pacing.spentMicros, cur)}
            </span>
            {pacing.budget ? (
              <span className="text-14 text-ink-muted">/ {formatMoney(pacing.budget.amountMicros, cur)} harcandı</span>
            ) : (
              <span className="text-14 text-ink-muted">harcandı · bütçe tanımlı değil</span>
            )}
          </div>
        </div>
        <PacingBar pacing={pacing} />
        {pacing.budget?.note && <p className="m-0 text-12 text-ink-muted">{pacing.budget.note}</p>}
      </div>

      {pacing.budget && (
        <div className="border-t border-line [&>div]:border-b-0">
          <MetrikKutulari
            cerceveli={false}
            kutular={[
              { anahtar: 'kalan', ad: 'Kalan', deger: formatMoney(pacing.remainingMicros, cur) },
              { anahtar: 'gun', ad: 'Kalan gün', deger: `${pacing.daysRemaining} / ${pacing.daysTotal}` },
              {
                anahtar: 'gunluk',
                ad: 'Günlük harcanabilir',
                deger: formatMoney(pacing.suggestedDailyMicros, cur),
                ipucu: 'Kalan bütçe ÷ kalan gün',
              },
              {
                anahtar: 'tahmin',
                ad: 'Ay sonu tahmini',
                deger: formatMoney(pacing.projectedMicros, cur),
                ipucu: 'Bu hızla devam edilirse',
              },
            ]}
          />
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Hesap tablosu
// -----------------------------------------------------------------------------

function AccountTable({
  data,
  month,
  canWrite,
}: {
  data: ClientPacing;
  month: string;
  canWrite: boolean;
}) {
  if (data.accounts.length === 0) {
    return (
      <BosDurum
        baslik="Reklam hesabı yok"
        neden="Bu workspace’e bağlı reklam hesabı yok. Hesap atanınca bütçesi burada tanımlanır."
      />
    );
  }

  /**
   * HESAPLAR İKİYE AYRILIYOR.
   *
   * Meta bağlantısı business manager'daki TÜM reklam hesaplarını içeri
   * alıyor; bir müşterinin yüzlerce hesabı olabiliyor ve bunların çoğu boş,
   * kapalı ya da başka bir dönemden kalma. Hepsini tek listede göstermek
   * sayfayı sonsuz bir tabloya çeviriyor ve asıl iş yapan üç beş hesap
   * kayboluyor.
   *
   * Ölçüt: bu ayda BÜTÇESİ ya da HARCAMASI olan hesap "aktif". Geri kalanı
   * silinmiyor, katlanıyor — bütçe tanımlanmamış bir hesabı tamamen gizlemek,
   * tam da fark edilmesi gereken durumu görünmez kılardı.
   */
  const active = data.accounts.filter((a) => a.budget !== null || BigInt(a.spentMicros) > 0n);
  const idle = data.accounts.filter((a) => a.budget === null && BigInt(a.spentMicros) === 0n);

  return (
    <section className="min-w-0 rounded-kart border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">Reklam hesabı bazında</h3>
        <small className="text-12 text-ink-muted">
          {active.length} aktif
          {idle.length > 0 && ` · ${idle.length} hareketsiz`}
        </small>
      </div>

      {active.length === 0 ? (
        <p className="m-0 px-5 py-8 text-center text-13 text-ink-muted">
          Bu ay hiçbir hesabın bütçesi ya da harcaması yok.
        </p>
      ) : (
        <AccountRows rows={active} data={data} month={month} canWrite={canWrite} />
      )}

      {idle.length > 0 && (
        // `details` KULLANILIYOR, useState değil: bu sayfa sunucu bileşeni ve
        // yalnızca aç/kapa için istemciye JS indirmek gereksiz. İçerik DOM'da.
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-2.5 text-12 font-semibold text-ink-muted transition-colors hover:bg-surface-muted">
            Bu ay hareketi olmayan {idle.length} hesabı göster
          </summary>
          <AccountRows rows={idle} data={data} month={month} canWrite={canWrite} />
        </details>
      )}

      {/* SESSİZ KESME YOK: kaç hesap gösteriliyor, toplam kaç. */}
      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-line px-5 py-2.5 text-[12.5px] text-ink-muted">
        <span className="mr-auto">
          Kırmızı çizgi ayın geçen kısmı; çubuk çizginin sağındaysa bütçe hedeften hızlı tüketiliyor. Hesaplar{' '}
          <strong className="text-ink">bugün hariç</strong>, dünün sonuna kadar olan veriyle hesaplanıyor: gün bitmeden
          gelen kısmi veri her sabah &quot;yavaş gidiyoruz&quot; dedirtirdi.
        </span>
        <span className="tabular-nums">
          {active.length} aktif / {data.accounts.length} hesap
        </span>
      </div>
    </section>
  );
}

function AccountRows({
  rows,
  data,
  month,
  canWrite,
}: {
  rows: ClientPacing['accounts'];
  data: ClientPacing;
  month: string;
  canWrite: boolean;
}) {
  /*
   * TABLO DEĞİL SATIR LİSTESİ. Sekiz sütunlu tablo `min-w-[860px]` taşıyordu
   * ve Marka Merkezi'nin iç menüsünün yanındaki kolon ondan dar: tablo kendi
   * içinde yatay kayıyor, satırın sonundaki "Bütçe tanımla" düğmesi ekranın
   * DIŞINDA kalıyordu. Kullanıcının "hangi mecraya bütçe sınırı koyduğumu
   * göremiyorum" cümlesinin yarısı buydu: sınırı koyacağı düğmeyi de
   * göremiyordu. Satır artık kolona sığıyor ve düğme her zaman görünür.
   *
   * MECRAYA GÖRE GRUPLU. Hesap adları çoğu zaman workspace adıyla aynı
   * ("Fes Spa", "Fes Spa Hamam") ve mecra yalnızca addan tahmin
   * edilebiliyordu. Grup başlığı mecrayı ve kaç hesabında sınır olduğunu
   * söylüyor.
   */
  /*
   * TOPLAM SATIRI (onaylı taslak `#butce`): harcanan, bütçe ve günlük öneri
   * toplanıyor. KARIŞIK PARA BİRİMİ TOPLANMIYOR: kur çevrimi yok ve iki
   * para biriminin toplamı yanlış bir sayı olurdu; "karışık" yazıyor.
   */
  const birimler = new Set(rows.map((a) => a.budget?.currency ?? data.currency));
  const tekBirim = birimler.size === 1 ? [...birimler][0]! : null;
  const toplamHarcanan = rows.reduce((t, a) => t + BigInt(a.spentMicros), 0n);
  const butceli = rows.filter((a) => a.budget !== null);
  const toplamButce = butceli.reduce((t, a) => t + BigInt(a.budget!.amountMicros), 0n);
  const toplamGunluk = butceli.reduce((t, a) => t + BigInt(a.suggestedDailyMicros ?? '0'), 0n);
  const para = (m: bigint) => (tekBirim ? formatMoney(m.toString(), tekBirim) : 'karışık');

  return (
    <div>
      {/* SÜTUN BAŞLIKLARI: satırlar tablo gibi okunuyor ama kolona sığıyor. */}
      <div className={`${HESAP_IZGARASI} border-b border-line px-5 py-2.5 text-12 font-semibold text-ink-muted max-sm:hidden`}>
        <span>Hesap</span>
        <span>Gidişat</span>
        <span className="text-right">Harcanan</span>
        <span className="text-right">Bütçe</span>
        <span className="text-right">Günlük öneri</span>
        <span className="sr-only">Eylem</span>
      </div>
      {PLATFORMS.filter((p) => rows.some((a) => a.platform === p)).map((platform) => {
        const grup = rows.filter((a) => a.platform === platform);
        const sinirli = grup.filter((a) => a.budget !== null).length;
        return (
          <section key={platform} className="border-b border-line last:border-b-0">
            <h4 className="m-0 flex flex-wrap items-center gap-2 bg-surface-muted px-5 py-2 text-13 font-semibold text-ink">
              <PlatformLogo kind={platformKanali(platform)} className="h-4 w-4 shrink-0" />
              {PLATFORM_KISA_ADLARI[platform]}
              <span className="text-12 font-normal text-ink-muted">
                {grup.length} hesap ·{' '}
                {sinirli === 0 ? 'hiçbirinde bütçe sınırı yok' : `${sinirli} hesapta bütçe sınırı var`}
              </span>
            </h4>
            <ul className="m-0 list-none divide-y divide-line p-0">
              {grup.map((a) => (
                <HesapSatiri key={a.adAccountId} a={a} data={data} month={month} canWrite={canWrite} />
              ))}
            </ul>
          </section>
        );
      })}
      <div className={`${HESAP_IZGARASI} border-t border-line bg-surface-muted px-5 py-3 text-13 font-bold text-ink`}>
        <span>Toplam · {rows.length} hesap</span>
        <span className="max-sm:hidden" />
        <span className="text-right font-baslik tabular-nums">{para(toplamHarcanan)}</span>
        <span className="text-right font-baslik tabular-nums">{butceli.length > 0 ? para(toplamButce) : '—'}</span>
        <span className="text-right font-baslik tabular-nums">{butceli.length > 0 ? para(toplamGunluk) : '—'}</span>
        <span />
      </div>
    </div>
  );
}

/**
 * Hesap satırlarının ızgarası. TABLO DEĞİL IZGARA: sekiz sütunlu tablo
 * `min-w` taşıyordu ve dar kolonda kendi içinde yatay kayıyor, satırın
 * sonundaki "Bütçe tanımla" düğmesi ekranın DIŞINDA kalıyordu. Izgara
 * telefonda alt alta iniyor ve düğme her zaman görünür.
 */
const HESAP_IZGARASI =
  'grid items-center gap-x-5 gap-y-1.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]';

function HesapSatiri({
  a,
  data,
  month,
  canWrite,
}: {
  a: ClientPacing['accounts'][number];
  data: ClientPacing;
  month: string;
  canWrite: boolean;
}) {
  const cur = a.budget?.currency ?? data.currency;
  return (
    <li className={`${HESAP_IZGARASI} px-5 py-3 text-13`}>
      <div className="min-w-0">
        <p className="m-0 truncate font-semibold text-ink" title={a.adAccountName}>
          {a.adAccountName}
        </p>
        <p className="m-0 flex flex-wrap items-center gap-1.5">
          {/* "Bütçe yok" çipi sınırsız hesapta gösterilmiyor: yanındaki
              "Sınır yok" ile aynı şeyi ikinci kez söylüyordu. */}
          {a.budget && <StatusChip status={a.status} />}
          {/* Bu hesabın kendi veri kapsaması: genel uyarı hangi hesabın
              eksik olduğunu söylemiyor. */}
          {a.daysElapsed > 0 && a.daysWithData < a.daysElapsed && (
            <small className="text-12 text-danger-strong" title={`${a.daysElapsed} günün ${a.daysWithData} günü senkronize`}>
              {a.daysWithData}/{a.daysElapsed} gün veri
            </small>
          )}
        </p>
      </div>

      <div className="min-w-0">
        {a.budget ? (
          <div className="grid gap-1">
            <PacingBar pacing={a} compact />
            <small className="text-12">
              <PaceDelta pacing={a} />
            </small>
          </div>
        ) : (
          <span className="text-12 font-semibold text-ink-muted">Sınır yok</span>
        )}
      </div>

      <span className="text-right font-baslik font-semibold tabular-nums text-ink">
        <span className="text-12 font-normal text-ink-muted sm:hidden">Harcanan </span>
        {formatMoney(a.spentMicros, cur)}
      </span>
      <span className="text-right font-baslik font-semibold tabular-nums text-ink">
        <span className="text-12 font-normal text-ink-muted sm:hidden">Bütçe </span>
        {a.budget ? formatMoney(a.budget.amountMicros, cur) : '—'}
      </span>
      <span className="text-right font-baslik font-semibold tabular-nums text-ink" title={a.budget ? `Kalan ${formatMoney(a.remainingMicros, cur)}` : undefined}>
        <span className="text-12 font-normal text-ink-muted sm:hidden">Günlük öneri </span>
        {a.budget ? formatMoney(a.suggestedDailyMicros, cur) : '—'}
      </span>

      {/* DÜZENLEME YAN PANELDE: satırda yalnız düğme, form sağdan açılıyor. */}
      <div className="sm:justify-self-end">
        {canWrite && (
          <BudgetForm
            clientId={data.clientId}
            adAccountId={a.adAccountId}
            adAccountName={a.adAccountName}
            month={month}
            existing={a.budget}
            currency={cur}
          />
        )}
      </div>
    </li>
  );
}

interface MonthOption {
  key: string;
  label: string;
  short: string;
  current: boolean;
  future: boolean;
}

/**
 * Seçilebilir aylar: 4 geçmiş + içinde bulunulan + 1 gelecek.
 *
 * Gelecek ay DÂHİL çünkü bütçe planlama aracı: ajans ayın sonunda gelecek ayın
 * rakamını giriyor. Yalnızca geçmişi göstermek, aracı yalnızca rapor aracı
 * yapardı.
 *
 * `Date.UTC` ile hesaplanıyor — yerel `Date` kullanmak batıdaki bir sunucuda
 * ayın 1'inde bir önceki ayı "içinde bulunulan ay" gösterirdi.
 */
/**
 * Ay anahtarı (`YYYY-AA`, UTC) — TEK ÜRETİCİ. Genel Bakış'taki bütçe kartı da
 * bunu okuyor: ikinci bir hesap, ayın ilk saatlerinde iki ekranın farklı ayı
 * göstermesi demekti.
 */
export function ayAnahtari(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function selectableMonths(): MonthOption[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: MonthOption[] = [];

  for (let offset = -4; offset <= 1; offset++) {
    const d = new Date(Date.UTC(y, m + offset, 1));
    const key = ayAnahtari(d);
    out.push({
      key,
      label: d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      short: d.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' }),
      current: offset === 0,
      future: offset > 0,
    });
  }
  return out;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
