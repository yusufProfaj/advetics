import { TAKIP_ETIKET_METNI, type TakipAcigiYaniti, type VeriKaynagiOzeti } from '@advetics/shared';

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
export function siteSutunuKarari(y: TakipAcigiYaniti | { hata: string }): { hata: string | null; not: string | null } | null {
  if ('hata' in y) return { hata: y.hata, not: null };
  switch (y.emptyReason) {
    case 'kaynak_yok':
      return null;
    case 'izin_eksik':
      return { hata: null, not: 'Sitede sütunu: Analytics izni yenilenmeli (Marka Merkezi › Bağlantılar).' };
    case 'cekim_kosmadi':
      return { hata: null, not: 'Sitede sütunu: Analytics verisi henüz çekilmedi.' };
    case 'veri_yok':
      return { hata: null, not: 'Sitede sütunu: bu dönemde Analytics’te reklamdan gelen anahtar etkinlik yok.' };
    default: {
      const pay = y.eslenemeyen.pay;
      return {
        hata: null,
        not:
          `Sitede: Analytics anahtar etkinlikleri, ${y.kiyasBitis} tarihine kadar.` +
          (pay !== null && pay > 0 ? ` Ücretli trafiğin %${Math.round(pay * 100)}'i bir kampanyaya bağlanamadı.` : ''),
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
