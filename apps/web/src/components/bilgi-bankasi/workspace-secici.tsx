'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * ═══ BİLGİ BANKASI WORKSPACE'E ÖZEL — HANGİSİ OLDUĞU SORULUYOR ═══
 *
 * Sayfa bir süre workspace'i SESSİZCE seçiyordu:
 * `activeClientId ?? availableClients[0]`. Şirket seçili olup workspace
 * seçilmemişse listedeki İLK workspace açılıyordu ve başlıkta adı yazmıyordu:
 * kullanıcı şirketin bilgi bankasını düzenlediğini sanarken bambaşka bir
 * workspace'in kaydını değiştiriyordu.
 *
 * Bu kayıt reklam metnini besliyor, yani yanlış workspace'e yazılan bir
 * cümle başka bir markanın reklamında çıkıyor. Seçim artık AÇIK: kullanıcı
 * hangi workspace olduğunu söylemeden sayfa içerik göstermiyor.
 */
export function WorkspaceSecici({
  workspaceler,
  aktif,
  sirketAdi,
}: {
  workspaceler: Array<{ id: string; name: string }>;
  /** Seçili workspace — yoksa seçim ekranı tam sayfa. */
  aktif: { id: string; name: string } | null;
  sirketAdi: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [ara, setAra] = useState('');

  function sec(id: string): void {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set('musteri', id);
    /*
     * SEKME SIFIRLANIYOR. Workspace değişince açık sekme anlamını koruyor
     * ama YETKİ koruyabilir: bir workspace'te görünen sekme diğerinde
     * gizli olabiliyor ve URL'de kalan kod orada boş bir seçim olurdu.
     */
    p.delete('sekme');
    startTransition(() => router.push(`${pathname}?${p.toString()}`));
  }

  /* SEÇİLİYSE: ince bir şerit — hangi workspace olduğu her zaman ekranda. */
  if (aktif) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-ink-muted">Workspace</span>
        <span className="text-sm font-semibold text-ink">{aktif.name}</span>
        {workspaceler.length > 1 && (
          <>
            <span className="text-ink-muted">·</span>
            {/*
              DEĞİŞTİRME AYNI ŞERİTTE. Ayrı bir sayfaya göndermek,
              kullanıcının düzenlediği alanı terk etmesi demek.
            */}
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Workspace değiştir</span>
              <select
                value={aktif.id}
                disabled={isPending}
                onChange={(e) => sec(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-brand disabled:opacity-50"
              >
                {workspaceler.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <span className="ml-auto text-[11px] text-ink-muted">{sirketAdi}</span>
      </div>
    );
  }

  /*
   * SEÇİLMEMİŞSE: SEÇİM EKRANI — ve otomatik seçim YOK.
   *
   * Tek workspace varsa bile otomatik seçmiyoruz: kullanıcı hangi kaydı
   * düzenlediğini bir kez görmüş oluyor ve bu ekran, ikinci workspace
   * eklendiğinde davranış değiştirmiyor.
   */
  const suzulmus = ara.trim()
    ? workspaceler.filter((w) => w.name.toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr')))
    : workspaceler;

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Hangi workspace?</h2>
      <p className="mt-1 max-w-lg text-xs text-ink-muted">
        Bilgi Bankası workspace başına tutuluyor: genel bilgiler, hedef kitle ve
        marka bilgileri her workspace’te farklı ve reklam metni buradan
        besleniyor. {sirketAdi} altındaki workspace’ler:
      </p>

      {workspaceler.length > 6 && (
        <input
          type="search"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder="Workspace ara"
          className="mt-3 w-full max-w-sm rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
        />
      )}

      {suzulmus.length === 0 ? (
        <p className="mt-3 text-xs text-ink-muted">
          {workspaceler.length === 0
            ? 'Bu şirkette workspace yok. Workspace’ler ekranından ekleyebilirsin.'
            : `Aramaya uyan workspace yok (${workspaceler.length} workspace var).`}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {suzulmus.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                disabled={isPending}
                onClick={() => sec(w.id)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:border-brand/40 hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
              >
                {w.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* SESSİZ KESME YOK: kaç workspace gösterildiği ve toplamın kaç olduğu. */}
      {suzulmus.length > 0 && suzulmus.length < workspaceler.length && (
        <p className="mt-2 text-[11px] text-ink-muted">
          {suzulmus.length} / {workspaceler.length} workspace gösteriliyor.
        </p>
      )}
    </div>
  );
}
