import { UyariListesi } from '@/components/ui/uyari';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import {
  kapsananDonemler,
  raporSorgusu,
  sablonAlanlari,
  type ReportData,
  type ReportTemplateSummary,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { SablonSecici } from '@/components/report/sablon-secici';
import { SablonBolumu } from '@/components/report/sablon-yonetimi';
import { PlanCipi } from '@/components/report/rapor-planla';
import { formatDayLong } from '@/lib/format';
import Link from 'next/link';
import { baglanti } from '@/lib/baglanti';
import { SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { SayfaIcDuzen } from '@/components/ui/sayfa-ic-menu';
import { HataDurumu, Serit } from '@/components/ui/hal';
import { dugmeSinifi } from '@/components/ui/dugme';
import { sec, type Dil, type FaturaOzeti } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';
import { menuSatiriEtiketi } from '@/lib/nav-sections';
import { donemMetniDil } from '@/components/report/rapor-metinleri';
import { enEskiGunGerekli, gunEkle, resolveRange, today } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { ReportDocument } from '@/components/report/report-document';
import { ShareControls } from '@/components/report/share-controls';
import { Faturalar } from '@/components/report/faturalar';
import { RaporSekmeleri, type RaporSekmesi } from '@/components/report/rapor-sekmeleri';
import { HaftalikOzetSekmesi } from '@/components/report/haftalik-ozet';

/** Sekme başlığı istek anında, dil çerezden (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/raporlar', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

/**
 * Rapor önizleme ve paylaşım.
 *
 * Ay seçimi TAKVİMSEL, "son 30 gün" gibi kayan değil: rapor bir belge ve
 * müşteriye "Temmuz raporu" gönderiliyor, "son 30 gün raporu" değil. Panelin
 * kayan aralıkları oradaki soru farklı olduğu için doğru — burada yanlış olurdu.
 *
 * ┌─ DÖRT BÖLÜM TEK SAYFADA ──────────────────────────────────────────────┐
 * │ Rapor, şablonlar ve faturalar kenar çubuğunda ayrı üç bağlantıydı.    │
 * │ Hepsi aynı belgenin parçası ve ayrılmaları GERÇEK bir hata            │
 * │ üretiyordu (bkz. `sablon-secici.tsx`). Bugün (onaylı taslak           │
 * │ `#raporlar`, 2026-10-14) Rapor · Haftalık özet · Şablonlar ·          │
 * │ Faturalar SAYFA İÇİ YAN MENÜDE; eksik fatura menüde kırmızı nokta ve  │
 * │ raporun üstünde şerit. "Raporu gönder" başlığın sağında tek birincil  │
 * │ eylem, "PDF indir" yanında ikincil, Planla ve Paylaşım bağlantısı ⋯.  │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const dil = await dilAl();
  const d = sec(raporlarSozlugu, dil).sayfa;
  // Fatura MÜŞTERİYE GİDEN bir belge; yönetimi rapor paylaşma yetkisine bağlı.
  const canShare = hasPermission(session, 'report.share');
  // Şablonun BİÇİMİNİ değiştirmek okumaktan ayrı bir karar: müşteri hesabı
  // (client_viewer) raporu okuyor, düzenlemiyor.
  const canWriteTemplate = hasPermission(session, 'report.write');
  const params = await searchParams;

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.
  const clientId = sayfaWorkspaceId(session, first(params.musteri));

  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran={menuSatiriEtiketi('/raporlar', dil)}
        neden={d.workspaceGerekli}
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  /*
   * KAPSAM YALNIZCA "TÜM ZAMANLAR" SEÇİLİYSE OKUNUYOR.
   *
   * `/metrics/coverage` metrik tablosundaki tarih sınırı olmayan tek sorgu
   * ve üretimde 17,4 saniye sürüyor; panel gibi rapor ekranı da onu HER
   * yüklemede, diğer isteklerden önce bekliyordu. Değeri okuyan tek şey
   * "Tüm zamanlar" ön ayarı (`enEskiGunGerekir`).
   */
  let kapsam: { earliestDate: string | null } | null = null;
  let kapsamHatasi: string | null = null;
  if (enEskiGunGerekli(first(params.aralik) ?? 'gecen_ay')) {
    try {
      kapsam = await serverApiFetch<{ earliestDate: string | null }>(
        `/metrics/coverage?from=2026-01-01&to=2026-01-01`,
      );
    } catch (err) {
      /*
       * BURADA DA `.catch(() => null)` VARDI VE SESSİZDİ. `null` bu değişken
       * için İKİ ANLAM taşıyor: "sorulmadı" (ön ayar gerektirmiyor) ve
       * "soruldu ama düştü". İkisi aynı değere çevrilince "Tüm zamanlar"
       * seçen kullanıcı, en eski tarih okunamadığı için başka bir aralığa
       * düşüyor ve sebebini hiçbir yerde göremiyordu.
       */
      kapsamHatasi = err instanceof Error ? err.message : d.kapsamOkunamadi;
    }
  }

  /*
   * ═══ BUGÜN RAPORA GİRMİYOR ═══
   *
   * Panel ve rapor bu kuralda AYRIŞMIŞTI ve düzeltilmişti: rapor devam eden
   * ayda `to = bugün` alıyordu, panel almıyordu ve iki ekran farklı rakam
   * gösteriyordu.
   *
   * Genel seçicideki "Bu ay" ve "Bugün" ön ayarları bugünü İÇERİYOR — Google
   * Ads'te de öyle ve panelde doğru. Ama rapor bir BELGE ve müşteriye
   * gidiyor: tamamlanmamış bir günü içine almak, gün içinde değişecek
   * rakamları müşteriye göndermek demek. Bu yüzden aralık burada düne
   * kırpılıyor ve kırpıldığı ekranda yazıyor.
   */
  const secilen = resolveRange({
    aralik: first(params.aralik) ?? 'gecen_ay',
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    enEskiGun: kapsam?.earliestDate ?? null,
  });
  const dun = gunEkle(today(), -1);
  const devamEden = secilen.to > dun;
  const from = secilen.from > dun ? dun : secilen.from;
  const to = devamEden ? dun : secilen.to;

  const sekmeParam = first(params.sekme);
  const sekme: RaporSekmesi =
    sekmeParam === 'faturalar' && canShare
      ? 'faturalar'
      : sekmeParam === 'ozet'
        ? 'ozet'
        : sekmeParam === 'sablonlar'
          ? 'sablonlar'
          : 'rapor';

  /*
   * ŞABLON LİSTESİ SEÇİCİYE GİDİYOR.
   *
   * Kayıtlı şablonlar bir zamanlar YALNIZCA ayrı bir sayfada görünüyordu ve
   * rapor ekranı onları hiç tanımıyordu; kullanıcının düzenlemesi raporda ve
   * PDF'te hiç görünmüyordu. Hata yutulmuyor — `.catch(() => [])` "hiç şablon
   * yok" ile "istek düştü" hâllerini aynı boş listeye çevirirdi ve ilki burada
   * TAMAMEN NORMAL bir durum.
   */
  let sablonlar: ReportTemplateSummary[] = [];
  let sablonHatasi: string | null = null;
  try {
    sablonlar = await serverApiFetch<ReportTemplateSummary[]>('/reports/templates');
  } catch (err) {
    sablonHatasi = err instanceof Error ? err.message : d.sablonlarOkunamadi;
  }

  /*
   * ŞABLON URL'DE TEK PARAMETRE, API'DE İKİ ALAN.
   *
   * Değer ya bir ön ayar kodu ('genel', 'google') ya da kayıtlı bir şablonun
   * UUID'si; ayrımı `sablonAlanlari` yapıyor. Ekranda tek parametre olması
   * bilinçli: iki ayrı parametre taşımak, dallardan birinin birini düşürmesi
   * demekti — düzeltilen hata tam olarak buydu (önizleme şablonu taşıyor, PDF
   * taşımıyordu).
   *
   * TANINMAYAN DEĞER ŞABLONSUZ SAYILIYOR. Silinmiş bir şablona işaret eden
   * eski bir bağlantı yüzünden raporun hiç üretilmemesi, sebebi yazmayan boş
   * bir ekran demekti; sunucu bu durumda müşterinin kendi şablonunu, yoksa
   * organizasyon varsayılanını üretiyor.
   */
  const istenenSablon = first(params.sablon) ?? null;
  const alanlar = sablonAlanlari(istenenSablon);
  const sablon = alanlar.templateId ?? alanlar.sablon ?? null;

  const qs = new URLSearchParams(raporSorgusu({ clientId, from, to, sablon }));
  /*
   * HATA YUTULMUYOR. `.catch(() => null)` bu depoda adı konmuş bir yasak ve
   * tam burada duruyordu: 401 (oturum düştü), 403 (yetki yok), 500 (sorgu
   * hatası) ve "API kapalı" hâllerinin hepsi aynı cümleye çevriliyordu.
   * Kullanıcı hangisi olduğunu anlayamıyor, sunucu log'una bakmadan teşhis
   * edilemiyordu.
   */
  let report: ReportData | null = null;
  let raporHatasi: string | null = null;
  /*
   * HAFTALIK ÖZET SEKMESİNDE RAPOR ÜRETİLMİYOR: rapor önizlemesi panelin en
   * ağır sorgularından biri ve özet sekmesi onu göstermiyor; kendi verisini
   * istemcide kendi ucundan çekiyor.
   */
  if (sekme === 'rapor') {
    try {
      report = await serverApiFetch<ReportData>(`/reports/preview?${qs}`);
    } catch (err) {
      raporHatasi = err instanceof Error ? err.message : d.kapsamOkunamadi;
    }
  }

  /*
   * ═══ EKSİK FATURA: YAN MENÜDE KIRMIZI NOKTA, RAPORDA ŞERİT ═══
   *
   * Ajans yüklemeyi unutursa rapor faturasız gider ve kimse fark etmez;
   * kullanıcı kararı "uyar ama gönder". Uyarı SUNUCUDA hesaplanıyor çünkü
   * yan menüdeki nokta Faturalar bölümü açılmadan da görünmeli. Dönem başına
   * bakılıyor (platform başına değil): yalnız Meta'da reklamı olan müşteride
   * "Google faturası eksik" her ay yanlış bir uyarı olurdu. Okunamadıysa
   * "eksik yok" DENMİYOR, nedeni yazıyor.
   */
  const odakDonemler = kapsananDonemler(from, to);
  let faturaEksik: string[] = [];
  let faturaSayisi = 0;
  let faturaHatasi: string | null = null;
  if (canShare) {
    try {
      const faturalar = await serverApiFetch<FaturaOzeti[]>(`/reports/faturalar?clientId=${clientId}`);
      faturaEksik = odakDonemler.filter((d) => !faturalar.some((f) => f.donem === d));
      faturaSayisi = faturalar.filter((f) => odakDonemler.includes(f.donem)).length;
    } catch (err) {
      faturaHatasi = err instanceof Error ? err.message : d.faturalarOkunamadi;
    }
  }

  /*
   * BÖLÜM BAĞLANTILARI MEVCUT PARAMETRELERİ KORUYOR: tarih aralığı ve şablon
   * düşerse bölüm değiştiren kullanıcı başka bir raporu görürdü (CLAUDE.md
   * "BAĞLANTIYI ELLE BİRLEŞTİRME").
   */
  const mevcut: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, first(v)]),
  );
  const faturaHref = baglanti('/raporlar', mevcut, { sekme: 'faturalar' });
  const donemMetniKisa = sekme === 'ozet' ? d.haftalikOzet : `${formatDayLong(from, dil)} - ${formatDayLong(to, dil)}`;

  return (
    <SayfaIskeleti
      bolum={sec(raporlarSozlugu, dil).sekmeler.rapor}
      baslik={menuSatiriEtiketi('/raporlar', dil)}
      aciklama={d.aciklama(donemMetniKisa)}
      eylemler={
        <>
          {/*
            KARŞILAŞTIRMA KAPALI: rapor belgesi yüzde değişim göstermiyor.
            Takvimde de dünden sonrası seçilemiyor. Haftalık özetin dönemi
            kendi hafta seçicisinde, şablonların dönemi yok: orada tarih
            seçici bir şey değiştirmezdi.
          */}
          {(sekme === 'rapor' || sekme === 'faturalar') && (
            <TarihSecici
              aralik={secilen}
              enEskiGun={kapsam?.earliestDate ?? null}
              karsilastirmaVar={false}
              enGecGun={dun}
            />
          )}
          {/*
            BELGE İŞLEMLERİ YALNIZCA BELGE ÜRETİLDİYSE: rapor düştüğünde
            paylaşılacak bir şey yok. "Raporu gönder" birincil, "PDF indir"
            ikincil, Planla ve Paylaşım bağlantısı ⋯ (kullanıcı kararı).
          */}
          {sekme === 'rapor' && report !== null && (
            <ShareControls
              clientId={clientId}
              from={from}
              to={to}
              hasData={report.platforms.length > 0}
              /*
                SEÇİLİ ŞABLON GEÇİYOR: öncesinde `templateId={null}` sabitti
                ve ekranda Google raporunu gören kullanıcı Genel raporu
                indiriyordu.
              */
              sablon={sablon}
              paylasabilir={canShare}
            />
          )}
        </>
      }
    >
      <SayfaIcDuzen
        menu={
          /* Haftalık özet herkese (report.read), faturalar yalnız paylaşım yetkisiyle. */
          <RaporSekmeleri
            aktif={sekme}
            faturalar={canShare}
            faturaEksik={faturaEksik.length > 0 || faturaHatasi !== null}
            sablonSayisi={sablonlar.length}
          />
        }
      >
        {/*
          ═══ UYARILAR TEK KUTUDA, BELGEDEN ÖNCE ═══
          Üçü ayrı ayrı tam genişlikte renkli kutulardı ve aynı anda
          çıkabiliyorlardı (şablon listesi düştü · dönem bitmedi · harcama
          yok); ikisi belgenin ALTINDA, biri üstünde duruyordu.
        */}
        {sekme === 'rapor' && (
          <Uyarilar
            satirlar={[
              kapsamHatasi !== null ? <>{d.uyariKapsam}</> : null,
              sablonHatasi !== null ? <>{d.uyariSablon}</> : null,
              devamEden ? (
                <>
                  {d.devamEdenOn}
                  <strong>{d.devamEdenKalin}</strong>
                  {d.devamEdenSon(formatDayLong(to, dil))}
                </>
              ) : null,
              report !== null && report.platforms.length === 0 ? <>{d.uyariHarcamaYok}</> : null,
            ]}
          />
        )}

        {sekme === 'ozet' ? (
          <HaftalikOzetSekmesi
            clientId={clientId}
            haftaParam={first(params.hafta)}
            // Ajans görünümü (sinyaller, bekleyen işler) yalnız rule.read ile;
            // sunucu da ayrıca reddediyor (OZET_AJANS_IZNI).
            ajansGorur={hasPermission(session, 'rule.read')}
            planYetkisi={canShare}
          />
        ) : sekme === 'sablonlar' ? (
          <SablonBolumu
            sablonlar={sablonlar}
            sablonHatasi={sablonHatasi}
            musteriler={session.availableClients.map((c) => ({ id: c.id, name: c.name }))}
            isOrgAdmin={session.isOrgAdmin}
            duzenleyebilir={canWriteTemplate}
          />
        ) : sekme === 'faturalar' ? (
          <FaturaSekmesi
            clientId={clientId}
            clientName={musteriAdi(session, clientId, 'Workspace')}
            odakDonemler={odakDonemler}
            dil={dil}
          />
        ) : (
          <>
            {/*
              ŞABLON VE PLAN ÇİP OLARAK, BELGENİN ÜSTÜNDE: önce "hangi rapor",
              sonra belge. Düzenleme Şablonlar bölümünde; çip yalnız seçiyor.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <SablonSecici secili={sablon} sablonlar={sablonlar} duzenleyebilir={canWriteTemplate} />
              {canShare && <PlanCipi clientId={clientId} templateId={alanlar.templateId ?? null} />}
              <span className="flex-1" />
              <span className="text-12 text-ink-muted">
                {d.onizlemeAyni}
                {canShare && faturaEksik.length === 0 && faturaHatasi === null && faturaSayisi > 0
                  ? d.faturaMaileEklenecek(faturaSayisi)
                  : ''}
              </span>
            </div>

            {canShare && faturaHatasi !== null && (
              <Serit ton="hata" baslik={d.faturalarOkunamadiBaslik}>
                {d.faturasizGidebilir(faturaHatasi)}
              </Serit>
            )}
            {canShare && faturaEksik.length > 0 && (
              <Serit
                baslik={d.faturaYuklenmedi(faturaEksik.map((x) => donemMetniDil(x, dil)).join(', '))}
                eylemler={
                  <Link className={dugmeSinifi('ikincil', 'kucuk')} href={faturaHref}>
                    {d.faturaYukle}
                  </Link>
                }
              >
                {d.faturasizGider}
              </Serit>
            )}

            {report === null ? (
              /* "API çalışıyor mu?" müşterinin okuduğu ekranda hem anlamsız hem
                 ürkütücü. Sunucunun kendi cümlesi teşhis için yeterli. */
              <HataDurumu baslik={d.raporOlusturulamadi} mesaj={raporHatasi ?? d.sunucuSebepYok} />
            ) : (
              /* Önizleme müşterinin göreceğinin BİREBİR aynısı: aynı bileşen,
                 aynı veri. Ayrı bir "önizleme görünümü" yazmak, gönderilen
                 belgeyle ekranda görülenin zamanla ayrışması demek olurdu.
                 Zemin bilerek beyaz: belge PDF'in aynası ve karanlık temada da
                 kâğıt gibi okunmalı. */
              /* overflow-x-auto, hidden DEĞİL: taşan bir parça (uzun kampanya adı,
                 geniş tablo) sessizce kesilmek yerine kaydırılarak okunur. */
              <div className="overflow-x-auto rounded-kart border border-line bg-white">
                <ReportDocument data={report} />
              </div>
            )}
          </>
        )}
      </SayfaIcDuzen>
    </SayfaIskeleti>
  );
}

