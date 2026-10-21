import { bicimKodu, paylasimAraligiKarari, sec, type Dil } from '@advetics/shared';
import { raporLinkiSozlugu } from '@/dil/sozlukler/rapor-linki';
import { gunSayisi, onAyarEtiketi, resolveRange, type IsoDay, type OnAyarKodu, type ResolvedRange } from './date-range';

/**
 * RAPOR LİNKİNİN ADRESTEKİ ARALIĞI (`/r/[token]?aralik=…`).
 *
 * Anahtarlar paneldeki seçiciyle AYNI (`aralik`, `baslangic`, `bitis`):
 * `TarihSecici` adres çubuğuna bunları yazıyor ve ikinci bir anahtar kümesi
 * seçicinin yazdığını sayfanın okumaması demekti.
 *
 * Sunucuya yalnız `from/to` gidiyor; ön ayar burada güne çevriliyor. Bu
 * yüzden "Son 30 gün" seçilmiş bir linkin kopyası yarın açıldığında bir gün
 * kayıyor: kişi KAYAN bir pencere seçti. Sabit dönem isteyen "Özel"i seçer.
 */

/** Linkte sunulan ön ayarlar (kullanıcı kararı 2026-10-21). */
export const PAYLASIM_ON_AYARLARI = ['7g', '30g', 'bu_ay', 'gecen_ay'] as const satisfies readonly OnAyarKodu[];

export type PaylasimSecimi =
  /** Adreste aralık yok: ajansın paylaştığı dönem. */
  | { tur: 'varsayilan' }
  | { tur: 'secim'; aralik: ResolvedRange }
  /**
   * Adresteki aralık açılamıyor. SESSİZCE başka döneme düşülmüyor: sayfa
   * paylaşılan dönemi gösterir ve bu cümleyi ÜSTÜNE yazar. Panelin
   * `resolveRange`i bozuk özel aralığı 30 güne çeviriyor; burada o kişi
   * müşteri ve 30 günü "ajansın gönderdiği" sanırdı.
   */
  | { tur: 'hata'; neden: string };

export function paylasimSecimiCoz(
  q: { aralik?: string; baslangic?: string; bitis?: string },
  bugun: IsoDay,
  dil: Dil,
): PaylasimSecimi {
  if (!q.aralik) return { tur: 'varsayilan' };
  const d = sec(raporLinkiSozlugu, dil);
  const taninir = q.aralik === 'ozel' || (PAYLASIM_ON_AYARLARI as readonly string[]).includes(q.aralik);
  if (!taninir) return { tur: 'hata', neden: d.gecersizAralik };

  // Aralık gün sayısı 400'ü aşınca `resolveRange` KIRPIYOR; burada kırpmak
  // değil reddetmek doğru (kırpılmış dönem "seçtiğim dönem" sanılır).
  const r = resolveRange({ aralik: q.aralik, baslangic: q.baslangic, bitis: q.bitis, karsilastir: 'yok', dil });
  if (r.hata) return { tur: 'hata', neden: `${d.gecersizAralik} ${r.hata}` };
  const ham = q.aralik === 'ozel' ? { from: q.baslangic!, to: q.bitis! } : { from: r.from, to: r.to };

  const karar = paylasimAraligiKarari(ham, bugun);
  if (!karar.tamam) {
    const s = karar.sinir;
    const neden =
      karar.ret === 'erken' ? d.ret.erken(gunYazisi(s.enErken, dil))
      : karar.ret === 'gec' ? d.ret.gec(gunYazisi(s.enGec, dil))
      : d.ret.uzun(s.enUzunGun);
    return { tur: 'hata', neden };
  }
  return { tur: 'secim', aralik: r };
}

/** Paylaşılan dönemin seçicide gösterilen hâli. */
export function paylasilanAralik(from: IsoDay, to: IsoDay, dil: Dil): ResolvedRange {
  return {
    key: 'paylasilan',
    label: onAyarEtiketi('paylasilan', dil),
    from,
    to,
    days: gunSayisi(from, to),
    incomplete: false,
    kirpildi: false,
    hata: null,
    karsilastirma: 'yok',
    compareFrom: null,
    compareTo: null,
  };
}

/** "5 Eki 2026" / "Oct 5, 2026" — UTC (gün aritmetiğiyle aynı). */
export function gunYazisi(gun: IsoDay, dil: Dil): string {
  return new Date(`${gun}T00:00:00Z`).toLocaleDateString(bicimKodu(dil), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
