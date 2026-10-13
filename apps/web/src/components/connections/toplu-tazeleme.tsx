'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BulkRefreshEstimate,
  BulkRefreshKurtarma,
  BulkRefreshProgress,
  BulkRefreshStarted,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Nokta } from '@/components/yukleniyor';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { Alan, Secim } from '@/components/ui/alan';

/**
 * ═══ TÜM VERİLERİ GÜNCELLE ═══
 *
 * Seçilen workspace’lerin son N yılının bütün verisi tek tuşla.
 *
 * İKİ ADIM: önce ne olacağı SÖYLENİYOR, sonra uygulanıyor. Kota geri
 * alınamaz biçimde harcanıyor ve iki yıllık bir tazeleme yüzlerce platform
 * çağrısı demek — kullanıcı sayıyı görmeden basmamalı. `sync-cli` ve
 * `backfill` ucunun deseni bu.
 *
 * İLERLEME YOKLANARAK OKUNUYOR. Sunucudan itmek (SSE/WebSocket) daha zarif
 * olurdu ama paylaşımlı VPS'te açık bağlantı başına bir süreç kaynağı demek
 * ve bu ekran saatlerce açık kalabiliyor. Beş saniyelik yoklama, saatler
 * süren bir iş için fazlasıyla sık.
 */
