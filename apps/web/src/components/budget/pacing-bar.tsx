import type { BudgetPacing, PacingStatus } from '@advetics/shared';
import { Rozet, type DurumHali } from '@/components/ui/rozet';

/**
 * Bütçe tüketim çubuğu.
 *
 * İKİ BİLGİ AYNI ÇUBUKTA: harcanan oran (dolgu) ve ayın geçen oranı (dikey
 * çizgi). Tek başına "bütçenin %60'ı harcandı" bir şey söylemiyor: ayın
 * %20'sindeysek felaket, %90'ındaysak fazlasıyla iyi. Karşılaştırma noktası
 * çubuğun İÇİNDE olmalı; iki ayrı sayı olarak vermek okuyucudan çıkarma
 * yapmasını istemek olurdu.
 *
 * RENK KILAVUZDAN (onaylı taslak `#butce`, `.cubuk`): dolgu SİYAH, hedefin
 * önündeyse ya da bütçe dolduysa KIRMIZI; ayın geçen kısmı KIRMIZI dikey
 * çizgi. Eski çubuk mavi/turuncu/yeşil tonlar ve aşımda çapraz taramalı bir
 * degrade taşıyordu; kılavuzda ikisi de yok. Durum rozetinde yeşil yalnız
 * "Hedefte" (yeşil = durum göstergesi).
 */
const TONE: Record<PacingStatus, { bar: string; hal: DurumHali; label: string }> = {
  under: { bar: 'bg-ink', hal: 'taslak', label: 'Yavaş' },
  on_track: { bar: 'bg-ink', hal: 'ok', label: 'Hedefte' },
  over: { bar: 'bg-brand', hal: 'hata', label: 'Hızlı' },
  exhausted: { bar: 'bg-brand', hal: 'hata', label: 'Doldu' },
  no_budget: { bar: 'bg-line-strong', hal: 'taslak', label: 'Bütçe yok' },
};

export function StatusChip({ status }: { status: PacingStatus }) {
  const t = TONE[status];
  return <Rozet hal={t.hal}>{t.label}</Rozet>;
}

export function PacingBar({ pacing, compact = false }: { pacing: BudgetPacing; compact?: boolean }) {
  const spent = pacing.spentRatio;
  const tone = TONE[pacing.status];

  // Dolgu %100'de duruyor ama AŞIM GİZLENMİYOR: çubuk kırmızıya dönüyor ve
  // altında "%112 harcandı" yazıyor. Çubuğu taşırmak düzeni bozardı, aşımı
  // hiç göstermemek ise asıl bilgiyi saklamak olurdu.
  const fill = spent === null ? 0 : Math.min(spent, 1) * 100;
  const overflow = spent !== null && spent > 1;

  return (
    <div className={compact ? 'w-full min-w-[120px]' : 'w-full'}>
      <div className={`relative w-full rounded-full bg-surface-sunken ${compact ? 'h-1.5' : 'h-2'}`}>
        <div
          className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${overflow ? 'bg-brand' : tone.bar}`}
          style={{ width: `${fill}%` }}
        />

        {/* AYIN GEÇEN ORANI: hedef çizgisi. Çubuğun 0 ve 100'e yapışık
            hâlleri görünmez oluyor; %1'lik bir kenar payı çizginin hep
            okunmasını sağlıyor. */}
        {pacing.elapsedRatio > 0 && (
          <div
            className="absolute -bottom-1 -top-1 w-0.5 rounded-full bg-brand"
            style={{ left: `${Math.min(Math.max(pacing.elapsedRatio * 100, 1), 99)}%` }}
            title={`Ayın geçen kısmı: %${Math.round(pacing.elapsedRatio * 100)}`}
          />
        )}
      </div>

      {!compact && (
        <div className="mt-1.5 flex items-center justify-between text-12 text-ink-muted">
          <span className={overflow ? 'font-semibold text-danger-strong' : ''}>
            {spent === null ? '—' : `%${(spent * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} harcandı`}
          </span>
          {/* EKSİZ YAZILIYOR: "%16'i" hem yanlış ek (doğrusu "%16'sı") hem de
              küçük puntoda kesme işareti kayboluyor ve "%161" okunuyordu.
              Ek sayıya göre değişiyor; ek gerektirmeyen cümle kuruldu. */}
          <span>Ayın geçen kısmı: %{Math.round(pacing.elapsedRatio * 100)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sapma rozeti: "hedefin kaç puan üstünde".
 *
 * Yüzde DEĞİL PUAN farkı gösteriliyor: "%15 hızlı" belirsiz (neyin %15'i?),
 * "hedefin 15 puan üstünde" tek bir anlama geliyor. Hızlı gitmek KIRMIZI
 * (para beklenenden önce bitiyor), yavaş gitmek gri.
 */
export function PaceDelta({ pacing }: { pacing: BudgetPacing }) {
  if (pacing.paceDelta === null) return <span className="text-ink-muted">—</span>;
  const points = pacing.paceDelta * 100;
  // ±0,5 puanın altı gürültü; işaretli göstermek yanlış bir kesinlik verirdi.
  if (Math.abs(points) < 0.5) return <span className="text-ink-muted">hedefte</span>;
  const sign = points > 0 ? '+' : '−';
  return (
    <span className={points > 0 ? 'text-danger-strong' : 'text-ink-muted'}>
      {sign}
      {Math.abs(points).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} puan
    </span>
  );
}
