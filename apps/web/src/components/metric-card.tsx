import { DeltaRozeti } from '@/components/delta-rozeti';
import { Terim } from '@/components/ui/terim';
import type { TerimAnahtari } from '@/lib/terimler';

/**
 * KPI kartı.
 *
 * `change` null ise değişim satırı hiç GÖSTERİLMİYOR — "%0" göstermek "değişim
 * yok" demek, oysa karşılaştırma yapılamadığını (önceki dönem boş ya da sıfır)
 * anlatmak gerekiyor. Boş bırakmak sessiz ama dürüst.
 *
 * `inverse`: bazı metriklerde ARTIŞ kötüdür. CPA yükseliyorsa kırmızı olmalı,
 * yeşil değil. Bunu çağıran tarafa bırakmak her kullanımda hata riski demek.
 *
 * ETİKET DÜZ METİN DEĞİL, SÖZLÜKTEN BİR TERİM. Kartın başlığı "CPA",
 * "ROAS" gibi kısaltmalardı ve açıklaması hiçbir yerde yoktu; hedef
 * kullanıcı reklamcılık bilmiyor (CLAUDE.md §5). Başlık artık iş dilinde
 * ad + kısaltma + tıklanınca açılan açıklama (`lib/terimler.ts`). Düz
 * `label` kabul edilmiyor: kabul edilseydi yeni bir kart sözlüğü atlayıp
 * yine iki harfle eklenirdi.
 */
export function MetricCard({
  terim,
  value,
  hint,
  change,
  inverse = false,
  emphasis = false,
}: {
  terim: TerimAnahtari;
  value: string;
  hint?: string;
  change?: number | null;
  inverse?: boolean;
  emphasis?: boolean;
}) {

  return (
    /*
     * ═══ VURGU MARKA DOLGUSUYLA DEĞİL, TİPOGRAFİYLE ═══
     *
     * Vurgulu kart `bg-brand-soft` ile dolduruluyordu. Varsayılan marka rengi
     * KIRMIZI ve kırmızı zeminli bir "Harcama" kartı sorun varmış gibi
     * okunuyor. Beyaz etiketli üründe her müşterinin rengi farklı, yani
     * hangi rengin nasıl okunacağı önceden bilinemiyor: dolgu yerine
     * kenarlık ve daha büyük rakam kullanmak renkten bağımsız çalışıyor.
     */
    <div
      className={`rounded-xl border bg-surface p-4 ${
        emphasis ? 'border-brand/40' : 'border-line'
      }`}
    >
      <p className="text-xs font-medium text-ink-muted">
        <Terim anahtar={terim} />
      </p>
      <p
        className={`mt-1.5 font-semibold tabular-nums text-ink ${
          emphasis ? 'text-[28px] leading-8' : 'text-2xl'
        }`}
      >
        {value}
      </p>

      <div className="mt-1 flex min-h-[18px] items-center gap-2 text-xs">
        {/*
          ROZET PAYLAŞILAN BİLEŞENDEN. `inverse` kuralı (CPA artışı KÖTÜ) üç
          yerde birden geçiyordu; üçüncü kopya yazılınca birinin
          güncellenmemesi CPA artışını yeşil gösterirdi.
        */}
        <DeltaRozeti change={change} inverse={inverse} />
        {hint && <span className="truncate text-ink-muted">{hint}</span>}
      </div>
    </div>
  );
}

