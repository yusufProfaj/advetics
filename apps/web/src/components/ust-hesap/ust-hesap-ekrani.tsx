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
 * Bu ekran ilk iki katmanı yönetiyor; workspace'ler kendi ekranında.
 *
 * VAR OLAN BİR ŞİRKETİ BAĞLAMA YOK ve bu bilinçli (arka uçta da yok):
 * "şu şirketi üst hesabıma ekle" diyebilmek, başkasının şirketini kendi
 * erişim listesine yazmak demekti. Devir iki tarafın da onayını isteyen
 * ayrı bir akış gerektirir.
 */
export function UstHesapEkrani({
  ilkAgac,
  yuklemeHatasi,
}: {
  ilkAgac: ManagerAccountTree | null;
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

      {agac === null ? (
        <UstHesapKur
          pending={pending}
          onKur={(name) => void gonder('/manager-account', { name })}
        />
      ) : (
        <>
          <SirketListesi agac={agac} />
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

function SirketListesi({ agac }: { agac: ManagerAccountTree }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{agac.name}</h2>
          <p className="text-xs text-ink-muted">Üst hesap · {agac.slug}</p>
        </div>
        {/* SESSİZ KESME YOK: kaç şirket olduğu yazılı (CLAUDE.md). */}
        <span className="shrink-0 text-xs text-ink-muted">
          {agac.organizations.length} şirket
        </span>
      </header>

      {agac.organizations.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">
          Bu üst hesaba bağlı şirket yok.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {agac.organizations.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {o.name}
                  {o.isHome && (
                    /*
                     * EV ŞİRKETİ İŞARETLİ. Kullanıcının kendi üyeliği orada;
                     * diğer şirketlerdeki yetkisi üst hesap rolünden geliyor
                     * ve ikisi farklı olabiliyor. İşaret olmadan "neden bu
                     * şirkette daha az şey yapabiliyorum" sorusunun cevabı
                     * hiçbir ekranda yazmıyor.
                     */
                    <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-normal text-ink-muted">
                      kendi şirketin
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-muted">{o.slug}</p>
              </div>
              <span className="shrink-0 text-xs text-ink-muted">
                {o.workspaceCount} workspace
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
