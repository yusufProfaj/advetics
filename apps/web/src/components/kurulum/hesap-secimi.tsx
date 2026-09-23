'use client';

import { useState } from 'react';
import { CHANNEL_HINTS, CHANNEL_LABELS, type ChannelKind } from '@advetics/shared';
import { PlatformLogo } from '@/components/platform-logo';
import { havuzSuz, KANALLAR, type Havuzlar } from '@/lib/havuz';
import type { BoostKarari } from './kurulum-akisi';

/**
 * HESAP SEÇİMİ — havuzdaki reklam hesapları ve sayfalar, kanal kanal.
 *
 * Havuz ORTAK yardımcıdan geliyor (`havuzlariCikar`): profil türü → kanal
 * eşlemesini burada ikinci kez yazmak, bir kanalın bu ekranda görünüp
 * Platform Bağlantıları'nda kaybolması demekti.
 *
 * BOŞ KANAL GİZLENMİYOR, KAPALI GÖSTERİLİYOR. "Instagram yok" satırı,
 * kullanıcının Instagram hesabının nereye gittiğini aramasını engelliyor;
 * satır hiç çizilmeseydi o soruyu sistemin bozuk olduğuna yorardı.
 */
export function HesapSecimi({
  havuzlar,
  secili,
  onDegistir,
}: {
  havuzlar: Havuzlar;
  secili: Set<string>;
  onDegistir: (id: string) => void;
}) {
  /*
   * İLK DOLU KANAL AÇIK BAŞLIYOR. Hepsi kapalı başlasaydı kullanıcı listeyi
   * açması gerektiğini bilmeden "Kurulumu tamamla"ya basıp hesapsız bir
   * workspace kurardı.
   */
  const [acikKanal, setAcikKanal] = useState<ChannelKind | null>(
    () => KANALLAR.find((k) => havuzlar[k].length > 0) ?? null,
  );
  const [arama, setArama] = useState('');

  const toplam = KANALLAR.reduce((n, k) => n + havuzlar[k].length, 0);

  if (toplam === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface-sunken px-3.5 py-3 text-sm text-ink-muted">
        Atanmayı bekleyen reklam hesabı ya da sayfa yok. Bir önceki adımda platform
        bağlayabilir ya da hesapsız devam edip sonra ekleyebilirsin.
      </p>
    );
  }

  return (
    <section className="divide-y divide-line rounded-xl border border-line">
      {KANALLAR.map((k) => {
        const ogeler = havuzlar[k];
        const secimSayisi = ogeler.filter((o) => secili.has(o.id)).length;
        const bu = acikKanal === k;
        const liste = bu ? havuzSuz(ogeler, arama) : [];

        return (
          <div key={k}>
            <button
              type="button"
              onClick={() => {
                setAcikKanal(bu ? null : k);
                setArama('');
              }}
              disabled={ogeler.length === 0}
              aria-expanded={bu}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <PlatformLogo kind={k} className="h-5 w-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{CHANNEL_LABELS[k]}</span>
                  <span className="block text-xs text-ink-muted">
                    {ogeler.length === 0 ? 'Bekleyen hesap yok' : `${ogeler.length} hesap bekliyor`}
                  </span>
                </span>
              </span>
              <span
                className={`shrink-0 text-xs font-medium ${
                  secimSayisi > 0 ? 'text-ok-strong' : 'text-brand-strong'
                }`}
              >
                {secimSayisi > 0 ? `${secimSayisi} seçili` : ogeler.length === 0 ? '' : bu ? 'Kapat' : 'Seç'}
              </span>
            </button>

            {bu && (
              <div className="border-t border-line bg-surface-sunken px-3.5 py-3">
                <p className="mb-2 text-xs text-ink-muted">{CHANNEL_HINTS[k]}</p>
                {ogeler.length > 6 && (
                  <input
                    type="search"
                    value={arama}
                    onChange={(e) => setArama(e.target.value)}
                    placeholder="Ad ya da numarayla ara"
                    aria-label={`${CHANNEL_LABELS[k]} içinde ara`}
                    className="mb-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                )}
                {/* SESSİZ KESME YOK: kaç hesabın gösterildiği yazılı. */}
                <p className="mb-1.5 text-[11px] text-ink-muted">
                  {liste.length} / {ogeler.length} hesap
                </p>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {liste.map((o) => (
                    <li key={o.id}>
                      <label
                        className={`flex min-h-11 items-center gap-2.5 rounded-lg bg-surface px-3 py-2 ${
                          o.isManager ? 'opacity-50' : 'cursor-pointer hover:ring-1 hover:ring-line'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={secili.has(o.id)}
                          onChange={() => onDegistir(o.id)}
                          // YÖNETİCİ (MCC) HESABI SEÇİLEMİYOR ama listede
                          // duruyor: gizlemek, aradığını bulamayan kullanıcıya
                          // sistemin bozuk olduğunu düşündürürdü.
                          disabled={o.isManager}
                          className="h-4 w-4 shrink-0 accent-brand"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink" title={o.name}>
                            {o.name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-muted">
                            {o.isManager ? 'Yönetici hesabı, atanamaz' : o.externalId}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * BOOST HESABI SORUSU — yalnızca gerçekten bir karar varsa.
 *
 * Tek Meta hesabı seçildiyse soru sorulmuyor ama SÖYLENİYOR: sessizce
 * seçmek, kullanıcının boost harcamasının nereden çıktığını bilmemesi
 * demekti. Hesap hiç seçilmediyse bu bir uyarı, engel değil: workspace
 * boost'suz da çalışır.
 */
export function BoostHesabi({
  karar,
  metaHesaplar,
  secim,
  onSecim,
}: {
  karar: BoostKarari;
  metaHesaplar: Array<{ id: string; name: string }>;
  secim: string | null;
  onSecim: (id: string | null) => void;
}) {
  if (karar.durum === 'gereksiz') return null;

  if (karar.durum === 'hesap-yok') {
    return (
      <p className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-sm text-warn-strong ring-1 ring-inset ring-warn/30">
        Sayfa seçtin ama Meta reklam hesabı seçmedin. Akıllı Boost bu sayfalarda çalışmaz.
      </p>
    );
  }

  if (karar.durum === 'otomatik') {
    const ad = metaHesaplar.find((h) => h.id === karar.hesapId)?.name ?? '';
    return (
      <p className="rounded-lg bg-ok-soft px-3.5 py-2.5 text-sm text-ok-strong ring-1 ring-inset ring-ok/30">
        Boost reklamları <strong>{ad}</strong> hesabından harcanır.
      </p>
    );
  }

  return (
    <label className="block rounded-lg border border-line px-3.5 py-3">
      <span className="block text-sm font-medium text-ink">
        Boost reklamları hangi hesaptan harcansın?
      </span>
      <span className="mt-0.5 block text-xs text-ink-muted">
        Birden çok Meta hesabı seçtin. Sayfalardaki gönderiler bu hesaptan öne çıkarılır.
      </span>
      <select
        value={secim ?? ''}
        onChange={(e) => onSecim(e.target.value || null)}
        aria-invalid={karar.durum === 'secilmeli' ? 'true' : undefined}
        className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      >
        <option value="">Hesap seç</option>
        {metaHesaplar.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </label>
  );
}
