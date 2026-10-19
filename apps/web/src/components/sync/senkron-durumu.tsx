'use client';

/*
 * İSTEMCİ BİLEŞENİ (D2): metin sözlükten `useSozluk` ile geliyor ve iki
 * çağıran da (Marka Merkezi'nin sunucu ve istemci parçaları) yalnız düz
 * veri veriyor. Sunucu bileşeni kalsaydı istemci çağıranda dil bağlamı
 * okunamazdı.
 */
import type {
  SyncAccountStatus,
  SyncExcludedCounts,
  SyncJobStatusRow,
  SyncStatusResponse,
} from '@advetics/shared';
import { PLATFORM_LABELS, SENKRON_SAYAC_GUNU, bicimKodu, type Dil } from '@advetics/shared';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ayarlarSozlugu } from '@/dil/sozlukler/ayarlar';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { formatRelative } from '@/lib/format';
import { Kart } from '@/components/ui/kart';
import { BosDurum } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { dugmeSinifi } from '@/components/ui/dugme';

/*
 * Elenen kategorilerin ve iş türlerinin adları sözlükte (`senkron.elenme`,
 * `senkron.isAdlari`) — sayaç anlamsız kalmasın. Tanınmayan iş türü ham
 * adıyla yazılıyor.
 */
type SenkronSozlugu = (typeof ayarlarSozlugu)['tr']['senkron'];

