import { TAKIP_ETIKET_METNI, sec, type Dil, type TakipAcigiYaniti, type VeriKaynagiOzeti } from '@advetics/shared';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

/**
 * ═══ VERİ KAYNAKLARI — PANEL KARARLARI (saf, test edilebilir) ═══
 *
 * Bileşen render eden test altyapısı yok (vitest.config.ts); karar
 * effect'in ya da JSX'in içinde kalırsa yalnız kaynak taramasıyla
 * sınanabiliyordu (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR TEST
 * EDİLEMİYOR — DIŞARI ÇIKAR").
 */

/** Reklam Yöneticisi "Sitede" hücresi. Etiket yalnız sorunluysa yazılır; "uyumlu" gürültü. */
export function sitedeHaritasi(y: TakipAcigiYaniti): Map<string, { anahtarEtkinlik: number; etiket: string | null }> {
  const m = new Map<string, { anahtarEtkinlik: number; etiket: string | null }>();
  for (const r of y.satirlar) {
    const sorunlu = r.etiket === 'platform_fazla' || r.etiket === 'site_fazla' || r.etiket === 'site_hic_gormuyor';
    m.set(r.kampanyaId, { anahtarEtkinlik: r.siteDonusum, etiket: sorunlu ? TAKIP_ETIKET_METNI[r.etiket] : null });
  }
  return m;
}

/**
 * "Sitede" sütunu açılsın mı ve altında ne yazsın. GA4 bağlı DEĞİLSE sütun
 * YOK (`null`). Bağlı ama veri yoksa sütun açık ve nedeni yazar: boş sütun
 * "kampanyalarınız sitede hiç dönüşmüyor" diye okunurdu.
 */
export function siteSutunuKarari(
  y: TakipAcigiYaniti | { hata: string },
  dil: Dil = 'tr',
): { hata: string | null; not: string | null } | null {
  if ('hata' in y) return { hata: y.hata, not: null };
  const m = sec(reklamYoneticisiSozlugu, dil).site;
  switch (y.emptyReason) {
    case 'kaynak_yok':
      return null;
    case 'izin_eksik':
      return { hata: null, not: m.izinEksik };
    case 'cekim_kosmadi':
      return { hata: null, not: m.cekimKosmadi };
    case 'veri_yok':
      return { hata: null, not: m.veriYok };
    default: {
      const pay = y.eslenemeyen.pay;
      return {
        hata: null,
        not:
          m.kiyas(y.kiyasBitis) + (pay !== null && pay > 0 ? m.eslenemeyen(Math.round(pay * 100)) : ''),
      };
    }
  }
}

/** Kartın durum metni ve noktası. Yeşil YALNIZ durum noktası (kılavuz). */
export function kaynakDurumMetni(k: Pick<VeriKaynagiOzeti, 'durum'>): { metin: string; ton: 'yesil' | 'kirmizi' | 'gri' } {
  switch (k.durum) {
    case 'etkin':
      return { metin: 'Bağlı', ton: 'yesil' };
    case 'izin_eksik':
      return { metin: 'İzin gerekiyor', ton: 'kirmizi' };
    case 'erisim_yok':
      return { metin: 'Erişim yok', ton: 'kirmizi' };
    case 'hata':
      return { metin: 'Son çekim başarısız', ton: 'kirmizi' };
    case 'duraklatildi':
      return { metin: 'Duraklatıldı', ton: 'gri' };
    case 'kaldirildi':
      return { metin: 'Kaldırıldı', ton: 'gri' };
  }
}