export function TopluTazeleme({
  workspaceler,
}: {
  workspaceler: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [yil, setYil] = useState(2);
  const [kirilimlar, setKirilimlar] = useState(false);
  const [tahmin, setTahmin] = useState<BulkRefreshEstimate | null>(null);
  const [parti, setParti] = useState<string | null>(null);
  const [ilerleme, setIlerleme] = useState<BulkRefreshProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kurtarmaNotu, setKurtarmaNotu] = useState<string | null>(null);

  /*
   * PARTİ KİMLİĞİ SAKLANIYOR. Sayfa yenilenirse ilerleme kaybolmamalı —
   * kullanıcı saatler süren bir işlemi başlatıp sekmeyi kapatabilir ve geri
   * döndüğünde "başlamış mıydı" sorusunu sormamalı.
   */
  useEffect(() => {
    const kayit = localStorage.getItem('advetics.topluTazeleme');
    if (kayit) setParti(kayit);
  }, []);

  const yokla = useCallback(async (id: string) => {
    try {
      setIlerleme(await apiFetch<BulkRefreshProgress>(`/sync/bulk-refresh/${id}`));
    } catch (e) {
      /*
       * YOKLAMA HATASI YUTULMUYOR ama çubuğu da SİLMİYOR: geçici bir ağ
       * hatası, saatlerdir izlenen bir ilerlemeyi ekrandan kaldırmamalı.
       */
      setHata(e instanceof ApiRequestError ? e.message : 'İlerleme okunamadı.');
    }
  }, []);

  useEffect(() => {
    if (!parti) return;
    void yokla(parti);
    const t = setInterval(() => void yokla(parti), 5000);
    return () => clearInterval(t);
  }, [parti, yokla]);

  // Bittiğinde yoklama duruyor ve sayfa tazeleniyor: yeni veri ekranlara
  // yansısın.
  useEffect(() => {
    if (ilerleme?.bitti) router.refresh();
  }, [ilerleme?.bitti, router]);

  const hepsiSecili = secili.size === workspaceler.length && workspaceler.length > 0;

  async function tahminAl(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      setTahmin(
        await apiFetch<BulkRefreshEstimate>('/sync/bulk-refresh', {
          method: 'POST',
          body: JSON.stringify({
            clientIds: [...secili],
            years: yil,
            breakdowns: kirilimlar,
            apply: false,
          }),
        }),
      );
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Tahmin alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function baslat(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<BulkRefreshStarted>('/sync/bulk-refresh', {
        method: 'POST',
        body: JSON.stringify({
          clientIds: [...secili],
          years: yil,
          breakdowns: kirilimlar,
          apply: true,
        }),
      });
      localStorage.setItem('advetics.topluTazeleme', r.batchId);
      setParti(r.batchId);
      setTahmin(null);
      setAcik(false);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Tazeleme başlatılamadı.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * TAKILAN İŞLERİ GERİ KOYAR.
   *
   * Sonuç TEK TEK yazılıyor: "3 iş yeniden başlatıldı" ile "3 iş kapatıldı"
   * aynı şey değil ve kullanıcı ikincisinde o dönemin verisinin gelmeyeceğini
   * bilmeli.
   */
  async function kurtar(): Promise<void> {
    if (!parti) return;
    setBusy(true);
    setHata(null);
    setKurtarmaNotu(null);
    try {
      const r = await apiFetch<BulkRefreshKurtarma>(`/sync/bulk-refresh/${parti}/kurtar`, {
        method: 'POST',
      });
      const parcalar = [
        r.yenidenKuyruklanan > 0 ? `${r.yenidenKuyruklanan} iş yeniden başlatıldı` : null,
        r.kuyrukta > 0 ? `${r.kuyrukta} iş zaten sırada` : null,
        r.vazgecilen > 0 ? `${r.vazgecilen} iş kapatıldı` : null,
        r.kalan > 0 ? `${r.kalan} iş kaldı, tekrar bas` : null,
      ].filter((x): x is string => x !== null);
      setKurtarmaNotu(parcalar.length > 0 ? parcalar.join(' · ') : 'Takılan iş bulunamadı.');
      await yokla(parti);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Takılan işler geri konulamadı.');
    } finally {
      setBusy(false);
    }
  }

  /** İzlemeyi bırakır — işler arka planda sürüyor, yalnızca kutu kapanıyor. */
  function takibiBirak(): void {
    localStorage.removeItem('advetics.topluTazeleme');
    setParti(null);
    setIlerleme(null);
    setKurtarmaNotu(null);
  }

  return (
    <Kart
      baslik="Tüm verileri güncelle"
      eylem={
        !parti && (
          <Dugme ton="ikincil" boyut="kucuk" aria-expanded={acik} onClick={() => setAcik((v) => !v)}>
            {acik ? 'Kapat' : 'Workspace seç'}
          </Dugme>
        )
      }
    >
      <p className="m-0 text-13 text-ink-muted">
        Seçtiğin workspace’lerin geçmiş verisini tek seferde çeker: kampanya yapısı ve günlük metrikler.
        Saatler sürebilir ve platform kotası harcar.
      </p>

      {hata && (
        <div className="mt-3">
          <Serit ton="hata" baslik="İşlem yapılamadı">
            {hata}
          </Serit>
        </div>
      )}

      {/* ── İLERLEME ── */}
      {parti && ilerleme && (
        <div className="mt-4 rounded-alan border border-line bg-surface-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-12">
            {/*
              AŞAMA METNİ YÜZDENİN YANINDA. Yüzde tek başına "neyin %40'ı"
              sorusunu cevaplamıyor ve kullanıcı saatlerce bir sayıya bakıyor.
            */}
            <span className="font-medium text-ink">{ilerleme.asama}</span>
            <span className="text-ink-muted">
              {ilerleme.tamamlanan + ilerleme.dusen} / {ilerleme.toplam} iş
              {ilerleme.kalanSaniye !== null && ` · tahmini ${sureMetni(ilerleme.kalanSaniye)}`}
              {/*
                TAHMİN YOKKEN "hesaplanıyor" YAZILIYOR, boş bırakılmıyor.
                Boş alan "tahmin yok" ile "tahmin sıfır" arasında ayrım
                yapmıyor ve kullanıcı ikincisini bekliyor.
              */}
              {ilerleme.kalanSaniye === null && !ilerleme.bitti && ' · süre hesaplanıyor'}
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${ilerleme.yuzde}%` }}
              role="progressbar"
              aria-valuenow={ilerleme.yuzde}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-12 text-ink-muted">
            <span>
              %{ilerleme.yuzde} · {ilerleme.dateFrom} / {ilerleme.dateTo} ·{' '}
              {ilerleme.clientCount} workspace
            </span>
            <span className="flex items-center gap-3">
              {/*
                DÜŞEN İŞ AYRICA YAZILIYOR. Çubuk %100'e ulaştığında hepsinin
                başarılı olduğu anlamına gelmiyor — düşenler de "bitmiş"
                sayılıyor, yoksa çubuk kalıcı olarak takılırdı.
              */}
              {ilerleme.dusen > 0 && (
                <span className="font-semibold text-danger-strong">{ilerleme.dusen} iş düştü</span>
              )}
              {ilerleme.atlanan > 0 && (
                <span>{ilerleme.atlanan} iş zaten kuyruktaydı</span>
              )}
              {ilerleme.iptal > 0 && <span>{ilerleme.iptal} iş kapatıldı</span>}
              {!ilerleme.bitti && ilerleme.tani === null && <Nokta />}
              {/*
                KAPATMA DÜĞMESİ HER ZAMAN AÇIK.
                Eskiden yalnızca iş bittiğinde çıkıyordu: bitmeyen bir parti
                kutuyu kalıcı olarak ekranda bırakıyordu ve kullanıcının
                yapabileceği hiçbir şey yoktu. İşler arka planda sürüyor,
                kapanan yalnızca takip.
              */}
              <Dugme ton="hayalet" boyut="kucuk" onClick={takibiBirak}>
                {ilerleme.bitti ? 'Kapat' : 'Takibi bırak'}
              </Dugme>
            </span>
          </div>

          {/*
            ═══ DURAN PARTİ AÇIKLANIYOR ═══

            Çubuk %99'da saatlerce durduğunda ekranda hâlâ "İşleniyor"
            yazıyordu ve kullanıcının elinde hiçbir bilgi yoktu. İki hâl
            tamamen farklı: kuyrukta bekleyen iş kendiliğinden koşacak, ama
            kuyruktan düşmüş bir işi kimse almıyor ve o veri hiç gelmiyor.
          */}
          {ilerleme.tani && (
            <div className="mt-3 rounded-[12px] border border-l-4 border-line border-l-danger bg-surface p-3">
              {ilerleme.tani.kayip > 0 ? (
                <>
                  <p className="m-0 text-13 text-ink">
                    <strong>{ilerleme.tani.kayip} iş kuyrukta yok.</strong> Bu işler
                    kendiliğinden başlamıyor, yeniden kuyruğa konması gerekiyor.
                  </p>
                  <Dugme ton="koyu" boyut="kucuk" className="mt-2" onClick={() => void kurtar()} bekliyor={busy}>
                    Takılan işleri yeniden başlat
                  </Dugme>
                </>
              ) : (
                <p className="m-0 text-13 text-ink">
                  {ilerleme.tani.kuyrukta} iş sırada bekliyor. Kota penceresi açılınca
                  kendiliğinden sürecek
                  {ilerleme.tani.enYakinDeneme &&
                    `, en erken ${saatMetni(ilerleme.tani.enYakinDeneme)}`}
                  .
                </p>
              )}
              <p className="mt-1.5 text-12 text-ink-muted">
                Son hareket {gecenSure(ilerleme.tani.sonHareket)}
                {ilerleme.tani.acikToplam > ilerleme.tani.bakilan &&
                  ` · ${ilerleme.tani.acikToplam} açık işin ${ilerleme.tani.bakilan} tanesine bakıldı`}
              </p>
              {kurtarmaNotu && <p className="mt-1.5 text-12 text-ink">{kurtarmaNotu}</p>}
            </div>
          )}

          {ilerleme.dusen > 0 && (
            <p className="mt-2 text-12 text-ink-muted">
              Düşen işlerin sebebi her workspace’in Marka Merkezi › Workspace bilgileri › Veri durumu bölümünde iş bazında yazılı.
            </p>
          )}
        </div>
      )}

      {/* ── SEÇİM ── */}
      {acik && !parti && (
        <div className="mt-4 grid gap-3">
          <div className="flex items-center justify-between">
            <span className="text-12 text-ink-muted">
              {secili.size} / {workspaceler.length} workspace seçildi
            </span>
            <Dugme
              ton="hayalet"
              boyut="kucuk"
              onClick={() =>
                setSecili(hepsiSecili ? new Set() : new Set(workspaceler.map((w) => w.id)))
              }
            >
              {hepsiSecili ? 'Seçimi kaldır' : 'Hepsini seç'}
            </Dugme>
          </div>

          <ul className="m-0 max-h-52 list-none overflow-y-auto rounded-alan border border-line p-1">
            {workspaceler.map((w) => (
              <li key={w.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-alan px-2 py-1.5 hover:bg-surface-sunken">
                  <input
                    type="checkbox"
                    checked={secili.has(w.id)}
                    onChange={() => {
                      const y = new Set(secili);
                      if (y.has(w.id)) y.delete(w.id);
                      else y.add(w.id);
                      setSecili(y);
                      setTahmin(null);
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-14 text-ink">{w.name}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <Alan etiket="Geriye">
                <Secim
                  value={yil}
                  onChange={(e) => {
                    setYil(Number(e.target.value));
                    setTahmin(null);
                  }}
                >
                  <option value={1}>1 yıl</option>
                  <option value={2}>2 yıl</option>
                  <option value={3}>3 yıl</option>
                </Secim>
              </Alan>
            </div>

            <label className="flex items-center gap-2 pb-2.5 text-13 text-ink">
              <input
                type="checkbox"
                checked={kirilimlar}
                onChange={(e) => {
                  setKirilimlar(e.target.checked);
                  setTahmin(null);
                }}
                className="h-4 w-4 accent-[var(--brand-primary)]"
              />
              {/*
                KIRILIM VARSAYILAN KAPALI ve maliyeti YAZILI. Pencere başına
                beş ek platform çağrısı demek; sessizce açık gelmesi kotayı
                iki katına çıkarırdı.
              */}
              Kitle kırılımları da çekilsin (yaş, cinsiyet, şehir…). Kotayı ~2× artırır.
            </label>
          </div>

          {/*
            TAHMİN ÖNCE. Kota geri alınamaz biçimde harcanıyor; kullanıcı kaç
            iş açılacağını görmeden başlatmamalı.
          */}
          {tahmin === null ? (
            <div className="flex justify-end">
              <Dugme
                ton="ikincil"
                onClick={() => void tahminAl()}
                disabled={secili.size === 0}
                bekliyor={busy}
              >
                Ne kadar sürecek?
              </Dugme>
            </div>
          ) : (
            <Serit
              baslik={
                <>
                  {tahmin.accountCount} reklam hesabı için {tahmin.jobCount} iş açılacak: {tahmin.dateFrom} ile{' '}
                  {tahmin.dateTo} arası, {tahmin.windowCount} pencere.
                </>
              }
              eylemler={
                <>
                  <Dugme ton="hayalet" boyut="kucuk" onClick={() => setTahmin(null)} disabled={busy}>
                    Vazgeç
                  </Dugme>
                  <Dugme
                    ton="koyu"
                    boyut="kucuk"
                    onClick={() => void baslat()}
                    disabled={tahmin.accountCount === 0}
                    bekliyor={busy}
                  >
                    Başlat
                  </Dugme>
                </>
              }
            >
              {/*
                YAPI TARAMASI OLMAYAN HESAP SAYISI YAZILI ama iş ATLANMIYOR:
                yapı işi planın ilk adımı ve aynı turda koşuyor.
              */}
              {tahmin.noStructure > 0 &&
                `${tahmin.noStructure} hesabın yapı taraması hiç koşmamış. Önce o çekilecek, metrikler ondan sonra yazılabiliyor. `}
              Bu işlem platform kotası harcıyor ve geri alınamıyor. Kotaya takılan işler düşmüyor, bekliyor.
            </Serit>
          )}
        </div>
      )}
    </Kart>
  );
}

/**
 * Saniyeyi okunur süreye çevirir.
 *
 * "8400 saniye" hiçbir şey söylemiyor; "2 sa 20 dk" kullanıcının bekleyip
 * beklemeyeceğine karar vermesini sağlıyor.
 */
function sureMetni(saniye: number): string {
  if (saniye < 60) return 'bir dakikadan az';
  const dk = Math.round(saniye / 60);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  const kalan = dk % 60;
  return kalan === 0 ? `${sa} sa` : `${sa} sa ${kalan} dk`;
}

/** ISO zamanı saat:dakika olarak yazar — "14:20". */
function saatMetni(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * "2 sa 10 dk önce" — takılmanın NE KADAR sürdüğü.
 *
 * Mutlak saat yazmak kullanıcıya çıkarma yaptırıyor; asıl soru "ne kadardır
 * duruyor".
 */
function gecenSure(iso: string | null): string {
  if (iso === null) return 'yok';
  const saniye = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return `${sureMetni(saniye)} önce`;
}
