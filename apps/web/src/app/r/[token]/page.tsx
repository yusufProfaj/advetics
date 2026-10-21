import type { Metadata } from 'next';
import Link from 'next/link';
import { sec, type PaylasilanRapor } from '@advetics/shared';
import { API_URL } from '@/lib/api';
import { ReportDocument } from '@/components/report/report-document';
import { PrintButton } from '@/components/report/print-button';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { BosDurum, Serit } from '@/components/ui/hal';
import { dugmeSinifi } from '@/components/ui/dugme';
import { TarihSecici } from '@/components/tarih-secici';
import { dilAl } from '@/dil/sunucu';
import { raporLinkiSozlugu } from '@/dil/sozlukler/rapor-linki';
import { today } from '@/lib/date-range';
import {
  PAYLASIM_ON_AYARLARI,
  gunYazisi,
  paylasilanAralik,
  paylasimSecimiCoz,
} from '@/lib/paylasim-araligi';

/**
 * Müşteriye gönderilen rapor — OTURUM GEREKTİRMEZ.
 *
 * `/r` yolu middleware'in genel erişim listesinde. Erişim kontrolü URL'deki
 * token: sunucu onu hash'leyip tek satır çekiyor.
 *
 * `force-dynamic`: paylaşım linki görüntüleme sayacını artırıyor ve rapor
 * verisi geri düzeltmeyle değişebiliyor. Önbelleğe almak müşteriye bayat sayı
 * göstermek olurdu.
 *
 * DÖNEMİ AÇAN KİŞİ SEÇEBİLİYOR (kullanıcı kararı 2026-10-21): adreste aralık
 * yoksa ajansın paylaştığı dönem, varsa o. Workspace ve şablon token'dan;
 * sınır sunucuda (`paylasimAraligiKarari`), sayfa aynı fonksiyonla önceden
 * bakıp nedeni kişinin dilinde yazıyor. Beyaz etiket alan adı da bu sayfayı
 * açıyor (middleware `/r/` yolunu sorgu dizgesiyle geçiriyor).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rapor',
  // Rapor müşteri verisi içeriyor: arama motorlarına girmemesi gerekiyor.
  // Link "gizli" ama gizlilik dizine eklenmemekle desteklenmeli.
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

type Sonuc = PaylasilanRapor | { error: 'gone' | 'notfound' } | { error: 'aralik'; mesaj: string };

/**
 * Raporu doğrudan API'den çekiyor.
 *
 * `serverApiFetch` kullanılmıyor: o yardımcı oturum cookie'sini iletiyor ve
 * burada oturum YOK. Kimliksiz bir istek göndermek doğru davranış — token
 * yolun kendisinde.
 *
 * 400 AYRI bir hâl: sayfa sınırı önceden denetliyor, yine de sunucu
 * reddederse (gece yarısı saat farkı) bu "rapor bulunamadı" DEĞİL; sayfa
 * paylaşılan dönemi açıp sunucunun cümlesini yazıyor.
 */