export function SenkronDurumu({ data }: { data: SyncStatusResponse }) {
  const d = useSozluk(ayarlarSozlugu).senkron;
  const elenen = Object.entries(data.excluded).filter(([, n]) => n > 0) as Array<
    [keyof SyncExcludedCounts, number]
  >;

  return (
    <div className="space-y-6">
      <OzetSeridi data={data} d={d} />

      {/*
        SESSİZ KESME YOK: kaç hesabın kaçının izlendiği ve elenenlerin
        SEBEBİ yazılı. "Hiç hesap yok" ile "üç hesap var, üçü de elendi"
        aynı ekrana düşmemeli.
      */}
      <Kart
        baslik={d.reklamHesaplari}
        baslikEki={
          <>
            {d.hesapOzeti(data.accounts.length, data.accountCount)}
            {elenen.length > 0 && d.elenen(elenen.map(([k, n]) => `${n} ${d.elenme[k]}`).join(', '))}
          </>
        }
        dolgu={false}
      >
        {data.accounts.length === 0 ? (
          <div className="p-4">
            <BosDurum
              baslik={d.hesapYok}
              neden={d.hesapYokNeden}
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
        baslik={d.isler(SENKRON_SAYAC_GUNU)}
        baslikEki={d.gosteriliyor(data.recentJobs.length, data.recentJobsTotal)}
        dolgu={false}
      >
        {data.recentJobs.length === 0 ? (
          <div className="p-4">
            <BosDurum
              baslik={d.isYok}
              neden={d.isYokNeden(SENKRON_SAYAC_GUNU)}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-12 text-ink-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">{d.is}</th>
                  <th className="px-4 py-2 font-medium">{d.hesap}</th>
                  <th className="px-4 py-2 font-medium">{d.durum}</th>
                  <th className="px-4 py-2 text-right font-medium">{d.yazilanSatir}</th>
                  <th className="px-4 py-2 font-medium">{d.zaman}</th>
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

function OzetSeridi({ data, d }: { data: SyncStatusResponse; d: SenkronSozlugu }) {
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
      <Kutu baslik={d.izlenenHesap} deger={String(data.accountCount)} />
      <Kutu
        baslik={d.engelliHesap}
        deger={String(engelli)}
        vurgu={engelli > 0 ? 'warn' : undefined}
      />
      <Kutu
        baslik={d.dusenIs(SENKRON_SAYAC_GUNU)}
        deger={String(dusen)}
        vurgu={dusen > 0 ? 'danger' : undefined}
        ipucu={koşan > 0 ? d.kuyrukta(koşan) : undefined}
      />
      {/*
        "BAŞARILI AMA SIFIR SATIR" AYRI BİR KUTU. Bu, "atadım veri gelmiyor"
        hâlinin en sinsi biçimi: iş `succeeded` bitiyor, hiçbir yerde hata
        yok, ve bir daha denenmiyor. Düşen işlerle aynı kutuya koymak onu
        gizlerdi.
      */}
      <Kutu
        baslik={d.bosIs(SENKRON_SAYAC_GUNU)}
        deger={String(bosBiten)}
        vurgu={bosBiten > 0 ? 'warn' : undefined}
        ipucu={d.bosIsIpucu}
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

/**
 * ÖDEME DURUMU ÜÇ HÂLLİ. "Sorun görünmüyor" ile "bilinmiyor" ayrı yazılıyor:
 * Google'da ödeme ayrı bir okumayla geliyor ve okunmamış bir hesabı
 * sağlıklı göstermek, durmuş reklamı gizlemek olurdu. Sorun yoksa bile
 * Google'ın kart reddini API'de VERMEDİĞİ ipucunda yazıyor: "sorun yok"un
 * kapsamı bilinsin.
 */
function OdemeRozeti({ hesap }: { hesap: SyncAccountStatus }) {
  const { dil } = useDil();
  const d = useSozluk(ayarlarSozlugu).senkron;
  const o = hesap.odeme;
  const okundu = o.okundu ? ` · ${d.odemeOkundu(formatRelative(o.okundu, dil))}` : '';
  if (o.durum === 'sorun_yok') {
    return (
      <Rozet hal="ok" title={hesap.platform === 'google' ? d.odemeYokGoogle + okundu : undefined}>
        {d.odemeYok}
      </Rozet>
    );
  }
  if (o.durum !== 'bilinmiyor') return null;
  const neden = o.neden === 'okunamadi' ? d.odemeNeden.okunamadi(o.hata ?? '') : d.odemeNeden[o.neden];
  return (
    <Rozet hal="taslak" title={neden + okundu}>
      {d.odemeBilinmiyor}
    </Rozet>
  );
}

/** Ödeme sorunu: bantla aynı cümle (sözlük) ve platformun ödeme ekranı. */
function OdemeSorunu({ hesap }: { hesap: SyncAccountStatus }) {
  const d = useSozluk(genelBakisSozlugu).uyari.odeme;
  const o = hesap.odeme;
  if (o.durum !== 'sorun') return null;
  return (
    <Uyari
      ton="tehlike"
      baslik={d.baslik[o.sebep]}
      eylem={
        o.adres ? (
          <a
            href={o.adres}
            target="_blank"
            rel="noopener noreferrer"
            title={d.yeniSekme}
            className={dugmeSinifi('koyu', 'kucuk')}
          >
            {hesap.platform === 'meta' ? d.eylemMeta : d.eylemGoogle} ↗
          </a>
        ) : undefined
      }
    >
      {d.detay[o.sebep](o.hesapNo)}
    </Uyari>
  );
}

function HesapSatiri({ hesap }: { hesap: SyncAccountStatus }) {
  const { dil } = useDil();
  const d = useSozluk(ayarlarSozlugu).senkron;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{hesap.name}</span>
          <span className="ml-2 text-xs text-ink-muted">
            {PLATFORM_LABELS[hesap.platform]} · {hesap.status}
          </span>
          {hesap.odeme.durum !== 'sorun' && (
            <span className="ml-2 align-middle">
              <OdemeRozeti hesap={hesap} />
            </span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-ink-muted">
          <span>{d.yapi(zaman(hesap.lastStructureSyncAt, dil, d))}</span>
          <span>{d.metrik(zaman(hesap.lastInsightsSyncAt, dil, d))}</span>
        </div>
      </div>

      {/*
        ENGEL CÜMLESİ API'DEN GELDİĞİ GİBİ BASILIYOR. Arayüzde yeniden
        yazmak, iki metnin ayrışması demek olurdu; sebep mantığı tek yerde
        (`supurme-kapsami.ts`).
      */}
      {hesap.odeme.durum === 'sorun' && (
        <div className="mt-2">
          <OdemeSorunu hesap={hesap} />
        </div>
      )}

      {hesap.blockedReason !== null && (
        <div className="mt-2">
          <Uyari ton="uyari">{hesap.blockedReason}</Uyari>
        </div>
      )}

      {hesap.blockedReason === null && !hesap.inScheduledSweep && (
        <p className="mt-2 text-xs text-ink-muted">{d.zamanlanmisDegil}</p>
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
  const { dil } = useDil();
  const d = useSozluk(ayarlarSozlugu).senkron;
  return (
    <div
      className={`mt-2 rounded-alan border px-3 py-2 text-xs ${
        hata ? 'border-l-4 border-line border-l-danger bg-surface' : 'border-line bg-surface-muted'
      }`}
    >
      <p className="text-ink-muted">
        <span className="text-ink">{d.isAdlari[is.jobType] ?? is.jobType}</span> · {is.status} ·{' '}
        {d.satir(is.rowsUpserted)}
        {is.rowsSkipped !== null && is.rowsSkipped > 0 && <> · {d.atildi(is.rowsSkipped)}</>}
        {is.attempts > 1 && <> · {d.deneme(is.attempts)}</>} · {zaman(is.finishedAt ?? is.createdAt, dil, d)}
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
  const { dil } = useDil();
  const d = useSozluk(ayarlarSozlugu).senkron;
  const bosBasari = is.status === 'succeeded' && is.rowsUpserted === 0;
  return (
    <tr>
      <td className="px-4 py-2">
        <span className="font-medium">{d.isAdlari[is.jobType] ?? is.jobType}</span>
        {is.entityLevel && <span className="ml-1 text-xs text-ink-muted">({is.entityLevel})</span>}
      </td>
      <td className="px-4 py-2 text-ink-muted">{is.adAccountName ?? '—'}</td>
      <td className="px-4 py-2">
        <DurumRozeti status={is.status} bosBasari={bosBasari} bosEtiket={d.bosBasari} />
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
          <span className="block text-xs text-danger-strong">{d.atildi(is.rowsSkipped)}</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-ink-muted">
        {zaman(is.finishedAt ?? is.createdAt, dil, d)}
        {is.note && <span className="block text-[11px] opacity-80">{is.note}</span>}
      </td>
    </tr>
  );
}

/*
 * İş durumu ortak rozetle. "Başarılı ama 0 satır" KIRMIZI: bu projede bir
 * hata türü (CLAUDE.md "succeeded + rows = 0"), yeşil göstermek onu gizlerdi.
 */
function DurumRozeti({ status, bosBasari, bosEtiket }: { status: string; bosBasari: boolean; bosEtiket: string }) {
  if (bosBasari) return <Rozet hal="hata">{bosEtiket}</Rozet>;
  const hal: DurumHali =
    status === 'failed' || status === 'throttled' ? 'hata' : status === 'succeeded' ? 'ok' : 'taslak';
  return <Rozet hal={hal}>{status}</Rozet>;
}

/** ISO damgasını okunur hâle getirir. `null` = hiç koşmadı, ve bu bir bilgi. */
function zaman(iso: string | null, dil: Dil, d: SenkronSozlugu): string {
  if (iso === null) return d.hic;
  return new Date(iso).toLocaleString(bicimKodu(dil), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
