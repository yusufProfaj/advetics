import type { AlanKaynagi } from '@advetics/shared';

/**
 * ═══ REHBER ALANININ KAYNAK ROZETİ — TEK KARAR ═══
 *
 * Bütçe adımı `kullanici` dışındaki HER kaynağı "Önerilen" diye
 * gösteriyordu. AdvStrategy v2 ile `strateji` kaynağı geldi (müşterinin
 * ONAYLADIĞI plandan aktarılan değer): onu "Önerilen" yazmak, onaylanmış bir
 * kararı rehberin kendi tahmini gibi gösterir ve kullanıcı onu rahatça
 * değiştirip stratejiden sapar. "Stratejiden" ayrı yazılır.
 *
 * `null` = rozet yok (kullanıcının kendi değeri ya da alan boş).
 * `varsayilan` = ekranın o alandaki öneri dili ("Önerilen", "Marka
 * Merkezi'nden"): kaynak `strateji` değilse o yazılır, karar ekranda kalır.
 */
export function kaynakRozeti(kaynak: AlanKaynagi | undefined, varsayilan: string | null): string | null {
  if (kaynak === undefined || kaynak === 'kullanici') return null;
  if (kaynak === 'strateji') return 'Stratejiden';
  return varsayilan;
}
