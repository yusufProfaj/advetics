import type {
  SyncAccountStatus,
  SyncExcludedCounts,
  SyncJobStatusRow,
  SyncStatusResponse,
} from '@advetics/shared';
import { PLATFORM_LABELS } from '@advetics/shared';

/** Elenen kategorilerin Türkçe karşılığı — sayaç anlamsız kalmasın. */
const ELENME_ETIKETLERI: Record<keyof SyncExcludedCounts, string> = {
  syncDisabled: 'izleme kapalı',
  clientInactive: 'müşteri aktif değil',
  connectionInactive: 'bağlantı yeniden yetki istiyor',
  accountStatus: 'hesabın platform durumu uygun değil',
};

const IS_ADLARI: Record<string, string> = {
  structure: 'Yapı taraması',
  insights_realtime: 'Metrik (bugün)',
  insights_backfill: 'Metrik (geçmiş)',
  initial_backfill: 'İlk geçmiş çekimi',
  organic_posts: 'Organik gönderiler',
  keyword_insights: 'Anahtar kelimeler',
  leads_reconcile: 'Potansiyel müşteriler',
};

export function SenkronDurumu({ data }: { data: SyncStatusResponse }) {
  const elenen = Object.entries(data.excluded).filter(([, n]) => n > 0) as Array<
    [keyof SyncExcludedCounts, number]
  >;

  return (
    <div className="space-y-6">
      <OzetSeridi data={data} />

      <section className="rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-medium">Reklam hesapları</h2>
          {/*
            SESSİZ KESME YOK: kaç hesabın kaçının izlendiği ve elenenlerin
            SEBEBİ yazılı. "Hiç hesap yok" ile "üç hesap var, üçü de elendi"
            aynı ekrana düşmemeli.
          */}
          <p className="text-xs text-ink-muted">
            {data.accounts.length} atanmış hesap · {data.accountCount} tanesi izleniyor
            {elenen.length > 0 && (
              <> · elenen: {elenen.map(([k, n]) => `${n} ${ELENME_ETIKETLERI[k]}`).join(', ')}</>
            )}
          </p>
        </header>

        {data.accounts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Bu müşteriye hiç reklam hesabı atanmamış. Platform Bağlantıları
            ekranından havuzdan hesap ata — atama izlemeyi de açıyor ve 90
            günlük geçmişi kuyruğa alıyor.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.accounts.map((a) => (
              <HesapSatiri key={a.id} hesap={a} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-medium">Son senkronizasyon işleri</h2>
          <p className="text-xs text-ink-muted">
            {data.recentJobs.length} / {data.recentJobsTotal} iş gösteriliyor
          </p>
        </header>

        {data.recentJobs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Bu müşteri için hiç senkronizasyon işi kaydedilmemiş. Hesap yeni
            atandıysa işler birkaç dakika içinde görünür; görünmüyorsa
            senkronizasyon worker&apos;ı çalışmıyor olabilir.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">İş</th>
                  <th className="px-4 py-2 font-medium">Hesap</th>
                  <th className="px-4 py-2 font-medium">Durum</th>
                  <th className="px-4 py-2 text-right font-medium">Yazılan satır</th>
                  <th className="px-4 py-2 font-medium">Zaman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recentJobs.map((j) => (
                  <IsSatiri key={j.id} is={j} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function OzetSeridi({ data }: { data: SyncStatusResponse }) {
  const engelli = data.accounts.filter((a) => a.blockedReason !== null).length;
  /*
   * SAYAÇLAR API'DEN GELİYOR, GÖSTERİLEN 25 SATIRDAN DEĞİL.
   *
   * İlk sürümde bunlar `data.recentJobs` üzerinden hesaplanıyordu: 356 işlik
   * bir tabloda "5 düşen iş" aslında "gösterilen 25 işin 5'i" demekti.
   * Kesilmiş bir listeden sayı türetmek, sessiz kesmenin başka bir biçimi.
   */
  const { failed: dusen, emptySuccess: bosBiten, running: koşan } = data.jobCounts;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kutu baslik="İzlenen hesap" deger={String(data.accountCount)} />
      <Kutu
        baslik="Engelli hesap"
        deger={String(engelli)}
        vurgu={engelli > 0 ? 'warn' : undefined}
      />
      <Kutu
        baslik="Düşen iş"
        deger={String(dusen)}
        vurgu={dusen > 0 ? 'danger' : undefined}
        ipucu={koşan > 0 ? `${koşan} iş hâlâ kuyrukta ya da koşuyor.` : undefined}
      />
      {/*
        "BAŞARILI AMA SIFIR SATIR" AYRI BİR KUTU. Bu, "atadım veri gelmiyor"
        hâlinin en sinsi biçimi: iş `succeeded` bitiyor, hiçbir yerde hata
        yok, ve bir daha denenmiyor. Düşen işlerle aynı kutuya koymak onu
        gizlerdi.
      */}
      <Kutu
        baslik="Başarılı ama boş iş"
        deger={String(bosBiten)}
        vurgu={bosBiten > 0 ? 'warn' : undefined}
        ipucu="İş hatasız bitti ama tek satır yazmadı — genellikle yapı taraması metriklerden sonra koştuğu için."
      />
    </div>
  );
}

function Kutu({
  baslik,
  deger,
  vurgu,
  ipucu,
}: {
  baslik: string;
  deger: string;
  vurgu?: 'warn' | 'danger';
  ipucu?: string;
}) {
  const renk =
    vurgu === 'danger' ? 'text-danger' : vurgu === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs text-ink-muted">{baslik}</p>
      <p className={`mt-1 text-2xl font-semibold ${renk}`}>{deger}</p>
      {ipucu && <p className="mt-1 text-[11px] leading-snug text-ink-muted">{ipucu}</p>}
    </div>
  );
}

function HesapSatiri({ hesap }: { hesap: SyncAccountStatus }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{hesap.name}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {PLATFORM_LABELS[hesap.platform]} · {hesap.status}
          </span>
        </div>
        <div className="flex gap-3 text-xs text-ink-muted">
          <span>Yapı: {zaman(hesap.lastStructureSyncAt)}</span>
          <span>Metrik: {zaman(hesap.lastInsightsSyncAt)}</span>
        </div>
      </div>

      {/*
        ENGEL CÜMLESİ API'DEN GELDİĞİ GİBİ BASILIYOR. Arayüzde yeniden
        yazmak, iki metnin ayrışması demek olurdu; sebep mantığı tek yerde
        (`supurme-kapsami.ts`).
      */}
      {hesap.blockedReason !== null && (
        <p className="mt-2 rounded border border-warn/40 bg-warn/5 px-3 py-2 text-xs leading-relaxed">
          {hesap.blockedReason}
        </p>
      )}

      {hesap.blockedReason === null && !hesap.inScheduledSweep && (
        <p className="mt-2 text-xs text-ink-muted">
          Zamanlanmış güncellemeye girmiyor.
        </p>
      )}

      {/*
        HESABIN İŞLERİ SATIRIN YANINDA, İŞ TÜRÜ BAŞINA.
        Ortak "son 25 iş" tablosu yetmiyordu: organik gönderi işleri listeyi
        dolduruyor, aranan hesabın yapı taraması altta kalıyordu. Tek bir
        "son iş" alanı da yetmedi — daha yeni bir metrik işi, kotaya takılmış
        yapı taramasını gizliyordu. Sorulan soru tür bazlı: "yapı ne oldu",
        "metrik ne oldu". Bir tür hiç görünmüyorsa o iş HİÇ KUYRUĞA GİRMEMİŞ
        demek ve bu da bir cevap.
      */}
      {hesap.lastJobs.map((j) => (
        <IsOzeti key={j.id} is={j} hata={j.status === 'failed' || j.status === 'throttled'} />
      ))}
    </li>
  );
}

/** Hesap satırının altında tek bir işin özeti. */
function IsOzeti({ is, hata }: { is: SyncJobStatusRow; hata?: boolean }) {
  return (
    <div
      className={`mt-2 rounded border px-3 py-2 text-xs ${
        hata ? 'border-danger/40 bg-danger/5' : 'border-line bg-surface-muted'
      }`}
    >
      <p className="text-ink-muted">
        <span className="text-ink">{IS_ADLARI[is.jobType] ?? is.jobType}</span> · {is.status} ·{' '}
        {is.rowsUpserted} satır
        {is.rowsSkipped !== null && is.rowsSkipped > 0 && <> · {is.rowsSkipped} atıldı</>}
        {is.attempts > 1 && <> · {is.attempts}. deneme</>} · {zaman(is.finishedAt ?? is.createdAt)}
      </p>
      {is.errorMessage && (
        <p className="mt-1 leading-snug text-danger">
          {is.errorCode && <span className="font-mono">[{is.errorCode}] </span>}
          {is.errorMessage}
        </p>
      )}
      {is.note && <p className="mt-1 text-ink-muted">{is.note}</p>}
    </div>
  );
}

function IsSatiri({ is }: { is: SyncJobStatusRow }) {
  const bosBasari = is.status === 'succeeded' && is.rowsUpserted === 0;
  return (
    <tr>
      <td className="px-4 py-2">
        <span className="font-medium">{IS_ADLARI[is.jobType] ?? is.jobType}</span>
        {is.entityLevel && <span className="ml-1 text-xs text-ink-muted">({is.entityLevel})</span>}
      </td>
      <td className="px-4 py-2 text-ink-muted">{is.adAccountName ?? '—'}</td>
      <td className="px-4 py-2">
        <DurumRozeti status={is.status} bosBasari={bosBasari} />
        {/*
          PLATFORMUN KENDİ MESAJI. Bu alan tabloya bugüne kadar da yazılıyordu
          (Meta'da subcode ve fbtrace dahil) ama okuyan hiçbir uç nokta yoktu:
          "izin yok", "kota doldu" ve "hesap bulunamadı" panelde hiç
          görünmüyordu.
        */}
        {is.errorMessage && (
          <p className="mt-1 max-w-md text-xs leading-snug text-danger">
            {is.errorCode && <span className="font-mono">[{is.errorCode}] </span>}
            {is.errorMessage}
          </p>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {is.rowsUpserted}
        {/*
          ATILAN SATIR YAZILI SATIRIN YANINDA. "0 yazıldı" tek başına bir
          hata gibi görünmüyor; "0 yazıldı, 12 atıldı" ise doğrudan yapı
          taramasını işaret ediyor. Bilgi bugüne kadar yalnızca worker
          log'undaydı ve log rotasyonuyla kayboluyordu.
        */}
        {is.rowsSkipped !== null && is.rowsSkipped > 0 && (
          <span className="block text-xs text-warn">{is.rowsSkipped} atıldı</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-ink-muted">
        {zaman(is.finishedAt ?? is.createdAt)}
        {is.note && <span className="block text-[11px] opacity-80">{is.note}</span>}
      </td>
    </tr>
  );
}

function DurumRozeti({ status, bosBasari }: { status: string; bosBasari: boolean }) {
  if (bosBasari) {
    return (
      <span className="inline-block rounded bg-warn/15 px-2 py-0.5 text-xs text-warn">
        başarılı · 0 satır
      </span>
    );
  }
  const renk =
    status === 'failed'
      ? 'bg-danger/15 text-danger'
      : status === 'succeeded'
        ? 'bg-ok/15 text-ok'
        : 'bg-surface-muted text-ink-muted';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${renk}`}>{status}</span>;
}

/** ISO damgasını okunur hâle getirir. `null` = hiç koşmadı, ve bu bir bilgi. */
function zaman(iso: string | null): string {
  if (iso === null) return 'hiç';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
