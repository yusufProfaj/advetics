import { Prisma } from '@prisma/client';
import {
  GERI_BESLEME_ASAMA_ADI,
  GERI_BESLEME_ASAMALARI,
  GERI_BESLEME_SORUNLU_DURUMLAR,
  leadRozetTuru,
  type GeriBeslemeAsamasi,
  type GeriBeslemeOlayDurumu,
  type LeadGeriBeslemeRozeti,
} from '@advetics/shared';
import { GB_PLATFORM, SONUC_BILINMIYOR, type Yurutucu } from './lead-asama';

/**
 * ═══ LEAD SATIRININ "META'YA GİTTİ Mİ" ROZETİ ═══
 *
 * Liste sorgusunda TEK ek sorgu (`lead_id = ANY`), satır başına sorgu yok.
 * Rozetin TÜRÜ sözleşmedeki saf fonksiyondan (`leadRozetTuru`): öncelik
 * (sorun > bekliyor > eşleşmedi > iletildi) orada kilitli ve burada ikinci
 * kez yazılmıyor. Burada yalnız METİN kuruluyor.
 */
interface OlaySatiri {
  lead_id: string;
  /** `sonuc_bilinmiyor`: istek gitti, cevabı yazılamadı (Ö-1). */
  hata_kodu?: string | null;
  asama: GeriBeslemeAsamasi;
  durum: GeriBeslemeOlayDurumu;
  hata: string | null;
  zaman: Date;
}

export async function leadRozetleri(
  tx: Yurutucu,
  leadler: ReadonlyArray<{ id: string; clientId: string }>,
): Promise<Map<string, LeadGeriBeslemeRozeti>> {
  const sonuc = new Map<string, LeadGeriBeslemeRozeti>();
  if (leadler.length === 0) return sonuc;

  const musteriler = [...new Set(leadler.map((l) => l.clientId))];
  const ayarlar = await tx.$queryRaw<Array<{ client_id: string; etkin: boolean }>>(Prisma.sql`
    SELECT client_id::text AS client_id, etkin FROM geri_besleme_ayarlari
     WHERE client_id = ANY(${musteriler}::uuid[]) AND platform = ${GB_PLATFORM}
  `);
  const etkin = new Map(ayarlar.map((a) => [a.client_id, a.etkin]));

  const satirlar = await tx.$queryRaw<OlaySatiri[]>(Prisma.sql`
    SELECT lead_id::text AS lead_id, asama, durum, hata, hata_kodu, COALESCE(gonderildi, updated_at) AS zaman
      FROM geri_besleme_olaylari
     WHERE lead_id = ANY(${leadler.map((l) => l.id)}::uuid[]) AND platform = ${GB_PLATFORM}
  `);
  const leadBasina = new Map<string, OlaySatiri[]>();
  for (const s of satirlar) leadBasina.set(s.lead_id, [...(leadBasina.get(s.lead_id) ?? []), s]);

  for (const l of leadler) {
    const olaylar = (leadBasina.get(l.id) ?? []).sort(
      (a, b) => GERI_BESLEME_ASAMALARI.indexOf(a.asama) - GERI_BESLEME_ASAMALARI.indexOf(b.asama),
    );
    const tur = leadRozetTuru(etkin.get(l.clientId) === true, olaylar.map((o) => o.durum));
    sonuc.set(l.id, {
      tur,
      metin: rozetMetni(tur, olaylar),
      asamalar: olaylar.map((o) => ({
        asama: o.asama,
        durum: o.durum,
        hata: o.hata,
        zaman: new Date(o.zaman).toISOString(),
      })),
    });
  }
  return sonuc;
}

/**
 * Rozet cümlesi. "Gönderilemedi" HANGİ AŞAMANIN gitmediğini söylüyor:
 * ham lead iletilmiş, satış bilgisi düşmüşse "Meta’ya iletildi" yazmak kayıp
 * sinyali başarı rozetinin altına gömerdi.
 */
export function rozetMetni(
  tur: LeadGeriBeslemeRozeti['tur'],
  olaylar: ReadonlyArray<Pick<OlaySatiri, 'asama' | 'durum' | 'hata' | 'hata_kodu'>>,
): string {
  switch (tur) {
    case 'kapali':
      return 'Meta’ya bildirim kapalı';
    case 'yok':
      return 'Bildirilecek sonuç yok';
    case 'bekliyor':
      // SONUCU BİLİNMEYEN gönderim "iletilecek" DEĞİL: istek gitti, yeniden
      // gönderilmeyecek. Aynı cümleyle göstermek kullanıcıyı bekletirdi.
      if (olaylar.some((o) => o.durum === 'gonderiliyor' && o.hata_kodu === SONUC_BILINMIYOR)) {
        return 'Meta’ya gönderildi, sonucu bilinmiyor';
      }
      return 'Meta’ya iletilecek';
    case 'iletildi':
      return 'Meta’ya iletildi';
    case 'eslesmedi':
      return 'İletildi, Meta eşleştiremedi';
    case 'sorun': {
      const s = olaylar.find((o) => GERI_BESLEME_SORUNLU_DURUMLAR.includes(o.durum));
      if (!s) return 'Gönderilemedi';
      const ad = GERI_BESLEME_ASAMA_ADI[s.asama];
      if (s.durum === 'suresi_doldu') return `${ad}: 7 günü geçtiği için bildirilemedi`;
      return s.hata ? `${ad} bilgisi gönderilemedi: ${s.hata}` : `${ad} bilgisi gönderilemedi`;
    }
  }
}
