'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PLATFORM_LABELS,
  type ConnectionSummary,
  type Platform,
  type ProviderAvailability,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo, adAccountKanali } from '@/components/platform-logo';

/**
 * ═══ KANAL KARTLARI — BAĞLANMAK VE BAĞLANTININ DURUMU AYNI YERDE ═══
 *
 * ┌─ ÖNCEKİ DÜZEN NEDEN KARIŞIKTI ─────────────────────────────────────────┐
 * │ Bu ekranda bir platformla ilgili bilgi ÜÇ AYRI BLOĞA dağılmıştı:       │
 * │                                                                         │
 * │   · "Yeni bağlantı" kutusu — her platform için bir "Bağlan" düğmesi,   │
 * │     ama bağlı olup olmadığını SÖYLEMİYORDU: Meta zaten bağlıyken de    │
 * │     aynı düğme aynı şekilde duruyordu.                                  │
 * │   · Sayfanın altındaki bağlantı kartları — durum, token, izinler,      │
 * │     "Yeniden yetkilendir" ve "Kaldır".                                  │
 * │   · Havuz kartları ve "İzlenen hesaplar" — aynı hesapları üç ayrı      │
 * │     kelimeyle sayıyordu: "boşta", "izlenen", "keşfedildi".              │
 * │                                                                         │
 * │ Kullanıcı "Meta'da durum ne" sorusunu cevaplamak için üç yere bakmak   │
 * │ zorundaydı ve bağlıyken bile "Bağlan" görüyordu.                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Artık PLATFORM BAŞINA TEK KART: bağlı mı, kim yetkilendirmiş, ne getirdi,
 * ne kadarı kullanılıyor ve yapılabilecek her şey. Bağlanmak da bu kartın
 * içinde, çünkü "bağlan" bir kanalın DURUMLARINDAN biri; ayrı bir kutuya
 * koymak onu bağlantının kendisinden kopuk bir işlem gibi gösteriyordu.
 */
export function KanalKartlari({
  availability,
  connections,
  canManage,
}: {
  availability: ProviderAvailability[];
  connections: ConnectionSummary[];
  canManage: boolean;
}) {
  const [hata, setHata] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">Kanallar</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Her platformu bir kez bağlıyorsun. Bağlantı ajansa ait, workspace ayrımı hesap
          atamasıyla yapılıyor.
        </p>
      </div>

      {hata && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {hata}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {availability.map((a) => (
          <KanalKarti
            key={a.platform}
            uygunluk={a}
            /*
             * BİR PLATFORMDA BİRDEN ÇOK BAĞLANTI OLABİLİYOR: tekil anahtar
             * `orgId + platform + externalUserId`, yani farklı bir Facebook
             * kullanıcısıyla ikinci bir bağlantı kurulabilir. Tek bağlantı
             * varsayıp `find` demek, ikincisini ekrandan sessizce düşürürdü.
             */
            baglantilar={connections.filter((c) => c.platform === a.platform)}
            canManage={canManage}
            onHata={setHata}
          />
        ))}
      </div>
    </section>
  );
}

const DURUM: Record<
  ConnectionSummary['status'],
  { etiket: string; nokta: string; metin: string }
> = {
  active: { etiket: 'Bağlı', nokta: 'bg-ok', metin: 'text-ok-strong' },
  needs_reauth: {
    etiket: 'Yeniden yetkilendirme gerekli',
    nokta: 'bg-warn',
    metin: 'text-warn-strong',
  },
  error: { etiket: 'Hata', nokta: 'bg-danger', metin: 'text-danger-strong' },
  revoked: { etiket: 'Kaldırıldı', nokta: 'bg-line', metin: 'text-ink-muted' },
};