async function fetchReport(token: string, aralik?: { from: string; to: string }): Promise<Sonuc> {
  const sorgu = aralik ? `?from=${aralik.from}&to=${aralik.to}` : '';
  const res = await fetch(`${API_URL}/reports/shared/${encodeURIComponent(token)}${sorgu}`, {
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return { error: 'notfound' };
  if (res.status === 410) return { error: 'gone' };
  if (res.status === 400) {
    const govde = (await res.json().catch(() => null)) as { message?: unknown } | null;
    return { error: 'aralik', mesaj: typeof govde?.message === 'string' ? govde.message : String(res.status) };
  }
  if (!res.ok) return { error: 'notfound' };
  return (await res.json()) as PaylasilanRapor;
}

/** Next sorgu değeri dizi de olabilir (`?aralik=a&aralik=b`): ilki. */
function tek(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SharedReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const q = await searchParams;
  const dil = await dilAl();
  const d = sec(raporLinkiSozlugu, dil);

  const secim = paylasimSecimiCoz(
    { aralik: tek(q.aralik), baslangic: tek(q.baslangic), bitis: tek(q.bitis) },
    today(),
    dil,
  );
  let aralikHatasi = secim.tur === 'hata' ? secim.neden : null;
  let result = await fetchReport(token, secim.tur === 'secim' ? secim.aralik : undefined);
  let secimGecerli = secim.tur === 'secim';
  if ('error' in result && result.error === 'aralik') {
    aralikHatasi = result.mesaj;
    secimGecerli = false;
    result = await fetchReport(token);
  }

  if ('error' in result) {
    /*
     * ORTAK SAYFA BAŞLIĞI (`SayfaBasligi`), elle `h1` değil: müşterinin
     * gördüğü tek panel ekranı bu ve yazı tipi panelle aynı olmalı. İki
     * hâl ayrı cümle: "süresi doldu" yeni bağlantı istemeye, "bulunamadı"
     * adresi kontrol etmeye gönderiyor.
     */
    const metin = result.error === 'gone' ? d.doldu : d.yok;
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-md">
          <SayfaBasligi baslik={metin.baslik} aciklama={metin.aciklama} />
        </div>
      </main>
    );
  }

  const p = result.paylasim;
  const aralik = secimGecerli && secim.tur === 'secim' ? secim.aralik : paylasilanAralik(p.varsayilanFrom, p.varsayilanTo, dil);
  const donem = (from: string, to: string) => `${gunYazisi(from, dil)} - ${gunYazisi(to, dil)}`;
  const paylasilanDonem = donem(p.varsayilanFrom, p.varsayilanTo);
  const gosterilenDonem = donem(result.from, result.to);
  const paylasilanaDon = (
    <Link href={`/r/${encodeURIComponent(token)}`} className={dugmeSinifi('ikincil', 'kucuk')}>
      {d.paylasilanaDon}
    </Link>
  );
  /*
   * BOŞ DÖNEM BELGE OLARAK ÇİZİLMİYOR: sıfırlarla dolu bir rapor "o dönemde
   * reklam yoktu" diye okunuyor, oysa veri hiç çekilmemiş de olabilir.
   * Sunucu bu durumda `veriAraligi`ni dolduruyor (`null` = sınır içinde
   * hiç yok).
   */
  const bos = result.daily.length === 0;

  return (
    <main className="min-h-screen bg-surface-muted py-8 print:bg-white print:py-0">
      {/*
        Araç çubuğu ve şeritler basılan çıktıda görünmüyor. `rpt-noprint`
        kuralı `ReportDocument`in içinde; boş dönemde belge çizilmiyor, o
        yüzden `print:hidden` da var.
      */}
      <div className="rpt-noprint mx-auto print:hidden mb-4 grid max-w-[880px] grid-cols-1 gap-3 px-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 min-w-0 text-12 text-ink-muted">{result.client.name}</p>
          {/*
            SAĞA HİZALI, telefonda da: seçicinin açılır paneli çipin SAĞ
            kenarına bağlı. Telefonda çip sola düşünce panel ekranın 59 px
            dışına taşıyordu (canlı ölçüm).
          */}
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <TarihSecici
              aralik={aralik}
              enEskiGun={null}
              karsilastirmaVar={false}
              onAyarlar={PAYLASIM_ON_AYARLARI}
              paylasilan={{ from: p.varsayilanFrom, to: p.varsayilanTo }}
              enErkenGun={p.enErken}
              enGecGun={p.enGec}
              sinirNotu={d.sinir(gunYazisi(p.enErken, dil), gunYazisi(p.enGec, dil), p.enUzunGun)}
            />
            <PrintButton etiket={d.pdf} />
          </div>
        </div>

        {aralikHatasi && (
          <Serit ton="hata" baslik={d.aralikHatasi}>
            {aralikHatasi} {d.aralikHatasiSonu}
          </Serit>
        )}
        {secimGecerli && (
          <Serit ton="bilgi" baslik={d.farkliDonemBaslik} eylemler={paylasilanaDon}>
            {d.farkliDonem(paylasilanDonem, gosterilenDonem)}
          </Serit>
        )}
      </div>

      {bos ? (
        <div className="mx-auto max-w-[880px] px-4 sm:px-8">
          {/* "Paylaşılan döneme dön" üstteki şeritte; burada ikinci kez yok. */}
          <BosDurum
            baslik={d.bos.baslik}
            neden={
              p.veriAraligi
                ? d.bos.veriVar(gosterilenDonem, gunYazisi(p.veriAraligi.from, dil), gunYazisi(p.veriAraligi.to, dil))
                : d.bos.hicYok(gosterilenDonem, gunYazisi(p.enErken, dil))
            }
          />
        </div>
      ) : (
        /* GÖLGE YOK (kart kalıbı): belge çizgiyle ayrılıyor; baskıda çizgi de yok. */
        <div className="mx-auto max-w-[880px] border border-line print:max-w-none print:border-0">
          <ReportDocument data={result} />
        </div>
      )}
    </main>
  );
}
