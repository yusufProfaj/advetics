import { Prisma } from '@prisma/client';
import { GERI_BESLEME_SORUNLU_DURUMLAR, GERI_BESLEME_UYARI_KODU, type Uyari } from '@advetics/shared';
import { GB_PLATFORM, SONUC_BILINMIYOR, type Yurutucu } from './lead-asama';

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
            AND (o.durum = ANY(${sorunlu}::text[]) OR o.hata_kodu = ${SONUC_BILINMIYOR})
            AND o.updated_at >= ${gun}::timestamptz
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

/**
 * ═══ WEBHOOK LEAD KİMLİĞİ SAYI GELDİ (Ajan 4 N-5) ═══
 *
 * Meta `leadgen_id`i dize olarak gönderiyor; çalışma anında SAYI geldiyse
 * 17 haneli bir kimlik JSON çözümlemesinde 2^53'ü aşıp çoktan bozulmuş
 * olabilir. Webhook o kaydı YAZMIYOR (yanlış kişiyi çekmek ya da Meta'ya
 * yanlış kimlik göndermek olurdu) ve `sync_jobs`a teşhis satırı bırakıyor;
 * kaydı form mutabakatı Graph'tan doğru kimlikle çekecek. Uyarı o satırlardan.
 */
export const LEAD_KIMLIGI_SAYI = 'leadgen_id_sayi';

export interface LeadKimligiUyariSatiri {
  client_id: string;
  client_adi: string | null;
  sayi: number;
  son: Date;
}

export async function leadKimligiUyariSatirlari(tx: Yurutucu, simdi: Date): Promise<LeadKimligiUyariSatiri[]> {
  const gun = new Date(simdi.getTime() - 86_400_000);
  return tx.$queryRaw<LeadKimligiUyariSatiri[]>(Prisma.sql`
    SELECT j.client_id::text AS client_id, c.name AS client_adi, count(*)::int AS sayi, max(j.created_at) AS son
      FROM sync_jobs j
      LEFT JOIN clients c ON c.id = j.client_id
     WHERE j.error_code = ${LEAD_KIMLIGI_SAYI} AND j.created_at >= ${gun}::timestamptz
     GROUP BY j.client_id, c.name
  `);
}

export function leadKimligiUyarisi(r: LeadKimligiUyariSatiri): Uyari {
  return {
    kod: GERI_BESLEME_UYARI_KODU,
    siddet: 'warn',
    baslik: 'Meta lead kimliği bozuk biçimde geldi',
    detay: `Son 24 saatte ${r.sayi} anlık bildirimde lead kimliği metin yerine sayı geldi; kimlik bozulmuş olabileceği için kayıt yazılmadı. Form taraması bu kayıtları doğru kimlikle çekecek; “Son 30 günü getir” hemen çeker.`,
    clientId: r.client_id,
    clientName: r.client_adi,
    adAccountId: null,
    adAccountName: null,
    platform: 'meta',
    eylem: { etiket: 'Potansiyel müşterilere git', href: `/potansiyel-musteriler?musteri=${encodeURIComponent(r.client_id)}` },
    veriZamani: new Date(r.son).toISOString(),
  };
}
