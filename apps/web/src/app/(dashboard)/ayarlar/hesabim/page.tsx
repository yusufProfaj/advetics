import type {
  EmailAccountSummary,
  IkiAdimDurumu,
  OkumaAnahtariOzeti,
  OkumaAraciTanimi,
} from '@advetics/shared';
import { ayarSekmesiAdi, kapiNedeni, rolEtiketi, sahipEtiketi, sec } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { kapi } from '@/lib/panel-adresleri';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Kart } from '@/components/ui/kart';
import { HataDurumu, Serit } from '@/components/ui/hal';
import { AyarKapsami } from '@/components/ayar-kapsam';
import { HesabimBolumleri, type HesabimBolumu } from '@/components/hesap/hesabim-bolumleri';
import { IkiAdimPaneli } from '@/components/hesap/iki-adim-paneli';
import { DilAyari } from '@/components/hesap/dil-ayari';
import { EpostaAyarlari } from '@/components/email/eposta-ayarlari';
import { OkumaApiPaneli } from '@/components/okuma-api/okuma-api-paneli';
import { dilAl } from '@/dil/sunucu';
import { hesabimSozlugu } from '@/dil/sozlukler/ayarlar-hesabim';

/** Sekme başlığı = sayfa başlığı = sözleşmedeki sekme adı (`ayarSekmesiAdi`, `ayarlar.spec.ts`). */
export async function generateMetadata() {
  return { title: `${ayarSekmesiAdi('hesabim', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

/** Platformun kendi cümlesi ekranda görünmeli; kod ve HTTP durumu teşhis için. */
function hataMetni(err: unknown, bilinmeyen: string): string {
  return err instanceof ApiRequestError
    ? `${err.message} (${err.code}, HTTP ${err.status})`
    : err instanceof Error
      ? err.message
      : bilinmeyen;
}

/**
 * ═══ HESABIM — KİŞİNİN KENDİ AYARLARI (Ayarlar'ın dördüncü sekmesi) ═══
 *
 * ÜÇ KİŞİSEL EKRAN TEK SAYFADA (2026-10-13): iki adımlı doğrulama
 * (`/hesabim`), rapor gönderen e-posta ve imza (`/ayarlar/e-posta`) ve okuma
 * API anahtarları (`/ayarlar/okuma-api`). Üçü de "başkasının ayarı" kavramı
 * taşımıyor: herkes yalnız kendi satırını görüyor ve değiştiriyor.
 *
 * HERKESE AÇIK, MENÜDE DEĞİL (MIMARI Ç-1). Müşteri hesabı (client_viewer)
 * Ayarlar'ı görmüyor (dört ekran kilidi) ama 2FA'sını buradan açıyor; kapı
 * kenar çubuğundaki ad kartı. Kartların kendi kapısı var: e-posta
 * `eposta.duzenle` (rapor gönderebilen), okuma API `okumaApi.yonet` (yalnız
 * platform sahibi — kartın VARLIĞI bile ona ait bir bilgi, başkasına neden
 * yazmıyoruz, kart hiç çizilmiyor).
 */
export default async function HesabimSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const d = sec(hesabimSozlugu, dil).sayfa;
  const epostaAcik = kapi(session, 'eposta.duzenle');
  const okumaApiAcik = kapi(session, 'okumaApi.yonet');

  /*
   * HATA YUTULMUYOR, AMA BİRİ DÜŞÜNCE DİĞERLERİ ÇİZİLİYOR (`allSettled`).
   * "2FA kapalı" ile "durum okunamadı" aynı ekran olamaz: ilki "Aç"a,
   * ikincisi beklemeye yönlendiriyor. "Ayar yok" ile "okunamadı" e-postada,
   * "anahtarın yok" ile "liste okunamadı" okuma API'de aynı ayrım.
   */
  const [ikiAdim, eposta, anahtarlar, araclar] = await Promise.allSettled([
    serverApiFetch<IkiAdimDurumu>('/auth/2fa'),
    /* `?? null`: ayar yoksa uç BOŞ GÖVDE ile 200 dönüyor ve istemci `undefined` veriyor. */
    epostaAcik
      ? serverApiFetch<EmailAccountSummary | null>('/me/email-account').then((x) => x ?? null)
      : Promise.resolve<EmailAccountSummary | null>(null),
    okumaApiAcik
      ? serverApiFetch<OkumaAnahtariOzeti[]>('/okuma-api/anahtarlar')
      : Promise.resolve<OkumaAnahtariOzeti[]>([]),
    okumaApiAcik
      ? serverApiFetch<OkumaAraciTanimi[]>('/okuma-api/araclar')
      : Promise.resolve<OkumaAraciTanimi[]>([]),
  ]);

  /*
   * KIRMIZI NOKTALAR (taslak `#hesabim`): yapılacak iş olan bölüm menüde
   * işaretli. E-posta: doğrulanmamış ya da OKUNAMAMIŞ ayar (ikisinde de
   * rapor maili gidemez). Güvenlik: durum okunamadı, şirket zorunlu tutuyor
   * ama kapalı ya da kurtarma koduyla girildi (yeni kod üretmeli).
   */
  const epostaUyari =
    epostaAcik && (eposta.status === 'rejected' || eposta.value === null || eposta.value.verifiedAt == null);
  const guvenlikUyari =
    ikiAdim.status === 'rejected' ||
    (ikiAdim.value.sirketteZorunlu && !ikiAdim.value.acik) ||
    params.kurtarma === '1';

  /*
   * MENÜ SATIRLARI içerikten AYRI bir liste: bölümlerin kendisi aşağıda JSX
   * olarak duruyor ve kapıları (`okumaApiAcik`) orada, içeriğin hemen
   * önünde. Okuma API kartının VARLIĞI bile platform sahibine ait bir bilgi;
   * satırı ile kartı aynı kapıdan geçiyor.
   */
  const bolumler: HesabimBolumu[] = [
    { deger: 'guvenlik', etiket: d.girisVeGuvenlik, uyari: guvenlikUyari },
    { deger: 'e-posta', etiket: d.eposta, uyari: epostaUyari },
    ...(okumaApiAcik
      ? [
          {
            deger: 'okuma-api',
            etiket: d.okumaApi,
            sayi:
              anahtarlar.status === 'fulfilled'
                ? anahtarlar.value.filter((a) => a.durum === 'etkin').length
                : undefined,
            uyari: anahtarlar.status === 'rejected' || araclar.status === 'rejected',
          },
        ]
      : []),
  ];

  /*
   * KENDİ SAYFASI, AYARLAR'IN BÖLÜMÜ DEĞİL (taslak "Bugünden farkı"):
   * kullanıcı kartından açılıyor ve Ayarlar'ın yan menüsünü taşımıyor;
   * kendi üç bölümü var. Adres aynı kaldı (`/ayarlar/hesabim`): kullanıcı
   * menüsü, eski adres yönlendirmeleri ve 2FA girişindeki "kurtarma"
   * dönüşü bu adrese bağlı.
   *
   * GENİŞLİK Ayarlar ile aynı (panelin geniş düzeni): kullanıcı Ayarlar'dan
   * buraya geçtiğinde içerik kaymasın.
   */
  return (
    <div className="grid w-full gap-6">
      <SayfaBasligi
        ust={<AyarKapsami duzey="kisi" ad={session.user.fullName ?? session.user.email} />}
        baslik={ayarSekmesiAdi('hesabim', dil)}
        aciklama={d.aciklama}
      />
      <HesabimBolumleri bolumler={bolumler}>
        <section id="guvenlik" className="grid scroll-mt-24 gap-5">
          <Kart baslik={d.hesap}>
            <dl className="m-0 grid gap-x-6 gap-y-2 text-14 sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-muted">{d.ad}</dt>
              <dd className="m-0 text-ink">{session.user.fullName}</dd>
              <dt className="text-ink-muted">{d.eposta}</dt>
              <dd className="m-0 break-all text-ink">{session.user.email}</dd>
              <dt className="text-ink-muted">{d.rol}</dt>
              <dd className="m-0 text-ink">{session.platformAdmin ? sahipEtiketi(dil) : rolEtiketi(session.rol, dil)}</dd>
            </dl>
          </Kart>
          <Kart>
            <DilAyari />
          </Kart>
          {ikiAdim.status === 'fulfilled' ? (
            <IkiAdimPaneli durum={ikiAdim.value} kurtarmaIleGirdi={params.kurtarma === '1'} />
          ) : (
            <HataDurumu baslik={d.guvenlikOkunamadi} mesaj={hataMetni(ikiAdim.reason, d.bilinmeyenHata)} />
          )}
        </section>

        <section id="e-posta" className="grid scroll-mt-24 gap-4">
          {/*
            Rapor müşteriye danışmanın KENDİ adresinden gidiyor: müşteri
            "yanıtla" dediğinde ona ulaşmalı ve mail onun imzasını taşımalı.
            Yönetici kimsenin adına kuramıyor: satır o kişinin uygulama
            parolasını taşıyor.
          */}
          <p className="m-0 text-14 text-ink-muted">
            {d.raporlarOnce}
            <strong className="text-ink">{session.user.email}</strong>
            {d.raporlarSonra}
          </p>
          {!epostaAcik ? (
            <Serit ton="bilgi" baslik={d.epostaAyari}>
              {kapiNedeni('eposta.duzenle', dil)}
            </Serit>
          ) : eposta.status === 'rejected' ? (
            <HataDurumu baslik={d.epostaAlinamadi} mesaj={hataMetni(eposta.reason, d.bilinmeyenHata)} />
          ) : (
            <EpostaAyarlari mevcut={eposta.value} kullaniciEposta={session.user.email} />
          )}
        </section>

        {okumaApiAcik && (
          <section id="okuma-api" className="grid scroll-mt-24 gap-4">
            <p className="m-0 text-14 text-ink-muted">{d.okumaApiAciklama}</p>
            {anahtarlar.status === 'rejected' || araclar.status === 'rejected' ? (
              <HataDurumu
                baslik={d.anahtarlarAlinamadi}
                mesaj={hataMetni(
                  anahtarlar.status === 'rejected' ? anahtarlar.reason : (araclar as PromiseRejectedResult).reason,
                  d.bilinmeyenHata,
                )}
              />
            ) : (
              <OkumaApiPaneli anahtarlar={anahtarlar.value} araclar={araclar.value} />
            )}
          </section>
        )}
      </HesabimBolumleri>
    </div>
  );
}
