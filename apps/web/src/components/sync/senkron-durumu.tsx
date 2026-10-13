import type {
  SyncAccountStatus,
  SyncExcludedCounts,
  SyncJobStatusRow,
  SyncStatusResponse,
} from '@advetics/shared';
import { PLATFORM_LABELS, SENKRON_SAYAC_GUNU } from '@advetics/shared';
import { Kart } from '@/components/ui/kart';
import { BosDurum } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';

/** Elenen kategorilerin Türkçe karşılığı — sayaç anlamsız kalmasın. */
const ELENME_ETIKETLERI: Record<keyof SyncExcludedCounts, string> = {
  syncDisabled: 'izleme kapalı',
  clientInactive: 'workspace aktif değil',
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
  leads_reconcile: 'Potansiyel Müşteriler',
};

export function SenkronDurumu({ data }: { data: SyncStatusResponse }) {
  const elenen = Object.entries(data.excluded).filter(([, n]) => n > 0) as Array<
    [keyof SyncExcludedCounts, number]
  >;

  return (
    <div className="space-y-6">
      <OzetSeridi data={data} />

      {/*
        SESSİZ KESME YOK: kaç hesabın kaçının izlendiği ve elenenlerin
        SEBEBİ yazılı. "Hiç hesap yok" ile "üç hesap var, üçü de elendi"
        aynı ekrana düşmemeli.
      */}
      <Kart
        baslik="Reklam hesapları"
        baslikEki={
          <>
            {data.accounts.length} atanmış hesap · {data.accountCount} tanesi izleniyor
            {elenen.length > 0 && (
              <> · elenen: {elenen.map(([k, n]) => `${n} ${ELENME_ETIKETLERI[k]}`).join(', ')}</>
            )}
          </>
        }
        dolgu={false}
      >
        {data.accounts.length === 0 ? (
          <div className="p-4">
            <BosDurum
              baslik="Atanmış reklam hesabı yok"
              neden="Bu workspace’e hiç reklam hesabı atanmamış. Kurulum’daki hesaplar bloğundan ata; atama izlemeyi de açıyor ve 90 günlük geçmişi kuyruğa alıyor."
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.accounts.map((a) => (
              <HesapSatiri key={a.id} hesap={a} />
            ))}
          </ul>
        )}
      </Kart>

      {/* PENCERE SABİTTEN: etiket elle yazılsaydı pencere değişince
          ekran yanlış süreyi söylerdi. */}
      <Kart
        baslik={<>Son {SENKRON_SAYAC_GUNU} günün senkronizasyon işleri</>}
        baslikEki={`${data.recentJobs.length} / ${data.recentJobsTotal} iş gösteriliyor`}
        dolgu={false}
      >
        {data.recentJobs.length === 0 ? (
          <div className="p-4">
            <BosDurum
              baslik="Senkronizasyon işi yok"
              neden={
                <>
                  Son {SENKRON_SAYAC_GUNU} günde hiç senkronizasyon işi kaydedilmemiş. Hesap yeni
                  atandıysa işler birkaç dakika içinde görünür; görünmüyorsa
                  senkronizasyon worker&apos;ı çalışmıyor olabilir.
                </>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-12 text-ink-muted">
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
      </Kart>
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
        baslik={`Düşen iş · son ${SENKRON_SAYAC_GUNU} gün`}
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
        baslik={`Başarılı ama boş iş · son ${SENKRON_SAYAC_GUNU} gün`}
        deger={String(bosBiten)}
        vurgu={bosBiten > 0 ? 'warn' : undefined}
        ipucu="İş hatasız bitti ama tek satır yazmadı; genellikle yapı taraması metriklerden sonra koştuğu için."
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
    vurgu === 'danger' ? 'text-danger-strong' : vurgu === 'warn' ? 'text-danger-strong' : 'text-ink';
  return (
    <div className="rounded-kart border border-line bg-surface p-4">
      <p className="text-xs text-ink-muted">{baslik}</p>
      <p className={`font-baslik mt-1 text-24 font-bold tabular-nums ${renk}`}>{deger}</p>
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
        <div className="mt-2">
          <Uyari ton="uyari">{hesap.blockedReason}</Uyari>
        </div>
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
      className={`mt-2 rounded-alan border px-3 py-2 text-xs ${
        hata ? 'border-l-4 border-line border-l-danger bg-surface' : 'border-line bg-surface-muted'
      }`}
    >
      <p className="text-ink-muted">
        <span className="text-ink">{IS_ADLARI[is.jobType] ?? is.jobType}</span> · {is.status} ·{' '}
        {is.rowsUpserted} satır
        {is.rowsSkipped !== null && is.rowsSkipped > 0 && <> · {is.rowsSkipped} atıldı</>}
        {is.attempts > 1 && <> · {is.attempts}. deneme</>} · {zaman(is.finishedAt ?? is.createdAt)}
      </p>
      {is.errorMessage && (
        <p className="mt-1 leading-snug text-danger-strong">
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
          <p className="mt-1 max-w-md text-xs leading-snug text-danger-strong">
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
          <span className="block text-xs text-danger-strong">{is.rowsSkipped} atıldı</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-ink-muted">
        {zaman(is.finishedAt ?? is.createdAt)}
        {is.note && <span className="block text-[11px] opacity-80">{is.note}</span>}
      </td>
    </tr>
  );
}

/*
 * İş durumu ortak rozetle. "Başarılı ama 0 satır" KIRMIZI: bu projede bir
 * hata türü (CLAUDE.md "succeeded + rows = 0"), yeşil göstermek onu gizlerdi.
 */
function DurumRozeti({ status, bosBasari }: { status: string; bosBasari: boolean }) {
  if (bosBasari) return <Rozet hal="hata">başarılı · 0 satır</Rozet>;
  const hal: DurumHali =
    status === 'failed' || status === 'throttled' ? 'hata' : status === 'succeeded' ? 'ok' : 'taslak';
  return <Rozet hal={hal}>{status}</Rozet>;
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
