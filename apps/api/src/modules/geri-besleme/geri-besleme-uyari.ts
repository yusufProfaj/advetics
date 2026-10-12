import { Prisma } from '@prisma/client';
import { GERI_BESLEME_SORUNLU_DURUMLAR, GERI_BESLEME_UYARI_KODU, type Uyari } from '@advetics/shared';
import { GB_PLATFORM, type Yurutucu } from './lead-asama';

/**
 * ═══ "LEAD SONUÇLARI META'YA GİTMİYOR" UYARISI (MIMARI Ç-9, § 8) ═══
 *
 * İstek anında, depodaki ayar ve gönderim satırlarından; platform çağrısı
 * yok (uyarı sisteminin kuralı: uydurulmuş uyarı hiç uyarı olmamasından
 * kötü). İki kaynak:
 *
 *   · ayar `hata`da (token/izin/dataset) → `error`: hiçbir sonuç gitmiyor.
 *   · son 24 saatte platforma ULAŞMAYAN satır (reddedildi, vazgeçildi,
 *     süresi doldu) → `warn`: bazıları gitmiyor.
 *
 * Kapalı ayar uyarı üretmez: kapalı olması bir karar, arıza değil.
 */
export interface GeriBeslemeUyariSatiri {
  client_id: string;
  client_adi: string | null;
  son_ayar_hatasi: string | null;
  son_ayar_hatasi_zamani: Date | null;
  sorunlu: number;
  son_sorun: Date | null;
  ornek_hata: string | null;
}

export async function geriBeslemeUyariSatirlari(tx: Yurutucu, simdi: Date): Promise<GeriBeslemeUyariSatiri[]> {
  const gun = new Date(simdi.getTime() - 86_400_000);
  const sorunlu = [...GERI_BESLEME_SORUNLU_DURUMLAR];
  // KAPSAM RLS'TEN (alerts.service ile aynı): withTenant altında koşuyor.
  return tx.$queryRaw<GeriBeslemeUyariSatiri[]>(Prisma.sql`
    SELECT a.client_id::text AS client_id, c.name AS client_adi,
           a.son_ayar_hatasi, a.son_ayar_hatasi_zamani,
           count(o.id)::int AS sorunlu, max(o.updated_at) AS son_sorun,
           (array_agg(o.hata ORDER BY o.updated_at DESC) FILTER (WHERE o.hata IS NOT NULL))[1] AS ornek_hata
      FROM geri_besleme_ayarlari a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN geri_besleme_olaylari o
             ON o.client_id = a.client_id AND o.platform = a.platform
            AND o.durum = ANY(${sorunlu}::text[]) AND o.updated_at >= ${gun}::timestamptz
     WHERE a.platform = ${GB_PLATFORM} AND a.etkin
     GROUP BY a.client_id, c.name, a.son_ayar_hatasi, a.son_ayar_hatasi_zamani
    HAVING a.son_ayar_hatasi IS NOT NULL OR count(o.id) > 0
  `);
}

export function geriBeslemeUyarisi(r: GeriBeslemeUyariSatiri): Uyari {
  const ayarHatasi = r.son_ayar_hatasi !== null;
  const zaman = ayarHatasi ? r.son_ayar_hatasi_zamani : r.son_sorun;
  return {
    kod: GERI_BESLEME_UYARI_KODU,
    siddet: ayarHatasi ? 'error' : 'warn',
    baslik: ayarHatasi ? 'Lead sonuçları Meta’ya gitmiyor' : 'Bazı lead sonuçları Meta’ya gönderilemedi',
    // PLATFORMUN CÜMLESİ AYNEN: "izin yok" ile "piksel paylaşılmamış" farklı işler.
    detay: ayarHatasi
      ? `Meta: “${r.son_ayar_hatasi}”. Bekleyen sonuçlar sorun düzelince kendiliğinden gönderilir.`
      : `Son 24 saatte ${r.sorunlu} sonuç gönderilemedi${r.ornek_hata ? `. Meta: “${r.ornek_hata}”` : ''}.`,
    clientId: r.client_id,
    clientName: r.client_adi,
    adAccountId: null,
    adAccountName: null,
    platform: 'meta',
    eylem: {
      etiket: 'Gönderimlere bak',
      href: `/potansiyel-musteriler?musteri=${encodeURIComponent(r.client_id)}&sekme=gonderimler`,
    },
    veriZamani: zaman ? new Date(zaman).toISOString() : null,
  };
}
