import { varsayilanSablon, type ReportData } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { SablonSecici } from '@/components/report/sablon-secici';
import { formatDayLong } from '@/lib/format';
import { gunEkle, resolveRange, today } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { ReportDocument } from '@/components/report/report-document';
import { ShareControls } from '@/components/report/share-controls';

export const metadata = { title: 'Raporlar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Rapor önizleme ve paylaşım.
 *
 * Ay seçimi TAKVİMSEL, "son 30 gün" gibi kayan değil: rapor bir belge ve
 * müşteriye "Temmuz raporu" gönderiliyor, "son 30 gün raporu" değil. Panelin
 * kayan aralıkları oradaki soru farklı olduğu için doğru — burada yanlış olurdu.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId = first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

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

  /*
   * ŞABLON URL'DEN OKUNUYOR ve doğrulama `varsayilanSablon` içinde: bilinmeyen
   * bir kod genel şablona düşüyor. Adres çubuğuna elle yazılan bir değerin
   * raporu boş bırakması, hata mesajı olmayan bir arıza olurdu.
   */
  const secilenSablon = first(params.sablon);
  const sablon = varsayilanSablon(secilenSablon).kod;

  const qs = new URLSearchParams({ clientId, from, to });
  /*
   * ŞABLON YALNIZCA KULLANICI SEÇTİYSE GÖNDERİLİYOR.
   *
   * Koşulsuz göndermek, org varsayılanı olarak KAYDEDİLMİŞ bir şablonun
   * bölüm sırasını sessizce eziyordu: kullanıcı Rapor Şablonları ekranında
   * yaptığı düzenlemeyi raporda hiç göremiyordu. Seçici yine "Genel Rapor"
   * yazıyor — kayıtlı şablon da genel raporun bir biçimi.
   */
  if (secilenSablon) qs.set('sablon', sablon);
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
        */}
        <SablonSecici secili={sablon} />
        <TarihSecici
          aralik={secilen}
          enEskiGun={kapsam?.earliestDate ?? null}
          karsilastirmaVar={false}
          enGecGun={dun}
        />
        </div>
      </header>

      {report === null ? (
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
              ŞABLON GÖNDERİLMİYOR — paylaşım bağlantısındaki kararın aynısı.
              Ekrandaki seçici bir KOD taşıyor ('genel', 'google'), planlama
              tablosu ise şablon UUID'si. İkisini birbirine çevirmek, kullanıcı
              varsayılan bir şablona bakarken kaydedilecek bir UUID
              olmaması demek. Sunucu müşteriye özel şablonu bulup yoksa
              varsayılanı üretiyor; planlanan rapor da o yolu izliyor.
            */
            templateId={null}
          />

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

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
