'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { YonetimPaneli } from './tenancy/yonetim-paneli';

interface AvailableClient {
  id: string;
  name: string;
  status: string;
}

/**
 * Aktif müşteri seçici.
 *
 * Liste `session.availableClients`ten gelir, membership'lerden TÜRETİLMEZ:
 * org geneli yetkili bir kullanıcının tek membership satırı vardır ve
 * `clientId` null'dır. Listeyi membership'lerden çıkarmak, yöneticiye boş bir
 * seçici gösteriyordu ve müşteri seçilemediği için bağlantı kurmak imkânsız
 * hâle geliyordu.
 *
 * Seçim sunucuya bildirilir ve cookie'de saklanır. Cookie'yi elle değiştirmek
 * erişim kazandırmaz: API her istekte seçimi kullanıcının gerçek erişim
 * listesine karşı doğrular ve geçersizse org geneli görünüme düşer.
 */
export function ClientSwitcher({
  availableClients,
  activeClientId,
  isOrgAdmin,
}: {
  availableClients: AvailableClient[];
  activeClientId: string | null;
  isOrgAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [arama, setArama] = useState('');
  const [panelAcik, setPanelAcik] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const active = availableClients.find((c) => c.id === activeClientId) ?? null;

  /*
   * ARAMA LİSTEYİ SÜZÜYOR. On beş müşteriden sonra açılır liste kaydırmadan
   * okunmuyor ve aranan ad ekranın dışında kalıyor.
   *
   * Türkçe küçültme AÇIKÇA veriliyor (`toLocaleLowerCase('tr')`): varsayılan
   * küçültmede "İ" → "i̇" oluyor ve "İkon" araması "ikon" ile eşleşmiyor.
   */
  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return availableClients;
    return availableClients.filter((c) => c.name.toLocaleLowerCase('tr').includes(q));
  }, [availableClients, arama]);

  async function select(clientId: string | null) {
    setOpen(false);
    setPending(true);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });

      /*
       * URL'DEKİ `?musteri=` TEMİZLENİYOR — ve bu düzeltmenin ta kendisi.
       *
       * Sayfalar aktif müşteriyi `params.musteri ?? session.activeClientId`
       * sırasıyla çözüyor, yani URL parametresi COOKIE'Yİ EZİYOR. Bu şerit
       * temizlenmediğinde şu oluyordu: kullanıcı sayfa içi bir bağlantıyla
       * `?musteri=Fenbay` adresine gidiyor, sonra üst bardan "Ege Birlik
       * Yapı"yı seçiyor; cookie değişiyor, ÜST BAR "Ege Birlik Yapı" yazıyor
       * ama SAYFA GÖVDESİ hâlâ Fenbay'ın verisini gösteriyor.
       *
       * Bu bir veri sızıntısı DEĞİL: gösterilen veri gerçekten URL'deki
       * müşteriye ait ve RLS onu doğruluyor. Ama ekranda yazan aktif
       * workspace ile gövdedeki veri BİRBİRİNİ TUTMUYOR — ve bu, sızıntıdan
       * ayırt edilemeyecek kadar kötü bir hâl. Panelde "hangi müşterinin
       * verisine bakıyorum" sorusunun tek bir cevabı olmak zorunda.
       *
       * `replace`, `push` DEĞİL: geri düğmesi kullanıcıyı az önce
       * terk ettiği müşteriye geri atmamalı.
       */
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (params.has('musteri')) {
        params.delete('musteri');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (availableClients.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-muted">
        Henüz müşteri yok —{' '}
        <a href="/ayarlar/musteriler" className="text-brand underline">
          müşteri ekle
        </a>
      </div>
    );
  }

  // Tek müşterisi olan ve org geneli yetkisi olmayan kullanıcıya seçici gösterme.
  if (!isOrgAdmin && availableClients.length === 1) {
    return (
      <div className="flex items-center gap-2.5">
        <Avatar name={availableClients[0]!.name} />
        <span className="text-sm font-medium">{availableClients[0]!.name}</span>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          // Arama HER AÇILIŞTA sıfırlanıyor: önceki aramayla açılan bir
          // liste, kullanıcının aradığı müşteriyi "yok" gibi gösteriyor.
          setArama('');
          setOpen((v) => !v);
        }}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-w-[13rem] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <Avatar name={active?.name ?? '∗'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">
            {active?.name ?? 'Tüm müşteriler'}
          </span>
          <span className="block text-[11px] leading-tight text-ink-muted">
            {active ? 'Müşteri görünümü' : `${availableClients.length} müşteri`}
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          {/*
            ARAMA EN ÜSTTE. Liste büyüdükçe aranan ad ekranın dışında kalıyor
            ve kullanıcı kaydırarak arıyor. `autoFocus`: menü zaten bir
            tıklamayla açıldı, ikinci bir tıklama istemek gereksiz.
          */}
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="search"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Müşteri ara…"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>

          {/*
            "TÜM MÜŞTERİLER" ARAMADA GİZLENİYOR. Bir ad arayan kullanıcı için
            organizasyon geneli görünüm bir sonuç değil; listenin başında
            durması aranan şeyi bir satır aşağı itiyor.
          */}
          {isOrgAdmin && arama.trim() === '' && (
            <>
              <Option
                label="Tüm müşteriler"
                hint="Organizasyon geneli görünüm"
                selected={activeClientId === null}
                onSelect={() => void select(null)}
              />
              <div className="h-px bg-line" />
            </>
          )}

          <div className="max-h-72 overflow-y-auto">
            {suzulmus.length === 0 ? (
              // Boş sonuç SEBEBİYLE yazılıyor: sessiz boş liste "müşteri yok"
              // ile "arama tutmadı" hâllerini aynı ekrana çeviriyor.
              <p className="px-3 py-4 text-center text-xs text-ink-muted">
                “{arama}” ile eşleşen müşteri yok.
              </p>
            ) : (
              suzulmus.map((c) => (
                <Option
                  key={c.id}
                  label={c.name}
                  hint={c.status === 'paused' ? 'Duraklatıldı' : undefined}
                  selected={c.id === activeClientId}
                  onSelect={() => void select(c.id)}
                />
              ))
            )}
          </div>

          {/*
            YÖNETİM PANELİ — LİSTENİN ÜYESİ DEĞİL, BİR EYLEM.
            Marka renginde dolu ve beyaz yazılı: bir workspace seçmiyor, yeni
            bir pencere açıyor. Aynı görünümde olsaydı "bu da bir müşteri mi"
            diye okunurdu.
          */}
          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPanelAcik(true);
              }}
              className="flex w-full items-center gap-2.5 bg-brand px-3 py-2.5 text-left text-white transition hover:opacity-90"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
                <path
                  d="M3 4.5h14M3 10h14M3 15.5h14"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-sm font-medium">Yönetim paneli</span>
            </button>
          )}
        </div>
      )}

      <YonetimPaneli
        acik={panelAcik}
        onKapat={() => setPanelAcik(false)}
        activeClientId={activeClientId}
        onSec={(id) => {
          setPanelAcik(false);
          void select(id);
        }}
      />
    </div>
  );
}

function Option({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition ${
        selected ? 'bg-brand-soft' : 'hover:bg-surface-muted'
      }`}
    >
      <Avatar name={label} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${selected ? 'font-semibold text-brand' : ''}`}>
          {label}
        </span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </span>
      {selected && (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-brand" aria-hidden>
          <path d="m5 10 3.5 3.5L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-[11px] font-semibold uppercase text-white">
      {name.slice(0, 2)}
    </span>
  );
}
