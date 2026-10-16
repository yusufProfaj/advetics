'use client';

import type { YoutubeProvaSonucu } from '@advetics/shared';
import { formatMoney } from '@/lib/format';
import { DurumNoktasi } from '@/components/ui/rozet';
import { useDil, useSozluk } from '@/dil/saglayici';
import { boostSozlugu } from '@/dil/sozlukler/boost';

/**
 * ═══ YOUTUBE PROVASININ SONUCU ═══
 *
 * İki parça ve ikisi de gerekli: Google'a NE gönderildiği (kullanıcı
 * kurulacak kampanyayı para harcamadan görüyor) ve Google'ın cevabı.
 * Ret hâlinde her hata yerini söylüyor ("Reklam › başlık"): "geçersiz
 * argüman" tek başına kullanıcıya hiçbir iş yaptırmıyor.
 */
export type ProvaDurumu =
  | { tur: 'yukleniyor' }
  | { tur: 'sonuc'; veri: YoutubeProvaSonucu }
  | { tur: 'hata'; mesaj: string };

export function YoutubeProvaSonucuKutusu({ durum }: { durum: ProvaDurumu }) {
  const d = useSozluk(boostSozlugu).prova;
  const { dil } = useDil();
  if (durum.tur === 'yukleniyor') {
    return (
      <p className="text-[11px] text-ink-muted" aria-live="polite">
        {d.soruluyor}
      </p>
    );
  }
  if (durum.tur === 'hata') {
    return (
      <p role="alert" className="rounded-alan border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-strong">
        {d.yapilamadi(durum.mesaj)}
      </p>
    );
  }
  const { ok, ozet, hatalar } = durum.veri;
  return (
    <div
      aria-live="polite"
      // YEŞİL YALNIZ NOKTADA: kabul hâli yeşil zemin değil, yeşil durum
      // noktası. Ret hâli sol kırmızı çizgi (şerit dili).
      className={`space-y-2 rounded-alan border border-line px-3 py-2 text-xs ${
        ok ? 'bg-surface-sunken' : 'border-l-4 border-l-danger bg-surface'
      }`}
    >
      <p
        className={`flex items-start gap-1.5 font-semibold ${ok ? 'text-ink' : 'text-danger-strong'}`}
      >
        <span className="mt-[5px]">
          <DurumNoktasi hal={ok ? 'ok' : 'hata'} />
        </span>
        {ok ? d.kabul : d.sorunBuldu(hatalar.length)}
      </p>
      {!ok && (
        <ul className="space-y-1">
          {hatalar.map((h, i) => (
            <li key={i} className="text-danger-strong">
              {h.nerede && <span className="font-medium">{h.nerede}: </span>}
              {h.mesaj || h.kod}
              <span className="ml-1 text-[10px] text-ink-muted">({h.kod})</span>
              {/* AYRINTI VE HAM YOL: etiket okumak için, bunlar düzeltmek
                  için. Asgari bütçe tutarı yalnız ayrıntıda geliyor. */}
              {h.ayrinti && <span className="block text-[11px] text-ink">{h.ayrinti}</span>}
              {h.alan && <span className="block break-all font-mono text-[10px] text-ink-muted">{h.alan}</span>}
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink">
        <dt className="text-ink-muted">{d.butce}</dt>
        <dd>{d.butceSatiri(formatMoney(ozet.gunlukButceMicros, 'TRY', { dil }), ozet.sureGun, ozet.bitis)}</dd>
        <dt className="text-ink-muted">{d.acilis}</dt>
        <dd>{ozet.acilis === 'PAUSED' ? d.acilisDuraklatilmis : d.acilisYayinda}</dd>
        <dt className="text-ink-muted">{d.konum}</dt>
        <dd>{ozet.konumlar.join(', ')}</dd>
        <dt className="text-ink-muted">{d.yas}</dt>
        <dd>{ozet.yaslar.length === 0 ? d.kisitYok : ozet.yaslar.map((y) => y.replace('AGE_RANGE_', '').replace('_UP', '+').replace('_', '-')).join(', ')}</dd>
        <dt className="text-ink-muted">{d.yerlesim}</dt>
        <dd>{ozet.kanallar.join(', ')}</dd>
        <dt className="text-ink-muted">{d.baslik}</dt>
        <dd>{ozet.baslik}</dd>
        <dt className="text-ink-muted">{d.uzunBaslik}</dt>
        <dd>{ozet.uzunBaslik}</dd>
        <dt className="text-ink-muted">{d.aciklama}</dt>
        <dd>{ozet.aciklama}</dd>
        <dt className="text-ink-muted">{d.isletme}</dt>
        <dd>
          {ozet.isletmeAdi} · {ozet.adres}
        </dd>
        <dt className="text-ink-muted">Logo</dt>
        <dd>{ozet.logo === 'kayitli' ? d.logoKayitli : d.logoYuklenecek}</dd>
      </dl>
    </div>
  );
}
