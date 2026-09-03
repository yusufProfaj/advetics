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
import { formatDayLong } from '@/lib/format';
import { gunEkle, resolveRange, today } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { ReportDocument } from '@/components/report/report-document';
import { ShareControls } from '@/components/report/share-controls';
import { Faturalar } from '@/components/report/faturalar';
import { RaporSekmeleri } from '@/components/report/rapor-sekmeleri';

export const metadata = { title: 'Raporlar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Rapor önizleme ve paylaşım.
 *
 * Ay seçimi TAKVİMSEL, "son 30 gün" gibi kayan değil: rapor bir belge ve
 * müşteriye "Temmuz raporu" gönderiliyor, "son 30 gün raporu" değil. Panelin
 * kayan aralıkları oradaki soru farklı olduğu için doğru — burada yanlış olurdu.
 *
 * ┌─ ÜÇ EKRAN TEK SAYFADA ────────────────────────────────────────────────┐
 * │ Rapor, şablonlar ve faturalar kenar çubuğunda ayrı üç bağlantıydı.    │
 * │ Üçü de aynı belgenin parçası ve ayrılmaları GERÇEK bir hata           │
 * │ üretiyordu — bkz. `sablon-secici.tsx`. Şablon düzenleme seçicinin     │
 * │ içinde, faturalar sekme olarak burada.                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  // Fatura MÜŞTERİYE GİDEN bir belge; yönetimi rapor paylaşma yetkisine bağlı.
  const canShare = hasPermission(session, 'report.share');
  // Şablonun BİÇİMİNİ değiştirmek okumaktan ayrı bir karar: müşteri hesabı
  // (client_viewer) raporu okuyor, düzenlemiyor.
  const canWriteTemplate = hasPermission(session, 'report.write');
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Rapor müşteri bazında üretiliyor. Üstteki seçiciden bir müşteri seçin.
        </p>
      </div>
    );
  }

  const kapsam = await serverApiFetch<{ earliestDate: string | null }>(
    `/metrics/coverage?from=2026-01-01&to=2026-01-01`,
  ).catch(() => null);

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

  const sekme = first(params.sekme) === 'faturalar' && canShare ? 'faturalar' : 'rapor';

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
    sablonHatasi = err instanceof Error ? err.message : 'Şablonlar alınamadı';
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
  const report = await serverApiFetch<ReportData>(`/reports/preview?${qs}`).catch(() => null);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Raporlar</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatDayLong(from)} — {formatDayLong(to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            KARŞILAŞTIRMA KAPALI: rapor belgesi yüzde değişim göstermiyor.
            Çalışmayan bir düğme koymak olmayan bir özellik vaat etmek olurdu.
            Takvimde de dünden sonrası seçilemiyor.
          */}
          {/*
            ŞABLON SEÇİCİ TARİHİN SOLUNDA: önce "hangi rapor", sonra "hangi
            dönem". Ters sıra, dönem seçip şablonu değiştirince aralığın
            sıfırlandığı izlenimi veriyordu.

            YALNIZCA RAPOR SEKMESİNDE. Fatura sekmesinde şablonun hiçbir
            karşılığı yok; orada da göstermek, hiçbir şeyi değiştirmeyen bir
            seçici bırakmak olurdu.
          */}
          {sekme === 'rapor' && (
            <SablonSecici
              secili={sablon}
              sablonlar={sablonlar}
              musteriler={session.availableClients.map((c) => ({ id: c.id, name: c.name }))}
              isOrgAdmin={session.isOrgAdmin}
              duzenleyebilir={canWriteTemplate}
            />
          )}
          <TarihSecici
            aralik={secilen}
            enEskiGun={kapsam?.earliestDate ?? null}
            karsilastirmaVar={false}
            enGecGun={dun}
          />
        </div>
      </header>

      {/*
        SEKMELER YALNIZCA FATURA YETKİSİ VARSA. Tek sekmelik bir sekme çubuğu
        gösterecek bir şey değil, kullanıcıya olmayan bir seçim sunmak olurdu.
      */}
      {canShare && <RaporSekmeleri aktif={sekme} />}

      {sablonHatasi !== null && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          Şablon listesi alınamadı ({sablonHatasi}). Rapor varsayılan şablonla
          üretiliyor; kayıtlı şablonların bu listede görünmüyor.
        </div>
      )}

      {sekme === 'faturalar' ? (
        <FaturaSekmesi clientId={clientId} clientName={musteriAdi(session, clientId)} />
      ) : report === null ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          Rapor oluşturulamadı. API çalışıyor mu?
        </div>
      ) : (
        <>
          {/*
            ÜÇ YOL, TEK YER. "PDF indir" ve "Paylaş" yan yana, paylaşım
            panelinin sağında. Öncesinde indirme sayfanın üstünde ayrı bir
            satırdaydı ve "Müşteriye gönder" de oradaydı: raporla ilgili bir
            şey yapmak için kullanıcı iki ayrı yere bakıyordu.

            Yan yana ama AYNI DÜĞME DEĞİL: indirmek belgeyi kendine almak,
            paylaşmak müşteriye ulaştırmak. İkisini tek menüye koymak farklı
            iki işi aynı başlık altında toplardı.
          */}
          <ShareControls
            clientId={clientId}
            from={from}
            to={to}
            hasData={report.platforms.length > 0}
            /*
              SEÇİLİ ŞABLON ARTIK GEÇİYOR — düzeltilen hata buydu.
              Öncesinde `templateId={null}` sabitti: ekranda Google raporunu
              gören kullanıcı Genel raporu indiriyordu ve bunu ancak PDF'i
              AÇINCA anlıyordu. Hiçbir hata da vermiyordu, çünkü şablonsuz
              istek de geçerli bir istek.
            */
            sablon={sablon}
          />

          {/*
            FATURA KUTUSU PAYLAŞIM PANELİNİN ALTINDA ve ekrandaki DÖNEMİ
            biliyor: hangi ayın faturasının gerektiği tarih seçicisinden
            belli, kullanıcı ayı elle yazmıyor ve yanlış aya yükleme riski
            düşüyor. Eksikse burada uyarı çıkıyor — rapor gönderilmeden ÖNCE.

            SEKMEDEKİ TOPLU LİSTEYLE ÇAKIŞMIYOR: burası "bu dönemin faturası"
            için hızlı yol, sekme ise ayın tamamını tek yerden yönetmek için.
            İkisi AYNI bileşen — ayrı yazılsalardı biri PDF doğrulamasını ya da
            çoklu yükleme kuralını kaybederdi.
          */}
          {canShare && (
            <Faturalar clientId={clientId} odakDonemler={kapsananDonemler(from, to)} canWrite />
          )}

          {devamEden && (
            <div className="rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
              Seçilen dönem <strong>henüz bitmedi</strong>. Rapor {formatDayLong(to)} tarihine
              kadar olan tamamlanmış günleri kapsıyor; bugünün verisi gün içinde değiştiği için
              dâhil edilmedi — panelde de aynı kural geçerli.
            </div>
          )}

          {report.platforms.length === 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              Bu dönemde harcama kaydı yok — rapor boş görünecek. Senkronizasyonun
              bu tarihleri kapsadığından emin olun.
            </div>
          )}

          {/* Önizleme müşterinin göreceğinin BİREBİR aynısı: aynı bileşen,
              aynı veri. Ayrı bir "önizleme görünümü" yazmak, gönderilen
              belgeyle ekranda görülenin zamanla ayrışması demek olurdu. */}
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <ReportDocument data={report} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * FATURA SEKMESİ — ayın tamamı.
 *
 * Bir zamanlar `/raporlar/faturalar` sayfasıydı; içeriği olduğu gibi taşındı.
 * "Neden otomatik gelmiyor" açıklaması BURADA KALIYOR: kullanıcı sormadan
 * cevabı görmeli, yoksa her ay yükleme yapan kişi bunu bir eksiklik sanar.
 */
function FaturaSekmesi({ clientId, clientName }: { clientId: string; clientName: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {clientName} · platform faturaları rapor mailine ayrı ek olarak gider
      </p>

      <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-xs text-ink-muted">
        <p className="font-medium text-ink">Faturalar neden otomatik gelmiyor?</p>
        <p className="mt-1">
          Google’ın fatura API’si yalnızca <strong>aylık faturalama</strong> (kredi hattı) olan
          hesaplarda çalışıyor; kartla ödeyen hesaplarda çağrı reddediliyor. Meta’da ise fatura
          PDF’i döndüren bir uç bulunmuyor — yalnızca fatura kaydı okunabiliyor. Bu yüzden belge
          platformdan indirilip buraya yükleniyor.
        </p>
      </div>

      <Faturalar clientId={clientId} canWrite baslikGoster={false} />
    </div>
  );
}

function musteriAdi(
  session: { availableClients: Array<{ id: string; name: string }> },
  clientId: string,
): string {
  return session.availableClients.find((c) => c.id === clientId)?.name ?? 'Müşteri';
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
