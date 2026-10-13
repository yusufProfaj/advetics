import type {
  EmailAccountSummary,
  IkiAdimDurumu,
  OkumaAnahtariOzeti,
  OkumaAraciTanimi,
} from '@advetics/shared';
import { ROL_ETIKETI, SAHIP_ETIKETI } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { PANEL_KAPILARI, kapi } from '@/lib/panel-adresleri';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Kart } from '@/components/ui/kart';
import { HataDurumu, Serit } from '@/components/ui/hal';
import { AyarKapsami } from '@/components/ayar-kapsam';
import { HesabimBolumleri, type HesabimBolumu } from '@/components/hesap/hesabim-bolumleri';
import { IkiAdimPaneli } from '@/components/hesap/iki-adim-paneli';
import { EpostaAyarlari } from '@/components/email/eposta-ayarlari';
import { OkumaApiPaneli } from '@/components/okuma-api/okuma-api-paneli';

export const metadata = { title: 'Hesabım · Advetics' };
export const dynamic = 'force-dynamic';

/** Platformun kendi cümlesi ekranda görünmeli; kod ve HTTP durumu teşhis için. */
function hataMetni(err: unknown): string {
  return err instanceof ApiRequestError
    ? `${err.message} (${err.code}, HTTP ${err.status})`
    : err instanceof Error
      ? err.message
      : 'Bilinmeyen hata';
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
    { deger: 'guvenlik', etiket: 'Giriş ve güvenlik', uyari: guvenlikUyari },
    { deger: 'e-posta', etiket: 'E-posta', uyari: epostaUyari },
    ...(okumaApiAcik
      ? [
          {
            deger: 'okuma-api',
            etiket: 'Okuma API',
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
        baslik="Hesabım"
        aciklama="Giriş bilgilerin, hesabının güvenliği ve senin adına giden e-postalar."
      />
      <HesabimBolumleri bolumler={bolumler}>
        <section id="guvenlik" className="grid scroll-mt-24 gap-5">
          <Kart baslik="Hesap">
            <dl className="m-0 grid gap-x-6 gap-y-2 text-14 sm:grid-cols-[10rem_1fr]">
              <dt className="text-ink-muted">Ad</dt>
              <dd className="m-0 text-ink">{session.user.fullName}</dd>
              <dt className="text-ink-muted">E-posta</dt>
              <dd className="m-0 break-all text-ink">{session.user.email}</dd>
              <dt className="text-ink-muted">Rol</dt>
              <dd className="m-0 text-ink">{session.platformAdmin ? SAHIP_ETIKETI : ROL_ETIKETI[session.rol]}</dd>
            </dl>
          </Kart>
          {ikiAdim.status === 'fulfilled' ? (
            <IkiAdimPaneli durum={ikiAdim.value} kurtarmaIleGirdi={params.kurtarma === '1'} />
          ) : (
            <HataDurumu baslik="Güvenlik ayarların okunamadı" mesaj={hataMetni(ikiAdim.reason)} />
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
            Raporlar <strong className="text-ink">{session.user.email}</strong> adresinden, senin imzanla gider.
            Parolayı yöneticiler dahil kimse okuyamaz.
          </p>
          {!epostaAcik ? (
            <Serit ton="bilgi" baslik="E-posta ayarı">
              {PANEL_KAPILARI['eposta.duzenle'].neden}
            </Serit>
          ) : eposta.status === 'rejected' ? (
            <HataDurumu baslik="E-posta ayarların alınamadı" mesaj={hataMetni(eposta.reason)} />
          ) : (
            <EpostaAyarlari mevcut={eposta.value} kullaniciEposta={session.user.email} />
          )}
        </section>

        {okumaApiAcik && (
          <section id="okuma-api" className="grid scroll-mt-24 gap-4">
            <p className="m-0 text-14 text-ink-muted">
              Advetics verisini Claude, Cursor gibi yapay zekâ araçlarına MCP sunucusu olarak bağla. Anahtar
              yalnız okur: kampanya açamaz, durduramaz, bütçe değiştiremez.
            </p>
            {anahtarlar.status === 'rejected' || araclar.status === 'rejected' ? (
              <HataDurumu
                baslik="Anahtarlar alınamadı"
                mesaj={hataMetni(
                  anahtarlar.status === 'rejected' ? anahtarlar.reason : (araclar as PromiseRejectedResult).reason,
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
