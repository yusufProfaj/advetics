import { z } from 'zod';

/**
 * ═══ ÇALIŞMA SAATLERİ (Marka Merkezi › Marka) ═══
 *
 * "Beni telefonla arasınlar" reklamında telefonun AÇIK olduğu saatler
 * (yönetici kararı, 2026-10-12). Kaynak tek: `client_profiles.calisma_saatleri`.
 *
 * ÜÇ HÂL ve üçü ayrı:
 * - `null` / boş dizi = BİLİNMİYOR. Google'a saat GÖNDERİLMEZ (arama öğesi her
 *   saatte görünür) ve bu kullanıcıya söylenir; saat uydurulmuyor.
 * - dolu dizi = yalnız bu günler ve saatler. Dizide OLMAYAN gün KAPALI demek
 *   (Pazar yoksa Pazar arama düğmesi çıkmaz).
 *
 * Google'da arama öğesinin `adScheduleTargets`i oluyor (`googleAramaSaatleri`).
 * META'DA GİTMİYOR: Meta'da saat planı yalnız ömür boyu bütçeli reklam
 * setinde var; rehber günlük kampanya bütçesi kuruyor. Karar tablosu bunu
 * söylüyor (reklam mesai dışında da gösterilebilir).
 */

export const CALISMA_GUNLERI = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type HaftaGunu = (typeof CALISMA_GUNLERI)[number];

export const GUN_ADI: Record<HaftaGunu, string> = {
  MONDAY: 'Pazartesi',
  TUESDAY: 'Salı',
  WEDNESDAY: 'Çarşamba',
  THURSDAY: 'Perşembe',
  FRIDAY: 'Cuma',
  SATURDAY: 'Cumartesi',
  SUNDAY: 'Pazar',
};

/*
 * DAKİKA 15'İN KATI: Google'ın `MinuteOfHour` enum'u yalnız 0/15/30/45
 * taşıyor. 09:10 gibi bir saati sessizce 09:00'a yuvarlamak telefonu
 * kapalıyken arama düğmesi göstermek olurdu; giriş anında reddediliyor.
 * Kapanış 24:00 olabilir (gün sonu), açılış olamaz.
 */
const SAAT = /^([01]\d|2[0-4]):(00|15|30|45)$/;

export const calismaAraligiSchema = z
  .object({
    gun: z.enum(CALISMA_GUNLERI),
    acilis: z.string().regex(SAAT, 'Saat 09:00 biçiminde ve dakika 00, 15, 30 ya da 45 olmalı'),
    kapanis: z.string().regex(SAAT, 'Saat 18:00 biçiminde ve dakika 00, 15, 30 ya da 45 olmalı'),
  })
  .refine((a) => a.acilis < a.kapanis, { message: 'Kapanış açılıştan sonra olmalı', path: ['kapanis'] })
  .refine((a) => a.acilis !== '24:00' && (!a.kapanis.startsWith('24') || a.kapanis === '24:00'), {
    message: '24:00 yalnız kapanış olabilir',
    path: ['acilis'],
  });
export type CalismaAraligi = z.infer<typeof calismaAraligiSchema>;

/**
 * Günde EN ÇOK İKİ aralık (öğle arası) ve aralıklar ÇAKIŞMAZ: Google çakışan
 * planı reddediyor ve ret atomik isteğin tamamını düşürür. Toplam 14.
 */
export const calismaSaatleriSchema = z
  .array(calismaAraligiSchema)
  .max(14)
  .superRefine((liste, c) => {
    for (const gun of CALISMA_GUNLERI) {
      const ay = liste.filter((x) => x.gun === gun).sort((a, b) => a.acilis.localeCompare(b.acilis));
      if (ay.length > 2) c.addIssue({ code: z.ZodIssueCode.custom, message: `${GUN_ADI[gun]} için en çok iki aralık olur` });
      for (let i = 1; i < ay.length; i++) {
        if (ay[i]!.acilis < ay[i - 1]!.kapanis) c.addIssue({ code: z.ZodIssueCode.custom, message: `${GUN_ADI[gun]} aralıkları çakışıyor` });
      }
    }
  });
export type CalismaSaatleri = z.infer<typeof calismaSaatleriSchema>;

const DAKIKA: Record<string, 'ZERO' | 'FIFTEEN' | 'THIRTY' | 'FORTY_FIVE'> = { '00': 'ZERO', '15': 'FIFTEEN', '30': 'THIRTY', '45': 'FORTY_FIVE' };

export interface GoogleSaatPlani {
  dayOfWeek: HaftaGunu;
  startHour: number;
  startMinute: 'ZERO' | 'FIFTEEN' | 'THIRTY' | 'FORTY_FIVE';
  endHour: number;
  endMinute: 'ZERO' | 'FIFTEEN' | 'THIRTY' | 'FORTY_FIVE';
}

/**
 * Google `AdScheduleInfo` listesi (CallAsset.adScheduleTargets). Boş ya da
 * `null` girdi → `null` = alan GÖNDERİLMEZ (bilinmiyor). Geçersiz girdi
 * FIRLATIR: saklanan değer giriş anında doğrulandı; buraya bozuk gelmesi
 * Advetics'in hatası ve sessizce "her saat"e düşmek telefonu kapalı saatlerde
 * çaldırmaya çalışmak olurdu. Sıra gün ve saate göre sabit: aynı girdi aynı
 * gövdeyi üretmeli (prova ile yayın ayrışmasın).
 */
export function googleAramaSaatleri(saatler: CalismaSaatleri | null | undefined): GoogleSaatPlani[] | null {
  if (!saatler || saatler.length === 0) return null;
  const r = calismaSaatleriSchema.safeParse(saatler);
  if (!r.success) throw new Error(`Çalışma saatleri geçersiz: ${r.error.issues[0]?.message ?? 'bilinmeyen'}`);
  return [...r.data]
    .sort((a, b) => CALISMA_GUNLERI.indexOf(a.gun) - CALISMA_GUNLERI.indexOf(b.gun) || a.acilis.localeCompare(b.acilis))
    .map((a) => {
      const [sh, sm] = a.acilis.split(':') as [string, string];
      const [eh, em] = a.kapanis.split(':') as [string, string];
      return { dayOfWeek: a.gun, startHour: Number(sh), startMinute: DAKIKA[sm]!, endHour: Number(eh), endMinute: DAKIKA[em]! };
    });
}

/** Ekranda tek satır özet ("Pazartesi 09:00-18:00 · …"); boşsa `null`. */
export function calismaSaatleriOzeti(saatler: CalismaSaatleri | null | undefined): string | null {
  if (!saatler || saatler.length === 0) return null;
  return [...saatler]
    .sort((a, b) => CALISMA_GUNLERI.indexOf(a.gun) - CALISMA_GUNLERI.indexOf(b.gun) || a.acilis.localeCompare(b.acilis))
    .map((a) => `${GUN_ADI[a.gun]} ${a.acilis}-${a.kapanis}`)
    .join(' · ');
}
