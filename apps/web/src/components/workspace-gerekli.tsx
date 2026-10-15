'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { acilisAdresi } from '@/lib/panel-adresleri';
import type { WorkspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { dugmeSinifi } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { Kart } from '@/components/ui/kart';
import { Girdi } from '@/components/ui/alan';
import { useSozluk } from '@/dil/saglayici';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';

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
  const d = useSozluk(genelBakisSozlugu).workspace;

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
      setHata(e instanceof ApiRequestError ? e.message : d.secilemedi);
      setBekleyen(null);
    }
  }

  const suzulmus = ara.trim()
    ? workspaceler.filter((w) =>
        w.name.toLocaleLowerCase('tr').includes(ara.trim().toLocaleLowerCase('tr')),
      )
    : workspaceler;

  /*
   * SAYFANIN YERİNE ÇİZİLİYOR: başlık ortak iskeletten (`SayfaIskeleti`,
   * `dar` genişlik; seçim bir form işi), içerik tek kart. Elle yazılmış
   * `h1` ve kendi yarıçaplı kutusu vardı; menüden bu ekrana düşen kullanıcı
   * başlığın diğer sayfalardan farklı yerde durduğunu görüyordu.
   */
  return (
    <SayfaIskeleti genislik="dar" baslik={ekran}>
      <Kart>
      {workspaceler.length === 0 ? (
        /*
         * HİÇ WORKSPACE YOK: seçim ekranı değil, KURULUM ekranı. Eski kutu
         * burada da "üstteki seçiciden seç" diyordu ve seçicide seçilecek
         * bir şey yoktu.
         */
        <>
          <p className="m-0 text-14 text-ink-muted">
            {neden} {d.henuzYok(sirketAdi)}
          </p>
          {kurulumGorunur ? (
            <Link href={acilisAdresi('workspace')} className={`mt-5 ${dugmeSinifi('koyu')}`}>
              {d.olustur}
            </Link>
          ) : (
            <p className="m-0 mt-4 text-14 text-ink">
              {d.yetkiYok}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="m-0 text-14 text-ink-muted">
            {neden} {d.hangisi}
          </p>
          <p className="m-0 mt-1 text-12 text-ink-muted">
            {d.ustBar}
          </p>

          {workspaceler.length > 6 && (
            <label className="mt-4 block max-w-sm">
              <span className="sr-only">{d.ara}</span>
              <Girdi
                type="search"
                name="workspace-ara"
                autoComplete="off"
                value={ara}
                onChange={(e) => setAra(e.target.value)}
                placeholder={d.ara}
              />
            </label>
          )}

          {suzulmus.length === 0 ? (
            <p className="m-0 mt-4 text-14 text-ink-muted">
              {d.aramaBos(workspaceler.length)}
            </p>
          ) : (
            <ul className="m-0 mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
              {suzulmus.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    disabled={bekleyen !== null}
                    aria-busy={bekleyen === w.id || undefined}
                    onClick={() => void sec(w.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-alan border border-line bg-surface px-4 py-3 text-left text-14 font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate">{w.name}</span>
                    <span aria-hidden="true" className="shrink-0 text-ink-muted">
                      {bekleyen === w.id ? d.aciliyor : '→'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* SESSİZ KESME YOK: arama süzdüyse kaç tanesinin göründüğü yazıyor. */}
          {suzulmus.length > 0 && suzulmus.length < workspaceler.length && (
            <p className="m-0 mt-2 text-12 text-ink-muted">
              {d.gosteriliyor(suzulmus.length, workspaceler.length)}
            </p>
          )}

          <p className="m-0 mt-4 text-12 text-ink-muted">{sirketAdi}</p>
        </>
      )}

      {hata && (
        <div className="mt-4">
          <Uyari ton="tehlike">{hata}</Uyari>
        </div>
      )}
      </Kart>
    </SayfaIskeleti>
  );
}
