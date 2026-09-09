'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka, TamEkranYukleniyor } from './yukleniyor';

interface Sirket {
  id: string;
  name: string;
  slug: string;
}

/**
 * ŞİRKET SEÇİCİ — üst hesap (MCC) altındaki kardeş şirketler arası geçiş.
 *
 * WORKSPACE SEÇİCİNİN SOLUNDA duruyor ve bu bilinçli: hiyerarşi soldan sağa
 * okunuyor (Şirket › Workspace). İki seçiciyi yan yana koyup sırayı ters
 * çevirmek, kullanıcının hangisinin hangisini kapsadığını ekrandan
 * çıkaramaması demekti.
 *
 * SEÇİM SUNUCUDA DOĞRULANIYOR. Cookie'yi elle değiştirmek erişim
 * kazandırmaz: API her istekte seçimi kullanıcının üst hesabı altındaki
 * gerçek şirket listesine karşı süzüyor ve geçmezse EV şirketine düşüyor.
 *
 * GEÇİŞ WORKSPACE SEÇİMİNİ SIFIRLIYOR (sunucu tarafında): yeni şirkette o
 * workspace kimliği geçersiz. Bırakılsaydı üst barda bir workspace adı
 * yazmaya devam eder, gövde başka bir şey gösterirdi.
 */
export function SirketSecici({
  managerAccountName,
  organizations,
  activeOrganizationId,
  activeClientId,
}: {
  managerAccountName: string;
  organizations: Sirket[];
  activeOrganizationId: string;
  /** Seçili workspace — `null` ise zaten şirket geneli görünümdeyiz. */
  activeClientId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disariTiklama(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', disariTiklama);
    return () => document.removeEventListener('mousedown', disariTiklama);
  }, []);

  const aktif = organizations.find((o) => o.id === activeOrganizationId) ?? null;
  const bekliyor = pending || isPending;

  /**
   * ŞİRKET GENELİ GÖRÜNÜM — "Tüm workspace'ler".
   *
   * Bu eylem workspace seçicisinden BURAYA taşındı: hiyerarşi Şirket ›
   * Workspace ve "hepsi" şirketin tamamı demek, yani karar bir üst
   * seviyeye ait. İki seçicide birden durması, aynı eylemin iki yeri
   * olması ve birinin bir gün ötekini tutmaması demekti.
   *
   * TAM SAYFA YÜKLEMESİ YOK: şirket değişmiyor, yalnızca daraltma
   * kalkıyor. `router.refresh()` sunucu bileşenlerini tazelemeye yetiyor
   * ve açık süzgeçler AYNI şirkete ait olduğu için anlamlarını koruyor.
   */
  async function sirketGeneli() {
    setOpen(false);
    setPending(true);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: null }),
      });
      startTransition(() => {
        router.refresh();
        setPending(false);
      });
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Şirket geneli görünüme geçilemedi.');
      setPending(false);
    }
  }

  async function sec(organizationId: string) {
    if (organizationId === activeOrganizationId) {
      // AYNI ŞİRKET: geçiş değil, DARALTMAYI KALDIRMA. Eskiden burası
      // hiçbir şey yapmıyordu ve org geneli görünüme dönmenin yolu
      // workspace seçicisindeydi; o satır kaldırılınca eylem buraya geçti.
      await sirketGeneli();
      return;
    }
    setOpen(false);
    setPending(true);
    setHata(null);
    setGecilen(organizations.find((o) => o.id === organizationId)?.name ?? null);
    try {
      await apiFetch('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
      /*
       * TAM YENİLEME — `router.refresh()` YETMEZ.
       *
       * Şirket değişince kenar çubuğu, workspace listesi, marka renkleri ve
       * bütün sunucu bileşenlerinin verisi değişiyor. `refresh` sunucu
       * bileşenlerini tazeliyor ama istemci bileşenlerinin state'i (açık
       * filtreler, seçili sekmeler) ÖNCEKİ şirketten kalıyor ve o state
       * yeni şirkette anlamsız kimlikler taşıyor.
       */
      startTransition(() => {
        window.location.assign('/dashboard');
      });
    } catch (e) {
      /*
       * HATA YUTULMUYOR (CLAUDE.md). Sunucu "bu şirkete erişim yetkiniz yok"
       * diyorsa kullanıcı bunu görmeli — sessizce eski şirkette kalmak,
       * "tıkladım ama değişmedi" hâli demek.
       */
      setHata(e instanceof ApiRequestError ? e.message : 'Şirket değiştirilemedi.');
      setPending(false);
      setGecilen(null);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      {bekliyor && (
        <TamEkranYukleniyor mesaj={`${gecilen ?? 'Şirket'} şirketine geçiliyor…`} />
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={bekliyor}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-[11rem] items-center gap-2.5 rounded-xl border border-line bg-surface-muted px-3 py-2 text-left transition hover:bg-surface-sunken disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">
            {aktif?.name ?? 'Şirket'}
          </span>
          {/*
            ÜST HESABIN ADI ALT SATIRDA. "Hangi danışmanlığın altındayım"
            sorusu, birden çok üst hesabı olan bir ekipte tek bakışta
            cevaplanmalı — ve bu satır olmadan iki şirket adı yan yana
            hangi ağaca ait olduklarını söylemiyor.
          */}
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            {managerAccountName}
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
          className="absolute left-0 top-full z-30 mt-1 w-max max-w-xs rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700"
        >
          {hata}
        </p>
      )}

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <p className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {managerAccountName} · {organizations.length} şirket
          </p>

          <ul className="max-h-72 overflow-y-auto py-1">
            {organizations.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === activeOrganizationId}
                  onClick={() => void sec(o.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-muted ${
                    o.id === activeOrganizationId ? 'font-semibold text-brand' : 'text-ink'
                  }`}
                >
                  <span className="min-w-0 truncate">{o.name}</span>
                  {o.id === activeOrganizationId && (
                    /*
                     * EYLEM ADIYLA YAZILI. "seçili" yazmak, satırın
                     * tıklanınca ne yapacağını gizliyordu — kullanıcı org
                     * geneli görünüme dönmek isteyince nereye basacağını
                     * bilemezdi.
                     */
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      {activeClientId === null ? 'şirket geneli' : 'tüm workspace’ler'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <Link
            href="/ayarlar/ust-hesap"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2 text-sm text-brand hover:bg-surface-muted"
          >
            Üst hesabı yönet
          </Link>
        </div>
      )}
    </div>
  );
}
