'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TUM_SIRKETLER } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { Halka, TamEkranYukleniyor } from './yukleniyor';

export interface KapsamSirketi {
  id: string;
  name: string;
  workspaces: Array<{ id: string; name: string }>;
}

/**
 * ═══ TEK SEÇİCİ — AJANS › ŞİRKET › WORKSPACE ═══
 *
 * Önce İKİ seçici vardı (şirket ve workspace) ve aralarında bir `›` işareti.
 * İkisi aynı ağacın farklı seviyeleri: ayrı kutulara koymak, kullanıcının
 * "hangisi hangisini kapsıyor" sorusunu ekrandan değil KAFASINDAN cevaplaması
 * demekti — ve bir seviye atlamak (ajanstan doğrudan bir workspace'e) iki
 * ayrı tıklama gerektiriyordu.
 *
 * ÜÇ SEVİYE, ÜÇ TIKLANABİLİR SATIR TÜRÜ:
 *   · AJANS   → üst hesabın altındaki HER şirket tek pencerede
 *   · ŞİRKET  → o şirketin geneli (bütün workspace'leri)
 *   · WORKSPACE → tek workspace
 *
 * Her satır TEK BİR isteğe dönüşüyor; sunucu gerekli cookie'leri kendisi
 * ayarlıyor (workspace seçmek şirketi de değiştiriyor). İstemcide iki çağrı
 * zincirlemek, birincisi başarılı ikincisi başarısız olduğunda yarım bir
 * duruma düşmek demekti.
 */
