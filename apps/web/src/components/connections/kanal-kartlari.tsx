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
import { ayarlarAdresi } from '@/lib/panel-adresleri';
import { PlatformLogo, adAccountKanali } from '@/components/platform-logo';
import { eksikIzinMetni } from '@/lib/izin-etiketleri';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { Serit } from '@/components/ui/hal';
import { Pencere } from '@/components/ui/pencere';
import { AcilirMenu, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { DigerMenusu } from '@/components/ayar-sekmeleri';

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
 * Artık PLATFORM BAŞINA TEK KART ve kart ORTAK KALIPTA (taslak `#ayarlar`):
 * başlıkta platform ve durum rozeti, gövdede sayı ve TEK cümle, hata varsa
 * platformun kendi kodu, tek eylem sağ altta. Seyrek işler (durumu kontrol
 * et, yeniden yetkilendir, kaldır) ⋯ menüsünde: altı düğmenin yan yana
 * durması "hangisine basmalıyım" sorusunu üretiyordu.
 */
export function KanalKartlari({
  availability,
  connections,
  canManage,
  kaldirabilir,
}: {
  availability: ProviderAvailability[];
  connections: ConnectionSummary[];
  /** Bağla / yeniden yetkilendir — `PANEL_KAPILARI['baglanti.yetkilendir']`. */
  canManage: boolean;
  /**
   * Bağlantıyı KALDIRMAK ayrı kapı (`baglanti.kaldir`: + org yöneticisi).
   * Tek bayrakla çizilince Reklam Yöneticisi "Kaldır"ı görüp 403 alıyordu
   * (MIMARI § Yetki kapıları).
   */
  kaldirabilir: boolean;
}) {
  const [hata, setHata] = useState<string | null>(null);

  return (
    <section className="grid gap-3">
      <p className="m-0 text-13 text-ink-muted">
        Her platformu bir kez bağlıyorsun. Bağlantı ajansa ait, workspace ayrımı hesap atamasıyla yapılıyor.
      </p>

      {hata && (
        <Serit ton="hata" baslik="İşlem yapılamadı">
          {hata}
        </Serit>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            kaldirabilir={kaldirabilir}
            onHata={setHata}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * OAuth'u başlatır: API yetki adresini verir, yönlendirmeyi TARAYICI yapar.
 * Fetch üzerinden gelen bir 302, platformun izin ekranını görünmez kılar.
 * Hem kartın "Bağlan" düğmesi hem başlıktaki "Platform bağla" menüsü bunu
 * çağırıyor: iki ayrı yazım, dönüş adresini bir gün iki farklı yere yazardı.
 */
async function baglantiBaslat(platform: Platform): Promise<void> {
  const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>('/connections/authorize', {
    method: 'POST',
    body: JSON.stringify({
      platform,
      // Çapasız: dönüşte arkasına `?connection=…` ekleniyor (API `VARSAYILAN_DONUS`).
      redirectTo: ayarlarAdresi('baglantilar'),
    }),
  });
  window.location.href = authorizeUrl;
}

/**
 * ═══ BAŞLIKTAKİ "PLATFORM BAĞLA" (bölümün birincil eylemi) ═══
 *
 * Taslakta bölümün birincil eylemi başlığın sağında; bağlanacak platform
 * menüden seçiliyor. Yapılandırılmamış platform menüde KAPALI ve sebebi
 * altında yazıyor: gizlemek, desteklenmediğini sanmak demekti. Bağlı bir
 * platform da listede: ikinci bir kimlikle ikinci bağlantı kurulabiliyor
 * (açıklamada "bağlı" yazıyor ki aynı kimliği yanlışlıkla yeniden
 * yetkilendirip ilk token'ı düşürmesin).
 */
export function PlatformBaglaMenusu({
  availability,
  connections,
}: {
  availability: ProviderAvailability[];
  connections: Array<Pick<ConnectionSummary, 'platform'>>;
}) {
  const [bekleyen, setBekleyen] = useState<Platform | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  function bagla(platform: Platform): void {
    setBekleyen(platform);
    setHata(null);
    baglantiBaslat(platform).catch((err: unknown) => {
      setHata(err instanceof ApiRequestError ? err.message : 'Bağlantı başlatılamadı.');
      setBekleyen(null);
    });
  }

  return (
    <>
      <AcilirMenu
        etiket="Bağlanacak platform"
        hizala="sag"
        genislik="w-72"
        tetik={({ acik: _acik, ...o }) => (
          <button type="button" className={dugmeSinifi('birincil')} aria-busy={bekleyen !== null || undefined} {...o}>
            + Platform bağla
          </button>
        )}
      >
        {availability.map((a) => {
          const bagli = connections.some((c) => c.platform === a.platform);
          return (
            <MenuOgesi
              key={a.platform}
              ikon={<PlatformLogo kind={adAccountKanali(a.platform)} className="h-4 w-4" />}
              devreDisi={!a.configured || bekleyen !== null}
              aciklama={
                !a.configured
                  ? 'Sunucu ayarları eksik'
                  : bekleyen === a.platform
                    ? 'Yönlendiriliyor…'
                    : bagli
                      ? 'Bağlı. Başka bir kimlikle ikinci bağlantı'
                      : undefined
              }
              onClick={() => bagla(a.platform)}
            >
              {PLATFORM_LABELS[a.platform]}
            </MenuOgesi>
          );
        })}
      </AcilirMenu>

      <Pencere
        acik={hata !== null}
        onKapat={() => setHata(null)}
        baslik="Bağlantı başlatılamadı"
        genislik="dar"
        altEylemler={
          <Dugme ton="ikincil" onClick={() => setHata(null)}>
            Kapat
          </Dugme>
        }
      >
        {/* PLATFORMUN/API'NİN KENDİ CÜMLESİ: "başlatılamadı" tek başına teşhis değil. */}
        <p className="m-0 break-words text-14 text-ink">{hata}</p>
      </Pencere>
    </>
  );
}

const DURUM: Record<ConnectionSummary['status'], { etiket: string; hal: DurumHali }> = {
  active: { etiket: 'Bağlı', hal: 'ok' },
  needs_reauth: { etiket: 'Yeniden yetki gerekli', hal: 'hata' },
  error: { etiket: 'Hata', hal: 'hata' },
  revoked: { etiket: 'Kaldırıldı', hal: 'taslak' },
};

function KanalKarti({
  uygunluk,
  baglantilar,
  canManage,
  kaldirabilir,
  onHata,
}: {
  uygunluk: ProviderAvailability;
  baglantilar: ConnectionSummary[];
  canManage: boolean;
  kaldirabilir: boolean;
  onHata: (m: string | null) => void;
}) {
  const bagli = baglantilar.length > 0;
  /*
   * ROZET EN KÖTÜ DURUMU GÖSTERİYOR. İki bağlantıdan biri yeniden yetki
   * istiyorsa kart "Bağlı" yazamaz: ilkine bakmak, ikincinin veri
   * çekmediğini rozetten gizlerdi.
   */
  const sorunlu = baglantilar.find((c) => c.status === 'needs_reauth' || c.status === 'error');
  const durum = sorunlu ? DURUM[sorunlu.status] : bagli ? DURUM[baglantilar[0].status] : null;

  return (
    <Kart
      dolgu={false}
      baslik={
        <span className="flex items-center gap-2">
          <PlatformLogo kind={adAccountKanali(uygunluk.platform)} className="h-5 w-5" />
          {PLATFORM_LABELS[uygunluk.platform]}
        </span>
      }
      eylem={
        durum ? (
          <Rozet hal={durum.hal}>{baglantilar.length > 1 ? `${baglantilar.length} bağlantı` : durum.etiket}</Rozet>
        ) : (
          <Rozet hal="taslak">Bağlı değil</Rozet>
        )
      }
    >
      {!bagli ? (
        <BaglanmaAlani uygunluk={uygunluk} canManage={canManage} onHata={onHata} />
      ) : (
        <div className="divide-y divide-line">
          {baglantilar.map((c) => (
            <BaglantiSatiri
              key={c.id}
              baglanti={c}
              canManage={canManage}
              kaldirabilir={kaldirabilir}
              onHata={onHata}
            />
          ))}
        </div>
      )}
    </Kart>
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
      await baglantiBaslat(uygunluk.platform);
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
      <div className="grid gap-1 p-5">
        <b className="font-baslik text-[22px] leading-none text-ink">-</b>
        <p className="m-0 text-13 text-ink-muted">
          Bu kanal için sunucu ayarları tamamlanmamış. Advetics ekibine bildir.
        </p>
        <p className="m-0 font-mono text-11 text-ink-muted">{uygunluk.missingConfig.join(', ')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 p-5">
      <div className="grid gap-1">
        <b className="font-baslik text-[22px] leading-none text-ink">-</b>
        {/*
          Kapalı düğmenin SEBEBİ yazılı: sebepsiz kapalı bir düğme,
          kullanıcıyı olmayan bir arızayı aramaya gönderiyor.
        */}
        <p className="m-0 text-13 text-ink-muted">
          {canManage ? 'Henüz bağlanmadı.' : 'Bağlantı kurmak yöneticinin işi.'}
        </p>
      </div>
      <div className="flex justify-end">
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void bagla()} disabled={!canManage || pending}>
          {pending ? 'Yönlendiriliyor…' : 'Bağlan'}
        </Dugme>
      </div>
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
  kaldirabilir,
  onHata,
}: {
  baglanti: ConnectionSummary;
  canManage: boolean;
  kaldirabilir: boolean;
  onHata: (m: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [kaldirOnay, setKaldirOnay] = useState(false);

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
  /*
   * YENİDEN YETKİ GEREKİYOR MU — kartın TEK görünür eylemini seçiyor
   * (eski "vurgulu" düğmenin karşılığı). Gerekiyorsa "Yeniden bağlan"
   * (koyu), gerekmiyorsa "Hesapları tara". Menüdeki "Yeniden yetkilendir"
   * bu koşula BAĞLI DEĞİL, her zaman orada: vurgu yalnız gerçekten eksik bir
   * şey varken; her zaman vurgulu bir düğme, vurgunun kendisini
   * anlamsızlaştırır.
   */
  const yetkiGerekli =
    baglanti.status === 'needs_reauth' ||
    baglanti.status === 'error' ||
    baglanti.missingScopes.length > 0 ||
    baglanti.missingOptionalScopes.length > 0;

  return (
    <div className="grid gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          {/*
            ÜÇ SAYI, BİRİ DİĞERİNİN İÇİNDE. "12 hesabın 8'i atanmış, 6'sı veri
            çekiyor" cümlesi kapsama ilişkisini de anlatıyor; üç ayrı rozet
            bunu anlatmıyordu ve kullanıcı sayıları topluyordu.
          */}
          <b className="font-baslik text-[22px] leading-none tabular-nums text-ink">
            {hesap.length} reklam hesabı
          </b>
          <p className="m-0 text-13 text-ink-muted">
            {hesap.length > 0 && <>{atanmis} atanmış, {izlenen} veri çekiyor · </>}
            {profil.length > 0 && <>{profil.length} sayfa · </>}
            {baglanti.sahip === 'ajans' ? 'Ajans bağlantısı' : 'Şirket bağlantısı'}
          </p>
          {baglanti.accountLabel && (
            <p className="m-0 truncate text-12 text-ink-soluk" title={baglanti.accountLabel}>
              {baglanti.accountLabel}
            </p>
          )}
        </div>
        <DigerMenusu etiket={`${PLATFORM_LABELS[baglanti.platform]} bağlantısı için işlemler`}>
          <MenuOgesi
            devreDisi={meslul}
            onClick={() =>
              void calistir('verify', () => apiFetch(`/connections/${baglanti.id}/verify`, { method: 'POST' }))
            }
          >
            Durumu kontrol et
          </MenuOgesi>
          {/*
            KOŞULSUZ GÖRÜNÜYOR — eskiden yalnızca eksik izin ya da
            `needs_reauth` varken çıkıyordu ve bu, ÇAREYİ TAM DA GEREKTİĞİ
            ANDA GİZLİYORDU: sağlayıcıya yeni bir izin eklendiğinde panel onu
            ancak yeni sürüm yayına çıktıktan sonra "eksik" sayıyor. Düğmeyi
            bulamayan kullanıcı bağlantıyı KALDIRIP yeniden kurmaya yöneliyor
            ve `disconnect` o bağlantıdaki her hesabın `syncEnabled`ını
            kapatıyor.
          */}
          {canManage && (
            <MenuOgesi devreDisi={meslul} onClick={() => void calistir('reauth', yenidenYetkilendir)}>
              Yeniden yetkilendir
            </MenuOgesi>
          )}
          {kaldirabilir && (
            <>
              <MenuAyraci />
              <MenuOgesi tehlike devreDisi={meslul} onClick={() => setKaldirOnay(true)}>
                Bağlantıyı kaldır
              </MenuOgesi>
            </>
          )}
        </DigerMenusu>
      </div>

      {/* ATANMIŞ AMA VERİ ÇEKMEYEN HESAP: bu üründe en sık çıkan sessiz
          arıza. Panelde "bağlı" görünüyor, hiçbir şey getirmiyor.

          BURADA BİR SÜRE "kaldırıp yeniden ekle" YAZIYORDU VE O TAVSİYE
          ARIZANIN KENDİSİNİ ÜRETİYORDU: `disconnect` bağlantıdaki her hesabın
          `syncEnabled`ını kapatıyor, keşif upsert'i onu bilerek geri açmıyor
          ve kullanıcı 131 hesabı tek tek açmak zorunda kalıyor. */}
      {atanmis > izlenen && (
        <Serit
          baslik={`${atanmis - izlenen} hesap atanmış ama veri çekmiyor.`}
          eylemler={
            canManage && (
              <Dugme
                ton="koyu"
                boyut="kucuk"
                bekliyor={busy === 'resume'}
                disabled={meslul}
                onClick={() =>
                  void calistir('resume', () =>
                    apiFetch(`/connections/${baglanti.id}/resume-sync`, { method: 'POST' }),
                  )
                }
              >
                İzlemeyi geri aç
              </Dugme>
            )
          }
        />
      )}

      {/* PLATFORMUN KENDİ KODU: "hata" tek başına neye bakılacağını söylemiyor. */}
      {(baglanti.status === 'needs_reauth' || baglanti.status === 'error') && baglanti.lastErrorCode && (
        <p className="m-0 break-words text-13 font-semibold text-danger-strong">
          {PLATFORM_LABELS[baglanti.platform]}: {baglanti.lastErrorCode}
        </p>
      )}

      {baglanti.missingScopes.length > 0 && (
        <p className="m-0 text-13 font-semibold text-danger-strong">
          Eksik izinler yüzünden veri çekilemiyor. Yeniden yetkilendirmen gerekiyor.
        </p>
      )}

      {baglanti.missingScopes.length === 0 && baglanti.missingOptionalScopes.length > 0 && (
        /* Bağlantı ÇALIŞIYOR, yalnızca bir özellik kapalı. Bunu hata gibi
           göstermek kullanıcıyı olmayan bir arızayı aramaya gönderir.
           HANGİ özelliğin kapalı olduğu yazılıyor. */
        <p className="m-0 text-12 text-ink-muted">{eksikIzinMetni(baglanti.missingOptionalScopes)}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-11 text-ink-soluk">
          {baglanti.lastVerifiedAt
            ? `Son kontrol ${new Date(baglanti.lastVerifiedAt).toLocaleString('tr-TR')}`
            : 'Henüz kontrol edilmedi'}
        </span>
        {/*
          "HESAPLARI YENİLE" DEĞİL "HESAPLARI TARA". Sayfanın altında bir de
          "Tüm verileri güncelle" var ve ikisi "yenile" dediği için aynı iş
          sanılıyordu: bu, platformdan HESAP LİSTESİNİ yeniden okuyor;
          diğeri METRİK çekiyor.
        */}
        {yetkiGerekli && canManage ? (
          <Dugme
            ton="koyu"
            boyut="kucuk"
            bekliyor={busy === 'reauth'}
            disabled={meslul}
            onClick={() => void calistir('reauth', yenidenYetkilendir)}
          >
            Yeniden bağlan
          </Dugme>
        ) : (
          <Dugme
            ton="ikincil"
            boyut="kucuk"
            bekliyor={busy === 'refresh'}
            disabled={meslul}
            onClick={() =>
              void calistir('refresh', () =>
                apiFetch(`/connections/${baglanti.id}/refresh-accounts`, { method: 'POST' }),
              )
            }
          >
            Hesapları tara
          </Dugme>
        )}
      </div>

      <Pencere
        acik={kaldirOnay}
        onKapat={() => setKaldirOnay(false)}
        baslik="Bağlantıyı kaldır"
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setKaldirOnay(false)}>
              Vazgeç
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={busy === 'disconnect'}
              onClick={() => {
                setKaldirOnay(false);
                void calistir('disconnect', () =>
                  apiFetch(`/connections/${baglanti.id}/disconnect`, { method: 'POST' }),
                );
              }}
            >
              Kaldır
            </Dugme>
          </>
        }
      >
        {/*
          UYARI BÜTÜN WORKSPACE'LERİ SÖYLÜYOR: bağlantı ajansa ait ve
          kaldırmak tek bir workspace'i değil, o bağlantıya bağlı HER
          hesabın veri akışını durduruyor.
        */}
        <p className="m-0 text-14 text-ink">
          Bu bağlantı ajansa ait ve altındaki tüm workspace’lerin hesaplarını besliyor. Kaldırılırsa
          hepsinin veri akışı durur. Geçmiş veriler korunur.
        </p>
      </Pencere>
    </div>
  );
}
