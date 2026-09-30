'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import type { WorkspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { dugmeSinifi } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';

/**
 * ═══ WORKSPACE SEÇİLMEDEN AÇILAMAYAN SAYFA — SEÇİM YERİNDE ═══
 *
 * On üç sayfada kopyalanmış bir kutu vardı: "Önce bir workspace seç".
 * Sekizinde neden gerektiği bile yazmıyordu ve ikisi kullanıcıyı "üstteki
 * seçiciye" gönderiyordu. Kutu yalnızca seçim YOKKEN çıkıyordu, yani
 * kullanıcı ya aramaya çıkıyordu ya da (şirkette hiç workspace yoksa)
 * seçicide seçecek bir şey bulamıyordu.
 *
 * SEÇİM ÜST BARLA AYNI YOLDAN (`/auth/switch-client`), URL'DEN DEĞİL.
 * `?musteri=` ile seçmek bu sayfada çalışır ama üst bar eski kapsamı
 * göstermeye devam eder ve bir sonraki sayfada seçim kaybolur; kullanıcı
 * her ekranda yeniden seçmek zorunda kalır. Tek bir seçim, tek bir yerde.
 *
 * TEK WORKSPACE OLSA DA OTOMATİK SEÇİLMİYOR: bir tıkla kalıcı oluyor ve bu
 * ekran, ikinci workspace eklendiğinde davranış değiştirmiyor.
 *
 * TAM SAYFA YENİLEME: workspace değişince kenar çubuğu ve marka renkleri
 * de değişebiliyor (başka şirketin workspace'i). `kapsam-secici.tsx` aynı
 * kararı aynı gerekçeyle veriyor.
 */
export function WorkspaceGerekli({
  ekran,
  neden,
  workspaceler,
  sirketAdi,
  kurulumGorunur,
}: WorkspaceSecimVerisi & {
  /** Sayfanın adı: "Raporlar", "Kurallar"… */
  ekran: string;
  /** Tek cümle: bu sayfa NEDEN workspace istiyor. */
  neden: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [ara, setAra] = useState('');

  async function sec(id: string): Promise<void> {
    setBekleyen(id);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: id }),
      });
      /*
       * `?musteri=` TEMİZLENİYOR: sayfa URL'yi seçimden önce okuyor, yani
       * URL'de kalan eski bir kimlik yeni seçimi ezerdi.
       */
      const kalan = Object.fromEntries(searchParams?.entries() ?? []);
      delete kalan.musteri;
      window.location.assign(baglanti(pathname, kalan, {}));
    } catch (e) {
      // HATA YUTULMUYOR: "tıkladım ama değişmedi" hâli sessiz kalmamalı.
      setHata(e instanceof ApiRequestError ? e.message : 'Workspace seçilemedi.');
      setBekleyen(null);
    }
  }

  const suzulmus = ara.trim()
    ? workspaceler.filter((w) =>
        w.name.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr')),
      )
    : workspaceler;

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-6">
      <h1 className="sayfa-baslik">{ekran}</h1>

      {workspaceler.length === 0 ? (
        /*
         * HİÇ WORKSPACE YOK: seçim ekranı değil, KURULUM ekranı. Eski kutu
         * burada da "üstteki seçiciden seç" diyordu ve seçicide seçilecek
         * bir şey yoktu.
         */
        <>
          <p className="mt-2 text-sm text-ink-muted">
            {neden} {sirketAdi} altında henüz workspace yok.
          </p>
          {kurulumGorunur ? (
            <Link href="/kurulum?tur=workspace" className={`mt-5 ${dugmeSinifi()}`}>
              Workspace oluştur
            </Link>
          ) : (
            <p className="mt-4 text-sm text-ink">
              Workspace açma yetkin yok. Yöneticinden bir workspace oluşturmasını ya da seni
              birine eklemesini iste.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-muted">
            {neden} Hangi workspace ile çalışmak istiyorsun?
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Seçimin üst bara da yansır ve diğer ekranlarda da geçerli olur.
          </p>

          {workspaceler.length > 6 && (
            <label className="mt-4 block max-w-sm">
              <span className="sr-only">Workspace ara</span>
              <input
                type="search"
                name="workspace-ara"
                autoComplete="off"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder="Workspace ara…"
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm focus-visible:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand/30"
              />
            </label>
          )}

          {suzulmus.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">
              Aramaya uyan workspace yok ({workspaceler.length} workspace var).
            </p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {suzulmus.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={bekleyen !== null}
                    aria-busy={bekleyen === w.id || undefined}
                    onClick={() => void sec(w.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm font-medium text-ink transition-colors hover:border-brand/40 hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate">{w.name}</span>
                    <span aria-hidden="true" className="shrink-0 text-ink-muted">
                      {bekleyen === w.id ? 'Açılıyor…' : '→'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* SESSİZ KESME YOK: arama süzdüyse kaç tanesinin göründüğü yazıyor. */}
          {suzulmus.length > 0 && suzulmus.length < workspaceler.length && (
            <p className="mt-2 text-xs text-ink-muted">
              {suzulmus.length} / {workspaceler.length} workspace gösteriliyor.
            </p>
          )}

          <p className="mt-4 text-xs text-ink-muted">{sirketAdi}</p>
        </>
      )}

      {hata && (
        <div className="mt-4">
          <Uyari ton="tehlike">{hata}</Uyari>
        </div>
      )}
    </div>
  );
}