/**
 * FATURA SEKMESİ — ayın tamamı.
 *
 * Bir zamanlar `/raporlar/faturalar` sayfasıydı; içeriği olduğu gibi taşındı.
 * "Neden otomatik gelmiyor" açıklaması BURADA KALIYOR: kullanıcı sormadan
 * cevabı görmeli, yoksa her ay yükleme yapan kişi bunu bir eksiklik sanar.
 */
function FaturaSekmesi({
  clientId,
  clientName,
  odakDonemler,
  dil,
}: {
  clientId: string;
  clientName: string;
  /** Ekrandaki dönemin ayları: o ayın faturası eksikse bölümde de yazıyor. */
  odakDonemler: string[];
  dil: Dil;
}) {
  const d = sec(raporlarSozlugu, dil).faturaSekmesi;
  return (
    <div className="grid gap-4">
      <p className="m-0 text-13 text-ink-muted">
        {d.altBaslik(clientName)}
      </p>

      <div className="grid gap-1 rounded-kart border border-line bg-surface-muted px-4 py-3 text-12 text-ink-muted">
        <p className="m-0 text-13 font-semibold text-ink">{d.neden}</p>
        <p className="m-0">
          {d.googleOn}
          <strong>{d.googleKalin}</strong>
          {d.googleSon}
        </p>
      </div>

      <Faturalar clientId={clientId} odakDonemler={odakDonemler} canWrite />
    </div>
  );
}

/**
 * Uyarı listesi — hepsi TEK kutuda.
 *
 * `null` satırlar eleniyor ve hiç satır kalmazsa kutu da çizilmiyor: boş bir
 * çerçeve, kullanıcıya okunacak bir şey varmış gibi görünüyor.
 */
function Uyarilar({ satirlar }: { satirlar: Array<React.ReactNode | null> }) {
  // Görünüş ortak bileşende (`UyariListesi`): renk ikonda, zeminde değil.
  return <UyariListesi satirlar={satirlar} />;
}

function musteriAdi(
  session: { availableClients: Array<{ id: string; name: string }> },
  clientId: string,
  yedek: string,
): string {
  return session.availableClients.find((c) => c.id === clientId)?.name ?? yedek;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