function KanalKarti({
  uygunluk,
  baglantilar,
  canManage,
  onHata,
}: {
  uygunluk: ProviderAvailability;
  baglantilar: ConnectionSummary[];
  canManage: boolean;
  onHata: (m: string | null) => void;
}) {
  const bagli = baglantilar.length > 0;

  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line">
          <PlatformLogo kind={adAccountKanali(uygunluk.platform)} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{PLATFORM_LABELS[uygunluk.platform]}</h3>
          {/*
            DURUM BAŞLIĞIN ALTINDA, ROZET DEĞİL SATIR. Rozet dar kartta
            başlığın yanına sığmıyor ve "Yeniden yetkilendirme gerekli" gibi
            uzun bir durumu kırpıyordu; kırpılmış bir durum, yanlış durum.
          */}
          {bagli ? (
            <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${DURUM[baglantilar[0].status].metin}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DURUM[baglantilar[0].status].nokta}`} />
              {baglantilar.length > 1
                ? `${baglantilar.length} bağlantı`
                : DURUM[baglantilar[0].status].etiket}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-muted">Bağlı değil</p>
          )}
        </div>
      </header>

      {!bagli ? (
        <BaglanmaAlani uygunluk={uygunluk} canManage={canManage} onHata={onHata} />
      ) : (
        <div className="divide-y divide-line/60">
          {baglantilar.map((c) => (
            <BaglantiSatiri key={c.id} baglanti={c} canManage={canManage} onHata={onHata} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Henüz bağlı olmayan kanal: tek iş var, o da bağlanmak. */
function BaglanmaAlani({
  uygunluk,
  canManage,
  onHata,
}: {
  uygunluk: ProviderAvailability;
  canManage: boolean;
  onHata: (m: string | null) => void;
}) {
  const [pending, setPending] = useState(false);

  async function bagla(): Promise<void> {
    onHata(null);
    setPending(true);
    try {
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
        '/connections/authorize',
        {
          method: 'POST',
          body: JSON.stringify({
            platform: uygunluk.platform,
            redirectTo: '/ayarlar/baglantilar',
          }),
        },
      );
      // Yönlendirmeyi TARAYICI yapmalı: fetch üzerinden gelen bir 302,
      // platformun izin ekranını görünmez kılar.
      window.location.href = authorizeUrl;
    } catch (err) {
      onHata(err instanceof ApiRequestError ? err.message : 'Bağlantı başlatılamadı.');
      setPending(false);
    }
  }

  if (!uygunluk.configured) {
    /*
     * YAPILANDIRILMAMIŞ KANAL GİZLENMİYOR. Kartı hiç çizmemek, kullanıcının
     * o platformun desteklenmediğini sanması demekti; eksik olan şey
     * sunucudaki anahtar ve bunu ancak kuran kişi görebilir.
     */
    return (
      <div className="px-4 py-3">
        <p className="text-xs text-ink-muted">
          Bu kanal için sunucu ayarları tamamlanmamış. Advetics ekibine bildir.
        </p>
        <p className="mt-1 font-mono text-[10px] text-ink-muted">
          {uygunluk.missingConfig.join(', ')}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => void bagla()}
        disabled={!canManage || pending}
        className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Yönlendiriliyor…' : 'Bağlan'}
      </button>
      {!canManage && (
        // Kapalı düğmenin SEBEBİ yazılı: sebepsiz kapalı bir düğme,
        // kullanıcıyı olmayan bir arızayı aramaya gönderiyor.
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Bağlantı kurmak yöneticinin işi.
        </p>
      )}
    </div>
  );
}

/**
 * Kurulu bir bağlantı: kim yetkilendirmiş, ne getirdi, ne yapılabilir.
 *
 * SAYILAR TEK CÜMLEDE VE AYNI KELİMELERLE. Önceki ekranda aynı hesaplar üç
 * ayrı yerde, üç ayrı kelimeyle sayılıyordu ("keşfedildi", "boşta",
 * "izlenen") ve hangisinin hangisini kapsadığı hiçbir yerde yazmıyordu.
 */
function BaglantiSatiri({
  baglanti,
  canManage,
  onHata,
}: {
  baglanti: ConnectionSummary;
  canManage: boolean;
  onHata: (m: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function calistir(anahtar: string, fn: () => Promise<unknown>): Promise<void> {
    onHata(null);
    setBusy(anahtar);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (err) {
      onHata(err instanceof ApiRequestError ? err.message : 'İşlem başarısız oldu.');
    } finally {
      setBusy(null);
    }
  }

  async function yenidenYetkilendir(): Promise<void> {
    const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>(
      `/connections/${baglanti.id}/reauthorize?platform=${baglanti.platform}`,
      { method: 'POST' },
    );
    window.location.href = authorizeUrl;
  }

  const hesap = baglanti.adAccounts;
  const profil = baglanti.socialProfiles;
  const atanmis = hesap.filter((a) => a.clientId !== null).length;
  const izlenen = hesap.filter((a) => a.clientId !== null && a.syncEnabled).length;
  const meslul = busy !== null || isPending;

  return (
    <div className="px-4 py-3">
      {baglanti.accountLabel && (
        <p className="truncate text-xs text-ink-muted" title={baglanti.accountLabel}>
          {baglanti.accountLabel}
        </p>
      )}

      {/*
        ÜÇ SAYI, BİRİ DİĞERİNİN İÇİNDE. "12 hesabın 8'i atanmış, 6'sı veri
        çekiyor" cümlesi kapsama ilişkisini de anlatıyor; üç ayrı rozet
        bunu anlatmıyordu ve kullanıcı sayıları topluyordu.
      */}
      <p className="mt-1.5 text-sm text-ink">
        <strong>{hesap.length}</strong> reklam hesabı
        {profil.length > 0 && (
          <>
            {' '}ve <strong>{profil.length}</strong> sayfa
          </>
        )}
        {hesap.length > 0 && (
          <span className="text-ink-muted">
            {' '}· {atanmis} atanmış, {izlenen} veri çekiyor
          </span>
        )}
      </p>

      {/* ATANMIŞ AMA VERİ ÇEKMEYEN HESAP: bu üründe en sık çıkan sessiz
          arıza. Panelde "bağlı" görünüyor, hiçbir şey getirmiyor. */}
      {atanmis > izlenen && (
        <p className="mt-1.5 rounded-lg bg-warn-soft px-2.5 py-1.5 text-[11px] text-warn-strong">
          {atanmis - izlenen} hesap atanmış ama veri çekmiyor. Workspace&apos;in Bağlı Kanallar
          ekranından kaldırıp yeniden ekle.
        </p>
      )}

      {baglanti.missingScopes.length > 0 && (
        <p className="mt-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger-strong">
          Eksik izinler yüzünden veri çekilemiyor. Yeniden yetkilendirmen gerekiyor.
        </p>
      )}

      {baglanti.missingScopes.length === 0 && baglanti.missingOptionalScopes.length > 0 && (
        /* Bağlantı ÇALIŞIYOR, yalnızca bir özellik kapalı. Bunu hata gibi
           göstermek kullanıcıyı olmayan bir arızayı aramaya gönderir. */
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Akıllı Boost için ek izin bekliyor. Bağlantının geri kalanı çalışıyor.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Dugme
          meslul={meslul}
          calisiyor={busy === 'verify'}
          onClick={() =>
            void calistir('verify', () =>
              apiFetch(`/connections/${baglanti.id}/verify`, { method: 'POST' }),
            )
          }
        >
          Durumu kontrol et
        </Dugme>
        {/*
          "HESAPLARI YENİLE" DEĞİL "HESAPLARI TARA". Sayfanın altında bir de
          "Tüm verileri güncelle" var ve ikisi "yenile" dediği için aynı iş
          sanılıyordu: bu, platformdan HESAP LİSTESİNİ yeniden okuyor;
          diğeri METRİK çekiyor.
        */}
        <Dugme
          meslul={meslul}
          calisiyor={busy === 'refresh'}
          onClick={() =>
            void calistir('refresh', () =>
              apiFetch(`/connections/${baglanti.id}/refresh-accounts`, { method: 'POST' }),
            )
          }
        >
          Hesapları tara
        </Dugme>
        {canManage &&
          (baglanti.status === 'needs_reauth' ||
            baglanti.missingScopes.length > 0 ||
            baglanti.missingOptionalScopes.length > 0) && (
            <Dugme
              meslul={meslul}
              calisiyor={busy === 'reauth'}
              vurgulu
              onClick={() => void calistir('reauth', yenidenYetkilendir)}
            >
              Yeniden yetkilendir
            </Dugme>
          )}
        {canManage && (
          <Dugme
            meslul={meslul}
            calisiyor={busy === 'disconnect'}
            tehlike
            onClick={() => {
              // UYARI BÜTÜN WORKSPACE'LERİ SÖYLÜYOR: bağlantı ajansa ait ve
              // kaldırmak tek bir workspace'i değil, o bağlantıya bağlı HER
              // hesabın veri akışını durduruyor.
              if (
                !confirm(
                  'Bu bağlantı ajansa ait ve altındaki tüm workspace’lerin hesaplarını besliyor. ' +
                    'Kaldırılırsa hepsinin veri akışı durur. Geçmiş veriler korunur. Devam?',
                )
              ) {
                return;
              }
              void calistir('disconnect', () =>
                apiFetch(`/connections/${baglanti.id}/disconnect`, { method: 'POST' }),
              );
            }}
          >
            Kaldır
          </Dugme>
        )}
      </div>

      {baglanti.lastVerifiedAt && (
        <p className="mt-2 text-[10px] text-ink-muted">
          Son kontrol {new Date(baglanti.lastVerifiedAt).toLocaleString('tr-TR')}
        </p>
      )}
    </div>
  );
}

function Dugme({
  meslul,
  calisiyor,
  vurgulu,
  tehlike,
  onClick,
  children,
}: {
  meslul: boolean;
  calisiyor: boolean;
  vurgulu?: boolean;
  tehlike?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const sinif = vurgulu
    ? 'border-warn bg-warn text-white hover:opacity-90'
    : tehlike
      ? 'border-danger/30 text-danger-strong hover:bg-danger-soft'
      : 'border-line text-ink hover:bg-surface-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={meslul}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${sinif}`}
    >
      {calisiyor ? '…' : children}
    </button>
  );
}