export function KapsamSecici({
  ajans,
  sirketler,
  aktifSirketId,
  aktifWorkspaceId,
  tumSirketler,
  yonetimGorunur,
}: {
  /** Üst hesap adı — yoksa `null` (bağımsız şirket). */
  ajans: string | null;
  sirketler: KapsamSirketi[];
  aktifSirketId: string;
  aktifWorkspaceId: string | null;
  tumSirketler: boolean;
  /** "Yönetim paneli" bağlantısı — `org.write` yoksa basılmıyor. */
  yonetimGorunur: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [arama, setArama] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, []);

  const aktifSirket = sirketler.find((s) => s.id === aktifSirketId) ?? null;
  const aktifWorkspace = aktifSirket?.workspaces.find((w) => w.id === aktifWorkspaceId) ?? null;
  const bekliyor = pending || isPending;

  /*
   * ARAMA BÜTÜN AĞAÇTA. Kullanıcı bir workspace adı yazıyor ve onun hangi
   * şirkette olduğunu BİLMEK ZORUNDA DEĞİL — zaten aradığı şey o.
   * Eşleşen workspace'i olan şirket, kendi adı eşleşmese bile listede
   * kalıyor; yoksa sonuç "bulunamadı" gibi görünürdü.
   *
   * Türkçe küçültme AÇIKÇA veriliyor: varsayılanda "İ" → "i̇" oluyor ve
   * "İkon" araması "ikon" ile eşleşmiyor.
   */
  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return sirketler;
    const uyar = (m: string) => m.toLocaleLowerCase('tr').includes(q);
    return sirketler
      .map((s) => (uyar(s.name) ? s : { ...s, workspaces: s.workspaces.filter((w) => uyar(w.name)) }))
      .filter((s) => uyar(s.name) || s.workspaces.length > 0);
  }, [sirketler, arama]);

  async function git(
    etiket: string,
    yol: '/auth/switch-org' | '/auth/switch-client',
    govde: Record<string, string | null>,
    tamSayfa: boolean,
  ) {
    setOpen(false);
    setArama('');
    setPending(true);
    setHata(null);
    setGecilen(etiket);
    try {
      await apiFetch(yol, { method: 'POST', body: JSON.stringify(govde) });
      if (tamSayfa) {
        /*
         * KAPSAM DEĞİŞİNCE TAM SAYFA. Kenar çubuğu, marka renkleri ve
         * bütün sunucu bileşenlerinin verisi değişiyor; istemci
         * bileşenlerinin state'i (açık süzgeçler, seçili hesap kimlikleri)
         * önceki kapsamdan kalırsa anlamsız kimlikler taşıyor ve sessizce
         * boş listeler üretiyor.
         */
        startTransition(() => window.location.assign('/dashboard'));
        return;
      }
      // URL'DEKİ `?musteri=` TEMİZLENİYOR: sayfalar aktif workspace'i
      // `params.musteri ?? session.activeClientId` sırasıyla çözüyor, yani
      // URL cookie'yi EZİYOR ve üst bar ile gövde ayrışıyor.
      const kalan = Object.fromEntries(searchParams?.entries() ?? []);
      delete kalan.musteri;
      router.replace(baglanti(pathname, kalan, {}));
      startTransition(() => {
        router.refresh();
        setPending(false);
      });
    } catch (e) {
      // HATA YUTULMUYOR: sessizce eski kapsamda kalmak "tıkladım ama
      // değişmedi" hâli demek (CLAUDE.md).
      setHata(e instanceof ApiRequestError ? e.message : 'Kapsam değiştirilemedi.');
      setPending(false);
      setGecilen(null);
    }
  }

  const ajansaGec = () =>
    void git('Tüm şirketler', '/auth/switch-org', { organizationId: TUM_SIRKETLER }, true);

  const sirketeGec = (s: KapsamSirketi) => {
    const buradayiz = s.id === aktifSirketId && !tumSirketler;
    if (buradayiz && !aktifWorkspaceId) {
      /*
       * ZATEN ŞİRKET GENELİNDEYİZ — istek ATILMIYOR.
       *
       * Hiçbir şey değiştirmeyen bir tur, kullanıcıya bir bekleme örtüsü
       * ve sonunda aynı ekranı göstermek demek. Eski workspace seçicideki
       * aynı karar; seviye değişti, gerekçe değişmedi.
       */
      setOpen(false);
      return;
    }
    if (buradayiz) {
      // AYNI ŞİRKET, WORKSPACE SEÇİLİ: geçiş değil, DARALTMAYI KALDIRMA.
      void git(s.name, '/auth/switch-client', { clientId: null }, false);
      return;
    }
    void git(s.name, '/auth/switch-org', { organizationId: s.id }, true);
  };

  const workspaceeGec = (w: { id: string; name: string }, sirketId: string) =>
    void git(
      w.name,
      '/auth/switch-client',
      { clientId: w.id },
      // ŞİRKET DE DEĞİŞİYORSA tam sayfa: kenar çubuğu ve marka değişiyor.
      sirketId !== aktifSirketId || tumSirketler,
    );

  const baslik = tumSirketler
    ? (ajans ?? 'Tüm şirketler')
    : (aktifWorkspace?.name ?? aktifSirket?.name ?? 'Kapsam');
  const altBaslik = tumSirketler
    ? `Tüm şirketler · ${sirketler.length} şirket`
    : aktifWorkspace
      ? (aktifSirket?.name ?? 'Workspace')
      : `${aktifSirket?.workspaces.length ?? 0} workspace · şirket geneli`;

  return (
    <div ref={boxRef} className="relative">
      {bekliyor && (
        <TamEkranYukleniyor mesaj={`${gecilen ?? 'Kapsam'} görünümüne geçiliyor…`} />
      )}

      <button
        type="button"
        onClick={() => {
          setArama('');
          setOpen((v) => !v);
        }}
        disabled={bekliyor}
        aria-expanded={open}
        aria-haspopup="tree"
        className="flex min-w-[15rem] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-[11px] font-semibold uppercase text-white">
          {baslik.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">{baslik}</span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            {altBaslik}
          </span>
        </span>
        {bekliyor ? (
          <Halka />
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {hata && (
        <p
          role="alert"
          className="absolute left-0 top-full z-30 mt-1 w-max max-w-sm rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700"
        >
          {hata}
        </p>
      )}

      {open && (
        <div
          role="tree"
          className="absolute left-0 top-full z-30 mt-1.5 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="search"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Şirket ya da workspace ara…"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>

          {/*
            AJANS SATIRI YALNIZCA ÜST HESAP VARSA. Bağımsız bir şirkette
            "hepsi" ile "o şirket" aynı şey ve aynı sonucu veren iki satır,
            aralarında bir fark varmış gibi düşündürürdü.
          */}
          {ajans && (
            <>
              <button
                type="button"
                role="treeitem"
                aria-selected={tumSirketler}
                onClick={ajansaGec}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-muted ${
                  tumSirketler ? 'font-semibold text-brand' : 'text-ink'
                }`}
              >
                <span className="min-w-0 truncate">{ajans}</span>
                <span className="shrink-0 text-[11px] text-ink-muted">
                  {tumSirketler ? 'seçili' : 'tüm şirketler'}
                </span>
              </button>
              <div className="h-px bg-line" />
            </>
          )}

          <div className="max-h-80 overflow-y-auto py-1">
            {suzulmus.length === 0 ? (
              // BOŞ SONUÇ SEBEBİYLE yazılıyor: sessiz boş liste "hiç yok"
              // ile "arama tutmadı" hâllerini aynı ekrana çeviriyor.
              <p className="px-3 py-4 text-center text-xs text-ink-muted">
                “{arama}” ile eşleşen şirket ya da workspace yok.
              </p>
            ) : (
              suzulmus.map((s) => (
                <div key={s.id}>
                  <button
                    type="button"
                    role="treeitem"
                    aria-selected={!tumSirketler && s.id === aktifSirketId && !aktifWorkspaceId}
                    onClick={() => sirketeGec(s)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-surface-muted ${
                      !tumSirketler && s.id === aktifSirketId
                        ? 'font-semibold text-brand'
                        : 'text-ink'
                    }`}
                  >
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="shrink-0 text-[11px] font-normal text-ink-muted">
                      {!tumSirketler && s.id === aktifSirketId && !aktifWorkspaceId
                        ? 'şirket geneli'
                        : `${s.workspaces.length} workspace`}
                    </span>
                  </button>

                  {s.workspaces.length === 0 ? (
                    /*
                      "YOK" DEĞİL "ERİŞEBİLDİĞİN YOK".
                      Liste kullanıcının ERİŞTİĞİ workspace'leri taşıyor;
                      şirkette başkaları olabilir. "Bu şirkette workspace
                      yok" demek, görmediği şeyi var olmayan diye
                      göstermekti — ve bir süre AKTİF şirket dışındaki her
                      satırda böyle yazıyordu.
                    */
                    <p className="px-3 py-1 pl-7 text-[11px] text-ink-muted">
                      Bu şirkette erişebildiğin workspace yok.
                    </p>
                  ) : (
                    <ul>
                      {s.workspaces.map((w) => (
                        <li key={w.id}>
                          <button
                            type="button"
                            role="treeitem"
                            aria-selected={w.id === aktifWorkspaceId}
                            onClick={() => workspaceeGec(w, s.id)}
                            className={`flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-sm transition hover:bg-surface-muted ${
                              w.id === aktifWorkspaceId ? 'font-semibold text-brand' : 'text-ink'
                            }`}
                          >
                            <span className="min-w-0 truncate">{w.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>

          {/*
            MARKA RENGİNDE DOLU VE BEYAZ YAZILI — bir kapsam SEÇMİYOR, yeni
            bir ekran açıyor. Diğer satırlarla aynı görünseydi "bu da bir
            şirket mi" diye okunurdu.

            YETKİSİ OLMAYANA GÖSTERİLMİYOR. Sayfa `org.write` istiyor ve
            yetkisiz kullanıcıyı `/dashboard`a yönlendiriyor: bağlantıyı
            herkese basmak, tıklayınca sebepsizce başka bir ekrana atılan
            bir düğme demekti.
          */}
          {yonetimGorunur && (
          <Link
            href="/ayarlar/ust-hesap"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-line bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            Yönetim paneli
          </Link>
          )}
        </div>
      )}
    </div>
  );
}
