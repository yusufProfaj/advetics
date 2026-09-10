'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createManagedOrganizationSchema,
  createManagerAccountSchema,
  type ManagerAccountTree,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';

/**
 * ÜST HESAP (MCC) EKRANI — ağaç ve iki yazma işlemi.
 *
 * Hiyerarşi: Üst Hesap → Şirket → Workspace → Reklam Hesabı → Kampanya.
 * Bu bileşen ilk iki katmanı yönetiyor; workspace'lerin DÜZENLENDİĞİ bölüm
 * aynı sayfada, hemen altında (`WorkspaceBolumu`) ve AKTİF şirkete ait.
 * Buradaki workspace listeleri ise yalnızca ad gösteriyor — hangi
 * workspace'in nerede olduğunu şirkete geçmeden görebilmek için.
 *
 * VAR OLAN BİR ŞİRKETİ BAĞLAMA YOK ve bu bilinçli (arka uçta da yok):
 * "şu şirketi üst hesabıma ekle" diyebilmek, başkasının şirketini kendi
 * erişim listesine yazmak demekti. Devir iki tarafın da onayını isteyen
 * ayrı bir akış gerektirir.
 */
export function UstHesapEkrani({
  ilkAgac,
  aktifOrgId,
  yuklemeHatasi,
}: {
  ilkAgac: ManagerAccountTree | null;
  /** Şu an SEÇİLİ şirket — kartta "Yönet" yerine "buradasın" yazsın diye. */
  aktifOrgId: string;
  /** Ağaç okunamadıysa SEBEBİ — sessizce "üst hesap yok" göstermiyoruz. */
  yuklemeHatasi: string | null;
}) {
  const router = useRouter();
  const [agac, setAgac] = useState<ManagerAccountTree | null>(ilkAgac);
  const [hata, setHata] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function gonder(yol: string, govde: unknown) {
    setPending(true);
    setHata(null);
    try {
      const sonuc = await apiFetch<ManagerAccountTree>(yol, {
        method: 'POST',
        body: JSON.stringify(govde),
      });
      setAgac(sonuc);
      /*
       * SUNUCU BİLEŞENLERİ TAZELENİYOR. Üst bardaki şirket seçici oturum
       * yanıtından besleniyor; tazelenmezse yeni şirket ekranda listelenir
       * ama seçicide GÖRÜNMEZ ve kullanıcı ona geçemez.
       */
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'İşlem tamamlanamadı.');
    } finally {
      setPending(false);
    }
  }

  if (yuklemeHatasi) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Üst hesap bilgisi alınamadı: {yuklemeHatasi}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {hata && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {hata}
        </p>
      )}

      {/*
        `!agac` — `agac === null` DEĞİL. Sayfa değeri `?? null` ile
        normalleştiriyor ama bu bileşen tek çağıranına bağlı kalmamalı:
        `undefined` geldiğinde eşitlik kontrolü false kalıyor ve aşağıdaki
        ağaç `agac.name` ile fırlıyor. Bir sayfa hatası, KULLANICININ tek
        gördüğü şey oluyor.
      */}
      {!agac ? (
        <UstHesapKur
          pending={pending}
          onKur={(name) => void gonder('/manager-account', { name })}
        />
      ) : (
        <>
          <SirketListesi
            agac={agac}
            aktifOrgId={aktifOrgId}
            pending={pending}
            onTasi={(clientId, organizationId) =>
              void gonder('/manager-account/workspaces/move', { clientId, organizationId })
            }
          />
          <SirketEkle
            pending={pending}
            onEkle={(name) => void gonder('/manager-account/organizations', { name })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SirketListesi({
  agac,
  aktifOrgId,
  pending,
  onTasi,
}: {
  agac: ManagerAccountTree;
  aktifOrgId: string;
  pending: boolean;
  onTasi: (clientId: string, organizationId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{agac.name}</h2>
        {/* SESSİZ KESME YOK: kaç şirket ve kaç workspace olduğu yazılı. */}
        <span className="text-xs text-ink-muted">
          {agac.organizations.length} şirket ·{' '}
          {agac.organizations.reduce((n, o) => n + o.workspaces.length, 0)} workspace
        </span>
      </div>

      {agac.organizations.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          Bu üst hesaba bağlı şirket yok.
        </p>
      ) : (
        /* IZGARA: şirket sayısı arttıkça dikey yığın ekranı uzatıyor ve
           geniş ekranda sağda ölü alan bırakıyor. */
        <ul className="grid gap-3 sm:grid-cols-2">
          {agac.organizations.map((o) => (
            <SirketKarti
              key={o.id}
              sirket={o}
              aktif={o.id === aktifOrgId}
              pending={pending}
              /*
               * TAŞINABİLİR ADAYLAR: DİĞER şirketlerin workspace'leri.
               * Kendi workspace'lerini listelemek, "buraya ekle" deyip
               * hiçbir şey yapmayan bir seçenek göstermek olurdu.
               */
              adaylar={agac.organizations
                .filter((d) => d.id !== o.id)
                .flatMap((d) =>
                  d.workspaces.map((w) => ({ ...w, sirket: d.name })),
                )}
              onTasi={onTasi}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SirketKarti({
  sirket,
  aktif,
  pending,
  adaylar,
  onTasi,
}: {
  sirket: ManagerAccountTree['organizations'][number];
  aktif: boolean;
  pending: boolean;
  /** BAŞKA şirketlerdeki workspace'ler — buraya taşınabilirler. */
  adaylar: Array<{ id: string; name: string; sirket: string }>;
  onTasi: (clientId: string, organizationId: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const [gecis, setGecis] = useState(false);
  const [secilen, setSecilen] = useState('');

  /**
   * ŞİRKETE GEÇ — tam sayfa yükleme.
   *
   * `router.refresh()` YETMİYOR: şirket değişince kenar çubuğu, workspace
   * listesi ve marka renkleri değişiyor ve istemci state'i önceki şirketten
   * kalan kimlikleri taşıyor. Yarım tazelenmiş bir ekran, sızıntıdan ayırt
   * edilemeyecek kadar kötü görünüyor.
   */
  function gec(): void {
    setGecis(true);
    void apiFetch('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ organizationId: sirket.id }),
    })
      .then(() => {
        // AYNI SAYFAYA DÖNÜYOR, `/dashboard`A DEĞİL. Kullanıcı şirketi
        // düzenlemek için tıkladı; onu Genel Bakış'a atmak, aradığı ekranı
        // yeniden bulmasını istemek olurdu.
        window.location.assign('/ayarlar/ust-hesap');
      })
      .catch(() => setGecis(false));
  }

  return (
    <li className="flex flex-col rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        {/*
          BAŞLIK BİR DÜĞME: "şirkete tıklayınca o şirkete geçilsin" isteğinin
          karşılığı. Kartın TAMAMINI tıklanabilir yapmak mümkün değil —
          içinde workspace taşıma seçicisi ve aç/kapa düğmesi var; iç içe
          tıklama hedefleri klavyeyle gezilemez hâle getirir.
        */}
        {aktif ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{sirket.name}</p>
            <p className="truncate text-xs text-ink-muted">{sirket.slug}</p>
          </div>
        ) : (
          <button
            type="button"
            disabled={gecis}
            onClick={gec}
            className="min-w-0 flex-1 text-left disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-brand-strong hover:underline">
                {sirket.name}
              </span>
              {gecis && <Halka />}
            </span>
            <span className="block truncate text-xs text-ink-muted">{sirket.slug}</span>
          </button>
        )}
        {sirket.isHome && (
          /*
           * EV ŞİRKETİ İŞARETLİ. Kullanıcının kendi üyeliği orada; diğer
           * şirketlerdeki yetkisi üst hesap rolünden geliyor ve ikisi farklı
           * olabiliyor. İşaret olmadan "neden bu şirkette daha az şey
           * yapabiliyorum" sorusunun cevabı hiçbir ekranda yazmıyor.
           */
          <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-ink-muted">
            kendi şirketin
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        className="mt-3 flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-surface-muted"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-3.5 w-3.5 shrink-0 transition ${acik ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path d="m8 6 4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Workspace&apos;ler ({sirket.workspaces.length})
      </button>

      {acik && (
        <ul className="mt-2 space-y-1 rounded-lg border border-line px-3 py-2">
          {sirket.workspaces.length === 0 ? (
            /* BOŞ LİSTE NEDENİNİ SÖYLÜYOR (CLAUDE.md): "henüz eklenmedi" ile
               "yüklenemedi" aynı boş alana çevrilmemeli. */
            <li className="py-1 text-xs text-ink-muted">
              Bu şirkette henüz workspace yok. Şirkete geçince aşağıdaki
              &quot;Workspace&apos;ler&quot; bölümünden ekleyebilirsin.
            </li>
          ) : (
            sirket.workspaces.map((w) => (
              <li key={w.id} className="truncate py-1 text-sm text-ink">
                {w.name}
              </li>
            ))
          )}
        </ul>
      )}

      {/*
        VAR OLAN WORKSPACE'İ BU ŞİRKETE TAŞI.
        Taşıma 30 tabloda `org_id` güncelliyor; seçici yalnızca BAŞKA
        şirketlerdeki workspace'leri listeliyor çünkü kendi listesinden
        seçmek hiçbir şey yapmayan bir seçenek olurdu.
      */}
      {adaylar.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor={`tasi-${sirket.id}`} className="sr-only">
            Bu şirkete taşınacak workspace
          </label>
          <select
            id={`tasi-${sirket.id}`}
            value={secilen}
            disabled={pending}
            onChange={(e) => setSecilen(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Var olan workspace’i taşı…</option>
            {adaylar.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.sirket})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || secilen === ''}
            onClick={() => {
              onTasi(secilen, sirket.id);
              setSecilen('');
            }}
            className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-muted disabled:opacity-40"
          >
            Taşı
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {aktif ? (
          /*
           * ZATEN SEÇİLİ ŞİRKETTE GEÇİŞ DÜĞMESİ YOK. Basılsaydı hiçbir şey
           * değişmeyen bir tam sayfa yüklemesi olurdu ve kullanıcı ekranın
           * boşuna sıfırlandığını görürdü. Bunun yerine düzenleme bölümünün
           * AŞAĞIDA olduğu yazılı — yoksa kullanıcı seçili şirketi
           * düzenlemenin yolunu arar.
           */
          <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs text-ink-muted">
            Şu an bu şirkettesin — aşağıdan düzenle
          </span>
        ) : (
          <button
            type="button"
            disabled={gecis}
            onClick={gec}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {gecis && <Halka />}
            Bu şirkete geç
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function UstHesapKur({
  pending,
  onKur,
}: {
  pending: boolean;
  onKur: (name: string) => void;
}) {
  const [ad, setAd] = useState('');
  const [alanHatasi, setAlanHatasi] = useState<string | undefined>();

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Üst hesap oluştur</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Google&apos;ın Müşteri Merkezi (MCC) gibi çalışır: birden çok şirketi tek girişle
        yönetirsin. Şu anki şirketin bu üst hesabın altına bağlanır, sonra yanına yenilerini
        ekleyebilirsin.
      </p>

      <form
        className="mt-4 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = createManagerAccountSchema.safeParse({ name: ad });
          if (!parsed.success) {
            setAlanHatasi(parsed.error.issues[0]?.message);
            return;
          }
          setAlanHatasi(undefined);
          onKur(parsed.data.name);
        }}
        noValidate
      >
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="ustHesapAdi" className="sr-only">
            Üst hesap adı
          </label>
          <input
            id="ustHesapAdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            disabled={pending}
            placeholder="Örn. Profaj Danışmanlık"
            aria-invalid={alanHatasi ? 'true' : undefined}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {alanHatasi && <p className="mt-1 text-xs text-red-600">{alanHatasi}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && <Halka />}
          Oluştur
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SirketEkle({
  pending,
  onEkle,
}: {
  pending: boolean;
  onEkle: (name: string) => void;
}) {
  const [ad, setAd] = useState('');
  const [alanHatasi, setAlanHatasi] = useState<string | undefined>();

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Şirket ekle</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Üst hesabın altına <strong>yeni</strong> bir şirket açar ve seni sahibi yapar.
        Var olan bir şirketi buraya bağlamak mümkün değil — o şirketin kendi kullanıcıları
        ve kendi verisi var, devri iki tarafın da onayını gerektirir.
      </p>

      <form
        className="mt-4 flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = createManagedOrganizationSchema.safeParse({ name: ad });
          if (!parsed.success) {
            setAlanHatasi(parsed.error.issues[0]?.message);
            return;
          }
          setAlanHatasi(undefined);
          onEkle(parsed.data.name);
          setAd('');
        }}
        noValidate
      >
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="sirketAdi" className="sr-only">
            Şirket adı
          </label>
          <input
            id="sirketAdi"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            disabled={pending}
            placeholder="Örn. Sabancı İnşaat A.Ş."
            aria-invalid={alanHatasi ? 'true' : undefined}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {alanHatasi && <p className="mt-1 text-xs text-red-600">{alanHatasi}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
        >
          {pending && <Halka />}
          Şirket ekle
        </button>
      </form>
    </section>
  );
}
