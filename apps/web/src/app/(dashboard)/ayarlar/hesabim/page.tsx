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
import { AyarKapsami } from '@/components/ayar-kapsam';
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SayfaBasligi
        ust={<AyarKapsami duzey="kisi" ad={session.user.fullName ?? session.user.email} />}
        baslik="Hesabım"
        aciklama="Giriş bilgilerin, hesabının güvenliği ve senin adına giden e-postalar."
      />

      <section id="guvenlik" className="scroll-mt-4 space-y-4">
        <h2 className="text-base font-semibold text-ink">Giriş ve güvenlik</h2>
        <div className="rounded-xl border border-line bg-surface p-5">
          <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">Ad</dt>
            <dd className="text-ink">{session.user.fullName}</dd>
            <dt className="text-ink-muted">E-posta</dt>
            <dd className="break-all text-ink">{session.user.email}</dd>
            <dt className="text-ink-muted">Rol</dt>
            <dd className="text-ink">{session.platformAdmin ? SAHIP_ETIKETI : ROL_ETIKETI[session.rol]}</dd>
          </dl>
        </div>
        {ikiAdim.status === 'fulfilled' ? (
          <IkiAdimPaneli durum={ikiAdim.value} kurtarmaIleGirdi={params.kurtarma === '1'} />
        ) : (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
            <p className="font-medium text-danger-strong">Güvenlik ayarların okunamadı.</p>
            <p className="mt-1 text-ink-muted">{hataMetni(ikiAdim.reason)}</p>
          </div>
        )}
      </section>

      <section id="e-posta" className="scroll-mt-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">E-posta</h2>
          {/*
            Rapor müşteriye danışmanın KENDİ adresinden gidiyor: müşteri
            "yanıtla" dediğinde ona ulaşmalı ve mail onun imzasını taşımalı.
            Yönetici kimsenin adına kuramıyor — satır o kişinin uygulama
            parolasını taşıyor.
          */}
          <p className="mt-0.5 text-sm text-ink-muted">
            Raporlar <strong>{session.user.email}</strong> adresinden, senin imzanla gider. Parolayı
            yöneticiler dahil kimse okuyamaz.
          </p>
        </div>
        {!epostaAcik ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
            {PANEL_KAPILARI['eposta.duzenle'].neden}
          </p>
        ) : eposta.status === 'rejected' ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
            <p className="font-medium text-danger-strong">E-posta ayarların alınamadı.</p>
            <p className="mt-1 text-ink-muted">{hataMetni(eposta.reason)}</p>
          </div>
        ) : (
          <EpostaAyarlari mevcut={eposta.value} kullaniciEposta={session.user.email} />
        )}
      </section>

      {okumaApiAcik && (
        <section id="okuma-api" className="scroll-mt-4 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Okuma API</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Advetics verisini Claude, Cursor gibi yapay zekâ araçlarına MCP sunucusu olarak bağla.
              Anahtar yalnız okur: kampanya açamaz, durduramaz, bütçe değiştiremez.
            </p>
          </div>
          {anahtarlar.status === 'rejected' || araclar.status === 'rejected' ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm">
              <p className="font-medium text-danger-strong">Anahtarlar alınamadı.</p>
              <p className="mt-1 text-ink-muted">
                {hataMetni(anahtarlar.status === 'rejected' ? anahtarlar.reason : (araclar as PromiseRejectedResult).reason)}
              </p>
            </div>
          ) : (
            <OkumaApiPaneli anahtarlar={anahtarlar.value} araclar={araclar.value} />
          )}
        </section>
      )}
    </div>
  );
}
